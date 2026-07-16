"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { RiskHint } from "@/components/compact-hints";
import { LifecycleStageGuidance } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { WorkflowStrip } from "@/components/workflow-strip";
import { displayDrawingPurposeLabel } from "@/lib/numbering-identity";
import { formatDevelopmentPhaseForUser, formatStatusForUser } from "@/lib/status-display";

type LoadState = "idle" | "ready" | "unauthorized" | "forbidden" | "error";

type PartNumber = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
  developmentPhase: "EVT" | "DVT" | "PVT" | "Release" | "ECR";
  recordStatus:
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
};

type DrawingNumber = {
  id: string;
  drawingNumber: string;
  purposeCode: "MA" | "OT" | "M" | "R";
  purposeDescription: string;
  developmentPhase: "EVT" | "DVT" | "PVT" | "Release" | "ECR";
  recordStatus: PartNumber["recordStatus"];
  isPrimaryManufacturing: boolean;
};

type ImpactAnalysis = {
  drawingNumber: DrawingNumber;
  applied: boolean;
  impactedPartNumbers: PartNumber[];
  requiredDocuments: string[];
  warnings: string[];
};

export default function NumberingImpactPage() {
  const [drawingNumber, setDrawingNumber] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [busy, setBusy] = useState<"analyze" | "apply" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const initialDrawingNumber = new URLSearchParams(window.location.search).get("drawingNumber")?.trim();
    if (initialDrawingNumber) setDrawingNumber(initialDrawingNumber);
  }, []);

  async function analyze(applyInvalidation = false) {
    setBusy(applyInvalidation ? "apply" : "analyze");
    setError("");
    const response = await fetch("/api/numbering/impact-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drawingNumber,
        reason,
        applyInvalidation
      })
    });
    setBusy(null);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    if (response.status === 403) {
      setState("forbidden");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "製造圖影響分析失敗");
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
          <h1>製造圖影響</h1>
          <p>作廢主要製造圖前，先檢查受影響料號、狀態與進版待辦。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => analyze(false)} disabled={!drawingNumber.trim() || busy === "analyze"}>
          <RotateCcw size={16} />
          重新分析
        </button>
      </div>

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看製造圖影響範圍。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="套用失效需研發主管或管理員權限。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => analyze(false)} /> : null}

      <WorkflowStrip
        title="製造圖影響分析"
        description="作廢或變更前先確認父子圖、BOM 與待辦影響，再決定是否套用。"
        steps={["查詢", "影響分析", "確認作廢", "待辦", "交接"]}
        currentStep="影響分析"
        actions={[
          { href: "/numbering/tasks", label: "看影響待辦", variant: "primary" },
          { href: "/numbering/search", label: "回圖料模組" }
        ]}
      />

      <LifecycleStageGuidance
        activeStage="ecr"
        metrics={[
          {
            label: "Impacted parts",
            value: impact?.impactedPartNumbers.length ?? 0,
            tone: impact && impact.impactedPartNumbers.length > 0 ? "warning" : "neutral"
          },
          {
            label: "Required docs",
            value: impact?.requiredDocuments.length ?? 0,
            tone: impact && impact.requiredDocuments.length > 0 ? "warning" : "neutral"
          },
          { label: "Applied", value: impact?.applied ? "Yes" : "No", tone: impact?.applied ? "success" : "neutral" }
        ]}
      />

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>影響範圍查詢</h2>
              <p style={mutedTextStyle}>輸入製造圖圖號後先分析，不會直接異動主檔。</p>
            </div>
            <button className="primary-button" type="button" onClick={() => analyze(false)} disabled={!drawingNumber.trim() || busy === "analyze"}>
              <Search size={16} />
              分析影響
            </button>
          </div>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              <span>製造圖圖號</span>
              <input value={drawingNumber} onChange={(event) => setDrawingNumber(event.target.value)} placeholder="A0001-M01" />
            </label>
            <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
              <span>作廢原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="供主管審核與 audit 使用" />
            </label>
          </div>
        </section>

        <ImpactResult impact={impact} confirmed={confirmed} busy={busy} onConfirmedChange={setConfirmed} onApply={() => analyze(true)} />
      </div>
    </>
  );
}

