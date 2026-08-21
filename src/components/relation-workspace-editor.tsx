"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Link2 } from "lucide-react";
import { PdmEditPageFrame } from "@/components/pdm-edit-page-frame";
import { RelationWorkspaceContent } from "@/components/relation-workspace-content";
import { normalizePdmRelationReturnTo } from "@/lib/pdm-review-navigation";
import type { PdmEntityDetailResponse, RelationProjectionFull } from "@/lib/pdm-entity-detail-contract";

function apiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
}

export function RelationWorkspaceEditor({ rootId, intent = "view", returnTo }: { rootId: string; intent?: string; returnTo?: string | null }) {
  const [detail, setDetail] = useState<PdmEntityDetailResponse | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState("");
  const [selectedPart, setSelectedPart] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "restricted" | "not_found" | "conflict" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const safeReturnTo = normalizePdmRelationReturnTo(returnTo);
  const normalizedIntent = (["manage_relation", "history", "view"] as const).includes(intent as "manage_relation" | "history" | "view") ? intent as "manage_relation" | "history" | "view" : "view";
  const canManage = normalizedIntent === "manage_relation";
  const load = useCallback(async () => {
    setStatus("loading"); setError("");
    try {
      const response = await fetch(`/api/pdm/entity-details/${encodeURIComponent(`root:${rootId}`)}?surface=relation&returnTo=${encodeURIComponent(safeReturnTo)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 404) { setStatus("not_found"); return; }
      if (response.status === 403) { setStatus("restricted"); return; }
      if (!response.ok) throw new Error(apiError(body, "圖料關聯工作區目前無法載入。"));
      const next = body as PdmEntityDetailResponse; setDetail(next); setStatus("ready");
      const projection = next.projections.relation?.level === "full" ? next.projections.relation.data as RelationProjectionFull : null;
      if (projection) { setSelectedDrawing((current) => projection.drawings.some((item) => item.drawingNumber === current) ? current : projection.drawings[0]?.drawingNumber ?? ""); setSelectedPart((current) => projection.parts.some((item) => item.partNumber === current) ? current : projection.parts[0]?.partNumber ?? ""); }
    } catch (caught) { setStatus("error"); setError(caught instanceof Error ? caught.message : "圖料關聯工作區目前無法載入。"); }
  }, [rootId, safeReturnTo]);
  useEffect(() => { void load(); }, [load]);
  const relation = detail?.projections.relation;
  const full = relation?.level === "full" ? relation.data as RelationProjectionFull : null;
  async function mutate(operation: "link" | "set_primary" | "set_reference" | "remove") {
    if (!full || !selectedDrawing || !selectedPart || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/numbering/relations", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": `pdm-relation:${full.rootId}:${operation}:${crypto.randomUUID()}` }, body: JSON.stringify({ operation, rootId: full.rootId, drawingNumber: selectedDrawing, partNumber: selectedPart }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, "圖料關聯尚未更新。"));
      setNotice("圖料關聯已更新。"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "圖料關聯尚未更新。"); }
    finally { setBusy(false); }
  }
  return <PdmEditPageFrame returnHref={safeReturnTo} eyebrow="圖料關聯工作區" title={full?.rootCode ?? rootId} subtitle={detail?.header.displayName ?? ""} status={status} error={error} notice={notice} onRetry={() => void load()} actionDock={status === "ready" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}><GitBranch size={15} />重新整理關聯</button> : null}>
    {relation ? canManage && full ? <RelationWorkspaceContent projection={relation} presentation="workspace-editor" maintenance={<><h2>關聯維護</h2><div className="pdm-relation-maintenance-grid"><label><span>圖號</span><select value={selectedDrawing} onChange={(event) => setSelectedDrawing(event.target.value)}>{full.drawings.map((item) => <option key={item.id} value={item.drawingNumber}>{item.drawingNumber}</option>)}</select></label><label><span>料號</span><select value={selectedPart} onChange={(event) => setSelectedPart(event.target.value)}>{full.parts.map((item) => <option key={item.id} value={item.partNumber}>{item.partNumber}／{item.partName}</option>)}</select></label></div><div className="pdm-relation-maintenance-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void mutate("link")}><Link2 size={15} />建立／更新</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void mutate("set_primary")}>設為主要製造圖</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void mutate("set_reference")}>設為參考</button><button className="danger-button" type="button" disabled={busy} onClick={() => void mutate("remove")}>移除關聯</button></div></>} /> : <RelationWorkspaceContent projection={relation} presentation="drawer-readonly" /> : null}
  </PdmEditPageFrame>;
}
