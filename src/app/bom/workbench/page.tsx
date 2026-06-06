"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  FolderPlus,
  GitBranch,
  GripVertical,
  ListTree,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Undo2,
  UploadCloud
} from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { WorkflowStrip } from "@/components/workflow-strip";

type SubmissionSummary = {
  id: string;
  item_id: string;
  part_number: string;
  part_name: string;
  drawing_number: string;
  revision: string;
  status: string;
  submitted_by_name?: string;
  updated_at?: string;
};

type BomWorkbenchSource = "cad_reference" | "solidworks_xls" | "manual";
type BomWorkbenchNodeType = "item" | "group";
type BomWorkbenchDraftStatus = "Draft" | "PendingReview" | "Rejected" | "Released" | "Obsolete" | "Archived";

type BomWorkbenchLine = {
  id: string;
  bom_draft_id: string;
  parent_line_id: string | null;
  node_type: BomWorkbenchNodeType;
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  sequence_no: number;
  source: BomWorkbenchSource;
  source_priority: number;
  source_ref_id?: string | null;
  source_filename?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BomWorkbenchDraftSummary = {
  id: string;
  parent_item_id: string;
  parent_submission_id: string;
  parent_revision: string;
  draft_name: string;
  status: BomWorkbenchDraftStatus;
  source: BomWorkbenchSource;
  is_active: number;
  line_count: number;
  review_attempt: number;
  updated_at: string;
};

type BomWorkbenchDraftDetail = BomWorkbenchDraftSummary & {
  lines: BomWorkbenchLine[];
};

type BomWorkbenchSummary = {
  parent_submission_id: string;
  parent_item_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  parent_status: string;
  drafts: BomWorkbenchDraftSummary[];
  active_draft: BomWorkbenchDraftDetail | null;
};

type TreeRow = {
  line: BomWorkbenchLine;
  depth: number;
};

type CompareRow = {
  key: string;
  label: string;
  change: "added" | "removed" | "changed";
  before: string;
  after: string;
};

const ROOT_PARENT = "__root__";
const SOURCE_LABELS: Record<BomWorkbenchSource, string> = {
  cad_reference: "CAD Reference",
  solidworks_xls: "SolidWorks XLS",
  manual: "Manual"
};

export default function BomWorkbenchPage() {
  const [query, setQuery] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionSummary | null>(null);
  const [workbench, setWorkbench] = useState<BomWorkbenchSummary | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<BomWorkbenchDraftDetail | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [compareDraftId, setCompareDraftId] = useState("");
  const [compareDraft, setCompareDraft] = useState<BomWorkbenchDraftDetail | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [xlsText, setXlsText] = useState("");
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);
  const [draggedSubmissionId, setDraggedSubmissionId] = useState<string | null>(null);
  const [history, setHistory] = useState<BomWorkbenchLine[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isMutable = selectedDraft?.status === "Draft" || selectedDraft?.status === "Rejected";
  const rows = useMemo(() => buildTreeRows(selectedDraft?.lines ?? []), [selectedDraft?.lines]);
  const selectedLine = useMemo(
    () => selectedDraft?.lines.find((line) => line.id === selectedLineId) ?? null,
    [selectedDraft?.lines, selectedLineId]
  );
  const comparison = useMemo(() => buildCompareRows(compareDraft, selectedDraft), [compareDraft, selectedDraft]);

  const resetHistory = useCallback((lines: BomWorkbenchLine[]) => {
    const next = cloneLines(normalizeSequence(lines));
    setHistory([next]);
    setHistoryIndex(0);
    setDirty(false);
  }, []);

  const setDraftFromDetail = useCallback(
    (draft: BomWorkbenchDraftDetail | null) => {
      setSelectedDraft(draft ? { ...draft, lines: normalizeSequence(draft.lines) } : null);
      setSelectedLineId(draft?.lines[0]?.id ?? null);
      setCompareDraft(null);
      setCompareDraftId("");
      resetHistory(draft?.lines ?? []);
    },
    [resetHistory]
  );

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(body.message ?? body.error ?? `HTTP ${response.status}`));
    }
    return body as T;
  }, []);

  const loadDraft = useCallback(
    async (draftId: string) => {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${draftId}`);
      setDraftFromDetail(body.draft);
      setMessage(`已載入 Draft：${body.draft.draft_name}`);
    },
    [requestJson, setDraftFromDetail]
  );

  const loadWorkbench = useCallback(
    async (submissionId: string, preferredDraftId?: string) => {
      setLoading(true);
      setError("");
      try {
        const body = await requestJson<{ workbench: BomWorkbenchSummary }>(`/api/bom/workbench?submissionId=${encodeURIComponent(submissionId)}`);
        const nextWorkbench = body.workbench;
        setWorkbench(nextWorkbench);
        setSelectedSubmission((current) =>
          current?.id === submissionId
            ? current
            : {
                id: nextWorkbench.parent_submission_id,
                item_id: nextWorkbench.parent_item_id,
                part_number: nextWorkbench.parent_part_number,
                part_name: nextWorkbench.parent_part_name,
                drawing_number: nextWorkbench.parent_drawing_number,
                revision: nextWorkbench.parent_revision,
                status: nextWorkbench.parent_status
              }
        );

        const nextDraftId =
          preferredDraftId ??
          nextWorkbench.active_draft?.id ??
          nextWorkbench.drafts.find((draft) => draft.status === "Draft" || draft.status === "Rejected")?.id ??
          nextWorkbench.drafts[0]?.id ??
          "";
        if (!nextDraftId) {
          setDraftFromDetail(null);
          setMessage("此料號尚未建立 BOM Draft");
          return;
        }
        if (nextWorkbench.active_draft?.id === nextDraftId) {
          setDraftFromDetail(nextWorkbench.active_draft);
          setMessage(`已載入 Active Draft：${nextWorkbench.active_draft.draft_name}`);
          return;
        }
        await loadDraft(nextDraftId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入 BOM 工作台失敗");
      } finally {
        setLoading(false);
      }
    },
    [loadDraft, requestJson, setDraftFromDetail]
  );

  const loadRecentSubmissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ submissions: SubmissionSummary[] }>("/api/submissions?limit=80");
      setSubmissions(body.submissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入最近圖面失敗");
    } finally {
      setLoading(false);
    }
  }, [requestJson]);

  useEffect(() => {
    loadRecentSubmissions();
    const params = new URLSearchParams(window.location.search);
    const submissionId = params.get("submissionId");
    if (submissionId) void loadWorkbench(submissionId);
  }, [loadRecentSubmissions, loadWorkbench]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function runSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      await loadRecentSubmissions();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ submissions: SubmissionSummary[] }>(`/api/search?q=${encodeURIComponent(trimmed)}`);
      setSubmissions(body.submissions ?? []);
      setMessage(`搜尋完成：${body.submissions?.length ?? 0} 筆`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
    } finally {
      setLoading(false);
    }
  }

  function pushLines(lines: BomWorkbenchLine[], nextSelectedLineId = selectedLineId) {
    if (!selectedDraft || !isMutable) return;
    const normalized = normalizeSequence(lines);
    const base = history.slice(0, historyIndex + 1);
    setHistory([...base, cloneLines(normalized)]);
    setHistoryIndex(base.length);
    setSelectedDraft({ ...selectedDraft, lines: normalized, line_count: normalized.length, source: "manual" });
    setSelectedLineId(nextSelectedLineId);
    setDirty(true);
  }

  function restoreHistory(nextIndex: number) {
    if (!selectedDraft || !history[nextIndex]) return;
    const lines = cloneLines(history[nextIndex]);
    setHistoryIndex(nextIndex);
    setSelectedDraft({ ...selectedDraft, lines, line_count: lines.length });
    setSelectedLineId((current) => (current && lines.some((line) => line.id === current) ? current : lines[0]?.id ?? null));
    setDirty(nextIndex !== 0);
  }

  function addGroup() {
    if (!selectedDraft || !isMutable) return;
    const parentLineId = selectedLine?.node_type === "group" ? selectedLine.id : null;
    const id = makeId();
    pushLines(
      [
        ...selectedDraft.lines,
        {
          id,
          bom_draft_id: selectedDraft.id,
          parent_line_id: parentLineId,
          node_type: "group",
          item_id: null,
          part_number: null,
          revision: null,
          group_name: "新群組",
          quantity: null,
          sequence_no: nextSequence(selectedDraft.lines, parentLineId),
          source: "manual",
          source_priority: 30
        }
      ],
      id
    );
  }

  function addSubmissionAsLine(submission: SubmissionSummary, parentLineId: string | null = selectedLine?.node_type === "group" ? selectedLine.id : null) {
    if (!selectedDraft || !isMutable) return;
    const id = makeId();
    pushLines(
      [
        ...selectedDraft.lines,
        {
          id,
          bom_draft_id: selectedDraft.id,
          parent_line_id: parentLineId,
          node_type: "item",
          item_id: submission.item_id,
          part_number: submission.part_number,
          part_name: submission.part_name,
          revision: submission.revision,
          group_name: null,
          quantity: 1,
          sequence_no: nextSequence(selectedDraft.lines, parentLineId),
          source: "manual",
          source_priority: 30
        }
      ],
      id
    );
  }

  function updateLine(lineId: string, patch: Partial<BomWorkbenchLine>) {
    if (!selectedDraft || !isMutable) return;
    pushLines(
      selectedDraft.lines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              ...patch,
              source: "manual",
              source_priority: 30
            }
          : line
      ),
      lineId
    );
  }

  function deleteLine(lineId: string) {
    if (!selectedDraft || !isMutable) return;
    const deleteIds = collectDescendants(selectedDraft.lines, lineId);
    pushLines(
      selectedDraft.lines.filter((line) => !deleteIds.has(line.id)),
      selectedLineId === lineId ? null : selectedLineId
    );
  }

  function moveLine(lineId: string, direction: -1 | 1) {
    if (!selectedDraft || !isMutable) return;
    const line = selectedDraft.lines.find((item) => item.id === lineId);
    if (!line) return;
    const siblings = selectedDraft.lines
      .filter((item) => (item.parent_line_id ?? ROOT_PARENT) === (line.parent_line_id ?? ROOT_PARENT))
      .sort((a, b) => a.sequence_no - b.sequence_no);
    const index = siblings.findIndex((item) => item.id === lineId);
    const swap = siblings[index + direction];
    if (!swap) return;
    pushLines(
      selectedDraft.lines.map((item) => {
        if (item.id === line.id) return { ...item, sequence_no: swap.sequence_no, source: "manual", source_priority: 30 };
        if (item.id === swap.id) return { ...item, sequence_no: line.sequence_no, source: "manual", source_priority: 30 };
        return item;
      }),
      lineId
    );
  }

  function indentLine(lineId: string) {
    if (!selectedDraft || !isMutable) return;
    const line = selectedDraft.lines.find((item) => item.id === lineId);
    if (!line) return;
    const siblings = selectedDraft.lines
      .filter((item) => (item.parent_line_id ?? ROOT_PARENT) === (line.parent_line_id ?? ROOT_PARENT))
      .sort((a, b) => a.sequence_no - b.sequence_no);
    const index = siblings.findIndex((item) => item.id === lineId);
    const previous = siblings[index - 1];
    if (!previous) return;
    updateLine(lineId, { parent_line_id: previous.id, sequence_no: nextSequence(selectedDraft.lines, previous.id) });
  }

  function outdentLine(lineId: string) {
    if (!selectedDraft || !isMutable) return;
    const line = selectedDraft.lines.find((item) => item.id === lineId);
    if (!line?.parent_line_id) return;
    const parent = selectedDraft.lines.find((item) => item.id === line.parent_line_id);
    updateLine(lineId, { parent_line_id: parent?.parent_line_id ?? null });
  }

  function handleTreeDrop(targetLine: BomWorkbenchLine | null) {
    if (!selectedDraft || !isMutable) return;
    const parentLineId = targetLine?.node_type === "group" ? targetLine.id : targetLine?.parent_line_id ?? null;
    if (draggedSubmissionId) {
      const submission = submissions.find((item) => item.id === draggedSubmissionId);
      if (submission) addSubmissionAsLine(submission, parentLineId);
      setDraggedSubmissionId(null);
      return;
    }
    if (draggedLineId) {
      if (draggedLineId === parentLineId || (parentLineId && isDescendant(selectedDraft.lines, draggedLineId, parentLineId))) {
        setError("不可把節點移到自己的下層");
        setDraggedLineId(null);
        return;
      }
      updateLine(draggedLineId, { parent_line_id: parentLineId, sequence_no: nextSequence(selectedDraft.lines, parentLineId) });
      setDraggedLineId(null);
    }
  }

  async function createCadDraft() {
    if (!selectedSubmission) return;
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>("/api/bom/drafts/from-assembly", {
        method: "POST",
        body: JSON.stringify({ submissionId: selectedSubmission.id, draftName: "CAD Reference Draft", setActive: true })
      });
      await loadWorkbench(selectedSubmission.id, body.draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CAD Draft 建立失敗");
    } finally {
      setLoading(false);
    }
  }

  async function importXlsFile(file: File) {
    if (!selectedSubmission) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("submissionId", selectedSubmission.id);
      form.set("draftName", `XLS Import ${new Date().toISOString().slice(0, 10)}`);
      form.set("setActive", "true");
      form.set("file", file);
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>("/api/bom/drafts/import-xls", { method: "POST", body: form });
      await loadWorkbench(selectedSubmission.id, body.draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "XLS 匯入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function importXlsText() {
    if (!selectedSubmission || !xlsText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>("/api/bom/drafts/import-xls", {
        method: "POST",
        body: JSON.stringify({
          submissionId: selectedSubmission.id,
          draftName: "XLS Paste Draft",
          setActive: true,
          originalFilename: "pasted-solidworks-bom.xls",
          content: xlsText
        })
      });
      setXlsText("");
      await loadWorkbench(selectedSubmission.id, body.draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "貼上 XLS 內容匯入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (!selectedDraft) return;
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${selectedDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          reason: "BOM Workbench UI save",
          lines: selectedDraft.lines.map(toPatchLine)
        })
      });
      setDraftFromDetail(body.draft);
      if (selectedSubmission) await loadWorkbench(selectedSubmission.id, body.draft.id);
      setMessage("BOM Draft 已儲存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setLoading(false);
    }
  }

  async function setActiveDraft() {
    if (!selectedDraft || !selectedSubmission) return;
    setLoading(true);
    setError("");
    try {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${selectedDraft.id}/active`, { method: "POST" });
      await loadWorkbench(selectedSubmission.id, body.draft.id);
      setMessage("已設為 Active Draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "設為 Active Draft 失敗");
    } finally {
      setLoading(false);
    }
  }

  async function cloneDraft() {
    if (!selectedDraft || !selectedSubmission) return;
    setLoading(true);
    setError("");
    try {
      const created = await requestJson<{ draft: BomWorkbenchDraftDetail }>("/api/bom/drafts/from-assembly", {
        method: "POST",
        body: JSON.stringify({ submissionId: selectedSubmission.id, draftName: `${selectedDraft.draft_name} Copy`, setActive: false })
      });
      const idMap = new Map(selectedDraft.lines.map((line) => [line.id, makeId()]));
      const clonedLines = selectedDraft.lines.map((line) => ({
        ...toPatchLine(line),
        id: idMap.get(line.id),
        parentLineId: line.parent_line_id ? idMap.get(line.parent_line_id) ?? null : null
      }));
      const patched = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${created.draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reason: `Clone from ${selectedDraft.id}`, lines: clonedLines })
      });
      await loadWorkbench(selectedSubmission.id, patched.draft.id);
      setMessage("Draft 已複製");
    } catch (err) {
      setError(err instanceof Error ? err.message : "複製 Draft 失敗");
    } finally {
      setLoading(false);
    }
  }

  async function submitReview() {
    if (!selectedDraft) return;
    if (dirty) {
      setError("送審前請先儲存目前 Draft");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await requestJson(`/api/bom/drafts/${selectedDraft.id}/submit-review`, {
        method: "POST",
        body: JSON.stringify({ changeReason: reviewReason.trim() })
      });
      if (selectedSubmission) await loadWorkbench(selectedSubmission.id, selectedDraft.id);
      setReviewReason("");
      setMessage("已送出研發主管審核");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送審失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadCompareDraft(draftId: string) {
    setCompareDraftId(draftId);
    if (!draftId) {
      setCompareDraft(null);
      return;
    }
    try {
      const body = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${draftId}`);
      setCompareDraft(body.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入比較 Draft 失敗");
    }
  }

  return (
    <section className="bom-workbench-page" aria-label="BOM 工作台">
      <header className="bom-workbench-header">
        <div>
          <p className="eyebrow">Engineering BOM Governance</p>
          <h1>BOM 工作台</h1>
          <p>以同一個工作台管理 CAD Draft、SolidWorks XLS 匯入與人工校正，送審前可完整調整階層、排序與數量。</p>
        </div>
        <div className="bom-workbench-header-actions">
          <span className={dirty ? "badge warning" : "badge"}>{dirty ? "未儲存" : "已同步"}</span>
          <button className="secondary-button" type="button" onClick={() => selectedSubmission && loadWorkbench(selectedSubmission.id)} disabled={!selectedSubmission || loading}>
            <RotateCcw size={16} aria-hidden="true" />
            重新整理
          </button>
        </div>
      </header>

      <WorkflowStrip
        title="BOM 建立與整理"
        description="以主件為中心整理 BOM draft，送審前先保存並確認差異與來源。"
        steps={["選主件", "編輯 BOM", "送審", "發行", "交接"]}
        currentStep="編輯 BOM"
        actions={[
          { href: "/bom/reviews", label: "去 BOM 審核", variant: "primary" },
          { href: "/handoff", label: "看交接輸出" }
        ]}
      />

      {(message || error) && (
        <div className={error ? "bom-workbench-alert error" : "bom-workbench-alert"}>
          <span>{error || message}</span>
          <button type="button" onClick={() => (error ? setError("") : setMessage(""))} aria-label="關閉訊息">
            ×
          </button>
        </div>
      )}

      <div className="bom-workbench-layout">
        <aside className="panel bom-library-panel" aria-label="料號與圖面搜尋">
          <div className="panel-header">
            <h2>料號 / 圖面</h2>
            <Search size={16} aria-hidden="true" />
          </div>
          <div className="bom-panel-body">
            <label className="bom-field">
              <span>搜尋</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="料號、圖號、品名" />
            </label>
            <div className="bom-inline-actions">
              <button className="primary-button" type="button" onClick={runSearch} disabled={loading}>
                <Search size={16} aria-hidden="true" />
                搜尋
              </button>
              <button className="secondary-button" type="button" onClick={loadRecentSubmissions} disabled={loading}>
                最近資料
              </button>
            </div>
            <div className="bom-search-list" aria-label="搜尋結果">
              {submissions.map((submission) => (
                <div
                  className={submission.id === selectedSubmission?.id ? "bom-search-result active" : "bom-search-result"}
                  draggable
                  key={submission.id}
                  onDragStart={() => setDraggedSubmissionId(submission.id)}
                  onDragEnd={() => setDraggedSubmissionId(null)}
                >
                  <button type="button" onClick={() => loadWorkbench(submission.id)}>
                    <strong>{submission.part_number}</strong>
                    <span>{submission.drawing_number} Rev {submission.revision}</span>
                    <small>{submission.part_name || "未填品名"} · {submission.status}</small>
                  </button>
                  <button className="icon-button" type="button" onClick={() => addSubmissionAsLine(submission)} disabled={!selectedDraft || !isMutable} aria-label={`加入 ${submission.part_number}`}>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {submissions.length === 0 && (
                <NextStepState
                  compact
                  eyebrow="沒有可加入項目"
                  title="目前沒有可加入 BOM 的圖料"
                  body="輸入至少 2 個字搜尋，或回圖料模組確認主件與子件資料。"
                  actions={[
                    { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
                    { href: "/upload", label: "上傳送審" }
                  ]}
                />
              )}
            </div>
          </div>
        </aside>

        <section className="panel bom-tree-panel" aria-label="BOM 樹狀結構">
          <div className="panel-header">
            <h2>{workbench ? `${workbench.parent_part_number} Rev ${workbench.parent_revision}` : "尚未選擇組合件"}</h2>
            <ListTree size={17} aria-hidden="true" />
          </div>
          <div className="bom-panel-body">
            <div className="bom-parent-summary">
              <div>
                <span>Parent</span>
                <strong>{workbench?.parent_part_name ?? "請先選擇料號或圖面"}</strong>
              </div>
              <div>
                <span>Drawing</span>
                <strong>{workbench?.parent_drawing_number ?? "-"}</strong>
              </div>
              <div>
                <span>Drafts</span>
                <strong>{workbench?.drafts.length ?? 0}</strong>
              </div>
            </div>

            <div className="bom-draft-toolbar">
              <select value={selectedDraft?.id ?? ""} onChange={(event) => loadDraft(event.target.value)} disabled={!workbench?.drafts.length || dirty}>
                <option value="">選擇 Draft</option>
                {workbench?.drafts.map((draft) => (
                  <option value={draft.id} key={draft.id}>
                    {draft.is_active ? "* " : ""}
                    {draft.draft_name} · {draft.status} · {draft.line_count} lines
                  </option>
                ))}
              </select>
              <button className="secondary-button" type="button" onClick={createCadDraft} disabled={!selectedSubmission || loading}>
                <GitBranch size={16} aria-hidden="true" />
                CAD Draft
              </button>
              <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={!selectedSubmission || loading}>
                <UploadCloud size={16} aria-hidden="true" />
                XLS
              </button>
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,.html" hidden onChange={(event) => event.target.files?.[0] && importXlsFile(event.target.files[0])} />
            </div>

            <div className="bom-draft-strip" aria-label="Draft 清單">
              {workbench?.drafts.map((draft) => (
                <button className={draft.id === selectedDraft?.id ? "bom-draft-chip active" : "bom-draft-chip"} type="button" onClick={() => loadDraft(draft.id)} disabled={dirty} key={draft.id}>
                  <span>{draft.draft_name}</span>
                  <small>{SOURCE_LABELS[draft.source]} · {draft.status}{draft.is_active ? " · Active" : ""}</small>
                </button>
              ))}
            </div>

            <div className="bom-tree-toolbar">
              <button className="primary-button" type="button" onClick={saveDraft} disabled={!selectedDraft || !dirty || loading}>
                <Save size={16} aria-hidden="true" />
                儲存
              </button>
              <button className="secondary-button" type="button" onClick={() => restoreHistory(historyIndex - 1)} disabled={historyIndex <= 0 || loading}>
                <Undo2 size={16} aria-hidden="true" />
                Undo
              </button>
              <button className="secondary-button" type="button" onClick={() => restoreHistory(historyIndex + 1)} disabled={historyIndex >= history.length - 1 || loading}>
                <Redo2 size={16} aria-hidden="true" />
                Redo
              </button>
              <button className="secondary-button" type="button" onClick={addGroup} disabled={!selectedDraft || !isMutable || loading}>
                <FolderPlus size={16} aria-hidden="true" />
                新增群組
              </button>
              <button className="secondary-button" type="button" onClick={setActiveDraft} disabled={!selectedDraft || selectedDraft.is_active === 1 || loading}>
                <CheckCircle2 size={16} aria-hidden="true" />
                設為 Active
              </button>
              <button className="secondary-button" type="button" onClick={cloneDraft} disabled={!selectedDraft || loading}>
                <Copy size={16} aria-hidden="true" />
                複製
              </button>
            </div>

            <div
              className="bom-tree-list"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleTreeDrop(null)}
              aria-label="Windows 樹狀 BOM 編輯區"
            >
              {rows.map((row) => (
                <div
                  className={row.line.id === selectedLineId ? "bom-tree-row active" : "bom-tree-row"}
                  draggable={isMutable}
                  key={row.line.id}
                  onClick={() => setSelectedLineId(row.line.id)}
                  onDragStart={() => setDraggedLineId(row.line.id)}
                  onDragEnd={() => setDraggedLineId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.stopPropagation();
                    handleTreeDrop(row.line);
                  }}
                  style={{ paddingLeft: `${row.depth * 18 + 8}px` }}
                >
                  <GripVertical size={14} aria-hidden="true" />
                  <div className="bom-tree-main">
                    <strong>{row.line.node_type === "group" ? row.line.group_name : row.line.part_number}</strong>
                    <span>
                      {row.line.node_type === "group"
                        ? "Virtual group"
                        : `${row.line.part_name ?? "未填品名"} · Rev ${row.line.revision ?? "-"} · Qty ${row.line.quantity ?? 1}`}
                    </span>
                  </div>
                  <span className="bom-source-pill">{SOURCE_LABELS[row.line.source]}</span>
                  <div className="bom-row-actions">
                    <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); moveLine(row.line.id, -1); }} disabled={!isMutable} aria-label="上移">
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); moveLine(row.line.id, 1); }} disabled={!isMutable} aria-label="下移">
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); indentLine(row.line.id); }} disabled={!isMutable} aria-label="縮排">
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); outdentLine(row.line.id); }} disabled={!isMutable} aria-label="取消縮排">
                      <ArrowLeft size={14} aria-hidden="true" />
                    </button>
                    <button className="icon-button danger" type="button" onClick={(event) => { event.stopPropagation(); deleteLine(row.line.id); }} disabled={!isMutable} aria-label="刪除">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="bom-tree-dropzone">
                  <ListTree size={24} aria-hidden="true" />
                  <span>建立 Draft 後，可從左側搜尋結果拖入子件，或匯入 SolidWorks BOM XLS。</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel bom-properties-panel" aria-label="節點屬性與送審">
          <div className="panel-header">
            <h2>節點屬性</h2>
            <FileSpreadsheet size={16} aria-hidden="true" />
          </div>
          <div className="bom-panel-body">
            {selectedLine ? (
              <div className="bom-property-form">
                <div className="bom-property-title">
                  <strong>{selectedLine.node_type === "group" ? selectedLine.group_name : selectedLine.part_number}</strong>
                  <span>{SOURCE_LABELS[selectedLine.source]} · Priority {selectedLine.source_priority}</span>
                </div>
                {selectedLine.node_type === "group" ? (
                  <label className="bom-field">
                    <span>群組名稱</span>
                    <input value={selectedLine.group_name ?? ""} onChange={(event) => updateLine(selectedLine.id, { group_name: event.target.value })} disabled={!isMutable} />
                  </label>
                ) : (
                  <>
                    <label className="bom-field">
                      <span>料號</span>
                      <input value={selectedLine.part_number ?? ""} onChange={(event) => updateLine(selectedLine.id, { part_number: event.target.value })} disabled={!isMutable} />
                    </label>
                    <label className="bom-field">
                      <span>版次</span>
                      <input value={selectedLine.revision ?? ""} onChange={(event) => updateLine(selectedLine.id, { revision: event.target.value })} disabled={!isMutable} />
                    </label>
                    <label className="bom-field">
                      <span>數量</span>
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={selectedLine.quantity ?? 1}
                        onChange={(event) => updateLine(selectedLine.id, { quantity: Number(event.target.value) || 1 })}
                        disabled={!isMutable}
                      />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <NextStepState
                compact
                eyebrow="尚未選取節點"
                title="選擇 BOM 節點後可編輯內容"
                body="先在左側樹狀結構選一個群組或料號，再調整階層、數量與顯示資訊。"
                actions={[
                  { href: "/bom/reviews", label: "看 BOM 審核", variant: "primary" },
                  { href: "/numbering/search", label: "查圖料" }
                ]}
              />
            )}

            <div className="bom-xls-paste">
              <label className="bom-field">
                <span>貼上 SolidWorks BOM XLS / TSV</span>
                <textarea value={xlsText} onChange={(event) => setXlsText(event.target.value)} placeholder={"ITEM NO.\tPART NUMBER\tQTY\n1\tP-1001\t2"} />
              </label>
              <button className="secondary-button" type="button" onClick={importXlsText} disabled={!selectedSubmission || !xlsText.trim() || loading}>
                <UploadCloud size={16} aria-hidden="true" />
                匯入貼上內容
              </button>
            </div>

            <div className="bom-review-box">
              <label className="bom-field">
                <span>送審原因</span>
                <textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="描述本次 BOM 變更原因" />
              </label>
              <button className="primary-button" type="button" onClick={submitReview} disabled={!selectedDraft || !reviewReason.trim() || dirty || loading}>
                <Send size={16} aria-hidden="true" />
                送主管審核
              </button>
            </div>

            <div className="bom-compare-box">
              <label className="bom-field">
                <span>比較 Draft</span>
                <select value={compareDraftId} onChange={(event) => loadCompareDraft(event.target.value)} disabled={!selectedDraft}>
                  <option value="">選擇 Draft 進行比較</option>
                  {workbench?.drafts
                    .filter((draft) => draft.id !== selectedDraft?.id)
                    .map((draft) => (
                      <option value={draft.id} key={draft.id}>
                        {draft.draft_name} · {draft.status}
                      </option>
                    ))}
                </select>
              </label>
              <div className="bom-compare-list">
                {comparison.map((row) => (
                  <div className={`bom-compare-row ${row.change}`} key={row.key}>
                    <strong>{row.label}</strong>
                    <span>{row.before} → {row.after}</span>
                  </div>
                ))}
                {compareDraftId && comparison.length === 0 && (
                  <NextStepState
                    compact
                    eyebrow="差異比對"
                    title="兩份 Draft 沒有差異"
                    body="若內容已確認，可填寫送審原因後送出 BOM 審核，或回交接頁查看 Released 輸出。"
                    actions={[
                      { href: "/bom/reviews", label: "看 BOM 審核", variant: "primary" },
                      { href: "/handoff", label: "看交接" }
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneLines(lines: BomWorkbenchLine[]) {
  return lines.map((line) => ({ ...line }));
}

function normalizeSequence(lines: BomWorkbenchLine[]) {
  const grouped = new Map<string, BomWorkbenchLine[]>();
  for (const line of lines) {
    const parentKey = line.parent_line_id ?? ROOT_PARENT;
    grouped.set(parentKey, [...(grouped.get(parentKey) ?? []), line]);
  }
  const normalized: BomWorkbenchLine[] = [];
  for (const siblings of grouped.values()) {
    siblings
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .forEach((line, index) => {
        normalized.push({ ...line, sequence_no: index + 1 });
      });
  }
  return normalized;
}

function buildTreeRows(lines: BomWorkbenchLine[]) {
  const byParent = new Map<string, BomWorkbenchLine[]>();
  for (const line of lines) {
    const parentKey = line.parent_line_id ?? ROOT_PARENT;
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), line]);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.sequence_no - b.sequence_no);
  const rows: TreeRow[] = [];
  const visiting = new Set<string>();
  const visit = (parentId: string, depth: number) => {
    for (const line of byParent.get(parentId) ?? []) {
      if (visiting.has(line.id)) continue;
      visiting.add(line.id);
      rows.push({ line, depth });
      visit(line.id, depth + 1);
      visiting.delete(line.id);
    }
  };
  visit(ROOT_PARENT, 0);
  for (const line of lines) {
    if (!rows.some((row) => row.line.id === line.id)) rows.push({ line, depth: 0 });
  }
  return rows;
}

function nextSequence(lines: BomWorkbenchLine[], parentLineId: string | null) {
  const siblings = lines.filter((line) => (line.parent_line_id ?? ROOT_PARENT) === (parentLineId ?? ROOT_PARENT));
  return Math.max(0, ...siblings.map((line) => line.sequence_no)) + 1;
}

function collectDescendants(lines: BomWorkbenchLine[], rootId: string) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const line of lines) {
      if (line.parent_line_id && ids.has(line.parent_line_id) && !ids.has(line.id)) {
        ids.add(line.id);
        changed = true;
      }
    }
  }
  return ids;
}

function isDescendant(lines: BomWorkbenchLine[], rootId: string, possibleDescendantId: string) {
  return collectDescendants(lines, rootId).has(possibleDescendantId);
}

function toPatchLine(line: BomWorkbenchLine) {
  return {
    id: line.id,
    parentLineId: line.parent_line_id,
    nodeType: line.node_type,
    partNumber: line.part_number,
    revision: line.revision,
    groupName: line.group_name,
    quantity: line.quantity,
    sequenceNo: line.sequence_no
  };
}

function buildCompareRows(before: BomWorkbenchDraftDetail | null, after: BomWorkbenchDraftDetail | null): CompareRow[] {
  if (!before || !after) return [];
  const beforeMap = new Map(before.lines.map((line) => [compareKey(line), line]));
  const afterMap = new Map(after.lines.map((line) => [compareKey(line), line]));
  const rows: CompareRow[] = [];
  for (const [key, line] of afterMap) {
    const previous = beforeMap.get(key);
    if (!previous) {
      rows.push({ key, label: compareLabel(line), change: "added", before: "-", after: lineSummary(line) });
      continue;
    }
    if ((previous.quantity ?? null) !== (line.quantity ?? null) || (previous.parent_line_id ?? null) !== (line.parent_line_id ?? null)) {
      rows.push({ key, label: compareLabel(line), change: "changed", before: lineSummary(previous), after: lineSummary(line) });
    }
  }
  for (const [key, line] of beforeMap) {
    if (!afterMap.has(key)) rows.push({ key, label: compareLabel(line), change: "removed", before: lineSummary(line), after: "-" });
  }
  return rows;
}

function compareKey(line: BomWorkbenchLine) {
  return line.node_type === "group" ? `group:${line.group_name}:${line.parent_line_id ?? ROOT_PARENT}` : `item:${line.part_number}:${line.revision ?? ""}`;
}

function compareLabel(line: BomWorkbenchLine) {
  return line.node_type === "group" ? line.group_name ?? "群組" : `${line.part_number ?? "-"} Rev ${line.revision ?? "-"}`;
}

function lineSummary(line: BomWorkbenchLine) {
  return line.node_type === "group" ? "Group" : `Qty ${line.quantity ?? 1}, Parent ${line.parent_line_id ?? "ROOT"}`;
}
