import { getPriorityKey } from "./mondayImportUtils";

export function PriorityChip({ label }: { label: string }) {
  const priorityKey = getPriorityKey(label);
  return (
    <span className={`monday-import-priority monday-import-priority--${priorityKey}`}>
      <span className="monday-import-priority__dot" />
      {label}
    </span>
  );
}

export function TagChip({ text }: { text: string }) {
  return <span className="monday-import-tag">{text}</span>;
}
