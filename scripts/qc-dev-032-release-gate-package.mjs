#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (relativePath) => fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const seed = json("config/platform/clean-production-seed.template.json");
const activation = json("config/platform/production-activation-checklist.template.json");
const runbook = read(".ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md");
const activationRunbook = read(".ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md");
const readinessGenerator = read("scripts/generate-dev-032-production-activation-readiness.mjs");
const devTask = read(".ai-doc/dev_task.md");
const map = read(".ai-doc/documentation_map.md");
const preflight = read(".ai-doc/reports/pm/pm-dev-032-production-release-gate-preflight-2026-07-15.md");
const sourceBoundary = read(".ai-doc/reports/pm/pm-dev-032-source-boundary-classification-2026-07-15.md");
const packageJson = json("package.json");

record("DEV032-GATE-001 package remains template-only", seed.fixtureOnly === true && seed.releaseReady === false && seed.releaseGate?.templateOnly === true && seed.releaseGate?.productionMutationAllowed === false);
record("DEV032-GATE-002 clean seed forbids source auto-link and preserves read-only source archive", seed.sameEmailAutoLinkAllowed === false && seed.sourceArchive?.readOnly === true && seed.sourceArchive?.sourceActorIdsPreserved === true);
record("DEV032-GATE-003 production access allowlist is named-user and fail-closed without being a release acceptance gate", seed.productionAccessAllowlist?.mode === "named-pdm-user-ids-only" && seed.productionAccessAllowlist?.failClosed === true && seed.productionAccessAllowlist?.googleWorkspaceOnly === true && seed.productionAccessAllowlist?.nonAllowlistedAccessExpected === "denied");
record("DEV032-GATE-004 Phase 3A keeps GCS and unapproved non-Google production access closed", seed.configuration.some((item) => item.key === "gcs_file_authority_enabled" && item.value === "false") && seed.configuration.some((item) => item.key === "non_google_production_access_enabled" && item.value === "false") && seed.accessPolicy?.productionInitial?.controlledNonGoogleAllowed === false);
record("DEV032-GATE-005 historical official-number evidence is explicitly missing until inventory", seed.historicalOfficialNumberEvidence?.status === "missing_production_inventory" && seed.historicalOfficialNumberEvidence?.mustCreateNonReusableReservations === true && Array.isArray(seed.historicalOfficialNumbers) && Array.isArray(seed.numberingRecoveryReservations));
record("DEV032-GATE-006 HD-8-4 restore gate requires PITR and isolated target", seed.preActivationRestoreReconciliation?.decision === "HD-8-4 / 1A" && seed.preActivationRestoreReconciliation?.cloudSqlAutomatedBackupRequired === true && seed.preActivationRestoreReconciliation?.pitrRequired === true && seed.preActivationRestoreReconciliation?.separateIsolatedTargetRequired === true && seed.preActivationRestoreReconciliation?.sourceOverwriteAllowed === false);
record("DEV032-GATE-007 reconciliation covers numbering and operational integrity", ["schema_and_migration_history", "principal_and_account_mapping", "audit_receipt_outbox_orphan_check", "official_number_ledger_consistency", "numbering_sequence_regression_check", "non_reuse_reservation_coverage", "clean_seed_no_business_draft_demo_test_source_rows"].every((check) => seed.preActivationRestoreReconciliation?.checks?.includes(check)));
record("DEV032-GATE-008 rollback evidence remains required before activation", seed.rollbackReadiness?.requiredBeforeActivation === true && seed.rollbackReadiness?.status === "missing_evidence" && seed.rollbackReadiness?.cloudRunPreviousRevisionRequired === true && seed.rollbackReadiness?.databaseRestorePointRequired === true);
record("DEV032-GATE-009 evidence list includes Level 3 and Level 4 release smoke", seed.evidenceRequired?.includes("Level 3 production-like smoke") && seed.evidenceRequired?.includes("Level 4 post-deploy production smoke"));
record("DEV032-GATE-010 runbook denies source overwrite and in-place restore", /Do not restore in place/u.test(runbook) && /not overwritten or mutated/u.test(runbook) && /separate isolated/u.test(runbook));
record("DEV032-GATE-011 runbook keeps full PDM file restore deferred", /not the full PDM\/GCS\/offline restore drill/u.test(runbook) && /DEV-037/u.test(runbook));
record("DEV032-GATE-012 activation checklist remains template-only and gates write actions", activation.templateOnly === true && activation.productionActionAllowed === false && activation.activationSequence?.some((item) => item.id === "A3-credentialled-terraform-plan-review") && activation.activationSequence?.some((item) => item.id === "A8-production-deploy-and-level4-smoke"));
record("DEV032-GATE-013 activation runbook is handoff-only", /not an approval/u.test(activationRunbook) && /does not authorize production apply/u.test(activationRunbook) && /does not start DEV-047/u.test(activationRunbook));
record("DEV032-GATE-014 activation readiness generator is local-only and evidence-driven", readinessGenerator.includes("blocked_activation_readiness") && readinessGenerator.includes("generationReadOnly: true") && !readinessGenerator.includes("execFileSync") && !readinessGenerator.includes("node:child_process"));
record("DEV032-GATE-015 PM docs reference source-boundary report and gate remains blocked", devTask.includes("pm-dev-032-source-boundary-classification-2026-07-15.md") && map.includes("pm-dev-032-source-boundary-classification-2026-07-15.md") && /dirty paths are classified/u.test(preflight) && sourceBoundary.includes("not releaseable"));
record("DEV032-GATE-016 package exposes QC and live-readback scripts", packageJson.scripts["qc:dev-032-release-gate-package"] === "node scripts/qc-dev-032-release-gate-package.mjs" && packageJson.scripts["qc:dev-032-production-activation-checklist"] === "node scripts/qc-dev-032-production-activation-checklist.mjs" && packageJson.scripts["dev-032:production-live-readback"] === "node scripts/capture-dev-032-production-live-readback.mjs" && packageJson.scripts["dev-032:production-activation-readiness"] === "node scripts/generate-dev-032-production-activation-readiness.mjs" && packageJson.scripts["qc:dev-032-production-activation-readiness"] === "node scripts/qc-dev-032-production-activation-readiness.mjs");
record("DEV032-GATE-017 rollback contract is traffic-only and drift-fail-closed", activationRunbook.includes("Do not use `gcloud run services update-traffic`") && activationRunbook.includes("`updateMask=traffic`") && activationRunbook.includes("latestCreatedRevision") && activationRunbook.includes("Terraform no-drift") && packageJson.scripts["qc:dev-032-production-traffic-rollback"] === "node scripts/qc-dev-032-production-traffic-rollback.mjs");

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 release gate package QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
