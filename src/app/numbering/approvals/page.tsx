"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw, Send, ShieldAlert, Undo2, X, XCircle } from "lucide-react";
import { InfoHint, RiskHint } from "@/components/compact-hints";
import { LifecycleStageGuidance } from "@/components/lifecycle-ux";
import { PdmDetailDrawer, useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { formatDevelopmentPhaseForUser, formatStatusForUser } from "@/lib/status-display";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type ApprovalDecision = "approved" | "rejected" | "needs_info";
type ApprovalStatus = "pending" | "approved" | "rejected" | "needs_info" | "cancelled";
type BatchStatus = "pending" | "partially_approved" | "approved" | "rejected" | "needs_info" | "cancelled";
type BatchItemStatus = ApprovalStatus | "resubmitted";
type AttentionMarker = {
  code: "proxy_submission" | "delegated_review" | "override" | "impact_scope";
  label: string;
  detail: string | null;
  severity: "info" | "warning" | "critical";
};

type ApprovalEntitySummary = {
  entityType: "part_root" | "part_number" | "drawing_number" | "same_drawing_variant";
  entityId: string;
  label: string;
  secondary: string;
  rootCode: string | null;
  partNumber: string | null;
  drawingNumber: string | null;
  partName: string | null;
  coreName: string | null;
  itemKind: string | null;
  developmentPhase: string | null;
  recordStatus: string | null;
};

type ApprovalRequest = {
  id: string;
  actionCode: string;
  entityType: ApprovalEntitySummary["entityType"];
  entityId: string;
  requestStatus: ApprovalStatus;
  reason: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
  requestedByName: string;
  requestedByRole: string;
  isProxySubmission: boolean;
  proxyReason: string | null;
  markers: AttentionMarker[];
  entitySummary: ApprovalEntitySummary;
  decisions: Array<{
    decision: ApprovalDecision;
    comment: string | null;
    decidedAt: string;
    approverName: string;
    approverRole: string;
    approverUserRole: string;
    isDelegatedApproval: boolean;
  }>;
};

type ApprovalBatchItem = {
  id: string;
  batchId: string;
  approvalRequestId: string;
  itemStatus: BatchItemStatus;
  resubmittedFromItemId: string | null;
  request: ApprovalRequest;
};

type ApprovalBatch = {
  id: string;
  batchCode: string;
  projectCode: string | null;
  actionCode: string | null;
  batchStatus: BatchStatus;
  submittedBy: string;
  submittedAt: string;
  submittedByName: string;
  submittedByRole: string;
  markers: AttentionMarker[];
  itemCounts: Record<BatchItemStatus, number>;
  items: ApprovalBatchItem[];
};

type ApprovalBatchResponse = {
  summary: {
    total: number;
    pending: number;
    partiallyApproved: number;
    needsInfo: number;
  };
  batches: ApprovalBatch[];
};

const statusFilters: Array<{ value: "active" | "pending" | "partially_approved" | "needs_info" | "approved" | "rejected" | "all"; label: string }> = [
  { value: "active", label: "待處理" },
  { value: "pending", label: "審核中" },
  { value: "partially_approved", label: "部分核准" },
  { value: "needs_info", label: "待補資料" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已退回" },
  { value: "all", label: "全部" }
];

export default function NumberingApprovalsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [batches, setBatches] = useState<ApprovalBatch[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]["value"]>("active");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const batchListRef = useRef<HTMLDivElement | null>(null);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [commonComment, setCommonComment] = useState("");
  const [itemComments, setItemComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<ApprovalDecision | "reload" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-approval-detail-drawer-width" });

  const selectedBatch = useMemo(() => (selectedBatchId ? batches.find((batch) => batch.id === selectedBatchId) ?? null : null), [batches, selectedBatchId]);
  const selectedItems = useMemo(
    () => selectedBatch?.items.filter((item) => selectedRequestIds.has(item.approvalRequestId) && item.itemStatus === "pending") ?? [],
    [selectedBatch, selectedRequestIds]
  );
  const metrics = useMemo(
    () => ({
      batches: batches.length,
      pendingItems: batches.reduce((sum, batch) => sum + (batch.itemCounts.pending ?? 0), 0),
      proxyItems: batches.reduce((sum, batch) => sum + batch.items.filter((item) => item.request.isProxySubmission).length, 0),
      exceptionItems: batches.reduce((sum, batch) => sum + batch.items.filter(isExceptionItem).length, 0)
    }),
    [batches]
  );

  const loadBatches = useCallback(async (nextStatus = statusFilter) => {
    setBusy("reload");
    setState("loading");
    setError("");
    const response = await fetch(`/api/numbering/approval-batches?scope=dvt_release&status=${nextStatus}&limit=50`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    if (response.status === 403) {
      setState("forbidden");
      return;
    }
    const body = (await response.json().catch(() => ({}))) as Partial<ApprovalBatchResponse> & { error?: string };
    if (!response.ok) {
      setError(body.error ?? "審核批次讀取失敗");
      setState("error");
      return;
    }
    const nextBatches = body.batches ?? [];
    setBatches(nextBatches);
    setSelectedBatchId((current) => (current && nextBatches.some((batch) => batch.id === current) ? current : null));
    setIsBatchDetailOpen((current) => current && nextBatches.some((batch) => batch.id === selectedBatchId));
    setState("ready");
  }, [selectedBatchId, statusFilter]);

  useEffect(() => {
    loadBatches(statusFilter);
  }, [loadBatches, statusFilter]);

  useEffect(() => {
    if (!selectedBatch) {
      setSelectedRequestIds(new Set());
      return;
    }
    setSelectedRequestIds(new Set(selectedBatch.items.filter((item) => item.itemStatus === "pending").map((item) => item.approvalRequestId)));
    setCommonComment("");
    setItemComments({});
  }, [selectedBatch]);

  const openBatchDetail = useCallback((batch: ApprovalBatch) => {
    setSelectedBatchId(batch.id);
    setIsBatchDetailOpen(true);
  }, []);

  const selectBatch = useCallback((batch: ApprovalBatch, options: { openDetail: boolean }) => {
    setSelectedBatchId(batch.id);
    if (options.openDetail) setIsBatchDetailOpen(true);
  }, []);

  const closeBatchDetail = useCallback(() => {
    setIsBatchDetailOpen(false);
  }, []);

  const batchShortcuts = useListKeyboardShortcuts({
    items: batches,
    selectedKey: selectedBatchId,
    listRef: batchListRef,
    rowSelector: "[data-approval-batch-row='true']",
    getKey: (batch) => batch.id,
    getCopyText: (batch) => batch.batchCode,
    onSelect: selectBatch,
    onOpenDetail: openBatchDetail,
    onCloseDetail: closeBatchDetail,
    isDetailOpen: isBatchDetailOpen
  });

  useEffect(() => {
    if (!isBatchDetailOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-approval-batch-row='true']")) return;
      setIsBatchDetailOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isBatchDetailOpen]);

  function toggleRequest(approvalRequestId: string) {
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      if (next.has(approvalRequestId)) next.delete(approvalRequestId);
      else next.add(approvalRequestId);
      return next;
    });
  }

  async function decideBatch(decision: ApprovalDecision) {
    if (!selectedBatch || selectedItems.length === 0) return;
    setBusy(decision);
    setError("");
    setResult("");
    const response = await fetch(`/api/numbering/approval-batches/${selectedBatch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        approvalRequestIds: selectedItems.map((item) => item.approvalRequestId),
        comment: commonComment,
        itemComments
      })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "批次審核失敗");
      setState("error");
      return;
    }
    setResult(`${decisionLabel(decision)}完成：${selectedItems.length} 件`);
    await loadBatches(statusFilter);
  }

  async function resubmitRejected() {
    if (!selectedBatch) return;
    const targetIds = selectedBatch.items
      .filter((item) => (item.itemStatus === "rejected" || item.itemStatus === "needs_info") && selectedRequestIds.has(item.approvalRequestId))
      .map((item) => item.approvalRequestId);
    if (targetIds.length === 0) return;
    setBusy("reload");
    const response = await fetch(`/api/numbering/approval-batches/${selectedBatch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "resubmit_rejected",
        approvalRequestIds: targetIds,
        reason: commonComment || "退回項目重新送審"
      })
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "退回重送失敗");
      setState("error");
      return;
    }
    setResult(`退回項目重送完成：${targetIds.length} 件`);
    await loadBatches(statusFilter);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>發行審核</h1>
          <p>同專案批次審核、共用意見、異常項個別意見與代送審標示。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => loadBatches(statusFilter)} disabled={busy === "reload"}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <LifecycleStageGuidance
        activeStage="review"
        metrics={[
          { label: "批次", value: metrics.batches },
          { label: "審核中項目", value: metrics.pendingItems, tone: metrics.pendingItems > 0 ? "warning" : "success" },
          { label: "代送審", value: metrics.proxyItems, tone: metrics.proxyItems > 0 ? "warning" : "neutral" },
          { label: "異常項", value: metrics.exceptionItems, tone: metrics.exceptionItems > 0 ? "critical" : "neutral" }
        ]}
      />

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看發行審核。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="發行審核需研發主管或管理員權限。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => loadBatches(statusFilter)} /> : null}

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>審核佇列</h2>
              <p style={mutedTextStyle}>這裡處理 DVT 階段、正式發行、製造圖恢復與作廢審核。</p>
            </div>
            <select className="dropdown-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              {statusFilters.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div className="metrics" style={{ marginBottom: 0 }}>
            <Metric label="審核批次" value={metrics.batches} />
            <Metric label="審核中項目" value={metrics.pendingItems} />
            <Metric label="代送審" value={metrics.proxyItems} />
            <Metric label="異常/Override" value={metrics.exceptionItems} />
          </div>
        </section>

        {result ? <ResultPanel message={result} /> : null}

        <div style={reviewLayoutStyle}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>同專案批次</h2>
                <p style={mutedTextStyle}>依批次與專案分組。</p>
              </div>
              <ClipboardCheck size={20} color="#475569" />
            </div>
            {state === "loading" ? <div className="empty">正在載入審核批次...</div> : null}
            {state === "ready" ? (
              <div
                aria-keyshortcuts={batchShortcuts.shortcuts}
                aria-label="審核批次清單"
                onKeyDown={batchShortcuts.handleKeyDown}
                ref={batchListRef}
                role="region"
                tabIndex={0}
              >
                <BatchList batches={batches} selectedId={selectedBatchId} onSelect={openBatchDetail} />
              </div>
            ) : null}
          </section>

          <PdmDetailDrawer
            open={isBatchDetailOpen && Boolean(selectedBatch)}
            width={drawerWidth}
            ariaLabel="審核批次明細"
            onClose={closeBatchDetail}
            onStartResize={startDrawerResize}
          >
          <section className="panel pdm-master-detail-panel">
            <div className="panel-header">
              <div>
                <h2>{selectedBatch ? selectedBatch.batchCode : "批次明細"}</h2>
                <p style={mutedTextStyle}>
                  {selectedBatch ? `${selectedBatch.projectCode ?? "未指定專案"} / ${actionLabel(selectedBatch.actionCode)}` : "請先選取批次"}
                </p>
                {selectedBatch?.markers?.length ? <MarkerList markers={selectedBatch.markers} /> : null}
              </div>
              <div className="pdm-drawer-header-actions">
                {selectedBatch ? <StatusBadge status={selectedBatch.batchStatus} context="workflow" /> : <span className="badge">-</span>}
                <button className="icon-button" type="button" aria-label="關閉審核批次明細" onClick={closeBatchDetail}>
                  <X size={16} />
                </button>
              </div>
            </div>
            {selectedBatch ? (
              <>
                <div style={commentGridStyle}>
                  <label style={fieldStyle}>
                    <span>共用意見</span>
                    <textarea rows={3} value={commonComment} onChange={(event) => setCommonComment(event.target.value)} placeholder="同批次共用審核意見" />
                  </label>
                  <div style={decisionPanelStyle}>
                    <strong>批次操作</strong>
                    <p style={mutedTextStyle}>已選取 {selectedItems.length} 件 pending 項目。</p>
                    <div style={actionGroupStyle}>
                      <button className="primary-button" type="button" disabled={selectedItems.length === 0 || busy === "approved"} onClick={() => decideBatch("approved")}>
                        <CheckCircle2 size={16} />
                        核准選取
                      </button>
                      <button className="secondary-button" type="button" disabled={selectedItems.length === 0 || busy === "needs_info"} onClick={() => decideBatch("needs_info")}>
                        <Undo2 size={16} />
                        要求補件
                      </button>
                      <button className="secondary-button" type="button" disabled={selectedItems.length === 0 || busy === "rejected"} onClick={() => decideBatch("rejected")}>
                        <XCircle size={16} />
                        退回選取
                      </button>
                      <button className="secondary-button" type="button" disabled={busy === "reload"} onClick={resubmitRejected}>
                        <Send size={16} />
                        退回重送
                      </button>
                    </div>
                  </div>
                </div>
                <ApprovalItemTable
                  items={selectedBatch.items}
                  selectedRequestIds={selectedRequestIds}
                  itemComments={itemComments}
                  onToggle={toggleRequest}
                  onCommentChange={(approvalRequestId, comment) => setItemComments((current) => ({ ...current, [approvalRequestId]: comment }))}
                />
              </>
            ) : (
              <EmptyApprovalBatchGuidance />
            )}
          </section>
          </PdmDetailDrawer>
        </div>
      </div>
    </>
  );
}

