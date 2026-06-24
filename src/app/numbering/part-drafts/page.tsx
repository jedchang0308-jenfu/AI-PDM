"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Recycle, RotateCcw, Send, XCircle } from "lucide-react";

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type DraftType = "new_part" | "replacement_part" | "drawing_revision_generated";
type ItemType = "self_made" | "purchased" | "standard";
type DraftStatus = "draft" | "pending_review" | "released" | "needs_reconfirmation" | "voided";

type PartNumberDraft = {
  id: string;
  reservedPartNumber: string;
  draftType: DraftType;
  itemType: ItemType;
  status: DraftStatus;
  sourcePartNumberId: string | null;
  sourceDrawingNumberId: string | null;
  sourcePartNumber: string | null;
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  creatorName: string | null;
  version: number;
  recycledAt: string | null;
  recycleAvailableAt: string | null;
  sameSourceUnfinishedDraftCount: number;
  controlled: boolean;
  controlBoundaryReasons: string[];
  warnings: string[];
  updatedAt: string;
};

const draftTypeOptions: { value: DraftType; label: string }[] = [
  { value: "new_part", label: "新料號" },
  { value: "replacement_part", label: "替代料號" },
  { value: "drawing_revision_generated", label: "圖面進版產生" }
];

const itemTypeOptions: { value: ItemType; label: string }[] = [
  { value: "self_made", label: "自製件" },
  { value: "purchased", label: "採購件" },
  { value: "standard", label: "標準件" }
];

const statusFilters = ["all", "draft", "pending_review", "needs_reconfirmation", "voided"] as const;

