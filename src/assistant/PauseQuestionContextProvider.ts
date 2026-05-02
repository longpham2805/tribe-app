import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { getLogFile, getTicketDir } from "../lib/paths";

export type PauseQuestionSource = "lastMessage" | "artifact" | "jsonl";

export type PauseQuestion = {
  text: string;
  options: string[];
  defaultOption: string | null;
  requiresExplicitApproval: boolean;
  source: PauseQuestionSource;
};

export type PauseQuestionContext = {
  exactQuestions: PauseQuestion[];
  fallbackContext: string | null;
  inspectHint: string;
};

type SourceText = {
  source: PauseQuestionSource;
  text: string;
};

const ARTIFACT_FILES = ["planning.md", "implementation.md", "ship.md", "feedback.md"];
const MAX_LAST_MESSAGE_CHARS = 2000;
const MAX_FALLBACK_CHARS = 1000;
const MAX_SOURCE_CHARS = 2000;
const MAX_ARTIFACT_LINES = 200;
const MAX_JSONL_BYTES = 256 * 1024;
const MAX_JSONL_EVENTS = 200;
const EXPLICIT_APPROVAL_PATTERN = /\b(approval|approve|confirm|permission|delete|migration|billing|security|legal|credential|production)\b/i;

export class PauseQuestionContextProvider {
  private ticketRepo: TicketRepository;

  constructor(ticketRepo = new TicketRepository()) {
    this.ticketRepo = ticketRepo;
  }

