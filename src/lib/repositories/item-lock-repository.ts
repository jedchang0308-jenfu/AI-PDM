import crypto from "node:crypto";
import { createAuditLog, getDb } from "@/lib/db";
import type { ItemLock } from "@/lib/types";

type SubmissionItemRow = {
  id: string;
  item_id: string;
};

function getSubmissionItem(submissionId: string) {
  return getDb().prepare("SELECT id, item_id FROM submissions WHERE id = ?").get(submissionId) as SubmissionItemRow | undefined;
}

export function getActiveItemLock(itemId: string) {
  expireItemLocks();
  const row = getDb()
    .prepare(
      `
      SELECT
        l.*,
        i.part_number,
        i.part_name,
        u.display_name AS locked_by_name
      FROM item_locks l
      JOIN items i ON i.id = l.item_id
      JOIN users u ON u.id = l.locked_by
      WHERE l.item_id = ?
        AND l.released_at IS NULL
        AND datetime(l.expires_at) > datetime('now')
      ORDER BY l.created_at DESC
      LIMIT 1
    `
    )
    .get(itemId) as ItemLock | undefined;
  return row ?? null;
}

export function findActiveItemLockForSubmissionIdentifiers(input: { drawingNumber?: string; partNumber?: string }) {
  expireItemLocks();
  const drawingNumber = String(input.drawingNumber ?? "").trim();
  const partNumber = String(input.partNumber ?? "").trim();
  if (!drawingNumber && !partNumber) return null;

  const filters = [];
  const values: string[] = [];
  if (partNumber) {
    filters.push("upper(i.part_number) = upper(?)");
    values.push(partNumber);
  }
  if (drawingNumber) {
    filters.push(
      `EXISTS (
        SELECT 1
        FROM submissions s_match
        WHERE s_match.item_id = i.id
          AND upper(s_match.drawing_number) = upper(?)
      )`
    );
    values.push(drawingNumber);
  }

  const row = getDb()
    .prepare(
      `
      SELECT
        l.*,
        i.part_number,
        i.part_name,
        u.display_name AS locked_by_name,
        (
          SELECT s.drawing_number
          FROM submissions s
          WHERE s.item_id = i.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) AS drawing_number
      FROM item_locks l
      JOIN items i ON i.id = l.item_id
      JOIN users u ON u.id = l.locked_by
      WHERE l.released_at IS NULL
        AND datetime(l.expires_at) > datetime('now')
        AND (${filters.join(" OR ")})
      ORDER BY l.created_at DESC
      LIMIT 1
    `
    )
    .get(...values) as (ItemLock & { drawing_number: string | null }) | undefined;

  return row ?? null;
}

export function expireItemLocks() {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE item_locks
      SET released_at = ?, updated_at = ?
      WHERE released_at IS NULL
        AND datetime(expires_at) <= datetime('now')
    `
    )
    .run(now, now);
}

export function createItemLock(input: { submissionId: string; userId: string; reason: string; hours?: number }) {
  const submission = getSubmissionItem(input.submissionId);
  if (!submission) return { ok: false as const, status: 404, error: "找不到送審資料" };

  expireItemLocks();
  const existing = getActiveItemLock(submission.item_id);
  if (existing) {
    if (existing.locked_by === input.userId) {
      return { ok: true as const, lock: existing, reused: true };
    }
    return { ok: false as const, status: 409, error: "ITEM_LOCKED", lock: existing };
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (input.hours ?? 8) * 60 * 60 * 1000).toISOString();
  const lockId = crypto.randomUUID();
  getDb()
    .prepare(
      `
      INSERT INTO item_locks (id, item_id, locked_by, lock_reason, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(lockId, submission.item_id, input.userId, input.reason.trim() || "Edit reservation", expiresAt, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.userId,
    action: "CheckoutLockCreated",
    detail: { itemId: submission.item_id, reason: input.reason, expiresAt }
  });

  return { ok: true as const, lock: getActiveItemLock(submission.item_id), reused: false };
}

export function releaseItemLock(input: { submissionId: string; userId: string; force?: boolean }) {
  const submission = getSubmissionItem(input.submissionId);
  if (!submission) return { ok: false as const, status: 404, error: "找不到送審資料" };

  const existing = getActiveItemLock(submission.item_id);
  if (!existing) return { ok: true as const, released: false };
  if (existing.locked_by !== input.userId && !input.force) {
    return { ok: false as const, status: 403, error: "只有預約者或系統管理員可以解除此預約", lock: existing };
  }

  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE item_locks SET released_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, existing.id);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.userId,
    action: "CheckoutLockReleased",
    detail: { itemId: submission.item_id, lockId: existing.id, forced: Boolean(input.force) }
  });

  return { ok: true as const, released: true };
}
