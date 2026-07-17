"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, RotateCcw, ShieldAlert, UploadCloud } from "lucide-react";
import { buildUploadPrefillHref } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
import { WorkflowStrip } from "@/components/workflow-strip";
import { formatDevelopmentPhaseForUser, formatStatusErrorForUser } from "@/lib/status-display";

type TaskStatus = "open" | "handled" | "cancelled" | "all";
type NotificationRead = "all" | "read" | "unread";
type NotificationHandled = "all" | "handled" | "unhandled";
type AttentionMarker = {
  code: "proxy_submission" | "delegated_review" | "override" | "impact_scope";
  label: string;
  detail: string | null;
  severity: "info" | "warning" | "critical";
};

type NumberingTask = {
  id: string;
  taskType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  riskLevel: "info" | "warning" | "critical";
  taskStatus: "open" | "handled" | "cancelled";
  assignedRole: string | null;
  projectCode: string | null;
  actionUrl: string | null;
  markers: AttentionMarker[];
  createdAt: string;
  handledAt: string | null;
};

type NumberingNotification = {
  id: string;
  notificationType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  recipientRole: string | null;
  readAt: string | null;
  handledAt: string | null;
  dismissible: boolean;
  actionUrl: string | null;
  markers: AttentionMarker[];
  createdAt: string;
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";
type NumberingDraftRecord = {
  entityType: "part_root" | "part_number" | "drawing_number";
  entityId: string;
  rootCode: string;
  coreName: string;
  displayCode: string;
  displayName: string;
  developmentPhase: string;
  recordStatus: string;
  partNumber: string | null;
  drawingNumber: string | null;
  primaryDrawingNumber: string | null;
};

export default function NumberingTaskCenterPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("open");
  const [notificationRead, setNotificationRead] = useState<NotificationRead>("all");
  const [notificationHandled, setNotificationHandled] = useState<NotificationHandled>("unhandled");
  const [tasks, setTasks] = useState<NumberingTask[]>([]);
  const [notifications, setNotifications] = useState<NumberingNotification[]>([]);
  const [drafts, setDrafts] = useState<NumberingDraftRecord[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const taskSummary = useMemo(
    () => ({
      total: tasks.length,
      critical: tasks.filter((task) => task.riskLevel === "critical").length,
      warning: tasks.filter((task) => task.riskLevel === "warning").length
    }),
    [tasks]
  );
  const notificationSummary = useMemo(
    () => ({
      total: notifications.length,
      unread: notifications.filter((notification) => !notification.readAt).length,
      locked: notifications.filter((notification) => !notification.dismissible && !notification.handledAt).length
    }),
    [notifications]
  );

  const loadData = useCallback(async () => {
    setState("loading");
    setError("");
    const [taskResponse, notificationResponse, draftResponse] = await Promise.all([
      fetch(`/api/numbering/tasks?status=${taskStatus}`),
      fetch(`/api/numbering/notifications?read=${notificationRead}&handled=${notificationHandled}`),
      fetch("/api/numbering/search?recordStatus=Draft&limit=30")
    ]);
    if (taskResponse.status === 401 || notificationResponse.status === 401 || draftResponse.status === 401) {
      setState("unauthorized");
      return;
    }
    const [taskBody, notificationBody, draftBody] = await Promise.all([
      taskResponse.json().catch(() => ({})),
      notificationResponse.json().catch(() => ({})),
      draftResponse.json().catch(() => ({}))
    ]);
    const draftReadable = draftResponse.ok || draftResponse.status === 403;
    if (!taskResponse.ok || !notificationResponse.ok || !draftReadable) {
      setError(formatStatusErrorForUser(taskBody.error ?? notificationBody.error ?? draftBody.error ?? "待辦、通知與草稿讀取失敗", "task"));
      setState("error");
      return;
    }
    setTasks(taskBody.tasks ?? []);
    setNotifications(notificationBody.notifications ?? []);
    setDrafts(draftResponse.ok ? draftBody.results ?? [] : []);
    setState("ready");
  }, [taskStatus, notificationRead, notificationHandled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function updateTask(taskId: string, status: "open" | "handled" | "cancelled") {
    setBusyId(taskId);
    const response = await fetch(`/api/numbering/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    setBusyId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "待辦狀態更新失敗");
      setState("error");
      return;
    }
    loadData();
  }

  async function updateNotification(notificationId: string, action: "read" | "handled") {
    setBusyId(notificationId);
    const response = await fetch(`/api/numbering/notifications/${notificationId}/${action}`, { method: "POST" });
    setBusyId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "通知狀態更新失敗");
      setState("error");
      return;
    }
    loadData();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖號待辦 <StatusScopeHelp scope="taskCenter" /></h1>
          <p>依風險排序的圖料號待辦與系統內通知。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <WorkflowStrip
        title="待辦處理"
        description="把通知轉成可執行項目，先處理高風險，再回到審核或影響分析頁面。"
        steps={["通知", "判斷", "處理", "驗收", "關閉"]}
        currentStep="處理"
        actions={[
          { href: "/numbering/approvals", label: "發行審核", variant: "primary" },
          { href: "/bom/reviews", label: "BOM 審核" },
          { href: "/numbering/impact", label: "製造圖影響" }
        ]}
      />

      {state === "unauthorized" ? <AccessPanel /> : null}
      {state === "error" ? <ErrorPanel message={error} onRetry={loadData} /> : null}
      {state === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入圖號待辦...</div>
        </section>
      ) : null}
      {state === "ready" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <DraftSubmissionList drafts={drafts} />

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>待辦中心</h2>
                <p style={mutedTextStyle}>
                  {taskSummary.total} 件，高風險 {taskSummary.critical}，注意 {taskSummary.warning}
                </p>
              </div>
              <div className="status-tabs">
                {(["open", "handled", "cancelled", "all"] as TaskStatus[]).map((status) => (
                  <button className={taskStatus === status ? "active" : undefined} key={status} type="button" onClick={() => setTaskStatus(status)}>
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
            </div>
            <TaskList tasks={tasks} busyId={busyId} onUpdate={updateTask} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>通知中心</h2>
                <p style={mutedTextStyle}>
                  {notificationSummary.total} 則，未讀 {notificationSummary.unread}，不可關閉 {notificationSummary.locked}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <select className="dropdown-select" value={notificationRead} onChange={(event) => setNotificationRead(event.target.value as NotificationRead)}>
                  <option value="all">全部已讀狀態</option>
                  <option value="unread">未讀</option>
                  <option value="read">已讀</option>
                </select>
                <select
                  className="dropdown-select"
                  value={notificationHandled}
                  onChange={(event) => setNotificationHandled(event.target.value as NotificationHandled)}
                >
                  <option value="all">全部處理狀態</option>
                  <option value="unhandled">未處理</option>
                  <option value="handled">已處理</option>
                </select>
              </div>
            </div>
            <NotificationList notifications={notifications} busyId={busyId} onUpdate={updateNotification} />
          </section>
        </div>
      ) : null}
    </>
  );
}

function TaskList({
  tasks,
  busyId,
  onUpdate
}: {
  tasks: NumberingTask[];
  busyId: string | null;
  onUpdate: (taskId: string, status: "open" | "handled" | "cancelled") => void;
}) {
  if (tasks.length === 0) {
    return (
      <NextStepState
        eyebrow="待辦"
        title="目前沒有待辦"
        body="待辦清空後可回到圖料模組追蹤物件，或檢查 BOM 與製造圖影響範圍是否還有未收斂項目。"
        actions={[
          { href: "/numbering/search", label: "圖料模組", variant: "primary" },
          { href: "/bom/reviews", label: "BOM 審核" },
          { href: "/numbering/impact", label: "製造圖影響" }
        ]}
      />
    );
  }

  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>風險</th>
            <th>待辦</th>
            <th>角色 / 專案</th>
            <th>建立時間</th>
            <th>
              <StatusColumnHeader context="task" />
            </th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <RiskBadge value={task.riskLevel} />
              </td>
              <td>
                <strong>{task.title}</strong>
                <p style={bodyTextStyle}>{task.message}</p>
                <MarkerList markers={task.markers ?? []} />
              </td>
              <td>
                {task.assignedRole ?? "指定人員"}
                <br />
                <span style={mutedTextStyle}>{task.projectCode ?? task.entityType}</span>
              </td>
              <td>{formatDateTime(task.createdAt)}</td>
              <td>
                <StatusBadge status={task.taskStatus} context="task" />
              </td>
              <td>
                <div style={actionGroupStyle}>
                  {task.actionUrl ? (
                    <Link className="secondary-button" href={task.actionUrl}>
                      <Eye size={16} />
                      查看
                    </Link>
                  ) : null}
                  {task.taskStatus === "open" ? (
                    <button className="secondary-button" type="button" disabled={busyId === task.id} onClick={() => onUpdate(task.id, "handled")}>
                      <CheckCircle2 size={16} />
                      完成
                    </button>
                  ) : (
                    <button className="secondary-button" type="button" disabled={busyId === task.id} onClick={() => onUpdate(task.id, "open")}>
                      <RotateCcw size={16} />
                      重開
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftSubmissionList({ drafts }: { drafts: NumberingDraftRecord[] }) {
  const uniqueDrafts = dedupeDrafts(drafts);
  if (uniqueDrafts.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>待送審主資料</h2>
          <p style={mutedTextStyle}>{uniqueDrafts.length} 組圖料已領號但尚未建立送審單。</p>
        </div>
        <span className="metadata-badge">未發布</span>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "820px" }}>
          <thead>
            <tr>
              <th>主根號</th>
              <th>圖料</th>
              <th>
                <StatusColumnHeader label="資料狀態 / 開發階段" context="masterRecord" />
              </th>
              <th>現在卡點</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {uniqueDrafts.map((draft) => {
              const drawingNumber = draft.drawingNumber ?? draft.primaryDrawingNumber;
              const uploadHref = buildUploadPrefillHref({
                rootCode: draft.rootCode,
                drawingNumber,
                partNumber: draft.partNumber,
                partName: draft.displayName || draft.coreName,
                developmentPhase: draft.developmentPhase
              });
              return (
                <tr key={draft.rootCode}>
                  <td>
                    <strong>{draft.rootCode}</strong>
                  </td>
                  <td>
                    <strong>{draft.displayName || draft.coreName || "-"}</strong>
                    <p style={bodyTextStyle}>
                      {draft.partNumber ?? "未帶入料號"} / {drawingNumber ?? "未帶入圖號"}
                    </p>
                  </td>
                  <td>
                    <StatusBadge status={draft.recordStatus} context="masterRecord" />
                    <br />
                    <span style={mutedTextStyle}>{formatDevelopmentPhaseForUser(draft.developmentPhase)}</span>
                  </td>
                  <td>已領號，尚未上傳設計資料送審。</td>
                  <td>
                    <div style={actionGroupStyle}>
                      <Link className="primary-button" href={uploadHref}>
                        <UploadCloud size={16} />
                        送審
                      </Link>
                      <Link className="secondary-button" href={`/numbering/search?query=${encodeURIComponent(draft.rootCode)}`}>
                        <Eye size={16} />
                        明細
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function dedupeDrafts(drafts: NumberingDraftRecord[]) {
  const byRoot = new Map<string, NumberingDraftRecord>();
  for (const draft of drafts) {
    const current = byRoot.get(draft.rootCode);
    if (!current) {
      byRoot.set(draft.rootCode, draft);
      continue;
    }
    const currentScore = (current.partNumber ? 1 : 0) + (current.drawingNumber ?? current.primaryDrawingNumber ? 1 : 0);
    const nextScore = (draft.partNumber ? 1 : 0) + (draft.drawingNumber ?? draft.primaryDrawingNumber ? 1 : 0);
    if (nextScore > currentScore) byRoot.set(draft.rootCode, draft);
  }
  return Array.from(byRoot.values());
}

function NotificationList({
  notifications,
  busyId,
  onUpdate
}: {
  notifications: NumberingNotification[];
  busyId: string | null;
  onUpdate: (notificationId: string, action: "read" | "handled") => void;
}) {
  if (notifications.length === 0) {
    return (
      <NextStepState
        eyebrow="通知"
        title="目前沒有通知"
        body="通知清空代表目前沒有系統阻塞；可切到全部通知狀態回顧歷史，或回首頁工作台看其他入口。"
        actions={[
          { href: "/", label: "回工作台", variant: "primary" },
          { href: "/numbering/reports", label: "查看報表" }
        ]}
      />
    );
  }

  return (
    <div className="table-wrap">
      <table style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>等級</th>
            <th>通知</th>
            <th>角色</th>
            <th>建立時間</th>
            <th>讀取 / 處理</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((notification) => (
            <tr key={notification.id}>
              <td>
                <RiskBadge value={notification.severity} />
              </td>
              <td>
                <strong>{notification.title}</strong>
                <p style={bodyTextStyle}>{notification.message}</p>
                <MarkerList markers={notification.markers ?? []} />
              </td>
              <td>{notification.recipientRole ?? "指定人員"}</td>
              <td>{formatDateTime(notification.createdAt)}</td>
              <td>
                {notification.readAt ? "已讀" : "未讀"} / {notification.handledAt ? "已處理" : "未處理"}
              </td>
              <td>
                <div style={actionGroupStyle}>
                  {!notification.readAt ? (
                    <button className="secondary-button" type="button" disabled={busyId === notification.id} onClick={() => onUpdate(notification.id, "read")}>
                      <Eye size={16} />
                      已讀
                    </button>
                  ) : null}
                  {!notification.handledAt ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busyId === notification.id || !notification.dismissible}
                      title={notification.dismissible ? "標示已處理" : "待處理或阻擋通知不可直接關閉"}
                      onClick={() => onUpdate(notification.id, "handled")}
                    >
                      <CheckCircle2 size={16} />
                      處理
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

function AccessPanel() {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>需要登入</h2>
        <p>請先登入後再查看圖號待辦。</p>
        <div className="empty-actions">
          <Link className="primary-button" href="/login">
            前往登入
          </Link>
        </div>
      </div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>讀取失敗</h2>
        <p>{message}</p>
        <div className="empty-actions">
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            重試
          </button>
        </div>
      </div>
    </section>
  );
}

function RiskBadge({ value }: { value: "info" | "warning" | "critical" }) {
  return <span className={`badge ${value === "critical" ? "Rejected" : value === "warning" ? "Pending" : ""}`}>{riskLabel(value)}</span>;
}

function MarkerList({ markers }: { markers: AttentionMarker[] }) {
  if (!markers.length) return null;
  return (
    <div style={markerListStyle}>
      {markers.map((marker) => (
        <span key={`${marker.code}-${marker.label}`} style={markerStyle(marker.severity)} title={marker.detail ?? marker.label}>
          {marker.label}
        </span>
      ))}
    </div>
  );
}

function riskLabel(value: "info" | "warning" | "critical") {
  if (value === "critical") return "高風險";
  if (value === "warning") return "注意";
  return "提醒";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    open: "待處理",
    handled: "已完成",
    cancelled: "已取消",
    all: "全部"
  };
  return labels[value] ?? value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
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
  gap: "0.4rem",
  flexWrap: "wrap"
} as const;

const markerListStyle = {
  display: "flex",
  gap: "0.35rem",
  flexWrap: "wrap",
  marginTop: "0.35rem"
} as const;

function markerStyle(severity: AttentionMarker["severity"]) {
  const palette =
    severity === "critical"
      ? { background: "#fee2e2", color: "#991b1b", border: "#fecaca" }
      : severity === "warning"
        ? { background: "#fef3c7", color: "#92400e", border: "#fde68a" }
        : { background: "#e0f2fe", color: "#075985", border: "#bae6fd" };
  return {
    display: "inline-flex",
    borderRadius: "999px",
    border: `1px solid ${palette.border}`,
    padding: "0.18rem 0.52rem",
    background: palette.background,
    color: palette.color,
    fontSize: "0.76rem",
    fontWeight: 800,
    cursor: "help"
  } as const;
}
