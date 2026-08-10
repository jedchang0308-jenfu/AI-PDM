"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import {
  DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
  DRAWING_DETAIL_DRAWER_MIN_WIDTH,
  DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
  DrawingWorkspaceDrawer
} from "@/components/drawing-workspace-drawer";
import { NumberingSubmissionResult, type NumberingSubmissionResultCandidate } from "@/components/numbering-submission-result";
import { DrawingDetailPreview } from "@/components/drawing-detail-preview";
import { useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
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
  cleanupPending?: boolean;
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
  { value: "numbering.same_drawing_variant_after_release", label: "同圖多料號審核" },
  { value: "numbering.drawing_revision_impact_review", label: "圖面進版影響審核" },
  { value: "numbering.drawing_revision_lifecycle_review", label: "圖面進版審核" },
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

// The approval drawer is intentionally retired while the drawer family is being redesigned.
// Keep the inbox and API contracts available for the replacement UI.
const APPROVAL_DETAIL_DRAWER_ENABLED = false;

export default function ApprovalPlatformPage() {
  const [state, setState] = useState<LoadState>("loading");
  // Keep the first render deterministic between SSR and the browser. Reading
  // window.location in a state initializer made deep links hydrate different
  // markup and caused the approval workbench to fail before it could load.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [legacyRedirectMessage, setLegacyRedirectMessage] = useState<string | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);
  const deepLinkedRequestRef = useRef<string | null>(null);
  const [items, setItems] = useState<ApprovalInboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [busy, setBusy] = useState<ApprovalDecision | "retry-apply" | "retry-cleanup" | "reload" | "detail" | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({
    storageKey: DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY,
    defaultWidth: DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH,
    minWidth: DRAWING_DETAIL_DRAWER_MIN_WIDTH
  });

  useEffect(() => {
    setStatusFilter(readInitialFilter("status", statusFilters, "active"));
    setDomainFilter(readInitialFilter("domain", domainFilters, "all"));
    setActionFilter(readInitialFilter("action", actionFilters, "all"));
    deepLinkedRequestRef.current = readInitialTextParam("requestId");
    setLegacyRedirectMessage(readLegacyRedirectMessage());
    setFiltersReady(true);
  }, []);

  const visibleActionFilters = useMemo(
    () =>
      actionFilters.filter(
        (filter) => filter.value === "all" || domainFilter === "all" || filter.value.startsWith(`${domainFilter}.`)
      ),
    [domainFilter]
  );
  const showInboxAction = useMemo(() => new Set(items.map((item) => item.actionCode)).size > 1, [items]);
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
    const deepLinkedRequestId = deepLinkedRequestRef.current;
    const deepLinkedItem = deepLinkedRequestId ? nextItems.find((item) => item.id === deepLinkedRequestId) : null;
    setItems(nextItems);
    setSelectedId((current) => {
      if (!APPROVAL_DETAIL_DRAWER_ENABLED) return null;
      if (deepLinkedItem) return deepLinkedItem.id;
      if (deepLinkedRequestId) return deepLinkedRequestId;
      if (current && nextItems.some((item) => item.id === current)) return current;
      if (options?.preserveSelection && current) return current;
      return nextItems[0]?.id ?? null;
    });
    deepLinkedRequestRef.current = null;
    setState("ready");
  }, [actionFilter, domainFilter, statusFilter]);

  const loadDetail = useCallback(async (requestId: string) => {
    setBusy("detail");
    setError("");
    const drawing = readInitialTextParam("drawing");
    const query = drawing ? `?drawing=${encodeURIComponent(drawing)}` : "";
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}${query}`);
    setBusy(null);
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; error?: string; canonicalHref?: string };
    if (response.status === 410 && body.canonicalHref) {
      window.location.assign(body.canonicalHref);
      return;
    }
    if (!response.ok || !body.request) {
      setDetail(null);
      setError(body.error ?? "審核明細讀取失敗");
      return;
    }
    setDetail(body.request);
    setComment("");
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    syncFilterQuery(statusFilter, domainFilter, actionFilter);
    loadInbox();
  }, [actionFilter, domainFilter, filtersReady, loadInbox, statusFilter]);

  useEffect(() => {
    if (!APPROVAL_DETAIL_DRAWER_ENABLED) {
      setDetail(null);
      return;
    }
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
    const body = (await response.json().catch(() => ({}))) as { request?: ApprovalDetail; lifecycle?: { cleanupPending?: boolean }; error?: string };
    setBusy(null);
    if (!response.ok || !body.request) {
      setError(body.error ?? "審核決策失敗");
      return;
    }
    setDetail({ ...body.request, cleanupPending: body.lifecycle?.cleanupPending ?? body.request.cleanupPending ?? false });
    setMessage(
      detail.actionCode === "numbering.drawing_revision_lifecycle_review" && decision === "rejected"
        ? "已退回修改"
        : `已${decision === "approved" ? "核准" : decision === "rejected" ? "駁回" : "要求補資料"}`
    );
    window.dispatchEvent(new Event("approval-inbox-changed"));
    await loadInbox({ preserveFeedback: true, preserveSelection: true });
  }

  async function retryCleanup() {
    if (!detail) return;
    setBusy("retry-cleanup");
    setError("");
    setMessage("");
    const response = await fetch(`/api/approvals/requests/${encodeURIComponent(detail.id)}/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `approval-cleanup:${detail.id}`
      },
      body: "{}"
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? body.error ?? "流程整理重試失敗");
      return;
    }
    setDetail((current) => current ? { ...current, cleanupPending: false } : current);
    setMessage(body.message ?? "已完成流程整理。");
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

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setComment("");
    setMessage("");
    setError("");
    clearApprovalDetailQuery();
  }

  return (
    <div className="approval-platform-page">
      <header className="topbar">
        <div>
          <h1>審核工作台 <StatusScopeHelp scope="approvalInbox" /></h1>
        </div>
        <button className="secondary-button" type="button" onClick={() => loadInbox()} disabled={busy === "reload"} title="重新整理">
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      {legacyRedirectMessage ? <div className="approval-message info">{legacyRedirectMessage}</div> : null}
      {!APPROVAL_DETAIL_DRAWER_ENABLED ? <div className="approval-message info">審核明細抽屜已暫停開發；目前保留審核清單，待後續重新設計。</div> : null}

      <section className="approval-filter-bar" aria-label="審核篩選">
        <label className="approval-filter-field">
          <span>狀態</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            {statusFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
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
        {statusFilter !== "active" || domainFilter !== "all" || actionFilter !== "all" ? (
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
        ) : null}
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
                onClick={() => {
                  if (APPROVAL_DETAIL_DRAWER_ENABLED) setSelectedId(item.id);
                }}
                aria-disabled={!APPROVAL_DETAIL_DRAWER_ENABLED}
                aria-current={item.id === selectedId ? "true" : undefined}
                aria-label={`${item.targetSummary || item.title}，${item.actionTitle}，${statusText[item.status] ?? item.status}，${item.requestedByName ?? item.requestedBy ?? "未知申請者"}`}
                key={item.id}
              >
                <span className="approval-inbox-primary">
                  <strong>{item.targetSummary || item.title}</strong>
                  {showInboxAction ? <small>{item.actionTitle}</small> : null}
                </span>
                <span className={`approval-status-chip ${statusClass(item.status)}`}>{statusText[item.status] ?? item.status}</span>
                <span className="approval-inbox-meta">
                  <span>{item.requestedByName ?? item.requestedBy ?? "未知申請者"}</span>
                  <time dateTime={item.requestedAt}>{formatCompactDate(item.requestedAt)}</time>
                </span>
              </button>
            ))}
            {state === "ready" && items.length === 0 ? <div className="approval-empty">目前沒有待處理審核。</div> : null}
          </div>
        </section>
        {/* ApprovalDetailDrawer is intentionally not mounted during the redesign. */}
      </div>
    </div>
  );
}

