import { execSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
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

    // Assign slot → ticket and ticket → slot atomically (best-effort; single-server)
    await this.slotRepo.assign(freeSlot.id, ticket.id);
    await this.ticketRepo.updateSlotFields(ticket.id, {
      slotId: freeSlot.id,
      waitingForSlot: false,
    });
    this.ensureReposOnDev(freeSlot);

    return freeSlot;
  }

  /**
   * Ensure every child repo in the slot workspace is on `dev` and synced.
   * Discovers repos automatically by checking for a `.git` directory in each
   * immediate subdirectory — so adding new repos to the workspace just works.
   */
  ensureReposOnDev(slot: Slot): void {
    let entries;
    try {
      entries = readdirSync(slot.rootPath, { withFileTypes: true });
    } catch (err) {
      console.error(`[SlotService] Cannot read rootPath "${slot.rootPath}":`, err);
      return;
    }

    const repoDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => join(slot.rootPath, e.name))
      .filter((dir) => existsSync(join(dir, ".git")));

    if (repoDirs.length === 0) {
      console.warn(`[SlotService] No git repos found inside "${slot.rootPath}"`);
      return;
    }

    for (const repoPath of repoDirs) {
      try {
        execSync(
          `git -C "${repoPath}" fetch origin && ` +
          `git -C "${repoPath}" checkout dev && ` +
          `git -C "${repoPath}" pull --ff-only origin dev`,
          { stdio: "inherit" }
        );
        console.log(`[SlotService] Synced "${repoPath}" on dev`);
      } catch (err) {
        console.error(`[SlotService] git sync failed for "${repoPath}":`, err);
      }
    }
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

    await this.slotRepo.assign(slot.id, nextTicket.id);
    await this.ticketRepo.updateSlotFields(nextTicket.id, {
      slotId: slot.id,
      waitingForSlot: false,
    });
    this.ensureReposOnDev(slot);

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
