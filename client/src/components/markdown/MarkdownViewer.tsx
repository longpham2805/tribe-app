import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchPhaseLog, fetchTicketFile } from "../../api";
import { getActivityMarkdownEntries, selectRecentActivityEvents } from "../../phaseEvents";
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

  const activityWindow = useMemo(
    () => selectRecentActivityEvents(historicalEvents, liveEvents),
    [historicalEvents, liveEvents],
  );
  const activityEntries = useMemo(
    () => getActivityMarkdownEntries(activityWindow.events),
    [activityWindow.events],
  );
  const hiddenCount = Math.max(activityWindow.totalCount - activityEntries.length, 0);

  useEffect(() => {
    if (tab === "markdown") return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activityEntries.length, activityWindow.events.length, tab]);

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
              Raw events ({activityWindow.totalCount})
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
              {hiddenCount > 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Showing the most recent {activityEntries.length} of {activityWindow.totalCount} events.
                </div>
              ) : null}
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
          {historyLoading && activityWindow.events.length === 0 ? (
            <div className="empty">Loading activity…</div>
          ) : historyError ? (
            <div className="error">{historyError}</div>
          ) : activityWindow.events.length === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <>
              {hiddenCount > 0 ? (
                <div style={{ marginBottom: 10, color: "#94a3b8" }}>
                  Showing the most recent {activityWindow.events.length} of {activityWindow.totalCount} events.
                </div>
              ) : null}
              <pre>
                {activityWindow.events.map((event, i) => `[${i}] ${JSON.stringify(event, null, 2)}`).join("\n\n")}
              </pre>
            </>
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