type ApprovalDetailDrawerProps = {
  detail: ApprovalDetail;
  busy: ApprovalPlatformPageBusy;
  comment: string;
  message: string;
  error: string;
  drawerWidth: number;
  onStartResize: (clientX: number) => void;
  onClose: () => void;
  onCommentChange: (value: string) => void;
  onDecide: (decision: ApprovalDecision) => Promise<void>;
  onRetryCleanup: () => Promise<void>;
  onRetryApply: () => Promise<void>;
};

type ApprovalPlatformPageBusy = ApprovalDecision | "retry-apply" | "retry-cleanup" | "reload" | "detail" | null;

function ApprovalDetailDrawer({
  detail,
  busy,
  comment,
  message,
  error,
  drawerWidth,
  onStartResize,
  onClose,
  onCommentChange,
  onDecide,
  onRetryCleanup,
  onRetryApply
}: ApprovalDetailDrawerProps) {
  const resultCandidates = buildApprovalResultCandidates(detail);
  return (
    <DrawingWorkspaceDrawer
      open
      width={drawerWidth}
      ariaLabel="審核明細"
      eyebrow="審核案件"
      title={detail.targetSummary || detail.title}
      subtitle={`${detail.actionTitle} · ${detail.requestedByName ?? detail.requestedBy ?? "未知申請者"} · ${formatDate(detail.requestedAt)}`}
      status={<span className={`approval-status-chip ${statusClass(detail.status)}`}>{statusText[detail.status] ?? detail.status}</span>}
      entityType="approval_request"
      entityCode={detail.id}
      sourceContext="approval_workbench"
      detailFamily="approval_request"
      className="approval-detail-drawer"
      bodyClassName="pdm-entity-drawer-body approval-detail-drawer-body"
      resizeLabel="調整審核明細寬度"
      resizeTitle="拖曳調整審核明細寬度"
      closeLabel="關閉審核明細"
      keepOpenSelector=".approval-inbox-item"
      overviewLabel="審核摘要"
      moreLabel="更多審核資料"
      content={{
        overview: <ApprovalImpactSummary detail={detail} />,
        body: <ApprovalResultBody detail={detail} candidates={resultCandidates} />,
        pending: <ApprovalPendingSummary detail={detail} />,
        more: <ApprovalMoreDetails detail={detail} />,
        bodyTitle: "圖面與附件",
        bodyMeta: "送審時固定的檔案證據",
        bodyLabel: "圖面與附件",
        pendingTitle: "目前狀態",
        pendingLabel: "目前狀態",
        moreTitle: "更多"
      }}
      footer={
        <ApprovalDecisionFooter
          detail={detail}
          busy={busy}
          comment={comment}
          message={message}
          error={error}
          onCommentChange={onCommentChange}
          onDecide={onDecide}
          onRetryCleanup={onRetryCleanup}
          onRetryApply={onRetryApply}
        />
      }
      onClose={onClose}
      onStartResize={onStartResize}
    />
  );
}

