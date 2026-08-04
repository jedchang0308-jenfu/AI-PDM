"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, Save, Trash2, UploadCloud } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";

type CandidateFile = {
  id: string;
  sourceFileAssetId: string;
  publicationEvidenceId: string | null;
  role: "cad_3d" | "drawing_2d" | "intermediate" | "pdf" | "dwg_dxf" | "other";
  displayName: string;
  description: string;
  isPrimary: boolean;
  removedAt: string | null;
};

type CandidateRevision = {
  id: string;
  drawingDraftId: string;
  revision: string;
  policySnapshot: Record<string, unknown>;
  overrideReason: string | null;
  lifecycleStatus: "draft" | "review_locked" | "promoted" | "cancelled";
  rowVersion: number;
  approvalRequestId: string | null;
  files: CandidateFile[];
  effectiveStatus: "ReviewApproved" | "Pending" | null;
};

export type CandidateRevisionWorkspace = {
  id: string;
  rowVersion: number;
  lifecycleStatus: "active" | "cancelled" | "published";
  drawings: Array<{ id: string; candidateCode: string | null; purposeDescription: string; purposeCode: string }>;
  candidateRevisions: CandidateRevision[];
  lifecycleV2: null | {
    stage: "drawing_preparation" | "bundle_ready" | "in_review" | "auto_finalizing" | "official_controlled" | "drawing_addendum_required" | "recovery_required" | "history_only";
    primaryAction: string;
    exceptionKind: "none" | "legacy" | "blocked" | "recovery";
  };
};

type ApiBody = {
  workspace?: CandidateRevisionWorkspace;
  error?: string | { code?: string; message?: string };
  message?: string;
};

function idempotencyKey(action: string) {
  return `dev052:${action}:${crypto.randomUUID()}`;
}

function errorMessage(response: Response, body: ApiBody, fallback: string) {
  if (body.error && typeof body.error === "object" && body.error.message) return body.error.message;
  if (typeof body.error === "string") return body.error;
  return body.message || `${fallback}（HTTP ${response.status}）`;
}

function suggestedRevision(candidate: CandidateRevision) {
  return String(candidate.policySnapshot.suggested_revision ?? candidate.revision ?? "0.1");
}

function fileRoleFor(file: File): CandidateFile["role"] {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["sldprt", "sldasm", "step", "stp", "iges", "igs"].includes(extension)) return "cad_3d";
  if (["slddrw"].includes(extension)) return "drawing_2d";
  if (["dwg", "dxf"].includes(extension)) return "dwg_dxf";
  if (extension === "pdf") return "pdf";
  return "other";
}

