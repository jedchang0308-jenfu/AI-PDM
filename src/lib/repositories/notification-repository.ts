import { getDb } from "@/lib/db";
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

function notificationScopeSql(user: NotificationUser, alias = "s") {
  return user.role === "Engineer" ? { sql: ` AND ${alias}.submitted_by = ?`, values: [user.id] } : { sql: "", values: [] };
}

function submissionLabel(row: Pick<NotificationRow, "drawing_number" | "revision" | "part_number">) {
  const drawing = row.drawing_number ? `${row.drawing_number} Rev ${row.revision ?? "-"}` : "未知圖號";
  return row.part_number ? `${drawing} / ${row.part_number}` : drawing;
}

export function summarizeNotifications(items: NotificationItem[]): NotificationSummary {
  return {
    total: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    warning: items.filter((item) => item.severity === "warning").length,
    info: items.filter((item) => item.severity === "info").length
  };
}

export function listNotifications(user: NotificationUser): NotificationItem[] {
  const database = getDb();
  const scope = notificationScopeSql(user);
  const items: NotificationItem[] = [];

  const releaseFailedRows = database
    .prepare(
      `
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
      WHERE s.status = 'ReleaseFailed'${scope.sql}
      ORDER BY s.updated_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of releaseFailedRows) {
    items.push({
      id: `release_failed:${row.submission_id}`,
      kind: "release_failed",
      severity: "critical",
      title: "Release 失敗需要處理",
      message: `${submissionLabel(row)} 發布失敗：${row.detail ?? "未記錄錯誤原因"}`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const pendingRows = database
    .prepare(
      `
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
      WHERE s.status = 'Pending'${scope.sql}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of pendingRows) {
    const remaining = Math.max(1, Number.parseInt(row.detail ?? "1", 10) || 1);
    const isReviewer = user.role === "R&D Manager" || user.role === "Admin";
    items.push({
      id: `${isReviewer ? "pending_review" : "awaiting_review"}:${row.submission_id}`,
      kind: isReviewer ? "pending_review" : "awaiting_review",
      severity: isReviewer ? "warning" : "info",
      title: isReviewer ? "待審核送審" : "送審等待審核",
      message: isReviewer
        ? `${submissionLabel(row)} 尚需 ${remaining} 位審核者核准。`
        : `${submissionLabel(row)} 已送出，正在等待主管審核。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const uploadFailedRows = database
    .prepare(
      `
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
      WHERE f.gdrive_status = 'failed'${scope.sql}
      ORDER BY f.created_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of uploadFailedRows) {
    items.push({
      id: `drive_upload_failed:${row.id}`,
      kind: "drive_upload_failed",
      severity: "warning",
      title: "Google Drive 上傳失敗",
      message: `${submissionLabel(row)} 的檔案 ${row.detail ?? ""} 需要重新上傳。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const missingPackageRows = database
    .prepare(
      `
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
        AND p.id IS NULL${scope.sql}
      ORDER BY s.updated_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of missingPackageRows) {
    items.push({
      id: `release_package_missing:${row.submission_id}`,
      kind: "release_package_missing",
      severity: "warning",
      title: "Released 缺少發布包",
      message: `${submissionLabel(row)} 已發布，但尚未找到 ZIP release package。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const lockScope = user.role === "Engineer" ? "AND EXISTS (SELECT 1 FROM submissions s WHERE s.item_id = l.item_id AND s.submitted_by = ?)" : "";
  const lockRows = database
    .prepare(
      `
      SELECT
        l.id,
        (
          SELECT s.id
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) AS submission_id,
        (
          SELECT s.drawing_number
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) AS drawing_number,
        (
          SELECT s.revision
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
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
        AND datetime(l.expires_at) > datetime('now')
        ${lockScope}
      ORDER BY l.created_at DESC
      LIMIT 20
    `
    )
    .all(...(user.role === "Engineer" ? [user.id] : [])) as NotificationRow[];

  for (const row of lockRows) {
    items.push({
      id: `active_lock:${row.id}`,
      kind: "active_lock",
      severity: row.submitted_by === user.id ? "info" : "warning",
      title: row.submitted_by === user.id ? "你正在預約編輯" : "料號被預約編輯",
      message: `${row.part_number ?? "未知料號"} 目前由 ${row.submitted_by_name ?? "未知使用者"} 預約：${row.detail ?? "Edit reservation"}`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  return items
    .sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.created_at.localeCompare(a.created_at);
    });
}
