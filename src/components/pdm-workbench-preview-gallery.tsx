"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { HumanStatusBadge } from "@/components/human-status-badge";
import type { PdmWorkbenchPreviewSummary } from "@/lib/pdm-workbench-contract";

type GalleryRow = { rowKey: string; displayCode: string; displayName: string; preview?: PdmWorkbenchPreviewSummary | null; humanStatus: Parameters<typeof HumanStatusBadge>[0]["status"]; viewerStatus: Parameters<typeof HumanStatusBadge>[0]["viewerStatus"]; availabilityScope: Parameters<typeof HumanStatusBadge>[0]["availabilityScope"] };

function previewMessage(preview: PdmWorkbenchPreviewSummary | null | undefined) {
  if (!preview || preview.state === "missing") return "無 3D 預覽";
  if (preview.state === "pending") return "預覽產生中";
  if (preview.state === "delayed") return "預覽處理較久";
  if (preview.state === "failed") return "預覽暫時無法顯示";
  if (preview.state === "unavailable") return "預覽暫時無法顯示";
  return "";
}

export function PdmWorkbenchPreviewGallery<Row extends GalleryRow>({
  rows,
  selectedKey,
  ariaLabel,
  loading,
  emptyState,
  onSelect,
  onOpen,
  onCloseDetail,
  getSourceLabel
}: {
  rows: readonly Row[];
  selectedKey: string | null;
  ariaLabel: string;
  loading: boolean;
  emptyState: ReactNode;
  onSelect: (row: Row) => void;
  onOpen: (row: Row) => void;
  onCloseDetail: () => void;
  getSourceLabel?: (row: Row) => ReactNode;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const focusRow = (row: Row) => {
    onSelect(row);
    refs.current.get(row.rowKey)?.focus();
  };
  const move = (index: number, delta: number) => {
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
    if (next) focusRow(next);
  };
  return (
    <div className="pdm-workbench-preview-gallery" role="grid" aria-label={ariaLabel} aria-busy={loading}>
      {loading && rows.length === 0 ? <div className="empty pdm-workbench-preview-empty" role="status">正在載入預覽圖...</div> : null}
      {!loading && rows.length === 0 ? emptyState : null}
      {rows.map((row, index) => {
        const preview = row.preview;
        const imageFailed = failedImages.has(row.rowKey);
        const ready = preview?.state === "ready" && Boolean(preview.href) && !imageFailed;
        return (
          <article
            key={row.rowKey}
            ref={(node) => { if (node) refs.current.set(row.rowKey, node); else refs.current.delete(row.rowKey); }}
            className={`pdm-workbench-preview-card ${selectedKey === row.rowKey ? "is-selected" : ""}`.trim()}
            role="gridcell"
            tabIndex={selectedKey === row.rowKey || (!selectedKey && index === 0) ? 0 : -1}
            aria-label={`${row.displayCode}，${row.displayName}`}
            data-preview-card-key={row.rowKey}
            onClick={() => { onSelect(row); onOpen(row); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
              else if (event.key === "PageDown") { event.preventDefault(); move(index, 4); }
              else if (event.key === "PageUp") { event.preventDefault(); move(index, -4); }
              else if (event.key === "Home") { event.preventDefault(); if (rows[0]) focusRow(rows[0]); }
              else if (event.key === "End") { event.preventDefault(); if (rows.at(-1)) focusRow(rows.at(-1)!); }
              else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(row); }
              else if (event.key === "Escape") { event.preventDefault(); onCloseDetail(); }
              else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { void navigator.clipboard?.writeText(row.displayCode); }
            }}
          >
            <div className="pdm-workbench-preview-media" aria-hidden={ready ? undefined : true}>
              {ready ? <Image src={preview!.href!} alt={preview!.alt} width={640} height={480} unoptimized loading="lazy" onError={() => setFailedImages((current) => new Set(current).add(row.rowKey))} /> : <div className={`pdm-workbench-preview-placeholder is-${imageFailed ? "unavailable" : preview?.state ?? "missing"}`}><span>{previewMessage(imageFailed ? {
                state: "unavailable",
                href: null,
                sourceKind: preview?.sourceKind ?? "drawing_latest_3d",
                sourceDrawingNumber: preview?.sourceDrawingNumber ?? null,
                sourceRevision: preview?.sourceRevision ?? null,
                alt: preview?.alt ?? "3D 預覽"
              } : preview)}</span></div>}
            </div>
            <div className="pdm-workbench-preview-card-body">
              <div className="pdm-workbench-preview-card-heading"><strong>{row.displayCode}</strong><HumanStatusBadge status={row.humanStatus} viewerStatus={row.viewerStatus} availabilityScope={row.availabilityScope} /></div>
              <div className="pdm-workbench-preview-card-name">{row.displayName}</div>
              {getSourceLabel ? <div className="pdm-workbench-preview-source">{getSourceLabel(row)}</div> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
