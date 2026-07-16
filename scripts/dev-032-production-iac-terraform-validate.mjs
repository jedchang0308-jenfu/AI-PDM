#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "infra", "google-cloud", "production");
const outputDir = path.join(root, "output", "dev-032-production-iac-terraform-validate");
const workspaceDir = path.join(outputDir, "workspace");
const reportPath = path.join(outputDir, "report.json");
const markdownPath = path.join(outputDir, "report.md");
const terraformImage = process.env.DEV032_TERRAFORM_IMAGE || "hashicorp/terraform:1.14.5";
const terraformExecutable = process.env.DEV032_TERRAFORM_EXECUTABLE?.trim() || null;
const terraformExecutor = terraformExecutable ? "local" : "docker";
const terraformBinaryChecksumVerified = process.env.DEV032_TERRAFORM_BINARY_SHA256_VERIFIED === "true";

function relativePath(filePath) {
  return filePath.replace(root, "").replace(/^[/\\]/u, "").replaceAll("\\", "/");
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function listFiles(directory) {
  return readdirSync(directory)
    .filter((name) => statSync(path.join(directory, name)).isFile())
    .sort();
}

function listSourceFiles() {
  return listFiles(sourceDir).filter((name) => (
    name.endsWith(".tf") ||
    name === "README.md" ||
    name === "backend.production.hcl.example" ||
    name === ".terraform.lock.hcl"
  ));
}

function sourceDigest() {
  const entries = listSourceFiles().map((name) => {
    const filePath = path.join(sourceDir, name);
    return {
      name,
      sha256: sha256(readFileSync(filePath))
    };
  });
  return {
    files: entries,
    sha256: sha256(JSON.stringify(entries))
  };
}

function dockerVolumePath(filePath) {
  return process.platform === "win32" ? filePath : path.resolve(filePath);
}

function runTerraform(name, args) {
  const startedAt = new Date().toISOString();
  if (terraformExecutable) {
    try {
      const stdout = execFileSync(terraformExecutable, args, {
        cwd: workspaceDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000
      });
      return {
        name,
        command: [terraformExecutable, ...args],
        terraformArgs: args,
        readOnlySource: true,
        ok: true,
        startedAt,
        stdout: stdout.trim(),
        stderr: "",
        error: null
      };
    } catch (error) {
      return {
        name,
        command: [terraformExecutable, ...args],
        terraformArgs: args,
        readOnlySource: true,
        ok: false,
        startedAt,
        stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
        stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${dockerVolumePath(workspaceDir)}:/workspace`,
    "-w",
    "/workspace",
    terraformImage,
    ...args
  ];
  try {
    const stdout = execFileSync("docker", dockerArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180000
    });
    return {
      name,
      command: ["docker", ...dockerArgs],
      terraformArgs: args,
      readOnlySource: true,
      ok: true,
      startedAt,
      stdout: stdout.trim(),
      stderr: "",
      error: null
    };
  } catch (error) {
    return {
      name,
      command: ["docker", ...dockerArgs],
      terraformArgs: args,
      readOnlySource: true,
      ok: false,
      startedAt,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseValidateJson(result) {
  if (!result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function findGeneratedTerraformArtifacts(directory) {
  const findings = [];
  function visit(current) {
    if (!existsSync(current)) return;
    for (const name of readdirSync(current)) {
      const absolute = path.join(current, name);
      const relative = relativePath(absolute);
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        if (name === ".terraform") findings.push(relative);
        visit(absolute);
      } else if (name.endsWith(".tfstate") || name.includes(".tfstate.") || name.endsWith(".tfplan")) {
        findings.push(relative);
      }
    }
  }
  visit(directory);
  return findings.sort();
}

function writeMarkdown(report) {
  const lines = [
    "# DEV-032 Production IaC Terraform Validate",
    "",
    `Generated: ${report.generatedAt}`,
    `Terraform executor: \`${report.terraform.executor}\``,
    `Terraform distribution: \`${report.terraform.image ?? report.terraform.executable}\``,
    `Production action performed: \`${report.productionActionPerformed}\``,
    `Terraform plan executed: \`${report.terraformPlanExecuted}\``,
    `Terraform apply executed: \`${report.terraformApplyExecuted}\``,
    `Status: \`${report.status}\``,
    "",
    "## Checks",
    "",
    ...report.commands.map((item) => `- ${item.ok ? "PASS" : "FAIL"} \`terraform ${item.terraformArgs.join(" ")}\``),
    "",
    "## Result",
    "",
    `- Source digest: \`${report.source.sha256}\``,
    `- Validate valid: \`${report.validation.valid}\``,
    `- Validate errors: \`${report.validation.errorCount}\``,
    `- Validate warnings: \`${report.validation.warningCount}\``,
    "",
    "## Stop Conditions",
    "",
    ...report.stopConditions.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(workspaceDir, { recursive: true });
for (const name of listSourceFiles()) {
  copyFileSync(path.join(sourceDir, name), path.join(workspaceDir, name));
}

const source = sourceDigest();
const version = runTerraform("version", ["version"]);
const fmt = runTerraform("fmt-check", ["fmt", "-check", "-diff", "-recursive"]);
const init = runTerraform("init-backend-false", ["init", "-backend=false", "-input=false", "-no-color"]);
const validate = runTerraform("validate-json", ["validate", "-no-color", "-json"]);
const validateJson = parseValidateJson(validate);
const generatedTerraformArtifacts = findGeneratedTerraformArtifacts(workspaceDir);
const commands = [version, fmt, init, validate];
const validationValid = validateJson?.valid === true;
const report = {
  schemaVersion: 1,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  status: commands.every((item) => item.ok) && validationValid ? "terraform_static_validate_passed_no_plan_no_apply" : "terraform_static_validate_failed",
  productionActionPerformed: false,
  terraformPlanExecuted: false,
  terraformApplyExecuted: false,
  terraformImportExecuted: false,
  backendDisabled: true,
  source: {
    directory: "infra/google-cloud/production",
    copiedWorkspace: relativePath(workspaceDir),
    ...source
  },
  terraform: {
    image: terraformExecutor === "docker" ? terraformImage : null,
    executable: terraformExecutor === "local" ? path.basename(terraformExecutable) : null,
    executor: terraformExecutor,
    binaryChecksumVerified: terraformExecutor === "local" ? terraformBinaryChecksumVerified : null,
    localTerraformRequired: terraformExecutor === "local",
    versionOk: version.ok && version.stdout.includes("Terraform v1.14.5")
  },
  validation: {
    valid: validationValid,
    errorCount: validateJson?.error_count ?? null,
    warningCount: validateJson?.warning_count ?? null,
    formatVersion: validateJson?.format_version ?? null
  },
  generatedTerraformArtifacts,
  commands: commands.map((command) => ({
    name: command.name,
    command: command.command,
    terraformArgs: command.terraformArgs,
    readOnlySource: command.readOnlySource,
    ok: command.ok,
    stdout: command.stdout.slice(0, 12000),
    stderr: command.stderr.slice(0, 12000),
    error: command.error
  })),
  stopConditions: [
    "This evidence only proves Terraform formatting, provider initialization with backend disabled, and static validation.",
    "Do not treat this as a credentialled production plan.",
    "Do not run terraform plan/apply/import/destroy from this report.",
    "Production target, env/secret readback, costed plan review, HD-8-4 restore/reconciliation, rollback and Level 3/4 smoke remain required."
  ]
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, writeMarkdown(report), "utf8");

console.log(JSON.stringify({
  outputPath: relativePath(reportPath),
  markdownPath: relativePath(markdownPath),
  status: report.status,
  terraformExecutor,
  productionActionPerformed: report.productionActionPerformed,
  terraformPlanExecuted: report.terraformPlanExecuted,
  terraformApplyExecuted: report.terraformApplyExecuted,
  validation: report.validation
}, null, 2));

if (report.status !== "terraform_static_validate_passed_no_plan_no_apply") {
  process.exitCode = 1;
}
