import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { TicketStatus } from "../enum/TicketStatus";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { SlotService } from "../service/SlotService";
import { getTicketDir } from "../lib/paths";
import { emit } from "../lib/events";
import { getAgent, MARKER_TRAILER } from "../agent";
import { runPhaseCompletedHooks, runPhaseEnteredHooks } from "../hooks/registry";
import { persistFeedbackArtifacts, persistShipArtifacts } from "./phase/artifactPersistence";
import { PhaseCliRunner, type SpawnResult } from "./phase/phaseCli";
import { feedbackOutputFile, phaseOutputFile, suggestFeedbackBranchName } from "./phase/phaseFiles";
import { phaseLog as log, persistPhaseSystemEvent, type PhaseLogContext } from "./phase/phaseLogging";
import { loadProjectAgentContext, resolvePhaseWorkspace } from "./phase/workspace";

export interface TriggerResult {
  ticket: Ticket;
  phase: Phase;
}

export class PhaseHandler {
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;
  private appStateRepo: AppStateRepository;
  private cliRunner: PhaseCliRunner;

  constructor() {
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
    this.appStateRepo = new AppStateRepository();
    this.cliRunner = new PhaseCliRunner(log);
  }

  private async updatePhase(phaseId: number, data: Partial<Phase>): Promise<Phase | null> {
    await this.phaseRepo.update(phaseId, data);
    const fresh = await this.phaseRepo.findById(phaseId);
    if (fresh) {
      emit({ type: "phase.updated", ticketId: fresh.ticketId, phase: fresh });
    }
    return fresh;
  }

