import { spawnSync } from "child_process";
import { readdirSync, existsSync, statSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
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
        this.assertRepoClean(slot, repoPath);
        this.runGit(slot, repoPath, ["fetch", "origin"]);
        this.runGit(slot, repoPath, ["checkout", "dev"]);
        this.runGit(slot, repoPath, ["pull", "--ff-only", "origin", "dev"]);
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

  private assertRepoClean(slot: Slot, repoPath: string): void {
    const result = this.runGit(slot, repoPath, ["status", "--porcelain"], false);
    const status = result.stdout.trim();
    if (status) {
      const summary = status.split("\n").slice(0, 10).join("; ");
      throw new Error(`Slot ${slot.id} repo is dirty before sync: ${repoPath} (${summary})`);
    }
  }

  private runGit(slot: Slot, repoPath: string, args: string[], inheritOutput = true): { stdout: string; stderr: string } {
    const result = spawnSync("git", ["-C", repoPath, ...args], {
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

    const appState = await this.appStateRepo.get();
    if (!appState.autoTriggerEnabled) {
      console.log(`[SlotService] Auto trigger paused — slot ${slot.id} released without promotion`);
      return;
    }

    // 3. Promote the next waiting ticket (FIFO — oldest createdAt first, same project)
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
        if (latestPending?.phaseName === TicketPhase.FEEDBACK) {
          await handler.trigger(promotedTicket.id, TicketPhase.FEEDBACK);
        } else {
          await handler.initCreated(promotedTicket);
        }
      }
    } catch (err) {
      console.error("[SlotService] promoted ticket handler failed:", err);
    }
  }
}
