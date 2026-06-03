"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSearch, Link2, RotateCcw, Search, ShieldAlert } from "lucide-react";

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type EntityType = "all" | "part_root" | "part_number" | "drawing_number";
type NumberingRecordStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type DrawingPurposeCode = "MA" | "OT";

type SearchResult = {
  entityType: Exclude<EntityType, "all">;
  entityId: string;
  rootCode: string;
  displayCode: string;
  displayName: string;
  itemKind: "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  purposeCode: DrawingPurposeCode | null;
  partNumber: string | null;
  drawingNumber: string | null;
  primaryDrawingNumber: string | null;
  partCount: number;
  drawingCount: number;
  linkedPartCount: number;
  warningCount: number;
};

type PartRoot = {
  id: string;
  rootCode: string;
  coreName: string;
  itemKind: SearchResult["itemKind"];
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

type PartNumber = {
  id: string;
  partRootId: string;
  partNumber: string;
  sequenceNo: number;
  sequenceCode: string;
  partName: string;
  itemKind: SearchResult["itemKind"];
  isUniversal: boolean;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  universalReason: string | null;
  ruleVersionId: string;
};

type DrawingNumber = {
  id: string;
  partRootId: string;
  drawingNumber: string;
  purposeCode: DrawingPurposeCode;
  purposeDescription: string;
  sequenceNo: number;
  isPrimaryManufacturing: boolean;
  developmentPhase: NumberingPhase;
  recordStatus: NumberingRecordStatus;
  ruleVersionId: string;
};

type NumberingLink = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  linkType: "primary_manufacturing" | "reference";
  createdAt: string;
};

type NumberingVariant = {
  id: string;
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  fieldName: string;
  fieldValue: string;
  createdAt: string;
};

