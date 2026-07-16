#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-iac-terraform-validate", "report.json");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function sourceDigest() {
  const sourceDir = path.join(root, "infra", "google-cloud", "production");
  const entries = readdirSync(sourceDir)
    .filter((name) => statSync(path.join(sourceDir, name)).isFile() && (
      name.endsWith(".tf") ||
      name === "README.md" ||
      name === "backend.production.hcl.example" ||
      name === ".terraform.lock.hcl"
    ))
    .sort()
    .map((name) => ({
      name,
      sha256: sha256(readFileSync(path.join(sourceDir, name)))
    }));
  return sha256(JSON.stringify(entries));
}

const exists = existsSync(reportPath);
const report = exists ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const commandNames = new Set((report?.commands ?? []).map((item) => item.name));
const commandArgs = (report?.commands ?? []).map((item) => item.terraformArgs.join(" "));
const serializedReport = JSON.stringify(report ?? {});

record("DEV032-TF-001 report exists and identifies DEV-032", exists && report?.schemaVersion === 1 && report?.dev === "DEV-032");
record("DEV032-TF-002 validation is local static evidence only", report?.productionActionPerformed === false && report?.terraformPlanExecuted === false && report?.terraformApplyExecuted === false && report?.terraformImportExecuted === false);
record("DEV032-TF-003 pinned Terraform 1.14.5 executor is recorded", report?.terraform?.versionOk === true && (
  (report?.terraform?.executor === "docker" && report?.terraform?.image === "hashicorp/terraform:1.14.5") ||
  (report?.terraform?.executor === "local" && report?.terraform?.executable === "terraform.exe" && report?.terraform?.binaryChecksumVerified === true)
));
record("DEV032-TF-004 source digest matches current production IaC package", report?.source?.sha256 === sourceDigest());
record("DEV032-TF-005 required Terraform commands ran", ["version", "fmt-check", "init-backend-false", "validate-json"].every((name) => commandNames.has(name)) && (report?.commands ?? []).every((item) => item.ok === true));
record("DEV032-TF-006 init disables backend and does not perform a plan", commandArgs.includes("init -backend=false -input=false -no-color") && !commandArgs.some((args) => /(^|\s)(plan|apply|import|destroy)(\s|$)/u.test(args)));
record("DEV032-TF-007 fmt check passed", report?.commands?.find((item) => item.name === "fmt-check")?.ok === true);
record("DEV032-TF-008 validate json passed with zero errors", report?.validation?.valid === true && report?.validation?.errorCount === 0);
record("DEV032-TF-009 generated Terraform artifacts are confined to output workspace", Array.isArray(report?.generatedTerraformArtifacts) && report.generatedTerraformArtifacts.every((item) => item.startsWith("output/dev-032-production-iac-terraform-validate/workspace/")));
record("DEV032-TF-010 report does not persist secret values", !/private_key|client_secret|SESSION_SIGNING|PASSWORD|DATABASE_URL/u.test(serializedReport));
record("DEV032-TF-011 stop conditions preserve production gates", report?.stopConditions?.some((item) => item.includes("credentialled production plan")) && report?.stopConditions?.some((item) => item.includes("Level 3/4 smoke")));
record(
  "DEV032-TF-012 package exposes validate and QC scripts",
  packageJson.scripts?.["dev-032:production-iac-terraform-validate"] === "node scripts/dev-032-production-iac-terraform-validate.mjs" &&
    packageJson.scripts?.["qc:dev-032-production-iac-terraform-validate"] === "node scripts/qc-dev-032-production-iac-terraform-validate.mjs"
);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production IaC Terraform validate QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
