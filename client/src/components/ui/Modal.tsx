import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  variant?: "center" | "right-pane";
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 820,
  variant = "center",
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || variant !== "right-pane") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open || variant !== "right-pane") return;

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previousActiveElement?.focus();
  }, [open, variant]);

  if (!open) return null;

  const panelStyle: CSSProperties =
    variant === "right-pane"
      ? { width: `min(100vw, ${width}px)` }
      : { width, maxWidth: "95vw" };

  return (
    <div className={`modal-backdrop modal-backdrop--${variant}`} onClick={onClose}>
      <div
        ref={panelRef}
        className={`modal-panel modal-panel--${variant}`}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div className="modal-title" id={titleId}>
            {title}
          </div>
          <button className="btn-delete" type="button" onClick={onClose} title="Close" aria-label="Close">
            ×
          </button>
        </div>
        <div className={`modal-body modal-body--${variant}`}>{children}</div>
      </div>
    </div>
  );
}
