"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  intentToRequest,
  normalizeCreateError,
  normalizeCreateIntent,
  suggestCanonicalProductName,
  validateCreateIntent,
  type CanonicalNumberingCreateIntent,
  type CreateContent,
  type CreatePurposeCode,
  type CreateScope,
} from "@/lib/canonical-numbering-create-contract";
import {
  CANONICAL_NUMBERING_ITEM_KIND_OPTIONS,
  type CanonicalNumberingItemKind,
} from "@/lib/numbering-item-kind";

type RootResult = {
  entityType: "part_root";
  entityId: string;
  rootCode: string;
  displayCode: string;
  displayName: string;
  recordStatus: string;
};

type Preview = {
  estimated: true;
  observedAt: string;
  content: CreateContent;
  purposeCode: CreatePurposeCode | null;
  nextNumbers?: { root?: string | null; part?: string | null; drawing?: string | null };
  root?: string | null;
  part?: string | null;
  drawing?: string | null;
};

type Policy = {
  root?: { rootCode?: string; coreName?: string; recordStatus?: string; itemKind?: CanonicalNumberingItemKind };
  inheritedPart?: {
    itemKind: CanonicalNumberingItemKind;
    isUniversal: boolean;
    seriesCode: string | null;
    customSpecification: string | null;
  };
  locked?: boolean;
  reasonRequired?: boolean;
  nextNumbers?: { part?: string | null; drawingM?: string | null; drawingR?: string | null };
};

type DuplicateMatch = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  displayCode: string;
  displayName: string;
  score: number;
  reason: "exact_code" | "exact_name" | "high_similarity";
  severity: "warning" | "blocker";
};

type DuplicateResult = {
  blocked: boolean;
  warningsOnly: boolean;
  matches: DuplicateMatch[];
};

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

type FieldKey = "rootCode" | "primaryNoun" | "confirmedName" | "referencePurpose" | "appendReason";

function destination(from: string, result: { root?: { rootCode?: string }; partNumber?: { partNumber?: string }; drawingNumber?: { drawingNumber?: string } | null }) {
  const root = result.root?.rootCode?.trim() || "";
  const part = result.partNumber?.partNumber?.trim() || "";
  const drawing = result.drawingNumber?.drawingNumber?.trim() || "";
  if (from === "drawing" && drawing) return `/numbering/drawings?query=${encodeURIComponent(drawing)}`;
  if (from === "part" && part) return `/parts?query=${encodeURIComponent(part)}`;
  if (drawing && !part) return `/numbering/drawings?query=${encodeURIComponent(drawing)}`;
  if (part && !drawing) return `/parts?query=${encodeURIComponent(part)}`;
  return `/numbering/search?query=${encodeURIComponent(root || drawing || part)}`;
}

function InlineError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="canonical-create-field-error">{message}</span> : null;
}

function describedBy(id: string, message?: string) {
  return message ? id : undefined;
}

