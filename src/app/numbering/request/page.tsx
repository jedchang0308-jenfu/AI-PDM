"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, RotateCcw, Search, Send } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { WorkflowStrip } from "@/components/workflow-strip";

type LoadState = "ready" | "unauthorized" | "forbidden" | "error";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type DrawingPurposeCode = "MA" | "OT";

type DuplicateMatch = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  displayCode: string;
  displayName: string;
  recordStatus: string;
  score: number;
  reason: string;
  severity: "warning" | "blocker";
};

type DuplicateResult = {
  blocked: boolean;
  warningsOnly: boolean;
  matches: DuplicateMatch[];
  warningEventId: string | null;
};

type CreatedRecord = {
  root: {
    rootCode: string;
    coreName: string;
    itemKind: ItemKind;
    developmentPhase: NumberingPhase;
    recordStatus: string;
  };
  partNumber: {
    partNumber: string;
    partName: string;
    itemKind: ItemKind;
    isUniversal: boolean;
    customSpecification: string | null;
    developmentPhase: NumberingPhase;
    recordStatus: string;
  };
  drawingNumber: null | {
    drawingNumber: string;
    purposeCode: DrawingPurposeCode;
    purposeDescription: string;
    developmentPhase: NumberingPhase;
    recordStatus: string;
  };
};

const itemKinds: Array<{ value: ItemKind; label: string }> = [
  { value: "purchased", label: "外購" },
  { value: "manufactured", label: "自製" },
  { value: "outsourced", label: "發包" },
  { value: "shared", label: "共用件" },
  { value: "custom", label: "客製尺寸" }
];
const phases: NumberingPhase[] = ["EVT", "DVT", "PVT", "Release", "ECR"];

