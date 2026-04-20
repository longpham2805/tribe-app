import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";

export class PhaseRepository {
  private repo: Repository<Phase>;

  constructor() {
    this.repo = AppDataSource.getRepository(Phase);
  }

  async findAll(): Promise<Phase[]> {
    return this.repo.find({ relations: ["ticket"], order: { startedAt: "DESC" } });
  }

  async findById(id: number): Promise<Phase | null> {
    return this.repo.findOne({ where: { id }, relations: ["ticket"] });
  }

  async findByTicketId(ticketId: number): Promise<Phase[]> {
    return this.repo.find({
      where: { ticketId },
      order: { startedAt: "ASC" },
    });
  }

  async findActiveByTicketId(ticketId: number): Promise<Phase | null> {
    return this.repo.findOne({
      where: { ticketId, completedAt: undefined },
      order: { startedAt: "DESC" },
    });
  }

  async create(data: {
    ticketId: number;
    phaseName: TicketPhase;
    startedAt?: Date;
  }): Promise<Phase> {
    const phase = this.repo.create({
      ticketId: data.ticketId,
      phaseName: data.phaseName,
      startedAt: data.startedAt ?? new Date(),
      completedAt: null,
    });
    return this.repo.save(phase);
  }

  async update(
    id: number,
    data: { phaseName?: TicketPhase; startedAt?: Date; completedAt?: Date | null }
  ): Promise<Phase | null> {
    const phase = await this.findById(id);
    if (!phase) return null;

    if (data.phaseName !== undefined) phase.phaseName = data.phaseName;
    if (data.startedAt !== undefined) phase.startedAt = data.startedAt;
    if (data.completedAt !== undefined) phase.completedAt = data.completedAt;

    return this.repo.save(phase);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