function BatchList({
  batches,
  selectedId,
  onSelect
}: {
  batches: ApprovalBatch[];
  selectedId: string | null;
  onSelect: (batch: ApprovalBatch) => void;
}) {
  if (batches.length === 0) {
    return <EmptyApprovalBatchGuidance />;
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "760px" }}>
        <thead>
          <tr>
            <th>批次</th>
            <th>專案</th>
            <th>
              <StatusColumnHeader context="workflow" />
            </th>
            <th>審核中</th>
            <th>送審者</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr
              className={selectedId === batch.id ? "selected-row" : undefined}
              data-approval-batch-row="true"
              key={batch.id}
              onClick={() => onSelect(batch)}
            >
              <td>
                  <strong>{batch.batchCode}</strong>
                  <p style={bodyTextStyle}>{actionLabel(batch.actionCode)}</p>
                  <p style={mutedTextStyle}>{batchItemPreview(batch)}</p>
                  <MarkerList markers={batch.markers ?? []} />
                </td>
              <td>{batch.projectCode ?? "未指定"}</td>
              <td>
                <StatusBadge status={batch.batchStatus} context="workflow" />
              </td>
              <td>{batch.itemCounts.pending ?? 0}</td>
              <td>
                {batch.submittedByName}
                <p style={mutedTextStyle}>{batch.submittedByRole}</p>
              </td>
              <td>
                <button className="secondary-button" type="button" onClick={() => onSelect(batch)}>
                  查看
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function batchItemPreview(batch: ApprovalBatch) {
  const visibleItems = batch.items.slice(0, 3).map((item) => {
    const summary = item.request.entitySummary;
    const primary = summary.partNumber ?? summary.drawingNumber ?? summary.rootCode ?? summary.label;
    return summary.drawingNumber && summary.drawingNumber !== primary ? `${primary} / ${summary.drawingNumber}` : primary;
  });
  const overflow = batch.items.length > visibleItems.length ? ` +${batch.items.length - visibleItems.length}` : "";
  return `${visibleItems.join("、")}${overflow}`;
}

