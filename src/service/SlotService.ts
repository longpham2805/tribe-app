import { execSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { Slot } from "../entity/Slot";
import { Ticket } from "../entity/Ticket";
import { SlotRepository } from "../repository/SlotRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseHandler } from "../handler/PhaseHandler";

export class SlotService {
  private slotRepo: SlotRepository;
  private ticketRepo: TicketRepository;

  constructor() {
    this.slotRepo = new SlotRepository();
    this.ticketRepo = new TicketRepository();
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

    return freeSlot;
  }

  /**
   * Run git reset on every repo found inside the slot's rootPath.
   * Discovers repos automatically by checking for a `.git` directory in each
   * immediate subdirectory — so adding new repos to the workspace just works.
   */
  gitReset(slot: Slot): void {
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
          `git -C "${repoPath}" reset --hard origin/dev`,
          { stdio: "inherit" }
        );
        console.log(`[SlotService] Reset "${repoPath}" to origin/dev`);
      } catch (err) {
        console.error(`[SlotService] git reset failed for "${repoPath}":`, err);
      }
    }
  }

  /**
   * Release a slot after a ticket's SHIP phase completes:
   * 1. Run git reset on the slot repos.
   * 2. Free the slot.
   * 3. Find the oldest queued ticket and assign the slot to it.
   */
  async releaseAndPromoteQueue(slot: Slot): Promise<void> {
    // 1. Clean the workspace
    this.gitReset(slot);

    // 2. Release the slot
    await this.slotRepo.release(slot.id);

    // 3. Promote the next waiting ticket (FIFO — oldest createdAt first, same project)
    const nextTicket = await this.ticketRepo.findOldestWaiting(slot.projectId ?? undefined);
    if (!nextTicket) return;

    await this.slotRepo.assign(slot.id, nextTicket.id);
    await this.ticketRepo.updateSlotFields(nextTicket.id, {
      slotId: slot.id,
      waitingForSlot: false,
    });

    console.log(
      `[SlotService] Slot ${slot.id} promoted to waiting ticket #${nextTicket.id}`
    );

    // Now that the slot is assigned, set up the workspace for the promoted ticket
    try {
      const promotedTicket = await this.ticketRepo.findById(nextTicket.id);
      if (promotedTicket) {
        const handler = new PhaseHandler();
        await handler.initCreated(promotedTicket);
      }
    } catch (err) {
      console.error("[SlotService] handleCreated failed for promoted ticket:", err);
    }
  }
}
