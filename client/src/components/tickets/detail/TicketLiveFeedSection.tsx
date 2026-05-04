import type { PhaseLogMap, PhaseStatus, TicketPhase } from "../../../types";
import { PhaseLiveFeed } from "../PhaseLiveFeed";

export function TicketLiveFeedSection({
  ticketId,
  displayedFeedPhaseName,
  displayedFeedPhaseStatus,
  hasActivityDock,
  liveLogs,
  selectedPhaseAutoOpenKey,
  phaseLabels,
}: {
  ticketId: number;
  displayedFeedPhaseName: TicketPhase | undefined;
  displayedFeedPhaseStatus: PhaseStatus;
  hasActivityDock: boolean;
  liveLogs: PhaseLogMap;
  selectedPhaseAutoOpenKey: string | undefined;
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
        status={displayedFeedPhaseStatus}
        liveEvents={liveLogs[`${ticketId}:${displayedFeedPhaseName}`] ?? []}
        autoOpenKey={selectedPhaseAutoOpenKey}
        fill={hasActivityDock}
      />
    </section>
  );
}
