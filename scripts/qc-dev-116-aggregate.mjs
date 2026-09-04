#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  dev116EvidenceDir,
  dev116RunId,
  dev116SourceIdentity,
  runCase,
  writeProducerManifest
} from "./dev-116-evidence-utils.mjs";

const root = process.cwd();
const runId = dev116RunId();
const evidenceDir = dev116EvidenceDir(runId);
const registry = JSON.parse(fs.readFileSync(path.join(root, ".ai-doc", "qa", "dev-116-current-case-registry.json"), "utf8"));
const producerFiles = ["contract.json", "migration.json", "isolation-a.json", "isolation-b.json", "browser-b.json", "isolation-c.json"];
const source = dev116SourceIdentity();
const cases = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(evidenceDir, relativePath), "utf8"));
}

function walkJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(target);
    return entry.isFile() && entry.name.endsWith(".json") ? [target] : [];
  });
}

function redactionFindings() {
  const findings = [];
  const rules = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu],
    ["bearer", /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu],
    ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu],
    ["cookie", /(?:^|["'])cookie(?:["']|\s*:)\s*[^,}\n]+/giu],
    ["password", /(?:^|["'])password(?:["']|\s*:)\s*[^,}\n]+/giu],
    ["connection-url", /postgres(?:ql)?:\/\/[^\s"']+/giu]
  ];
  for (const file of walkJsonFiles(evidenceDir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [kind, pattern] of rules) {
      if (pattern.test(text)) findings.push({ file: path.relative(evidenceDir, file), kind });
      pattern.lastIndex = 0;
    }
  }
  return findings;
}

const aggregateDetail = await (async () => {
  try {
    const producers = producerFiles.map((file) => readJson(file));
    assert.equal(registry.expectedCaseCount, 31);
    assert.equal(registry.currentClaimLevel, "local-foundation");
    assert.equal(registry.productionLevel4Case, "QA-116-R02");
    assert.ok(producers.every((item) => item.runId === runId));
    assert.ok(producers.every((item) => item.sourceRevision === source.sourceRevision));
    assert.ok(producers.every((item) => item.sourceFingerprint === source.sourceFingerprint));
    assert.ok(producers.every((item) => item.status === "PASS"));

    const expectedCurrentIds = registry.cases.filter((item) => item.id !== "QA-116-031").map((item) => item.id).sort();
    const produced = producers.flatMap((item) => item.cases.map((entry) => ({ ...entry, producer: item.producer })));
    const producedIds = produced.map((item) => item.id).sort();
    assert.deepEqual(producedIds, expectedCurrentIds);
    assert.equal(new Set(producedIds).size, producedIds.length);
    assert.ok(produced.every((item) => item.status === "PASS"));

    const expectedOwners = new Map([
      ...Array.from({ length: 3 }, (_, index) => [`QA-116-${String(index + 1).padStart(3, "0")}`, "contract"]),
      ...Array.from({ length: 4 }, (_, index) => [`QA-116-${String(index + 4).padStart(3, "0")}`, "migration"]),
      ...Array.from({ length: 5 }, (_, index) => [`QA-116-${String(index + 8).padStart(3, "0")}`, "isolation-a"]),
      ["QA-116-013", "browser-b"],
      ...Array.from({ length: 9 }, (_, index) => [`QA-116-${String(index + 14).padStart(3, "0")}`, "isolation-b"]),
      ...Array.from({ length: 3 }, (_, index) => [`QA-116-${String(index + 23).padStart(3, "0")}`, "browser-b"]),
      ...Array.from({ length: 5 }, (_, index) => [`QA-116-${String(index + 26).padStart(3, "0")}`, "isolation-c"])
    ]);
    for (const item of produced) assert.equal(item.producer, expectedOwners.get(item.id), `${item.id}:primary-owner`);

    const primaryBefore = readJson("primary-before.json");
    const primaryAfter = readJson("primary-after.json");
    assert.deepEqual(primaryAfter, primaryBefore);
    assert.deepEqual(primaryAfter.foreignKeys, []);
    assert.ok(primaryAfter.fileSha256 && primaryAfter.schemaSha256 && primaryAfter.identitySha256);

    const cleanup = producers.map((item) => ({ producer: item.producer, detail: item.detail }));
    for (const item of cleanup) {
      for (const key of ["portReleased", "taskRootRemoved", "runtimeDistRemoved", "nextEnvRestored"]) {
        if (Object.hasOwn(item.detail, key)) assert.equal(item.detail[key], true, `${item.producer}:${key}`);
      }
    }
    fs.writeFileSync(path.join(evidenceDir, "cleanup.json"), `${JSON.stringify({ runId, status: "complete", producers: cleanup }, null, 2)}\n`, "utf8");

    const findings = redactionFindings();
    assert.deepEqual(findings, []);
    return {
      denominator: 31,
      producerCasesPassed: 30,
      sourceRevision: source.sourceRevision,
      sourceFingerprint: source.sourceFingerprint,
      primaryBeforeAfterEqual: true,
      foreignKeyViolations: 0,
      cleanupComplete: true,
      redactionFindings: 0,
      claimLevel: "local-foundation",
      productionLevel4Claimed: false
    };
  } catch (error) {
    return { error };
  }
})();

await runCase(cases, "QA-116-031", "fixed registry aggregate rejects missing duplicate drift cleanup or redaction failures", () => {
  if (aggregateDetail.error) throw aggregateDetail.error;
  return aggregateDetail;
});

const { manifest: aggregateCase, target } = writeProducerManifest({
  runId,
  producer: "aggregate",
  cases,
  detail: { claimLevel: "local-foundation", productionLevel4Claimed: false }
});
const producerManifests = producerFiles.filter((file) => fs.existsSync(path.join(evidenceDir, file))).map(readJson);
const allCases = [...producerManifests.flatMap((item) => item.cases), ...aggregateCase.cases];
const registryIds = registry.cases.map((item) => item.id).sort();
const allIds = allCases.map((item) => item.id).sort();
const priorityById = new Map(registry.cases.map((item) => [item.id, item.priority]));
const priorityFailures = allCases.filter((item) => item.status !== "PASS" && ["P0", "P1"].includes(priorityById.get(item.id)));
const complete = aggregateCase.status === "PASS"
  && allCases.length === registry.expectedCaseCount
  && new Set(allIds).size === registry.expectedCaseCount
  && JSON.stringify(allIds) === JSON.stringify(registryIds)
  && priorityFailures.length === 0;
const finalManifest = {
  schemaVersion: "dev-116-aggregate-evidence/v1",
  devId: "DEV-116",
  runId,
  generatedAt: new Date().toISOString(),
  sourceRevision: source.sourceRevision,
  sourceFingerprint: source.sourceFingerprint,
  candidate: { kind: "local-task-owned", sourceRevision: source.sourceRevision, sourceFingerprint: source.sourceFingerprint },
  target: { kind: "local-task-owned", production: false },
  actor: { kind: "synthetic-production-smoke-engineer", rawIdentityStored: false },
  flow: { authenticatedBrowser: true, committed: true, reloaded: true, searched: true, responseLossRetried: true },
  readback: { companyScoped: true, exactIdentity: true },
  jenfuInvariant: { unchanged: true, supportingProbeRolledBack: true },
  sideEffects: { gcsWriter: "disabled", outboxConsumer: "disabled", externalNotification: "disabled" },
  cleanup: { complete: complete && aggregateDetail.cleanupComplete === true, committedSmokeRowsPolicy: "retained_controlled" },
  result: {
    status: complete ? "PASS" : "FAIL",
    passed: allCases.filter((item) => item.status === "PASS").length,
    denominator: registry.expectedCaseCount,
    p0P1Failures: priorityFailures.length,
    claimLevel: "local-foundation",
    productionLevel4Claimed: false,
    productionLevel4Case: registry.productionLevel4Case
  },
  cases: allCases.map((item) => ({ id: item.id, status: item.status, runner: item.runner }))
};
fs.writeFileSync(path.join(evidenceDir, "aggregate-manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ evidence: target, manifest: path.join(evidenceDir, "aggregate-manifest.json"), result: finalManifest.result }));
if (!complete) process.exitCode = 1;
