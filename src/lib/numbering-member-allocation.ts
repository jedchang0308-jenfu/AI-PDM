import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  formatDrawingNumberForRule, formatDrawingSequenceForRule, formatPartNumberForRule, formatPartSequenceForRule,
  isCompactNumberingRule, parseNumberingIdentity, type DrawingPurposeCode
} from "@/lib/numbering-identity";
import { canonicalNumberingSequenceKey } from "@/lib/numbering-sequence-utils";

export type MemberNumberScope = { companyId: string; rootCode: string; ruleVersionId: string } &
  ({ kind: "part" } | { kind: "drawing"; purposeCode: DrawingPurposeCode });

type MemberNumberPool = { next: number; maximum: number; occupied: Set<number>; released: Set<number> };
type Occupancy = { code: string; master_id: string | null; sequence_no: number | null; occupied: number | boolean };
type Audit = { action: string; detail_json: string | Record<string, unknown>; created_at: string | Date };
type AuditMember = { code?: unknown; id?: unknown; kind?: unknown };

function sequenceKey(scope: MemberNumberScope) {
  const suffix = scope.kind + ":" + scope.rootCode + (scope.kind === "drawing" ? ":" + scope.purposeCode : "");
  return canonicalNumberingSequenceKey(scope.companyId, suffix);
}

function sequenceForCode(scope: MemberNumberScope, code: string): number | null {
  const identity = parseNumberingIdentity(code);
  if (identity.kind !== scope.kind || identity.rootCode !== scope.rootCode ||
    (scope.kind === "drawing" && identity.purposeCode !== scope.purposeCode)) return null;
  const sequence = Number(identity.sequenceCode);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
}

function formatMemberNumber(scope: MemberNumberScope, sequence: number) {
  return scope.kind === "part"
    ? formatPartNumberForRule(scope.rootCode, formatPartSequenceForRule(sequence, scope.ruleVersionId), scope.ruleVersionId)
    : formatDrawingNumberForRule(scope.rootCode, scope.purposeCode, formatDrawingSequenceForRule(sequence, scope.ruleVersionId), scope.ruleVersionId);
}

function codeIsExact(scope: MemberNumberScope, code: string, sequence: number, maximum: number) {
  return sequence <= maximum && formatMemberNumber(scope, sequence) === code;
}

