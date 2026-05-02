import { isAbsolute } from "path";
import { ProjectRepository } from "../repository/ProjectRepository";
import { SlotRepository } from "../repository/SlotRepository";
import type {
  ProjectCreateInput,
  ProjectSlotWriteIntent,
  ProjectSlotWriteResult,
  ProjectUpdateInput,
  SlotCreateInput,
  SlotUpdateInput,
} from "./AssistantProjectSlotContracts";

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const MAX_PROJECT_NAME_CHARS = 100;
const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;
const MAX_SLOT_NAME_CHARS = 100;
const MAX_ROOT_PATH_CHARS = 500;

type WriteServiceDeps = {
  projectRepo?: ProjectRepository;
  slotRepo?: SlotRepository;
};

export class AssistantProjectSlotWriteService {
  private projectRepo: ProjectRepository;
  private slotRepo: SlotRepository;

  constructor(deps: WriteServiceDeps = {}) {
    this.projectRepo = deps.projectRepo ?? new ProjectRepository();
    this.slotRepo = deps.slotRepo ?? new SlotRepository();
  }

  async execute(intent: ProjectSlotWriteIntent): Promise<ProjectSlotWriteResult> {
    switch (intent.operation) {
      case "create_project":
        return this.createProject(intent.input);
      case "update_project":
        return this.updateProject(intent.projectId, intent.input);
      case "create_slot":
        return this.createSlot(intent.input, intent.defaultProjectId ?? null);
      case "update_slot":
        return this.updateSlot(intent.slotId, intent.input);
    }
  }

  private async createProject(input: ProjectCreateInput): Promise<ProjectSlotWriteResult> {
    const normalized = this.normalizeProjectCreate(input);
    const existing = await this.findConflictingProject(normalized.name, normalized.slug);
    if (existing) return { operation: "create_project", error: existing };

    const project = await this.projectRepo.create(normalized);
    return {
      success: true,
      operation: "create_project",
      project,
      changedFields: Object.keys(normalized),
      resolvedProjectId: project.id,
    };
  }

  private async updateProject(projectId: number, input: ProjectUpdateInput): Promise<ProjectSlotWriteResult> {
    this.assertPositiveInteger(projectId, "projectId");
    const normalized = this.normalizeProjectUpdate(input);
    const existing = await this.findConflictingProject(normalized.name, normalized.slug, projectId);
    if (existing) return { operation: "update_project", error: existing };

    const project = await this.projectRepo.update(projectId, normalized);
    if (!project) return { operation: "update_project", error: `Project ${projectId} not found` };
    return {
      success: true,
      operation: "update_project",
      project,
      changedFields: Object.keys(normalized),
      resolvedProjectId: project.id,
    };
  }

  private async createSlot(input: SlotCreateInput, defaultProjectId: number | null): Promise<ProjectSlotWriteResult> {
    const normalized = this.normalizeSlotCreate(input, defaultProjectId);
    const slot = await this.slotRepo.create(normalized);
    return {
      success: true,
      operation: "create_slot",
      slot,
      changedFields: Object.keys(normalized),
      resolvedProjectId: slot.projectId,
    };
  }

  private async updateSlot(slotId: number, input: SlotUpdateInput): Promise<ProjectSlotWriteResult> {
    this.assertPositiveInteger(slotId, "slotId");
    const normalized = this.normalizeSlotUpdate(input);
    const slot = await this.slotRepo.update(slotId, normalized);
    if (!slot) return { operation: "update_slot", error: `Slot ${slotId} not found` };
    return {
      success: true,
      operation: "update_slot",
      slot,
      changedFields: Object.keys(normalized),
      resolvedProjectId: slot.projectId,
    };
  }

  private normalizeProjectCreate(input: ProjectCreateInput): ProjectCreateInput {
    const name = this.normalizeRequiredString(input.name, "name", MAX_PROJECT_NAME_CHARS);
    return { ...this.normalizeProjectUpdate(input), name };
  }

