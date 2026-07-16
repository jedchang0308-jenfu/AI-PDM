"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, Loader2, PackagePlus, RefreshCw } from "lucide-react";

type Tab = "prepared" | "review" | "published";

type WorkingPackage = {
  id: string;
  packageCode: string;
  title: string;
  caseType: string;
  status: string;
  ownerId: string;
  rowVersion: number;
  officialItemCount: number;
  draftItemCount: number;
  reviewRequestId: string | null;
  releaseFailureCorrelationId: string | null;
  updatedAt: string;
};

type PublishedPackage = {
  id: string;
  packageCode: string;
  title: string;
  caseType: string;
  publishedAt: string;
  items: Array<{ type: string; id: string; code: string }>;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "prepared", label: "準備中" },
  { id: "review", label: "審核中" },
  { id: "published", label: "已發布交接" }
];

const statusLabel: Record<string, string> = {
  Draft: "草稿",
  NeedsInfo: "待補資料",
  InReview: "審核中",
  ApprovedPendingPublish: "已核准，待發布",
  ReleaseFailed: "發布失敗",
  Published: "已發布"
};

function errorMessage(body: unknown) {
  if (!body || typeof body !== "object") return "技轉資料讀取失敗。";
  const value = body as { error?: { message?: string }; message?: string };
  return value.error?.message ?? value.message ?? "技轉資料讀取失敗。";
}

export function TechnicalTransferWorkspace({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [packages, setPackages] = useState<Array<WorkingPackage | PublishedPackage>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selected: Tab, allowPublishedFallback = true) => {
    setLoading(true);
    setError("");
    try {
      let effectiveTab = selected;
      if (selected !== "published" && allowPublishedFallback) {
        const identityResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const identity = await identityResponse.json().catch(() => null) as { user?: { role?: string } } | null;
        if (["Manufacturing", "Procurement"].includes(identity?.user?.role ?? "")) {
          effectiveTab = "published";
          setTab("published");
          window.history.replaceState(null, "", "/technical-transfer?tab=published");
        }
      }
      let response = await fetch(`/api/technical-transfer?tab=${effectiveTab}`, { cache: "no-store" });
      let body = await response.json().catch(() => null) as { packages?: Array<WorkingPackage | PublishedPackage> } | null;
      if (response.status === 403 && effectiveTab !== "published" && allowPublishedFallback) {
        effectiveTab = "published";
        setTab("published");
        window.history.replaceState(null, "", "/technical-transfer?tab=published");
        response = await fetch("/api/technical-transfer?tab=published", { cache: "no-store" });
        body = await response.json().catch(() => null) as { packages?: Array<WorkingPackage | PublishedPackage> } | null;
      }
      if (!response.ok) throw new Error(errorMessage(body));
      setPackages(body?.packages ?? []);
    } catch (loadError) {
      setPackages([]);
      setError(loadError instanceof Error ? loadError.message : "技轉資料讀取失敗。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  function selectTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `/technical-transfer?tab=${next}`);
  }

  return (
    <div className="technical-transfer-page">
      <header className="topbar technical-transfer-header">
        <div>
          <h1>技術移轉</h1>
          <p>從案件準備、整包審核到正式交接的單一入口</p>
        </div>
        {tab !== "published" ? (
          <Link className="primary-button" href="/transfer-packages/new?returnTo=%2Ftechnical-transfer%3Ftab%3Dprepared">
            <PackagePlus size={17} aria-hidden="true" />
            建立技轉包
          </Link>
        ) : null}
      </header>

      <nav className="technical-transfer-tabs" aria-label="技轉狀態">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : undefined}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="technical-transfer-list" aria-busy={loading}>
        <div className="technical-transfer-list-header">
          <div>
            <strong>{tabs.find((item) => item.id === tab)?.label}</strong>
            <span>{loading ? "讀取中" : `${packages.length} 件`}</span>
          </div>
          <button className="icon-button" type="button" onClick={() => void load(tab)} title="重新整理" aria-label="重新整理">
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="technical-transfer-empty" role="status">
            <Loader2 className="spin" size={22} aria-hidden="true" />
            <span>正在讀取技轉案件</span>
          </div>
        ) : error ? (
          <div className="technical-transfer-empty technical-transfer-error" role="alert">
            <AlertTriangle size={22} aria-hidden="true" />
            <strong>{error}</strong>
            <button className="secondary-button" type="button" onClick={() => void load(tab)}>重試</button>
          </div>
        ) : packages.length === 0 ? (
          <div className="technical-transfer-empty">
            {tab === "published" ? <CheckCircle2 size={24} aria-hidden="true" /> : <ClipboardCheck size={24} aria-hidden="true" />}
            <strong>{tab === "published" ? "目前沒有已發布交接" : "目前沒有此狀態的技轉包"}</strong>
          </div>
        ) : (
          <div className="technical-transfer-rows">
            {packages.map((pkg) => "publishedAt" in pkg ? (
              <article className="technical-transfer-row" key={pkg.id}>
                <div className="technical-transfer-code">
                  <strong>{pkg.packageCode}</strong>
                  <span>已發布</span>
                </div>
                <div className="technical-transfer-title">
                  <strong>{pkg.title}</strong>
                  <span>{pkg.items.length} 個正式項目 · {new Date(pkg.publishedAt).toLocaleString("zh-TW")}</span>
                </div>
                <a className="icon-button" href={`/api/technical-transfer/${encodeURIComponent(pkg.id)}/export`} title="匯出正式交接" aria-label={`匯出 ${pkg.packageCode} 正式交接`}>
                  <Download size={17} aria-hidden="true" />
                </a>
              </article>
            ) : (
              <article className="technical-transfer-row" key={pkg.id}>
                <div className="technical-transfer-code">
                  <strong>{pkg.packageCode}</strong>
                  <span className={`technical-transfer-status status-${pkg.status.toLowerCase()}`}>{statusLabel[pkg.status] ?? pkg.status}</span>
                </div>
                <div className="technical-transfer-title">
                  <strong>{pkg.title}</strong>
                  <span>正式 {pkg.officialItemCount} · 草稿 {pkg.draftItemCount} · 更新 {new Date(pkg.updatedAt).toLocaleString("zh-TW")}</span>
                  {pkg.releaseFailureCorrelationId ? <small>追蹤碼：{pkg.releaseFailureCorrelationId}</small> : null}
                </div>
                <div className="technical-transfer-actions">
                  {pkg.reviewRequestId && pkg.status === "InReview" ? (
                    <Link className="secondary-button" href={`/approvals?requestId=${encodeURIComponent(pkg.reviewRequestId)}`}>查看審核</Link>
                  ) : null}
                  <Link className="secondary-button" href={`/transfer-packages/${encodeURIComponent(pkg.id)}`}>開啟案件</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
