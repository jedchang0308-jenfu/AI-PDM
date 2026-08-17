"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import type { DrawingMaintenanceTarget } from "@/lib/pdm-entity-detail-contract";
import { formatStatusErrorForUser } from "@/lib/status-display";

type CandidateTarget = Extract<NonNullable<DrawingMaintenanceTarget>, { kind: "candidate_revision" | "candidate_revision_pending" }>;
type CandidateAttachment = { id: string; displayName: string; role: string | null; href: string | null };
type CandidateRevisionResult = { id: string; drawingDraftId: string; rowVersion: number; revision: string; lifecycleStatus?: string };
type CandidateCreationBody = { workspace?: { candidateRevisions?: CandidateRevisionResult[] } };
type CandidateFileUploadBody = CandidateCreationBody & {
  error?: { code?: string; message?: string };
  fileLinkResult?: "created" | "already_linked" | "reactivated";
  hashReused?: boolean;
  contentChanged?: boolean;
};

const acceptedDrawingExtensions = new Set([
  "slddrw", "sldprt", "sldasm", "pdf", "dwg", "dxf", "step", "stp", "iges", "igs", "igf", "x_t", "x_b", "sat", "stl", "jt"
]);

function supportedFile(fileName: string) {
  return acceptedDrawingExtensions.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

function responseError(body: unknown) {
  if (!body || typeof body !== "object") return "圖面資料上傳未完成。";
  const record = body as { error?: unknown; message?: unknown };
  const error = record.error;
  const value = error && typeof error === "object" && "message" in error
    ? (error as { message?: unknown }).message
    : record.message ?? error;
  return formatStatusErrorForUser(String(value ?? "圖面資料上傳未完成"), "fileSync");
}

function uploadForm(file: File, rowVersion: number) {
  const form = new FormData();
  form.set("file", file);
  form.set("expectedRowVersion", String(rowVersion));
  form.set("displayName", file.name);
  form.set("description", "從圖面維護上傳受控圖面資料");
  return form;
}

async function postCandidateFile(target: CandidateTarget, candidateRevisionId: string, rowVersion: number, file: File) {
  return fetch(
    `/api/numbering/draft-workspaces/${encodeURIComponent(target.workspaceId)}/candidate-revisions/${encodeURIComponent(candidateRevisionId)}/files`,
    {
      method: "POST",
      headers: { "Idempotency-Key": `pdm-drawing-maintenance:${candidateRevisionId}:${crypto.randomUUID()}` },
      body: uploadForm(file, rowVersion)
    }
  );
}

async function refreshCandidateRevisionTarget(target: CandidateTarget, candidateRevisionId: string) {
  const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(target.workspaceId)}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as CandidateCreationBody | null;
  if (!response.ok) throw new Error(responseError(body));
  const revision = body?.workspace?.candidateRevisions?.find((item) => item.id === candidateRevisionId && item.drawingDraftId === target.drawingDraftId);
  if (!revision || revision.lifecycleStatus !== "draft") return null;
  return revision;
}

