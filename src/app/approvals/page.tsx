"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { StatusScopeHelp } from "@/components/status-help-popover";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type ApprovalStatus = "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
type ApprovalDecision = "approved" | "rejected" | "needs_info";

type ApprovalInboxItem = {
  id: string;
  source: string;
  companyId: string;
  actionCode: string;
  actionTitle: string;
  domainCode: string;
  title: string;
  status: ApprovalStatus;
  reason: string;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string;
  packageId: string | null;
  packageCode: string | null;
  packageStatus: string | null;
  targetSummary: string;
  impactSummary: string | null;
  legacy: { table: string; id: string } | null;
};

type ApprovalDetail = ApprovalInboxItem & {
  payload: Record<string, unknown>;
  targets: Array<{
    id: string;
    role: "primary" | "child" | "impact";
    type: string;
    targetId: string;
    code: string | null;
    label: string;
    status: string | null;
    snapshot: Record<string, unknown>;
  }>;
  impactSnapshots: Array<{
    id: string;
    snapshotHash: string;
    snapshot: Record<string, unknown>;
    capturedBy: string;
    capturedAt: string;
  }>;
  decisions: Array<{
    id: string;
    approverRole: string;
    approverId: string;
    approverName: string | null;
    decision: ApprovalDecision;
    comment: string | null;
    decidedAt: string;
  }>;
  applyStatus: string | null;
  applyAttempts: number | null;
  applyError: string | null;
};

type InboxResponse = {
  summary?: { total: number; pending: number; needsInfo: number; applyFailed: number };
  items?: ApprovalInboxItem[];
  error?: string;
};

