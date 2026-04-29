import { appendFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { Ticket } from "../../entity/Ticket";
import { PhaseStatus } from "../../enum/PhaseStatus";
import { CliType } from "../../enum/CliType";
import { TicketPhase } from "../../enum/TicketPhase";
import { MARKER_REGEX } from "../../agent";
import { getAdapter } from "../../cli";
import { getLogDir, getStderrFile } from "../../lib/paths";
import { persistPhaseEvent, persistPhaseSystemEvent, type PhaseLogContext } from "./phaseLogging";

const SPAWN_TIMEOUT_MS = 30 * 60 * 1000; // 30 min safety kill

export interface SpawnResult {
  output: string;
  status: PhaseStatus;
  message: string | null;
  sessionUuid: string | null;
}

export class PhaseCliRunner {
  constructor(private readonly log: (message: string) => void) {}

  spawn(
    ticket: Ticket,
    prompt: string,
    cwd: string,
    resumeSessionId?: string | null,
    logContext?: PhaseLogContext,
  ): Promise<SpawnResult> {
    return new Promise((resolve, reject) => {
      const adapter = getAdapter(ticket.cliType ?? CliType.CLAUDE);
      const resuming = !!resumeSessionId;
      const args = adapter.buildArgs({ prompt, resumeSessionId });

      this.log(`${adapter.type} spawn: ${resuming ? `resume ${resumeSessionId}` : "new session"} cwd=${cwd}`);

      let stderrFile: string | null = null;
      if (logContext?.uid) {
        const logDir = getLogDir(logContext.uid);
        mkdirSync(logDir, { recursive: true });
        stderrFile = getStderrFile(logContext.uid, logContext.phaseName);
        persistPhaseEvent(logContext, {
          type: "_tribe.run_start",
          at: new Date().toISOString(),
          resumeSessionId: resumeSessionId ?? null,
        });
        if (logContext.phaseName === TicketPhase.FEEDBACK && resumeSessionId) {
          persistPhaseEvent(logContext, {
            type: "_tribe.prompt",
            at: new Date().toISOString(),
            resumeSessionId,
            text: prompt,
          });
        }
      }

      const persistEvent = (evt: unknown) => {
        persistPhaseEvent(logContext, evt);
      };

      const proc = spawn(adapter.binary, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let output = "";
      let stderr = "";
      let sessionUuid: string | null = null;
      let stdoutBuf = "";

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        const parsed = adapter.parseEvent(line);
        if (!parsed) return;
        if (parsed.sessionId && !sessionUuid) sessionUuid = parsed.sessionId;
        if (parsed.textChunk) output += parsed.textChunk;
        if (parsed.finalText && !output) output = parsed.finalText;
        persistEvent(parsed.raw);
      };

      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        let idx: number;
        while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, idx);
          stdoutBuf = stdoutBuf.slice(idx + 1);
          consumeLine(line);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
        if (stderrFile) {
          try {
            appendFileSync(stderrFile, text);
          } catch (err) {
            console.error("[PhaseHandler] failed to persist stderr:", err);
          }
        }
      });

      let timedOut = false;
      const timeout = setTimeout(() => {
        this.log(`${adapter.type} timeout after ${SPAWN_TIMEOUT_MS}ms — killing process`);
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5000);
        timedOut = true;
      }, SPAWN_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (stdoutBuf.trim()) consumeLine(stdoutBuf);
        this.log(`${adapter.type} exited with code ${code} (sessionUuid=${sessionUuid ?? "none"})`);
        persistPhaseSystemEvent(logContext, "cli_exit", `${adapter.type} exited with code ${code ?? "unknown"}`, {
          exitCode: code ?? null,
          resumed: resuming,
        });

        if (timedOut) {
          persistPhaseSystemEvent(logContext, "cli_timeout", `${adapter.type} timed out`, {
            timeoutMs: SPAWN_TIMEOUT_MS,
          });
          resolve({
            output,
            status: PhaseStatus.ERROR,
            message: "timeout",
            sessionUuid,
          });
          return;
        }

        const parsed = this.parseMarker(output);
        let status = parsed.status;
        let message = parsed.message;

        if (!parsed.found) {
          if (code === 0) {
            status = PhaseStatus.COMPLETED;
            message = null;
          } else {
            status = PhaseStatus.ERROR;
            message = (stderr.trim() || `${adapter.type} exited with code ${code}`).slice(-2000);
          }
        }

        resolve({
          output: parsed.output,
          status,
          message,
          sessionUuid,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        this.log(`${adapter.type} process error: ${err.message}`);
        reject(err);
      });
    });
  }

  private parseMarker(raw: string): {
    output: string;
    status: PhaseStatus;
    message: string | null;
    found: boolean;
  } {
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(MARKER_REGEX);
      if (!m) continue;

      const tag = m[1] as keyof typeof PhaseStatus;
      const status = PhaseStatus[tag];
      const before = lines.slice(0, i).join("\n").replace(/\s+$/, "");
      const message =
        status === PhaseStatus.COMPLETED
          ? null
          : this.tailMessage(before);
      return {
        output: before,
        status,
        message,
        found: true,
      };
    }
    return {
      output: raw,
      status: PhaseStatus.COMPLETED,
      message: null,
      found: false,
    };
  }

  private tailMessage(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\n\s*\n/);
    return (parts[parts.length - 1] ?? trimmed).trim() || null;
  }
}
