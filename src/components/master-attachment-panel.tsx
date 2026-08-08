"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Check, CircleAlert, Clock3, Download, ExternalLink, FileText, History, LoaderCircle, RefreshCw, RotateCcw, Trash2, UploadCloud, WifiOff, X } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { formatBytes } from "@/lib/format-file-size";
import { compareRevisionCodes, suggestRevisionCode, type RevisionLifecycleStage } from "@/lib/revision-policy";
import { formatStatusErrorForUser } from "@/lib/status-display";

type AttachmentEntityType = "drawing_number" | "part_number";
type DriveStatus = "none" | "uploading" | "uploaded" | "failed";
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
  revisionPackageEffectiveStatus: string | null;
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
  tone: "pending" | "delayed" | "failed" | "unavailable" | "missing";
  icon: "loading" | "delayed" | "failed" | "offline" | "download" | "missing";
  title: string;
  text: string;
  action: { label: string; disabled?: boolean } | null;
};

type AttachmentRevisionGroup = {
  revision: string;
  attachments: MasterAttachment[];
};

export type HistoricalRevisionBackfillRequest = {
  revision: string;
  attachmentIds: string[];
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
export type MasterAttachmentAuthorityMode = "combined_legacy" | "controlled_summary" | "reference_manager";

type ProductionSliceClientStatus = {
  configured: boolean;
  unopenedMessage?: string;
};

const defaultProductionSliceUnopenedMessage = "此功能未納入本次正式領號 / 保留號 production slice。";

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
  if (!text) return `${fallbackAction}。請稍後再試；若仍失敗，請 PDM Admin 協助確認附件狀態。`;
  return formatStatusErrorForUser(text, "fileSync");
}

