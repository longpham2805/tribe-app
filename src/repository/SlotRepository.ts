import { IsNull, Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Slot } from "../entity/Slot";

export class SlotRepository {
  private repo: Repository<Slot>;

  constructor() {
    this.repo = AppDataSource.getRepository(Slot);
  }

  async findAll(): Promise<Slot[]> {
    return this.repo.find({ order: { id: "ASC" } });
  }

  async findById(id: number): Promise<Slot | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Returns the first free slot (no ticket assigned), ordered by id. */
  async findFreeSlot(): Promise<Slot | null> {
    return this.repo.findOne({
      where: { currentTicketId: IsNull() },
      order: { id: "ASC" },
    });
  }

  async create(data: { name: string; rootPath: string }): Promise<Slot> {
    const slot = this.repo.create({
      name: data.name,
      rootPath: data.rootPath,
      currentTicketId: null,
    });
    return this.repo.save(slot);
  }

  async update(
    id: number,
    data: { name?: string; rootPath?: string }
  ): Promise<Slot | null> {
    const slot = await this.findById(id);
    if (!slot) return null;
    if (data.name !== undefined) slot.name = data.name;
    if (data.rootPath !== undefined) slot.rootPath = data.rootPath;
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
