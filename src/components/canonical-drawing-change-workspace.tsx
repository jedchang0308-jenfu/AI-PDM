"use client";

import { pdmPermissionFetch as fetch } from "@/lib/pdm-permission-client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrawingAssemblyPackagePanel } from "./drawing-assembly-package-panel";
import { WorkbenchDeleteAction } from "./draft-numbering-delete-action";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, Files, LoaderCircle, ScanSearch, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawingDetailPreview, type DrawingDetailPreviewCard, type DrawingDetailPreviewKind } from "@/components/drawing-detail-preview";
import { DrawingWorkspaceUpload } from "./drawing-workspace-upload";
import { createDrawingWorkFileUploader } from "@/lib/drawing-work-file-upload-client";
import {
  DrawingRecognitionWorkspacePanel,
  type DrawingRecognitionEvidence
} from "@/components/drawing-recognition-workspace-panel";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { pdmFileReadHref, type PdmFileReadContext } from "@/lib/pdm-file-read-contract";
import { isWorkspacePdf, selectWorkspacePreviewSource } from "@/lib/pdm-canonical-preview";
import { normalizeMediaType } from "@/lib/media-type";
import { isReviewPackageRecognitionProjection } from "@/lib/pdm-review-package-contract";
import type { DrawingRecognitionReviewProjection } from "@/lib/drawing-recognition-review-projection";
import { parseNumberingIdentity } from "@/lib/numbering-identity";

type FileRow = {
  id: string;
  source_file_asset_id?: string;
  display_name?: string;
  role?: string;
  file_name?: string;
  file_ext?: string;
  mime_type?: string;
  file_size?: number;
  is_primary?: boolean | number;
  current_revision_upload?: boolean | number;
};
export type DrawingWorkspacePayload = {
  entityType: "drawing";
  entityId: string;
  workId: string | null;
  revisionId?: string;
  requestKind?: "drawing_revision" | "drawing_rd_void";
  revision?: string;
  rowVersion: number;
  payload: Record<string, unknown>;
  readonly: boolean;
  interaction?: {
    mode: "owner_edit" | "owner_stale_cleanup" | "review_decide" | "review_stale_cleanup";
    basisState: "current" | "stale" | "preproduction";
    canMutateContent: boolean;
    canSubmit: boolean;
    canCancel: boolean;
    canApprove: boolean;
    canReturn: boolean;
    reasonCode: string | null;
  };
  identity?: { code?: string; name?: string } | null;
  files?: FileRow[];
  changeImpactRequired?: boolean;
  relatedParts?: Array<{ id: string; code: string; name: string | null }>;
  assemblyPackage?: { applicable: boolean; canSubmit: boolean; reason: string | null };
  affectedParts?: Array<{ id: string; code: string; name: string | null }>;
  recognition?: DrawingRecognitionReviewProjection | { sessionId?: string; status?: string; conflictCount?: number; capturedAt?: string } | null;
};
type ResponseShape = { data: DrawingWorkspacePayload; meta: { contractToken: string } };
type ChangeImpactState = "no_impact" | "suspected_impact" | "confirmed_impact";
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function apiMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? String((error as { message: string }).message)
    : fallback;
}
function apiCode(body: unknown) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : null;
}
export function fileRoleLabel(file: Pick<FileRow, "role" | "mime_type">) {
  if (file.role === "cad_3d") return "3D 模型";
  if (file.role === "drawing_2d") return "2D 圖面";
  if (file.role === "pdf" || normalizeMediaType(file.mime_type) === "application/pdf") return "PDF 圖面";
  return "其他檔案";
}

function evidenceRegion(geometry: Record<string, unknown> | null) {
  if (!geometry || geometry.coordinateSpace !== "normalized_page" || geometry.origin !== "top_left") return null;
  const values = [geometry.x, geometry.y, geometry.width, geometry.height].map(Number);
  if (!values.every(Number.isFinite) || values[0] < 0 || values[1] < 0 || values[2] <= 0 || values[3] <= 0
    || values[0] + values[2] > 1.000001 || values[1] + values[3] > 1.000001) return null;
  const [x, y, width, height] = values;
  return { x, y, width, height };
}

function isPdfEvidence(evidence: DrawingRecognitionEvidence) {
  return evidence.sourceRole === "pdf" || /\.pdf$/iu.test(evidence.fileName ?? "");
}

