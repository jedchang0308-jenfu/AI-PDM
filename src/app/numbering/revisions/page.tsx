"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, GitPullRequestArrow, Info, Loader2, RotateCcw, Search, Send } from "lucide-react";

type FffState = "no_impact" | "suspected_impact" | "confirmed_impact";
type ItemType = "self_made" | "purchased" | "standard";
type ResolveStatus = "no_input" | "not_found" | "ambiguous_query" | "resolved" | "resolved_with_missing_part" | "multiple_primary_parts";
type LookupKind = "query" | "drawingNumber" | "drawingNumberId" | "partNumber";

type ResolvedDrawing = {
  id: string;
  drawingNumber: string;
  purposeCode: string;
  purposeDescription: string;
  developmentPhase: string;
  recordStatus: string;
  rootCode: string | null;
  coreName: string | null;
};

type ResolvedPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  developmentPhase: string;
  recordStatus: string;
};

type ResolveResult = {
  status: ResolveStatus;
  drawing: ResolvedDrawing | null;
  primaryParts: ResolvedPart[];
  selectedPrimaryPart: ResolvedPart | null;
  suggestedRevision: string;
  latestRevision: string | null;
  revisionCount: number;
  candidates: ResolvedDrawing[];
};

const fffOptions: { value: FffState; label: string }[] = [
  { value: "no_impact", label: "無影響" },
  { value: "suspected_impact", label: "疑似影響" },
  { value: "confirmed_impact", label: "確認影響" }
];

const reasonOptions = ["標註 / 文字修正", "尺寸 / 公差修正", "材質 / 製程修正", "BOM / 料件影響", "其他"];

export default function DrawingRevisionPage() {
  return (
    <Suspense fallback={null}>
      <DrawingRevisionWorkbench />
    </Suspense>
  );
}

