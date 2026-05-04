export type ProjectCreateInput = {
  name: string;
  slug?: string | null;
  mondayBoardIds?: number[] | null;
  mondayDefaultPersonId?: string | null;
  mondayDevPeople?: string[] | null;
  primaryColor?: string | null;
  actionColor?: string | null;
  introduction?: string | null;
  rules?: string | null;
  techStack?: string | null;
  fastTrack?: boolean;
};

export type ProjectUpdateInput = Partial<ProjectCreateInput>;

export type SlotCreateInput = {
  name: string;
  rootPath: string;
  projectId?: number | null;
};

export type SlotUpdateInput = {
  name?: string;
  rootPath?: string;
  projectId?: number | null;
  disabled?: boolean;
};

export type ProjectWriteIntent =
  | { operation: "create_project"; input: ProjectCreateInput }
  | { operation: "update_project"; projectId: number; input: ProjectUpdateInput };

export type SlotWriteIntent =
  | { operation: "create_slot"; input: SlotCreateInput; defaultProjectId?: number | null }
  | { operation: "update_slot"; slotId: number; input: SlotUpdateInput };

export type ProjectSlotWriteIntent = ProjectWriteIntent | SlotWriteIntent;

export type ProjectSlotBlastRadius = "low" | "medium" | "high";

export type ProjectSlotPolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  blastRadius: ProjectSlotBlastRadius;
};

export type ProjectSlotWriteResult = {
  success?: boolean;
  approvalRequired?: boolean;
  operation: ProjectSlotWriteIntent["operation"];
  reason?: string;
  blastRadius?: ProjectSlotBlastRadius;
  changedFields?: string[];
  project?: unknown;
  slot?: unknown;
  resolvedProjectId?: number | null;
  error?: string;
};

export type AssistantProjectSlotActionPayload = {
  kind: "project_slot_write";
  intent: ProjectSlotWriteIntent;
};
