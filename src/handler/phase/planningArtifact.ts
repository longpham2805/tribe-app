import { PhaseStatus } from "../../enum/PhaseStatus";

export interface PlanningArtifactReview {
  ok: boolean;
  status?: PhaseStatus.QUESTION;
  message?: string;
}

const OPEN_QUESTIONS_HEADING = /^##\s+Open Questions\s*$/im;
const STATUS_MARKER = /^\[STATUS:[A-Z_]+\]\s*$/gim;
const MAX_EXCERPT_LENGTH = 1000;

export function reviewPlanningArtifact(content: string): PlanningArtifactReview {
  const match = OPEN_QUESTIONS_HEADING.exec(content);
  if (!match) return { ok: true };

  const excerpt = extractSectionExcerpt(content, match.index).slice(0, MAX_EXCERPT_LENGTH);
  const body = excerpt
    .replace(/^##\s+Open Questions\s*$/im, "")
    .replace(STATUS_MARKER, "")
    .trim();
  const detail = body || "Final planning artifacts must not include an `## Open Questions` section.";

  return {
    ok: false,
    status: PhaseStatus.QUESTION,
    message: [
      "PLANNING must resolve open questions before IMPLEMENTATION can start.",
      "Please answer or incorporate these items, then emit a replacement final planning.md without `## Open Questions`.",
      detail,
    ].join("\n\n"),
  };
}

function extractSectionExcerpt(content: string, headingIndex: number): string {
  const rest = content.slice(headingIndex);
  const nextHeading = rest.slice(1).search(/^##\s+/m);
  if (nextHeading === -1) return rest.trim();
  return rest.slice(0, nextHeading + 1).trim();
}
