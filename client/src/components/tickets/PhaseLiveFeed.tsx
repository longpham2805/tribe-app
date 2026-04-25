import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhaseLog } from "../../api";
import { estimateEventPayloadBytes, getActivityMarkdownEntries } from "../../phaseEvents";
import type { PhaseStatus, TicketPhase } from "../../types";
import { SharedMarkdown } from "../markdown/SharedMarkdown";

interface PhaseLiveFeedProps {
  ticketId: number;
  phaseName: TicketPhase;
  status: PhaseStatus;
  liveEvents: any[];
}

const AUTO_EXPAND_STATUSES: PhaseStatus[] = ["RUNNING", "QUESTION", "REQUIRES_ACTION", "ERROR"];

export function PhaseLiveFeed({ ticketId, phaseName, status, liveEvents }: PhaseLiveFeedProps) {
  const [historicalEvents, setHistoricalEvents] = useState<unknown[]>([]);
  const [historicalPayloadBytes, setHistoricalPayloadBytes] = useState(0);
  const [expanded, setExpanded] = useState(() => AUTO_EXPAND_STATUSES.includes(status));
  const [userToggled, setUserToggled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistoricalEvents([]);
    setHistoricalPayloadBytes(0);
    fetchPhaseLog(ticketId, phaseName)
      .then((events) => {
        if (!cancelled) {
          setHistoricalEvents(events);
          setHistoricalPayloadBytes(events.reduce((total, event) => total + estimateEventPayloadBytes(event), 0));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoricalEvents([]);
          setHistoricalPayloadBytes(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, phaseName]);

  useEffect(() => {
    setUserToggled(false);
  }, [ticketId, phaseName]);

  const allEvents = useMemo(() => historicalEvents.concat(liveEvents), [historicalEvents, liveEvents]);
  const activityEntries = useMemo(() => getActivityMarkdownEntries(allEvents, Number.POSITIVE_INFINITY), [allEvents]);
  const totalPayloadBytes = useMemo(
    () => historicalPayloadBytes + liveEvents.reduce((total, event) => total + estimateEventPayloadBytes(event), 0),
    [historicalPayloadBytes, liveEvents],
  );
  const isHeavyActivity = totalPayloadBytes > 512 * 1024;

  useEffect(() => {
    if (userToggled) return;
    setExpanded(AUTO_EXPAND_STATUSES.includes(status) && !isHeavyActivity);
  }, [isHeavyActivity, status, userToggled]);

  useEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [expanded, activityEntries.length]);

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        className="phase-card-trigger"
        onClick={() => {
          setUserToggled(true);
          setExpanded((prev) => !prev);
        }}
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
          {activityEntries.length === 0 ? (
            <div style={{ fontSize: 11, color: "#64748b" }}>No events yet.</div>
          ) : (
            <div style={{ color: "#cbd5e1", display: "grid", gap: 12 }}>
              {activityEntries.map((entry) => (
                <SharedMarkdown key={entry.id} content={entry.content} compact />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