export function MasterAttachmentPanel({
  entityType,
  entityCode,
  processControlled = true,
  readOnly = false,
  authorityMode = "combined_legacy",
  compact = false,
  drawingDetailSkeleton = false,
  onBackfillHistoricalRevision,
  pendingRevisionReviews = null,
  productionSliceEnforced: productionSliceEnforcedOverride,
  productionSliceUnopenedMessage: productionSliceUnopenedMessageOverride
}: {
  entityType: AttachmentEntityType;
  entityCode: string;
  processControlled?: boolean;
  readOnly?: boolean;
  authorityMode?: MasterAttachmentAuthorityMode;
  compact?: boolean;
  drawingDetailSkeleton?: boolean;
  onBackfillHistoricalRevision?: (request: HistoricalRevisionBackfillRequest) => void;
  pendingRevisionReviews?: PendingRevisionReviews | null;
  productionSliceEnforced?: boolean;
  productionSliceUnopenedMessage?: string;
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
  const previewPollingInFlightRef = useRef(false);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const productionSliceEnforced = productionSliceEnforcedOverride ?? productionSlice?.configured === true;
  const productionSliceUnopenedMessage = productionSliceUnopenedMessageOverride ?? productionSlice?.unopenedMessage ?? defaultProductionSliceUnopenedMessage;
  const productionSliceTitle = `未開放。${productionSliceUnopenedMessage}`;
  const effectiveReadOnly = readOnly || authorityMode === "controlled_summary";

  useEffect(() => {
    if (typeof productionSliceEnforcedOverride === "boolean") return;
    let cancelled = false;
    fetch("/api/production-slice/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: ProductionSliceClientStatus | null) => {
        if (!cancelled && body?.configured) setProductionSlice(body);
      })
      .catch(() => {
        if (!cancelled) setProductionSlice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productionSliceEnforcedOverride]);
  const revisionStage = useMemo(
    () => revisionLifecycleStageForAttachment(entityType, processControlled),
    [entityType, processControlled]
  );
  const suggestedRevision = useMemo(
    () => (revisionStage ? suggestRevisionCode(attachments.map((attachment) => ({ revision: attachment.revision ?? "" })), revisionStage) : ""),
    [attachments, revisionStage]
  );
  const authorityAttachments = useMemo(
    () => attachments.filter((attachment) => authorityMode === "combined_legacy" || (authorityMode === "controlled_summary") === isControlledRevisionAttachment(attachment)),
    [attachments, authorityMode]
  );
  const authorityDeletedAttachments = useMemo(
    () => deletedAttachments.filter(({ attachment }) => authorityMode === "combined_legacy" || (authorityMode === "controlled_summary") === isControlledRevisionAttachment(attachment)),
    [deletedAttachments, authorityMode]
  );
  const attachmentSections = useMemo(() => groupMasterAttachments(authorityAttachments, entityType), [authorityAttachments, entityType]);
  const currentControlledRevision = useMemo(
    () => latestAttachmentRevision(attachments.filter(isFormalPackageAttachment)),
    [attachments]
  );
  const workRevisionGroups = useMemo(
    () => groupHistoryAttachmentsByRevision(attachmentSections.work),
    [attachmentSections.work]
  );
  const historicalBackfillGroups = useMemo(
    () => currentControlledRevision
      ? workRevisionGroups.filter((group) => parseAttachmentRevision(group.revision) && compareAttachmentRevision(group.revision, currentControlledRevision) < 0)
      : [],
    [currentControlledRevision, workRevisionGroups]
  );
  const historicalBackfillAttachmentIds = useMemo(
    () => new Set(historicalBackfillGroups.flatMap((group) => group.attachments.map((attachment) => attachment.id))),
    [historicalBackfillGroups]
  );
  const remainingWorkAttachments = useMemo(
    () => attachmentSections.work.filter((attachment) => !historicalBackfillAttachmentIds.has(attachment.id)),
    [attachmentSections.work, historicalBackfillAttachmentIds]
  );
  const drawingPreviewSlots = useMemo(
    () => (entityType === "drawing_number" ? buildDrawingPreviewSlots(attachmentSections.current) : []),
    [attachmentSections.current, entityType]
  );
  const historyRevisionGroups = useMemo(() => groupHistoryAttachmentsByRevision(attachmentSections.history), [attachmentSections.history]);
  const currentReleasedRevisionPackageId = useMemo(
    () => currentControlledRevision
      ? attachments.find((attachment) =>
          attachment.revisionPackageId
          && attachment.revisionPackageStatus === "Released"
          && attachment.revisionPackageFileKind === "core"
          && sameAttachmentRevision(attachment, currentControlledRevision)
        )?.revisionPackageId ?? null
      : null,
    [attachments, currentControlledRevision]
  );
  const supplementCandidateAttachments = useMemo(
    () => currentControlledRevision
      ? remainingWorkAttachments.filter((attachment) =>
          !attachment.revisionPackageSupplementId
          && sameAttachmentRevision(attachment, currentControlledRevision)
        )
      : [],
    [currentControlledRevision, remainingWorkAttachments]
  );
  const supplementReasonDefinition = supplementReasons.find((reason) => reason.code === supplementReason) ?? supplementReasons[0];
  const pendingReviewRevisions = useMemo(() => pendingRevisionReviews?.revisions ?? [], [pendingRevisionReviews?.revisions]);

  function isRevisionPendingReview(revision: string | null | undefined) {
    if (entityType !== "drawing_number") return false;
    const value = String(revision ?? "").trim();
    if (!value) return false;
    return pendingReviewRevisions.some((pendingRevision) => compareAttachmentRevision(pendingRevision, value) === 0);
  }

  const loadAttachments = useCallback(async (options?: { clearMessage?: boolean; background?: boolean }) => {
    if (!options?.background) setLoading(true);
    if (options?.clearMessage !== false) setMessage(null);
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(formatAttachmentActionError(body.message ?? body.error, "附件清單載入未完成"));
      setAttachments(body.attachments ?? []);
    } catch (error) {
      if (!options?.background) {
        setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "附件清單載入未完成") });
      }
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, [baseUrl]);

  const previewPollingNeeded = useMemo(
    () => authorityAttachments.some((attachment) => {
      if (!isNativeSolidWorksAttachment(attachment)) return false;
      const hasCurrentDerivative = attachment.previewDerivatives?.some(
        (derivative) => derivative.status === "ready" && derivative.sourceContentHash === attachment.contentHash
      );
      return !hasCurrentDerivative && (!attachment.previewJob || attachment.previewJob.status === "queued" || attachment.previewJob.status === "running");
    }),
    [authorityAttachments]
  );

  useEffect(() => {
    if (!previewPollingNeeded) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || previewPollingInFlightRef.current) return;
      previewPollingInFlightRef.current = true;
      void loadAttachments({ clearMessage: false, background: true }).finally(() => {
        previewPollingInFlightRef.current = false;
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [loadAttachments, previewPollingNeeded]);

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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
    if (!currentReleasedRevisionPackageId) {
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
      const selectedAttachments = supplementCandidateAttachments.filter((attachment) => selectedSupplementAttachmentIds.includes(attachment.id));
      const response = await fetch(`/api/numbering/drawing-revision-packages/${encodeURIComponent(currentReleasedRevisionPackageId)}/supplements`, {
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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
      setMessage({ type: "success", text: "已加入預覽處理，完成後自動更新。" });
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : formatAttachmentActionError(error, "預覽產生未完成") });
    } finally {
      setLoading(false);
    }
  }

  async function decideSupplement(attachment: MasterAttachment, decision: "approve" | "reject") {
    if (productionSliceEnforced) {
      setMessage({ type: "error", text: productionSliceUnopenedMessage });
      return;
    }
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
          {!effectiveReadOnly && (attachment.gdriveStatus === "failed" || attachment.gdriveStatus === "none") ? (
            <button
              className={`icon-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
              type="button"
              onClick={() => void retryDriveSync(attachment)}
              disabled={loading || productionSliceEnforced}
              title={productionSliceEnforced ? productionSliceTitle : "重新同步 Google Drive"}
              aria-label={productionSliceEnforced ? `重新同步 Google Drive：${productionSliceTitle}` : "重新同步 Google Drive"}
              data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
            >
              <RefreshCw size={16} />
            </button>
          ) : null}
          {!effectiveReadOnly && attachment.revisionPackageFileKind === "supplement" && attachment.revisionPackageSupplementStatus === "Pending" ? (
            <>
              <button
                className={`icon-button success${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                type="button"
                onClick={() => void decideSupplement(attachment, "approve")}
                disabled={loading || productionSliceEnforced}
                title={productionSliceEnforced ? productionSliceTitle : "核准補件"}
                aria-label={productionSliceEnforced ? `核准補件：${productionSliceTitle}` : "核准補件"}
                data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
              >
                <Check size={16} />
              </button>
              <button
                className={`icon-button danger${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                type="button"
                onClick={() => void decideSupplement(attachment, "reject")}
                disabled={loading || productionSliceEnforced}
                title={productionSliceEnforced ? productionSliceTitle : "駁回補件"}
                aria-label={productionSliceEnforced ? `駁回補件：${productionSliceTitle}` : "駁回補件"}
                data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
              >
                <X size={16} />
              </button>
            </>
          ) : null}
          {!effectiveReadOnly ? (
            <button
              className={`icon-button danger${productionSliceEnforced ? " production-slice-unopened" : ""}`}
              type="button"
              onClick={() => void deleteAttachment(attachment)}
              disabled={loading || productionSliceEnforced}
              title={productionSliceEnforced ? productionSliceTitle : "刪除附件"}
              aria-label={productionSliceEnforced ? `刪除附件：${productionSliceTitle}` : "刪除附件"}
              data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
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
    const previewPlaceholder: PreviewPlaceholderState = attachment
      ? attachmentPreviewPlaceholder(attachment, slot)
      : { tone: "missing", icon: "missing", title: slot.emptyTitle, text: slot.emptyText, action: null };

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
            <div className={`drawing-preview-placeholder ${previewPlaceholder.tone}`} data-preview-state={previewPlaceholder.tone}>
              {renderPreviewStatusIcon(previewPlaceholder.icon, slot.kind)}
              <strong>{previewPlaceholder.title}</strong>
              <span>{previewPlaceholder.text}</span>
              {!effectiveReadOnly && attachment && previewPlaceholder.action ? (
                <button
                  className={`secondary-button preview-generate-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                  type="button"
                  onClick={() => void generatePreview(attachment)}
                  disabled={loading || productionSliceEnforced || previewPlaceholder.action.disabled}
                  title={productionSliceEnforced ? productionSliceTitle : previewPlaceholder.action.label}
                  aria-label={productionSliceEnforced ? `${slot.title}${productionSliceTitle}` : `${slot.title}${previewPlaceholder.action.label}`}
                  data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
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
              {!effectiveReadOnly && isNativeSolidWorksAttachment(attachment) ? (
                <button
                  className={`icon-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                  type="button"
                  onClick={() => void generatePreview(attachment)}
                  disabled={loading || productionSliceEnforced}
                  title={productionSliceEnforced ? productionSliceTitle : "重新產生預覽"}
                  aria-label={productionSliceEnforced ? `重新產生${slot.title}預覽：${productionSliceTitle}` : `重新產生${slot.title}預覽`}
                  data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
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
        <select className="dropdown-select" value={category} disabled={productionSliceEnforced} onChange={(event) => setCategory(event.target.value)}>
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
          disabled={productionSliceEnforced}
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
        <input value={displayName} disabled={productionSliceEnforced} onChange={(event) => setDisplayName(event.target.value)} placeholder="未填則使用檔名" />
      </label>
      <label>
        說明
        <input value={description} disabled={productionSliceEnforced} onChange={(event) => setDescription(event.target.value)} placeholder="用途、來源或注意事項" />
      </label>
      <div className="master-attachment-file">
        <FileDropzone
          label="拖曳或選擇附件"
          description="可一次上傳多個附件"
          multiple
          selectedFiles={files}
          variant="compact"
          disabled={productionSliceEnforced}
          onClearSelected={() => setFiles([])}
          onFilesSelected={(selected) => setFiles(selected)}
        />
      </div>
      <button
        className={`primary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
        type="submit"
        disabled={productionSliceEnforced || loading || files.length === 0}
        title={productionSliceEnforced ? productionSliceTitle : "上傳附件"}
        aria-label={productionSliceEnforced ? `上傳附件：${productionSliceTitle}` : "上傳附件"}
        data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
      >
        <UploadCloud size={16} />
        上傳附件
        {productionSliceEnforced ? <span className="nav-unopened-badge">未開放</span> : null}
      </button>
    </form>
  );

  const drawingPreviewBoard =
    drawingPreviewSlots.length > 0 ? (
      <section className="drawing-preview-board" aria-label="正式圖面預覽" data-drawing-detail-section={drawingDetailSkeleton ? "drawing-preview" : undefined}>
        <div className="drawing-preview-board-header">
          <div>
            <h3>正式版{attachmentSections.currentRevision ? ` ${attachmentSections.currentRevision}` : ""}</h3>
          </div>
          <strong>{attachmentSections.current.length} 個檔案</strong>
        </div>
        <div className="drawing-preview-grid">{drawingPreviewSlots.map((slot) => renderPreviewCard(slot))}</div>
      </section>
    ) : null;
  const compactControlledSummary = compact && authorityMode === "controlled_summary" && attachmentSections.current.length > 0 ? (
    <div className="master-attachment-compact-controlled">
      <div className="master-attachment-list">{attachmentSections.current.map((attachment) => renderAttachmentRow(attachment, { minimal: true }))}</div>
        {drawingPreviewSlots.length > 0 ? <details className="master-attachment-preview-details" data-drawing-detail-section={drawingDetailSkeleton ? "drawing-preview" : undefined} open>
        <summary><span><Box size={16} />圖面預覽</span><strong>{drawingPreviewSlots.length} 類</strong></summary>
        <div className="drawing-preview-grid">{drawingPreviewSlots.map((slot) => renderPreviewCard(slot))}</div>
      </details> : null}
    </div>
  ) : null;
  const drawingPreviewEmpty = drawingDetailSkeleton && entityType === "drawing_number" && drawingPreviewSlots.length === 0 ? (
    <section className="drawing-preview-board" aria-label="正式圖面預覽" data-drawing-detail-section="drawing-preview">
      <div className="drawing-preview-board-header"><h3>圖面預覽</h3></div>
      <div className="drawing-preview-grid">
        <article className="drawing-preview-card two-d">
          <div className="drawing-preview-frame placeholder-frame">
            <div className="drawing-preview-placeholder missing" data-preview-state="missing">
              <FileText className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />
              <strong>尚無可預覽圖面</strong>
              <span>先完成版次檔案送審；正式檔案建立後會顯示在這裡。</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  ) : null;

  return (
    <section className={`panel master-attachment-panel${compact ? " is-compact" : ""}`}>
      <div className="panel-header">
        <div>
          <h2>{authorityMode === "controlled_summary" ? "受控版次檔案" : authorityMode === "reference_manager" ? "參考附件" : effectiveReadOnly && entityType === "drawing_number" ? "受控檔案摘要" : entityType === "drawing_number" ? "圖號附件庫" : "料號附件庫"}</h2>
          {compact && authorityMode === "controlled_summary" && attachmentSections.current.length > 0 ? <span className="master-attachment-header-meta">版次 {attachmentSections.currentRevision ?? "-"} · {attachmentSections.current.length} 個</span> : null}
          {!compact ? <p>{authorityMode === "controlled_summary" ? "此區只顯示候選首版或正式版次流程建立的受控檔案；變更內容請建立新版次。" : authorityMode === "reference_manager" ? "此區僅管理作業參考附件，不會取代受控版次檔案，也不會直接改變正式版次。" : effectiveReadOnly ? "檔案變更請由候選首版或正式版次工作台進行。" : "本主檔可掛多個檔案，並同步到 Google Drive 主檔附件庫。"}</p> : null}
        </div>
      </div>

      {compactControlledSummary}
      {entityType === "drawing_number" && !compactControlledSummary ? drawingPreviewBoard : null}
      {drawingPreviewEmpty}

      {!effectiveReadOnly && productionSliceEnforced ? <div className="master-attachment-message error">{productionSliceUnopenedMessage}</div> : null}
      {message ? <div className={`master-attachment-message ${message.type}`}>{message.text}</div> : null}

      {!effectiveReadOnly && entityType === "drawing_number" ? (
        <details className="master-attachment-upload-panel">
          <summary>
            <span>
              <UploadCloud size={16} />
              新增附件
            </span>
          </summary>
          {uploadForm}
        </details>
      ) : !effectiveReadOnly ? (
        uploadForm
      ) : null}

      <div className="master-attachment-sections" aria-live="polite">
        {attachmentSections.current.length > 0 && entityType === "drawing_number" && !compactControlledSummary ? (
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
            {historicalBackfillGroups.map((group) => (
              <div className="master-attachment-historical-backfill" key={`historical-backfill-${group.revision}`}>
                <div className="master-attachment-historical-backfill-heading">
                  <div>
                    <strong>{group.revision} 未送審舊版</strong>
                    {currentControlledRevision ? <span>目前最新版 {currentControlledRevision}；核准後只進歷史。</span> : null}
                  </div>
                  {onBackfillHistoricalRevision ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onBackfillHistoricalRevision({
                        revision: group.revision,
                        attachmentIds: group.attachments.map((attachment) => attachment.id)
                      })}
                    >
                      補登 {group.revision} 歷史版
                    </button>
                  ) : null}
                </div>
                <div className="master-attachment-list">
                  {group.attachments.map((attachment) => renderAttachmentRow(attachment, { minimal: compact }))}
                </div>
              </div>
            ))}
            {!effectiveReadOnly && entityType === "drawing_number" && currentReleasedRevisionPackageId && supplementCandidateAttachments.length > 0 ? (
              <form className="master-attachment-supplement-form" onSubmit={requestSupplement}>
                <div className="master-attachment-supplement-grid">
                  <label>
                    補件原因
                    <select className="dropdown-select" value={supplementReason} disabled={productionSliceEnforced} onChange={(event) => setSupplementReason(event.target.value as SupplementReasonCode)}>
                      {supplementReasons.map((reason) => (
                        <option value={reason.code} key={reason.code}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    說明{supplementReasonDefinition.noteRequired ? "（必填）" : ""}
                    <input value={supplementNote} disabled={productionSliceEnforced} onChange={(event) => setSupplementNote(event.target.value)} placeholder={supplementReasonDefinition.wording} />
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
                  {supplementCandidateAttachments.map((attachment) => (
                    <label key={`supplement-${attachment.id}`}>
                      <input
                        type="checkbox"
                        checked={selectedSupplementAttachmentIds.includes(attachment.id)}
                        disabled={productionSliceEnforced}
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
                <button
                  className={`secondary-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                  type="submit"
                  disabled={productionSliceEnforced || supplementLoading || selectedSupplementAttachmentIds.length === 0}
                  title={productionSliceEnforced ? productionSliceTitle : "申請補件"}
                  aria-label={productionSliceEnforced ? `申請補件：${productionSliceTitle}` : "申請補件"}
                  data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                >
                  申請補件
                  {productionSliceEnforced ? <span className="nav-unopened-badge">未開放</span> : null}
                </button>
              </form>
            ) : null}
            {remainingWorkAttachments.length > 0 ? (
              <div className="master-attachment-list">{remainingWorkAttachments.map((attachment) => renderAttachmentRow(attachment))}</div>
            ) : null}
          </section>
        ) : null}

        {authorityAttachments.length === 0 && !(compact && authorityMode === "reference_manager") ? <div className="empty">{compact ? "尚無受控版次檔案" : authorityMode === "reference_manager" ? "尚未建立參考附件；如需補充作業資料，可在上方新增。" : effectiveReadOnly ? "目前沒有可顯示的受控版次檔案；需要新增或變更時，請建立新版。" : "尚未建立附件。現在請在上方選擇檔案並上傳；若只是查看資料，這裡不用處理。"}</div> : null}
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

      {!effectiveReadOnly ? <details
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
          <strong>{deletedLoaded ? authorityDeletedAttachments.length : "未載入"}</strong>
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
            {authorityDeletedAttachments.map((deleted) => {
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
                      className={`icon-button${productionSliceEnforced ? " production-slice-unopened" : ""}`}
                      type="button"
                      onClick={() => void restoreAttachment(deleted)}
                      disabled={productionSliceEnforced || loading || deletedLoading || !canRestore}
                      title={productionSliceEnforced ? productionSliceTitle : canRestore ? "還原附件" : restoreState?.message ? formatAttachmentActionError(restoreState.message, "附件目前不可還原") : "不可還原"}
                      aria-label={productionSliceEnforced ? `還原附件：${productionSliceTitle}` : canRestore ? "還原附件" : restoreState?.message ? formatAttachmentActionError(restoreState.message, "附件目前不可還原") : "不可還原"}
                      data-production-slice-unopened={productionSliceEnforced ? "true" : undefined}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
            {deletedLoading ? <div className="empty">正在載入已刪除資料...</div> : null}
            {deletedLoaded && authorityDeletedAttachments.length === 0 ? <div className="empty">目前沒有已刪除附件，不用處理。</div> : null}
          </div>
        </div>
      </details> : null}
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

const previewHeartbeatStaleAfterMs = 30_000;

function renderPreviewStatusIcon(icon: PreviewPlaceholderState["icon"], slotKind: DrawingPreviewSlot["kind"]) {
  if (icon === "loading") return <LoaderCircle className="drawing-preview-status-icon loading" size={36} aria-hidden="true" />;
  if (icon === "delayed") return <Clock3 className="drawing-preview-status-icon delayed" size={36} aria-hidden="true" />;
  if (icon === "failed") return <CircleAlert className="drawing-preview-status-icon failed" size={36} aria-hidden="true" />;
  if (icon === "offline") return <WifiOff className="drawing-preview-status-icon unavailable" size={36} aria-hidden="true" />;
  if (icon === "download") return <Download className="drawing-preview-status-icon unavailable" size={34} aria-hidden="true" />;
  return slotKind === "three-d" ? <Box className="drawing-preview-status-icon missing" size={36} aria-hidden="true" /> : <FileText className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />;
}

function previewJobIsStale(job: PreviewJob, now = Date.now()) {
  return now - new Date(job.updatedAt).getTime() > previewHeartbeatStaleAfterMs;
}

function formatPreviewElapsed(job: PreviewJob) {
  const elapsedMs = Math.max(0, Date.now() - new Date(job.updatedAt).getTime());
  if (elapsedMs < 60_000) return `${Math.max(1, Math.round(elapsedMs / 1000))} 秒`;
  return `${Math.max(1, Math.round(elapsedMs / 60_000))} 分鐘`;
}

function attachmentPreviewPlaceholder(attachment: MasterAttachment, slot: DrawingPreviewSlot): PreviewPlaceholderState {
  const job = attachment.previewJob;
  const jobMatchesSource = job?.sourceContentHash === attachment.contentHash;
  if (jobMatchesSource && job.status === "queued") {
    const delayed = previewJobIsStale(job);
    return {
      tone: delayed ? "delayed" : "pending",
      icon: delayed ? "delayed" : "loading",
      title: delayed ? "等待預覽服務" : "產生中",
      text: delayed ? "系統會自動接續" : "完成後自動更新",
      action: null
    };
  }
  if (jobMatchesSource && job.status === "running") {
    const delayed = previewJobIsStale(job);
    return {
      tone: delayed ? "delayed" : "pending",
      icon: delayed ? "delayed" : "loading",
      title: delayed ? "處理較久" : "產生中",
      text: delayed ? `已等 ${formatPreviewElapsed(job)}，系統仍在運作` : "完成後自動更新",
      action: null
    };
  }
  if (jobMatchesSource && job.status === "failed") {
    return {
      tone: "failed",
      icon: "failed",
      title: slot.kind === "two-d" ? "2D 預覽尚未產生" : "3D 預覽尚未產生",
      text: "可先下載原始檔查看；系統產生後重新整理即可。",
      action: null
    };
  }
  if (jobMatchesSource && job.status === "skipped") {
    return {
      tone: "unavailable",
      icon: "download",
      title: "無法預覽",
      text: "請下載原檔",
      action: null
    };
  }
  if (hasStalePreviewDerivative(attachment, slot.kind)) {
    return { tone: "pending", icon: "loading", title: "更新中", text: "完成後自動更新", action: null };
  }
  if (isNativeSolidWorksAttachment(attachment)) {
    return { tone: "pending", icon: "loading", title: "建立中", text: "完成後自動更新", action: null };
  }
  return {
    tone: "unavailable",
    icon: "download",
    title: "無法預覽",
    text: "請下載原檔",
    action: null
  };
}

function isControlledRevisionAttachment(attachment: MasterAttachment) {
  return Boolean(
    attachment.sourceSubmissionId
    || attachment.revisionPackageId
    || attachment.revisionPackageSourceSubmissionId
    || attachment.revisionPackageSupplementId
  );
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
  if (isFormalPackageAttachment(attachment)) return false;
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

  if (attachment.revisionPackageFileKind === "core" && attachment.revisionPackageEffectiveStatus === "ReviewApproved") {
    return {
      label: "研發受控",
      tone: "released",
      note: "此附件已完成整包審核並納入研發受控版次；小數研發版不代表量產 Released。"
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
  if (!new Set(["Released", "ReviewApproved"]).has(attachment.revisionPackageEffectiveStatus ?? attachment.revisionPackageStatus ?? "")) return false;
  if (attachment.revisionPackageFileKind === "core") return true;
  return isApprovedSupplementAttachment(attachment);
}

function isApprovedSupplementAttachment(attachment: MasterAttachment) {
  return attachment.revisionPackageFileKind === "supplement" && attachment.revisionPackageSupplementStatus === "Approved";
}

function revisionLifecycleStageForAttachment(
  entityType: AttachmentEntityType,
  processControlled: boolean
): RevisionLifecycleStage | null {
  if (entityType !== "drawing_number") return null;
  if (!processControlled) return null;
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}
