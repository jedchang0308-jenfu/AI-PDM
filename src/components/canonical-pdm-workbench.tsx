"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { RETIRED_WORKBENCH_QUERY_KEYS } from "@/lib/pdm-canonical-workbench-contract";
import type {
  CanonicalHandling,
  CanonicalLayer,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchDetailDto,
  CanonicalWorkbenchListDto,
  CanonicalWorkbenchRowDto,
  WorkbenchEntityType
} from "@/lib/pdm-canonical-workbench-contract";

type DomainConfig = {
  entityType: WorkbenchEntityType;
  title: string;
  description: string;
  listEndpoint: string;
  detailEndpoint: string;
  searchPlaceholder: string;
  layerOptions: Array<{ value: CanonicalLayer; label: string }>;
};

const DOMAIN_CONFIG: Record<WorkbenchEntityType, DomainConfig> = {
  drawing: {
    entityType: "drawing",
    title: "圖號工作台",
    description: "每個圖號固定顯示量產最新版，並列出每個開放研發分支的最新版。",
    listEndpoint: "/api/numbering/drawings/workbench",
    detailEndpoint: "/api/numbering/drawings/workbench",
    searchPlaceholder: "搜尋圖號、品名或料號",
    layerOptions: [{ value: "production", label: "量產版" }, { value: "rd", label: "研發版" }]
  },
  part: {
    entityType: "part",
    title: "料號工作台",
    description: "正式資料持續有效；有修改案時，另列一筆修改中資料。料號沒有版次。",
    listEndpoint: "/api/parts/workbench",
    detailEndpoint: "/api/parts/workbench",
    searchPlaceholder: "搜尋料號、品名或圖號",
    layerOptions: [{ value: "formal", label: "正式資料" }, { value: "work", label: "修改中" }]
  },
  relation: {
    entityType: "relation",
    title: "圖料工作台",
    description: "正式關聯持續有效；有調整案時，另列一筆調整中資料。圖料根號沒有版次。",
    listEndpoint: "/api/numbering/relations",
    detailEndpoint: "/api/numbering/relations",
    searchPlaceholder: "搜尋圖料根號、圖號或料號",
    layerOptions: [{ value: "formal", label: "正式關聯" }, { value: "work", label: "調整中" }]
  }
};

const HANDLING_OPTIONS: Array<{ value: CanonicalHandling; label: string }> = [
  { value: "none", label: "無須處理" },
  { value: "owner", label: "負責人處理" },
  { value: "review_owner", label: "審核負責人處理" },
  { value: "system", label: "系統處理" },
  { value: "system_admin", label: "系統管理員處理" },
  { value: "blocked", label: "受阻" }
];

type Detail = CanonicalWorkbenchDetailDto<Record<string, unknown>>;
type Candidate = { kind: "production" | "rd"; label: string; enabled: boolean; reason: string | null; candidateToken: string | null };
type ApiError = { error?: { code?: string; message?: string; correlationId?: string } };

function errorMessage(body: unknown, fallback: string) {
  const api = body as ApiError;
  return api?.error?.message?.trim() || fallback;
}

async function readJson(response: Response) {
  try { return await response.json() as unknown; }
  catch { return null; }
}

function replaceLocation(patch: { query?: string; layer?: string; handling?: string; detail?: string | null }) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (!value || value === "all") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function displayScalar(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "—";
}

const TECHNICAL_KEYS = new Set(["id", "company_id", "companyId", "row_version", "rowVersion", "drawingId", "partId", "rootId"]);
const FIELD_LABELS: Record<string, string> = {
  code: "編號", drawing_number: "圖號", drawingCode: "圖號", part_number: "料號", partCode: "料號",
  part_name: "品名", core_name: "品名", item_kind: "類型", purpose_code: "圖面用途",
  purpose_description: "用途說明", custom_specification: "規格", is_universal: "共用料",
  bom_usage_policy: "BOM 使用規則", universal_reason: "共用原因", series_code: "系列代號",
  linkType: "關聯類型", file_name: "檔名", display_name: "顯示名稱", mime_type: "檔案類型",
  file_size: "檔案大小", description: "說明", document_category: "文件分類", created_at: "建立時間"
};