function EmptyApprovalBatchGuidance() {
  return (
    <div className="empty">
      <ClipboardCheck size={22} aria-hidden="true" />
      <h2>目前沒有發行審核批次</h2>
      <p>這裡處理 DVT 階段、正式發行、製造圖恢復與作廢審核。一般狀態為「審核中」的圖面 submission，請回工作台開啟圖面明細後核准或駁回。</p>
      <div className="empty-actions">
        <Link className="primary-button" href="/?status=Pending">
          回工作台審核圖面
        </Link>
        <Link className="secondary-button" href="/numbering/tasks">
          查看我的待辦
        </Link>
      </div>
    </div>
  );
}

function ApprovalItemTable({
  items,
  selectedRequestIds,
  itemComments,
  onToggle,
  onCommentChange
}: {
  items: ApprovalBatchItem[];
  selectedRequestIds: Set<string>;
  itemComments: Record<string, string>;
  onToggle: (approvalRequestId: string) => void;
  onCommentChange: (approvalRequestId: string, comment: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "1280px" }}>
        <thead>
          <tr>
            <th>選取</th>
            <th>項目</th>
            <th>審核動作</th>
            <th>送審資訊</th>
            <th>
              <StatusColumnHeader context="workflow" />
            </th>
            <th>原因</th>
            <th>異常項個別意見</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const request = item.request;
            const summary = request.entitySummary;
            const exception = isExceptionItem(item);
            return (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`${summary.label} 審核選取`}
                    type="checkbox"
                    checked={selectedRequestIds.has(item.approvalRequestId)}
                    disabled={item.itemStatus !== "pending"}
                    onChange={() => onToggle(item.approvalRequestId)}
                  />
                </td>
                <td>
                  <strong>{summary.label}</strong>
                  <p style={bodyTextStyle}>{summary.secondary}</p>
                  {summary.drawingNumber ? <p style={mutedTextStyle}>圖號 {summary.drawingNumber}</p> : null}
                  <p style={mutedTextStyle}>
                    {summary.rootCode ?? "-"} / {summary.developmentPhase ? formatDevelopmentPhaseForUser(summary.developmentPhase) : "-"} / {summary.recordStatus ? formatStatusForUser(summary.recordStatus, "masterRecord") : "-"}
                  </p>
                </td>
                <td>
                  <div style={markerStackStyle}>
                    <span>{actionLabel(request.actionCode)}</span>
                    {exception ? <RiskHint title="異常或 override 項目，主管審核時需確認影響範圍。" className="approval-marker-exception" /> : null}
                    <MarkerList markers={request.markers ?? []} />
                  </div>
                </td>
                <td>
                  {request.requestedByName}
                  <p style={mutedTextStyle}>{formatDateTime(request.requestedAt)}</p>
                  {request.isProxySubmission ? <InfoHint title={request.proxyReason ?? "代送審"} className="approval-marker-proxy" /> : null}
                </td>
                <td>
                  <StatusBadge status={item.itemStatus} context="workflow" />
                  {request.decisions[0] ? (
                    <div style={markerStackStyle}>
                      <p style={bodyTextStyle}>{decisionLabel(request.decisions[0].decision)}：{request.decisions[0].comment ?? "無意見"}</p>
                      {request.decisions[0].isDelegatedApproval ? (
                        <MarkerList
                          markers={[
                            {
                              code: "delegated_review",
                              label: "代理審核",
                              detail: `審核者: ${request.decisions[0].approverName} / 代理角色: ${request.decisions[0].approverRole}`,
                              severity: "warning"
                            }
                          ]}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td>{request.reason}</td>
                <td>
                  <textarea
                    aria-label={`${summary.label} 個別意見`}
                    rows={2}
                    value={itemComments[item.approvalRequestId] ?? ""}
                    disabled={item.itemStatus !== "pending"}
                    onChange={(event) => onCommentChange(item.approvalRequestId, event.target.value)}
                    placeholder={exception ? "異常項個別意見" : "可留空，使用共用意見"}
                    style={{ minWidth: "220px" }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarkerList({ markers }: { markers: AttentionMarker[] }) {
  if (!markers.length) return null;
  return (
    <div style={markerListStyle}>
      {markers.map((marker) => (
        <RiskHint
          title={marker.detail ?? marker.label}
          tone={marker.severity === "critical" ? "danger" : marker.severity === "warning" ? "warning" : "info"}
          className={`approval-marker-${marker.code}`}
          key={`${marker.code}-${marker.label}`}
        />
      ))}
    </div>
  );
}

function isExceptionItem(item: ApprovalBatchItem) {
  const actionCode = item.request.actionCode;
  return (
    actionCode.includes("missing_ma") ||
    actionCode.includes("restore") ||
    actionCode.includes("same_drawing") ||
    actionCode.includes("obsolete") ||
    item.request.entitySummary.recordStatus === "MainDrawingInvalid" ||
    item.request.markers?.some((marker) => marker.code === "override" || marker.code === "impact_scope")
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultPanel({ message }: { message: string }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>審核結果</h2>
          <p style={mutedTextStyle}>{message}</p>
        </div>
        <CheckCircle2 size={20} color="#15803d" />
      </div>
    </section>
  );
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>讀取失敗</h2>
        <p>{message}</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            重試
          </button>
        </div>
      </div>
    </section>
  );
}

function actionLabel(value: string | null) {
  const labels: Record<string, string> = {
    dvt_promotion: "DVT 階段晉升",
    dvt_missing_ma_override: "DVT 缺 MA 例外核准",
    release: "發行審核",
    release_missing_ma_confirm: "發行缺 MA 再確認",
    same_drawing_variant_after_release: "發行後同圖多料號",
    main_drawing_restore: "製造圖恢復",
    obsolete_part_number: "料號作廢",
    obsolete_ma_drawing: "圖號作廢"
  };
  return value ? labels[value] ?? value : "混合審核";
}

function batchStatusLabel(value: BatchStatus) {
  const labels: Record<BatchStatus, string> = {
    pending: "審核中",
    partially_approved: "部分核准",
    approved: "已核准",
    rejected: "已退回",
    needs_info: "待補資料",
    cancelled: "已取消"
  };
  return labels[value];
}

function itemStatusLabel(value: BatchItemStatus) {
  const labels: Record<BatchItemStatus, string> = {
    pending: "審核中",
    approved: "已核准",
    rejected: "已退回",
    needs_info: "待補資料",
    cancelled: "已取消",
    resubmitted: "已重送"
  };
  return labels[value];
}

function decisionLabel(value: ApprovalDecision) {
  if (value === "approved") return "核准";
  if (value === "needs_info") return "要求補資料";
  return "退回";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}

const mutedTextStyle = {
  margin: 0,
  color: "var(--muted)",
  fontSize: "0.82rem"
} as const;

const bodyTextStyle = {
  margin: "0.25rem 0 0",
  color: "var(--muted)",
  fontSize: "0.86rem",
  lineHeight: 1.45
} as const;

const reviewLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: "1rem",
  alignItems: "start"
} as const;

const commentGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: "0.75rem",
  padding: "12px 16px 16px"
} as const;

const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  color: "var(--muted)",
  fontSize: "0.84rem",
  fontWeight: 700
} as const;

const decisionPanelStyle = {
  display: "grid",
  gap: "0.45rem",
  alignContent: "start"
} as const;

const actionGroupStyle = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center"
} as const;

const markerStackStyle = {
  display: "grid",
  gap: "0.35rem",
  justifyItems: "start"
} as const;

const markerListStyle = {
  display: "flex",
  gap: "0.35rem",
  flexWrap: "wrap",
  alignItems: "center"
} as const;
