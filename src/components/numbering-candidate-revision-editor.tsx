"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, FilePlus2, LoaderCircle, Save, Trash2, UploadCloud } from "lucide-react";
import { DrawingDetailSection } from "@/components/drawing-detail-content";
import { FileDropzone } from "@/components/file-dropzone";
import {
  NumberingSubmissionResultFileList,
  type NumberingSubmissionResultCandidate
} from "@/components/numbering-submission-result";

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

type PendingCandidateFile = {
  id: string;
  file: File;
  displayName: string;
  description: string;
  idempotencyKey: string;
  status: "pending" | "uploading" | "failed";
  error: string;
};

type CandidateFileUploadProgress = {
  completed: number;
  total: number;
  currentFileName: string;
  bytesSent: number;
  totalBytes: number;
  phase: "uploading" | "verifying";
};

const requiredPrimaryRoles = ["drawing_2d", "cad_3d"] as const satisfies readonly CandidateFile["role"][];

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
  localDevelopmentEvidence?: boolean;
  error?: string | { code?: string; message?: string };
  message?: string;
};

function idempotencyKey(action: string) {
  const safeAction = action.replace(/[^A-Za-z0-9._:/-]/gu, "_").slice(0, 100);
  return `dev052:${safeAction}:${crypto.randomUUID()}`;
}

function safeIdempotencyHeader(value: string) {
  const safeValue = value.replace(/[^A-Za-z0-9._:/-]/gu, "_").slice(0, 180);
  return safeValue || `dev052:${crypto.randomUUID()}`;
}

function errorMessage(response: Pick<Response, "ok" | "status">, body: ApiBody, fallback: string) {
  if (body.error && typeof body.error === "object" && body.error.message) return body.error.message;
  if (typeof body.error === "string") return body.error;
  return body.message || `${fallback}（HTTP ${response.status}）`;
}

function terminalSentence(message: string) {
  return `${message.replace(/[。.!！?？]+$/u, "")}。`;
}

function uploadCandidateFile(input: {
  url: string;
  form: FormData;
  idempotencyKey: string;
  onProgress: (loaded: number, total: number | null) => void;
  onUploadComplete: () => void;
}) {
  return new Promise<{ response: Pick<Response, "ok" | "status">; body: ApiBody }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", input.url);
    request.timeout = 5 * 60 * 1000;
    request.setRequestHeader("Idempotency-Key", safeIdempotencyHeader(input.idempotencyKey));
    request.upload.addEventListener("progress", (event) => {
      input.onProgress(event.loaded, event.lengthComputable ? event.total : null);
    });
    request.upload.addEventListener("load", input.onUploadComplete);
    request.addEventListener("load", () => {
      let body: ApiBody = {};
      try {
        body = JSON.parse(request.responseText) as ApiBody;
      } catch {
        body = {};
      }
      resolve({
        response: { ok: request.status >= 200 && request.status < 300, status: request.status },
        body
      });
    });
    request.addEventListener("error", () => reject(new Error("上傳連線中斷，請確認網路後重試。")));
    request.addEventListener("abort", () => reject(new Error("上傳已中斷，請重新確認檔案後再試。")));
    request.addEventListener("timeout", () => reject(new Error("上傳逾時；請稍候重新整理確認結果，再重試未完成的檔案。")));
    request.send(input.form);
  });
}

function suggestedRevision(candidate: CandidateRevision) {
  return String(candidate.policySnapshot.suggested_revision ?? candidate.revision ?? "0.1");
}

function recommendedFileWarnings(files: CandidateFile[]) {
  const roles = new Set(files.filter((file) => !file.removedAt).map((file) => file.role));
  const missing: string[] = [];
  if (!roles.has("pdf")) missing.push("PDF");
  if (!roles.has("dwg_dxf")) missing.push("DWG／DXF");
  if (!roles.has("cad_3d")) missing.push("3D 原檔");
  return missing;
}

function hasRequiredPrimaryEvidence(files: CandidateFile[]) {
  return requiredPrimaryRoles.every((role) =>
    files.some((file) => !file.removedAt && file.role === role && file.isPrimary && file.publicationEvidenceId)
  );
}

function isRequiredPrimaryRole(role: CandidateFile["role"]) {
  return requiredPrimaryRoles.includes(role as (typeof requiredPrimaryRoles)[number]);
}

