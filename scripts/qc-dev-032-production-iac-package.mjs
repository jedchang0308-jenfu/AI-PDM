#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const productionDir = path.join(root, "infra", "google-cloud", "production");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const target = JSON.parse(readFileSync(path.join(root, "config", "platform", "production-target.template.json"), "utf8"));
const classifier = readFileSync(path.join(root, "scripts", "dev-032-release-source-manifest-utils.mjs"), "utf8");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function read(relativePath) {
  return readFileSync(path.join(productionDir, relativePath), "utf8");
}

function readIfExists(relativePath) {
  const filePath = path.join(productionDir, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function allTf() {
  return readdirSync(productionDir)
    .filter((name) => name.endsWith(".tf"))
    .sort()
    .map((name) => ({ name, text: read(name) }));
}

function resourceBlocks(files) {
  const blocks = [];
  for (const file of files) {
    const text = file.text;
    const resourceRegex = /resource\s+"(google_[^"]+)"\s+"([^"]+)"\s*\{/gu;
    let match;
    while ((match = resourceRegex.exec(text)) !== null) {
      const openBraceIndex = text.indexOf("{", match.index);
      let depth = 0;
      let end = openBraceIndex;
      for (let index = openBraceIndex; index < text.length; index += 1) {
        const char = text[index];
        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;
        if (depth === 0 && index > openBraceIndex) {
          end = index + 1;
          break;
        }
      }
      blocks.push({
        file: file.name,
        type: match[1],
        name: match[2],
        body: text.slice(match.index, end)
      });
    }
  }
  return blocks;
}

const requiredFiles = [
  "README.md",
  "versions.tf",
  "variables.tf",
  "locals.tf",
  "network.tf",
  "iam.tf",
  "security.tf",
  "identity.tf",
  "database.tf",
  "runtime.tf",
  "edge.tf",
  "observability.tf",
  "outputs.tf"
];
const existingRequiredFiles = requiredFiles.filter((name) => existsSync(path.join(productionDir, name)));
const files = existsSync(productionDir) ? allTf() : [];
const combinedTf = files.map((file) => file.text).join("\n");
const readme = readIfExists("README.md");
const variables = readIfExists("variables.tf");
const locals = readIfExists("locals.tf");
const database = readIfExists("database.tf");
const runtime = readIfExists("runtime.tf");
const edge = readIfExists("edge.tf");
const security = readIfExists("security.tf");
const identity = readIfExists("identity.tf");
const observability = readIfExists("observability.tf");
const resources = resourceBlocks(files);
const resourceNames = resources.map((resource) => `${resource.type}.${resource.name}`);
const guardedResources = resources.filter((resource) =>
  /count\s*=\s*local\.create_resources\s*\?\s*1\s*:\s*0/u.test(resource.body) ||
  /count\s*=\s*local\.create_resources\s*&&/u.test(resource.body) ||
  /for_each\s*=\s*local\.create_resources\s*\?/u.test(resource.body)
);
const trackedProductionFiles = execFileSync("git", ["ls-files", "--", "infra/google-cloud/production"], {
  cwd: root,
  encoding: "utf8"
}).trim().split(/\r?\n/u).filter(Boolean);

record("DEV032-PROD-IAC-001 production IaC review package exists", existsSync(productionDir) && existingRequiredFiles.length === requiredFiles.length, existingRequiredFiles.join(", "));
record("DEV032-PROD-IAC-002 package declares review-only / no apply posture", readme.includes("review package only") && readme.includes("does not authorize `terraform apply`") && readme.includes("A plan file is not an apply approval."));
record("DEV032-PROD-IAC-003 package matches production target contract", combinedTf.includes(target.target.projectId) && combinedTf.includes(target.target.runtimeService) && combinedTf.includes(target.target.cloudSqlInstance) && combinedTf.includes(target.target.publicBaseUrl));
record("DEV032-PROD-IAC-004 create_resources requires exact acknowledgement, Gate A and cost gates while later release gates remain explicit", locals.includes("DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED") && [
  "production_target_readback_approved",
  "production_env_source_approved",
  "production_secret_metadata_readback_approved",
  "clean_seed_allowlist_approved",
  "hd84_restore_reconciliation_approved",
  "rollback_readiness_approved",
  "level3_smoke_plan_approved",
  "estimated_monthly_cost_usd <= var.plan_review_stop_usd"
].every((needle) => locals.includes(needle)) && locals.includes("local.pre_apply_gates_ready") && locals.includes("post_apply_release_gates_ready"));
record("DEV032-PROD-IAC-005 every Google resource is gated by local.create_resources", resources.length >= 20 && guardedResources.length === resources.length, resourceNames.filter((_, index) => !guardedResources.includes(resources[index])).join(", "));
record("DEV032-PROD-IAC-006 defaults cannot create production resources", variables.includes('default     = false') && variables.includes('default     = ""') && locals.includes("var.enable_resource_creation &&"));
record("DEV032-PROD-IAC-007 Cloud SQL is regional, private, IAM-auth and recovery-ready", database.includes('availability_type           = "REGIONAL"') && database.includes("point_in_time_recovery_enabled = true") && database.includes('name  = "cloudsql.iam_authentication"') && database.includes("ipv4_enabled                                  = false") && database.includes("deletion_protection = true"));
record("DEV032-PROD-IAC-008 Cloud Run production ingress forbids direct default URL", runtime.includes('ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"') && runtime.includes("default_uri_disabled = true") && runtime.includes("cloud-sql-proxy") && runtime.includes("--private-ip") && runtime.includes("--auto-iam-authn"));
record("DEV032-PROD-IAC-009 external ALB and immutable-asset CDN are modeled", edge.includes("EXTERNAL_MANAGED") && edge.includes('enable_cdn            = false') && edge.includes('enable_cdn            = true') && edge.includes('/_next/static/*') && edge.includes("google_compute_managed_ssl_certificate"));
record("DEV032-PROD-IAC-010 session secrets are metadata-only", security.includes("google_secret_manager_secret") && combinedTf.includes("pdm-session-signing-current") && combinedTf.includes("pdm-session-signing-previous") && !combinedTf.match(/secret_data|private_key|DATABASE_URL|PASSWORD\s*=/u));
record("DEV032-PROD-IAC-011 cost gates preserve USD 300 cap, TWD billing budget and USD 240 stop", variables.includes("default     = 300") && variables.includes("default     = 240") && variables.includes('default     = "TWD"') && variables.includes("default     = 9600") && observability.includes("google_billing_budget") && observability.includes("var.billing_budget_currency_code") && locals.includes("var.estimated_monthly_cost_usd <= var.plan_review_stop_usd"));
record("DEV032-PROD-IAC-012 staging and Firebase Hosting shortcuts are absent from Terraform", !combinedTf.includes("jenfu-ai-pdm-stg-361825") && !combinedTf.includes("ai-pdm-stg") && !combinedTf.includes(".web.app") && !combinedTf.includes("firebase-hosting"));
record("DEV032-PROD-IAC-013 no Terraform state/provider cache or tfvars are committed in production package", trackedProductionFiles.every((filePath) => {
  const name = path.basename(filePath);
  return name === ".terraform.lock.hcl" || (
    name !== ".terraform" &&
    !name.includes(".tfvars") &&
    !name.endsWith(".tfstate") &&
    !name.endsWith(".tfplan")
  );
}));
record("DEV032-PROD-IAC-014 release-source classifier includes production IaC as included platform contract", classifier.includes('filePath.startsWith("infra/google-cloud/production/")') && classifier.includes("Production infrastructure review package."));
record("DEV032-PROD-IAC-015 package exposes QC script", packageJson.scripts?.["qc:dev-032-production-iac-package"] === "node scripts/qc-dev-032-production-iac-package.mjs");
record("DEV032-PROD-IAC-016 package exposes Docker Terraform static validate workflow", packageJson.scripts?.["dev-032:production-iac-terraform-validate"] === "node scripts/dev-032-production-iac-terraform-validate.mjs" && packageJson.scripts?.["qc:dev-032-production-iac-terraform-validate"] === "node scripts/qc-dev-032-production-iac-terraform-validate.mjs");
record("DEV032-PROD-IAC-017 Identity Platform policy is modeled without OAuth secret state", identity.includes("google_identity_platform_config") && identity.includes("totp_provider_config") && identity.includes("provider credentials stay outside Terraform") && !identity.includes("client_secret"));
record("DEV032-PROD-IAC-018 regional logs, connection reserve and numbering signing are modeled", observability.includes("google_logging_project_bucket_config") && observability.includes("cloud_sql_connections") && security.includes("numbering_ledger") && security.includes('protection_level = "HSM"'));

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production IaC package QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