export default function NumberingRequestPage() {
  const [state, setState] = useState<LoadState>("ready");
  const [coreName, setCoreName] = useState("");
  const [partName, setPartName] = useState("");
  const [itemKind, setItemKind] = useState<ItemKind>("manufactured");
  const [developmentPhase, setDevelopmentPhase] = useState<NumberingPhase>("EVT");
  const [isUniversal, setIsUniversal] = useState(false);
  const [universalReason, setUniversalReason] = useState("");
  const [customSpecification, setCustomSpecification] = useState("");
  const [drawingRequested, setDrawingRequested] = useState(true);
  const [drawingPurposeCode, setDrawingPurposeCode] = useState<DrawingPurposeCode>("MA");
  const [drawingPurposeDescription, setDrawingPurposeDescription] = useState("");
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [createdRecord, setCreatedRecord] = useState<CreatedRecord | null>(null);
  const [busy, setBusy] = useState<"check" | "submit" | null>(null);
  const [error, setError] = useState("");

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!coreName.trim()) errors.push("核心名稱必填");
    if (!partName.trim()) errors.push("品名必填");
    if (itemKind === "custom" && !customSpecification.trim()) errors.push("客製尺寸/規格必填");
    if (isUniversal && !universalReason.trim()) errors.push("共用件理由必填");
    if (drawingRequested && drawingPurposeCode === "OT" && !drawingPurposeDescription.trim()) errors.push("OT 圖用途描述必填");
    return errors;
  }, [coreName, customSpecification, drawingPurposeCode, drawingPurposeDescription, drawingRequested, isUniversal, itemKind, partName, universalReason]);

  async function runDuplicateCheck() {
    setBusy("check");
    setError("");
    const response = await fetch("/api/numbering/duplicate-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coreName, partName })
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
      setError(body.error ?? "查重失敗");
      setState("error");
      return;
    }
    setDuplicateResult(body as DuplicateResult);
    setState("ready");
  }

  async function submitRequest() {
    if (validation.length > 0) {
      setError(validation.join("、"));
      setState("error");
      return;
    }
    setBusy("submit");
    setError("");
    const response = await fetch("/api/numbering/records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        coreName,
        partName,
        itemKind,
        developmentPhase,
        isUniversal: isUniversal || itemKind === "shared",
        universalReason,
        customSpecification,
        drawingRequested,
        drawingPurposeCode,
        drawingPurposeDescription
      })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    if (response.status === 403) {
      setState("forbidden");
      return;
    }
    if (!response.ok) {
      setError(body.error ?? "領號失敗");
      setState("error");
      return;
    }
    setCreatedRecord(body as CreatedRecord);
    setState("ready");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>領號申請</h1>
          <p>建立主根號、料號，必要時同步建立圖號。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setCreatedRecord(null)}>
          <RotateCcw size={16} />
          新申請
        </button>
      </div>

      <WorkflowStrip
        title="領號流程"
        description="建立主根號與料號後，可接續送審檔案或回查既有圖料避免重複。"
        steps={["需求建立", "領號", "上傳送審", "審核", "發行"]}
        currentStep="領號"
        actions={[
          { href: "/upload", label: "去送審", variant: "primary" },
          { href: "/numbering/search", label: "查既有圖料" }
        ]}
      />

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再申請圖料號。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="工程師、研發主管或管理員可申請圖料號。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => setState("ready")} /> : null}

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>基本資料</h2>
              <p style={mutedTextStyle}>草稿領號不需審核；DVT/發行 gate 由後續流程檢查。</p>
            </div>
            <div style={actionGroupStyle}>
              <button className="secondary-button" type="button" onClick={runDuplicateCheck} disabled={busy === "check" || !coreName.trim() || !partName.trim()}>
                <Search size={16} />
                查重預檢
              </button>
              <button className="primary-button" type="button" onClick={submitRequest} disabled={busy === "submit" || validation.length > 0}>
                <Send size={16} />
                建立號碼
              </button>
            </div>
          </div>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              <span>核心名稱</span>
              <input value={coreName} onChange={(event) => setCoreName(event.target.value)} placeholder="例如：固定支架" />
            </label>
            <label style={fieldStyle}>
              <span>品名</span>
              <input value={partName} onChange={(event) => setPartName(event.target.value)} placeholder="例如：固定支架 A" />
            </label>
            <label style={fieldStyle}>
              <span>料件類型</span>
              <select value={itemKind} onChange={(event) => setItemKind(event.target.value as ItemKind)}>
                {itemKinds.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span>階段</span>
              <select value={developmentPhase} onChange={(event) => setDevelopmentPhase(event.target.value as NumberingPhase)}>
                {phases.map((phase) => (
                  <option value={phase} key={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </label>
            {itemKind === "custom" ? (
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>客製尺寸/規格</span>
                <input value={customSpecification} onChange={(event) => setCustomSpecification(event.target.value)} placeholder="例如：L120 x W30 x H8，孔距 90" />
              </label>
            ) : null}
            <label style={checkRowStyle}>
              <input type="checkbox" checked={isUniversal || itemKind === "shared"} disabled={itemKind === "shared"} onChange={(event) => setIsUniversal(event.target.checked)} />
              <span>共用件</span>
            </label>
            {(isUniversal || itemKind === "shared") ? (
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>共用理由</span>
                <input value={universalReason} onChange={(event) => setUniversalReason(event.target.value)} placeholder="例如：跨專案共用標準件" />
              </label>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>圖號</h2>
              <p style={mutedTextStyle}>可先只建立料號，之後再補圖號。</p>
            </div>
            <label style={checkRowStyle}>
              <input type="checkbox" checked={drawingRequested} onChange={(event) => setDrawingRequested(event.target.checked)} />
              <span>同步建立圖號</span>
            </label>
          </div>
          {drawingRequested ? (
            <div style={formGridStyle}>
              <label style={fieldStyle}>
                <span>圖別</span>
                <select value={drawingPurposeCode} onChange={(event) => setDrawingPurposeCode(event.target.value as DrawingPurposeCode)}>
                  <option value="MA">MA 製造圖</option>
                  <option value="OT">OT 其他圖</option>
                </select>
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>用途描述</span>
                <input
                  value={drawingPurposeDescription}
                  onChange={(event) => setDrawingPurposeDescription(event.target.value)}
                  placeholder={drawingPurposeCode === "OT" ? "OT 圖必填用途" : "可留空"}
                />
              </label>
            </div>
          ) : (
            <div className="empty">先料號後圖號</div>
          )}
        </section>

        <DuplicatePanel result={duplicateResult} />
        <ResultPanel record={createdRecord} />
      </div>
    </>
  );
}

function DuplicatePanel({ result }: { result: DuplicateResult | null }) {
  if (!result) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>查重結果</h2>
          <p style={mutedTextStyle}>{result.matches.length === 0 ? "沒有找到相同或高相似資料。" : `${result.matches.length} 筆相同或高相似資料`}</p>
        </div>
        {result.blocked ? <span className="badge Rejected">blocker</span> : result.warningsOnly ? <span className="badge Pending">warning</span> : <span className="badge Released">clear</span>}
      </div>
      {result.matches.length > 0 ? (
        <div className="table-wrap">
          <table style={{ minWidth: "760px" }}>
            <thead>
              <tr>
                <th>嚴重度</th>
                <th>代碼</th>
                <th>名稱</th>
                <th>狀態</th>
                <th>分數</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match) => (
                <tr key={`${match.entityType}:${match.entityId}`}>
                  <td>{match.severity}</td>
                  <td>{match.displayCode}</td>
                  <td>{match.displayName}</td>
                  <td>{match.recordStatus}</td>
                  <td>{match.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ResultPanel({ record }: { record: CreatedRecord | null }) {
  if (!record) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>領號結果</h2>
          <p style={mutedTextStyle}>已建立草稿號碼。</p>
        </div>
        <CheckCircle2 size={20} color="var(--success)" />
      </div>
      <div style={resultGridStyle}>
        <ResultCard label="主根號" value={record.root.rootCode} />
        <ResultCard label="料號" value={record.partNumber.partNumber} />
        <ResultCard label="圖號" value={record.drawingNumber?.drawingNumber ?? "未領圖號"} />
        <ResultCard label="客製規格" value={record.partNumber.customSpecification ?? "-"} />
      </div>
      <NextStepState
        compact
        eyebrow="完成後"
        title="草稿號碼已建立"
        body="下一步可上傳圖面送審，或先回查圖料確認同圖多料號與既有關聯。"
        actions={[
          { href: "/upload", label: "上傳送審", variant: "primary" },
          { href: "/numbering/search", label: "回圖料查詢" }
        ]}
      />
    </section>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
        <h2>申請失敗</h2>
        <p>{message}</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            關閉
          </button>
        </div>
      </div>
    </section>
  );
}

const mutedTextStyle = { color: "var(--muted)" };
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.75rem",
  padding: "16px"
};
const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  minWidth: 0
};
const checkRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: "36px"
};
const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap" as const
};
const resultGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem",
  padding: "16px"
};
