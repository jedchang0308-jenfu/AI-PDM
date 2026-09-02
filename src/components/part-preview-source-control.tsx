"use client";

import { useRef, useState } from "react";

import type { PartPreviewMutationResult, PartPreviewSourceControl as PartPreviewSourceControlModel } from "@/lib/pdm-part-preview";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";

type ApiBody = {
  data?: PartPreviewMutationResult;
  error?: { message?: string } | string;
};

const clientPreviewMaxBytes = 10 * 1024 * 1024;

function apiError(body: ApiBody | null, fallback: string) {
  if (typeof body?.error === "string") return body.error;
  return body?.error?.message?.trim() || fallback;
}

export function PartPreviewSourceControl({
  partNumber,
  preview,
  control,
  onCommitted
}: {
  partNumber: string;
  preview: CanonicalPreviewProjection;
  control: PartPreviewSourceControlModel;
  onCommitted: (result: PartPreviewMutationResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setError("");
    if (!control.canManage) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size < 1 || file.size > clientPreviewMaxBytes) {
      setError("請選擇 10 MiB 以內的 PNG 或 JPEG");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("expectedRowVersion", String(control.settingRowVersion));
      const response = await fetch(`/api/parts/${encodeURIComponent(partNumber)}/preview-image`, {
        method: "POST",
        cache: "no-store",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: form
      });
      const body = await response.json().catch(() => null) as ApiBody | null;
      if (!response.ok || !body?.data) throw new Error(apiError(body, "預覽圖更新失敗"));
      onCommitted(body.data);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "預覽圖更新失敗");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const reset = async () => {
    if (!control.canManage || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/parts/${encodeURIComponent(partNumber)}/preview-image/reset`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ expectedRowVersion: control.settingRowVersion })
      });
      const body = await response.json().catch(() => null) as ApiBody | null;
      if (!response.ok || !body?.data) throw new Error(apiError(body, "無法恢復主要製造圖"));
      onCommitted(body.data);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "無法恢復主要製造圖");
    } finally {
      setBusy(false);
    }
  };

  return <div className="part-preview-source-control" data-component="part-preview-source-control">
    <div className="part-preview-source-actions">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden disabled={!control.canManage || busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void upload(file); }} />
      <button type="button" className="secondary-button" disabled={!control.canManage || busy} onClick={() => inputRef.current?.click()}>{busy ? "處理中…" : preview.sourceType === "custom_image" ? "更換圖片" : "上傳圖片"}</button>
      {preview.sourceType === "custom_image" && control.hasPrimaryManufacturingDrawing ? <button type="button" className="secondary-button" disabled={!control.canManage || busy} onClick={() => void reset()}>使用主要製造圖</button> : null}
    </div>
    {control.disabledReason ? <p className="canonical-drawer-section-note">{control.disabledReason}</p> : null}
    {error ? <p className="canonical-error" role="alert">{error}</p> : null}
  </div>;
}