export function NumberingCandidateRevisionEditor({
  workspace,
  disabled,
  onWorkspaceChange,
  onError,
  onNotice
}: {
  workspace: CandidateRevisionWorkspace;
  disabled: boolean;
  onWorkspaceChange: (workspace: CandidateRevisionWorkspace) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [busyKey, setBusyKey] = useState("");
  const createInFlightRef = useRef(false);
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const candidateByDrawing = useMemo(
    () => new Map(workspace.candidateRevisions.map((candidate) => [candidate.drawingDraftId, candidate])),
    [workspace.candidateRevisions]
  );

  useEffect(() => {
    setRevisionDrafts(Object.fromEntries(workspace.candidateRevisions.map((candidate) => [candidate.id, candidate.revision])));
    setOverrideReasons(Object.fromEntries(workspace.candidateRevisions.map((candidate) => [candidate.id, candidate.overrideReason ?? ""])));
  }, [workspace.candidateRevisions]);

  async function read(response: Response) {
    return await response.json().catch(() => ({})) as ApiBody;
  }

  async function createCandidate(drawingDraftId: string) {
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    const actionKey = `create:${drawingDraftId}`;
    setBusyKey(actionKey);
    onError("");
    try {
      const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey(actionKey) },
        body: JSON.stringify({ drawingDraftId, expectedWorkspaceRowVersion: workspace.rowVersion })
      });
      const body = await read(response);
      if (!response.ok || !body.workspace) {
        onError(errorMessage(response, body, "無法建立候選首版"));
        return;
      }
      onWorkspaceChange(body.workspace);
      onNotice("候選首版已建立；目前仍不可正式使用。請確認版次並加入主要圖面檔案。");
    } finally {
      createInFlightRef.current = false;
      setBusyKey("");
    }
  }

  async function saveRevision(candidate: CandidateRevision) {
    const actionKey = `save:${candidate.id}`;
    const revision = String(revisionDrafts[candidate.id] ?? candidate.revision).trim();
    const suggestion = suggestedRevision(candidate);
    const overrideReason = String(overrideReasons[candidate.id] ?? "").trim();
    if (revision !== suggestion && !overrideReason) {
      onError("調整系統建議版次時，請填寫調整原因。");
      return;
    }
    setBusyKey(actionKey);
    onError("");
    const response = await fetch(
      `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey(actionKey) },
        body: JSON.stringify({ revision, overrideReason, expectedRowVersion: candidate.rowVersion })
      }
    );
    const body = await read(response);
    setBusyKey("");
    if (!response.ok || !body.workspace) {
      onError(errorMessage(response, body, "無法儲存候選版次"));
      return;
    }
    onWorkspaceChange(body.workspace);
    onNotice("候選版次已儲存。");
  }

  async function upload(candidate: CandidateRevision) {
    const file = selectedFiles[candidate.id];
    if (!file) {
      onError("請先選擇首版圖面檔案。");
      return;
    }
    const actionKey = `upload:${candidate.id}`;
    const form = new FormData();
    form.set("file", file);
    form.set("role", fileRoleFor(file));
    form.set("isPrimary", "true");
    form.set("expectedRowVersion", String(candidate.rowVersion));
    form.set("displayName", file.name);
    setBusyKey(actionKey);
    onError("");
    const response = await fetch(
      `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}/files`,
      { method: "POST", headers: { "Idempotency-Key": idempotencyKey(actionKey) }, body: form }
    );
    const body = await read(response);
    setBusyKey("");
    if (!response.ok || !body.workspace) {
      onError(errorMessage(response, body, "無法上傳候選首版檔案"));
      return;
    }
    setSelectedFiles((current) => ({ ...current, [candidate.id]: null }));
    onWorkspaceChange(body.workspace);
    onNotice("首版主要檔案已加入；送審前系統仍會檢查 finalized 證據。");
  }

  async function remove(candidate: CandidateRevision, file: CandidateFile) {
    const actionKey = `remove:${file.id}`;
    setBusyKey(actionKey);
    onError("");
    const response = await fetch(
      `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}/files/${encodeURIComponent(file.id)}/remove`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey(actionKey) },
        body: JSON.stringify({ expectedRowVersion: candidate.rowVersion, reason: "candidate_file_replaced_by_user" })
      }
    );
    const body = await read(response);
    setBusyKey("");
    if (!response.ok || !body.workspace) {
      onError(errorMessage(response, body, "無法移除候選首版檔案"));
      return;
    }
    onWorkspaceChange(body.workspace);
    onNotice("檔案已從候選首版移除；原 object 與歷史證據未刪除。");
  }

  return (
    <section className="number-state-drawer-section candidate-revision-editor" data-candidate-editor="true">
      <div className="number-state-section-heading">
        <div><h3>候選首版圖面</h3><p>候選階段可準備內容，但尚不可正式使用。</p></div>
      </div>
      <div className="candidate-revision-editor-list">
        {workspace.drawings.map((drawing) => {
          const candidate = candidateByDrawing.get(drawing.id);
          if (!candidate) {
            return (
              <article className="candidate-revision-card is-empty" key={drawing.id}>
                <div><strong>{drawing.candidateCode ?? "候選圖號尚未產生"}</strong><span>{drawing.purposeDescription || drawing.purposeCode} · 尚未建立首版</span></div>
                <button
                  className="primary-button"
                  type="button"
                  data-primary-action="complete-first-drawing"
                  disabled={disabled || Boolean(busyKey)}
                  onClick={() => void createCandidate(drawing.id)}
                ><FilePlus2 size={16} />{busyKey === `create:${drawing.id}` ? "建立中..." : "完成首版圖面"}</button>
              </article>
            );
          }
          const activeFiles = candidate.files.filter((file) => !file.removedAt);
          const suggestion = suggestedRevision(candidate);
          const locked = candidate.lifecycleStatus !== "draft";
          const revisionValue = revisionDrafts[candidate.id] ?? candidate.revision;
          return (
            <article className="candidate-revision-card" key={candidate.id} data-candidate-status={candidate.lifecycleStatus}>
              <header><div><strong>{drawing.candidateCode ?? drawing.id}</strong><span>建議版次 {suggestion} · {locked ? "審核內容已鎖定" : "候選草稿"}</span></div><span className="number-state-badge qualification-candidate">尚不可正式使用</span></header>
              <div className="candidate-revision-fields">
                <label><span>研發版次</span><input value={revisionValue} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setRevisionDrafts((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
                {revisionValue.trim() !== suggestion ? <label><span>調整原因</span><input value={overrideReasons[candidate.id] ?? ""} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setOverrideReasons((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="說明為何不採用建議版次" /></label> : null}
                {!locked ? <button className="secondary-button" type="button" disabled={disabled || Boolean(busyKey)} onClick={() => void saveRevision(candidate)}><Save size={15} />{busyKey === `save:${candidate.id}` ? "儲存中..." : "儲存版次"}</button> : null}
              </div>
              {activeFiles.length > 0 ? <ul className="candidate-revision-files">{activeFiles.map((file) => <li key={file.id}><div><strong>{file.displayName}</strong><span>{file.role} · {file.isPrimary ? "主要檔案" : "附件"} · {file.publicationEvidenceId ? "證據已 finalized" : "等待 finalized 證據"}</span></div>{!locked ? <button className="icon-button" type="button" aria-label={`移除 ${file.displayName}`} disabled={disabled || Boolean(busyKey)} onClick={() => void remove(candidate, file)}><Trash2 size={15} /></button> : null}</li>)}</ul> : <p className="candidate-revision-missing">尚缺主要圖面檔案與 finalized 證據。</p>}
              {!locked ? (
                <div className="candidate-revision-upload">
                  <FileDropzone
                    label="拖放或選擇首版圖面"
                    description="支援 CAD、工程圖、PDF、DWG／DXF；每次加入一個主要檔案。"
                    selectedFile={selectedFiles[candidate.id] ?? null}
                    onFilesSelected={(files) => setSelectedFiles((current) => ({ ...current, [candidate.id]: files[0] ?? null }))}
                    onClearSelected={() => setSelectedFiles((current) => ({ ...current, [candidate.id]: null }))}
                    disabled={disabled || Boolean(busyKey)}
                    variant="compact"
                  />
                  <button
                    className={activeFiles.some((file) => file.isPrimary && file.publicationEvidenceId) ? "secondary-button" : "primary-button"}
                    type="button"
                    data-primary-action={activeFiles.some((file) => file.isPrimary && file.publicationEvidenceId) ? undefined : "complete-first-drawing"}
                    disabled={disabled || Boolean(busyKey) || !selectedFiles[candidate.id]}
                    onClick={() => void upload(candidate)}
                  ><UploadCloud size={16} />{busyKey === `upload:${candidate.id}` ? "上傳中..." : "上傳主要檔案"}</button>
                </div>
              ) : null}
              {candidate.effectiveStatus === "ReviewApproved" ? <div className="candidate-revision-approved">研發版已核准（ReviewApproved）；實體 package 仍為 Pending。</div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
