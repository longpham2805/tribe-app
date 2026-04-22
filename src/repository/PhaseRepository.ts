import { IsNull, Not, Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";

export class PhaseRepository {
  private repo: Repository<Phase>;

  constructor() {
    this.repo = AppDataSource.getRepository(Phase);
  }

  async findAll(): Promise<Phase[]> {
    return this.repo.find({ relations: ["ticket"], order: { id: "DESC" } });
  }

  async findById(id: number): Promise<Phase | null> {
    return this.repo.findOne({ where: { id }, relations: ["ticket"] });
  }

  async findByTicketId(ticketId: number): Promise<Phase[]> {
    return this.repo.find({
      where: { ticketId },
      order: { id: "ASC" },
    });
  }

  async findActiveByTicketId(ticketId: number): Promise<Phase | null> {
    return this.repo.findOne({
      where: { ticketId, startedAt: Not(IsNull()), completedAt: IsNull() },
      order: { startedAt: "DESC" },
    });
  }

  async findPendingByTicketIdAndName(
    ticketId: number,
    phaseName: TicketPhase
  ): Promise<Phase | null> {
    return this.repo.findOne({
      where: { ticketId, phaseName, startedAt: IsNull() },
    });
  }

  async create(data: {
    ticketId: number;
    phaseName: TicketPhase;
    startedAt?: Date | null;
  }): Promise<Phase> {
    const phase = this.repo.create({
      ticketId: data.ticketId,
      phaseName: data.phaseName,
      startedAt: data.startedAt !== undefined ? data.startedAt : new Date(),
      completedAt: null,
    });
    return this.repo.save(phase);
  }

  async activate(id: number): Promise<Phase | null> {
    return this.update(id, { startedAt: new Date() });
  }

  async update(
    id: number,
    data: {
      phaseName?: TicketPhase;
      startedAt?: Date | null;
      completedAt?: Date | null;
      status?: PhaseStatus;
      lastMessage?: string | null;
      claudeSessionUuid?: string | null;
    }
  ): Promise<Phase | null> {
    const phase = await this.findById(id);
    if (!phase) return null;

    if (data.phaseName !== undefined) phase.phaseName = data.phaseName;
    if (data.startedAt !== undefined) phase.startedAt = data.startedAt;
    if (data.completedAt !== undefined) phase.completedAt = data.completedAt;
    if (data.status !== undefined) phase.status = data.status;
    if (data.lastMessage !== undefined) phase.lastMessage = data.lastMessage;
    if (data.claudeSessionUuid !== undefined) phase.claudeSessionUuid = data.claudeSessionUuid;

    return this.repo.save(phase);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
