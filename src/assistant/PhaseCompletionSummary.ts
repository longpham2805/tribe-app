import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { TicketPhase } from "../enum/TicketPhase";
import { getTicketDir } from "../lib/paths";
import { dedupePullRequestArtifacts, parseShipArtifacts, type PullRequestArtifact } from "../handler/phase/artifacts";

export interface PhaseCompletionSummary {
  phaseName: TicketPhase;
  summaryLines: string[];
  delivery?: {
    branchName?: string;
    pullRequests: PullRequestArtifact[];
  };
  sourcePath: string;
  truncated: boolean;
}

const MAX_FORMATTED_LINES = 5;
const MAX_FORMATTED_CHARS = 800;
const MAX_SOURCE_CHARS = 256 * 1024;

const PHASE_ARTIFACTS: Partial<Record<TicketPhase, string>> = {
  [TicketPhase.PLANNING]: "planning.md",
  [TicketPhase.IMPLEMENTATION]: "implementation.md",
  [TicketPhase.SHIP]: "ship.md",
};

const SECTION_PRIORITY: Record<TicketPhase, string[]> = {
  [TicketPhase.CREATED]: [],
  [TicketPhase.PLANNING]: ["executive summary", "goal", "recommended approach", "business impact"],
  [TicketPhase.IMPLEMENTATION]: ["changes", "implementation details", "tasks completed", "verification"],
  [TicketPhase.SHIP]: ["delivery", "ship summary", "summary", "changes", "verification"],
  [TicketPhase.FEEDBACK]: [],
};

export class PhaseCompletionSummaryReader {
  read(ticketUid: string, phaseName: TicketPhase): PhaseCompletionSummary | null {
    const artifactName = PHASE_ARTIFACTS[phaseName];
    if (!artifactName) return null;

    const sourcePath = join(getTicketDir(ticketUid), artifactName);
    if (!existsSync(sourcePath)) return null;

    const raw = readFileSync(sourcePath, "utf-8");
    const content = raw.slice(0, MAX_SOURCE_CHARS);
    const summaryLines = this.extractSummaryLines(content, phaseName);
    const delivery = phaseName === TicketPhase.SHIP ? this.extractDelivery(content) : undefined;

    if (summaryLines.length === 0 && !delivery?.branchName && !delivery?.pullRequests.length) return null;

    return {
      phaseName,
      summaryLines,
      delivery,
      sourcePath,
      truncated: raw.length > MAX_SOURCE_CHARS,
    };
  }

  formatForPrompt(summary: PhaseCompletionSummary): string {
    const lines = this.formatLines(summary);
    if (lines.length === 0) return "";

    return [
      `Completion artifact summary from ${this.artifactLabel(summary.phaseName)}:`,
      ...lines.map((line) => `- ${line}`),
    ].join("\n");
  }

  private extractSummaryLines(content: string, phaseName: TicketPhase): string[] {
    const sections = this.parseSections(content);
    const lines: string[] = [];

    for (const heading of SECTION_PRIORITY[phaseName]) {
      const section = sections.get(heading);
      if (!section) continue;
      lines.push(...this.extractReadableLines(section));
      if (lines.length >= MAX_FORMATTED_LINES) break;
    }

    if (lines.length === 0) lines.push(...this.extractReadableLines(content));
    return this.unique(lines).slice(0, MAX_FORMATTED_LINES);
  }

  private extractDelivery(content: string): { branchName?: string; pullRequests: PullRequestArtifact[] } {
    const artifacts = parseShipArtifacts(content);
    return {
      branchName: artifacts.branchName ?? undefined,
      pullRequests: dedupePullRequestArtifacts(artifacts.pullRequests),
    };
  }

  private formatLines(summary: PhaseCompletionSummary): string[] {
    const lines: string[] = [];

    if (summary.delivery?.branchName) lines.push(`Branch: ${summary.delivery.branchName}`);
    for (const pr of summary.delivery?.pullRequests ?? []) {
      const commit = pr.commitSha ? ` @ ${pr.commitSha}` : "";
      lines.push(`PR: ${pr.repo} ${pr.prUrl}${commit}`);
      if (lines.length >= MAX_FORMATTED_LINES) break;
    }

    for (const line of summary.summaryLines) {
      if (lines.length >= MAX_FORMATTED_LINES) break;
      lines.push(line);
    }

    if (summary.truncated && lines.length < MAX_FORMATTED_LINES) lines.push("Artifact was truncated before extraction.");
    return this.capFormattedLines(this.unique(lines));
  }

