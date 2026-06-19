import type { NotificationItem, NotificationSummary, SubmissionStatus, SubmissionSummary } from "@/lib/types";

export type TaskSummaryRole = "Engineer" | "R&D Manager" | "Admin" | "QA/QC" | "PM" | "Manufacturing" | "Procurement" | "Supplier";
export type TaskSummarySource = "numbering_task" | "notification" | "bom_review" | "handoff_readiness" | "storage_evidence" | "submission";
export type TaskSummarySignal = "overdue" | "blocked" | "risk" | "review" | "handoff" | "system_exception" | "draft" | "none";
export type TaskSummarySeverity = "critical" | "warning" | "info" | "success";

export type TaskSummary = {
  id: string;
  title: string;
  detail: string;
  source: TaskSummarySource;
  signal: TaskSummarySignal;
  severity: TaskSummarySeverity;
  roleAffinity: TaskSummaryRole[];
  href: string;
  primaryActionLabel: string;
  evidence: string;
  score: number;
  updatedAt: string | null;
};

export type AdaptiveTaskFeedInput = {
  role: TaskSummaryRole;
  submissions: SubmissionSummary[];
  notificationSummary: NotificationSummary;
  notifications: NotificationItem[];
  numberingDraftCount: number;
  storageEvidence?: {
    available: boolean;
    severity: "normal" | "warning" | "critical" | "unknown";
    blockerCount: number;
    warningCount: number;
    migrationReady: boolean;
  } | null;
  now?: Date;
  limit?: number;
};

const severityScore: Record<TaskSummarySeverity, number> = {
  critical: 400,
  warning: 240,
  info: 120,
  success: 20
};

const signalScore: Record<TaskSummarySignal, number> = {
  system_exception: 180,
  blocked: 160,
  overdue: 150,
  risk: 130,
  review: 110,
  handoff: 90,
  draft: 70,
  none: 0
};

export const ROLE_TASK_WEIGHTS: Record<TaskSummaryRole, Partial<Record<TaskSummarySignal, number>>> = {
  Engineer: { draft: 120, blocked: 100, risk: 80, handoff: 50 },
  "R&D Manager": { review: 130, blocked: 110, system_exception: 90, risk: 80 },
  Admin: { system_exception: 140, blocked: 120, risk: 90, review: 80 },
  "QA/QC": { risk: 130, blocked: 120, review: 70 },
  PM: { blocked: 130, overdue: 120, handoff: 90, review: 80 },
  Manufacturing: { handoff: 130, blocked: 80, risk: 70 },
  Procurement: { review: 110, blocked: 90, risk: 80 },
  Supplier: { handoff: 90, blocked: 80 }
};

function scoreTask(task: Omit<TaskSummary, "score">, role: TaskSummaryRole, now: Date) {
  const roleScore = task.roleAffinity.includes(role) ? 120 : 0;
  const configuredRoleScore = ROLE_TASK_WEIGHTS[role]?.[task.signal] ?? 0;
  const updatedAt = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN;
  const ageHours = Number.isFinite(updatedAt) ? Math.max(0, (now.getTime() - updatedAt) / 36e5) : 0;
  const ageScore = Math.min(48, Math.floor(ageHours / 6));
  return severityScore[task.severity] + signalScore[task.signal] + roleScore + configuredRoleScore + ageScore;
}

function task(input: Omit<TaskSummary, "score">, role: TaskSummaryRole, now: Date): TaskSummary {
  return {
    ...input,
    score: scoreTask(input, role, now)
  };
}

function latestActivityAt(submission: SubmissionSummary) {
  return submission.released_at ?? submission.updated_at ?? submission.created_at ?? null;
}

function hasMissingHandoff(submission: SubmissionSummary) {
  const fileRoles = new Set((submission.file_roles ?? "").split(",").filter(Boolean));
  return submission.status === "Released" && (!submission.has_release_package || !fileRoles.has("pdf") || !fileRoles.has("dwg"));
}

function statusCount(submissions: SubmissionSummary[], status: SubmissionStatus) {
  return submissions.filter((submission) => submission.status === status).length;
}