function DrawingRevisionWorkbench() {
  const searchParams = useSearchParams();
  const initialLookup = getInitialLookup(searchParams);
  const [query, setQuery] = useState(initialLookup.value);
  const [lookupKind, setLookupKind] = useState<LookupKind>(initialLookup.kind);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [revision, setRevision] = useState("0.1");
  const [reasonCategory, setReasonCategory] = useState(reasonOptions[0]);
  const [formState, setFormState] = useState<FffState>("no_impact");
  const [fitState, setFitState] = useState<FffState>("no_impact");
  const [functionState, setFunctionState] = useState<FffState>("no_impact");
  const [replacementReservedPartNumber, setReplacementReservedPartNumber] = useState("");
  const [replacementItemType, setReplacementItemType] = useState<ItemType>("self_made");
  const [detectedPartNumber, setDetectedPartNumber] = useState("");
  const [correctedPartNumber, setCorrectedPartNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"idle" | "resolving" | "submitting">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const outcome = useMemo(() => {
    if ([formState, fitState, functionState].includes("confirmed_impact")) return "confirmed_impact";
    if ([formState, fitState, functionState].includes("suspected_impact")) return "suspected_impact";
    return "no_impact";
  }, [formState, fitState, functionState]);
  const replacementRequired = outcome === "confirmed_impact";
  const comparedPartNumber = correctedPartNumber.trim() || detectedPartNumber.trim();
  const mismatch = replacementRequired && comparedPartNumber && replacementReservedPartNumber.trim() && comparedPartNumber !== replacementReservedPartNumber.trim();
  const canSubmit =
    busy === "idle" &&
    Boolean(resolved?.drawing) &&
    Boolean(revision.trim()) &&
    !mismatch &&
    (!replacementRequired || (Boolean(replacementReservedPartNumber.trim()) && Boolean(comparedPartNumber)));

  useEffect(() => {
    if (initialLookup.value) void resolveDrawing(initialLookup.value, initialLookup.kind);
    // The initial query string is only an entry hint; later edits are user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolveDrawing(nextQuery = query, nextLookupKind = lookupKind) {
    const text = nextQuery.trim();
    if (!text) return;
    setBusy("resolving");
    setError("");
    setMessage("");
    const params = new URLSearchParams({ limit: "8" });
    params.set(nextLookupKind, text);
    const response = await fetch(`/api/numbering/drawings/resolve?${params.toString()}`);
    const body = (await response.json().catch(() => ({}))) as Partial<ResolveResult> & { error?: string };
    setBusy("idle");
    if (!response.ok) {
      setResolved(null);
      setError(humanError(body.error ?? "drawing_resolve_failed"));
      return;
    }
    const nextResolved = body as ResolveResult;
    setResolved(nextResolved);
    if (nextResolved.suggestedRevision) setRevision(nextResolved.suggestedRevision);
    if (!nextResolved.drawing) {
      setError(resolveStatusMessage(nextResolved));
    }
  }

  async function pickCandidate(drawingNumber: string) {
    setQuery(drawingNumber);
    setLookupKind("drawingNumber");
    await resolveDrawing(drawingNumber, "drawingNumber");
  }

  async function submitAssessment() {
    if (!resolved?.drawing || busy !== "idle") return;
    setBusy("submitting");
    setError("");
    setMessage("");
    const response = await fetch("/api/numbering/drawing-revisions/fff-assessments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drawingNumber: resolved.drawing.drawingNumber,
        revision,
        reasonCategory,
        formState,
        fitState,
        functionState,
        replacementReservedPartNumber: replacementReservedPartNumber.trim() || null,
        replacementItemType,
        detectedPartNumber: detectedPartNumber.trim() || null,
        correctedPartNumber: correctedPartNumber.trim() || null,
        currentPartNumberId: resolved.selectedPrimaryPart?.id ?? null,
        note: note.trim() || null
      })
    });
    setBusy("idle");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(humanError(body.error ?? body.message ?? "drawing_revision_submit_failed", body.details));
      return;
    }
    setMessage(
      body.replacementDraft
        ? `已建立或沿用替代料號草稿 ${body.replacementDraft.reservedPartNumber}`
        : outcome === "suspected_impact"
          ? "已建立疑似影響判定，待審核者作出結論。"
          : "已建立無影響判定，待審核者確認 BOM 不進版。"
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖面進版</h1>
          <p>輸入正式圖號後建立 Form / Fit / Function 判定；系統會自行解析內部 ID 與主料號。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <section className="panel" style={workbenchHeroStyle}>
        <div>
          <span style={eyebrowStyle}>Drawing Revision Workbench</span>
          <h2 style={heroTitleStyle}>先定位圖號，再做進版判定</h2>
          <p style={mutedTextStyle}>這裡已改為工作台流程：正式圖號查詢、圖料關係確認、FFF 判定、必要時建立替代料號草稿。</p>
        </div>
        <div style={stepStripStyle}>
          <StepPill active={!resolved?.drawing} done={Boolean(resolved?.drawing)} label="1 圖號定位" />
          <StepPill active={Boolean(resolved?.drawing)} done={false} label="2 FFF 判定" />
          <StepPill active={replacementRequired} done={false} label="3 替代料號" />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>圖號定位</h2>
            <p style={mutedTextStyle}>可輸入正式圖號或料號，例如 D-0014-MA1。內部 ID 僅顯示於解析結果，不需要人工填寫。</p>
          </div>
          <button
            className="primary-button"
            style={busy !== "idle" || !query.trim() ? disabledActionStyle : undefined}
            type="button"
            onClick={() => resolveDrawing()}
            disabled={busy !== "idle" || !query.trim()}
          >
            {busy === "resolving" ? <Loader2 size={16} /> : <Search size={16} />}
            解析圖號
          </button>
        </div>
        <div style={resolveStateStyle(resolved?.status, Boolean(resolved?.drawing))}>
          <strong>{resolved?.drawing ? "已定位圖號" : "尚未定位圖號"}</strong>
          <span>{resolved?.drawing ? `${resolved.drawing.drawingNumber} 已載入，內部 ID 已由系統處理。` : "請輸入正式圖號或料號後按「解析圖號」，不要填 UUID。"}</span>
        </div>
        <div style={lookupGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>正式圖號 / 料號</span>
            <input
              className="text-input"
              placeholder="請輸入，例如 D-0014-MA1 或 P-0014-001"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLookupKind("query");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && query.trim()) void resolveDrawing();
              }}
            />
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
        {resolved?.drawing ? <ResolvedSummary result={resolved} /> : null}
        {resolved?.status === "ambiguous_query" ? <CandidateList candidates={resolved.candidates} onPick={pickCandidate} /> : null}
        {resolved && !resolved.drawing && resolved.status !== "ambiguous_query" ? <p style={errorTextStyle}>{resolveStatusMessage(resolved)}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>FFF 判定</h2>
            <p style={mutedTextStyle}>只要任一項為確認影響，就必須建立替代料號草稿並比對新版圖面上的料號讀值。</p>
          </div>
          <button className="primary-button" type="button" onClick={submitAssessment} disabled={!canSubmit}>
            {busy === "submitting" ? <Loader2 size={16} /> : <Send size={16} />}
            送出判定
          </button>
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
              <p style={mutedTextStyle}>請填新版圖面實際讀到的料號；若 OCR 或人工讀值需修正，填 RD 修正讀值。</p>
            </div>
            <GitPullRequestArrow size={20} />
          </div>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>替代料號草稿</span>
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
              <span style={fieldLabelStyle}>新版圖面讀取料號</span>
              <input className="text-input" value={detectedPartNumber} onChange={(event) => setDetectedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>RD 修正讀值</span>
              <input className="text-input" value={correctedPartNumber} onChange={(event) => setCorrectedPartNumber(event.target.value)} />
            </label>
          </div>
          {mismatch ? <p style={errorTextStyle}>新版圖面料號與替代料號不一致，不能送出。</p> : null}
        </section>
      ) : null}

      <section className="panel">
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>備註</span>
          <textarea className="text-input" rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {!resolved?.drawing ? (
          <p style={hintTextStyle}>
            <Info size={16} />
            送出前需先解析正式圖號。
          </p>
        ) : null}
        {message ? <p style={successTextStyle}>{message}</p> : null}
        {error ? <p style={errorTextStyle}>{error}</p> : null}
      </section>
    </>
  );
}

