"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Save, Send, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CanonicalDrawingChangeWorkspace } from "@/components/canonical-drawing-change-workspace";
import { PdmEditPageFrame } from "@/components/pdm-edit-page-frame";
import type { WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";

type LinkRow = { drawingNumberId: string; partNumberId: string; linkType: "primary_manufacturing" | "reference" };
type Option = { id: string; code: string; name?: string };
type WorkspacePayload = {
  entityType: WorkbenchEntityType; entityId: string; workId: string | null; revision?: string;
  requestKind?: "drawing_revision" | "drawing_rd_void" | "part_change" | "relation_change";
  rowVersion: number; payload: Record<string, unknown>; readonly: boolean;
  identity?: { code?: string; name?: string; purpose_code?: string; purpose_description?: string } | null;
  options?: { drawings?: Option[]; parts?: Option[] }; files?: unknown[]; attachments?: unknown[];
  reviewScope?: "excluded_live" | "included"; actions?: Array<{ key: "approve" | "return_for_correction"; label: string }>;
};
type ResponseShape = { data: WorkspacePayload; meta: { contractToken: string; correlationId: string } };

function apiMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? String((error as { message: string }).message) : fallback;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function bool(value: unknown) { return Boolean(value); }

type CanonicalChangeWorkspaceProps = {
  entityType?: WorkbenchEntityType; entityId?: string; workId?: string | null; reviewRequestId?: string; returnTo?: string | null;
};

export function CanonicalChangeWorkspace(props: CanonicalChangeWorkspaceProps) {
  if (props.entityType === "drawing") {
    return <CanonicalDrawingChangeWorkspace drawingId={props.entityId} workId={props.workId} reviewRequestId={props.reviewRequestId} returnTo={props.returnTo} />;
  }
  return <GenericCanonicalChangeWorkspace {...props} />;
}

function GenericCanonicalChangeWorkspace({ entityType, entityId, workId, reviewRequestId, returnTo }: CanonicalChangeWorkspaceProps) {
  const router = useRouter();
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [savedPayload, setSavedPayload] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "restricted" | "not_found" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawingChoice, setDrawingChoice] = useState("");
  const [partChoice, setPartChoice] = useState("");
  const [linkType, setLinkType] = useState<LinkRow["linkType"]>("reference");
  const domain = data?.entityType ?? entityType;
  const safeReturn = returnTo || (domain === "drawing" ? "/numbering/drawings" : domain === "part" ? "/parts" : domain === "relation" ? "/numbering/relations" : "/approvals");

  const endpoint = useMemo(() => {
    if (reviewRequestId) return `/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}`;
    if (!workId || !entityType) return null;
    return entityType === "drawing" ? `/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}` : entityType === "part" ? `/api/pdm/part-change-works/${encodeURIComponent(workId)}` : `/api/pdm/relation-change-works/${encodeURIComponent(workId)}`;
  }, [entityType, reviewRequestId, workId]);

  const load = useCallback(async () => {
    if (!endpoint) { setStatus("not_found"); return; }
    setStatus("loading"); setError("");
    const response = await fetch(endpoint, { cache: "no-store" }); const body = await response.json().catch(() => null);
    if (response.status === 403) { setStatus("restricted"); return; }
    if (response.status === 404) { setStatus("not_found"); return; }
    if (!response.ok) { setError(apiMessage(body, "工作資料目前無法載入。")); setStatus("error"); return; }
    const result = body as ResponseShape; setData(result.data); setPayload(result.data.payload ?? {}); setSavedPayload(result.data.payload ?? {}); setToken(result.meta.contractToken); setStatus("ready");
    setDrawingChoice(result.data.options?.drawings?.[0]?.id ?? ""); setPartChoice(result.data.options?.parts?.[0]?.id ?? "");
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);

  const commandHeaders = useCallback(() => ({ "content-type": "application/json", "if-match": `\"${data?.rowVersion ?? 0}\"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": token }), [data?.rowVersion, token]);
  async function ownerCommand(kind: "save" | "submit" | "cancel") {
    if (!data?.workId || !domain || busy) return;
    if (kind === "cancel" && !window.confirm("確定取消這次尚未核准的工作資料？")) return;
    const base = domain === "drawing" ? `/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}` : domain === "part" ? `/api/pdm/part-change-works/${encodeURIComponent(data.workId)}` : `/api/pdm/relation-change-works/${encodeURIComponent(data.workId)}`;
    const url = kind === "save" ? base : `${base}/${kind}`; const method = kind === "save" ? "PATCH" : "POST";
    setBusy(true); setError("");
    const response = await fetch(url, { method, headers: commandHeaders(), body: kind === "save" ? JSON.stringify(payload) : "{}" }); const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) { setError(apiMessage(body, "操作未完成，請重新整理後再試。")); return; }
    if (kind === "save") { setNotice("工作資料已儲存。"); await load(); return; }
    router.push(safeReturn);
  }
  async function decide(decision: "approve" | "return_for_correction") {
    if (!reviewRequestId || busy) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}/decisions`, { method: "POST", headers: commandHeaders(), body: JSON.stringify({ decision }) }); const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) { setError(apiMessage(body, "審核決策未完成。")); return; }
    router.push(safeReturn || "/approvals");
  }

  function updateField(key: string, value: unknown) { setPayload((current) => ({ ...current, [key]: value })); }
  const links = Array.isArray(payload.links) ? payload.links as LinkRow[] : [];
  const drawingMap = new Map((data?.options?.drawings ?? []).map((option) => [option.id, option]));
  const partMap = new Map((data?.options?.parts ?? []).map((option) => [option.id, option]));
  function addLink() {
    if (!drawingChoice || !partChoice || data?.readonly) return;
    const next = { drawingNumberId: drawingChoice, partNumberId: partChoice, linkType };
    if (links.some((row) => row.drawingNumberId === next.drawingNumberId && row.partNumberId === next.partNumberId && row.linkType === next.linkType)) return;
    updateField("links", [...links, next]);
  }
  const isDirty = !data?.readonly && JSON.stringify(payload) !== JSON.stringify(savedPayload);
  const title = data?.identity?.code || (data?.entityType === "drawing" && data.revision ? `研發版 ${data.revision}` : entityId || "工作資料");

  const actionDock = status === "ready" && data ? data.readonly ? <>
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void decide("return_for_correction")}><XCircle size={15} />退回修改</button>
    <button className="primary-button" type="button" disabled={busy} onClick={() => void decide("approve")}><CheckCircle2 size={15} />核准</button>
  </> : <>
    <button className="danger-button" type="button" disabled={busy} onClick={() => void ownerCommand("cancel")}>取消本次工作</button>
    <button className="secondary-button" type="button" disabled={busy || !isDirty} onClick={() => void ownerCommand("save")}><Save size={15} />儲存</button>
    <button className="primary-button" type="button" disabled={busy || isDirty} onClick={() => void ownerCommand("submit")}><Send size={15} />送出審核</button>
  </> : null;

  return <PdmEditPageFrame returnHref={safeReturn} eyebrow={data?.readonly ? "唯讀審核" : domain === "drawing" ? "圖號編輯" : domain === "part" ? "料號編輯" : "圖料關聯編輯"} title={title} subtitle={data?.identity?.name ?? ""} status={status} error={error} notice={notice} isDirty={isDirty} onRetry={() => void load()} actionDock={actionDock}>
    {data?.readonly ? <div className="dev079-workspace-notice is-readonly" role="status">審核畫面與編輯畫面使用相同欄位與排列；目前為唯讀。</div> : null}
    {status === "ready" && data?.entityType === "part" ? <>
      <section className="pdm-edit-page-card"><h2>料號資料</h2><div className="pdm-master-field-grid">
        <label><span>品名</span><input value={text(payload.partName)} disabled={data.readonly} onChange={(event) => updateField("partName", event.target.value)} /></label>
        <label><span>類型</span><select value={text(payload.itemKind)} disabled={data.readonly} onChange={(event) => updateField("itemKind", event.target.value)}><option value="purchased">採購</option><option value="manufactured">自製</option><option value="outsourced">委外</option><option value="shared">共用</option><option value="custom">自訂</option></select></label>
        <label><span>規格</span><input value={text(payload.customSpecification)} disabled={data.readonly} onChange={(event) => updateField("customSpecification", event.target.value || null)} /></label>
        <label><span>BOM 使用規則</span><select value={text(payload.bomUsagePolicy)} disabled={data.readonly} onChange={(event) => updateField("bomUsagePolicy", event.target.value)}><option value="undecided">未決定</option><option value="not_required">不需要</option><option value="available">可使用</option><option value="restricted">受限</option><option value="obsolete">停用</option></select></label>
        <label><span>共用料</span><input type="checkbox" checked={bool(payload.isUniversal)} disabled={data.readonly} onChange={(event) => updateField("isUniversal", event.target.checked)} /></label>
        <label><span>共用原因</span><input value={text(payload.universalReason)} disabled={data.readonly} onChange={(event) => updateField("universalReason", event.target.value || null)} /></label>
      </div></section>
      <section className="pdm-edit-page-card"><h2>附件</h2>{data.readonly ? <p className="canonical-note">附件獨立維護，不屬於本次資料核准。</p> : null}<SimpleFiles records={data.attachments} /></section>
    </> : null}
    {status === "ready" && data?.entityType === "drawing" ? <>
      {data.requestKind === "drawing_rd_void" ? <section className="pdm-edit-page-card"><h2>研發版作廢申請</h2><p>核准後，研發版 {text(payload.revision)} 將不再有效，這一系列研發版會從目前清單移除，且無法復原。</p></section> : <section className="pdm-edit-page-card"><h2>圖面資料</h2><div className="pdm-master-field-grid"><label><span>標題</span><input value={text(payload.title)} disabled={data.readonly} onChange={(event) => updateField("title", event.target.value)} /></label><label><span>說明</span><input value={text(payload.description)} disabled={data.readonly} onChange={(event) => updateField("description", event.target.value)} /></label><label><span>智慧辨識備註</span><textarea rows={4} value={text(payload.recognitionNotes)} disabled={data.readonly} onChange={(event) => updateField("recognitionNotes", event.target.value)} /></label></div></section>}
      <section className="pdm-edit-page-card"><h2>受控圖面檔案</h2><SimpleFiles records={data.files} /></section>
    </> : null}
    {status === "ready" && data?.entityType === "relation" ? <section className="pdm-edit-page-card"><h2>直接關聯</h2>
      {!data.readonly ? <div className="canonical-link-builder"><label><span>圖號</span><select value={drawingChoice} onChange={(event) => setDrawingChoice(event.target.value)}>{(data.options?.drawings ?? []).map((option) => <option key={option.id} value={option.id}>{option.code}</option>)}</select></label><label><span>料號</span><select value={partChoice} onChange={(event) => setPartChoice(event.target.value)}>{(data.options?.parts ?? []).map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></label><label><span>關聯</span><select value={linkType} onChange={(event) => setLinkType(event.target.value as LinkRow["linkType"])}><option value="primary_manufacturing">主要製造圖</option><option value="reference">參考</option></select></label><button type="button" className="secondary-button" onClick={addLink}><Plus size={15} />新增</button></div> : null}
      <div className="canonical-record-list">{links.map((row, index) => <div className="canonical-relation-row" key={`${row.drawingNumberId}:${row.partNumberId}:${row.linkType}`}><span><strong>{drawingMap.get(row.drawingNumberId)?.code ?? "圖號"}</strong> → {partMap.get(row.partNumberId)?.code ?? "料號"}</span><span>{row.linkType === "primary_manufacturing" ? "主要製造圖" : "參考"}</span>{!data.readonly ? <button type="button" className="icon-button" aria-label="移除此關聯" onClick={() => updateField("links", links.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button> : null}</div>)}</div>
    </section> : null}
  </PdmEditPageFrame>;
}

function SimpleFiles({ records }: { records?: unknown[] }) {
  if (!records?.length) return <p className="canonical-empty">目前沒有檔案</p>;
  return <ul className="canonical-file-list">{records.map((record, index) => { const row = record as Record<string, unknown>; return <li key={String(row.id ?? index)}><strong>{text(row.display_name) || text(row.file_name) || "檔案"}</strong><span>{text(row.role) || text(row.mime_type)}</span></li>; })}</ul>;
}
