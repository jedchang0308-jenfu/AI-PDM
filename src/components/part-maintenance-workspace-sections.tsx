"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalPartPreviewSection } from "@/components/canonical-part-preview-section";
import { CanonicalRelationMatrixSection } from "@/components/canonical-relation-matrix-section";
import { CanonicalPartAttachmentManager } from "@/components/canonical-part-attachment-manager";
import { PartBomContext } from "@/components/part-bom-context";
import { PartStructureClassification } from "@/components/part-structure-classification";
import type { CanonicalWorkbenchDetailDto, CanonicalPartDetailPresentation } from "@/lib/pdm-canonical-workbench-contract";

type DetailResponse = CanonicalWorkbenchDetailDto;

function responseMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? String((error as { message: string }).message)
    : fallback;
}

export function PartMaintenanceWorkspaceSections({
  partId,
  partNumber,
  sourceRowKey,
  contractToken,
  returnTo,
  tab,
  onDirtyChange
}: {
  partId: string;
  partNumber: string;
  sourceRowKey: string;
  contractToken: string;
  returnTo: string;
  tab: "maintenance" | "bom";
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");
  const [relationDirty, setRelationDirty] = useState(false);
  const [attachmentDirty, setAttachmentDirty] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const endpoint = useMemo(() => `/api/parts/workbench/${encodeURIComponent(sourceRowKey)}`, [sourceRowKey]);
  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading"); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null) as DetailResponse | { error?: unknown } | null;
      if (requestId !== requestRef.current) return false;
      if (!response.ok) throw new Error(responseMessage(body, "料號維護資料目前無法載入。"));
      const result = body as DetailResponse;
      if (result.data.row.entityType !== "part" || result.data.row.entityId !== partId || result.data.presentation.kind !== "part") throw new Error("料號明細範圍已變更，請重新載入工作台。");
      setDetail(result); setStatus("ready");
      return true;
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return false;
      if (requestId !== requestRef.current) return false;
      setError(loadError instanceof Error ? loadError.message : "料號維護資料目前無法載入。");
      setStatus("error");
      return false;
    } finally { if (requestId === requestRef.current) abortRef.current = null; }
  }, [endpoint, partId]);
  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; abortRef.current?.abort(); abortRef.current = null; };
  }, [load]);
  useEffect(() => { onDirtyChange?.(relationDirty || attachmentDirty); }, [attachmentDirty, onDirtyChange, relationDirty]);

  if (status === "loading") return <p className="canonical-drawer-message" role="status">正在載入指定料號維護資料…</p>;
  if (status === "error" || !detail) return <div className="canonical-error" role="alert"><span>{error || "料號維護資料目前無法載入。"}</span><button type="button" className="secondary-button" onClick={() => void load()}>重新載入</button></div>;
  const presentation = detail.data.presentation as CanonicalPartDetailPresentation;
  const partRelationCanManage = detail.data.row.entityType === "part"
    && detail.data.row.actions.some((action) => action.key === "edit");
  const safeReturn = returnTo || "/parts";
  return <div className="part-maintenance-workspace-sections" data-part-maintenance-tab={tab}>
    {tab === "maintenance" ? <>
      {presentation.preview ? <CanonicalPartPreviewSection partNumber={partNumber} preview={presentation.preview} control={presentation.previewSourceControl} mode="manage" className="part-maintenance-section part-maintenance-preview" onCommitted={() => void load()} /> : null}
      <PartStructureClassification partNumberId={partId} contractToken={detail.meta.contractToken || contractToken} className="part-maintenance-section" onSaved={() => void load()} />
      <section className="part-maintenance-section part-maintenance-attachments" data-section="part-attachments"><div className="canonical-drawer-section-heading"><h3>附件</h3></div><CanonicalPartAttachmentManager partNumber={partNumber} returnTo={safeReturn} embedded onDirtyChange={setAttachmentDirty} /></section>
      <CanonicalRelationMatrixSection matrix={presentation.relationMatrix} contractToken={detail.meta.contractToken || contractToken} className="part-maintenance-section part-maintenance-relation" mode={partRelationCanManage ? "manage" : "readonly"} activationMode="immediate" onReloadRequested={load} onSaved={() => { setRelationDirty(false); void load(); }} onDirtyChange={setRelationDirty} onOpenDrawing={(href) => window.location.assign(href)} onOpenPart={(href) => window.location.assign(href)} />
    </> : <>
      <PartBomContext context={presentation.bomContext} partNumberId={partId} partNumber={partNumber} mode="workspace" returnTo={safeReturn} alwaysShow />
      <CanonicalRelationMatrixSection matrix={presentation.relationMatrix} contractToken={detail.meta.contractToken || contractToken} mode="readonly" onOpenDrawing={(href) => window.location.assign(href)} onOpenPart={(href) => window.location.assign(href)} />
    </>}
  </div>;
}
