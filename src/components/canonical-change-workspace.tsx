"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Save, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CanonicalDrawingChangeWorkspace } from "@/components/canonical-drawing-change-workspace";
import { PartNumberMatrixWorkspace } from "@/components/part-number-matrix-workspace";
import { PdmEditPageFrame } from "@/components/pdm-edit-page-frame";
import type { WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";
import { pdmFileReadHref, type PdmFileReadContext } from "@/lib/pdm-file-read-contract";
import type { PartMaintenanceTab } from "@/lib/part-number-matrix-contract";
import { CANONICAL_NUMBERING_ITEM_KIND_OPTIONS, projectCanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import styles from "./canonical-change-workspace.module.css";

type Option = { id: string; code: string; name?: string };
export type WorkspacePayload = {
  entityType: WorkbenchEntityType; entityId: string; workId: string | null; revision?: string;
  requestKind?: "drawing_revision" | "drawing_rd_void" | "part_change";
  rowVersion: number; payload: Record<string, unknown>; readonly: boolean;
  identity?: { code?: string; name?: string; purpose_code?: string; purpose_description?: string } | null;
  options?: { drawings?: Option[]; parts?: Option[] }; files?: unknown[]; attachments?: unknown[];
  formalAttributes?: Array<{ key: string; label: string; value: string | null; applicabilityState: string }>;
  reviewScope?: "excluded_live" | "included"; actions?: Array<{ key: "approve" | "return_for_correction"; label: string }>;
};
type ResponseShape = { data: WorkspacePayload; meta: { contractToken: string; correlationId: string } };
type PartRecognitionTransfer = {
  id: string; status: string; formalizedAt: string | null; sourceCount: number;
  acceptedFieldCount: number; fieldLabels: string[]; pendingCount: number;
};

function apiMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? String((error as { message: string }).message) : fallback;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function bool(value: unknown) { return Boolean(value); }
function visibleItemKind(value: unknown) { return projectCanonicalNumberingItemKind(value) ?? ""; }

type CanonicalChangeWorkspaceProps = {
  entityType?: WorkbenchEntityType; entityId?: string; workId?: string | null; reviewRequestId?: string; returnTo?: string | null; initialData?: WorkspacePayload | null; suppressFooter?: boolean; fileReadContext?: PdmFileReadContext; embedded?: boolean; initialTab?: PartMaintenanceTab;
};

export function CanonicalChangeWorkspace(props: CanonicalChangeWorkspaceProps) {
  if (props.entityType === "drawing") {
    return <CanonicalDrawingChangeWorkspace drawingId={props.entityId} workId={props.workId} reviewRequestId={props.reviewRequestId} returnTo={props.returnTo} />;
  }
  if (props.entityType === "part" && props.entityId && props.workId && !props.reviewRequestId && !props.initialData) {
    return <PartNumberMatrixWorkspace partId={props.entityId} workId={props.workId} returnTo={props.returnTo} initialTab={props.initialTab} />;
  }
  return <GenericCanonicalChangeWorkspace {...props} />;
}

function GenericCanonicalChangeWorkspace({ entityType, entityId, workId, reviewRequestId, returnTo, initialData, suppressFooter = false, fileReadContext = "part_attachment", embedded = false }: CanonicalChangeWorkspaceProps) {
  const router = useRouter();
  const [data, setData] = useState<WorkspacePayload | null>(initialData ?? null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [savedPayload, setSavedPayload] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "restricted" | "not_found" | "error">(initialData ? "ready" : "loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canManageAttachments, setCanManageAttachments] = useState(false);
  const [recognitionTransfer, setRecognitionTransfer] = useState<PartRecognitionTransfer | null>(null);
  const domain = data?.entityType ?? entityType;
  const safeReturn = returnTo || (domain === "drawing" ? "/numbering/drawings" : "/parts");

  const endpoint = useMemo(() => {
    if (initialData) return null;
    if (reviewRequestId) return `/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}`;
    if (!workId || !entityType) return null;
    return entityType === "drawing" ? `/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}` : `/api/pdm/part-change-works/${encodeURIComponent(workId)}`;
  }, [entityType, initialData, reviewRequestId, workId]);

  const load = useCallback(async () => {
    if (initialData) { setData(initialData); setPayload(initialData.payload ?? {}); setSavedPayload(initialData.payload ?? {}); setStatus("ready"); setError(""); return; }
    if (!endpoint) { setStatus("not_found"); return; }
    setStatus("loading"); setError("");
    const response = await fetch(endpoint, { cache: "no-store" }); const body = await response.json().catch(() => null);
    if (response.status === 403) { setStatus("restricted"); return; }
    if (response.status === 404) { setStatus("not_found"); return; }
    if (!response.ok) { setError(apiMessage(body, "工作資料目前無法載入。")); setStatus("error"); return; }
    const result = body as ResponseShape;
    const nextPayload = result.data.entityType === "part"
      ? { ...(result.data.payload ?? {}), itemKind: visibleItemKind(result.data.payload?.itemKind) }
      : result.data.payload ?? {};
    setData(result.data); setPayload(nextPayload); setSavedPayload(nextPayload); setToken(result.meta.contractToken); setStatus("ready");
  }, [endpoint, initialData]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (data?.entityType !== "part" || data.readonly) { setCanManageAttachments(false); return; }
    let active = true;
    void fetch("/api/numbering/permissions", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { actions?: Record<string, boolean> } : null)
      .then((body) => { if (active) setCanManageAttachments(body?.actions?.["numbering.attachments.manage"] === true); })
      .catch(() => { if (active) setCanManageAttachments(false); });
    return () => { active = false; };
  }, [data?.entityType, data?.readonly]);
  useEffect(() => {
    if (data?.entityType !== "part" || data.readonly) { setRecognitionTransfer(null); return; }
    let active = true;
    void fetch(`/api/numbering/parts/${encodeURIComponent(data.entityId)}/recognition-session`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { session?: PartRecognitionTransfer | null } : null)
      .then((body) => { if (active) setRecognitionTransfer(body?.session ?? null); })
      .catch(() => { if (active) setRecognitionTransfer(null); });
    return () => { active = false; };
  }, [data?.entityId, data?.entityType, data?.readonly]);

  const commandHeaders = useCallback(() => ({ "content-type": "application/json", "if-match": `\"${data?.rowVersion ?? 0}\"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": token }), [data?.rowVersion, token]);
  async function ownerCommand(kind: "save" | "submit" | "cancel") {
    if (!data?.workId || !domain || busy) return;
    if (kind === "cancel" && !window.confirm("確定取消這次尚未核准的工作資料？")) return;
    const base = domain === "drawing" ? `/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}` : `/api/pdm/part-change-works/${encodeURIComponent(data.workId)}`;
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
  const isDirty = !data?.readonly && JSON.stringify(payload) !== JSON.stringify(savedPayload);
  const title = data?.identity?.code || (data?.entityType === "drawing" && data.revision ? `研發版 ${data.revision}` : entityId || "工作資料");
  function manageAttachments() {
    const partNumber = data?.identity?.code;
    if (!partNumber) return;
    if (isDirty && !window.confirm("料號資料尚未儲存。前往附件管理會捨棄這些欄位變更，確定繼續嗎？")) return;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.push(`/parts/${encodeURIComponent(partNumber)}/attachments?returnTo=${encodeURIComponent(currentLocation)}`);
  }
  function openRecognitionReview() {
    if (!recognitionTransfer) return;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.push(`/numbering/recognition/${encodeURIComponent(recognitionTransfer.id)}?returnTo=${encodeURIComponent(currentLocation)}`);
  }

  const extraFormalAttributes = (data?.formalAttributes ?? []).filter((attribute) =>
    !["material", "color", "surface_finish", "surface_treatment", "variant_note"].includes(attribute.key)
  );

  const actionDock = suppressFooter ? null : status === "ready" && data ? data.readonly ? <>
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void decide("return_for_correction")}><XCircle size={15} />退回修改</button>
    <button className="primary-button" type="button" disabled={busy} onClick={() => void decide("approve")}><CheckCircle2 size={15} />核准</button>
  </> : <>
    <button className="danger-button" type="button" disabled={busy} onClick={() => void ownerCommand("cancel")}>取消本次工作</button>
    <button className="secondary-button" type="button" disabled={busy || !isDirty} onClick={() => void ownerCommand("save")}><Save size={15} />儲存</button>
    <button className="primary-button" type="button" disabled={busy || isDirty} onClick={() => void ownerCommand("submit")}><Send size={15} />送出審核</button>
  </> : null;

  return <PdmEditPageFrame returnHref={safeReturn} eyebrow={data?.readonly ? "唯讀審核" : domain === "drawing" ? "圖號編輯" : domain === "part" ? "料號編輯" : "圖料關聯編輯"} title={title} subtitle={data?.identity?.name ?? ""} status={status} error={error} notice={notice} isDirty={isDirty} onRetry={() => void load()} actionDock={actionDock} embedded={embedded}>
    {data?.readonly ? <div className="dev079-workspace-notice is-readonly" role="status">審核畫面與編輯畫面使用相同欄位與排列；目前為唯讀。</div> : null}
    {status === "ready" && data?.entityType === "part" ? <>
      <section className="pdm-edit-page-card"><h2>料號資料</h2>
        {recognitionTransfer && recognitionTransfer.status !== "formalized" && recognitionTransfer.acceptedFieldCount > 0 ? <div className={styles.recognitionTransfer} role="status">
          <div className={styles.recognitionTransferCopy}><strong>智慧辨識已核對：{recognitionTransfer.fieldLabels.join("、")}（{recognitionTransfer.acceptedFieldCount} 項）</strong><span>{recognitionTransfer.pendingCount > 0 ? `尚有 ${recognitionTransfer.pendingCount} 項需核對，尚未寫入料號主資料。` : "尚未寫入料號主資料。"}</span></div>
          <button className="secondary-button" type="button" onClick={openRecognitionReview}>{recognitionTransfer.pendingCount > 0 ? "繼續核對" : "檢查並寫入 PDM"}</button>
        </div> : null}
        <div className="pdm-master-field-grid">
        <label><span>品名</span><input value={text(payload.partName)} disabled={data.readonly} onChange={(event) => updateField("partName", event.target.value)} /></label>
        <label><span>料件類型</span><select value={visibleItemKind(payload.itemKind)} disabled={data.readonly} onChange={(event) => updateField("itemKind", event.target.value)}>{visibleItemKind(payload.itemKind) ? null : <option value="" disabled>待分類</option>}{CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>規格</span><input value={text(payload.customSpecification)} disabled={data.readonly} onChange={(event) => updateField("customSpecification", event.target.value || null)} /></label>
        <label><span>材質</span><input value={text(payload.materialLabel)} disabled={data.readonly} onChange={(event) => updateField("materialLabel", event.target.value || null)} /></label>
        <label><span>顏色</span><input value={text(payload.colorLabel)} disabled={data.readonly} onChange={(event) => updateField("colorLabel", event.target.value || null)} /></label>
        <label><span>表面處理</span><input value={text(payload.surfaceTreatment)} disabled={data.readonly} onChange={(event) => updateField("surfaceTreatment", event.target.value || null)} /></label>
        <label className="pdm-edit-page-field-wide"><span>變體備註</span><textarea value={text(payload.variantNote)} disabled={data.readonly} onChange={(event) => updateField("variantNote", event.target.value || null)} rows={2} /></label>
        <label><span>BOM 使用規則</span><select value={text(payload.bomUsagePolicy)} disabled={data.readonly} onChange={(event) => updateField("bomUsagePolicy", event.target.value)}><option value="undecided">未決定</option><option value="not_required">不需要</option><option value="available">可使用</option><option value="restricted">受限</option><option value="obsolete">停用</option></select></label>
        <label><span>共用件</span><input type="checkbox" checked={bool(payload.isUniversal)} disabled={data.readonly} onChange={(event) => updateField("isUniversal", event.target.checked)} /></label>
        </div>
        {extraFormalAttributes.length > 0 ? <div className={styles.formalAttributes}><h3>其他已確認屬性</h3><dl>{extraFormalAttributes.map((attribute) => <div key={attribute.key}><dt>{attribute.label}</dt><dd>{attribute.applicabilityState === "not_applicable" ? "無" : attribute.value || "—"}</dd></div>)}</dl></div> : null}
      </section>
      <section className="pdm-edit-page-card"><div className="pdm-edit-page-card-heading"><div><h2>附件</h2>{data.readonly && fileReadContext !== "review_package" ? <p className="canonical-note">附件獨立維護，不屬於本次資料核准；此處顯示目前最新附件。</p> : null}</div>{!data.readonly && canManageAttachments && data.identity?.code ? <button className="secondary-button" type="button" onClick={manageAttachments}>管理附件</button> : null}</div><SimpleFiles records={data.attachments} attachmentContext={{ entityId: data.entityId, reviewRequestId }} context={fileReadContext} /></section>
    </> : null}
  </PdmEditPageFrame>;
}

function SimpleFiles({ records, attachmentContext, context = "part_attachment" }: { records?: unknown[]; attachmentContext?: { entityId: string; reviewRequestId?: string }; context?: PdmFileReadContext }) {
  if (!records?.length) return <p className="canonical-empty">目前沒有檔案</p>;
  return <ul className="canonical-file-list">{records.map((record, index) => { const row = record as Record<string, unknown>; const id = String(row.id ?? ""); const fileName = text(row.file_name) || "檔案"; const sourceFileAssetId = String(row.source_file_asset_id ?? id); const bindingId = String(row.binding_id ?? id); const href = attachmentContext && id ? pdmFileReadHref({ fileAssetId: sourceFileAssetId, context, contextId: attachmentContext.entityId, bindingId, reviewRequestId: attachmentContext.reviewRequestId }) : null; const metadata = text(row.role) || text(row.mime_type); return <li key={id || String(index)}><div><strong>{text(row.display_name) || fileName}</strong><span>{metadata}</span></div>{href ? <a className="canonical-file-download" href={href} download={fileName} aria-label={`下載 ${fileName}`}><Download size={15} aria-hidden="true" />下載</a> : null}</li>; })}</ul>;
}