export function CanonicalNumberingCreateForm({
  initialFrom = "search",
  initialRoot = "",
  returnTo = "",
}: {
  initialFrom?: "drawing" | "part" | "search";
  initialRoot?: string;
  returnTo?: string;
}) {
  const from = initialFrom;
  const inputId = useId();
  const initialContent: CreateContent = initialRoot ? (from === "drawing" ? "drawing" : "part") : from === "drawing" ? "drawing_part" : "part";
  const [scope, setScope] = useState<CreateScope>(initialRoot ? "existing_root" : "new_root");
  const [content, setContent] = useState<CreateContent>(initialContent);
  const [rootCode, setRootCode] = useState(initialRoot);
  const [rootName, setRootName] = useState("");
  const [rootQuery, setRootQuery] = useState(initialRoot);
  const [rootResults, setRootResults] = useState<RootResult[]>([]);
  const [rootSearchState, setRootSearchState] = useState<LoadState<RootResult[]>>({ status: "idle" });
  const [rootSearchRetry, setRootSearchRetry] = useState(0);
  const [primaryNoun, setPrimaryNoun] = useState("");
  const [nameBrand, setNameBrand] = useState("");
  const [nameSerialIdentifier, setNameSerialIdentifier] = useState("");
  const [confirmedName, setConfirmedName] = useState("");
  const [itemKind, setItemKind] = useState<CanonicalNumberingItemKind>("manufactured");
  const [includeReferenceDrawing, setIncludeReferenceDrawing] = useState(false);
  const [isUniversal, setIsUniversal] = useState(false);
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesState, setSeriesState] = useState<LoadState<string[]>>({ status: "idle" });
  const [seriesRetry, setSeriesRetry] = useState(0);
  const [customSpecification, setCustomSpecification] = useState("");
  const [purposeCode, setPurposeCode] = useState<CreatePurposeCode>("M");
  const [referencePurpose, setReferencePurpose] = useState("");
  const [appendReason, setAppendReason] = useState("");
  const [newPreviewState, setNewPreviewState] = useState<LoadState<Preview>>({ status: "idle" });
  const [previewRetry, setPreviewRetry] = useState(0);
  const [policyState, setPolicyState] = useState<LoadState<Policy>>({ status: "idle" });
  const [policyRetry, setPolicyRetry] = useState(0);
  const [duplicateState, setDuplicateState] = useState<LoadState<DuplicateResult>>({ status: "idle" });
  const [duplicateRetry, setDuplicateRetry] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ root?: { rootCode?: string }; partNumber?: { partNumber?: string }; drawingNumber?: { drawingNumber?: string } | null } | null>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const rootInputRef = useRef<HTMLInputElement>(null);
  const primaryNounRef = useRef<HTMLInputElement>(null);
  const confirmedNameRef = useRef<HTMLInputElement>(null);
  const referencePurposeRef = useRef<HTMLInputElement>(null);
  const appendReasonRef = useRef<HTMLInputElement>(null);
  const rootSearchId = `${inputId}-root-search`;
  const seriesListId = `${inputId}-series-options`;
  const resolvedContent: CreateContent = scope === "new_root"
    ? itemKind === "manufactured" || includeReferenceDrawing ? "drawing_part" : "part"
    : content;
  const resolvedPurposeCode: CreatePurposeCode = scope === "new_root"
    ? itemKind === "manufactured" ? "M" : "R"
    : purposeCode;
  const hasPart = resolvedContent !== "drawing";
  const hasDrawing = resolvedContent !== "part";
  const canShowDetails = scope === "new_root" || Boolean(rootCode);
  const activeSeriesCode = hasPart && itemKind === "manufactured" && !isUniversal ? seriesCode : "";
  const suggestedName = useMemo(() => suggestCanonicalProductName({
    itemKind,
    primaryNoun,
    seriesCode: activeSeriesCode,
    brand: nameBrand,
    specificationModel: itemKind === "purchased" ? customSpecification : "",
    feature: itemKind === "manufactured" ? customSpecification : "",
    serialIdentifier: nameSerialIdentifier,
  }), [activeSeriesCode, customSpecification, itemKind, nameBrand, nameSerialIdentifier, primaryNoun]);

  const intent = useMemo<CanonicalNumberingCreateIntent>(() => {
    const partFields = {
      itemKind,
      isUniversal,
      seriesCode: activeSeriesCode,
      customSpecification,
    };
    const drawingFields = { purposeCode: resolvedPurposeCode, referencePurpose };
    if (scope === "new_root") {
      if (itemKind === "manufactured") {
        return {
          scope,
          content: "drawing_part",
          coreName: confirmedName,
          ...partFields,
          itemKind: "manufactured",
          purposeCode: "M",
          referencePurpose: null,
        };
      }
      if (includeReferenceDrawing) {
        return {
          scope,
          content: "drawing_part",
          coreName: confirmedName,
          ...partFields,
          itemKind: "purchased",
          purposeCode: "R",
          referencePurpose,
        };
      }
      return { scope, content: "part", coreName: confirmedName, ...partFields, itemKind: "purchased" };
    }
    const existingFields = { rootCode, appendReason };
    if (content === "drawing") return { scope, content, ...existingFields, ...drawingFields };
    if (content === "drawing_part") return { scope, content, ...existingFields, ...partFields, ...drawingFields };
    return { scope, content, ...existingFields, ...partFields };
  }, [activeSeriesCode, appendReason, confirmedName, content, customSpecification, includeReferenceDrawing, isUniversal, itemKind, referencePurpose, resolvedPurposeCode, rootCode, scope]);

  useEffect(() => {
    if (scope !== "existing_root" || rootCode || rootQuery.trim().length < 2) {
      setRootResults([]);
      setRootSearchState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRootSearchState({ status: "loading" });
      try {
        const response = await fetch(`/api/numbering/search?entityType=part_root&query=${encodeURIComponent(rootQuery.trim())}&limit=20`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json() as { results?: RootResult[] };
        if (!response.ok) throw new Error("搜尋服務暫時無法使用。");
        const rows = body.results ?? [];
        setRootResults(rows);
        setRootSearchState({ status: "ready", data: rows });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRootResults([]);
        setRootSearchState({ status: "error", message: caught instanceof Error ? caught.message : "搜尋服務暫時無法使用。" });
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [rootCode, rootQuery, rootSearchRetry, scope]);

  useEffect(() => {
    if (scope !== "existing_root" || !rootCode || rootName) return;
    const controller = new AbortController();
    void fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { root?: { coreName?: string; rootCode?: string } } : null)
      .then((body) => {
        const name = body?.root?.coreName?.trim() || "";
        if (name) setRootName(name);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [rootCode, rootName, scope]);

  useEffect(() => {
    if (scope !== "new_root" || !hasPart || itemKind !== "manufactured" || isUniversal) {
      setSeriesState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setSeriesState({ status: "loading" });
    void fetch("/api/numbering/series-codes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { seriesCodeOptions?: string[] };
        if (!response.ok) throw new Error("既有系列代號載入失敗；仍可直接輸入新代號。");
        setSeriesState({ status: "ready", data: body.seriesCodeOptions ?? [] });
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setSeriesState({ status: "error", message: caught instanceof Error ? caught.message : "既有系列代號載入失敗；仍可直接輸入新代號。" });
      });
    return () => controller.abort();
  }, [hasPart, isUniversal, itemKind, scope, seriesRetry]);

  useEffect(() => {
    if (scope !== "existing_root" || !rootCode) {
      setPolicyState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setPolicyState({ status: "loading" });
    void fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/append-policy`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Policy;
        if (!response.ok) throw new Error("無法取得追加限制，請重試。");
        setPolicyState({ status: "ready", data: body });
        if (body.inheritedPart) {
          setItemKind(body.inheritedPart.itemKind);
          setIsUniversal(body.inheritedPart.isUniversal);
          setSeriesCode(body.inheritedPart.seriesCode ?? "");
          setCustomSpecification(body.inheritedPart.customSpecification ?? "");
        } else if (body.root?.itemKind) {
          setItemKind(body.root.itemKind);
          setIsUniversal(false);
          setSeriesCode("");
          setCustomSpecification("");
        }
        const name = body.root?.coreName?.trim() || "";
        if (name) setRootName(name);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setPolicyState({ status: "error", message: caught instanceof Error ? caught.message : "無法取得追加限制，請重試。" });
      });
    return () => controller.abort();
  }, [policyRetry, rootCode, scope]);

  useEffect(() => {
    if (scope !== "new_root") {
      setNewPreviewState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setNewPreviewState({ status: "loading" });
      try {
        const params = new URLSearchParams({ content: resolvedContent === "drawing_part" ? "drawing_part" : "part" });
        if (resolvedContent === "drawing_part") params.set("purposeCode", resolvedPurposeCode);
        const response = await fetch(`/api/numbering/records/preview?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as Preview;
        if (!response.ok) throw new Error("預估暫時無法取得；實際號碼仍只會在建立時配置。");
        setNewPreviewState({ status: "ready", data: body });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setNewPreviewState({ status: "error", message: caught instanceof Error ? caught.message : "預估暫時無法取得。" });
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [previewRetry, resolvedContent, resolvedPurposeCode, scope]);

  const duplicateTarget = scope === "new_root" ? (confirmedName.trim() || suggestedName.trim()) : "";
  useEffect(() => {
    if (scope !== "new_root" || duplicateTarget.length < 2) {
      setDuplicateState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDuplicateState({ status: "loading" });
      try {
        const response = await fetch("/api/numbering/duplicate-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ coreName: duplicateTarget, partName: duplicateTarget }),
          signal: controller.signal,
        });
        const body = await response.json() as DuplicateResult;
        if (!response.ok) throw new Error("查重暫時失敗，請重試。");
        setDuplicateState({ status: "ready", data: { ...body, matches: (body.matches ?? []).slice(0, 5) } });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setDuplicateState({ status: "error", message: caught instanceof Error ? caught.message : "查重暫時失敗，請重試。" });
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [duplicateRetry, duplicateTarget, scope]);

  const preview = useMemo<Preview | null>(() => {
    if (scope === "new_root") return newPreviewState.status === "ready" ? newPreviewState.data : null;
    if (policyState.status !== "ready") return null;
    const policy = policyState.data;
    const drawing = resolvedPurposeCode === "R" ? policy.nextNumbers?.drawingR : policy.nextNumbers?.drawingM;
    return {
      estimated: true,
      observedAt: new Date().toISOString(),
      content: resolvedContent,
      purposeCode: hasDrawing ? resolvedPurposeCode : null,
      root: policy.root?.rootCode || rootCode,
      part: hasPart ? policy.nextNumbers?.part : null,
      drawing: hasDrawing ? drawing : null,
    };
  }, [hasDrawing, hasPart, newPreviewState, policyState, resolvedContent, resolvedPurposeCode, rootCode, scope]);

  const policy = policyState.status === "ready" ? policyState.data : null;
  const previewLoading = scope === "new_root" ? newPreviewState.status === "loading" : policyState.status === "loading";
  const previewError = scope === "new_root"
    ? newPreviewState.status === "error" ? newPreviewState.message : ""
    : policyState.status === "error" ? policyState.message : "";

  function clearFieldError(key: FieldKey) {
    setFieldErrors((current) => current[key] ? { ...current, [key]: undefined } : current);
    setError("");
  }

  function chooseScope(next: CreateScope) {
    setScope(next);
    if (next === "new_root") {
      setRootCode("");
      setRootName("");
      setRootQuery("");
      if (content === "drawing") setContent("drawing_part");
    }
    setFieldErrors({});
    setError("");
  }

  function chooseContent(next: CreateContent) {
    setContent(scope === "new_root" && next === "drawing" ? "drawing_part" : next);
    setFieldErrors({});
    setError("");
  }

  function chooseRoot(item: RootResult) {
    setRootCode(item.rootCode);
    setRootName(item.displayName);
    setRootQuery(item.rootCode);
    setRootResults([]);
    clearFieldError("rootCode");
  }

  function validateFields() {
    const next: Partial<Record<FieldKey, string>> = {};
    const refs: Partial<Record<FieldKey, RefObject<HTMLInputElement | null>>> = {
      rootCode: rootInputRef,
      primaryNoun: primaryNounRef,
      confirmedName: confirmedNameRef,
      referencePurpose: referencePurposeRef,
      appendReason: appendReasonRef,
    };
    if (scope === "existing_root" && !rootCode.trim()) next.rootCode = "請選擇圖料根號。";
    if (scope === "new_root" && !primaryNoun.trim()) next.primaryNoun = "請輸入主要名詞。";
    if (scope === "new_root" && !confirmedName.trim()) next.confirmedName = "請套用或輸入確認品名。";
    if (hasDrawing && resolvedPurposeCode === "R" && !referencePurpose.trim()) next.referencePurpose = "請填寫參考圖用途。";
    if (scope === "existing_root" && policy?.reasonRequired && !appendReason.trim()) next.appendReason = "請填寫追加原因。";
    setFieldErrors(next);
    const first = (Object.keys(next) as FieldKey[])[0];
    if (first) window.setTimeout(() => refs[first]?.current?.focus(), 0);
    return !first;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!validateFields()) return;
    if (scope === "existing_root" && policyState.status !== "ready") {
      setError(policyState.status === "error" ? policyState.message : "追加限制尚未載入完成，請稍候再試。");
      return;
    }
    const normalized = normalizeCreateIntent(intent);
    const errors = validateCreateIntent(normalized);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    if (policy?.locked) {
      setError("此圖料根號目前不可追加。");
      return;
    }
    setBusy(true);
    try {
      const request = intentToRequest(normalized);
      const response = await fetch(request.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify(request.body),
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        setError(normalizeCreateError(response.status, body).message);
        return;
      }
      setResult(body as typeof result);
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch {
      setError("建立結果尚未確認；請保留目前輸入後重試。");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <section className="canonical-create-result" aria-live="polite">
      <h2>編號已建立</h2>
      <p>{result.root?.rootCode || ""}{result.partNumber?.partNumber ? ` · ${result.partNumber.partNumber}` : ""}{result.drawingNumber?.drawingNumber ? ` · ${result.drawingNumber.drawingNumber}` : ""}</p>
      <div className="canonical-create-actions">
        <a className="primary-button" href={destination(from, result)}>查看建立結果</a>
        <a className="secondary-button" href={returnTo || "/numbering/search"}>返回</a>
      </div>
    </section>;
  }

  return <main className="canonical-create-page">
    <header className="canonical-create-header">
      <div>
        <p className="canonical-create-kicker">PDM · 正式編號</p>
        <h1>建立編號</h1>
        <p>依目前情境建立料號、圖號或兩者，號碼只在提交時正式配置。</p>
      </div>
    </header>

    <form className="canonical-create-form" onSubmit={(event) => void submit(event)} noValidate>
      {!initialRoot ? <fieldset>
        <legend>建立方式</legend>
        <div className="canonical-create-choice-row">
          <label><input type="radio" name="scope" checked={scope === "new_root"} onChange={() => chooseScope("new_root")} /> 建立新圖料</label>
          <label><input type="radio" name="scope" checked={scope === "existing_root"} onChange={() => chooseScope("existing_root")} /> 加到既有圖料</label>
        </div>
      </fieldset> : null}

      {scope === "existing_root" ? <section className="canonical-create-section">
        <label htmlFor={rootSearchId}>圖料根號{initialRoot ? "（目前根號）" : ""}</label>
        {initialRoot ? <div className="canonical-create-readonly"><strong>{rootCode}</strong><span>{rootName || "取得品名中…"}</span></div> : <>
          <input
            ref={rootInputRef}
            id={rootSearchId}
            value={rootCode || rootQuery}
            onChange={(event) => {
              setRootCode("");
              setRootName("");
              setRootQuery(event.target.value);
              clearFieldError("rootCode");
            }}
            placeholder="搜尋圖料根號或品名"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.rootCode)}
            aria-describedby={describedBy(`${rootSearchId}-error`, fieldErrors.rootCode)}
          />
          <InlineError id={`${rootSearchId}-error`} message={fieldErrors.rootCode} />
          {rootSearchState.status === "loading" ? <p className="canonical-create-help" role="status">搜尋中…</p> : null}
          {rootSearchState.status === "error" ? <p className="canonical-create-inline-state" role="alert">{rootSearchState.message}<button type="button" className="link-button" onClick={() => setRootSearchRetry((value) => value + 1)}>重試</button></p> : null}
          {rootResults.length ? <ul className="canonical-create-results">{rootResults.map((item) => <li key={item.entityId}><button type="button" onClick={() => chooseRoot(item)}><strong>{item.rootCode}</strong><span>{item.displayName || "—"}</span></button></li>)}</ul> : null}
          {rootSearchState.status === "ready" && !rootResults.length ? <p className="canonical-create-help">找不到符合的圖料根號。</p> : null}
        </>}
      </section> : null}

      {canShowDetails ? <>
        {scope === "existing_root" ? <fieldset>
          <legend>建立內容</legend>
          <div className="canonical-create-choice-row">
            <label><input type="radio" name="content" checked={content === "part"} onChange={() => chooseContent("part")} /> 料號</label>
            <label><input type="radio" name="content" checked={content === "drawing"} onChange={() => chooseContent("drawing")} /> 圖號</label>
            <label><input type="radio" name="content" checked={content === "drawing_part"} onChange={() => chooseContent("drawing_part")} /> 圖號與料號</label>
          </div>
        </fieldset> : null}

        {hasPart ? <section className="canonical-create-section">
          {scope === "existing_root" ? <div className="canonical-create-readonly" aria-label="根號料件設定">
            <span>料件設定（沿用根號）</span>
            <strong>{policy?.inheritedPart ? "沿用既有料件設定" : "取得根號設定中…"}</strong>
          </div> : <div className="canonical-create-grid canonical-create-part-fields">
            <label><span>料件類型</span><select value={itemKind} onChange={(event) => {
              setItemKind(event.target.value as CanonicalNumberingItemKind);
              setIncludeReferenceDrawing(false);
              setReferencePurpose("");
              clearFieldError("referencePurpose");
            }}>{CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="canonical-create-checkbox"><input type="checkbox" checked={isUniversal} onChange={(event) => setIsUniversal(event.target.checked)} /><span>共用件</span></label>
            {itemKind === "purchased" ? <label className="canonical-create-checkbox"><input type="checkbox" checked={includeReferenceDrawing} onChange={(event) => {
              setIncludeReferenceDrawing(event.target.checked);
              if (!event.target.checked) setReferencePurpose("");
              clearFieldError("referencePurpose");
            }} /><span>同時建立參考圖 R</span></label> : null}
            {itemKind === "manufactured" && !isUniversal ? <label>
              <span>系列代號（選填）</span>
              <input list={seriesListId} value={seriesCode} onChange={(event) => setSeriesCode(event.target.value)} maxLength={80} autoComplete="off" />
              <datalist id={seriesListId}>{seriesState.status === "ready" ? seriesState.data.map((option) => <option key={option} value={option} />) : null}</datalist>
              {seriesState.status === "loading" ? <span className="canonical-create-field-note">載入既有系列代號中…</span> : null}
              {seriesState.status === "error" ? <span className="canonical-create-field-note is-error">{seriesState.message}<button type="button" className="link-button" onClick={() => setSeriesRetry((value) => value + 1)}>重試</button></span> : null}
            </label> : null}
          </div>}
        </section> : null}

        {scope === "new_root" ? <section className="canonical-create-section canonical-create-naming">
          <div className="canonical-create-section-heading"><h2>品名</h2><span>先組合建議，再確認正式名稱</span></div>
          <div className="canonical-create-grid">
            <label>
              <span>主要名詞</span>
              <input ref={primaryNounRef} value={primaryNoun} onChange={(event) => { setPrimaryNoun(event.target.value); clearFieldError("primaryNoun"); }} maxLength={120} required placeholder="例如：馬達、固定座" aria-invalid={Boolean(fieldErrors.primaryNoun)} aria-describedby={describedBy(`${inputId}-primary-error`, fieldErrors.primaryNoun)} />
              <InlineError id={`${inputId}-primary-error`} message={fieldErrors.primaryNoun} />
            </label>
            {itemKind === "purchased" ? <>
              <label><span>品牌（選填）</span><input value={nameBrand} onChange={(event) => setNameBrand(event.target.value)} maxLength={80} /></label>
              <label><span>規格／型號（選填）</span><input value={customSpecification} onChange={(event) => setCustomSpecification(event.target.value)} maxLength={120} /></label>
            </> : <>
              <label><span>規格／特性（選填）</span><input value={customSpecification} onChange={(event) => setCustomSpecification(event.target.value)} maxLength={120} /></label>
              <label><span>流水識別（選填）</span><input value={nameSerialIdentifier} onChange={(event) => setNameSerialIdentifier(event.target.value)} maxLength={80} /></label>
            </>}
          </div>
          <div className="canonical-create-suggestion">
            <div className="canonical-create-suggestion-main">
              <div className="canonical-create-suggestion-value"><span>建議品名</span><strong>{suggestedName || "—"}</strong></div>
              <section className="canonical-create-duplicate" aria-live="polite">
                {duplicateState.status === "loading" ? <p className="canonical-create-help" role="status">查重中…</p> : null}
                {duplicateState.status === "error" ? <p className="canonical-create-inline-state is-error" role="alert">{duplicateState.message}<button type="button" className="link-button" onClick={() => setDuplicateRetry((value) => value + 1)}>重新查重</button></p> : null}
                {duplicateState.status === "ready" && duplicateState.data.matches.length ? <div className="canonical-create-warning"><strong>找到可能相同的資料</strong><ul>{duplicateState.data.matches.map((match) => <li key={`${match.entityType}:${match.entityId}`}><span>{match.displayCode}</span><span>{match.displayName || "—"}</span><small>{Math.round(match.score * 100)}%</small></li>)}</ul><p>此結果只提醒確認，不會代替你的建立決定。</p></div> : null}
                {duplicateState.status === "ready" && !duplicateState.data.matches.length && duplicateTarget ? <p className="canonical-create-help">未找到相似品名。</p> : null}
              </section>
            </div>
            <button type="button" className="secondary-button" disabled={!suggestedName} onClick={() => { setConfirmedName(suggestedName); clearFieldError("confirmedName"); }}>套用建議品名</button>
          </div>
          <label className="canonical-create-confirmed-name">
            <span>確定品名</span>
            <input ref={confirmedNameRef} value={confirmedName} onChange={(event) => { setConfirmedName(event.target.value); clearFieldError("confirmedName"); }} maxLength={300} required aria-invalid={Boolean(fieldErrors.confirmedName)} aria-describedby={describedBy(`${inputId}-confirmed-error`, fieldErrors.confirmedName)} />
            <InlineError id={`${inputId}-confirmed-error`} message={fieldErrors.confirmedName} />
          </label>
        </section> : null}

        {hasDrawing && (scope === "existing_root" || resolvedPurposeCode === "R") ? <section className="canonical-create-section canonical-create-drawing-fields">
          {scope === "existing_root" ? <label><span>圖面用途</span><select value={purposeCode} onChange={(event) => { setPurposeCode(event.target.value as CreatePurposeCode); clearFieldError("referencePurpose"); }}><option value="M">製造圖 M</option><option value="R">參考圖 R</option></select></label> : null}
          {resolvedPurposeCode === "R" ? <label><span>參考圖用途</span><input ref={referencePurposeRef} value={referencePurpose} onChange={(event) => { setReferencePurpose(event.target.value); clearFieldError("referencePurpose"); }} maxLength={300} required aria-invalid={Boolean(fieldErrors.referencePurpose)} aria-describedby={describedBy(`${inputId}-reference-error`, fieldErrors.referencePurpose)} /><InlineError id={`${inputId}-reference-error`} message={fieldErrors.referencePurpose} /></label> : null}
        </section> : null}

        {scope === "existing_root" ? <section className="canonical-create-section">
          {policy?.reasonRequired ? <label><span>追加原因</span><input ref={appendReasonRef} value={appendReason} onChange={(event) => { setAppendReason(event.target.value); clearFieldError("appendReason"); }} maxLength={300} required aria-invalid={Boolean(fieldErrors.appendReason)} aria-describedby={describedBy(`${inputId}-append-error`, fieldErrors.appendReason)} /><InlineError id={`${inputId}-append-error`} message={fieldErrors.appendReason} /></label> : null}
          {policy?.locked ? <p className="canonical-create-error" role="alert">此圖料根號已鎖定，無法追加。</p> : null}
          {policyState.status === "loading" ? <p className="canonical-create-help" role="status">正在取得追加限制…</p> : null}
          {policyState.status === "error" ? <p className="canonical-create-inline-state" role="alert">{policyState.message}<button type="button" className="link-button" onClick={() => setPolicyRetry((value) => value + 1)}>重試</button></p> : null}
        </section> : null}

        <section className="canonical-create-section canonical-create-preview" aria-live="polite">
          <div className="canonical-create-section-heading"><h2>預估號碼</h2><span>{previewLoading ? "取得中…" : "不保留號碼"}</span></div>
          {preview ? <div className="canonical-create-number-list">{preview.nextNumbers?.root || preview.root ? <span>圖料根號 <strong>{preview.nextNumbers?.root || preview.root}</strong></span> : null}{preview.nextNumbers?.part || preview.part ? <span>料號 <strong>{preview.nextNumbers?.part || preview.part}</strong></span> : null}{preview.nextNumbers?.drawing || preview.drawing ? <span>圖號 <strong>{preview.nextNumbers?.drawing || preview.drawing}</strong></span> : null}</div> : previewError ? <p className="canonical-create-inline-state is-error">{previewError}<button type="button" className="link-button" onClick={() => scope === "new_root" ? setPreviewRetry((value) => value + 1) : setPolicyRetry((value) => value + 1)}>重試</button></p> : <p className="canonical-create-help">正在準備預估結果。</p>}
        </section>

      </> : null}

      {error ? <p className="canonical-create-error" role="alert">{error}</p> : null}
      <footer className="canonical-create-footer">
        <a className="secondary-button" href={returnTo || "/numbering/search"}>取消</a>
        <button className="primary-button" type="submit" disabled={busy || !canShowDetails || Boolean(policy?.locked)}>{busy ? "建立中…" : "建立編號"}</button>
      </footer>
    </form>
  </main>;
}
