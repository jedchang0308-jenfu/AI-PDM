"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Check, Download, ExternalLink, FileText, History, RefreshCw, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { compareRevisionCodes, suggestRevisionCode, type RevisionLifecycleStage } from "@/lib/revision-policy";
import { formatStatusErrorForUser } from "@/lib/status-display";

type AttachmentEntityType = "drawing_number" | "part_number";
type DriveStatus = "none" | "uploading" | "uploaded" | "failed";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type SupplementReasonCode = "format_file" | "auxiliary_material" | "metadata_correction" | "content_changed_new_revision" | "other";

type LifecycleActionState = {
  allowed: boolean;
  reasonCode?: string;
  message?: string;
};

type LifecycleActionPolicy = {
  stageLabel: "草稿" | "審核中" | "正式" | "歷史";
  uiSurface: "work_list" | "deleted_data" | "controlled_history";
  traceabilityClass: "working" | "uncontrolled_deleted" | "controlled_history";
  detailTags: string[];
  actions: {
    restore?: LifecycleActionState;
  };
};

type PreviewDerivative = {
  id: string;
  derivativeKind: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  sourceContentHash: string;
  generatorProfile: string;
  generatorVersion: string | null;
  status: "ready" | "stale" | "retired" | "failed";
  createdAt: string;
};

