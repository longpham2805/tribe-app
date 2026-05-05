import { memo, useEffect, useMemo, useRef, useState } from "react";
import { fetchPhaseLog } from "../../api";
import { getActivityMarkdownEntries } from "../../phaseEvents";
import type { PhaseLogEvent, TicketPhase } from "../../types";
import { MarkdownProse } from "../markdown/MarkdownProse";

interface PhaseLiveFeedProps {
  ticketId: number;
  phaseName: TicketPhase;
  liveEvents: PhaseLogEvent[];
  fill?: boolean;
}

function activityEntryClassName(tone: string, severity: string): string {
  return [
    "phase-live-feed__entry",
    `phase-live-feed__entry--${tone}`,
    `phase-live-feed__entry--${severity}`,
  ].join(" ");
}

function PhaseLiveFeedComponent({ ticketId, phaseName, liveEvents, fill = false }: PhaseLiveFeedProps) {
  const [historicalEvents, setHistoricalEvents] = useState<PhaseLogEvent[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistoricalEvents([]);
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

  const allEvents = useMemo(() => historicalEvents.concat(liveEvents), [historicalEvents, liveEvents]);
  const activityEntries = useMemo(() => getActivityMarkdownEntries(allEvents, Number.POSITIVE_INFINITY), [allEvents]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activityEntries.length]);

  return (
    <div className={`phase-live-feed${fill ? " phase-live-feed--fill" : ""}`}>
      <div className="phase-card-trigger phase-live-feed__trigger">
        Activity ({activityEntries.length})
      </div>
      <div
        ref={bodyRef}
        className="phase-live-feed__body file-viewer__body--markdown"
      >
        {activityEntries.length === 0 ? (
          <div className="phase-live-feed__empty">No activity to show.</div>
        ) : (
          <div className="phase-live-feed__entries phase-live-feed__entries--prose">
            {activityEntries.map((entry) => (
              <article key={entry.id} className={activityEntryClassName(entry.tone, entry.severity)}>
                <span className="phase-live-feed__tag">{entry.subtypeLabel}</span>
                <MarkdownProse content={entry.content} />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const PhaseLiveFeed = memo(PhaseLiveFeedComponent);
