"use client";

import { useEffect, useRef, useState } from "react";
import { CanonicalPreviewMedia } from "@/components/canonical-preview-media";
import type { CanonicalWorkbenchRowDto } from "@/lib/pdm-canonical-workbench-contract";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";

export function previewText(preview: CanonicalPreviewProjection) {
  if (preview.state === "ready") return "";
  if (preview.state === "pending") return "預覽建立中";
  if (preview.state === "delayed") return "預覽服務未回應";
  if (preview.state === "failed" || preview.state === "unavailable") return "預覽暫時無法顯示";
  if (preview.state === "missing") return "無 3D 預覽";
  return "預覽暫時無法顯示";
}

export function stateLabel(preview: CanonicalPreviewProjection) {
  if (preview.state === "ready") return "預覽已就緒";
  return previewText(preview);
}

export function CanonicalPreviewThumbnail({
  preview,
  density
}: {
  preview: CanonicalPreviewProjection;
  density: "gallery" | "inline";
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaIdentity = `${preview.state}|${preview.media?.href ?? ""}`;
  useEffect(() => { setMediaFailed(false); }, [mediaIdentity]);
  const failedPreview = mediaFailed ? { ...preview, state: "unavailable" as const, media: null } : preview;
  const ready = failedPreview.state === "ready" && Boolean(failedPreview.media);
  const accessibleName = `${failedPreview.sourceLabel}，${stateLabel(failedPreview)}`;
  return <span
    className={`canonical-preview-thumbnail is-${density}`}
    role="img"
    aria-label={accessibleName}
    data-canonical-inline-preview={density === "inline" ? "true" : undefined}
    data-preview-state={failedPreview.state}
    onErrorCapture={(event) => {
      if (event.target instanceof HTMLImageElement) setMediaFailed(true);
    }}
  >
    {ready && failedPreview.media ? <CanonicalPreviewMedia media={{ ...failedPreview.media, title: failedPreview.sourceLabel, alt: failedPreview.alt }} interactive={false} compact /> : <span className={`canonical-preview-placeholder is-${failedPreview.state}`}><span className="canonical-preview-placeholder-content">{failedPreview.state === "pending" || failedPreview.state === "delayed" ? <span className="canonical-preview-progress" aria-hidden="true" /> : null}<span>{previewText(failedPreview)}</span></span></span>}
  </span>;
}

export function CanonicalEntityPreviewGallery({
  rows,
  previewByRowKey,
  selectedKey,
  loading,
  onSelect,
  onOpen,
  onCloseDetail
}: {
  rows: readonly CanonicalWorkbenchRowDto[];
  previewByRowKey: Record<string, CanonicalPreviewProjection>;
  selectedKey: string | null;
  loading: boolean;
  onSelect: (row: CanonicalWorkbenchRowDto) => void;
  onOpen: (row: CanonicalWorkbenchRowDto) => void;
  onCloseDetail: () => void;
}) {
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRow = (row: CanonicalWorkbenchRowDto) => {
    onSelect(row);
    cardRefs.current.get(row.rowKey)?.focus();
  };
  const move = (index: number, delta: number) => {
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + delta))];
    if (next) focusRow(next);
  };
  const hasMissingProjection = rows.some((row) => !previewByRowKey[row.rowKey]);
  if (hasMissingProjection) {
    return <div className="canonical-preview-gallery" role="alert">預覽資料暫時無法顯示</div>;
  }

  return <div className="canonical-preview-gallery" role="grid" aria-label="工作台預覽圖" aria-busy={loading} aria-keyshortcuts="ArrowRight ArrowLeft ArrowDown ArrowUp Home End PageUp PageDown Enter Space Escape">
    {loading && rows.length === 0 ? <p className="canonical-empty" role="status">正在載入預覽圖…</p> : null}
    {!loading && rows.length === 0 ? <p className="canonical-empty">沒有符合條件的資料</p> : null}
    {rows.map((row, index) => {
      const preview = previewByRowKey[row.rowKey]!;
      const isInProgress = preview.state === "pending" || preview.state === "delayed";
      const accessibleState = stateLabel(preview);
      const sourceIdentity = preview.sourceDrawingNumber
        ? `${preview.sourceLabel}，${preview.sourceDrawingNumber}${preview.sourceRevision ? `，${preview.sourceRevision}` : ""}`
        : preview.sourceLabel;
      const accessibleName = [row.code, row.name, sourceIdentity, row.layerLabel, row.handlingLabel, accessibleState].filter(Boolean).join("，");
      return <button
        key={row.rowKey}
        ref={(node) => { if (node) cardRefs.current.set(row.rowKey, node); else cardRefs.current.delete(row.rowKey); }}
        type="button"
        className={`canonical-preview-card${selectedKey === row.rowKey ? " is-selected" : ""}`}
        data-canonical-preview-card="true"
        data-row-key={row.rowKey}
        data-preview-state={preview.state}
        aria-label={accessibleName}
        aria-pressed={selectedKey === row.rowKey}
        aria-busy={isInProgress ? "true" : undefined}
        tabIndex={selectedKey === row.rowKey || (!selectedKey && index === 0) ? 0 : -1}
        onClick={() => { onSelect(row); onOpen(row); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
          else if (event.key === "PageDown") { event.preventDefault(); move(index, 4); }
          else if (event.key === "PageUp") { event.preventDefault(); move(index, -4); }
          else if (event.key === "Home") { event.preventDefault(); if (rows[0]) focusRow(rows[0]); }
          else if (event.key === "End") { event.preventDefault(); const last = rows.at(-1); if (last) focusRow(last); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(row); }
          else if (event.key === "Escape") { event.preventDefault(); onCloseDetail(); }
          else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { void navigator.clipboard?.writeText(row.code); }
        }}
      >
        <span className="canonical-preview-media">
          <CanonicalPreviewThumbnail preview={preview} density="gallery" />
        </span>
        <span className="canonical-preview-card-body">
          <span className="canonical-preview-card-heading"><strong>{row.code}</strong><span className="canonical-preview-kind">{preview.sourceType === "custom_image" ? "圖片" : "3D"}</span></span>
          <span className="canonical-preview-card-name">{row.name || "—"}</span>
          <span className="canonical-preview-card-source">{preview.sourceLabel}{preview.sourceDrawingNumber && preview.sourceDrawingNumber !== row.code ? ` · ${preview.sourceDrawingNumber}${preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}` : ""}</span>
          <span className="canonical-preview-card-meta"><span className={`canonical-layer is-${row.layer}`}>{row.layerLabel}</span><span className={`canonical-handling is-${row.handling}`}>{row.handlingLabel}</span></span>
        </span>
      </button>;
    })}
  </div>;
}
