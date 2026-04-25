import { useCallback, useRef, useState } from "react";

export interface ImageDropZoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function ImageDropZone({ files, onChange, disabled }: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      const images = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      onChange([...files, ...images]);
    },
    [files, onChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!disabled) addFiles(e.dataTransfer.files);
    },
    [disabled, addFiles],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index));
    },
    [files, onChange],
  );

  return (
    <div className="image-drop-zone-wrapper">
      <div
        className={`image-drop-zone${dragging ? " image-drop-zone--dragging" : ""}${disabled ? " image-drop-zone--disabled" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
        aria-label="Upload images"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => addFiles(e.target.files)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="image-drop-zone__label">
          {dragging ? "Drop images here" : "Drag images or click to browse"}
        </span>
      </div>

      {files.length > 0 && (
        <div className="image-drop-zone__previews">
          {files.map((file, index) => (
            <div key={index} className="image-drop-zone__thumb">
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="image-drop-zone__thumb-img"
              />
              <button
                type="button"
                className="image-drop-zone__remove"
                onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
              <span className="image-drop-zone__filename">{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
