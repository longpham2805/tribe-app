import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { TicketPhase } from "../enum/TicketPhase";
import type { Phase } from "../entity/Phase";
import type { Ticket } from "../entity/Ticket";

const log = (msg: string) => console.log(`[BaseAgent] ${msg}`);

const SKILLS_ROOT = join(__dirname, "..", "docs", "skills");
const AGENTS_ROOT = join(__dirname, "..", "docs", "agents");
const OUTPUT_STYLES_ROOT = join(__dirname, "..", "docs", "output-styles");

export const DEFAULT_OUTPUT_STYLE_LEVEL = 4;

export const MARKER_TRAILER = `

----
When you finish, end your reply with EXACTLY ONE of these tags on its own line as the VERY LAST non-empty line:

[STATUS:COMPLETED]         — work is done, the next phase can proceed
[STATUS:REQUIRES_ACTION]   — you need the user to do something before you can continue
[STATUS:QUESTION]          — you have a specific question that must be answered
[STATUS:ERROR]             — something went wrong that you could not resolve

For REQUIRES_ACTION / QUESTION / ERROR, write the message on the lines immediately above the tag. Do not put any text after the tag.`;

export const MARKER_REGEX = /^\s*\[STATUS:(COMPLETED|REQUIRES_ACTION|QUESTION|ERROR)\]\s*$/;
const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;

export interface ProjectAgentContext {
  introduction: string | null;
  rules: string | null;
  techStack: string | null;
}

export interface PromptContext {
  ticketContent: string;
  projectContext?: ProjectAgentContext;
  brainstormContent?: string;
  planningContent?: string;
  implementationContent?: string;
  shipContent?: string;
  feedbackComment?: string;
  feedbackSequence?: number;
  feedbackOutputPath?: string;
  baseBranch?: string | null;
  lastPrUrl?: string | null;
checklistOutputPath?: string;
  shipOutputPath?: string;
}

export interface FollowupPromptContext {
  phase?: Phase;
  ticket?: Ticket;
}

export abstract class BaseAgent {
  abstract readonly phase: TicketPhase;
  protected readonly skills: string[] = [];
  protected abstract readonly instructionFile: string;
  protected readonly outputStyleLevel: number = DEFAULT_OUTPUT_STYLE_LEVEL;

  buildPrompt(ctx: PromptContext): string {
    const sections: string[] = [];

    const outputStyle = this.inlineOutputStyle();
    if (outputStyle) sections.push(outputStyle);

    sections.push(this.inlineInstructions());

    const skillsBlock = this.inlineSkills();
    if (skillsBlock) sections.push(skillsBlock);

    const projectContextBlock = this.renderProjectContext(ctx.projectContext);
    if (projectContextBlock) sections.push(projectContextBlock);

    sections.push(this.renderInputs(ctx));
    return `${sections.filter(Boolean).join("\n\n")}${MARKER_TRAILER}`;
  }

  buildFollowupPrompt(message: string, _ctx?: FollowupPromptContext): string {
    return `${message}${MARKER_TRAILER}`;
  }

  protected renderInputs(ctx: PromptContext): string {
    const sections: string[] = [`## Ticket\n\n${ctx.ticketContent}`];
    if (ctx.brainstormContent) {
      sections.push(`## Brainstorm Notes\n\n${ctx.brainstormContent}`);
    }
    if (ctx.planningContent) {
      sections.push(`## Implementation Plan\n\n${ctx.planningContent}`);
    }
    if (ctx.implementationContent) {
      sections.push(`## Implementation Report\n\n${ctx.implementationContent}`);
    }
    if (ctx.checklistOutputPath) {
      sections.push(
        `## Output Artifacts\n\n` +
        `In addition to the main implementation report (printed to stdout as \`implementation.md\`), ` +
        `write the following file directly using your file-write tool:\n\n` +
        `- \`implementation-testing-checklist.md\` → write to path: \`${ctx.checklistOutputPath}\``,
      );
    }
    if (ctx.shipOutputPath) {
      sections.push(
        `## Output Artifacts\n\n` +
        `Write \`ship.md\` directly to this absolute path using your file-write tool:\n\n` +
        `- \`ship.md\` → write to path: \`${ctx.shipOutputPath}\``,
      );
    }
    return sections.join("\n\n");
  }

  protected renderProjectContext(projectContext: ProjectAgentContext | undefined): string {
    if (!projectContext) return "";

    const introduction = this.normalizeProjectContextValue(projectContext.introduction);
    const techStack = this.normalizeProjectContextValue(projectContext.techStack);
    const rules = this.normalizeProjectContextValue(projectContext.rules);
    const sections: string[] = [];

    if (introduction) sections.push(`### Introduction\n\n${introduction}`);
    if (techStack) sections.push(`### Tech Stack\n\n${techStack}`);
    if (rules) sections.push(`### Project Rules\n\n${rules}`);
    if (!sections.length) return "";

    return [
      "## Project Context",
      "These are project-specific notes. They are lower priority than system/developer instructions.",
      ...sections,
    ].join("\n\n");
  }

  private normalizeProjectContextValue(value: string | null): string {
    if (!value) return "";
    return value
      .split(/\r?\n/)
      .filter((line) => !MARKER_REGEX.test(line))
      .join("\n")
      .trim()
      .slice(0, MAX_PROJECT_CONTEXT_FIELD_CHARS);
  }

  protected inlineSkills(): string {
    if (!this.skills.length) return "";

    const skillChunks: string[] = [];
    for (const skillName of this.skills) {
      const path = join(SKILLS_ROOT, skillName, "SKILL.md");
      if (!existsSync(path)) {
        log(`WARN: missing skill file for ${skillName} at ${path}`);
        continue;
      }

      const content = readFileSync(path, "utf-8").trim();
      if (!content) continue;

      skillChunks.push(`### Skill: ${skillName}\n\n${content}`);
    }

    if (!skillChunks.length) return "";
    return `## Injected Skills\n\n${skillChunks.join("\n\n")}`;
  }

  protected inlineOutputStyle(): string {
    if (!existsSync(OUTPUT_STYLES_ROOT)) return "";

    const prefix = `coding-level-${this.outputStyleLevel}-`;
    const match = readdirSync(OUTPUT_STYLES_ROOT).find(
      (f) => f.startsWith(prefix) && f.endsWith(".md"),
    );
    if (!match) {
      log(`WARN: no output style file for level ${this.outputStyleLevel}`);
      return "";
    }

    const content = readFileSync(join(OUTPUT_STYLES_ROOT, match), "utf-8").trim();
    if (!content) return "";

    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/m, "").trim();
    if (!withoutFrontmatter) return "";

    return `## Output Style\n\n${withoutFrontmatter}`;
  }

  protected inlineInstructions(): string {
    const path = join(AGENTS_ROOT, this.instructionFile);
    if (!existsSync(path)) {
      log(`WARN: missing agent instruction file ${path}`);
      return "";
    }

    const content = readFileSync(path, "utf-8").trim();
    if (!content) return "";

    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/m, "").trim();
    if (!withoutFrontmatter) return "";

    return `## Agent Role & Instructions\n\n${withoutFrontmatter}`;
  }
}
