"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileText, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { PdmEditPageFrame, type PdmEditPageStatus } from "@/components/pdm-edit-page-frame";
import { PartMaintenanceWorkspaceSections } from "@/components/part-maintenance-workspace-sections";
import { CANONICAL_NUMBERING_ITEM_KIND_OPTIONS } from "@/lib/numbering-item-kind";
import { PART_MATRIX_AUTOSAVE_IDLE_MS, PART_MATRIX_MAX_CONCURRENCY, PART_MATRIX_ROW_REGISTRY, matrixPayloadEqual, matrixPayloadValue, matrixRowDiffers, normalizePartMaintenanceTab, PART_MAINTENANCE_TABS, type PartMaintenanceTab, type PartMatrixPayload, type PartMatrixRowKey } from "@/lib/part-number-matrix-contract";
import { matrixCommandFingerprint } from "@/components/use-part-number-matrix-controller";

type MatrixColumn = {
  partId: string;
  partNumber: string;
  sequenceNo: number;
  formalRowVersion: number;
  handling: string;
  canEdit: boolean;
  canSubmit: boolean;
  disabledReason: string | null;
  workId: string | null;
  workRowVersion: number | null;
  workOwner: { id: string } | null;
  valueSource: "formal" | "work";
  payload: PartMatrixPayload;
  formalPayload: PartMatrixPayload;
  attachmentCount: number;
  confirmedAttributes: Array<{ key: string; label: string; value: string | null; applicabilityState: string }>;
};
type MatrixConfirmedAttribute = MatrixColumn["confirmedAttributes"][number];
type MatrixData = { root: { id: string; code: string }; sourcePartId: string; sourceRowKey: string; columns: MatrixColumn[] };
type MatrixResponse = { data: MatrixData; meta: { actorId: string; companyId: string; contractToken: string; correlationId: string } };

const LEGACY_CONFIRMED_ATTRIBUTE_KEYS = new Set(["material", "color", "surface_finish", "surface_treatment", "variant_note"]);

