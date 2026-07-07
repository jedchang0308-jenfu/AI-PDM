"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, PauseCircle, RotateCcw, Send, ShieldAlert, XCircle } from "lucide-react";
import { LifecycleStageGuidance } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge as SharedStatusBadge, StatusColumnHeader } from "@/components/status-help-popover";
import { isManufacturingDrawingPurpose } from "@/lib/numbering-identity";
import { formatStatusErrorForUser } from "@/lib/status-display";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type CandidateStatus = "ready" | "needs_override" | "blocked";
type DecisionAction = "submit_dvt" | "keep_evt" | "disable_evt" | "obsolete";
type ItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
type RecordStatus = "Draft" | "NeedInfo" | "Active" | "PendingReview" | "Released" | "Rejected" | "Obsolete" | "Merged" | "EVTDisabled" | "PendingAdminConfirm" | "MainDrawingInvalid";

type DvtCandidate = {
  root: {
    rootCode: string;
    coreName: string;
    itemKind: ItemKind;
    developmentPhase: string;
    recordStatus: RecordStatus;
  };
  partNumber: {
    id: string;
    partNumber: string;
    partName: string;
    itemKind: ItemKind;
    developmentPhase: string;
    recordStatus: RecordStatus;
  };
  drawingNumbers: Array<{
    drawingNumber: string;
    purposeCode: "MA" | "OT" | "M" | "R";
    isPrimaryManufacturing: boolean;
    recordStatus: RecordStatus;
  }>;
  status: CandidateStatus;
  recommendedAction: DecisionAction;
  missingItems: string[];
};

type DvtResponse = {
  summary: {
    total: number;
    ready: number;
    needsOverride: number;
    blocked: number;
  };
  candidates: DvtCandidate[];
};

type SubmitResult = {
  approvalBatch: null | {
    batchCode: string;
    batchStatus: string;
    items: Array<{ approvalRequestId: string }>;
  };
  decisions: Array<{
    partNumber: string;
    action: DecisionAction;
    status: string;
    message: string;
  }>;
};

const actionOptions: Array<{ value: DecisionAction; label: string }> = [
  { value: "submit_dvt", label: "送審 DVT 階段" },
  { value: "keep_evt", label: "保留 EVT" },
  { value: "disable_evt", label: "EVT 停用" },
  { value: "obsolete", label: "作廢" }
];