  async getContext(ticketId: number, phase: Phase): Promise<PauseQuestionContext> {
    const inspectHint = `Inspect the phase live feed in the UI or call /api/tickets/${ticketId}/files/_logs/${phase.phaseName}.`;

    try {
      const sources = await this.collectSources(ticketId, phase);
      const exactQuestions = this.extractQuestions(sources);
      const fallbackContext = exactQuestions.length > 0 ? null : this.extractFallbackContext(sources);

      return { exactQuestions, fallbackContext, inspectHint };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exactQuestions: [],
        fallbackContext: `Exact pause question text is unavailable because context extraction failed: ${this.redact(message).slice(0, MAX_FALLBACK_CHARS)}`,
        inspectHint,
      };
    }
  }

  private async collectSources(ticketId: number, phase: Phase): Promise<SourceText[]> {
    const sources: SourceText[] = [];

    if (phase.lastMessage?.trim()) {
      sources.push({ source: "lastMessage", text: phase.lastMessage.slice(-MAX_LAST_MESSAGE_CHARS) });
    }

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket?.uid) return sources;

    const ticketDir = getTicketDir(ticket.uid);
    for (const fileName of ARTIFACT_FILES) {
      const path = join(ticketDir, fileName);
      if (!existsSync(path)) continue;
      const text = this.tailLines(readFileSync(path, "utf-8"), MAX_ARTIFACT_LINES);
      if (this.hasPauseMarker(text) || this.hasQuestionText(text)) {
        sources.push({ source: "artifact", text });
      }
    }

    const logPath = getLogFile(ticket.uid, String(phase.phaseName));
    if (existsSync(logPath)) {
      const text = this.extractJsonlTextTail(readFileSync(logPath, "utf-8"));
      if (text.trim()) sources.push({ source: "jsonl", text });
    }

    return sources;
  }

  private extractQuestions(sources: SourceText[]): PauseQuestion[] {
    const results: PauseQuestion[] = [];

    for (const source of sources) {
      const text = this.prepareSourceText(source.text);
      const blocks = this.questionBlocks(text);
      for (const block of blocks) {
        const questionText = this.cleanQuestionText(block[0]);
        if (!questionText || results.some((q) => q.text === questionText)) continue;
        const options = this.extractOptions(block);
        const defaultOption = this.extractDefault(block);
        results.push({
          text: questionText,
          options,
          defaultOption,
          requiresExplicitApproval: this.requiresExplicitApproval(questionText, block, defaultOption),
          source: source.source,
        });
      }
      if (results.length > 0 && source.source === "lastMessage") break;
    }

    return results;
  }

  private questionBlocks(text: string): string[][] {
    const lines = text.split("\n").map((line) => this.redact(line)).filter((line) => line.trim());
    const blocks: string[][] = [];
    let current: string[] | null = null;

    for (const line of lines) {
      if (this.isStatusMarker(line)) continue;
      if (this.isQuestionLine(line)) {
        if (current) blocks.push(current);
        current = [line];
        continue;
      }
      if (current && this.isQuestionDetailLine(line)) current.push(line);
    }

    if (current) blocks.push(current);
    return blocks;
  }

  private extractOptions(block: string[]): string[] {
    const options: string[] = [];

    for (const line of block) {
      const cleaned = this.cleanLine(line);
      const inlineOptions = cleaned.match(/(?:available\s+)?options?\s*:\s*(.+?)(?=\s+(?:default|recommended)\b|$)/i);
      if (inlineOptions) {
        options.push(...inlineOptions[1].split(/[,|/]/).map((option) => option.trim()).filter(Boolean));
        continue;
      }
      if (/^(default|recommended)\b/i.test(cleaned)) continue;
      if (/^[-*]\s+|^[A-Z0-9][.)]\s+/.test(line.trim())) options.push(cleaned);
    }

    return Array.from(new Set(options)).slice(0, 8);
  }

  private extractDefault(block: string[]): string | null {
    const joined = block.map((line) => this.cleanLine(line)).join("\n");
    const match = joined.match(/(?:default|recommended)(?:\s+option)?\s*[:=\-]\s*([^\n.;]+)/i);
    return match?.[1]?.trim() ?? null;
  }

  private requiresExplicitApproval(questionText: string, block: string[], defaultOption: string | null): boolean {
    const text = [questionText, ...block].join("\n");
    return !defaultOption || EXPLICIT_APPROVAL_PATTERN.test(text);
  }

  private extractFallbackContext(sources: SourceText[]): string | null {
    for (const source of sources) {
      const text = this.prepareSourceText(source.text);
      if (!text.trim()) continue;
      return `Exact question text unavailable. Closest ${source.source} context:\n${text.slice(-MAX_FALLBACK_CHARS)}`;
    }
    return "Exact question text unavailable. No phase message, artifact, or JSONL log context was found.";
  }

  private prepareSourceText(text: string): string {
    return this.redact(text).slice(-MAX_SOURCE_CHARS);
  }

  private tailLines(text: string, maxLines: number): string {
    return text.split("\n").slice(-maxLines).join("\n");
  }

  private extractJsonlTextTail(raw: string): string {
    const capped = raw.slice(-MAX_JSONL_BYTES);
    return capped
      .split("\n")
      .filter((line) => line.trim())
      .slice(-MAX_JSONL_EVENTS)
      .map((line) => this.textFromJsonlLine(line))
      .filter(Boolean)
      .join("\n");
  }

  private textFromJsonlLine(line: string): string {
    try {
      const event = JSON.parse(line);
      return this.collectText(event).join("\n");
    } catch {
      return line;
    }
  }

  private collectText(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap((item) => this.collectText(item));

    const record = value as Record<string, unknown>;
    const direct = ["text", "content", "message", "finalText", "textChunk"]
      .map((key) => record[key])
      .flatMap((item) => this.collectText(item));

    return direct.length > 0 ? direct : [];
  }

  private isQuestionLine(line: string): boolean {
    const cleaned = this.cleanLine(line);
    return cleaned.includes("?") && !/^options?\s*:/i.test(cleaned);
  }

  private isQuestionDetailLine(line: string): boolean {
    const cleaned = this.cleanLine(line);
    return /^(available\s+)?options?\s*:/i.test(cleaned)
      || /^(default|recommended)(?:\s+option)?\s*[:=\-]/i.test(cleaned)
      || /^[-*]\s+|^[A-Z0-9][.)]\s+/.test(line.trim());
  }

  private hasQuestionText(text: string): boolean {
    return text.includes("?");
  }

  private hasPauseMarker(text: string): boolean {
    return /\[STATUS:(QUESTION|REQUIRES_ACTION)\]/.test(text);
  }

  private isStatusMarker(line: string): boolean {
    return /^\s*\[STATUS:(COMPLETED|REQUIRES_ACTION|QUESTION|ERROR)\]\s*$/.test(line);
  }

  private cleanQuestionText(line: string): string {
    return this.cleanLine(line)
      .replace(/\s+(?:available\s+)?options?\s*:.+$/i, "")
      .replace(/\s+(?:default|recommended)(?:\s+option)?\s*[:=\-].+$/i, "")
      .trim();
  }

  private cleanLine(line: string): string {
    return this.redact(line)
      .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
      .replace(/^\s*[A-Z][.)]\s+/, "")
      .trim();
  }

  private redact(text: string): string {
    return text
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
      .replace(/\b(api[_-]?key|token|password|secret|credential|cookie)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  }
}
