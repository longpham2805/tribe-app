import type { PhaseStatus, Ticket, TicketPhase } from "../../../types";

export function TicketLifecycle({
  ticket,
  phases,
  selectedPhase,
  triggeringPhase,
  ticketRunning,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  onSelectPhase,
  onTriggerPhase,
}: {
  ticket: Ticket;
  phases: readonly TicketPhase[];
  selectedPhase: TicketPhase | undefined;
  triggeringPhase: string | null;
  ticketRunning: boolean;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  onSelectPhase: (ticketId: number, phase: TicketPhase) => void;
  onTriggerPhase: (ticketId: number, phase: TicketPhase) => void;
}) {
  if (ticket.phases.length === 0) return null;

  return (
    <section className="td-section td-lifecycle-section">
      <div className="td-section-header">
        <div>
          <div className="td-section-label">Lifecycle</div>
          <div className="td-section-caption">Select a phase to inspect its feed. Trigger actions stay with phase state.</div>
        </div>
      </div>
      <div className="td-lifecycle">
        {phases.map((phase) => {
          const phaseRecord = ticket.phases.find((item) => item.phaseName === phase);
          const isCompleted = !!phaseRecord?.completedAt;
          const isActive = !!phaseRecord?.startedAt && !phaseRecord?.completedAt;
          const status = phaseRecord?.status ?? "PENDING";
          const isPaused = isActive && (status === "REQUIRES_ACTION" || status === "QUESTION" || status === "ERROR");
          const isRunning = isActive && status === "RUNNING";
          const phaseColor = phaseColors[phase];
          const statusColor = statusColors[status];
          const accent = isPaused ? (statusColor ?? "var(--status-warn)") : phaseColor;
          const isBusy = triggeringPhase === `${ticket.id}:${phase}`;
          const isSelected = selectedPhase === phase;
          const stateLabel = isCompleted
            ? "Completed"
            : isRunning
              ? "Running…"
              : isPaused
                ? (statusLabels[status] ?? "Paused")
                : isActive
                  ? "Active"
                  : "Pending";

          return (
            <div
              key={phase}
              role="button"
              tabIndex={0}
              className={`td-lc-card${isSelected ? " td-lc-card--selected" : ""}`}
              style={{
                borderColor: (isActive || isPaused || isCompleted)
                  ? `color-mix(in srgb, ${accent} 30%, var(--hairline))`
                  : undefined,
                boxShadow: isRunning ? `0 0 0 2px color-mix(in srgb, ${accent} 25%, transparent)` : undefined,
              }}
              onClick={() => onSelectPhase(ticket.id, phase)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectPhase(ticket.id, phase);
                }
              }}
            >
              <div className="td-lc-card__head">
                <span
                  className="td-lc-card__circle"
                  style={{
                    background: isCompleted ? accent : "transparent",
                    borderColor: isCompleted ? accent : `color-mix(in srgb, ${accent} 50%, var(--hairline-strong))`,
                  }}
                >
                  {isCompleted && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 5l2.5 2.5L8 3" stroke="var(--cream)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {isRunning && <span className="td-lc-card__pulse" style={{ background: accent }} />}
                  {isPaused && (
                    <span style={{ fontSize: 9, color: accent, fontWeight: 700, lineHeight: 1 }}>
                      {status === "QUESTION" ? "?" : "!"}
                    </span>
                  )}
                </span>
                <span className="td-lc-card__name">{phaseLabels[phase]}</span>
              </div>
              <div className="td-lc-card__status" style={{ color: (isActive || isPaused) ? accent : undefined }}>
                {stateLabel}
              </div>
              <button
                className="td-lc-card__trigger"
                type="button"
                disabled={isBusy || ticketRunning}
                onClick={(event) => {
                  event.stopPropagation();
                  onTriggerPhase(ticket.id, phase);
                }}
                title={ticketRunning ? "A phase is already running" : `Trigger ${phaseLabels[phase]}`}
              >
                {isBusy ? "…" : "Trigger"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
