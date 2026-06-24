"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, GitPullRequestArrow, RotateCcw, Send } from "lucide-react";

type FffState = "no_impact" | "suspected_impact" | "confirmed_impact";
type ItemType = "self_made" | "purchased" | "standard";

const fffOptions: { value: FffState; label: string }[] = [
  { value: "no_impact", label: "無影響" },
  { value: "suspected_impact", label: "疑似影響" },
  { value: "confirmed_impact", label: "確認影響" }
];

const reasonOptions = ["標註 / 文字修正", "尺寸 / 公差修正", "材質 / 製程修正", "BOM / 料件影響", "其他"];

export default function DrawingRevisionPage() {
  const [drawingNumberId, setDrawingNumberId] = useState("");
  const [revision, setRevision] = useState("0.1");
  const [reasonCategory, setReasonCategory] = useState(reasonOptions[0]);
  const [formState, setFormState] = useState<FffState>("no_impact");
  const [fitState, setFitState] = useState<FffState>("no_impact");
  const [functionState, setFunctionState] = useState<FffState>("no_impact");
  const [replacementReservedPartNumber, setReplacementReservedPartNumber] = useState("");
  const [replacementItemType, setReplacementItemType] = useState<ItemType>("self_made");
  const [detectedPartNumber, setDetectedPartNumber] = useState("");
  const [correctedPartNumber, setCorrectedPartNumber] = useState("");
  const [currentPartNumberId, setCurrentPartNumberId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const outcome = [formState, fitState, functionState].includes("confirmed_impact")
    ? "confirmed_impact"
    : [formState, fitState, functionState].includes("suspected_impact")
      ? "suspected_impact"
      : "no_impact";
  const comparedPartNumber = correctedPartNumber.trim() || detectedPartNumber.trim();
  const replacementRequired = outcome === "confirmed_impact";
  const mismatch = replacementRequired && comparedPartNumber && replacementReservedPartNumber.trim() && comparedPartNumber !== replacementReservedPartNumber.trim();

  async function submitAssessment() {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/numbering/drawing-revisions/fff-assessments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drawingNumberId,
        revision,
        reasonCategory,
        formState,
        fitState,
        functionState,
        replacementReservedPartNumber: replacementReservedPartNumber.trim() || null,
        replacementItemType,
        detectedPartNumber: detectedPartNumber.trim() || null,
        correctedPartNumber: correctedPartNumber.trim() || null,
        currentPartNumberId: currentPartNumberId.trim() || null,
        note: note.trim() || null
      })
    });
    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? body.message ?? "圖面進版判定送出失敗");
      return;
    }
    setMessage(
      body.replacementDraft
        ? `已建立替代料號草稿 ${body.replacementDraft.reservedPartNumber}`
        : outcome === "suspected_impact"
          ? "已建立疑似影響判定，待審核者作出結論"
          : "已建立無影響判定，待審核者確認 BOM 不進版"
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖面進版</h1>
          <p>建立 Form / Fit / Function 判定與必要的新料號草稿。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>進版判定</h2>
            <p style={mutedTextStyle}>確認影響時，圖面料號必須等於新料號才能送出。</p>
          </div>
          <button className="primary-button" type="button" onClick={submitAssessment} disabled={busy || Boolean(mismatch)}>
            <Send size={16} />
            送出判定
          </button>
        </div>

        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>圖號 ID</span>
            <input className="text-input" value={drawingNumberId} onChange={(event) => setDrawingNumberId(event.target.value)} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>新版次</span>
            <input className="text-input" value={revision} onChange={(event) => setRevision(event.target.value)} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>變更原因</span>
            <select className="dropdown-select" value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value)}>
              {reasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={fffGridStyle}>
          <FffControl label="Form" value={formState} onChange={setFormState} />
          <FffControl label="Fit" value={fitState} onChange={setFitState} />
          <FffControl label="Function" value={functionState} onChange={setFunctionState} />
        </div>

        <div style={resultBandStyle}>
          {outcome === "confirmed_impact" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <strong>{outcomeLabel(outcome)}</strong>
          <span style={mutedTextStyle}>{outcomeMessage(outcome)}</span>
        </div>
      </section>

      {replacementRequired ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>替代料號與圖面料號比對</h2>
              <p style={mutedTextStyle}>自製件需補新版圖面；此切片先記錄讀值與修正值，比對成功才建立草稿。</p>
            </div>
            <GitPullRequestArrow size={20} />
          </div>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>新料號</span>
              <input className="text-input" value={replacementReservedPartNumber} onChange={(event) => setReplacementReservedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>料件類型</span>
              <select className="dropdown-select" value={replacementItemType} onChange={(event) => setReplacementItemType(event.target.value as ItemType)}>
                <option value="self_made">自製件</option>
                <option value="purchased">採購件</option>
                <option value="standard">標準件</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>圖面讀取料號</span>
              <input className="text-input" value={detectedPartNumber} onChange={(event) => setDetectedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>RD 修正讀值</span>
              <input className="text-input" value={correctedPartNumber} onChange={(event) => setCorrectedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>現行料號 ID</span>
              <input className="text-input" value={currentPartNumberId} onChange={(event) => setCurrentPartNumberId(event.target.value)} />
            </label>
          </div>
          {mismatch ? <p style={errorTextStyle}>圖面料號與新料號不一致，不能送出。</p> : null}
        </section>
      ) : null}

      <section className="panel">
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>備註</span>
          <textarea className="text-input" rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {message ? <p style={successTextStyle}>{message}</p> : null}
        {error ? <p style={errorTextStyle}>{error}</p> : null}
      </section>
    </>
  );
}

function FffControl({ label, value, onChange }: { label: string; value: FffState; onChange: (value: FffState) => void }) {
  return (
    <div style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <div className="status-tabs">
        {fffOptions.map((option) => (
          <button className={value === option.value ? "active" : undefined} key={option.value} type="button" onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function outcomeLabel(value: string) {
  if (value === "confirmed_impact") return "確認影響";
  if (value === "suspected_impact") return "疑似影響";
  return "無影響";
}

function outcomeMessage(value: string) {
  if (value === "confirmed_impact") return "需建立替代料號草稿並比對圖面料號。";
  if (value === "suspected_impact") return "可送審，但審核者必須確認沿用或退回補新料號。";
  return "可沿用原料號，審核者仍需確認 BOM 不進版。";
}

const mutedTextStyle: CSSProperties = { color: "#64748b", fontSize: "0.85rem" };
const errorTextStyle: CSSProperties = { color: "#b91c1c", fontSize: "0.9rem", fontWeight: 700 };
const successTextStyle: CSSProperties = { color: "#047857", fontSize: "0.9rem", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = { color: "#475569", fontSize: "0.78rem", fontWeight: 700 };
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const fffGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem",
  marginTop: "1rem"
};
const resultBandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};
