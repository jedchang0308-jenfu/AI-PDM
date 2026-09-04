#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev116-isolation-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
process.env.PDM_DATA_DIR = dataDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_AUTH_MODE = "production";

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-116 isolated company/session/membership/mapping authority integration evidence",
  port: "none",
  owningProcessTree: `foreground Node ${process.pid}`,
  cleanupCondition: "SQLite handle closes and exact task root is removed",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: taskRoot
} }));

const { getDb } = await import("../src/lib/db.ts");
const {
  getUserCompanyAuthorityAsync,
  parsePdmCompanyRequest,
  resolvePdmCompanyContextAsync
} = await import("../src/lib/company-context.ts");
const { isValidSmokeCommandAuthority } = await import("../src/lib/platform-command-context.ts");
const { AsyncUserRepository } = await import("../src/lib/repositories/user-async-repository.ts");
const { getAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");

const database = getDb();
const now = new Date().toISOString();
database.prepare(
  "INSERT INTO companies (id, company_code, company_kind, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("company-smoke", "SMOKE", "production_smoke", "Production 驗證租戶", now, now);
const insertUser = database.prepare(
  "INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
insertUser.run("actor-smoke", "Smoke Engineer", "smoke@example.invalid", "Engineer", "company-smoke", now, now);
insertUser.run("actor-jenfu", "Jenfu Engineer", "jenfu@example.invalid", "Engineer", "company-jenfu", now, now);
insertUser.run("actor-no-membership", "No Membership", "none@example.invalid", "Engineer", "company-jenfu", now, now);
database.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, ?, 1)").run("actor-smoke", "company-smoke");
database.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, ?, 1)").run("actor-jenfu", "company-jenfu");
database.prepare(
  "INSERT INTO platform_principal_mappings (platform_principal_id, pdm_user_id, mapping_status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)"
).run("principal-smoke", "actor-smoke", now, now);
database.prepare(
  "INSERT INTO platform_organization_mappings (platform_organization_id, pdm_company_id, mapping_status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)"
).run("organization-smoke", "company-smoke", now, now);

const userRepository = new AsyncUserRepository(getAsyncDatabaseClient());
const smokeUser = await userRepository.getUserById("actor-smoke");
const jenfuUser = await userRepository.getUserById("actor-jenfu");
const noMembershipUser = await userRepository.getUserById("actor-no-membership");
assert.ok(smokeUser && jenfuUser && noMembershipUser);

function mutationFingerprint() {
  return {
    roots: database.prepare("SELECT COUNT(*) count FROM part_roots").get().count,
    audits: database.prepare("SELECT COUNT(*) count FROM audit_logs").get().count,
    receipts: database.prepare("SELECT COUNT(*) count FROM platform_command_receipts").get().count,
    sequences: database.prepare("SELECT COUNT(*) count FROM numbering_sequences").get().count
  };
}

await runCase(cases, "QA-116-008", "smoke actor resolves one exact company and active mappings", async () => {
  const result = await resolvePdmCompanyContextAsync(smokeUser, parsePdmCompanyRequest("SMOKE"));
  assert.equal(result.response, null);
  assert.deepEqual(result.company, {
    companyId: "company-smoke",
    companyCode: "SMOKE",
    companyKind: "production_smoke",
    displayName: "Production 驗證租戶"
  });
  const authority = await getUserCompanyAuthorityAsync(smokeUser.id, "company-smoke");
  assert.equal(isValidSmokeCommandAuthority(smokeUser, authority), true);
  return {
    userCompany: smokeUser.company_id,
    membershipCount: authority.membershipCount,
    principalMapping: authority.principalMappingStatus,
    organizationMapping: authority.organizationMappingStatus,
    role: smokeUser.role
  };
});

await runCase(cases, "QA-116-009", "smoke actor cannot request either business company", async () => {
  const before = mutationFingerprint();
  for (const code of ["JENFU", "MAXIMA"]) {
    const result = await resolvePdmCompanyContextAsync(smokeUser, parsePdmCompanyRequest(code));
    assert.equal(result.company, null);
    assert.equal(result.response?.status, 403);
    const payload = await result.response.json();
    assert.deepEqual(payload, { error: "pdm_company_forbidden" });
  }
  assert.deepEqual(mutationFingerprint(), before);
  return { status: 403, zeroWrite: true, legalCompanyEnumeration: false };
});

await runCase(cases, "QA-116-010", "business actor cannot request or discover smoke company", async () => {
  const before = mutationFingerprint();
  const result = await resolvePdmCompanyContextAsync(jenfuUser, parsePdmCompanyRequest("SMOKE"));
  assert.equal(result.company, null);
  assert.equal(result.response?.status, 403);
  const responseText = await result.response.text();
  assert.doesNotMatch(responseText, /SMOKE|company-smoke|Production 驗證租戶/u);
  assert.deepEqual(mutationFingerprint(), before);
  return { status: 403, identityLeak: false, zeroWrite: true };
});

await runCase(cases, "QA-116-011", "actor without membership never falls back to Jenfu", async () => {
  const before = mutationFingerprint();
  const result = await resolvePdmCompanyContextAsync(noMembershipUser, { state: "absent" });
  assert.equal(result.company, null);
  assert.equal(result.response?.status, 403);
  assert.deepEqual(await result.response.json(), { error: "pdm_company_membership_required" });
  assert.deepEqual(mutationFingerprint(), before);
  return { error: "pdm_company_membership_required", zeroWrite: true };
});

await runCase(cases, "QA-116-012", "claim user membership and mapping mismatches fail before mutation", async () => {
  const authority = await getUserCompanyAuthorityAsync(smokeUser.id, "company-smoke");
  assert.ok(authority);
  const variants = [
    { name: "user-company", user: { ...smokeUser, company_id: "company-jenfu" }, authority },
    { name: "membership", user: smokeUser, authority: { ...authority, membershipCount: 2 } },
    { name: "principal-mapping", user: smokeUser, authority: { ...authority, principalMappingStatus: "suspended" } },
    { name: "organization-mapping", user: smokeUser, authority: { ...authority, organizationMappingStatus: "suspended" } }
  ];
  for (const variant of variants) assert.equal(isValidSmokeCommandAuthority(variant.user, variant.authority), false, variant.name);
  return { rejectedVariants: variants.map((item) => item.name), mutationReached: false };
});

await getAsyncDatabaseClient().close();
database.close();
const resolvedTaskRoot = path.resolve(taskRoot);
const resolvedTemp = path.resolve(os.tmpdir());
if (resolvedTaskRoot.startsWith(`${resolvedTemp}${path.sep}`)) fs.rmSync(resolvedTaskRoot, { recursive: true, force: true });
const { manifest, target } = writeProducerManifest({
  runId,
  producer: "isolation-a",
  cases,
  detail: { taskRootRemoved: !fs.existsSync(resolvedTaskRoot) }
});
console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length }));
if (manifest.status !== "PASS") process.exitCode = 1;
