#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_RELEASE_TRAFFIC_APPROVAL,
  PRODUCTION_RELEASE_TARGET,
  assertReleaseExecutionEnvironment,
  assertReleaseTrafficTransition,
  buildReleaseTrafficPatch,
  isReleaseTrafficApplied,
  snapshotReleaseService
} from "./run-production-release-traffic.mjs";
import { selectProductionServingRevision } from "./select-production-serving-revision.mjs";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
const workflow = read(".github/workflows/deploy-production.yml");
const ciWorkflow = read(".github/workflows/ci.yml");
const candidateWorkflow = workflow.split("\n  promote:")[0];
const prepareWorkflow = workflow.split("\n  prepare:")[1]?.split("\n  candidate:")[0] ?? "";
const zeroTrafficCandidateWorkflow = workflow.split("\n  candidate:")[1]?.split("\n  promote:")[0] ?? "";
const promotionWorkflow = workflow.split("\n  promote:")[1] ?? "";
const identity = read("infra/google-cloud/production/deployment-identity.tf");
const runtime = read("infra/google-cloud/production/runtime.tf");
const security = read("infra/google-cloud/production/security.tf");
const locals = read("infra/google-cloud/production/locals.tf");
const variables = read("infra/google-cloud/production/variables.tf");
const deploymentBoundary = `${identity}\n${locals}\n${variables}`;
const smoke = read("scripts/run-production-release-smoke.mjs");
const dev116R02Receipt = read("scripts/lib/dev116-r02-receipt.mjs");
const dev116R02ReceiptCli = read("scripts/dev116-r02-receipt.mjs");
const dev116R02BrowserLibrary = read("scripts/lib/dev116-r02-browser-executor.mjs");
const dev116R02Browser = read("scripts/run-dev116-r02-authenticated-browser.mjs");
const dev116R02Finalize = read("scripts/dev116-r02-finalize.mjs");
const dev010NeutralMigration = read("db/postgres/062_dev010_neutral_schema_boundary.sql");
const trafficRunner = read("scripts/run-production-release-traffic.mjs");
const releaseSourceManifestUtils = read("scripts/dev-032-release-source-manifest-utils.mjs");
const dockerfile = read("Dockerfile");
const dockerIgnore = read(".dockerignore");
const packageJson = JSON.parse(read("package.json"));
const results = [];

