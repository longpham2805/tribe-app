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
      order: { sequence: "DESC", startedAt: "DESC", id: "DESC" },
    });
  }

  async findLatestPendingByTicketId(ticketId: number): Promise<Phase | null> {
    return this.repo.findOne({
      where: { ticketId, startedAt: IsNull() },
      order: { sequence: "DESC", id: "DESC" },
    });
  }

  async findPendingByTicketIdAndName(
    ticketId: number,
    phaseName: TicketPhase
  ): Promise<Phase | null> {
    return this.repo.findOne({
      where: { ticketId, phaseName, startedAt: IsNull() },
      order: { sequence: "DESC", id: "DESC" },
    });
  }

  async findMaxSequenceByTicketIdAndName(
    ticketId: number,
    phaseName: TicketPhase
  ): Promise<number> {
    const row = await this.repo
      .createQueryBuilder("phase")
      .select("MAX(phase.sequence)", "max")
      .where("phase.ticketId = :ticketId", { ticketId })
      .andWhere("phase.phaseName = :phaseName", { phaseName })
      .getRawOne<{ max: string | number | null }>();

    const max = row?.max == null ? -1 : Number(row.max);
    return Number.isFinite(max) ? max : -1;
  }

  async create(data: {
    ticketId: number;
    phaseName: TicketPhase;
    startedAt?: Date | null;
    status?: PhaseStatus;
    sequence?: number;
    feedbackComment?: string | null;
    branchName?: string | null;
    pullRequests?: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
  }): Promise<Phase> {
    const phase = this.repo.create({
      ticketId: data.ticketId,
      phaseName: data.phaseName,
      sequence: data.sequence ?? 0,
      feedbackComment: data.feedbackComment ?? null,
      branchName: data.branchName ?? null,
      pullRequests: data.pullRequests ?? null,
      startedAt: data.startedAt !== undefined ? data.startedAt : new Date(),
      completedAt: null,
      status: data.status ?? PhaseStatus.PENDING,
    });
    return this.repo.save(phase);
  }

  async activate(id: number): Promise<Phase | null> {
    return this.update(id, { startedAt: new Date() });
  }

  async markRunningIfNotRunning(id: number): Promise<Phase | null> {
    const result = await this.repo.update(
      { id, status: Not(PhaseStatus.RUNNING), completedAt: IsNull() },
      { status: PhaseStatus.RUNNING },
    );

    if ((result.affected ?? 0) === 0) return null;
    return this.findById(id);
  }

  async update(
    id: number,
    data: {
      phaseName?: TicketPhase;
      startedAt?: Date | null;
      completedAt?: Date | null;
      status?: PhaseStatus;
      lastMessage?: string | null;
      cliSessionId?: string | null;
      sequence?: number;
      feedbackComment?: string | null;
      branchName?: string | null;
      pullRequests?: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
    }
  ): Promise<Phase | null> {
    const phase = await this.findById(id);
    if (!phase) return null;

    if (data.phaseName !== undefined) phase.phaseName = data.phaseName;
    if (data.startedAt !== undefined) phase.startedAt = data.startedAt;
    if (data.completedAt !== undefined) phase.completedAt = data.completedAt;
    if (data.status !== undefined) phase.status = data.status;
    if (data.lastMessage !== undefined) phase.lastMessage = data.lastMessage;
    if (data.cliSessionId !== undefined) phase.cliSessionId = data.cliSessionId;
    if (data.sequence !== undefined) phase.sequence = data.sequence;
    if (data.feedbackComment !== undefined) phase.feedbackComment = data.feedbackComment;
    if (data.branchName !== undefined) phase.branchName = data.branchName;
    if (data.pullRequests !== undefined) phase.pullRequests = data.pullRequests;

    return this.repo.save(phase);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
