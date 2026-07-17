"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Copy, FileText, PackagePlus, RotateCcw, Search, Send } from "lucide-react";
import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";

type LoadState = "ready" | "unauthorized" | "forbidden" | "error";
type RequestMode = "new_root" | "append_existing_root";
type AppendKind = "drawing" | "part" | "drawing_part";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type NumberingPhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type DrawingPurposeCode = "M" | "R";
type DuplicateCheckState = "idle" | "checking" | "ready" | "error";
type ValidationIssue = { fieldId: string; message: string };

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
    seriesCode: string | null;
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
  const [seriesCode, setSeriesCode] = useState("");
  const [drawingRequested, setDrawingRequested] = useState(true);
  const [drawingPurposeCode, setDrawingPurposeCode] = useState<DrawingPurposeCode>("M");
  const [drawingPurposeDescription, setDrawingPurposeDescription] = useState("");
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [duplicateCheckState, setDuplicateCheckState] = useState<DuplicateCheckState>("idle");
  const [duplicateCheckRetry, setDuplicateCheckRetry] = useState(0);
  const [createdRecord, setCreatedRecord] = useState<CreatedRecord | null>(null);
  const [appendCreatedRecord, setAppendCreatedRecord] = useState<AppendCreatedRecord | null>(null);
  const [busy, setBusy] = useState<"submit" | null>(null);
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const submitInFlightRef = useRef(false);
  const coreNameInputRef = useRef<HTMLInputElement>(null);
  const customSpecificationInputRef = useRef<HTMLInputElement>(null);
  const seriesCodeInputRef = useRef<HTMLInputElement>(null);

  const effectiveCoreName = requestMode === "append_existing_root" ? appendPolicy?.root.coreName ?? "" : coreName;
  const lockedPartName = effectiveCoreName.trim();
  const seriesCodeEligible = itemKind === "manufactured" && !isUniversal;

  useEffect(() => {
    const syncBrowserRestoredValues = () => {
      setCoreName((current) => current || coreNameInputRef.current?.value || "");
      setCustomSpecification((current) => current || customSpecificationInputRef.current?.value || "");
      setSeriesCode((current) => current || seriesCodeInputRef.current?.value || "");
    };
    const timers = [0, 120, 600, 1500, 3000].map((delay) => window.setTimeout(syncBrowserRestoredValues, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!seriesCodeEligible) setSeriesCode("");
  }, [seriesCodeEligible]);

  useEffect(() => {
    const rootCode = appendRootCode.trim();
    if (requestMode !== "append_existing_root" || !rootCode) {
      setAppendPolicy(null);
      setAppendPolicyState("idle");
      return;
    }

    const controller = new AbortController();
    setAppendPolicy(null);
    setAppendPolicyState("loading");
    const timer = window.setTimeout(() => {
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
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [appendRootCode, requestMode]);

  useEffect(() => {
    const name = coreName.trim();
    if (requestMode !== "new_root" || name.length < 2) {
      setDuplicateResult(null);
      setDuplicateCheckState("idle");
      return;
    }

    const controller = new AbortController();
    setDuplicateResult(null);
    setDuplicateCheckState("checking");
    const timer = window.setTimeout(() => {
      fetch("/api/numbering/duplicate-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coreName: name, partName: name }),
        signal: controller.signal
      })
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
          return (await response.json()) as DuplicateResult;
        })
        .then((result) => {
          if (!result) return;
          setDuplicateResult(result);
          setDuplicateCheckState("ready");
          setState("ready");
        })
        .catch((fetchError: unknown) => {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
          setDuplicateResult(null);
          setDuplicateCheckState("error");
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [coreName, duplicateCheckRetry, requestMode]);

  const validation = useMemo(() => {
    const errors: ValidationIssue[] = [];
    const add = (fieldId: string, message: string) => errors.push({ fieldId, message });
    const needsPart = requestMode === "new_root" || appendKind !== "drawing";
    const needsDrawing = requestMode === "new_root" ? drawingRequested : appendKind !== "part";
    if (requestMode === "new_root" && !coreName.trim()) add("numbering-core-name", "請填寫產品或零件名稱");
    if (requestMode === "new_root" && duplicateResult?.blocked) add("numbering-core-name", "已有高度相似資料，請先改用既有主根或確認名稱");
    if (requestMode === "append_existing_root") {
      if (!appendRootCode.trim()) add("numbering-append-root", "請輸入既有主根號");
      if (appendRootCode.trim() && appendPolicyState === "error") add("numbering-append-root", "找不到這個主根號，請確認後重試");
      if (appendPolicy?.locked) add("numbering-append-root", "此主根已關閉，不能再新增圖號或料號");
      if (appendPolicy?.reasonRequired && !appendReason.trim()) add("numbering-append-reason", "此主根已有正式資料，請填寫新增原因");
    }
    if (needsPart) {
      if (!lockedPartName && requestMode === "append_existing_root") add("numbering-append-root", "需要有效的確定品名");
      if (itemKind === "custom" && !customSpecification.trim()) add("numbering-custom-spec", "請填寫客製尺寸或規格");
      if ((isUniversal || itemKind === "shared") && !universalReason.trim()) add("numbering-universal-reason", "請說明跨專案共用原因");
    }
    if (needsDrawing && drawingPurposeCode === "R" && !drawingPurposeDescription.trim()) add("numbering-drawing-description", "請說明參考圖用途");
    return errors;
  }, [
    appendKind,
    appendPolicyState,
    appendPolicy?.locked,
    appendPolicy?.reasonRequired,
    appendReason,
    appendRootCode,
    coreName,
    customSpecification,
    drawingPurposeCode,
    drawingPurposeDescription,
    drawingRequested,
    duplicateResult?.blocked,
    isUniversal,
    itemKind,
    lockedPartName,
    requestMode,
    universalReason
  ]);

  async function submitRequest() {
    const currentCreated = requestMode === "new_root" ? createdRecord : appendCreatedRecord;
    if (submitInFlightRef.current || currentCreated) return;
    if (validation.length > 0) {
      setShowValidation(true);
      window.requestAnimationFrame(() => document.getElementById(validation[0].fieldId)?.focus());
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
          customSpecification,
          seriesCode: seriesCodeEligible ? seriesCode : ""
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
          seriesCode: seriesCodeEligible ? seriesCode : "",
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

  function resetRequest(nextMode: RequestMode = "new_root") {
    submitInFlightRef.current = false;
    setRequestMode(nextMode);
    setAppendRootCode("");
    setAppendKind("drawing");
    setAppendReason("");
    setAppendPolicy(null);
    setAppendPolicyState("idle");
    setCoreName("");
    setItemKind("manufactured");
    setIsUniversal(false);
    setUniversalReason("");
    setCustomSpecification("");
    setSeriesCode("");
    setDrawingRequested(true);
    setDrawingPurposeCode("M");
    setDrawingPurposeDescription("");
    setDuplicateResult(null);
    setDuplicateCheckState("idle");
    setCreatedRecord(null);
    setAppendCreatedRecord(null);
    setBusy(null);
    setError("");
    setShowValidation(false);
    setState("ready");
    window.requestAnimationFrame(() => {
      document.getElementById(nextMode === "new_root" ? "numbering-core-name" : "numbering-append-root")?.focus();
    });
  }

  function selectRequestMode(nextMode: RequestMode) {
    if (nextMode === requestMode) return;
    resetRequest(nextMode);
  }

  function selectNewRootOutput(output: "part_only" | "part_manufacturing" | "part_reference") {
    setDrawingRequested(output !== "part_only");
    if (output === "part_manufacturing") setDrawingPurposeCode("M");
    if (output === "part_reference") setDrawingPurposeCode("R");
    setDrawingPurposeDescription("");
    setShowValidation(false);
  }

  const hasCurrentCreated = requestMode === "new_root" ? Boolean(createdRecord) : Boolean(appendCreatedRecord);
  const partFormVisible = requestMode === "new_root" || appendKind !== "drawing";
  const drawingSectionActive = requestMode === "new_root" ? drawingRequested : appendKind !== "part";
  const newRootOutput = !drawingRequested ? "part_only" : drawingPurposeCode === "M" ? "part_manufacturing" : "part_reference";
  const drawingKindLabel = drawingPurposeCode === "M" ? "製造圖" : "參考圖";
  const submitLabel = requestMode === "new_root"
    ? drawingRequested
      ? `建立料號與${drawingKindLabel}申請`
      : "建立料號申請"
    : appendKind === "drawing"
      ? `新增${drawingKindLabel}申請`
      : appendKind === "part"
        ? "新增料號申請"
        : `新增料號與${drawingKindLabel}申請`;
  const appendDrawingPreview = drawingPurposeCode === "M" ? appendPolicy?.nextNumbers.drawingM : appendPolicy?.nextNumbers.drawingR;
  const submitBlocked = busy === "submit" || hasCurrentCreated || duplicateCheckState === "checking" || Boolean(duplicateResult?.blocked) || appendPolicyState === "loading";
  const visibleValidation = showValidation ? validation : [];
  const validationFor = (fieldId: string) => visibleValidation.find((issue) => issue.fieldId === fieldId)?.message;

  return (
    <div className="numbering-request-page">
      <header className="numbering-request-heading">
        <div>
          <div className="numbering-request-title-row">
            <h1>建立圖料號 <StatusScopeHelp scope="numberingRequest" /></h1>
            <span>領號申請</span>
          </div>
          <p>先確認要建立的內容，再由系統配置申請中的保留號碼。</p>
        </div>
        {!hasCurrentCreated ? (
          <button className="secondary-button" type="button" onClick={() => resetRequest()}>
            <RotateCcw size={16} />
            清空表單
          </button>
        ) : null}
      </header>

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再建立圖料號。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="工程師、研發主管或管理員可建立圖料號。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => setState("ready")} /> : null}

      {hasCurrentCreated ? (
        requestMode === "new_root" ? (
          <ResultPanel record={createdRecord} onReset={() => resetRequest()} />
        ) : (
          <AppendResultPanel record={appendCreatedRecord} onReset={() => resetRequest("append_existing_root")} />
        )
      ) : (
        <div className="numbering-request-layout">
          <main className="numbering-request-form-shell">
            <section className="numbering-request-section" aria-labelledby="numbering-step-1">
              <StepHeading number="1" title="這次要做什麼" description="選擇全新建立，或在已存在的設計主題下新增內容。" id="numbering-step-1" />
              <div className="numbering-request-mode-selector" role="group" aria-label="建立方式">
                <button type="button" className={requestMode === "new_root" ? "is-active" : ""} aria-pressed={requestMode === "new_root"} onClick={() => selectRequestMode("new_root")}>
                  <PackagePlus size={20} />
                  <span><strong>建立全新圖料</strong><small>建立新的主根與第一個料號</small></span>
                </button>
                <button type="button" className={requestMode === "append_existing_root" ? "is-active" : ""} aria-pressed={requestMode === "append_existing_root"} onClick={() => selectRequestMode("append_existing_root")}>
                  <FileText size={20} />
                  <span><strong>在既有主根下新增</strong><small>沿用主根，新增圖號或料號</small></span>
                </button>
              </div>

              <div className="numbering-request-subgroup">
                <h3>這次要建立</h3>
                {requestMode === "new_root" ? (
                  <div className="numbering-request-output-selector" role="group" aria-label="建立內容">
                    <button type="button" className={newRootOutput === "part_manufacturing" ? "is-active" : ""} aria-pressed={newRootOutput === "part_manufacturing"} onClick={() => selectNewRootOutput("part_manufacturing")}><Check size={16} />料號＋製造圖</button>
                    <button type="button" className={newRootOutput === "part_only" ? "is-active" : ""} aria-pressed={newRootOutput === "part_only"} onClick={() => selectNewRootOutput("part_only")}>只建立料號</button>
                    <button type="button" className={newRootOutput === "part_reference" ? "is-active" : ""} aria-pressed={newRootOutput === "part_reference"} onClick={() => selectNewRootOutput("part_reference")}>料號＋參考圖</button>
                  </div>
                ) : (
                  <div className="numbering-request-output-selector" role="group" aria-label="新增內容">
                    <button type="button" className={appendKind === "drawing" ? "is-active" : ""} aria-pressed={appendKind === "drawing"} onClick={() => setAppendKind("drawing")}>只新增圖號</button>
                    <button type="button" className={appendKind === "part" ? "is-active" : ""} aria-pressed={appendKind === "part"} onClick={() => setAppendKind("part")}>只新增料號</button>
                    <button type="button" className={appendKind === "drawing_part" ? "is-active" : ""} aria-pressed={appendKind === "drawing_part"} onClick={() => setAppendKind("drawing_part")}>新增料號＋圖號</button>
                  </div>
                )}
              </div>
            </section>

            <section className="numbering-request-section" aria-labelledby="numbering-step-2">
              <StepHeading number="2" title={requestMode === "new_root" ? "命名新的設計主題" : "選擇既有主根"} description={requestMode === "new_root" ? "使用同事搜尋時最容易辨識的產品或零件名稱。" : "輸入主根號後，系統會顯示名稱與下一個可用號碼。"} id="numbering-step-2" />
              {requestMode === "new_root" ? (
                <div className="numbering-request-field numbering-request-field-wide">
                  <label htmlFor="numbering-core-name">產品／零件名稱 <em>必填</em></label>
                  <input
                    id="numbering-core-name"
                    ref={coreNameInputRef}
                    value={coreName}
                    autoComplete="off"
                    aria-invalid={Boolean(validationFor("numbering-core-name"))}
                    aria-describedby={validationFor("numbering-core-name") ? "numbering-core-name-error" : "numbering-core-name-hint"}
                    onInput={(event) => setCoreName(event.currentTarget.value)}
                    onChange={(event) => setCoreName(event.target.value)}
                    placeholder="例如：集塵機葉輪"
                  />
                  {validationFor("numbering-core-name") ? <small className="numbering-request-field-error" id="numbering-core-name-error">{validationFor("numbering-core-name")}</small> : <small id="numbering-core-name-hint">系統會以這個名稱建立主根與第一個料號。</small>}
                  <DuplicatePanel result={duplicateResult} state={duplicateCheckState} onRetry={() => setDuplicateCheckRetry((value) => value + 1)} />
                </div>
              ) : (
                <div className="numbering-request-field-grid">
                  <div className="numbering-request-field">
                    <label htmlFor="numbering-append-root">既有主根號 <em>必填</em></label>
                    <input
                      id="numbering-append-root"
                      value={appendRootCode}
                      autoComplete="off"
                      aria-invalid={Boolean(validationFor("numbering-append-root"))}
                      onChange={(event) => setAppendRootCode(event.target.value.toUpperCase())}
                      placeholder="例如：A0001"
                    />
                    {validationFor("numbering-append-root") ? <small className="numbering-request-field-error">{validationFor("numbering-append-root")}</small> : <small>只會在這個主根下新增，不會建立另一個主根。</small>}
                  </div>
                  <div className={`numbering-request-root-preview state-${appendPolicyState}`} aria-live="polite">
                    <strong>{appendPolicyState === "loading" ? "正在讀取主根資料" : appendPolicy ? `${appendPolicy.root.rootCode} · ${appendPolicy.root.coreName}` : appendRootCode.trim() ? "尚未找到主根" : "等待輸入主根號"}</strong>
                    <small>{appendPolicy ? `下一料號 ${appendPolicy.nextNumbers.part} · 製造圖 ${appendPolicy.nextNumbers.drawingM} · 參考圖 ${appendPolicy.nextNumbers.drawingR}` : "成功讀取後會顯示名稱與下一號預覽。"}</small>
                  </div>
                  <div className="numbering-request-field numbering-request-field-wide">
                    <label htmlFor="numbering-append-reason">新增原因 {appendPolicy?.reasonRequired ? <em>必填</em> : <span>選填</span>}</label>
                    <input id="numbering-append-reason" value={appendReason} aria-invalid={Boolean(validationFor("numbering-append-reason"))} onChange={(event) => setAppendReason(event.target.value)} placeholder="例如：同主根新增第二款料件或補參考圖" />
                    {validationFor("numbering-append-reason") ? <small className="numbering-request-field-error">{validationFor("numbering-append-reason")}</small> : null}
                  </div>
                </div>
              )}
            </section>

            {partFormVisible ? (
              <section className="numbering-request-section" aria-labelledby="numbering-step-3">
                <StepHeading number="3" title="填寫料件資料" description="料號品名會跟隨確定品名，不需要重複輸入。" id="numbering-step-3" trailing={<span className="numbering-request-phase" data-testid="initial-development-phase">初始階段 {initialDevelopmentPhase}</span>} />
                <div className="numbering-request-field-grid">
                  <div className="numbering-request-name-preview">
                    <span>料號品名</span>
                    <strong>{lockedPartName || "完成上一步後自動帶入"}</strong>
                  </div>
                  <div className="numbering-request-field">
                    <label htmlFor="numbering-item-kind">料件類型</label>
                    <select id="numbering-item-kind" value={itemKind} onChange={(event) => setItemKind(event.target.value as ItemKind)}>
                      {itemKinds.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  {seriesCodeEligible ? (
                    <div className="numbering-request-field">
                      <label htmlFor="numbering-series-code">系列／機型 <span>選填</span></label>
                      <input id="numbering-series-code" ref={seriesCodeInputRef} value={seriesCode} autoComplete="off" maxLength={80} onInput={(event) => setSeriesCode(event.currentTarget.value)} onChange={(event) => setSeriesCode(event.target.value)} placeholder="例如：S1、JF-200" />
                    </div>
                  ) : null}
                  {itemKind === "custom" ? (
                    <div className="numbering-request-field numbering-request-field-wide">
                      <label htmlFor="numbering-custom-spec">客製尺寸／規格 <em>必填</em></label>
                      <input id="numbering-custom-spec" ref={customSpecificationInputRef} value={customSpecification} autoComplete="off" aria-invalid={Boolean(validationFor("numbering-custom-spec"))} onInput={(event) => setCustomSpecification(event.currentTarget.value)} onChange={(event) => setCustomSpecification(event.target.value)} placeholder="例如：L120 × W30 × H8，孔距 90" />
                      {validationFor("numbering-custom-spec") ? <small className="numbering-request-field-error">{validationFor("numbering-custom-spec")}</small> : null}
                    </div>
                  ) : null}
                  {itemKind === "shared" ? (
                    <div className="numbering-request-inline-note"><CheckCircle2 size={17} /><span>此料件類型會自動標示為跨專案共用。</span></div>
                  ) : (
                    <label className="numbering-request-toggle"><input type="checkbox" checked={isUniversal} onChange={(event) => setIsUniversal(event.target.checked)} /><span><strong>跨專案共用</strong><small>只有確實供多個專案使用時才開啟。</small></span></label>
                  )}
                  {(isUniversal || itemKind === "shared") ? (
                    <div className="numbering-request-field numbering-request-field-wide">
                      <label htmlFor="numbering-universal-reason">共用原因 <em>必填</em></label>
                      <input id="numbering-universal-reason" value={universalReason} aria-invalid={Boolean(validationFor("numbering-universal-reason"))} onChange={(event) => setUniversalReason(event.target.value)} placeholder="例如：公司標準支架，跨機型共用" />
                      {validationFor("numbering-universal-reason") ? <small className="numbering-request-field-error">{validationFor("numbering-universal-reason")}</small> : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {drawingSectionActive ? (
              <section className="numbering-request-section" aria-labelledby="numbering-drawing-step">
                <StepHeading number={partFormVisible ? "4" : "3"} title="填寫圖面資料" description={appendDrawingPreview ? `目前預計配置 ${appendDrawingPreview}` : "製造圖可作為製造依據；參考圖不可作為製造依據。"} id="numbering-drawing-step" />
                <div className="numbering-request-field-grid">
                  <div className="numbering-request-field">
                    <label htmlFor="numbering-drawing-kind">圖面用途</label>
                    <select id="numbering-drawing-kind" value={drawingPurposeCode} onChange={(event) => { setDrawingPurposeCode(event.target.value as DrawingPurposeCode); setDrawingPurposeDescription(""); }}>
                      <option value="M">M · 製造圖</option>
                      <option value="R">R · 參考圖</option>
                    </select>
                  </div>
                  <div className="numbering-request-field">
                    <label htmlFor="numbering-drawing-description">用途說明 {drawingPurposeCode === "R" ? <em>必填</em> : <span>選填</span>}</label>
                    <input id="numbering-drawing-description" value={drawingPurposeDescription} aria-invalid={Boolean(validationFor("numbering-drawing-description"))} onChange={(event) => setDrawingPurposeDescription(event.target.value)} placeholder={drawingPurposeCode === "R" ? "例如：安裝位置與外觀參考" : "例如：葉輪焊接製造圖"} />
                    {validationFor("numbering-drawing-description") ? <small className="numbering-request-field-error">{validationFor("numbering-drawing-description")}</small> : null}
                  </div>
                </div>
              </section>
            ) : null}
          </main>

          <aside className="numbering-request-summary" aria-label="建立摘要">
            <div className="numbering-request-summary-header"><div><span>確認內容</span><h2>本次將建立</h2></div><span className="numbering-request-draft-badge">編輯中</span></div>
            <dl>
              <div><dt>建立方式</dt><dd>{requestMode === "new_root" ? "全新圖料" : "既有主根新增"}</dd></div>
              <div><dt>主根</dt><dd>{requestMode === "new_root" ? (coreName.trim() || "系統配置") : (appendPolicy?.root.rootCode ?? (appendRootCode.trim() || "待選擇"))}</dd></div>
              <div><dt>料號</dt><dd>{partFormVisible ? "1 個" : "不建立"}</dd></div>
              <div><dt>圖號</dt><dd>{drawingSectionActive ? `${drawingKindLabel} 1 個` : "不建立"}</dd></div>
              <div><dt>初始狀態</dt><dd>{initialDevelopmentPhase} · 編輯中</dd></div>
            </dl>

            {showValidation && validation.length > 0 ? (
              <div className="numbering-request-summary-alert is-error" role="alert"><AlertTriangle size={18} /><div><strong>還有 {validation.length} 項需要處理</strong><ul>{validation.map((issue, index) => <li key={`${issue.fieldId}-${index}`}>{issue.message}</li>)}</ul></div></div>
            ) : validation.length > 0 ? (
              <div className="numbering-request-summary-alert"><AlertTriangle size={18} /><div><strong>完成必填資料後即可建立</strong><span>目前尚有 {validation.length} 項資料未完成。</span></div></div>
            ) : (
              <div className="numbering-request-summary-alert is-ready"><CheckCircle2 size={18} /><div><strong>資料已完整</strong><span>請確認上方數量與圖面用途。</span></div></div>
            )}

            <button className="primary-button numbering-request-submit" type="button" onClick={submitRequest} disabled={submitBlocked} aria-describedby="numbering-submit-hint">
              {busy === "submit" ? <RotateCcw className="numbering-request-spinner" size={17} /> : <Send size={17} />}
              {busy === "submit" ? "建立中..." : duplicateCheckState === "checking" ? "正在查重..." : submitLabel}
            </button>
            <p id="numbering-submit-hint">建立後是可編輯申請，尚未審核或正式發布。</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function StepHeading({ number, title, description, id, trailing }: { number: string; title: string; description: string; id: string; trailing?: ReactNode }) {
  return (
    <div className="numbering-request-step-heading">
      <span className="numbering-request-step-number">{number}</span>
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
      {trailing ? <div className="numbering-request-step-trailing">{trailing}</div> : null}
    </div>
  );
}

function DuplicatePanel({ result, state, onRetry }: { result: DuplicateResult | null; state: DuplicateCheckState; onRetry: () => void }) {
  if (state === "idle") {
    return <div className="numbering-request-duplicate-status"><Search size={17} /><span>輸入至少兩個字後自動查重</span></div>;
  }
  if (state === "checking") {
    return <div className="numbering-request-duplicate-status" aria-live="polite"><RotateCcw className="numbering-request-spinner" size={17} /><span>正在檢查相似主根...</span></div>;
  }
  if (state === "error" || !result) {
    return <div className="numbering-request-duplicate-status is-error" role="alert"><AlertTriangle size={17} /><span>查重暫時失敗</span><button type="button" onClick={onRetry}>重新查重</button></div>;
  }
  return (
    <div className={`numbering-request-duplicate-result${result.blocked ? " is-blocked" : result.warningsOnly ? " is-warning" : " is-ready"}`}>
      <div className="numbering-request-duplicate-heading">
        {result.blocked ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <div><h3>查重結果</h3><p>{result.matches.length === 0 ? "沒有找到相同或高相似資料，可以繼續。" : `找到 ${result.matches.length} 筆相似資料，請先確認是否應沿用既有主根。`}</p></div>
        <span>{result.blocked ? "阻擋" : result.warningsOnly ? "注意" : "可建立"}</span>
      </div>
      {result.matches.length > 0 ? (
        <details><summary>查看相似資料</summary><div className="table-wrap"><table><thead><tr><th>判定</th><th>代碼</th><th>名稱</th><th><StatusColumnHeader context="masterRecord" /></th><th>相似度</th></tr></thead><tbody>{result.matches.map((match) => <tr key={`${match.entityType}:${match.entityId}`}><td>{match.severity === "blocker" ? "阻擋" : "注意"}</td><td>{match.displayCode}</td><td>{match.displayName}</td><td><StatusBadge status={match.recordStatus} context="masterRecord" /></td><td>{match.score}</td></tr>)}</tbody></table></div></details>
      ) : null}
    </div>
  );
}

function ResultPanel({ record, onReset }: { record: CreatedRecord | null; onReset: () => void }) {
  if (!record) return null;
  return (
    <section className="numbering-request-success">
      <div className="numbering-request-success-heading">
        <span><CheckCircle2 size={26} /></span>
        <div><h2>領號結果</h2><p>已建立申請中的保留號碼，尚未審核或正式發布。</p></div>
      </div>
      <div className="numbering-request-result-grid">
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
        <ResultCard label="系列代號" value={record.partNumber.seriesCode ?? "-"} />
        <ResultCard label="客製規格" value={record.partNumber.customSpecification ?? "-"} />
      </div>
      <div className="numbering-request-success-actions">
        <button className="primary-button" type="button" onClick={onReset}><RotateCcw size={16} />再建立一筆</button>
        <Link className="secondary-button" href="/parts?tab=drafts">前往領號申請<ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}

function AppendResultPanel({ record, onReset }: { record: AppendCreatedRecord | null; onReset: () => void }) {
  if (!record) return null;
  return (
    <section className="numbering-request-success">
      <div className="numbering-request-success-heading">
        <span><CheckCircle2 size={26} /></span>
        <div><h2>追加結果</h2><p>{record.reusedFromIdempotency ? "已回傳剛剛建立的結果，沒有重複配號。" : "已在既有主根下建立申請中的保留號碼，尚未正式發布。"}</p></div>
      </div>
      <div className="numbering-request-result-grid">
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
        {record.partNumber ? <ResultCard label="系列代號" value={record.partNumber.seriesCode ?? "-"} /> : null}
      </div>
      <div className="numbering-request-success-actions">
        <button className="primary-button" type="button" onClick={onReset}><RotateCcw size={16} />繼續新增</button>
        <Link className="secondary-button" href={record.partNumber ? "/parts?tab=drafts" : "/numbering/drawings"}>{record.partNumber ? "前往領號申請" : "前往圖號模組"}<ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}

function ResultCard({ label, value, detailHref }: { label: string; value: string; detailHref?: string }) {
  return (
    <div className="numbering-request-result-card">
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        {value !== "-" && !value.startsWith("未領") ? <CopyButton label={label} value={value} /> : null}
        {detailHref ? (
          <Link className="secondary-button" href={detailHref}>
            明細
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="icon-button" type="button" aria-label={`複製${label}`} title={`複製${label}`} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>;
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
