"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Files, LoaderCircle, RefreshCcw, Save, ScanSearch, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawingDetailPreview, type DrawingDetailPreviewCard, type DrawingDetailPreviewKind } from "@/components/drawing-detail-preview";
import { DrawingRecognitionWorkspacePanel } from "@/components/drawing-recognition-workspace-panel";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";

type FileRow = {
  id: string;
  source_file_asset_id?: string;
  display_name?: string;
  role?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};
type DrawingWorkspacePayload = {
  entityType: "drawing";
  entityId: string;
  workId: string | null;
  revisionId?: string;
  requestKind?: "drawing_revision" | "drawing_rd_void";
  revision?: string;
  rowVersion: number;
  payload: Record<string, unknown>;
  readonly: boolean;
  identity?: { code?: string; name?: string } | null;
  files?: FileRow[];
};
type ResponseShape = { data: DrawingWorkspacePayload; meta: { contractToken: string } };

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function apiMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? String((error as { message: string }).message)
    : fallback;
}
function fileKind(file: FileRow): DrawingDetailPreviewKind | null {
  if (file.role === "cad_3d") return "three-d";
  if (file.role === "drawing_2d" || file.role === "pdf" || file.mime_type === "application/pdf") return "two-d";
  return null;
}

export function CanonicalDrawingChangeWorkspace({ drawingId, workId, reviewRequestId, returnTo }: {
  drawingId?: string;
  workId?: string | null;
  reviewRequestId?: string;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<DrawingWorkspacePayload | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [savedPayload, setSavedPayload] = useState<Record<string, unknown>>({});
  const [contractToken, setContractToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailMode, setDetailMode] = useState<"files" | "recognition">("files");
  const [visualKind, setVisualKind] = useState<DrawingDetailPreviewKind>("two-d");
  const loadSequenceRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const safeReturn = returnTo || "/numbering/drawings";
  const endpoint = reviewRequestId
    ? `/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}`
    : workId ? `/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}` : null;

  const load = useCallback(async () => {
    if (!endpoint) { setLoading(false); setError("找不到圖號工作資料。"); return; }
    const sequence = ++loadSequenceRef.current;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (sequence !== loadSequenceRef.current) return;
      if (!response.ok) { setLoading(false); setError(apiMessage(body, "圖號工作資料目前無法載入。")); return; }
      const result = body as ResponseShape;
      if (result.data.entityType !== "drawing") { setLoading(false); setError("審核對象不是圖號資料。"); return; }
      setData(result.data); setPayload(result.data.payload ?? {}); setSavedPayload(result.data.payload ?? {}); setContractToken(result.meta.contractToken); setLoading(false);
    } catch (error) {
      if (controller.signal.aborted || sequence !== loadSequenceRef.current) return;
      setLoading(false); setError(error instanceof Error ? error.message : "圖號工作資料目前無法載入。");
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
    return () => loadControllerRef.current?.abort();
  }, [load]);

  const isDirty = Boolean(data && !data.readonly && JSON.stringify(payload) !== JSON.stringify(savedPayload));
  const canLeave = useUnsavedChangesGuard(isDirty);
  function leave() { if (canLeave()) router.push(safeReturn); }
  function headers() {
    return { "content-type": "application/json", "if-match": `"${data?.rowVersion ?? 0}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken };
  }
  async function ownerCommand(kind: "save" | "submit" | "cancel") {
    if (!data?.workId || busy) return;
    if (kind === "cancel" && !window.confirm("確定取消這次尚未核准的工作資料？")) return;
    const base = `/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}`;
    setBusy(true); setError(""); setNotice("");
    const response = await fetch(kind === "save" ? base : `${base}/${kind}`, { method: kind === "save" ? "PATCH" : "POST", headers: headers(), body: kind === "save" ? JSON.stringify(payload) : "{}" });
    const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) { setError(apiMessage(body, "操作未完成，請重新整理後再試。")); return; }
    if (kind === "save") { setNotice("工作資料已儲存。"); await load(); return; }
    router.push(safeReturn);
  }
  async function decide(decision: "approve" | "return_for_correction") {
    if (!reviewRequestId || busy) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}/decisions`, { method: "POST", headers: headers(), body: JSON.stringify({ decision }) });
    const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) { setError(apiMessage(body, "審核決策未完成。")); return; }
    router.push(safeReturn || "/approvals");
  }

  const files = data?.files ?? [];
  const previewCards = useMemo(() => {
    const reviewQuery = reviewRequestId ? `&reviewRequestId=${encodeURIComponent(reviewRequestId)}` : "";
    return (["three-d", "two-d"] as const).map((kind): DrawingDetailPreviewCard => {
      const file = files.find((candidate) => fileKind(candidate) === kind);
      if (!file || !data?.workId) return { kind, title: kind === "three-d" ? "3D 模型" : "2D 圖面", fileName: null, state: "missing", stateTitle: "尚無檔案", stateText: "目前工作資料沒有這類檔案。" };
      return {
        kind,
        title: kind === "three-d" ? "3D 模型" : "2D 圖面",
        fileName: file.display_name || file.file_name || null,
        state: "ready",
        stateTitle: "預覽已就緒",
        stateText: "顯示本次工作資料鎖定的檔案。",
        media: {
          href: `/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}/files/${encodeURIComponent(file.id)}?preview=1${reviewQuery}`,
          mode: kind === "three-d" ? "image" : "document",
          title: file.display_name || file.file_name || "圖面檔案",
          alt: file.display_name || file.file_name || "圖面檔案",
          openInNewTab: true
        }
      };
    });
  }, [data?.workId, files, reviewRequestId]);
  const sourceAssetIds = useMemo(() => files.map((file) => file.source_file_asset_id).filter((id): id is string => Boolean(id)), [files]);
  const title = data?.identity?.code || drawingId || "圖號工作資料";

  if (loading) return <main className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在載入圖號工作區...</main>;
  if (!data) return <main className="dev079-workspace-state"><h1>圖號工作區</h1><p role="alert">{error || "找不到這筆圖號工作。"}</p><button className="secondary-button" type="button" onClick={() => void load()}>重新載入</button></main>;

  return <main className="dev079-workspace" data-dev="DEV-087" data-workspace-kind={data.readonly ? "reviewer" : "drawing-revision-work"}>
    <header className="dev079-workspace-header"><div className="dev079-workspace-heading"><button className="icon-button" type="button" onClick={leave} aria-label="返回圖號清單"><ArrowLeft size={18} /></button><div className="dev079-workspace-heading-copy"><span className="eyebrow">{data.readonly ? "唯讀審核" : "圖號編輯"}</span><h1>{title}</h1><span className="dev079-workspace-heading-name">研發版 {data.revision ?? text(payload.revision)}</span></div></div><button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}><RefreshCcw size={15} />重新整理</button></header>
    {notice ? <div className="dev079-workspace-notice is-success" role="status"><CheckCircle2 size={16} />{notice}</div> : null}
    {error ? <div className="dev079-workspace-notice is-error" role="alert">{error}</div> : null}
    {data.readonly ? <div className="dev079-workspace-notice is-readonly" role="status">目前為唯讀；欄位、檔案、預覽與智慧辨識位置和編輯者相同。</div> : null}
    <div className="dev079-workspace-grid">
      <section className="dev079-workspace-visual" aria-label="圖面主視覺"><div className="dev079-visual-panel"><DrawingDetailPreview cards={previewCards} title={null} showHeader={false} showTabFileNames showCardHeader={false} showFileName={false} layout="tabs" activeKind={visualKind} onActiveKindChange={setVisualKind} /></div></section>
      <aside className="dev079-workspace-detail" aria-label="版次與辨識操作"><div className="dev079-task-panel"><div className="dev079-task-tabs" role="tablist" aria-label="工作模式"><button type="button" role="tab" aria-selected={detailMode === "files"} className={detailMode === "files" ? "is-active" : ""} onClick={() => setDetailMode("files")}><Files size={16} />版次與檔案</button><button type="button" role="tab" aria-selected={detailMode === "recognition"} className={detailMode === "recognition" ? "is-active" : ""} onClick={() => setDetailMode("recognition")}><ScanSearch size={16} />智慧辨識</button></div>
        {detailMode === "files" ? <section className="dev079-workspace-editor" role="tabpanel" aria-label="版次與檔案"><div className="pdm-master-field-grid"><label><span>標題</span><input value={text(payload.title)} disabled={data.readonly} onChange={(event) => setPayload((current) => ({ ...current, title: event.target.value }))} /></label><label><span>說明</span><textarea rows={3} value={text(payload.description)} disabled={data.readonly} onChange={(event) => setPayload((current) => ({ ...current, description: event.target.value }))} /></label></div><ul className="canonical-file-list">{files.map((file) => <li key={file.id}><strong>{file.display_name || file.file_name || "檔案"}</strong><span>{file.role || file.mime_type}</span></li>)}</ul></section> : <section role="tabpanel" aria-label="智慧辨識">{data.revisionId ? <DrawingRecognitionWorkspacePanel drawingNumber={data.identity?.code || title} sourceContextType="drawing_revision" sourceContextId={data.revisionId} sourceAssetIds={sourceAssetIds} disabled={data.readonly} /> : <p className="canonical-empty">這筆工作資料尚無可辨識的版次來源。</p>}</section>}
      </div><footer className="dev079-workspace-footer" aria-label="圖號工作區操作列"><div className="dev079-workspace-footer-actions">{data.readonly ? <><button className="secondary-button" type="button" disabled={busy} onClick={() => void decide("return_for_correction")}><XCircle size={15} />退回修改</button><button className="primary-button" type="button" disabled={busy} onClick={() => void decide("approve")}><CheckCircle2 size={15} />核准</button></> : <><button className="danger-button" type="button" disabled={busy} onClick={() => void ownerCommand("cancel")}>取消本次工作</button><button className="secondary-button" type="button" disabled={busy || !isDirty} onClick={() => void ownerCommand("save")}><Save size={15} />儲存</button><button className="primary-button" type="button" disabled={busy || isDirty} onClick={() => void ownerCommand("submit")}><Send size={15} />送出審核</button></>}<button className="secondary-button" type="button" onClick={leave}>返回圖號清單</button></div></footer></aside>
    </div>
  </main>;
}
