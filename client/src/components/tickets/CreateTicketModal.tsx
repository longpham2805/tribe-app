import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { CliType, Project } from "../../types";
import { ImageDropZone } from "./ImageDropZone";

type CreateTicketFormValues = {
  title: string;
  description: string;
  cliType: CliType | "";
};

interface CreateTicketModalProps {
  open: boolean;
  creating: boolean;
  projectId: number | null;
  projects: Project[];
  availableCliTypes: CliType[];
  onClose: () => void;
  onSubmit: (values: CreateTicketFormValues, files: File[]) => Promise<void>;
}

export function CreateTicketModal({
  open,
  creating,
  projectId,
  projects,
  availableCliTypes,
  onClose,
  onSubmit,
}: CreateTicketModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<CreateTicketFormValues>({
    defaultValues: {
      title: "",
      description: "",
      cliType: "",
    },
  });
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const selectedCliType = watch("cliType");
  const title = watch("title");

  useEffect(() => {
    if (!open) {
      reset();
      setPendingImages([]);
    }
  }, [open, reset]);

  useEffect(() => {
    if (selectedCliType && !availableCliTypes.includes(selectedCliType)) {
      setValue("cliType", "");
    }
  }, [availableCliTypes, selectedCliType, setValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const projectOptions = useMemo(() => projects, [projects]);

  if (!open) return null;

  return (
    <div className="ntm-backdrop" onClick={onClose}>
      <div className="ntm-panel" onClick={(event) => event.stopPropagation()}>
        <div className="ntm-panel__header">
          <h2 className="serif ntm-panel__title">New ticket</h2>
          <p className="ntm-panel__sub">Tribe will route it through Created → Planning → Implementation → Ship.</p>
        </div>
        <form
          className="ntm-panel__form"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values, pendingImages);
            reset();
            setPendingImages([]);
          })}
        >
          <label className="ntm-field">
            <span className="ntm-field__label">Title</span>
            <input
              className="input"
              placeholder="Short, action-oriented title…"
              autoFocus
              {...register("title", { required: true })}
            />
          </label>
          <label className="ntm-field">
            <span className="ntm-field__label">Description</span>
            <textarea
              className="input textarea"
              placeholder="What's problem? What does done look like?"
              rows={4}
              {...register("description")}
            />
          </label>
          <ImageDropZone files={pendingImages} onChange={setPendingImages} disabled={creating || isSubmitting} />
          <div className="ntm-grid-2">
            <label className="ntm-field">
              <span className="ntm-field__label">Project</span>
              <select className="input" value={projectId ?? ""} disabled>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
                {projectId == null && <option value="">All projects</option>}
              </select>
            </label>
            <label className="ntm-field">
              <span className="ntm-field__label">Agent</span>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { key: "" as CliType | "", label: "Auto" },
                  { key: "CLAUDE" as CliType, label: "Claude" },
                  { key: "CODEX" as CliType, label: "Codex" },
                ] as const).map((option) => (
                  <button
                    key={option.key || "AUTO"}
                    type="button"
                    disabled={option.key !== "" && !availableCliTypes.includes(option.key)}
                    onClick={() => setValue("cliType", option.key)}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      borderRadius: 8,
                      background: selectedCliType === option.key ? "var(--ink)" : "transparent",
                      color: selectedCliType === option.key ? "var(--cream)" : "var(--ink-2)",
                      border: "1px solid",
                      borderColor:
                        selectedCliType === option.key ? "var(--ink)" : "var(--hairline-strong)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 13,
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      opacity: option.key !== "" && !availableCliTypes.includes(option.key) ? 0.4 : 1,
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="ntm-panel__footer">
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              Press <kbd style={{ fontFamily: "inherit", background: "var(--paper)", border: "1px solid var(--hairline-strong)", borderRadius: 4, padding: "1px 5px", fontSize: 10.5 }}>Esc</kbd> to cancel
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={creating || isSubmitting || !title.trim()}>
                {creating || isSubmitting ? "Creating…" : "Create ticket"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