function ApprovalImpactSummary({ detail }: { detail: ApprovalDetail }) {
  const snapshot = asRecord(detail.impactSnapshots[0]?.snapshot);
  const resultCandidates = buildApprovalResultCandidates(detail);
  const isCandidateBundle = detail.actionCode === "numbering.candidate_bundle_review";
  const lifecycleDrawing = asRecord(snapshot.drawing);
  const lifecycleParts = asRecordArray(snapshot.parts);
  const lifecycleFiles = asRecordArray(snapshot.files);
  const candidateReservations = asRecordArray(snapshot.lockedReservations);
  const candidateCodes = candidateReservations.map((item) => stringValue(item.candidateCode)).filter(Boolean);
  const candidateNumberFacts = asRecord(snapshot.numberFacts);
  const candidateRelations = asRecordArray(candidateNumberFacts.relations);
  const candidateFiles = resultCandidates.flatMap((candidate) => candidate.files);
  const facts = detail.actionCode === "numbering.drawing_revision_lifecycle_review"
    ? [
        { label: "範圍", value: stringValue(lifecycleDrawing.number) || detail.targetSummary },
        { label: "版次", value: stringValue(lifecycleDrawing.revision) || "-" },
        { label: "料號", value: `${lifecycleParts.length} 個` },
        { label: "檔案", value: `${lifecycleFiles.length} 個` }
      ]
    : isCandidateBundle
      ? [
          { label: "範圍", value: candidateCodes.join("、") || detail.targetSummary },
          { label: "候選首版", value: `${resultCandidates.length} 版` },
          { label: "主要檔案", value: `${candidateFiles.filter((file) => file.isPrimary).length}/${candidateFiles.length}` },
          { label: "圖料關係", value: `${candidateRelations.length} 筆` },
          { label: "核准後", value: "系統自動正式化" },
          { label: "使用效力", value: "研發版核准；尚未正式發行" }
        ]
      : [
          { label: "範圍", value: detail.targets.map((target) => approvalTargetLabel(detail, target)).join("、") || detail.targetSummary },
          { label: "影響", value: approvalImpactLabel(detail.impactSummary) }
        ];

  return (
    <div
      className="approval-impact-summary"
      data-approval-bundle-summary={isCandidateBundle ? "true" : undefined}
      data-drawing-lifecycle-review-summary={detail.actionCode === "numbering.drawing_revision_lifecycle_review" ? "true" : undefined}
    >
      <NumberingSubmissionResult
        mode="reviewer"
        showCandidates={false}
        heading="審核摘要"
        subtitle="送審時固定的內容"
        facts={facts}
      />
    </div>
  );
}