  private async emitTicket(ticketId: number): Promise<void> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (ticket) emit({ type: "ticket.updated", ticket });
  }

  private assertReadyForProcessing(ticket: Ticket): void {
    if (ticket.status === TicketStatus.DRAFT) {
      throw new Error(`Ticket ${ticket.id} is draft and cannot be processed`);
    }
  }

  private async finalizeShip(ticket: Ticket, shipOutputPath: string): Promise<void> {
    await persistShipArtifacts(this.ticketRepo, ticket, shipOutputPath, log);
    await this.ticketRepo.update(ticket.id, { isDone: true });
    if (ticket.slotId == null) {
      log(`ticket #${ticket.id} has no slot — skipping release`);
      return;
    }
    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (slot) {
      await new SlotService().releaseAndPromoteQueue(slot);
    }
  }

  private async finalizeFeedback(ticket: Ticket, phase: Phase, feedbackOutputPath: string): Promise<void> {
    await persistFeedbackArtifacts({
      ticketRepo: this.ticketRepo,
      ticket,
      phase,
      feedbackOutputPath,
      updatePhase: this.updatePhase.bind(this),
      emitTicket: this.emitTicket.bind(this),
      log,
    });
    await this.ticketRepo.update(ticket.id, { isDone: true });
    if (ticket.slotId == null) {
      log(`ticket #${ticket.id} has no slot — skipping feedback release`);
      return;
    }
    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (slot) {
      await new SlotService().releaseAndPromoteQueue(slot);
    }
  }

  async trigger(ticketId: number, phaseName: TicketPhase): Promise<TriggerResult> {
    log(`trigger → ticket #${ticketId} phase=${phaseName}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
    this.assertReadyForProcessing(ticket);
    if (phaseName !== TicketPhase.CREATED) {
      await this.ensureCliAvailable(ticket);
    }
    const phaseLogContext: PhaseLogContext = {
      ticketId,
      uid: ticket.uid ?? null,
      phaseName,
    };
    persistPhaseSystemEvent(phaseLogContext, "trigger", `Triggered ${phaseName}`, {
      ticketId,
    });
    let phaseEntered = false;

    const currentActivePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    const shouldActivatePending =
      ticket.currentPhase !== phaseName ||
      !currentActivePhase ||
      currentActivePhase.phaseName !== phaseName;

    if (shouldActivatePending) {
      if (currentActivePhase) {
        log(`completing active phase ${currentActivePhase.phaseName} for ticket #${ticketId}`);
        await this.updatePhase(currentActivePhase.id, { completedAt: new Date() });
      }

      const pending = await this.phaseRepo.findPendingByTicketIdAndName(ticketId, phaseName);
      if (pending) {
        log(`activating phase ${phaseName} for ticket #${ticketId}`);
        await this.phaseRepo.activate(pending.id);
        const fresh = await this.phaseRepo.findById(pending.id);
        if (fresh) emit({ type: "phase.updated", ticketId, phase: fresh });
        persistPhaseSystemEvent(phaseLogContext, "activate", `Activated ${phaseName}`, {
          phaseId: pending.id,
          sequence: pending.sequence,
        });
        phaseEntered = true;
      } else {
        log(`WARN: no pending phase ${phaseName} found for ticket #${ticketId}`);
      }

      await this.ticketRepo.update(ticketId, { currentPhase: phaseName });
      log(`ticket #${ticketId} currentPhase → ${phaseName}`);
      persistPhaseSystemEvent(phaseLogContext, "current_phase", `Current phase set to ${phaseName}`);
      await this.emitTicket(ticketId);
    } else {
      log(`ticket #${ticketId} is already in active phase ${phaseName}, re-running handler`);
    }

    const updatedTicket = (await this.ticketRepo.findById(ticketId))!;
    const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    if (!activePhase || activePhase.phaseName !== phaseName) {
      throw new Error(`No active ${phaseName} phase for ticket #${ticketId}`);
    }
    if (activePhase.status === PhaseStatus.RUNNING) {
      log(`ticket #${ticketId} phase ${phaseName} is already running; trigger is idempotent no-op`);
      persistPhaseSystemEvent(phaseLogContext, "trigger_noop", `${phaseName} already running`, {
        phaseId: activePhase.id,
      });
      return { ticket: updatedTicket, phase: activePhase };
    }

    const runningPhase = await this.phaseRepo.markRunningIfNotRunning(activePhase.id);
    if (!runningPhase) {
      const refreshedPhase = await this.phaseRepo.findById(activePhase.id);
      if (!refreshedPhase) throw new Error(`Active ${phaseName} phase disappeared for ticket #${ticketId}`);
      log(`ticket #${ticketId} phase ${phaseName} was claimed by another trigger; no-op`);
      persistPhaseSystemEvent(phaseLogContext, "trigger_noop", `${phaseName} claimed by concurrent trigger`, {
        phaseId: activePhase.id,
      });
      return { ticket: updatedTicket, phase: refreshedPhase };
    }
    emit({ type: "phase.updated", ticketId, phase: runningPhase });

    if (phaseEntered) {
      await runPhaseEnteredHooks(updatedTicket, phaseName);
    }

    // Run phase handler in the background — Claude spawns can take many minutes
    // and must not block the HTTP response. WS pushes updates to the client.
    persistPhaseSystemEvent(phaseLogContext, "dispatch", `Dispatching ${phaseName}`);
    this.dispatch(phaseName, updatedTicket).catch(async (err) => {
      log(`dispatch error for ticket #${updatedTicket.id} phase=${phaseName}: ${err?.message ?? err}`);
      persistPhaseSystemEvent(phaseLogContext, "dispatch_error", `Dispatch failed for ${phaseName}`, {
        error: String(err?.message ?? err).slice(-500),
      });
      const current = await this.phaseRepo.findActiveByTicketId(updatedTicket.id);
      if (current && current.phaseName === phaseName) {
        await this.updatePhase(current.id, {
          status: PhaseStatus.ERROR,
          lastMessage: String(err?.message ?? err).slice(-2000),
        });
      }
    });

    return { ticket: updatedTicket, phase: runningPhase };
  }

  private async dispatch(phaseName: TicketPhase, ticket: Ticket): Promise<void> {
    log(`dispatch → ticket #${ticket.id} phase=${phaseName}`);
    switch (phaseName) {
      case TicketPhase.CREATED:
        return this.handleCreated(ticket);
      case TicketPhase.PLANNING:
        return this.handlePlanning(ticket);
      case TicketPhase.IMPLEMENTATION:
        return this.handleImplementation(ticket);
      case TicketPhase.SHIP:
        return this.handleShip(ticket);
      case TicketPhase.FEEDBACK:
        return this.handleFeedback(ticket);
    }
  }

  /** Retry the active ERROR phase in a fresh CLI session (assistant auto-retry). */
  async retry(ticketId: number, opts: { newCliSession?: boolean; reason?: string } = {}): Promise<TriggerResult> {
    log(`retry → ticket #${ticketId} newCliSession=${opts.newCliSession ?? false} reason=${opts.reason ?? ""}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    if (!activePhase) throw new Error(`Ticket ${ticketId} has no active phase to retry`);

    if (activePhase.status !== PhaseStatus.ERROR) {
      throw new Error(`Phase ${activePhase.phaseName} is not in ERROR state (status=${activePhase.status})`);
    }

    if (opts.newCliSession) {
      await this.phaseRepo.update(activePhase.id, { cliSessionId: null });
      activePhase.cliSessionId = null;
    }

    return this.trigger(ticketId, activePhase.phaseName);
  }

  /** Resume an in-flight phase with a user reply (QUESTION / REQUIRES_ACTION / ERROR). */
  async respond(ticketId: number, message: string): Promise<TriggerResult> {
    log(`respond → ticket #${ticketId}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    if (!activePhase) throw new Error(`Ticket ${ticketId} has no active phase to respond to`);

    const resumable = [PhaseStatus.QUESTION, PhaseStatus.REQUIRES_ACTION, PhaseStatus.ERROR];
    if (!resumable.includes(activePhase.status)) {
      throw new Error(`Phase ${activePhase.phaseName} is not awaiting a response (status=${activePhase.status})`);
    }
    if (!activePhase.cliSessionId) {
      throw new Error(`Phase ${activePhase.phaseName} has no CLI session ID to resume`);
    }

    await this.ensureCliAvailable(ticket);
    const { slotRoot, tmpDir } = await resolvePhaseWorkspace(ticket);
    await this.updatePhase(activePhase.id, { status: PhaseStatus.RUNNING, lastMessage: null });

    // Run the Claude resume in the background; WS pushes updates to the client.
    this.runRespond(activePhase, ticket, message, slotRoot, tmpDir).catch(async (err) => {
      log(`respond error for ticket #${ticket.id}: ${err?.message ?? err}`);
      await this.updatePhase(activePhase.id, {
        status: PhaseStatus.ERROR,
        lastMessage: String(err?.message ?? err).slice(-2000),
      });
    });

    const refreshedTicket = (await this.ticketRepo.findById(ticketId))!;
    const refreshedPhase = (await this.phaseRepo.findById(activePhase.id))!;
    return { ticket: refreshedTicket, phase: refreshedPhase };
  }

  private async runRespond(
    activePhase: Phase,
    ticket: Ticket,
    message: string,
    slotRoot: string,
    tmpDir: string,
  ): Promise<void> {
    const shipOutputPath = join(tmpDir, "ship.md");
    const feedbackOutputPath = join(tmpDir, feedbackOutputFile(activePhase));
    const phaseAgent = getAgent(activePhase.phaseName);
    const prompt = phaseAgent
      ? phaseAgent.buildFollowupPrompt(message, { phase: activePhase, ticket })
      : `${message}${MARKER_TRAILER}`;
    const result = await this.cliRunner.spawn(ticket, prompt, slotRoot, activePhase.cliSessionId, {
      ticketId: ticket.id,
      uid: ticket.uid!,
      phaseName: activePhase.phaseName,
    });

    const mdFile = activePhase.phaseName === TicketPhase.FEEDBACK
      ? feedbackOutputFile(activePhase)
      : phaseOutputFile(activePhase.phaseName);
    if (mdFile) {
      const mdPath = join(tmpDir, mdFile);
      const header = `\n\n---\n## Follow-up\n\n`;
      if (existsSync(mdPath)) {
        appendFileSync(mdPath, header + result.output);
      } else {
        writeFileSync(mdPath, header + result.output);
      }
    }

    await this.applyResultToPhase(activePhase, result);
    if (activePhase.phaseName === TicketPhase.FEEDBACK) {
      await persistFeedbackArtifacts({
        ticketRepo: this.ticketRepo,
        ticket,
        phase: activePhase,
        feedbackOutputPath,
        updatePhase: this.updatePhase.bind(this),
        emitTicket: this.emitTicket.bind(this),
        log,
      });
    }
    if (result.status === PhaseStatus.COMPLETED) {
      if (activePhase.phaseName === TicketPhase.SHIP) {
        await this.finalizeShip(ticket, shipOutputPath);
        await this.emitTicket(ticket.id);
      } else if (activePhase.phaseName === TicketPhase.FEEDBACK) {
        await this.finalizeFeedback(ticket, activePhase, feedbackOutputPath);
        await this.emitTicket(ticket.id);
      }
      await runPhaseCompletedHooks(ticket, activePhase.phaseName);
    }

    if (result.status === PhaseStatus.COMPLETED && activePhase.phaseName !== TicketPhase.FEEDBACK) {
      const next = this.nextPhase(activePhase.phaseName);
      if (next) await this.maybeAutoTriggerNext(ticket, activePhase.phaseName, next);
    }
  }

  // ── Phase handlers ────────────────────────────────────────────────

  /** Public entry point for external callers (TicketSubscriber, SlotService). */
  async initCreated(ticket: Ticket): Promise<void> {
    this.assertReadyForProcessing(ticket);
    return this.handleCreated(ticket);
  }

  async publish(ticketId: number): Promise<Ticket> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (ticket.status !== TicketStatus.READY) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.READY });
      ticket.status = TicketStatus.READY;
    }

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    if (!activePhase) {
      const createdPhase = ticket.phases?.find((phase) => phase.phaseName === TicketPhase.CREATED);
      if (createdPhase && !createdPhase.startedAt) {
        await this.updatePhase(createdPhase.id, { startedAt: new Date() });
      }
    }

    await this.handleCreated(ticket);
    await this.emitTicket(ticketId);

    const updated = await this.ticketRepo.findById(ticketId);
    if (!updated) throw new Error(`Ticket ${ticketId} not found after publish`);
    return updated;
  }

  protected async handleCreated(ticket: Ticket): Promise<void> {
    this.assertReadyForProcessing(ticket);
    log(`handleCreated → ticket #${ticket.id} (uid=${ticket.uid ?? "none"}, slotId=${ticket.slotId ?? "none"})`);

    if (ticket.slotId == null) {
      log(`ticket #${ticket.id} has no slot — attempting assignment`);
      const slotService = new SlotService();
      const assigned = await slotService.tryAssign(ticket);
      if (!assigned) {
        log(`ticket #${ticket.id} queued — no free slots available`);
        return;
      }
      ticket.slotId = assigned.id;
      log(`slot ${assigned.id} (${assigned.name}) assigned to ticket #${ticket.id}`);
    }

    let uid = ticket.uid;
    if (!uid) {
      uid = randomUUID();
      await this.ticketRepo.update(ticket.id, { uid });
      ticket.uid = uid;
      log(`generated uid ${uid} for ticket #${ticket.id}`);
    }

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) {
      log(`WARN: slot ${ticket.slotId} not found for ticket #${ticket.id}`);
      return;
    }

    const tmpDir = getTicketDir(uid);
    mkdirSync(tmpDir, { recursive: true });

    const lines: string[] = [`# Ticket #${ticket.id}: ${ticket.title}`, ""];
    if (ticket.description) {
      lines.push("## Description", "", ticket.description, "");
    }
    if (ticket.mondayMarkdown) {
      lines.push("## Monday.com Details", "", ticket.mondayMarkdown, "");
    }

    writeFileSync(join(tmpDir, "ticket.md"), lines.join("\n"));
    log(`workspace ready → ${tmpDir}`);

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
    if (activePhase && activePhase.phaseName === TicketPhase.CREATED) {
      await this.updatePhase(activePhase.id, {
        status: PhaseStatus.COMPLETED,
        completedAt: new Date(),
      });
      await this.maybeAutoTriggerNext(ticket, TicketPhase.CREATED, TicketPhase.PLANNING);
    }
  }

  protected async handlePlanning(ticket: Ticket): Promise<void> {
    log(`handlePlanning → ticket #${ticket.id}`);
    persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.PLANNING }, "handler_enter", "Entered planning handler");
    const { slotRoot, tmpDir } = await resolvePhaseWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");

    const agent = getAgent(TicketPhase.PLANNING);
    if (!agent) throw new Error("No agent configured for PLANNING");
    const projectContext = await loadProjectAgentContext(ticket);
    const prompt = agent.buildPrompt({ ticketContent, projectContext });

    await this.runPhase(ticket, TicketPhase.PLANNING, slotRoot, tmpDir, prompt, "planning.md");
  }

  protected async handleImplementation(ticket: Ticket): Promise<void> {
    log(`handleImplementation → ticket #${ticket.id}`);
    persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.IMPLEMENTATION }, "handler_enter", "Entered implementation handler");
    const { slotRoot, tmpDir } = await resolvePhaseWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const planningPath = join(tmpDir, "planning.md");

    const planningContent = existsSync(planningPath)
      ? readFileSync(planningPath, "utf-8")
      : "";

    if (!planningContent) log(`WARN: planning.md not found for ticket #${ticket.id}`);

    const agent = getAgent(TicketPhase.IMPLEMENTATION);
    if (!agent) throw new Error("No agent configured for IMPLEMENTATION");
    const projectContext = await loadProjectAgentContext(ticket);
    const prompt = agent.buildPrompt({
      ticketContent,
      projectContext,
      planningContent,
      checklistOutputPath: join(tmpDir, "implementation-testing-checklist.md"),
    });

    await this.runPhase(ticket, TicketPhase.IMPLEMENTATION, slotRoot, tmpDir, prompt, "implementation.md");
  }

  protected async handleShip(ticket: Ticket): Promise<void> {
    log(`handleShip → ticket #${ticket.id}`);
    persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.SHIP }, "handler_enter", "Entered ship handler");
    if (ticket.slotId == null) { log(`no slot — nothing to ship`); return; }

    const { slotRoot, tmpDir } = await resolvePhaseWorkspace(ticket);
    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const implPath = join(tmpDir, "implementation.md");
    const implementationContent = existsSync(implPath) ? readFileSync(implPath, "utf-8") : "";

    const agent = getAgent(TicketPhase.SHIP);
    if (!agent) throw new Error("No agent configured for SHIP");
    const shipOutputPath = join(tmpDir, "ship.md");
    const projectContext = await loadProjectAgentContext(ticket);
    const prompt = agent.buildPrompt({ ticketContent, projectContext, implementationContent, shipOutputPath });

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
    await this.runPhase(ticket, TicketPhase.SHIP, slotRoot, tmpDir, prompt, "ship.md");

    const latest = activePhase ? await this.phaseRepo.findById(activePhase.id) : null;
    if (latest?.status === PhaseStatus.COMPLETED) {
      await this.finalizeShip(ticket, shipOutputPath);
      await runPhaseCompletedHooks(ticket, TicketPhase.SHIP);
    } else {
      log(`SHIP status=${latest?.status} — slot retained`);
    }
    await this.emitTicket(ticket.id);
  }

  protected async handleFeedback(ticket: Ticket): Promise<void> {
    log(`handleFeedback → ticket #${ticket.id}`);
    persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.FEEDBACK }, "handler_enter", "Entered feedback handler");
    const { slotRoot, tmpDir } = await resolvePhaseWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
    if (!activePhase || activePhase.phaseName !== TicketPhase.FEEDBACK) {
      throw new Error(`No active FEEDBACK phase for ticket #${ticket.id}`);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const planningPath = join(tmpDir, "planning.md");
    const implementationPath = join(tmpDir, "implementation.md");
    const shipPath = join(tmpDir, "ship.md");
    const planningContent = existsSync(planningPath) ? readFileSync(planningPath, "utf-8") : "";
    const implementationContent = existsSync(implementationPath) ? readFileSync(implementationPath, "utf-8") : "";
    const shipContent = existsSync(shipPath) ? readFileSync(shipPath, "utf-8") : "";
    const feedbackOutputPath = join(tmpDir, feedbackOutputFile(activePhase));

    const agent = getAgent(TicketPhase.FEEDBACK);
    if (!agent) throw new Error("No agent configured for FEEDBACK");
    const projectContext = await loadProjectAgentContext(ticket);
    const lastPrUrl = ticket.pullRequests?.length
      ? ticket.pullRequests[ticket.pullRequests.length - 1]?.prUrl ?? null
      : null;
    const baseBranch = ticket.branchName ?? "dev";
    const suggestedBranchName = suggestFeedbackBranchName(ticket, activePhase);
    const prompt = agent.buildPrompt({
      ticketContent,
      projectContext,
      planningContent,
      implementationContent,
      shipContent,
      feedbackComment: activePhase.feedbackComment ?? "",
      feedbackSequence: activePhase.sequence,
      feedbackOutputPath,
      baseBranch,
      lastPrUrl,
      suggestedBranchName,
    });

    await this.runPhase(ticket, TicketPhase.FEEDBACK, slotRoot, tmpDir, prompt, feedbackOutputFile(activePhase));
  }

  // ── Shared phase runner ───────────────────────────────────────────

  private async runPhase(
    ticket: Ticket,
    phaseName: TicketPhase,
    slotRoot: string,
    tmpDir: string,
    prompt: string,
    outputFile: string,
  ): Promise<void> {
    const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
    if (!activePhase || activePhase.phaseName !== phaseName) {
      throw new Error(`No active ${phaseName} phase for ticket #${ticket.id}`);
    }

    await this.ensureCliAvailable(ticket);

    log(`spawning ${ticket.cliType} for ${phaseName.toLowerCase()} (resume=${activePhase.cliSessionId ?? "none"})`);
    const rawResult = await this.cliRunner.spawn(ticket, prompt, slotRoot, activePhase.cliSessionId, {
      ticketId: ticket.id,
      uid: ticket.uid!,
      phaseName,
    });
    const result = phaseName === TicketPhase.FEEDBACK && rawResult.status === PhaseStatus.COMPLETED
      ? {
          ...rawResult,
          status: PhaseStatus.REQUIRES_ACTION,
          message: rawResult.message ?? "Does this resolve your feedback? Reply 'yes' to close, or describe further changes.",
        }
      : rawResult;

    writeFileSync(join(tmpDir, outputFile), result.output);
    log(`${phaseName.toLowerCase()} output → ${join(tmpDir, outputFile)} (status=${result.status})`);

    if (phaseName === TicketPhase.FEEDBACK) {
      await persistFeedbackArtifacts({
        ticketRepo: this.ticketRepo,
        ticket,
        phase: activePhase,
        feedbackOutputPath: join(tmpDir, outputFile),
        updatePhase: this.updatePhase.bind(this),
        emitTicket: this.emitTicket.bind(this),
        log,
      });
    }

    await this.applyResultToPhase(activePhase, result);
    if (result.status === PhaseStatus.COMPLETED && phaseName === TicketPhase.FEEDBACK) {
      await this.finalizeFeedback(ticket, activePhase, join(tmpDir, outputFile));
      await runPhaseCompletedHooks(ticket, phaseName);
      await this.emitTicket(ticket.id);
    } else if (result.status === PhaseStatus.COMPLETED && phaseName !== TicketPhase.SHIP) {
      await runPhaseCompletedHooks(ticket, phaseName);
    }

    if (result.status === PhaseStatus.COMPLETED) {
      if (phaseName !== TicketPhase.FEEDBACK) {
        const next = this.nextPhase(phaseName);
        if (next) await this.maybeAutoTriggerNext(ticket, phaseName, next);
      }
    } else {
      log(`phase ${phaseName} paused with status=${result.status} — awaiting user`);
    }
  }

  private async maybeAutoTriggerNext(
    ticket: Ticket,
    currentPhase: TicketPhase,
    nextPhase: TicketPhase,
  ): Promise<void> {
    if (currentPhase === TicketPhase.FEEDBACK) return;

    const logContext = { ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: currentPhase };
    const appState = await this.appStateRepo.get();

    if (!appState.autoTriggerEnabled) {
      log(`auto trigger paused — ticket #${ticket.id} remains after ${currentPhase}`);
      persistPhaseSystemEvent(logContext, "auto_trigger_paused", `Auto trigger paused before ${nextPhase}`, {
        nextPhase,
      });
      return;
    }

    if (!appState.availableCliTypes.includes(ticket.cliType)) {
      log(`auto trigger skipped — ${ticket.cliType} unavailable for ticket #${ticket.id}`);
      persistPhaseSystemEvent(logContext, "cli_unavailable", `${ticket.cliType} unavailable before ${nextPhase}`, {
        cliType: ticket.cliType,
        nextPhase,
      });
      return;
    }

    log(`auto-advance ticket #${ticket.id} → ${nextPhase}`);
    persistPhaseSystemEvent(logContext, "auto_advance", `Auto-advancing to ${nextPhase}`, {
      nextPhase,
    });
    await this.trigger(ticket.id, nextPhase);
  }

  private async ensureCliAvailable(ticket: Ticket): Promise<void> {
    const appState = await this.appStateRepo.get();
    if (appState.availableCliTypes.length === 0) {
      throw new Error("No CLI is currently available");
    }
    if (!appState.availableCliTypes.includes(ticket.cliType)) {
      throw new Error(`${ticket.cliType} is currently unavailable`);
    }
  }

  private async applyResultToPhase(activePhase: Phase, result: SpawnResult): Promise<void> {
    await this.updatePhase(activePhase.id, {
      status: result.status,
      lastMessage: result.message,
      cliSessionId: result.sessionUuid ?? activePhase.cliSessionId ?? null,
      completedAt: result.status === PhaseStatus.COMPLETED ? new Date() : null,
    });
  }

  private nextPhase(current: TicketPhase): TicketPhase | null {
    switch (current) {
      case TicketPhase.PLANNING:
        return TicketPhase.IMPLEMENTATION;
      case TicketPhase.IMPLEMENTATION:
        return TicketPhase.SHIP;
      default:
        return null;
    }
  }

}