function ResolvedSummary({ result }: { result: ResolveResult }) {
  const drawing = result.drawing;
  if (!drawing) return null;
  return (
    <div style={summaryGridStyle}>
      <SummaryItem label="正式圖號" value={drawing.drawingNumber} />
      <SummaryItem label="內部圖號 ID" value={drawing.id} />
      <SummaryItem label="主料號" value={result.selectedPrimaryPart?.partNumber ?? primaryPartFallback(result)} />
      <SummaryItem label="品名 / 根代碼" value={result.selectedPrimaryPart?.partName ?? drawing.coreName ?? drawing.rootCode ?? "-"} />
      <SummaryItem label="最新送審版次" value={result.latestRevision ?? "尚無送審紀錄"} />
      <SummaryItem label="建議新版次" value={result.suggestedRevision} />
    </div>
  );
}

function CandidateList({ candidates, onPick }: { candidates: ResolvedDrawing[]; onPick: (drawingNumber: string) => void }) {
  return (
    <div style={candidateListStyle}>
      <strong>找到多筆可能圖號，請選一筆：</strong>
      {candidates.map((candidate) => (
        <button className="secondary-button" key={candidate.id} type="button" onClick={() => onPick(candidate.drawingNumber)}>
          {candidate.drawingNumber}
        </button>
      ))}
    </div>
  );
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return <span style={stepPillStyle(active, done)}>{label}</span>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryItemStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <strong style={summaryValueStyle}>{value}</strong>
    </div>
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

function primaryPartFallback(result: ResolveResult) {
  if (result.status === "multiple_primary_parts") return `多筆主料號：${result.primaryParts.map((part) => part.partNumber).join(", ")}`;
  if (result.status === "resolved_with_missing_part") return "未建立主製造料號連結";
  return "-";
}

function resolveStatusMessage(result: ResolveResult) {
  if (result.status === "not_found") return "找不到這個圖號或料號，請確認輸入的是正式編號。";
  if (result.status === "ambiguous_query") return "查到多筆圖號，請選擇正確圖號後再送出。";
  if (result.status === "resolved_with_missing_part") return "圖號已找到，但沒有主製造料號連結；確認影響時需先補齊料號連結。";
  if (result.status === "multiple_primary_parts") return "圖號已找到，但有多筆主製造料號；確認影響前需先釐清主料號。";
  return "請輸入正式圖號或料號。";
}

function outcomeLabel(value: string) {
  if (value === "confirmed_impact") return "確認影響";
  if (value === "suspected_impact") return "疑似影響";
  return "無影響";
}

function outcomeMessage(value: string) {
  if (value === "confirmed_impact") return "需建立替代料號草稿並比對新版圖面料號。";
  if (value === "suspected_impact") return "可送審，但審核者必須確認沿用或退回補新料號。";
  return "可沿用原料號，審核者仍需確認 BOM 不進版。";
}

function humanError(code: string, details?: unknown) {
  switch (code) {
    case "drawing_number_not_found":
      return "找不到圖號。請輸入正式圖號，例如 D-0014-MA1，不需要填內部 ID。";
    case "drawing_number_ambiguous":
      return "查到多筆可能圖號，請先在圖號定位區選定一筆。";
    case "primary_part_ambiguous":
      return `此圖號連到多筆主料號，需先清理主料號連結：${detailList(details, "primaryParts")}`;
    case "replacement_part_number_required":
      return "確認影響時必須填替代料號草稿。";
    case "drawing_part_number_read_required":
      return "確認影響時必須填新版圖面讀取料號或 RD 修正讀值。";
    case "drawing_part_number_mismatch":
      return "新版圖面料號與替代料號不一致，請先修正後再送出。";
    case "reserved_number_already_formal_part":
      return "替代料號已是正式料號，不能再建立草稿。";
    case "reserved_number_already_active_draft":
      return "替代料號已有使用中的草稿，請改用既有草稿或更換料號。";
    default:
      return code || "圖面進版判定送出失敗。";
  }
}

function detailList(details: unknown, key: string) {
  if (!details || typeof details !== "object" || !(key in details)) return "";
  const value = (details as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function getInitialLookup(searchParams: ReturnType<typeof useSearchParams>): { value: string; kind: LookupKind } {
  const drawingNumber = searchParams.get("drawingNumber") ?? searchParams.get("drawing_number");
  if (drawingNumber) return { value: drawingNumber, kind: "drawingNumber" };
  const partNumber = searchParams.get("partNumber") ?? searchParams.get("part_number");
  if (partNumber) return { value: partNumber, kind: "partNumber" };
  const drawingNumberId = searchParams.get("drawingNumberId") ?? searchParams.get("drawing_number_id");
  if (drawingNumberId) return { value: drawingNumberId, kind: "drawingNumberId" };
  return { value: "", kind: "query" };
}

const mutedTextStyle: CSSProperties = { color: "#64748b", fontSize: "0.85rem" };
const errorTextStyle: CSSProperties = { color: "#b91c1c", fontSize: "0.9rem", fontWeight: 700 };
const successTextStyle: CSSProperties = { color: "#047857", fontSize: "0.9rem", fontWeight: 700 };
const hintTextStyle: CSSProperties = { color: "#475569", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" };
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = { color: "#475569", fontSize: "0.78rem", fontWeight: 700 };
const workbenchHeroStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  background: "#f8fafc",
  borderColor: "#bfd6e3"
};
const eyebrowStyle: CSSProperties = {
  color: "#0f766e",
  fontSize: "0.76rem",
  fontWeight: 800,
  textTransform: "uppercase"
};
const heroTitleStyle: CSSProperties = {
  margin: "0.15rem 0",
  color: "#0f172a",
  fontSize: "1.1rem"
};
const stepStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: "0.45rem"
};
const disabledActionStyle: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed"
};
const lookupGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const fffGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem"
};
const resultBandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};
const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "0.65rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};
const summaryItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0
};
const summaryValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "0.95rem",
  overflowWrap: "anywhere"
};
const candidateListStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};

function stepPillStyle(active: boolean, done: boolean): CSSProperties {
  return {
    border: `1px solid ${done ? "#0f766e" : active ? "#2563eb" : "#cbd5e1"}`,
    background: done ? "#ccfbf1" : active ? "#dbeafe" : "#ffffff",
    color: done ? "#115e59" : active ? "#1e40af" : "#64748b",
    borderRadius: 999,
    padding: "0.35rem 0.65rem",
    fontSize: "0.78rem",
    fontWeight: 800,
    whiteSpace: "nowrap"
  };
}

function resolveStateStyle(status: ResolveStatus | undefined, resolved: boolean): CSSProperties {
  const warning = status === "resolved_with_missing_part" || status === "multiple_primary_parts" || status === "ambiguous_query";
  return {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.45rem",
    border: `1px solid ${resolved ? "#99f6e4" : warning ? "#fed7aa" : "#cbd5e1"}`,
    background: resolved ? "#f0fdfa" : warning ? "#fff7ed" : "#f8fafc",
    color: resolved ? "#115e59" : warning ? "#9a3412" : "#475569",
    borderRadius: 6,
    marginBottom: "0.75rem",
    padding: "0.6rem 0.75rem",
    fontSize: "0.86rem"
  };
}
