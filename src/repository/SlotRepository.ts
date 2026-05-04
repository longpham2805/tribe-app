import { IsNull, Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Slot } from "../entity/Slot";

export class SlotRepository {
  private repo: Repository<Slot>;

  constructor() {
    this.repo = AppDataSource.getRepository(Slot);
  }

  async findAll(opts?: { projectId?: number }): Promise<Slot[]> {
    return this.repo.find({
      where: opts?.projectId != null ? { projectId: opts.projectId } : {},
      order: { id: "ASC" },
    });
  }

  async findById(id: number): Promise<Slot | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Returns the first free slot for the given project, ordered by id. */
  async findFreeSlot(projectId?: number): Promise<Slot | null> {
    return this.repo.findOne({
      where: {
        currentTicketId: IsNull(),
        disabled: false,
        ...(projectId != null ? { projectId } : {}),
      },
      order: { id: "ASC" },
    });
  }

  /** Returns all free, non-disabled slots for the given project, ordered by id. */
  async findFreeSlots(projectId?: number): Promise<Slot[]> {
    return this.repo.find({
      where: {
        currentTicketId: IsNull(),
        disabled: false,
        ...(projectId != null ? { projectId } : {}),
      },
      order: { id: "ASC" },
    });
  }

  async create(data: { name: string; rootPath: string; projectId?: number | null }): Promise<Slot> {
    const slot = this.repo.create({
      name: data.name,
      rootPath: data.rootPath,
      projectId: data.projectId ?? null,
      currentTicketId: null,
      disabled: false,
    });
    return this.repo.save(slot);
  }

  async update(
    id: number,
    data: { name?: string; rootPath?: string; projectId?: number | null; disabled?: boolean }
  ): Promise<Slot | null> {
    const slot = await this.findById(id);
    if (!slot) return null;
    if (data.name !== undefined) slot.name = data.name;
    if (data.rootPath !== undefined) slot.rootPath = data.rootPath;
    if (data.projectId !== undefined) slot.projectId = data.projectId;
    if (data.disabled !== undefined) slot.disabled = data.disabled;
    return this.repo.save(slot);
  }

  /** Assign a ticket to this slot. */
  async assign(slotId: number, ticketId: number): Promise<void> {
    await this.repo.update(slotId, { currentTicketId: ticketId });
  }

  /** Free this slot (set currentTicketId = null). */
  async release(slotId: number): Promise<void> {
    await this.repo.update(slotId, { currentTicketId: null });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
