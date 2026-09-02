"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, RotateCcw, Trash2, Upload } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { PdmEditPageFrame, type PdmEditPageStatus } from "@/components/pdm-edit-page-frame";
import { formatBytes } from "@/lib/format-file-size";
import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";

type PartAttachment = {
  id: string;
  entityId: string;
  displayName: string;
  description: string;
  fileName: string;
  fileExt: string;
  mimeType?: string;
  fileSize: number;
  uploadedByName: string | null;
  createdAt: string;
};

type DeletedAttachment = {
  attachment: PartAttachment;
  policy: {
    stageLabel: string;
    actions: { restore?: { allowed: boolean; message?: string } };
  };
};

type AttachmentResponse = { attachments?: PartAttachment[]; error?: unknown };
type DeletedAttachmentResponse = { attachments?: DeletedAttachment[]; error?: unknown };
type PermissionResponse = { actions?: Record<string, boolean>; error?: unknown };

function responseMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const raw = (body as { error?: unknown }).error;
  if (typeof raw === "string" && raw.trim()) {
    const friendlyMessage: Record<string, string> = {
      MASTER_ATTACHMENT_EXTENSION_NOT_ALLOWED: "這個檔案格式目前不支援，請改用受控附件格式。",
      MASTER_ATTACHMENT_FILE_EMPTY: "檔案內容是空的，請重新選取檔案。",
      MASTER_ATTACHMENT_FILE_TOO_LARGE: "檔案大小超過限制，請選擇較小的檔案。",
      MASTER_ATTACHMENT_DUPLICATE_ACTIVE_FILE: "相同檔案已存在於目前附件中。",
      LIFE_ATTACHMENT_DUPLICATE_ACTIVE: "相同檔案已有有效版本，無法還原。"
    };
    return friendlyMessage[raw] ?? raw;
  }
  if (raw && typeof raw === "object" && typeof (raw as { message?: unknown }).message === "string") {
    return String((raw as { message: string }).message).trim() || fallback;
  }
  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function attachmentDownloadHref(attachment: PartAttachment) {
  return pdmFileReadHref({
    fileAssetId: attachment.id,
    context: "part_attachment",
    contextId: attachment.entityId,
    bindingId: attachment.id
  });
}

function attachmentPreviewHref(attachment: PartAttachment) {
  return `${attachmentDownloadHref(attachment)}&preview=1`;
}

function previewable(attachment: PartAttachment) {
  const extension = attachment.fileExt.toLowerCase().replace(/^\./u, "");
  return extension === "pdf" || extension === "png" || extension === "jpg" || extension === "jpeg" || attachment.mimeType?.startsWith("image/") === true;
}

