"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Eye, FileUp, History, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { PdmDetailDrawer, useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";
import { StatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { useListKeyboardShortcuts } from "@/components/use-list-keyboard-shortcuts";
import { WorkflowStrip } from "@/components/workflow-strip";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

type NumberingImportStagingRow = {
  id: string;
  importBatchId: string;
  rowNo: number;
  raw: Record<string, unknown>;
  checkStatus: "pending" | "valid" | "need_info" | "admin_confirm" | "conflict" | "legacy_keep";
  issues: Array<{ code: string; message: string }>;
};

type NumberingImportBatch = {
  id: string;
  sourceFilename: string;
  sourceHash: string | null;
  status: "staged" | "confirmed" | "rejected";
  summary: Record<string, unknown>;
  importedBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rows: NumberingImportStagingRow[];
};

type LifecycleActionState = {
  allowed: boolean;
  reasonCode?: string;
  message?: string;
};

type LifecycleActionPolicy = {
  stageLabel: "草稿" | "審核中" | "正式" | "歷史";
  uiSurface: "work_list" | "deleted_data" | "controlled_history";
  traceabilityClass: "working" | "uncontrolled_deleted" | "controlled_history";
  detailTags: string[];
  actions: {
    restore?: LifecycleActionState;
  };
};

type DeletedImportBatch = {
  batch: NumberingImportBatch;
  policy: LifecycleActionPolicy;
};

const sampleCsv = `主根號,品名,料號,圖號,料件類型,圖別
A0001,測試支架,A0001-P01,A0001-M01,manufactured,M
00002,測試墊片,00002-P01,,purchased,M`;

export default function NumberingImportsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [batches, setBatches] = useState<NumberingImportBatch[]>([]);
  const [deletedBatches, setDeletedBatches] = useState<DeletedImportBatch[]>([]);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const batchListRef = useRef<HTMLDivElement | null>(null);
  const [isBatchDetailOpen, setIsBatchDetailOpen] = useState(false);
  const [sourceFilename, setSourceFilename] = useState(`legacy-numbering-${currentDate()}.csv`);
  const [sourceHash, setSourceHash] = useState("");
  const [rawInput, setRawInput] = useState(sampleCsv);
  const [busy, setBusy] = useState<"stage" | "confirm" | `delete:${string}` | `restore:${string}` | null>(null);
  const [error, setError] = useState("");
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey: "pdm-import-detail-drawer-width" });

  const selectedBatch = useMemo(() => (selectedBatchId ? batches.find((batch) => batch.id === selectedBatchId) ?? null : null), [batches, selectedBatchId]);
  const parsedRows = useMemo(() => parseImportRows(rawInput), [rawInput]);

  const loadData = useCallback(async () => {
    setState("loading");
    setError("");
    const response = await fetch("/api/numbering/import-batches?limit=20");
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
      setError(body.error ?? "匯入批次讀取失敗");
      setState("error");
      return;
    }
    const nextBatches = (body.batches ?? []) as NumberingImportBatch[];
    setBatches(nextBatches);
    setSelectedBatchId((current) => {
      const nextSelection = current && nextBatches.some((batch) => batch.id === current) ? current : null;
      setIsBatchDetailOpen((open) => open && Boolean(nextSelection));
      return nextSelection;
    });
    setState("ready");
  }, []);

  const loadDeletedBatches = useCallback(async () => {
    setDeletedLoading(true);
    setError("");
    const response = await fetch("/api/numbering/import-batches?surface=deleted_data&limit=20");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "已刪除匯入批次讀取失敗");
      setState(response.status === 403 ? "forbidden" : "error");
      setDeletedLoading(false);
      return;
    }
    setDeletedBatches((body.batches ?? []) as DeletedImportBatch[]);
    setDeletedLoaded(true);
    setDeletedLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openBatchDetail = useCallback((batch: NumberingImportBatch) => {
    setSelectedBatchId(batch.id);
    setIsBatchDetailOpen(true);
  }, []);

  const selectBatch = useCallback((batch: NumberingImportBatch, options: { openDetail: boolean }) => {
    setSelectedBatchId(batch.id);
    if (options.openDetail) setIsBatchDetailOpen(true);
  }, []);

  const closeBatchDetail = useCallback(() => {
    setIsBatchDetailOpen(false);
  }, []);

  const batchShortcuts = useListKeyboardShortcuts({
    items: batches,
    selectedKey: selectedBatchId,
    listRef: batchListRef,
    rowSelector: "[data-import-batch-row='true']",
    getKey: (batch) => batch.id,
    getCopyText: (batch) => batch.sourceFilename,
    onSelect: selectBatch,
    onOpenDetail: openBatchDetail,
    onCloseDetail: closeBatchDetail,
    isDetailOpen: isBatchDetailOpen
  });

  useEffect(() => {
    if (!isBatchDetailOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (target.closest("[data-import-batch-row='true']")) return;
      setIsBatchDetailOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isBatchDetailOpen]);

  async function createBatch() {
    if (!parsedRows.ok) {
      setError(parsedRows.error);
      setState("error");
      return;
    }
    setBusy("stage");
    const response = await fetch("/api/numbering/import-batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceFilename,
        sourceHash,
        rows: parsedRows.rows
      })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "建立 staging 匯入批次失敗");
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    const batch = body as NumberingImportBatch;
    setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
    setSelectedBatchId(batch.id);
    setIsBatchDetailOpen(true);
    setState("ready");
  }

  async function confirmBatch(batch: NumberingImportBatch) {
    setBusy("confirm");
    const response = await fetch(`/api/numbering/import-batches/${batch.id}/confirm`, { method: "POST" });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "管理員確認轉正式失敗");
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    const nextBatch = body as NumberingImportBatch;
    setBatches((current) => [nextBatch, ...current.filter((item) => item.id !== nextBatch.id)]);
    setSelectedBatchId(nextBatch.id);
    setIsBatchDetailOpen(true);
    setState("ready");
  }

  async function deleteBatch(batch: NumberingImportBatch) {
    setBusy(`delete:${batch.id}`);
    const response = await fetch(`/api/numbering/import-batches/${encodeURIComponent(batch.id)}/delete`, { method: "POST" });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "匯入批次刪除失敗");
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    const isDeletingSelectedBatch = selectedBatchId === batch.id;
    setBatches((current) => current.filter((item) => item.id !== batch.id));
    setSelectedBatchId((current) => (current === batch.id ? null : current));
    setIsBatchDetailOpen((open) => (isDeletingSelectedBatch ? false : open));
    if (deletedLoaded) void loadDeletedBatches();
    setState("ready");
  }

  async function restoreBatch(deleted: DeletedImportBatch) {
    setBusy(`restore:${deleted.batch.id}`);
    const response = await fetch(`/api/numbering/import-batches/${encodeURIComponent(deleted.batch.id)}/restore`, { method: "POST" });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "匯入批次還原失敗");
      setState(response.status === 403 ? "forbidden" : "error");
      return;
    }
    const nextBatch = body.batch as NumberingImportBatch;
    setBatches((current) => [nextBatch, ...current.filter((item) => item.id !== nextBatch.id)]);
    setSelectedBatchId(nextBatch.id);
    setIsBatchDetailOpen(true);
    void loadDeletedBatches();
    setState("ready");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>總表匯入</h1>
          <p>既有圖料號總表 staging、檢查報告與管理員確認。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <WorkflowStrip
        title="匯入流程"
        description="先把既有主檔轉成 staging，確認衝突與保留規則後再進入查詢與稽核。"
        steps={["匯入", "Staging", "確認", "稽核", "查詢"]}
        currentStep="Staging"
        actions={[
          { href: "/numbering/search", label: "查匯入結果", variant: "primary" },
          { href: "/numbering/request", label: "補新料號" }
        ]}
      />

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再使用總表匯入。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="工程師、研發主管或管理員可建立 staging；正式確認需管理員權限。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={() => setState("ready")} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入匯入批次...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>建立 Staging</h2>
                <p style={mutedTextStyle}>可貼上 JSON array 或含表頭的 CSV / TSV。</p>
              </div>
              <button className="primary-button" type="button" disabled={busy === "stage" || !parsedRows.ok} onClick={createBatch}>
                <FileUp size={16} />
                產生檢查報告
              </button>
            </div>
            <div style={formGridStyle}>
              <label style={fieldStyle}>
                <span>來源檔名</span>
                <input value={sourceFilename} onChange={(event) => setSourceFilename(event.target.value)} />
              </label>
              <label style={fieldStyle}>
                <span>來源 hash</span>
                <input value={sourceHash} onChange={(event) => setSourceHash(event.target.value)} placeholder="可留空" />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>匯入內容</span>
                <textarea value={rawInput} onChange={(event) => setRawInput(event.target.value)} rows={8} />
              </label>
              <div style={parseStateStyle(parsedRows.ok)}>
                {parsedRows.ok ? `已解析 ${parsedRows.rows.length} 列，送出後才會進入 staging。` : parsedRows.error}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>近期匯入批次</h2>
                <p style={mutedTextStyle}>可切換查看歷次 staging 與確認結果。</p>
              </div>
            </div>
            <div
              aria-keyshortcuts={batchShortcuts.shortcuts}
              aria-label="匯入批次清單"
              onKeyDown={batchShortcuts.handleKeyDown}
              ref={batchListRef}
              role="region"
              tabIndex={0}
            >
              <BatchTable batches={batches} selectedId={selectedBatchId} busy={busy} onDelete={deleteBatch} onSelect={openBatchDetail} />
            </div>
          </section>

          <details
            className="master-attachment-deleted"
            onToggle={(event) => {
              if (event.currentTarget.open && !deletedLoaded && !deletedLoading) void loadDeletedBatches();
            }}
          >
            <summary>
              <span>
                <History size={16} />
                已刪除資料
              </span>
              <strong>{deletedLoaded ? deletedBatches.length : "未載入"}</strong>
            </summary>
            <div className="master-attachment-deleted-body">
              <div className="master-attachment-deleted-toolbar">
                <p>這裡只放尚未確認轉正式主檔的暫存匯入批次；已確認批次不在此還原。</p>
                <button className="secondary-button" type="button" onClick={() => void loadDeletedBatches()} disabled={deletedLoading}>
                  <RotateCcw size={16} />
                  重新整理
                </button>
              </div>
              <DeletedBatchTable deletedBatches={deletedBatches} busy={busy} loading={deletedLoading} onRestore={restoreBatch} />
              {deletedLoading ? <div className="empty">正在載入已刪除匯入批次...</div> : null}
              {deletedLoaded && deletedBatches.length === 0 ? <div className="empty">目前沒有已刪除匯入批次</div> : null}
            </div>
          </details>

          <PdmDetailDrawer
            open={isBatchDetailOpen && Boolean(selectedBatch)}
            width={drawerWidth}
            ariaLabel="匯入批次檢查明細"
            onClose={closeBatchDetail}
            onStartResize={startDrawerResize}
          >
            <section className="panel pdm-master-detail-panel">
              <div className="panel-header">
                <div>
                  <h2>Staging 檢查報告</h2>
                  <p style={mutedTextStyle}>衝突與待補資料不會寫入正式主檔；確認時只套用 valid rows。</p>
                </div>
                {selectedBatch ? (
                  <div className="pdm-drawer-header-actions">
                    <button className="secondary-button" type="button" onClick={() => downloadJson(selectedBatch, `numbering-import-report-${selectedBatch.id}.json`)}>
                      <Download size={16} />
                      下載檢查報告
                    </button>
                    <button className="primary-button" type="button" disabled={busy === "confirm" || selectedBatch.status !== "staged"} onClick={() => confirmBatch(selectedBatch)}>
                      <CheckCircle2 size={16} />
                      管理員確認
                    </button>
                    <button className="icon-button" type="button" aria-label="關閉匯入批次明細" onClick={closeBatchDetail}>
                      <X size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
              <BatchSummary batch={selectedBatch} />
              <StagingRowsTable batch={selectedBatch} />
            </section>
          </PdmDetailDrawer>
        </div>
      ) : null}
    </>
  );
}

