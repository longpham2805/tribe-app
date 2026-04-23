import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { SlotService } from "../service/SlotService";
import { getTicketDir, getLogDir, getLogFile, getStderrFile } from "../lib/paths";
import { emit } from "../lib/events";
import { getAgent, MARKER_TRAILER, MARKER_REGEX } from "../agent";

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

  private async emitTicket(ticketId: number): Promise<void> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (ticket) emit({ type: "ticket.updated", ticket });
  }

  async trigger(ticketId: number, phaseName: TicketPhase): Promise<TriggerResult> {
    log(`trigger → ticket #${ticketId} phase=${phaseName}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

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
      } else {
        log(`WARN: no pending phase ${phaseName} found for ticket #${ticketId}`);
      }

      await this.ticketRepo.update(ticketId, { currentPhase: phaseName });
      log(`ticket #${ticketId} currentPhase → ${phaseName}`);
      await this.emitTicket(ticketId);
    } else {
      log(`ticket #${ticketId} is already in phase ${phaseName}, re-running handler`);
    }

    const updatedTicket = (await this.ticketRepo.findById(ticketId))!;
    const activePhase = (await this.phaseRepo.findActiveByTicketId(ticketId))!;

    // Run phase handler in the background — Claude spawns can take many minutes
    // and must not block the HTTP response. WS pushes updates to the client.
    this.dispatch(phaseName, updatedTicket).catch(async (err) => {
      log(`dispatch error for ticket #${updatedTicket.id} phase=${phaseName}: ${err?.message ?? err}`);
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
      case TicketPhase.BRAINSTORM:
        return this.handleBrainstorm(ticket);
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
    if (!activePhase.claudeSessionUuid) {
      throw new Error(`Phase ${activePhase.phaseName} has no Claude session UUID to resume`);
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
    const phaseAgent = getAgent(activePhase.phaseName);
    const prompt = phaseAgent ? phaseAgent.buildFollowupPrompt(message) : `${message}${MARKER_TRAILER}`;
    const result = await this.spawnClaude(prompt, slotRoot, activePhase.claudeSessionUuid, {
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
      const next = this.nextPhase(activePhase.phaseName);
      if (next) {
        log(`auto-advance ticket #${ticket.id} → ${next}`);
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
      log(`CREATED phase completed for ticket #${ticket.id} — auto-advancing to BRAINSTORM`);
      await this.trigger(ticket.id, TicketPhase.BRAINSTORM);
    }
  }

  protected async handleBrainstorm(ticket: Ticket): Promise<void> {
    log(`handleBrainstorm → ticket #${ticket.id}`);
    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const agent = getAgent(TicketPhase.BRAINSTORM);
    if (!agent) throw new Error("No agent configured for BRAINSTORM");
    const prompt = agent.buildPrompt({ ticketContent });

    await this.runPhase(ticket, TicketPhase.BRAINSTORM, slotRoot, tmpDir, prompt, "brainstorm.md");
  }

  protected async handlePlanning(ticket: Ticket): Promise<void> {
    log(`handlePlanning → ticket #${ticket.id}`);
    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const brainstormPath = join(tmpDir, "brainstorm.md");
    const brainstormContent = existsSync(brainstormPath)
      ? readFileSync(brainstormPath, "utf-8")
      : "";

    if (!brainstormContent) {
      log(`WARN: brainstorm.md not found for ticket #${ticket.id} — planning without it`);
    }

    const agent = getAgent(TicketPhase.PLANNING);
    if (!agent) throw new Error("No agent configured for PLANNING");
    const prompt = agent.buildPrompt({ ticketContent, brainstormContent });

    await this.runPhase(ticket, TicketPhase.PLANNING, slotRoot, tmpDir, prompt, "planning.md");
  }

  protected async handleImplementation(ticket: Ticket): Promise<void> {
    log(`handleImplementation → ticket #${ticket.id}`);
    const { slotRoot, tmpDir } = await this.resolveWorkspace(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const brainstormPath = join(tmpDir, "brainstorm.md");
    const planningPath = join(tmpDir, "planning.md");

    const brainstormContent = existsSync(brainstormPath)
      ? readFileSync(brainstormPath, "utf-8")
      : "";
    const planningContent = existsSync(planningPath)
      ? readFileSync(planningPath, "utf-8")
      : "";

    if (!brainstormContent) log(`WARN: brainstorm.md not found for ticket #${ticket.id}`);
    if (!planningContent) log(`WARN: planning.md not found for ticket #${ticket.id}`);

    const agent = getAgent(TicketPhase.IMPLEMENTATION);
    if (!agent) throw new Error("No agent configured for IMPLEMENTATION");
    const prompt = agent.buildPrompt({
      ticketContent,
      brainstormContent,
      planningContent,
    });

    await this.runPhase(ticket, TicketPhase.IMPLEMENTATION, slotRoot, tmpDir, prompt, "implementation.md");
  }

  protected async handleShip(ticket: Ticket): Promise<void> {
    log(`handleShip → ticket #${ticket.id}`);

    if (ticket.slotId == null) {
      log(`ticket #${ticket.id} has no slot — nothing to release`);
      return;
    }

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) {
      log(`WARN: slot ${ticket.slotId} not found`);
      return;
    }

    log(`releasing slot ${slot.id} (${slot.name}) for ticket #${ticket.id}`);
    const slotService = new SlotService();
    await slotService.releaseAndPromoteQueue(slot);

    // Mark the SHIP phase completed once the slot is released.
    const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
    if (activePhase) {
      await this.updatePhase(activePhase.id, {
        status: PhaseStatus.COMPLETED,
        completedAt: new Date(),
      });
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

    log(`spawning claude for ${phaseName.toLowerCase()} (resume=${activePhase.claudeSessionUuid ?? "none"})`);
    const result = await this.spawnClaude(prompt, slotRoot, activePhase.claudeSessionUuid, {
      ticketId: ticket.id,
      uid: ticket.uid!,
      phaseName,
    });

    writeFileSync(join(tmpDir, outputFile), result.output);
    log(`${phaseName.toLowerCase()} output → ${join(tmpDir, outputFile)} (status=${result.status})`);

    await this.applyResultToPhase(activePhase, result);

    if (result.status === PhaseStatus.COMPLETED) {
      const next = this.nextPhase(phaseName);
      if (next) {
        log(`auto-advance ticket #${ticket.id} → ${next}`);
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
      claudeSessionUuid: result.sessionUuid ?? activePhase.claudeSessionUuid ?? null,
      completedAt: result.status === PhaseStatus.COMPLETED ? new Date() : null,
    });
  }

  private nextPhase(current: TicketPhase): TicketPhase | null {
    switch (current) {
      case TicketPhase.BRAINSTORM:
        return TicketPhase.PLANNING;
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
      case TicketPhase.BRAINSTORM:
        return "brainstorm.md";
      case TicketPhase.PLANNING:
        return "planning.md";
      case TicketPhase.IMPLEMENTATION:
        return "implementation.md";
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

  private spawnClaude(
    prompt: string,
    cwd: string,
    resumeUuid?: string | null,
    logContext?: { ticketId: number; uid: string; phaseName: TicketPhase },
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const resuming = !!resumeUuid;
      const args = resuming
        ? ["-p", prompt, "--resume", resumeUuid!, "--output-format", "stream-json", "--verbose"]
        : ["-p", prompt, "--output-format", "stream-json", "--verbose"];

      log(`claude spawn: ${resuming ? `--resume ${resumeUuid}` : "new session"} cwd=${cwd}`);

      let logFile: string | null = null;
      let stderrFile: string | null = null;
      if (logContext) {
        const logDir = getLogDir(logContext.uid);
        mkdirSync(logDir, { recursive: true });
        logFile = getLogFile(logContext.uid, logContext.phaseName);
        stderrFile = getStderrFile(logContext.uid, logContext.phaseName);
        // Mark the start of a new run so readers can distinguish resumptions.
        appendFileSync(
          logFile,
          JSON.stringify({
            type: "_tribe.run_start",
            at: new Date().toISOString(),
            resumeUuid: resumeUuid ?? null,
          }) + "\n",
        );
      }

      const persistEvent = (evt: unknown) => {
        if (!logContext || !logFile) return;
        try {
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
      };

      const proc = spawn("claude", args, {
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
        try {
          const evt = JSON.parse(line);
          if (typeof evt.session_id === "string" && !sessionUuid) {
            sessionUuid = evt.session_id;
          }
          // Accumulate assistant text. stream-json shapes vary by CLI version;
          // handle the common ones defensively.
          if (evt.type === "assistant" && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block?.type === "text" && typeof block.text === "string") {
                output += block.text;
              }
            }
          } else if (evt.type === "result" && typeof evt.result === "string") {
            // Final consolidated text — prefer it if we haven't already captured content.
            if (!output) output = evt.result;
          }
          persistEvent(evt);
        } catch {
          // Not JSON — treat as plain text chunk (fallback for CLI that ignored the flag).
          output += line + "\n";
          persistEvent({ type: "raw", text: line });
        }
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
        log(`claude timeout after ${SPAWN_TIMEOUT_MS}ms — killing process`);
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5000);
        timedOut = true;
      }, SPAWN_TIMEOUT_MS);

      let timedOut = false;

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (stdoutBuf.trim()) consumeLine(stdoutBuf);
        log(`claude exited with code ${code} (sessionUuid=${sessionUuid ?? "none"})`);

        if (timedOut) {
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
            message = (stderr.trim() || `claude exited with code ${code}`).slice(-2000);
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
        log(`claude process error: ${err.message}`);
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
