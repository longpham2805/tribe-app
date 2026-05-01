import { Router, type Request, type Response } from "express";
import { ProjectRepository } from "../repository/ProjectRepository";

const router = Router();
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;

type ProjectPayload = {
  name?: unknown;
  slug?: unknown;
  mondayBoardIds?: unknown;
  mondayDefaultPersonId?: unknown;
  mondayDevPeople?: unknown;
  primaryColor?: unknown;
  actionColor?: unknown;
  introduction?: unknown;
  rules?: unknown;
  techStack?: unknown;
  fastTrack?: unknown;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function parseProjectFastTrack(payload: ProjectPayload): { value: boolean | undefined; error?: string } {
  if (payload.fastTrack === undefined) return { value: undefined };
  if (typeof payload.fastTrack !== "boolean") return { value: undefined, error: "fastTrack must be a boolean" };
  return { value: payload.fastTrack };
}

function normalizeProjectColor(
  value: unknown,
  fieldName: "primaryColor" | "actionColor",
): { value: string | null | undefined; error?: string } {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { value: undefined, error: `${fieldName} must be a hex color in #RRGGBB format` };
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) return { value: null };
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return { value: undefined, error: `${fieldName} must be a hex color in #RRGGBB format` };
  }

  return { value: normalized };
}

function parseProjectColors(
  payload: ProjectPayload,
  routeName: string,
): { primaryColor: string | null | undefined; actionColor: string | null | undefined; error?: string } {
  const primaryColor = normalizeProjectColor(payload.primaryColor, "primaryColor");
  const actionColor = normalizeProjectColor(payload.actionColor, "actionColor");
  const errors = [primaryColor.error, actionColor.error].filter(Boolean) as string[];

  if (errors.length > 0) {
    console.warn("Rejected project color payload", {
      route: routeName,
      fields: [
        primaryColor.error ? "primaryColor" : null,
        actionColor.error ? "actionColor" : null,
      ].filter(Boolean),
    });
    return {
      primaryColor: undefined,
      actionColor: undefined,
      error: errors[0],
    };
  }

  return {
    primaryColor: primaryColor.value,
    actionColor: actionColor.value,
  };
}

type ProjectAgentContextPayload = {
  introduction: string | null | undefined;
  rules: string | null | undefined;
  techStack: string | null | undefined;
  error?: string;
};

function normalizeProjectContextField(
  value: unknown,
  fieldName: "introduction" | "rules" | "techStack",
): { value: string | null | undefined; error?: string } {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { value: undefined, error: `${fieldName} must be a string` };
  }

  const normalized = value.trim();
  if (!normalized) return { value: null };
  if (normalized.length > MAX_PROJECT_CONTEXT_FIELD_CHARS) {
    return {
      value: undefined,
      error: `${fieldName} must be ${MAX_PROJECT_CONTEXT_FIELD_CHARS} characters or fewer`,
    };
  }

  return { value: normalized };
}

function parseProjectAgentContext(
  payload: ProjectPayload,
  routeName: string,
): ProjectAgentContextPayload {
  const introduction = normalizeProjectContextField(payload.introduction, "introduction");
  const rules = normalizeProjectContextField(payload.rules, "rules");
  const techStack = normalizeProjectContextField(payload.techStack, "techStack");
  const errors = [introduction.error, rules.error, techStack.error].filter(Boolean) as string[];

  if (errors.length > 0) {
    console.warn("Rejected project context payload", {
      route: routeName,
      fields: [
        introduction.error ? "introduction" : null,
        rules.error ? "rules" : null,
        techStack.error ? "techStack" : null,
      ].filter(Boolean),
    });
    return {
      introduction: undefined,
      rules: undefined,
      techStack: undefined,
      error: errors[0],
    };
  }

  return {
    introduction: introduction.value,
    rules: rules.value,
    techStack: techStack.value,
  };
}

// GET /api/projects
router.get("/", async (_req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const projects = await repo.findAllWithActivity();
    res.json(projects);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/projects/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const project = await repo.findByIdWithActivity(id);
    if (!project) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }
    res.json(project);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// POST /api/projects  { name, slug?, mondayBoardIds?, mondayDefaultPersonId?, mondayDevPeople?, primaryColor?, actionColor? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = req.body as ProjectPayload;
    const { name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople } = payload;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const colors = parseProjectColors(payload, "POST /api/projects");
    if (colors.error) {
      res.status(400).json({ error: colors.error });
      return;
    }
    const agentContext = parseProjectAgentContext(payload, "POST /api/projects");
    if (agentContext.error) {
      res.status(400).json({ error: agentContext.error });
      return;
    }
    const fastTrack = parseProjectFastTrack(payload);
    if (fastTrack.error) {
      res.status(400).json({ error: fastTrack.error });
      return;
    }
    const repo = new ProjectRepository();
    const project = await repo.create({
      name,
      slug: typeof slug === "string" || slug == null ? slug : undefined,
      mondayBoardIds: Array.isArray(mondayBoardIds) ? mondayBoardIds as number[] : undefined,
      mondayDefaultPersonId:
        typeof mondayDefaultPersonId === "string" || mondayDefaultPersonId == null
          ? mondayDefaultPersonId
          : undefined,
      mondayDevPeople: Array.isArray(mondayDevPeople) ? mondayDevPeople as string[] : undefined,
      primaryColor: colors.primaryColor,
      actionColor: colors.actionColor,
      introduction: agentContext.introduction,
      rules: agentContext.rules,
      techStack: agentContext.techStack,
      fastTrack: typeof payload.fastTrack === "boolean" ? payload.fastTrack : undefined,
    });
    res.status(201).json(project);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PATCH /api/projects/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const payload = req.body as ProjectPayload;
    const { name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople } = payload;
    const colors = parseProjectColors(payload, "PATCH /api/projects/:id");
    if (colors.error) {
      res.status(400).json({ error: colors.error });
      return;
    }
    const agentContext = parseProjectAgentContext(payload, "PATCH /api/projects/:id");
    if (agentContext.error) {
      res.status(400).json({ error: agentContext.error });
      return;
    }
    const fastTrack = parseProjectFastTrack(payload);
    if (fastTrack.error) {
      res.status(400).json({ error: fastTrack.error });
      return;
    }
    const updated = await repo.update(id, {
      name: typeof name === "string" ? name : undefined,
      slug: typeof slug === "string" || slug == null ? slug : undefined,
      mondayBoardIds: Array.isArray(mondayBoardIds) ? mondayBoardIds as number[] : undefined,
      mondayDefaultPersonId:
        typeof mondayDefaultPersonId === "string" || mondayDefaultPersonId == null
          ? mondayDefaultPersonId
          : undefined,
      mondayDevPeople: Array.isArray(mondayDevPeople) ? mondayDevPeople as string[] : undefined,
      primaryColor: colors.primaryColor,
      actionColor: colors.actionColor,
      introduction: agentContext.introduction,
      rules: agentContext.rules,
      techStack: agentContext.techStack,
      fastTrack: typeof payload.fastTrack === "boolean" ? payload.fastTrack : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }
    res.json(updated);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// DELETE /api/projects/:id  (only if empty)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const result = await repo.delete(id);
    if (!result.ok) {
      const status = result.error?.includes("not found") ? 404 : 409;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ message: `Project ${id} deleted successfully` });
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;
