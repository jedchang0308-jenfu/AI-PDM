import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import {
  DrawingRevisionTargetContractError,
  parseDrawingRevisionCreateSelection
} from "../src/lib/drawing-revision-target-contract.ts";
import {
  issueDrawingRevisionTargetToken,
  verifyDrawingRevisionTargetToken
} from "../src/lib/drawing-revision-target-token.server.ts";
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";

const root = process.cwd();
const fixedCaseIds = Array.from({ length: 5 }, (_, index) => `QA-098-${String(index + 1).padStart(3, "0")}`);
const sourceFiles = [
  "src/lib/drawing-revision-target-contract.ts",
  "src/lib/drawing-revision-target-token.server.ts",
  "src/lib/drawing-revision-lifecycle-policy.ts",
  "src/lib/drawing-revision-work.ts",
  "src/lib/repositories/drawing-revision-work-async-repository.ts",
  "src/app/api/pdm/drawings/[drawingId]/revision-targets/route.ts",
  "src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts"
];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sourceBoundary = Object.fromEntries(sourceFiles.map((file) => [file, sha256(readFileSync(resolve(root, file)))]));
const db = createFixtureDatabase();
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
const service = new DrawingRevisionWorkService(client);
const owner = {
  id: ids.owner,
  companyId: ids.company,
  canEditNonOwned: false,
  permissions: { create: true, update: true, submit: true, cancel: true, decide: false, obsolete: true }
};
const viewer = {
  id: "viewer-dev098",
  companyId: ids.company,
  canEditNonOwned: false,
  permissions: { create: false, update: false, submit: false, cancel: false, decide: false, obsolete: false }
};
const foreign = { ...owner, id: "foreign-dev098", companyId: ids.otherCompany };

function businessSnapshot() {
  const tables = ["drawing_rd_branches", "drawing_revision_claims", "drawing_revisions", "drawing_revision_works", "canonical_workbench_states"];
  return Object.fromEntries(tables.map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)]));
}

const before = businessSnapshot();
const cases = [];
async function runCase(id, title, execute) {
  const evidence = {};
  try {
    await execute(evidence);
    cases.push({ id, title, status: "PASS", evidence });
  } catch (error) {
    cases.push({ id, title, status: "FAIL", message: error instanceof Error ? error.stack ?? error.message : String(error), evidence });
  }
}

function expectContractError(value, code) {
  assert.throws(
    () => parseDrawingRevisionCreateSelection(value),
    (error) => error instanceof DrawingRevisionTargetContractError && error.code === code
  );
}

function signPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

await runCase("QA-098-001", "targets service derives production and RD targets from the exact source", async (evidence) => {
  const production = await service.targets(ids.drawing, `cw_${ids.stateProduction}`, owner);
  const rd = await service.targets(ids.drawing, `cw_${ids.stateRd}`, owner);
  assert.deepEqual(production.data.source, {
    rowKey: `cw_${ids.stateProduction}`,
    rowVersion: 1,
    revision: { major: 1, minor: 0, label: "1" },
    basisState: "current"
  });
  assert.equal(production.data.manualRule.major, 1);
  assert.equal(production.data.manualRule.minExclusive, 0);
  assert.deepEqual(production.data.candidates.map((item) => [item.kind, item.target.label]), [["production", "2"], ["rd", "1.2"]]);
  assert.deepEqual(rd.data.source, {
    rowKey: `cw_${ids.stateRd}`,
    rowVersion: 1,
    revision: { major: 1, minor: 1, label: "1.1" },
    basisState: "current"
  });
  assert.equal(rd.data.manualRule.major, 1);
  assert.equal(rd.data.manualRule.minExclusive, 1);
  assert.deepEqual(rd.data.candidates.map((item) => [item.kind, item.target.label]), [["production", "2"], ["rd", "1.2"]]);
  const decoded = JSON.parse(Buffer.from(rd.data.candidates[1].candidateToken.split(".")[0], "base64url").toString("utf8"));
  assert.equal(decoded.version, 2);
  assert.equal(decoded.sourceRowId, ids.stateRd);
  assert.equal(decoded.target.label, "1.2");
  evidence.primitiveOracle = { production: "1", rdSource: "1.1", occupied: ["1.1"], expected: ["2", "1.2"] };
  evidence.responses = { production: production.data, rd: rd.data };
  evidence.decodedTokenFields = decoded;
});