function ImpactResult({
  impact,
  confirmed,
  busy,
  onConfirmedChange,
  onApply
}: {
  impact: ImpactAnalysis | null;
  confirmed: boolean;
  busy: "analyze" | "apply" | null;
  onConfirmedChange: (value: boolean) => void;
  onApply: () => void;
}) {
  if (!impact) {
    return (
      <section className="panel">
        <NextStepState
          eyebrow="尚未分析"
          title="尚未產生製造圖作廢影響分析"
          body="輸入製造圖圖號與作廢原因後先分析影響範圍；確認後才可套用失效。"
          actions={[
            { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
            { href: "/numbering/tasks", label: "看待辦" }
          ]}
        />
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>影響範圍</h2>
          <p style={mutedTextStyle}>
            {impact.drawingNumber.drawingNumber}，受影響料號 {impact.impactedPartNumbers.length}，需進版文件 {impact.requiredDocuments.length}
          </p>
        </div>
        <div style={actionGroupStyle}>
          {impact.warnings.length > 0 ? <WarningDot title={impact.warnings.join("、")} /> : null}
          {impact.applied ? <span className="badge Obsolete">已套用失效</span> : null}
        </div>
      </div>
      <div style={bodyStyle}>
        <div className="metrics" style={{ marginBottom: 0 }}>
          <Metric label="受影響料號" value={impact.impactedPartNumbers.length} />
          <Metric label="進版文件" value={impact.requiredDocuments.length} />
          <Metric label="圖別" value={`${impact.drawingNumber.purposeCode} ${displayDrawingPurposeLabel(impact.drawingNumber.purposeCode)}`} />
          <Metric label="狀態" value={formatStatusForUser(impact.drawingNumber.recordStatus, "masterRecord")} />
        </div>

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>受影響料號</h3>
          {impact.impactedPartNumbers.length === 0 ? (
            <NextStepState
              compact
              eyebrow="沒有關聯"
              title="目前沒有主要製造圖關聯料號"
              body="可回圖料模組確認製造圖關聯，或改查另一張製造圖。"
              actions={[{ href: "/numbering/search", label: "回圖料模組", variant: "primary" }]}
            />
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: "760px" }}>
                <thead>
                  <tr>
                    <th>料號</th>
                    <th>品名</th>
                    <th>類型</th>
                    <th>階段</th>
                    <th>
                      <StatusColumnHeader context="masterRecord" />
                    </th>
                    <th>提醒</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.impactedPartNumbers.map((partNumber) => (
                    <tr key={partNumber.id}>
                      <td>{partNumber.partNumber}</td>
                      <td>{partNumber.partName}</td>
                      <td>{kindLabel(partNumber.itemKind)}</td>
                      <td>{formatDevelopmentPhaseForUser(partNumber.developmentPhase)}</td>
                      <td>
                        <StatusBadge status={partNumber.recordStatus} context="masterRecord" />
                      </td>
                      <td>
                        <WarningDot title="此料號的主要製造圖將作廢，需確認替代圖或建立進版待辦。" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionHeadingStyle}>文件進版待辦</h3>
          <div style={todoGridStyle}>
            {impact.requiredDocuments.map((documentName) => (
              <div style={todoItemStyle} key={documentName}>
                <CheckCircle2 size={16} />
                <span>{documentName}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={applyBoxStyle}>
          <label style={confirmStyle}>
            <input type="checkbox" checked={confirmed} onChange={(event) => onConfirmedChange(event.target.checked)} />
            <span>已確認影響料號、文件進版待辦與作廢原因</span>
          </label>
          <button className="danger-button" type="button" disabled={!confirmed || busy === "apply" || impact.applied} onClick={onApply}>
            <ShieldAlert size={16} />
            套用失效
          </button>
        </section>
        {impact.applied ? (
          <NextStepState
            compact
            eyebrow="完成"
            title="製造圖作廢已完成"
            body="下一步回待辦確認進版文件，或到交接頁確認已發布資料不再被誤用。"
            actions={[
              { href: "/numbering/tasks", label: "看待辦", variant: "primary" },
              { href: "/handoff", label: "看交接" }
            ]}
          />
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WarningDot({ title }: { title: string }) {
  return <RiskHint title={title} className="impact-warning-marker" />;
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <div className="empty">
        <AlertTriangle size={24} />
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
        <AlertTriangle size={24} />
        <h2>影響分析失敗</h2>
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

function kindLabel(kind: PartNumber["itemKind"]) {
  const labels: Record<PartNumber["itemKind"], string> = {
    purchased: "外購",
    manufactured: "自製",
    outsourced: "發包",
    shared: "共用",
    custom: "客製"
  };
  return labels[kind] ?? kind;
}

const mutedTextStyle = { color: "var(--muted)" };
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "0.75rem",
  padding: "16px"
};
const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  minWidth: 0
};
const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap" as const
};
const bodyStyle = {
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
const todoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.6rem"
};
const todoItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "10px",
  background: "#fff"
};
const applyBoxStyle = {
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap" as const
};
const confirmStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem"
};
