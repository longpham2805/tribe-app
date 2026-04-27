import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: string;
  subtitle?: string;
  headerLabel?: string;
  children: ReactNode;
  width?: number;
  variant?: "center" | "right-pane";
  noHeader?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
}

export function Modal({
  open,
  onClose,
  onBack,
  title,
  subtitle,
  headerLabel,
  children,
  width = 820,
  variant = "center",
  noHeader = false,
  panelClassName,
  bodyClassName,
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
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previousActiveElement?.focus();
  }, [open, variant]);

  if (!open) return null;

  const panelStyle: CSSProperties =
    variant === "right-pane"
      ? { width: `min(100vw, ${width}px)` }
      : { width, maxWidth: "95vw" };

  const isRightPane = variant === "right-pane";

  const closeBtnStyle: CSSProperties = {
    background: "transparent",
    border: "1px solid var(--hairline-strong)",
    borderRadius: 7,
    color: "var(--ink-3)",
    fontSize: "1rem",
    lineHeight: 1,
    cursor: "pointer",
    padding: "3px 7px",
    transition: "color 0.15s, border-color 0.15s",
    flexShrink: 0,
  };

  const backBtnStyle: CSSProperties = {
    background: "transparent",
    border: "1px solid var(--hairline-strong)",
    borderRadius: 7,
    color: "var(--ink-3)",
    fontSize: "0.9rem",
    lineHeight: 1,
    cursor: "pointer",
    padding: "4px 9px",
    transition: "color 0.15s, border-color 0.15s",
    flexShrink: 0,
    fontFamily: "inherit",
  };

  return (
    <div className={`modal-backdrop modal-backdrop--${variant}`} onClick={isRightPane ? undefined : onClose}>
      <div
        ref={panelRef}
        className={`modal-panel modal-panel--${variant}${panelClassName ? ` ${panelClassName}` : ""}`}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal={isRightPane ? undefined : "true"}
        aria-labelledby={noHeader ? undefined : titleId}
        aria-label={noHeader ? title : undefined}
        tabIndex={-1}
      >
        {!noHeader && (
          <div className="modal-header">
            {onBack && (
              <button style={backBtnStyle} type="button" onClick={onBack} title="Back" aria-label="Back">
                ←
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {headerLabel && (
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                  {headerLabel}
                </div>
              )}
              <div className="modal-title" id={titleId}>{title}</div>
              {subtitle && (
                <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 2 }}>{subtitle}</div>
              )}
            </div>
            <button style={closeBtnStyle} type="button" onClick={onClose} title="Close" aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div className={`modal-body modal-body--${variant}${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
      </div>
    </div>
  );
}