export function CandidateDrawingFileUpload({ target, attachments, onUploaded }: { target: CandidateTarget; attachments: CandidateAttachment[]; onUploaded?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [activeTarget, setActiveTarget] = useState<CandidateTarget>(target);
  const targetIdentity = `${target.workspaceId}:${target.drawingDraftId}`;
  const targetVersionIdentity = target.kind === "candidate_revision"
    ? `${target.candidateRevisionId}:${target.rowVersion}:${target.revision}`
    : `pending:${target.workspaceRowVersion}`;

  useEffect(() => {
    setSelectedFile(null);
    setMessage(null);
  }, [targetIdentity]);

  useEffect(() => {
    setActiveTarget(target);
  }, [target, targetVersionIdentity]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) {
      setMessage({ type: "error", text: "請先拖曳或選擇一個圖面附件。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let uploadTarget: { candidateRevisionId: string; rowVersion: number };
      let createdFirstRevision = false;
      if (activeTarget.kind === "candidate_revision_pending") {
        const createResponse = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(activeTarget.workspaceId)}/candidate-revisions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `pdm-drawing-maintenance:create:${activeTarget.drawingDraftId}:${crypto.randomUUID()}`
          },
          body: JSON.stringify({ drawingDraftId: activeTarget.drawingDraftId, expectedWorkspaceRowVersion: activeTarget.workspaceRowVersion })
        });
        const createBody = await createResponse.json().catch(() => null) as CandidateCreationBody | null;
        if (!createResponse.ok) throw new Error(responseError(createBody));
        const createdRevision = createBody?.workspace?.candidateRevisions?.find((revision) => revision.drawingDraftId === activeTarget.drawingDraftId);
        if (!createdRevision) throw new Error("首版已建立，但系統尚未取得版次資料；請重新整理後再上傳。");
        uploadTarget = { candidateRevisionId: createdRevision.id, rowVersion: createdRevision.rowVersion };
        createdFirstRevision = true;
      } else {
        uploadTarget = { candidateRevisionId: activeTarget.candidateRevisionId, rowVersion: activeTarget.rowVersion };
        const refreshedRevision = await refreshCandidateRevisionTarget(activeTarget, activeTarget.candidateRevisionId);
        if (!refreshedRevision) throw new Error("候選版次目前不可修改，請重新整理確認審核狀態。");
        uploadTarget = { candidateRevisionId: refreshedRevision.id, rowVersion: refreshedRevision.rowVersion };
      }
      let response = await postCandidateFile(activeTarget, uploadTarget.candidateRevisionId, uploadTarget.rowVersion, selectedFile);
      let body = await response.json().catch(() => null) as CandidateFileUploadBody | null;
      if (!response.ok && response.status === 409 && body?.error?.code === "candidate_revision_version_stale") {
        const refreshedRevision = await refreshCandidateRevisionTarget(activeTarget, uploadTarget.candidateRevisionId);
        if (refreshedRevision) {
          uploadTarget = { candidateRevisionId: refreshedRevision.id, rowVersion: refreshedRevision.rowVersion };
          response = await postCandidateFile(activeTarget, uploadTarget.candidateRevisionId, uploadTarget.rowVersion, selectedFile);
          body = await response.json().catch(() => null) as CandidateFileUploadBody | null;
        }
      }
      if (!response.ok) throw new Error(responseError(body));
      const uploadedName = selectedFile.name;
      const updatedRevision = body?.workspace?.candidateRevisions?.find((revision) => revision.id === uploadTarget.candidateRevisionId);
      if (updatedRevision) {
        setActiveTarget({
          kind: "candidate_revision",
          workspaceId: activeTarget.workspaceId,
          drawingDraftId: updatedRevision.drawingDraftId,
          candidateRevisionId: updatedRevision.id,
          rowVersion: updatedRevision.rowVersion,
          revision: updatedRevision.revision
        });
      }
      setSelectedFile(null);
      const resultText = body?.fileLinkResult === "already_linked"
        ? `${uploadedName} 已存在於本版次；系統沿用同一受控檔案，未重複新增。`
        : body?.fileLinkResult === "reactivated"
          ? `${uploadedName} 已沿用同一受控檔案，並重新設為本版次主要檔案。`
          : body?.hashReused
            ? `${uploadedName} 已連結既有受控檔案；本版次可正常查閱，未複製檔案內容。`
            : `${uploadedName} 已上傳並完成候選檔案驗證。`;
      setMessage({ type: "success", text: `${createdFirstRevision ? "首版已自動建立；" : ""}${resultText}` });
      onUploaded?.();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "圖面資料上傳未完成。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel master-attachment-panel is-compact" data-component="CandidateDrawingFileUpload" data-attachment-authority={activeTarget.kind}>
      <div className="panel-header">
        <div><h2>候選版次檔案</h2><span className="master-attachment-header-meta">{activeTarget.kind === "candidate_revision" ? `版次 ${activeTarget.revision || "尚未指定"}` : "上傳時自動建立首版"}</span></div>
      </div>
        <form className="master-attachment-inline-upload" onSubmit={upload} aria-label="上傳圖面資料">
          <FileDropzone
            label="上傳圖面資料"
            description="拖曳或選擇 1 個圖面、PDF、DWG 或常見中繼檔"
            accept=".SLDDRW,.SLDPRT,.SLDASM,.PDF,.DWG,.DXF,.STEP,.STP,.IGES,.IGS,.IGF,.X_T,.X_B,.SAT,.STL,.JT"
            selectedFile={selectedFile}
            variant="compact"
            disabled={busy}
            onClearSelected={() => setSelectedFile(null)}
            onFilesSelected={(files) => {
              const file = files[0] ?? null;
              if (file && !supportedFile(file.name)) {
                setSelectedFile(null);
                setMessage({ type: "error", text: "只接受常見圖面與工程格式；檔案類別會由系統自動判斷。" });
                return;
              }
              setMessage(null);
              setSelectedFile(file);
            }}
            onReject={(reason) => {
              if (reason === "single_file_only") setMessage({ type: "error", text: "一次只能上傳一個圖面附件。" });
            }}
          />
          <button className="secondary-button" type="submit" disabled={busy || !selectedFile} aria-label="上傳圖面資料">
            <UploadCloud size={15} />
            {busy ? "上傳中..." : "上傳"}
          </button>
        </form>
        {message ? <div className={`master-attachment-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}
      {attachments.length > 0 ? (
        <section className="master-attachment-file-details" aria-label="候選檔案清單">
          <div className="master-attachment-file-details-header"><span><FileText size={16} />候選檔案</span><strong>{attachments.length} 個</strong></div>
          <ul className="unified-pdm-candidate-file-list">
            {attachments.map((attachment) => <li key={attachment.id}>{attachment.href ? <a href={attachment.href}>{attachment.displayName}</a> : attachment.displayName}</li>)}
          </ul>
        </section>
      ) : <div className="empty">尚無候選版次檔案。</div>}
    </section>
  );
}
