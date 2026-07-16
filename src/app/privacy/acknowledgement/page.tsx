"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";

type PrivacyStatusResponse = {
  enforced?: boolean;
  required?: boolean;
  pendingSession?: boolean;
  status?: {
    requiredVersion: string;
    requiredContentSha256: string;
    effectiveAt: string | null;
    acknowledgedVersion: string | null;
    acknowledgedAt: string | null;
    status: "acknowledged" | "reacknowledgement_required" | "not_acknowledged";
  };
  notice?: {
    version: string;
    title: string;
    summary: string[];
    acknowledgementLabel: string;
  };
  error?: string;
  message?: string;
};

function safeReturnTo() {
  const candidate = new URLSearchParams(window.location.search).get("returnTo") ?? "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/";
  return candidate.startsWith("/privacy/acknowledgement") ? "/" : candidate;
}

export default function PrivacyAcknowledgementPage() {
  const [state, setState] = useState<PrivacyStatusResponse | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    setReturnTo(safeReturnTo());
    fetch("/api/privacy/acknowledgements/current", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as PrivacyStatusResponse;
        if (!response.ok) throw new Error(body.message ?? "確認工作階段已失效，請重新登入。");
        setState(body);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "無法載入告知事項。"))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acknowledged || !state?.notice) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/privacy/acknowledgements/current", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acknowledged: true,
          noticeVersion: state.notice.version,
          requestId: crypto.randomUUID(),
          returnTo
        })
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; returnTo?: string };
      if (!response.ok) throw new Error(body.message ?? "確認紀錄未完成，請稍後重試。");
      window.location.href = body.returnTo ?? returnTo;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "確認紀錄未完成，請稍後重試。");
      setSubmitting(false);
    }
  }

  const alreadyAcknowledged = state?.status?.status === "acknowledged";

  return (
    <div className="privacy-ack-page">
      <section className="privacy-ack-panel" aria-busy={loading || submitting}>
        <div className="privacy-ack-heading">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <h1>閱讀個人資料告知事項</h1>
            <p>完成目前版本的閱讀確認後，才能進入 AI PDM。</p>
          </div>
        </div>

        {loading ? <p className="privacy-ack-state">正在載入目前版本...</p> : null}
        {!loading && error ? (
          <div className="form-error" role="alert">
            {error}
            <Link href="/login">重新登入</Link>
          </div>
        ) : null}
        {!loading && state?.enforced === false ? (
          <div className="privacy-ack-state">
            <p>目前登入模式不需要額外確認。</p>
            <Link className="primary-button" href={returnTo}>繼續</Link>
          </div>
        ) : null}
        {!loading && state?.notice && alreadyAcknowledged ? (
          <div className="privacy-ack-state">
            <p>版本 {state.notice.version} 已完成確認，不需要再次操作。</p>
            <Link className="primary-button" href={returnTo}>
              繼續
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        ) : null}
        {!loading && state?.notice && state.enforced !== false && !alreadyAcknowledged ? (
          <form className="privacy-ack-form" onSubmit={submit}>
            <div className="privacy-activation-summary" aria-label="個人資料告知摘要">
              {state.notice.summary.map((item) => <p key={item}>{item}</p>)}
              <Link href="/privacy" target="_blank">
                查看完整告知
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className="privacy-version-label">目前版本：Pilot v{state.notice.version}</p>
            <label className="privacy-acknowledgement-control">
              <input
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                type="checkbox"
              />
              <span>{state.notice.acknowledgementLabel}</span>
            </label>
            <button className="primary-button" disabled={!acknowledged || submitting} type="submit">
              {submitting ? "正在記錄..." : "確認並繼續"}
              {!submitting ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </button>
            <p className="privacy-ack-help">若不確認，帳號不會啟用本次 AI PDM 使用權；可關閉此頁或聯絡系統管理員。</p>
          </form>
        ) : null}
      </section>
    </div>
  );
}
