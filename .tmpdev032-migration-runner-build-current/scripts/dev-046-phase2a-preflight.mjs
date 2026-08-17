#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const args = new Set(process.argv.slice(2));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function commandVersion(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, CHECKPOINT_DISABLE: "1" }
  });
  if (result.error?.code === "ENOENT") return { installed: false, version: null };
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return { installed: result.status === 0, version: output.split(/\r?\n/u)[0] || null };
}

function placeholder(value) {
  return typeof value !== "string" || !value.trim() || value.startsWith("ASSIGN_") || value === "000000-000000-000000";
}

function terraformSources(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".tf"))
    .sort()
    .map((name) => ({ name, source: fs.readFileSync(path.join(directory, name), "utf8") }));
}

function check(id, passed, detail) {
  return { id, passed: Boolean(passed), detail };
}

export function buildPhase2APreflight() {
  const manifest = json("config/platform/staging-preflight.template.json");
  const costBudget = json("config/platform/cost-budget.template.json");
  const cloudRun = json("config/platform/cloud-run.contract.json");
  const cloudSqlAccess = json("config/platform/cloud-sql-access.json");
  const continuity = json("config/platform/support-continuity.template.json");
  const packageJson = json("package.json");
  const authConfig = read("src/lib/auth-config.ts");
  const iacDirectory = path.join(root, manifest.iac.root);
  const tfEntries = terraformSources(iacDirectory);
  const tf = tfEntries.map((entry) => entry.source).join("\n");
  const resourceCount = (tf.match(/^resource\s+"google_/gmu) ?? []).length;
  const guardedResourceCount = (tf.match(/^\s*(?:count|for_each)\s*=.*local\.create_resources.*\?/gmu) ?? []).length;
  const terraform = commandVersion("terraform", ["version"]);
  const docker = commandVersion("docker", ["version", "--format", "{{.Server.Version}}"]);
  const gcloud = commandVersion("gcloud", ["version", "--format=value(core.sdk_version)"]);
  const priorTerraformExecutionEvidence =
    typeof manifest.phase2Bootstrap?.terraformExecutor === "string" &&
    manifest.phase2Bootstrap.terraformExecutor.length > 0 &&
    manifest.phase2Bootstrap?.terraformApply?.noOpPlanVerified === true;
  const firebaseApplicationReady =
    packageJson.dependencies.firebase !== undefined &&
    packageJson.dependencies["firebase-admin"] !== undefined &&
    authConfig.includes('"firebase_bff"') &&
    fs.existsSync(path.join(root, "src/lib/firebase-admin-identity-provider.ts")) &&
    fs.existsSync(path.join(root, "src/app/api/auth/firebase/session/route.ts"));
  const employeeLoginAliasReady =
    packageJson.scripts["qc:dev-046-login-alias"] !== undefined &&
    read("db/schema.sql").includes("employee_login_aliases") &&
    fs.existsSync(path.join(root, "db/postgres/014_employee_login_aliases.sql")) &&
    fs.existsSync(path.join(root, "src/lib/repositories/employee-login-alias-async-repository.ts")) &&
    fs.existsSync(path.join(root, "src/app/api/auth/employee-login-intents/route.ts")) &&
    read("src/app/api/auth/firebase/session/route.ts").includes("consumeEmployeeLoginIntentAsync") &&
    read("src/app/login/page.tsx").includes("公司電子郵件或工號") &&
    read("src/app/settings/accounts/page.tsx").includes("工號／登入別名");
  const privacyNoticeReady =
    packageJson.scripts["qc:dev-046-privacy-ack"] !== undefined &&
    read("db/schema.sql").includes("privacy_notice_acknowledgements") &&
    fs.existsSync(path.join(root, "db/postgres/015_employee_privacy_notice_acknowledgements.sql")) &&
    fs.existsSync(path.join(root, "src/lib/repositories/privacy-notice-async-repository.ts")) &&
    fs.existsSync(path.join(root, "src/app/api/privacy/acknowledgements/current/route.ts")) &&
    fs.existsSync(path.join(root, "src/app/privacy/page.tsx")) &&
    fs.existsSync(path.join(root, "src/app/privacy/acknowledgement/page.tsx")) &&
    read("src/app/api/auth/firebase/session/route.ts").includes("finalizePrivacyAccessAsync") &&
    read("src/app/settings/accounts/page.tsx").includes("個人資料告知確認");
  const costForecastStopTriggered =
    costBudget.currentForecast?.stopTriggered === true ||
    Number(costBudget.currentForecast?.estimatedMonthlyUsd) > Number(costBudget.planReviewStopAtUsd);

  const checks = [
    check("P2A-LOCAL-001", manifest.schemaVersion === 1 && manifest.dev === "DEV-046" && manifest.phase === "Phase-2A-staging-preflight", "preflight manifest identity"),
    check("P2A-LOCAL-002", manifest.executionMode === "local-static-only" && manifest.resourceCreationEnabled === false && manifest.credentialAccessAllowed === false, "local/no-credential execution boundary"),
    check("P2A-LOCAL-003", manifest.terraformApplyAllowed === false && manifest.billingMutationAllowed === false && manifest.dnsMutationAllowed === false, "apply/billing/DNS mutations disabled"),
    check("P2A-IAC-001", tfEntries.length >= 10 && resourceCount >= 25, `${tfEntries.length} Terraform files, ${resourceCount} Google resources modeled`),
    check("P2A-IAC-002", resourceCount === guardedResourceCount, `${guardedResourceCount}/${resourceCount} Google resources use local.create_resources`),
    check("P2A-IAC-003", tf.includes('required_version = "~> 1.14.0"') && tf.includes('version = "7.39.0"') && tf.includes('backend "gcs" {}'), "Terraform/provider/backend contract pinned"),
    check("P2A-IAC-004", tf.includes("enable_resource_creation") && tf.includes("DEV-046-PHASE-2B-APPROVED") && tf.includes("phase2_resource_creation_guard"), "multi-factor apply guard present"),
    check("P2A-IAC-005", tf.includes('availability_type           = "ZONAL"') && tf.includes("point_in_time_recovery_enabled = true") && tf.includes("deletion_protection = true") && tf.includes("deletion_protection_enabled = true"), "single-zone staging, PITR and deletion protection encoded"),
    check("P2A-IAC-006", tf.includes("ipv4_enabled                                  = false") && tf.includes('value = "on"') && tf.includes("CLOUD_IAM_SERVICE_ACCOUNT"), "private IP and IAM DB users encoded"),
    check("P2A-IAC-007", cloudSqlAccess.runtimeServiceIdentityIamRoles.includes("roles/cloudsql.client") && cloudSqlAccess.runtimeServiceIdentityIamRoles.includes("roles/cloudsql.instanceUser") && tf.includes('"roles/cloudsql.client"') && tf.includes('"roles/cloudsql.instanceUser"'), "connector and database login IAM roles encoded"),
    check("P2A-IAC-008", tf.includes('default     = false') && tf.includes('"INGRESS_TRAFFIC_ALL"') && tf.includes('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"') && tf.includes("default_uri_disabled = !var.enable_firebase_hosting_gateway") && tf.includes("invoker_iam_disabled = true") && tf.includes('egress = "ALL_TRAFFIC"') && tf.includes('check "firebase_hosting_gateway_origin_guard"'), "Cloud Run defaults to LB-only ingress; the guarded staging Hosting exception and Direct VPC egress are encoded"),
    check("P2A-IAC-009", tf.includes("--private-ip") && tf.includes("--auto-iam-authn") && tf.includes("--address=0.0.0.0") && tf.includes('value = "127.0.0.1"') && tf.includes('depends_on = ["cloud-sql-proxy"]'), "Cloud SQL proxy sidecar/start order encoded"),
    check("P2A-IAC-010", tf.includes('enable_cdn            = false') && tf.includes('paths   = ["/_next/static/*"]') && tf.includes('cache_mode        = "USE_ORIGIN_HEADERS"') && tf.includes("serve_while_stale = 0"), "CDN limited to reviewed immutable Next assets"),
    check("P2A-IAC-011", tf.includes('name                   = "_Default"') && tf.includes('location       = var.region') && tf.includes('bucket_id      = "pdm-application"'), "regional application log target and _Default import contract encoded"),
    check("P2A-IAC-012", tf.includes('resource "google_identity_platform_config"') && tf.includes('password_required = false') && tf.includes('totp_provider_config') && !tf.includes("google_identity_platform_default_supported_idp_config"), "Identity Platform/TOTP without OAuth secret in state"),
    check("P2A-IAC-013", tf.includes('default     = "db-custom-1-3840"') && tf.includes('default     = "TWD"') && tf.includes("threshold_percent = 0.5") && tf.includes("threshold_percent = 0.8") && tf.includes("threshold_percent = 1") && manifest.costGuard.stagingAvailabilityType === "ZONAL" && manifest.costGuard.productionAvailabilityType === "REGIONAL" && manifest.costGuard.monthlyBudgetUsd === 300 && manifest.costGuard.cloudBillingBudgetCurrency === "TWD" && manifest.costGuard.cloudBillingBudgetUnits === 9600 && manifest.costGuard.credentialledPlanReviewStopUsd === 240, "single-zone staging, regional-HA production boundary, TWD billing budget under USD 300 cap and 50/80/100 thresholds encoded"),
    check("P2A-IAC-014", !/(?:password\s*=|client_secret\s*=|service_account_key|credentials\s*=)/iu.test(tf), "no static password, OAuth secret or credential in IaC"),
    check("P2A-IAC-015", !/(?:google_firestore|firebase_storage|google_cloudfunctions|google_storage_bucket)/iu.test(tf), "no Firestore/Firebase Storage/Functions/formal GCS file scope"),
    check("P2A-IAC-016", !/(?:terraform\s+(?:apply|destroy|import)|gcloud\s+(?:run|sql|compute|projects|billing)\s+)/iu.test(tf), "Terraform source contains no imperative cloud command"),
    check("P2A-APP-001", firebaseApplicationReady, "Firebase BFF application adapter and auth mode are implemented locally"),
    check("P2A-APP-002", employeeLoginAliasReady, "employee login alias schema, intent exchange, Admin UI and focused QC are implemented locally"),
    check("P2A-APP-003", privacyNoticeReady, "privacy notice version, acknowledgement gate, permanent access, Admin evidence and focused QC are implemented locally")
  ];

  const blockers = [];
  if (!manifest.approvals.projectAndBillingApproved) blockers.push("PROJECT_AND_BILLING_APPROVAL_MISSING");
  if (!manifest.approvals.paymentActivationApproved) blockers.push("PAYMENT_ACTIVATION_NOT_AUTHORIZED");
  if (!manifest.approvals.privacyNoticeApproved) blockers.push("EMPLOYEE_PRIVACY_NOTICE_APPROVAL_MISSING");
  if (!manifest.approvals.monthlyBudgetApproved) blockers.push("MONTHLY_BUDGET_APPROVAL_MISSING");
  if (placeholder(manifest.target.organizationId)) blockers.push("GOOGLE_ORGANIZATION_ID_MISSING");
  if (placeholder(manifest.target.billingAccountId)) blockers.push("GOOGLE_BILLING_ACCOUNT_ID_MISSING");
  if (placeholder(manifest.target.stagingProjectId) || manifest.target.stagingProjectId === "jenfu-erp-stg") blockers.push("STAGING_PROJECT_ID_MISSING");
  if (placeholder(manifest.target.terraformStateBucket)) blockers.push("TERRAFORM_STATE_BUCKET_MISSING");
  else if (manifest.phase2Bootstrap?.remoteStateAccessVerified !== true) blockers.push("TERRAFORM_STATE_ACCESS_EVIDENCE_MISSING");
  if (placeholder(manifest.target.firebaseWebApiKey) || placeholder(manifest.target.firebaseAuthDomain) || placeholder(manifest.target.firebaseWebAppId)) {
    blockers.push("FIREBASE_WEB_APP_CONFIG_MISSING");
  }
  const firebaseHostingAuthDomain = `${manifest.target.stagingProjectId}.web.app`;
  if (
    manifest.approvals.firebaseHostingDefaultDomainApproved === true &&
    manifest.target.firebaseAuthDomain !== firebaseHostingAuthDomain
  ) {
    blockers.push("FIREBASE_HOSTING_AUTH_DOMAIN_CROSS_ORIGIN");
  }
  for (const [owner, value] of Object.entries(manifest.owners)) if (placeholder(value)) blockers.push(`NAMED_OWNER_MISSING:${owner}`);
  if (placeholder(manifest.testAccounts.controlledNonGoogleUser)) blockers.push("CONTROLLED_NON_GOOGLE_TEST_ACCOUNT_MISSING");
  if (placeholder(manifest.approvals.changeTicket)) blockers.push("APPROVED_CHANGE_TICKET_MISSING");
  if (costForecastStopTriggered) blockers.push("COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP");
  if (continuity.roster.backup.startsWith("ASSIGN_")) blockers.push("NAMED_BACKUP_RESPONDER_MISSING");
  if (!fs.existsSync(path.join(iacDirectory, ".terraform.lock.hcl"))) blockers.push("TERRAFORM_PROVIDER_LOCK_MISSING");
  if (!terraform.installed && !docker.installed && !priorTerraformExecutionEvidence) blockers.push("TERRAFORM_EXECUTOR_MISSING");
  if (!firebaseApplicationReady) {
    blockers.push("LIVE_FIREBASE_IDENTITY_ADAPTER_NOT_IMPLEMENTED");
    blockers.push("PDM_AUTH_MODE_DOES_NOT_YET_ACCEPT_FIREBASE_BFF");
  }
  if (!employeeLoginAliasReady) blockers.push("EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED");
  if (!privacyNoticeReady) blockers.push("PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED");
  blockers.push(...manifest.knownApplicationBlockers);
  if (manifest.phase2Bootstrap?.defaultLogSinkImported !== true) blockers.push("DEFAULT_LOG_SINK_IMPORT_EVIDENCE_MISSING");
  if (manifest.phase2Bootstrap?.credentialledFullPlan?.stopConditionPassed !== true) blockers.push("CREDENTIALLED_TERRAFORM_PLAN_NOT_REQUESTED");
  if (manifest.approvals.resourceCreationApproved !== true) blockers.push("RESOURCE_CREATION_NOT_AUTHORIZED");

  const failures = checks.filter((item) => !item.passed);
  return {
    schemaVersion: 1,
    dev: "DEV-046",
    phase: "Phase-2A",
    generatedAt: new Date().toISOString(),
    result: failures.length === 0 ? "blocked_expected" : "local_contract_failed",
    safeToCreateResources: false,
    localStaticContractPassed: failures.length === 0,
    summary: {
      checksPassed: checks.length - failures.length,
      checksTotal: checks.length,
      blockerCount: [...new Set(blockers)].length,
      terraformResourceCount: resourceCount
    },
    tooling: {
      terraform,
      docker,
      gcloud,
      credentialLookupPerformed: false
    },
    checks,
    blockers: [...new Set(blockers)].sort()
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const report = buildPhase2APreflight();
  if (args.has("--write-report")) {
    const outputDirectory = path.join(root, "output", "dev-046-phase2a-preflight");
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    console.log(`DEV-046 Phase 2A preflight: ${report.result}`);
    console.log(`Local static checks: ${report.summary.checksPassed}/${report.summary.checksTotal}`);
    console.log(`Google resources modeled: ${report.summary.terraformResourceCount}`);
    console.log(`Open external/application blockers: ${report.summary.blockerCount}`);
    for (const blocker of report.blockers) console.log(`BLOCKED ${blocker}`);
    console.log("No credentials were read and no cloud resource, billing, DNS, migration or deployment action ran.");
  }

  if (!report.localStaticContractPassed || (args.has("--require-ready") && report.result !== "ready")) process.exitCode = 1;
}
