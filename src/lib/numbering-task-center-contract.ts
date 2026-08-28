export const TASK_CENTER_TASK_STATUSES = ["open", "handled", "cancelled", "all"] as const;
export type TaskCenterTaskStatus = (typeof TASK_CENTER_TASK_STATUSES)[number];

export const TASK_CENTER_NOTIFICATION_READ_FILTERS = ["all", "read", "unread"] as const;
export type TaskCenterNotificationReadFilter = (typeof TASK_CENTER_NOTIFICATION_READ_FILTERS)[number];

export const TASK_CENTER_NOTIFICATION_HANDLED_FILTERS = ["all", "handled", "unhandled"] as const;
export type TaskCenterNotificationHandledFilter = (typeof TASK_CENTER_NOTIFICATION_HANDLED_FILTERS)[number];

export type TaskCenterTask = {
  id: string;
  taskType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  riskLevel: "info" | "warning" | "critical";
  taskStatus: "open" | "handled" | "cancelled";
  assignedTo: string | null;
  assignedRole: string | null;
  projectCode: string | null;
  actionUrl: string | null;
  detail: Record<string, unknown>;
  markers: Array<{ code?: string; label?: string; severity?: string }>;
  createdAt: string;
  handledAt: string | null;
};

export type TaskCenterNotification = {
  id: string;
  notificationType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  readAt: string | null;
  handledAt: string | null;
  dismissible: boolean;
  actionUrl: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

const RISK_ORDER: Record<TaskCenterTask["riskLevel"], number> = { critical: 0, warning: 1, info: 2 };
const ACTION_PATH_ALLOWLIST = [
  "/numbering/search",
  "/numbering/drawings",
  "/parts",
  "/approvals",
  "/numbering/approvals",
  "/handoff",
  "/technical-transfer",
  "/submissions"
] as const;

function validTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function dueAt(task: TaskCenterTask) {
  return validTimestamp(task.detail?.dueAt);
}

function createdTime(value: string) {
  return validTimestamp(value) ?? 0;
}

export function isVirtualLifecycleTask(task: Pick<TaskCenterTask, "taskType">) {
  return task.taskType.startsWith("phase1h:");
}

export function compareTaskCenterTasks(left: TaskCenterTask, right: TaskCenterTask) {
  const riskDiff = RISK_ORDER[left.riskLevel] - RISK_ORDER[right.riskLevel];
  if (riskDiff !== 0) return riskDiff;
  const leftDue = dueAt(left);
  const rightDue = dueAt(right);
  if (leftDue === null && rightDue !== null) return 1;
  if (leftDue !== null && rightDue === null) return -1;
  if (leftDue !== null && rightDue !== null && leftDue !== rightDue) return leftDue - rightDue;
  const createdDiff = createdTime(right.createdAt) - createdTime(left.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return left.id.localeCompare(right.id);
}

export function sortTaskCenterTasks<T extends TaskCenterTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compareTaskCenterTasks);
}

export function compareTaskCenterNotifications(left: TaskCenterNotification, right: TaskCenterNotification) {
  const severityDiff = RISK_ORDER[left.severity] - RISK_ORDER[right.severity];
  if (severityDiff !== 0) return severityDiff;
  const createdDiff = createdTime(right.createdAt) - createdTime(left.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return left.id.localeCompare(right.id);
}

export function sortTaskCenterNotifications<T extends TaskCenterNotification>(notifications: readonly T[]): T[] {
  return [...notifications].sort(compareTaskCenterNotifications);
}

export type TaskActionResolution =
  | { allowed: true; href: string }
  | { allowed: false; reason: "missing" | "invalid_url" | "external_origin" | "path_not_allowed" };

export function resolveTaskActionUrl(actionUrl: string | null | undefined, origin?: string): TaskActionResolution {
  if (actionUrl !== undefined && actionUrl !== null && typeof actionUrl !== "string") return { allowed: false, reason: "invalid_url" };
  if (!actionUrl?.trim()) return { allowed: false, reason: "missing" };
  const raw = actionUrl.trim();
  if (/^(?:javascript|data|vbscript):/iu.test(raw) || raw.startsWith("//")) {
    return { allowed: false, reason: "invalid_url" };
  }
  try {
    const base = origin ?? (typeof window === "undefined" ? "http://localhost" : window.location.origin);
    const parsed = new URL(raw, base);
    if (parsed.origin !== new URL(base).origin) return { allowed: false, reason: "external_origin" };
    const path = parsed.pathname.replace(/\/+$/u, "") || "/";
    if (!ACTION_PATH_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return { allowed: false, reason: "path_not_allowed" };
    }
    return { allowed: true, href: `${path}${parsed.search}${parsed.hash}` };
  } catch {
    return { allowed: false, reason: "invalid_url" };
  }
}

export function formatTaskDueAt(task: TaskCenterTask) {
  const timestamp = dueAt(task);
  if (timestamp === null) return null;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
