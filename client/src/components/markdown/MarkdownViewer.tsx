import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPhaseLog, fetchTicketFile } from "../../api";
import { normalizeActivityEvents } from "../../phaseEvents";
import type { TicketPhase } from "../../types";
import { MarkdownProse } from "./MarkdownProse";
import { SharedMarkdown } from "./SharedMarkdown";

type Tab = "markdown" | "activity" | "raw";

interface MarkdownViewerProps {
  ticketId: number;
  fileName: string;
  phaseName: TicketPhase | null;
  liveEvents: any[];
  onBack?: () => void;
}

function fileToPhase(fileName: string): TicketPhase | null {
  const base = fileName.replace(/\.md$/, "").toLowerCase();
  if (base === "planning") return "PLANNING";
  if (base === "implementation") return "IMPLEMENTATION";
  if (base === "ship") return "SHIP";
  if (/^feedback-\d+$/.test(base)) return "FEEDBACK";
  if (base === "ticket") return "CREATED";
  return null;
}

const PHASE_LABELS: Record<TicketPhase, string> = {
  CREATED: "Created",
  PLANNING: "Planning",
  IMPLEMENTATION: "Implementation",
  SHIP: "Ship",
  FEEDBACK: "Feedback",
};

function formatActivityTime(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function hasNeedsInputSignal(content: string): boolean {
  return /(blocked|requires action|needs input|needs confirmation|manual confirmation|question|not reconstructable|blocker)/i.test(content);
}

function fileStatus(content: string, loading: boolean, error: string | null) {
  if (loading) return { label: "Loading", tone: "neutral" as const };
  if (error) return { label: "Load failed", tone: "error" as const };
  if (hasNeedsInputSignal(content)) return { label: "Partial - needs input", tone: "warn" as const };
  return { label: "Ready", tone: "ok" as const };
}

function downloadMarkdown(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function MarkdownViewer({ ticketId, fileName, phaseName, liveEvents, onBack }: MarkdownViewerProps) {
  const [tab, setTab] = useState<Tab>("markdown");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historicalEvents, setHistoricalEvents] = useState<unknown[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const linkedPhase = phaseName ?? fileToPhase(fileName);

  useEffect(() => {
    setTab("markdown");
    setHistoricalEvents([]);
    setHistoryLoading(false);
    setHistoryLoaded(false);
    setHistoryError(null);
    setCopied(false);
  }, [fileName, linkedPhase, ticketId]);

  useEffect(() => {
    setContent("");
    setError(null);
    setLoading(true);
    fetchTicketFile(ticketId, fileName)
      .then(setContent)
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [ticketId, fileName]);

  useEffect(() => {
    if (!linkedPhase || tab === "markdown" || historyLoaded || historyLoading) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchPhaseLog(ticketId, linkedPhase)
      .then((events) => {
        if (cancelled) return;
        setHistoricalEvents(events);
        setHistoryLoaded(true);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setHistoricalEvents([]);
        setHistoryError(err.message ?? "Failed to load activity");
        setHistoryLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyLoaded, historyLoading, linkedPhase, tab, ticketId]);

  const activityEvents = useMemo(() => historicalEvents.concat(liveEvents), [historicalEvents, liveEvents]);
  const activityItems = useMemo(() => normalizeActivityEvents(activityEvents), [activityEvents]);
  const status = fileStatus(content, loading, error);
  const phaseLabel = linkedPhase ? PHASE_LABELS[linkedPhase] : "Ticket";
  const outlineHeadings = useMemo(() => {
    return content
      .split("\n")
      .map((line) => /^(#{1,2})\s+(.+)$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => !!match)
      .map((match) => match[2].replace(/[*_`[\]()]/g, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [content]);

  useEffect(() => {
    if (tab === "markdown") return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activityItems.length, activityEvents.length, tab]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await navigator.clipboard?.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [content]);

  return (
    <div className="file-viewer">
      <div className="file-viewer__toolbar">
        {onBack ? (
          <button className="file-viewer__button" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span>
            Back to ticket
          </button>
        ) : null}
        <span className="file-viewer__toolbar-spacer" />
        <button className="file-viewer__button" type="button" onClick={handleCopy} disabled={!content || loading}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="file-viewer__button" type="button" onClick={() => downloadMarkdown(fileName, content)} disabled={!content || loading}>
          Download
        </button>
      </div>

      <div className="file-viewer__header">
        <span className="file-viewer__file-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 1.5h6L13 5v9.5H3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M5.5 8.5h5M5.5 11h5M5.5 6h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <div className="file-viewer__header-main">
          <div className="mono file-viewer__file-name">{fileName}</div>
          <div className="file-viewer__file-meta">Generated by {phaseLabel} phase · ticket #{ticketId}</div>
        </div>
        <span className={`file-viewer__status file-viewer__status--${status.tone}`}>
          <span className="file-viewer__status-dot" aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="file-viewer__tabs" role="tablist" aria-label={`${fileName} views`}>
        <button className={`file-viewer__tab${tab === "markdown" ? " file-viewer__tab--active" : ""}`} type="button" onClick={() => setTab("markdown")}>
          Markdown
        </button>
        {linkedPhase && (
          <>
            <button className={`file-viewer__tab${tab === "activity" ? " file-viewer__tab--active" : ""}`} type="button" onClick={() => setTab("activity")}>
              Activity log ({activityItems.length})
            </button>
            <button className={`file-viewer__tab${tab === "raw" ? " file-viewer__tab--active" : ""}`} type="button" onClick={() => setTab("raw")}>
              Raw events ({activityEvents.length})
            </button>
          </>
        )}
      </div>

      {tab === "markdown" && (
        <div className="file-viewer__body file-viewer__body--markdown">
          {loading ? (
            <div className="file-viewer__empty">Loading markdown…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : (
            <MarkdownProse content={content || "_(empty)_"} />
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="file-viewer__body file-viewer__body--activity">
          {historyLoading && activityItems.length === 0 ? (
            <div className="empty">Loading activity…</div>
          ) : historyError ? (
            <div className="error">{historyError}</div>
          ) : activityItems.length === 0 ? (
            <div className="empty">No activity yet.</div>
          ) : (
            <div className="file-activity">
              {activityItems.map((entry) => (
                <article key={entry.id} className={`file-activity__row file-activity__row--${entry.severity}`}>
                  <time className="mono file-activity__time">{formatActivityTime(entry.timestamp) || "—"}</time>
                  <span className={`file-activity__kind file-activity__kind--${entry.kind}`}>
                    <span className="file-activity__dot" aria-hidden="true" />
                    {entry.kind}
                  </span>
                  <div className="file-activity__content">
                    <div className="file-activity__title">{entry.title}</div>
                    {entry.summary ? <SharedMarkdown content={entry.summary} compact /> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      )}

      {tab === "raw" && (
        <div className="file-viewer__body file-viewer__body--raw">
          {historyLoading && activityEvents.length === 0 ? (
            <div className="empty">Loading activity…</div>
          ) : historyError ? (
            <div className="error">{historyError}</div>
          ) : activityEvents.length === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <>
              <pre>{activityEvents.map((event, i) => `[${i}] ${JSON.stringify(event, null, 2)}`).join("\n\n")}
              </pre>
            </>
          )}
          <div ref={logEndRef} />
        </div>
      )}

      {tab === "markdown" && outlineHeadings.length > 0 ? (
        <div className="file-viewer__outline">
          <span className="file-viewer__outline-label">On this page</span>
          {outlineHeadings.map((heading) => (
            <span className="file-viewer__outline-chip" key={heading}>{heading}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
