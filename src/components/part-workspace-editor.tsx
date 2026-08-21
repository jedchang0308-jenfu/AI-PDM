"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { PdmEditPageFrame } from "@/components/pdm-edit-page-frame";
import { PartProjection } from "@/components/part-projection";
import { normalizePdmPartReturnTo } from "@/lib/pdm-review-navigation";
import type { PdmEntityDetailResponse, PartProjectionFull } from "@/lib/pdm-entity-detail-contract";

function apiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
}

export function PartWorkspaceEditor({ partId, intent = "view", returnTo }: { partId: string; intent?: string; returnTo?: string | null }) {
  const [detail, setDetail] = useState<PdmEntityDetailResponse | null>(null);
  const [form, setForm] = useState({ materialLabel: "", colorLabel: "", surfaceTreatment: "", variantNote: "" });
  const [savedForm, setSavedForm] = useState({ materialLabel: "", colorLabel: "", surfaceTreatment: "", variantNote: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "restricted" | "not_found" | "conflict" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const safeReturnTo = normalizePdmPartReturnTo(returnTo);
  const normalizedIntent = (["edit", "manage_files", "history", "view"] as const).includes(intent as "edit" | "manage_files" | "history" | "view") ? intent as "edit" | "manage_files" | "history" | "view" : "view";
  const canEdit = normalizedIntent === "edit" && Boolean(detail?.actionBar.primary?.kind === "edit" && detail.actionBar.primary.enabled || detail?.actionBar.secondary.some((action) => action.kind === "edit" && action.enabled));
  const load = useCallback(async () => {
    setStatus("loading"); setError("");
    try {
      const response = await fetch(`/api/pdm/entity-details/${encodeURIComponent(`part:${partId}`)}?surface=part&returnTo=${encodeURIComponent(safeReturnTo)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 404) { setStatus("not_found"); return; }
      if (response.status === 403) { setStatus("restricted"); return; }
      if (!response.ok) throw new Error(apiError(body, "料號工作區目前無法載入。"));
      const next = body as PdmEntityDetailResponse; setDetail(next); setStatus("ready");
      const projection = next.projections.part?.level === "full" ? next.projections.part.data as PartProjectionFull : null;
      if (projection) {
        const nextForm = { materialLabel: projection.attributes.materialLabel ?? "", colorLabel: projection.attributes.colorLabel ?? "", surfaceTreatment: projection.attributes.surfaceTreatment ?? "", variantNote: projection.attributes.variantNote ?? "" };
        setForm(nextForm); setSavedForm(nextForm);
      }
    } catch (caught) { setStatus("error"); setError(caught instanceof Error ? caught.message : "料號工作區目前無法載入。"); }
  }, [partId, safeReturnTo]);
  useEffect(() => { void load(); }, [load]);
  const partProjection = detail?.projections.part;
  const full = partProjection?.level === "full" ? partProjection.data as PartProjectionFull : null;
  async function save() {
    if (!full || !canEdit || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/parts/${encodeURIComponent(full.partNumber)}/variant`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, "料號資料尚未儲存。"));
      setNotice("料號資料已儲存。"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "料號資料尚未儲存。"); }
    finally { setBusy(false); }
  }
  return <PdmEditPageFrame returnHref={safeReturnTo} eyebrow="料號工作區" title={full?.partNumber ?? partId} subtitle={full?.displayName ?? ""} status={status} error={error} notice={notice} isDirty={canEdit && JSON.stringify(form) !== JSON.stringify(savedForm)} onRetry={() => void load()} actionDock={status === "ready" && full ? <>{canEdit ? <button className="primary-button" type="button" disabled={busy} onClick={() => void save()}><Save size={15} />儲存料號資料</button> : <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>重新整理</button>}</> : null}>
    {partProjection ? <PartProjection projection={partProjection} /> : null}
    {full && canEdit ? <section className="pdm-edit-page-card"><h2>料號資料維護</h2><div className="pdm-master-field-grid"><label><span>材質</span><input value={form.materialLabel} onChange={(event) => setForm((current) => ({ ...current, materialLabel: event.target.value }))} /></label><label><span>顏色</span><input value={form.colorLabel} onChange={(event) => setForm((current) => ({ ...current, colorLabel: event.target.value }))} /></label><label><span>表面處理</span><input value={form.surfaceTreatment} onChange={(event) => setForm((current) => ({ ...current, surfaceTreatment: event.target.value }))} /></label><label><span>差異說明</span><input value={form.variantNote} onChange={(event) => setForm((current) => ({ ...current, variantNote: event.target.value }))} /></label></div></section> : null}
  </PdmEditPageFrame>;
}