type PreviewJob = {
  id: string;
  requestedKind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
  sourceContentHash: string;
  sourceExtension: string;
  generatorProfile: string;
  attemptCount: number;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type MasterAttachment = {
  id: string;
  documentCategory: string;
  displayName: string;
  description: string;
  revision: string | null;
  fileName: string;
  fileExt: string;
  fileSize: number;
  contentHash: string;
  gdriveFileId: string | null;
  gdriveStatus: DriveStatus;
  gdriveError: string | null;
  gdriveSyncedAt: string | null;
  uploadedByName: string | null;
  sourceSubmissionId: string | null;
  sourceSubmissionStatus: string | null;
  sourceSubmissionRevision: string | null;
  sourceSubmissionCreatedAt: string | null;
  sourceSubmissionReleasedAt: string | null;
  revisionPackageId: string | null;
  revisionPackageStatus: string | null;
  revisionPackageRevision: string | null;
  revisionPackageSourceSubmissionId: string | null;
  revisionPackageFileKind: string | null;
  revisionPackageSupplementId: string | null;
  revisionPackageSupplementStatus: string | null;
  revisionPackageSupplementReasonCode: string | null;
  revisionPackageSupplementReviewedAt: string | null;
  previewDerivatives?: PreviewDerivative[];
  previewJob?: PreviewJob | null;
  createdAt: string;
};

type DrawingPreviewSlot = {
  kind: "three-d" | "two-d";
  title: string;
  emptyTitle: string;
  emptyText: string;
  fallbackText: string;
  attachment: MasterAttachment | null;
};

type PreviewPlaceholderState = {
  title: string;
  text: string;
  action: { label: string; disabled?: boolean } | null;
};

type AttachmentRevisionGroup = {
  revision: string;
  attachments: MasterAttachment[];
};

type DeletedMasterAttachment = {
  attachment: MasterAttachment;
  policy: LifecycleActionPolicy;
};

type PendingRevisionReviews = {
  count: number;
  revisions: string[];
  workbenchHref: string;
  canReview: boolean;
};

const drawingCategories = [
  { value: "cad_3d", label: "3D CAD" },
  { value: "intermediate", label: "中繼模型" },
  { value: "drawing_2d", label: "2D 圖面" },
  { value: "dwg", label: "DWG/DXF" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "其他" }
];

const partCategories = [
  { value: "cad_3d", label: "共用 3D CAD" },
  { value: "intermediate", label: "共用中繼模型" },
  { value: "catalog", label: "型錄" },
  { value: "spec_sheet", label: "規格書" },
  { value: "supplier_doc", label: "供應商文件" },
  { value: "test_report", label: "測試報告" },
  { value: "other", label: "其他" }
];

const supplementReasons: Array<{ code: SupplementReasonCode; label: string; wording: string; noteRequired: boolean; revisionWarning: boolean }> = [
  { code: "format_file", label: "補交格式檔", wording: "設計內容未變，只補交其他格式檔。", noteRequired: false, revisionWarning: false },
  { code: "auxiliary_material", label: "補交輔助資料", wording: "不作為設計變更依據，只作為作業輔助資料。", noteRequired: false, revisionWarning: false },
  { code: "metadata_correction", label: "修正附件資訊", wording: "只修正附件資訊，不更換正式設計內容。", noteRequired: false, revisionWarning: false },
  { code: "content_changed_new_revision", label: "內容有變更，建立新版次", wording: "這不是補附件，應建立新版次。", noteRequired: false, revisionWarning: true },
  { code: "other", label: "其他", wording: "請補充說明補件原因。", noteRequired: true, revisionWarning: false }
];

function formatAttachmentActionError(value: unknown, fallbackAction: string) {
  const text = String(value ?? "").trim();
  if (!text) return `${fallbackAction}。請重新整理後再試；若仍失敗，請 PDM Admin 協助確認附件狀態。`;
  return formatStatusErrorForUser(text, "fileSync");
}

export function MasterAttachmentPanel({
  entityType,
  entityCode,
  developmentPhase,
  processControlled = true,
  pendingRevisionReviews = null
}: {
  entityType: AttachmentEntityType;
  entityCode: string;
  developmentPhase?: NumberingPhase | null;
  processControlled?: boolean;
  pendingRevisionReviews?: PendingRevisionReviews | null;
}) {
  const categories = entityType === "drawing_number" ? drawingCategories : partCategories;
  const baseUrl =
    entityType === "drawing_number"
      ? `/api/numbering/drawings/${encodeURIComponent(entityCode)}/attachments`
      : `/api/parts/${encodeURIComponent(entityCode)}/attachments`;
  const [attachments, setAttachments] = useState<MasterAttachment[]>([]);
  const [category, setCategory] = useState(categories[0]?.value ?? "other");
  const [revision, setRevision] = useState("");
  const [revisionTouched, setRevisionTouched] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [supplementReason, setSupplementReason] = useState<SupplementReasonCode>("format_file");
  const [supplementNote, setSupplementNote] = useState("");
  const [selectedSupplementAttachmentIds, setSelectedSupplementAttachmentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplementLoading, setSupplementLoading] = useState(false);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [deletedAttachments, setDeletedAttachments] = useState<DeletedMasterAttachment[]>([]);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const revisionStage = useMemo(
    () => revisionLifecycleStageForAttachment(entityType, developmentPhase, processControlled),
    [developmentPhase, entityType, processControlled]
  );
  const suggestedRevision = useMemo(
    () => (revisionStage ? suggestRevisionCode(attachments.map((attachment) => ({ revision: attachment.revision ?? "" })), revisionStage) : ""),
    [attachments, revisionStage]
  );
  const attachmentSections = useMemo(() => groupMasterAttachments(attachments, entityType), [attachments, entityType]);
  const drawingPreviewSlots = useMemo(
    () => (entityType === "drawing_number" ? buildDrawingPreviewSlots(attachmentSections.current) : []),
    [attachmentSections.current, entityType]
  );
  const historyRevisionGroups = useMemo(() => groupHistoryAttachmentsByRevision(attachmentSections.history), [attachmentSections.history]);
  const currentRevisionPackageId = useMemo(
    () => attachmentSections.current.find((attachment) => attachment.revisionPackageId)?.revisionPackageId ?? null,
    [attachmentSections.current]
  );
  const supplementReasonDefinition = supplementReasons.find((reason) => reason.code === supplementReason) ?? supplementReasons[0];
  const pendingReviewRevisions = useMemo(() => pendingRevisionReviews?.revisions ?? [], [pendingRevisionReviews?.revisions]);

  function isRevisionPendingReview(revision: string | null | undefined) {
    if (entityType !== "drawing_number") return false;
    const value = String(revision ?? "").trim();
    if (!value) return false;
    return pendingReviewRevisions.some((pendingRevision) => compareAttachmentRevision(pendingRevision, value) === 0);
  }

  const loadAttachments = useCallback(async (options?: { clearMessage?: boolean }) => {
    setLoading(true);
    if (options?.clearMessage !== false) setMessage(null);
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "附件清單載入未完成"));
      setAttachments(body.attachments ?? []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "附件清單載入未完成") });
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const loadDeletedAttachments = useCallback(async (options?: { clearMessage?: boolean }) => {
    setDeletedLoading(true);
    if (options?.clearMessage !== false) setMessage(null);
    try {
      const response = await fetch(`${baseUrl}?surface=deleted_data`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "已刪除附件載入未完成"));
      setDeletedAttachments(body.attachments ?? []);
      setDeletedLoaded(true);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "已刪除附件載入未完成") });
    } finally {
      setDeletedLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    setCategory(categories[0]?.value ?? "other");
    setRevision("");
    setRevisionTouched(false);
    setDisplayName("");
    setDescription("");
    setFiles([]);
    setSelectedSupplementAttachmentIds([]);
    setAttachments([]);
    setDeletedAttachments([]);
    setDeletedLoaded(false);
    void loadAttachments();
  }, [categories, entityCode, loadAttachments]);

  useEffect(() => {
    if (!revisionStage) {
      if (!revisionTouched) setRevision("");
      return;
    }
    if (!revisionTouched || !revision.trim()) setRevision(suggestedRevision);
  }, [revision, revisionStage, revisionTouched, suggestedRevision]);

  async function uploadAttachment(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) {
      setMessage({ type: "error", text: "請先選擇附件檔案" });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      for (const selectedFile of files) {
        const form = new FormData();
        form.append("file", selectedFile);
        form.append("document_category", category);
        form.append("revision", revision.trim());
        form.append("display_name", files.length === 1 ? displayName.trim() : "");
        form.append("description", description.trim());
        const response = await fetch(baseUrl, { method: "POST", body: form });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "附件上傳未完成"));
      }
      setMessage({ type: "success", text: `${files.length} 個附件已建立，系統會依設定同步到 Google Drive` });
      setRevision("");
      setRevisionTouched(false);
      setDisplayName("");
      setDescription("");
      setFiles([]);
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "附件上傳未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function requestSupplement(event: FormEvent) {
    event.preventDefault();
    if (!currentRevisionPackageId) {
      setMessage({ type: "error", text: "目前正式版尚未建立版次附件包，不能申請補件。" });
      return;
    }
    if (selectedSupplementAttachmentIds.length === 0) {
      setMessage({ type: "error", text: "請先選擇要補交的附件。" });
      return;
    }
    if (supplementReasonDefinition.noteRequired && !supplementNote.trim()) {
      setMessage({ type: "error", text: "請填寫補件原因說明。" });
      return;
    }
    setSupplementLoading(true);
    setMessage(null);
    try {
      const selectedAttachments = attachmentSections.work.filter((attachment) => selectedSupplementAttachmentIds.includes(attachment.id));
      const response = await fetch(`/api/numbering/drawing-revision-packages/${encodeURIComponent(currentRevisionPackageId)}/supplements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reasonCode: supplementReason,
          reasonNote: supplementNote,
          files: selectedAttachments.map((attachment) => ({
            fileId: attachment.id,
            role: supplementRoleFromAttachment(attachment),
            displayName: attachment.displayName,
            description: attachment.description
          }))
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "補件申請未完成"));
      setMessage({
        type: "success",
        text: body.revisionWarningShown ? "補件申請已送出；此原因已提醒應建立新版次，請等待主管或 Admin 審核。" : "補件申請已送出，請等待主管或 Admin 審核。"
      });
      setSelectedSupplementAttachmentIds([]);
      setSupplementNote("");
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "補件申請未完成") });
    } finally {
      setSupplementLoading(false);
    }
  }

  async function deleteAttachment(attachment: MasterAttachment) {
    if (!window.confirm(`刪除附件「${attachment.displayName || attachment.fileName}」？`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${baseUrl}/${encodeURIComponent(attachment.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Deleted from master attachment panel" })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "附件刪除未完成"));
      setMessage({ type: "success", text: "附件已刪除" });
      await loadAttachments({ clearMessage: false });
      if (deletedLoaded) await loadDeletedAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "附件刪除未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function restoreAttachment(deleted: DeletedMasterAttachment) {
    const { attachment } = deleted;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${baseUrl}/${encodeURIComponent(attachment.id)}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Restored from deleted attachment panel" })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "附件還原未完成"));
      setMessage({ type: "success", text: "附件已還原" });
      await loadAttachments({ clearMessage: false });
      await loadDeletedAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "附件還原未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function retryDriveSync(attachment: MasterAttachment) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${baseUrl}/${encodeURIComponent(attachment.id)}`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "Google Drive 同步未完成"));
      setMessage({ type: "success", text: "已重新執行 Google Drive 同步" });
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "Google Drive 同步未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function generatePreview(attachment: MasterAttachment) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${baseUrl}/${encodeURIComponent(attachment.id)}/previews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestedKind: "native_thumbnail_png", forceRegenerate: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "預覽產生未完成"));
      setMessage({ type: "success", text: "預覽產生任務已排程，等待 Windows worker 產生實際檔案縮圖。" });
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "預覽產生未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function decideSupplement(attachment: MasterAttachment, decision: "approve" | "reject") {
    if (!attachment.revisionPackageSupplementId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/numbering/drawing-revision-packages/supplements/${encodeURIComponent(attachment.revisionPackageSupplementId)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "補件審核未完成"));
      setMessage({ type: "success", text: decision === "approve" ? "補件已核准" : "補件已駁回" });
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "補件審核未完成") });
    } finally {
      setLoading(false);
    }
  }

  function renderAttachmentRow(attachment: MasterAttachment, options?: { forceHistory?: boolean; compact?: boolean; minimal?: boolean }) {
    const downloadUrl = `${baseUrl}/${encodeURIComponent(attachment.id)}`;
    const isPdf = attachment.fileExt.toLowerCase() === "pdf";
    const submissionState = attachmentSubmissionState(attachment, options);
    const traceSubmissionId = attachment.sourceSubmissionId || attachment.revisionPackageSourceSubmissionId;
    const isSupplement = isApprovedSupplementAttachment(attachment);
    const attachmentRevision = getAttachmentRevision(attachment);
    const revisionPendingReview = isRevisionPendingReview(attachmentRevision);
    const quiet = options?.compact || options?.minimal;
    return (
      <article className={`master-attachment-row${options?.forceHistory ? " history" : ""}${options?.compact ? " compact" : ""}${options?.minimal ? " minimal" : ""}`} key={attachment.id}>
        <div className={`master-attachment-icon${options?.forceHistory ? " history" : ""}`} aria-hidden="true">
          <FileText size={18} />
        </div>
        <div className="master-attachment-main">
          <div className="master-attachment-title-row">
            <strong title={attachment.fileName}>{attachment.displayName || attachment.fileName}</strong>
            {isSupplement ? <span className="master-attachment-status supplement">補件</span> : null}
            {revisionPendingReview ? <span className="master-attachment-status approval-pending">待審</span> : null}
            {!quiet ? <span className={`master-attachment-status ${submissionState.tone}`}>{submissionState.label}</span> : null}
            {!quiet || attachment.gdriveStatus === "failed" ? <span className={`master-attachment-status ${attachment.gdriveStatus}`}>{driveStatusLabel(attachment.gdriveStatus)}</span> : null}
          </div>
          <div className="master-attachment-meta">
            <span>{categoryLabel(attachment.documentCategory)}</span>
            {!options?.minimal && attachmentRevision ? <span>版次 {attachmentRevision}</span> : null}
            {!options?.minimal ? <span>{attachment.fileExt.toUpperCase()}</span> : null}
            {!options?.minimal ? <span>{formatBytes(attachment.fileSize)}</span> : null}
            {!quiet ? <span>{formatDateTime(attachment.createdAt)}</span> : null}
          </div>
          {!quiet && attachment.description ? <p>{attachment.description}</p> : null}
          {options?.minimal ? null : options?.compact ? (
            traceSubmissionId ? (
              <p className={`master-attachment-submission-note ${submissionState.tone}`}>
                <a href={`/submissions/${encodeURIComponent(traceSubmissionId)}`}>送審 {traceSubmissionId}</a>
              </p>
            ) : null
          ) : (
            <p className={`master-attachment-submission-note ${submissionState.tone}`}>
              {submissionState.note}
              {traceSubmissionId ? (
                <>
                  {" "}
                  <a href={`/submissions/${encodeURIComponent(traceSubmissionId)}`}>查看送審</a>
                </>
              ) : null}
            </p>
          )}
          {attachment.gdriveError ? <p className="master-attachment-error">{formatAttachmentActionError(attachment.gdriveError, "Google Drive 同步未完成")}</p> : null}
        </div>
        <div className="master-attachment-actions">
          {isPdf ? (
            <a className="icon-button" href={`${downloadUrl}?preview=1`} target="_blank" rel="noreferrer" title="預覽 PDF" aria-label="預覽 PDF">
              <ExternalLink size={16} />
            </a>
          ) : null}
          <a className="icon-button" href={downloadUrl} title="下載附件" aria-label="下載附件">
            <Download size={16} />
          </a>
          {attachment.gdriveFileId ? (
            <a
              className="icon-button"
              href={`https://drive.google.com/file/d/${encodeURIComponent(attachment.gdriveFileId)}/view`}
              target="_blank"
              rel="noreferrer"
              title="開啟 Google Drive 檔案"
              aria-label="開啟 Google Drive 檔案"
            >
              <ExternalLink size={16} />
            </a>
          ) : null}
          {attachment.gdriveStatus === "failed" || attachment.gdriveStatus === "none" ? (
            <button className="icon-button" type="button" onClick={() => void retryDriveSync(attachment)} disabled={loading} title="重新同步 Google Drive" aria-label="重新同步 Google Drive">
              <RefreshCw size={16} />
            </button>
          ) : null}
          {attachment.revisionPackageFileKind === "supplement" && attachment.revisionPackageSupplementStatus === "Pending" ? (
            <>
              <button className="icon-button success" type="button" onClick={() => void decideSupplement(attachment, "approve")} disabled={loading} title="核准補件" aria-label="核准補件">
                <Check size={16} />
              </button>
              <button className="icon-button danger" type="button" onClick={() => void decideSupplement(attachment, "reject")} disabled={loading} title="駁回補件" aria-label="駁回補件">
                <X size={16} />
              </button>
            </>
          ) : null}
          <button className="icon-button danger" type="button" onClick={() => void deleteAttachment(attachment)} disabled={loading} title="刪除附件" aria-label="刪除附件">
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }

  function renderPreviewCard(slot: DrawingPreviewSlot) {
    const attachment = slot.attachment;
    const downloadUrl = attachment ? `${baseUrl}/${encodeURIComponent(attachment.id)}` : "";
    const derivative = attachment ? findReadyPreviewDerivative(attachment, slot.kind) : null;
    const previewMode = derivative ? derivativePreviewMode(derivative) : attachment ? attachmentPreviewMode(attachment) : "none";
    const previewUrl = attachment ? previewUrlForAttachment(attachment, downloadUrl, previewMode, derivative) : "";
    const previewPlaceholder: PreviewPlaceholderState = attachment ? attachmentPreviewPlaceholder(attachment, slot) : { title: slot.emptyTitle, text: slot.emptyText, action: null };

    return (
      <article className={`drawing-preview-card ${slot.kind}`} key={slot.kind}>
        <div className="drawing-preview-card-header">
          <div>
            <strong>{slot.title}</strong>
          </div>
        </div>
        <div className={`drawing-preview-frame${previewMode === "none" ? " placeholder-frame" : ""}`}>
          {previewMode === "pdf" ? <iframe title={`${slot.title} PDF 預覽`} src={previewUrl} /> : null}
          {previewMode === "image" ? <img src={previewUrl} alt={`${slot.title} 預覽`} /> : null}
          {previewMode === "drive" ? <iframe title={`${slot.title} Google Drive 預覽`} src={previewUrl} /> : null}
          {previewMode === "none" ? (
            <div className="drawing-preview-placeholder">
              {slot.kind === "three-d" ? <Box size={36} /> : <FileText size={34} />}
              <strong>{previewPlaceholder.title}</strong>
              <span>{previewPlaceholder.text}</span>
              {attachment && previewPlaceholder.action ? (
                <button
                  className="secondary-button preview-generate-button"
                  type="button"
                  onClick={() => void generatePreview(attachment)}
                  disabled={loading || previewPlaceholder.action.disabled}
                  title={previewPlaceholder.action.label}
                  aria-label={`${slot.title}${previewPlaceholder.action.label}`}
                >
                  <RefreshCw size={15} />
                  {previewPlaceholder.action.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="drawing-preview-footer">
          <div>
            <strong title={attachment?.fileName}>{attachment?.displayName || attachment?.fileName || "尚無正式檔案"}</strong>
          </div>
          {attachment ? (
            <div className="drawing-preview-actions">
              {previewMode !== "none" ? (
                <a className="icon-button" href={previewUrl} target="_blank" rel="noreferrer" title="開啟預覽" aria-label={`開啟${slot.title}預覽`}>
                  <ExternalLink size={16} />
                </a>
              ) : null}
              {isNativeSolidWorksAttachment(attachment) ? (
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => void generatePreview(attachment)}
                  disabled={loading}
                  title="重新產生預覽"
                  aria-label={`重新產生${slot.title}預覽`}
                >
                  <RefreshCw size={16} />
                </button>
              ) : null}
              <a className="icon-button" href={downloadUrl} title="下載附件" aria-label={`下載${slot.title}附件`}>
                <Download size={16} />
              </a>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const uploadForm = (
    <form className="master-attachment-form" onSubmit={uploadAttachment}>
      <label>
        類別
        <select className="dropdown-select" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => (
            <option value={item.value} key={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        版次
        <input
          value={revision}
          onChange={(event) => {
            setRevisionTouched(true);
            setRevision(event.target.value);
          }}
          placeholder={revisionStage ? suggestedRevision || "1 / 0.1" : "1 / 0.1"}
        />
        <small>{revisionHelpText(revisionStage, suggestedRevision)}</small>
      </label>
      <label>
        顯示名稱
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="未填則使用檔名" />
      </label>
      <label>
        說明
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="用途、來源或注意事項" />
      </label>
      <div className="master-attachment-file">
        <FileDropzone
          label="拖曳或選擇附件"
          description="可一次上傳多個附件"
          multiple
          selectedFiles={files}
          variant="compact"
          onClearSelected={() => setFiles([])}
          onFilesSelected={(selected) => setFiles(selected)}
        />
      </div>
      <button className="primary-button" type="submit" disabled={loading || files.length === 0}>
        <UploadCloud size={16} />
        上傳附件
      </button>
    </form>
  );

  const drawingPreviewBoard =
    drawingPreviewSlots.length > 0 ? (
      <section className="drawing-preview-board" aria-label="正式圖面預覽">
        <div className="drawing-preview-board-header">
          <div>
            <h3>正式版{attachmentSections.currentRevision ? ` ${attachmentSections.currentRevision}` : ""}</h3>
          </div>
          <strong>{attachmentSections.current.length} 個檔案</strong>
        </div>
        <div className="drawing-preview-grid">{drawingPreviewSlots.map((slot) => renderPreviewCard(slot))}</div>
      </section>
    ) : null;

  return (
    <section className="panel master-attachment-panel">
      <div className="panel-header">
        <div>
          <h2>{entityType === "drawing_number" ? "圖號附件庫" : "料號附件庫"}</h2>
          <p>本主檔可掛多個檔案，並同步到 Google Drive 主檔附件庫。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadAttachments()} disabled={loading}>
          <RefreshCw size={16} />
          重新整理
        </button>
      </div>

      {entityType === "drawing_number" ? drawingPreviewBoard : null}

      {message ? <div className={`master-attachment-message ${message.type}`}>{message.text}</div> : null}

      {entityType === "drawing_number" ? (
        <details className="master-attachment-upload-panel">
          <summary>
            <span>
              <UploadCloud size={16} />
              新增附件
            </span>
          </summary>
          {uploadForm}
        </details>
      ) : (
        uploadForm
      )}

      <div className="master-attachment-sections" aria-live="polite">
        {attachmentSections.current.length > 0 && entityType === "drawing_number" ? (
          <details className="master-attachment-current-details">
            <summary>
              <span>
                <FileText size={16} />
                檔案明細
              </span>
              <strong>{attachmentSections.current.length} 個</strong>
            </summary>
            <p>下載、同步或追溯時再展開。</p>
            <div className="master-attachment-list">{attachmentSections.current.map((attachment) => renderAttachmentRow(attachment, { compact: true }))}</div>
          </details>
        ) : null}

        {attachmentSections.current.length > 0 && entityType !== "drawing_number" ? (
          <section className="master-attachment-section current">
            <div className="master-attachment-section-header">
              <div>
                <h3>目前附件</h3>
                <p>目前可在此主檔下使用的附件。</p>
              </div>
              <strong>{attachmentSections.current.length} 個</strong>
            </div>
            <div className="master-attachment-list">{attachmentSections.current.map((attachment) => renderAttachmentRow(attachment))}</div>
          </section>
        ) : null}

        {attachmentSections.work.length > 0 ? (
          <section className="master-attachment-section work">
            <div className="master-attachment-section-header">
              <div>
                <h3>待處理附件</h3>
                <p>這些還不是正式附件，請依狀態送審、補件或排除。</p>
              </div>
              <strong>{attachmentSections.work.length} 個</strong>
            </div>
            {entityType === "drawing_number" && currentRevisionPackageId ? (
              <form className="master-attachment-supplement-form" onSubmit={requestSupplement}>
                <div className="master-attachment-supplement-grid">
                  <label>
                    補件原因
                    <select className="dropdown-select" value={supplementReason} onChange={(event) => setSupplementReason(event.target.value as SupplementReasonCode)}>
                      {supplementReasons.map((reason) => (
                        <option value={reason.code} key={reason.code}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    說明{supplementReasonDefinition.noteRequired ? "（必填）" : ""}
                    <input value={supplementNote} onChange={(event) => setSupplementNote(event.target.value)} placeholder={supplementReasonDefinition.wording} />
                  </label>
                </div>
                {supplementReasonDefinition.revisionWarning ? (
                  <div className="master-attachment-supplement-warning">
                    <strong>應建立新版次</strong>
                    <span>你選擇的原因表示正式設計內容可能已變更。若仍要補附件，系統會保留此提醒與審核紀錄。</span>
                  </div>
                ) : (
                  <p>{supplementReasonDefinition.wording}</p>
                )}
                <div className="master-attachment-supplement-files">
                  {attachmentSections.work.map((attachment) => (
                    <label key={`supplement-${attachment.id}`}>
                      <input
                        type="checkbox"
                        checked={selectedSupplementAttachmentIds.includes(attachment.id)}
                        onChange={(event) => {
                          setSelectedSupplementAttachmentIds((current) =>
                            event.target.checked ? [...current, attachment.id] : current.filter((id) => id !== attachment.id)
                          );
                        }}
                      />
                      <span>{attachment.displayName || attachment.fileName}</span>
                      <small>{categoryLabel(attachment.documentCategory)} / {attachment.fileExt.toUpperCase()}</small>
                    </label>
                  ))}
                </div>
                <button className="secondary-button" type="submit" disabled={supplementLoading || selectedSupplementAttachmentIds.length === 0}>
                  申請補件
                </button>
              </form>
            ) : null}
            <div className="master-attachment-list">{attachmentSections.work.map((attachment) => renderAttachmentRow(attachment))}</div>
          </section>
        ) : null}

        {attachments.length === 0 ? <div className="empty">尚未建立附件。現在請在上方選擇檔案並上傳；若只是查看資料，這裡不用處理。</div> : null}
      </div>

      {attachmentSections.history.length > 0 ? (
        <details className="master-attachment-history">
          <summary>
            <span>
              <History size={16} />
              歷史版本
            </span>
            <strong>{historyRevisionGroups.length} 個版次</strong>
          </summary>
          <div className="master-attachment-history-body">
            <div className="master-attachment-history-revisions">
              {historyRevisionGroups.map((group) => (
                <details className="master-attachment-history-revision" key={group.revision}>
                  <summary>
                    <span>
                      版次 {group.revision}
                      {isRevisionPendingReview(group.revision) ? (
                        pendingRevisionReviews?.canReview ? (
                          <a
                            className="master-attachment-status approval-pending"
                            href={pendingRevisionReviews.workbenchHref}
                            onClick={(event) => event.stopPropagation()}
                          >
                            待審
                          </a>
                        ) : (
                          <span className="master-attachment-status approval-pending">待審</span>
                        )
                      ) : null}
                    </span>
                    <strong>{group.attachments.length} 個檔案</strong>
                  </summary>
                  <div className="master-attachment-list">{group.attachments.map((attachment) => renderAttachmentRow(attachment, { forceHistory: true, minimal: true }))}</div>
                </details>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <details
        className="master-attachment-deleted"
        onToggle={(event) => {
          if (event.currentTarget.open && !deletedLoaded && !deletedLoading) void loadDeletedAttachments();
        }}
      >
        <summary>
          <span>
            <History size={16} />
            已刪除資料
          </span>
          <strong>{deletedLoaded ? deletedAttachments.length : "未載入"}</strong>
        </summary>
        <div className="master-attachment-deleted-body">
          <div className="master-attachment-deleted-toolbar">
            <p>這裡只放可復原的附件刪除紀錄，受控歷史與作廢紀錄不在此處。</p>
            <button className="secondary-button" type="button" onClick={() => void loadDeletedAttachments()} disabled={deletedLoading || loading}>
              <RefreshCw size={16} />
              重新整理
            </button>
          </div>
          <div className="master-attachment-list" aria-live="polite">
            {deletedAttachments.map((deleted) => {
              const { attachment, policy } = deleted;
              const restoreState = policy.actions.restore;
              const canRestore = restoreState?.allowed === true;
              return (
                <article className="master-attachment-row deleted" key={attachment.id}>
                  <div className="master-attachment-icon history" aria-hidden="true">
                    <History size={18} />
                  </div>
                  <div className="master-attachment-main">
                    <div className="master-attachment-title-row">
                      <strong title={attachment.fileName}>{attachment.displayName || attachment.fileName}</strong>
                      <span className="master-attachment-status history">{policy.stageLabel}</span>
                      {policy.detailTags.map((tag) => (
                        <span className={`master-attachment-status ${tag === "可還原" ? "restorable" : "blocked"}`} key={`${attachment.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="master-attachment-meta">
                      <span>{categoryLabel(attachment.documentCategory)}</span>
                      {attachment.revision ? <span>版次 {attachment.revision}</span> : null}
                      <span>{attachment.fileExt.toUpperCase()}</span>
                      <span>{formatBytes(attachment.fileSize)}</span>
                      <span>{formatDateTime(attachment.createdAt)}</span>
                    </div>
                    {attachment.description ? <p>{attachment.description}</p> : null}
                    {!canRestore && restoreState?.message ? <p className="master-attachment-error">{formatAttachmentActionError(restoreState.message, "附件目前不可還原")}</p> : null}
                  </div>
                  <div className="master-attachment-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void restoreAttachment(deleted)}
                      disabled={loading || deletedLoading || !canRestore}
                      title={canRestore ? "還原附件" : restoreState?.message ? formatAttachmentActionError(restoreState.message, "附件目前不可還原") : "不可還原"}
                      aria-label={canRestore ? "還原附件" : restoreState?.message ? formatAttachmentActionError(restoreState.message, "附件目前不可還原") : "不可還原"}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
            {deletedLoading ? <div className="empty">正在載入已刪除資料...</div> : null}
            {deletedLoaded && deletedAttachments.length === 0 ? <div className="empty">目前沒有已刪除附件，不用處理。</div> : null}
          </div>
        </div>
      </details>
    </section>
  );
}

function categoryLabel(value: string) {
  return [...drawingCategories, ...partCategories].find((item) => item.value === value)?.label ?? value;
}

function buildDrawingPreviewSlots(attachments: MasterAttachment[]): DrawingPreviewSlot[] {
  if (attachments.length === 0) return [];
  return [
    {
      kind: "three-d",
      title: "3D 模型",
      emptyTitle: "沒有正式 3D 檔",
      emptyText: "目前正式版沒有 3D CAD；若製造或審核需要，請回圖面進版補件。",
      fallbackText: "尚未產生瀏覽器可看的 3D 縮圖。",
      attachment: findPreviewAttachment(attachments, "three-d")
    },
    {
      kind: "two-d",
      title: "2D 圖面",
      emptyTitle: "沒有正式 2D 檔",
      emptyText: "目前正式版沒有 2D 圖面；若需要出圖或加工，請回圖面進版補件。",
      fallbackText: "尚未產生 PDF 或圖片預覽。",
      attachment: findPreviewAttachment(attachments, "two-d")
    }
  ];
}

function findPreviewAttachment(attachments: MasterAttachment[], kind: DrawingPreviewSlot["kind"]) {
  const candidates = attachments.filter((attachment) => (kind === "three-d" ? isThreeDimensionalAttachment(attachment) : isTwoDimensionalAttachment(attachment)));
  return [...candidates].sort(comparePreviewPreference)[0] ?? null;
}

function comparePreviewPreference(left: MasterAttachment, right: MasterAttachment) {
  return previewPriority(left) - previewPriority(right) || sortMasterAttachments(left, right);
}

function previewPriority(attachment: MasterAttachment) {
  const extension = attachment.fileExt.toLowerCase();
  if (hasReadyPreviewDerivative(attachment)) return 0;
  if (extension === "pdf") return 1;
  if (isImageAttachment(attachment)) return 2;
  if (attachment.gdriveFileId && attachment.gdriveStatus === "uploaded") return 3;
  if (["slddrw", "dwg", "dxf"].includes(extension)) return 4;
  if (["sldprt", "sldasm"].includes(extension)) return 5;
  return 6;
}

function isThreeDimensionalAttachment(attachment: MasterAttachment) {
  return attachment.documentCategory === "cad_3d" || ["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t"].includes(attachment.fileExt.toLowerCase());
}

function isTwoDimensionalAttachment(attachment: MasterAttachment) {
  return attachment.documentCategory === "drawing_2d" || ["slddrw", "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp", "svg"].includes(attachment.fileExt.toLowerCase());
}

function isImageAttachment(attachment: MasterAttachment) {
  return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(attachment.fileExt.toLowerCase());
}

function isNativeSolidWorksAttachment(attachment: MasterAttachment) {
  return ["sldprt", "sldasm", "slddrw"].includes(attachment.fileExt.toLowerCase());
}

function hasReadyPreviewDerivative(attachment: MasterAttachment) {
  return Boolean(findReadyPreviewDerivative(attachment, isTwoDimensionalAttachment(attachment) ? "two-d" : "three-d"));
}

function findReadyPreviewDerivative(attachment: MasterAttachment, slotKind: DrawingPreviewSlot["kind"]) {
  const acceptedKinds = slotKind === "two-d" ? new Set(["thumbnail_png", "sheet_png", "drawing_pdf"]) : new Set(["thumbnail_png", "model_preview_png"]);
  return (attachment.previewDerivatives ?? []).find(
    (derivative) =>
      derivative.status === "ready" &&
      derivative.sourceContentHash === attachment.contentHash &&
      isDisplayablePreviewDerivative(derivative) &&
      acceptedKinds.has(derivative.derivativeKind) &&
      (derivative.mimeType.startsWith("image/") || derivative.mimeType === "application/pdf")
  );
}

function hasStalePreviewDerivative(attachment: MasterAttachment, slotKind: DrawingPreviewSlot["kind"]) {
  const acceptedKinds = slotKind === "two-d" ? new Set(["thumbnail_png", "sheet_png", "drawing_pdf"]) : new Set(["thumbnail_png", "model_preview_png"]);
  return (attachment.previewDerivatives ?? []).some(
    (derivative) =>
      isDisplayablePreviewDerivative(derivative) &&
      acceptedKinds.has(derivative.derivativeKind) &&
      (derivative.status === "stale" || derivative.sourceContentHash !== attachment.contentHash)
  );
}

function isDisplayablePreviewDerivative(derivative: PreviewDerivative) {
  return derivative.generatorProfile !== "fake_preview_worker" && derivative.generatorVersion !== "fake-local-pipeline";
}

function derivativePreviewMode(derivative: PreviewDerivative): "pdf" | "image" | "none" {
  if (derivative.mimeType === "application/pdf") return "pdf";
  if (derivative.mimeType.startsWith("image/")) return "image";
  return "none";
}

function attachmentPreviewMode(attachment: MasterAttachment): "pdf" | "image" | "drive" | "none" {
  if (attachment.fileExt.toLowerCase() === "pdf") return "pdf";
  if (isImageAttachment(attachment)) return "image";
  if (attachment.gdriveFileId && attachment.gdriveStatus === "uploaded") return "drive";
  return "none";
}

function previewUrlForAttachment(attachment: MasterAttachment, downloadUrl: string, mode: "pdf" | "image" | "drive" | "none", derivative?: PreviewDerivative | null) {
  if (derivative && (mode === "pdf" || mode === "image")) return `${downloadUrl}?previewDerivative=${encodeURIComponent(derivative.id)}`;
  if (mode === "drive" && attachment.gdriveFileId) return `https://drive.google.com/file/d/${encodeURIComponent(attachment.gdriveFileId)}/preview`;
  if (mode === "pdf" || mode === "image") return `${downloadUrl}?preview=1`;
  return "";
}

function attachmentPreviewPlaceholder(attachment: MasterAttachment, slot: DrawingPreviewSlot): PreviewPlaceholderState {
  const job = attachment.previewJob;
  const jobMatchesSource = job?.sourceContentHash === attachment.contentHash;
  if (jobMatchesSource && job.status === "queued") {
    return { title: "預覽排隊中", text: "預覽任務已建立，等待 worker 處理。", action: { label: "重新排程", disabled: true } };
  }
  if (jobMatchesSource && job.status === "running") {
    return { title: "預覽產生中", text: "Windows preview worker 正在產生瀏覽器可讀的縮圖。", action: { label: "產生中", disabled: true } };
  }
  if (jobMatchesSource && job.status === "failed") {
    return {
      title: "預覽產生失敗",
      text: compactPreviewFailureText(job.errorSummary),
      action: { label: "重新產生預覽" }
    };
  }
  if (jobMatchesSource && job.status === "skipped") {
    return {
      title: "無法自動產生預覽",
      text: job.errorSummary || "此檔案沒有可抽取的預覽或目前不支援自動轉檔。",
      action: isNativeSolidWorksAttachment(attachment) ? { label: "重新產生預覽" } : null
    };
  }
  if (hasStalePreviewDerivative(attachment, slot.kind)) {
    return { title: "預覽需更新", text: "來源檔案已更新，舊預覽已不再作為目前附件顯示。", action: { label: "重新產生預覽" } };
  }
  return {
    title: isNativeSolidWorksAttachment(attachment) ? "預覽待產生" : "沒有可用預覽",
    text: isNativeSolidWorksAttachment(attachment) ? slot.fallbackText : "此檔案格式目前無法直接在瀏覽器預覽，請下載附件查看。",
    action: isNativeSolidWorksAttachment(attachment) ? { label: "產生預覽" } : null
  };
}

function compactPreviewFailureText(summary: string | null | undefined) {
  const text = String(summary ?? "").trim();
  if (!text) return "預覽 worker 未完成，請確認來源檔案與 worker 狀態後重試。";
  if (/Document Manager key|PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY|worker 可讀取/iu.test(text)) {
    return "缺少 worker 可讀取的 Document Manager key。請設定 Vault 或 worker 環境變數。";
  }
  if (/Windows Shell 只回傳空白|低資訊縮圖/iu.test(text)) {
    return "此工作站的 Shell 預覽不可用，請改用 Document Manager 或 eDrawings worker。";
  }
  if (text.length > 96) return `${text.slice(0, 92)}...`;
  return text;
}

function groupMasterAttachments(attachments: MasterAttachment[], entityType: AttachmentEntityType) {
  if (entityType !== "drawing_number") {
    return { currentRevision: null, current: [...attachments].sort(sortMasterAttachments), work: [], history: [] };
  }

  const formalAttachments = attachments.filter(isFormalPackageAttachment);
  const currentRevision = latestAttachmentRevision(formalAttachments);
  const current = formalAttachments
    .filter((attachment) => !currentRevision || sameAttachmentRevision(attachment, currentRevision))
    .sort(sortMasterAttachments);
  const currentIds = new Set(current.map((attachment) => attachment.id));
  const work = attachments
    .filter((attachment) => !currentIds.has(attachment.id) && isWorkAttachment(attachment))
    .sort(sortMasterAttachments);
  const workIds = new Set(work.map((attachment) => attachment.id));
  const history = attachments
    .filter((attachment) => !currentIds.has(attachment.id) && !workIds.has(attachment.id))
    .sort((left, right) => compareAttachmentRevision(getAttachmentRevision(right), getAttachmentRevision(left)) || sortMasterAttachments(left, right));

  return { currentRevision, current, work, history };
}

function groupHistoryAttachmentsByRevision(attachments: MasterAttachment[]): AttachmentRevisionGroup[] {
  const groups = new Map<string, MasterAttachment[]>();
  for (const attachment of attachments) {
    const revision = getAttachmentRevision(attachment) || "未標版次";
    const group = groups.get(revision) ?? [];
    group.push(attachment);
    groups.set(revision, group);
  }
  return Array.from(groups, ([revision, groupAttachments]) => ({
    revision,
    attachments: [...groupAttachments].sort(sortMasterAttachments)
  })).sort((left, right) => compareAttachmentRevision(right.revision, left.revision));
}

function latestAttachmentRevision(attachments: MasterAttachment[]) {
  return attachments.reduce<string | null>((latest, attachment) => {
    const revision = getAttachmentRevision(attachment);
    if (!revision) return latest;
    if (!latest) return revision;
    return compareAttachmentRevision(revision, latest) > 0 ? revision : latest;
  }, null);
}

function isWorkAttachment(attachment: MasterAttachment) {
  if (attachment.revisionPackageFileKind === "supplement") {
    return attachment.revisionPackageSupplementStatus !== "Approved";
  }
  if (attachment.revisionPackageStatus && attachment.revisionPackageStatus !== "Released") return true;
  return !attachment.sourceSubmissionStatus || ["Pending", "Releasing", "ReleaseFailed"].includes(attachment.sourceSubmissionStatus);
}

function sameAttachmentRevision(attachment: MasterAttachment, revision: string) {
  return compareAttachmentRevision(getAttachmentRevision(attachment), revision) === 0;
}

function getAttachmentRevision(attachment: MasterAttachment) {
  return attachment.revisionPackageRevision || attachment.sourceSubmissionRevision || attachment.revision || "";
}

function sortMasterAttachments(left: MasterAttachment, right: MasterAttachment) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function compareAttachmentRevision(left: string | null | undefined, right: string | null | undefined) {
  try {
    return compareRevisionCodes(left, right, { allowLegacy: true });
  } catch {
    // Fall through to legacy tolerant comparison for empty or non-standard historical values.
  }
  const leftParsed = parseAttachmentRevision(left);
  const rightParsed = parseAttachmentRevision(right);
  if (leftParsed && rightParsed) {
    if (leftParsed.major !== rightParsed.major) return leftParsed.major - rightParsed.major;
    return leftParsed.minor - rightParsed.minor;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), "zh-Hant", { numeric: true });
}

function parseAttachmentRevision(value: string | null | undefined) {
  let code = String(value ?? "").trim().replace(/\s+/gu, "");
  if (!code) return null;
  if (/^v\d/iu.test(code)) code = code.slice(1);
  if (/^[A-Z]$/u.test(code.toUpperCase())) return { major: code.toUpperCase().charCodeAt(0) - 64, minor: 0 };
  if (/^[1-9]\d*$/u.test(code)) return { major: Number(code), minor: 0 };
  const minorMatch = code.match(/^(0|[1-9]\d*)\.([1-9]\d*)$/u);
  if (minorMatch) return { major: Number(minorMatch[1]), minor: Number(minorMatch[2]) };
  return null;
}

function attachmentSubmissionState(attachment: MasterAttachment, options?: { forceHistory?: boolean }) {
  const submissionId = attachment.sourceSubmissionId || attachment.revisionPackageSourceSubmissionId;
  const attachmentRevision = getAttachmentRevision(attachment);
  const revisionText = attachmentRevision ? `版次 ${attachmentRevision}` : "此版次";

  if (attachment.revisionPackageFileKind === "supplement") {
    if (attachment.revisionPackageSupplementStatus === "Approved") {
      if (options?.forceHistory) {
        return {
          label: "歷史補件",
          tone: "history",
          note: "這是較舊正式版次的核准補件，現在僅供追溯。"
        };
      }
      return {
        label: "正式補件",
        tone: "supplement",
        note: "這是已核准補件，和原正式包一起作為此版次可用附件。"
      };
    }
    if (attachment.revisionPackageSupplementStatus === "Pending") {
      return {
        label: "補件審核中",
        tone: "pending",
        note: "這筆補件尚未核准，不能視為正式附件。"
      };
    }
    return {
      label: "補件未採用",
      tone: "blocked",
      note: "這筆補件沒有成為正式附件。"
    };
  }

  if (attachment.revisionPackageStatus === "Released" && !attachment.sourceSubmissionStatus) {
    return {
      label: "正式附件",
      tone: "released",
      note: "此附件已隸屬正式版次附件包。"
    };
  }

  if (options?.forceHistory && attachment.sourceSubmissionStatus === "Released") {
    return {
      label: "歷史附件",
      tone: "history",
      note: submissionId ? `送審 ${submissionId} 是較舊正式紀錄，現在僅供追溯。` : "這是較舊正式附件，現在僅供追溯。"
    };
  }

  switch (attachment.sourceSubmissionStatus) {
    case "Pending":
      return {
        label: "送審中",
        tone: "pending",
        note: submissionId ? `已納入送審 ${submissionId}（${revisionText}），目前審核中，尚未正式發布。` : "已納入送審，目前審核中，尚未正式發布。"
      };
    case "Releasing":
      return {
        label: "發行中",
        tone: "releasing",
        note: submissionId ? `送審 ${submissionId} 正在發行中，完成前尚不可視為正式圖檔。` : "附件正在發行中，完成前尚不可視為正式圖檔。"
      };
    case "Released":
      return {
        label: "正式附件",
        tone: "released",
        note: submissionId ? `已由送審 ${submissionId}（${revisionText}）正式發布。` : "此附件已正式發布。"
      };
    case "ReleaseFailed":
      return {
        label: "發行失敗",
        tone: "release-failed",
        note: submissionId ? `送審 ${submissionId} 發行失敗，請修正後重新送審或重試發行。` : "附件發行失敗，請修正後重新送審或重試發行。"
      };
    case "Rejected":
      return {
        label: "已退回",
        tone: "blocked",
        note: submissionId ? `送審 ${submissionId} 已退回，這不是正式發布附件。` : "送審已退回，這不是正式發布附件。"
      };
    case "Cancelled":
      return {
        label: "已取消",
        tone: "blocked",
        note: submissionId ? `送審 ${submissionId} 已取消，這不是正式發布附件。` : "送審已取消，這不是正式發布附件。"
      };
    case "Obsolete":
      return {
        label: "歷史附件",
        tone: "history",
        note: submissionId ? `送審 ${submissionId} 已被新版取代，僅供追溯。` : "此附件已成為歷史版本，僅供追溯。"
      };
    default:
      return {
        label: "未送審",
        tone: "working",
        note: "這是附件庫工作檔，尚未納入送審，不是正式發布紀錄。"
      };
  }
}

function isFormalPackageAttachment(attachment: MasterAttachment) {
  if (attachment.sourceSubmissionStatus === "Released") return true;
  if (attachment.revisionPackageStatus !== "Released") return false;
  if (attachment.revisionPackageFileKind === "core") return true;
  return isApprovedSupplementAttachment(attachment);
}

function isApprovedSupplementAttachment(attachment: MasterAttachment) {
  return attachment.revisionPackageFileKind === "supplement" && attachment.revisionPackageSupplementStatus === "Approved";
}

function revisionLifecycleStageForAttachment(
  entityType: AttachmentEntityType,
  developmentPhase: NumberingPhase | null | undefined,
  processControlled: boolean
): RevisionLifecycleStage | null {
  if (entityType !== "drawing_number") return null;
  if (developmentPhase === "Release") return "release_area";
  if (!processControlled) return null;
  if (developmentPhase === "ECR") return "design_change_workspace";
  return "rd_workspace";
}

function revisionHelpText(revisionStage: RevisionLifecycleStage | null, suggestedRevision: string) {
  if (!revisionStage) return "依 4.1，此工作區附件可不填版次；若需填寫，請使用 1、2、0.1 或 1.1，不要加 V。";
  if (revisionStage === "release_area") return `系統預設大版次 ${suggestedRevision || "1"}，可依圖紙修訂欄編輯；不要加 V。`;
  return `系統預設小版次 ${suggestedRevision || "0.1"}，可依圖紙修訂欄編輯；不要加 V。`;
}

function driveStatusLabel(status: DriveStatus) {
  if (status === "uploaded") return "Drive 已同步";
  if (status === "uploading") return "同步中";
  if (status === "failed") return "同步失敗";
  return "本機保存";
}

function supplementRoleFromAttachment(attachment: MasterAttachment) {
  if (attachment.documentCategory === "dwg") return "dwg_dxf";
  if (attachment.documentCategory === "pdf") return "pdf";
  if (attachment.documentCategory === "cad_3d") return "cad_3d";
  if (attachment.documentCategory === "drawing_2d") return "drawing_2d";
  return "other";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}
