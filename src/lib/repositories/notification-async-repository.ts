import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { NotificationItem, NotificationSummary } from "@/lib/types";

type NotificationUser = {
  id: string;
  role: string;
};

type NotificationRow = {
  id: string;
  submission_id: string | null;
  drawing_number: string | null;
  revision: string | null;
  part_number: string | null;
  part_name: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  detail: string | null;
  created_at: string;
};

type NotificationQueryParams = {
  userId: string;
  scopeEngineer: number;
  now: string;
  limit: number;
};

export const SELECT_ASYNC_RELEASE_FAILED_NOTIFICATIONS_SQL = `
  SELECT
    s.id,
    s.id AS submission_id,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    s.submitted_by,
    u.display_name AS submitted_by_name,
    s.release_error AS detail,
    s.updated_at AS created_at
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  WHERE s.status = 'ReleaseFailed'
    AND s.resolved_by_submission_id IS NULL
    AND (:scopeEngineer = 0 OR s.submitted_by = :userId)
  ORDER BY s.updated_at DESC, s.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_PENDING_REVIEW_NOTIFICATIONS_SQL = `
  SELECT
    s.id,
    s.id AS submission_id,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    s.submitted_by,
    u.display_name AS submitted_by_name,
    CAST((s.approval_required - COUNT(a.id)) AS TEXT) AS detail,
    s.created_at
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN approval_steps a ON a.submission_id = s.id AND a.decision = 'Approved'
  WHERE s.status = 'Pending'
    AND (:scopeEngineer = 0 OR s.submitted_by = :userId)
  GROUP BY
    s.id,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    s.submitted_by,
    u.display_name,
    s.approval_required,
    s.created_at
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_UPLOAD_FAILED_NOTIFICATIONS_SQL = `
  SELECT
    f.id,
    s.id AS submission_id,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    s.submitted_by,
    u.display_name AS submitted_by_name,
    f.original_filename AS detail,
    f.created_at
  FROM submission_files f
  JOIN submissions s ON s.id = f.submission_id
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  WHERE f.gdrive_status = 'failed'
    AND (:scopeEngineer = 0 OR s.submitted_by = :userId)
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_MISSING_RELEASE_PACKAGE_NOTIFICATIONS_SQL = `
  SELECT
    s.id,
    s.id AS submission_id,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    s.submitted_by,
    u.display_name AS submitted_by_name,
    NULL AS detail,
    s.updated_at AS created_at
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN release_packages p ON p.submission_id = s.id
  WHERE s.status = 'Released'
    AND p.id IS NULL
    AND (:scopeEngineer = 0 OR s.submitted_by = :userId)
  ORDER BY s.updated_at DESC, s.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_ACTIVE_LOCK_NOTIFICATIONS_SQL = `
  SELECT
    l.id,
    (
      SELECT s.id
      FROM submissions s
      WHERE s.item_id = l.item_id
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT 1
    ) AS submission_id,
    (
      SELECT s.drawing_number
      FROM submissions s
      WHERE s.item_id = l.item_id
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT 1
    ) AS drawing_number,
    (
      SELECT s.revision
      FROM submissions s
      WHERE s.item_id = l.item_id
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT 1
    ) AS revision,
    i.part_number,
    i.part_name,
    l.locked_by AS submitted_by,
    u.display_name AS submitted_by_name,
    l.lock_reason AS detail,
    l.created_at
  FROM item_locks l
  JOIN items i ON i.id = l.item_id
  JOIN users u ON u.id = l.locked_by
  WHERE l.released_at IS NULL
    AND l.expires_at > :now
    AND (
      :scopeEngineer = 0
      OR EXISTS (
        SELECT 1
        FROM submissions s
        WHERE s.item_id = l.item_id
          AND s.submitted_by = :userId
      )
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT :limit
`;

const severityOrder = { critical: 0, warning: 1, info: 2 } as const;

export class AsyncNotificationRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  async listNotifications(user: NotificationUser): Promise<NotificationItem[]> {
    const params = this.paramsFor(user);
    const items: NotificationItem[] = [];

