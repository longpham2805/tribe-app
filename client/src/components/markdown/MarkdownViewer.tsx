import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchPhaseLog, fetchTicketFile } from "../../api";
import { getActivityMarkdownEntries } from "../../phaseEvents";
import type { TicketPhase } from "../../types";
import { SharedMarkdown } from "./SharedMarkdown";

type Tab = "markdown" | "activity" | "raw";

interface MarkdownViewerProps {
  ticketId: number;
  fileName: string;
  phaseName: TicketPhase | null;
  liveEvents: any[];
}

function fileToPhase(fileName: string): TicketPhase | null {
  const base = fileName.replace(/\.md$/, "").toLowerCase();
  if (base === "planning") return "PLANNING";
  if (base === "implementation") return "IMPLEMENTATION";
  if (base === "ticket") return "CREATED";
  return null;
}

export function MarkdownViewer({ ticketId, fileName, phaseName, liveEvents }: MarkdownViewerProps) {
  const [tab, setTab] = useState<Tab>("markdown");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historicalEvents, setHistoricalEvents] = useState<unknown[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const linkedPhase = phaseName ?? fileToPhase(fileName);

  useEffect(() => {
    setTab("markdown");
    setHistoricalEvents([]);
    setHistoryLoading(false);
    setHistoryLoaded(false);
    setHistoryError(null);
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
  const activityEntries = useMemo(() => getActivityMarkdownEntries(activityEvents, Number.POSITIVE_INFINITY), [activityEvents]);

  useEffect(() => {
    if (tab === "markdown") return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activityEntries.length, activityEvents.length, tab]);

  return (
    <div>
      <div className="tabs-row">
        <button className={`tab ${tab === "markdown" ? "active" : ""}`} onClick={() => setTab("markdown")}>
          Markdown
        </button>
        {linkedPhase && (
          <>
            <button className={`tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>
              Activity log
            </button>
            <button className={`tab ${tab === "raw" ? "active" : ""}`} onClick={() => setTab("raw")}>
              Raw events ({activityEvents.length})
            </button>
          </>
        )}
      </div>

      {tab === "markdown" && (
        <div className="markdown-body">
          {loading ? (
            "Loading..."
          ) : error ? (
            <div className="error">{error}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ alt, src, title }) => (
                  <img src={src} alt={alt} title={title} style={{ maxWidth: "100%", height: "auto" }} />
                ),
              }}
            >
              {content || "_(empty)_"}
            </ReactMarkdown>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="log-body">
          {historyLoading && activityEntries.length === 0 ? (
            <div className="empty">Loading activity…</div>
          ) : historyError ? (
            <div className="error">{historyError}</div>
          ) : activityEntries.length === 0 ? (
            <div className="empty">No activity yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {activityEntries.map((entry) => (
                <SharedMarkdown key={entry.id} content={entry.content} />
              ))}
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      )}

      {tab === "raw" && (
        <div className="log-body">
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
    </div>
  );
}
