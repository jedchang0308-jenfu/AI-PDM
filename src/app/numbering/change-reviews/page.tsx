"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Send, Undo2 } from "lucide-react";

type ReviewAction =
  | "confirm-bom-no-revision"
  | "confirm-original-part-reuse"
  | "return-for-replacement-part"
  | "approve-confirmed-impact-release";

type ReviewOutcome = "no_impact" | "suspected_impact" | "confirmed_impact";

type PendingReview = {
  id: string;
  drawingNumber: string | null;
  revision: string;
  outcome: ReviewOutcome;
  reasonCategory: string | null;
  replacementReservedPartNumber: string | null;
  assessedAt: string;
};

const actions: { value: ReviewAction; label: string }[] = [
  { value: "confirm-bom-no-revision", label: "確認 BOM 不進版" },
  { value: "confirm-original-part-reuse", label: "確認沿用原料號" },
  { value: "return-for-replacement-part", label: "退回補新料號" },
  { value: "approve-confirmed-impact-release", label: "核准新料號與新版圖面發行" }
];

const outcomeLabels: Record<ReviewOutcome, string> = {
  no_impact: "FFF 無影響",
  suspected_impact: "FFF 疑似影響",
  confirmed_impact: "FFF 確認影響"
};

function recommendedAction(outcome: ReviewOutcome): ReviewAction {
  if (outcome === "confirmed_impact") return "approve-confirmed-impact-release";
  if (outcome === "suspected_impact") return "confirm-original-part-reuse";
  return "confirm-bom-no-revision";
}

export default function ChangeReviewPage() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [action, setAction] = useState<ReviewAction>("confirm-bom-no-revision");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedReview = useMemo(() => reviews.find((review) => review.id === selectedReviewId) ?? null, [reviews, selectedReviewId]);

  async function loadPendingReviews() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/numbering/reviews/pending");
      const body = (await response.json().catch(() => ({}))) as { reviews?: PendingReview[]; error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? body.message ?? "載入審核中項目失敗");
      const nextReviews = body.reviews ?? [];
      setReviews(nextReviews);
      const nextSelected = nextReviews.some((review) => review.id === selectedReviewId) ? selectedReviewId : nextReviews[0]?.id ?? "";
      setSelectedReviewId(nextSelected);
      const review = nextReviews.find((item) => item.id === nextSelected);
      if (review) setAction(recommendedAction(review.outcome));
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入審核中項目失敗");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadPendingReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectReview(review: PendingReview) {
    setSelectedReviewId(review.id);
    setAction(recommendedAction(review.outcome));
    setMessage("");
    setError("");
  }

  async function submitAction() {
    if (!selectedReview) return;
    setBusy(true);
    setMessage("");
    setError("");
    const response = await fetch(`/api/numbering/reviews/${encodeURIComponent(selectedReview.id)}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: result.trim() || null })
    });
    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? body.message ?? "審核動作失敗");
      return;
    }
    setMessage(
      action === "approve-confirmed-impact-release"
        ? `已完成發行交易，BOM 重新確認 ${body.bomReconfirmationFlagCount ?? 0} 筆`
        : "已記錄審核確認"
    );
    setResult("");
    await loadPendingReviews();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖面進版影響審核</h1>
          <p>處理圖面進版後是否需換料號、沿用原料號或同步發行新版圖面的審核確認。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPendingReviews} disabled={busy}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>審核中項目</h2>
            <p style={mutedTextStyle}>系統列出尚未完成料號影響確認的圖面進版項目。</p>
          </div>
          <span className="badge">{reviews.length} Pending</span>
        </div>
        <div style={reviewListStyle}>
          {reviews.map((review) => (
            <button
              key={review.id}
              type="button"
              style={review.id === selectedReviewId ? selectedReviewCardStyle : reviewCardStyle}
              onClick={() => selectReview(review)}
            >
              <strong>{review.drawingNumber ?? review.id} Rev {review.revision}</strong>
              <span>{outcomeLabels[review.outcome]} · {review.reasonCategory ?? "未填原因"}</span>
              <small>{review.replacementReservedPartNumber ? `新料號 ${review.replacementReservedPartNumber}` : "沿用原料號"}</small>
            </button>
          ))}
          {reviews.length === 0 ? <p style={mutedTextStyle}>目前沒有審核中的圖面進版影響項目。</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>審核動作</h2>
            <p style={mutedTextStyle}>後端會依 FFF outcome 拒絕不相容的審核動作。</p>
          </div>
          <button className="primary-button" type="button" onClick={submitAction} disabled={busy || !selectedReview}>
            {action === "return-for-replacement-part" ? <Undo2 size={16} /> : action === "approve-confirmed-impact-release" ? <Send size={16} /> : <CheckCircle2 size={16} />}
            執行
          </button>
        </div>

        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>目前項目</span>
            <input className="text-input" value={selectedReview ? `${selectedReview.drawingNumber ?? selectedReview.id} Rev ${selectedReview.revision}` : ""} readOnly />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>動作</span>
            <select className="dropdown-select" value={action} onChange={(event) => setAction(event.target.value as ReviewAction)} disabled={!selectedReview}>
              {actions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>結果備註</span>
            <input className="text-input" value={result} onChange={(event) => setResult(event.target.value)} disabled={!selectedReview} />
          </label>
        </div>

        {message ? <p style={successTextStyle}>{message}</p> : null}
        {error ? <p style={errorTextStyle}>{error}</p> : null}
      </section>
    </>
  );
}

const mutedTextStyle: CSSProperties = { color: "#64748b", fontSize: "0.85rem" };
const errorTextStyle: CSSProperties = { color: "#b91c1c", fontSize: "0.9rem", fontWeight: 700 };
const successTextStyle: CSSProperties = { color: "#047857", fontSize: "0.9rem", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = { color: "#475569", fontSize: "0.78rem", fontWeight: 700 };
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const reviewListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "0.75rem"
};
const reviewCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  padding: "0.75rem",
  border: "1px solid #d7e0ea",
  borderRadius: 8,
  background: "#ffffff",
  textAlign: "left",
  color: "#0f172a",
  cursor: "pointer"
};
const selectedReviewCardStyle: CSSProperties = {
  ...reviewCardStyle,
  borderColor: "#0f766e",
  background: "#ecfdf5"
};
