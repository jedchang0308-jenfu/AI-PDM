import "server-only";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  NUMBERING_RULE_V3_ID,
  formatDrawingNumberForRule,
  formatDrawingSequenceForRule,
  formatPartNumberForRule,
  formatPartSequenceForRule,
  formatRootCodeForRule,
  rootCodeToV3Ordinal,
} from "@/lib/numbering-identity";

type NumberKind = "root" | "part" | "drawing";
export type NumberPreviewPurposeCode = "M" | "R";

export async function previewNewBundleNumbersAsync(client: AsyncDatabaseClient, companyId: string, purposeCode: NumberPreviewPurposeCode) {
  const ruleVersionId = NUMBERING_RULE_V3_ID;
  const rootCode = await nextRootCode(client, companyId, ruleVersionId);
  return {
    mode: "new_bundle" as const,
    reserved: false,
    root: rootCode,
    part: await nextPartNumber(client, companyId, rootCode, ruleVersionId),
    drawing: await nextDrawingNumber(client, companyId, rootCode, purposeCode, ruleVersionId),
    purposeCode,
  };
}

export async function previewAppendNumbersAsync(client: AsyncDatabaseClient, companyId: string, rootCode: string, purposeCode: NumberPreviewPurposeCode) {
  const row = await client.queryOne<{ root_code: string; rule_version_id: string }>(
    "SELECT root_code, rule_version_id FROM part_roots WHERE company_id = :companyId AND root_code = :rootCode LIMIT 1",
    { companyId, rootCode },
  );
  if (!row) return { mode: "append" as const, reserved: false, root: rootCode, part: null, drawing: null, purposeCode, missingRoot: true };
  return {
    mode: "append" as const,
    reserved: false,
    root: row.root_code,
    part: await nextPartNumber(client, companyId, row.root_code, row.rule_version_id),
    drawing: await nextDrawingNumber(client, companyId, row.root_code, purposeCode, row.rule_version_id),
    purposeCode,
  };
}

async function nextRootCode(client: AsyncDatabaseClient, companyId: string, ruleVersionId: string) {
  const official = await client.query<{ code: string }>("SELECT root_code AS code FROM part_roots WHERE company_id = :companyId", { companyId });
  const projections = await client.query<{ code: string }>(
    "SELECT drawing_number AS code FROM drawings WHERE company_id = :companyId AND drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled'",
    { companyId },
  );
  const recovery = await recoveryCodes(client, companyId, "root");
  const projectionRoots = projections.flatMap((row) => {
    const match = /^(?:D-)?([A-Z][0-9]{4})-(?:M|R)[0-9]{1,2}$/u.exec(String(row.code ?? "").trim().toUpperCase());
    return match ? [match[1]] : [];
  });
  const sequence = lowestAvailable([...official, ...projectionRoots.map((code) => ({ code })), ...recovery].map((row) => rootCodeToV3Ordinal(row.code) ?? 0), 26 * 9999, "ROOT");
  return formatRootCodeForRule(sequence, ruleVersionId);
}

async function nextPartNumber(client: AsyncDatabaseClient, companyId: string, rootCode: string, ruleVersionId: string) {
  const official = await client.query<{ code: string }>("SELECT part_number AS code FROM part_numbers WHERE company_id = :companyId", { companyId });
  const recovery = await recoveryCodes(client, companyId, "part");
  const sequence = lowestAvailable([...official, ...recovery].map((row) => sequenceFromPartCode(row.code, rootCode) ?? 0), 99, "PART");
  return formatPartNumberForRule(rootCode, formatPartSequenceForRule(sequence, ruleVersionId), ruleVersionId);
}

async function nextDrawingNumber(client: AsyncDatabaseClient, companyId: string, rootCode: string, purposeCode: NumberPreviewPurposeCode, ruleVersionId: string) {
  const official = await client.query<{ code: string }>("SELECT drawing_number AS code FROM drawing_numbers WHERE company_id = :companyId", { companyId });
  const projections = await client.query<{ code: string }>(
    "SELECT drawing_number AS code FROM drawings WHERE company_id = :companyId AND drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled'",
    { companyId },
  );
  const recovery = await recoveryCodes(client, companyId, "drawing");
  const sequence = lowestAvailable([...official, ...projections, ...recovery].map((row) => sequenceFromDrawingCode(row.code, rootCode, purposeCode) ?? 0), 99, "DRAWING");
  return formatDrawingNumberForRule(rootCode, purposeCode, formatDrawingSequenceForRule(sequence, ruleVersionId), ruleVersionId);
}

async function recoveryCodes(client: AsyncDatabaseClient, companyId: string, itemType: NumberKind) {
  return client.query<{ code: string }>(
    "SELECT number_value AS code FROM numbering_recovery_reservations WHERE company_id = :companyId AND number_kind = :itemType AND reservation_status = 'reserved'",
    { companyId, itemType },
  );
}

function lowestAvailable(used: Iterable<number>, maximum: number, label: string) {
  const values = new Set([...used].filter((value) => Number.isInteger(value) && value >= 1 && value <= maximum));
  for (let value = 1; value <= maximum; value += 1) if (!values.has(value)) return value;
  throw new Error(`${label}_SEQUENCE_EXHAUSTED`);
}

function sequenceFromPartCode(code: string, rootCode: string) {
  const compact = new RegExp(`^${escapeRegExp(rootCode)}-P([0-9]{2})$`, "u").exec(code);
  if (compact) return Number.parseInt(compact[1], 10);
  const legacy = new RegExp(`^P-${escapeRegExp(rootCode)}-([0-9]{3})$`, "u").exec(code);
  return legacy ? Number.parseInt(legacy[1], 10) : null;
}

function sequenceFromDrawingCode(code: string, rootCode: string, purposeCode: NumberPreviewPurposeCode) {
  const compact = new RegExp(`^${escapeRegExp(rootCode)}-${purposeCode}([0-9]{2})$`, "u").exec(code);
  if (compact) return Number.parseInt(compact[1], 10);
  const legacy = new RegExp(`^D-${escapeRegExp(rootCode)}-${purposeCode}([0-9])$`, "u").exec(code);
  return legacy ? Number.parseInt(legacy[1], 10) : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
