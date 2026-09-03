#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
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
      command: [options.displayCommand ?? command, ...(options.displayArgs ?? commandArgs)],
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
      command: [options.displayCommand ?? command, ...(options.displayArgs ?? commandArgs)],
      readOnly: true,
      ok: false,
      startedAt,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function runGcloudReadOnlyCommand(name, commandArgs, options = {}) {
  if (process.platform === "win32") {
    return runReadOnlyCommand(name, "cmd.exe", ["/d", "/s", "/c", "gcloud", ...commandArgs], {
      ...options,
      displayCommand: "gcloud",
      displayArgs: commandArgs
    });
  }
  return runReadOnlyCommand(name, "gcloud", commandArgs, options);
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

const firebaseRc = readJsonIfExists(".firebaserc");
const firebaseJson = readJsonIfExists("firebase.json");
const productionFirebaseHostingJson = readJsonIfExists("config/platform/firebase-hosting.production.json");
const releaseManifest = readJsonIfExists("output/dev-032-release-source/manifest.json");
const productionTargetContract = readJsonIfExists("config/platform/production-target.template.json");
const contractTarget = productionTargetContract.parsed?.target ?? {};
const contractSecrets = productionTargetContract.parsed?.secrets ?? {};
const targetProject = process.env.DEV032_PRODUCTION_PROJECT || contractTarget.projectId || "jenfu-ai-pdm-prod";
const region = process.env.DEV032_PRODUCTION_REGION || contractTarget.region || "asia-east1";
const expectedRunService = process.env.DEV032_PRODUCTION_CLOUD_RUN_SERVICE || contractTarget.runtimeService || "ai-pdm-prod";
const expectedCloudSqlInstance = process.env.DEV032_PRODUCTION_CLOUD_SQL_INSTANCE || contractTarget.cloudSqlInstance || "ai-pdm-prod-postgres";
const requiredSecretIds = Array.isArray(contractSecrets.requiredSecretIds) && contractSecrets.requiredSecretIds.length > 0
  ? contractSecrets.requiredSecretIds
  : ["pdm-session-signing-current", "pdm-session-signing-previous"];

const commands = {
  activeAccount: runGcloudReadOnlyCommand("active-account", ["config", "get-value", "account"], { timeoutMs: 10000 }),
  activeProject: runGcloudReadOnlyCommand("active-project", ["config", "get-value", "project"], { timeoutMs: 10000 }),
  projectDescribe: runGcloudReadOnlyCommand("production-project-describe", ["projects", "describe", targetProject, "--format=json"]),
  runServices: runGcloudReadOnlyCommand("production-cloud-run-services", ["run", "services", "list", "--project", targetProject, "--region", region, "--format=json"]),
  sqlInstances: runGcloudReadOnlyCommand("production-cloud-sql-instances", ["sql", "instances", "list", "--project", targetProject, "--format=json"]),
  secrets: runGcloudReadOnlyCommand("production-secret-metadata", ["secrets", "list", "--project", targetProject, "--format=json"])
};

const localEnvSources = [
  ".env.production",
  ".env.production.local",
  "infra/google-cloud/production/production.auto.tfvars.json"
].map((filePath) => ({
  kind: "local_file",
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
const productionFirebaseHosting = productionFirebaseHostingJson.parsed?.hosting ?? null;
const firebaseHasProductionAlias = Object.values(firebaseProjects).includes(targetProject);
const firebaseOnlyStaging = Object.values(firebaseProjects).length > 0 && !firebaseHasProductionAlias;
const firebaseProductionConfigReady = (
  firebaseHasProductionAlias &&
  productionFirebaseHosting?.site === targetProject &&
  productionFirebaseHosting?.rewrites?.[0]?.run?.serviceId === expectedRunService &&
  productionFirebaseHosting?.rewrites?.[0]?.run?.region === region
);

const productionRunService = Array.isArray(runServices)
  ? runServices.find((service) => service.metadata?.name === expectedRunService)
  : null;
const productionRuntimeContainers = productionRunService?.spec?.template?.spec?.containers ?? [];
const productionRuntimeEnv = productionRuntimeContainers
  .flatMap((container) => Array.isArray(container.env) ? container.env : [])
  .filter((entry) => typeof entry?.name === "string" && entry.name.length > 0);
const productionRuntimeEnvByName = new Map(productionRuntimeEnv.map((entry) => [entry.name, entry]));
const requiredPublicEnv = Array.isArray(productionTargetContract.parsed?.runtimeEnvironment?.requiredPublicEnv)
  ? productionTargetContract.parsed.runtimeEnvironment.requiredPublicEnv
  : [];
const requiredSecretBackedEnv = Array.isArray(productionTargetContract.parsed?.runtimeEnvironment?.requiredSecretBackedEnv)
  ? productionTargetContract.parsed.runtimeEnvironment.requiredSecretBackedEnv
  : [];
const missingRequiredPublicEnv = requiredPublicEnv.filter((name) => !productionRuntimeEnvByName.has(name));
const missingRequiredSecretBackedEnv = requiredSecretBackedEnv.filter((name) => !productionRuntimeEnvByName.has(name));
const invalidRequiredSecretBackedEnv = requiredSecretBackedEnv.filter((name) => {
  const secretRef = productionRuntimeEnvByName.get(name)?.valueFrom?.secretKeyRef;
  return !secretRef?.name || !requiredSecretIds.includes(secretRef.name);
});
const cloudRunRevisionEnvSource = {
  kind: "cloud_run_revision",
  resource: `projects/${targetProject}/locations/${region}/services/${expectedRunService}`,
  revisionName: productionRunService?.status?.latestReadyRevisionName ?? null,
  exists: Boolean(productionRunService),
  valuesPersisted: false,
  requiredPublicEnv,
  presentPublicEnv: requiredPublicEnv.filter((name) => productionRuntimeEnvByName.has(name)),
  missingRequiredPublicEnv,
  requiredSecretBackedEnv,
  presentSecretBackedEnv: requiredSecretBackedEnv.filter((name) => {
    const secretRef = productionRuntimeEnvByName.get(name)?.valueFrom?.secretKeyRef;
    return Boolean(secretRef?.name && requiredSecretIds.includes(secretRef.name));
  }),
  missingRequiredSecretBackedEnv,
  invalidRequiredSecretBackedEnv
};
const envSources = [...localEnvSources, cloudRunRevisionEnvSource];
const productionEnvSourceReady = (
  cloudRunRevisionEnvSource.exists &&
  missingRequiredPublicEnv.length === 0 &&
  missingRequiredSecretBackedEnv.length === 0 &&
  invalidRequiredSecretBackedEnv.length === 0
);
const productionSqlInstances = Array.isArray(sqlInstances) ? sqlInstances : [];
const productionSqlInstance = productionSqlInstances.find((instance) => instance.name === expectedCloudSqlInstance) ?? null;
const productionSecrets = Array.isArray(secretMetadata) ? secretMetadata : [];
const productionSecretIds = productionSecrets
  .map((secret) => String(secret.name ?? "").split("/").pop())
  .filter(Boolean);
const missingRequiredSecretIds = requiredSecretIds.filter((secretId) => !productionSecretIds.includes(secretId));

const blockers = [];

if (!productionTargetContract.exists || !productionTargetContract.parsed) {
  blockers.push(blocker("PRODUCTION_TARGET_CONTRACT_MISSING", "Production target contract template is missing or unreadable.", {
    path: "config/platform/production-target.template.json",
    parseError: productionTargetContract.error
  }));
}
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
if (!firebaseProductionConfigReady) {
  blockers.push(blocker("FIREBASE_CONFIG_NOT_PRODUCTION_READY", "Repo Firebase config is not a production provider config.", {
    projects: firebaseProjects,
    firebaseOnlyStaging,
    productionHostingConfigPath: productionFirebaseHostingJson.exists ? "config/platform/firebase-hosting.production.json" : null,
    targetProject
  }));
}
if (!productionEnvSourceReady) {
  blockers.push(blocker("PRODUCTION_ENV_SOURCE_MISSING", "The live production Cloud Run revision does not prove every required public env name and Secret Manager binding.", {
    envSources,
    missingRequiredPublicEnv,
    missingRequiredSecretBackedEnv,
    invalidRequiredSecretBackedEnv
  }));
}
if (!productionRunService) {
  blockers.push(blocker("PRODUCTION_CLOUD_RUN_SERVICE_UNPROVEN", "Expected production Cloud Run service was not proven readable.", {
    expectedRunService,
    commandOk: commands.runServices.ok,
    serviceCount: Array.isArray(runServices) ? runServices.length : null
  }));
}
if (!productionSqlInstance) {
  blockers.push(blocker("PRODUCTION_CLOUD_SQL_INSTANCE_UNPROVEN", "Expected production Cloud SQL instance metadata was not proven readable.", {
    expectedCloudSqlInstance,
    commandOk: commands.sqlInstances.ok,
    instanceCount: productionSqlInstances.length
  }));
}
if (!commands.secrets.ok || missingRequiredSecretIds.length > 0) {
  blockers.push(blocker("PRODUCTION_SECRET_SOURCE_UNPROVEN", "Required production Secret Manager metadata was not proven readable; no secret values were requested.", {
    commandOk: commands.secrets.ok,
    requiredSecretIds,
    visibleSecretIds: productionSecretIds,
    missingRequiredSecretIds
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
if (!project || !productionRunService || !productionSqlInstance) {
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
  expectedCloudSqlInstance,
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
    productionFirebaseHostingPath: productionFirebaseHostingJson.exists ? "config/platform/firebase-hosting.production.json" : null,
    productionFirebaseHostingSite: productionFirebaseHosting?.site ?? null,
    firebaseHasProductionAlias,
    firebaseProductionConfigReady,
    firebaseOnlyStaging
  },
  productionTargetContract: {
    path: productionTargetContract.exists ? "config/platform/production-target.template.json" : null,
    parseError: productionTargetContract.error,
    templateOnly: productionTargetContract.parsed?.templateOnly ?? null,
    releaseReady: productionTargetContract.parsed?.releaseReady ?? null,
    productionActionAllowed: productionTargetContract.parsed?.productionActionAllowed ?? null,
    publicBaseUrl: productionTargetContract.parsed?.target?.publicBaseUrl ?? null,
    firebaseHostingGatewayAllowed: productionTargetContract.parsed?.edge?.firebaseHostingGatewayAllowed ?? null,
    cloudRunIngress: productionTargetContract.parsed?.edge?.cloudRunIngress ?? null,
    cloudRunDefaultUrlDisabled: productionTargetContract.parsed?.edge?.cloudRunDefaultUrlDisabled ?? null,
    requiredSecretIds
  },
  envSources,
  productionEnvSourceReady,
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
    expectedCloudSqlInstance,
    expectedInstanceFound: Boolean(productionSqlInstance),
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
    requiredSecretIds,
    missingRequiredSecretIds,
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
    "## Production Target Contract",
    "",
    `- Contract: \`${reportData.productionTargetContract.path ?? "missing"}\``,
    `- Public base URL: \`${reportData.productionTargetContract.publicBaseUrl ?? "unknown"}\``,
    `- Firebase Hosting gateway allowed: \`${reportData.productionTargetContract.firebaseHostingGatewayAllowed}\``,
    `- Cloud Run ingress: \`${reportData.productionTargetContract.cloudRunIngress ?? "unknown"}\``,
    `- Expected Cloud SQL instance: \`${reportData.expectedCloudSqlInstance}\``,
    `- Required secret IDs: ${reportData.productionTargetContract.requiredSecretIds.map((item) => `\`${item}\``).join(", ")}`,
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
    ...reportData.stopConditions.map((item) => `- ${item}`)
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