function ApprovalResultBody({ detail, candidates }: { detail: ApprovalDetail; candidates: NumberingSubmissionResultCandidate[] }) {
  return (
    <div className="approval-result-section">
      {candidates.length > 0 ? (
        <NumberingSubmissionResult
          mode="reviewer"
          requestId={detail.actionCode === "numbering.candidate_bundle_review" ? detail.id : null}
          heading="圖面與附件"
          showHeader={false}
          candidates={candidates}
        />
      ) : (
        <div className="approval-result-empty">本案沒有可供查閱的圖面附件。</div>
      )}
      <ApprovalDrawingPreview detail={detail} candidates={candidates} />
    </div>
  );
}

function ApprovalDrawingPreview({ detail, candidates }: { detail: ApprovalDetail; candidates: NumberingSubmissionResultCandidate[] }) {
  const requestId = detail.actionCode === "numbering.candidate_bundle_review" ? detail.id : null;
  const files = candidates.flatMap((candidate) => candidate.files);
  const threeD = files.find((file) => file.role === "cad_3d");
  const twoD = files.find((file) => ["drawing_2d", "pdf", "dwg_dxf"].includes(file.role));
  const fileActions = (file: typeof threeD) => file && requestId && file.sourceFileAssetId ? (
    <>
      <a className="numbering-submission-result-link" href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?preview=1`} target="_blank" rel="noreferrer">預覽</a>
      <a className="numbering-submission-result-link" href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?download=1`} target="_blank" rel="noreferrer">下載</a>
    </>
  ) : null;
  const fileMedia = (file: typeof threeD) => file && requestId && file.sourceFileAssetId ? {
    href: `/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?preview=1`,
    mode: file.role === "cad_3d" ? "image" as const : "document" as const,
    title: `${file.displayName || "附件"} 預覽`
  } : undefined;
  return (
    <DrawingDetailPreview
      cards={[
        {
          kind: "three-d",
          title: "3D 模型",
          fileName: threeD?.displayName,
          state: threeD && fileMedia(threeD) ? "ready" : threeD ? "unavailable" : "missing",
          stateTitle: threeD ? "審核時可查閱檔案" : "尚無 3D 檔案",
          stateText: threeD ? "預覽與送審時固定的檔案證據相同。" : "送審內容沒有 3D 檔案。",
          media: fileMedia(threeD),
          actions: fileActions(threeD)
        },
        {
          kind: "two-d",
          title: "2D 圖面",
          fileName: twoD?.displayName,
          state: twoD && fileMedia(twoD) ? "ready" : twoD ? "unavailable" : "missing",
          stateTitle: twoD ? "審核時可查閱檔案" : "尚無 2D 檔案",
          stateText: twoD ? "預覽與送審時固定的檔案證據相同。" : "送審內容沒有 2D 檔案。",
          media: fileMedia(twoD),
          actions: fileActions(twoD)
        }
      ]}
    />
  );
}

function ApprovalPendingSummary({ detail }: { detail: ApprovalDetail }) {
  if (detail.status !== "pending") return null;
  return (
    <section className="approval-drawer-pending" aria-label="目前待處理事項">
      <strong>請確認圖面與附件後決策</strong>
      <span>決策按鈕固定在抽屜底部。</span>
    </section>
  );
}

