import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhaseLog } from "./api";
import { extractAssistantText } from "./phaseEvents";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PhaseStatus, TicketPhase } from "./types";

interface Props {
  ticketId: number;
  phaseName: TicketPhase;
  status: PhaseStatus;
  liveEvents: any[];
}

const AUTO_EXPAND_STATUSES: PhaseStatus[] = ["RUNNING", "QUESTION", "REQUIRES_ACTION", "ERROR"];

export function PhaseLiveFeed({ ticketId, phaseName, status, liveEvents }: Props) {
  const [historicalEvents, setHistoricalEvents] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(() => AUTO_EXPAND_STATUSES.includes(status));
  const lastStatusRef = useRef<PhaseStatus>(status);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPhaseLog(ticketId, phaseName)
      .then((events) => {
        if (!cancelled) setHistoricalEvents(events);
      })
      .catch(() => {
        if (!cancelled) setHistoricalEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, phaseName]);

  useEffect(() => {
    const wasAuto = AUTO_EXPAND_STATUSES.includes(lastStatusRef.current);
    const isAuto = AUTO_EXPAND_STATUSES.includes(status);
    if (!wasAuto && isAuto) setExpanded(true);
    lastStatusRef.current = status;
  }, [status]);

  const allEvents = useMemo(() => [...historicalEvents, ...liveEvents], [historicalEvents, liveEvents]);
  const assistantText = useMemo(
    () => allEvents.map(extractAssistantText).filter(Boolean).join("\n\n"),
    [allEvents],
  );

  useEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [expanded, assistantText]);

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        className="phase-card-trigger"
        onClick={() => setExpanded((prev) => !prev)}
        style={{ fontSize: 11 }}
      >
        Activity ({allEvents.length})
      </button>
      {expanded && (
        <div
          ref={bodyRef}
          style={{
            marginTop: 6,
            maxHeight: 500,
            overflowY: "auto",
            border: "1px solid #1e2a3a",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#0f1117",
          }}
        >
          {assistantText.trim().length === 0 ? (
            <div style={{ fontSize: 11, color: "#64748b" }}>No events yet.</div>
          ) : (
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.6, wordBreak: "break-word" }}>
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
          )}
        </div>
      )}
    </div>
  );
}
