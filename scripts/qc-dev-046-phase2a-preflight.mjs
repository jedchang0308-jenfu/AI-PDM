#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { buildPhase2APreflight } from "./dev-046-phase2a-preflight.mjs";

const root = process.cwd();
const results = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const report = buildPhase2APreflight();
const manifest = JSON.parse(read("config/platform/staging-preflight.template.json"));
const costBudget = JSON.parse(read("config/platform/cost-budget.template.json"));
const readme = read("infra/google-cloud/staging/README.md");
const tfvars = read("infra/google-cloud/staging/terraform.tfvars.example");
const allTf = fs.readdirSync(path.join(root, "infra/google-cloud/staging"))
  .filter((name) => name.endsWith(".tf"))
  .map((name) => read(`infra/google-cloud/staging/${name}`))
  .join("\n");

record("DEV046-2A-001 local static contract passes", report.localStaticContractPassed && report.summary.checksPassed === report.summary.checksTotal);
record("DEV046-2A-002 preflight is blocked expected rather than falsely ready", report.result === "blocked_expected" && report.safeToCreateResources === false);
record("DEV046-2A-003 credential lookup is explicitly absent", report.tooling.credentialLookupPerformed === false && manifest.credentialAccessAllowed === false);
record("DEV046-2A-004 resource billing DNS and apply actions remain disabled", [manifest.resourceCreationEnabled, manifest.terraformApplyAllowed, manifest.billingMutationAllowed, manifest.dnsMutationAllowed].every((value) => value === false));
record("DEV046-2A-005 all modeled Google resources are guarded", report.summary.terraformResourceCount >= 25 && report.checks.find((item) => item.id === "P2A-IAC-002")?.passed === true);
record("DEV046-2A-006 default tfvars cannot create resources", tfvars.includes("enable_resource_creation       = false") && tfvars.includes("enable_secret_container_bootstrap = false") && tfvars.includes('phase2_apply_acknowledgement   = ""'));
record("DEV046-2A-007 no auto tfvars or state is committed", !fs.readdirSync(path.join(root, "infra/google-cloud/staging")).some((name) => /(?:\.auto\.tfvars|\.tfstate)/u.test(name)));
record("DEV046-2A-008 backend has no embedded state bucket", allTf.includes('backend "gcs" {}') && !allTf.includes("ASSIGN_EXISTING_STAGING_TERRAFORM_STATE_BUCKET"));
record("DEV046-2A-009 private single-zone prelaunch Cloud SQL gate exists", allTf.includes('availability_type           = "ZONAL"') && allTf.includes("point_in_time_recovery_enabled = true") && allTf.includes("ipv4_enabled                                  = false") && manifest.costGuard.productionAvailabilityType === "ZONAL");
record("DEV046-2A-010 runtime and migration identities are separate", allTf.includes('account_id   = "pdm-runtime-stg"') && allTf.includes('account_id   = "pdm-migration-stg"'));
record("DEV046-2A-011 automatic IAM DB auth has both required roles", allTf.includes('"roles/cloudsql.client"') && allTf.includes('"roles/cloudsql.instanceUser"') && allTf.includes("--auto-iam-authn"));
record("DEV046-2A-012 app and API traffic cannot be CDN cached", allTf.includes('enable_cdn            = false') && allTf.includes('paths   = ["/_next/static/*"]'));
record("DEV046-2A-013 file authority remains deferred", !allTf.includes('resource "google_storage_bucket"') && readme.includes("Phase 3B scope"));
record("DEV046-2A-014 OAuth client secret is kept out of Terraform state", !allTf.includes("google_identity_platform_default_supported_idp_config") && readme.includes("OAuth client secret") && readme.includes("state"));
record("DEV046-2A-015 Firebase Web config and Google provider evidence are present without storing OAuth secret in Terraform", !report.blockers.includes("LIVE_FIREBASE_IDENTITY_ADAPTER_NOT_IMPLEMENTED") && !report.blockers.includes("PDM_AUTH_MODE_DOES_NOT_YET_ACCEPT_FIREBASE_BFF") && !report.blockers.includes("FIREBASE_WEB_APP_CONFIG_MISSING") && !report.blockers.includes("FIREBASE_HOSTING_AUTH_DOMAIN_CROSS_ORIGIN") && manifest.target.firebaseAuthDomain === `${manifest.target.stagingProjectId}.web.app` && tfvars.includes(`firebase_auth_domain           = "${manifest.target.stagingProjectId}.web.app"`) && manifest.phase2Bootstrap.firebaseProjectAdded === true && manifest.phase2Bootstrap.firebaseWebApp.apiKeyRestrictionVerified === true && manifest.phase2Bootstrap.firebaseGoogleProvider?.enabled === true && manifest.phase2Bootstrap.firebaseGoogleProvider?.terraformStateStoresOAuthSecret === false && !report.blockers.includes("FIREBASE_GOOGLE_PROVIDER_CONFIG_MISSING"));
record("DEV046-2A-016 privacy v1.0 approval and local acknowledgement implementation are present without staging overclaim", !report.blockers.some((item) => item.startsWith("NAMED_OWNER_MISSING:")) && manifest.approvals.privacyNoticeApproved === true && !report.blockers.includes("EMPLOYEE_PRIVACY_NOTICE_APPROVAL_MISSING") && !report.blockers.includes("PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED") && report.blockers.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING") && report.blockers.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING"));
record("DEV046-2A-017 provider paths, controlled non-Google account and non-authenticating employee alias boundary remain visible", manifest.testAccounts.googleWorkspaceUsers.length > 0 && manifest.testAccounts.controlledNonGoogleUser === "nokai520@hotmail.com" && manifest.testAccounts.controlledNonGoogleUserEvidenceSource === "explicit-user-provided-test-account" && !report.blockers.includes("CONTROLLED_NON_GOOGLE_TEST_ACCOUNT_MISSING") && manifest.identityLogin.employeeLoginAliasEnabled === true && manifest.identityLogin.employeeLoginAliasAuthenticatesUser === false && manifest.identityLogin.applicationPasswordStorageAllowed === false && !report.blockers.includes("EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED"));
record("DEV046-2A-018 _Default sink import evidence is recorded", manifest.phase2Bootstrap.defaultLogSinkImported === true && !report.blockers.includes("DEFAULT_LOG_SINK_IMPORT_EVIDENCE_MISSING") && readme.includes("has been imported"));
record(
  "DEV046-2A-019 approved DEV-069 low-cost forecast clears cost stop while remaining gates keep apply disabled",
  manifest.approvals.paymentActivationApproved === true &&
    manifest.approvals.resourceCreationApproved === true &&
    manifest.approvals.changeTicket === "CHG-DEV046-PHASE2B-20260714" &&
    manifest.readOnlyDiscovery.billingObservedState === "paid-account-payment-method-valid" &&
    manifest.readOnlyDiscovery.billingStatusEvidenceSource === "human-reported-cloud-console" &&
    !report.blockers.includes("PAYMENT_ACTIVATION_NOT_AUTHORIZED") &&
    !report.blockers.includes("RESOURCE_CREATION_NOT_AUTHORIZED") &&
    !report.blockers.includes("APPROVED_CHANGE_TICKET_MISSING") &&
    manifest.phase2Bootstrap.credentialledFullPlan?.stopConditionPassed === true &&
    manifest.phase2Bootstrap.terraformApply?.completed === true &&
    manifest.phase2Bootstrap.terraformApply?.noOpPlanVerified === true &&
    manifest.phase2Bootstrap.applicationRuntimeResourcesCreated === true &&
    !report.blockers.includes("CREDENTIALLED_TERRAFORM_PLAN_NOT_REQUESTED") &&
    manifest.approvals.publicDnsDeferredForInternalPilot === true &&
    manifest.phase2Bootstrap.managedTls?.requiredForCurrentInternalPilot === false &&
    manifest.phase2Bootstrap.internalPilotAccess?.status === "firebase-hosting-live-smoke-passed" &&
    manifest.phase2Bootstrap.internalPilotAccess?.blocker === null &&
    manifest.phase2Bootstrap.firebaseHosting?.liveUrl === "https://jenfu-ai-pdm-stg-361825.web.app" &&
    manifest.phase2Bootstrap.runtimeSmoke?.status === "passed" &&
    !report.blockers.includes("STAGING_INTERNAL_HTTPS_ENTRYPOINT_NOT_CONFIGURED") &&
    !report.blockers.includes("STAGING_RUNTIME_SMOKE_NOT_EXECUTED") &&
    report.blockers.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING") &&
    report.blockers.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING") &&
    !report.blockers.includes("STAGING_DNS_A_RECORD_AND_MANAGED_TLS_EVIDENCE_MISSING") &&
    !report.blockers.includes("COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP") &&
    costBudget.currentForecast.estimatedMonthlyUsd === 30 &&
    costBudget.currentForecast.stopTriggered === false &&
    manifest.phase2Bootstrap.remoteStateAccessVerified === true &&
    (report.tooling.docker.installed === true || report.tooling.terraform.installed === true || Boolean(manifest.phase2Bootstrap.terraformExecutor)) &&
    !report.blockers.includes("TERRAFORM_STATE_BUCKET_MISSING") &&
    !report.blockers.includes("TERRAFORM_STATE_ACCESS_EVIDENCE_MISSING") &&
    !report.blockers.includes("LOCAL_TERRAFORM_CLI_MISSING_DOCKER_VALIDATION_AVAILABLE") &&
    !report.blockers.includes("TERRAFORM_EXECUTOR_MISSING") &&
    manifest.resourceCreationEnabled === false &&
    manifest.terraformApplyAllowed === false
);
record("DEV046-2A-020 ProJED is absent from IaC", !/projed/iu.test(allTf));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 2A QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
