"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, RotateCcw, Search, Send } from "lucide-react";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";

type LoadState = "ready" | "unauthorized" | "forbidden" | "error";
type RequestMode = "new_root" | "append_existing_root";
type AppendKind = "drawing" | "part" | "drawing_part";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type DrawingPurposeCode = "M" | "R";

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

type AppendPolicy = {
  root: {
    rootCode: string;
    coreName: string;
    itemKind: ItemKind;
    developmentPhase: NumberingPhase;
    recordStatus: string;
  };
  locked: boolean;
  reasonRequired: boolean;
  nextNumbers: {
    part: string;
    drawingM: string;
    drawingR: string;
  };
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

type AppendCreatedRecord = {
  kind: AppendKind;
  root: {
    rootCode: string;
    coreName: string;
    itemKind: ItemKind;
    developmentPhase: NumberingPhase;
    recordStatus: string;
  };
  partNumber: CreatedRecord["partNumber"] | null;
  drawingNumber: CreatedRecord["drawingNumber"];
  linkType: "primary_manufacturing" | "reference" | null;
  reusedFromIdempotency: boolean;
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
  const [requestMode, setRequestMode] = useState<RequestMode>("new_root");
  const [appendRootCode, setAppendRootCode] = useState("");
  const [appendKind, setAppendKind] = useState<AppendKind>("drawing");
  const [appendReason, setAppendReason] = useState("");
  const [appendPolicy, setAppendPolicy] = useState<AppendPolicy | null>(null);
  const [appendPolicyState, setAppendPolicyState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [coreName, setCoreName] = useState("");
  const [itemKind, setItemKind] = useState<ItemKind>("manufactured");
  const developmentPhase = initialDevelopmentPhase;
  const [isUniversal, setIsUniversal] = useState(false);
  const [universalReason, setUniversalReason] = useState("");
  const [customSpecification, setCustomSpecification] = useState("");
  const [drawingRequested, setDrawingRequested] = useState(true);
  const [drawingPurposeCode, setDrawingPurposeCode] = useState<DrawingPurposeCode>("M");
  const [drawingPurposeDescription, setDrawingPurposeDescription] = useState("");
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [createdRecord, setCreatedRecord] = useState<CreatedRecord | null>(null);
  const [appendCreatedRecord, setAppendCreatedRecord] = useState<AppendCreatedRecord | null>(null);
  const [busy, setBusy] = useState<"check" | "submit" | null>(null);
  const [error, setError] = useState("");
  const submitInFlightRef = useRef(false);
  const coreNameInputRef = useRef<HTMLInputElement>(null);
  const customSpecificationInputRef = useRef<HTMLInputElement>(null);

  const effectiveCoreName = requestMode === "append_existing_root" ? appendPolicy?.root.coreName ?? "" : coreName;
  const lockedPartName = effectiveCoreName.trim();

  useEffect(() => {
    const syncBrowserRestoredValues = () => {
      setCoreName((current) => current || coreNameInputRef.current?.value || "");
      setCustomSpecification((current) => current || customSpecificationInputRef.current?.value || "");
    };
    const timers = [0, 120, 600, 1500, 3000].map((delay) => window.setTimeout(syncBrowserRestoredValues, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const rootCode = appendRootCode.trim();
    if (requestMode !== "append_existing_root" || !rootCode) {
      setAppendPolicy(null);
      setAppendPolicyState("idle");
      return;
    }

    const controller = new AbortController();
    setAppendPolicyState("loading");
    fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/append-policy`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setState("unauthorized");
          return null;
        }
        if (response.status === 403) {
          setState("forbidden");
          return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as AppendPolicy;
      })
      .then((policy) => {
        if (!policy) return;
        setAppendPolicy(policy);
        setAppendPolicyState("ready");
        setState("ready");
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setAppendPolicy(null);
        setAppendPolicyState("error");
      });

    return () => controller.abort();
  }, [appendRootCode, requestMode]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    const needsPart = requestMode === "new_root" || appendKind !== "drawing";
    const needsDrawing = requestMode === "new_root" ? drawingRequested : appendKind !== "part";
    if (requestMode === "new_root" && !coreName.trim()) errors.push("主根品名必填");
    if (requestMode === "append_existing_root") {
      if (!appendRootCode.trim()) errors.push("既有主根號必填");
      if (appendPolicy?.locked) errors.push("此主根已關閉，不能追加圖號或料號");
      if (appendPolicy?.reasonRequired && !appendReason.trim()) errors.push("正式資料追加原因必填");
    }
    if (needsPart) {
      if (!lockedPartName) errors.push("主根品名必填");
      if (itemKind === "custom" && !customSpecification.trim()) errors.push("客製尺寸/規格必填");
      if ((isUniversal || itemKind === "shared") && !universalReason.trim()) errors.push("共用件理由必填");
    }
    if (needsDrawing && drawingPurposeCode === "R" && !drawingPurposeDescription.trim()) errors.push("參考圖用途描述必填");
    return errors;
  }, [
    appendKind,
    appendPolicy?.locked,
    appendPolicy?.reasonRequired,
    appendReason,
    appendRootCode,
    coreName,
    customSpecification,
    drawingPurposeCode,
    drawingPurposeDescription,
    drawingRequested,
    isUniversal,
    itemKind,
    lockedPartName,
    requestMode,
    universalReason
  ]);

  async function runDuplicateCheck() {
    if (requestMode !== "new_root") return;
    setBusy("check");
    setError("");
    const response = await fetch("/api/numbering/duplicate-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coreName, partName: lockedPartName })
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
    const currentCreated = requestMode === "new_root" ? createdRecord : appendCreatedRecord;
    if (submitInFlightRef.current || currentCreated) return;
    if (validation.length > 0) {
      setError(validation.join("、"));
      setState("error");
      return;
    }
    submitInFlightRef.current = true;
    setBusy("submit");
    setError("");
    try {
      if (requestMode === "append_existing_root") {
        const rootCode = appendRootCode.trim();
        const idempotencyKey = createClientIdempotencyKey();
        const commonBody = {
          reason: appendReason,
          sourceEntrypoint: "numbering_request_append",
          idempotencyKey
        };
        const partBody = {
          itemKind,
          isUniversal: isUniversal || itemKind === "shared",
          universalReason,
          customSpecification
        };
        const drawingBody = {
          purposeCode: drawingPurposeCode,
          purposeDescription: drawingPurposeDescription
        };
        const endpoint =
          appendKind === "drawing"
            ? `/api/numbering/roots/${encodeURIComponent(rootCode)}/drawings`
            : appendKind === "part"
              ? `/api/numbering/roots/${encodeURIComponent(rootCode)}/parts`
              : `/api/numbering/roots/${encodeURIComponent(rootCode)}/drawing-part`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...commonBody,
            ...(appendKind !== "part" ? drawingBody : {}),
            ...(appendKind !== "drawing" ? partBody : {}),
            ...(appendKind === "drawing_part" ? { linkRelationType: "auto" } : {})
          })
        });
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
          setError(humanizeAppendError(body.error ?? "追加失敗"));
          setState("error");
          return;
        }
        setAppendCreatedRecord({
          kind: appendKind,
          root: body.root,
          partNumber: body.partNumber ?? null,
          drawingNumber: body.drawingNumber ?? null,
          linkType: body.linkType ?? null,
          reusedFromIdempotency: Boolean(body.reusedFromIdempotency)
        });
        setCreatedRecord(null);
        setState("ready");
        return;
      }

      const response = await fetch("/api/numbering/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coreName,
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
      setAppendCreatedRecord(null);
      setState("ready");
    } finally {
      submitInFlightRef.current = false;
      setBusy(null);
    }
  }

  function resetRequest() {
    submitInFlightRef.current = false;
    setCreatedRecord(null);
    setAppendCreatedRecord(null);
    setError("");
    setState("ready");
  }

  const hasCurrentCreated = requestMode === "new_root" ? Boolean(createdRecord) : Boolean(appendCreatedRecord);
  const partFormVisible = requestMode === "new_root" || appendKind !== "drawing";
  const drawingSectionActive = requestMode === "new_root" ? drawingRequested : appendKind !== "part";
  const submitLabel = requestMode === "new_root" ? (createdRecord ? "已建立" : "建立號碼") : appendCreatedRecord ? "已追加" : "建立追加";
  const appendDrawingPreview = drawingPurposeCode === "M" ? appendPolicy?.nextNumbers.drawingM : appendPolicy?.nextNumbers.drawingR;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>領號申請</h1>
          <p>建立新主根，或在既有主根下追加圖號與料號。</p>
        </div>
        <button className="secondary-button" type="button" onClick={resetRequest}>
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
              <h2>申請模式</h2>
              <p style={mutedTextStyle}>從物件明細進來最直覺；此頁保留全域備援入口。</p>
            </div>
          </div>
          <div style={formGridStyle}>
            <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
              <span>模式</span>
              <div style={segmentedControlStyle}>
                <button type="button" style={segmentedButtonStyle(requestMode === "new_root")} onClick={() => setRequestMode("new_root")}>
                  新主根號
                </button>
                <button type="button" style={segmentedButtonStyle(requestMode === "append_existing_root")} onClick={() => setRequestMode("append_existing_root")}>
                  既有主根號追加
                </button>
              </div>
            </div>
            {requestMode === "append_existing_root" ? (
              <>
                <label style={fieldStyle}>
                  <span>既有主根號</span>
                  <input value={appendRootCode} onChange={(event) => setAppendRootCode(event.target.value.toUpperCase())} placeholder="例如：A0001" />
                </label>
                <label style={fieldStyle}>
                  <span>追加內容</span>
                  <select value={appendKind} onChange={(event) => setAppendKind(event.target.value as AppendKind)}>
                    <option value="drawing">新增圖號</option>
                    <option value="part">新增料號</option>
                    <option value="drawing_part">新增圖號 + 料號並建立關係</option>
                  </select>
                </label>
                <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                  <span>{appendPolicy?.reasonRequired ? "追加原因（正式資料必填）" : "追加原因"}</span>
                  <input value={appendReason} onChange={(event) => setAppendReason(event.target.value)} placeholder="例如：同主根新增第二款料件或補參考圖" />
                </label>
                <div style={{ ...lockedPhaseStyle, gridColumn: "1 / -1" }}>
                  <strong>
                    {appendPolicyState === "loading"
                      ? "讀取主根資料中..."
                      : appendPolicy
                        ? `${appendPolicy.root.rootCode} / ${appendPolicy.root.coreName}`
                        : appendRootCode.trim()
                          ? "找不到主根或無法讀取"
                          : "輸入主根號後顯示下一號預覽"}
                  </strong>
                  <small>
                    {appendPolicy
                      ? `下一料號 ${appendPolicy.nextNumbers.part}，下一製造圖 ${appendPolicy.nextNumbers.drawingM}，下一參考圖 ${appendPolicy.nextNumbers.drawingR}`
                      : "既有主根追加不會建立新主根。"}
                  </small>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{partFormVisible ? "基本資料" : "圖號追加"}</h2>
              <p style={mutedTextStyle}>
              {partFormVisible
                ? requestMode === "append_existing_root"
                    ? "追加料號的品名跟隨主根，不在料號或圖號上另行改名。"
                    : "新領號固定以主根品名作為料號品名；DVT、PVT、正式階段由後續關卡流程晉升。"
                  : "這次只新增圖號，不需填寫料號資料。"}
              </p>
            </div>
            <div style={actionGroupStyle}>
              {requestMode === "new_root" ? (
                <button className="secondary-button" type="button" onClick={runDuplicateCheck} disabled={busy === "check" || !coreName.trim()}>
                  <Search size={16} />
                  查重預檢
                </button>
              ) : null}
              <button className="primary-button" type="button" onClick={submitRequest} disabled={busy === "submit" || validation.length > 0 || hasCurrentCreated}>
                <Send size={16} />
                {submitLabel}
              </button>
            </div>
          </div>
          {partFormVisible ? (
          <div style={formGridStyle}>
            {requestMode === "new_root" ? (
              <label style={fieldStyle}>
                <span>主根品名</span>
                <input
                  ref={coreNameInputRef}
                  value={coreName}
                  autoComplete="off"
                  onInput={(event) => setCoreName(event.currentTarget.value)}
                  onChange={(event) => setCoreName(event.target.value)}
                  placeholder="例如：滑鼠"
                />
              </label>
            ) : (
              <label style={fieldStyle}>
                <span>既有主根</span>
                <div style={lockedPhaseStyle}>
                  <strong>{appendPolicy?.root.rootCode ?? (appendRootCode.trim() || "待輸入主根號")}</strong>
                  <small>{appendPolicy?.root.coreName ?? "讀取主根後帶入主根品名"}</small>
                </div>
              </label>
            )}
            <div style={lockedPhaseStyle}>
              <strong>{lockedPartName || "先輸入或讀取主根品名"}</strong>
              <small>料號與圖號共用主根品名，不能在料號或圖號建立時另外改名。</small>
            </div>
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
          ) : (
            <div className="empty">這次只新增圖號，請在下方選擇 M/R 與用途描述。</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{requestMode === "append_existing_root" ? "追加圖號" : "圖號"}</h2>
              <p style={mutedTextStyle}>
                {requestMode === "append_existing_root"
                  ? appendDrawingPreview
                    ? `預計建立 ${appendDrawingPreview}`
                    : "輸入既有主根後顯示下一個 M/R 圖號。"
                  : "可先只建立料號，之後再補圖號；新圖號使用 A0001-M01 / A0001-R01 格式。"}
              </p>
            </div>
            {requestMode === "new_root" ? (
              <label style={checkRowStyle}>
                <input type="checkbox" checked={drawingRequested} onChange={(event) => setDrawingRequested(event.target.checked)} />
                <span>同步建立圖號</span>
              </label>
            ) : null}
          </div>
          {drawingSectionActive ? (
            <div style={formGridStyle}>
              <label style={fieldStyle}>
                <span>圖別</span>
                <select value={drawingPurposeCode} onChange={(event) => setDrawingPurposeCode(event.target.value as DrawingPurposeCode)}>
                  <option value="M">M 製造圖</option>
                  <option value="R">R 參考圖</option>
                </select>
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>用途描述</span>
                <input
                  value={drawingPurposeDescription}
                  onChange={(event) => setDrawingPurposeDescription(event.target.value)}
                  placeholder={drawingPurposeCode === "R" ? "參考圖必填用途/子類" : "可留空"}
                />
              </label>
            </div>
          ) : (
            <div className="empty">{requestMode === "new_root" ? "先料號後圖號" : "這次只新增料號，不建立圖號。"}</div>
          )}
        </section>

        <DuplicatePanel result={requestMode === "new_root" ? duplicateResult : null} />
        <ResultPanel record={requestMode === "new_root" ? createdRecord : null} />
        <AppendResultPanel record={requestMode === "append_existing_root" ? appendCreatedRecord : null} />
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

function AppendResultPanel({ record }: { record: AppendCreatedRecord | null }) {
  if (!record) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>追加結果</h2>
          <p style={mutedTextStyle}>{record.reusedFromIdempotency ? "已回傳剛剛建立的追加結果，沒有重複配號。" : "已在既有主根下建立草稿號碼。"}</p>
        </div>
        <CheckCircle2 size={20} color="var(--success)" />
      </div>
      <div style={resultGridStyle}>
        <ResultCard
          label="主根號"
          value={record.root.rootCode}
          detailHref={`/numbering/search?query=${encodeURIComponent(record.root.rootCode)}&entityType=part_root&detail=${encodeURIComponent(record.root.rootCode)}`}
        />
        {record.partNumber ? (
          <ResultCard
            label="料號"
            value={record.partNumber.partNumber}
            detailHref={`/parts?query=${encodeURIComponent(record.partNumber.partNumber)}&detail=${encodeURIComponent(record.partNumber.partNumber)}`}
          />
        ) : null}
        {record.drawingNumber ? (
          <ResultCard
            label="圖號"
            value={record.drawingNumber.drawingNumber}
            detailHref={`/numbering/drawings?query=${encodeURIComponent(record.drawingNumber.drawingNumber)}&detail=${encodeURIComponent(record.drawingNumber.drawingNumber)}`}
          />
        ) : null}
        {record.linkType ? <ResultCard label="圖料關係" value={record.linkType === "primary_manufacturing" ? "製造依據" : "參考關係"} /> : null}
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

function createClientIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `append-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function humanizeAppendError(message: string) {
  if (message.includes("PART_ROOT_NOT_FOUND")) return "找不到這個主根號，請回主根明細確認後再追加。";
  if (message.includes("ROOT_APPEND_LOCKED")) return "此主根已關閉或作廢，不能再追加圖號或料號。";
  if (message.includes("APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT")) return "此主根已有正式資料，追加時必須填寫原因。";
  if (message.includes("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING")) return "參考圖不能設為製造依據，請改用參考關係或選 M 製造圖。";
  if (message.includes("DRAWING_PART_ROOT_MISMATCH")) return "圖號與料號不在同一主根下，不能建立關係。";
  return message || "追加失敗，請稍後再試。";
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
const segmentedControlStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "4px",
  background: "var(--panel-2)",
  flexWrap: "wrap" as const
};
function segmentedButtonStyle(active: boolean) {
  return {
    border: active ? "1px solid var(--accent)" : "1px solid transparent",
    borderRadius: "6px",
    padding: "0.45rem 0.75rem",
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--text)" : "var(--muted)",
    cursor: "pointer"
  };
}
const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap" as const
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
