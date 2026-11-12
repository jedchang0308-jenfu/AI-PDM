import "server-only";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { previewMemberNumber } from "@/lib/numbering-member-allocation";
import { readV3OccupiedRootCodes } from "@/lib/repositories/numbering-async-repository";
import {
  NUMBERING_RULE_V3_ID,
  formatRootCodeForRule,
  isPurposeAllowedForRule,
  rootCodeToV3Ordinal,
} from "@/lib/numbering-identity";

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
  const occupied = await readV3OccupiedRootCodes(client, companyId);
  const sequence = lowestAvailable(occupied.map(code => rootCodeToV3Ordinal(code) ?? 0), 26 * 9999, "ROOT");
  return formatRootCodeForRule(sequence, ruleVersionId);
}

async function nextPartNumber(client: AsyncDatabaseClient, companyId: string, rootCode: string, ruleVersionId: string) {
  try {
    return (await previewMemberNumber(client, { companyId, rootCode, ruleVersionId, kind: "part" })).code;
  } catch (error) {
    if (error instanceof Error && error.message === "PART_SEQUENCE_EXHAUSTED") return null;
    throw error;
  }
}

async function nextDrawingNumber(client: AsyncDatabaseClient, companyId: string, rootCode: string, purposeCode: NumberPreviewPurposeCode, ruleVersionId: string) {
  if (!isPurposeAllowedForRule(purposeCode, ruleVersionId)) return null;
  try {
    return (await previewMemberNumber(client, { companyId, rootCode, ruleVersionId, kind: "drawing", purposeCode })).code;
  } catch (error) {
    if (error instanceof Error && error.message === "DRAWING_SEQUENCE_EXHAUSTED") return null;
    throw error;
  }
}

function lowestAvailable(used: Iterable<number>, maximum: number, label: string) {
  const values = new Set([...used].filter((value) => Number.isInteger(value) && value >= 1 && value <= maximum));
  for (let value = 1; value <= maximum; value += 1) if (!values.has(value)) return value;
  throw new Error(`${label}_SEQUENCE_EXHAUSTED`);
}
