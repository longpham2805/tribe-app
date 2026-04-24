import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchPhaseLog, fetchTicketFile } from "../../api";
import { extractAssistantText } from "../../phaseEvents";
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
  if (base === "brainstorm") return "BRAINSTORM";
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
  const [historicalEvents, setHistoricalEvents] = useState<any[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const linkedPhase = phaseName ?? fileToPhase(fileName);

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
    if (!linkedPhase) return;
    fetchPhaseLog(ticketId, linkedPhase)
      .then(setHistoricalEvents)
      .catch(() => setHistoricalEvents([]));
  }, [ticketId, linkedPhase]);

  const allEvents = useMemo(() => [...historicalEvents, ...liveEvents], [historicalEvents, liveEvents]);
  const activityText = useMemo(
    () => allEvents.map(extractAssistantText).filter(Boolean).join("\n\n"),
    [allEvents],
  );

  useEffect(() => {
    if (tab === "markdown") return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [allEvents, tab]);

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
              Raw events ({allEvents.length})
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "_(empty)_"}</ReactMarkdown>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="log-body">
          {activityText ? <SharedMarkdown content={activityText} /> : <div className="empty">No activity yet.</div>}
          <div ref={logEndRef} />
        </div>
      )}

      {tab === "raw" && (
        <div className="log-body">
          {allEvents.length === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <pre>{allEvents.map((event, i) => `[${i}] ${JSON.stringify(event, null, 2)}`).join("\n\n")}</pre>
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
