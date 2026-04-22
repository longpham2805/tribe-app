import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { TicketPhase } from "../enum/TicketPhase";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { SlotService } from "../service/SlotService";

const log = (msg: string) => console.log(`[PhaseHandler] ${msg}`);

export interface TriggerResult {
  ticket: Ticket;
  phase: Phase;
}

export class PhaseHandler {
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;

  constructor() {
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
  }

  async trigger(ticketId: number, phaseName: TicketPhase): Promise<TriggerResult> {
    log(`trigger → ticket #${ticketId} phase=${phaseName}`);

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (ticket.currentPhase !== phaseName) {
      const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
      if (activePhase) {
        log(`completing active phase ${activePhase.phaseName} for ticket #${ticketId}`);
        await this.phaseRepo.update(activePhase.id, { completedAt: new Date() });
      }

      const pending = await this.phaseRepo.findPendingByTicketIdAndName(ticketId, phaseName);
      if (pending) {
        log(`activating phase ${phaseName} for ticket #${ticketId}`);
        await this.phaseRepo.activate(pending.id);
      } else {
        log(`WARN: no pending phase ${phaseName} found for ticket #${ticketId}`);
      }

      await this.ticketRepo.update(ticketId, { currentPhase: phaseName });
      log(`ticket #${ticketId} currentPhase → ${phaseName}`);
    } else {
      log(`ticket #${ticketId} is already in phase ${phaseName}, re-running handler`);
    }

    const updatedTicket = (await this.ticketRepo.findById(ticketId))!;
    const activePhase = (await this.phaseRepo.findActiveByTicketId(ticketId))!;

    await this.dispatch(phaseName, updatedTicket);

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

  // ── Phase handlers ────────────────────────────────────────────────

  /** Public entry point for external callers (TicketSubscriber, SlotService). */
  async initCreated(ticket: Ticket): Promise<void> {
    return this.handleCreated(ticket);
  }

  protected async handleCreated(ticket: Ticket): Promise<void> {
    log(`handleCreated → ticket #${ticket.id} (uid=${ticket.uid ?? "none"})`);

    let uid = ticket.uid;
    if (!uid) {
      uid = randomUUID();
      await this.ticketRepo.update(ticket.id, { uid });
      ticket.uid = uid;
      log(`generated uid ${uid} for ticket #${ticket.id}`);
    }

    if (ticket.slotId == null) {
      log(`ticket #${ticket.id} has no slot yet — skipping workspace creation`);
      return;
    }

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) {
      log(`WARN: slot ${ticket.slotId} not found for ticket #${ticket.id}`);
      return;
    }

    const tmpDir = join(slot.rootPath, ".tribe", uid);
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
  }

  protected async handleBrainstorm(ticket: Ticket): Promise<void> {
    log(`handleBrainstorm → ticket #${ticket.id}`);
    const tmpDir = await this.resolveTmpDir(ticket);

    if (!existsSync(join(tmpDir, "ticket.md"))) {
      log(`ticket.md missing — running handleCreated first`);
      await this.handleCreated(ticket);
    }

    const ticketContent = readFileSync(join(tmpDir, "ticket.md"), "utf-8");
    const prompt =
      `You are handling the BRAINSTORM phase for the following ticket.\n\n` +
      `${ticketContent}\n\n` +
      `Brainstorm a wide set of approaches, trade-offs, and open questions. ` +
      `Output thorough markdown notes that will guide the planning phase.`;

    const sessionId = `${ticket.uid}-brainstorm`;
    log(`spawning claude for brainstorm (session: ${sessionId})`);
    const output = await this.spawnClaude(prompt, sessionId, tmpDir);
    writeFileSync(join(tmpDir, "brainstorm.md"), output);
    log(`brainstorm complete for ticket #${ticket.id} → ${tmpDir}/brainstorm.md`);
  }

  protected async handlePlanning(ticket: Ticket): Promise<void> {
    log(`handlePlanning → ticket #${ticket.id}`);
    const tmpDir = await this.resolveTmpDir(ticket);

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

    const prompt =
      `You are handling the PLANNING phase for the following ticket.\n\n` +
      `## Ticket\n\n${ticketContent}\n\n` +
      (brainstormContent ? `## Brainstorm Notes\n\n${brainstormContent}\n\n` : "") +
      `Produce a concrete, step-by-step implementation plan in markdown. ` +
      `Include file paths, function signatures, and acceptance criteria.`;

    const sessionId = `${ticket.uid}-planning`;
    log(`spawning claude for planning (session: ${sessionId})`);
    const output = await this.spawnClaude(prompt, sessionId, tmpDir);
    writeFileSync(join(tmpDir, "planning.md"), output);
    log(`planning complete for ticket #${ticket.id} → ${tmpDir}/planning.md`);
  }

  protected async handleImplementation(ticket: Ticket): Promise<void> {
    log(`handleImplementation → ticket #${ticket.id}`);
    const tmpDir = await this.resolveTmpDir(ticket);

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

    const prompt =
      `You are handling the IMPLEMENTATION phase for the following ticket.\n\n` +
      `## Ticket\n\n${ticketContent}\n\n` +
      (brainstormContent ? `## Brainstorm Notes\n\n${brainstormContent}\n\n` : "") +
      (planningContent ? `## Implementation Plan\n\n${planningContent}\n\n` : "") +
      `Execute the implementation plan. Write the code, make commits, and document ` +
      `what was done in a summary. Output an implementation report in markdown.`;

    const sessionId = `${ticket.uid}-implementation`;
    log(`spawning claude for implementation (session: ${sessionId})`);
    const output = await this.spawnClaude(prompt, sessionId, tmpDir);
    writeFileSync(join(tmpDir, "implementation.md"), output);
    log(`implementation complete for ticket #${ticket.id} → ${tmpDir}/implementation.md`);
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
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async resolveTmpDir(ticket: Ticket): Promise<string> {
    if (!ticket.uid) {
      throw new Error(`Ticket #${ticket.id} has no uid — workspace not initialized`);
    }
    if (ticket.slotId == null) {
      throw new Error(`Ticket #${ticket.id} has no slot assigned — assign a slot before triggering phases`);
    }

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) throw new Error(`Slot ${ticket.slotId} not found`);

    const tmpDir = join(slot.rootPath, ".tribe", ticket.uid);
    log(`tmpDir → ${tmpDir}`);
    return tmpDir;
  }

  private spawnClaude(prompt: string, sessionId: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const phaseName = sessionId.split("-").pop()!;
      const sessionFile = join(cwd, `${phaseName}.session`);
      const savedUuid = existsSync(sessionFile)
        ? readFileSync(sessionFile, "utf-8").trim()
        : null;

      const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s);
      const resuming = !!(savedUuid && isUuid(savedUuid));
      const args = resuming
        ? ["-p", prompt, "--resume", savedUuid!]
        : ["-p", prompt];

      log(`claude spawn: ${resuming ? `--resume ${savedUuid}` : "new session"} cwd=${cwd}`);

      const proc = spawn("claude", args, {
        cwd,
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env },
      });

      let output = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      proc.on("close", (code) => {
        log(`claude exited with code ${code} (session: ${sessionId})`);
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code} (session: ${sessionId})`));
          return;
        }
        if (!savedUuid || !isUuid(savedUuid)) {
          writeFileSync(sessionFile, sessionId);
        }
        resolve(output);
      });

      proc.on("error", (err) => {
        log(`claude process error: ${err.message}`);
        reject(err);
      });
    });
  }
}