  private normalizeProjectUpdate(input: ProjectUpdateInput): ProjectUpdateInput {
    return {
      ...(input.name !== undefined ? { name: this.normalizeRequiredString(input.name, "name", MAX_PROJECT_NAME_CHARS) } : {}),
      ...(input.slug !== undefined ? { slug: this.normalizeNullableString(input.slug, "slug", MAX_PROJECT_NAME_CHARS) } : {}),
      ...(input.mondayBoardIds !== undefined ? { mondayBoardIds: this.normalizeNumberArray(input.mondayBoardIds, "mondayBoardIds") } : {}),
      ...(input.mondayDefaultPersonId !== undefined ? { mondayDefaultPersonId: this.normalizeNullableString(input.mondayDefaultPersonId, "mondayDefaultPersonId", 50) } : {}),
      ...(input.mondayDevPeople !== undefined ? { mondayDevPeople: this.normalizeStringArray(input.mondayDevPeople, "mondayDevPeople") } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: this.normalizeColor(input.primaryColor, "primaryColor") } : {}),
      ...(input.actionColor !== undefined ? { actionColor: this.normalizeColor(input.actionColor, "actionColor") } : {}),
      ...(input.introduction !== undefined ? { introduction: this.normalizeNullableString(input.introduction, "introduction", MAX_PROJECT_CONTEXT_FIELD_CHARS) } : {}),
      ...(input.rules !== undefined ? { rules: this.normalizeNullableString(input.rules, "rules", MAX_PROJECT_CONTEXT_FIELD_CHARS) } : {}),
      ...(input.techStack !== undefined ? { techStack: this.normalizeNullableString(input.techStack, "techStack", MAX_PROJECT_CONTEXT_FIELD_CHARS) } : {}),
      ...(input.fastTrack !== undefined ? { fastTrack: this.normalizeBoolean(input.fastTrack, "fastTrack") } : {}),
    };
  }

  private normalizeSlotCreate(input: SlotCreateInput, defaultProjectId: number | null): SlotCreateInput {
    return {
      name: this.normalizeRequiredString(input.name, "name", MAX_SLOT_NAME_CHARS),
      rootPath: this.normalizeRootPath(input.rootPath),
      projectId: input.projectId === undefined ? defaultProjectId : this.normalizeNullablePositiveInteger(input.projectId, "projectId"),
    };
  }

  private normalizeSlotUpdate(input: SlotUpdateInput): SlotUpdateInput {
    return {
      ...(input.name !== undefined ? { name: this.normalizeRequiredString(input.name, "name", MAX_SLOT_NAME_CHARS) } : {}),
      ...(input.rootPath !== undefined ? { rootPath: this.normalizeRootPath(input.rootPath) } : {}),
      ...(input.projectId !== undefined ? { projectId: this.normalizeNullablePositiveInteger(input.projectId, "projectId") } : {}),
    };
  }

  private async findConflictingProject(name?: string, slug?: string | null, excludeProjectId?: number): Promise<string | null> {
    const projects = await this.projectRepo.findAll();
    const normalizedName = name?.toLowerCase();
    const normalizedSlug = slug?.toLowerCase();
    const conflict = projects.find((project) =>
      project.id !== excludeProjectId && (
        (normalizedName != null && project.name.toLowerCase() === normalizedName) ||
        (normalizedSlug != null && project.slug?.toLowerCase() === normalizedSlug)
      )
    );
    if (!conflict) return null;
    return `Project conflicts with existing project #${conflict.id} (${conflict.name})`;
  }

  private normalizeRequiredString(value: unknown, fieldName: string, maxLength: number): string {
    if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
    const normalized = value.trim();
    if (!normalized) throw new Error(`${fieldName} is required`);
    if (normalized.length > maxLength) throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
    return normalized;
  }

  private normalizeNullableString(value: unknown, fieldName: string, maxLength: number): string | null {
    if (value === null) return null;
    if (typeof value !== "string") throw new Error(`${fieldName} must be a string or null`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
    return normalized;
  }

  private normalizeColor(value: unknown, fieldName: "primaryColor" | "actionColor"): string | null {
    const normalized = this.normalizeNullableString(value, fieldName, 7);
    if (normalized === null) return null;
    const upper = normalized.toUpperCase();
    if (!HEX_COLOR_PATTERN.test(upper)) throw new Error(`${fieldName} must be a hex color in #RRGGBB format`);
    return upper;
  }

  private normalizeRootPath(value: unknown): string {
    const rootPath = this.normalizeRequiredString(value, "rootPath", MAX_ROOT_PATH_CHARS);
    if (!isAbsolute(rootPath)) throw new Error("rootPath must be an absolute path");
    return rootPath;
  }

  private normalizeBoolean(value: unknown, fieldName: string): boolean {
    if (typeof value !== "boolean") throw new Error(`${fieldName} must be a boolean`);
    return value;
  }

  private normalizeNumberArray(value: unknown, fieldName: string): number[] | null {
    if (value === null) return null;
    if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || item <= 0)) {
      throw new Error(`${fieldName} must be an array of positive integers or null`);
    }
    return value;
  }

  private normalizeStringArray(value: unknown, fieldName: string): string[] | null {
    if (value === null) return null;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`${fieldName} must be an array of non-empty strings or null`);
    }
    return value.map((item) => item.trim());
  }

  private normalizeNullablePositiveInteger(value: unknown, fieldName: string): number | null {
    if (value === null) return null;
    this.assertPositiveInteger(value, fieldName);
    return value;
  }

  private assertPositiveInteger(value: unknown, fieldName: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${fieldName} must be a positive integer`);
  }
}

