"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileArchive,
  FolderKanban,
  History,
  Link2,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
  UploadCloud,
  X
} from "lucide-react";
import { StatusScopeHelp } from "@/components/status-help-popover";
import type { TransferPackageWorkbench } from "@/lib/transfer-packages";
import type { ResolvedTransferPackageEntity, TransferPackageEntityType } from "@/lib/repositories/transfer-package-async-repository";

type WorkbenchContext = {
  mode: "unsaved";
  caseType: "development_case" | "design_change_case";
  sourceItem: ResolvedTransferPackageEntity | null;
  sourceRequested: boolean;
  sourceResolved: boolean;
};

type Props = {
  packageId?: string;
  sourceType?: string;
  sourceId?: string;
  sourceLabel?: string;
  initialCaseType?: string;
  initialSection?: string;
  initialBlocker?: string;
};

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "not_found" | "error";

type Phase1DReadiness = {
  ready: boolean;
  stale: boolean;
  snapshotHash: string;
  firstBlocker: null | { code: string; message: string; ownerRole: string; ownerModule: string; actionLabel: string; actionHref: string };
  blockers: Array<{ code: string; message: string; ownerRole: string; ownerModule: string; actionLabel: string; actionHref: string; workspaceId: string | null }>;
};

const caseOptions = [
  { value: "design_change_case", label: "設變案" },
  { value: "development_case", label: "開發案" }
] as const;

function newIdempotencyKey() {
  return `transfer-create:${crypto.randomUUID()}`;
}

