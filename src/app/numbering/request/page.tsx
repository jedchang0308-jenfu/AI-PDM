"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, RotateCcw, Search, Send } from "lucide-react";
import { LabelWithInfo } from "@/components/compact-hints";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";

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

type NameSuggestionSearchResult = {
  entityType: "part_root" | "part_number" | "drawing_number";
  displayName: string;
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
const initialDevelopmentPhase: NumberingPhase = "EVT";

export default function NumberingRequestPage() {
  const [state, setState] = useState<LoadState>("ready");
  const [coreName, setCoreName] = useState("");
  const [partName, setPartName] = useState("");
  const [partNameTouched, setPartNameTouched] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [specModel, setSpecModel] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [featureText, setFeatureText] = useState("");
  const [suggestedSequenceCode, setSuggestedSequenceCode] = useState("A");
  const [sequenceSuggestionState, setSequenceSuggestionState] = useState<"idle" | "checking" | "ready" | "fallback">("idle");
  const [itemKind, setItemKind] = useState<ItemKind>("manufactured");
  const developmentPhase = initialDevelopmentPhase;
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
  const coreNameInputRef = useRef<HTMLInputElement>(null);
  const seriesCodeInputRef = useRef<HTMLInputElement>(null);
  const featureTextInputRef = useRef<HTMLInputElement>(null);
  const brandNameInputRef = useRef<HTMLInputElement>(null);
  const specModelInputRef = useRef<HTMLInputElement>(null);
  const customSpecificationInputRef = useRef<HTMLInputElement>(null);

  const nameUsesSequence = itemKind !== "purchased";

  useEffect(() => {
    const syncBrowserRestoredValues = () => {
      setCoreName((current) => current || coreNameInputRef.current?.value || "");
      setSeriesCode((current) => current || seriesCodeInputRef.current?.value || "");
      setFeatureText((current) => current || featureTextInputRef.current?.value || "");
      setBrandName((current) => current || brandNameInputRef.current?.value || "");
      setSpecModel((current) => current || specModelInputRef.current?.value || "");
      setCustomSpecification((current) => current || customSpecificationInputRef.current?.value || "");
    };
    const timers = [0, 120, 600, 1500, 3000].map((delay) => window.setTimeout(syncBrowserRestoredValues, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const basePartName = useMemo(
    () =>
      buildSuggestedPartNameBase({
        coreName,
        itemKind,
        isUniversal: isUniversal || itemKind === "shared",
        brandName,
        specModel,
        seriesCode,
        featureText,
        customSpecification
      }),
    [brandName, coreName, customSpecification, featureText, isUniversal, itemKind, seriesCode, specModel]
  );

  const suggestedPartName = useMemo(
    () => (nameUsesSequence && basePartName ? [basePartName, suggestedSequenceCode || "A"].join("_") : basePartName),
    [basePartName, nameUsesSequence, suggestedSequenceCode]
  );

  useEffect(() => {
    if (!partNameTouched) setPartName(suggestedPartName);
  }, [partNameTouched, suggestedPartName]);

  useEffect(() => {
    if (itemKind === "purchased" && seriesCode) setSeriesCode("");
  }, [itemKind, seriesCode]);

  useEffect(() => {
    if (!nameUsesSequence || !basePartName) {
      setSuggestedSequenceCode(nameUsesSequence ? "A" : "");
      setSequenceSuggestionState("idle");
      return;
    }

    const controller = new AbortController();
    setSuggestedSequenceCode("A");
    setSequenceSuggestionState("checking");

    const params = new URLSearchParams({
      query: basePartName,
      entityType: "part_number",
      limit: "100"
    });

    fetch(`/api/numbering/search?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { results?: NameSuggestionSearchResult[] };
      })
      .then((body) => {
        const usedCodes = extractUsedSequenceCodes(body.results ?? [], basePartName);
        setSuggestedSequenceCode(nextSequenceCode(usedCodes));
        setSequenceSuggestionState("ready");
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setSuggestedSequenceCode("A");
        setSequenceSuggestionState("fallback");
      });

    return () => controller.abort();
  }, [basePartName, nameUsesSequence]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!coreName.trim()) errors.push("核心名稱必填");
    if (itemKind !== "purchased" && itemKind !== "shared" && !isUniversal && !seriesCode.trim()) errors.push("系列代號必填，尚未正式定案時可先填暫定系列");
    if (!partName.trim()) errors.push("品名必填");
    if (itemKind === "custom" && !customSpecification.trim()) errors.push("客製尺寸/規格必填");
    if ((isUniversal || itemKind === "shared") && !universalReason.trim()) errors.push("共用件理由必填");
    if (drawingRequested && drawingPurposeCode === "OT" && !drawingPurposeDescription.trim()) errors.push("OT 圖用途描述必填");
    return errors;
  }, [coreName, customSpecification, drawingPurposeCode, drawingPurposeDescription, drawingRequested, isUniversal, itemKind, partName, seriesCode, universalReason]);

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

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再申請圖料號。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="工程師、研發主管或管理員可申請圖料號。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => setState("ready")} /> : null}

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>基本資料</h2>
              <p style={mutedTextStyle}>新領號固定為 EVT 草稿；DVT、PVT、正式階段由後續關卡流程晉升。</p>
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
              <input
                ref={coreNameInputRef}
                value={coreName}
                autoComplete="off"
                onInput={(event) => setCoreName(event.currentTarget.value)}
                onChange={(event) => setCoreName(event.target.value)}
                placeholder="例如：固定支架"
              />
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
            {itemKind === "purchased" ? (
              <>
                <label style={fieldStyle}>
                  <span>品牌</span>
                  <input
                    ref={brandNameInputRef}
                    value={brandName}
                    autoComplete="off"
                    onInput={(event) => setBrandName(event.currentTarget.value)}
                    onChange={(event) => setBrandName(event.target.value)}
                    placeholder="有影響才填，例如：東元"
                  />
                </label>
                <label style={fieldStyle}>
                  <span>規格 / 型號</span>
                  <input
                    ref={specModelInputRef}
                    value={specModel}
                    autoComplete="off"
                    onInput={(event) => setSpecModel(event.currentTarget.value)}
                    onChange={(event) => setSpecModel(event.target.value)}
                    placeholder="例如：1HP_4P_220VAC"
                  />
                </label>
              </>
            ) : null}
            {itemKind === "purchased" ? (
              <label style={fieldStyle}>
                <LabelWithInfo title="依 3.2 外購件品名規則，使用品牌與規格/型號，不填系列代號。">系列代號</LabelWithInfo>
                <input value="" disabled placeholder="外購件不使用系列代號" />
              </label>
            ) : itemKind !== "shared" && !isUniversal ? (
              <label style={fieldStyle}>
                <span>系列代號</span>
                <input
                  ref={seriesCodeInputRef}
                  value={seriesCode}
                  autoComplete="off"
                  onInput={(event) => setSeriesCode(event.currentTarget.value)}
                  onChange={(event) => setSeriesCode(event.target.value)}
                  placeholder="例如：JF_100L，未定案可先暫填"
                />
              </label>
            ) : null}
            <label style={fieldStyle}>
              <span>階段</span>
              <div style={lockedPhaseStyle} data-testid="initial-development-phase">
                <strong>{initialDevelopmentPhase}</strong>
                <small>領號只建立圖料身份；成熟度由 DVT / PVT / 發布關卡推進。</small>
              </div>
            </label>
            {itemKind === "custom" ? (
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>客製尺寸/規格</span>
                <input
                  ref={customSpecificationInputRef}
                  value={customSpecification}
                  autoComplete="off"
                  onInput={(event) => setCustomSpecification(event.currentTarget.value)}
                  onChange={(event) => setCustomSpecification(event.target.value)}
                  placeholder="例如：L120 x W30 x H8，孔距 90"
                />
              </label>
            ) : null}
            <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
              <span>{itemKind === "purchased" ? "補充特徵" : "特性"}</span>
              <input
                ref={featureTextInputRef}
                value={featureText}
                autoComplete="off"
                onInput={(event) => setFeatureText(event.currentTarget.value)}
                onChange={(event) => setFeatureText(event.target.value)}
                placeholder="可填規格、型號、材質、用途等；多個特徵可用 _、逗號或空格分隔"
              />
            </label>
            {itemKind !== "purchased" ? (
              <div style={sequenceSuggestionStyle} data-testid="sequence-suggestion">
                <span style={suggestionLabelStyle}>系統建議流水號</span>
                <strong>{sequenceSuggestionState === "checking" ? "查詢中..." : suggestedSequenceCode || "A"}</strong>
                <small>{sequenceSuggestionState === "fallback" ? "暫時無法查詢既有品名，先以 A 建議。" : "依同命名基礎既有品名自動建議，使用者不需查表。"}</small>
              </div>
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
            <div style={suggestionBoxStyle}>
              <div>
                <span style={suggestionLabelStyle}>依 3.2 品名命名原則產生</span>
                <strong>{suggestedPartName || "填寫命名元素後產生建議品名"}</strong>
              </div>
              <button className="secondary-button" type="button" disabled={!suggestedPartName} onClick={() => {
                setPartName(suggestedPartName);
                setPartNameTouched(true);
              }}>
                套用建議
              </button>
            </div>
            <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
              <span>品名（系統建議，可微調）</span>
              <input
                value={partName}
                onChange={(event) => {
                  setPartNameTouched(true);
                  setPartName(event.target.value);
                }}
                placeholder="填寫上方命名元素後自動產生"
              />
            </label>
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
        {result.blocked ? <span className="badge Rejected">阻擋</span> : result.warningsOnly ? <span className="badge Pending">注意</span> : <span className="badge Released">可建立</span>}
      </div>
      {result.matches.length > 0 ? (
        <div className="table-wrap">
          <table style={{ minWidth: "760px" }}>
            <thead>
              <tr>
                <th>嚴重度</th>
                <th>代碼</th>
                <th>名稱</th>
                <th>
                  <StatusColumnHeader context="masterRecord" />
                </th>
                <th>分數</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match) => (
                <tr key={`${match.entityType}:${match.entityId}`}>
                  <td>{match.severity === "blocker" ? "阻擋" : "注意"}</td>
                  <td>{match.displayCode}</td>
                  <td>{match.displayName}</td>
                  <td>
                    <StatusBadge status={match.recordStatus} context="masterRecord" />
                  </td>
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
        <ResultCard
          label="主根號"
          value={record.root.rootCode}
          detailHref={`/numbering/search?query=${encodeURIComponent(record.root.rootCode)}&entityType=part_root&detail=${encodeURIComponent(record.root.rootCode)}`}
        />
        <ResultCard
          label="料號"
          value={record.partNumber.partNumber}
          detailHref={`/parts?query=${encodeURIComponent(record.partNumber.partNumber)}&detail=${encodeURIComponent(record.partNumber.partNumber)}`}
        />
        <ResultCard
          label="圖號"
          value={record.drawingNumber?.drawingNumber ?? "未領圖號"}
          detailHref={
            record.drawingNumber
              ? `/numbering/drawings?query=${encodeURIComponent(record.drawingNumber.drawingNumber)}&detail=${encodeURIComponent(record.drawingNumber.drawingNumber)}`
              : undefined
          }
        />
        <ResultCard label="客製規格" value={record.partNumber.customSpecification ?? "-"} />
      </div>
    </section>
  );
}

function ResultCard({ label, value, detailHref }: { label: string; value: string; detailHref?: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <div style={resultCardValueRowStyle}>
        <strong>{value}</strong>
        {detailHref ? (
          <Link className="secondary-button" href={detailHref} style={resultDetailLinkStyle}>
            明細
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function buildSuggestedPartNameBase({
  coreName,
  itemKind,
  isUniversal,
  brandName,
  specModel,
  seriesCode,
  featureText,
  customSpecification
}: {
  coreName: string;
  itemKind: ItemKind;
  isUniversal: boolean;
  brandName: string;
  specModel: string;
  seriesCode: string;
  featureText: string;
  customSpecification: string;
}) {
  const core = normalizeNameToken(coreName);
  if (!core) return "";
  const features = splitNameTokens(featureText);

  if (itemKind === "purchased") {
    return [core, normalizeNameToken(brandName), ...splitNameTokens(specModel), ...features].filter(Boolean).join("_");
  }

  if (isUniversal) {
    return [core, ...features, ...splitNameTokens(customSpecification)].filter(Boolean).join("_");
  }

  return [core, ...splitNameTokens(seriesCode), ...features, ...splitNameTokens(customSpecification)].filter(Boolean).join("_");
}

function splitNameTokens(value: string) {
  return value
    .split(/[_，,、/\\\s]+/)
    .map(normalizeNameToken)
    .filter(Boolean);
}

function normalizeNameToken(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function extractUsedSequenceCodes(results: NameSuggestionSearchResult[], basePartName: string) {
  const prefix = `${basePartName}_`;
  return results
    .filter((result) => result.entityType === "part_number")
    .map((result) => result.displayName.trim())
    .filter((displayName) => displayName.startsWith(prefix))
    .map((displayName) => displayName.slice(prefix.length).trim().toUpperCase())
    .filter((sequence) => /^[A-Z]+$/.test(sequence));
}

function nextSequenceCode(usedCodes: string[]) {
  const maxUsed = usedCodes.reduce((max, code) => Math.max(max, sequenceCodeToNumber(code)), 0);
  return numberToSequenceCode(maxUsed + 1);
}

function sequenceCodeToNumber(code: string) {
  return code.split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

function numberToSequenceCode(value: number) {
  let next = Math.max(1, value);
  let code = "";
  while (next > 0) {
    next -= 1;
    code = String.fromCharCode(65 + (next % 26)) + code;
    next = Math.floor(next / 26);
  }
  return code;
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
const suggestionBoxStyle = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "12px",
  background: "var(--panel-2)",
  flexWrap: "wrap" as const
};
const sequenceSuggestionStyle = {
  ...fieldStyle,
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "10px 12px",
  background: "var(--panel-2)"
};
const lockedPhaseStyle = {
  display: "grid",
  gap: "0.25rem",
  minHeight: "38px",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "9px 12px",
  background: "var(--panel-2)"
};
const suggestionLabelStyle = {
  display: "block",
  color: "var(--muted)",
  fontSize: "12px",
  marginBottom: "4px"
};
const resultGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem",
  padding: "16px"
};
const resultCardValueRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  minWidth: 0
};
const resultDetailLinkStyle = {
  minHeight: "30px",
  padding: "0.3rem 0.65rem",
  fontSize: "0.875rem",
  whiteSpace: "nowrap" as const
};
