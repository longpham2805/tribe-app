import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { PhaseStatus } from "../enum/PhaseStatus";
import { Phase } from "../entity/Phase";
import { Project } from "../entity/Project";
import { Ticket } from "../entity/Ticket";

export type ProjectWithActivity = Project & {
  ticketCount: number;
  runningTicketCount: number;
  hasRunningTickets: boolean;
};

type ProjectActivityRow = {
  project_id: number | string;
  project_name: string;
  project_slug: string | null;
  project_mondayBoardIds: number[] | string | null;
  project_mondayDefaultPersonId: string | null;
  project_mondayDevPeople: string[] | string | null;
  project_primaryColor: string | null;
  project_actionColor: string | null;
  project_createdAt: Date | string;
  project_updatedAt: Date | string;
  ticketCount?: number | string;
  runningTicketCount?: number | string;
};

export class ProjectRepository {
  private repo: Repository<Project>;

  constructor() {
    this.repo = AppDataSource.getRepository(Project);
  }

  async findAll(): Promise<Project[]> {
    return this.repo.find({ order: { id: "ASC" } });
  }

  async findAllWithActivity(): Promise<ProjectWithActivity[]> {
    const raw = await this.createProjectActivityQuery()
      .orderBy("project.id", "ASC")
      .getRawMany<ProjectActivityRow>();

    return this.mapProjectsWithActivity(raw);
  }

  async findById(id: number): Promise<Project | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdWithActivity(id: number): Promise<ProjectWithActivity | null> {
    const raw = await this.createProjectActivityQuery()
      .where("project.id = :id", { id })
      .getRawOne<ProjectActivityRow>();

    if (!raw) return null;
    return this.attachActivity(raw);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    return this.repo.findOne({ where: { slug } });
  }

  private createProjectActivityQuery() {
    return this.repo
      .createQueryBuilder("project")
      .select("project")
      .addSelect("project.id", "project_id")
      .addSelect(
        (subQuery) => subQuery
          .select("COUNT(ticket.id)")
          .from(Ticket, "ticket")
          .where("ticket.projectId = project.id"),
        "ticketCount",
      )
      .addSelect(
        (subQuery) => subQuery
          .select("COUNT(DISTINCT ticket.id)")
          .from(Ticket, "ticket")
          .innerJoin(Phase, "phase", "phase.ticket_id = ticket.id")
          .where("ticket.projectId = project.id")
          .andWhere("phase.status = :runningStatus", { runningStatus: PhaseStatus.RUNNING }),
        "runningTicketCount",
      );
  }

  private mapProjectsWithActivity(rows: ProjectActivityRow[]): ProjectWithActivity[] {
    return rows.map((row) => this.attachActivity(row));
  }

  private attachActivity(raw: ProjectActivityRow): ProjectWithActivity {
    const projectId = Number(raw.project_id);
    const project = new Project();
    project.id = projectId;
    project.name = String(raw.project_name);
    project.slug = raw.project_slug == null ? null : String(raw.project_slug);
    project.mondayBoardIds = Array.isArray(raw.project_mondayBoardIds)
      ? raw.project_mondayBoardIds as number[]
      : raw.project_mondayBoardIds == null
        ? null
        : JSON.parse(String(raw.project_mondayBoardIds)) as number[];
    project.mondayDefaultPersonId = raw.project_mondayDefaultPersonId == null ? null : String(raw.project_mondayDefaultPersonId);
    project.mondayDevPeople = Array.isArray(raw.project_mondayDevPeople)
      ? raw.project_mondayDevPeople as string[]
      : raw.project_mondayDevPeople == null
        ? null
        : JSON.parse(String(raw.project_mondayDevPeople)) as string[];
    project.primaryColor = raw.project_primaryColor == null ? null : String(raw.project_primaryColor);
    project.actionColor = raw.project_actionColor == null ? null : String(raw.project_actionColor);
    project.createdAt = new Date(String(raw.project_createdAt));
    project.updatedAt = new Date(String(raw.project_updatedAt));
    const ticketCount = Number(raw.ticketCount ?? 0);
    const runningTicketCount = Number(raw.runningTicketCount ?? 0);

    return {
      ...project,
      ticketCount,
      runningTicketCount,
      hasRunningTickets: runningTicketCount > 0,
    };
  }

  async create(data: {
    name: string;
    slug?: string | null;
    mondayBoardIds?: number[] | null;
    mondayDefaultPersonId?: string | null;
    mondayDevPeople?: string[] | null;
    primaryColor?: string | null;
    actionColor?: string | null;
  }): Promise<Project> {
    const project = this.repo.create({
      name: data.name,
      slug: data.slug ?? null,
      mondayBoardIds: data.mondayBoardIds ?? null,
      mondayDefaultPersonId: data.mondayDefaultPersonId ?? null,
      mondayDevPeople: data.mondayDevPeople ?? null,
      primaryColor: data.primaryColor ?? null,
      actionColor: data.actionColor ?? null,
    });
    return this.repo.save(project);
  }

  async update(
    id: number,
    data: {
      name?: string;
      slug?: string | null;
      mondayBoardIds?: number[] | null;
      mondayDefaultPersonId?: string | null;
      mondayDevPeople?: string[] | null;
      primaryColor?: string | null;
      actionColor?: string | null;
    },
  ): Promise<Project | null> {
    const project = await this.findById(id);
    if (!project) return null;

    if (data.name !== undefined) project.name = data.name;
    if (data.slug !== undefined) project.slug = data.slug;
    if (data.mondayBoardIds !== undefined) project.mondayBoardIds = data.mondayBoardIds;
    if (data.mondayDefaultPersonId !== undefined) project.mondayDefaultPersonId = data.mondayDefaultPersonId;
    if (data.mondayDevPeople !== undefined) project.mondayDevPeople = data.mondayDevPeople;
    if (data.primaryColor !== undefined) project.primaryColor = data.primaryColor;
    if (data.actionColor !== undefined) project.actionColor = data.actionColor;

    return this.repo.save(project);
  }

  /** Rejects if the project still has tickets or slots. */
  async delete(id: number): Promise<{ ok: boolean; error?: string }> {
    const project = await this.repo.findOne({
      where: { id },
      relations: ["tickets", "slots"],
    });
    if (!project) return { ok: false, error: "Project not found" };
    if (project.tickets?.length > 0) {
      return { ok: false, error: `Cannot delete: project has ${project.tickets.length} ticket(s)` };
    }
    if (project.slots?.length > 0) {
      return { ok: false, error: `Cannot delete: project has ${project.slots.length} slot(s)` };
    }
    await this.repo.delete(id);
    return { ok: true };
  }
}