function BatchSummary({ batch }: { batch: NumberingImportBatch | null }) {
  if (!batch) {
    return (
      <NextStepState
        eyebrow="匯入"
        title="尚未產生匯入批次"
        body="先貼上 JSON、CSV 或 TSV 建立 staging，再檢查衝突與待補資訊。"
        actions={[
          { href: "/numbering/request", label: "補新料號", variant: "primary" },
          { href: "/numbering/search", label: "查既有圖料" }
        ]}
      />
    );
  }
  const summary = batch.summary ?? {};
  return (
    <div className="metrics" style={{ padding: "12px 16px", marginBottom: 0 }}>
      <Metric label="總列數" value={numberValue(summary.total)} />
      <Metric label="可匯入" value={numberValue(summary.valid)} />
      <Metric label="待補" value={numberValue(summary.needInfo)} />
      <Metric label="衝突" value={numberValue(summary.conflict)} />
    </div>
  );
}

function StagingRowsTable({ batch }: { batch: NumberingImportBatch | null }) {
  if (!batch) {
    return null;
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "980px" }}>
        <thead>
          <tr>
            <th>列</th>
            <th>
              <StatusColumnHeader context="importRow" />
            </th>
            <th>主根號</th>
            <th>料號</th>
            <th>圖號</th>
            <th>問題</th>
          </tr>
        </thead>
        <tbody>
          {batch.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.rowNo}</td>
              <td>
                <StatusBadge status={row.checkStatus} context="importRow" />
              </td>
              <td>{readField(row.raw, "rootCode", "root_code", "主根號")}</td>
              <td>{readField(row.raw, "partNumber", "part_number", "料號")}</td>
              <td>{readField(row.raw, "drawingNumber", "drawing_number", "圖號")}</td>
              <td>
                {row.issues.length === 0 ? (
                  <span style={mutedTextStyle}>無</span>
                ) : (
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    {row.issues.map((issue) => (
                      <span key={`${row.id}-${issue.code}`} style={issueTextStyle}>
                        {issue.code}: {issue.message}
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchTable({
  batches,
  selectedId,
  busy,
  onDelete,
  onSelect
}: {
  batches: NumberingImportBatch[];
  selectedId: string | null;
  busy: "stage" | "confirm" | `delete:${string}` | `restore:${string}` | null;
  onDelete: (batch: NumberingImportBatch) => void;
  onSelect: (batch: NumberingImportBatch) => void;
}) {
  if (batches.length === 0) {
    return (
      <NextStepState
        eyebrow="批次"
        title="尚無匯入批次"
        body="目前沒有歷史批次可查看；建立 staging 後會在這裡追蹤確認狀態與檢查報告。"
        actions={[
          { href: "/numbering/imports", label: "建立 staging", variant: "primary" },
          { href: "/numbering/search", label: "查圖料" }
        ]}
      />
    );
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>來源</th>
            <th>
              <StatusColumnHeader label="批次狀態" context="importBatch" />
            </th>
            <th>摘要</th>
            <th>確認</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr
              className={selectedId === batch.id ? "selected-row" : undefined}
              data-import-batch-row="true"
              key={batch.id}
              onClick={() => onSelect(batch)}
            >
              <td>
                <strong>{batch.sourceFilename}</strong>
                <p style={bodyTextStyle}>{batch.sourceHash || "無 hash"}</p>
              </td>
              <td>
                <StatusBadge status={batch.status} context="importBatch" />
              </td>
              <td>
                total {numberValue(batch.summary.total)} / valid {numberValue(batch.summary.valid)} / conflict {numberValue(batch.summary.conflict)}
              </td>
              <td>{batch.confirmedAt ? formatDateTime(batch.confirmedAt) : "尚未確認"}</td>
              <td>
                <div style={actionGroupStyle}>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(batch);
                    }}
                  >
                    <Eye size={16} />
                    查看
                  </button>
                  {batch.status === "staged" ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(batch);
                      }}
                      disabled={busy === `delete:${batch.id}`}
                    >
                      <Trash2 size={16} />
                      刪除
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeletedBatchTable({
  deletedBatches,
  busy,
  loading,
  onRestore
}: {
  deletedBatches: DeletedImportBatch[];
  busy: "stage" | "confirm" | `delete:${string}` | `restore:${string}` | null;
  loading: boolean;
  onRestore: (deleted: DeletedImportBatch) => void;
}) {
  if (deletedBatches.length === 0) return null;
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>來源</th>
            <th>刪除階段 / 提醒</th>
            <th>摘要</th>
            <th>
              <StatusColumnHeader label="還原狀態" context="restorePolicy" />
            </th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {deletedBatches.map((deleted) => {
            const restoreState = deleted.policy.actions.restore;
            const canRestore = restoreState?.allowed === true;
            return (
              <tr key={deleted.batch.id}>
                <td>
                  <strong>{deleted.batch.sourceFilename}</strong>
                  <p style={bodyTextStyle}>{deleted.batch.sourceHash || "無 hash"}</p>
                </td>
                <td>
                  <span className="badge Rejected">{deleted.policy.stageLabel}</span>
                  {deleted.policy.detailTags.map((tag) => (
                    <span className={`badge ${tag === "可還原" ? "Released" : "Rejected"}`} key={`${deleted.batch.id}-${tag}`}>
                      {tag}
                    </span>
                  ))}
                </td>
                <td>
                  total {numberValue(deleted.batch.summary.total)} / valid {numberValue(deleted.batch.summary.valid)} / conflict {numberValue(deleted.batch.summary.conflict)}
                </td>
                <td>
                  <StatusBadge status={canRestore ? "restore_allowed" : "restore_blocked"} context="restorePolicy" />
                  <p style={canRestore ? mutedTextStyle : issueTextStyle}>{canRestore ? "可還原到匯入批次" : restoreState?.message ?? "不可還原"}</p>
                </td>
                <td>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onRestore(deleted)}
                    disabled={!canRestore || loading || busy === `restore:${deleted.batch.id}`}
                  >
                    <RotateCcw size={16} />
                    還原
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
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
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>操作失敗</h2>
        <p>{message}</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            返回
          </button>
        </div>
      </div>
    </section>
  );
}

function parseImportRows(value: string): { ok: true; rows: Array<Record<string, string>> } | { ok: false; error: string } {
  const text = value.trim();
  if (!text) return { ok: false, error: "匯入內容不可空白" };
  if (text.startsWith("[")) {
    try {
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
        return { ok: false, error: "JSON 必須是非空物件陣列" };
      }
      return { ok: true, rows: rows as Array<Record<string, string>> };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "JSON 解析失敗" };
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return { ok: false, error: "CSV/TSV 至少需要表頭與一列資料" };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });
  return { ok: true, rows };
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function readField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "-";
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const mutedTextStyle = {
  margin: 0,
  color: "var(--muted)",
  fontSize: "0.82rem"
} as const;

const bodyTextStyle = {
  margin: "0.25rem 0 0",
  color: "var(--muted)",
  fontSize: "0.86rem",
  lineHeight: 1.45
} as const;

const actionGroupStyle = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center"
} as const;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem",
  padding: "12px 16px 16px"
} as const;

const fieldStyle = {
  display: "grid",
  gap: "0.35rem",
  color: "var(--muted)",
  fontSize: "0.84rem",
  fontWeight: 700
} as const;

const issueTextStyle = {
  color: "var(--danger)",
  fontSize: "0.82rem",
  lineHeight: 1.35
} as const;

function parseStateStyle(ok: boolean) {
  return {
    gridColumn: "1 / -1",
    border: `1px solid ${ok ? "#abefc6" : "#fecdca"}`,
    borderRadius: "8px",
    padding: "10px",
    background: ok ? "#ecfdf3" : "#fef3f2",
    color: ok ? "var(--success)" : "var(--danger)",
    fontWeight: 700
  } as const;
}