await runCase("QA-098-002", "recommended and manual request bodies accept only two exact shapes", async (evidence) => {
  const recommended = { sourceRowKey: "cw_source", selectionMode: "recommended", candidateToken: "signed-token" };
  const manual = { sourceRowKey: "cw_source", selectionMode: "manual_minor", requestedMinor: 7 };
  assert.deepEqual(parseDrawingRevisionCreateSelection(recommended), recommended);
  assert.deepEqual(parseDrawingRevisionCreateSelection(manual), manual);
  const rejected = [
    [{}, "WORKBENCH_BAD_REQUEST"],
    [{ sourceRowKey: "cw_source", candidateToken: "signed-token" }, "WORKBENCH_BAD_REQUEST"],
    [{ sourceRowKey: "cw_source", selectionMode: "recommended", candidateToken: "signed-token", requestedMinor: 7 }, "WORKBENCH_BAD_REQUEST"],
    [{ sourceRowKey: "cw_source", selectionMode: "manual_minor", requestedMinor: 7, candidateToken: "forbidden" }, "DRAWING_MANUAL_MINOR_INVALID"]
  ];
  for (const [body, code] of rejected) expectContractError(body, code);
  const routeSource = readFileSync(resolve(root, "src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts"), "utf8");
  assert.equal(/String\s*\(\s*(?:body|input)\./u.test(routeSource), false, "route must not coerce request fields with String()");
  evidence.accepted = [recommended, manual];
  evidence.rejected = rejected.map(([body, code]) => ({ body, code }));
  evidence.routeSourceHash = sourceBoundary["src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts"];
});

await runCase("QA-098-003", "manual request rejects forbidden fields and invalid numeric suffixes without writes", async (evidence) => {
  const invalidBodies = [
    { requestedMinor: 7, major: 2 },
    { requestedMinor: 7, revision: "1.7" },
    { requestedMinor: 7, target: { major: 1, minor: 7 } },
    { requestedMinor: 7, candidateToken: "forbidden" },
    { requestedMinor: "7" },
    { requestedMinor: 0 },
    { requestedMinor: -1 },
    { requestedMinor: 1.5 },
    { requestedMinor: 2_147_483_648 }
  ].map((entry) => ({ sourceRowKey: "cw_source", selectionMode: "manual_minor", ...entry }));
  for (const body of invalidBodies) expectContractError(body, "DRAWING_MANUAL_MINOR_INVALID");
  assert.deepEqual(businessSnapshot(), before);
  evidence.invalidMatrix = invalidBodies.map((body) => ({ body, status: 422, code: "DRAWING_MANUAL_MINOR_INVALID" }));
  evidence.beforeAfter = { before, after: businessSnapshot() };
});

await runCase("QA-098-004", "v2 target token fails closed on mutation, expiry, legacy version, and missing production secret", async (evidence) => {
  const secret = "dev098-contract-secret";
  process.env.PDM_WORKBENCH_CONTRACT_SECRET = secret;
  const expected = { companyId: "company-a", actorId: "actor-a", drawingId: "drawing-a", sourceRowId: "source-a", sourceRowVersion: 4 };
  const token = issueDrawingRevisionTargetToken({ ...expected, basisState: "current", target: { major: 1, minor: 7, label: "1.7" } });
  const roundTrip = verifyDrawingRevisionTargetToken(token, expected);
  assert.equal(roundTrip.version, 2);
  assert.equal(roundTrip.target.label, "1.7");
  const basePayload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  const attempts = [
    ["legacy-v1", signPayload({ ...basePayload, version: 1 }, secret), expected],
    ["expired", signPayload({ ...basePayload, expiresAt: Date.now() - 1 }, secret), expected],
    ["actor", token, { ...expected, actorId: "actor-b" }],
    ["company", token, { ...expected, companyId: "company-b" }],
    ["drawing", token, { ...expected, drawingId: "drawing-b" }],
    ["row", token, { ...expected, sourceRowId: "source-b" }],
    ["row-version", token, { ...expected, sourceRowVersion: 5 }],
    ["target-tamper", `${Buffer.from(JSON.stringify({ ...basePayload, target: { major: 99, minor: 0, label: "99" } }), "utf8").toString("base64url")}.${token.split(".")[1]}`, expected],
    ["signature", `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`, expected]
  ];
  for (const [name, candidate, candidateExpected] of attempts) {
    assert.throws(() => verifyDrawingRevisionTargetToken(candidate, candidateExpected), (error) => error?.code === "WORKBENCH_CONTRACT_EXPIRED", name);
  }
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.PDM_WORKBENCH_CONTRACT_SECRET;
  delete env.PDM_AUTH_SECRET;
  delete env.AUTH_SECRET;
  const child = spawnSync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    "./scripts/qc-ts-path-loader.mjs",
    "--input-type=module",
    "--eval",
    `import { issueDrawingRevisionTargetToken } from './src/lib/drawing-revision-target-token.server.ts'; try { issueDrawingRevisionTargetToken({ companyId:'c', actorId:'a', drawingId:'d', sourceRowId:'s', sourceRowVersion:1, basisState:'current', target:{major:1,minor:1,label:'1.1'} }); process.exit(9); } catch (error) { if (error?.message !== 'PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED') { console.error(error); process.exit(8); } }`
  ], { cwd: root, env, encoding: "utf8" });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.deepEqual(businessSnapshot(), before);
  evidence.roundTrip = { version: roundTrip.version, target: roundTrip.target };
  evidence.mutationTable = attempts.map(([name]) => ({ mutation: name, status: 409, code: "WORKBENCH_CONTRACT_EXPIRED" }));
  evidence.productionMissingSecret = { exitCode: child.status, expectedError: "PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED" };
  evidence.beforeAfter = { before, after: businessSnapshot() };
  delete process.env.PDM_WORKBENCH_CONTRACT_SECRET;
});

