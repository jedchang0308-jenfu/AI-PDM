#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

function resourceBlocks(text) {
  const blocks = [];
  const regex = /resource\s+"(google_[^"]+)"\s+"([^"]+)"\s*\{/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = text.indexOf("{", match.index);
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      if (depth === 0 && index > start) {
        blocks.push({ type: match[1], name: match[2], body: text.slice(match.index, index + 1) });
        break;
      }
    }
  }
  return blocks;
}

const contract = json("config/platform/dev-069-gcp-cost-optimization.json");
const capacity = json("config/platform/cloud-sql-capacity.json");
const productionTarget = json("config/platform/production-target.template.json");
const cloudRun = json("config/platform/cloud-run.contract.json");
const costBudget = json("config/platform/cost-budget.template.json");
const prod = {
  database: read("infra/google-cloud/production/database.tf"),
  variables: read("infra/google-cloud/production/variables.tf"),
  locals: read("infra/google-cloud/production/locals.tf"),
  runtime: read("infra/google-cloud/production/runtime.tf"),
  edge: read("infra/google-cloud/production/edge.tf"),
  security: read("infra/google-cloud/production/security.tf")
};
const staging = {
  database: read("infra/google-cloud/staging/database.tf"),
  variables: read("infra/google-cloud/staging/variables.tf"),
  locals: read("infra/google-cloud/staging/locals.tf"),
  runtime: read("infra/google-cloud/staging/runtime.tf"),
  edge: read("infra/google-cloud/staging/edge.tf"),
  security: read("infra/google-cloud/staging/security.tf")
};
const requiredStagingFiles = [
  ".terraform.lock.hcl",
  "README.md",
  "backend.staging.hcl.example",
  "budget.tf",
  "database.tf",
  "edge.tf",
  "identity.tf",
  "locals.tf",
  "migration-runner.tf",
  "network.tf",
  "observability.tf",
  "outputs.tf",
  "runtime.tf",
  "security.tf",
  "services-iam.tf",
  "terraform.tfvars.example",
  "variables.tf",
  "versions.tf"
];
const prodEdge = resourceBlocks(prod.edge);
const stagingEdge = resourceBlocks(staging.edge);
const calculatedPeak = capacity.effectiveMaximumInstances * capacity.poolMax + capacity.migrationAdminReserve;
const allowedConnections = Math.floor(capacity.maxConnections * (1 - capacity.minimumReserveRatio));