export function buildAdaptiveTaskFeed(input: AdaptiveTaskFeedInput): TaskSummary[] {
  const now = input.now ?? new Date();
  const tasks: TaskSummary[] = [];
  const releaseFailed = input.submissions.filter((submission) => submission.status === "ReleaseFailed");
  const pendingCount = statusCount(input.submissions, "Pending");
  const handoffGaps = input.submissions.filter(hasMissingHandoff);

  if (input.notificationSummary.critical > 0) {
    tasks.push(
      task(
        {
          id: "notification-critical",
          title: "高風險通知待處理",
          detail: `${input.notificationSummary.critical} critical / ${input.notificationSummary.warning} warning`,
          source: "notification",
          signal: "system_exception",
          severity: "critical",
          roleAffinity: ["R&D Manager", "Admin", "PM", "QA/QC"],
          href: "/numbering/tasks",
          primaryActionLabel: "查看通知",
          evidence: "notification summary",
          updatedAt: input.notifications[0]?.created_at ?? null
        },
        input.role,
        now
      )
    );
  }

  if (releaseFailed.length > 0) {
    const latest = releaseFailed[0];
    tasks.push(
      task(
        {
          id: "release-failed",
          title: "發行失敗需排除",
          detail: `${releaseFailed.length} 件 ReleaseFailed，最新 ${latest.drawing_number} Rev ${latest.revision}`,
          source: "submission",
          signal: "blocked",
          severity: "critical",
          roleAffinity: ["R&D Manager", "Admin", "QA/QC", "PM"],
          href: `/`,
          primaryActionLabel: "查看送審",
          evidence: latest.id,
          updatedAt: latestActivityAt(latest)
        },
        input.role,
        now
      )
    );
  }

  if ((input.role === "R&D Manager" || input.role === "Admin") && pendingCount > 0) {
    tasks.push(
      task(
        {
          id: "pending-review",
          title: "送審待主管判定",
          detail: `${pendingCount} 件 Pending submission`,
          source: "submission",
          signal: "review",
          severity: "warning",
          roleAffinity: ["R&D Manager", "Admin"],
          href: "/?status=Pending",
          primaryActionLabel: "進入審核",
          evidence: "submissions.status.Pending",
          updatedAt: input.submissions.find((submission) => submission.status === "Pending")?.updated_at ?? null
        },
        input.role,
        now
      )
    );
  }

  if ((input.role === "Engineer" || input.role === "Admin") && input.numberingDraftCount > 0) {
    tasks.push(
      task(
        {
          id: "numbering-drafts",
          title: "草稿圖料待送審",
          detail: `${input.numberingDraftCount} 件 Draft / NeedInfo`,
          source: "numbering_task",
          signal: "draft",
          severity: "warning",
          roleAffinity: ["Engineer", "PM"],
          href: "/numbering/tasks",
          primaryActionLabel: "補齊送審",
          evidence: "numbering drafts",
          updatedAt: null
        },
        input.role,
        now
      )
    );
  }

  if (handoffGaps.length > 0) {
    tasks.push(
      task(
        {
          id: "handoff-gaps",
          title: "製造交接資料缺口",
          detail: `${handoffGaps.length} 件 Released 缺 PDF、DWG 或發行包`,
          source: "handoff_readiness",
          signal: "handoff",
          severity: "warning",
          roleAffinity: ["Manufacturing", "R&D Manager", "Admin", "PM"],
          href: "/handoff",
          primaryActionLabel: "檢查交接",
          evidence: handoffGaps[0]?.id ?? "handoff readiness",
          updatedAt: latestActivityAt(handoffGaps[0])
        },
        input.role,
        now
      )
    );
  }

  if (input.storageEvidence?.available && input.storageEvidence.severity !== "normal") {
    tasks.push(
      task(
        {
          id: "storage-evidence",
          title: "儲存治理需檢視",
          detail: `${input.storageEvidence.blockerCount} blockers / ${input.storageEvidence.warningCount} warnings`,
          source: "storage_evidence",
          signal: input.storageEvidence.severity === "critical" ? "blocked" : "risk",
          severity: input.storageEvidence.severity === "critical" ? "critical" : "warning",
          roleAffinity: ["Admin", "R&D Manager", "PM"],
          href: "/",
          primaryActionLabel: "查看治理",
          evidence: input.storageEvidence.migrationReady ? "storage evidence ready" : "storage evidence blockers",
          updatedAt: null
        },
        input.role,
        now
      )
    );
  }

  if (tasks.length === 0) {
    tasks.push(
      task(
        {
          id: "no-blocking-task",
          title: "目前沒有高優先阻塞",
          detail: "保留既有工作台入口，依角色執行下一個日常流程。",
          source: "submission",
          signal: "none",
          severity: "success",
          roleAffinity: [input.role],
          href: input.role === "Engineer" ? "/upload" : "/numbering/tasks",
          primaryActionLabel: input.role === "Engineer" ? "建立送審" : "查看待辦",
          evidence: "empty adaptive feed fallback",
          updatedAt: null
        },
        input.role,
        now
      )
    );
  }

  return tasks.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, input.limit ?? 5);
}