export default function PartNumberDraftsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("all");
  const [drafts, setDrafts] = useState<PartNumberDraft[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<DraftType>("new_part");
  const [itemType, setItemType] = useState<ItemType>("self_made");
  const [reservedPartNumber, setReservedPartNumber] = useState("");
  const [sourcePartNumberId, setSourcePartNumberId] = useState("");
  const [sourceDrawingNumberId, setSourceDrawingNumberId] = useState("");

  const summary = useMemo(
    () => ({
      total: drafts.length,
      needsReconfirmation: drafts.filter((draft) => draft.status === "needs_reconfirmation").length,
      sameSource: drafts.filter((draft) => draft.sameSourceUnfinishedDraftCount > 0).length,
      voided: drafts.filter((draft) => draft.status === "voided" && !draft.recycledAt).length
    }),
    [drafts]
  );

  const loadData = useCallback(async () => {
    setState("loading");
    setError("");
    const params = new URLSearchParams({ status, limit: "100" });
    const response = await fetch(`/api/numbering/part-number-drafts?${params.toString()}`);
    if (response.status === 401) {
      setState("unauthorized");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "料號草稿讀取失敗");
      setState("error");
      return;
    }
    setDrafts(body.drafts ?? []);
    setState("ready");
  }, [status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createDraft() {
    if (!reservedPartNumber.trim()) {
      setError("請輸入預留料號");
      setState("error");
      return;
    }
    setBusyId("create");
    const response = await fetch("/api/numbering/part-number-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reservedPartNumber,
        draftType,
        itemType,
        sourcePartNumberId: sourcePartNumberId.trim() || null,
        sourceDrawingNumberId: sourceDrawingNumberId.trim() || null
      })
    });
    setBusyId(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "料號草稿建立失敗");
      setState("error");
      return;
    }
    setReservedPartNumber("");
    setSourcePartNumberId("");
    setSourceDrawingNumberId("");
    loadData();
  }

  async function runAction(draftId: string, action: "submit-review" | "void" | "recycle" | "reconfirm") {
    setBusyId(`${draftId}:${action}`);
    const response = await fetch(`/api/numbering/part-number-drafts/${encodeURIComponent(draftId)}/${action}`, { method: "POST" });
    setBusyId(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? body.message ?? "料號草稿動作失敗");
      setState("error");
      return;
    }
    loadData();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>料號草稿</h1>
          <p>預留新料號、替代料號與圖面進版產生的料號草稿。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      {state === "unauthorized" ? <AccessPanel /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadData} /> : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>建立草稿</h2>
            <p style={mutedTextStyle}>三種入口共用同一份草稿資料，送審後進入受控邊界。</p>
          </div>
          <button className="primary-button" type="button" onClick={createDraft} disabled={busyId === "create"}>
            <Plus size={16} />
            建立
          </button>
        </div>
        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>草稿類型</span>
            <select className="dropdown-select" value={draftType} onChange={(event) => setDraftType(event.target.value as DraftType)}>
              {draftTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>料件類型</span>
            <select className="dropdown-select" value={itemType} onChange={(event) => setItemType(event.target.value as ItemType)}>
              {itemTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>預留料號</span>
            <input className="text-input" value={reservedPartNumber} onChange={(event) => setReservedPartNumber(event.target.value)} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>來源料號 ID</span>
            <input className="text-input" value={sourcePartNumberId} onChange={(event) => setSourcePartNumberId(event.target.value)} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>來源圖號 ID</span>
            <input className="text-input" value={sourceDrawingNumberId} onChange={(event) => setSourceDrawingNumberId(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>草稿清單</h2>
            <p style={mutedTextStyle}>
              {summary.total} 筆，需重新確認 {summary.needsReconfirmation}，同來源警示 {summary.sameSource}，待回收 {summary.voided}
            </p>
          </div>
          <div className="status-tabs">
            {statusFilters.map((value) => (
              <button className={status === value ? "active" : undefined} key={value} type="button" onClick={() => setStatus(value)}>
                {statusFilterLabel(value)}
              </button>
            ))}
          </div>
        </div>
        {state === "loading" ? <div className="empty">正在載入料號草稿...</div> : null}
        {state === "ready" && drafts.length === 0 ? <div className="empty">目前沒有料號草稿</div> : null}
        {state === "ready" && drafts.length > 0 ? <DraftTable drafts={drafts} busyId={busyId} onAction={runAction} /> : null}
      </section>
    </>
  );
}

function DraftTable({
  drafts,
  busyId,
  onAction
}: {
  drafts: PartNumberDraft[];
  busyId: string | null;
  onAction: (draftId: string, action: "submit-review" | "void" | "recycle" | "reconfirm") => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>預留料號</th>
            <th>類型</th>
            <th>狀態</th>
            <th>來源</th>
            <th>警示</th>
            <th>版控</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <tr key={draft.id}>
              <td>
                <strong>{draft.reservedPartNumber}</strong>
                <div style={mutedTextStyle}>v{draft.version} · {draft.creatorName ?? "未記錄"}</div>
              </td>
              <td>
                <Tag>{draftTypeLabel(draft.draftType)}</Tag>
                <Tag>{itemTypeLabel(draft.itemType)}</Tag>
              </td>
              <td>
                <StatusTag status={draft.status} />
              </td>
              <td>
                <div>{draft.sourcePartNumber ?? draft.sourcePartNumberId ?? "未指定來源料號"}</div>
                <div style={mutedTextStyle}>{draft.sourceDrawingNumber ?? draft.sourceDrawingNumberId ?? "未指定來源圖號"}</div>
              </td>
              <td>
                <WarningTags draft={draft} />
              </td>
              <td>
                {draft.controlled ? (
                  <Tag tone="danger">{draft.controlBoundaryReasons.join(", ")}</Tag>
                ) : draft.recycledAt ? (
                  <Tag tone="muted">已回收</Tag>
                ) : (
                  <Tag tone="success">可管制</Tag>
                )}
              </td>
              <td>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {draft.status === "draft" ? (
                    <>
                      <IconAction busy={busyId === `${draft.id}:submit-review`} label="送審" onClick={() => onAction(draft.id, "submit-review")}>
                        <Send size={15} />
                      </IconAction>
                      <IconAction busy={busyId === `${draft.id}:void`} label="作廢" onClick={() => onAction(draft.id, "void")}>
                        <XCircle size={15} />
                      </IconAction>
                    </>
                  ) : null}
                  {draft.status === "needs_reconfirmation" ? (
                    <IconAction busy={busyId === `${draft.id}:reconfirm`} label="重新確認" onClick={() => onAction(draft.id, "reconfirm")}>
                      <CheckCircle2 size={15} />
                    </IconAction>
                  ) : null}
                  {draft.status === "voided" && !draft.recycledAt ? (
                    <IconAction busy={busyId === `${draft.id}:recycle`} label="回收" onClick={() => onAction(draft.id, "recycle")}>
                      <Recycle size={15} />
                    </IconAction>
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

function WarningTags({ draft }: { draft: PartNumberDraft }) {
  const warnings = [];
  if (draft.sameSourceUnfinishedDraftCount > 0) warnings.push(`同來源 ${draft.sameSourceUnfinishedDraftCount}`);
  if (draft.status === "needs_reconfirmation") warnings.push("需重新確認");
  if (draft.warnings.includes("recycle_overdue")) warnings.push("逾期待回收");
  if (warnings.length === 0) return <span style={mutedTextStyle}>無</span>;
  return (
    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
      {warnings.map((warning) => (
        <Tag key={warning} tone="warning">
          <AlertTriangle size={13} />
          {warning}
        </Tag>
      ))}
    </div>
  );
}

function IconAction({ busy, label, children, onClick }: { busy: boolean; label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button className="icon-button" type="button" title={label} aria-label={label} onClick={onClick} disabled={busy}>
      {children}
    </button>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "muted" }) {
  const color = {
    neutral: "#334155",
    success: "#047857",
    warning: "#a16207",
    danger: "#b91c1c",
    muted: "#64748b"
  }[tone];
  return <span style={{ ...tagStyle, color, borderColor: `${color}44`, background: `${color}10` }}>{children}</span>;
}

function StatusTag({ status }: { status: DraftStatus }) {
  const tone = status === "needs_reconfirmation" ? "warning" : status === "voided" ? "muted" : status === "pending_review" ? "danger" : "success";
  return <Tag tone={tone}>{statusLabel(status)}</Tag>;
}

function AccessPanel() {
  return (
    <section className="panel">
      <div className="empty">
        <ClipboardList size={24} />
        <p>請先登入後再查看料號草稿。</p>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>讀取失敗</h2>
          <p style={mutedTextStyle}>{message}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RotateCcw size={16} />
          重試
        </button>
      </div>
    </section>
  );
}

function statusFilterLabel(value: (typeof statusFilters)[number]) {
  const labels: Record<(typeof statusFilters)[number], string> = {
    all: "全部",
    draft: "草稿",
    pending_review: "待審核",
    needs_reconfirmation: "需重新確認",
    voided: "作廢"
  };
  return labels[value];
}

function statusLabel(value: DraftStatus) {
  const labels: Record<DraftStatus, string> = {
    draft: "草稿",
    pending_review: "待審核",
    released: "已發行",
    needs_reconfirmation: "需重新確認",
    voided: "作廢"
  };
  return labels[value];
}

function draftTypeLabel(value: DraftType) {
  const labels: Record<DraftType, string> = {
    new_part: "新料號",
    replacement_part: "替代料號",
    drawing_revision_generated: "圖面進版"
  };
  return labels[value];
}

function itemTypeLabel(value: ItemType) {
  const labels: Record<ItemType, string> = {
    self_made: "自製件",
    purchased: "採購件",
    standard: "標準件"
  };
  return labels[value];
}

const mutedTextStyle: CSSProperties = { color: "#64748b", fontSize: "0.85rem" };
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = { color: "#475569", fontSize: "0.78rem", fontWeight: 700 };
const tagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.2rem",
  border: "1px solid",
  borderRadius: "999px",
  padding: "0.18rem 0.45rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  marginRight: "0.25rem",
  whiteSpace: "nowrap"
};
