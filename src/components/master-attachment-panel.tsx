"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, History, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { suggestRevisionCode, type RevisionLifecycleStage } from "@/lib/revision-policy";

type AttachmentEntityType = "drawing_number" | "part_number";
type DriveStatus = "none" | "uploading" | "uploaded" | "failed";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";

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

type MasterAttachment = {
  id: string;
  documentCategory: string;
  displayName: string;
  description: string;
  revision: string | null;
  fileName: string;
  fileExt: string;
  fileSize: number;
  gdriveFileId: string | null;
  gdriveStatus: DriveStatus;
  gdriveError: string | null;
  gdriveSyncedAt: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

type DeletedMasterAttachment = {
  attachment: MasterAttachment;
  policy: LifecycleActionPolicy;
};

const drawingCategories = [
  { value: "cad_3d", label: "3D CAD" },
  { value: "drawing_2d", label: "2D 圖面" },
  { value: "dwg", label: "DWG/DXF" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "其他" }
];

const partCategories = [
  { value: "catalog", label: "型錄" },
  { value: "spec_sheet", label: "規格書" },
  { value: "supplier_doc", label: "供應商文件" },
  { value: "test_report", label: "測試報告" },
  { value: "other", label: "其他" }
];

export function MasterAttachmentPanel({
  entityType,
  entityCode,
  developmentPhase,
  processControlled = true
}: {
  entityType: AttachmentEntityType;
  entityCode: string;
  developmentPhase?: NumberingPhase | null;
  processControlled?: boolean;
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
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
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

  const loadAttachments = useCallback(async (options?: { clearMessage?: boolean }) => {
    setLoading(true);
    if (options?.clearMessage !== false) setMessage(null);
    try {
      const response = await fetch(baseUrl);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "附件清單載入失敗");
      setAttachments(body.attachments ?? []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "附件清單載入失敗" });
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const loadDeletedAttachments = useCallback(async (options?: { clearMessage?: boolean }) => {
    setDeletedLoading(true);
    if (options?.clearMessage !== false) setMessage(null);
    try {
      const response = await fetch(`${baseUrl}?surface=deleted_data`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "已刪除資料載入失敗");
      setDeletedAttachments(body.attachments ?? []);
      setDeletedLoaded(true);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "已刪除資料載入失敗" });
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
    setFile(null);
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
    if (!file) {
      setMessage({ type: "error", text: "請先選擇附件檔案" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    form.append("document_category", category);
    form.append("revision", revision.trim());
    form.append("display_name", displayName.trim());
    form.append("description", description.trim());
    try {
      const response = await fetch(baseUrl, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "附件上傳失敗");
      setMessage({ type: "success", text: "附件已建立，系統會依設定同步到 Google Drive" });
      setRevision("");
      setRevisionTouched(false);
      setDisplayName("");
      setDescription("");
      setFile(null);
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "附件上傳失敗" });
    } finally {
      setLoading(false);
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
      if (!response.ok) throw new Error(body.message ?? body.error ?? "附件刪除失敗");
      setMessage({ type: "success", text: "附件已刪除" });
      await loadAttachments({ clearMessage: false });
      if (deletedLoaded) await loadDeletedAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "附件刪除失敗" });
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
      if (!response.ok) throw new Error(body.message ?? body.error ?? "附件還原失敗");
      setMessage({ type: "success", text: "附件已還原" });
      await loadAttachments({ clearMessage: false });
      await loadDeletedAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "附件還原失敗" });
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
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Google Drive 同步失敗");
      setMessage({ type: "success", text: "已重新執行 Google Drive 同步" });
      await loadAttachments({ clearMessage: false });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Google Drive 同步失敗" });
    } finally {
      setLoading(false);
    }
  }

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
            description="一次上傳一個圖號/料號附件"
            selectedFile={file}
            variant="compact"
            onClearSelected={() => setFile(null)}
            onFilesSelected={(selected) => setFile(selected[0] ?? null)}
            onReject={(reason) => {
              if (reason === "single_file_only") setMessage({ type: "error", text: "此區一次只能上傳一個附件" });
            }}
          />
        </div>
        <button className="primary-button" type="submit" disabled={loading || !file}>
          <UploadCloud size={16} />
          上傳附件
        </button>
      </form>

      {message ? <div className={`master-attachment-message ${message.type}`}>{message.text}</div> : null}

      <div className="master-attachment-list" aria-live="polite">
        {attachments.map((attachment) => {
          const downloadUrl = `${baseUrl}/${encodeURIComponent(attachment.id)}`;
          const isPdf = attachment.fileExt.toLowerCase() === "pdf";
          return (
            <article className="master-attachment-row" key={attachment.id}>
              <div className="master-attachment-icon" aria-hidden="true">
                <FileText size={18} />
              </div>
              <div className="master-attachment-main">
                <div className="master-attachment-title-row">
                  <strong title={attachment.fileName}>{attachment.displayName || attachment.fileName}</strong>
                  <span className={`master-attachment-status ${attachment.gdriveStatus}`}>{driveStatusLabel(attachment.gdriveStatus)}</span>
                </div>
                <div className="master-attachment-meta">
                  <span>{categoryLabel(attachment.documentCategory)}</span>
                  {attachment.revision ? <span>版次 {attachment.revision}</span> : null}
                  <span>{attachment.fileExt.toUpperCase()}</span>
                  <span>{formatBytes(attachment.fileSize)}</span>
                  <span>{formatDateTime(attachment.createdAt)}</span>
                </div>
                {attachment.description ? <p>{attachment.description}</p> : null}
                {attachment.gdriveError ? <p className="master-attachment-error">{attachment.gdriveError}</p> : null}
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
                <button className="icon-button danger" type="button" onClick={() => void deleteAttachment(attachment)} disabled={loading} title="刪除附件" aria-label="刪除附件">
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          );
        })}
        {attachments.length === 0 ? <div className="empty">尚未建立附件</div> : null}
      </div>

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
                    {!canRestore && restoreState?.message ? <p className="master-attachment-error">{restoreState.message}</p> : null}
                  </div>
                  <div className="master-attachment-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void restoreAttachment(deleted)}
                      disabled={loading || deletedLoading || !canRestore}
                      title={canRestore ? "還原附件" : restoreState?.message ?? "不可還原"}
                      aria-label={canRestore ? "還原附件" : restoreState?.message ?? "不可還原"}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
            {deletedLoading ? <div className="empty">正在載入已刪除資料...</div> : null}
            {deletedLoaded && deletedAttachments.length === 0 ? <div className="empty">目前沒有已刪除附件</div> : null}
          </div>
        </div>
      </details>
    </section>
  );
}

function categoryLabel(value: string) {
  return [...drawingCategories, ...partCategories].find((item) => item.value === value)?.label ?? value;
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
