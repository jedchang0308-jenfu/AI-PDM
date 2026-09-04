#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";
import { parsePdmCompanyRequest } from "../src/lib/company-context.ts";
import { CURRENT_TENANT_AUDIT_ACTIONS } from "../src/lib/audit-scope.ts";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

await runCase(cases, "QA-116-001", "company code parsing is explicit and fail closed", () => {
  assert.deepEqual(parsePdmCompanyRequest(null), { state: "absent" });
  assert.deepEqual(parsePdmCompanyRequest("SMOKE"), { state: "valid", companyCode: "SMOKE" });
  assert.deepEqual(parsePdmCompanyRequest(""), { state: "invalid" });
  assert.deepEqual(parsePdmCompanyRequest("UNKNOWN"), { state: "invalid" });
  const companySource = read("src/lib/company-context.ts");
  assert.doesNotMatch(companySource, /defaultPdmCompany|access\.length\s*>\s*0\s*\?[^;]+company-jenfu/su);
  assert.match(companySource, /pdm_company_membership_required/u);
  return { explicitCodes: ["JENFU", "MAXIMA", "SMOKE"], fallbackRemoved: true };
});

await runCase(cases, "QA-116-002", "current create audit has one typed tenant authority", () => {
  const repository = read("src/lib/repositories/numbering-async-repository.ts");
  const scopeSource = read("src/lib/audit-scope.ts");
  const actions = [...repository.matchAll(/action:\s*"([^"]+)"/gu)].map((match) => match[1]);
  const uniqueActions = [...new Set(actions)].sort();
  assert.deepEqual([...CURRENT_TENANT_AUDIT_ACTIONS], [
    "numbering.create",
    "numbering.drawing_number.create",
    "numbering.part_number.create",
    "numbering.drawing_part.create"
  ]);
  assert.match(repository, /action:\s*"numbering\.create",\s*companyId,/u);
  assert.match(repository, /scope_kind = 'tenant'[\s\S]*company_id = :companyId/u);
  assert.match(scopeSource, /legacy_unscoped/u);
  return {
    currentTenantActions: [...CURRENT_TENANT_AUDIT_ACTIONS],
    inventoriedWriterActions: uniqueActions,
    technicalDebtRef: "TD-116-01"
  };
});

await runCase(cases, "QA-116-003", "sequence reads writes and locks bind company plus canonical key", () => {
  const repository = read("src/lib/repositories/numbering-async-repository.ts");
  const sequenceUtils = read("src/lib/numbering-sequence-utils.ts");
  assert.match(repository, /WHERE sequence_key = :sequenceKey\s+AND company_id = :companyId/u);
  assert.match(repository, /FOR UPDATE/u);
  assert.match(repository, /canonicalNumberingSequenceKey/u);
  assert.match(repository, /assertCanonicalNumberingSequenceKey/u);
  assert.match(sequenceUtils, /NUMBERING_SEQUENCE_SCOPE_MISMATCH/u);
  assert.doesNotMatch(repository, /UPDATE numbering_sequences[\s\S]{0,180}WHERE sequence_key = :sequenceKey`/u);
  return { keyAuthority: "companyId:domain:suffix", sqlCompanyPredicate: true };
});

const { manifest, target } = writeProducerManifest({ runId, producer: "contract", cases });
console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length }));
if (manifest.status !== "PASS") process.exitCode = 1;
