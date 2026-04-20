import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";

export class TicketRepository {
  private repo: Repository<Ticket>;

  constructor() {
    this.repo = AppDataSource.getRepository(Ticket);
  }

  async findAll(): Promise<Ticket[]> {
    return this.repo.find({ relations: ["phases"], order: { createdAt: "DESC" } });
  }

  async findById(id: number): Promise<Ticket | null> {
    return this.repo.findOne({ where: { id }, relations: ["phases"] });
  }

  async findByPhase(phase: TicketPhase): Promise<Ticket[]> {
    return this.repo.find({
      where: { currentPhase: phase },
      relations: ["phases"],
      order: { createdAt: "DESC" },
    });
  }

  async create(data: { title: string; description?: string }): Promise<Ticket> {
    const ticket = this.repo.create({
      title: data.title,
      description: data.description ?? null,
      currentPhase: TicketPhase.CREATED,
    });
    return this.repo.save(ticket);
  }

  async update(
    id: number,
    data: { title?: string; description?: string; currentPhase?: TicketPhase }
  ): Promise<Ticket | null> {
    const ticket = await this.findById(id);
    if (!ticket) return null;

    if (data.title !== undefined) ticket.title = data.title;
    if (data.description !== undefined) ticket.description = data.description;
    if (data.currentPhase !== undefined) ticket.currentPhase = data.currentPhase;

    return this.repo.save(ticket);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
