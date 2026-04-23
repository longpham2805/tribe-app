import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchTicketFile, fetchPhaseLog } from "./api";
import { extractAssistantText } from "./phaseEvents";
import type { TicketPhase } from "./types";

type Tab = "markdown" | "assistant" | "raw";

interface Props {
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

export function MarkdownViewer({ ticketId, fileName, phaseName, liveEvents }: Props) {
  const [tab, setTab] = useState<Tab>("markdown");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [historicalEvents, setHistoricalEvents] = useState<any[]>([]);
  const logEnd = useRef<HTMLDivElement | null>(null);

  const linkedPhase = phaseName ?? fileToPhase(fileName);

  useEffect(() => {
    setContent("");
    setErr(null);
    setLoading(true);
    fetchTicketFile(ticketId, fileName)
      .then(setContent)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [ticketId, fileName]);

  useEffect(() => {
    if (!linkedPhase) return;
    fetchPhaseLog(ticketId, linkedPhase)
      .then(setHistoricalEvents)
      .catch(() => setHistoricalEvents([]));
  }, [ticketId, linkedPhase]);

  const allEvents = useMemo(
    () => [...historicalEvents, ...liveEvents],
    [historicalEvents, liveEvents],
  );

  const assistantText = useMemo(
    () => allEvents.map(extractAssistantText).filter(Boolean).join("\n\n"),
    [allEvents],
  );

  useEffect(() => {
    if (tab !== "markdown") {
      logEnd.current?.scrollIntoView({ block: "end" });
    }
  }, [allEvents, tab]);

  return (
    <div>
      <div className="tabs-row">
        <button className={`tab ${tab === "markdown" ? "active" : ""}`} onClick={() => setTab("markdown")}>
          Markdown
        </button>
        {linkedPhase && (
          <>
            <button className={`tab ${tab === "assistant" ? "active" : ""}`} onClick={() => setTab("assistant")}>
              Assistant log
            </button>
            <button className={`tab ${tab === "raw" ? "active" : ""}`} onClick={() => setTab("raw")}>
              Raw events ({allEvents.length})
            </button>
          </>
        )}
      </div>

      {tab === "markdown" && (
        <div className="markdown-body">
          {loading ? "Loading…" : err ? <div className="error">{err}</div> :
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "_(empty)_"}</ReactMarkdown>}
        </div>
      )}

      {tab === "assistant" && (
        <div className="log-body">
          {assistantText ? (
            <div style={{ lineHeight: 1.6 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                  table: ({ children }) => (
                    <div style={{ overflowX: "auto", margin: "0 0 10px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th style={{ textAlign: "left", border: "1px solid #334155", padding: "6px 8px" }}>{children}</th>
                  ),
                  td: ({ children }) => (
                    <td style={{ border: "1px solid #334155", padding: "6px 8px", verticalAlign: "top" }}>{children}</td>
                  ),
                }}
              >
                {assistantText}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="empty">No assistant output yet.</div>
          )}
          <div ref={logEnd} />
        </div>
      )}

      {tab === "raw" && (
        <div className="log-body">
          {allEvents.length === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <pre>
              {allEvents
                .map((e, i) => `[${i}] ${JSON.stringify(e, null, 2)}`)
                .join("\n\n")}
            </pre>
          )}
          <div ref={logEnd} />
        </div>
      )}
    </div>
  );
}