export function TransferPackageWorkbenchShell(props: Props) {
  const router = useRouter();
  const createIdempotencyKey = useRef(newIdempotencyKey());
  const [state, setState] = useState<LoadState>("loading");
  const [context, setContext] = useState<WorkbenchContext | null>(null);
  const [workbench, setWorkbench] = useState<TransferPackageWorkbench | null>(null);
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState<"development_case" | "design_change_case">(
    props.initialCaseType === "development_case" ? "development_case" : "design_change_case"
  );
  const [caseReason, setCaseReason] = useState("");
  const [referenceStatus, setReferenceStatus] = useState<"provided" | "not_available">("not_available");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceReferenceReason, setSourceReferenceReason] = useState("");
  const [scopeType, setScopeType] = useState<TransferPackageEntityType>("drawing_number");
  const [scopeValue, setScopeValue] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [readiness, setReadiness] = useState<Phase1DReadiness | null>(null);
  const [actionPermissions, setActionPermissions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);

  useEffect(() => {
    if (!cancelOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setCancelOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, cancelOpen]);

  const syncHeader = useCallback((value: TransferPackageWorkbench) => {
    setTitle(value.title);
    setCaseType(value.caseType);
    setCaseReason(value.caseReason);
    setReferenceStatus(value.sourceReferenceStatus);
    setSourceReference(value.sourceReference ?? "");
    setSourceReferenceReason(value.sourceReferenceReason ?? "");
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    const url = props.packageId
      ? `/api/transfer-packages/${encodeURIComponent(props.packageId)}`
      : `/api/transfer-packages/workbench-context?${new URLSearchParams({
          ...(props.sourceType ? { sourceType: props.sourceType } : {}),
          ...(props.sourceId ? { sourceId: props.sourceId } : {}),
          ...(props.initialCaseType ? { caseType: props.initialCaseType } : {})
        }).toString()}`;
    const [response, permissionsResponse] = await Promise.all([
      fetch(url, { cache: "no-store" }),
      fetch("/api/numbering/permissions", { cache: "no-store" })
    ]);
    const body = await response.json().catch(() => ({}));
    const permissionsBody = await permissionsResponse.json().catch(() => ({}));
    setActionPermissions(permissionsResponse.ok && permissionsBody.actions ? permissionsBody.actions : {});
    if (response.status === 401) return setState("unauthorized");
    if (response.status === 403) return setState("forbidden");
    if (response.status === 404) return setState("not_found");
    if (!response.ok) {
      setError(body.message ?? "技轉包讀取失敗。");
      return setState("error");
    }
    if (props.packageId) {
      const next = body.workbench as TransferPackageWorkbench;
      setWorkbench(next);
      syncHeader(next);
      const readinessResponse = await fetch(`/api/transfer-packages/${encodeURIComponent(props.packageId)}/readiness-summary`, { cache: "no-store" });
      const readinessBody = await readinessResponse.json().catch(() => ({}));
      setReadiness(readinessResponse.ok ? readinessBody.readiness as Phase1DReadiness : null);
    } else {
      const next = body.context as WorkbenchContext;
      setContext(next);
      setCaseType(next.caseType);
      if (next.sourceItem) setTitle((current) => current || `${next.sourceItem?.entityCode ?? ""} 技術移轉`);
    }
    setState("ready");
  }, [props.initialCaseType, props.packageId, props.sourceId, props.sourceType, syncHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state !== "ready" || !props.initialSection) return;
    const target = document.getElementById(`transfer-section-${props.initialSection}`);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  }, [props.initialSection, state]);

  const terminal = workbench?.status === "Cancelled" || workbench?.status === "Published";
  const canCreate = actionPermissions["transfer.package.create"] === true;
  const canUpdate = actionPermissions["transfer.package.update"] === true;
  const canSubmit = actionPermissions["transfer.package.review.submit"] === true;
  const canWithdraw = actionPermissions["transfer.package.review.withdraw"] === true;
  const canPublish = actionPermissions["transfer.package.publish"] === true;
  const editable = Boolean(workbench && canUpdate && ["Draft", "NeedsInfo", "ReleaseFailed"].includes(workbench.status));
  const headerDirty = Boolean(
    workbench &&
      (title !== workbench.title ||
        caseType !== workbench.caseType ||
        caseReason !== workbench.caseReason ||
        referenceStatus !== workbench.sourceReferenceStatus ||
        sourceReference !== (workbench.sourceReference ?? "") ||
        sourceReferenceReason !== (workbench.sourceReferenceReason ?? ""))
  );
  const formValid = useMemo(
    () =>
      title.trim().length >= 2 &&
      caseReason.trim().length >= 3 &&
      (referenceStatus === "provided" ? sourceReference.trim().length > 0 : sourceReferenceReason.trim().length > 0),
    [caseReason, referenceStatus, sourceReference, sourceReferenceReason, title]
  );

  async function requestAction(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    action: string,
    idempotencyKey?: string
  ) {
    setBusy(action);
    setError("");
    setMessage("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(payload.error?.message ?? payload.message ?? "操作失敗，請重新整理後再試。");
      if (response.status === 409) await load();
      return null;
    }
    const next = payload.workbench as TransferPackageWorkbench;
    setWorkbench(next);
    syncHeader(next);
    return next;
  }

  async function createPackage() {
    if (!formValid || (context?.sourceRequested && !context.sourceResolved)) return;
    setBusy("create");
    setError("");
    const response = await fetch("/api/transfer-packages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey.current
      },
      body: JSON.stringify({
        title,
        caseType,
        caseReason,
        sourceReferenceStatus: referenceStatus,
        sourceReference,
        sourceReferenceReason,
        sourceType: context?.sourceItem?.entityType ?? props.sourceType,
        sourceId: context?.sourceItem?.entityId ?? props.sourceId
      })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? "技轉包建立失敗。");
      return;
    }
    const next = body.workbench as TransferPackageWorkbench;
    router.replace(`/transfer-packages/${encodeURIComponent(next.id)}?section=scope`);
  }

  async function saveHeader() {
    if (!workbench || !formValid) return;
    const next = await requestAction(`/api/transfer-packages/${encodeURIComponent(workbench.id)}`, "PATCH", {
      expectedRowVersion: workbench.rowVersion,
      title,
      caseType,
      caseReason,
      sourceReferenceStatus: referenceStatus,
      sourceReference,
      sourceReferenceReason
    }, "save");
    if (next) {
      setMessage("案件資料已儲存。");
      await load();
    }
  }

  async function addScope() {
    if (!workbench || !scopeValue.trim()) return;
    const next = await requestAction(`/api/transfer-packages/${encodeURIComponent(workbench.id)}/items`, "POST", {
      expectedRowVersion: workbench.rowVersion,
      entityType: scopeType,
      entityId: scopeValue
    }, "add-scope");
    if (next) {
      setScopeValue("");
      setMessage("案件範圍已更新。");
      await load();
    }
  }

  async function removeScope(itemId: string) {
    if (!workbench) return;
    const next = await requestAction(
      `/api/transfer-packages/${encodeURIComponent(workbench.id)}/items/${encodeURIComponent(itemId)}`,
      "DELETE",
      { expectedRowVersion: workbench.rowVersion },
      `remove:${itemId}`
    );
    if (next) {
      setMessage("已從案件範圍移除項目。");
      await load();
    }
  }

  async function addDraftWorkspace() {
    if (!workbench || !workspaceId.trim()) return;
    const next = await requestAction(`/api/transfer-packages/${encodeURIComponent(workbench.id)}/draft-items`, "POST", {
      expectedRowVersion: workbench.rowVersion,
      workspaceId: workspaceId.trim(),
      requiredness: "required",
      inclusionReason: "本次技術移轉必要草稿"
    }, "add-workspace", `transfer:add-workspace:${workbench.id}:v${workbench.rowVersion}:${workspaceId.trim()}`);
    if (next) {
      setWorkspaceId("");
      setMessage("草稿工作區已加入案件範圍。");
      await load();
    }
  }

  async function removeDraftWorkspace(itemId: string) {
    if (!workbench) return;
    const next = await requestAction(
      `/api/transfer-packages/${encodeURIComponent(workbench.id)}/draft-items/${encodeURIComponent(itemId)}`,
      "DELETE",
      { expectedRowVersion: workbench.rowVersion, reason: "移出本次技轉範圍" },
      `remove-workspace:${itemId}`,
      `transfer:remove-workspace:${workbench.id}:v${workbench.rowVersion}:${itemId}`
    );
    if (next) {
      setMessage("草稿工作區已移出案件範圍。");
      await load();
    }
  }

  async function lifecycleAction(action: "submit-review" | "withdraw-review" | "publish") {
    if (!workbench) return;
    setBusy(action);
    setError("");
    setMessage("");
    const response = await fetch(`/api/transfer-packages/${encodeURIComponent(workbench.id)}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `transfer:${action}:${workbench.id}:v${workbench.rowVersion}`
      },
      body: JSON.stringify({ expectedRowVersion: workbench.rowVersion, reason: "技術移轉整包審核" })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(payload.error?.message ?? payload.message ?? "技轉狀態更新失敗。");
      if (response.status === 409) await load();
      return;
    }
    setMessage(action === "submit-review" ? "技轉包已送審。" : action === "withdraw-review" ? "技轉包已撤回。" : "技轉包已發布。");
    await load();
  }

  async function cancelPackage() {
    if (!workbench || !cancelConfirmed || cancelReason.trim().length < 3) return;
    const next = await requestAction(`/api/transfer-packages/${encodeURIComponent(workbench.id)}/cancel`, "POST", {
      expectedRowVersion: workbench.rowVersion,
      reason: cancelReason
    }, "cancel");
    if (next) {
      setCancelOpen(false);
      setMessage("技轉包已取消並保留歷程。");
    }
  }

  if (state !== "ready") {
    return <WorkbenchState state={state} error={error} onRetry={load} />;
  }

  if (!props.packageId) {
    return (
      <main className="transfer-workbench" data-transfer-package-mode="unsaved">
        <WorkbenchTopbar title="建立技轉包" subtitle="先建立案件，再逐步補齊技轉資料。" />
        {error ? <InlineMessage kind="error" message={error} /> : null}
        {context?.sourceRequested && !context.sourceResolved ? (
          <InlineMessage kind="error" message="找不到帶入的來源圖料；請回編號搜尋重新選擇。" />
        ) : null}
        <section className="panel transfer-form-panel">
          <div className="panel-header">
            <div>
              <h2>案件資料</h2>
              <p>建立後才會保存；重新整理此頁不會產生空白技轉包。</p>
            </div>
            <span className="section-label">尚未儲存</span>
          </div>
          {context?.sourceItem ? <SourceSummary item={context.sourceItem} fallbackLabel={props.sourceLabel} /> : null}
          <HeaderFields
            title={title}
            setTitle={setTitle}
            caseType={caseType}
            setCaseType={setCaseType}
            caseReason={caseReason}
            setCaseReason={setCaseReason}
            referenceStatus={referenceStatus}
            setReferenceStatus={setReferenceStatus}
            sourceReference={sourceReference}
            setSourceReference={setSourceReference}
            sourceReferenceReason={sourceReferenceReason}
            setSourceReferenceReason={setSourceReferenceReason}
            disabled={Boolean(busy)}
          />
          <div className="transfer-primary-actions">
          <Link className="secondary-button" href="/numbering/search">回編號搜尋</Link>
            <button
              className="primary-button"
              type="button"
              disabled={!canCreate || !formValid || Boolean(busy) || Boolean(context?.sourceRequested && !context.sourceResolved)}
              title={canCreate ? "建立技轉包" : "目前帳號沒有建立技轉包權限"}
              onClick={() => void createPackage()}
            >
              {busy === "create" ? <Loader2 className="spin" size={16} /> : <PackagePlus size={16} />}
              建立技轉包
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!workbench) return <WorkbenchState state="error" error="技轉包資料不完整。" onRetry={load} />;

  return (
    <main className="transfer-workbench" data-transfer-package-mode="persistent" data-package-status={workbench.status}>
      <WorkbenchTopbar
        title={workbench.title}
        subtitle={`${workbench.packageCode} · ${caseLabel(workbench.caseType)}`}
        actions={
          <>
            <button className="secondary-button" type="button" onClick={() => void load()} disabled={Boolean(busy)} title="重新整理">
              <RefreshCw size={16} />
              重新整理
            </button>
            {editable ? (
              <button className="secondary-button danger-button" type="button" onClick={() => setCancelOpen(true)} disabled={Boolean(busy)}>
                <Ban size={16} />
                取消技轉包
              </button>
            ) : null}
          </>
        }
      />

      {error ? <InlineMessage kind="error" message={error} /> : null}
      {message ? <InlineMessage kind="success" message={message} /> : null}
      <NowWhat workbench={workbench} readiness={readiness} />

      <section className="transfer-summary-band" aria-label="技轉包摘要">
        <SummaryValue label="案件狀態" value={packageStatusLabel(workbench.status)} tone={terminal ? "neutral" : "active"} />
        <SummaryValue label="範圍" value={`${workbench.items.length + workbench.draftItems.length} 項`} />
        <SummaryValue label="必要阻擋" value={`${readiness?.blockers.length ?? workbench.blockers.filter((item) => item.severity === "required").length} 項`} />
        <SummaryValue label="資料版本" value={`v${workbench.rowVersion}`} />
      </section>

      <section id="transfer-section-header" tabIndex={-1} className="panel transfer-form-panel">
        <div className="panel-header">
          <div>
            <h2>案件資料</h2>
            <p>案件名稱、類型、原因與來源依據。</p>
          </div>
          {editable ? (
            <button className="primary-button" type="button" disabled={!headerDirty || !formValid || Boolean(busy)} onClick={() => void saveHeader()}>
              {busy === "save" ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              儲存
            </button>
          ) : null}
        </div>
        <HeaderFields
          title={title}
          setTitle={setTitle}
          caseType={caseType}
          setCaseType={setCaseType}
          caseReason={caseReason}
          setCaseReason={setCaseReason}
          referenceStatus={referenceStatus}
          setReferenceStatus={setReferenceStatus}
          sourceReference={sourceReference}
          setSourceReference={setSourceReference}
          sourceReferenceReason={sourceReferenceReason}
          setSourceReferenceReason={setSourceReferenceReason}
          disabled={!editable || Boolean(busy)}
        />
      </section>

      <section id="transfer-section-scope" tabIndex={-1} className="panel">
        <div className="panel-header">
          <div>
            <h2>案件範圍</h2>
            <p>本次技轉直接受影響的正式圖料與草稿工作區。</p>
          </div>
          <span className="section-label">{workbench.items.length + workbench.draftItems.length} 項</span>
        </div>
        {editable ? (
          <div className="transfer-scope-add">
            <label>
              <span>類型</span>
              <select value={scopeType} onChange={(event) => setScopeType(event.target.value as TransferPackageEntityType)} disabled={Boolean(busy)}>
                <option value="drawing_number">圖號</option>
                <option value="part_number">料號</option>
              </select>
            </label>
            <label>
              <span>{scopeType === "drawing_number" ? "圖號" : "料號"}</span>
              <input value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder="輸入完整編號" disabled={Boolean(busy)} />
            </label>
            <button className="primary-button" type="button" disabled={!scopeValue.trim() || Boolean(busy)} onClick={() => void addScope()}>
              {busy === "add-scope" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              加入範圍
            </button>
          </div>
        ) : null}
        {editable ? (
          <div className="transfer-scope-add">
            <label className="transfer-field-wide">
              <span>草稿工作區 ID</span>
              <input
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder="貼上完整 workspace ID"
                disabled={Boolean(busy)}
              />
            </label>
            <button className="secondary-button" type="button" disabled={!workspaceId.trim() || Boolean(busy)} onClick={() => void addDraftWorkspace()}>
              {busy === "add-workspace" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
              加入草稿
            </button>
          </div>
        ) : null}
        {workbench.items.length ? (
          <div className="table-wrap">
            <table className="transfer-scope-table">
              <thead>
                <tr><th>類型</th><th>編號</th><th>名稱／圖料根號</th><th>主檔狀態</th><th aria-label="操作" /></tr>
              </thead>
              <tbody>
                {workbench.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.entityType === "drawing_number" ? "圖號" : "料號"}</td>
                    <td><strong>{item.entityCode}</strong></td>
                    <td>{item.displayLabel}<small>{item.rootCode ? `圖料根號 ${item.rootCode}` : ""}</small></td>
                    <td>{item.recordStatus ?? "-"}</td>
                    <td>
                      {editable ? (
                        <button className="icon-button" type="button" title="移除範圍項目" aria-label={`移除 ${item.entityCode}`} disabled={Boolean(busy)} onClick={() => void removeScope(item.id)}>
                          {busy === `remove:${item.id}` ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : workbench.draftItems.length === 0 ? (
          <div className="empty transfer-empty"><Boxes size={22} /><h3>尚未加入案件範圍</h3><p>先加入本次受影響的圖號或料號。</p></div>
        ) : null}
        {workbench.draftItems.length ? (
          <div className="table-wrap">
            <table className="transfer-scope-table">
              <thead><tr><th>類型</th><th>工作區</th><th>必要性</th><th>草稿狀態</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {workbench.draftItems.map((item) => (
                  <tr key={item.id}>
                    <td>草稿</td>
                    <td><strong>{item.workspaceId}</strong><small>加入時 v{item.capturedWorkspaceVersion} · 目前 v{item.workspaceVersion}</small></td>
                    <td>{item.requiredness === "required" ? "必要" : "選用"}</td>
                    <td>{item.workspaceLifecycle === "published" ? "已發布" : item.workspaceLifecycle === "cancelled" ? "已取消" : "準備中"}</td>
                    <td>{editable ? (
                      <button className="icon-button" type="button" title="移除草稿工作區" aria-label={`移除 ${item.workspaceId}`} disabled={Boolean(busy)} onClick={() => void removeDraftWorkspace(item.id)}>
                        {busy === `remove-workspace:${item.id}` ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    ) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section id="transfer-section-review" tabIndex={-1} className="panel">
        <div className="panel-header">
          <div><h2>審核與發布</h2><p>審核只鎖定快照；正式號碼需另行明確發布。</p></div>
          {readiness ? <span className="section-label">{readiness.ready ? "可執行下一步" : `${readiness.blockers.length} 項阻擋`}</span> : null}
        </div>
        {readiness?.firstBlocker ? (
          <div className="transfer-blocker">
            <AlertTriangle size={18} />
            <div><strong>{readiness.firstBlocker.message}</strong><p>{readiness.firstBlocker.ownerRole} · {readiness.firstBlocker.ownerModule}</p></div>
            <Link className="secondary-button" href={readiness.firstBlocker.actionHref}>{readiness.firstBlocker.actionLabel}<ChevronRight size={16} /></Link>
          </div>
        ) : null}
        <div className="transfer-primary-actions">
          {["Draft", "NeedsInfo"].includes(workbench.status) ? (
            <button className="primary-button" type="button" title={canSubmit ? "送交整包審核" : "目前帳號沒有送審權限"} disabled={!canSubmit || !readiness?.ready || Boolean(busy)} onClick={() => void lifecycleAction("submit-review")}>
              {busy === "submit-review" ? <Loader2 className="spin" size={16} /> : <Send size={16} />}送交整包審核
            </button>
          ) : null}
          {workbench.status === "InReview" ? <>
            <Link className="primary-button" href={`/approvals?requestId=${encodeURIComponent(workbench.reviewRequestId ?? "")}`}>前往審核工作台</Link>
            <button className="secondary-button" type="button" title={canWithdraw ? "撤回審核" : "目前帳號沒有撤回權限"} disabled={!canWithdraw || Boolean(busy)} onClick={() => void lifecycleAction("withdraw-review")}>
              {busy === "withdraw-review" ? <Loader2 className="spin" size={16} /> : <Undo2 size={16} />}撤回審核
            </button>
          </> : null}
          {["ReleaseFailed", "ApprovedPendingPublish"].includes(workbench.status) && readiness?.stale ? (
            <button className="primary-button" type="button" title={canSubmit ? "重建快照並重新送審" : "目前帳號沒有送審權限"} disabled={!canSubmit || readiness.blockers.some((item) => item.code !== "approval_snapshot_stale") || Boolean(busy)} onClick={() => void lifecycleAction("submit-review")}>
              {busy === "submit-review" ? <Loader2 className="spin" size={16} /> : <Send size={16} />}重建快照並重新送審
            </button>
          ) : null}
          {(workbench.status === "ApprovedPendingPublish" && !readiness?.stale) || (workbench.status === "ReleaseFailed" && !readiness?.stale) ? (
            <button className="primary-button" type="button" title={canPublish ? "發布整包" : "目前帳號沒有發布權限"} disabled={!canPublish || !readiness?.ready || readiness.stale || Boolean(busy)} onClick={() => void lifecycleAction("publish")}>
              {busy === "publish" ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}{workbench.status === "ReleaseFailed" ? "重試整包發布" : "發布整包"}
            </button>
          ) : null}
          {workbench.status === "Published" ? <Link className="primary-button" href="/technical-transfer?tab=published">查看正式交接</Link> : null}
        </div>
      </section>

      <section id="transfer-section-modules" tabIndex={-1} className="panel">
        <div className="panel-header"><div><h2>功能模組狀態</h2><p>資料仍由所屬功能模組維護；這裡只呈現狀態與入口。</p></div></div>
        <div className="transfer-adapter-list">
          {workbench.adapters.map((adapter) => (
            <article key={adapter.id} className="transfer-adapter-item" data-adapter-status={adapter.status}>
              <div className="transfer-adapter-icon">{adapterIcon(adapter.id)}</div>
              <div><div className="transfer-adapter-heading"><h3>{adapter.label}</h3><StatusPill status={adapter.status} /></div><p>{adapter.message}</p><small>{adapter.ownerModule}</small></div>
              {adapter.actionHref && adapter.actionLabel ? <Link className="secondary-button" href={adapter.actionHref}>{adapter.actionLabel}<ChevronRight size={16} /></Link> : null}
            </article>
          ))}
        </div>
      </section>

      <section id="transfer-section-blockers" tabIndex={-1} className="panel">
        <div className="panel-header"><div><h2>阻擋與下一步</h2><p>依負責角色與功能模組整理。</p></div></div>
        <div className="transfer-blocker-list">
          {workbench.blockers.length ? workbench.blockers.map((blocker) => (
            <div key={blocker.id} className={`transfer-blocker ${props.initialBlocker === blocker.id ? "focused" : ""}`}>
              <AlertTriangle size={18} />
              <div><strong>{blocker.message}</strong><p>{blocker.ownerRole} · {blocker.ownerModule}</p></div>
              <Link className="secondary-button" href={blocker.actionHref}>{blocker.actionLabel}<ChevronRight size={16} /></Link>
            </div>
          )) : <div className="empty"><CheckCircle2 size={22} /><h3>目前沒有阻擋</h3><p>此狀態不代表可送審；正式能力仍依階段開放。</p></div>}
        </div>
      </section>

      <section id="transfer-section-history" tabIndex={-1} className="panel">
        <div className="panel-header"><div><h2>異動紀錄</h2><p>技轉包事件採追加保存。</p></div><History size={18} /></div>
        <ol className="transfer-history-list">
          {workbench.events.map((event) => <li key={event.id}><span>{eventLabel(event.eventType)}</span><time>{formatDate(event.createdAt)}</time></li>)}
        </ol>
      </section>

      {cancelOpen ? (
        <div className="transfer-modal-backdrop" role="presentation">
          <div className="transfer-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-transfer-title">
            <div className="transfer-modal-header"><div><h2 id="cancel-transfer-title">取消技轉包</h2><p>取消後不可重新開啟，既有範圍與歷程仍會保留。</p></div><button className="icon-button" type="button" title="關閉" onClick={() => setCancelOpen(false)}><X size={18} /></button></div>
            <label className="transfer-field"><span>取消原因</span><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} autoFocus /></label>
            <label className="transfer-confirm"><input type="checkbox" checked={cancelConfirmed} onChange={(event) => setCancelConfirmed(event.target.checked)} /><span>我確認停止此技轉包；後續若需繼續，必須建立新的技轉包。</span></label>
            <div className="transfer-modal-actions"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => setCancelOpen(false)}>返回</button><button className="danger-button" type="button" disabled={!cancelConfirmed || cancelReason.trim().length < 3 || Boolean(busy)} onClick={() => void cancelPackage()}>{busy === "cancel" ? <Loader2 className="spin" size={16} /> : <Ban size={16} />}確認取消</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function WorkbenchTopbar({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="topbar transfer-topbar"><div><h1>{title} <StatusScopeHelp scope="transferPackageWorkbench" /></h1><p>{subtitle}</p></div><div className="transfer-topbar-actions">{actions}<Link className="secondary-button" href="/handoff"><ClipboardList size={16} />回技術移轉</Link></div></div>;
}

function HeaderFields(props: {
  title: string; setTitle: (value: string) => void;
  caseType: "development_case" | "design_change_case"; setCaseType: (value: "development_case" | "design_change_case") => void;
  caseReason: string; setCaseReason: (value: string) => void;
  referenceStatus: "provided" | "not_available"; setReferenceStatus: (value: "provided" | "not_available") => void;
  sourceReference: string; setSourceReference: (value: string) => void;
  sourceReferenceReason: string; setSourceReferenceReason: (value: string) => void;
  disabled: boolean;
}) {
  return <div className="transfer-form-grid">
    <label className="transfer-field transfer-field-wide"><span>技轉包名稱</span><input value={props.title} onChange={(event) => props.setTitle(event.target.value)} maxLength={120} disabled={props.disabled} /></label>
    <fieldset className="transfer-field transfer-case-field" disabled={props.disabled}><legend>案件類型</legend><div className="transfer-segmented">{caseOptions.map((option) => <button key={option.value} type="button" className={props.caseType === option.value ? "selected" : ""} aria-pressed={props.caseType === option.value} onClick={() => props.setCaseType(option.value)}>{option.label}</button>)}</div></fieldset>
    <label className="transfer-field transfer-field-wide"><span>案件或變更原因</span><textarea value={props.caseReason} onChange={(event) => props.setCaseReason(event.target.value)} rows={3} maxLength={2000} disabled={props.disabled} /></label>
    <fieldset className="transfer-field transfer-field-wide" disabled={props.disabled}><legend>來源依據</legend><div className="transfer-segmented"><button type="button" className={props.referenceStatus === "provided" ? "selected" : ""} aria-pressed={props.referenceStatus === "provided"} onClick={() => props.setReferenceStatus("provided")}>有專案／ECR／ECO</button><button type="button" className={props.referenceStatus === "not_available" ? "selected" : ""} aria-pressed={props.referenceStatus === "not_available"} onClick={() => props.setReferenceStatus("not_available")}>沒有可用編號</button></div></fieldset>
    {props.referenceStatus === "provided" ? <label className="transfer-field transfer-field-wide"><span>來源編號</span><input value={props.sourceReference} onChange={(event) => props.setSourceReference(event.target.value)} maxLength={300} disabled={props.disabled} /></label> : <label className="transfer-field transfer-field-wide"><span>無來源編號原因</span><input value={props.sourceReferenceReason} onChange={(event) => props.setSourceReferenceReason(event.target.value)} maxLength={500} disabled={props.disabled} /></label>}
  </div>;
}

function SourceSummary({ item, fallbackLabel }: { item: ResolvedTransferPackageEntity; fallbackLabel?: string }) {
  return <div className="transfer-source-summary"><Link2 size={17} /><div><span>帶入來源</span><strong>{item.entityCode} · {fallbackLabel || item.displayLabel}</strong><small>{item.entityType === "drawing_number" ? "圖號" : "料號"}{item.rootCode ? ` · 圖料根號 ${item.rootCode}` : ""}</small></div></div>;
}

function NowWhat({ workbench, readiness }: { workbench: TransferPackageWorkbench; readiness: Phase1DReadiness | null }) {
  if (workbench.status === "Cancelled") return <div className="transfer-now-what neutral"><Ban size={20} /><div><strong>此技轉包已取消，不會再進入送審。</strong><p>資料與異動紀錄已保留；需要繼續時請建立新技轉包。</p></div><Link className="secondary-button" href="/transfer-packages/new">建立新技轉包</Link></div>;
  if (workbench.status === "Published") return <div className="transfer-now-what"><CheckCircle2 size={20} /><div><strong>技轉包已發布，可供製造與採購交接使用。</strong><p>交接資料只包含已發布編號與受控內容。</p></div><Link className="primary-button" href="/technical-transfer?tab=published">查看交接</Link></div>;
  if (workbench.status === "InReview") return <div className="transfer-now-what"><ClipboardList size={20} /><div><strong>技轉包審核中，案件範圍與編號已鎖定。</strong><p>審核決定請在審核工作台完成；核准不會自動發布。</p></div><Link className="primary-button" href={`/approvals?requestId=${encodeURIComponent(workbench.reviewRequestId ?? "")}`}>查看審核</Link></div>;
  if (workbench.status === "ApprovedPendingPublish") return <div className="transfer-now-what"><CheckCircle2 size={20} /><div><strong>整包已核准，仍需明確執行發布。</strong><p>發布前會重新驗證快照、檔案證據與所有編號。</p></div><Link className="primary-button" href={`/transfer-packages/${encodeURIComponent(workbench.id)}?section=review`}>執行發布</Link></div>;
  if (!workbench.items.length && !workbench.draftItems.length) return <div className="transfer-now-what warning"><AlertTriangle size={20} /><div><strong>下一步：加入圖料或草稿工作區。</strong><p>沒有案件範圍時，後續資料無法歸屬。</p></div><Link className="primary-button" href={`/transfer-packages/${encodeURIComponent(workbench.id)}?section=scope`}>加入案件範圍</Link></div>;
  if (readiness?.firstBlocker) return <div className="transfer-now-what warning"><AlertTriangle size={20} /><div><strong>{readiness.firstBlocker.message}</strong><p>{readiness.firstBlocker.ownerRole} · {readiness.firstBlocker.ownerModule}</p></div><Link className="primary-button" href={readiness.firstBlocker.actionHref}>{readiness.firstBlocker.actionLabel}</Link></div>;
  return <div className="transfer-now-what"><CheckCircle2 size={20} /><div><strong>技轉包已準備完成，可送交整包審核。</strong><p>核准後仍需另行發布。</p></div><Link className="primary-button" href={`/transfer-packages/${encodeURIComponent(workbench.id)}?section=review`}>前往送審</Link></div>;
}

function InlineMessage({ kind, message }: { kind: "error" | "success"; message: string }) {
  return <div className={`transfer-inline-message ${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "error" ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}<span>{message}</span></div>;
}

function SummaryValue({ label, value, tone }: { label: string; value: string; tone?: "active" | "neutral" }) {
  return <div><span>{label}</span><strong data-tone={tone}>{value}</strong></div>;
}

function StatusPill({ status }: { status: TransferPackageWorkbench["adapters"][number]["status"] }) {
  const labels = { not_started: "待處理", blocked: "有阻擋", ready: "已有資料", not_applicable: "不適用", unavailable: "尚未開放" };
  return <span className={`transfer-status-pill ${status}`}>{labels[status]}</span>;
}

function WorkbenchState({ state, error, onRetry }: { state: LoadState; error: string; onRetry: () => Promise<void> }) {
  if (state === "loading") return <section className="panel transfer-state"><Loader2 className="spin" size={22} /><h1>讀取技轉包</h1><p>正在取得案件資料。</p></section>;
  if (state === "unauthorized") return <section className="panel transfer-state"><ShieldAlert size={22} /><h1>請先登入</h1><p>登入後才能建立或查看技轉包。</p><Link className="primary-button" href="/login">前往登入</Link></section>;
  if (state === "forbidden") return <section className="panel transfer-state"><ShieldAlert size={22} /><h1>無法存取技轉包</h1><p>目前帳號沒有此公司或 RD 技轉權限。</p><Link className="secondary-button" href="/handoff">回技術移轉</Link></section>;
  if (state === "not_found") return <section className="panel transfer-state"><FolderKanban size={22} /><h1>找不到技轉包</h1><p>資料可能已變更，請回技術移轉重新進入。</p><Link className="primary-button" href="/handoff">回技術移轉</Link></section>;
  return <section className="panel transfer-state"><AlertTriangle size={22} /><h1>技轉包讀取失敗</h1><p>{error || "請稍後重試。"}</p><button className="secondary-button" type="button" onClick={() => void onRetry()}><RefreshCw size={16} />重試</button></section>;
}

function adapterIcon(id: TransferPackageWorkbench["adapters"][number]["id"]) {
  if (id === "intake") return <FileArchive size={19} />;
  if (id === "drawing_part") return <Boxes size={19} />;
  if (id === "attachments") return <Link2 size={19} />;
  return <ShieldAlert size={19} />;
}

function caseLabel(value: "development_case" | "design_change_case") {
  return value === "development_case" ? "開發案" : "設變案";
}

function packageStatusLabel(value: TransferPackageWorkbench["status"]) {
  const labels: Record<TransferPackageWorkbench["status"], string> = {
    Draft: "草稿",
    InReview: "審核中",
    NeedsInfo: "待補資料",
    ApprovedPendingPublish: "已核准，待發布",
    Publishing: "發布中",
    Published: "已發布",
    ReleaseFailed: "發布失敗",
    Cancelled: "已取消"
  };
  return labels[value];
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    DraftCreated: "建立技轉包", HeaderUpdated: "更新案件資料",
    ScopeItemAdded: "加入發布範圍", ScopeItemRemoved: "移除發布範圍",
    DraftWorkspaceAdded: "加入草稿工作區", DraftWorkspaceRemoved: "移除草稿工作區",
    ReviewSubmitted: "送交整包審核", ReviewWithdrawn: "撤回整包審核",
    ReviewDecided: "完成整包審核", SnapshotInvalidated: "審核快照失效",
    PackagePublished: "發布技轉包", ReleaseFailed: "整包發布失敗",
    PackageCancelled: "取消技轉包"
  };
  return labels[value] ?? value;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}
