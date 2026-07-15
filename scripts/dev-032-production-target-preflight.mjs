#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const targetProject = process.env.DEV032_PRODUCTION_PROJECT || "jenfu-ai-pdm-prod";
const region = process.env.DEV032_PRODUCTION_REGION || "asia-east1";
const expectedRunService = process.env.DEV032_PRODUCTION_CLOUD_RUN_SERVICE || "ai-pdm-prod";
const outputDir = path.join(root, "output", "dev-032-production-target-preflight");
const jsonPath = path.join(outputDir, "report.json");
const mdPath = path.join(outputDir, "report.md");

function relativePath(filePath) {
  return filePath.replace(root, "").replace(/^[/\\]/u, "").replaceAll("\\", "/");
}

function readJsonIfExists(relativeFilePath) {
  const absolutePath = path.join(root, ...relativeFilePath.split("/"));
  if (!existsSync(absolutePath)) return { exists: false, parsed: null, error: null };
  try {
    return { exists: true, parsed: JSON.parse(readFileSync(absolutePath, "utf8")), error: null };
  } catch (error) {
    return { exists: true, parsed: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function runReadOnlyCommand(name, command, commandArgs, options = {}) {
  const startedAt = new Date().toISOString();
  try {
    const stdout = execFileSync(command, commandArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? 20000
    });
    return {
      name,
      command: [command, ...commandArgs],
      readOnly: true,
      ok: true,
      startedAt,
      stdout: stdout.trim(),
      stderr: "",
      error: null
    };
  } catch (error) {
    return {
      name,
      command: [command, ...commandArgs],
      readOnly: true,
      ok: false,
      startedAt,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseJsonCommand(commandResult) {
  if (!commandResult.ok || !commandResult.stdout) return null;
  try {
    return JSON.parse(commandResult.stdout);
  } catch {
    return null;
  }
}

function blocker(code, message, evidence = {}) {
  return { code, message, evidence };
}

const commands = {
  activeAccount: runReadOnlyCommand("active-account", "gcloud", ["config", "get-value", "account"], { timeoutMs: 10000 }),
  activeProject: runReadOnlyCommand("active-project", "gcloud", ["config", "get-value", "project"], { timeoutMs: 10000 }),
  projectDescribe: runReadOnlyCommand("production-project-describe", "gcloud", ["projects", "describe", targetProject, "--format=json"]),
  runServices: runReadOnlyCommand("production-cloud-run-services", "gcloud", ["run", "services", "list", "--project", targetProject, "--region", region, "--format=json"]),
  sqlInstances: runReadOnlyCommand("production-cloud-sql-instances", "gcloud", ["sql", "instances", "list", "--project", targetProject, "--format=json"]),
  secrets: runReadOnlyCommand("production-secret-metadata", "gcloud", ["secrets", "list", "--project", targetProject, "--format=json"])
};

const firebaseRc = readJsonIfExists(".firebaserc");
const firebaseJson = readJsonIfExists("firebase.json");
const releaseManifest = readJsonIfExists("output/dev-032-release-source/manifest.json");

const envSources = [".env.production", ".env.production.local"].map((filePath) => ({
  path: filePath,
  exists: existsSync(path.join(root, filePath))
}));

const activeAccount = commands.activeAccount.ok ? commands.activeAccount.stdout : null;
const activeProject = commands.activeProject.ok ? commands.activeProject.stdout : null;
const project = parseJsonCommand(commands.projectDescribe);
const runServices = parseJsonCommand(commands.runServices);
const sqlInstances = parseJsonCommand(commands.sqlInstances);
const secretMetadata = parseJsonCommand(commands.secrets);

const firebaseProjects = firebaseRc.parsed?.projects ?? {};
const firebaseHosting = firebaseJson.parsed?.hosting ?? null;
const firebaseHasProductionAlias = Object.values(firebaseProjects).includes(targetProject);
const firebaseDefaultIsProduction = firebaseProjects.default === targetProject;
const firebaseOnlyStaging = Object.values(firebaseProjects).length > 0 && !firebaseHasProductionAlias;

const productionRunService = Array.isArray(runServices)
  ? runServices.find((service) => service.metadata?.name === expectedRunService)
  : null;
const productionSqlInstances = Array.isArray(sqlInstances) ? sqlInstances : [];
const productionSecrets = Array.isArray(secretMetadata) ? secretMetadata : [];

const blockers = [];

if (activeProject !== targetProject) {
  blockers.push(blocker("ACTIVE_GCLOUD_PROJECT_IS_NOT_PRODUCTION", "Active gcloud project is not the DEV-032 production target.", { activeProject, targetProject }));
}
if (!project) {
  blockers.push(blocker("PRODUCTION_PROJECT_UNAVAILABLE", "Production project is not readable by the active account or does not exist.", {
    targetProject,
    commandOk: commands.projectDescribe.ok,
    stderr: commands.projectDescribe.stderr
  }));
}
if (!firebaseHasProductionAlias || !firebaseDefaultIsProduction) {
  blockers.push(blocker("FIREBASE_CONFIG_NOT_PRODUCTION_READY", "Repo Firebase config is not a production provider config.", {
    projects: firebaseProjects,
    firebaseOnlyStaging,
    targetProject
  }));
}
if (!envSources.some((source) => source.exists)) {
  blockers.push(blocker("PRODUCTION_ENV_SOURCE_MISSING", "No production env source file is present in the repo.", { envSources }));
}
if (!productionRunService) {
  blockers.push(blocker("PRODUCTION_CLOUD_RUN_SERVICE_UNPROVEN", "Expected production Cloud Run service was not proven readable.", {
    expectedRunService,
    commandOk: commands.runServices.ok,
    serviceCount: Array.isArray(runServices) ? runServices.length : null
  }));
}
if (productionSqlInstances.length === 0) {
  blockers.push(blocker("PRODUCTION_CLOUD_SQL_INSTANCE_UNPROVEN", "No production Cloud SQL instance metadata was proven readable.", {
    commandOk: commands.sqlInstances.ok
  }));
}
if (productionSecrets.length === 0) {
  blockers.push(blocker("PRODUCTION_SECRET_SOURCE_UNPROVEN", "No production Secret Manager metadata was proven readable; no secret values were requested.", {
    commandOk: commands.secrets.ok
  }));
}
const releaseSourceCommitted = releaseManifest.parsed?.releaseDecision?.exactReleaseCommitExists === true
  && releaseManifest.parsed?.summary?.includedProductionSourceEntries === 0
  && releaseManifest.parsed?.summary?.unknownRiskEntries === 0;
if (!releaseSourceCommitted) {
  blockers.push(blocker("RELEASE_SOURCE_NOT_SELECTED_OR_COMMITTED", "Release-source manifest does not prove an exact release commit.", {
    manifestPath: "output/dev-032-release-source/manifest.json",
    exactReleaseCommitExists: releaseManifest.parsed?.releaseDecision?.exactReleaseCommitExists ?? null,
    includedProductionSourceEntries: releaseManifest.parsed?.summary?.includedProductionSourceEntries ?? null,
    unknownRiskEntries: releaseManifest.parsed?.summary?.unknownRiskEntries ?? null,
    safeToBuildForProduction: releaseManifest.parsed?.releaseDecision?.safeToBuildForProduction ?? null,
    blocker: releaseManifest.parsed?.releaseDecision?.blocker ?? null
  }));
}
if (!project || !productionRunService || productionSqlInstances.length === 0) {
  blockers.push(blocker("LEVEL3_LEVEL4_SMOKE_NOT_POSSIBLE", "Production-like and post-deploy smoke cannot run until production runtime/database target is proven.", {
    level3Required: true,
    level4Required: true
  }));
}

const report = {
  schemaVersion: 1,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  targetProject,
  region,
  expectedRunService,
  productionActionPerformed: false,
  readOnly: true,
  releaseReady: false,
  status: blockers.length === 0 ? "preflight_readonly_passed_release_still_requires_approval" : "blocked_readonly_preflight",
  activeIdentity: {
    account: activeAccount,
    project: activeProject
  },
  project: project
    ? {
        projectId: project.projectId ?? null,
        lifecycleState: project.lifecycleState ?? null,
        name: project.name ?? null
      }
    : null,
  providerConfig: {
    firebasercPath: firebaseRc.exists ? ".firebaserc" : null,
    firebaseJsonPath: firebaseJson.exists ? "firebase.json" : null,
    firebaseProjects,
    firebaseHostingSite: Array.isArray(firebaseHosting) ? firebaseHosting.map((item) => item.site ?? null) : firebaseHosting?.site ?? null,
    firebaseHasProductionAlias,
    firebaseDefaultIsProduction,
    firebaseOnlyStaging
  },
  envSources,
  cloudRun: {
    commandOk: commands.runServices.ok,
    serviceCount: Array.isArray(runServices) ? runServices.length : null,
    expectedServiceFound: Boolean(productionRunService),
    expectedService: productionRunService
      ? {
          name: productionRunService.metadata?.name ?? null,
          location: productionRunService.metadata?.labels?.["cloud.googleapis.com/location"] ?? region,
          url: productionRunService.status?.url ?? null,
          latestReadyRevisionName: productionRunService.status?.latestReadyRevisionName ?? null
        }
      : null
  },
  cloudSql: {
    commandOk: commands.sqlInstances.ok,
    instanceCount: productionSqlInstances.length,
    instances: productionSqlInstances.map((instance) => ({
      name: instance.name ?? null,
      region: instance.region ?? null,
      databaseVersion: instance.databaseVersion ?? null,
      state: instance.state ?? null,
      availabilityType: instance.settings?.availabilityType ?? null
    }))
  },
  secrets: {
    commandOk: commands.secrets.ok,
    secretCount: productionSecrets.length,
    namesOnly: productionSecrets.map((secret) => secret.name ?? null).filter(Boolean)
  },
  releaseSource: {
    manifestPath: releaseManifest.exists ? "output/dev-032-release-source/manifest.json" : null,
    manifestStatus: releaseManifest.parsed?.status ?? null,
    exactReleaseCommitExists: releaseManifest.parsed?.releaseDecision?.exactReleaseCommitExists ?? null,
    includedProductionSourceEntries: releaseManifest.parsed?.summary?.includedProductionSourceEntries ?? null,
    unknownRiskEntries: releaseManifest.parsed?.summary?.unknownRiskEntries ?? null,
    safeToBuildForProduction: releaseManifest.parsed?.releaseDecision?.safeToBuildForProduction ?? null,
    blocker: releaseManifest.parsed?.releaseDecision?.blocker ?? null
  },
  blockers,
  commands: Object.values(commands).map((command) => ({
    name: command.name,
    command: command.command,
    readOnly: command.readOnly,
    ok: command.ok,
    stderr: command.stderr ? command.stderr.slice(0, 2000) : ""
  })),
  stopConditions: [
    "This report is read-only discovery evidence only.",
    "Do not apply Terraform, deploy, import SQL, execute migration jobs or create production resources from this report.",
    "Do not print or persist secret values.",
    "Do not proceed to production build/deploy until release source, production target, env/secret source, HD-8-4 restore/reconciliation, rollback and Level 3/4 smoke gates are closed."
  ]
};

function writeMarkdown(reportData) {
  const lines = [
    "# DEV-032 Production Target Read-only Preflight",
    "",
    `Generated: ${reportData.generatedAt}`,
    `Target project: \`${reportData.targetProject}\``,
    `Region: \`${reportData.region}\``,
    `Production action performed: \`${reportData.productionActionPerformed}\``,
    `Status: \`${reportData.status}\``,
    "",
    "## Result",
    "",
    reportData.blockers.length === 0
      ? "Read-only target discovery did not find target-level blockers, but release still requires separate approval and post-deploy smoke."
      : `Blocked by ${reportData.blockers.length} read-only preflight blocker(s).`,
    "",
    "## Active Identity",
    "",
    `- Account: \`${reportData.activeIdentity.account ?? "unknown"}\``,
    `- Active project: \`${reportData.activeIdentity.project ?? "unknown"}\``,
    "",
    "## Blockers",
    "",
    ...reportData.blockers.map((item) => `- \`${item.code}\`: ${item.message}`),
    "",
    "## Read-only Commands",
    "",
    ...reportData.commands.map((item) => `- ${item.ok ? "PASS" : "BLOCKED"} \`${item.command.join(" ")}\``),
    "",
    "## Stop Conditions",
    "",
    ...reportData.stopConditions.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(mdPath, writeMarkdown(report), "utf8");

console.log(JSON.stringify({
  outputPath: relativePath(jsonPath),
  markdownPath: relativePath(mdPath),
  status: report.status,
  targetProject: report.targetProject,
  productionActionPerformed: report.productionActionPerformed,
  blockerCount: report.blockers.length,
  blockers: report.blockers.map((item) => item.code)
}, null, 2));

if (!args.has("--allow-blocked") && report.blockers.length > 0) {
  process.exitCode = 1;
}
