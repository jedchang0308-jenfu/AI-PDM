import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewTransferPackagePage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const sourceType = firstValue(params.sourceType) || "drawing";
  const sourceId = firstValue(params.sourceId);
  const sourceLabel = firstValue(params.sourceLabel) || sourceId || "未帶入來源";
  const caseType = firstValue(params.caseType) || "design_change_case";
  const sourceHref =
    sourceType === "drawing" && sourceId
      ? `/drawings/${encodeURIComponent(sourceId)}/submission-workbench`
      : sourceType === "part" && sourceId
        ? `/parts?query=${encodeURIComponent(sourceId)}`
        : "/numbering/search";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>技術移轉包</h1>
          <p>Phase 1 先建立 package context，正式簽核、快照與移轉送審建立仍待後續階段開放。</p>
        </div>
        <Link className="secondary-button" href="/numbering/search">
          回圖料查詢
        </Link>
      </div>

      <section className="panel" data-transfer-package-placeholder="true">
        <div className="panel-header">
          <div>
            <h2>移轉包 context</h2>
            <p style={mutedStyle}>來源項目已帶入；此頁不會建立單一圖號正式送審，也不會變更主檔生命週期。</p>
          </div>
          <span className="section-label">DEV-005 Phase 1</span>
        </div>

        <div style={summaryGridStyle}>
          <div className="info-block">
            <strong>來源類型</strong>
            <p>{sourceType === "drawing" ? "圖號" : sourceType === "part" ? "料號" : sourceType}</p>
          </div>
          <div className="info-block">
            <strong>來源項目</strong>
            <p>{sourceLabel}</p>
          </div>
          <div className="info-block">
            <strong>案件類型</strong>
            <p>{caseType === "development_case" ? "開發案" : caseType === "design_change_case" ? "設變案" : "一般審查"}</p>
          </div>
          <div className="info-block">
            <strong>正式送審</strong>
            <p>未開放</p>
          </div>
        </div>

        <div className="upload-message error" style={messageStyle}>
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p>技術移轉正式送審尚未開放。</p>
            <p style={mutedStyle}>Phase 1 只允許從圖號或料號切到移轉包 context，避免把技術移轉誤建成單一物件正式送審。</p>
          </div>
        </div>

        <div className="upload-message success" style={messageStyle}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <p>來源項目已預帶入移轉包脈絡，後續階段會補齊多項目包、規則快照、簽核與失效重算。</p>
        </div>

        <div className="next-step-inline-actions">
          <Link className="primary-button" href={sourceHref}>
            回來源項目
          </Link>
          <Link className="secondary-button" href="/numbering/search">
            查詢其他圖料
          </Link>
        </div>
      </section>
    </>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem",
  marginBottom: "0.85rem"
};

const messageStyle: CSSProperties = {
  alignItems: "flex-start"
};

const mutedStyle: CSSProperties = {
  color: "var(--muted)"
};
