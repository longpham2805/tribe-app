import { PhaseStatus } from "../../enum/PhaseStatus";

export interface PlanningArtifactReview {
  ok: boolean;
  status?: PhaseStatus.QUESTION;
  message?: string;
}

const OPEN_QUESTIONS_HEADING = /^##\s+Open Questions\s*$/im;
const IMPLEMENTATION_TASKS_HEADING = "Implementation Tasks";
const VERIFICATION_HEADING = "Verification";
const CHECKBOX_STEP = /^\s*-\s+\[[ xX]\]\s+\S/im;
const STATUS_MARKER = /^\[STATUS:[A-Z_]+\]\s*$/gim;
const MAX_EXCERPT_LENGTH = 1000;
const PLACEHOLDER_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "TBD", regex: /\bTBD\b/i },
  { label: "TODO", regex: /\bTODO\b/i },
  { label: "???", regex: /\?\?\?/ },
];
const ANGLE_TOKEN = /<[^>\n]+>/g;
const TAG_NAME = /^<\/?\s*([A-Za-z][\w:.-]*)\b[^>]*>$/;
const ATTRIBUTE_ASSIGNMENT = /\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s"'=<>`]+)/;

interface PlanningSection {
  body: string;
}

export function reviewPlanningArtifact(content: string): PlanningArtifactReview {
  const openQuestions = OPEN_QUESTIONS_HEADING.exec(content);
  if (openQuestions) {
    const excerpt = extractSectionExcerpt(content, openQuestions.index).slice(0, MAX_EXCERPT_LENGTH);
    const body = excerpt
      .replace(/^##\s+Open Questions\s*$/im, "")
      .replace(STATUS_MARKER, "")
      .trim();
    const detail = body || "Final planning artifacts must not include an `## Open Questions` section.";

    return planningBlocked(
      "PLANNING must resolve open questions before IMPLEMENTATION can start.",
      "Please answer or incorporate these items, then emit a replacement final planning.md without `## Open Questions`.",
      detail,
    );
  }

  const placeholder = findPlaceholder(content);
  if (placeholder) {
    return planningBlocked(
      "PLANNING produced a non-actionable artifact.",
      `Remove placeholder text matching ${placeholder.label} before completing planning.md.`,
      placeholder.excerpt,
    );
  }

  const implementationTasks = findTopLevelSection(content, IMPLEMENTATION_TASKS_HEADING);
  if (!implementationTasks) {
    return planningBlocked(
      "PLANNING produced a non-actionable artifact.",
      "Completed planning.md must include a `## Implementation Tasks` section.",
      "Add ordered task headings with checkbox steps that name exact files, commands/checks, and expected results.",
    );
  }

  if (!CHECKBOX_STEP.test(implementationTasks.body)) {
    return planningBlocked(
      "PLANNING produced a non-actionable artifact.",
      "`## Implementation Tasks` must contain at least one checkbox step.",
      "Use `- [ ]` checklist items for concrete implementation steps.",
    );
  }

  if (!findTopLevelSection(content, VERIFICATION_HEADING)) {
    return planningBlocked(
      "PLANNING produced a non-actionable artifact.",
      "Completed planning.md must include a `## Verification` section.",
      "Name the exact commands or manual checks and expected results.",
    );
  }

  return { ok: true };
}

function planningBlocked(summary: string, instruction: string, detail: string): PlanningArtifactReview {
  return {
    ok: false,
    status: PhaseStatus.QUESTION,
    message: [summary, instruction, detail].join("\n\n"),
  };
}

function findPlaceholder(content: string): { label: string; excerpt: string } | null {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = pattern.regex.exec(content);
    if (!match) continue;
    return {
      label: pattern.label,
      excerpt: extractLineExcerpt(content, match.index),
    };
  }

  const anglePlaceholder = findAnglePlaceholder(content);
  if (anglePlaceholder) return anglePlaceholder;

  return null;
}

function findAnglePlaceholder(content: string): { label: string; excerpt: string } | null {
  for (const match of content.matchAll(ANGLE_TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    const line = extractLineExcerpt(content, index);
    if (isHtmlLikeTagSnippet(token, line)) continue;

    return {
      label: "<...>",
      excerpt: line,
    };
  }

  return null;
}

function isHtmlLikeTagSnippet(token: string, line: string): boolean {
  const tagMatch = TAG_NAME.exec(token);
  if (!tagMatch) return false;

  const tagName = tagMatch[1];
  const isClosingTag = /^<\//.test(token);
  const hasAttributeAssignment = ATTRIBUTE_ASSIGNMENT.test(token);
  const isSelfClosing = /\/\s*>$/.test(token);
  const hasJsxExpression = /\{[^}]+\}/.test(line);
  const hasOpeningTagOnLine = new RegExp(`<${escapeRegExp(tagName)}(?:\\s|>|/)`).test(line);
  const hasClosingTagOnLine = new RegExp(`</\\s*${escapeRegExp(tagName)}\\s*>`).test(line);

  if (isClosingTag) {
    return hasOpeningTagOnLine && (hasAttributeAssignment || hasJsxExpression || hasClosingTagOnLine);
  }

  return hasAttributeAssignment || isSelfClosing || hasJsxExpression || hasClosingTagOnLine;
}

function findTopLevelSection(content: string, heading: string): PlanningSection | null {
  const headingRegex = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingRegex.exec(content);
  if (!match) return null;

  return {
    body: extractSectionBody(content, match.index),
  };
}

function extractSectionExcerpt(content: string, headingIndex: number): string {
  const rest = content.slice(headingIndex);
  const nextHeading = rest.slice(1).search(/^##\s+/m);
  if (nextHeading === -1) return rest.trim();
  return rest.slice(0, nextHeading + 1).trim();
}

function extractSectionBody(content: string, headingIndex: number): string {
  const excerpt = extractSectionExcerpt(content, headingIndex);
  return excerpt.replace(/^##\s+.*$/m, "").trim();
}

function extractLineExcerpt(content: string, index: number): string {
  const lineStart = content.lastIndexOf("\n", index) + 1;
  const lineEnd = content.indexOf("\n", index);
  return content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim().slice(0, MAX_EXCERPT_LENGTH);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
