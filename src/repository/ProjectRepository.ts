import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Project } from "../entity/Project";

export class ProjectRepository {
  private repo: Repository<Project>;

  constructor() {
    this.repo = AppDataSource.getRepository(Project);
  }

  async findAll(): Promise<Project[]> {
    return this.repo.find({ order: { id: "ASC" } });
  }

  async findById(id: number): Promise<Project | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Project | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async create(data: {
    name: string;
    slug?: string | null;
    mondayBoardIds?: number[] | null;
    mondayDefaultPersonId?: string | null;
    mondayDevPeople?: string[] | null;
  }): Promise<Project> {
    const project = this.repo.create({
      name: data.name,
      slug: data.slug ?? null,
      mondayBoardIds: data.mondayBoardIds ?? null,
      mondayDefaultPersonId: data.mondayDefaultPersonId ?? null,
      mondayDevPeople: data.mondayDevPeople ?? null,
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
    },
  ): Promise<Project | null> {
    const project = await this.findById(id);
    if (!project) return null;

    if (data.name !== undefined) project.name = data.name;
    if (data.slug !== undefined) project.slug = data.slug;
    if (data.mondayBoardIds !== undefined) project.mondayBoardIds = data.mondayBoardIds;
    if (data.mondayDefaultPersonId !== undefined) project.mondayDefaultPersonId = data.mondayDefaultPersonId;
    if (data.mondayDevPeople !== undefined) project.mondayDevPeople = data.mondayDevPeople;

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
