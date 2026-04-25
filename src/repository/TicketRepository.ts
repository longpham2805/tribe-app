import { In, Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import { CliType } from "../enum/CliType";
import { TicketStatus } from "../enum/TicketStatus";

export interface BoardTicketsPage {
  nonDoneTickets: Ticket[];
  doneTickets: Ticket[];
  donePage: number;
  donePageSize: number;
  doneTotal: number;
  doneHasMore: boolean;
}

const DONE_PAGE_SIZE = 10;

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

  async findBoardTickets(opts?: { projectId?: number; donePage?: number }): Promise<BoardTicketsPage> {
    const donePage = Math.max(opts?.donePage ?? 1, 1);
    const offset = (donePage - 1) * DONE_PAGE_SIZE;
    const projectFilter = opts?.projectId != null ? { projectId: opts.projectId } : {};

    const [nonDoneTickets, doneTickets, doneTotal] = await Promise.all([
      this.repo.find({
        where: { isDone: false, ...projectFilter },
        relations: ["phases"],
        order: { createdAt: "DESC", id: "DESC" },
      }),
      this.repo.find({
        where: { isDone: true, ...projectFilter },
        relations: ["phases"],
        order: { createdAt: "DESC", id: "DESC" },
        skip: offset,
        take: DONE_PAGE_SIZE,
      }),
      this.repo.count({ where: { isDone: true, ...projectFilter } }),
    ]);

    return {
      nonDoneTickets,
      doneTickets,
      donePage,
      donePageSize: DONE_PAGE_SIZE,
      doneTotal,
      doneHasMore: offset + doneTickets.length < doneTotal,
    };
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
    status?: TicketStatus;
  }): Promise<Ticket> {
    const ticket = this.repo.create({
      title: data.title,
      description: data.description ?? null,
      mondayItemId: data.mondayItemId ?? null,
      mondayBoardId: data.mondayBoardId ?? null,
      mondayMarkdown: data.mondayMarkdown ?? null,
      projectId: data.projectId ?? null,
      cliType: data.cliType ?? CliType.CLAUDE,
      status: data.status ?? TicketStatus.READY,
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
      isDone?: boolean;
      status?: TicketStatus;
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
    if (data.isDone !== undefined) ticket.isDone = data.isDone;
    if (data.status !== undefined) ticket.status = data.status;

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
  async findOldestWaiting(
    projectId?: number,
    opts?: { cliTypes?: CliType[] },
  ): Promise<Ticket | null> {
    if (opts?.cliTypes && opts.cliTypes.length === 0) return null;

    return this.repo.findOne({
      where: {
        waitingForSlot: true,
        status: TicketStatus.READY,
        ...(projectId != null ? { projectId } : {}),
        ...(opts?.cliTypes ? { cliType: In(opts.cliTypes) } : {}),
      },
      order: { createdAt: "ASC" },
    });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
