"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, GitCompareArrows, RefreshCw, XCircle } from "lucide-react";
import { LifecycleStageGuidance } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { WorkflowStrip } from "@/components/workflow-strip";

type ComparableLine = {
  key: string;
  node_type: "item" | "group";
  label: string;
  part_number: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  parent_path: string;
  level: number;
  sequence_no: number;
};

type DiffChange = {
  key: string;
  change_type: "added" | "removed" | "changed" | "unchanged";
  label: string;
  before: ComparableLine | null;
  after: ComparableLine | null;
  changed_fields: string[];
};

type PendingReview = {
  id: string;
  bom_draft_id: string;
  status: "PendingReview";
  lifecycle_action: "release" | "obsolete";
  submitted_by_name: string | null;
  change_reason: string;
  submitted_at: string;
  parent_submission_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  draft_name: string;
  review_attempt: number;
  diff: {
    base_snapshot: { id: string; released_at: string; parent_revision: string; line_count: number } | null;
    summary: {
      added_count: number;
      removed_count: number;
      changed_count: number;
      unchanged_count: number;
    };
    changes: DiffChange[];
  };
};

const REVIEW_ACTION_LABELS: Record<PendingReview["lifecycle_action"], { title: string; approve: string; reject: string; approved: string; rejected: string }> = {
  release: {
    title: "發布審核",
    approve: "核准發布",
    reject: "退回修改",
    approved: "BOM 已核准發布",
    rejected: "BOM 已退回"
  },
  obsolete: {
    title: "作廢審核",
    approve: "核准作廢",
    reject: "退回申請",
    approved: "BOM 已核准作廢",
    rejected: "BOM 作廢申請已退回"
  }
};

const CHANGE_LABELS: Record<DiffChange["change_type"], string> = {
  added: "新增",
  removed: "移除",
  changed: "變更",
  unchanged: "未變更"
};

const FIELD_LABELS: Record<string, string> = {
  quantity: "數量",
  hierarchy: "階層",
  revision: "版次",
  sequence: "排序",
  line: "項目"
};

