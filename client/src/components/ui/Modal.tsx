import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 820 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ width, maxWidth: "95vw" }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn-delete" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
