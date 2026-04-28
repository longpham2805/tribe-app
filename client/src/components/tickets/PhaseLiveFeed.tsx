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

function activityEntryClassName(tone: string, severity: string): string {
  return [
    "phase-live-feed__entry",
    `phase-live-feed__entry--${tone}`,
    `phase-live-feed__entry--${severity}`,
  ].join(" ");
}

export function PhaseLiveFeed({ ticketId, phaseName, status, liveEvents, autoOpenKey, fill = false }: PhaseLiveFeedProps) {
  const [historicalEvents, setHistoricalEvents] = useState<unknown[]>([]);
  const [historicalPayloadBytes, setHistoricalPayloadBytes] = useState(0);
  const [expanded, setExpanded] = useState(() => AUTO_EXPAND_STATUSES.includes(status));
  const [expandedFullEvents, setExpandedFullEvents] = useState<Set<string>>(() => new Set());
  const [expandedToolResults, setExpandedToolResults] = useState<Set<string>>(() => new Set());
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
    setExpandedFullEvents(new Set());
    setExpandedToolResults(new Set());
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
                <article key={entry.id} className={activityEntryClassName(entry.tone, entry.severity)}>
                  <MarkdownProse content={entry.content} />
                  {entry.toolResults?.map((toolResult) => {
                    const toolResultKey = `${entry.id}:${toolResult.id}`;
                    const isToolResultExpanded = expandedToolResults.has(toolResultKey);
                    return (
                      <div key={toolResultKey} className="phase-live-feed__tool-result">
                        <button
                          type="button"
                          className="phase-live-feed__disclosure-toggle"
                          aria-expanded={isToolResultExpanded}
                          onClick={() => {
                            setExpandedToolResults((prev) => {
                              const next = new Set(prev);
                              if (next.has(toolResultKey)) {
                                next.delete(toolResultKey);
                              } else {
                                next.add(toolResultKey);
                              }
                              return next;
                            });
                          }}
                        >
                          {isToolResultExpanded ? "Hide tool result" : "Show tool result"}
                        </button>
                        {isToolResultExpanded && (
                          <div className="phase-live-feed__tool-result-content">
                            <MarkdownProse
                              content={`**${toolResult.label}:**${toolResult.isError ? " _error_" : ""}\n\n${toolResult.content}`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {entry.fullEventContent && (
                    <div className="phase-live-feed__full-event">
                      <button
                        type="button"
                        className="phase-live-feed__disclosure-toggle"
                        aria-expanded={expandedFullEvents.has(entry.id)}
                        onClick={() => {
                          setExpandedFullEvents((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.id)) {
                              next.delete(entry.id);
                            } else {
                              next.add(entry.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {expandedFullEvents.has(entry.id) ? "Hide full event" : "Show full event"}
                      </button>
                      {expandedFullEvents.has(entry.id) && (
                        <div className="phase-live-feed__full-event-content">
                          <MarkdownProse content={`**Full event**\n\n${entry.fullEventContent}`} />
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