record("DEV069-001 exact production, staging and restore targets are encoded", contract.dev === "DEV-069" && contract.production?.projectId === "jenfu-ai-pdm-prod" && contract.staging?.projectId === "jenfu-ai-pdm-stg-361825" && contract.restoreTarget?.instance === "ai-pdm-prod-restore-20260716a");
record("DEV069-002 restored Staging IaC package is complete", requiredStagingFiles.every((name) => existsSync(path.join(root, "infra", "google-cloud", "staging", name))));
record("DEV069-003 Production uses db-f1-micro and ZONAL variables", prod.variables.includes('default     = "db-f1-micro"') && prod.variables.includes('default     = "ZONAL"') && prod.database.includes("availability_type           = var.database_availability_type"));
record("DEV069-004 Staging uses db-f1-micro, ZONAL and normally stopped policy", staging.variables.includes('default     = "db-f1-micro"') && staging.database.includes('availability_type           = "ZONAL"') && staging.variables.includes('default     = "NEVER"') && staging.database.includes("activation_policy           = var.database_activation_policy"));
record("DEV069-005 Cloud Run and application pools are capped at two", [prod.runtime, staging.runtime].every((text) => text.includes("max_instance_count = var.cloud_run_max_instances") && text.includes('name  = "PDM_CLOUD_SQL_POOL_MAX"') && text.includes("tostring(var.cloud_sql_pool_max)")) && capacity.maxInstancesPerRevision === 2 && capacity.poolMax === 2);
record("DEV069-006 capacity formula preserves at least 30 percent of expected connections", calculatedPeak === 10 && allowedConnections === 17 && calculatedPeak <= allowedConnections && contract.capacity?.calculatedPeakConnections === calculatedPeak && contract.capacity?.allowedConnections === allowedConnections);
record("DEV069-007 complete Production ALB chain is behind the dedicated false-by-default gate", prodEdge.length === 11 && prodEdge.every((resource) => /count\s*=\s*local\.create_edge_resources\s*\?\s*1\s*:\s*0/u.test(resource.body)) && prod.variables.includes('variable "enable_external_load_balancer"') && prod.locals.includes("create_edge_resources"));
record("DEV069-008 complete Staging ALB chain is behind the dedicated false-by-default gate", stagingEdge.length === 11 && stagingEdge.every((resource) => /count\s*=\s*local\.create_edge_resources\s*\?\s*1\s*:\s*0/u.test(resource.body)) && staging.variables.includes('variable "enable_external_load_balancer"') && staging.locals.includes("create_edge_resources"));
record("DEV069-009 Firebase Hosting remains the active canonical edge", productionTarget.edge?.type === "firebase-hosting-cloud-run-rewrite" && productionTarget.edge?.externalApplicationLoadBalancerProvisioned === false && cloudRun.productionEdgeBaseline?.externalApplicationLoadBalancerProvisioned === false && cloudRun.futureCustomDomainEdge?.status === "deferred");
record("DEV069-010 database recovery and private IAM controls remain intact", [prod.database, staging.database].every((text) => text.includes("point_in_time_recovery_enabled = true") && text.includes("deletion_protection = true") && text.includes("ipv4_enabled                                  = false") && text.includes('name  = "cloudsql.iam_authentication"')));
record("DEV069-011 Production and Staging signing keys remain HSM", [prod.security, staging.security].every((text) => text.includes('protection_level = "HSM"')));
record("DEV069-012 cost estimate is non-overlapping and measurable", contract.estimatedBenefit?.additionalMonthlySavings === 3749 && contract.estimatedBenefit?.components?.reduce((sum, item) => sum + item.estimatedMonthlySavings, 0) === 3749 && costBudget.currentForecast?.estimatedMonthlyUsd === 30 && contract.estimatedBenefit?.measurementRule?.includes("24-72 hour"));
record("DEV069-013 no local state or auto tfvars exist in restored Staging source", !readdirSync(path.join(root, "infra", "google-cloud", "staging")).some((name) => name.includes(".tfstate") || name.endsWith(".auto.tfvars") || name === ".terraform"));
record("DEV069-014 live changes remain Lane 3 release-gated", contract.releaseGate?.riskLane === 3 && contract.releaseGate?.credentialledPlanRequired === true && contract.releaseGate?.backupAndRollbackRequired === true && contract.releaseGate?.level3StagingSmokeRequired === true && contract.releaseGate?.level4ProductionSmokeRequired === true);
record("DEV069-015 machine-readable plan allowlist covers both edge chains and forbids replacement", contract.planAcceptance?.edgeResourceAddresses?.length === 11 && Object.keys(contract.planAcceptance?.phases || {}).length === 4 && contract.planAcceptance?.replacementAllowed === false && contract.planAcceptance?.unexpectedChangeAllowed === false && existsSync(path.join(root, "scripts", "verify-dev-069-terraform-plan.mjs")));

const validationPath = path.join(root, "output", "dev-069-iac-terraform-validate", "report.json");
const validation = existsSync(validationPath) ? JSON.parse(readFileSync(validationPath, "utf8")) : null;
record("DEV069-016 dual-environment Terraform static validation passed", validation?.dev === "DEV-069" && validation?.status === "terraform_static_validate_passed_no_plan_no_apply" && validation?.productionActionPerformed === false && validation?.results?.length === 2 && validation.results.every((item) => item.passed === true && item.backendDisabled === true && item.planExecuted === false && item.applyExecuted === false));
record("DEV069-017 application and Cloud SQL proxy startup CPU boost stay explicit", [prod.runtime, staging.runtime].every((text) => (text.match(/startup_cpu_boost\s*=\s*true/gu) || []).length === 2));

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-069 GCP cost optimization QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