function ScalarFields({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return <p className="canonical-empty">無資料</p>;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => !TECHNICAL_KEYS.has(key) && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null));
  if (!entries.length) return <p className="canonical-empty">無資料</p>;
  return <dl className="canonical-field-grid">{entries.map(([key, value]) => <div key={key}><dt>{FIELD_LABELS[key] ?? key}</dt><dd>{displayScalar(value)}</dd></div>)}</dl>;
}

function CompactRecords({ records, empty }: { records: unknown; empty: string }) {
  if (!Array.isArray(records) || !records.length) return <p className="canonical-empty">{empty}</p>;
  return <div className="canonical-record-list">{records.map((record, index) => <div className="canonical-record" key={String((record as { id?: unknown })?.id ?? index)}><ScalarFields value={record} /></div>)}</div>;
}

function Drawer({ detail, loading, error, onClose, onAction }: {
  detail: Detail | null; loading: boolean; error: string; onClose: () => void;
  onAction: (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const content = detail?.data.content as Record<string, unknown> | undefined;
  const primary = detail?.data.row.entityType === "drawing" ? content?.drawing : detail?.data.row.entityType === "relation" ? content?.root : content;
  const files = detail?.data.row.entityType === "drawing" ? content?.files : detail?.data.attachments;
  const relationTree = detail?.data.row.entityType === "relation" ? content?.tree : detail?.data.relations;
  return <div className="canonical-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="canonical-drawer" role="dialog" aria-modal="true" aria-labelledby="canonical-drawer-title">
      <header className="canonical-drawer-header">
        <div>{detail ? <><h2 id="canonical-drawer-title">{detail.data.row.code}</h2><p>{detail.data.row.name}</p></> : <h2 id="canonical-drawer-title">明細</h2>}</div>
        <button ref={closeRef} type="button" className="secondary-button" onClick={onClose} aria-label="關閉明細">關閉</button>
      </header>
      {loading ? <p className="canonical-drawer-message" role="status">正在載入明細…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : detail ? <div className="canonical-drawer-body">
        <section><h3>目前資料</h3><div className="canonical-summary"><strong>{detail.data.row.layerLabel}</strong>{detail.data.row.handlingLabel ? <span>{detail.data.row.handlingLabel}</span> : null}</div><ScalarFields value={primary} /></section>
        {files !== undefined ? <section><h3>{detail.data.row.entityType === "part" ? "附件" : "圖面檔案"}</h3><CompactRecords records={files} empty="目前沒有檔案" /></section> : null}
        <section><h3>直接關聯</h3><CompactRecords records={relationTree} empty="目前沒有直接關聯" /></section>
        {detail.data.row.handling === "blocked" ? <section className="canonical-blocker"><h3>受阻資訊</h3><p>{detail.data.row.blockerReason || "請系統管理員處理"}</p></section> : null}
        {detail.data.row.entityType === "drawing" ? <section><h3>歷史版次清單</h3><CompactRecords records={detail.data.history} empty="目前沒有歷史版次" /></section> : null}
      </div> : null}
      {detail?.data.row.actions.length ? <footer className="canonical-drawer-actions">{detail.data.row.actions.map((action) => <button key={action.key} type="button" className={action.key === "void_rd" ? "secondary-button" : "primary-button"} onClick={() => onAction(detail.data.row, action)}>{action.label}</button>)}</footer> : null}
    </aside>
  </div>;
}

export function CanonicalPdmWorkbench({ entityType }: { entityType: WorkbenchEntityType }) {
  const config = DOMAIN_CONFIG[entityType];
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState("all");
  const [handling, setHandling] = useState("all");
  const [groups, setGroups] = useState<CanonicalWorkbenchListDto["data"]["groups"]>([]);
  const [totals, setTotals] = useState({ groups: 0, rows: 0 });
  const [contractToken, setContractToken] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidateRow, setCandidateRow] = useState<CanonicalWorkbenchRowDto | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateError, setCandidateError] = useState("");
  const [retiredQuery, setRetiredQuery] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("query") ?? "");
    setLayer(url.searchParams.get("layer") ?? "all");
    setHandling(url.searchParams.get("handling") ?? "all");
    setDetailKey(url.searchParams.get("detail"));
    setRetiredQuery([...RETIRED_WORKBENCH_QUERY_KEYS].some((key) => url.searchParams.has(key)));
  }, []);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (layer !== "all") params.set("layer", layer);
    if (handling !== "all") params.set("handling", handling);
    return `${config.listEndpoint}${params.size ? `?${params}` : ""}`;
  }, [config.listEndpoint, handling, layer, query]);

  const load = useCallback(async (cursor?: string | null, append = false) => {
    setLoading(true); setError("");
    if (retiredQuery) {
      setGroups([]); setTotals({ groups: 0, rows: 0 }); setNextCursor(null); setError("此篩選網址已失效"); setLoading(false); return;
    }
    const separator = listUrl.includes("?") ? "&" : "?";
    const response = await fetch(cursor ? `${listUrl}${separator}cursor=${encodeURIComponent(cursor)}` : listUrl, { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok) { setGroups([]); setTotals({ groups: 0, rows: 0 }); setError(errorMessage(body, "清單載入失敗")); setLoading(false); return; }
    const result = body as CanonicalWorkbenchListDto;
    setGroups((current) => append ? [...current, ...result.data.groups] : result.data.groups);
    setTotals({ groups: result.data.totalGroups, rows: result.data.totalRows });
    setNextCursor(result.data.nextCursor); setContractToken(result.meta.contractToken); setLoading(false);
  }, [listUrl, retiredQuery]);

  useEffect(() => { const timer = window.setTimeout(() => { replaceLocation({ query, layer, handling }); void load(); }, 250); return () => window.clearTimeout(timer); }, [handling, layer, load, query]);

  const openDetail = useCallback(async (rowKey: string) => {
    setDetail(null); setDetailLoading(true); setDetailError("");
    const response = await fetch(`${config.detailEndpoint}/${encodeURIComponent(rowKey)}`, { cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok) setDetailError(errorMessage(body, "明細載入失敗"));
    else { const result = body as Detail; setDetail(result); setContractToken(result.meta.contractToken); }
    setDetailLoading(false);
  }, [config.detailEndpoint]);

  const selectDetail = useCallback((rowKey: string) => { setDetailKey(rowKey); replaceLocation({ detail: rowKey }); }, []);

  useEffect(() => { if (detailKey) void openDetail(detailKey); }, [detailKey, openDetail]);
  const closeDetail = useCallback(() => { setDetailKey(null); setDetail(null); setDetailError(""); replaceLocation({ detail: null }); }, []);

  const command = useCallback(async (row: CanonicalWorkbenchRowDto, href: string, body: Record<string, unknown>) => {
    setBusy(true); setError("");
    const response = await fetch(href, {
      method: "POST", headers: { "content-type": "application/json", "if-match": `\"${row.rowVersion}\"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken }, body: JSON.stringify(body)
    });
    const result = await readJson(response); setBusy(false);
    if (!response.ok) { const message = errorMessage(result, "操作失敗"); setError(message); return null; }
    closeDetail(); await load(); return result;
  }, [closeDetail, contractToken, load]);

  const onAction = useCallback(async (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => {
    if (!action.href || busy) return;
    if (action.key === "edit" || action.key === "review") { window.location.assign(action.href); return; }
    if (action.key === "advance") {
      setCandidateRow(row); setCandidates([]); setCandidateError(""); setBusy(true);
      const response = await fetch(action.href, { cache: "no-store" }); const body = await readJson(response); setBusy(false);
      if (!response.ok) setCandidateError(errorMessage(body, "無法取得可用版次"));
      else { const result = body as { data: { candidates: Candidate[] }; meta: { contractToken: string } }; setCandidates(result.data.candidates); setContractToken(result.meta.contractToken); }
      return;
    }
    if (action.key === "void_rd" && !window.confirm(`核准後，${row.layerLabel} 將不再有效，這一系列研發版會從目前清單移除，且無法復原。確定送出申請？`)) return;
    const result = await command(row, action.href, action.key === "void_rd" ? { rowKey: row.rowKey } : {});
    if (action.key === "create_change" && result) {
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId) window.location.assign(row.entityType === "part" ? `/parts/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}` : `/numbering/relations/${encodeURIComponent(row.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [busy, command]);

  const createRevision = useCallback(async (candidate: Candidate) => {
    if (!candidateRow || !candidate.candidateToken) return;
    const href = `/api/pdm/drawings/${encodeURIComponent(candidateRow.entityId)}/revision-works`;
    const result = await command(candidateRow, href, { sourceRowKey: candidateRow.rowKey, candidateToken: candidate.candidateToken });
    if (result) {
      setCandidateRow(null); setCandidates([]);
      const workId = (result as { data?: { workId?: string } }).data?.workId;
      if (workId) window.location.assign(`/numbering/drawings/${encodeURIComponent(candidateRow.entityId)}/workspace?workId=${encodeURIComponent(workId)}`);
    }
  }, [candidateRow, command]);

  const resetRetiredUrl = useCallback(() => {
    const url = new URL(window.location.href);
    ["view", "history", "workStatus", "recordStatus", "dataStatus", "humanStatus", "responsibilityStatus", "viewerStatus", "availabilityScope", "lane", "versionLane"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}`); setRetiredQuery(false);
  }, []);

  return <main className="canonical-workbench">
    <header className="canonical-workbench-header"><div><h1>{config.title}</h1><p>{config.description}</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading || busy}>重新整理</button></header>
    <section className="canonical-toolbar" aria-label="清單篩選">
      <label className="canonical-search" htmlFor={searchId}><span>搜尋</span><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.searchPlaceholder} /></label>
      <label><span>資料</span><select value={layer} onChange={(event) => setLayer(event.target.value)}><option value="all">全部</option>{config.layerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label><span>處理</span><select value={handling} onChange={(event) => setHandling(event.target.value)}><option value="all">全部</option>{HANDLING_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    </section>
    {error ? <div className="canonical-error" role="alert"><span>{error}</span>{error === "此篩選網址已失效" ? <button type="button" className="secondary-button" onClick={resetRetiredUrl}>清除舊篩選</button> : null}</div> : null}
    <section className="canonical-list" aria-busy={loading}>
      <div className="canonical-list-meta"><span>{totals.groups} 組，共 {totals.rows} 列</span>{loading ? <span role="status">更新中…</span> : null}</div>
      <div className="canonical-table-wrap"><table><thead><tr><th>編號</th><th>品名</th><th>資料</th><th>處理</th></tr></thead><tbody>
        {groups.map((group) => group.rows.map((row, index) => <tr key={row.rowKey} className={`${index === 0 ? "is-group-first" : ""} is-${row.layer}`} onClick={() => selectDetail(row.rowKey)}>
          <td><button type="button" className="canonical-row-open" onClick={(event) => { event.stopPropagation(); selectDetail(row.rowKey); }}>{row.code}</button>{index === 0 ? null : <span className="canonical-branch-mark" aria-label="同一編號的另一資料列">↳</span>}</td><td>{row.name || "—"}</td><td><span className={`canonical-layer is-${row.layer}`}>{row.layerLabel}</span></td><td>{row.handlingLabel ? <span className={`canonical-handling is-${row.handling}`}>{row.handlingLabel}</span> : null}</td>
        </tr>))}
        {!loading && !groups.length && !error ? <tr><td colSpan={4} className="canonical-empty">沒有符合條件的資料</td></tr> : null}
      </tbody></table></div>
      {nextCursor ? <button type="button" className="secondary-button canonical-load-more" disabled={loading} onClick={() => void load(nextCursor, true)}>載入更多</button> : null}
    </section>
    {detailKey ? <Drawer detail={detail} loading={detailLoading} error={detailError} onClose={closeDetail} onAction={onAction} /> : null}
    {candidateRow ? <div className="canonical-modal-backdrop"><section className="canonical-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-advance-title"><header><div><h2 id="canonical-advance-title">選擇進版方式</h2><p>{candidateRow.code} · {candidateRow.layerLabel}</p></div><button className="secondary-button" type="button" onClick={() => setCandidateRow(null)}>關閉</button></header>{candidateError ? <p className="canonical-error" role="alert">{candidateError}</p> : null}<div className="canonical-candidates">{candidates.map((candidate) => <button type="button" key={candidate.kind} disabled={!candidate.enabled || busy} onClick={() => void createRevision(candidate)}><strong>{candidate.label}</strong>{candidate.reason ? <small>{candidate.reason}</small> : null}</button>)}</div>{busy && !candidates.length ? <p role="status">正在取得可用版次…</p> : null}</section></div> : null}
  </main>;
}