export function CanonicalPartAttachmentManager({ partNumber, returnTo, embedded = false, onDirtyChange }: { partNumber: string; returnTo: string; embedded?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [status, setStatus] = useState<PdmEditPageStatus>("loading");
  const [attachments, setAttachments] = useState<PartAttachment[]>([]);
  const [deletedAttachments, setDeletedAttachments] = useState<DeletedAttachment[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [canManageAttachments, setCanManageAttachments] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<PartAttachment | null>(null);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const loadRequestRef = useRef(0);
  const endpoint = useMemo(() => `/api/parts/${encodeURIComponent(partNumber)}/attachments`, [partNumber]);

  useEffect(() => { onDirtyChange?.(selectedFiles.length > 0 || busy); }, [busy, onDirtyChange, selectedFiles.length]);

  const refreshAttachments = useCallback(async (includeDeleted: boolean) => {
    const activeResponse = await fetch(endpoint, { cache: "no-store" });
    const activeBody = await activeResponse.json().catch(() => null) as AttachmentResponse | null;
    if (activeResponse.status === 404) throw new Error("PART_NUMBER_NOT_FOUND");
    if (!activeResponse.ok) throw new Error(responseMessage(activeBody, "附件清單目前無法載入。"));
    setAttachments(activeBody?.attachments ?? []);
    if (!includeDeleted) { setDeletedAttachments([]); return; }
    const deletedResponse = await fetch(`${endpoint}?surface=deleted_data`, { cache: "no-store" });
    const deletedBody = await deletedResponse.json().catch(() => null) as DeletedAttachmentResponse | null;
    if (deletedResponse.status === 404) throw new Error("PART_NUMBER_NOT_FOUND");
    if (!deletedResponse.ok) throw new Error(responseMessage(deletedBody, "已刪除附件目前無法載入。"));
    setDeletedAttachments(deletedBody?.attachments ?? []);
  }, [endpoint]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setStatus("loading");
    setError("");
    try {
      const permissionResponse = await fetch("/api/numbering/permissions", { cache: "no-store" });
      const permissionBody = await permissionResponse.json().catch(() => null) as PermissionResponse | null;
      if (!permissionResponse.ok) throw new Error(responseMessage(permissionBody, "無法確認附件管理權限。"));
      const canManage = permissionBody?.actions?.["numbering.attachments.manage"] === true;
      if (requestId !== loadRequestRef.current) return;
      setCanManageAttachments(canManage);
      await refreshAttachments(canManage);
      if (requestId !== loadRequestRef.current) return;
      setStatus("ready");
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      if (loadError instanceof Error && loadError.message === "PART_NUMBER_NOT_FOUND") setStatus("not_found");
      else {
        setError(loadError instanceof Error ? loadError.message : "附件管理頁目前無法載入。");
        setStatus("error");
      }
    }
  }, [refreshAttachments]);

  useEffect(() => { void load(); }, [load]);

  async function uploadSelectedFiles() {
    if (busy || !selectedFiles.length) return;
    const pendingFiles = [...selectedFiles];
    let uploadedCount = 0;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (let index = 0; index < pendingFiles.length; index += 1) {
        const file = pendingFiles[index];
        setProgress(`上傳中 ${index + 1}/${pendingFiles.length}：${file.name}`);
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(endpoint, { method: "POST", body: form });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setSelectedFiles(pendingFiles.slice(index));
          throw new Error(responseMessage(body, `「${file.name}」上傳失敗。`));
        }
        uploadedCount += 1;
      }
      setSelectedFiles([]);
      setNotice(`已上傳 ${uploadedCount} 個附件。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "附件上傳失敗。");
      if (uploadedCount > 0) setNotice(`已完成 ${uploadedCount} 個附件；尚未完成的檔案仍保留在選取清單。`);
    } finally {
      await refreshAttachments(canManageAttachments).catch(() => undefined);
      setProgress("");
      setBusy(false);
    }
  }

  async function deleteAttachment(attachment: PartAttachment) {
    if (busy || !window.confirm(`確定將「${attachment.displayName || attachment.fileName}」移至已刪除附件？之後仍可還原。`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(attachment.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "由料號附件管理頁刪除" })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "附件刪除失敗。"));
      await refreshAttachments(canManageAttachments);
      setNotice("附件已移至已刪除區，可於本頁還原。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "附件刪除失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function restoreAttachment(deleted: DeletedAttachment) {
    if (busy || deleted.policy.actions.restore?.allowed !== true) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(deleted.attachment.id)}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "由料號附件管理頁還原" })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "附件還原失敗。"));
      await refreshAttachments(canManageAttachments);
      setNotice("附件已還原。");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "附件還原失敗。");
    } finally {
      setBusy(false);
    }
  }

  return <PdmEditPageFrame
    returnHref={returnTo}
    eyebrow="料號附件"
    title="管理附件"
    subtitle={`料號 ${partNumber}`}
    headingLayout="breadcrumb"
    status={status}
    error={error}
    notice={notice}
    isDirty={selectedFiles.length > 0}
    onRetry={() => void load()}
    embedded={embedded}
  >
    {canManageAttachments ? <section className="pdm-edit-page-card part-attachment-upload-card" aria-label="附件上傳">
      <FileDropzone label="拖放附件到這裡，或按一下選取" description="可一次選取多個檔案。" multiple selectedFiles={selectedFiles} disabled={busy} variant="compact" onFilesSelected={setSelectedFiles} onClearSelected={() => setSelectedFiles([])} />
      <div className="part-attachment-upload-actions">{progress ? <span className="part-attachment-progress" role="status">{progress}</span> : null}<button className="primary-button" type="button" disabled={busy || selectedFiles.length === 0} onClick={() => void uploadSelectedFiles()}><Upload size={16} aria-hidden="true" />{busy && progress ? "上傳中…" : `上傳${selectedFiles.length ? ` ${selectedFiles.length} 個附件` : "附件"}`}</button></div>
    </section> : null}

    <section className="pdm-edit-page-card" aria-labelledby="part-attachment-list-title">
      <div className="pdm-edit-page-card-heading"><div><h2 id="part-attachment-list-title">目前附件</h2></div></div>
      {attachments.length ? <ul className="part-attachment-list">{attachments.map((attachment) => <li key={attachment.id}>
        <div className="part-attachment-copy"><strong title={attachment.fileName}>{attachment.displayName || attachment.fileName}</strong><span>{formatBytes(attachment.fileSize)} · {formatDateTime(attachment.createdAt)}</span>{attachment.description ? <p>{attachment.description}</p> : null}</div>
        <div className="part-attachment-actions">{previewable(attachment) ? <button className="secondary-button" type="button" onClick={() => setPreviewAttachment((current) => current?.id === attachment.id ? null : attachment)}><Eye size={15} aria-hidden="true" />{previewAttachment?.id === attachment.id ? "關閉預覽" : "預覽"}</button> : null}<a className="secondary-button" href={attachmentDownloadHref(attachment)} download={attachment.fileName} aria-label={`下載 ${attachment.fileName}`} title={`下載 ${attachment.fileName}`}><Download size={15} aria-hidden="true" />下載</a>{canManageAttachments ? <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteAttachment(attachment)}><Trash2 size={15} aria-hidden="true" />刪除</button> : null}</div>
        {previewAttachment?.id === attachment.id ? <div className="part-attachment-preview" role="region" aria-label={`${attachment.fileName} 預覽`}>{attachment.fileExt.toLowerCase().replace(/^\./u, "") === "pdf" ? <iframe src={attachmentPreviewHref(attachment)} title={`${attachment.fileName} PDF 預覽`} /> : <img src={attachmentPreviewHref(attachment)} alt={attachment.displayName || attachment.fileName} />}</div> : null}
      </li>)}</ul> : <p className="canonical-empty">尚無附件</p>}
    </section>

    {canManageAttachments ? <details className="pdm-edit-page-card part-attachment-deleted">
      <summary>已刪除附件 <span>{deletedAttachments.length}</span></summary>
      {deletedAttachments.length ? <ul className="part-attachment-list is-deleted">{deletedAttachments.map((deleted) => {
        const canRestore = deleted.policy.actions.restore?.allowed === true;
        return <li key={deleted.attachment.id}><div className="part-attachment-copy"><strong>{deleted.attachment.displayName || deleted.attachment.fileName}</strong><span>{deleted.policy.stageLabel}</span>{!canRestore && deleted.policy.actions.restore?.message ? <p>{deleted.policy.actions.restore.message}</p> : null}</div><div className="part-attachment-actions"><button className="secondary-button" type="button" disabled={busy || !canRestore} title={canRestore ? "還原附件" : deleted.policy.actions.restore?.message || "目前不可還原"} onClick={() => void restoreAttachment(deleted)}><RotateCcw size={15} aria-hidden="true" />還原</button></div></li>;
      })}</ul> : <p className="canonical-empty">目前沒有已刪除附件</p>}
    </details> : null}
  </PdmEditPageFrame>;
}
