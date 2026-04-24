import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { CliType } from "../enum/CliType";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { SlotService } from "../service/SlotService";
import { getTicketDir, getLogDir, getLogFile, getStderrFile } from "../lib/paths";
import { emit } from "../lib/events";
import { getAgent, MARKER_TRAILER, MARKER_REGEX } from "../agent";
import { runPhaseCompletedHooks, runPhaseEnteredHooks } from "../hooks/registry";
import { getAdapter } from "../cli";

const log = (msg: string) => console.log(`[PhaseHandler] ${msg}`);

const SPAWN_TIMEOUT_MS = 30 * 60 * 1000; // 30 min safety kill

export interface TriggerResult {
  ticket: Ticket;
  phase: Phase;
}

interface SpawnResult {
  output: string;
  status: PhaseStatus;
  message: string | null;
  sessionUuid: string | null;
}

interface PullRequestArtifact {
  repo: string;
  prUrl: string;
  commitSha: string;
}

type PhaseLogContext = {
  ticketId: number;
  uid: string | null;
  phaseName: TicketPhase;
};

type PhaseSystemEventMetadata = Record<string, string | number | boolean | null | undefined>;

export class PhaseHandler {
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;

  constructor() {
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
  }

  private async updatePhase(phaseId: number, data: Partial<Phase>): Promise<Phase | null> {
    await this.phaseRepo.update(phaseId, data);
    const fresh = await this.phaseRepo.findById(phaseId);
    if (fresh) {
      emit({ type: "phase.updated", ticketId: fresh.ticketId, phase: fresh });
    }
    return fresh;
  }

  private buildPhaseSystemEvent(
    logContext: PhaseLogContext,
    code: string,
    message: string,
    metadata?: PhaseSystemEventMetadata,
  ): Record<string, unknown> {
    const detail = Object.fromEntries(
      Object.entries(metadata ?? {}).filter(([, value]) => value !== undefined),
    );

    return {
      type: "system",
      source: "PhaseHandler",
      code,
      message,
      at: new Date().toISOString(),
      ticketId: logContext.ticketId,
      phaseName: logContext.phaseName,
      ...(Object.keys(detail).length ? { detail } : {}),
    };
  }

  private persistPhaseEvent(logContext: PhaseLogContext, evt: unknown): void {
    if (!logContext.uid) return;
    try {
      const logDir = getLogDir(logContext.uid);
      mkdirSync(logDir, { recursive: true });
      const logFile = getLogFile(logContext.uid, logContext.phaseName);
      appendFileSync(logFile, JSON.stringify(evt) + "\n");
      emit({
        type: "phase.log",
        ticketId: logContext.ticketId,
        phaseName: logContext.phaseName,
        event: evt,
      });
    } catch (err) {
      console.error("[PhaseHandler] failed to persist log event:", err);
    }
  }

  private persistPhaseSystemEvent(
    logContext: PhaseLogContext | undefined,
    code: string,
    message: string,
    metadata?: PhaseSystemEventMetadata,
  ): void {
    if (!logContext) return;
    this.persistPhaseEvent(logContext, this.buildPhaseSystemEvent(logContext, code, message, metadata));
  }

