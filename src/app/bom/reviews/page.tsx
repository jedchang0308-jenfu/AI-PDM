"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, GitCompareArrows, RefreshCw, XCircle } from "lucide-react";
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
      setMessage(kind === "approve" ? "BOM 已核准發布" : "BOM 已退回");
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
          <p className="eyebrow">BOM Review</p>
          <h1>BOM 審核</h1>
          <p>主管先看與上一份 Released BOM 的差異，再決定核准發布或退回工程師修改。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadReviews} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      <WorkflowStrip
        title="差異審核流程"
        description="集中比較 BOM 差異、核准發行，核准後輸出 Released BOM 與交接資料。"
        steps={["選主件", "編輯 BOM", "送審", "發行", "交接"]}
        currentStep="送審"
        actions={[
          { href: "/bom/workbench", label: "回 BOM 工作台" },
          { href: "/handoff", label: "看交接輸出", variant: "primary" }
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
            <h2>待審 BOM</h2>
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
                <span>{review.parent_part_name}</span>
                <small>{review.draft_name} · Attempt {review.review_attempt}</small>
                <small>
                  +{review.diff.summary.added_count} / -{review.diff.summary.removed_count} / Δ{review.diff.summary.changed_count}
                </small>
              </button>
            ))}
            {reviews.length === 0 && (
              <NextStepState
                compact
                eyebrow="沒有待審"
                title="目前沒有待審 BOM"
                body="若要建立新的待審項目，請先回 BOM 工作台建立或送出 Draft；若已發行，可查看交接輸出。"
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
                    <span>Parent</span>
                    <strong>{selectedReview.parent_part_name}</strong>
                    <small>{selectedReview.parent_drawing_number} · Rev {selectedReview.parent_revision}</small>
                  </div>
                  <div>
                    <span>上一份 Released BOM</span>
                    <strong>{selectedReview.diff.base_snapshot ? `Released ${selectedReview.diff.base_snapshot.parent_revision}` : "無基準"}</strong>
                    <small>{selectedReview.diff.base_snapshot?.released_at ?? "首次發布時所有項目視為新增"}</small>
                  </div>
                  <div>
                    <span>送審原因</span>
                    <strong>{selectedReview.change_reason}</strong>
                    <small>{selectedReview.submitted_by_name ?? selectedReview.submitted_at}</small>
                  </div>
                </div>
                <div className="bom-review-diff-table" role="table" aria-label="BOM 差異">
                  <div className="bom-review-diff-row header" role="row">
                    <span>類型</span>
                    <span>項目</span>
                    <span>Before</span>
                    <span>After</span>
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
                      title="與上一份 Released BOM 無差異"
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
                title="選擇待審 BOM 後顯示差異"
                body="請從左側待審清單選擇一筆 BOM；若清單為空，回 BOM 工作台建立送審。"
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
              核准發布
            </button>
            <button className="danger-button" type="button" onClick={() => decide("reject")} disabled={!selectedReview || loading}>
              <XCircle size={16} aria-hidden="true" />
              退回修改
            </button>
            {approvedSnapshotId && (
              <div className="bom-review-export-links">
                <strong>Released Snapshot 匯出</strong>
                <a className="secondary-button" href={`/api/bom/releases/${approvedSnapshotId}/export?format=xlsx`}>
                  匯出 XLSX
                </a>
                <a className="secondary-button" href={`/api/bom/releases/${approvedSnapshotId}/export?format=csv`}>
                  匯出 CSV
                </a>
              </div>
            )}
            <p className="bom-review-note">若 Release Gate 偵測到缺件、Pending、Rejected、Obsolete 或非最新版 Released 子件，核准會被 API 阻擋。</p>
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
  const qty = line.node_type === "item" ? `Qty ${line.quantity ?? 1}` : "Group";
  const revision = line.revision ? `Rev ${line.revision}` : "";
  return `${qty} ${revision} @ ${line.parent_path}`;
}
