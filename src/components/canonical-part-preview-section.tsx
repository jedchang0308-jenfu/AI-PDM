"use client";

import { CanonicalPreviewPanel } from "@/components/canonical-preview-panel";
import { PartPreviewSourceControl } from "@/components/part-preview-source-control";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";
import type { PartPreviewMutationResult } from "@/lib/pdm-part-preview";

type PreviewControl = {
  settingRowVersion: number;
  canManage: boolean;
  hasPrimaryManufacturingDrawing: boolean;
  disabledReason: string | null;
};

export function CanonicalPartPreviewSection({
  partNumber,
  preview,
  control,
  mode = "readonly",
  onCommitted,
  className = ""
}: {
  partNumber: string;
  preview: CanonicalPreviewProjection;
  control?: PreviewControl;
  mode?: "readonly" | "manage";
  onCommitted?: (result: PartPreviewMutationResult) => void;
  className?: string;
}) {
  const sourceMeta = preview.sourceType === "custom_image"
    ? undefined
    : preview.sourceDrawingNumber
      ? `${preview.sourceLabel} · ${preview.sourceDrawingNumber}${preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}`
      : preview.sourceLabel;
  const stateTitle = preview.sourceType === "custom_image" && preview.state === "unavailable"
    ? "自訂圖片無法顯示"
    : preview.state === "pending"
      ? "預覽產生中"
      : preview.state === "delayed"
        ? "預覽處理較久"
        : preview.state === "failed"
          ? "預覽產生失敗"
          : preview.state === "unavailable"
            ? "預覽暫時無法顯示"
            : preview.sourceType === "primary_manufacturing_drawing"
              ? "3D 預覽尚未建立"
              : "尚無料號預覽圖";
  const drawingIdentity = preview.sourceDrawingNumber
    ? `${preview.sourceDrawingNumber}${preview.sourceRevision ? ` · ${preview.sourceRevision}` : ""}`
    : "主要製造圖";
  const stateText = preview.sourceType === "none"
    ? "尚未連結主要製造圖，也沒有自訂圖片。"
    : preview.sourceType === "custom_image" && preview.state === "unavailable"
      ? `目前指定的圖片已遺失或無法讀取；請更換圖片${control?.hasPrimaryManufacturingDrawing ? "，或明確恢復使用主要製造圖" : ""}。`
      : preview.state === "missing"
        ? `${drawingIdentity} 的 3D 原檔已存在，但預覽尚未建立。`
        : preview.state === "pending" || preview.state === "delayed"
          ? `${drawingIdentity} 的 3D 預覽正在處理。`
          : preview.state === "failed"
            ? `${drawingIdentity} 的 3D 預覽產生失敗。`
            : `${drawingIdentity} 的 3D 預覽暫時無法讀取。`;
  const manage = mode === "manage" && control && control.canManage && onCommitted;

  return <CanonicalPreviewPanel
    cards={[{
      key: "part",
      title: "料號預覽",
      fileName: preview.media?.fileName ?? null,
      state: preview.state,
      stateTitle,
      stateText,
      visual: "image",
      media: preview.media ? { ...preview.media, title: "料號預覽", alt: preview.alt } : undefined,
      actions: manage ? <PartPreviewSourceControl partNumber={partNumber} preview={preview} control={control} onCommitted={onCommitted} /> : undefined
    }]}
    title="料號預覽"
    meta={sourceMeta}
    className={className}
    layout="single"
    dataSection="canonical-part-preview"
    showMeta={Boolean(sourceMeta)}
    showCardHeader={false}
  />;
}