export function NumberingCandidateRevisionEditor({
  workspace,
  primaryDrawingCode = null,
  disabled,
  onWorkspaceChange,
  onError,
  onNotice
}: {
  workspace: CandidateRevisionWorkspace;
  primaryDrawingCode?: string | null;
  disabled: boolean;
  onWorkspaceChange: (workspace: CandidateRevisionWorkspace) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [busyKey, setBusyKey] = useState("");
  const createInFlightRef = useRef(false);
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingCandidateFile[]>>({});
  const [uploadProgress, setUploadProgress] = useState<CandidateFileUploadProgress | null>(null);
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
        onError(errorMessage(response, body, "無法建立首版準備"));
        return;
      }
      onWorkspaceChange(body.workspace);
      onNotice("首版準備已建立；發布前不能使用。請確認版次並加入主要圖面檔案。");
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
      onError(errorMessage(response, body, "無法儲存版次"));
      return;
    }
    onWorkspaceChange(body.workspace);
    onNotice("版次已儲存。");
  }

  function queueFiles(candidate: CandidateRevision, files: File[]) {
    if (files.length === 0) return;
    setPendingFiles((current) => {
      const existing = current[candidate.id] ?? [];
      const fingerprints = new Set(existing.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const added = files.flatMap((file) => {
        const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
        if (fingerprints.has(fingerprint)) return [];
        fingerprints.add(fingerprint);
        return [{
          id: crypto.randomUUID(),
          file,
          displayName: file.name,
          description: "",
          idempotencyKey: idempotencyKey(`upload:${candidate.id}:${fingerprint}`),
          status: "pending" as const,
          error: ""
        }];
      });
      return { ...current, [candidate.id]: [...existing, ...added] };
    });
  }

  function updatePendingFile(candidateId: string, fileId: string, patch: Partial<PendingCandidateFile>) {
    setPendingFiles((current) => ({
      ...current,
      [candidateId]: (current[candidateId] ?? []).map((item) => item.id === fileId ? { ...item, ...patch } : item)
    }));
  }

  function removePendingFile(candidateId: string, fileId: string) {
    setPendingFiles((current) => ({
      ...current,
      [candidateId]: (current[candidateId] ?? []).filter((item) => item.id !== fileId)
    }));
  }

  async function upload(candidate: CandidateRevision) {
    const queue = pendingFiles[candidate.id] ?? [];
    if (queue.length === 0) {
      onError("請先選擇首版圖面檔案。");
      return;
    }
    const actionKey = `upload:${candidate.id}`;
    setBusyKey(actionKey);
    onError("");
    let latestWorkspace = workspace;
    let expectedRowVersion = candidate.rowVersion;
    let uploadedCount = 0;
    let currentItem: PendingCandidateFile | null = null;
    setUploadProgress({
      completed: 0,
      total: queue.length,
      currentFileName: queue[0].file.name,
      bytesSent: 0,
      totalBytes: queue[0].file.size,
      phase: "uploading"
    });
    try {
      for (const [index, item] of queue.entries()) {
        currentItem = item;
        updatePendingFile(candidate.id, item.id, { status: "uploading", error: "" });
        setUploadProgress((current) => current ? {
          ...current,
          completed: index,
          currentFileName: item.file.name,
          bytesSent: 0,
          totalBytes: item.file.size,
          phase: "uploading"
        } : current);
        const form = new FormData();
        form.set("file", item.file);
        form.set("expectedRowVersion", String(expectedRowVersion));
        form.set("displayName", item.displayName.trim() || item.file.name);
        form.set("description", item.description.trim());
        const { response, body } = await uploadCandidateFile({
          url: `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}/files`,
          form,
          idempotencyKey: item.idempotencyKey,
          onProgress: (loaded, total) => setUploadProgress((current) => current ? {
            ...current,
            bytesSent: loaded,
            totalBytes: total ?? item.file.size,
            phase: "uploading"
          } : current),
          onUploadComplete: () => setUploadProgress((current) => current ? { ...current, phase: "verifying" } : current)
        });
        if (!response.ok || !body.workspace) {
          const message = errorMessage(response, body, "無法上傳首版檔案");
          updatePendingFile(candidate.id, item.id, { status: "failed", error: message });
          if (uploadedCount > 0) onWorkspaceChange(latestWorkspace);
          onError(`「${item.displayName || item.file.name}」尚未完成：${terminalSentence(message)}已成功的檔案會保留，請修正後重試。`);
          return;
        }
        latestWorkspace = body.workspace;
        const latestCandidate = body.workspace.candidateRevisions.find((value) => value.id === candidate.id);
        expectedRowVersion = latestCandidate?.rowVersion ?? expectedRowVersion + 1;
        uploadedCount += 1;
        removePendingFile(candidate.id, item.id);
        setUploadProgress((current) => current ? { ...current, completed: index + 1, bytesSent: item.file.size, totalBytes: item.file.size } : current);
      }
      onWorkspaceChange(latestWorkspace);
      const latestCandidate = latestWorkspace.candidateRevisions.find((value) => value.id === candidate.id);
      const requiredEvidenceReady = latestCandidate ? hasRequiredPrimaryEvidence(latestCandidate.files) : false;
      onNotice(requiredEvidenceReady
        ? `已完成 ${uploadedCount} 個受控檔案驗證；主要 2D 圖面與 3D 模型都已就緒，現在可送交審核。`
        : `已加入 ${uploadedCount} 個檔案，但主要 2D 圖面或 3D 模型尚未完成驗證。請補齊、重新驗證或移除失敗檔案。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上傳過程發生未知錯誤，請重新嘗試。";
      if (currentItem) updatePendingFile(candidate.id, currentItem.id, { status: "failed", error: message });
      if (uploadedCount > 0) onWorkspaceChange(latestWorkspace);
      onError(`「${currentItem?.displayName || currentItem?.file.name || "檔案"}」尚未完成：${terminalSentence(message)}已成功的檔案會保留，請修正後重試。`);
    } finally {
      setBusyKey("");
      setUploadProgress(null);
    }
  }

  async function verifyExistingFiles(candidate: CandidateRevision) {
    const files = candidate.files.filter((file) =>
      !file.removedAt && !file.publicationEvidenceId && !isRequiredPrimaryRole(file.role)
    );
    if (files.length === 0) return;
    const actionKey = `verify:${candidate.id}`;
    setBusyKey(actionKey);
    onError("");
    let latestWorkspace = workspace;
    let expectedRowVersion = candidate.rowVersion;
    let verifiedCount = 0;
    for (const file of files) {
      const response = await fetch(
        `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}/files`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": `dev053:verify-existing:${file.id}:${expectedRowVersion}`
          },
          body: JSON.stringify({ fileId: file.id, expectedRowVersion })
        }
      );
      const body = await read(response);
      if (!response.ok || !body.workspace) {
        if (verifiedCount > 0) onWorkspaceChange(latestWorkspace);
        setBusyKey("");
        onError(`「${file.displayName}」尚未完成驗證：${errorMessage(response, body, "無法驗證既有檔案")}。已成功驗證的檔案會保留。`);
        return;
      }
      latestWorkspace = body.workspace;
      const latestCandidate = body.workspace.candidateRevisions.find((value) => value.id === candidate.id);
      expectedRowVersion = latestCandidate?.rowVersion ?? expectedRowVersion + 1;
      verifiedCount += 1;
    }
    setBusyKey("");
    onWorkspaceChange(latestWorkspace);
    const latestCandidate = latestWorkspace.candidateRevisions.find((value) => value.id === candidate.id);
    const requiredEvidenceReady = latestCandidate ? hasRequiredPrimaryEvidence(latestCandidate.files) : false;
    onNotice(requiredEvidenceReady
      ? `已驗證 ${verifiedCount} 個既有檔案，不需重新上傳；主要 2D 圖面與 3D 模型都已就緒，現在可送交審核。`
      : `已驗證 ${verifiedCount} 個既有檔案；仍需補齊主要 2D 圖面與 3D 模型。`);
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
      onError(errorMessage(response, body, "無法移除首版檔案"));
      return;
    }
    onWorkspaceChange(body.workspace);
    onNotice("檔案已從首版準備移除；原 object 與歷史證據未刪除。");
  }

  return (
    <DrawingDetailSection
      title="首版圖面／版次檔案"
      className="number-state-drawer-section candidate-revision-editor"
      dataSection="drawing-revision-files"
      ariaLabel="首版圖面與版次檔案"
      dataCandidateEditor
    >
      <div className="candidate-revision-editor-list">
        {workspace.drawings.map((drawing) => {
          const candidate = candidateByDrawing.get(drawing.id);
      const drawingLabel = drawing.candidateCode === primaryDrawingCode ? `${drawing.purposeCode} 圖面` : drawing.candidateCode ?? "圖號尚未產生";
          if (!candidate) {
            return (
              <article className="candidate-revision-card is-empty" key={drawing.id}>
                <div><strong>{drawingLabel}</strong><span>{drawing.purposeDescription || drawing.purposeCode} · 尚未建立首版</span></div>
                <button
                  className="primary-button"
                  type="button"
                  data-primary-action="complete-first-drawing"
                  disabled={disabled || Boolean(busyKey)}
                  onClick={() => void createCandidate(drawing.id)}
                ><FilePlus2 size={16} />{busyKey === `create:${drawing.id}` ? "建立中..." : "建立首版"}</button>
              </article>
            );
          }
          const activeFiles = candidate.files.filter((file) => !file.removedAt);
          const unverifiedRequiredPrimaryFiles = activeFiles.filter((file) =>
            !file.publicationEvidenceId && isRequiredPrimaryRole(file.role)
          );
          const verifiableExistingFiles = activeFiles.filter((file) =>
            !file.publicationEvidenceId && !isRequiredPrimaryRole(file.role)
          );
          const suggestion = suggestedRevision(candidate);
          const locked = candidate.lifecycleStatus !== "draft";
          const revisionValue = revisionDrafts[candidate.id] ?? candidate.revision;
          const queuedFiles = pendingFiles[candidate.id] ?? [];
          const currentUploadProgress = busyKey === `upload:${candidate.id}` ? uploadProgress : null;
          const currentUploadPercent = currentUploadProgress && currentUploadProgress.totalBytes > 0
            ? Math.min(100, Math.round((currentUploadProgress.bytesSent / currentUploadProgress.totalBytes) * 100))
            : 0;
          const uploadProgressIndeterminate = Boolean(currentUploadProgress && currentUploadProgress.bytesSent === 0);
          const requiredEvidenceReady = hasRequiredPrimaryEvidence(activeFiles);
          const fileWarnings = recommendedFileWarnings(activeFiles);
          return (
            <article className="candidate-revision-card" key={candidate.id} data-candidate-status={candidate.lifecycleStatus}>
              <header><div><strong>{drawingLabel}</strong><span>建議版次 {suggestion} · {locked ? "審核內容已鎖定" : "編輯中"}</span></div></header>
              <div className="candidate-revision-fields">
                <label><span>研發版次</span><input value={revisionValue} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setRevisionDrafts((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
                {revisionValue.trim() !== suggestion ? <label><span>調整原因</span><input value={overrideReasons[candidate.id] ?? ""} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setOverrideReasons((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="說明為何不採用建議版次" /></label> : null}
                {!locked ? <button className="secondary-button" type="button" disabled={disabled || Boolean(busyKey)} onClick={() => void saveRevision(candidate)}><Save size={15} />{busyKey === `save:${candidate.id}` ? "儲存中..." : "儲存版次"}</button> : null}
              </div>
              <NumberingSubmissionResultFileList
                candidate={{ id: candidate.id, drawingCode: drawing.candidateCode, revision: revisionValue, files: activeFiles } satisfies NumberingSubmissionResultCandidate}
                files={activeFiles}
                mode="author"
                renderFileActions={(_, file) => !locked ? (
                  <button className="icon-button" type="button" aria-label={`移除 ${file.displayName}`} disabled={disabled || Boolean(busyKey)} onClick={() => void remove(candidate, file as unknown as CandidateFile)}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              />
              {!locked && unverifiedRequiredPrimaryFiles.length > 0 ? <div className="candidate-revision-existing-verification" role="status"><div><strong>主要 2D 圖面與 3D 模型需重新上傳。</strong><span>本版不可沿用舊 primary 證據；請移除舊檔並上傳本次版次原檔。</span></div></div> : null}
              {!locked && verifiableExistingFiles.length > 0 ? <div className="candidate-revision-existing-verification" aria-label="既有檔案驗證"><div><strong>可驗證已保存的非 primary 檔案，不用重新上傳。</strong><span>系統會逐檔核對內容完整性；原檔與編號都不會改變。</span></div><button className="primary-button" type="button" disabled={disabled || Boolean(busyKey)} onClick={() => void verifyExistingFiles(candidate)}><BadgeCheck size={16} />{busyKey === `verify:${candidate.id}` ? "驗證中..." : `驗證既有檔案（${verifiableExistingFiles.length}）`}</button></div> : null}
              {requiredEvidenceReady ? <div className="candidate-revision-readiness" role="status"><strong>主要 2D 圖面與 3D 模型已完成，可送審。</strong>{fileWarnings.length > 0 ? <span>審核提醒：尚未提供 {fileWarnings.join("、")}，但不阻擋送審。</span> : <span>建議格式均已提供。</span>}</div> : null}
              {!locked ? (
                <div className="candidate-revision-upload">
                  <FileDropzone
                    label="拖放或選擇首版圖面"
                    description="可一次選取多個 CAD、工程圖、PDF、DWG／DXF；系統會自動辨識檔案。"
                    multiple
                    selectedFiles={queuedFiles.map((item) => item.file)}
                    onFilesSelected={(files) => queueFiles(candidate, files)}
                    onClearSelected={() => setPendingFiles((current) => ({ ...current, [candidate.id]: [] }))}
                    disabled={disabled || Boolean(busyKey)}
                    variant="compact"
                  />
                  {queuedFiles.length > 0 ? <div className="candidate-revision-pending-files" aria-label="待上傳受控檔案">{queuedFiles.map((item) => <article key={item.id} data-upload-status={item.status}>
                    <div className="candidate-revision-pending-heading"><strong>{item.file.name}</strong><button className="icon-button" type="button" aria-label={`移除待上傳檔案 ${item.file.name}`} disabled={Boolean(busyKey)} onClick={() => removePendingFile(candidate.id, item.id)}><Trash2 size={14} /></button></div>
                    <div className="candidate-revision-pending-fields">
                      <label><span>顯示名稱</span><input value={item.displayName} disabled={Boolean(busyKey)} onChange={(event) => updatePendingFile(candidate.id, item.id, { displayName: event.target.value, status: "pending", error: "" })} /></label>
                      <label className="candidate-revision-description"><span>說明（選填）</span><input value={item.description} disabled={Boolean(busyKey)} onChange={(event) => updatePendingFile(candidate.id, item.id, { description: event.target.value, status: "pending", error: "" })} placeholder="例如：供製造審查的2D圖" /></label>
                    </div>
                    {item.status === "uploading" ? <span className="candidate-revision-upload-state">{currentUploadProgress?.phase === "uploading" ? "檔案傳輸中..." : "伺服器驗證中..."}</span> : null}
                    {item.error ? <span className="candidate-revision-upload-error">{item.error}</span> : null}
                  </article>)}</div> : null}
                  {currentUploadProgress ? <div className="candidate-revision-upload-progress" role="status" aria-live="polite">
                    <div className="candidate-revision-upload-progress-heading"><strong>正在處理第 {currentUploadProgress.completed + 1} / {currentUploadProgress.total} 個檔案</strong><span>{uploadProgressIndeterminate ? "傳輸中" : `${currentUploadPercent}%`}</span></div>
                    <div className="candidate-revision-upload-progress-bar" data-indeterminate={uploadProgressIndeterminate ? "true" : undefined} role="progressbar" aria-label="目前檔案上傳進度" aria-valuemin={0} aria-valuemax={currentUploadProgress.totalBytes} aria-valuenow={uploadProgressIndeterminate ? undefined : currentUploadProgress.bytesSent}><span style={{ width: uploadProgressIndeterminate ? "38%" : `${currentUploadPercent}%` }} /></div>
                    <div className="candidate-revision-upload-progress-detail"><LoaderCircle size={15} className="spin" /><strong>{currentUploadProgress.currentFileName}</strong><span>{currentUploadProgress.phase === "uploading" ? "檔案傳輸中..." : "檔案已送達，伺服器驗證中..."}</span></div>
                    <small>請等待目前檔案完成，不需要重複點擊或重新整理。</small>
                  </div> : null}
                  <button
                    className={verifiableExistingFiles.length > 0 || requiredEvidenceReady ? "secondary-button" : "primary-button"}
                    type="button"
                    data-primary-action={requiredEvidenceReady ? undefined : "complete-first-drawing"}
                    disabled={disabled || Boolean(busyKey) || queuedFiles.length === 0}
                    onClick={() => void upload(candidate)}
                  >{currentUploadProgress ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}{busyKey === `upload:${candidate.id}` ? "逐檔上傳中..." : requiredEvidenceReady ? "上傳受控檔案" : "上傳並完成驗證"}</button>
                </div>
              ) : null}
              {candidate.effectiveStatus === "ReviewApproved" ? <div className="candidate-revision-approved">研發版已核准（ReviewApproved）；實體 package 仍為 Pending。</div> : null}
            </article>
          );
        })}
      </div>
    </DrawingDetailSection>
  );
}
