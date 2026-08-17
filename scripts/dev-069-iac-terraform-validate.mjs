#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-069-iac-terraform-validate");
const terraformImage = process.env.DEV069_TERRAFORM_IMAGE || "hashicorp/terraform:1.14.5";
const terraformExecutable = process.env.DEV069_TERRAFORM_EXECUTABLE?.trim() || null;
const executor = terraformExecutable ? "local" : "docker";
const environments = ["production", "staging"];

function relative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFiles(sourceDir) {
  return readdirSync(sourceDir)
    .filter((name) => statSync(path.join(sourceDir, name)).isFile())
    .filter((name) => name.endsWith(".tf") || name === ".terraform.lock.hcl")
    .sort();
}

function copySource(environment) {
  const sourceDir = path.join(root, "infra", "google-cloud", environment);
  const workspaceDir = path.join(outputDir, environment);
  mkdirSync(workspaceDir, { recursive: true });
  const files = sourceFiles(sourceDir);
  for (const name of files) copyFileSync(path.join(sourceDir, name), path.join(workspaceDir, name));
  const entries = files.map((name) => ({
    name,
    sha256: sha256(readFileSync(path.join(sourceDir, name)))
  }));
  return {
    sourceDir,
    workspaceDir,
    files: entries,
    sha256: sha256(JSON.stringify(entries))
  };
}

function run(workspaceDir, name, args) {
  const command = terraformExecutable
    ? { executable: terraformExecutable, args }
    : {
        executable: "docker",
        args: [
          "run",
          "--rm",
          "-v",
          `${workspaceDir}:/workspace`,
          "-w",
          "/workspace",
          terraformImage,
          ...args
        ]
      };
  try {
    const stdout = execFileSync(command.executable, command.args, {
      cwd: workspaceDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180000
    });
    return { name, args, ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    return {
      name,
      args,
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function validateEnvironment(environment) {
  const source = copySource(environment);
  const commands = [
    run(source.workspaceDir, "version", ["version"]),
    run(source.workspaceDir, "fmt-check", ["fmt", "-check", "-diff", "-recursive"]),
    run(source.workspaceDir, "init-backend-false", ["init", "-backend=false", "-input=false", "-no-color"]),
    run(source.workspaceDir, "validate-json", ["validate", "-no-color", "-json"])
  ];
  const validate = commands.find((item) => item.name === "validate-json");
  let validation = null;
  try {
    validation = JSON.parse(validate?.stdout || "");
  } catch {
    validation = null;
  }
  return {
    environment,
    source: {
      directory: relative(source.sourceDir),
      sha256: source.sha256,
      files: source.files
    },
    backendDisabled: true,
    planExecuted: false,
    applyExecuted: false,
    destroyExecuted: false,
    commands: commands.map((item) => ({
      ...item,
      stdout: item.stdout.slice(0, 12000),
      stderr: item.stderr.slice(0, 12000)
    })),
    validation: {
      valid: validation?.valid === true,
      errorCount: validation?.error_count ?? null,
      warningCount: validation?.warning_count ?? null
    },
    passed: commands.every((item) => item.ok) && validation?.valid === true
  };
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
const results = environments.map(validateEnvironment);
const report = {
  schemaVersion: 1,
  dev: "DEV-069",
  generatedAt: new Date().toISOString(),
  status: results.every((item) => item.passed)
    ? "terraform_static_validate_passed_no_plan_no_apply"
    : "terraform_static_validate_failed",
  terraform: {
    executor,
    image: executor === "docker" ? terraformImage : null,
    executable: executor === "local" ? path.basename(terraformExecutable) : null
  },
  productionActionPerformed: false,
  results,
  stopConditions: [
    "This report is Level 0 static evidence only.",
    "No Terraform backend, plan, apply, import or destroy operation was used.",
    "A credentialled remote-state plan, backup/rollback evidence and Level 3/4 smoke remain mandatory before live change."
  ]
};
const reportPath = path.join(outputDir, "report.json");
const markdownPath = path.join(outputDir, "report.md");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, [
  "# DEV-069 Terraform Static Validation",
  "",
  `Generated: ${report.generatedAt}`,
  `Status: \`${report.status}\``,
  `Executor: \`${executor}\``,
  "",
  ...results.map((item) => `- ${item.passed ? "PASS" : "FAIL"} ${item.environment}: fmt/init-backend=false/validate`),
  "",
  "No plan, apply, import, destroy or live GCP action was performed.",
  ""
].join("\n"), "utf8");

console.log(JSON.stringify({
  report: relative(reportPath),
  status: report.status,
  results: results.map(({ environment, passed, validation }) => ({ environment, passed, validation }))
}, null, 2));
if (!results.every((item) => item.passed)) process.exitCode = 1;