function record(name, check) {
  try {
    check();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const serviceName = "projects/jenfu-ai-pdm-prod/locations/asia-east1/services/ai-pdm-prod";
const candidateRevision = "ai-pdm-prod-gh-a1b2c3d4-12345";
const previousRevision = "ai-pdm-prod-00010-quc";
const candidateService = {
  name: serviceName,
  generation: "12",
  latestCreatedRevision: `${serviceName}/revisions/${candidateRevision}`,
  latestReadyRevision: `${serviceName}/revisions/${candidateRevision}`,
  template: { containers: [{ name: "ai-pdm", image: "example.invalid/app@sha256:fixture" }] },
  traffic: [
    { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: previousRevision, percent: 100 },
    { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: candidateRevision, percent: 0, tag: "candidate" }
  ]
};

record("PROD-PIPE-001 WIF is keyless and pinned to immutable repository identities", () => {
  for (const value of ["1260972060", "257207597", "refs/heads/main", "assertion.environment == \"production\"", "token.actions.githubusercontent.com"]) {
    assert.match(deploymentBoundary, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(identity, /private_key|credentials_json|service_account_key/iu);
});

record("PROD-PIPE-002 WIF trusts only the tracked production workflow", () => {
  assert.match(deploymentBoundary, /deploy-production\.yml@refs\/heads\/main/u);
  assert.match(identity, /roles\/iam\.workloadIdentityUser/u);
  assert.match(workflow, /environment:\s*\n\s+name: production/u);
});

record("PROD-PIPE-003 deployer permissions are resource-scoped and exclude data administration", () => {
  for (const role of ["roles/artifactregistry.writer", "roles/run.developer", "roles/iam.serviceAccountUser"]) {
    assert.match(identity, new RegExp(role.replace("/", "\\/"), "u"));
  }
  assert.doesNotMatch(identity, /roles\/(?:owner|editor|run\.admin|firebase\.admin|cloudsql\.admin|secretmanager\.admin|resourcemanager\.projectIamAdmin)/u);
  assert.match(identity, /google_artifact_registry_repository_iam_member/u);
  assert.match(identity, /google_cloud_run_v2_service_iam_member/u);
});

record("PROD-PIPE-004 Terraform and CD split only the application image field", () => {
  assert.match(runtime, /ignore_changes\s*=\s*\[template\[0\]\.containers\[0\]\.image\]/u);
  assert.doesNotMatch(runtime, /ignore_changes\s*=\s*all/u);
  assert.match(locals, /DEV-032-PRODUCTION-GITHUB-WIF-DEPLOYMENT-APPROVED/u);
  assert.match(locals, /"sts\.googleapis\.com"/u);
});

record("PROD-PIPE-005 workflow requires exact main commit, typed approval, and GitHub environment", () => {
  assert.match(workflow, /DEPLOY-AI-PDM-PRODUCTION/u);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/u);
  assert.match(workflow, /\[a-f0-9\]\{40\}/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /PDM_QC_PHASE2B_SKIP_STAGING_PREFLIGHT/u);
  assert.match(candidateWorkflow, /\$PSNativeCommandUseErrorActionPreference = \$true/u);
  assert.match(candidateWorkflow, /npx playwright install chromium/u);
  assert.ok(candidateWorkflow.indexOf("npx playwright install chromium") < candidateWorkflow.indexOf("npm run qc:pdm-account-invitations"));
});

record("PROD-PIPE-006 workflow uses OIDC actions and no stored Google credential", () => {
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /google-github-actions\/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3/u);
  assert.match(workflow, /google-github-actions\/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db # v3/u);
  assert.match(workflow, /actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4/u);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4/u);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4/u);
  assert.doesNotMatch(workflow, /credentials_json|GCP_CREDENTIALS|service-account\.json/iu);
});

record("PROD-PIPE-007 workflow builds immutable provenance and forbids source deploy", () => {
  assert.match(workflow, /SOURCE_REVISION="\$GITHUB_SHA"/u);
  assert.match(workflow, /image_summary\.digest/u);
  assert.match(workflow, /IMAGE_PATH@\$DIGEST/u);
  assert.match(workflow, /--target migration-runner/u);
  assert.match(workflow, /MIGRATION_PACKAGE_TARGET=production/u);
  assert.match(workflow, /schemaMigrationCount !== 54/u);
  assert.match(workflow, /063_production_smoke_tenant_isolation/u);
  assert.match(workflow, /migration-image\.txt/u);
  assert.doesNotMatch(workflow, /gcloud run deploy[\s\S]{0,500}--source/u);
});

record("PROD-PIPE-007B runner image includes standalone, static, and generated public assets", () => {
  assert.match(dockerfile, /COPY --from=builder --chown=nextjs:nodejs \/app\/\.next\/standalone \.\//u);
  assert.match(dockerfile, /COPY --from=builder --chown=nextjs:nodejs \/app\/\.next\/static \.\/\.next\/static/u);
  assert.match(dockerfile, /COPY --from=builder --chown=nextjs:nodejs \/app\/public \.\/public/u);
  assert.match(dockerIgnore, /^\.artifacts$/mu);
});

record("PROD-PIPE-008 candidate receives zero traffic and is tested by tag URL", () => {
  assert.match(workflow, /--no-traffic/u);
  assert.match(workflow, /--tag "\$TAG"/u);
  assert.match(workflow, /--kind candidate/u);
  assert.match(workflow, /\.percent \/\/ 0/u);
  assert.match(workflow, /select-production-serving-revision\.mjs/u);
  assert.match(runtime, /PDM_CANDIDATE_CLOUD_RUN_SERVICE/u);
  assert.match(runtime, /PDM_CANDIDATE_CLOUD_RUN_TAG/u);
  assert.match(workflow, /TAG="candidate"/u);
  assert.match(workflow, /--tag "\$TAG"/u);
  assert.match(workflow, /--update-env-vars "PDM_BUILD_COMMIT=\$GITHUB_SHA,PDM_CANDIDATE_CLOUD_RUN_SERVICE=\$CLOUD_RUN_SERVICE,PDM_CANDIDATE_CLOUD_RUN_TAG=\$TAG,\$CANDIDATE_RUNTIME_FLAGS"/u);
  assert.match(candidateWorkflow, /assert_revision_env PDM_BUILD_COMMIT "\$GITHUB_SHA"/u);
  assert.match(candidateWorkflow, /--update-secrets "PDM_WORKBENCH_CONTRACT_SECRET=pdm-workbench-contract:latest"/u);
  assert.match(candidateWorkflow, /assert_revision_secret PDM_WORKBENCH_CONTRACT_SECRET pdm-workbench-contract/u);
  assert.match(runtime, /name = "PDM_WORKBENCH_CONTRACT_SECRET"/u);
  assert.match(runtime, /google_secret_manager_secret\.session_signing\["pdm-workbench-contract"\]/u);
  assert.match(security, /roles\/secretmanager\.secretAccessor/u);
  for (const flag of [
    "PDM_NUMBER_STATE_FLOW_V1",
    "PDM_NUMBER_LIFECYCLE_V2",
    "PDM_UNIFIED_DRAWING_WORKBENCH_V1",
    "PDM_DRAWING_RECOGNITION_V1",
    "PDM_REVIEW_PACKAGE_V2_WRITE",
    "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
    "PDM_UNIFIED_ENTITY_DETAIL_V1",
    "PDM_DRAWING_REVISION_LIFECYCLE_MODE"
  ]) {
    assert.match(workflow, new RegExp(flag, "u"));
    assert.match(runtime, new RegExp(flag, "u"));
  }
  assert.match(candidateWorkflow, /npm run qc:dev-079:contract/u);
  assert.match(candidateWorkflow, /npm run qc:dev-079:owner-invariant/u);
  assert.match(candidateWorkflow, /npm run qc:dev-101:contract/u);
  assert.match(candidateWorkflow, /npm run qc:dev-101:package/u);
  assert.match(candidateWorkflow, /npm run qc:dev-101:qa-integrity/u);
  assert.match(candidateWorkflow, /npm run qc:pdm-production-slice-numbering-draft/u);
  assert.match(candidateWorkflow, /npm run qc:pdm-number-state-flow-routes/u);
  assert.match(candidateWorkflow, /npm run qc:dev-093:contract/u);
  assert.match(candidateWorkflow, /npm run qc:production-authority-repair/u);
  assert.match(candidateWorkflow, /063_production_smoke_tenant_isolation\.cloudsql\.sql/u);
  assert.match(candidateWorkflow, /schemaMigrationCount !== 54/u);
  assert.match(candidateWorkflow, /assert_revision_env PDM_DRAWING_REVISION_LIFECYCLE_MODE enforced/u);
  assert.match(smoke, /origin reaches token validation/u);
});

record("PROD-PIPE-008A clean-source CI runs deterministic primary-data QA", () => {
  assert.match(ciWorkflow, /\$ErrorActionPreference\s*=\s*"Stop"/u);
  assert.match(ciWorkflow, /\$PSNativeCommandUseErrorActionPreference\s*=\s*\$true/u);
  assert.match(ciWorkflow, /npm run qc:dev-079:owner-invariant/u);
  assert.match(ciWorkflow, /npm run qc:dev-101:package/u);
  assert.match(ciWorkflow, /npm run qc:dev-101:qa-integrity/u);
});

record("PROD-PIPE-008B prepare, candidate, and promotion are separate dispatch stages", () => {
  assert.match(workflow, /default: prepare/u);
  assert.match(workflow, /type: choice/u);
  assert.match(prepareWorkflow, /if: \$\{\{ inputs\.stage == 'prepare' \}\}/u);
  assert.match(zeroTrafficCandidateWorkflow, /if: \$\{\{ inputs\.stage == 'candidate' \}\}/u);
  assert.match(promotionWorkflow, /if: \$\{\{ inputs\.stage == 'promote' \}\}/u);
  assert.match(prepareWorkflow, /Build and push immutable application image/u);
  assert.match(prepareWorkflow, /Build, verify, and push immutable production migration image/u);
  assert.doesNotMatch(prepareWorkflow, /gcloud run deploy/u);
  assert.doesNotMatch(zeroTrafficCandidateWorkflow, /docker build/u);
  assert.match(zeroTrafficCandidateWorkflow, /IMAGE_PATH@\$APPLICATION_IMAGE_DIGEST/u);
  assert.doesNotMatch(zeroTrafficCandidateWorkflow, /--mode promote-latest/u);
});

record("PROD-PIPE-008E candidate is blocked without bound migration, smoke-principal, cost, and side-effect evidence", () => {
  assert.match(workflow, /production-migration:\/\/<release_commit>\/<manifest_sha256>\/<migration_digest>\/<immutable-id>/u);
  assert.match(workflow, /production-smoke-principal:\/\/company-smoke\/<subject_hash>\/<immutable-id>/u);
  assert.match(workflow, /production-dev010:\/\/jenfu-ai-pdm-prod\/<source_aggregate_sha256>\/<immutable-id>/u);
  assert.match(workflow, /production-smoke-cost:\/\/<release_commit>\/<immutable-id>/u);
  assert.match(zeroTrafficCandidateWorkflow, /MIGRATION_PREFIX="production-migration:\/\/\$\{RELEASE_COMMIT\}\/\$\{MIGRATION_MANIFEST_SHA256\}\/\$\{MIGRATION_DIGEST_HEX\}\/"/u);
  assert.match(zeroTrafficCandidateWorkflow, /DEV010_RELEASE_EVIDENCE_REF/u);
  assert.match(zeroTrafficCandidateWorkflow, /report\.manifestSha256 !== expected/u);
  assert.match(zeroTrafficCandidateWorkflow, /PDM_SMOKE_GCS_WRITER=disabled/u);
  assert.match(zeroTrafficCandidateWorkflow, /PDM_SMOKE_OUTBOX_CONSUMER=disabled/u);
  assert.match(zeroTrafficCandidateWorkflow, /PDM_SMOKE_EXTERNAL_NOTIFICATION=disabled/u);
  assert.match(zeroTrafficCandidateWorkflow, /run-dev-116-release-cost-gate\.mjs/u);
  assert.match(zeroTrafficCandidateWorkflow, /ACTUAL_COST_EVIDENCE_REF/u);
  assert.match(zeroTrafficCandidateWorkflow, /for isolation_flag in PDM_SMOKE_GCS_WRITER PDM_SMOKE_OUTBOX_CONSUMER PDM_SMOKE_EXTERNAL_NOTIFICATION/u);
  for (const flag of ["PDM_SMOKE_GCS_WRITER", "PDM_SMOKE_OUTBOX_CONSUMER", "PDM_SMOKE_EXTERNAL_NOTIFICATION"]) {
    assert.match(runtime, new RegExp(flag, "u"));
    assert.match(promotionWorkflow, new RegExp(flag, "u"));
  }
  assert.match(candidateWorkflow, /npm run qc:dev-010:n2:ai-pdm/u);
  assert.match(candidateWorkflow, /npm run qc:dev-116/u);
  assert.match(candidateWorkflow, /DEV116_CI_SOURCE_ROOT_OUTSIDE_RUNNER_TEMP/u);
  assert.match(candidateWorkflow, /npm run db:init/u);
  assert.match(candidateWorkflow, /--primary-database="\$dev116DataDir\/ai-pdm\.sqlite"/u);
  assert.match(candidateWorkflow, /Remove-Item -LiteralPath \$dev116Root -Recurse -Force/u);
});

record("PROD-PIPE-008C promotion requires candidate-bound Level 4 and explicit release approval without Wave 0 ceremony", () => {
  assert.match(workflow, /production-candidate:\/\/<candidate_revision>\/<release_commit>\/<immutable-id>/u);
  assert.match(promotionWorkflow, /EXPECTED_EVIDENCE_PREFIX="production-candidate:\/\/\$\{CANDIDATE_REVISION\}\/\$\{RELEASE_COMMIT\}\/"/u);
  assert.match(promotionWorkflow, /\[\[ "\$LEVEL4_EVIDENCE_REF" == "\$EXPECTED_EVIDENCE_PREFIX"\* \]\]/u);
  assert.match(promotionWorkflow, /\[\[ "\$\{LEVEL4_EVIDENCE_REF,,\}" != \*staging\* \]\]/u);
  assert.doesNotMatch(workflow, /wave0_users|wave0_mode|wave0_waiver_ref|WAVE0-WAIVER|WAVE0_USERS|WAVE0_MODE|WAVE0_WAIVER_REF/iu);
  assert.match(promotionWorkflow, /PRODUCT_OWNER_DECISION/u);
  assert.match(promotionWorkflow, /AI-PDM-PRODUCTION-PROMOTION-APPROVED/u);
  assert.match(promotionWorkflow, /\[\[ "\$PRODUCT_OWNER_DECISION" == "go" \]\]/u);
  assert.match(promotionWorkflow, /\[\[ "\$PROMOTION_APPROVAL" == "AI-PDM-PRODUCTION-PROMOTION-APPROVED" \]\]/u);
  assert.match(dev116R02Receipt, /jenfu\.dev116\.r02\.production-candidate-receipt\.v1/u);
  assert.match(dev116R02Receipt, /QA-116-R02/u);
  assert.match(dev116R02Receipt, /production-candidate-level4/u);
  assert.match(dev116R02Receipt, /company-smoke/u);
  assert.match(dev116R02Receipt, /production_smoke/u);
  assert.match(dev116R02Receipt, /trafficPercent !== 0/u);
  assert.match(dev116R02Receipt, /beforeSha256 !== receipt\.jenfuInvariant\.afterSha256/u);
  assert.match(dev116R02Receipt, /zeroLeakCount !== 0/u);
  assert.match(dev116R02Receipt, /value !== 'disabled'/u);
  assert.match(dev116R02ReceiptCli, /--execute/u);
  assert.match(dev116R02ReceiptCli, /--deploy/u);
  assert.match(dev116R02ReceiptCli, /--migrate/u);
  assert.match(dev116R02ReceiptCli, /--promote/u);
  assert.doesNotMatch(smoke, /production-candidate-level4/u);
});

record("PROD-PIPE-008F authenticated R02 is preflight-bound UI evidence joined with independent provider evidence", () => {
  assert.match(dev116R02BrowserLibrary, /READY_FOR_R1_REHEARSAL/u);
  assert.match(dev116R02BrowserLibrary, /jenfu-platform-prod/u);
  assert.match(dev116R02BrowserLibrary, /trafficPercent !== 0/u);
  assert.match(dev116R02BrowserLibrary, /DEV-116-R02-AUTHENTICATED-CANDIDATE-WRITE-APPROVED/u);
  assert.match(dev116R02Browser, /getByRole\('link', \{ name: '建立編號'/u);
  assert.match(dev116R02Browser, /waitForResponse/u);
  assert.doesNotMatch(dev116R02Browser, /fetch\s*\(|page\.request|request\.post|gcloud|terraform/iu);
  assert.match(dev116R02Finalize, /joinDev116R02Evidence/u);
  assert.match(dev116R02Finalize, /buildDev116R02Receipt/u);
  assert.doesNotMatch(dev116R02Finalize, /chromium|fetch\s*\(|gcloud|terraform|promote|migrate|deploy/iu);
  for (const view of [
    "v_r1_company_scope_v1",
    "v_r1_numbering_objects_v1",
    "v_r1_numbering_relations_v1",
    "v_r1_sequence_state_v1",
    "v_r1_numbering_create_audit_v1",
    "v_r1_command_effect_v1"
  ]) assert.match(dev010NeutralMigration, new RegExp(`CREATE OR REPLACE VIEW ai_pdm_contract\\.${view}`, "u"));
  assert.match(dev010NeutralMigration, /GRANT SELECT ON TABLE[\s\S]+v_r1_command_effect_v1[\s\S]+TO jenfu_r1_verifier/u);
  assert.doesNotMatch(dev010NeutralMigration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]+ai_pdm_core\.[^;]+jenfu_r1_verifier/iu);
});

record("PROD-PIPE-008D promotion rechecks candidate zero traffic and immutable image provenance", () => {
  assert.match(promotionWorkflow, /CANDIDATE_PERCENT/u);
  assert.match(promotionWorkflow, /\[\[ "\$CANDIDATE_PERCENT" == "0" \]\]/u);
  assert.match(promotionWorkflow, /image_summary\.digest/u);
  assert.match(promotionWorkflow, /CANDIDATE_IMAGE/u);
  assert.match(promotionWorkflow, /\[\[ "\$CANDIDATE_IMAGE" == "\$EXPECTED_IMAGE" \]\]/u);
  assert.match(promotionWorkflow, /assert_revision_env PDM_DRAWING_REVISION_LIFECYCLE_MODE enforced/u);
  assert.match(promotionWorkflow, /assert_revision_env PDM_BUILD_COMMIT "\$RELEASE_COMMIT"/u);
  assert.match(promotionWorkflow, /assert_revision_secret PDM_WORKBENCH_CONTRACT_SECRET pdm-workbench-contract/u);
});

record("PROD-PIPE-009 promotion and rollback use reviewed traffic-only REST runner", () => {
  assert.match(workflow, /--mode promote-latest/u);
  assert.match(workflow, /--mode rollback-revision/u);
  assert.match(workflow, /failure\(\).*candidate_revision/u);
  assert.doesNotMatch(workflow, /gcloud run services update-traffic/u);
});

record("PROD-PIPE-010 Firebase Hosting origin is smoked after promotion", () => {
  assert.match(workflow, /https:\/\/jenfu-ai-pdm-prod\.web\.app/u);
  assert.match(workflow, /--kind canonical/u);
  assert.match(smoke, /\/api\/auth\/mode/u);
  assert.match(smoke, /\/api\/production-slice\/status/u);
  assert.match(smoke, /legacy redirect \/handoff/u);
  assert.match(smoke, /\/technical-transfer/u);
  assert.match(smoke, /legacyFrom/u);
  assert.match(smoke, /direct run\.app session exchange denied/u);
});

record("PROD-PIPE-011 release traffic body is traffic-only", () => {
  assert.deepEqual(buildReleaseTrafficPatch("latest"), {
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
  });
  assert.deepEqual(buildReleaseTrafficPatch("revision", previousRevision), {
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: previousRevision, percent: 100 }]
  });
});

record("PROD-PIPE-012 candidate snapshot accepts one zero-percent tag and one serving revision", () => {
  const snapshot = snapshotReleaseService(candidateService);
  assert.equal(snapshot.traffic.length, 2);
  assert.equal(snapshot.traffic.reduce((total, item) => total + item.percent, 0), 100);
});

record("PROD-PIPE-013 traffic transition rejects template and revision drift", () => {
  const before = snapshotReleaseService(candidateService);
  const promoted = snapshotReleaseService({
    ...candidateService,
    generation: "13",
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
  });
  assert.equal(assertReleaseTrafficTransition(before, promoted, { kind: "latest" }), true);
  const drifted = snapshotReleaseService({
    ...candidateService,
    template: { containers: [{ name: "ai-pdm", image: "example.invalid/changed" }] },
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
  });
  assert.throws(() => assertReleaseTrafficTransition(before, drifted, { kind: "latest" }), /TEMPLATE_DRIFT/u);
});

record("PROD-PIPE-014 traffic mutation requires exact target and approval environment", () => {
  assert.deepEqual(PRODUCTION_RELEASE_TARGET, { project: "jenfu-ai-pdm-prod", region: "asia-east1", service: "ai-pdm-prod" });
  const env = {
    PDM_PRODUCTION_RELEASE_TRAFFIC_APPROVAL: PRODUCTION_RELEASE_TRAFFIC_APPROVAL,
    PDM_PRODUCTION_PROJECT_ID: PRODUCTION_RELEASE_TARGET.project,
    PDM_PRODUCTION_REGION: PRODUCTION_RELEASE_TARGET.region,
    PDM_PRODUCTION_SERVICE: PRODUCTION_RELEASE_TARGET.service,
    PDM_PRODUCTION_EXPECTED_LATEST_REVISION: candidateRevision
  };
  assert.doesNotThrow(() => assertReleaseExecutionEnvironment(candidateRevision, env));
  assert.throws(() => assertReleaseExecutionEnvironment(candidateRevision, { ...env, PDM_PRODUCTION_PROJECT_ID: "wrong" }));
});

record("PROD-PIPE-015 package exposes release and QC commands", () => {
  assert.equal(packageJson.scripts?.["production:release-traffic"], "node scripts/run-production-release-traffic.mjs");
  assert.equal(packageJson.scripts?.["production:release-smoke"], "node scripts/run-production-release-smoke.mjs");
  assert.equal(packageJson.scripts?.["production:smoke-cost-gate"], "node scripts/run-dev-116-release-cost-gate.mjs");
  assert.equal(packageJson.scripts?.["dev-116:r02-receipt"], "node scripts/dev116-r02-receipt.mjs");
  assert.equal(packageJson.scripts?.["test:dev-116:r02-receipt"], "node --test scripts/dev116-r02-receipt.test.mjs");
  assert.equal(packageJson.scripts?.["dev-116:r02-browser"], "node scripts/run-dev116-r02-authenticated-browser.mjs");
  assert.equal(packageJson.scripts?.["test:dev-116:r02-browser"], "node --test scripts/dev116-r02-browser-executor.test.mjs");
  assert.equal(packageJson.scripts?.["dev-116:r02-finalize"], "node scripts/dev116-r02-finalize.mjs");
  assert.equal(packageJson.scripts?.["qc:production-deployment-pipeline"], "node scripts/qc-production-deployment-pipeline.mjs");
});

record("PROD-PIPE-016 tagged 100 percent revision remains the rollback baseline", () => {
  const taggedService = {
    status: {
      traffic: [
        { revisionName: "ai-pdm-prod-00010-quc", tag: "old-hotfix" },
        { revisionName: previousRevision, percent: 100, tag: "hotfix-3ab5cffa" }
      ]
    }
  };
  assert.equal(selectProductionServingRevision(taggedService), previousRevision);
  assert.throws(
    () => selectProductionServingRevision({ status: { traffic: [] } }),
    /PRODUCTION_SERVING_REVISION_COUNT_INVALID:0/u
  );
  assert.throws(
    () => selectProductionServingRevision({
      status: {
        traffic: [
          { revisionName: previousRevision, percent: 100 },
          { revisionName: candidateRevision, percent: 100 }
        ]
      }
    }),
    /PRODUCTION_SERVING_REVISION_COUNT_INVALID:2/u
  );
});

record("PROD-PIPE-017 traffic convergence polling stays within service-scoped permissions", () => {
  const promoted = snapshotReleaseService({
    ...candidateService,
    generation: "13",
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }]
  });
  const rolledBack = snapshotReleaseService({
    ...candidateService,
    generation: "14",
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: previousRevision, percent: 100 }]
  });
  assert.equal(isReleaseTrafficApplied(candidateService, { kind: "latest" }), false);
  assert.equal(isReleaseTrafficApplied(promoted, { kind: "latest" }), true);
  assert.equal(isReleaseTrafficApplied(rolledBack, { kind: "revision", revision: previousRevision }), true);
  assert.match(trafficRunner, /waitForReleaseTraffic/u);
  assert.doesNotMatch(trafficRunner, /waitForOperation|operation\.name/u);
});

record("PROD-PIPE-018 production workflows are classified as included release governance", () => {
  assert.match(releaseSourceManifestUtils, /filePath\.startsWith\("\.github\/workflows\/"\)/u);
  assert.match(releaseSourceManifestUtils, /CI\/CD workflow is part of the reviewed production release contract/u);
});

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nProduction deployment pipeline QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
