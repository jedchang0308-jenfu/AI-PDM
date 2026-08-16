#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  businessMinutesBetween,
  evaluateContinuityIncident,
  validateCleanProductionSeed,
  validateCostBudgetPolicy,
  validateDataLocationInventory,
  validateOperationalLogEvent
} from "../src/lib/platform-governance-contract.ts";
import {
  scanForbiddenFirebaseAuthorities,
  scanOperationalRepositories,
  scanPortableHttpTransports,
  validateFormalAuthorityPolicy
} from "../src/lib/platform-boundary-scanner.ts";

const root = process.cwd();
const results = [];
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function json(relativePath) { return JSON.parse(read(relativePath)); }
function record(name, passed, detail = "") { results.push({ name, passed: Boolean(passed), detail }); }
function sourceEntries(directory) {
  const entries = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) entries.push(...sourceEntries(absolute));
    else if (/\.(?:ts|tsx|js|mjs|json)$/u.test(item.name)) entries.push({ path: path.relative(root, absolute), source: fs.readFileSync(absolute, "utf8") });
  }
  return entries;
}

const seed = json("config/platform/clean-production-seed.template.json");
const seedPlanning = validateCleanProductionSeed(seed);
const seedRelease = validateCleanProductionSeed(seed, { requireReleaseReady: true });
record("DEV046-1E-001 clean seed accepts only new identities and minimum allowlist", seedPlanning.valid && seed.users[0].id.startsWith("prod-") && Object.values(seed.excludedRows).every((rows) => rows.length === 0));
record("DEV046-1E-002 source archive is read-only hash inventoried and never email-linked", seed.sourceArchive.readOnly && seed.sourceArchive.sourceActorIdsPreserved && seed.sameEmailAutoLinkAllowed === false && /^[a-f0-9]{64}$/u.test(seed.sourceArchive.contentSha256));
record("DEV046-1E-003 every historical official number has a non-reusable reservation", seedPlanning.valid && seed.historicalOfficialNumbers.length === seed.numberingRecoveryReservations.length);
record("DEV046-1E-004 planning seed cannot masquerade as release evidence", !seedRelease.valid && seedRelease.errors.includes("CLEAN_SEED_RELEASE_EVIDENCE_REQUIRED"));
const reusedSeed = structuredClone(seed);
reusedSeed.users[0].id = reusedSeed.legacyIdentityIds[0];
record("DEV046-1E-005 legacy production ID reuse fails closed", !validateCleanProductionSeed(reusedSeed).valid);

const inventory = json("config/platform/data-location-retention.json");
const inventoryPlanning = validateDataLocationInventory(inventory);
const inventoryRelease = validateDataLocationInventory(inventory, { requireReleaseReady: true });
record("DEV046-1E-006 location inventory covers all nine authority classes", inventoryPlanning.valid && inventory.entries.length === 9);
record("DEV046-1E-007 Taiwan authorities and provider exceptions are explicit", inventoryPlanning.valid && inventory.entries.find((entry) => entry.category === "database").location === "asia-east1" && inventory.entries.find((entry) => entry.category === "identity").exceptionApproved === true && inventory.entries.find((entry) => entry.category === "logs").location.includes("global"));
record("DEV046-1E-008 planned location inventory is not release evidence", !inventoryRelease.valid && inventoryRelease.errors.includes("LOCATION_RELEASE_EVIDENCE_REQUIRED"));
const inventorySchema = json("config/platform/data-location-retention.schema.json");
record("DEV046-1E-009 machine-readable inventory schema enumerates authorities", inventorySchema.$schema.includes("2020-12") && inventorySchema.properties.entries.items.properties.category.enum.length === 9);

const cost = json("config/platform/cost-budget.template.json");
const costPlanning = validateCostBudgetPolicy(cost);
const costRelease = validateCostBudgetPolicy(cost, { requireReleaseReady: true });
record("DEV046-1E-010 monthly assumptions owners budget and 80 percent plan stop reconcile", costPlanning.valid && costPlanning.assumptionTotal === cost.monthlyBudget && cost.planReviewStopAtUsd === 240);
record("DEV046-1E-011 budget alerts are 50 80 100 with recipients", costPlanning.valid && cost.alerts.every((alert) => alert.recipients.length >= 2));
record("DEV046-1E-012 planning costs cannot masquerade as measured release cost", !costRelease.valid && costRelease.errors.includes("COST_MEASURED_RELEASE_EVIDENCE_REQUIRED") && cost.automaticBillingDisableAllowed === false);

