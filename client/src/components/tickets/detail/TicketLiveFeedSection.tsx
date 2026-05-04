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
    <div className={`td-section td-activity-section${hasActivityDock ? " td-activity-section--docked" : ""}`}>
      <div className="td-section-label">
        Live feed · {phaseLabels[displayedFeedPhaseName] ?? displayedFeedPhaseName}
      </div>
      <PhaseLiveFeed
        ticketId={ticketId}
        phaseName={displayedFeedPhaseName}
        status={displayedFeedPhaseStatus}
        liveEvents={liveLogs[`${ticketId}:${displayedFeedPhaseName}`] ?? []}
        autoOpenKey={selectedPhaseAutoOpenKey}
        fill={hasActivityDock}
      />
    </div>
  );
}
