import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhaseLog } from "../../api";
import { estimateEventPayloadBytes, getActivityMarkdownEntries } from "../../phaseEvents";
import type { PhaseStatus, TicketPhase } from "../../types";
import { MarkdownProse } from "../markdown/MarkdownProse";

interface PhaseLiveFeedProps {
  ticketId: number;
  phaseName: TicketPhase;
  status: PhaseStatus;
  liveEvents: unknown[];
  autoOpenKey?: string;
  fill?: boolean;
}

const AUTO_EXPAND_STATUSES: PhaseStatus[] = ["RUNNING", "QUESTION", "REQUIRES_ACTION", "ERROR"];

export function PhaseLiveFeed({ ticketId, phaseName, status, liveEvents, autoOpenKey, fill = false }: PhaseLiveFeedProps) {
  const [historicalEvents, setHistoricalEvents] = useState<unknown[]>([]);
  const [historicalPayloadBytes, setHistoricalPayloadBytes] = useState(0);
  const [expanded, setExpanded] = useState(() => AUTO_EXPAND_STATUSES.includes(status));
  const [userToggled, setUserToggled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenKeyRef = useRef<string | undefined>(autoOpenKey);

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
    () => historicalPayloadBytes + liveEvents.reduce<number>((total, event) => total + estimateEventPayloadBytes(event), 0),
    [historicalPayloadBytes, liveEvents],
  );
  const isHeavyActivity = totalPayloadBytes > 512 * 1024;

  useEffect(() => {
    if (userToggled) return;
    setExpanded(AUTO_EXPAND_STATUSES.includes(status) && !isHeavyActivity);
  }, [isHeavyActivity, status, userToggled]);

  useEffect(() => {
    if (!autoOpenKey || lastAutoOpenKeyRef.current === autoOpenKey) return;
    lastAutoOpenKeyRef.current = autoOpenKey;
    setUserToggled(false);
    setExpanded(!isHeavyActivity);
  }, [autoOpenKey, isHeavyActivity]);

  useEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activityEntries.length, expanded]);

  return (
    <div className={`phase-live-feed${fill ? " phase-live-feed--fill" : ""}`}>
      <button
        type="button"
        className="phase-card-trigger phase-live-feed__trigger"
        onClick={() => {
          setUserToggled(true);
          setExpanded((prev) => !prev);
        }}
      >
        Activity ({allEvents.length})
      </button>
      {expanded && (
        <div
          ref={bodyRef}
          className="phase-live-feed__body file-viewer__body--markdown"
        >
          {activityEntries.length === 0 ? (
            <div className="phase-live-feed__empty">No events yet.</div>
          ) : (
            <div className="phase-live-feed__entries phase-live-feed__entries--prose">
              {activityEntries.map((entry) => (
                <article key={entry.id} className="phase-live-feed__entry">
                  <MarkdownProse content={entry.content} />
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