  private parseSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = this.stripFrontmatter(content).split("\n");
    let currentHeading: string | null = null;
    let currentLines: string[] = [];

    const flush = () => {
      if (!currentHeading) return;
      const text = currentLines.join("\n").trim();
      if (text) sections.set(currentHeading, text);
    };

    for (const line of lines) {
      const match = line.match(/^#{2,3}\s+(.+)$/);
      if (match?.[1]) {
        flush();
        currentHeading = this.normalizeHeading(match[1]);
        currentLines = [];
        continue;
      }
      if (currentHeading) currentLines.push(line);
    }

    flush();
    return sections;
  }

  private extractReadableLines(text: string): string[] {
    const candidates: string[] = [];
    const paragraphs: string[] = [];

    for (const rawLine of text.split("\n")) {
      const line = this.cleanLine(rawLine);
      if (!line) continue;
      if (this.isNoiseLine(line)) continue;
      if (this.isTableLine(line)) {
        const tableLine = this.cleanTableLine(line);
        if (tableLine) candidates.push(tableLine);
        continue;
      }
      if (/^(?:[-*]|\d+[.)]|\[[x ]\])\s+/i.test(line)) {
        candidates.push(line.replace(/^(?:[-*]|\d+[.)]|\[[x ]\])\s+/i, ""));
        continue;
      }
      paragraphs.push(line);
    }

    if (candidates.length === 0 && paragraphs.length > 0) candidates.push(...this.sentences(paragraphs.join(" ")));
    return candidates.map((line) => this.redact(line)).filter(Boolean);
  }

  private capFormattedLines(lines: string[]): string[] {
    const capped: string[] = [];
    let used = 0;

    for (const line of lines) {
      const remaining = MAX_FORMATTED_CHARS - used;
      if (remaining <= 0) break;
      const value = line.length > remaining ? `${line.slice(0, Math.max(0, remaining - 1)).trim()}…` : line;
      if (!value) continue;
      capped.push(value);
      used += value.length + 2;
      if (capped.length >= MAX_FORMATTED_LINES) break;
    }

    return capped;
  }

  private artifactLabel(phaseName: TicketPhase): string {
    return PHASE_ARTIFACTS[phaseName] ?? "phase artifact";
  }

  private stripFrontmatter(text: string): string {
    return text.replace(/^---\n[\s\S]*?\n---\n/, "");
  }

  private normalizeHeading(heading: string): string {
    return heading.replace(/[#`*_]/g, "").trim().toLowerCase();
  }

  private cleanLine(line: string): string {
    return this.redact(line)
      .replace(/^#+\s+/, "")
      .replace(/^>\s*/, "")
      .trim();
  }

  private isNoiseLine(line: string): boolean {
    return /^\[STATUS:(COMPLETED|REQUIRES_ACTION|QUESTION|ERROR)\]$/.test(line)
      || /^```/.test(line)
      || /^verified:$/i.test(line)
      || /^#+\s+/.test(line);
  }

  private isTableLine(line: string): boolean {
    return line.startsWith("|") && line.endsWith("|");
  }

  private cleanTableLine(line: string): string | null {
    if (/^\|\s*:?-{3,}/.test(line)) return null;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2 || cells.some((cell) => /^-{3,}$/.test(cell))) return null;
    return cells.join(": ");
  }

  private sentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  private unique(lines: string[]): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    for (const line of lines) {
      const cleaned = line.trim();
      const key = cleaned.toLowerCase();
      if (!cleaned || seen.has(key)) continue;
      seen.add(key);
      results.push(cleaned);
    }
    return results;
  }

  private redact(text: string): string {
    return text
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
      .replace(/\b(api[_-]?key|token|password|secret|credential|cookie)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  }
}
