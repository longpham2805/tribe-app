import type { PhaseLogMap, TicketPhase } from "../../../types";
import { PhaseLiveFeed } from "../PhaseLiveFeed";

export function TicketLiveFeedSection({
  ticketId,
  displayedFeedPhaseName,
  hasActivityDock,
  liveLogs,
  phaseLabels,
}: {
  ticketId: number;
  displayedFeedPhaseName: TicketPhase | undefined;
  hasActivityDock: boolean;
  liveLogs: PhaseLogMap;
  phaseLabels: Record<TicketPhase, string>;
}) {
  if (!displayedFeedPhaseName) return null;

  return (
    <section className={`td-section td-activity-section${hasActivityDock ? " td-activity-section--docked" : ""}`}>
      <div className="td-section-header">
        <div>
          <div className="td-section-label">Live feed</div>
          <div className="td-section-caption">Showing {phaseLabels[displayedFeedPhaseName] ?? displayedFeedPhaseName} activity.</div>
        </div>
      </div>
      <PhaseLiveFeed
        ticketId={ticketId}
        phaseName={displayedFeedPhaseName}
        liveEvents={liveLogs[`${ticketId}:${displayedFeedPhaseName}`] ?? []}
        fill={hasActivityDock}
      />
    </section>
  );
}