const statusFilters = [
  { value: "active", label: "待處理" },
  { value: "pending", label: "待審" },
  { value: "needs_info", label: "補資料" },
  { value: "apply_failed", label: "套用失敗" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已駁回" },
  { value: "all", label: "全部" }
] as const;

const domainFilters = [
  { value: "all", label: "全部領域" },
  { value: "numbering", label: "圖料" },
  { value: "bom", label: "BOM" },
  { value: "submission", label: "送審" },
  { value: "part_cost", label: "成本" },
  { value: "drawing_package", label: "圖面包" },
  { value: "platform", label: "平台" }
] as const;

const actionFilters = [
  { value: "all", label: "全部類型" },
  { value: "numbering.release", label: "發行審核" },
  { value: "numbering.release_missing_ma_confirm", label: "發行缺製造圖確認" },
  { value: "numbering.dvt_promotion", label: "DVT 升階審核" },
  { value: "numbering.same_drawing_variant_after_release", label: "同圖多料號審核" },
  { value: "numbering.drawing_revision_impact_review", label: "圖面進版影響審核" },
  { value: "numbering.dvt_missing_ma_override", label: "DVT 缺製造圖例外" },
  { value: "numbering.main_drawing_restore", label: "主圖恢復審核" },
  { value: "numbering.candidate_bundle_review", label: "候選圖料與首版整包審核" },
  { value: "numbering.obsolete_part_number", label: "料號作廢審核" },
  { value: "numbering.obsolete_ma_drawing", label: "圖號作廢審核" },
  { value: "numbering.obsolete_part_root", label: "主根作廢審核" },
  { value: "submission.obsolete", label: "送審單作廢審核" },
  { value: "bom.release_review", label: "BOM 發行審核" },
  { value: "bom.obsolete_review", label: "BOM 作廢審核" },
  { value: "part_cost.change_review", label: "料號成本異動審核" },
  { value: "drawing_package.supplement_review", label: "圖面補件審核" }
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];
type DomainFilter = (typeof domainFilters)[number]["value"];
type ActionFilter = (typeof actionFilters)[number]["value"];

const statusText: Record<ApprovalStatus, string> = {
  pending: "待審",
  approved: "已核准",
  rejected: "已駁回",
  needs_info: "待補資料",
  cancelled: "已取消",
  apply_failed: "套用失敗",
  applied: "已套用"
};

const domainText: Record<string, string> = {
  platform: "平台",
  numbering: "圖料",
  submission: "送審",
  bom: "BOM",
  part_cost: "成本",
  drawing_package: "圖面包"
};

const legacyRedirectMessages: Record<string, string> = {
  numbering_approvals: "已從舊的發行審核入口轉到審核工作台；目前已套用圖料審核篩選。",
  bom_reviews: "已從舊的 BOM 審核入口轉到審核工作台；目前已套用 BOM 篩選。",
  numbering_change_reviews: "已從舊的圖面進版影響審核入口轉到審核工作台；目前已套用圖面進版影響審核篩選。"
};

export default function ApprovalPlatformPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => readInitialFilter("status", statusFilters, "active"));
  const [domainFilter, setDomainFilter] = useState<DomainFilter>(() => readInitialFilter("domain", domainFilters, "all"));
  const [actionFilter, setActionFilter] = useState<ActionFilter>(() => readInitialFilter("action", actionFilters, "all"));
  const [legacyRedirectMessage] = useState(() => readLegacyRedirectMessage());
  const [deepLinkedRequestId, setDeepLinkedRequestId] = useState<string | null>(() => readInitialTextParam("requestId"));
  const [items, setItems] = useState<ApprovalInboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [busy, setBusy] = useState<ApprovalDecision | "retry-apply" | "reload" | "detail" | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const visibleActionFilters = useMemo(
    () =>
      actionFilters.filter(
        (filter) => filter.value === "all" || domainFilter === "all" || filter.value.startsWith(`${domainFilter}.`)
      ),
    [domainFilter]
  );
  const metrics = useMemo(
    () => ({
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      needsInfo: items.filter((item) => item.status === "needs_info").length,
      applyFailed: items.filter((item) => item.status === "apply_failed").length
    }),
    [items]
  );

  const loadInbox = useCallback(async (options?: { preserveFeedback?: boolean; preserveSelection?: boolean }) => {
    setBusy("reload");
    setError("");
    if (!options?.preserveFeedback) setMessage("");
    const response = await fetch(buildInboxUrl(statusFilter, domainFilter, actionFilter));
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    if (response.status === 403) {
      setState("forbidden");
      return;
    }
    const body = (await response.json().catch(() => ({}))) as InboxResponse;
    if (!response.ok) {
      setState("error");
      setError(body.error ?? "審核清單讀取失敗");
      return;
    }
    const nextItems = body.items ?? [];
    const deepLinkedItem = deepLinkedRequestId ? nextItems.find((item) => item.id === deepLinkedRequestId) : null;
    setItems(nextItems);
    setSelectedId((current) => {
      if (deepLinkedItem) return deepLinkedItem.id;
      if (current && nextItems.some((item) => item.id === current)) return current;
      if (options?.preserveSelection && current) return current;
      return nextItems[0]?.id ?? null;
    });
    if (deepLinkedItem) setDeepLinkedRequestId(null);
    setState("ready");
  }, [actionFilter, deepLinkedRequestId, domainFilter, statusFilter]);

  const loadDetail = useCallback(async (requestId: string) => {
    setBusy("detail");
    setError("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}`);
    setBusy(null);
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string };
    if (!response.ok || !body.request) {
      setDetail(null);
      setError(body.error ?? "審核明細讀取失敗");
      return;
    }
    setDetail(body.request);
    setComment("");
  }, []);

  useEffect(() => {
    syncFilterQuery(statusFilter, domainFilter, actionFilter);
    loadInbox();
  }, [actionFilter, domainFilter, loadInbox, statusFilter]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [loadDetail, selectedId]);

  async function decide(decision: ApprovalDecision) {
    if (!detail) return;
    setBusy(decision);
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/decisions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-decision:${detail.id}:${decision}:${crypto.randomUUID()}`
      },
      body: JSON.stringify({ decision, comment })
    });
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string };
    setBusy(null);
    if (!response.ok || !body.request) {
      setError(body.error ?? "審核決策失敗");
      return;
    }
    setDetail(body.request);
    setMessage(`已${decision === "approved" ? "核准" : decision === "rejected" ? "駁回" : "要求補資料"}`);
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true, preserveSelection: true });
  }

  async function retryApply() {
    if (!detail) return;
    setBusy("retry-apply");
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/apply`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-apply-retry:${detail.id}:${crypto.randomUUID()}`
      },
      body: "{}"
    });
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string };
    setBusy(null);
    if (!response.ok || !body.request) {
      setError(body.error ?? "審核套用重試失敗");
      return;
    }
    setDetail(body.request);
    setMessage(
      detail.actionCode === "numbering.candidate_bundle_review"
        ? "原核准內容已完成正式化；不需要重新送審或人工正式發布。"
        : "審核決策已重新套用。保留號碼仍需由具發布權限者另行正式發布。"
    );
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true, preserveSelection: true });
  }

  return (
    <div className="approval-platform-page">
      <header className="topbar">
        <div>
          <h1>審核工作台 <StatusScopeHelp scope="approvalInbox" /></h1>
          <p>所有待審資料集中處理，並可依領域與審核類型快速切換。</p>
        </div>
        <div className="status-tabs" role="tablist" aria-label="審核狀態">
          {statusFilters.map((filter) => (
            <button
              type="button"
              className={statusFilter === filter.value ? "active" : undefined}
              onClick={() => setStatusFilter(filter.value)}
              key={filter.value}
            >
              {filter.label}
            </button>
          ))}
          <button className="secondary-button" type="button" onClick={() => loadInbox()} disabled={busy === "reload"} title="重新整理">
            <RefreshCw size={16} aria-hidden="true" />
            重新整理
          </button>
        </div>
      </header>

      {legacyRedirectMessage ? <div className="approval-message info">{legacyRedirectMessage}</div> : null}

      <section className="approval-filter-bar" aria-label="審核篩選">
        <label className="approval-filter-field">
          <span>領域</span>
          <select
            value={domainFilter}
            onChange={(event) => {
              setDomainFilter(event.target.value as DomainFilter);
              setActionFilter("all");
            }}
          >
            {domainFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="approval-filter-field">
          <span>審核類型</span>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as ActionFilter)}>
            {visibleActionFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setStatusFilter("active");
            setDomainFilter("all");
            setActionFilter("all");
          }}
        >
          清除篩選
        </button>
      </section>

      <section className="metrics approval-platform-metrics" aria-label="審核摘要">
        <Metric label="總數" value={metrics.total} />
        <Metric label="待審" value={metrics.pending} />
        <Metric label="補資料" value={metrics.needsInfo} />
        <Metric label="套用失敗" value={metrics.applyFailed} />
      </section>

      {state === "unauthorized" ? <div className="panel approval-empty">請先登入。</div> : null}
      {state === "forbidden" ? <div className="panel approval-empty">目前帳號沒有審核中心讀取權限。</div> : null}
      {state === "error" ? <div className="panel approval-error">{error}</div> : null}

      <div className="approval-platform-layout">
        <section className="panel approval-inbox-panel" aria-label="審核清單">
          <div className="panel-header">
            <h2>審核清單</h2>
            <span className="approval-count">{state === "loading" ? "讀取中" : `${items.length} 筆`}</span>
          </div>
          <div className="approval-inbox-list">
            {items.map((item) => (
              <button
                type="button"
                className={item.id === selectedId ? "approval-inbox-item active" : "approval-inbox-item"}
                onClick={() => setSelectedId(item.id)}
                key={item.id}
              >
                <span className={`approval-status-chip ${statusClass(item.status)}`}>{statusText[item.status] ?? item.status}</span>
                <strong>{item.title}</strong>
                <span>{item.targetSummary}</span>
                <small>
                  {domainText[item.domainCode] ?? item.domainCode} · {item.requestedByName ?? item.requestedBy ?? "未知申請者"} · {formatDate(item.requestedAt)}
                </small>
              </button>
            ))}
            {state === "ready" && items.length === 0 ? <div className="approval-empty">目前沒有待處理審核。</div> : null}
          </div>
        </section>

        <section className="panel approval-detail-panel" aria-label="審核明細">
          <div className="panel-header">
            <h2>{detail?.title ?? selectedItem?.title ?? "審核明細"}</h2>
            {detail ? <span className={`approval-status-chip ${statusClass(detail.status)}`}>{statusText[detail.status] ?? detail.status}</span> : null}
          </div>
          {!detail ? (
            <div className="approval-empty">{busy === "detail" ? "讀取明細中" : "請選擇一筆審核。"}</div>
          ) : (
            <div className="approval-detail-body">
              <div className="approval-detail-summary">
                <DetailField label="領域" value={domainText[detail.domainCode] ?? detail.domainCode} />
                <DetailField label="動作" value={detail.actionTitle} />
                <DetailField label="申請者" value={detail.requestedByName ?? detail.requestedBy ?? "未知"} />
                <DetailField label="申請時間" value={formatDate(detail.requestedAt)} />
                <DetailField label="批次" value={detail.packageCode ?? "-"} />
                <DetailField label="流程來源" value={approvalSourceLabel(detail)} />
              </div>

              <section className="approval-detail-section">
                <h3>目標</h3>
                <div className="approval-target-list">
                  {detail.targets.map((target) => (
                    <div className="approval-target-row" key={target.id}>
                      <span>{approvalTargetRoleLabel(target.role)}</span>
                      <strong>{approvalTargetLabel(detail, target)}</strong>
                      <small>{approvalTargetStatusLabel(target.status, target.type)}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="approval-detail-section">
                <h3>原因</h3>
                <p className="approval-reason">{approvalReasonLabel(detail.reason)}</p>
              </section>

              <section className="approval-detail-section">
                <h3>影響快照</h3>
                <ApprovalImpactSummary detail={detail} />
                <details className="approval-audit-details" data-approval-audit-details>
                  <summary>查看稽核明細</summary>
                  <p>此區只供追溯鎖定內容與系統處理依據，日常核准不需閱讀。</p>
                  <pre className="approval-json">{JSON.stringify(detail.impactSnapshots[0]?.snapshot ?? {}, null, 2)}</pre>
                </details>
              </section>

              <section className="approval-detail-section">
                <h3>決策紀錄</h3>
                {detail.decisions.length === 0 ? (
                  <p className="approval-muted">尚無決策。</p>
                ) : (
                  <div className="approval-decision-history">
                    {detail.decisions.map((decision) => (
                      <div className="approval-target-row" key={decision.id}>
                        <span>{approvalDecisionLabel(decision.decision)}</span>
                        <strong>{decision.approverName ?? decision.approverId}</strong>
                        <small>{decision.comment || formatDate(decision.decidedAt)}</small>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {detail.status === "pending" ? (
                <section className="approval-decision-box" aria-label="審核決策">
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="決策備註" rows={3} />
                  <div className="approval-decision-actions">
                    {allowedDecisionsForDetail(detail).includes("approved") ? (
                      <button className="primary-button" type="button" onClick={() => decide("approved")} disabled={Boolean(busy)}>
                        <CheckCircle2 size={16} aria-hidden="true" />
                        核准
                      </button>
                    ) : null}
                    {allowedDecisionsForDetail(detail).includes("needs_info") ? (
                      <button className="secondary-button" type="button" onClick={() => decide("needs_info")} disabled={Boolean(busy)}>
                        <ShieldAlert size={16} aria-hidden="true" />
                        補資料
                      </button>
                    ) : null}
                    {allowedDecisionsForDetail(detail).includes("rejected") ? (
                      <button className="danger-button" type="button" onClick={() => decide("rejected")} disabled={Boolean(busy)}>
                        <XCircle size={16} aria-hidden="true" />
                        駁回
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {detail.status === "apply_failed" && (
                detail.actionCode === "numbering.candidate_publication_review" ||
                detail.actionCode === "numbering.candidate_bundle_review"
              ) ? (
                <section className="approval-decision-box" aria-label="審核套用重試">
                  <p className="approval-reason">
                    {detail.actionCode === "numbering.candidate_bundle_review"
                      ? "核准決策已保存，但正式資料尚未完成。系統沒有留下部分正式資料；可安全重試原核准內容，不會重新送審或換號。"
                      : "決策已保存，但候選鎖定套用失敗；重試不會新增第二筆決策，也不會正式發布。"}
                  </p>
                  <div className="approval-decision-actions">
                    <button className="primary-button" type="button" onClick={() => void retryApply()} disabled={Boolean(busy)}>
                      <RefreshCw size={16} aria-hidden="true" />
                      {busy === "retry-apply"
                        ? "重試中..."
                        : detail.actionCode === "numbering.candidate_bundle_review"
                          ? "重試正式化"
                          : "重試套用"}
                    </button>
                  </div>
                </section>
              ) : null}

              {message ? <div className="approval-message success">{message}</div> : null}
              {error ? <div className="approval-message error">{error}</div> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="approval-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ApprovalImpactSummary({ detail }: { detail: ApprovalDetail }) {
  const snapshot = asRecord(detail.impactSnapshots[0]?.snapshot);
  if (detail.actionCode !== "numbering.candidate_bundle_review") {
    return <p className="approval-reason">{detail.impactSummary || "審核影響已鎖定；請確認目標與決策內容。"}</p>;
  }

  const reservations = asRecordArray(snapshot.lockedReservations);
  const candidates = asRecordArray(snapshot.candidateRevisions);
  const numberFacts = asRecord(snapshot.numberFacts);
  const relations = asRecordArray(numberFacts.relations);
  const codes = reservations.map((item) => stringValue(item.candidateCode)).filter(Boolean);
  const fileCount = candidates.reduce((total, item) => total + asRecordArray(item.files).length, 0);
  const primaryFileCount = candidates.reduce(
    (total, item) => total + asRecordArray(item.files).filter((file) => file.isPrimary === true).length,
    0
  );

  return (
    <div className="approval-impact-summary" data-approval-bundle-summary>
      <div className="approval-detail-summary">
        <DetailField label="候選圖料號" value={codes.join("、") || detail.targetSummary} />
        <DetailField label="候選首版" value={`${candidates.length} 版`} />
        <DetailField label="主要檔案" value={`${primaryFileCount}/${fileCount}`} />
        <DetailField label="圖料關係" value={`${relations.length} 筆`} />
        <DetailField label="核准後" value="系統自動正式化" />
        <DetailField label="使用效力" value="研發版核准；尚未正式發行" />
      </div>
      <div className="approval-target-list">
        {candidates.map((candidate, index) => {
          const files = asRecordArray(candidate.files);
          return (
            <div className="approval-target-row" key={stringValue(candidate.id) || `candidate-${index}`}>
              <span>候選首版</span>
              <strong>{stringValue(candidate.revision) ? `版次 ${stringValue(candidate.revision)}` : `首版 ${index + 1}`}</strong>
              <small>{files.length} 個檔案證據</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function approvalSourceLabel(detail: ApprovalDetail) {
  if (detail.legacy) return "既有審核紀錄";
  return detail.actionCode === "numbering.candidate_bundle_review" ? "候選圖料整包送審" : "系統審核流程";
}

function approvalTargetRoleLabel(role: ApprovalDetail["targets"][number]["role"]) {
  return ({ primary: "主要案件", child: "審核內容", impact: "影響項目" } as const)[role];
}

function approvalTargetLabel(detail: ApprovalDetail, target: ApprovalDetail["targets"][number]) {
  if (target.code) return target.code;
  if (detail.actionCode === "numbering.candidate_bundle_review" && target.role === "child") {
    const revision = target.label.split("/")[0]?.trim();
    return revision ? `首版 ${revision}` : "候選首版";
  }
  return target.label;
}

function approvalTargetStatusLabel(status: string | null, type: string) {
  const statusLabels: Record<string, string> = {
    active: "準備中",
    review_locked: "送審後已鎖定",
    approved_locked: "號碼已核准，待補圖面",
    promoted: "已正式建立",
    pending: "等待審核",
    approved: "已核准",
    rejected: "已駁回",
    cancelled: "已取消"
  };
  if (status && statusLabels[status]) return statusLabels[status];
  const typeLabels: Record<string, string> = {
    numbering_draft_workspace: "保留號案件",
    numbering_candidate_revision: "候選首版",
    drawing_number: "圖號",
    part_number: "料號",
    part_root: "主根"
  };
  return typeLabels[type] ?? "審核項目";
}

function approvalReasonLabel(reason: string) {
  const reasonLabels: Record<string, string> = {
    draft_owner_confirmed_candidate_bundle_review: "申請者已確認圖料號、關係、版次與檔案證據完整，送交整包審核。",
    draft_owner_withdrew_candidate_bundle_review: "申請者已撤回整包審核，內容可繼續修正。",
    draft_owner_confirmed_candidate_publication_review: "申請者已確認保留號內容，送交發布審核。"
  };
  if (reasonLabels[reason]) return reasonLabels[reason];
  return /^[a-z0-9_.-]+$/u.test(reason)
    ? "已依流程提出審核，請確認目標與影響後決策。"
    : reason;
}

function approvalDecisionLabel(decision: ApprovalDecision) {
  return ({ approved: "核准", rejected: "駁回", needs_info: "要求補資料" } as const)[decision];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function allowedDecisionsForDetail(detail: ApprovalDetail): ApprovalDecision[] {
  const fromPayload = detail.payload.allowedDecisions;
  if (Array.isArray(fromPayload)) {
    const allowed = fromPayload.filter(
      (decision): decision is ApprovalDecision => decision === "approved" || decision === "rejected" || decision === "needs_info"
    );
    if (allowed.length > 0) return allowed;
  }
  if (detail.source !== "platform" && detail.source !== "legacy_numbering") return ["approved", "rejected"];
  return ["approved", "needs_info", "rejected"];
}

function buildInboxUrl(status: StatusFilter, domain: DomainFilter, action: ActionFilter) {
  const params = new URLSearchParams({ status, limit: "100" });
  if (domain !== "all") params.set("domain", domain);
  if (action !== "all") params.set("action", action);
  return `/api/approvals/inbox?${params.toString()}`;
}

function readInitialFilter<T extends string>(name: string, options: readonly { value: T }[], fallback: T) {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

function readInitialTextParam(name: string) {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value || null;
}

function readLegacyRedirectMessage() {
  const legacyRedirect = readInitialTextParam("legacyRedirect");
  return legacyRedirect ? legacyRedirectMessages[legacyRedirect] ?? null : null;
}

function syncFilterQuery(status: StatusFilter, domain: DomainFilter, action: ActionFilter) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("status", status);
  if (domain === "all") {
    params.delete("domain");
  } else {
    params.set("domain", domain);
  }
  if (action === "all") {
    params.delete("action");
  } else {
    params.set("action", action);
  }
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function statusClass(status: ApprovalStatus) {
  if (status === "pending" || status === "needs_info") return "warning";
  if (status === "approved" || status === "applied") return "success";
  if (status === "rejected" || status === "cancelled" || status === "apply_failed") return "danger";
  return "info";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
