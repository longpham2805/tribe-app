import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import { CliType } from "../enum/CliType";

export class TicketRepository {
  private repo: Repository<Ticket>;

  constructor() {
    this.repo = AppDataSource.getRepository(Ticket);
  }

  async findAll(opts?: { projectId?: number }): Promise<Ticket[]> {
    return this.repo.find({
      where: opts?.projectId != null ? { projectId: opts.projectId } : {},
      relations: ["phases"],
      order: { createdAt: "DESC" },
    });
  }

  async findById(id: number): Promise<Ticket | null> {
    return this.repo.findOne({ where: { id }, relations: ["phases"] });
  }

  async findByPhase(phase: TicketPhase, opts?: { projectId?: number }): Promise<Ticket[]> {
    return this.repo.find({
      where: {
        currentPhase: phase,
        ...(opts?.projectId != null ? { projectId: opts.projectId } : {}),
      },
      relations: ["phases"],
      order: { createdAt: "DESC" },
    });
  }

  async findByMondayItemId(mondayItemId: string): Promise<Ticket | null> {
    return this.repo.findOne({
      where: { mondayItemId },
      relations: ["phases"],
    });
  }

  async create(data: {
    title: string;
    description?: string;
    mondayItemId?: string;
    mondayBoardId?: number;
    mondayMarkdown?: string;
    projectId?: number | null;
    cliType?: CliType;
  }): Promise<Ticket> {
    const ticket = this.repo.create({
      title: data.title,
      description: data.description ?? null,
      mondayItemId: data.mondayItemId ?? null,
      mondayBoardId: data.mondayBoardId ?? null,
      mondayMarkdown: data.mondayMarkdown ?? null,
      projectId: data.projectId ?? null,
      cliType: data.cliType ?? CliType.CLAUDE,
      currentPhase: TicketPhase.CREATED,
    });
    return this.repo.save(ticket);
  }

  async findLastCreated(): Promise<Ticket | null> {
    return this.repo.findOne({ order: { createdAt: "DESC" } });
  }

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      currentPhase?: TicketPhase;
      mondayItemId?: string;
      mondayBoardId?: number;
      mondayMarkdown?: string;
      uid?: string;
      branchName?: string | null;
      pullRequests?: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
    }
  ): Promise<Ticket | null> {
    const ticket = await this.findById(id);
    if (!ticket) return null;

    if (data.title !== undefined) ticket.title = data.title;
    if (data.description !== undefined) ticket.description = data.description;
    if (data.currentPhase !== undefined) ticket.currentPhase = data.currentPhase;
    if (data.mondayItemId !== undefined) ticket.mondayItemId = data.mondayItemId;
    if (data.mondayBoardId !== undefined) ticket.mondayBoardId = data.mondayBoardId;
    if (data.mondayMarkdown !== undefined) ticket.mondayMarkdown = data.mondayMarkdown;
    if (data.uid !== undefined) ticket.uid = data.uid;
    if (data.branchName !== undefined) ticket.branchName = data.branchName;
    if (data.pullRequests !== undefined) ticket.pullRequests = data.pullRequests;

    return this.repo.save(ticket);
  }

  /** Update slot assignment fields directly (avoids loading relations). */
  async updateSlotFields(
    id: number,
    data: { slotId: number | null; waitingForSlot: boolean }
  ): Promise<void> {
    await this.repo.update(id, {
      slotId: data.slotId,
      waitingForSlot: data.waitingForSlot,
    });
  }

  /** Find the oldest ticket currently waiting for a slot (FIFO), scoped to a project. */
  async findOldestWaiting(projectId?: number): Promise<Ticket | null> {
    return this.repo.findOne({
      where: {
        waitingForSlot: true,
        ...(projectId != null ? { projectId } : {}),
      },
      order: { createdAt: "ASC" },
    });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