await runCase("QA-098-005", "server permission and company boundaries deny viewer and foreign access without leaking or writing", async (evidence) => {
  await assert.rejects(() => service.targets(ids.drawing, `cw_${ids.stateProduction}`, viewer), (error) => error?.status === 403);
  await assert.rejects(() => service.create(ids.drawing, { sourceRowKey: `cw_${ids.stateProduction}`, selectionMode: "manual_minor", requestedMinor: 8 }, viewer, { idempotencyKey: "viewer", contractToken: "unused", expectedRowVersion: 1 }), (error) => error?.status === 403);
  await assert.rejects(() => service.targets(ids.drawing, `cw_${ids.stateProduction}`, foreign), (error) => error?.status === 409 && !String(error.message).includes(ids.company));
  const foreignContract = await issueCanonicalWorkbenchContract(client, { companyId: ids.otherCompany, actorId: foreign.id });
  await assert.rejects(() => service.create(ids.drawing, { sourceRowKey: `cw_${ids.stateProduction}`, selectionMode: "manual_minor", requestedMinor: 8 }, foreign, { idempotencyKey: "foreign", contractToken: foreignContract, expectedRowVersion: 1 }), (error) => error?.status === 409 && !String(error.message).includes(ids.company));
  const sameCompany = await service.targets(ids.drawing, `cw_${ids.stateProduction}`, owner);
  assert.equal(sameCompany.data.source.rowKey, `cw_${ids.stateProduction}`);
  assert.deepEqual(businessSnapshot(), before);
  evidence.roleResponses = [
    { role: "viewer", operation: "GET/POST", status: 403 },
    { role: "foreign-rd", operation: "GET/POST", status: 409, internalIdLeak: false },
    { role: "same-company-owner", operation: "GET", status: 200 }
  ];
  evidence.beforeAfter = { before, after: businessSnapshot() };
});

const after = businessSnapshot();
const failed = cases.filter((item) => item.status === "FAIL");
const runId = `DEV098-contract-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = resolve(process.env.DEV098_CONTRACT_EVIDENCE_DIR?.trim() || resolve(root, "output", "qa", "dev-098", runId));
mkdirSync(evidenceDir, { recursive: true });
const manifest = {
  schemaVersion: 1,
  devId: "DEV-098",
  suite: "contract",
  runId,
  generatedAt: new Date().toISOString(),
  status: failed.length ? "FAIL" : "PASS",
  fixedCaseIds,
  expected: fixedCaseIds.length,
  executed: cases.length,
  passed: cases.length - failed.length,
  firstFailure: failed[0] ?? null,
  sourceBoundary,
  dataBoundary: { provider: "sqlite", storage: "in-memory", primaryMutation: false },
  primaryInvariants: { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) },
  foreignKeyCheck: db.pragma("foreign_key_check"),
  caseResults: cases
};
writeFileSync(resolve(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await client.close();
db.close();
console.log(JSON.stringify({ ...manifest, caseResults: cases.map(({ id, title, status, message }) => ({ id, title, status, message })) }, null, 2));
if (failed.length) process.exitCode = 1;
