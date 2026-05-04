import { spawnSync } from "child_process";
import { readdirSync, existsSync, statSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
import { resolveGitBin } from "../lib/gitEnv";
import { Slot } from "../entity/Slot";
import { Ticket } from "../entity/Ticket";
import { SlotRepository } from "../repository/SlotRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { PhaseHandler } from "../handler/PhaseHandler";
import { TicketPhase } from "../enum/TicketPhase";

export class SlotService {
  private slotRepo: SlotRepository;
  private ticketRepo: TicketRepository;
  private appStateRepo: AppStateRepository;

  constructor() {
    this.slotRepo = new SlotRepository();
    this.ticketRepo = new TicketRepository();
    this.appStateRepo = new AppStateRepository();
  }

  /**
   * Try to assign a free slot to the given ticket.
   * Returns the assigned Slot, or null if all slots are occupied (ticket is queued).
   */
  async tryAssign(ticket: Ticket): Promise<Slot | null> {
    const freeSlot = await this.slotRepo.findFreeSlot(ticket.projectId ?? undefined);

    if (!freeSlot) {
      // No free slot — mark ticket as waiting
      console.log(`[SlotService] No enabled free slot for ticket #${ticket.id}`);
      await this.ticketRepo.updateSlotFields(ticket.id, {
        slotId: null,
        waitingForSlot: true,
      });
      return null;
    }

    this.ensureReposOnDev(freeSlot);

    // Assign slot → ticket and ticket → slot atomically (best-effort; single-server)
    await this.slotRepo.assign(freeSlot.id, ticket.id);
    await this.ticketRepo.updateSlotFields(ticket.id, {
      slotId: freeSlot.id,
      waitingForSlot: false,
    });

    return freeSlot;
  }

  /**
   * Ensure every child repo in the slot workspace is on `dev` and synced.
   * Discovers repos automatically by checking for a `.git` directory in each
   * immediate subdirectory — so adding new repos to the workspace just works.
   */
  ensureReposOnDev(slot: Slot): void {
    const rootPath = this.validateSlotRoot(slot);
    try {
      const entries = readdirSync(rootPath, { withFileTypes: true });
      const repoDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(rootPath, entry.name))
        .filter((dir) => this.isPathInside(dir, rootPath))
        .filter((dir) => existsSync(join(dir, ".git")));

      if (repoDirs.length === 0) {
        throw new Error(`Slot ${slot.id} rootPath has no child git repos: ${rootPath}`);
      }

      for (const repoPath of repoDirs) {
        this.discardDirtyIfNeeded(slot, repoPath);
        this.runGit(slot, repoPath, ["fetch", "origin"]);
        this.runGit(slot, repoPath, ["checkout", "dev"]);
        this.runGit(slot, repoPath, ["reset", "--hard", "origin/dev"]);
        this.runGit(slot, repoPath, ["clean", "-ffd"]);
        console.log(`[SlotService] Synced "${repoPath}" on dev`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[SlotService] Slot ${slot.id} git sync failed: ${message}`);
      throw err;
    }
  }

  private validateSlotRoot(slot: Slot): string {
    if (!slot.rootPath || !isAbsolute(slot.rootPath)) {
      throw new Error(`Slot ${slot.id} rootPath must be an absolute path: ${slot.rootPath || "<empty>"}`);
    }

    const rootPath = resolve(slot.rootPath);
    try {
      if (!statSync(rootPath).isDirectory()) {
        throw new Error(`Slot ${slot.id} rootPath is not a directory: ${rootPath}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("rootPath")) throw err;
      throw new Error(`Slot ${slot.id} rootPath is not readable: ${rootPath}`);
    }

    return rootPath;
  }

  private isPathInside(path: string, parentPath: string): boolean {
    const rel = relative(parentPath, path);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  }

  private discardDirtyIfNeeded(slot: Slot, repoPath: string): void {
    const result = this.runGit(slot, repoPath, ["status", "--porcelain"], false);
    const status = result.stdout.trim();
    if (status) {
      const summary = status.split("\n").slice(0, 10).join("; ");
      console.warn(`[SlotService] Slot ${slot.id} repo dirty before sync — discarding: ${repoPath} (${summary})`);
      this.runGit(slot, repoPath, ["reset", "--hard", "HEAD"]);
      this.runGit(slot, repoPath, ["clean", "-ffd"]);
    }
  }

  /**
   * Commit any uncommitted changes in the slot workspace and push to the current branch.
   * Used before releasing a slot mid-IMPLEMENTATION or mid-FEEDBACK so work is not lost.
   * Returns the branch name that was used (may update ticket.branchName if it was null).
   */
  async commitAndPushIfDirty(ticket: Ticket, slotRoot: string): Promise<void> {
    const rootPath = this.validateSlotRoot({ rootPath: slotRoot } as Slot);
    const entries = readdirSync(rootPath, { withFileTypes: true });
    const repoDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => resolve(rootPath, e.name))
      .filter((d) => this.isPathInside(d, rootPath))
      .filter((d) => existsSync(join(d, ".git")));

    for (const repoPath of repoDirs) {
      const status = this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["status", "--porcelain"], false).stdout.trim();
      if (!status) continue;

      const branch = this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["rev-parse", "--abbrev-ref", "HEAD"], false).stdout.trim();
      let workBranch = branch;

      if (branch === "dev" || branch === "HEAD") {
        workBranch = `tribe/ticket-${ticket.id}-wip`;
        this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["checkout", "-b", workBranch]);
      }

      this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["add", "-A"]);
      this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["commit", "-m", `WIP: ticket #${ticket.id} phase pause`]);
      this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["push", "origin", workBranch]);

      if (!ticket.branchName) {
        await this.ticketRepo.update(ticket.id, { branchName: workBranch });
        ticket.branchName = workBranch;
      }
    }
  }

  /**
   * Check out the given branch in all child repos of the slot workspace.
   * Called when resuming IMPLEMENTATION/FEEDBACK on a slot that was reset to dev.
   */
  checkoutBranch(slotRoot: string, branchName: string): void {
    const rootPath = this.validateSlotRoot({ rootPath: slotRoot } as Slot);
    const entries = readdirSync(rootPath, { withFileTypes: true });
    const repoDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => resolve(rootPath, e.name))
      .filter((d) => this.isPathInside(d, rootPath))
      .filter((d) => existsSync(join(d, ".git")));

    for (const repoPath of repoDirs) {
      this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["fetch", "origin"]);
      this.runGit({ rootPath: slotRoot } as Slot, repoPath, ["checkout", "-B", branchName, `origin/${branchName}`]);
    }
  }

  private runGit(slot: Slot, repoPath: string, args: string[], inheritOutput = true): { stdout: string; stderr: string } {
    const result = spawnSync(resolveGitBin(), ["-C", repoPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: inheritOutput ? ["ignore", "inherit", "pipe"] : ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });

    const command = `git -C ${repoPath} ${args.join(" ")}`;
    if (result.error) {
      throw new Error(`Slot ${slot.id} git command failed: ${command}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = String(result.stderr ?? "").trim().slice(-500);
      throw new Error(`Slot ${slot.id} git command failed (${result.status}): ${command}${stderr ? `: ${stderr}` : ""}`);
    }

    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  }

  /**
   * Release a slot after a ticket's SHIP phase completes:
   * 1. Sync the slot repos to the latest `dev`.
   * 2. Free the slot.
   * 3. Find the oldest queued ticket and assign the slot to it.
   */
  async releaseAndPromoteQueue(slot: Slot): Promise<void> {
    // 1. Clean the workspace
    this.ensureReposOnDev(slot);

    // 2. Release the slot and clear the old ticket's slotId
    if (slot.currentTicketId != null) {
      await this.ticketRepo.updateSlotFields(slot.currentTicketId, {
        slotId: null,
        waitingForSlot: false,
      });
    }
    await this.slotRepo.release(slot.id);

    await this.promoteToFreeSlot(slot);
  }

  /**
   * Promote the oldest waiting ticket to a slot that is already free.
   * No-ops if the slot is disabled, auto-trigger is paused, or no ticket is waiting.
   */
  private async promoteToFreeSlot(slot: Slot): Promise<void> {
    if (slot.disabled) {
      console.log(`[SlotService] Slot ${slot.id} disabled — skipping promotion`);
      return;
    }

    const appState = await this.appStateRepo.get();
    if (!appState.autoTriggerEnabled) {
      console.log(`[SlotService] Auto trigger paused — slot ${slot.id} skipping promotion`);
      return;
    }

    // Promote the next waiting ticket (FIFO — oldest createdAt first, same project)
    const nextTicket = await this.ticketRepo.findOldestWaiting(slot.projectId ?? undefined, {
      cliTypes: appState.availableCliTypes,
    });
    if (!nextTicket) return;

    this.ensureReposOnDev(slot);

    await this.slotRepo.assign(slot.id, nextTicket.id);
    await this.ticketRepo.updateSlotFields(nextTicket.id, {
      slotId: slot.id,
      waitingForSlot: false,
    });

    console.log(
      `[SlotService] Slot ${slot.id} promoted to waiting ticket #${nextTicket.id}`
    );

    // Now that the slot is assigned, continue the phase that caused the ticket to wait.
    try {
      const promotedTicket = await this.ticketRepo.findById(nextTicket.id);
      if (promotedTicket) {
        const handler = new PhaseHandler();
        const latestPending = await new PhaseRepository().findLatestPendingByTicketId(promotedTicket.id);
        const activePhase = await new PhaseRepository().findActiveByTicketId(promotedTicket.id);

        if (latestPending?.phaseName === TicketPhase.FEEDBACK) {
          await handler.trigger(promotedTicket.id, TicketPhase.FEEDBACK);
        } else if (
          promotedTicket.currentPhase === TicketPhase.PLANNING ||
          promotedTicket.currentPhase === TicketPhase.IMPLEMENTATION
        ) {
          // May have a pending user response (paused mid-phase waiting for slot to resume)
          // or may be waiting to start the phase fresh (slot was unavailable at phase entry)
          const applied = activePhase
            ? await handler.applyPendingResponseIfExists(promotedTicket, activePhase)
            : false;
          if (!applied) {
            if (promotedTicket.currentPhase === TicketPhase.PLANNING) {
              await handler.initPlanning(promotedTicket);
            } else {
              await handler.initImplementation(promotedTicket);
            }
          }
        } else {
          await handler.initCreated(promotedTicket);
        }
      }
    } catch (err) {
      console.error("[SlotService] promoted ticket handler failed:", err);
    }
  }

  /**
   * Promote waiting tickets to all currently free slots.
   * Called when auto-trigger is re-enabled or a slot is re-enabled.
   */
  async tryResumeQueue(projectId?: number): Promise<void> {
    const freeSlots = await this.slotRepo.findFreeSlots(projectId);
    for (const slot of freeSlots) {
      await this.promoteToFreeSlot(slot);
    }
  }
}