  private async emitTicket(ticketId: number): Promise<void> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (ticket) emit({ type: "ticket.updated", ticket });
  }

  private parseShipArtifacts(content: string): { branchName: string | null; pullRequests: PullRequestArtifact[] } {
    const extractPrUrl = (raw: string): string | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
      if (markdownMatch?.[1]) return markdownMatch[1];
      const directMatch = trimmed.match(/https?:\/\/\S+/i);
      if (!directMatch?.[0]) return null;
      return directMatch[0].replace(/[),.;]+$/, "");
    };

    const extractRepoFromPrUrl = (prUrl: string): string | null => {
      const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/i);
      return match?.[1] ?? null;
    };

    const branchFromHeading = content.match(/##\s*Branch[\s\S]*?`([^`]+)`/i)?.[1]?.trim() ?? null;
    const branchFromNarrative =
      content.match(/\bon branch\s+`([^`]+)`/i)?.[1]?.trim() ??
      content.match(/\bon branch\s+([a-z0-9._/-]+)/i)?.[1]?.trim() ??
      null;
    const branchName = branchFromHeading || branchFromNarrative;

    const pullRequests: PullRequestArtifact[] = [];
    const seen = new Set<string>();
    const prSectionMatch = content.match(/##\s*Pull Requests\s*([\s\S]*?)(?:\n##\s+|\s*$)/i);
    if (prSectionMatch?.[1]) {
      const lines = prSectionMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("| repo |"));

      for (const line of lines) {
        const cells = line
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean);
        if (cells.length < 3) continue;
        const prUrl = extractPrUrl(cells[1]) ?? cells[1];
        const repo = cells[0];
        const commitSha = cells[2].replace(/`/g, "").trim();
        const key = `${repo}|${prUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pullRequests.push({ repo, prUrl, commitSha });
      }
    }

    // Fallback for narrative outputs that don't follow the table schema.
    const prUrlMatches = [...content.matchAll(/https?:\/\/github\.com\/[^\s)]+\/pull\/\d+/gi)];
    const commitFromNarrative =
      content.match(/\bcommit\s+`?([0-9a-f]{7,40})`?/i)?.[1]?.trim() ??
      content.match(/\b([0-9a-f]{7,40})\b/)?.[1]?.trim() ??
      "";

    for (const match of prUrlMatches) {
      const rawUrl = match[0];
      const prUrl = rawUrl.replace(/[),.;]+$/, "");
      const repo = extractRepoFromPrUrl(prUrl) ?? "unknown";
      const key = `${repo}|${prUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pullRequests.push({
        repo,
        prUrl,
        commitSha: commitFromNarrative,
      });
    }

    return { branchName, pullRequests };
  }

  private async persistShipArtifacts(ticket: Ticket, shipOutputPath: string): Promise<void> {
    if (!existsSync(shipOutputPath)) {
      log(`ship output missing at ${shipOutputPath} — skipping artifact persistence`);
      return;
    }

    const shipContent = readFileSync(shipOutputPath, "utf-8");
    const { branchName, pullRequests } = this.parseShipArtifacts(shipContent);
    await this.ticketRepo.update(ticket.id, {
      branchName,
      pullRequests: pullRequests.length ? pullRequests : null,
    });
  }

  private async finalizeShip(ticket: Ticket, shipOutputPath: string): Promise<void> {
    await this.persistShipArtifacts(ticket, shipOutputPath);
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

  async trigger(ticketId: number, phaseName: TicketPhase): Promise<TriggerResult> {
    log(`trigger → ticket #${ticketId} phase=${phaseName}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
    const phaseLogContext: PhaseLogContext = {
      ticketId,
      uid: ticket.uid ?? null,
      phaseName,
    };
    this.persistPhaseSystemEvent(phaseLogContext, "trigger", `Triggered ${phaseName}`, {
      ticketId,
    });
    let phaseEntered = false;

    if (ticket.currentPhase !== phaseName) {
      const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
      if (activePhase) {
        log(`completing active phase ${activePhase.phaseName} for ticket #${ticketId}`);
        await this.updatePhase(activePhase.id, { completedAt: new Date() });
      }

      const pending = await this.phaseRepo.findPendingByTicketIdAndName(ticketId, phaseName);
      if (pending) {
        log(`activating phase ${phaseName} for ticket #${ticketId}`);
        await this.phaseRepo.activate(pending.id);
        const fresh = await this.phaseRepo.findById(pending.id);
        if (fresh) emit({ type: "phase.updated", ticketId, phase: fresh });
        this.persistPhaseSystemEvent(phaseLogContext, "activate", `Activated ${phaseName}`, {
          phaseId: pending.id,
        });
        phaseEntered = true;
      } else {
        log(`WARN: no pending phase ${phaseName} found for ticket #${ticketId}`);
      }

      await this.ticketRepo.update(ticketId, { currentPhase: phaseName });
      log(`ticket #${ticketId} currentPhase → ${phaseName}`);
      this.persistPhaseSystemEvent(phaseLogContext, "current_phase", `Current phase set to ${phaseName}`);
      await this.emitTicket(ticketId);
    } else {
      log(`ticket #${ticketId} is already in phase ${phaseName}, re-running handler`);
    }

    const updatedTicket = (await this.ticketRepo.findById(ticketId))!;
    const activePhase = (await this.phaseRepo.findActiveByTicketId(ticketId))!;
    if (phaseEntered) {
      await runPhaseEnteredHooks(updatedTicket, phaseName);
    }

    // Run phase handler in the background — Claude spawns can take many minutes
    // and must not block the HTTP response. WS pushes updates to the client.
    this.persistPhaseSystemEvent(phaseLogContext, "dispatch", `Dispatching ${phaseName}`);
    this.dispatch(phaseName, updatedTicket).catch(async (err) => {
      log(`dispatch error for ticket #${updatedTicket.id} phase=${phaseName}: ${err?.message ?? err}`);
      this.persistPhaseSystemEvent(phaseLogContext, "dispatch_error", `Dispatch failed for ${phaseName}`, {
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

    return { ticket: updatedTicket, phase: activePhase };
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
    }
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

    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);
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
    const phaseAgent = getAgent(activePhase.phaseName);
    const prompt = phaseAgent ? phaseAgent.buildFollowupPrompt(message) : `${message}${MARKER_TRAILER}`;
    const result = await this.spawnCli(ticket, prompt, slotRoot, activePhase.cliSessionId, {
      ticketId: ticket.id,
      uid: ticket.uid!,
      phaseName: activePhase.phaseName,
    });

    const mdFile = this.phaseOutputFile(activePhase.phaseName);
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
    if (result.status === PhaseStatus.COMPLETED) {
      if (activePhase.phaseName === TicketPhase.SHIP) {
        await this.finalizeShip(ticket, shipOutputPath);
        await this.emitTicket(ticket.id);
      }
      await runPhaseCompletedHooks(ticket, activePhase.phaseName);
    }

    if (result.status === PhaseStatus.COMPLETED) {
      const next = this.nextPhase(activePhase.phaseName);
      if (next) {
        log(`auto-advance ticket #${ticket.id} → ${next}`);
        this.persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: activePhase.phaseName }, "auto_advance", `Auto-advancing to ${next}`, {
          nextPhase: next,
        });
        await this.trigger(ticket.id, next);
      }
    }
  }

  // ── Phase handlers ────────────────────────────────────────────────

  /** Public entry point for external callers (TicketSubscriber, SlotService). */
  async initCreated(ticket: Ticket): Promise<void> {
    return this.handleCreated(ticket);
  }

  protected async handleCreated(ticket: Ticket): Promise<void> {
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
      log(`CREATED phase completed for ticket #${ticket.id} — auto-advancing to PLANNING`);
      await this.trigger(ticket.id, TicketPhase.PLANNING);
    }
  }

  protected async handlePlanning(ticket: Ticket): Promise<void> {
    log(`handlePlanning → ticket #${ticket.id}`);
    this.persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.PLANNING }, "handler_enter", "Entered planning handler");
    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");

    const agent = getAgent(TicketPhase.PLANNING);
    if (!agent) throw new Error("No agent configured for PLANNING");
    const prompt = agent.buildPrompt({ ticketContent });

    await this.runPhase(ticket, TicketPhase.PLANNING, slotRoot, tmpDir, prompt, "planning.md");
  }

  protected async handleImplementation(ticket: Ticket): Promise<void> {
    log(`handleImplementation → ticket #${ticket.id}`);
    this.persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.IMPLEMENTATION }, "handler_enter", "Entered implementation handler");
    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);

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
    const prompt = agent.buildPrompt({
      ticketContent,
      planningContent,
      checklistOutputPath: join(tmpDir, "implementation-testing-checklist.md"),
    });

    await this.runPhase(ticket, TicketPhase.IMPLEMENTATION, slotRoot, tmpDir, prompt, "implementation.md");
  }

  protected async handleShip(ticket: Ticket): Promise<void> {
    log(`handleShip → ticket #${ticket.id}`);
    this.persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName: TicketPhase.SHIP }, "handler_enter", "Entered ship handler");
    if (ticket.slotId == null) { log(`no slot — nothing to ship`); return; }

    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);
    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const implPath = join(tmpDir, "implementation.md");
    const implementationContent = existsSync(implPath) ? readFileSync(implPath, "utf-8") : "";

    const agent = getAgent(TicketPhase.SHIP);
    if (!agent) throw new Error("No agent configured for SHIP");
    const shipOutputPath = join(tmpDir, "ship.md");
    const prompt = agent.buildPrompt({ ticketContent, implementationContent, shipOutputPath });

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

    await this.updatePhase(activePhase.id, { status: PhaseStatus.RUNNING });

    log(`spawning ${ticket.cliType} for ${phaseName.toLowerCase()} (resume=${activePhase.cliSessionId ?? "none"})`);
    const result = await this.spawnCli(ticket, prompt, slotRoot, activePhase.cliSessionId, {
      ticketId: ticket.id,
      uid: ticket.uid!,
      phaseName,
    });

    writeFileSync(join(tmpDir, outputFile), result.output);
    log(`${phaseName.toLowerCase()} output → ${join(tmpDir, outputFile)} (status=${result.status})`);

    await this.applyResultToPhase(activePhase, result);
    if (result.status === PhaseStatus.COMPLETED && phaseName !== TicketPhase.SHIP) {
      await runPhaseCompletedHooks(ticket, phaseName);
    }

    if (result.status === PhaseStatus.COMPLETED) {
      const next = this.nextPhase(phaseName);
      if (next) {
        log(`auto-advance ticket #${ticket.id} → ${next}`);
        this.persistPhaseSystemEvent({ ticketId: ticket.id, uid: ticket.uid ?? null, phaseName }, "auto_advance", `Auto-advancing to ${next}`, {
          nextPhase: next,
        });
        await this.trigger(ticket.id, next);
      }
    } else {
      log(`phase ${phaseName} paused with status=${result.status} — awaiting user`);
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

  private phaseOutputFile(phaseName: TicketPhase): string | null {
    switch (phaseName) {
      case TicketPhase.PLANNING:
        return "planning.md";
      case TicketPhase.IMPLEMENTATION:
        return "implementation.md";
      case TicketPhase.SHIP:
        return "ship.md";
      default:
        return null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async resolveWorkspace(ticket: Ticket): Promise<{ slotRoot: string; tmpDir: string }> {
    if (!ticket.uid) {
      throw new Error(`Ticket #${ticket.id} has no uid — workspace not initialized`);
    }
    if (ticket.slotId == null) {
      throw new Error(`Ticket #${ticket.id} has no slot assigned — assign a slot before triggering phases`);
    }

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) throw new Error(`Slot ${ticket.slotId} not found`);

    const tmpDir = getTicketDir(ticket.uid);
    log(`workspace → slotRoot=${slot.rootPath} tmpDir=${tmpDir}`);
    return { slotRoot: slot.rootPath, tmpDir };
  }

  private spawnCli(
    ticket: Ticket,
    prompt: string,
    cwd: string,
    resumeSessionId?: string | null,
    logContext?: { ticketId: number; uid: string; phaseName: TicketPhase },
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const adapter = getAdapter(ticket.cliType ?? CliType.CLAUDE);
      const resuming = !!resumeSessionId;
      const args = adapter.buildArgs({ prompt, resumeSessionId });

      log(`${adapter.type} spawn: ${resuming ? `resume ${resumeSessionId}` : "new session"} cwd=${cwd}`);

      let stderrFile: string | null = null;
      if (logContext?.uid) {
        const logDir = getLogDir(logContext.uid);
        mkdirSync(logDir, { recursive: true });
        stderrFile = getStderrFile(logContext.uid, logContext.phaseName);
        // Mark the start of a new run so readers can distinguish resumptions.
        this.persistPhaseEvent(logContext, {
          type: "_tribe.run_start",
          at: new Date().toISOString(),
          resumeSessionId: resumeSessionId ?? null,
        });
      }

      const persistEvent = (evt: unknown) => {
        if (!logContext) return;
        this.persistPhaseEvent(logContext, evt);
      };

      const proc = spawn(adapter.binary, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let output = "";
      let stderr = "";
      let sessionUuid: string | null = null;
      let stdoutBuf = "";

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        const parsed = adapter.parseEvent(line);
        if (!parsed) return;
        if (parsed.sessionId && !sessionUuid) sessionUuid = parsed.sessionId;
        if (parsed.textChunk) output += parsed.textChunk;
        if (parsed.finalText && !output) output = parsed.finalText;
        persistEvent(parsed.raw);
      };

      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        let idx: number;
        while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, idx);
          stdoutBuf = stdoutBuf.slice(idx + 1);
          consumeLine(line);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
        if (stderrFile) {
          try {
            appendFileSync(stderrFile, text);
          } catch (err) {
            console.error("[PhaseHandler] failed to persist stderr:", err);
          }
        }
      });

      const timeout = setTimeout(() => {
        log(`${adapter.type} timeout after ${SPAWN_TIMEOUT_MS}ms — killing process`);
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5000);
        timedOut = true;
      }, SPAWN_TIMEOUT_MS);

      let timedOut = false;

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (stdoutBuf.trim()) consumeLine(stdoutBuf);
        log(`${adapter.type} exited with code ${code} (sessionUuid=${sessionUuid ?? "none"})`);
        this.persistPhaseSystemEvent(logContext, "cli_exit", `${adapter.type} exited with code ${code ?? "unknown"}`, {
          exitCode: code ?? null,
          resumed: resuming,
        });

        if (timedOut) {
          this.persistPhaseSystemEvent(logContext, "cli_timeout", `${adapter.type} timed out`, {
            timeoutMs: SPAWN_TIMEOUT_MS,
          });
          resolve({
            output,
            status: PhaseStatus.ERROR,
            message: "timeout",
            sessionUuid,
          });
          return;
        }

        const parsed = this.parseMarker(output);
        let status = parsed.status;
        let message = parsed.message;

        if (!parsed.found) {
          if (code === 0) {
            status = PhaseStatus.COMPLETED;
            message = null;
          } else {
            status = PhaseStatus.ERROR;
            message = (stderr.trim() || `${adapter.type} exited with code ${code}`).slice(-2000);
          }
        }

        resolve({
          output: parsed.output,
          status,
          message,
          sessionUuid,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        log(`${adapter.type} process error: ${err.message}`);
        reject(err);
      });
    });
  }

  private parseMarker(raw: string): {
    output: string;
    status: PhaseStatus;
    message: string | null;
    found: boolean;
  } {
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(MARKER_REGEX);
      if (!m) continue;

      const tag = m[1] as keyof typeof PhaseStatus;
      const status = PhaseStatus[tag];
      const before = lines.slice(0, i).join("\n").replace(/\s+$/, "");
      const message =
        status === PhaseStatus.COMPLETED
          ? null
          : this.tailMessage(before);
      return {
        output: before,
        status,
        message,
        found: true,
      };
    }
    return {
      output: raw,
      status: PhaseStatus.COMPLETED,
      message: null,
      found: false,
    };
  }

  /** Grab the trailing non-empty paragraph of a string — the agent's human-readable message. */
  private tailMessage(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    // Take last paragraph (separated by a blank line).
    const parts = trimmed.split(/\n\s*\n/);
    return (parts[parts.length - 1] ?? trimmed).trim() || null;
  }
}