export default function BomReviewsPage() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [approvedSnapshotId, setApprovedSnapshotId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedReviewId) ?? reviews[0] ?? null,
    [reviews, selectedReviewId]
  );
  const visibleChanges = useMemo(
    () => selectedReview?.diff.changes.filter((change) => change.change_type !== "unchanged") ?? [],
    [selectedReview]
  );
  const selectedActionLabels = selectedReview ? REVIEW_ACTION_LABELS[selectedReview.lifecycle_action] : REVIEW_ACTION_LABELS.release;

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const issues = Array.isArray(body.issues) ? ` ${JSON.stringify(body.issues)}` : "";
      throw new Error(`${String(body.error ?? `HTTP ${response.status}`)}${issues}`);
    }
    return body as T;
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ reviews: PendingReview[] }>("/api/bom/reviews/pending");
      setReviews(body.reviews ?? []);
      setSelectedReviewId((current) => (body.reviews?.some((review) => review.id === current) ? current : body.reviews?.[0]?.id ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入 BOM 審核清單失敗");
    } finally {
      setLoading(false);
    }
  }, [requestJson]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function decide(kind: "approve" | "reject") {
    if (!selectedReview) return;
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ result?: { snapshotId?: string } }>(`/api/bom/reviews/${selectedReview.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ decisionReason })
      });
      const labels = REVIEW_ACTION_LABELS[selectedReview.lifecycle_action];
      setMessage(kind === "approve" ? labels.approved : labels.rejected);
      setApprovedSnapshotId(kind === "approve" ? body.result?.snapshotId ?? "" : "");
      setDecisionReason("");
      await loadReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOM 審核操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bom-review-page" aria-label="BOM 審核">
      <header className="bom-review-header">
        <div>
          <p className="eyebrow">BOM 審核</p>
          <h1>BOM 審核</h1>
          <p>主管集中處理 BOM 發布與正式作廢審核；作廢核准後會進入受控歷史。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadReviews} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      <WorkflowStrip
        title="差異審核流程"
        description="集中比較 BOM 差異、核准發行，核准後輸出已發布 BOM 與交接資料。"
        steps={["選主件", "編輯 BOM", "送審", "發行", "交接"]}
        currentStep="送審"
        actions={[
          { href: "/bom/workbench", label: "回 BOM 工作台" },
          { href: "/handoff", label: "看交接輸出", variant: "primary" }
        ]}
      />

      <LifecycleStageGuidance
        activeStage="bom"
        metrics={[
          { label: "審核中 BOM", value: reviews.length, tone: reviews.length > 0 ? "warning" : "success" },
          { label: "新增", value: selectedReview?.diff.summary.added_count ?? 0 },
          { label: "移除", value: selectedReview?.diff.summary.removed_count ?? 0 },
          { label: "變更", value: selectedReview?.diff.summary.changed_count ?? 0 }
        ]}
      />

      {(message || error) && (
        <div className={error ? "bom-workbench-alert error" : "bom-workbench-alert"}>
          <span>{error || message}</span>
          <button type="button" onClick={() => (error ? setError("") : setMessage(""))} aria-label="關閉訊息">
            ×
          </button>
        </div>
      )}

      <div className="bom-review-layout">
        <aside className="panel bom-review-list-panel">
          <div className="panel-header">
            <h2>審核中 BOM</h2>
            <ClipboardCheck size={16} aria-hidden="true" />
          </div>
          <div className="bom-panel-body">
            {reviews.map((review) => (
              <button
                className={review.id === selectedReview?.id ? "bom-review-card active" : "bom-review-card"}
                key={review.id}
                type="button"
                onClick={() => setSelectedReviewId(review.id)}
              >
                <strong>{review.parent_part_number} Rev {review.parent_revision}</strong>
                <span className="badge PendingReview">{REVIEW_ACTION_LABELS[review.lifecycle_action].title}</span>
                <span>{review.parent_part_name}</span>
                <small>{review.draft_name} · 第 {review.review_attempt} 次送審</small>
                <small>
                  +{review.diff.summary.added_count} / -{review.diff.summary.removed_count} / Δ{review.diff.summary.changed_count}
                </small>
              </button>
            ))}
            {reviews.length === 0 && (
              <NextStepState
                compact
                eyebrow="沒有審核中項目"
                title="目前沒有審核中 BOM"
                body="若要建立新的審核中項目，請先回 BOM 工作台建立或送出草稿；若已發行，可查看交接輸出。"
                actions={[
                  { href: "/bom/workbench", label: "回 BOM 工作台", variant: "primary" },
                  { href: "/handoff", label: "看交接" }
                ]}
              />
            )}
          </div>
        </aside>

        <main className="panel bom-review-diff-panel">
          <div className="panel-header">
            <h2>{selectedReview ? `${selectedReview.parent_part_number} 差異` : "差異"}</h2>
            <GitCompareArrows size={16} aria-hidden="true" />
          </div>
          <div className="bom-panel-body">
            {selectedReview ? (
              <>
                <div className="bom-review-summary-grid">
                  <Metric label="新增" value={selectedReview.diff.summary.added_count} />
                  <Metric label="移除" value={selectedReview.diff.summary.removed_count} />
                  <Metric label="變更" value={selectedReview.diff.summary.changed_count} />
                  <Metric label="未變更" value={selectedReview.diff.summary.unchanged_count} />
                </div>
                <div className="bom-review-context">
                  <div>
                    <span>主件</span>
                    <strong>{selectedReview.parent_part_name}</strong>
                    <small>{selectedReview.parent_drawing_number} · Rev {selectedReview.parent_revision}</small>
                  </div>
                  <div>
                    <span>上一份已發布 BOM</span>
                    <strong>{selectedReview.diff.base_snapshot ? `已發布 ${selectedReview.diff.base_snapshot.parent_revision}` : "無基準"}</strong>
                    <small>{selectedReview.diff.base_snapshot?.released_at ?? "首次發布時所有項目視為新增"}</small>
                  </div>
                  <div>
                    <span>{selectedActionLabels.title}原因</span>
                    <strong>{selectedReview.change_reason}</strong>
                    <small>{selectedReview.submitted_by_name ?? selectedReview.submitted_at}</small>
                  </div>
                </div>
                <div className="bom-review-diff-table" role="table" aria-label="BOM 差異">
                  <div className="bom-review-diff-row header" role="row">
                    <span>類型</span>
                    <span>項目</span>
                    <span>變更前</span>
                    <span>變更後</span>
                    <span>欄位</span>
                  </div>
                  {visibleChanges.map((change) => (
                    <div className={`bom-review-diff-row ${change.change_type}`} role="row" key={change.key}>
                      <span>{CHANGE_LABELS[change.change_type]}</span>
                      <strong>{change.label}</strong>
                      <span>{formatLine(change.before)}</span>
                      <span>{formatLine(change.after)}</span>
                      <span>{change.changed_fields.map((field) => FIELD_LABELS[field] ?? field).join("、")}</span>
                    </div>
                  ))}
                  {visibleChanges.length === 0 && (
                    <NextStepState
                      compact
                      eyebrow="差異比對"
                      title="與上一份已發布 BOM 無差異"
                      body="若送審理由仍成立，可完成審核決策；若不需發行，請退回並補上原因。"
                      actions={[
                        { href: "/bom/workbench", label: "回 BOM 工作台", variant: "primary" },
                        { href: "/handoff", label: "看交接" }
                      ]}
                    />
                  )}
                </div>
              </>
            ) : (
              <NextStepState
                compact
                eyebrow="尚未選取"
                title="選擇審核中 BOM 後顯示差異"
                body="請從左側審核中清單選擇一筆 BOM；若清單為空，回 BOM 工作台建立送審。"
                actions={[{ href: "/bom/workbench", label: "回 BOM 工作台", variant: "primary" }]}
              />
            )}
          </div>
        </main>

        <aside className="panel bom-review-decision-panel">
          <div className="panel-header">
            <h2>審核決策</h2>
          </div>
          <div className="bom-panel-body">
            <label className="bom-field">
              <span>主管意見</span>
              <textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="核准或退回原因" />
            </label>
            <button className="primary-button" type="button" onClick={() => decide("approve")} disabled={!selectedReview || loading}>
              <CheckCircle2 size={16} aria-hidden="true" />
              {selectedActionLabels.approve}
            </button>
            <button className="danger-button" type="button" onClick={() => decide("reject")} disabled={!selectedReview || loading}>
              <XCircle size={16} aria-hidden="true" />
              {selectedActionLabels.reject}
            </button>
            {approvedSnapshotId && (
              <div className="bom-review-export-links">
                <strong>已發布快照匯出</strong>
                <a className="secondary-button" href={`/api/bom/releases/${approvedSnapshotId}/export?format=xlsx`}>
                  匯出 XLSX
                </a>
                <a className="secondary-button" href={`/api/bom/releases/${approvedSnapshotId}/export?format=csv`}>
                  匯出 CSV
                </a>
              </div>
            )}
            <p className="bom-review-note">若發布關卡偵測到缺件、審核中、已退回、已作廢或不是最新版已發布子件，核准會被系統阻擋。</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bom-review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatLine(line: ComparableLine | null) {
  if (!line) return "-";
  const qty = line.node_type === "item" ? `數量 ${line.quantity ?? 1}` : "群組";
  const revision = line.revision ? `版次 ${line.revision}` : "";
  return `${qty} ${revision} @ ${line.parent_path}`;
}
