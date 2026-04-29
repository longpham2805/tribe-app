import { BackIcon, MondayDotsIcon } from "./MondayImportIcons";

export function MondayImportHeader({
  step,
  onBack,
  onClose,
}: {
  step: "browse" | "configure";
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <header className={`monday-import__header monday-import__header--${step}`}>
      {step === "configure" ? (
        <button className="monday-import__icon-button" type="button" onClick={onBack} title="Back" aria-label="Back">
          <BackIcon />
        </button>
      ) : (
        <span className="monday-import__app-icon">
          <MondayDotsIcon />
        </span>
      )}

      <div className="monday-import__heading">
        {step === "configure" && <div className="monday-import__eyebrow">STEP 2 OF 2 · ADD CONTEXT</div>}
        <h2 className="monday-import__title">Import from Monday</h2>
        {step === "browse" && (
          <p className="monday-import__subtitle">Pick a ticket to pull into Tribe — you'll add Tribe-specific context next.</p>
        )}
      </div>

      <button className="monday-import__icon-button monday-import__close-button" type="button" onClick={onClose} title="Close" aria-label="Close">
        ×
      </button>
    </header>
  );
}
