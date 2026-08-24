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
const candidateWorkflow = workflow.split("\n  promote:")[0];
const promotionWorkflow = workflow.split("\n  promote:")[1] ?? "";
const identity = read("infra/google-cloud/production/deployment-identity.tf");
const runtime = read("infra/google-cloud/production/runtime.tf");
const locals = read("infra/google-cloud/production/locals.tf");
const variables = read("infra/google-cloud/production/variables.tf");
const deploymentBoundary = `${identity}\n${locals}\n${variables}`;
const smoke = read("scripts/run-production-release-smoke.mjs");
const trafficRunner = read("scripts/run-production-release-traffic.mjs");
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
  assert.match(workflow, /schemaMigrationCount !== 38/u);
  assert.match(workflow, /047_remove_bom_module/u);
  assert.match(workflow, /migration-image\.txt/u);
  assert.doesNotMatch(workflow, /gcloud run deploy[\s\S]{0,500}--source/u);
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
  assert.match(workflow, /--update-env-vars "PDM_CANDIDATE_CLOUD_RUN_SERVICE=\$CLOUD_RUN_SERVICE,PDM_CANDIDATE_CLOUD_RUN_TAG=\$TAG,\$CANDIDATE_RUNTIME_FLAGS"/u);
  for (const flag of [
    "PDM_NUMBER_STATE_FLOW_V1",
    "PDM_NUMBER_LIFECYCLE_V2",
    "PDM_UNIFIED_DRAWING_WORKBENCH_V1",
    "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
    "PDM_UNIFIED_ENTITY_DETAIL_V1",
    "PDM_DRAWING_REVISION_LIFECYCLE_MODE"
  ]) {
    assert.match(workflow, new RegExp(flag, "u"));
    assert.match(runtime, new RegExp(flag, "u"));
  }
  assert.match(candidateWorkflow, /assert_revision_env PDM_DRAWING_REVISION_LIFECYCLE_MODE enforced/u);
  assert.match(smoke, /origin reaches token validation/u);
});

record("PROD-PIPE-008B candidate and promotion are separate dispatch stages", () => {
  assert.match(workflow, /stage:\s*\n\s+description: candidate deploys with 0% traffic/u);
  assert.match(workflow, /type: choice/u);
  assert.match(candidateWorkflow, /if: \$\{\{ inputs\.stage == 'candidate' \}\}/u);
  assert.match(promotionWorkflow, /if: \$\{\{ inputs\.stage == 'promote' \}\}/u);
  assert.doesNotMatch(candidateWorkflow, /--mode promote-latest/u);
});

record("PROD-PIPE-008C promotion requires candidate-bound Level 4, Wave 0, and product-owner evidence", () => {
  assert.match(workflow, /production-candidate:\/\/<candidate_revision>\/<release_commit>\/<immutable-id>/u);
  assert.match(promotionWorkflow, /EXPECTED_EVIDENCE_PREFIX="production-candidate:\/\/\$\{CANDIDATE_REVISION\}\/\$\{RELEASE_COMMIT\}\/"/u);
  assert.match(promotionWorkflow, /\[\[ "\$LEVEL4_EVIDENCE_REF" == "\$EXPECTED_EVIDENCE_PREFIX"\* \]\]/u);
  assert.match(promotionWorkflow, /\[\[ "\$\{LEVEL4_EVIDENCE_REF,,\}" != \*staging\* \]\]/u);
  assert.match(promotionWorkflow, /wave0_users/u);
  assert.match(workflow, /wave0_mode:/u);
  assert.match(workflow, /wave0_waiver_ref:/u);
  assert.match(workflow, /WAVE0-WAIVER:\/\/<candidate_revision>\/<release_commit>\/<immutable-id>/u);
  assert.match(promotionWorkflow, /WAVE0_MODE/u);
  assert.match(promotionWorkflow, /WAVE0_WAIVER_REF/u);
  assert.match(promotionWorkflow, /\[\[ "\$WAVE0_MODE" == "tested" \|\| "\$WAVE0_MODE" == "waived" \]\]/u);
  assert.match(promotionWorkflow, /if \[\[ "\$WAVE0_MODE" == "tested" \]\]/u);
  assert.match(promotionWorkflow, /EXPECTED_WAIVER_PREFIX="WAVE0-WAIVER:\/\/\$\{CANDIDATE_REVISION\}\/\$\{RELEASE_COMMIT\}\/"/u);
  assert.match(promotionWorkflow, /\[\[ -z "\$WAVE0_USERS" \]\]/u);
  assert.match(promotionWorkflow, /PRODUCT_OWNER_DECISION/u);
  assert.match(promotionWorkflow, /AI-PDM-PRODUCTION-PROMOTION-APPROVED/u);
  assert.match(promotionWorkflow, /\$\{#users\[@\]\} >= 3 && \$\{#users\[@\]\} <= 5/u);
  assert.match(promotionWorkflow, /\[\[ "\$PRODUCT_OWNER_DECISION" == "go" \]\]/u);
});

record("PROD-PIPE-008D promotion rechecks candidate zero traffic and immutable image provenance", () => {
  assert.match(promotionWorkflow, /CANDIDATE_PERCENT/u);
  assert.match(promotionWorkflow, /\[\[ "\$CANDIDATE_PERCENT" == "0" \]\]/u);
  assert.match(promotionWorkflow, /image_summary\.digest/u);
  assert.match(promotionWorkflow, /CANDIDATE_IMAGE/u);
  assert.match(promotionWorkflow, /\[\[ "\$CANDIDATE_IMAGE" == "\$EXPECTED_IMAGE" \]\]/u);
  assert.match(promotionWorkflow, /assert_revision_env PDM_DRAWING_REVISION_LIFECYCLE_MODE enforced/u);
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

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nProduction deployment pipeline QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