    for (const row of await this.client.query<NotificationRow>(SELECT_ASYNC_RELEASE_FAILED_NOTIFICATIONS_SQL, params)) {
      items.push({
        id: `release_failed:${row.submission_id}`,
        kind: "release_failed",
        severity: "critical",
        title: "發行未完成",
        message: `${submissionLabel(row)} 發行未完成：${row.detail ?? "需要主管或 Admin 處理。"}`,
        ...notificationTarget(row)
      });
    }

    for (const row of await this.client.query<NotificationRow>(SELECT_ASYNC_PENDING_REVIEW_NOTIFICATIONS_SQL, params)) {
      const remaining = Math.max(1, Number.parseInt(row.detail ?? "1", 10) || 1);
      const isReviewer = user.role === "R&D Manager" || user.role === "Admin";
      items.push({
        id: `${isReviewer ? "pending_review" : "awaiting_review"}:${row.submission_id}`,
        kind: isReviewer ? "pending_review" : "awaiting_review",
        severity: isReviewer ? "warning" : "info",
        title: isReviewer ? "Pending review" : "Awaiting review",
        message: isReviewer
          ? `${submissionLabel(row)} needs ${remaining} approval step${remaining === 1 ? "" : "s"}.`
          : `${submissionLabel(row)} is waiting for reviewer approval.`,
        ...notificationTarget(row)
      });
    }

    for (const row of await this.client.query<NotificationRow>(SELECT_ASYNC_UPLOAD_FAILED_NOTIFICATIONS_SQL, params)) {
      items.push({
        id: `drive_upload_failed:${row.id}`,
        kind: "drive_upload_failed",
        severity: "warning",
        title: "Google Drive upload failed",
        message: `${submissionLabel(row)} file ${row.detail ?? ""} needs upload retry.`,
        ...notificationTarget(row)
      });
    }

    for (const row of await this.client.query<NotificationRow>(SELECT_ASYNC_MISSING_RELEASE_PACKAGE_NOTIFICATIONS_SQL, params)) {
      items.push({
        id: `release_package_missing:${row.submission_id}`,
        kind: "release_package_missing",
        severity: "warning",
        title: "Release package missing",
        message: `${submissionLabel(row)} is Released but has no ZIP release package.`,
        ...notificationTarget(row)
      });
    }

    for (const row of await this.client.query<NotificationRow>(SELECT_ASYNC_ACTIVE_LOCK_NOTIFICATIONS_SQL, params)) {
      items.push({
        id: `active_lock:${row.id}`,
        kind: "active_lock",
        severity: row.submitted_by === user.id ? "info" : "warning",
        title: row.submitted_by === user.id ? "Your active edit lock" : "Active edit lock",
        message: `${row.part_number ?? "Unknown part"} is locked by ${row.submitted_by_name ?? "unknown user"}: ${row.detail ?? "Edit reservation"}`,
        ...notificationTarget(row)
      });
    }

    return items.sort((left, right) => {
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return right.created_at.localeCompare(left.created_at);
    });
  }

  private paramsFor(user: NotificationUser): NotificationQueryParams {
    return {
      userId: user.id,
      scopeEngineer: user.role === "Engineer" ? 1 : 0,
      now: this.clock(),
      limit: 20
    };
  }
}

export function summarizeNotifications(items: NotificationItem[]): NotificationSummary {
  return {
    total: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    warning: items.filter((item) => item.severity === "warning").length,
    info: items.filter((item) => item.severity === "info").length
  };
}

function submissionLabel(row: Pick<NotificationRow, "drawing_number" | "revision" | "part_number">) {
  const drawing = row.drawing_number ? `${row.drawing_number} 版次 ${row.revision ?? "-"}` : "未知圖號";
  return row.part_number ? `${drawing} / ${row.part_number}` : drawing;
}

function notificationTarget(row: NotificationRow) {
  return {
    submission_id: row.submission_id,
    drawing_number: row.drawing_number,
    revision: row.revision,
    part_number: row.part_number,
    part_name: row.part_name,
    created_at: row.created_at,
    action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
  };
}
