#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEV032_TRAFFIC_ROLLBACK_APPROVAL,
  DEV032_TRAFFIC_TARGET,
  assertExecutionEnvironment,
  assertTrafficTransition,
  buildTrafficPatchBody,
  snapshotService
} from "./run-dev-032-production-traffic-rollback.mjs";

const root = process.cwd();
const results = [];
const record = (name, check) => {
  try {
    check();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};
const read = (relativePath) => readFileSync(path.join(root, ...relativePath.split("/")), "utf8");

const latestRevision = "ai-pdm-prod-00004-qw4";
const rollbackRevision = "ai-pdm-prod-00002-567";
const serviceName = "projects/jenfu-ai-pdm-prod/locations/asia-east1/services/ai-pdm-prod";
const baseService = {
  name: serviceName,
  generation: "5",
  latestCreatedRevision: `${serviceName}/revisions/${latestRevision}`,
  latestReadyRevision: `${serviceName}/revisions/${latestRevision}`,
  template: { containers: [{ image: "example.invalid/image@sha256:fixture" }], scaling: { maxInstanceCount: 3 } },
  traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
};

record("DEV032-TRAFFIC-001 target is fixed to the approved production service", () => {
  assert.deepEqual(DEV032_TRAFFIC_TARGET, {
    project: "jenfu-ai-pdm-prod",
    region: "asia-east1",
    service: "ai-pdm-prod"
  });
});

record("DEV032-TRAFFIC-002 rollback patch contains only a single revision traffic target", () => {
  assert.deepEqual(buildTrafficPatchBody("rollback", rollbackRevision), {
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: rollbackRevision, percent: 100 }]
  });
});

record("DEV032-TRAFFIC-003 latest restore omits the revision field", () => {
  assert.deepEqual(buildTrafficPatchBody("latest"), {
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
  });
});

record("DEV032-TRAFFIC-004 service snapshot canonicalizes template hashing", () => {
  const first = snapshotService(baseService);
  const reordered = snapshotService({
    ...baseService,
    template: { scaling: { maxInstanceCount: 3 }, containers: [{ image: "example.invalid/image@sha256:fixture" }] }
  });
  assert.equal(first.templateSha256, reordered.templateSha256);
});

record("DEV032-TRAFFIC-005 rollback permits traffic-only generation change", () => {
  const before = snapshotService(baseService);
  const after = snapshotService({
    ...baseService,
    generation: "6",
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: rollbackRevision, percent: 100 }]
  });
  assert.equal(assertTrafficTransition(before, after, { kind: "rollback", revision: rollbackRevision }), true);
});

record("DEV032-TRAFFIC-006 latest restore accepts the intentional null revision semantic", () => {
  const before = snapshotService(baseService);
  const after = snapshotService({ ...baseService, generation: "7" });
  assert.equal(assertTrafficTransition(before, after, { kind: "latest" }), true);
});

record("DEV032-TRAFFIC-007 template drift fails closed", () => {
  const before = snapshotService(baseService);
  const after = snapshotService({ ...baseService, template: { ...baseService.template, timeout: "301s" } });
  assert.throws(
    () => assertTrafficTransition(before, after, { kind: "latest" }),
    /PRODUCTION_CLOUD_RUN_TEMPLATE_DRIFT_DETECTED/u
  );
});

record("DEV032-TRAFFIC-008 revision drift fails closed", () => {
  const before = snapshotService(baseService);
  const after = snapshotService({
    ...baseService,
    latestCreatedRevision: `${serviceName}/revisions/ai-pdm-prod-00005-new`,
    latestReadyRevision: `${serviceName}/revisions/ai-pdm-prod-00005-new`
  });
  assert.throws(
    () => assertTrafficTransition(before, after, { kind: "latest" }),
    /PRODUCTION_CLOUD_RUN_REVISION_DRIFT_DETECTED/u
  );
});

record("DEV032-TRAFFIC-009 execution requires exact approval, target and latest revision", () => {
  const env = {
    DEV032_PRODUCTION_TRAFFIC_ROLLBACK_APPROVAL: DEV032_TRAFFIC_ROLLBACK_APPROVAL,
    DEV032_PRODUCTION_PROJECT_ID: "jenfu-ai-pdm-prod",
    DEV032_PRODUCTION_REGION: "asia-east1",
    DEV032_PRODUCTION_SERVICE: "ai-pdm-prod",
    DEV032_PRODUCTION_EXPECTED_LATEST_REVISION: latestRevision
  };
  assert.doesNotThrow(() => assertExecutionEnvironment(latestRevision, env));
  assert.throws(() => assertExecutionEnvironment(latestRevision, { ...env, DEV032_PRODUCTION_REGION: "us-central1" }));
});

record("DEV032-TRAFFIC-010 runner uses Cloud Run v2 traffic-only update with validate-only support", () => {
  const source = read("scripts/run-dev-032-production-traffic-rollback.mjs");
  assert.match(source, /updateMask:\s*"traffic"/u);
  assert.match(source, /validateOnly:\s*String\(validateOnly\)/u);
  assert.match(source, /return validateOnly \? operation : waitForOperation/u);
  assert.match(source, /gcloud\.cmd auth print-access-token/u);
  assert.doesNotMatch(source, /run services update-traffic/u);
});

record("DEV032-TRAFFIC-011 runbook rejects the drift-producing CLI path and requires no-drift evidence", () => {
  const runbook = read(".ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md");
  assert.match(runbook, /Do not use `gcloud run services update-traffic`/u);
  assert.match(runbook, /`updateMask=traffic`/u);
  assert.match(runbook, /Terraform no-drift/u);
  assert.match(runbook, /LATEST.*omit.*revision/iu);
});

record("DEV032-TRAFFIC-012 package exposes the guarded runner and focused QC", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(
    packageJson.scripts?.["dev-032:production-traffic-rollback"],
    "node scripts/run-dev-032-production-traffic-rollback.mjs"
  );
  assert.equal(
    packageJson.scripts?.["qc:dev-032-production-traffic-rollback"],
    "node scripts/qc-dev-032-production-traffic-rollback.mjs"
  );
});

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production traffic rollback QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