const continuity = json("config/platform/support-continuity.template.json");
const fixturePolicy = { ...continuity, roster: { primary: "primary-user", backup: "backup-user" } };
const businessMinutes = businessMinutesBetween("2026-07-17T08:00:00.000Z", "2026-07-20T02:00:00.000Z", fixturePolicy);
record("DEV046-1E-013 RTO clock excludes Taiwan weekend and off-hours", businessMinutes === 180, `minutes=${businessMinutes}`);
const incident = evaluateContinuityIncident({
  policy: fixturePolicy,
  lastRecoverablePointAt: "2026-07-17T07:30:00.000Z",
  detectedAt: "2026-07-17T08:00:00.000Z",
  acknowledgedAt: "2026-07-17T08:45:00.000Z",
  containmentStartedAt: "2026-07-17T08:55:00.000Z",
  restoredAt: "2026-07-20T02:00:00.000Z"
});
record("DEV046-1E-014 RPO RTO acknowledgement and containment fixture passes", incident.valid && incident.rpoMinutes === 30 && incident.acknowledgementMinutes === 45 && incident.containmentDelayMinutes === 10 && incident.rtoBusinessMinutes === 180);
const lateAck = evaluateContinuityIncident({
  policy: fixturePolicy,
  lastRecoverablePointAt: "2026-07-17T07:30:00.000Z",
  detectedAt: "2026-07-17T08:00:00.000Z",
  acknowledgedAt: "2026-07-17T09:01:00.000Z",
  containmentStartedAt: "2026-07-17T09:02:00.000Z",
  restoredAt: "2026-07-17T09:10:00.000Z"
});
record("DEV046-1E-015 acknowledgement over 60 wall-clock minutes fails", !lateAck.valid && lateAck.errors.includes("CONTINUITY_ACK_BREACHED"));
record("DEV046-1E-016 named backup is recorded while live continuity evidence remains open", continuity.roster.backup === "dani@jenfu.com.tw" && continuity.releaseReady === false && continuity.regionalDrClaimAllowed === false);

const safeLog = {
  requestId: "request-001",
  actorId: "prod-pdm-user-001",
  companyId: "company-jenfu",
  commandName: "numbering.reserve",
  databaseInstance: "jenfu-prod:asia-east1:ai-pdm",
  storageObject: { bucket: "pdm-formal-files", key: "company-jenfu/A0001", generation: "1" },
  providerOperation: "cloud-sql-transaction",
  status: "succeeded",
  occurredAt: "2026-07-13T08:00:00.000Z"
};
record("DEV046-1E-017 observability contract contains required correlation fields", validateOperationalLogEvent(safeLog).valid);
record("DEV046-1E-018 observability rejects secrets PII and payload fields", !validateOperationalLogEvent({ ...safeLog, email: "person@example.com", token: "secret", payload: { raw: true } }).valid);

const source = sourceEntries(path.join(root, "src"));
const firebaseViolations = scanForbiddenFirebaseAuthorities([
  ...source,
  { path: "package.json", source: read("package.json") },
  { path: "next.config.mjs", source: read("next.config.mjs") }
]);
record("DEV046-1E-019 source has no Firestore Storage Functions Callable or triggers", firebaseViolations.length === 0, firebaseViolations.join(","));
const detectedFirebase = scanForbiddenFirebaseAuthorities([{ path: "bad.ts", source: 'import { getFirestore } from "firebase/firestore"; getFirestore();' }]);
record("DEV046-1E-020 Firebase authority scanner fails closed", detectedFirebase.join(",") === "bad.ts");
const repositoryViolations = scanOperationalRepositories(source);
record("DEV046-1E-021 operational repositories use provider-neutral async DB port", repositoryViolations.length === 0, repositoryViolations.join(","));
const transportViolations = scanPortableHttpTransports(source);
record("DEV046-1E-022 routes and middleware contain no inline DB or provider protocol", transportViolations.length === 0, transportViolations.slice(0, 10).join(","));
const authority = json("config/platform/formal-authority-policy.json");
record("DEV046-1E-023 formal authority is Cloud SQL direct GCS and portable HTTP", validateFormalAuthorityPolicy(authority).valid && authority.files.currentProductionSliceFileWorkflowsEnabled === false);

const cloudRun = json("config/platform/cloud-run.contract.json");
record("DEV046-1E-024 Phase 1 contains no live resource credential billing or DNS action", Object.values(cloudRun.phase1Guard).every((value) => value === false));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 1E QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