function ApprovalMoreDetails({ detail }: { detail: ApprovalDetail }) {
  return (
    <div className="approval-more-details">
      {detail.decisions.length > 0 ? (
        <details className="approval-prior-decisions">
          <summary><span>先前決策</span><small>{detail.decisions.length} 筆</small></summary>
          <div className="approval-decision-history">
            {detail.decisions.map((decision) => (
              <div className="approval-target-row" key={decision.id}>
                <span>{approvalDecisionLabel(decision.decision)}</span>
                <strong>{decision.approverName ?? decision.approverId}</strong>
                <small>{decision.comment || formatDate(decision.decidedAt)}</small>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {detail.actionCode !== "numbering.drawing_revision_lifecycle_review" ? <details className="approval-trace-details">
        <summary>
          <span>追溯資料</span>
          <small>批次、流程與系統鎖定內容</small>
        </summary>
        <div className="approval-trace-body">
          <dl className="approval-trace-facts">
            <div><dt>領域</dt><dd>{domainText[detail.domainCode] ?? detail.domainCode}</dd></div>
            <div><dt>批次</dt><dd>{detail.packageCode ?? "無"}</dd></div>
            <div><dt>流程來源</dt><dd>{approvalSourceLabel(detail)}</dd></div>
          </dl>
          <details className="approval-audit-details" data-approval-audit-details>
            <summary>查看稽核明細</summary>
            <p>供追溯送審當下的鎖定內容。</p>
            <pre className="approval-json">{JSON.stringify(detail.impactSnapshots[0]?.snapshot ?? {}, null, 2)}</pre>
          </details>
        </div>
      </details> : null}
    </div>
  );
}

function ApprovalDecisionFooter({
  detail,
  busy,
  comment,
  message,
  error,
  onCommentChange,
  onDecide,
  onRetryCleanup,
  onRetryApply
}: Omit<ApprovalDetailDrawerProps, "drawerWidth" | "onStartResize" | "onClose">) {
  return (
    <div className="approval-drawer-footer-content">
      {message ? <div className="approval-message success">{message}</div> : null}
      {error ? <div className="approval-message error" role="alert">{error}</div> : null}
      {detail.status === "pending" ? (
        <section className="approval-decision-box" aria-label="審核決策">
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder={detail.actionCode === "numbering.drawing_revision_lifecycle_review" ? "退回說明（選填）" : "決策備註"} rows={2} />
          <div className="approval-decision-actions">
            {allowedDecisionsForDetail(detail).includes("needs_info") ? (
              <button className="secondary-button" type="button" onClick={() => void onDecide("needs_info")} disabled={Boolean(busy)}>
                <ShieldAlert size={16} aria-hidden="true" />
                補資料
              </button>
            ) : null}
            {allowedDecisionsForDetail(detail).includes("rejected") ? (
              <button className="danger-button" type="button" onClick={() => void onDecide("rejected")} disabled={Boolean(busy)}>
                <XCircle size={16} aria-hidden="true" />
                {detail.actionCode === "numbering.drawing_revision_lifecycle_review" ? "退回修改" : "駁回"}
              </button>
            ) : null}
            {allowedDecisionsForDetail(detail).includes("approved") ? (
              <button className="primary-button" type="button" onClick={() => void onDecide("approved")} disabled={Boolean(busy)}>
                <CheckCircle2 size={16} aria-hidden="true" />
                核准
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {detail.actionCode === "numbering.drawing_revision_lifecycle_review" && detail.cleanupPending ? (
        <section className="approval-decision-box" aria-label="流程整理重試">
          <p className="approval-reason">審核決策已完成，僅剩流程整理；重試不會重新審核或建立第二筆送審。</p>
          <div className="approval-decision-actions">
            <button className="primary-button" type="button" onClick={() => void onRetryCleanup()} disabled={Boolean(busy)}>
              <RefreshCw size={16} aria-hidden="true" />
              {busy === "retry-cleanup" ? "整理中..." : "重試流程整理"}
            </button>
          </div>
        </section>
      ) : null}
      {detail.status === "apply_failed" && (detail.actionCode === "numbering.candidate_publication_review" || detail.actionCode === "numbering.candidate_bundle_review") ? (
        <section className="approval-decision-box" aria-label="審核套用重試">
          <p className="approval-reason">核准決策已保存，但正式資料尚未完成；可安全重試原核准內容，不會重新送審或換號。</p>
          <div className="approval-decision-actions">
            <button className="primary-button" type="button" onClick={() => void onRetryApply()} disabled={Boolean(busy)}>
              <RefreshCw size={16} aria-hidden="true" />
              {busy === "retry-apply" ? "重試中..." : detail.actionCode === "numbering.candidate_bundle_review" ? "重試正式化" : "重試套用"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function buildApprovalResultCandidates(detail: ApprovalDetail): NumberingSubmissionResultCandidate[] {
  const snapshot = asRecord(detail.impactSnapshots[0]?.snapshot);
  if (detail.actionCode === "numbering.candidate_bundle_review") {
    const reservations = asRecordArray(snapshot.lockedReservations);
    const candidates = asRecordArray(snapshot.candidateRevisions);
    const reservationCodes = new Map(
      reservations
        .map((item) => [stringValue(item.id), stringValue(item.candidateCode)] as const)
        .filter(([id, code]) => Boolean(id && code))
    );
    return candidates.map((candidate, index) => {
      const candidateFiles = asRecordArray(candidate.files);
      const candidateCode = reservationCodes.get(stringValue(candidate.candidateReservationId));
      return {
        id: stringValue(candidate.id) || `candidate-${index}`,
        drawingCode: candidateCode || stringValue(candidate.drawingDraftId) || null,
        revision: stringValue(candidate.revision) || "0.1",
        files: candidateFiles.map((file, fileIndex) => ({
          id: stringValue(file.id) || `${stringValue(candidate.id)}-file-${fileIndex}`,
          sourceFileAssetId: stringValue(file.sourceFileAssetId) || null,
          role: stringValue(file.role),
          displayName: evidenceFileName(file) || `附件 ${fileIndex + 1}`,
          description: stringValue(file.description),
          isPrimary: file.isPrimary === true,
          publicationEvidenceId: stringValue(file.publicationEvidenceId) || null
        }))
      };
    });
  }
  if (detail.actionCode !== "numbering.drawing_revision_lifecycle_review") return [];
  const drawing = asRecord(snapshot.drawing);
  const files = asRecordArray(snapshot.files);
  if (files.length === 0) return [];
  return [{
    id: detail.id,
    drawingCode: stringValue(drawing.number) || detail.targetSummary,
    revision: stringValue(drawing.revision) || "0.1",
    files: files.map((file, index) => ({
      id: stringValue(file.id) || `${detail.id}-file-${index}`,
      sourceFileAssetId: stringValue(file.sourceFileAssetId) || stringValue(file.assetId) || null,
      role: stringValue(file.role) || "other",
      displayName: evidenceFileName(file) || `附件 ${index + 1}`,
      description: stringValue(file.description),
      isPrimary: file.isPrimary === true || file.primary === true,
      publicationEvidenceId: stringValue(file.publicationEvidenceId) || null
    }))
  }];
}

function approvalSourceLabel(detail: ApprovalDetail) {
  if (detail.legacy) return "既有審核紀錄";
  if (detail.actionCode === "numbering.drawing_revision_lifecycle_review") return "圖面進版";
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
    drawing_revision_package: "圖面版次",
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

function approvalImpactLabel(impactSummary: string | null) {
  const normalized = impactSummary?.trim() ?? "";
  const impactLabels: Record<string, string> = {
    no_impact: "未發現需處理的影響。",
    suspected_impact: "可能有影響，請確認是否需要補充處置。",
    confirmed_impact: "已確認有影響，請確認配套處置後再決策。",
    "Released -> Obsolete": "核准後將把正式資料改為作廢。"
  };
  if (impactLabels[normalized]) return impactLabels[normalized];
  if (!normalized) return "未提供額外影響說明。";
  return /^[a-z0-9_.-]+$/u.test(normalized)
    ? "影響內容已隨案件鎖定，請依審核範圍判斷。"
    : normalized;
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

function evidenceFileName(file: Record<string, unknown>) {
  const displayName = stringValue(file.displayName);
  if (displayName) return displayName;
  const objectKey = stringValue(file.objectKey);
  return objectKey.split(/[\\/]/u).pop() ?? objectKey;
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

function clearApprovalDetailQuery() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.delete("requestId");
  params.delete("drawing");
  const nextQuery = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
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

function formatCompactDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
