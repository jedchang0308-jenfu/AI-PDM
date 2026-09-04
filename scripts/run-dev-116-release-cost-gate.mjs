#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const argValue = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const releaseCommit = argValue("--release-commit") ?? "";
const outputPath = path.resolve(root, argValue("--output") ?? "output/production-release/dev-116-cost-gate.json");
const policyPath = path.resolve(root, argValue("--policy") ?? "config/production-smoke-cost-policy.json");

if (!/^[a-f0-9]{40}$/u.test(releaseCommit)) throw new Error("DEV116_COST_RELEASE_COMMIT_INVALID");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
if (policy.schemaVersion !== "production-smoke-cost-policy/v1") throw new Error("DEV116_COST_POLICY_VERSION_INVALID");
if (policy.region !== "asia-east1") throw new Error("DEV116_COST_REGION_INVALID");
if (policy.newFixedSkuCount !== 0) throw new Error("DEV116_COST_FIXED_SKU_FORBIDDEN");
if (!Array.isArray(policy.pricingSources) || policy.pricingSources.length < 4 || policy.pricingSources.some((source) => !source.startsWith("https://cloud.google.com/"))) {
  throw new Error("DEV116_COST_PRIMARY_PRICING_SOURCES_REQUIRED");
}

const reviewedAt = new Date(`${policy.pricingReviewDate}T00:00:00Z`);
const ageDays = Math.floor((Date.now() - reviewedAt.getTime()) / 86_400_000);
if (!Number.isFinite(reviewedAt.getTime()) || ageDays < 0 || ageDays > policy.pricingMaxAgeDays) {
  throw new Error(`DEV116_COST_PRICING_STALE:${ageDays}`);
}

const caps = policy.caps;
const prices = policy.grossUnitPricesUsd;
for (const [name, value] of Object.entries({ ...caps, ...prices })) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`DEV116_COST_VALUE_INVALID:${name}`);
}
if (caps.businessBundles !== 1) throw new Error("DEV116_COST_SINGLE_BUNDLE_REQUIRED");

const components = {
  cloudRunCpu: caps.cloudRunVcpuSeconds * prices.cloudRunVcpuSecond,
  cloudRunMemory: caps.cloudRunGibSeconds * prices.cloudRunGibSecond,
  cloudRunRequests: caps.httpRequests * prices.cloudRunRequest,
  logging: caps.loggingGib * prices.loggingGib,
  cloudSqlStorage: caps.cloudSqlIncrementalStorageGibMonth * prices.cloudSqlHaSsdGibHour * 730,
  cloudSqlBackup: caps.cloudSqlIncrementalBackupGibMonth * prices.cloudSqlBackupGibHour * 730,
  identityPlatform: caps.identityPlatformMau * prices.identityPlatformTier1Mau
};
const perRunUpperBoundUsd = Object.values(components).reduce((sum, value) => sum + value, 0);
const monthlyUpperBoundUsd = perRunUpperBoundUsd * policy.maxRunsPerMonth;
if (perRunUpperBoundUsd > policy.perRunBudgetUsd) throw new Error(`DEV116_COST_PER_RUN_BUDGET_EXCEEDED:${perRunUpperBoundUsd}`);
if (monthlyUpperBoundUsd > policy.monthlyIncrementBudgetUsd) throw new Error(`DEV116_COST_MONTHLY_BUDGET_EXCEEDED:${monthlyUpperBoundUsd}`);

const reportCore = {
  schemaVersion: "dev-116-release-cost-gate/v1",
  status: "PASS",
  releaseCommit,
  region: policy.region,
  pricingReviewDate: policy.pricingReviewDate,
  pricingAgeDays: ageDays,
  pricingMaxAgeDays: policy.pricingMaxAgeDays,
  newFixedSkuCount: policy.newFixedSkuCount,
  caps,
  grossUnitPricesUsd: prices,
  componentsUsd: components,
  perRunUpperBoundUsd,
  perRunBudgetUsd: policy.perRunBudgetUsd,
  maxRunsPerMonth: policy.maxRunsPerMonth,
  monthlyUpperBoundUsd,
  monthlyIncrementBudgetUsd: policy.monthlyIncrementBudgetUsd,
  pricingSources: policy.pricingSources,
  freeTierAssumed: false
};
const evidenceId = crypto.createHash("sha256").update(JSON.stringify({ releaseCommit, policy })).digest("hex");
const report = {
  ...reportCore,
  evidenceRef: `production-smoke-cost://${releaseCommit}/${evidenceId}`
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, evidenceRef: report.evidenceRef, perRunUpperBoundUsd, monthlyUpperBoundUsd, outputPath }));