function auditObject(input: Audit["detail_json"]): Record<string, unknown> {
  if (typeof input !== "string") return input ?? {};
  try {
    const value: unknown = JSON.parse(input);
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function readAuditNumbers(scope: MemberNumberScope, audits: readonly Audit[], maximum: number) {
  const released = new Map<number, { at: number; id: string }[]>();
  const issued = new Map<number, { at: number; id: unknown }[]>();
  let highest = 0;
  for (const audit of audits) {
    const detail = auditObject(audit.detail_json);
    if (detail.rootCode !== scope.rootCode || (detail.companyId !== undefined && detail.companyId !== scope.companyId)) continue;
    const at = new Date(audit.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    if (audit.action === "numbering.draft.delete" || audit.action === "numbering.draft.member.delete") {
      if (detail.companyId !== scope.companyId || detail.outcome !== "deleted") continue;
      const root = detail.root as AuditMember | null;
      const group = audit.action === "numbering.draft.delete" && detail.releasePolicy === "never-approved-draft-v1"
        && root?.code === scope.rootCode && typeof root.id === "string" && Boolean(root.id);
      const member = detail.member as AuditMember | null;
      const entries = group ? detail[scope.kind === "part" ? "parts" : "drawings"]
        : audit.action === "numbering.draft.member.delete" && member?.kind === scope.kind ? [member] : null;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as AuditMember[]) {
        if (typeof entry?.id !== "string" || !entry.id || typeof entry.code !== "string") continue;
        const sequence = sequenceForCode(scope, entry.code);
        if (sequence === null) continue;
        highest = Math.max(highest, sequence);
        if (!codeIsExact(scope, entry.code, sequence, maximum)) continue;
        const history = released.get(sequence) ?? [];
        history.push({ at, id: entry.id });
        released.set(sequence, history);
      }
      continue;
    }
    const code = detail[scope.kind === "part" ? "partNumber" : "drawingNumber"];
    const id = detail[scope.kind === "part" ? "partNumberId" : "drawingNumberId"];
    if (typeof code !== "string") continue;
    const sequence = sequenceForCode(scope, code);
    if (sequence === null) continue;
    highest = Math.max(highest, sequence);
    const history = issued.get(sequence) ?? [];
    history.push({ at, id });
    issued.set(sequence, history);
  }
  const available = new Set<number>();
  for (const [sequence, releases] of released) {
    if (releases.some(release => !(issued.get(sequence) ?? []).some(issue =>
      issue.at >= release.at && issue.id !== release.id))) available.add(sequence);
  }
  return { released: available, highest };
}

async function readMemberNumberPool(client: AsyncDatabaseClient, scope: MemberNumberScope, removingMasterIds: readonly string[] = []): Promise<MemberNumberPool> {
  const key = sequenceKey(scope);
  const params = { companyId: scope.companyId, rootCode: scope.rootCode, kind: scope.kind,
    currentPattern: scope.rootCode + "-%", legacyPattern: (scope.kind === "part" ? "P-" : "D-") + scope.rootCode + "-%",
    sequenceKey: key, candidateSequencePattern: key + ":%" };
  const masterSql = scope.kind === "part" ? `
    SELECT part_number AS code, id AS master_id, sequence_no, 1 AS occupied FROM part_numbers
    WHERE company_id = :companyId AND (part_number LIKE :currentPattern OR part_number LIKE :legacyPattern)
    UNION ALL SELECT reserved_part_number, NULL, NULL,
      CASE WHEN status IN ('draft', 'pending_review', 'released', 'needs_reconfirmation') THEN 1 ELSE 0 END
      FROM part_number_drafts WHERE company_id = :companyId AND
        (reserved_part_number LIKE :currentPattern OR reserved_part_number LIKE :legacyPattern)` : `
    SELECT drawing_number AS code, id AS master_id, sequence_no, 1 AS occupied FROM drawing_numbers
    WHERE company_id = :companyId AND (drawing_number LIKE :currentPattern OR drawing_number LIKE :legacyPattern)
    UNION ALL SELECT drawing_number, formal_drawing_number_id, NULL, CASE WHEN lifecycle_state <> 'cancelled' THEN 1 ELSE 0 END
      FROM drawings WHERE company_id = :companyId AND (drawing_number LIKE :currentPattern OR drawing_number LIKE :legacyPattern)`;
  const rows = await client.query<Occupancy>(masterSql + `
      UNION ALL SELECT candidate_code, NULL, NULL, 1 FROM number_candidate_reservations
      WHERE company_id = :companyId AND draft_item_type = :kind
        AND reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted', 'recycled')
        AND (candidate_code LIKE :currentPattern OR candidate_code LIKE :legacyPattern)
      UNION ALL SELECT number_value, NULL, NULL, CASE WHEN reservation_status = 'reserved' THEN 1 ELSE 0 END
      FROM numbering_recovery_reservations WHERE company_id = :companyId AND number_kind = :kind
        AND (number_value LIKE :currentPattern OR number_value LIKE :legacyPattern)`, params);
  const audits = await client.query<Audit>(`SELECT action, detail_json, created_at FROM audit_logs
      WHERE company_id = :companyId AND scope_kind = 'tenant'
        AND action IN ('numbering.create', 'numbering.part_number.create', 'numbering.drawing_number.create',
          'numbering.drawing_part.create', 'numbering.draft.delete', 'numbering.draft.member.delete')
        AND detail_json ->> 'rootCode' = :rootCode`, params);
  const counters = await client.query<{ next_value: number }>(`SELECT next_value FROM numbering_sequences WHERE company_id = :companyId
      AND (sequence_key = :sequenceKey OR sequence_key LIKE :candidateSequencePattern)`, params);
  const maximum = isCompactNumberingRule(scope.ruleVersionId) ? 99 : scope.kind === "part" ? 999 : 9;
  const history = readAuditNumbers(scope, audits, maximum);
  const occupied = new Set<number>();
  let next = Math.max(1, history.highest + 1, ...counters.map(row => Number(row.next_value)));
  const removed = new Set(removingMasterIds);
  for (const row of rows) {
    const sequence = sequenceForCode(scope, row.code);
    if (sequence === null) continue;
    const explicit = Number(row.sequence_no);
    const sequences = Number.isInteger(explicit) && explicit > 0 ? [sequence, explicit] : [sequence];
    for (const value of sequences) {
      next = Math.max(next, value + 1);
      if (row.occupied && (!row.master_id || !removed.has(row.master_id))) occupied.add(value);
    }
  }
  return { next, maximum, occupied, released: history.released };
}

function canReuse(pool: MemberNumberPool, sequence: number) {
  return sequence > 0 && sequence <= pool.maximum && !pool.occupied.has(sequence);
}

function chooseMemberNumber(scope: MemberNumberScope, pool: MemberNumberPool) {
  const released = [...pool.released].filter(sequence => canReuse(pool, sequence)).sort((a, b) => a - b);
  const sequenceNo = released[0] ?? pool.next;
  if (sequenceNo > pool.maximum) throw new Error(scope.kind.toUpperCase() + "_SEQUENCE_EXHAUSTED");
  return { sequenceNo, code: formatMemberNumber(scope, sequenceNo) };
}

export async function previewMemberNumber(client: AsyncDatabaseClient, scope: MemberNumberScope) {
  return chooseMemberNumber(scope, await readMemberNumberPool(client, scope));
}

export async function previewReleasedMemberNumbers(
  client: AsyncDatabaseClient, scope: MemberNumberScope, codes: readonly string[], masterIds: readonly string[]
): Promise<Array<{ code: string; kind: MemberNumberScope["kind"]; status: "reusable" | "not_reusable" | "unknown" }>> {
  const pool = await readMemberNumberPool(client, scope, masterIds);
  return codes.map(code => {
    const sequence = sequenceForCode(scope, code);
    // The proposed permanent delete would write the explicit release audit.
    const status = sequence === null || !codeIsExact(scope, code, sequence, pool.maximum)
      ? "unknown" : canReuse(pool, sequence) ? "reusable" : "not_reusable";
    return { code, kind: scope.kind, status };
  });
}

/** Call from the same transaction that inserts the official number or candidate reservation. */
export async function allocateMemberNumber(client: AsyncDatabaseClient, scope: MemberNumberScope, now: string) {
  const params = { companyId: scope.companyId, sequenceKey: sequenceKey(scope), now };
  await client.execute(`INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at)
    VALUES (:sequenceKey, :companyId, 1, :now) ON CONFLICT(sequence_key) DO NOTHING`, params);
  await client.queryOne(`SELECT next_value FROM numbering_sequences WHERE company_id = :companyId
    AND sequence_key = :sequenceKey` + (client.kind === "postgres" ? " FOR UPDATE" : ""), params);
  const pool = await readMemberNumberPool(client, scope);
  const result = chooseMemberNumber(scope, pool);
  await client.execute(`UPDATE numbering_sequences SET next_value = :next, updated_at = :now
    WHERE company_id = :companyId AND sequence_key = :sequenceKey`,
    { ...params, next: Math.max(pool.next, result.sequenceNo + 1) });
  return result;
}
