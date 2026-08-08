"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, FilePlus2, Save, Trash2, UploadCloud } from "lucide-react";
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

type PendingCandidateFile = {
  id: string;
  file: File;
  role: CandidateFile["role"];
  displayName: string;
  description: string;
  isPrimary: boolean;
  idempotencyKey: string;
  status: "pending" | "uploading" | "failed";
  error: string;
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
  localDevelopmentEvidence?: boolean;
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

function fileRoleLabel(role: CandidateFile["role"]) {
  if (role === "cad_3d") return "3D 原檔";
  if (role === "drawing_2d") return "2D 工程原檔";
  if (role === "dwg_dxf") return "DWG／DXF";
  if (role === "pdf") return "PDF";
  if (role === "intermediate") return "中繼交換檔";
  return "其他檔案";
}

function recommendedFileWarnings(files: CandidateFile[]) {
  const roles = new Set(files.filter((file) => !file.removedAt).map((file) => file.role));
  const missing: string[] = [];
  if (!roles.has("pdf")) missing.push("PDF");
  if (!roles.has("dwg_dxf")) missing.push("DWG／DXF");
  if (!roles.has("cad_3d")) missing.push("3D 原檔");
  return missing;
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

  function queueFiles(candidate: CandidateRevision, files: File[]) {
    if (files.length === 0) return;
    setPendingFiles((current) => {
      const existing = current[candidate.id] ?? [];
      const fingerprints = new Set(existing.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const hasPrimary = candidate.files.some((file) => !file.removedAt && file.isPrimary)
        || existing.some((item) => item.isPrimary);
      let primaryAssigned = hasPrimary;
      const added = files.flatMap((file) => {
        const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
        if (fingerprints.has(fingerprint)) return [];
        fingerprints.add(fingerprint);
        const isPrimary = !primaryAssigned;
        primaryAssigned = true;
        return [{
          id: crypto.randomUUID(),
          file,
          role: fileRoleFor(file),
          displayName: file.name,
          description: "",
          isPrimary,
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

  function makePendingPrimary(candidateId: string, fileId: string) {
    setPendingFiles((current) => ({
      ...current,
      [candidateId]: (current[candidateId] ?? []).map((item) => ({ ...item, isPrimary: item.id === fileId }))
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
    for (const item of queue) {
      updatePendingFile(candidate.id, item.id, { status: "uploading", error: "" });
      const form = new FormData();
      form.set("file", item.file);
      form.set("role", item.role);
      form.set("isPrimary", String(item.isPrimary));
      form.set("expectedRowVersion", String(expectedRowVersion));
      form.set("displayName", item.displayName.trim() || item.file.name);
      form.set("description", item.description.trim());
      const response = await fetch(
        `/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/candidate-revisions/${encodeURIComponent(candidate.id)}/files`,
        { method: "POST", headers: { "Idempotency-Key": item.idempotencyKey }, body: form }
      );
      const body = await read(response);
      if (!response.ok || !body.workspace) {
        const message = errorMessage(response, body, "無法上傳候選首版檔案");
        updatePendingFile(candidate.id, item.id, { status: "failed", error: message });
        if (uploadedCount > 0) onWorkspaceChange(latestWorkspace);
        setBusyKey("");
        onError(`「${item.displayName || item.file.name}」尚未完成：${message}。已成功的檔案會保留，請修正後重試。`);
        return;
      }
      latestWorkspace = body.workspace;
      const latestCandidate = body.workspace.candidateRevisions.find((value) => value.id === candidate.id);
      expectedRowVersion = latestCandidate?.rowVersion ?? expectedRowVersion + 1;
      uploadedCount += 1;
      removePendingFile(candidate.id, item.id);
    }
    setBusyKey("");
    onWorkspaceChange(latestWorkspace);
    const latestCandidate = latestWorkspace.candidateRevisions.find((value) => value.id === candidate.id);
    const verifiedPrimary = latestCandidate?.files.some((file) => !file.removedAt && file.isPrimary && file.publicationEvidenceId);
    onNotice(verifiedPrimary
      ? `已完成 ${uploadedCount} 個受控檔案驗證；現在可送交審核，其他建議格式缺漏只會提醒審核者。`
      : `已加入 ${uploadedCount} 個檔案，但主要受控檔尚未完成驗證。請重新上傳驗證或移除失敗檔案。`);
  }

  async function verifyExistingFiles(candidate: CandidateRevision) {
    const files = candidate.files.filter((file) => !file.removedAt && !file.publicationEvidenceId);
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
    const verifiedPrimary = latestCandidate?.files.some((file) => !file.removedAt && file.isPrimary && file.publicationEvidenceId);
    onNotice(verifiedPrimary
      ? `已驗證 ${verifiedCount} 個既有檔案，不需重新上傳；現在可送交審核。`
      : `已驗證 ${verifiedCount} 個既有檔案；仍需指定或加入至少一個主要受控檔。`);
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
        <div><h3>首版圖面／版次檔案</h3></div>
      </div>
      <div className="candidate-revision-editor-list">
        {workspace.drawings.map((drawing) => {
          const candidate = candidateByDrawing.get(drawing.id);
          const drawingLabel = drawing.candidateCode === primaryDrawingCode ? `${drawing.purposeCode} 圖面` : drawing.candidateCode ?? "候選圖號尚未產生";
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
          const unverifiedFiles = activeFiles.filter((file) => !file.publicationEvidenceId);
          const suggestion = suggestedRevision(candidate);
          const locked = candidate.lifecycleStatus !== "draft";
          const revisionValue = revisionDrafts[candidate.id] ?? candidate.revision;
          const queuedFiles = pendingFiles[candidate.id] ?? [];
          const hasVerifiedPrimary = activeFiles.some((file) => file.isPrimary && file.publicationEvidenceId);
          const fileWarnings = recommendedFileWarnings(activeFiles);
          return (
            <article className="candidate-revision-card" key={candidate.id} data-candidate-status={candidate.lifecycleStatus}>
              <header><div><strong>{drawingLabel}</strong><span>建議版次 {suggestion} · {locked ? "審核內容已鎖定" : "候選草稿"}</span></div></header>
              <div className="candidate-revision-fields">
                <label><span>研發版次</span><input value={revisionValue} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setRevisionDrafts((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
                {revisionValue.trim() !== suggestion ? <label><span>調整原因</span><input value={overrideReasons[candidate.id] ?? ""} disabled={disabled || locked || Boolean(busyKey)} onChange={(event) => setOverrideReasons((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="說明為何不採用建議版次" /></label> : null}
                {!locked ? <button className="secondary-button" type="button" disabled={disabled || Boolean(busyKey)} onClick={() => void saveRevision(candidate)}><Save size={15} />{busyKey === `save:${candidate.id}` ? "儲存中..." : "儲存版次"}</button> : null}
              </div>
              {activeFiles.length > 0 ? <ul className="candidate-revision-files">{activeFiles.map((file) => <li key={file.id}><div><strong>{file.displayName}</strong><span>{fileRoleLabel(file.role)} · {file.isPrimary ? "主要受控檔" : "受控附件"} · {file.publicationEvidenceId ? "已完成驗證" : "需要先驗證，才能送審"}</span>{file.description ? <small>{file.description}</small> : null}</div>{!locked ? <button className="icon-button" type="button" aria-label={`移除 ${file.displayName}`} disabled={disabled || Boolean(busyKey)} onClick={() => void remove(candidate, file)}><Trash2 size={15} /></button> : null}</li>)}</ul> : <p className="candidate-revision-missing">下一步：加入至少一個主要受控檔；系統驗證完成後即可送審。</p>}
              {!locked && unverifiedFiles.length > 0 ? <div className="candidate-revision-existing-verification" aria-label="既有檔案驗證"><div><strong>先驗證已保存的檔案，不用重新上傳。</strong><span>系統會逐檔核對內容完整性；原檔與編號都不會改變。</span></div><button className="primary-button" type="button" disabled={disabled || Boolean(busyKey)} onClick={() => void verifyExistingFiles(candidate)}><BadgeCheck size={16} />{busyKey === `verify:${candidate.id}` ? "驗證中..." : `驗證既有檔案（${unverifiedFiles.length}）`}</button></div> : null}
              {hasVerifiedPrimary ? <div className="candidate-revision-readiness" role="status"><strong>主要受控檔已完成，可送審。</strong>{fileWarnings.length > 0 ? <span>審核提醒：尚未提供 {fileWarnings.join("、")}，但不阻擋送審。</span> : <span>建議格式均已提供。</span>}</div> : null}
              {!locked ? (
                <div className="candidate-revision-upload">
                  <FileDropzone
                    label="拖放或選擇首版圖面"
                    description="可一次選取多個 CAD、工程圖、PDF、DWG／DXF，並逐檔確認類別與說明。"
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
                      <label><span>檔案類別</span><select value={item.role} disabled={Boolean(busyKey)} onChange={(event) => updatePendingFile(candidate.id, item.id, { role: event.target.value as CandidateFile["role"], status: "pending", error: "" })}><option value="cad_3d">3D 原檔</option><option value="drawing_2d">2D 工程原檔</option><option value="dwg_dxf">DWG／DXF</option><option value="pdf">PDF</option><option value="intermediate">中繼交換檔</option><option value="other">其他檔案</option></select></label>
                      <label className="candidate-revision-primary-choice"><input type="radio" name={`candidate-primary-${candidate.id}`} checked={item.isPrimary} disabled={Boolean(busyKey)} onChange={() => makePendingPrimary(candidate.id, item.id)} /><span>設為這批主要受控檔</span></label>
                      <label className="candidate-revision-description"><span>說明（選填）</span><input value={item.description} disabled={Boolean(busyKey)} onChange={(event) => updatePendingFile(candidate.id, item.id, { description: event.target.value, status: "pending", error: "" })} placeholder="例如：供製造審查的2D圖" /></label>
                    </div>
                    {item.status === "uploading" ? <span className="candidate-revision-upload-state">正在驗證...</span> : null}
                    {item.error ? <span className="candidate-revision-upload-error">{item.error}</span> : null}
                  </article>)}</div> : null}
                  <button
                    className={unverifiedFiles.length > 0 || hasVerifiedPrimary ? "secondary-button" : "primary-button"}
                    type="button"
                    data-primary-action={hasVerifiedPrimary ? undefined : "complete-first-drawing"}
                    disabled={disabled || Boolean(busyKey) || queuedFiles.length === 0}
                    onClick={() => void upload(candidate)}
                  ><UploadCloud size={16} />{busyKey === `upload:${candidate.id}` ? "逐檔上傳中..." : hasVerifiedPrimary ? "上傳受控檔案" : "上傳並完成驗證"}</button>
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
