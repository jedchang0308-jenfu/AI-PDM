"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, FileText, LockKeyhole, RefreshCcw, Save } from "lucide-react";
import { NumberingCandidateRevisionEditor } from "@/components/numbering-candidate-revision-editor";
import { PdmEditPageFrame } from "@/components/pdm-edit-page-frame";
import { WorkspaceEditForm, type NumberingDraftWorkspace } from "@/components/number-state-workspace";
import { normalizePdmCandidateReturnTo } from "@/lib/pdm-review-navigation";
import { projectNumberLifecycleUserView } from "@/lib/number-lifecycle-user-view";

type EditorIntent = "edit" | "submit_review" | "withdraw_review" | "cancel" | "recovery" | "view";

function apiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
}

export function NumberingWorkspaceEditor({ workspaceId, intent = "view", returnTo }: { workspaceId: string; intent?: string; returnTo?: string | null }) {
  const [workspace, setWorkspace] = useState<NumberingDraftWorkspace | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "restricted" | "not_found" | "conflict" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [revisionDirty, setRevisionDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const safeReturnTo = normalizePdmCandidateReturnTo(returnTo);
  const normalizedIntent = (['edit', 'submit_review', 'withdraw_review', 'cancel', 'recovery', 'view'] as const).includes(intent as EditorIntent) ? intent as EditorIntent : "view";
  const canEdit = normalizedIntent === "edit" || normalizedIntent === "submit_review" || normalizedIntent === "recovery";
  const canSubmit = normalizedIntent === "edit" || normalizedIntent === "submit_review";
  const canWithdraw = normalizedIntent === "withdraw_review";
  const canCancel = normalizedIntent === "cancel";

  const load = useCallback(async () => {
    setStatus("loading"); setError("");
    try {
      const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 404) { setStatus("not_found"); return; }
      if (response.status === 403) { setStatus("restricted"); return; }
      if (!response.ok) throw new Error(apiError(body, "編號工作區目前無法載入。"));
      setWorkspace((body as { workspace: NumberingDraftWorkspace }).workspace);
      setFormDirty(false); setRevisionDirty(false);
      setStatus("ready");
    } catch (caught) {
      setStatus("error"); setError(caught instanceof Error ? caught.message : "編號工作區目前無法載入。");
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function save(payload: Record<string, unknown>) {
    if (!workspace || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, expectedRowVersion: workspace.rowVersion }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, "編號資料尚未儲存。"));
      setWorkspace((body as { workspace: NumberingDraftWorkspace }).workspace); setFormDirty(false); setNotice("資料已儲存。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "編號資料尚未儲存。"); }
    finally { setBusy(false); }
  }

  async function action(kind: "submit" | "withdraw" | "cancel" | "publish") {
    if (!workspace || busy) return;
    setBusy(true); setError("");
    const lifecycleV2 = Boolean(workspace.lifecycleV2);
    const endpoint = kind === "submit" ? lifecycleV2 ? "submit-bundle-review" : "submit-review" : kind === "withdraw" ? lifecycleV2 ? "withdraw-bundle-review" : "withdraw-review" : kind;
    const body = kind === "cancel"
      ? { expectedRowVersion: workspace.rowVersion, reason: "由完整編號工作區執行" }
      : lifecycleV2
        ? { expectedWorkspaceRowVersion: workspace.rowVersion, reason: "由完整編號工作區執行" }
        : { expectedRowVersion: workspace.rowVersion, reason: "由完整編號工作區執行" };
    try {
      const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": `pdm-workspace:${workspace.id}:${kind}:${crypto.randomUUID()}` }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(result, "工作區操作尚未完成。"));
      setNotice(kind === "submit" ? "已送交審核。" : kind === "cancel" ? "已取消此申請。" : "操作已完成。");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "工作區操作尚未完成。"); }
    finally { setBusy(false); }
  }

  const title = workspace?.root?.coreName ?? workspace?.drawings[0]?.candidateCode ?? workspaceId;
  const lifecycle = workspace?.lifecycleV2 ? projectNumberLifecycleUserView(workspace.lifecycleV2) : null;
  const canSubmitAction = canSubmit && Boolean(workspace?.capabilities.canSubmitReview);
  const canPublishAction = canSubmit && Boolean(workspace?.capabilities.canPublish);
  const canWithdrawAction = canWithdraw && Boolean(workspace?.capabilities.canWithdrawReview);
  const canCancelAction = canCancel && Boolean(workspace?.capabilities.canCancel);
  const requestId = workspace?.latestApproval?.requestId ?? workspace?.candidateRevisions.find((item) => item.approvalRequestId)?.approvalRequestId ?? null;
  const seriesCodes = useMemo(() => Array.from(new Set(workspace?.parts.map((part) => part.seriesCode).filter((value): value is string => Boolean(value)) ?? [])), [workspace]);
  return (
    <PdmEditPageFrame returnHref={safeReturnTo} eyebrow="編號工作區" title={title} subtitle={workspace ? `${workspace.parts.length} 個料號 · ${workspace.drawings.length} 張圖號` : ""} status={status} notice={notice} error={error} isDirty={canEdit && (formDirty || revisionDirty)} onRetry={() => void load()} actionDock={workspace && status === "ready" ? <>
      <button className="secondary-button" type="button" onClick={() => void load()} disabled={busy}><RefreshCcw size={15} />重新整理</button>
      {canSubmitAction ? <button className="primary-button" type="button" onClick={() => void action("submit")} disabled={busy}><LockKeyhole size={15} />送交審核</button> : null}
      {!canSubmitAction && canPublishAction ? <button className="primary-button" type="button" onClick={() => void action("publish")} disabled={busy}><Check size={15} />發布</button> : null}
      {canWithdrawAction ? <button className="secondary-button" type="button" onClick={() => void action("withdraw")} disabled={busy}>撤回審核</button> : null}
      {canCancelAction ? <button className="danger-button" type="button" onClick={() => void action("cancel")} disabled={busy}>取消申請</button> : null}
    </> : null}>
      {workspace ? <>
        <section className="pdm-edit-page-card"><div className="pdm-edit-page-card-heading"><div><span className="eyebrow">目前狀態</span><h2>{lifecycle?.stage ?? workspace.projection.lifecycle}</h2></div>{requestId ? <span>審核案件 {requestId}</span> : null}</div><p>{workspace.projection.nowWhat.label}</p></section>
        {canEdit ? <WorkspaceEditForm workspace={workspace} busy={busy} seriesCodeOptions={seriesCodes} onCancel={() => setFormDirty(false)} onDirtyChange={setFormDirty} onSave={(payload) => void save(payload)} /> : null}
        {canEdit && workspace.lifecycleV2 ? <NumberingCandidateRevisionEditor workspace={workspace as never} primaryDrawingCode={workspace.drawings[0]?.candidateCode ?? null} disabled={busy} onWorkspaceChange={(next) => setWorkspace(next as unknown as NumberingDraftWorkspace)} onError={setError} onNotice={setNotice} onDirtyChange={setRevisionDirty} /> : null}
        <section className="pdm-edit-page-card"><h2>圖料摘要</h2><ul>{workspace.parts.map((part) => <li key={part.id}>{part.candidateCode ?? "尚未產生料號"} · {part.partName}</li>)}{workspace.drawings.map((drawing) => <li key={drawing.id}>{drawing.candidateCode ?? "尚未產生圖號"} · {drawing.purposeDescription || drawing.purposeCode}</li>)}</ul></section>
      </> : null}
    </PdmEditPageFrame>
  );
}