export function CanonicalDrawingChangeWorkspace({ drawingId, workId, reviewRequestId, returnTo, initialData, suppressFooter = false, fileReadContext = "drawing_revision_work", snapshotMode = false, embedded = false }: {
  drawingId?: string;
  workId?: string | null;
  reviewRequestId?: string;
  returnTo?: string | null;
  initialData?: DrawingWorkspacePayload | null;
  suppressFooter?: boolean;
  fileReadContext?: PdmFileReadContext;
  snapshotMode?: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<DrawingWorkspacePayload | null>(initialData ?? null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [payloadDirty, setPayloadDirty] = useState(false);
  const [contractToken, setContractToken] = useState("");
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState(false);
  const commandPending = useRef(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [terminalTransition, setTerminalTransition] = useState(false);
  const [error, setError] = useState("");
  const [loadErrorCode, setLoadErrorCode] = useState("");
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const [visualKind, setVisualKind] = useState<DrawingDetailPreviewKind>("two-d");
  const [recognitionDirty, setRecognitionDirty] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<DrawingRecognitionEvidence | null>(null);
  const [evidenceOriginKind, setEvidenceOriginKind] = useState<DrawingDetailPreviewKind | null>(null);
  const [showEvidenceFocus, setShowEvidenceFocus] = useState(false);
  const [evidenceLocationNotice, setEvidenceLocationNotice] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [pdfSelection, setPdfSelection] = useState<{ contextKey: string; bindingId: string } | null>(null);
  const uploadWorkFile = useMemo(() => createDrawingWorkFileUploader(workId ?? ""), [workId]);
  const [assemblyBlocked, setAssemblyBlocked] = useState(false);
  async function updateAssemblyBinding(blocked: boolean, binding: string | null) {
    setAssemblyBlocked(blocked);
    if (!binding || !endpoint || !data || data.files?.some(file => file.id === binding)) return;
    const original = data;
    try {
      const response = await fetch(endpoint, {cache:"no-store"});
      if (!response.ok) throw new Error();
      const latest = await response.json() as ResponseShape;
      if (latest.data.workId !== original.workId || latest.data.rowVersion < original.rowVersion) return;
      if (JSON.stringify(latest.data.payload) !== JSON.stringify(original.payload)) {
        setError("圖號欄位已由另一筆操作修改，請核對後重新整理。");
        setReloadAvailable(true);
        return;
      }
      setData(current => current?.workId === original.workId && current.rowVersion === original.rowVersion
        ? {...current, rowVersion:latest.data.rowVersion, files:latest.data.files, interaction:latest.data.interaction}
        : current);
    } catch {setReloadAvailable(true);}
  }
  const loadSequenceRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const safeReturn = returnTo || "/numbering/drawings";
  const endpoint = initialData ? null : reviewRequestId
    ? `/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}`
    : workId ? `/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}` : null;

  function transitionToStale() {
    setData((current) => current ? {
      ...current,
      readonly: true,
      interaction: reviewRequestId
        ? { mode: "review_stale_cleanup", basisState: "stale", canMutateContent: false, canSubmit: false, canCancel: false, canApprove: false, canReturn: true, reasonCode: "DRAWING_PRODUCTION_BASE_STALE" }
        : { mode: "owner_stale_cleanup", basisState: "stale", canMutateContent: false, canSubmit: false, canCancel: true, canApprove: false, canReturn: false, reasonCode: "DRAWING_PRODUCTION_BASE_STALE" }
    } : current);
    setReloadAvailable(false);
  }

  function handleMutationFailure(body: unknown, fallback: string) {
    if (apiCode(body) === "DRAWING_PRODUCTION_BASE_STALE") transitionToStale();
    setError(apiMessage(body, fallback));
  }

  const load = useCallback(async () => {
    if (initialData) {
      setData(initialData); setPayload(initialData.payload ?? {}); setPayloadDirty(false); setContractToken(""); setLoadErrorCode(""); setLoading(false); setReloadAvailable(false); return;
    }
    if (!endpoint) {
      setData(null); setPayload({}); setContractToken(""); setLoadErrorCode("");
      setLoading(false); setError("找不到圖號工作資料。"); setReloadAvailable(true); return;
    }
    const sequence = ++loadSequenceRef.current;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (sequence !== loadSequenceRef.current) return;
      if (!response.ok) {
        const code = apiCode(body) ?? "";
        setData(null); setPayload({}); setContractToken(""); setLoadErrorCode(code);
        setLoading(false);
        setError(code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID"
          ? "圖面工作檔案資料讀取失敗，已暫停所有操作。請交由系統管理員修復後重新載入。"
          : apiMessage(body, "圖號工作資料目前無法載入。"));
        setReloadAvailable(true);
        return;
      }
      const result = body as ResponseShape;
      if (result.data.entityType !== "drawing") {
        setData(null); setPayload({}); setContractToken(""); setLoadErrorCode("");
        setLoading(false); setError("審核對象不是圖號資料。"); setReloadAvailable(true); return;
      }
      setData(result.data); setPayload(result.data.payload ?? {}); setPayloadDirty(false); setContractToken(result.meta.contractToken); setLoadErrorCode(""); setLoading(false); setReloadAvailable(false);
    } catch (error) {
      if (controller.signal.aborted || sequence !== loadSequenceRef.current) return;
      setData(null); setPayload({}); setContractToken(""); setLoadErrorCode("");
      setLoading(false); setError(error instanceof Error ? error.message : "圖號工作資料目前無法載入。"); setReloadAvailable(true);
    }
  }, [endpoint, initialData]);
  useEffect(() => {
    void load();
    return () => loadControllerRef.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!evidenceLocationNotice) return;
    const timer = window.setTimeout(() => setEvidenceLocationNotice(null), 2_800);
    return () => window.clearTimeout(timer);
  }, [evidenceLocationNotice]);
  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(""), 2_800);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  const canLeave = useUnsavedChangesGuard(payloadDirty || recognitionDirty || uploadPending);
  function leave() { if (!busy && canLeave()) router.push(safeReturn); }
  function headers(expectedRowVersion = data?.rowVersion ?? 0) {
    return { "content-type": "application/json", "if-match": `"${expectedRowVersion}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken };
  }
  async function persistPayload(expectedRowVersion: number) {
    if (!data?.workId || !payloadDirty) return { ok: true, rowVersion: expectedRowVersion };
    try {
      const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}`, {
        method: "PATCH",
        headers: headers(expectedRowVersion),
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        handleMutationFailure(body, "工作內容儲存失敗，請重新整理後再試。");
        return { ok: false, rowVersion: expectedRowVersion };
      }
      const rowVersion = Number((body as { data?: { rowVersion?: number } } | null)?.data?.rowVersion ?? expectedRowVersion + 1);
      setData((current) => current ? { ...current, rowVersion, payload } : current);
      setPayloadDirty(false);
      return { ok: true, rowVersion };
    } catch {
      setError("工作內容儲存失敗，請檢查網路後再試。");
      setReloadAvailable(true);
      return { ok: false, rowVersion: expectedRowVersion };
    }
  }
  async function saveDraft() {
    if (!data?.workId || busy || commandPending.current || !payloadDirty || recognitionDirty
      || !(data.interaction?.canMutateContent ?? !data.readonly)) return;
    commandPending.current = true;
    setBusy(true); setSaveNotice(""); setError("");
    try {
      const saved = await persistPayload(data.rowVersion);
      if (saved.ok) {
        setSaveNotice("已儲存");
        // Read back normalization (for example the derived FFF outcome) without
        // remounting the editor or resetting its scroll/preview state.
        try {
          const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}`, {
            cache: "no-store", signal: AbortSignal.timeout(10_000)
          });
          const latest = await response.json() as ResponseShape;
          if (!response.ok || latest.data.workId !== data.workId || latest.data.rowVersion !== saved.rowVersion) throw new Error();
          setData(latest.data); setPayload(latest.data.payload); setContractToken(latest.meta.contractToken);
        } catch {
          setError("工作內容已儲存，但無法確認最新資料；請重新載入後繼續。");
          setReloadAvailable(true);
        }
      }
    } finally {
      commandPending.current = false;
      setBusy(false);
    }
  }
  async function ownerCommand(kind: "submit" | "cancel"): Promise<string | null> {
    const interactionState = data?.interaction;
    if (!data?.workId || busy || commandPending.current || kind === "submit" && (recognitionDirty || interactionState && !interactionState.canSubmit) || kind === "cancel" && interactionState && !interactionState.canCancel) return "目前無法執行此操作。";
    commandPending.current = true;
    const base = `/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}`;
    setBusy(true); setTerminalTransition(true); setError(""); setReloadAvailable(false);
    // Give React one frame to unmount preview and recognition consumers before
    // the terminal command can delete their work-scoped authorization.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      let rowVersion = data.rowVersion;
      if (kind === "submit") {
        const saved = await persistPayload(rowVersion);
        if (!saved.ok) { setTerminalTransition(false); setBusy(false); commandPending.current = false; return "工作內容尚未儲存，未送審。"; }
        rowVersion = saved.rowVersion;
      }
      const response = await fetch(`${base}/${kind}`, { method: "POST", headers: headers(rowVersion), body: "{}" });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setTerminalTransition(false); setBusy(false); commandPending.current = false; handleMutationFailure(body, "操作未完成，請重新整理後再試。"); return apiMessage(body, "操作未完成，請重新整理後再試。"); }
      // Keep the workspace inert until navigation commits. Re-enabling it for
      // one render after a terminal command can restart recognition or reload a
      // reviewer-only preview whose authorization was just consumed.
      router.push(safeReturn);
      return null;
    } catch {
      commandPending.current = false;
      setTerminalTransition(false); setBusy(false); setError("操作未完成，請檢查網路後再試。"); setReloadAvailable(true);
      return "操作未完成，請檢查網路後再試。";
    }
  }
  async function refreshUploadWorkspace() {
    if (!endpoint || !data?.workId) throw new Error("找不到上傳工作。");
    const response = await fetch(endpoint, { cache: "no-store" });
    const latest = await response.json() as ResponseShape;
    if (!response.ok || latest.data?.workId !== data.workId) throw new Error("無法確認最新工作資料，請重新載入。");
    setData(latest.data); setPayload(latest.data.payload); setPayloadDirty(false); setContractToken(latest.meta.contractToken);
  }
  async function beginUnifiedUpload() {
    if (busy || commandPending.current || !data?.workId || !(data.interaction?.canMutateContent ?? !data.readonly)) throw new Error("目前無法上傳。");
    commandPending.current = true; setBusy(true); setError(""); setReloadAvailable(false); setSaveNotice("");
    try {
      const saved = await persistPayload(data.rowVersion);
      if (!saved.ok) throw new Error("請先處理尚未儲存的欄位，再重試上傳。");
      await refreshUploadWorkspace();
    } catch (reason) { commandPending.current = false; setBusy(false); throw reason; }
  }
  async function completeUnifiedUpload() {
    try { await refreshUploadWorkspace(); }
    catch { setError("已完成的上傳已保留，但畫面無法更新，請重新載入。"); setReloadAvailable(true); }
    finally { commandPending.current = false; setBusy(false); }
  }
  async function removeFile(file: FileRow) {
    if (!data?.workId || busy || data.interaction && !data.interaction.canMutateContent) return;
    if (!Boolean(file.current_revision_upload)) return;
    const fileName = file.display_name || file.file_name || "這個檔案";
    if (!window.confirm(`確定移除「${fileName}」？移除後需重新上傳才能送審。`)) return;
    setBusy(true); setError(""); setReloadAvailable(false);
    try {
      const saved = await persistPayload(data.rowVersion);
      if (!saved.ok) return;
      const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}/files/${encodeURIComponent(file.id)}`, { method: "DELETE", headers: headers(saved.rowVersion) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { handleMutationFailure(body, "檔案移除失敗，請重新整理後再試。"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "approve" | "return_for_correction") {
    const interactionState = data?.interaction;
    if (!reviewRequestId || busy || decision === "approve" && interactionState && !interactionState.canApprove || decision === "return_for_correction" && interactionState && !interactionState.canReturn) return;
    setBusy(true); setTerminalTransition(true); setError(""); setReloadAvailable(false);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}/decisions`, { method: "POST", headers: headers(), body: JSON.stringify({ decision }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setTerminalTransition(false); setBusy(false); handleMutationFailure(body, "審核決策未完成。"); return; }
      router.push(safeReturn || "/approvals");
    } catch {
      setTerminalTransition(false); setBusy(false); setError("審核決策未完成，請檢查網路後再試。"); setReloadAvailable(true);
    }
  }

  function locateRecognitionEvidence(evidence: DrawingRecognitionEvidence) {
    const region = evidenceRegion(evidence.geometry);
    if (!evidence.locatable || !region || !isPdfEvidence(evidence) || !evidence.sessionId || !evidence.sourceId) {
      // Keep the rendered PDF mounted; evidence without page coordinates only
      // clears the positioning overlay and must not switch preview renderers.
      setShowEvidenceFocus(false);
      setEvidenceLocationNotice(isPdfEvidence(evidence)
        ? `來源：${evidence.fileName ?? "PDF"}${evidence.pageNumber ? ` 第 ${evidence.pageNumber} 頁` : ""}，但沒有可用的定位座標。`
        : `來源：${evidence.fileName ?? "CAD 檔案屬性"}，這是檔案屬性證據，沒有圖面座標。`);
      return;
    }
    if (!selectedEvidence) setEvidenceOriginKind(visualKind);
    setEvidenceLocationNotice(null);
    setSelectedEvidence(evidence);
    setShowEvidenceFocus(true);
    setVisualKind("two-d");
  }

  function selectVisualKind(kind: DrawingDetailPreviewKind) {
    if (selectedEvidence) {
      setSelectedEvidence(null);
      setShowEvidenceFocus(false);
      setEvidenceOriginKind(null);
    }
    setEvidenceLocationNotice(null);
    setVisualKind(kind);
  }
  function updateChangeImpact(patch: Record<string, unknown>) {
    setSaveNotice("");
    setPayloadDirty(true);
    setPayload((current) => ({
      ...current,
      changeImpact: { ...((current.changeImpact && typeof current.changeImpact === "object" ? current.changeImpact : {}) as Record<string, unknown>), ...patch }
    }));
  }
  function updateFffState(key: "formState" | "fitState" | "functionState", value: ChangeImpactState) {
    setSaveNotice("");
    setPayloadDirty(true);
    setPayload((current) => {
      const impact = current.changeImpact && typeof current.changeImpact === "object" ? current.changeImpact as Record<string, unknown> : {};
      const next = { ...impact, [key]: value };
      const nextStates = [text(next.formState), text(next.fitState), text(next.functionState)];
      if (!nextStates.includes("confirmed_impact")) next.replacement = null;
      if (nextStates.every((state) => state === "no_impact")) next.reasonCategory = null;
      return { ...current, changeImpact: next };
    });
  }
  function updateReplacement(patch: Record<string, unknown>) {
    const current = payload.changeImpact && typeof payload.changeImpact === "object" ? payload.changeImpact as Record<string, unknown> : {};
    const currentReplacement = current.replacement && typeof current.replacement === "object" ? current.replacement as Record<string, unknown> : {};
    updateChangeImpact({ replacement: { sourcePartNumberId: text(currentReplacement.sourcePartNumberId) || affectedPartIds[0] || "", ...currentReplacement, ...patch } });
  }

  const files = useMemo(() => data?.files ?? [], [data?.files]);
  const currentFiles = useMemo(() => files.filter((file) => Boolean(file.current_revision_upload)), [files]);
  const pdfContextKey = JSON.stringify([fileReadContext, data?.entityId, data?.workId, data?.revisionId, reviewRequestId]);
  const selectedPdfBindingId = pdfSelection?.contextKey === pdfContextKey ? pdfSelection.bindingId : undefined;
  const twoDSelection = useMemo(() => selectWorkspacePreviewSource(files, "two-d", selectedPdfBindingId), [files, selectedPdfBindingId]);
  const hasCurrent2d = currentFiles.some((file) => file.role === "drawing_2d" && Boolean(file.is_primary));
  const hasCurrent3d = currentFiles.some((file) => file.role === "cad_3d" && Boolean(file.is_primary));
  const filesReady = hasCurrent2d && hasCurrent3d;
  const previewCards = useMemo(() => {
    const focusRegion = showEvidenceFocus && selectedEvidence?.locatable ? evidenceRegion(selectedEvidence.geometry) : null;
    const evidenceSessionId = selectedEvidence?.sessionId;
    const evidenceSourceId = selectedEvidence?.sourceId;
    return (["three-d", "two-d"] as const).map((kind): DrawingDetailPreviewCard => {
      if (kind === "two-d" && selectedEvidence && evidenceSessionId && evidenceSourceId) {
        const pageNumber = selectedEvidence.pageNumber ?? 1;
        return {
          kind,
          title: "2D 圖面",
          fileName: selectedEvidence.fileName,
          state: "ready",
          stateTitle: "辨識證據已定位",
          stateText: "顯示辨識來源的精確頁面位置。",
          media: {
            href: `/api/numbering/recognition-sessions/${encodeURIComponent(evidenceSessionId)}/sources/${encodeURIComponent(evidenceSourceId)}/content`,
            mode: "document",
            title: `2D 圖面 · 第 ${pageNumber} 頁`,
            alt: selectedEvidence.fileName ?? "辨識來源圖面",
            pageNumber,
            focusRegion: focusRegion ?? undefined,
            renderPdfPage: true,
            openInNewTab: true
          },
          overlay: evidenceLocationNotice ? <div className="dev079-evidence-flash" role="status" aria-live="polite"><FileText size={15} aria-hidden="true" />{evidenceLocationNotice}</div> : undefined
        };
      }
      const file = kind === "two-d" ? twoDSelection.file : selectWorkspacePreviewSource(files, kind).file;
      if (kind === "two-d" && twoDSelection.requiresChoice && !file) return { kind, title: "2D 圖面", fileName: null, state: "missing", stateTitle: "選擇 PDF 圖面", stateText: "本版次有多份 PDF。" };
      const readContextId = fileReadContext === "review_package" ? data?.entityId : data?.workId;
      if (!file || !readContextId || !file.source_file_asset_id) return { kind, title: kind === "three-d" ? "3D 模型" : "2D 圖面", fileName: null, state: "missing", stateTitle: "尚無檔案", stateText: "目前工作資料沒有這類檔案。" };
      const href = pdmFileReadHref({
        fileAssetId: file.source_file_asset_id,
        context: fileReadContext,
        contextId: readContextId,
        bindingId: file.id,
        reviewRequestId
      });
      return {
        kind,
        title: kind === "three-d" ? "3D 模型" : "2D 圖面",
        fileName: file.display_name || file.file_name || null,
        state: "ready",
        stateTitle: "預覽已就緒",
        stateText: "顯示本次工作資料鎖定的檔案。",
        media: {
          href: `${href}&preview=1`,
          mode: kind === "three-d" ? "image" : "document",
          title: file.display_name || file.file_name || "圖面檔案",
          alt: file.display_name || file.file_name || "圖面檔案",
          fullPdf: kind === "two-d" && isWorkspacePdf(file),
          openInNewTab: true
        },
        overlay: evidenceLocationNotice ? <div className="dev079-evidence-flash" role="status" aria-live="polite"><FileText size={15} aria-hidden="true" />{evidenceLocationNotice}</div> : undefined
      };
    });
  }, [data, evidenceLocationNotice, fileReadContext, files, reviewRequestId, selectedEvidence, showEvidenceFocus, twoDSelection]);
  const sourceAssetIds = useMemo(() => files.map((file) => file.source_file_asset_id).filter((id): id is string => Boolean(id)), [files]);
  const title = data?.identity?.code || drawingId || "圖號工作資料";
  const revisionLabel = text(data?.revision ?? payload.revision) || "—";
  const changeImpactRequired = Boolean(data?.changeImpactRequired);
  const changeImpact = payload.changeImpact && typeof payload.changeImpact === "object" ? payload.changeImpact as Record<string, unknown> : {};
  const formState = text(changeImpact.formState) as ChangeImpactState | "";
  const fitState = text(changeImpact.fitState) as ChangeImpactState | "";
  const functionState = text(changeImpact.functionState) as ChangeImpactState | "";
  const fffStates = [formState, fitState, functionState];
  const fffStatesComplete = fffStates.every((state) => state === "no_impact" || state === "suspected_impact" || state === "confirmed_impact");
  const confirmedImpact = [formState, fitState, functionState].includes("confirmed_impact");
  const reasonRequired = fffStates.includes("suspected_impact") || confirmedImpact;
  const affectedPartIds = Array.isArray(changeImpact.affectedPartNumberIds) ? changeImpact.affectedPartNumberIds.map(String) : [];
  const replacement = changeImpact.replacement && typeof changeImpact.replacement === "object" ? changeImpact.replacement as Record<string, unknown> : null;
  const fffReady = !changeImpactRequired || fffStatesComplete
    && (!reasonRequired || Boolean(text(changeImpact.reasonCategory)))
    && (!confirmedImpact || Boolean(text(replacement?.sourcePartNumberId)) && Boolean(text(replacement?.reservedPartNumber)));
  const submitReady = filesReady && fffReady && !assemblyBlocked;
  const returnLabel = reviewRequestId ? "返回審核清單" : "返回圖號清單";
  if (terminalTransition) return <div className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在完成操作...</div>;
  if (loading) return <div className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在載入圖號工作區...</div>;
  if (!data) return <div className="dev079-workspace-state" data-dev100-load-failed={loadErrorCode || "unknown"}><h1>圖號工作區</h1><p role="alert">{error || "找不到這筆圖號工作。"}</p><div className="dev100-load-failure-actions"><button className="secondary-button" type="button" onClick={leave}><ArrowLeft size={15} aria-hidden="true" />{returnLabel}</button><button className="secondary-button" type="button" onClick={() => void load()}>重新載入資料</button></div></div>;

  const canMutateContent = data.interaction?.canMutateContent ?? !data.readonly;
  const canCancel = !snapshotMode && (data.interaction?.canCancel ?? (!data.readonly && !reviewRequestId));
  const canSubmit = !snapshotMode && (data.interaction?.canSubmit ?? (!data.readonly && !reviewRequestId));
  const canApprove = data.interaction?.canApprove ?? (Boolean(reviewRequestId) && !data.readonly);
  const canReturn = data.interaction?.canReturn ?? Boolean(reviewRequestId);
  const stale = data.interaction?.basisState === "stale";
  const rootCode = parseNumberingIdentity(data.identity?.code ?? "").rootCode;

  return <div className={`dev079-workspace${embedded ? " is-embedded" : ""}`} data-dev="DEV-087" data-workspace-kind={reviewRequestId ? "reviewer" : "drawing-revision-work"}>
    {embedded ? null : <header className="dev079-workspace-header dev079-drawing-workspace-header"><div className="dev079-workspace-heading"><button className="icon-button" type="button" onClick={leave} aria-label={returnLabel}><ArrowLeft size={18} /></button><div className="dev079-workspace-heading-copy dev079-drawing-workspace-heading-copy"><span className="canonical-layer is-rd">研發版 {data.revision ?? text(payload.revision)}</span><h1>{title}</h1>{data.identity?.name ? <span className="dev079-drawing-workspace-name">{data.identity.name}</span> : null}</div></div><div className="dev079-workspace-preview-tabs" role="tablist" aria-label="預覽類型">{previewCards.map((card) => <button key={card.kind} type="button" role="tab" aria-selected={card.kind === visualKind} className={card.kind === visualKind ? "is-active" : ""} onClick={() => selectVisualKind(card.kind)}><span>{card.title}</span><small>{card.fileName || "尚無檔案"}</small></button>)}</div></header>}
    {error ? <div className="dev079-workspace-notice is-error" role="alert"><span>{error}</span>{reloadAvailable ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void load()}>重新載入資料</button> : null}</div> : null}
    {!canMutateContent ? <div className="dev079-workspace-notice is-readonly" role="status">{stale ? "量產基準已更新，目前工作已凍結；此頁保留原預覽與證據，僅提供可恢復的清理動作。" : "目前為唯讀；欄位、檔案、預覽與智慧辨識位置和編輯者相同。"}</div> : null}
    <div className="dev079-workspace-grid">
      <section className="dev079-workspace-visual" aria-label="圖面主視覺">{visualKind === "two-d" && !selectedEvidence && twoDSelection.requiresChoice ? <label className="dev122-pdf-source-choice"><span>PDF 圖面</span><select aria-label="本版次 PDF 圖面" value={twoDSelection.file?.id ?? ""} onChange={(event) => setPdfSelection({ contextKey: pdfContextKey, bindingId: event.target.value })}><option value="">請選擇</option>{twoDSelection.pdfs.map((file) => <option key={file.id} value={file.id}>{file.display_name || file.file_name || file.id}</option>)}</select></label> : null}<div className="dev079-visual-panel"><DrawingDetailPreview cards={previewCards} title={null} showHeader={false} showTabs={embedded} showTabFileNames showCardHeader={false} showFileName={false} layout="tabs" activeKind={visualKind} onActiveKindChange={selectVisualKind} /></div></section>
      <aside className="dev079-workspace-detail" aria-label="版次、檔案與智慧辨識"><div className="dev079-task-panel"><div className="dev079-unified-task-content" inert={busy}>
        <section className="dev079-unified-task-section dev079-workspace-editor dev079-workspace-file-editor" aria-labelledby="dev079-files-heading">
          <h2 id="dev079-files-heading" className="dev079-unified-task-heading"><Files size={16} aria-hidden="true" /><span>版次與檔案</span><small className="dev079-workspace-revision">版次 {revisionLabel}</small></h2>
          {reviewRequestId ? <DrawingAssemblyPackagePanel key={reviewRequestId} frozen base={`/api/pdm/review-requests/${encodeURIComponent(reviewRequestId)}/assembly-package`}/>
            : data.workId && !snapshotMode ? <DrawingAssemblyPackagePanel key={data.workId} editable={canMutateContent}
              base={`/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId)}/assembly-packages`}
              uploadControl={context => <DrawingWorkspaceUpload base={`/api/pdm/drawing-revision-works/${encodeURIComponent(data.workId!)}/assembly-packages`}
                code={data.identity?.code ?? title} compact={files.length > 0 || Boolean(context.downloadHref)} disabled={busy || !context.ready}
                activePackageId={context.activePackageId} downloadHref={context.downloadHref} archiveName={context.archiveName}
                onBegin={beginUnifiedUpload} onComplete={completeUnifiedUpload} onUploadFile={uploadWorkFile}
                onPendingChange={setUploadPending} onPackageBusy={context.setBusy} />}
              onChange={(blocked,binding)=>void updateAssemblyBinding(blocked,binding)}/> : null}
          <p className={`dev079-workspace-file-requirement ${filesReady ? "is-ready" : ""}`} role="status">
            {filesReady ? <CheckCircle2 size={15} /> : <FileText size={15} />}
            {filesReady ? "本版次 2D 與 3D 主檔已齊備。" : `送審前須重新上傳本版次主檔：${hasCurrent2d ? "" : ".SLDDRW"}${!hasCurrent2d && !hasCurrent3d ? " ＋ " : ""}${hasCurrent3d ? "" : ".SLDPRT／.SLDASM"}`}
          </p>
          {files.length > 0 ? <ul className="canonical-file-list dev079-workspace-file-list">{files.map((file) => {
            const fileName = file.display_name || file.file_name || "檔案";
            const readContextId = fileReadContext === "review_package" ? data.entityId : data.workId;
            const downloadHref = file.source_file_asset_id && readContextId ? pdmFileReadHref({ fileAssetId: file.source_file_asset_id, context: fileReadContext, contextId: readContextId, bindingId: file.id, reviewRequestId }) : null;
            return <li key={file.id}><div><strong title={fileName}>{fileName}</strong><span>{fileRoleLabel(file)} · {file.current_revision_upload ? "本版次" : "前版參考"}</span></div><div className="dev079-workspace-file-actions">{downloadHref ? <a className="ghost-button" href={downloadHref} download aria-label={`下載 ${fileName}`}><Download size={14} aria-hidden="true" />下載</a> : null}{canMutateContent && Boolean(file.current_revision_upload) ? <button type="button" className="ghost-button" disabled={busy} onClick={() => void removeFile(file)}>移除</button> : null}</div></li>;
          })}</ul> : <p className="canonical-empty">尚無檔案，請先上傳本版次的 2D 與 3D 主檔。</p>}
        </section>
        {changeImpactRequired ? <section className="dev079-unified-task-section dev079-workspace-editor" aria-labelledby="dev079-impact-heading">
          <h2 id="dev079-impact-heading" className="dev079-unified-task-heading"><FileText size={16} aria-hidden="true" />FFF／變更影響</h2>
          {data.affectedParts?.length ? <><p className="canonical-note">判定範圍如下；這些料號尚未因此被視為已確認受影響。</p><ul className="canonical-affected-part-list" aria-label="判定範圍">{data.affectedParts.map((part) => <li key={part.id}><span><strong>{part.code}</strong>{part.name ? ` ${part.name}` : ""}</span></li>)}</ul></> : <p className="canonical-empty">目前沒有可判定的關聯料號</p>}
          <div className="pdm-master-field-grid canonical-fff-grid" data-fff-form-state={formState || "unassessed"} data-fff-fit-state={fitState || "unassessed"} data-fff-function-state={functionState || "unassessed"}>
            {(["formState", "fitState", "functionState"] as const).map((key) => <label key={key}><span>{key === "formState" ? "Form" : key === "fitState" ? "Fit" : "Function"}</span><select data-fff-axis={key} value={text(changeImpact[key])} disabled={!canMutateContent} onChange={(event) => updateFffState(key, event.target.value as ChangeImpactState)}><option value="">請判定</option><option value="no_impact">相容</option><option value="suspected_impact">條件相容</option><option value="confirmed_impact">不相容</option></select></label>)}
            {reasonRequired ? <label><span>原因分類</span><select aria-label="原因分類" value={text(changeImpact.reasonCategory)} disabled={!canMutateContent} onChange={(event) => updateChangeImpact({ reasonCategory: event.target.value || null })}><option value="">請選擇原因</option><option value="form_change">外形變更</option><option value="fit_review">裝配／配合需確認</option><option value="function_change">功能變更</option><option value="material_process_change">材料／製程變更</option>{text(changeImpact.reasonCategory) && !["form_change", "fit_review", "function_change", "material_process_change"].includes(text(changeImpact.reasonCategory)) ? <option value={text(changeImpact.reasonCategory)}>其他既有原因</option> : null}</select></label> : null}
            <label className="pdm-edit-page-field-wide"><span>判定備註</span><textarea rows={2} value={text(changeImpact.note)} disabled={!canMutateContent} onChange={(event) => updateChangeImpact({ note: event.target.value || null })} /></label>
          </div>
          {confirmedImpact ? <div className="canonical-fff-replacement"><strong>不相容需指定替代料號</strong><label><span>替代料號</span><input value={text(replacement?.reservedPartNumber)} disabled={!canMutateContent} onChange={(event) => updateReplacement({ reservedPartNumber: event.target.value })} placeholder="例如 A0001-P01" /></label><label><span>料件類型</span><select value={text(replacement?.itemType) || "self_made"} disabled={!canMutateContent} onChange={(event) => updateReplacement({ itemType: event.target.value })}><option value="self_made">自製</option><option value="purchased">外購</option></select></label><small>來源料號沿用目前關聯清單的第一個正式料號；若資料已變更，送審會阻擋並要求重新整理。</small></div> : null}
          {!fffReady && canMutateContent ? <p className="dev079-workspace-footer-blocker" role="status"><AlertTriangle size={15} aria-hidden="true" />請完成三軸判定，以及適用的原因與替代料號。</p> : null}
        </section> : <section className="dev079-unified-task-section dev079-workspace-editor dev079-related-parts-section" aria-labelledby="dev079-related-parts-heading"><h2 id="dev079-related-parts-heading" className="dev079-unified-task-heading"><FileText size={16} aria-hidden="true" />關聯料號</h2>{data.relatedParts?.length ? <ul className="canonical-affected-part-list" aria-label="關聯料號">{data.relatedParts.map((part) => <li key={part.id}><span><strong>{part.code}</strong>{part.name ? ` ${part.name}` : ""}</span></li>)}</ul> : <p className="canonical-empty">目前沒有直接關聯料號</p>}</section>}
        <section className="dev079-unified-task-section" aria-labelledby="dev079-recognition-heading">
          <h2 id="dev079-recognition-heading" className="dev079-unified-task-heading"><ScanSearch size={16} aria-hidden="true" />智慧辨識</h2>
          {snapshotMode ? isReviewPackageRecognitionProjection(data.recognition)
            ? <DrawingRecognitionWorkspacePanel drawingNumber={data.identity?.code || title} sourceContextType="drawing_revision" sourceContextId={data.revisionId ?? ""} sourceAssetIds={sourceAssetIds} snapshotProjection={data.recognition} disabled />
            : <div className="canonical-note" title="這筆相容資料沒有完整辨識投影"><strong>辨識依據不完整</strong><span>{data.recognition && "status" in data.recognition && data.recognition.status ? `相容狀態：${data.recognition.status}` : "送審時沒有可用的完整辨識快照"}</span></div>
            : data.revisionId ? <DrawingRecognitionWorkspacePanel drawingNumber={data.identity?.code || title} sourceContextType="drawing_revision" sourceContextId={data.revisionId} sourceAssetIds={sourceAssetIds} disabled={!canMutateContent || busy} onEvidenceSelect={locateRecognitionEvidence} onDirtyChange={setRecognitionDirty} /> : <p className="canonical-empty">這筆工作資料尚無可辨識的版次來源。</p>}
        </section>
      </div>
      </div>{suppressFooter ? null : <footer className="dev079-workspace-footer" aria-label="圖號工作區操作列"><div className="dev079-workspace-footer-actions">
        {recognitionDirty ? <span className="dev079-workspace-footer-blocker" role="status"><AlertTriangle size={15} aria-hidden="true" />請先儲存智慧辨識欄位修改</span> : null}
        {saveNotice ? <span role="status">{saveNotice}</span> : null}
        {reviewRequestId ? <>
          {canReturn ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void decide("return_for_correction")}><XCircle size={15} />退回修改</button> : null}
          {canApprove ? <button className="primary-button" type="button" disabled={busy} onClick={() => void decide("approve")}><CheckCircle2 size={15} />核准</button> : null}
          <button className="secondary-button" type="button" disabled={busy} onClick={leave}>返回審核清單</button>
        </> : <>
          {canMutateContent ? <button className="secondary-button" type="button" disabled={busy || !payloadDirty || recognitionDirty} onClick={() => void saveDraft()}>{busy ? "處理中…" : "儲存"}</button> : null}
          {data.workId && !snapshotMode ? <WorkbenchDeleteAction code={data.identity?.code ?? title} entityType="drawing" version={revisionLabel} rootCode={rootCode} disabled={busy}
            workBlockedReason={canCancel ? null : "目前沒有可捨棄的編修，或你沒有捨棄權限。"}
            permanentBlockedReason={!canMutateContent || stale ? "目前為唯讀，無法永久刪除。" : !rootCode ? "找不到圖料根號，無法確認刪除範圍。" : null}
            onBeforeDelete={() => !busy && !commandPending.current}
            onDeleteWork={() => ownerCommand("cancel")}
            onPermanentDeleted={() => router.push(safeReturn)} /> : null}
          {canSubmit ? <button className="primary-button" type="button" disabled={busy || uploadPending || recognitionDirty || !submitReady} onClick={() => void ownerCommand("submit")} title={recognitionDirty ? "請先儲存智慧辨識欄位修改" : !filesReady ? "請先重新上傳本版次的 2D 與 3D 主檔" : !fffReady ? "請先完成 FFF 判定" : undefined}><Send size={15} />送審</button> : null}
        </>}
      </div></footer>}</aside>
    </div>
  </div>;
}