export default function NumberingDvtPromotionPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [candidates, setCandidates] = useState<DvtCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowActions, setRowActions] = useState<Record<string, DecisionAction>>({});
  const [rowReasons, setRowReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  const summary = useMemo(
    () => ({
      total: candidates.length,
      ready: candidates.filter((candidate) => candidate.status === "ready").length,
      needsOverride: candidates.filter((candidate) => candidate.status === "needs_override").length,
      blocked: candidates.filter((candidate) => candidate.status === "blocked").length,
      selected: selected.size
    }),
    [candidates, selected]
  );

  const loadCandidates = useCallback(async () => {
    setState("loading");
    setError("");
    const response = await fetch("/api/numbering/dvt-candidates?limit=100");
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    if (response.status === 403) {
      setState("forbidden");
      return;
    }
    const body = (await response.json().catch(() => ({}))) as Partial<DvtResponse> & { error?: string };
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "階段晉升清單讀取失敗", "dvtReadiness"));
      setState("error");
      return;
    }
    const nextCandidates = body.candidates ?? [];
    setCandidates(nextCandidates);
    setSelected(new Set(nextCandidates.filter((candidate) => candidate.status === "ready").map((candidate) => candidate.partNumber.partNumber)));
    setRowActions(Object.fromEntries(nextCandidates.map((candidate) => [candidate.partNumber.partNumber, candidate.recommendedAction])));
    setState("ready");
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  async function submitDecisions(decisions: Array<{ partNumber: string; action: DecisionAction; reason?: string }>, busyKey: string) {
    setBusy(busyKey);
    setError("");
    const response = await fetch("/api/numbering/dvt-candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decisions, projectCode: "DVT" })
    });
    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(formatStatusErrorForUser(body.error ?? "階段晉升處理失敗", "dvtReadiness"));
      setState("error");
      return;
    }
    setResult(body as SubmitResult);
    await loadCandidates();
  }

  function toggleSelection(partNumber: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(partNumber)) next.delete(partNumber);
      else next.add(partNumber);
      return next;
    });
  }

  const selectedReadyPartNumbers = candidates.filter((candidate) => selected.has(candidate.partNumber.partNumber) && candidate.status === "ready");

  return (
    <>
      <div className="topbar">
        <div>
          <h1>階段晉升：EVT → DVT</h1>
          <p>EVT 料號分流、批次送審與停用作廢處理。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadCandidates}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <LifecycleStageGuidance
        activeStage="gate"
        metrics={[
          { label: "可送審", value: summary.ready, tone: summary.ready > 0 ? "success" : "neutral" },
          { label: "需例外", value: summary.needsOverride, tone: summary.needsOverride > 0 ? "warning" : "neutral" },
          { label: "阻擋", value: summary.blocked, tone: summary.blocked > 0 ? "critical" : "neutral" },
          { label: "已選取", value: summary.selected }
        ]}
      />

      {state === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看階段晉升清單。" /> : null}
      {state === "forbidden" ? <AccessPanel title="權限不足" message="階段晉升需 RD、主管或管理員權限。" /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadCandidates} /> : null}

      <div style={{ display: "grid", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>晉升概況</h2>
              <p style={mutedTextStyle}>完整資料可批次送審，缺資料項目保留在 EVT 待補。</p>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={selectedReadyPartNumbers.length === 0 || busy === "batch"}
              onClick={() =>
                submitDecisions(
                  selectedReadyPartNumbers.map((candidate) => ({
                    partNumber: candidate.partNumber.partNumber,
                    action: "submit_dvt",
                    reason: "DVT 階段批次送審"
                  })),
                  "batch"
                )
              }
            >
              <Send size={16} />
              批次送審 DVT 階段
            </button>
          </div>
          <div className="metrics" style={{ marginBottom: 0 }}>
            <Metric label="候選" value={summary.total} />
            <Metric label="可送審" value={summary.ready} />
            <Metric label="待補/Override" value={summary.needsOverride} />
            <Metric label="阻擋" value={summary.blocked} />
            <Metric label="已勾選" value={summary.selected} />
          </div>
        </section>

        {result ? <ResultPanel result={result} /> : null}

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>EVT 候選清單</h2>
              <p style={mutedTextStyle}>依 DVT gate 結果分類。</p>
            </div>
            <ClipboardList size={20} color="#475569" />
          </div>
          {state === "loading" ? <div className="empty">正在載入 DVT 候選...</div> : null}
          {state === "ready" ? (
            candidates.length === 0 ? (
              <NextStepState
                compact
                eyebrow="不用處理"
                title="目前沒有 EVT 候選料號"
                body="DVT 清單沒有待分流項目。若要讓料號進 DVT，請先回圖料模組補齊 EVT 主資料、主要製造圖與審核狀態。"
                actions={[
                  { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
                  { href: "/numbering/tasks", label: "查看待辦" }
                ]}
              />
            ) : (
              <div className="table-wrap">
                <table style={{ minWidth: "1120px" }}>
                  <thead>
                    <tr>
                      <th>送審</th>
                      <th>料號</th>
                      <th>主根 / 品名</th>
                      <th>類型</th>
                      <th>製造圖</th>
                      <th>
                        <StatusColumnHeader label="DVT 檢查" context="dvtReadiness" />
                      </th>
                      <th>缺漏</th>
                      <th>分流</th>
                      <th>原因</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => {
                      const partNumber = candidate.partNumber.partNumber;
                      const action = rowActions[partNumber] ?? candidate.recommendedAction;
                      const reason = rowReasons[partNumber] ?? "";
                      const canSubmit = candidate.status === "ready";
                      return (
                        <tr key={candidate.partNumber.id}>
                          <td>
                            <input
                              aria-label={`${partNumber} 送審`}
                              type="checkbox"
                              checked={selected.has(partNumber)}
                              disabled={!canSubmit}
                              onChange={() => toggleSelection(partNumber)}
                            />
                          </td>
                          <td>
                            <strong>{partNumber}</strong>
                            <p style={mutedTextStyle}>{candidate.root.rootCode}</p>
                          </td>
                          <td>
                            {candidate.root.coreName}
                            <p style={bodyTextStyle}>{candidate.partNumber.partName}</p>
                          </td>
                          <td>{kindLabel(candidate.partNumber.itemKind)}</td>
                          <td>{primaryMaLabel(candidate)}</td>
                          <td>
                            <CandidateStatusBadge value={candidate.status} />
                            <p style={mutedTextStyle}>
                              <SharedStatusBadge status={candidate.partNumber.recordStatus} context="masterRecord" />
                            </p>
                          </td>
                          <td>
                            {candidate.missingItems.length === 0 ? (
                              <span style={mutedTextStyle}>-</span>
                            ) : (
                              <div style={{ display: "grid", gap: "0.25rem" }}>
                                <strong style={warningTextStyle}>需補：{candidate.missingItems.join("、")}</strong>
                                <span style={mutedTextStyle}>{missingItemsNextStep(candidate.missingItems)}</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <select
                              className="dropdown-select"
                              value={action}
                              onChange={(event) => setRowActions((current) => ({ ...current, [partNumber]: event.target.value as DecisionAction }))}
                            >
                              {actionOptions.map((item) => (
                                <option value={item.value} key={item.value} disabled={item.value === "submit_dvt" && !canSubmit}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`${partNumber} 原因`}
                              value={reason}
                              onChange={(event) => setRowReasons((current) => ({ ...current, [partNumber]: event.target.value }))}
                              placeholder="批次或分流原因"
                              style={{ minWidth: "180px" }}
                            />
                          </td>
                          <td>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={busy === partNumber || (action === "submit_dvt" && !canSubmit)}
                              onClick={() => submitDecisions([{ partNumber, action, reason }], partNumber)}
                            >
                              {actionIcon(action)}
                              套用
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>
      </div>
    </>
  );
}

function ResultPanel({ result }: { result: SubmitResult }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>處理結果</h2>
          <p style={mutedTextStyle}>
            {result.approvalBatch ? `${result.approvalBatch.batchCode}，${result.approvalBatch.items.length} 件送審` : "本次未建立送審批次"}
          </p>
        </div>
        <CheckCircle2 size={20} color="#15803d" />
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {result.decisions.map((decision) => (
          <div style={resultRowStyle} key={`${decision.partNumber}-${decision.action}`}>
            <strong>{decision.partNumber}</strong>
            <SharedStatusBadge status={decision.status} context="workflow" />
            <span>{decision.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CandidateStatusBadge({ value }: { value: CandidateStatus }) {
  return <SharedStatusBadge status={value} context="dvtReadiness" />;
}

function kindLabel(value: ItemKind) {
  const labels: Record<ItemKind, string> = {
    purchased: "外購",
    manufactured: "自製",
    outsourced: "發包",
    shared: "共用件",
    custom: "客製尺寸"
  };
  return labels[value] ?? value;
}

function primaryMaLabel(candidate: DvtCandidate) {
  const primary = candidate.drawingNumbers.find((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode) && drawing.isPrimaryManufacturing);
  if (primary) return primary.drawingNumber;
  const manufacturingCount = candidate.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode)).length;
  return manufacturingCount > 0 ? `${manufacturingCount} 張製造圖，未指定主要圖` : "無製造圖";
}

function missingItemsNextStep(items: string[]) {
  if (items.some((item) => item.includes("MA") || item.includes("製造圖"))) return "現在請回圖號模組指定主要製造圖，再回來送 DVT。";
  if (items.some((item) => item.includes("料號") || item.includes("主資料"))) return "現在請回料號或圖料模組補齊主資料。";
  return "現在請補齊缺漏項目；補完後重新整理 DVT 候選清單。";
}

function actionIcon(action: DecisionAction) {
  if (action === "submit_dvt") return <Send size={16} />;
  if (action === "disable_evt") return <PauseCircle size={16} />;
  if (action === "obsolete") return <XCircle size={16} />;
  return <ShieldAlert size={16} />;
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={24} />
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>DVT 處理暫時無法完成</h2>
          <p style={bodyTextStyle}>{message} 現在請重試；若仍失敗，請回圖料模組補齊候選資料或請主管 / Admin 協助。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RotateCcw size={16} />
          重試
        </button>
      </div>
    </section>
  );
}

const mutedTextStyle = { color: "#64748b", fontSize: "0.82rem", margin: "0.2rem 0 0" };
const bodyTextStyle = { color: "#475569", fontSize: "0.88rem", margin: "0.2rem 0 0" };
const warningTextStyle = { color: "#b45309", fontSize: "0.82rem" };
const resultRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(130px, 1fr) minmax(80px, 120px) minmax(220px, 2fr)",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.7rem 0.8rem",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  background: "#f8fafc"
};