type NumberingWarning = {
  id: string;
  warningCode: string;
  severity: "info" | "warning" | "blocker";
  entityType: string;
  entityId: string | null;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

type NumberingAudit = {
  id: string;
  action: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

type RootDetail = {
  root: PartRoot;
  partNumbers: PartNumber[];
  drawingNumbers: DrawingNumber[];
  links: NumberingLink[];
  variants: NumberingVariant[];
  warnings: NumberingWarning[];
  auditTrail: NumberingAudit[];
  summary: {
    partCount: number;
    drawingCount: number;
    primaryManufacturingCount: number;
    warningCount: number;
    hasMainDrawingInvalid: boolean;
  };
};

type ImpactAnalysis = {
  drawingNumber: DrawingNumber;
  applied: boolean;
  impactedPartNumbers: PartNumber[];
  requiredDocuments: string[];
  warnings: string[];
};

const statusOptions: NumberingRecordStatus[] = [
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "EVTDisabled",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
];
const phaseOptions: NumberingPhase[] = ["EVT", "DVT", "PVT", "Release", "ECR"];

export default function NumberingSearchPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("all");
  const [recordStatus, setRecordStatus] = useState("");
  const [developmentPhase, setDevelopmentPhase] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedRootCode, setSelectedRootCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<RootDetail | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [busy, setBusy] = useState<"search" | "detail" | "impact" | null>(null);
  const [error, setError] = useState("");

  const summary = useMemo(
    () => ({
      total: results.length,
      roots: results.filter((result) => result.entityType === "part_root").length,
      parts: results.filter((result) => result.entityType === "part_number").length,
      drawings: results.filter((result) => result.entityType === "drawing_number").length,
      warnings: results.reduce((sum, result) => sum + result.warningCount, 0)
    }),
    [results]
  );

  const loadDetail = useCallback(async (rootCode: string) => {
    setBusy("detail");
    setError("");
    setSelectedRootCode(rootCode);
    setImpact(null);
    const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "圖料號明細讀取失敗");
      setState("error");
      return;
    }
    setDetail(body as RootDetail);
    setState("ready");
  }, []);

  const loadResults = useCallback(async () => {
    setBusy("search");
    setError("");
    const params = new URLSearchParams({ limit: "60" });
    if (query.trim()) params.set("query", query.trim());
    if (entityType !== "all") params.set("entityType", entityType);
    if (recordStatus) params.set("recordStatus", recordStatus);
    if (developmentPhase) params.set("developmentPhase", developmentPhase);
    const response = await fetch(`/api/numbering/search?${params.toString()}`);
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "圖料號查詢失敗");
      setState("error");
      return;
    }
    const nextResults = (body.results ?? []) as SearchResult[];
    setResults(nextResults);
    setState("ready");
    const nextRootCode = nextResults[0]?.rootCode;
    if (nextRootCode) {
      void loadDetail(nextRootCode);
    } else {
      setSelectedRootCode(null);
      setDetail(null);
    }
  }, [developmentPhase, entityType, loadDetail, query, recordStatus]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  async function analyzeImpact(drawingNumber: string) {
    setBusy("impact");
    setError("");
    const response = await fetch("/api/numbering/impact-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drawingNumber, applyInvalidation: false })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "MA 圖作廢影響分析失敗");
      setState("error");
      return;
    }
    setImpact(body as ImpactAnalysis);
    setState("ready");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖料查詢</h1>
          <p>料件、料號與圖號集中查詢，明細標示風險與影響資訊。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadResults}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      {state === "unauthorized" ? <AccessPanel /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadResults} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入圖料號查詢...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>查詢條件</h2>
                <p style={mutedTextStyle}>共 {summary.total} 筆，主根 {summary.roots}、料號 {summary.parts}、圖號 {summary.drawings}。</p>
              </div>
              <button className="primary-button" type="button" onClick={loadResults} disabled={busy === "search"}>
                <Search size={16} />
                查詢
              </button>
            </div>
            <div style={filterGridStyle}>
              <label style={fieldStyle}>
                <span>關鍵字</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="主根號 / 料號 / 圖號 / 名稱" />
              </label>
              <label style={fieldStyle}>
                <span>類型</span>
                <select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType)}>
                  <option value="all">全部</option>
                  <option value="part_root">料件主根</option>
                  <option value="part_number">料號</option>
                  <option value="drawing_number">圖號</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>狀態</span>
                <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
                  <option value="">全部狀態</option>
                  {statusOptions.map((status) => (
                    <option value={status} key={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStyle}>
                <span>階段</span>
                <select value={developmentPhase} onChange={(event) => setDevelopmentPhase(event.target.value)}>
                  <option value="">全部階段</option>
                  {phaseOptions.map((phase) => (
                    <option value={phase} key={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <SearchResultsTable results={results} selectedRootCode={selectedRootCode} onSelect={loadDetail} />
          <RootDetailPanel detail={detail} impact={impact} busy={busy} onAnalyzeImpact={analyzeImpact} />
        </div>
      ) : null}
    </>
  );
}

function SearchResultsTable({
  results,
  selectedRootCode,
  onSelect
}: {
  results: SearchResult[];
  selectedRootCode: string | null;
  onSelect: (rootCode: string) => void;
}) {
  if (results.length === 0) {
    return (
      <section className="panel">
        <EmptyBlock text="沒有符合條件的圖料號資料" />
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>查詢結果</h2>
          <p style={mutedTextStyle}>點選任一列可開啟同主根明細。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "980px" }}>
          <thead>
            <tr>
              <th>類型</th>
              <th>代碼</th>
              <th>名稱 / 用途</th>
              <th>主根號</th>
              <th>狀態</th>
              <th>階段</th>
              <th>關聯</th>
              <th>提示</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr className={selectedRootCode === result.rootCode ? "selected-row" : undefined} key={`${result.entityType}:${result.entityId}`}>
                <td>{entityLabel(result.entityType)}</td>
                <td>
                  <button type="button" style={linkButtonStyle} onClick={() => onSelect(result.rootCode)}>
                    {result.displayCode}
                  </button>
                </td>
                <td>{result.displayName || "-"}</td>
                <td>{result.rootCode}</td>
                <td>
                  <span className={`badge ${result.recordStatus}`}>{result.recordStatus}</span>
                </td>
                <td>{result.developmentPhase}</td>
                <td>{resultRelation(result)}</td>
                <td>
                  <InfoMarkers result={result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RootDetailPanel({
  detail,
  impact,
  busy,
  onAnalyzeImpact
}: {
  detail: RootDetail | null;
  impact: ImpactAnalysis | null;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
}) {
  if (!detail) {
    return (
      <section className="panel">
        <EmptyBlock text={busy === "detail" ? "正在載入明細..." : "尚未選取圖料號"} />
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>主根明細 {detail.root.rootCode}</h2>
          <p style={mutedTextStyle}>{detail.root.coreName}</p>
        </div>
        <div style={actionGroupStyle}>
          {detail.summary.hasMainDrawingInvalid ? <WarningDot title="此主根或料號含 MainDrawingInvalid，恢復可用前需完成重新送審。" /> : null}
          {detail.summary.warningCount > 0 ? <WarningDot title={`尚有 ${detail.summary.warningCount} 則未確認提醒。`} /> : null}
        </div>
      </div>
      <div style={detailBodyStyle}>
        <div className="metrics" style={{ marginBottom: 0 }}>
          <Metric label="料號" value={detail.summary.partCount} />
          <Metric label="圖號" value={detail.summary.drawingCount} />
          <Metric label="MA 圖" value={detail.summary.primaryManufacturingCount} />
          <Metric label="提醒" value={detail.summary.warningCount} />
        </div>

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>料號</h3>
          <div style={cardListStyle}>
            {detail.partNumbers.map((partNumber) => (
              <PartNumberCard partNumber={partNumber} detail={detail} key={partNumber.id} />
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>圖號</h3>
          <div style={cardListStyle}>
            {detail.drawingNumbers.map((drawingNumber) => (
              <DrawingNumberCard drawingNumber={drawingNumber} detail={detail} busy={busy} onAnalyzeImpact={onAnalyzeImpact} key={drawingNumber.id} />
            ))}
          </div>
        </section>

        <WarningsPanel warnings={detail.warnings} />
        <ImpactPanel impact={impact} />
        <AuditPanel auditTrail={detail.auditTrail} />
      </div>
    </section>
  );
}

function PartNumberCard({ partNumber, detail }: { partNumber: PartNumber; detail: RootDetail }) {
  const links = detail.links.filter((link) => link.partNumberId === partNumber.id);
  const variants = detail.variants.filter((variant) => variant.partNumberId === partNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "part_number" && warning.entityId === partNumber.id && !warning.acknowledgedAt);
  const missingPrimaryMa = ["manufactured", "outsourced", "custom"].includes(partNumber.itemKind) && ["DVT", "Release"].includes(partNumber.developmentPhase) && !links.some((link) => link.linkType === "primary_manufacturing");
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{partNumber.partNumber}</strong>
        <span className={`badge ${partNumber.recordStatus}`}>{partNumber.recordStatus}</span>
      </div>
      <div style={mutedTextStyle}>{partNumber.partName}</div>
      <div style={metaRowStyle}>
        <span>{kindLabel(partNumber.itemKind)}</span>
        <span>{partNumber.developmentPhase}</span>
        <span>{partNumber.isUniversal ? "共用件" : `序號 ${partNumber.sequenceCode}`}</span>
      </div>
      <div style={chipsStyle}>
        {links.map((link) => (
          <span style={chipStyle} key={link.id}>
            <Link2 size={13} />
            {link.drawingNumber}
          </span>
        ))}
      </div>
      <div style={actionGroupStyle}>
        {missingPrimaryMa ? <WarningDot title="DVT/Release 自製、發包、客製件缺主要 MA 圖時會被 gate 阻擋，需補圖或走 override。" /> : null}
        {partNumber.recordStatus === "MainDrawingInvalid" ? <WarningDot title="主要 MA 圖已失效，料號需重新送審並指定有效 MA 圖後才能恢復使用。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此料號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
      </div>
    </article>
  );
}

function DrawingNumberCard({
  drawingNumber,
  detail,
  busy,
  onAnalyzeImpact
}: {
  drawingNumber: DrawingNumber;
  detail: RootDetail;
  busy: "search" | "detail" | "impact" | null;
  onAnalyzeImpact: (drawingNumber: string) => void;
}) {
  const links = detail.links.filter((link) => link.drawingNumberId === drawingNumber.id);
  const variants = detail.variants.filter((variant) => variant.drawingNumberId === drawingNumber.id);
  const warnings = detail.warnings.filter((warning) => warning.entityType === "drawing_number" && warning.entityId === drawingNumber.id && !warning.acknowledgedAt);
  return (
    <article style={recordCardStyle}>
      <div style={recordTitleStyle}>
        <strong>{drawingNumber.drawingNumber}</strong>
        <span className={`badge ${drawingNumber.recordStatus}`}>{drawingNumber.recordStatus}</span>
      </div>
      <div style={mutedTextStyle}>{drawingNumber.purposeDescription || purposeLabel(drawingNumber.purposeCode)}</div>
      <div style={metaRowStyle}>
        <span>{drawingNumber.purposeCode}</span>
        <span>{drawingNumber.developmentPhase}</span>
        <span>{drawingNumber.isPrimaryManufacturing ? "主要製造圖" : "參考/其他"}</span>
      </div>
      <div style={chipsStyle}>
        {links.map((link) => (
          <span style={chipStyle} key={link.id}>
            <Link2 size={13} />
            {link.partNumber}
          </span>
        ))}
      </div>
      <div style={actionGroupStyle}>
        {drawingNumber.purposeCode === "OT" ? <WarningDot title="OT 圖必填用途描述，且不可作為主要製造圖。" /> : null}
        {warnings.length > 0 ? <WarningDot title={`此圖號有 ${warnings.length} 則查重或高相似提醒。`} /> : null}
        {variants.length > 0 ? <WarningDot title={`同圖多料號差異欄位：${variants.map((variant) => `${variant.partNumber} ${variant.fieldName}=${variant.fieldValue}`).join("、")}`} /> : null}
        {drawingNumber.purposeCode === "MA" ? (
          <button className="secondary-button" type="button" disabled={busy === "impact"} onClick={() => onAnalyzeImpact(drawingNumber.drawingNumber)}>
            <ShieldAlert size={16} />
            影響範圍
          </button>
        ) : null}
      </div>
    </article>
  );
}

function WarningsPanel({ warnings }: { warnings: NumberingWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>提醒</h3>
      <div style={cardListStyle}>
        {warnings.map((warning) => (
          <div style={recordCardStyle} key={warning.id}>
            <div style={recordTitleStyle}>
              <strong>{warning.title}</strong>
              <span className="badge">{warning.severity}</span>
            </div>
            <div style={mutedTextStyle}>{warning.message}</div>
            <small style={mutedTextStyle}>{warning.warningCode}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImpactPanel({ impact }: { impact: ImpactAnalysis | null }) {
  if (!impact) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>MA 圖作廢影響頁</h3>
      <div style={recordCardStyle}>
        <div style={recordTitleStyle}>
          <strong>{impact.drawingNumber.drawingNumber}</strong>
          <span className="badge">impact</span>
        </div>
        <div style={metaRowStyle}>
          <span>受影響料號 {impact.impactedPartNumbers.length}</span>
          <span>需進版文件 {impact.requiredDocuments.length}</span>
        </div>
        <div style={chipsStyle}>
          {impact.impactedPartNumbers.map((partNumber) => (
            <span style={chipStyle} key={partNumber.id}>
              {partNumber.partNumber}
            </span>
          ))}
          {impact.requiredDocuments.map((documentName) => (
            <span style={chipStyle} key={documentName}>
              {documentName}
            </span>
          ))}
        </div>
        {impact.warnings.length > 0 ? <div style={mutedTextStyle}>{impact.warnings.join("、")}</div> : null}
      </div>
    </section>
  );
}

function AuditPanel({ auditTrail }: { auditTrail: NumberingAudit[] }) {
  if (auditTrail.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>近期異動</h3>
      <div style={cardListStyle}>
        {auditTrail.slice(0, 6).map((audit) => (
          <div style={auditRowStyle} key={audit.id}>
            <span>{audit.action}</span>
            <small style={mutedTextStyle}>{new Date(audit.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoMarkers({ result }: { result: SearchResult }) {
  const markers: string[] = [];
  if (result.warningCount > 0) markers.push(`${result.warningCount} 則未確認提醒`);
  if (result.recordStatus === "MainDrawingInvalid") markers.push("主要 MA 圖失效，需重新送審恢復");
  if (result.recordStatus === "PendingReview") markers.push("審核中，未核准前不可直接視為可用");
  if (result.entityType === "drawing_number" && result.purposeCode === "OT") markers.push("OT 圖不可作主要製造圖");
  if (markers.length === 0) return <span style={mutedTextStyle}>-</span>;
  return (
    <div style={actionGroupStyle}>
      {markers.map((marker) => (
        <WarningDot title={marker} key={marker} />
      ))}
    </div>
  );
}

function WarningDot({ title }: { title: string }) {
  return (
    <button type="button" title={title} aria-label={title} style={warningDotStyle}>
      !
    </button>
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

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="empty">
      <FileSearch size={24} />
      <p>{text}</p>
    </div>
  );
}

function AccessPanel() {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
        <h2>需要登入</h2>
        <p>請先登入後再使用圖料查詢。</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
        <h2>查詢失敗</h2>
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

function entityLabel(entityType: SearchResult["entityType"]) {
  if (entityType === "part_root") return "料件";
  if (entityType === "part_number") return "料號";
  return "圖號";
}

function kindLabel(kind: SearchResult["itemKind"]) {
  const labels: Record<SearchResult["itemKind"], string> = {
    purchased: "外購",
    manufactured: "自製",
    outsourced: "發包",
    shared: "共用",
    custom: "客製"
  };
  return labels[kind] ?? kind;
}

function purposeLabel(purposeCode: DrawingPurposeCode) {
  return purposeCode === "MA" ? "製造用圖" : "其他用途圖";
}

function resultRelation(result: SearchResult) {
  if (result.entityType === "part_root") return `${result.partCount} 料號 / ${result.drawingCount} 圖號`;
  if (result.entityType === "part_number") return result.primaryDrawingNumber ? `MA ${result.primaryDrawingNumber}` : `${result.drawingCount} 張圖`;
  return `${result.linkedPartCount} 料號`;
}

const mutedTextStyle = { color: "var(--muted)" };
const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.75rem",
  padding: "16px"
};
const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  minWidth: 0
};
const linkButtonStyle = {
  border: 0,
  background: "transparent",
  padding: 0,
  color: "var(--accent)",
  fontWeight: 700,
  textAlign: "left" as const
};
const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap" as const
};
const detailBodyStyle = {
  display: "grid",
  gap: "1rem",
  padding: "16px"
};
const sectionStyle = {
  display: "grid",
  gap: "0.6rem",
  minWidth: 0
};
const sectionHeadingStyle = {
  margin: 0,
  fontSize: "15px"
};
const cardListStyle = {
  display: "grid",
  gap: "0.65rem"
};
const recordCardStyle = {
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "12px",
  display: "grid",
  gap: "0.55rem",
  minWidth: 0,
  background: "#fff"
};
const recordTitleStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  flexWrap: "wrap" as const
};
const metaRowStyle = {
  display: "flex",
  gap: "0.75rem",
  color: "var(--muted)",
  flexWrap: "wrap" as const
};
const chipsStyle = {
  display: "flex",
  gap: "0.4rem",
  flexWrap: "wrap" as const
};
const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "3px 8px",
  background: "var(--panel-2)",
  fontSize: "12px"
};
const warningDotStyle = {
  width: "26px",
  height: "26px",
  borderRadius: "999px",
  border: "1px solid #f59e0b",
  color: "#92400e",
  background: "#fffbeb",
  fontWeight: 800
};
const auditRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  borderBottom: "1px solid var(--line)",
  paddingBottom: "0.5rem",
  flexWrap: "wrap" as const
};