function confirmedAttributeValue(column: MatrixColumn, key: string) {
  const attribute = column.confirmedAttributes.find((item) => item.key === key);
  if (!attribute) return "—";
  return attribute.applicabilityState === "not_applicable" ? "無" : attribute.value?.trim() || "—";
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `dev108-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function errorCode(body: unknown) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : "";
}
function errorMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return String((error as { message: string }).message);
  return fallback;
}
function clonePayload(payload: PartMatrixPayload): PartMatrixPayload { return { ...payload }; }

export function PartNumberMatrixWorkspace({ partId, workId, returnTo, initialTab = "data" }: { partId: string; workId: string; returnTo?: string | null; initialTab?: PartMaintenanceTab }) {
  const router = useRouter();
  const [status, setStatus] = useState<PdmEditPageStatus>("loading");
  const [data, setData] = useState<MatrixData | null>(null);
  const [token, setToken] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PartMatrixPayload>>({});
  const [saved, setSaved] = useState<Record<string, PartMatrixPayload>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PartMaintenanceTab>(normalizePartMaintenanceTab(initialTab));
  const [maintenanceDirty, setMaintenanceDirty] = useState(false);
  const draftRef = useRef(drafts);
  const savedRef = useRef(saved);
  const cellErrorsRef = useRef(cellErrors);
  const conflictsRef = useRef(conflicts);
  const dataRef = useRef(data);
  const tokenRef = useRef(token);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flightRef = useRef(new Set<string>());
  const commandKeysRef = useRef(new Map<string, string>());
  const activePoolRef = useRef(0);
  const poolWaitersRef = useRef<Array<() => void>>([]);
  const returnHref = returnTo || "/parts";
  const endpoint = useMemo(() => `/api/pdm/parts/${encodeURIComponent(partId)}/matrix-workspace?workId=${encodeURIComponent(workId)}`, [partId, workId]);

  useEffect(() => { draftRef.current = drafts; }, [drafts]);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { cellErrorsRef.current = cellErrors; }, [cellErrors]);
  useEffect(() => { conflictsRef.current = conflicts; }, [conflicts]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const load = useCallback(async (preserveDraft = false): Promise<string | null> => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json().catch(() => null) as MatrixResponse | { error?: unknown } | null;
      if (response.status === 403) { setStatus("restricted"); return null; }
      if (response.status === 404) { setStatus("not_found"); return null; }
      if (!response.ok) { setError(errorMessage(body, "料號矩陣目前無法載入。")); setStatus(response.status === 409 ? "conflict" : "error"); return null; }
      const result = body as MatrixResponse;
      const nextDrafts: Record<string, PartMatrixPayload> = {};
      const nextSaved: Record<string, PartMatrixPayload> = {};
      for (const column of result.data.columns) {
        nextSaved[column.partId] = clonePayload(column.payload);
        nextDrafts[column.partId] = preserveDraft && draftRef.current[column.partId]
          ? draftRef.current[column.partId]
          : clonePayload(column.payload);
      }
      setData(result.data);
      setToken(result.meta.contractToken);
      tokenRef.current = result.meta.contractToken;
      savedRef.current = preserveDraft ? { ...savedRef.current, ...nextSaved } : nextSaved;
      draftRef.current = preserveDraft ? { ...nextDrafts, ...draftRef.current } : nextDrafts;
      setSaved(savedRef.current);
      setDrafts((current) => preserveDraft ? { ...nextDrafts, ...current } : nextDrafts);
      setStatus("ready");
      return result.meta.contractToken;
    } catch {
      setError("料號矩陣目前無法載入，請重試。");
      setStatus("error");
      return null;
    }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);

  function releasePool() {
    activePoolRef.current = Math.max(0, activePoolRef.current - 1);
    const next = poolWaitersRef.current.shift();
    if (next) next();
  }
  async function acquirePool() {
    if (activePoolRef.current >= PART_MATRIX_MAX_CONCURRENCY) await new Promise<void>((resolve) => poolWaitersRef.current.push(resolve));
    activePoolRef.current += 1;
  }
  function commandKey(part: MatrixColumn, phase: "create" | "update" | "submit", expected: number, body: unknown) {
    const fingerprint = matrixCommandFingerprint({ partId: part.partId, phase, expectedRowVersion: expected, body });
    const existing = commandKeysRef.current.get(fingerprint);
    if (existing) return existing;
    const key = requestId();
    commandKeysRef.current.set(fingerprint, key);
    return key;
  }

  const applySavedResponse = useCallback((partIdValue: string, responseData: { workId: string; rowVersion: number; payload: PartMatrixPayload }) => {
    setData((current) => current ? { ...current, columns: current.columns.map((column) => column.partId === partIdValue ? { ...column, workId: responseData.workId, workRowVersion: responseData.rowVersion, valueSource: "work", payload: responseData.payload, canSubmit: !matrixPayloadEqual(responseData.payload, column.formalPayload) && column.canEdit } : column) } : current);
    dataRef.current = dataRef.current ? { ...dataRef.current, columns: dataRef.current.columns.map((column) => column.partId === partIdValue ? { ...column, workId: responseData.workId, workRowVersion: responseData.rowVersion, valueSource: "work", payload: responseData.payload, canSubmit: !matrixPayloadEqual(responseData.payload, column.formalPayload) && column.canEdit } : column) } : dataRef.current;
    savedRef.current = { ...savedRef.current, [partIdValue]: clonePayload(responseData.payload) };
    setSaved(savedRef.current);
    const local = draftRef.current[partIdValue];
    const nextDraft = local && !matrixPayloadEqual(local, responseData.payload) ? local : clonePayload(responseData.payload);
    draftRef.current = { ...draftRef.current, [partIdValue]: nextDraft };
    setDrafts(draftRef.current);
    setCellErrors((current) => { const next = { ...current }; delete next[partIdValue]; return next; });
    setConflicts((current) => { const next = { ...current }; delete next[partIdValue]; return next; });
  }, []);

  const flushPart = useCallback(async (partIdValue: string) => {
    const currentData = dataRef.current;
    const part = currentData?.columns.find((column) => column.partId === partIdValue);
    const draft = draftRef.current[partIdValue];
    if (!part || !draft || !part.canEdit || matrixPayloadEqual(draft, part.formalPayload)) return true;
    if (flightRef.current.has(partIdValue)) return false;
    flightRef.current.add(partIdValue);
    const existingWorkId = part.workId;
    const phase = existingWorkId ? "update" : "create";
    const expected = existingWorkId ? Number(part.workRowVersion ?? 0) : Number(part.formalRowVersion);
    const body = existingWorkId ? draft : { initialPayload: draft };
    const key = commandKey(part, phase, expected, body);
    await acquirePool();
    try {
      const response = await fetch(existingWorkId ? `/api/pdm/part-change-works/${encodeURIComponent(existingWorkId)}` : `/api/pdm/parts/${encodeURIComponent(part.partId)}/change-works`, {
        method: existingWorkId ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "if-match": `"${expected}"`, "idempotency-key": key, "x-pdm-workbench-contract": tokenRef.current },
        body: JSON.stringify(body)
      });
      const responseBody = await response.json().catch(() => null) as { data?: { workId: string; rowVersion: number; payload: PartMatrixPayload }; error?: unknown } | null;
      if (!response.ok && errorCode(responseBody) === "WORKBENCH_CONTRACT_EXPIRED") {
        await load(true);
        const retryResponse = await fetch(existingWorkId ? `/api/pdm/part-change-works/${encodeURIComponent(existingWorkId)}` : `/api/pdm/parts/${encodeURIComponent(part.partId)}/change-works`, {
          method: existingWorkId ? "PATCH" : "POST",
          headers: { "content-type": "application/json", "if-match": `"${expected}"`, "idempotency-key": key, "x-pdm-workbench-contract": tokenRef.current },
          body: JSON.stringify(body)
        });
        const retryBody = await retryResponse.json().catch(() => null) as { data?: { workId: string; rowVersion: number; payload: PartMatrixPayload }; error?: unknown } | null;
        if (!retryResponse.ok) throw Object.assign(new Error(errorMessage(retryBody, "儲存失敗。")), { code: errorCode(retryBody) });
        if (retryBody?.data) applySavedResponse(part.partId, retryBody.data);
      } else if (!response.ok) {
        throw Object.assign(new Error(errorMessage(responseBody, "此料號儲存失敗。")), { code: errorCode(responseBody), status: response.status });
      } else if (responseBody?.data) {
        applySavedResponse(part.partId, responseBody.data);
      }
      return true;
    } catch (flushError) {
      const message = flushError instanceof Error ? flushError.message : "此料號儲存失敗。";
      const code = flushError && typeof flushError === "object" && "code" in flushError ? String((flushError as { code?: unknown }).code ?? "") : "";
      setCellErrors((current) => ({ ...current, [part.partId]: message }));
      if (code === "WORKBENCH_ROW_VERSION_CONFLICT" || code === "WORKBENCH_SNAPSHOT_DRIFT") setConflicts((current) => ({ ...current, [part.partId]: true }));
      return false;
    } finally {
      releasePool();
      flightRef.current.delete(partIdValue);
      const nextDraft = draftRef.current[partIdValue];
      const latestSaved = savedRef.current[partIdValue];
      if (nextDraft && latestSaved && !matrixPayloadEqual(nextDraft, latestSaved)) {
        // A newer keystroke arrived while the command was in flight.  Keep it
        // local and serialize the next command after this one terminally ends.
        void flushPart(partIdValue);
      }
    }
  }, [applySavedResponse, load]);

  function scheduleFlush(partIdValue: string) {
    const prior = timersRef.current[partIdValue];
    if (prior) clearTimeout(prior);
    timersRef.current[partIdValue] = setTimeout(() => { void flushPart(partIdValue); }, PART_MATRIX_AUTOSAVE_IDLE_MS);
  }

  function updateField(partIdValue: string, key: PartMatrixRowKey, value: unknown) {
    const column = dataRef.current?.columns.find((item) => item.partId === partIdValue);
    if (!column || !column.canEdit) return;
    const current = draftRef.current[partIdValue] ?? column.payload;
    const next = clonePayload(current);
    if (key === "materialLabel" || key === "colorLabel") {
      const label = typeof value === "string" ? value.trim() || null : null;
      const codeKey = key === "materialLabel" ? "materialCode" : "colorCode";
      const formalLabel = key === "materialLabel" ? column.formalPayload.materialLabel : column.formalPayload.colorLabel;
      const formalCode = key === "materialLabel" ? column.formalPayload.materialCode : column.formalPayload.colorCode;
      next[key] = label;
      next[codeKey] = label && label === formalLabel ? formalCode : null;
    } else if (key === "isUniversal") next.isUniversal = Boolean(value);
    else if (key === "itemKind") next.itemKind = value === "manufactured" ? "manufactured" : "purchased";
    else if (key === "partName") next.partName = typeof value === "string" ? value : "";
    else if (key === "customSpecification") next.customSpecification = typeof value === "string" ? value.trim() || null : null;
    else if (key === "surfaceTreatment") next.surfaceTreatment = typeof value === "string" ? value.trim() || null : null;
    else if (key === "variantNote") next.variantNote = typeof value === "string" ? value.trim() || null : null;
    draftRef.current = { ...draftRef.current, [partIdValue]: next };
    setDrafts(draftRef.current);
    setCellErrors((currentErrors) => { const nextErrors = { ...currentErrors }; delete nextErrors[partIdValue]; return nextErrors; });
    scheduleFlush(partIdValue);
  }

  function revertField(partIdValue: string) {
    const baseline = savedRef.current[partIdValue];
    if (!baseline) return;
    draftRef.current = { ...draftRef.current, [partIdValue]: clonePayload(baseline) };
    setDrafts(draftRef.current);
    setCellErrors((currentErrors) => { const next = { ...currentErrors }; delete next[partIdValue]; return next; });
  }

  async function flushAll() {
    Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    const ids = dataRef.current?.columns.map((column) => column.partId) ?? [];
    await Promise.all(ids.map((id) => flushPart(id)));
  }

  async function submitAll() {
    setBusy(true); setError(""); setNotice("");
    await flushAll();
    const latest = dataRef.current;
    if (!latest) { setBusy(false); return; }
    if (Object.keys(cellErrorsRef.current).length || Object.keys(conflictsRef.current).length || latest.columns.some((column) => {
      const draft = draftRef.current[column.partId];
      const savedValue = saved[column.partId];
      return Boolean(draft && savedValue && !matrixPayloadEqual(draft, savedValue));
    })) {
      setError("仍有欄位尚未成功儲存，請先處理原格提示。"); setBusy(false); return;
    }
    let submitted = 0;
    for (const part of latest.columns) {
      const current = dataRef.current?.columns.find((column) => column.partId === part.partId) ?? part;
      const payload = draftRef.current[part.partId] ?? current.payload;
      if (!current.workId || !current.canEdit || matrixPayloadEqual(payload, current.formalPayload)) continue;
      const expected = Number(current.workRowVersion ?? 0);
      const key = commandKey(current, "submit", expected, {});
      try {
        const response = await fetch(`/api/pdm/part-change-works/${encodeURIComponent(current.workId)}/submit`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"${expected}"`, "idempotency-key": key, "x-pdm-workbench-contract": tokenRef.current }, body: "{}" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(body, "送出審核失敗。"));
        setData((value) => value ? { ...value, columns: value.columns.map((column) => column.partId === current.partId ? { ...column, handling: "review_owner", canEdit: false, canSubmit: false } : column) } : value);
        submitted += 1;
      } catch (submitError) {
        setCellErrors((value) => ({ ...value, [current.partId]: submitError instanceof Error ? submitError.message : "送出審核失敗。" }));
        setError(`已送出 ${submitted} 筆；其餘料號保留在本頁，可再次送出。`);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    if (submitted > 0) router.push(returnHref);
  }

  const columns = useMemo(() => data?.columns ?? [], [data?.columns]);
  const confirmedRows = useMemo(() => {
    const rows = new Map<string, MatrixConfirmedAttribute>();
    for (const column of columns) {
      for (const attribute of column.confirmedAttributes) {
        if (!LEGACY_CONFIRMED_ATTRIBUTE_KEYS.has(attribute.key) && !rows.has(attribute.key)) rows.set(attribute.key, attribute);
      }
    }
    return [...rows.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-Hant") || left.key.localeCompare(right.key));
  }, [columns]);
  const draftsForDiff = columns.map((column) => ({ ...column, payload: drafts[column.partId] ?? column.payload }));
  const hasPending = columns.some((column) => { const draft = drafts[column.partId]; const savedValue = saved[column.partId]; return Boolean(draft && savedValue && !matrixPayloadEqual(draft, savedValue)); });
  const submitCount = columns.filter((column) => column.workId && column.canSubmit && !conflicts[column.partId] && !cellErrors[column.partId] && !matrixPayloadEqual(drafts[column.partId] ?? column.payload, column.formalPayload)).length;
  const title = data?.root.code || "料號資料總表";

  useEffect(() => {
    const handlePopState = () => setActiveTab(normalizePartMaintenanceTab(new URL(window.location.href).searchParams.get("tab")));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const switchTab = async (nextTab: PartMaintenanceTab) => {
    if (nextTab === activeTab) return;
    if (activeTab === "data") {
      await flushAll();
      const pending = dataRef.current?.columns.some((column) => {
        const draft = draftRef.current[column.partId];
        const savedValue = savedRef.current[column.partId];
        return Boolean(draft && savedValue && !matrixPayloadEqual(draft, savedValue));
      });
      if (pending || Object.keys(cellErrorsRef.current).length || Object.keys(conflictsRef.current).length) {
        setError("資料尚未成功儲存，請先處理原格提示後再切換分頁。");
        return;
      }
    } else if (maintenanceDirty) {
      if (!window.confirm("維護資料尚未儲存，確定要切換分頁並捨棄目前變更嗎？")) return;
      // Maintenance sections are intentionally unmounted when leaving their
      // tab; once the user confirms discard, do not keep a stale page
      // dirty flag that would guard the next navigation.
      setMaintenanceDirty(false);
    }
    const url = new URL(window.location.href);
    if (nextTab === "data") url.searchParams.delete("tab"); else url.searchParams.set("tab", nextTab);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setActiveTab(nextTab);
    setError("");
  };

  return <PdmEditPageFrame className="part-number-workspace" returnHref={returnHref} eyebrow="料號工作台" title={title} subtitle={data ? `${data.columns.length} 個料號 · 來源 ${data.columns.find((column) => column.partId === data.sourcePartId)?.partNumber ?? partId}` : ""} headingLayout="breadcrumb" status={status} error={error} notice={notice} isDirty={activeTab === "data" ? hasPending : maintenanceDirty} onRetry={() => void load()} actionDock={activeTab === "data" && status === "ready" && data ? <><span className="part-matrix-save-state" role="status">{hasPending ? "儲存中…" : "已自動儲存"}</span><button className="primary-button" type="button" disabled={busy || hasPending || submitCount === 0} onClick={() => void submitAll()}><Send size={15} aria-hidden="true" />送出審核{submitCount ? `（${submitCount}）` : ""}</button></> : null}>
    {status === "ready" && data ? <>
      <nav className="part-maintenance-tabs" aria-label="料號工作台分頁">{PART_MAINTENANCE_TABS.map((tab) => <button key={tab.value} type="button" className={activeTab === tab.value ? "is-active" : ""} aria-current={activeTab === tab.value ? "page" : undefined} onClick={() => void switchTab(tab.value)}>{tab.label}</button>)}</nav>
      {activeTab === "data" ? <section className="pdm-edit-page-card part-number-matrix-card" aria-label="料號資料總表">
      <div className="part-number-matrix-scroll">
        <table className="part-number-matrix" data-matrix-scroll-owner="true">
          <thead><tr><th scope="col" className="part-number-matrix-row-header">資料欄位</th>{columns.map((column) => <th scope="col" key={column.partId} className={`part-number-matrix-column-header${column.partId === data.sourcePartId ? " is-source" : ""}`}><span>{column.partNumber}</span><button type="button" className="part-number-matrix-attachment" onClick={() => router.push(`/parts/${encodeURIComponent(column.partNumber)}/attachments?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)} aria-label={`開啟 ${column.partNumber} 附件`}><FileText size={15} aria-hidden="true" />{column.attachmentCount}</button></th>)}</tr></thead>
          <tbody>{PART_MATRIX_ROW_REGISTRY.map((row) => { const differs = matrixRowDiffers(draftsForDiff, row.key); return <tr key={row.key} data-difference={differs ? "true" : "false"} className={differs ? "is-different" : ""}><th scope="row" className="part-number-matrix-row-header">{row.label}</th>{columns.map((column) => <MatrixCell key={`${column.partId}:${row.key}`} column={column} rowKey={row.key} control={row.control} draft={drafts[column.partId] ?? column.payload} error={cellErrors[column.partId]} conflict={conflicts[column.partId]} focused={focusedCell === `${column.partId}:${row.key}`} onFocus={() => setFocusedCell(`${column.partId}:${row.key}`)} onBlur={() => { setFocusedCell(null); void flushPart(column.partId); }} onRevert={() => revertField(column.partId)} onChange={(value) => updateField(column.partId, row.key, value)} />)}</tr>; })}{confirmedRows.map((row) => { const differs = new Set(columns.map((column) => confirmedAttributeValue(column, row.key))).size > 1; return <tr key={`confirmed:${row.key}`} data-confirmed-row={row.key} data-difference={differs ? "true" : "false"} className={differs ? "is-different" : ""}><th scope="row" className="part-number-matrix-row-header">{row.label}</th>{columns.map((column) => <td key={column.partId} className="part-number-matrix-readonly-cell" data-confirmed-attribute={row.key} aria-label={`${column.partNumber} ${row.label} 唯讀`}>{confirmedAttributeValue(column, row.key)}</td>)}</tr>; })}<tr><th scope="row" className="part-number-matrix-row-header">附件</th>{columns.map((column) => <td key={column.partId}><button className="part-number-matrix-attachment-link" type="button" onClick={() => router.push(`/parts/${encodeURIComponent(column.partNumber)}/attachments?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>{column.attachmentCount} 件</button></td>)}</tr></tbody>
        </table>
      </div>
      </section> : <PartMaintenanceWorkspaceSections partId={partId} partNumber={data.columns.find((column) => column.partId === data.sourcePartId)?.partNumber ?? partId} sourceRowKey={data.sourceRowKey} contractToken={token} returnTo={typeof window === "undefined" ? returnHref : `${window.location.pathname}${window.location.search}`} tab={activeTab} onDirtyChange={setMaintenanceDirty} />}
    </> : null}
  </PdmEditPageFrame>;
}

function MatrixCell({ column, rowKey, control, draft, error, conflict, focused, onFocus, onBlur, onRevert, onChange }: { column: MatrixColumn; rowKey: PartMatrixRowKey; control: "text" | "select" | "checkbox" | "textarea" | "pair"; draft: PartMatrixPayload; error?: string; conflict?: boolean; focused: boolean; onFocus: () => void; onBlur: () => void; onRevert: () => void; onChange: (value: unknown) => void }) {
  const editable = column.canEdit;
  const value = draft[rowKey];
  const pair = rowKey === "materialLabel" ? { code: draft.materialCode, label: draft.materialLabel } : rowKey === "colorLabel" ? { code: draft.colorCode, label: draft.colorLabel } : null;
  const visible = pair ? (pair.label ? `${pair.code ? `${pair.code} · ` : ""}${pair.label}` : "—") : matrixPayloadValue(draft, rowKey);
  const fieldId = `matrix-${column.partId}-${rowKey}`;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onRevert(); event.currentTarget.blur(); }
    else if (event.key === "Enter" && control !== "textarea") { event.preventDefault(); event.currentTarget.blur(); }
  };
  let editor: ReactNode;
  if (!editable) {
    editor = <span className="part-number-matrix-readonly-value">{visible}</span>;
  } else if (control === "checkbox") {
    editor = <input id={fieldId} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} aria-label={`${column.partNumber} ${rowKey}`} />;
  } else if (control === "select") {
    editor = <select id={fieldId} value={text(value)} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} aria-label={`${column.partNumber} ${rowKey}`}>{rowKey === "itemKind" ? CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>) : <><option value="undecided">未決定</option><option value="not_required">不需要</option><option value="available">可使用</option><option value="restricted">受限</option><option value="obsolete">停用</option></>}</select>;
  } else if (control === "textarea") {
    editor = <textarea id={fieldId} value={text(value)} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} rows={1} aria-label={`${column.partNumber} ${rowKey}`} />;
  } else {
    editor = <input id={fieldId} value={text(pair?.label ?? value)} placeholder="—" onChange={(event) => onChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} aria-label={`${column.partNumber} ${rowKey}`} />;
  }
  return <td className={`part-number-matrix-cell${editable ? " is-editable" : " is-readonly"}${focused ? " is-focused" : ""}${error || conflict ? " has-error" : ""}`} data-cell={`${column.partId}:${rowKey}`} data-value-source={column.valueSource} aria-label={`${column.partNumber} ${rowKey}`}>
    {editor}
    {error ? <span className="inline-error" role="alert">{error}</span> : null}
    {conflict ? <span className="inline-error" role="alert">資料已變更，請重新載入此料號</span> : null}
  </td>;
}
