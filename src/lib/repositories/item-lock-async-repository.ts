import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import type { ItemLock } from "@/lib/types";

export const EXPIRE_ASYNC_ITEM_LOCKS_SQL = `
  UPDATE item_locks
  SET released_at = :now,
      updated_at = :now
  WHERE released_at IS NULL
    AND expires_at <= :now
`;

export const SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_IDENTIFIERS_SQL = `
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
    AND l.expires_at > :now
    AND (:companyId IS NULL OR i.company_id = :companyId)
    AND (
      (:partNumber <> '' AND upper(i.part_number) = upper(:partNumber))
      OR (:drawingNumber <> '' AND EXISTS (
        SELECT 1
        FROM submissions s_match
        WHERE s_match.item_id = i.id
          AND (:companyId IS NULL OR s_match.company_id = :companyId)
          AND upper(s_match.drawing_number) = upper(:drawingNumber)
      ))
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_SUBMISSION_ITEM_FOR_LOCK_SQL = `
  SELECT id, item_id
  FROM submissions
  WHERE id = :submissionId
`;

export const SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_ITEM_ID_SQL = `
  SELECT
    l.*,
    i.part_number,
    i.part_name,
    u.display_name AS locked_by_name
  FROM item_locks l
  JOIN items i ON i.id = l.item_id
  JOIN users u ON u.id = l.locked_by
  WHERE l.item_id = :itemId
    AND l.released_at IS NULL
    AND l.expires_at > :now
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1
`;

export const INSERT_ASYNC_ITEM_LOCK_SQL = `
  INSERT INTO item_locks (id, item_id, locked_by, lock_reason, expires_at, created_at, updated_at)
  VALUES (:id, :itemId, :lockedBy, :lockReason, :expiresAt, :now, :now)
`;

export const RELEASE_ASYNC_ITEM_LOCK_SQL = `
  UPDATE item_locks
  SET released_at = :now,
      updated_at = :now
  WHERE id = :id
`;

type SubmissionItemRow = {
  id: string;
  item_id: string;
};

export type AsyncCreateItemLockResult =
  | { ok: true; lock: ItemLock | null; reused: boolean }
  | { ok: false; status: 404 | 409; error: string; lock?: ItemLock | null };

export type AsyncReleaseItemLockResult =
  | { ok: true; released: boolean }
  | { ok: false; status: 403 | 404; error: string; lock?: ItemLock | null };

export class AsyncItemLockRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async expireItemLocks(): Promise<void> {
    await this.client.execute(EXPIRE_ASYNC_ITEM_LOCKS_SQL, { now: this.clock() });
  }

  async findActiveItemLockForSubmissionIdentifiers(input: {
    companyId?: string;
    drawingNumber?: string;
    partNumber?: string;
  }): Promise<(ItemLock & { drawing_number: string | null }) | null> {
    const drawingNumber = String(input.drawingNumber ?? "").trim();
    const partNumber = String(input.partNumber ?? "").trim();
    if (!drawingNumber && !partNumber) return null;

    await this.expireItemLocks();
    const row = await this.client.queryOne<ItemLock & { drawing_number: string | null }>(
      SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_IDENTIFIERS_SQL,
      {
        drawingNumber,
        companyId: input.companyId ?? null,
        partNumber,
        now: this.clock()
      }
    );

    return row ?? null;
  }

  async getActiveItemLock(itemId: string): Promise<ItemLock | null> {
    await this.expireItemLocks();
    return this.client.queryOne<ItemLock>(SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_ITEM_ID_SQL, {
      itemId,
      now: this.clock()
    });
  }

  async createItemLock(input: {
    submissionId: string;
    userId: string;
    reason: string;
    hours?: number;
  }): Promise<AsyncCreateItemLockResult> {
    const submission = await this.getSubmissionItem(input.submissionId);
    if (!submission) return { ok: false, status: 404, error: "?曆??圈祟鞈?" };

    await this.expireItemLocks();
    const existing = await this.getActiveItemLock(submission.item_id);
    if (existing) {
      if (existing.locked_by === input.userId) {
        return { ok: true, lock: existing, reused: true };
      }
      return { ok: false, status: 409, error: "ITEM_LOCKED", lock: existing };
    }

    const now = this.clock();
    const hours = Number.isFinite(input.hours) ? (input.hours ?? 8) : 8;
    const expiresAt = new Date(new Date(now).getTime() + hours * 60 * 60 * 1000).toISOString();
    const lockReason = input.reason.trim() || "Edit reservation";
    await this.client.execute(INSERT_ASYNC_ITEM_LOCK_SQL, {
      id: this.idFactory(),
      itemId: submission.item_id,
      lockedBy: input.userId,
      lockReason,
      expiresAt,
      now
    });

    await this.audit("CheckoutLockCreated", input.submissionId, input.userId, {
      itemId: submission.item_id,
      reason: input.reason,
      expiresAt
    });

    return { ok: true, lock: await this.getActiveItemLock(submission.item_id), reused: false };
  }

  async releaseItemLock(input: {
    submissionId: string;
    userId: string;
    force?: boolean;
  }): Promise<AsyncReleaseItemLockResult> {
    const submission = await this.getSubmissionItem(input.submissionId);
    if (!submission) return { ok: false, status: 404, error: "?曆??圈祟鞈?" };

    const existing = await this.getActiveItemLock(submission.item_id);
    if (!existing) return { ok: true, released: false };
    if (existing.locked_by !== input.userId && !input.force) {
      return {
        ok: false,
        status: 403,
        error: "?芣?????蝟餌絞蝞∠??∪隞亥圾?斗迨??",
        lock: existing
      };
    }

    const now = this.clock();
    await this.client.execute(RELEASE_ASYNC_ITEM_LOCK_SQL, {
      id: existing.id,
      now
    });

    await this.audit("CheckoutLockReleased", input.submissionId, input.userId, {
      itemId: submission.item_id,
      lockId: existing.id,
      forced: Boolean(input.force)
    });

    return { ok: true, released: true };
  }

  private async getSubmissionItem(submissionId: string): Promise<SubmissionItemRow | null> {
    return this.client.queryOne<SubmissionItemRow>(SELECT_ASYNC_SUBMISSION_ITEM_FOR_LOCK_SQL, { submissionId });
  }

  private async audit(action: string, submissionId: string, actorId: string, detail: Record<string, unknown>) {
    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId,
      actorId,
      action,
      detail
    });
  }
}
