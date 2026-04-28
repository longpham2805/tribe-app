import { useCallback, useEffect, useRef, useState } from "react";

export interface ImageDropZoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

function ImagePreview({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="image-drop-zone__thumb">
      <img src={src} alt={file.name} className="image-drop-zone__thumb-img" />
      <button
        type="button"
        className="image-drop-zone__remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
      <span className="image-drop-zone__filename">{file.name}</span>
    </div>
  );
}

export function ImageDropZone({ files, onChange, disabled }: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      const images = Array.from(incoming).filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      onChange([...files, ...images]);
    },
    [files, onChange],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!disabled) setDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (!disabled) addFiles(event.dataTransfer.files);
    },
    [disabled, addFiles],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, fileIndex) => fileIndex !== index));
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
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") handleClick();
        }}
        aria-label="Upload images"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={(event) => addFiles(event.target.files)}
          onClick={(event) => event.stopPropagation()}
        />
        <span className="image-drop-zone__label">
          {dragging ? "Drop images here" : "Drag images or click to browse"}
        </span>
      </div>

      {files.length > 0 && (
        <div className="image-drop-zone__previews">
          {files.map((file, index) => (
            <ImagePreview
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              file={file}
              disabled={disabled}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
