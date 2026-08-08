"use client";

import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { formatBytes } from "@/lib/format-file-size";

export type FileDropzoneRejectReason = "single_file_only" | "disabled";

type FileDropzoneProps = {
  accept?: string;
  children?: ReactNode;
  className?: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  multiple?: boolean;
  selectedFile?: File | null;
  selectedFiles?: File[];
  variant?: "default" | "compact";
  onClearSelected?: () => void;
  onFilesSelected: (files: File[]) => void;
  onReject?: (reason: FileDropzoneRejectReason, files: File[]) => void;
};

export function FileDropzone({
  accept,
  children,
  className = "",
  description,
  disabled = false,
  icon,
  label,
  multiple = false,
  selectedFile,
  selectedFiles,
  variant = "default",
  onClearSelected,
  onFilesSelected,
  onReject
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const files = selectedFiles ?? (selectedFile ? [selectedFile] : []);

  function selectFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);
    if (disabled) {
      onReject?.("disabled", nextFiles);
      return;
    }
    if (!multiple && nextFiles.length > 1) {
      onReject?.("single_file_only", nextFiles);
      return;
    }
    onFilesSelected(nextFiles);
    if (inputRef.current) inputRef.current.value = "";
  }

  const classes = [
    "file-dropzone",
    variant === "compact" ? "compact" : "",
    dragOver ? "drag-over" : "",
    disabled ? "disabled" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label
      className={classes}
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        selectFiles(event.dataTransfer.files);
      }}
    >
      <span className="file-dropzone-icon" aria-hidden="true">
        {icon ?? <UploadCloud size={variant === "compact" ? 20 : 28} />}
      </span>
      <span className="file-dropzone-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
        {children}
      </span>
      {files.length > 0 ? (
        <span className="file-dropzone-selection">
          {files.map((file) => (
            <span className="file-dropzone-chip" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <span title={file.name}>{file.name}</span>
              <small>{formatBytes(file.size)}</small>
            </span>
          ))}
          {onClearSelected ? (
            <button
              className="icon-button"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClearSelected();
                if (inputRef.current) inputRef.current.value = "";
              }}
              title="清除已選檔案"
              aria-label="清除已選檔案"
            >
              <X size={14} />
            </button>
          ) : null}
        </span>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => selectFiles(event.currentTarget.files ?? [])}
      />
    </label>
  );
}
