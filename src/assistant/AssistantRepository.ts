import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { AssistantMessage } from "../entity/AssistantMessage";
import { AssistantAction } from "../entity/AssistantAction";
import { AssistantSession } from "../entity/AssistantSession";
import type { ActionStatus, ActionType, ActionSource } from "../entity/AssistantAction";
import type { MessageRole, MessageSeverity } from "../entity/AssistantMessage";

export class AssistantMessageRepository {
  private repo: Repository<AssistantMessage>;

  constructor() {
    this.repo = AppDataSource.getRepository(AssistantMessage);
  }

  async create(data: {
    role: MessageRole;
    content: string;
    ticketId?: number | null;
    phaseId?: number | null;
    severity?: MessageSeverity;
    sourceEventKey?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<AssistantMessage> {
    const msg = this.repo.create({
      role: data.role,
      content: data.content,
      ticketId: data.ticketId ?? null,
      phaseId: data.phaseId ?? null,
      severity: data.severity ?? "info",
      sourceEventKey: data.sourceEventKey ?? null,
      metadata: data.metadata ?? null,
    });
    return this.repo.save(msg);
  }

  async findById(id: number): Promise<AssistantMessage | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findRecent(opts: {
    projectId?: number;
    ticketId?: number;
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<AssistantMessage[]> {
    const qb = this.repo.createQueryBuilder("m").orderBy("m.createdAt", "DESC");
    if (opts.ticketId != null) qb.andWhere("m.ticketId = :tid", { tid: opts.ticketId });
    if (opts.unreadOnly) qb.andWhere("m.readAt IS NULL");
    qb.limit(opts.limit ?? 100);
    return qb.getMany();
  }

  async markRead(id: number): Promise<void> {
    await this.repo.update(id, { readAt: new Date() });
  }

  async existsBySourceEventKey(key: string): Promise<boolean> {
    const count = await this.repo.count({ where: { sourceEventKey: key } });
    return count > 0;
  }
}

export class AssistantActionRepository {
  private repo: Repository<AssistantAction>;

  constructor() {
    this.repo = AppDataSource.getRepository(AssistantAction);
  }

  async create(data: {
    type: ActionType;
    status?: ActionStatus;
    payload?: Record<string, unknown> | null;
    reason?: string | null;
    confidence?: number | null;
    source?: ActionSource;
    fingerprint?: string | null;
    ticketId?: number | null;
    messageId?: number | null;
  }): Promise<AssistantAction> {
    const action = this.repo.create({
      type: data.type,
      status: data.status ?? "proposed",
      payload: data.payload ?? null,
      reason: data.reason ?? null,
      confidence: data.confidence ?? null,
      source: data.source ?? "auto",
      fingerprint: data.fingerprint ?? null,
      ticketId: data.ticketId ?? null,
      messageId: data.messageId ?? null,
    });
    return this.repo.save(action);
  }

  async findById(id: number): Promise<AssistantAction | null> {
    return this.repo.findOne({ where: { id } });
  }

  async updateStatus(id: number, status: ActionStatus, errorMessage?: string): Promise<void> {
    await this.repo.update(id, { status, ...(errorMessage ? { errorMessage } : {}) });
  }

  async existsByFingerprint(fingerprint: string): Promise<boolean> {
    const count = await this.repo.count({ where: { fingerprint } });
    return count > 0;
  }

  async findPending(): Promise<AssistantAction[]> {
    return this.repo.find({ where: { status: "proposed" }, order: { createdAt: "DESC" } });
  }
}

export class AssistantSessionRepository {
  private repo: Repository<AssistantSession>;

  constructor() {
    this.repo = AppDataSource.getRepository(AssistantSession);
  }

  async getOrCreate(): Promise<AssistantSession> {
    const existing = await this.repo.findOne({ where: {}, order: { id: "ASC" } });
    if (existing) return existing;
    const session = this.repo.create({ claudeSessionId: null, lastActiveAt: null });
    return this.repo.save(session);
  }

  async updateClaudeSessionId(id: number, claudeSessionId: string): Promise<void> {
    await this.repo.update(id, { claudeSessionId, lastActiveAt: new Date() });
  }
}
