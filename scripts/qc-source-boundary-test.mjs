#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const requiredIgnoredPaths = [
  ".next/",
  "node_modules/",
  "cloud-functions/release-handler/node_modules/",
  "sw-addin/bin/",
  "sw-addin/obj/",
  "tsconfig.tsbuildinfo"
];

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

const read = (relativePath) => readProjectFile(root, relativePath);

const exists = (relativePath) => projectFileExists(root, relativePath);

function writesOpenAiUsageInsideRepo(source) {
  return /data["'`]\s*,\s*["'`]qc-openai-usage/.test(source) || /data[\\/]+qc-openai-usage/.test(source);
}

function cleansTempUsageDir(source) {
  const match = /fs\.rmSync\(\s*usageDir\s*,\s*\{(?<options>[^}]*)\}\s*\)/s.exec(source);
  const options = match?.groups?.options ?? "";
  return /\brecursive\s*:\s*true\b/.test(options) && /\bforce\s*:\s*true\b/.test(options);
}

function passesUsageDirToAppEnv(source) {
  return /\bPDM_AI_USAGE_DIR\s*:\s*usageDir\b/.test(source);
}

function verifiesUsageDirCleanup(source) {
  return source.includes("function cleanupUsageDir") && source.includes("OPENAI-026 usage temp dir is removed");
}

function verifiesUsageDirUnderOsTemp(source) {
  return source.includes("function isPathInside") && source.includes("OPENAI-020 usage dir is under OS temp");
}

function verifiesUsageLogMetadataOnly(source) {
  return source.includes("function hasRawUsagePayload") && source.includes("OPENAI-021 usage log stays metadata-only");
}

function verifiesUsageLogApprovedFields(source) {
  return source.includes("allowedUsageEventKeys") && source.includes("OPENAI-022 usage log uses approved metadata fields");
}

function verifiesUsageLogMetadataQuality(source) {
  return (
    source.includes("function hasIsoTimestamp") &&
    source.includes("OPENAI-023 usage log has ISO timestamps") &&
    source.includes("function hasSha256PromptHash") &&
    source.includes("OPENAI-024 usage log has hashed prompts") &&
    source.includes("function isOptionalPositiveInteger") &&
    source.includes("function hasValidUsageMetadataTypes") &&
    source.includes("OPENAI-025 usage log has valid metadata types")
  );
}

function verifiesUsageLogExpectedEventCount(source) {
  return source.includes("usageEvents.length >= 4") && source.includes("OPENAI-014 usage log records expected event count");
}

function hasNoImportStatements(source) {
  return !/^\s*import\s/m.test(source);
}

function keepsOpenAiKeyServerOnly(source) {
  return source.includes("process.env.OPENAI_API_KEY") && !source.includes("NEXT_PUBLIC_OPENAI_API_KEY");
}

function normalizesLlmConfigStrings(source) {
  return (
    source.includes("function parseConfigString") &&
    source.includes("value?.trim()") &&
    source.includes('provider: parseConfigString(process.env.LLM_PROVIDER, "local")') &&
    source.includes('openAiApiKey: parseConfigString(process.env.OPENAI_API_KEY, "")') &&
    source.includes('openAiModel: parseConfigString(process.env.OPENAI_MODEL, "gpt-4.1-mini")') &&
    source.includes('openAiApiBaseUrl: parseConfigString(process.env.OPENAI_API_BASE_URL, "https://api.openai.com/v1")')
  );
}

function parsesLlmConfigIntegersStrictly(source) {
  return (
    source.includes("function parseStrictInteger") &&
    source.includes("value?.trim()") &&
    source.includes("!/^\\d+$/.test(trimmed)") &&
    source.includes("Number.isSafeInteger(parsed)") &&
    source.includes("openAiTimeoutMs: parsePositiveInt(process.env.OPENAI_TIMEOUT_MS, 30000)")
  );
}

function keepsLlmDisableTogglesReachable(source) {
  return (
    source.includes("function parseNonNegativeInt") &&
    source.includes("parsed !== null && parsed >= 0") &&
    source.includes("openAiMaxContextChars: parseNonNegativeInt(process.env.OPENAI_MAX_CONTEXT_CHARS, 12000)") &&
    source.includes("openAiCacheTtlMs: parseNonNegativeInt(process.env.OPENAI_CACHE_TTL_MS, 300000)") &&
    source.includes("openAiRateLimitPerMinute: parseNonNegativeInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE, 20)")
  );
}

function normalizesOpenAiBaseUrl(source) {
  return source.includes("openAiApiBaseUrl.replace(/\\/+$");
}

function verifiesOpenAiHttpErrorCoverage(source) {
  return (
    source.includes("mockHttpErrorTrigger") &&
    source.includes("OPENAI-029 upstream HTTP error returns chat response") &&
    source.includes("OPENAI-031 usage log records upstream HTTP error metadata") &&
    source.includes('event.errorReason === "http_503"') &&
    source.includes("OPENAI-032 usage log does not include raw HTTP error prompt")
  );
}

function verifiesSupplierResponseIdContract(source) {
  return (
    source.includes('const supplierResponseId = typeof supplierResponseBody.response?.id === "string" ? supplierResponseBody.response.id : ""') &&
    source.includes("SUPPLIER-004A public supplier response returns an id") &&
    source.includes("Boolean(supplierResponseId) && publicShareAfterSupplierBody.supplier_responses?.some") &&
    source.includes("const listedSupplierResponse = managerSupplierListBody.responses?.find") &&
    source.includes("const closeSupplierResponseId = listedSupplierResponse?.id ?? supplierResponseId") &&
    source.includes("/supplier-responses/${closeSupplierResponseId}")
  );
}

function settingsUsesLlmConfig(source) {
  return (
    source.includes('import { llmConfig } from "@/lib/llm-config"') &&
    source.includes("llmProvider: llmConfig.provider") &&
    source.includes("openAiConfigured: Boolean(llmConfig.openAiApiKey)") &&
    source.includes("openAiModel: llmConfig.openAiModel") &&
    !source.includes("process.env.LLM_PROVIDER") &&
    !source.includes("process.env.OPENAI_API_KEY") &&
    !source.includes("process.env.OPENAI_MODEL")
  );
}

function fullGateRunsLlmConfigQc(source) {
  return (
    source.includes('await runNpmStep("LLM config parsing", "qc:llm-config")') &&
    source.indexOf('"qc:llm-config"') < source.indexOf('"qc:openai-provider"')
  );
}

function fullGateRunsSourceBoundary(source) {
  return (
    source.includes('await runNpmStep("source boundary", "qc:source-boundary")') &&
    source.indexOf('"qc:source-boundary"') < source.indexOf('"qc:policy-alignment"')
  );
}

function fullGateUsesQcOnlyListenerBudget(source) {
  return (
    source.includes('import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs"') &&
    source.includes('import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs"') &&
    source.includes('app = startNextApp(root, "dev", port)')
  );
}

function fullGateScansProcessWarnings(source) {
  return (
    source.includes('import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs"') &&
    source.includes('assertNoDisallowedProcessWarnings(record, "dev server", app.getOutput())')
  );
}

function fullGateUsesSharedNpmStepRunner(source) {
  return (
    source.includes('import { createNpmStepRunner } from "./qc-npm-step-runner.mjs"') &&
    source.includes('const { runNpmStep, runNpmCommandStep } = createNpmStepRunner(root, record, "qc:full")') &&
    !source.includes("function resolveNpmCommand") &&
    !source.includes("async function runNpmStep") &&
    !source.includes("async function runNpmCommandStep")
  );
}

function industrializationGateUsesQcOnlyListenerBudget(source) {
  return (
    source.includes('import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs"') &&
    source.includes('import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs"') &&
    source.includes('app = startNextApp(root, "start", port)')
  );
}

function industrializationGateScansProcessWarnings(source) {
  return (
    source.includes('import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs"') &&
    source.includes('assertNoDisallowedProcessWarnings(record, "production server", app.getOutput())')
  );
}

function industrializationGateUsesSharedNpmStepRunner(source) {
  return (
    source.includes('import { createNpmStepRunner } from "./qc-npm-step-runner.mjs"') &&
    source.includes('const { runNpmStep } = createNpmStepRunner(root, record, "qc:industrialization")') &&
    !source.includes("function resolveNpmCommand") &&
    !source.includes("async function runNpmStep")
  );
}

function listenerBudgetPreloadIsQcOnly(source) {
  return (
    source.includes("const listenerBudget = 64") &&
    source.includes("process.stdout") &&
    source.includes("process.stderr") &&
    source.includes("setMaxListeners") &&
    !source.includes("process.env") &&
    !source.includes("fs") &&
    !source.includes("path")
  );
}

function hasOnlyAscii(source) {
  return /^[\x00-\x7F]*$/u.test(source);
}

function dataBoundaryLimitsTrackedData(source) {
  return (
    source.includes('const allowedTrackedDataFiles = new Set(["data/quality/defect-register.json"])') &&
    source.includes("unexpectedTrackedDataFiles") &&
    source.includes("DATA-BOUNDARY tracked data limited to quality baseline") &&
    source.includes("DATA-BOUNDARY quality baseline remains tracked") &&
    !source.includes("DATA-BOUNDARY data root not tracked")
  );
}

function externalAssetVerifierSupportsEmptyInventory(source) {
  return (
    source.includes("function createEmptySummary") &&
    source.includes('status: "empty"') &&
    source.includes('createEmptySummary("manifest_not_found")') &&
    source.includes('createEmptySummary("no_external_assets"') &&
    source.includes("Manifest must use schemaVersion 1 and an entries array.") &&
    !source.includes("contain at least one entry")
  );
}

function industrializationGateRunsAssetManifest(source) {
  return source.includes('await runNpmStep("asset manifest", "assets:verify")');
}

function industrializationGateRunsStorageAccessAudit(source) {
  return source.includes('await runNpmStep("Storage access audit contract", "qc:file-storage-access-audit")');
}

function gatePreservesGeneratedTypeReference(source) {
  return (
    source.includes('import { createGeneratedTypeReferenceGuard } from "./qc-generated-type-reference-guard.mjs"') &&
    source.includes("const restoreGeneratedTypeReference = createGeneratedTypeReferenceGuard(root, record)") &&
    source.includes("restoreGeneratedTypeReference();")
  );
}

function generatedTypeReferenceGuardIsQcOnly(source) {
  return (
    source.includes('import fs from "node:fs"') &&
    source.includes('import { projectFileExists, projectPath, readProjectFile } from "./qc-project-file-utils.mjs"') &&
    source.includes("export function createGeneratedTypeReferenceGuard") &&
    source.includes('const generatedTypeReferencePath = projectPath(root, "next-env.d.ts")') &&
    source.includes("generatedTypeReferenceSnapshot") &&
    source.includes("return function restoreGeneratedTypeReference()") &&
    source.includes('record("restore generated type reference", true, "next-env.d.ts")') &&
    !source.includes("process.env") &&
    !source.includes("next/server")
  );
}

function processWarningGuardIsQcOnly(source) {
  return (
    source.includes("const disallowedProcessWarningPatterns") &&
    source.includes("/MaxListenersExceededWarning/") &&
    source.includes("/Possible EventEmitter memory leak/") &&
    source.includes('export const qcListenerBudgetPreload = "./scripts/qc-node-listener-budget.cjs"') &&
    source.includes("export function appendNodeOptions") &&
    source.includes("export function assertNoDisallowedProcessWarnings") &&
    source.includes("record(`${name} warning scan`, passed") &&
    !source.includes("process.env") &&
    !source.includes("next/server")
  );
}

function commandRunnerIsQcOnly(source) {
  return (
    source.includes('import { spawn } from "node:child_process"') &&
    source.includes("function quoteWindowsShellArg") &&
    source.includes("export function runQcCommand") &&
    source.includes('process.platform === "win32"') &&
    source.includes("spawn([command, ...args].map(quoteWindowsShellArg).join(\" \"),") &&
    source.includes("env: { ...process.env, ...options.env }") &&
    source.includes("if (!options.quiet) process.stdout.write(text)") &&
    source.includes("if (!options.quiet) process.stderr.write(text)") &&
    source.includes("resolve({ code, output })") &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function projectFileUtilsIsQcOnly(source) {
  return (
    source.includes('import fs from "node:fs"') &&
    source.includes('import path from "node:path"') &&
    source.includes("export function projectPath") &&
    source.includes("return path.join(root, ...relativePath.split(\"/\"))") &&
    source.includes("export function readProjectFile") &&
    source.includes("fs.readFileSync(projectPath(root, relativePath), \"utf8\")") &&
    source.includes("export function projectFileExists") &&
    source.includes("fs.existsSync(projectPath(root, relativePath))") &&
    source.includes("export function readProjectFileIfExists") &&
    source.includes("projectFileExists(root, relativePath) ? readProjectFile(root, relativePath) : fallback") &&
    source.includes("export function readProjectJson") &&
    source.includes("JSON.parse(readProjectFile(root, relativePath))") &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function fileHashUtilsIsQcOnly(source) {
  return (
    source.includes('import crypto from "node:crypto"') &&
    source.includes('import { readFile } from "node:fs/promises"') &&
    source.includes("export function sha256Bytes") &&
    source.includes('crypto.createHash("sha256").update(bytes).digest("hex")') &&
    source.includes("export async function sha256File") &&
    source.includes("sha256Bytes(await readFile(filePath))") &&
    !source.includes("process.env") &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function fileStorageFixtureHashQcsUseSharedHelper(sources) {
  return sources.every(
    (source) =>
      source.includes('from "./qc-file-hash-utils.mjs"') &&
      !source.includes('import crypto from "node:crypto"') &&
      !source.includes("function sha256(") &&
      !source.includes("function sha256File(")
  );
}

function fileStorageTempFixtureQcsCleanInFinally(sources) {
  const cleanupInFinallyPattern =
    /finally(?:\s*\(\s*async\s*\(\)\s*=>)?\s*\{[\s\S]*\b(?:fs|fsp)\.rm\(tempRoot,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/;
  return sources.every(
    (source) =>
      source.includes("mkdtemp(") &&
      cleanupInFinallyPattern.test(source)
  );
}

function fileStorageUploadDedupQcCleansTmpRootInFinally(source) {
  const cleanupInFinallyPattern =
    /finally\s*\{[\s\S]*\bfsp\.rm\(tmpRoot,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/;
  return source.includes("mkdtemp(") && cleanupInFinallyPattern.test(source);
}

function productionReadinessReportRunnerIsQcOnly(source) {
  return (
    source.includes('import { spawnSync } from "node:child_process"') &&
    source.includes("export function runProductionReadinessReport") &&
    source.includes('"scripts/qc-production-readiness-test.mjs"') &&
    source.includes('args.push("--allow-open")') &&
    source.includes("spawnSync(process.execPath, args") &&
    source.includes("cwd: root") &&
    source.includes("encoding: \"utf8\"") &&
    source.includes("windowsHide: true") &&
    source.includes("return { run, report: JSON.parse(run.stdout) }") &&
    source.includes("return { run, report: null }") &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function npmStepRunnerIsQcOnly(source) {
  return (
    source.includes('import { runQcCommand } from "./qc-command-runner.mjs"') &&
    source.includes('import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs"') &&
    source.includes("function resolveNpmCommand") &&
    source.includes('process.platform === "win32" ? "npm.cmd" : "npm"') &&
    source.includes("async function runNpmCommand") &&
    source.includes("const result = await runQcCommand(root, npm, args, options)") &&
    source.includes('record(name, passed, passed ? "exit 0" : `exit ${result.code}`)') &&
    source.includes("assertNoDisallowedProcessWarnings(record, name, result.output)") &&
    source.includes("export function createNpmStepRunner") &&
    source.includes('return runNpmCommand(root, record, logPrefix, name, ["run", script], options)') &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function nextAppRunnerIsQcOnly(source) {
  return (
    source.includes('import { spawn } from "node:child_process"') &&
    source.includes('import { createServer } from "node:http"') &&
    source.includes('import { appendNodeOptions, qcListenerBudgetPreload } from "./qc-process-warning-guard.mjs"') &&
    source.includes("export function getFreePort") &&
    source.includes("export function startNextApp") &&
    source.includes('mode !== "dev" && mode !== "start"') &&
    source.includes("NODE_OPTIONS: appendNodeOptions(process.env.NODE_OPTIONS") &&
    source.includes("--require ${qcListenerBudgetPreload}") &&
    source.includes('PDM_RELEASE_MODE: "local_stub"') &&
    source.includes("export async function waitForNextAppReady") &&
    source.includes("export async function stopNextApp") &&
    source.includes('child.kill("SIGINT")') &&
    source.includes('child.kill("SIGTERM")') &&
    source.includes('child.kill("SIGKILL")') &&
    !source.includes("next/server") &&
    !source.includes("@/")
  );
}

function gateUsesProductionReadinessReportRunner(source) {
  return (
    source.includes('import { runProductionReadinessReport } from "./qc-production-readiness-report-runner.mjs"') &&
    source.includes("runProductionReadinessReport(root)") &&
    !source.includes("spawnSync(process.execPath, [\"scripts/qc-production-readiness-test.mjs\"") &&
    !source.includes("function parseJson") &&
    !source.includes("function runReadinessReport")
  );
}

function qcUsesProjectFileUtils(source, expectedHelpers) {
  const legacyPatterns = [
    "function read" + "(relativePath)",
    "function read" + "(filePath)",
    "function exists" + "(relativePath)",
    "JSON.parse(" + 'read("package.json"))',
    "fs.readFileSync(" + "path.join(root"
  ];

  return (
    source.includes('from "./qc-project-file-utils.mjs"') &&
    expectedHelpers.every((helper) => source.includes(helper)) &&
    legacyPatterns.every((pattern) => !source.includes(pattern))
  );
}

for (const ignoredPath of requiredIgnoredPaths) {
  const ignored = runGit(["check-ignore", "-v", "--", ignoredPath]);
  record(
    `SOURCE-BOUNDARY ignored: ${ignoredPath}`,
    ignored.status === 0,
    (ignored.stdout || ignored.stderr).trim()
  );

  const tracked = runGit(["ls-files", "--", ignoredPath]);
  record(
    `SOURCE-BOUNDARY not tracked: ${ignoredPath}`,
    tracked.status === 0 && tracked.stdout.trim() === "",
    tracked.stdout.trim()
  );
}

record("SOURCE-BOUNDARY root package-lock exists", exists("package-lock.json"), "package-lock.json");
record(
  "SOURCE-BOUNDARY cloud function package-lock exists",
  exists("cloud-functions/release-handler/package-lock.json"),
  "cloud-functions/release-handler/package-lock.json"
);

const gcloudignore = read("cloud-functions/release-handler/.gcloudignore");
record(
  "SOURCE-BOUNDARY cloud function deployment excludes node_modules",
  /^node_modules\/$/m.test(gcloudignore),
  "cloud-functions/release-handler/.gcloudignore"
);
record(
  "SOURCE-BOUNDARY cloud function deployment excludes local secrets",
  /^\.env$/m.test(gcloudignore) && /^\.env\.\*$/m.test(gcloudignore) && /^secrets\/$/m.test(gcloudignore),
  "cloud-functions/release-handler/.gcloudignore"
);

const addinProject = read("sw-addin/AiPdmAddin.csproj");
record(
  "SOURCE-BOUNDARY add-in outputs are generated under bin folders",
  addinProject.includes("<OutputPath>bin\\Debug\\</OutputPath>") &&
    addinProject.includes("<OutputPath>bin\\Release\\</OutputPath>"),
  "sw-addin/AiPdmAddin.csproj"
);
record(
  "SOURCE-BOUNDARY add-in project has source-level compile items",
  [
    "SwAddin.cs",
    "Services\\PropertyExtractor.cs",
    "Services\\FileCollector.cs",
    "Services\\ApiClient.cs",
    "Views\\SubmissionWindow.xaml"
  ].every((item) => addinProject.includes(item)),
  "sw-addin/AiPdmAddin.csproj"
);

const chatSource = read("src/lib/chat.ts");
const llmUsageSource = read("src/lib/llm-usage.ts");
const llmConfigSource = read("src/lib/llm-config.ts");
const llmConfigQcSource = read("scripts/qc-llm-config-test.mjs");
const configSource = read("src/lib/config.ts");
const settingsRouteSource = read("src/app/api/settings/route.ts");
const openAiQcSource = read("scripts/qc-openai-provider-test.mjs");
const apiQcSource = read("scripts/qc-api-test.mjs");
const dataBoundaryQcSource = read("scripts/qc-data-boundary-test.mjs");
const cssBoundaryQcSource = read("scripts/qc-css-boundary-test.mjs");
const adaptiveTaskFeedQcSource = read("scripts/qc-adaptive-task-feed.mjs");
const bomWorkbenchMigrationPathQcSource = read("scripts/qc-bom-workbench-migration-path.mjs");
const fileDropzoneUxQcSource = read("scripts/qc-file-dropzone-ux.mjs");
const masterAttachmentsQcSource = read("scripts/qc-master-attachments.mjs");
const partNumberModuleQcSource = read("scripts/qc-part-number-module.mjs");
const partCostReviewE2eQcSource = read("scripts/qc-part-cost-review-e2e.mjs");
const pdmNumberingCoreQcSource = read("scripts/qc-pdm-numbering-core-test.mjs");
const docPathsQcSource = read("scripts/qc-doc-paths-test.mjs");
const policyAlignmentQcSource = read("scripts/qc-policy-alignment-test.mjs");
const swAddinCompanySelectionQcSource = read("scripts/qc-sw-addin-company-selection.mjs");
const swAddinSourceQcSource = read("scripts/qc-sw-addin-source-test.mjs");
const swAddinReportUtilsSource = read("scripts/sw-addin-report-utils.mjs");
const pdmMasterWorkbenchLayoutQcSource = read("scripts/qc-pdm-master-workbench-layout.mjs");
const swLicensePdmCompanyScopeQcSource = read("scripts/qc-sw-license-pdm-company-scope.mjs");
const swLicensePdmNumberingCompanyScopeQcSource = read("scripts/qc-sw-license-pdm-numbering-company-scope.mjs");
const swLicensePdmMetadataAdapterProfileQcSource = read("scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs");
const swLicensePdmGitBoundaryQcSource = read("scripts/qc-sw-license-pdm-git-boundary.mjs");
const cleanNextSource = read("scripts/clean-next.mjs");
const fullQcSource = read("scripts/qc-full-test.mjs");
const industrializationQcSource = read("scripts/qc-industrialization-test.mjs");
const listenerBudgetPreloadSource = read("scripts/qc-node-listener-budget.cjs");
const generatedTypeReferenceGuardSource = read("scripts/qc-generated-type-reference-guard.mjs");
const processWarningGuardSource = read("scripts/qc-process-warning-guard.mjs");
const commandRunnerSource = read("scripts/qc-command-runner.mjs");
const projectFileUtilsSource = read("scripts/qc-project-file-utils.mjs");
const fileHashUtilsSource = read("scripts/qc-file-hash-utils.mjs");
const backupSource = read("scripts/backup.mjs");
const verifyBackupSource = read("scripts/verify-backup.mjs");
const restoreBackupSource = read("scripts/restore-backup.mjs");
const restoreDrillSource = read("scripts/restore-drill.mjs");
const backupRetentionDrillSource = read("scripts/backup-retention-drill.mjs");
const restoreHandoffSource = read("scripts/prepare-restore-handoff.mjs");
const productionReadinessQcSource = read("scripts/qc-production-readiness-test.mjs");
const productionReadinessReportRunnerSource = read("scripts/qc-production-readiness-report-runner.mjs");
const defectRegisterUtilsSource = read("scripts/defect-register-utils.mjs");
const policyConfirmationUtilsSource = read("scripts/policy-confirmation-utils.mjs");
const npmStepRunnerSource = read("scripts/qc-npm-step-runner.mjs");
const nextAppRunnerSource = read("scripts/qc-next-app-runner.mjs");
const externalAssetVerifierSource = read("scripts/verify-external-assets.mjs");
const externalBlockerClosureQcSource = read("scripts/qc-external-blocker-closure-package.mjs");
const fieldTestIssueImporterSource = read("scripts/import-field-test-issues.mjs");
const fieldTestIssueIntakeQcSource = read("scripts/qc-field-test-issue-intake.mjs");
const fieldTestPreflightSource = read("scripts/field-test-preflight.mjs");
const fieldTestHandoffSource = read("scripts/prepare-field-test-handoff.mjs");
const fieldTestHandoffPackageQcSource = read("scripts/qc-field-test-handoff-package.mjs");
const devTaskCompletionAuditSource = read("scripts/qc-dev-task-completion-audit.mjs");
const devTaskEvidenceSyncQcSource = read("scripts/qc-dev-task-evidence-sync.mjs");
const swAddinReportGeneratorSource = read("scripts/generate-sw-addin-test-report.mjs");
const restoreDrillReportGeneratorSource = read("scripts/generate-restore-drill-report.mjs");
const restoreDrillReportUtilsSource = read("scripts/restore-drill-report-utils.mjs");
const documentManagerReportGeneratorSource = read("scripts/generate-document-manager-report.mjs");
const documentManagerReportUtilsSource = read("scripts/document-manager-report-utils.mjs");
const documentManagerExtractorProbeQcSource = read("scripts/qc-document-manager-extractor-probe.mjs");
const documentManagerProbeRedactionQcSource = read("scripts/qc-document-manager-probe-redaction.mjs");
const documentManagerProbePathGateQcSource = read("scripts/qc-document-manager-probe-path-gate.mjs");
const productionReadinessIndustrializationGateSource = read("scripts/qc-production-readiness-industrialization-gate.mjs");
const systemSettingsAsyncQcSource = read("scripts/qc-system-settings-async-repository.mjs");
const accessControlAsyncRepositoryQcSource = read("scripts/qc-access-control-async-repository.mjs");
const dashboardCustomFinderQcSource = read("scripts/qc-dashboard-custom-finder-test.mjs");
const dashboardComponentSplitQcSource = read("scripts/qc-dashboard-component-split-test.mjs");
const dashboardRowMemoQcSource = read("scripts/qc-dashboard-row-memo-test.mjs");
const dashboardTransitionQcSource = read("scripts/qc-dashboard-transition-test.mjs");
const bomWorkbenchUiQcSource = read("scripts/qc-bom-workbench-ui.mjs");
const bomWorkbenchReviewUiQcSource = read("scripts/qc-bom-workbench-review-ui.mjs");
const pdmSystemDetailDrawerUiQcSource = read("scripts/qc-pdm-system-detail-drawer-ui.mjs");
const uxAttributeHierarchyQcSource = read("scripts/qc-ux-attribute-hierarchy.mjs");
const gdriveFolderTreeSettingsQcSource = read("scripts/qc-gdrive-folder-tree-settings.mjs");
const revisionLifecycleQcSource = read("scripts/qc-revision-lifecycle-test.mjs");
const dbProviderContractQcSource = read("scripts/qc-db-provider-contract-test.mjs");
const dbProviderPostgresQcSource = read("scripts/qc-db-provider-postgres.mjs");
const dbRepositorySplitQcSource = read("scripts/qc-db-repository-split-test.mjs");
const postgresShadowQcSource = read("scripts/qc-postgres-shadow-test.mjs");
const postgresShadowTargetGuardQcSource = read("scripts/qc-postgres-shadow-target-guard.mjs");
const postgresShadowTargetGuardUtilsSource = read("scripts/postgres-shadow-target-guard-utils.mjs");
const postgresShadowHandoffSource = read("scripts/prepare-postgres-shadow-handoff.mjs");
const postgresShadowHandoffPackageQcSource = read("scripts/qc-postgres-shadow-handoff-package.mjs");
const fileStorageDedupReferenceGeneratorSource = read("scripts/generate-file-storage-dedup-reference-dry-run.mjs");
const fileStorageDedupReferenceQcSource = read("scripts/qc-file-storage-dedup-reference.mjs");
const fileStorageCostReportGeneratorSource = read("scripts/generate-file-storage-cost-report.mjs");
const fileStorageCostReportQcSource = read("scripts/qc-file-storage-cost-report.mjs");
const fileStorageMonthlyEvidenceGeneratorSource = read("scripts/generate-file-storage-monthly-evidence.mjs");
const fileStorageMonthlyEvidenceQcSource = read("scripts/qc-file-storage-monthly-evidence.mjs");
const fileStorageMonthlyEvidenceScheduleRunnerSource = read("scripts/run-file-storage-monthly-evidence-schedule.mjs");
const fileStorageMonthlyEvidenceScheduleQcSource = read("scripts/qc-file-storage-monthly-evidence-schedule.mjs");
const fileStorageEgressReportGeneratorSource = read("scripts/generate-file-storage-egress-report.mjs");
const fileStorageEgressReportQcSource = read("scripts/qc-file-storage-egress-report.mjs");
const fileStorageEvidenceDashboardQcSource = read("scripts/qc-file-storage-evidence-dashboard.mjs");
const fileStorageGovernanceGateGeneratorSource = read("scripts/generate-file-storage-governance-gate.mjs");
const fileStorageGovernanceGateQcSource = read("scripts/qc-file-storage-governance-gate.mjs");
const fileStorageMetadataQcSource = read("scripts/qc-file-storage-metadata.mjs");
const fileStorageMigrationDryRunGeneratorSource = read("scripts/generate-file-storage-migration-dry-run.mjs");
const fileStorageMigrationDryRunQcSource = read("scripts/qc-file-storage-migration-dry-run.mjs");
const fileStorageMigrationRunbookGeneratorSource = read("scripts/generate-file-storage-migration-runbook.mjs");
const fileStorageMigrationRunbookQcSource = read("scripts/qc-file-storage-migration-runbook.mjs");
const fileStorageLifecyclePolicyGeneratorSource = read("scripts/generate-file-storage-lifecycle-policy-dry-run.mjs");
const fileStorageLifecyclePolicyQcSource = read("scripts/qc-file-storage-lifecycle-policy-dry-run.mjs");
const fileStorageS3CompatibleDryRunGeneratorSource = read("scripts/generate-file-storage-s3-compatible-dry-run.mjs");
const fileStorageS3CompatibleDryRunQcSource = read("scripts/qc-file-storage-s3-compatible-dry-run.mjs");
const fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource = read("scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs");
const fileStorageSchemaMigrationPackageGeneratorSource = read("scripts/generate-file-storage-schema-migration-package.mjs");
const fileStorageSchemaMigrationPackageQcSource = read("scripts/qc-file-storage-schema-migration-package.mjs");
const fileStorageSchemaTargetConnectorReceiptEvidenceQcSource = read("scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs");
const fileStorageSchemaTargetCreateResultEvidenceGeneratorSource = read("scripts/generate-file-storage-schema-target-create-result-evidence.mjs");
const fileStorageSchemaTargetCreateResultEvidenceQcSource = read("scripts/qc-file-storage-schema-target-create-result-evidence.mjs");
const fileStorageSchemaTargetCreateRequestGeneratorSource = read("scripts/generate-file-storage-schema-target-create-request.mjs");
const fileStorageSchemaTargetCreateRequestQcSource = read("scripts/qc-file-storage-schema-target-create-request.mjs");
const fileStorageSchemaTargetCostConfirmationPackageQcSource = read("scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs");
const fileStorageSchemaTargetProvisioningEvidenceQcSource = read("scripts/qc-file-storage-schema-target-provisioning-evidence.mjs");
const fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource = read("scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs");
const fileStorageSchemaTargetProvisioningExecutionPackageQcSource = read("scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs");
const fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource = read("scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs");
const fileStorageSchemaUserCostConfirmationEvidenceQcSource = read("scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs");
const fileStorageSchemaAdvisorEvidenceGeneratorSource = read("scripts/generate-file-storage-schema-advisor-evidence.mjs");
const fileStorageSchemaAdvisorEvidenceQcSource = read("scripts/qc-file-storage-schema-advisor-evidence.mjs");
const fileStorageSchemaApplyGateGeneratorSource = read("scripts/generate-file-storage-schema-apply-gate.mjs");
const fileStorageSchemaApplyGateQcSource = read("scripts/qc-file-storage-schema-apply-gate.mjs");
const fileStorageSchemaFormalReviewPackageGeneratorSource = read("scripts/generate-file-storage-schema-formal-review-package.mjs");
const fileStorageSchemaFormalReviewPackageQcSource = read("scripts/qc-file-storage-schema-formal-review-package.mjs");
const fileStorageSchemaPromotionGateGeneratorSource = read("scripts/generate-file-storage-schema-promotion-gate.mjs");
const fileStorageSchemaPromotionGateQcSource = read("scripts/qc-file-storage-schema-promotion-gate.mjs");
const fileStorageSchemaTargetReadinessQcSource = read("scripts/qc-file-storage-schema-target-readiness.mjs");
const fileStorageSchemaTargetReadinessPackageQcSource = read("scripts/qc-file-storage-schema-target-readiness-package.mjs");
const fileStorageSchemaVerifyGateGeneratorSource = read("scripts/generate-file-storage-schema-verify-gate.mjs");
const fileStorageSchemaVerifyGateQcSource = read("scripts/qc-file-storage-schema-verify-gate.mjs");
const fileStorageContractQcSource = read("scripts/qc-file-storage-contract.mjs");
const fileStorageAccessAuditQcSource = read("scripts/qc-file-storage-access-audit.mjs");
const fileStorageLocalProviderRegressionQcSource = read("scripts/qc-file-storage-local-provider-regression.mjs");
const fileStorageRoleAccessQcSource = read("scripts/qc-file-storage-role-access.mjs");
const fileStorageUploadDedupQcSource = read("scripts/qc-file-storage-upload-dedup.mjs");
const fileStorageUploadDetailMetadataQcSource = read("scripts/qc-file-storage-upload-detail-metadata.mjs");
const fileStorageArchiveRestoreGeneratorSource = read("scripts/generate-file-storage-archive-restore-drill.mjs");
const fileStorageArchiveRestoreQcSource = read("scripts/qc-file-storage-archive-restore.mjs");
const fileStorageMigrationExecutionGateGeneratorSource = read("scripts/generate-file-storage-migration-execution-gate.mjs");
const fileStorageMigrationExecutionGateQcSource = read("scripts/qc-file-storage-migration-execution-gate.mjs");
const supabaseRuntimeLocalReadinessQcSource = read("scripts/qc-supabase-runtime-local-readiness.mjs");
const supabaseRuntimeMigrationsQcSource = read("scripts/qc-supabase-runtime-migrations.mjs");
const supabaseSecretBoundaryQcSource = read("scripts/qc-supabase-secret-boundary.mjs");
const supabaseLocalSuiteReportQcSource = read("scripts/qc-supabase-runtime-gate-b-local-suite-report.mjs");
const supabaseCurrentChangeImpactQcSource = read("scripts/qc-supabase-current-change-impact.mjs");
const supabaseDataParityPolicyQcSource = read("scripts/qc-supabase-data-parity-policy.mjs");
const supabaseMigrationHistoryPolicyQcSource = read("scripts/qc-supabase-migration-history-policy.mjs");
const supabaseRuntimeApprovalPackageQcSource = read("scripts/qc-supabase-runtime-approval-package.mjs");
const supabaseRuntimeGateRunbookQcSource = read("scripts/qc-supabase-runtime-gate-b-runbook.mjs");
const supabaseRuntimeGatePlanQcSource = read("scripts/qc-supabase-runtime-gate-plan.mjs");
const supabaseRuntimeRollbackReadinessQcSource = read("scripts/qc-supabase-runtime-rollback-readiness.mjs");
const supabaseRuntimeSmokeReportTemplateQcSource = read("scripts/qc-supabase-runtime-smoke-report-template.mjs");
const supabaseRuntimeSmokeReportQcSource = read("scripts/qc-supabase-runtime-smoke-report.mjs");
const supabaseRuntimeSmokeApiMatrixQcSource = read("scripts/qc-supabase-runtime-smoke-api-matrix.mjs");
const supabaseTargetIdentityReceiptQcSource = read("scripts/qc-supabase-target-identity-receipt.mjs");
const supabaseRuntimeSmokeAuthSessionBoundaryQcSource = read(
  "scripts/qc-supabase-runtime-smoke-auth-session-boundary.mjs"
);
const supabaseGateBStagingValidationQcSource = read("scripts/qc-supabase-gate-b-staging-validation.mjs");
const syncSupabaseRuntimeMigrationsSource = read("scripts/sync-supabase-runtime-migrations.mjs");
const packageSource = read("package.json");

record(
  "SOURCE-BOUNDARY chat route avoids broad config import",
  !chatSource.includes("@/lib/config") && chatSource.includes("@/lib/llm-config"),
  "src/lib/chat.ts"
);
record(
  "SOURCE-BOUNDARY LLM usage avoids broad config import",
  !llmUsageSource.includes("@/lib/config") && llmUsageSource.includes("function resolveDataDir"),
  "src/lib/llm-usage.ts"
);
record(
  "SOURCE-BOUNDARY LLM config remains filesystem-free",
  !/node:(fs|path)/.test(llmConfigSource) && !llmConfigSource.includes("process.cwd()"),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY LLM config remains dependency-free",
  hasNoImportStatements(llmConfigSource),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY LLM config keeps OpenAI key server-only",
  keepsOpenAiKeyServerOnly(llmConfigSource),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY LLM config normalizes string env values",
  normalizesLlmConfigStrings(llmConfigSource),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY LLM config parses numeric env strictly",
  parsesLlmConfigIntegersStrictly(llmConfigSource),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY LLM disable toggles remain reachable",
  keepsLlmDisableTogglesReachable(llmConfigSource),
  "src/lib/llm-config.ts"
);
record(
  "SOURCE-BOUNDARY chat route normalizes OpenAI base URL",
  normalizesOpenAiBaseUrl(chatSource),
  "src/lib/chat.ts"
);
record(
  "SOURCE-BOUNDARY legacy config delegates LLM env parsing",
  configSource.includes("import { llmConfig }") &&
    configSource.includes("llmProvider: llmConfig.provider") &&
    !configSource.includes("function parsePositiveInt"),
  "src/lib/config.ts"
);
record(
  "SOURCE-BOUNDARY settings route reports normalized LLM config",
  settingsUsesLlmConfig(settingsRouteSource),
  "src/app/api/settings/route.ts"
);
record(
  "SOURCE-BOUNDARY LLM config behavioral QC is registered",
  packageSource.includes('"qc:llm-config": "node scripts/qc-llm-config-test.mjs"'),
  "package.json"
);
record(
  "SOURCE-BOUNDARY LLM config behavioral QC is in full gate",
  fullGateRunsLlmConfigQc(fullQcSource),
  "scripts/qc-full-test.mjs"
);
record(
  "SOURCE-BOUNDARY full gate includes source boundary",
  fullGateRunsSourceBoundary(fullQcSource),
  "scripts/qc-full-test.mjs"
);
record(
  "SOURCE-BOUNDARY full gate listener budget is QC-only",
  fullGateUsesQcOnlyListenerBudget(fullQcSource) && listenerBudgetPreloadIsQcOnly(listenerBudgetPreloadSource),
  "scripts/qc-full-test.mjs, scripts/qc-node-listener-budget.cjs"
);
record(
  "SOURCE-BOUNDARY full gate scans process warnings",
  fullGateScansProcessWarnings(fullQcSource),
  "scripts/qc-full-test.mjs"
);
record(
  "SOURCE-BOUNDARY full gate uses shared npm step runner",
  fullGateUsesSharedNpmStepRunner(fullQcSource),
  "scripts/qc-full-test.mjs"
);
record(
  "SOURCE-BOUNDARY full gate restores generated type reference",
  gatePreservesGeneratedTypeReference(fullQcSource),
  "scripts/qc-full-test.mjs"
);
record(
  "SOURCE-BOUNDARY clean next script uses explicit workspace rm",
  /import\s*{[^}]*\brm\b[^}]*}\s*from\s*["']node:fs\/promises["']/.test(cleanNextSource) &&
    cleanNextSource.includes('const nextDir = path.join(process.cwd(), ".next")') &&
    cleanNextSource.includes("await rm(nextDir, { recursive: true, force: true })") &&
    !cleanNextSource.includes('import fs from "node:fs/promises"') &&
    !cleanNextSource.includes("fs.rm"),
  "scripts/clean-next.mjs"
);
record(
  "SOURCE-BOUNDARY command runner is QC-only",
  commandRunnerIsQcOnly(commandRunnerSource),
  "scripts/qc-command-runner.mjs"
);
record(
  "SOURCE-BOUNDARY project file utils are QC-only",
  projectFileUtilsIsQcOnly(projectFileUtilsSource),
  "scripts/qc-project-file-utils.mjs"
);
record(
  "SOURCE-BOUNDARY file hash utils are QC-only",
  fileHashUtilsIsQcOnly(fileHashUtilsSource),
  "scripts/qc-file-hash-utils.mjs"
);
record(
  "SOURCE-BOUNDARY production readiness report runner is QC-only",
  productionReadinessReportRunnerIsQcOnly(productionReadinessReportRunnerSource),
  "scripts/qc-production-readiness-report-runner.mjs"
);
record(
  "SOURCE-BOUNDARY production readiness QC uses project file utils",
  qcUsesProjectFileUtils(productionReadinessQcSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-production-readiness-test.mjs"
);
record(
  "SOURCE-BOUNDARY defect register utils use explicit fs operations",
  defectRegisterUtilsSource.includes('import { existsSync, readFileSync } from "node:fs"') &&
    defectRegisterUtilsSource.includes('return JSON.parse(readFileSync(registerPath, "utf8"))') &&
    defectRegisterUtilsSource.includes("if (!existsSync(registerPath))") &&
    !defectRegisterUtilsSource.includes('import fs from "node:fs"') &&
    !defectRegisterUtilsSource.includes("fs.readFileSync") &&
    !defectRegisterUtilsSource.includes("fs.existsSync"),
  "scripts/defect-register-utils.mjs"
);
record(
  "SOURCE-BOUNDARY policy confirmation utils use explicit fs operations",
  policyConfirmationUtilsSource.includes('import { existsSync, readFileSync } from "node:fs"') &&
    policyConfirmationUtilsSource.includes('return JSON.parse(readFileSync(confirmationPath, "utf8"))') &&
    policyConfirmationUtilsSource.includes("if (!existsSync(policyPath))") &&
    policyConfirmationUtilsSource.includes("if (!existsSync(confirmationPath))") &&
    !policyConfirmationUtilsSource.includes('import fs from "node:fs"') &&
    !policyConfirmationUtilsSource.includes("fs.readFileSync") &&
    !policyConfirmationUtilsSource.includes("fs.existsSync"),
  "scripts/policy-confirmation-utils.mjs"
);
record(
  "SOURCE-BOUNDARY npm step runner is QC-only",
  npmStepRunnerIsQcOnly(npmStepRunnerSource),
  "scripts/qc-npm-step-runner.mjs"
);
record(
  "SOURCE-BOUNDARY Next app runner is QC-only",
  nextAppRunnerIsQcOnly(nextAppRunnerSource),
  "scripts/qc-next-app-runner.mjs"
);
record(
  "SOURCE-BOUNDARY generated type reference guard is QC-only",
  generatedTypeReferenceGuardIsQcOnly(generatedTypeReferenceGuardSource),
  "scripts/qc-generated-type-reference-guard.mjs"
);
record(
  "SOURCE-BOUNDARY generated type reference guard uses project file utils",
  qcUsesProjectFileUtils(generatedTypeReferenceGuardSource, ["projectFileExists", "projectPath", "readProjectFile"]),
  "scripts/qc-generated-type-reference-guard.mjs"
);
record(
  "SOURCE-BOUNDARY process warning guard is QC-only",
  processWarningGuardIsQcOnly(processWarningGuardSource),
  "scripts/qc-process-warning-guard.mjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate listener budget is QC-only",
  industrializationGateUsesQcOnlyListenerBudget(industrializationQcSource) &&
    listenerBudgetPreloadIsQcOnly(listenerBudgetPreloadSource),
  "scripts/qc-industrialization-test.mjs, scripts/qc-node-listener-budget.cjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate scans process warnings",
  industrializationGateScansProcessWarnings(industrializationQcSource),
  "scripts/qc-industrialization-test.mjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate uses shared npm step runner",
  industrializationGateUsesSharedNpmStepRunner(industrializationQcSource),
  "scripts/qc-industrialization-test.mjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate restores generated type reference",
  gatePreservesGeneratedTypeReference(industrializationQcSource),
  "scripts/qc-industrialization-test.mjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate includes asset manifest",
  industrializationGateRunsAssetManifest(industrializationQcSource),
  "scripts/qc-industrialization-test.mjs"
);
record(
  "SOURCE-BOUNDARY industrialization gate includes storage access audit contract",
  industrializationGateRunsStorageAccessAudit(industrializationQcSource),
  "scripts/qc-industrialization-test.mjs"
);
record(
  "SOURCE-BOUNDARY backup generator keeps sync file writes explicit",
  backupSource.includes('import { closeSync, cpSync, existsSync, mkdirSync, openSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs"') &&
    backupSource.includes("function sha256FileSync(filePath)") &&
    backupSource.includes('const file = openSync(filePath, "r")') &&
    backupSource.includes("readSync(file, buffer, 0, buffer.length, null)") &&
    backupSource.includes("closeSync(file)") &&
    backupSource.includes("if (!existsSync(dir)) return []") &&
    backupSource.includes("for (const entry of readdirSync(dir, { withFileTypes: true }))") &&
    backupSource.includes("mkdirSync(path.dirname(target), { recursive: true })") &&
    backupSource.includes("cpSync(source, target, { recursive: true })") &&
    backupSource.includes("writeFileSync(path.join(snapshotDir, \"manifest.json\"") &&
    backupSource.includes("sha256: sha256FileSync(filePath)") &&
    !backupSource.includes('import fs from "node:fs"') &&
    !backupSource.includes("function sha256File(filePath)") &&
    !backupSource.includes("fs.writeFileSync") &&
    !backupSource.includes("fs.existsSync"),
  "scripts/backup.mjs"
);
record(
  "SOURCE-BOUNDARY backup verifier keeps sync file reads explicit",
  verifyBackupSource.includes('import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs"') &&
    verifyBackupSource.includes("function sha256FileSync(filePath)") &&
    verifyBackupSource.includes('const file = openSync(filePath, "r")') &&
    verifyBackupSource.includes("readSync(file, buffer, 0, buffer.length, null)") &&
    verifyBackupSource.includes("closeSync(file)") &&
    verifyBackupSource.includes('const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))') &&
    verifyBackupSource.includes("const actualHash = sha256FileSync(filePath)") &&
    !verifyBackupSource.includes('import fs from "node:fs"') &&
    !verifyBackupSource.includes("function sha256File(filePath)") &&
    !verifyBackupSource.includes("fs.readFileSync") &&
    !verifyBackupSource.includes("fs.existsSync"),
  "scripts/verify-backup.mjs"
);
record(
  "SOURCE-BOUNDARY restore backup keeps sync file operations explicit",
  restoreBackupSource.includes('import { closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from "node:fs"') &&
    restoreBackupSource.includes("function sha256FileSync(filePath)") &&
    restoreBackupSource.includes('const file = openSync(filePath, "r")') &&
    restoreBackupSource.includes("readSync(file, buffer, 0, buffer.length, null)") &&
    restoreBackupSource.includes("closeSync(file)") &&
    restoreBackupSource.includes('const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))') &&
    restoreBackupSource.includes("const actualHash = sha256FileSync(filePath)") &&
    restoreBackupSource.includes("if (existsSync(restoreRoot) && readdirSync(restoreRoot).length > 0 && !args.force && !args.inPlace)") &&
    restoreBackupSource.includes("rmSync(restoreRoot, { recursive: true, force: true })") &&
    restoreBackupSource.includes('copyFileSync(path.join(snapshotDir, "database", "ai-pdm.sqlite"), targetDbPath)') &&
    restoreBackupSource.includes("cpSync(path.join(snapshotDir, \"config\"), path.join(restoreRoot, \"config\"), { recursive: true })") &&
    !restoreBackupSource.includes('import fs from "node:fs"') &&
    !restoreBackupSource.includes("function sha256File(filePath)") &&
    !restoreBackupSource.includes("fs.rmSync") &&
    !restoreBackupSource.includes("fs.existsSync") &&
    !restoreBackupSource.includes("fs.readFileSync"),
  "scripts/restore-backup.mjs"
);
record(
  "SOURCE-BOUNDARY restore drill keeps sync file operations explicit",
  restoreDrillSource.includes('import { closeSync, existsSync, openSync, readSync } from "node:fs"') &&
    restoreDrillSource.includes("function sha256FileSync(filePath)") &&
    restoreDrillSource.includes('const file = openSync(filePath, "r")') &&
    restoreDrillSource.includes("readSync(file, buffer, 0, buffer.length, null)") &&
    restoreDrillSource.includes("closeSync(file)") &&
    restoreDrillSource.includes("if (!existsSync(filePath))") &&
    restoreDrillSource.includes("const actualSha256 = sha256FileSync(filePath)") &&
    !restoreDrillSource.includes('import fs from "node:fs"') &&
    !restoreDrillSource.includes("function sha256File(filePath)") &&
    !restoreDrillSource.includes("fs.openSync") &&
    !restoreDrillSource.includes("fs.existsSync"),
  "scripts/restore-drill.mjs"
);
record(
  "SOURCE-BOUNDARY backup retention drill uses project file utils",
  qcUsesProjectFileUtils(backupRetentionDrillSource, ["readProjectFile"]),
  "scripts/backup-retention-drill.mjs"
);
record(
  "SOURCE-BOUNDARY backup retention drill uses async hash reads",
  backupRetentionDrillSource.includes('import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"') &&
    backupRetentionDrillSource.includes('import { readFile } from "node:fs/promises"') &&
    backupRetentionDrillSource.includes("async function sha256FileAsync(filePath)") &&
    backupRetentionDrillSource.includes("update(await readFile(filePath))") &&
    backupRetentionDrillSource.includes("mkdirSync(path.dirname(sourceFilePath), { recursive: true })") &&
    backupRetentionDrillSource.includes("writeFileSync(sourceFilePath, sourceContent)") &&
    backupRetentionDrillSource.includes("rmSync(sourceFilePath, { force: true })") &&
    backupRetentionDrillSource.includes("const retained = existsSync(backedUpFile)") &&
    backupRetentionDrillSource.includes("await sha256FileAsync(backedUpFile)") &&
    backupRetentionDrillSource.includes("sourceDeleted: !existsSync(sourceFilePath)") &&
    !backupRetentionDrillSource.includes('import fs from "node:fs"') &&
    !backupRetentionDrillSource.includes('import fsp from "node:fs/promises"') &&
    !backupRetentionDrillSource.includes("fs.readFileSync"),
  "scripts/backup-retention-drill.mjs"
);
record(
  "SOURCE-BOUNDARY restore handoff generator uses explicit fs operations",
  restoreHandoffSource.includes('import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"') &&
    restoreHandoffSource.includes("function readSnapshotManifest()") &&
    restoreHandoffSource.includes("const manifest = readSnapshotManifest()") &&
    restoreHandoffSource.includes("if (!existsSync(backupRoot))") &&
    restoreHandoffSource.includes("readdirSync(backupRoot, { withFileTypes: true })") &&
    restoreHandoffSource.includes("if (!existsSync(manifestPath))") &&
    restoreHandoffSource.includes('return JSON.parse(readFileSync(manifestPath, "utf8"))') &&
    restoreHandoffSource.includes("mkdirSync(outputDir, { recursive: true })") &&
    restoreHandoffSource.includes('writeFileSync(path.join(outputDir, "restore-handoff.json"') &&
    !restoreHandoffSource.includes('import fs from "node:fs"') &&
    !restoreHandoffSource.includes("fs.readFileSync") &&
    !restoreHandoffSource.includes("fs.existsSync"),
  "scripts/prepare-restore-handoff.mjs"
);
record(
  "SOURCE-BOUNDARY DB provider QC uses project file utils",
  qcUsesProjectFileUtils(dbProviderContractQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-db-provider-contract-test.mjs"
);
record(
  "SOURCE-BOUNDARY DB provider Postgres QC uses project file utils",
  qcUsesProjectFileUtils(dbProviderPostgresQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-db-provider-postgres.mjs"
);
record(
  "SOURCE-BOUNDARY DB repository split QC uses project file utils",
  qcUsesProjectFileUtils(dbRepositorySplitQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-db-repository-split-test.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow QC uses project file utils",
  qcUsesProjectFileUtils(postgresShadowQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-postgres-shadow-test.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow target guard QC uses project file utils",
  qcUsesProjectFileUtils(postgresShadowTargetGuardQcSource, ["readProjectFile"]),
  "scripts/qc-postgres-shadow-target-guard.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow target guard utils use project file utils",
  qcUsesProjectFileUtils(postgresShadowTargetGuardUtilsSource, ["readProjectFile"]),
  "scripts/postgres-shadow-target-guard-utils.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow handoff generator uses async hash reads",
  postgresShadowHandoffSource.includes("async function sha256File(filePath)") &&
    postgresShadowHandoffSource.includes("update(await fsp.readFile(filePath))") &&
    postgresShadowHandoffSource.includes("await sha256File(sqliteSchemaPath)") &&
    postgresShadowHandoffSource.includes("await sha256File(initialSchemaPath)") &&
    postgresShadowHandoffSource.includes("await sha256File(rlsPlanPath)") &&
    !postgresShadowHandoffSource.includes("fs.readFileSync"),
  "scripts/prepare-postgres-shadow-handoff.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow handoff package QC uses project file utils",
  qcUsesProjectFileUtils(postgresShadowHandoffPackageQcSource, [
    "projectPath",
    "readProjectFile",
    "readProjectFileIfExists",
    "readProjectJson"
  ]),
  "scripts/qc-postgres-shadow-handoff-package.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow handoff package QC uses shared hash utils",
  postgresShadowHandoffPackageQcSource.includes('import { sha256File } from "./qc-file-hash-utils.mjs"') &&
    !postgresShadowHandoffPackageQcSource.includes('import crypto from "node:crypto"'),
  "scripts/qc-postgres-shadow-handoff-package.mjs"
);
record(
  "SOURCE-BOUNDARY Postgres shadow handoff package QC avoids local read wrappers",
  postgresShadowHandoffPackageQcSource.includes("readProjectJson(root, relative(manifestPath))") &&
    postgresShadowHandoffPackageQcSource.includes("readProjectFileIfExists(root, relative(path.join(latest, \"README.md\")))") &&
    postgresShadowHandoffPackageQcSource.includes("readProjectFileIfExists(root, relative(filePath))") &&
    !postgresShadowHandoffPackageQcSource.includes("function readText(filePath)") &&
    !postgresShadowHandoffPackageQcSource.includes("function readJson(filePath)") &&
    !postgresShadowHandoffPackageQcSource.includes("fs.readFileSync"),
  "scripts/qc-postgres-shadow-handoff-package.mjs"
);
record(
  "SOURCE-BOUNDARY CSS boundary QC uses project file utils",
  qcUsesProjectFileUtils(cssBoundaryQcSource, ["readProjectFile"]),
  "scripts/qc-css-boundary-test.mjs"
);
record(
  "SOURCE-BOUNDARY adaptive task feed QC uses project file utils",
  qcUsesProjectFileUtils(adaptiveTaskFeedQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-adaptive-task-feed.mjs"
);
record(
  "SOURCE-BOUNDARY BOM workbench migration path QC uses project file utils",
  qcUsesProjectFileUtils(bomWorkbenchMigrationPathQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-bom-workbench-migration-path.mjs"
);
record(
  "SOURCE-BOUNDARY file dropzone UX QC uses project file utils",
  qcUsesProjectFileUtils(fileDropzoneUxQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-dropzone-ux.mjs"
);
record(
  "SOURCE-BOUNDARY master attachments QC uses project file utils",
  qcUsesProjectFileUtils(masterAttachmentsQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-master-attachments.mjs"
);
record(
  "SOURCE-BOUNDARY part number module QC uses project file utils",
  qcUsesProjectFileUtils(partNumberModuleQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-part-number-module.mjs"
);
record(
  "SOURCE-BOUNDARY part cost review E2E QC uses project file utils",
  qcUsesProjectFileUtils(partCostReviewE2eQcSource, ["readProjectFile"]),
  "scripts/qc-part-cost-review-e2e.mjs"
);
record(
  "SOURCE-BOUNDARY PDM numbering core QC uses project file utils",
  qcUsesProjectFileUtils(pdmNumberingCoreQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-pdm-numbering-core-test.mjs"
);
record(
  "SOURCE-BOUNDARY doc paths QC uses project file utils",
  qcUsesProjectFileUtils(docPathsQcSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-doc-paths-test.mjs"
);
record(
  "SOURCE-BOUNDARY policy alignment QC uses project file utils",
  qcUsesProjectFileUtils(policyAlignmentQcSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-policy-alignment-test.mjs"
);
record(
  "SOURCE-BOUNDARY SW add-in company selection QC uses project file utils",
  qcUsesProjectFileUtils(swAddinCompanySelectionQcSource, ["readProjectFile"]),
  "scripts/qc-sw-addin-company-selection.mjs"
);
record(
  "SOURCE-BOUNDARY SW add-in source QC uses project file utils",
  qcUsesProjectFileUtils(swAddinSourceQcSource, ["projectFileExists", "projectPath", "readProjectFile"]) &&
    !swAddinSourceQcSource.includes("fs.readFileSync"),
  "scripts/qc-sw-addin-source-test.mjs"
);
record(
  "SOURCE-BOUNDARY PDM master workbench layout QC uses project file utils",
  qcUsesProjectFileUtils(pdmMasterWorkbenchLayoutQcSource, ["readProjectFile"]),
  "scripts/qc-pdm-master-workbench-layout.mjs"
);
record(
  "SOURCE-BOUNDARY SW license PDM company scope QC uses project file utils",
  qcUsesProjectFileUtils(swLicensePdmCompanyScopeQcSource, ["readProjectFile"]),
  "scripts/qc-sw-license-pdm-company-scope.mjs"
);
record(
  "SOURCE-BOUNDARY SW license PDM numbering company scope QC uses project file utils",
  qcUsesProjectFileUtils(swLicensePdmNumberingCompanyScopeQcSource, ["readProjectFile"]),
  "scripts/qc-sw-license-pdm-numbering-company-scope.mjs"
);
record(
  "SOURCE-BOUNDARY SW license PDM metadata adapter profile QC uses project file utils",
  qcUsesProjectFileUtils(swLicensePdmMetadataAdapterProfileQcSource, ["readProjectFile"]),
  "scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs"
);
record(
  "SOURCE-BOUNDARY SW license PDM git boundary QC uses project file utils",
  qcUsesProjectFileUtils(swLicensePdmGitBoundaryQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-sw-license-pdm-git-boundary.mjs"
);
record(
  "SOURCE-BOUNDARY file storage contract QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageContractQcSource, ["readProjectFile"]),
  "scripts/qc-file-storage-contract.mjs"
);
record(
  "SOURCE-BOUNDARY file storage access audit QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageAccessAuditQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-access-audit.mjs"
);
record(
  "SOURCE-BOUNDARY file storage local provider regression QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageLocalProviderRegressionQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-local-provider-regression.mjs"
);
record(
  "SOURCE-BOUNDARY file storage role access QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageRoleAccessQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-role-access.mjs"
);
record(
  "SOURCE-BOUNDARY file storage upload dedup QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageUploadDedupQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-upload-dedup.mjs"
);
record(
  "SOURCE-BOUNDARY file storage upload dedup QC cleans tmpRoot in finally",
  fileStorageUploadDedupQcCleansTmpRootInFinally(fileStorageUploadDedupQcSource),
  "scripts/qc-file-storage-upload-dedup.mjs"
);
record(
  "SOURCE-BOUNDARY file storage upload detail metadata QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageUploadDetailMetadataQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-upload-detail-metadata.mjs"
);
record(
  "SOURCE-BOUNDARY file storage fixture hash QCs use shared hash utils",
  fileStorageFixtureHashQcsUseSharedHelper([
    fileStorageDedupReferenceQcSource,
    fileStorageCostReportQcSource,
    fileStorageMonthlyEvidenceQcSource,
    fileStorageMonthlyEvidenceScheduleQcSource,
    fileStorageMigrationDryRunQcSource,
    fileStorageMigrationRunbookQcSource,
    fileStorageMigrationExecutionGateQcSource,
    fileStorageLifecyclePolicyQcSource,
    fileStorageS3CompatibleDryRunQcSource,
    fileStorageArchiveRestoreQcSource
  ]),
  "scripts/qc-file-hash-utils.mjs"
);
record(
  "SOURCE-BOUNDARY file storage temp fixture QCs clean in finally",
  fileStorageTempFixtureQcsCleanInFinally([
    fileStorageMetadataQcSource,
    fileStorageSchemaTargetCostConfirmationPackageQcSource,
    fileStorageDedupReferenceQcSource,
    fileStorageCostReportQcSource,
    fileStorageMigrationDryRunQcSource,
    fileStorageLifecyclePolicyQcSource,
    fileStorageMonthlyEvidenceScheduleQcSource,
    fileStorageS3CompatibleDryRunQcSource,
    fileStorageArchiveRestoreQcSource,
    fileStorageMonthlyEvidenceQcSource,
    fileStorageMigrationRunbookQcSource,
    fileStorageEgressReportQcSource,
    fileStorageEvidenceDashboardQcSource,
    fileStorageGovernanceGateQcSource,
    fileStorageMigrationExecutionGateQcSource,
    fileStorageAccessAuditQcSource,
    fileStorageSchemaMigrationPackageQcSource,
    fileStorageSchemaTargetConnectorReceiptEvidenceQcSource,
    fileStorageSchemaTargetCreateResultEvidenceQcSource,
    fileStorageSchemaTargetCreateRequestQcSource,
    fileStorageSchemaTargetProvisioningExecutionPackageQcSource,
    fileStorageSchemaUserCostConfirmationEvidenceQcSource,
    fileStorageSchemaAdvisorEvidenceQcSource,
    fileStorageSchemaApplyGateQcSource,
    fileStorageSchemaFormalReviewPackageQcSource,
    fileStorageSchemaPromotionGateQcSource,
    fileStorageSchemaTargetReadinessQcSource,
    fileStorageSchemaTargetReadinessPackageQcSource,
    fileStorageSchemaVerifyGateQcSource
  ]),
  "scripts/qc-file-storage-metadata.mjs, scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs, scripts/qc-file-storage-dedup-reference.mjs, scripts/qc-file-storage-cost-report.mjs, scripts/qc-file-storage-migration-dry-run.mjs, scripts/qc-file-storage-lifecycle-policy-dry-run.mjs, scripts/qc-file-storage-monthly-evidence-schedule.mjs, scripts/qc-file-storage-s3-compatible-dry-run.mjs, scripts/qc-file-storage-archive-restore.mjs, scripts/qc-file-storage-monthly-evidence.mjs, scripts/qc-file-storage-migration-runbook.mjs, scripts/qc-file-storage-egress-report.mjs, scripts/qc-file-storage-evidence-dashboard.mjs, scripts/qc-file-storage-governance-gate.mjs, scripts/qc-file-storage-migration-execution-gate.mjs, scripts/qc-file-storage-access-audit.mjs, scripts/qc-file-storage-schema-migration-package.mjs, scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs, scripts/qc-file-storage-schema-target-create-result-evidence.mjs, scripts/qc-file-storage-schema-target-create-request.mjs, scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs, scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs, scripts/qc-file-storage-schema-advisor-evidence.mjs, scripts/qc-file-storage-schema-apply-gate.mjs, scripts/qc-file-storage-schema-formal-review-package.mjs, scripts/qc-file-storage-schema-promotion-gate.mjs, scripts/qc-file-storage-schema-target-readiness.mjs, scripts/qc-file-storage-schema-target-readiness-package.mjs, scripts/qc-file-storage-schema-verify-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage egress report generator uses explicit fs operations",
  fileStorageEgressReportGeneratorSource.includes('import { existsSync } from "node:fs"') &&
    fileStorageEgressReportGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageEgressReportGeneratorSource.includes("if (!existsSync(dbPath))") &&
    fileStorageEgressReportGeneratorSource.includes("await mkdir(path.dirname(path.resolve(outPath)), { recursive: true })") &&
    fileStorageEgressReportGeneratorSource.includes('await writeFile(outPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    !fileStorageEgressReportGeneratorSource.includes('import fs from "node:fs"') &&
    !fileStorageEgressReportGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageEgressReportGeneratorSource.includes("fs.existsSync") &&
    !fileStorageEgressReportGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageEgressReportGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-egress-report.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration dry run generator keeps sync hash contract explicit",
  fileStorageMigrationDryRunGeneratorSource.includes('import { existsSync, readFileSync } from "node:fs"') &&
    fileStorageMigrationDryRunGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageMigrationDryRunGeneratorSource.includes("function sha256FileSync(filePath)") &&
    fileStorageMigrationDryRunGeneratorSource.includes("update(readFileSync(filePath))") &&
    fileStorageMigrationDryRunGeneratorSource.includes("const actualHash = sha256FileSync(sourcePath)") &&
    fileStorageMigrationDryRunGeneratorSource.includes("export function buildStorageMigrationDryRun") &&
    fileStorageMigrationDryRunGeneratorSource.includes("await mkdir(path.dirname(path.resolve(outPath)), { recursive: true })") &&
    fileStorageMigrationDryRunGeneratorSource.includes('await writeFile(outPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageMigrationDryRunGeneratorSource.includes("dryRunOnly: true") &&
    fileStorageMigrationDryRunGeneratorSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageMigrationDryRunGeneratorSource.includes("noFilesCopied: true") &&
    fileStorageMigrationDryRunGeneratorSource.includes("noFilesDeleted: true") &&
    !fileStorageMigrationDryRunGeneratorSource.includes('import fs from "node:fs"') &&
    !fileStorageMigrationDryRunGeneratorSource.includes("fs.readFileSync") &&
    !fileStorageMigrationDryRunGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageMigrationDryRunGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageMigrationDryRunGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-migration-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration runbook generator uses explicit fs writes",
  fileStorageMigrationRunbookGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageMigrationRunbookGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageMigrationRunbookGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageMigrationRunbookGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageMigrationRunbookGeneratorSource.includes('await writeFile(rollbackPlanPath, `${JSON.stringify(report.pointerRollbackPlan, null, 2)}\\n`, "utf8")') &&
    fileStorageMigrationRunbookGeneratorSource.includes("runbookOnly: true") &&
    fileStorageMigrationRunbookGeneratorSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageMigrationRunbookGeneratorSource.includes("noFilesCopied: true") &&
    fileStorageMigrationRunbookGeneratorSource.includes("noFilesDeleted: true") &&
    fileStorageMigrationRunbookGeneratorSource.includes("executeRequiresExplicitApproval: true") &&
    !fileStorageMigrationRunbookGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageMigrationRunbookGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageMigrationRunbookGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-migration-runbook.mjs"
);
record(
  "SOURCE-BOUNDARY file storage dedup reference generator keeps sync hash contract explicit",
  fileStorageDedupReferenceGeneratorSource.includes('import { existsSync, readFileSync } from "node:fs"') &&
    fileStorageDedupReferenceGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageDedupReferenceGeneratorSource.includes("function sha256FileSync(filePath)") &&
    fileStorageDedupReferenceGeneratorSource.includes("update(readFileSync(filePath))") &&
    fileStorageDedupReferenceGeneratorSource.includes("const actualSha256 = sha256FileSync(sourcePath)") &&
    fileStorageDedupReferenceGeneratorSource.includes("export function buildStorageDedupReferenceDryRun") &&
    fileStorageDedupReferenceGeneratorSource.includes("await mkdir(outputDir, { recursive: true })") &&
    fileStorageDedupReferenceGeneratorSource.includes('await writeFile(path.join(outputDir, "storage-dedup-reference-dry-run.json"), `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageDedupReferenceGeneratorSource.includes('await writeFile(path.join(outputDir, "storage-dedup-reference-dry-run.md"), renderMarkdown(report), "utf8")') &&
    fileStorageDedupReferenceGeneratorSource.includes("dryRunOnly: true") &&
    fileStorageDedupReferenceGeneratorSource.includes("noFilesDeleted: true") &&
    fileStorageDedupReferenceGeneratorSource.includes("noProviderRequests: true") &&
    !fileStorageDedupReferenceGeneratorSource.includes('import fs from "node:fs"') &&
    !fileStorageDedupReferenceGeneratorSource.includes("fs.readFileSync") &&
    !fileStorageDedupReferenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageDedupReferenceGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageDedupReferenceGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-dedup-reference-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage lifecycle policy QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageLifecyclePolicyQcSource, ["readProjectFile"]) &&
    fileStorageLifecyclePolicyQcSource.includes('readProjectFile(root, "package.json")') &&
    !fileStorageLifecyclePolicyQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-lifecycle-policy-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage lifecycle policy generator uses explicit fs writes",
  fileStorageLifecyclePolicyGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageLifecyclePolicyGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageLifecyclePolicyGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageLifecyclePolicyGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageLifecyclePolicyGeneratorSource.includes("noFilesDeleted: true") &&
    fileStorageLifecyclePolicyGeneratorSource.includes("noLifecycleRulesApplied: true") &&
    !fileStorageLifecyclePolicyGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageLifecyclePolicyGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageLifecyclePolicyGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-lifecycle-policy-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration runbook QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageMigrationRunbookQcSource, ["readProjectFile"]) &&
    fileStorageMigrationRunbookQcSource.includes('readProjectFile(root, "package.json")') &&
    !fileStorageMigrationRunbookQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-migration-runbook.mjs"
);
record(
  "SOURCE-BOUNDARY file storage governance gate QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageGovernanceGateQcSource, ["readProjectFile"]) &&
    fileStorageGovernanceGateQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageGovernanceGateQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-governance-gate.mjs")') &&
    fileStorageGovernanceGateQcSource.includes('fsp.readFile(outputs.jsonPath, "utf8")') &&
    !fileStorageGovernanceGateQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-governance-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage governance gate generator uses explicit fs writes",
  fileStorageGovernanceGateGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageGovernanceGateGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageGovernanceGateGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageGovernanceGateGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    !fileStorageGovernanceGateGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageGovernanceGateGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageGovernanceGateGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-governance-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage S3 compatible dry run QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageS3CompatibleDryRunQcSource, ["readProjectFile"]) &&
    fileStorageS3CompatibleDryRunQcSource.includes('readProjectFile(root, "src/lib/file-storage.ts")') &&
    fileStorageS3CompatibleDryRunQcSource.includes('readProjectFile(root, "package.json")') &&
    !fileStorageS3CompatibleDryRunQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-s3-compatible-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage S3 compatible dry run generator uses explicit fs writes",
  fileStorageS3CompatibleDryRunGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes("noProviderRequests: true") &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes("noCredentialsRequired: true") &&
    fileStorageS3CompatibleDryRunGeneratorSource.includes("noFilesCopied: true") &&
    !fileStorageS3CompatibleDryRunGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageS3CompatibleDryRunGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageS3CompatibleDryRunGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-s3-compatible-dry-run.mjs"
);
record(
  "SOURCE-BOUNDARY file storage monthly evidence schedule QC avoids local text read wrapper",
  qcUsesProjectFileUtils(fileStorageMonthlyEvidenceScheduleQcSource, ["readProjectFile"]) &&
    fileStorageMonthlyEvidenceScheduleQcSource.includes('readProjectFile(root, "scripts/install-storage-monthly-evidence-task.ps1")') &&
    fileStorageMonthlyEvidenceScheduleQcSource.includes('readProjectFile(root, "scripts/run-file-storage-monthly-evidence-schedule.mjs")') &&
    fileStorageMonthlyEvidenceScheduleQcSource.includes('fsp.readFile(run.manifestPath, "utf8")') &&
    !fileStorageMonthlyEvidenceScheduleQcSource.includes("function readText(filePath)") &&
    !fileStorageMonthlyEvidenceScheduleQcSource.includes("readText("),
  "scripts/qc-file-storage-monthly-evidence-schedule.mjs"
);
record(
  "SOURCE-BOUNDARY file storage monthly evidence generator uses explicit fs writes",
  fileStorageMonthlyEvidenceGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageMonthlyEvidenceGeneratorSource.includes("await mkdir(outputDir, { recursive: true })") &&
    fileStorageMonthlyEvidenceGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\\n`, "utf8")') &&
    fileStorageMonthlyEvidenceGeneratorSource.includes('await writeFile(mdPath, buildStorageMonthlyEvidenceMarkdown(evidence), "utf8")') &&
    fileStorageMonthlyEvidenceGeneratorSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageMonthlyEvidenceGeneratorSource.includes("noFilesDeleted: true") &&
    fileStorageMonthlyEvidenceGeneratorSource.includes("noProviderRequests: true") &&
    !fileStorageMonthlyEvidenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageMonthlyEvidenceGeneratorSource.includes("fsp.mkdir") &&
    !fileStorageMonthlyEvidenceGeneratorSource.includes("fsp.writeFile"),
  "scripts/generate-file-storage-monthly-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage monthly evidence schedule runner uses explicit fs writes",
  fileStorageMonthlyEvidenceScheduleRunnerSource.includes('import { mkdir, writeFile } from "node:fs/promises"') &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes('await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\\n`, "utf8")') &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes("await mkdir(path.dirname(latestPath), { recursive: true })") &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes('await writeFile(latestPath, `${JSON.stringify(manifest, null, 2)}\\n`, "utf8")') &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes("noFilesDeleted: true") &&
    fileStorageMonthlyEvidenceScheduleRunnerSource.includes("noProviderRequests: true") &&
    !fileStorageMonthlyEvidenceScheduleRunnerSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageMonthlyEvidenceScheduleRunnerSource.includes("fsp.mkdir") &&
    !fileStorageMonthlyEvidenceScheduleRunnerSource.includes("fsp.writeFile"),
  "scripts/run-file-storage-monthly-evidence-schedule.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema migration package generator uses explicit fs promises",
  fileStorageSchemaMigrationPackageGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises";') &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes('await writeFile(sqlPath, report.sql, "utf8")') &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes('status: "proposal_only_not_applied"') &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("noMigrationApplied: true") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("noRuntimeTablesCreated: true") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("noDataApiGrantsForAnonOrAuthenticated: true") &&
    fileStorageSchemaMigrationPackageGeneratorSource.includes("rlsForcedForPublicSchemaTables: true") &&
    !fileStorageSchemaMigrationPackageGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaMigrationPackageGeneratorSource.includes("fsp."),
  "scripts/generate-file-storage-schema-migration-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema migration package QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaMigrationPackageQcSource, ["readProjectFile"]) &&
    fileStorageSchemaMigrationPackageQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaMigrationPackageQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-migration-package.mjs")') &&
    fileStorageSchemaMigrationPackageQcSource.includes('readProjectFile(root, "src/lib/repositories/external-large-file-intake-async-repository.ts")') &&
    !fileStorageSchemaMigrationPackageQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-migration-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target connector receipt generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("generatorDidNotCallSupabaseConfirmCost: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("generatorDidNotCreateProject: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("generatorDidNotCreateBranch: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaTargetConnectorReceiptEvidenceGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target connector receipt QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetConnectorReceiptEvidenceQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetConnectorReceiptEvidenceQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetConnectorReceiptEvidenceQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs")') &&
    !fileStorageSchemaTargetConnectorReceiptEvidenceQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target create request generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaTargetCreateRequestGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noSupabaseConfirmCostCalled: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noSupabaseProjectCreated: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noSupabaseBranchCreated: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaTargetCreateRequestGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaTargetCreateRequestGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaTargetCreateRequestGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaTargetCreateRequestGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-target-create-request.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target create request QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetCreateRequestQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetCreateRequestQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetCreateRequestQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-create-request.mjs")') &&
    !fileStorageSchemaTargetCreateRequestQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-create-request.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target create result generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaTargetCreateResultEvidenceGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noSupabaseConfirmCostCalled: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noSupabaseProjectCreated: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noSupabaseBranchCreated: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaTargetCreateResultEvidenceGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-target-create-result-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target create result QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetCreateResultEvidenceQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetCreateResultEvidenceQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetCreateResultEvidenceQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-create-result-evidence.mjs")') &&
    !fileStorageSchemaTargetCreateResultEvidenceQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-create-result-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema user cost confirmation generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noSupabaseConfirmCostCalled: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noSupabaseProjectCreated: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noSupabaseBranchCreated: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaUserCostConfirmationEvidenceGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema user cost confirmation QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaUserCostConfirmationEvidenceQcSource, ["readProjectFile"]) &&
    fileStorageSchemaUserCostConfirmationEvidenceQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaUserCostConfirmationEvidenceQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs")') &&
    !fileStorageSchemaUserCostConfirmationEvidenceQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target provisioning execution package generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("generatorDidNotCallSupabaseConnector: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noSupabaseConfirmCostCalled: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noSupabaseProjectCreated: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noSupabaseBranchCreated: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaTargetProvisioningExecutionPackageGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target provisioning execution package QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetProvisioningExecutionPackageQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetProvisioningExecutionPackageQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetProvisioningExecutionPackageQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs")') &&
    !fileStorageSchemaTargetProvisioningExecutionPackageQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema advisor evidence generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaAdvisorEvidenceGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    !fileStorageSchemaAdvisorEvidenceGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaAdvisorEvidenceGeneratorSource.includes("async function readJson(filePath)"),
  "scripts/generate-file-storage-schema-advisor-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema advisor evidence QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaAdvisorEvidenceQcSource, ["readProjectFile"]) &&
    fileStorageSchemaAdvisorEvidenceQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaAdvisorEvidenceQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-advisor-evidence.mjs")') &&
    !fileStorageSchemaAdvisorEvidenceQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-advisor-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema apply gate generator uses explicit fs promises",
  fileStorageSchemaApplyGateGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises";') &&
    fileStorageSchemaApplyGateGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaApplyGateGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageSchemaApplyGateGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageSchemaApplyGateGeneratorSource.includes("createPgSchemaApplyClient") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("evaluateStorageSchemaTargetSafety") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("requireDisposableKind: true") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("noRuntimeProviderCutover: true") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageSchemaApplyGateGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaApplyGateGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaApplyGateGeneratorSource.includes("fsp."),
  "scripts/generate-file-storage-schema-apply-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema apply gate QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaApplyGateQcSource, ["readProjectFile"]) &&
    fileStorageSchemaApplyGateQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaApplyGateQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-apply-gate.mjs")') &&
    !fileStorageSchemaApplyGateQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-apply-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema formal review package generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaFormalReviewPackageGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises"') &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, \"utf8\")") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("await writeFile(markdownPath, buildMarkdown(report), \"utf8\")") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    fileStorageSchemaFormalReviewPackageGeneratorSource.includes("noSupabaseResourceCreated: true") &&
    !fileStorageSchemaFormalReviewPackageGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaFormalReviewPackageGeneratorSource.includes("fsp.") &&
    !fileStorageSchemaFormalReviewPackageGeneratorSource.includes("async function readJsonEvidence(filePath)"),
  "scripts/generate-file-storage-schema-formal-review-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema formal review package QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaFormalReviewPackageQcSource, ["readProjectFile"]) &&
    fileStorageSchemaFormalReviewPackageQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaFormalReviewPackageQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-formal-review-package.mjs")') &&
    !fileStorageSchemaFormalReviewPackageQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-formal-review-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema promotion gate generator uses explicit fs promises",
  qcUsesProjectFileUtils(fileStorageSchemaPromotionGateGeneratorSource, ["readProjectJson"]) &&
    fileStorageSchemaPromotionGateGeneratorSource.includes('import { mkdir, readFile, writeFile } from "node:fs/promises";') &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("readProjectJson(root, toProjectRelative(resolvedPath))") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageSchemaPromotionGateGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("evidenceOnly: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noDatabaseConnection: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageSchemaPromotionGateGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaPromotionGateGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaPromotionGateGeneratorSource.includes("fsp."),
  "scripts/generate-file-storage-schema-promotion-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema promotion gate QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaPromotionGateQcSource, ["readProjectFile"]) &&
    fileStorageSchemaPromotionGateQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaPromotionGateQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-promotion-gate.mjs")') &&
    !fileStorageSchemaPromotionGateQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-promotion-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema verify gate generator uses explicit fs promises",
  fileStorageSchemaVerifyGateGeneratorSource.includes('import { mkdir, writeFile } from "node:fs/promises";') &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageSchemaVerifyGateGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("createPgSchemaVerifyClient") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("evaluateStorageSchemaTargetSafety") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("readOnlyVerification: true") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("noOfficialMigrationFilesWritten: true") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("noSqlApplied: true") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("noProviderIo: true") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageSchemaVerifyGateGeneratorSource.includes("noDatabaseUrlPrinted: true") &&
    !fileStorageSchemaVerifyGateGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageSchemaVerifyGateGeneratorSource.includes("fsp."),
  "scripts/generate-file-storage-schema-verify-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema verify gate QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaVerifyGateQcSource, ["readProjectFile"]) &&
    fileStorageSchemaVerifyGateQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaVerifyGateQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-verify-gate.mjs")') &&
    !fileStorageSchemaVerifyGateQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-verify-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target cost confirmation package QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetCostConfirmationPackageQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetCostConfirmationPackageQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetCostConfirmationPackageQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs")') &&
    !fileStorageSchemaTargetCostConfirmationPackageQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target readiness QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetReadinessQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetReadinessQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetReadinessQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-readiness.mjs")') &&
    !fileStorageSchemaTargetReadinessQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-readiness.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target readiness package QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetReadinessPackageQcSource, ["readProjectFile"]) &&
    fileStorageSchemaTargetReadinessPackageQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetReadinessPackageQcSource.includes('readProjectFile(root, "scripts/generate-file-storage-schema-target-readiness-package.mjs")') &&
    !fileStorageSchemaTargetReadinessPackageQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-readiness-package.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target provisioning evidence QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageSchemaTargetProvisioningEvidenceQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-file-storage-schema-target-provisioning-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage schema target provisioning evidence QC avoids generic JSON read wrapper",
  fileStorageSchemaTargetProvisioningEvidenceQcSource.includes("readProjectJson(root, toProjectRelative(filePath))") &&
    fileStorageSchemaTargetProvisioningEvidenceQcSource.includes('readProjectFile(root, "package.json")') &&
    fileStorageSchemaTargetProvisioningEvidenceQcSource.includes('readProjectFile(root, ".ai-doc/dev_task.md")') &&
    !fileStorageSchemaTargetProvisioningEvidenceQcSource.includes("function readJson(filePath)") &&
    !fileStorageSchemaTargetProvisioningEvidenceQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-schema-target-provisioning-evidence.mjs"
);
record(
  "SOURCE-BOUNDARY file storage cost report generator uses explicit fs promises",
  fileStorageCostReportGeneratorSource.includes("async function buildLocalObjectAudit") &&
    fileStorageCostReportGeneratorSource.includes('import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"') &&
    fileStorageCostReportGeneratorSource.includes("const entries = await readdir(directory, { withFileTypes: true })") &&
    fileStorageCostReportGeneratorSource.includes("const fileStat = await stat(fullPath)") &&
    fileStorageCostReportGeneratorSource.includes("async function hashFile(filePath)") &&
    fileStorageCostReportGeneratorSource.includes("update(await readFile(filePath))") &&
    fileStorageCostReportGeneratorSource.includes("await hashFile(resolved)") &&
    fileStorageCostReportGeneratorSource.includes("await buildLocalObjectAudit(") &&
    fileStorageCostReportGeneratorSource.includes("await mkdir(path.dirname(path.resolve(outPath)), { recursive: true })") &&
    fileStorageCostReportGeneratorSource.includes('await writeFile(outPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageCostReportGeneratorSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageCostReportGeneratorSource.includes("noFilesDeleted: true") &&
    !fileStorageCostReportGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageCostReportGeneratorSource.includes("fsp.") &&
    !fileStorageCostReportGeneratorSource.includes("fs.readFileSync"),
  "scripts/generate-file-storage-cost-report.mjs"
);
record(
  "SOURCE-BOUNDARY file storage archive restore generator uses explicit fs promises",
  fileStorageArchiveRestoreGeneratorSource.includes("async function sha256File(filePath)") &&
    fileStorageArchiveRestoreGeneratorSource.includes('import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"') &&
    fileStorageArchiveRestoreGeneratorSource.includes("update(await readFile(filePath))") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await sha256File(sourcePath)") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await sha256File(restorePath)") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await mkdir(restoreTargetDir, { recursive: true })") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await mkdir(path.dirname(restorePath), { recursive: true })") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await copyFile(sourcePath, restorePath)") &&
    fileStorageArchiveRestoreGeneratorSource.includes("const fileStat = await stat(restorePath)") &&
    fileStorageArchiveRestoreGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageArchiveRestoreGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageArchiveRestoreGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageArchiveRestoreGeneratorSource.includes("archiveRestoreDrillOnly: true") &&
    fileStorageArchiveRestoreGeneratorSource.includes("restoreTargetIsIsolated: true") &&
    fileStorageArchiveRestoreGeneratorSource.includes("noProviderMigrationExecuted: true") &&
    fileStorageArchiveRestoreGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageArchiveRestoreGeneratorSource.includes("noSourceFilesDeleted: true") &&
    !fileStorageArchiveRestoreGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageArchiveRestoreGeneratorSource.includes("fsp.") &&
    !fileStorageArchiveRestoreGeneratorSource.includes("fs.readFileSync"),
  "scripts/generate-file-storage-archive-restore-drill.mjs"
);
record(
  "SOURCE-BOUNDARY file storage archive restore QC uses async hash reads",
  fileStorageArchiveRestoreQcSource.includes("sha256File(path.join(tempRoot, item.restorePath))") &&
    fileStorageArchiveRestoreQcSource.includes("sha256Bytes(okBytes)") &&
    !fileStorageArchiveRestoreQcSource.includes("fs.readFileSync"),
  "scripts/qc-file-storage-archive-restore.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration execution gate generator uses explicit fs promises",
  fileStorageMigrationExecutionGateGeneratorSource.includes("async function sha256File(filePath)") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes('import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"') &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("update(await readFile(filePath))") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes('JSON.parse(await readFile(resolvedPath, "utf8"))') &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await sha256File(sourcePath)") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await sha256File(targetPath)") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await mkdir(targetRoot, { recursive: true })") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await mkdir(path.dirname(targetPath), { recursive: true })") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await copyFile(sourcePath, targetPath)") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("const fileStat = await stat(targetPath)") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("await mkdir(resolvedOutputDir, { recursive: true })") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes('await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    fileStorageMigrationExecutionGateGeneratorSource.includes('await writeFile(markdownPath, buildMarkdown(report), "utf8")') &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("explicitEnableRequired: true") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("stagingConfirmationRequired: true") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("governanceGateRequired: true") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("noMetadataPointersUpdated: true") &&
    fileStorageMigrationExecutionGateGeneratorSource.includes("noSourceFilesDeleted: true") &&
    !fileStorageMigrationExecutionGateGeneratorSource.includes('import fsp from "node:fs/promises"') &&
    !fileStorageMigrationExecutionGateGeneratorSource.includes("fsp.") &&
    !fileStorageMigrationExecutionGateGeneratorSource.includes("fs.readFileSync"),
  "scripts/generate-file-storage-migration-execution-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration execution gate QC uses async hash reads",
  fileStorageMigrationExecutionGateQcSource.includes("sha256File(path.resolve(item.targetPath))") &&
    fileStorageMigrationExecutionGateQcSource.includes("sha256Bytes(okBytes)") &&
    !fileStorageMigrationExecutionGateQcSource.includes("fs.readFileSync"),
  "scripts/qc-file-storage-migration-execution-gate.mjs"
);
record(
  "SOURCE-BOUNDARY file storage migration execution gate QC uses project file utils",
  qcUsesProjectFileUtils(fileStorageMigrationExecutionGateQcSource, ["readProjectFile"]) &&
    fileStorageMigrationExecutionGateQcSource.includes('readProjectFile(root, "package.json")') &&
    !fileStorageMigrationExecutionGateQcSource.includes('fsp.readFile(path.resolve("package.json")'),
  "scripts/qc-file-storage-migration-execution-gate.mjs"
);
record(
  "SOURCE-BOUNDARY LLM config QC uses project file utils",
  qcUsesProjectFileUtils(llmConfigQcSource, ["readProjectFile"]),
  "scripts/qc-llm-config-test.mjs"
);
record(
  "SOURCE-BOUNDARY system settings async QC uses project file utils",
  qcUsesProjectFileUtils(systemSettingsAsyncQcSource, ["readProjectFile"]),
  "scripts/qc-system-settings-async-repository.mjs"
);
record(
  "SOURCE-BOUNDARY access control async repository QC uses project file utils",
  qcUsesProjectFileUtils(accessControlAsyncRepositoryQcSource, ["readProjectFile"]),
  "scripts/qc-access-control-async-repository.mjs"
);
record(
  "SOURCE-BOUNDARY access control async repository QC avoids local text read wrapper",
  accessControlAsyncRepositoryQcSource.includes("function readProjectPath(filePath)") &&
    accessControlAsyncRepositoryQcSource.includes('readProjectFile(root, path.relative(root, filePath).replaceAll(path.sep, "/"))') &&
    !accessControlAsyncRepositoryQcSource.includes("function readText(filePath)") &&
    !accessControlAsyncRepositoryQcSource.includes("readText("),
  "scripts/qc-access-control-async-repository.mjs"
);
record(
  "SOURCE-BOUNDARY dashboard custom finder QC uses project file utils",
  qcUsesProjectFileUtils(dashboardCustomFinderQcSource, ["readProjectFile"]),
  "scripts/qc-dashboard-custom-finder-test.mjs"
);
record(
  "SOURCE-BOUNDARY dashboard component split QC uses project file utils",
  qcUsesProjectFileUtils(dashboardComponentSplitQcSource, ["readProjectFile"]),
  "scripts/qc-dashboard-component-split-test.mjs"
);
record(
  "SOURCE-BOUNDARY dashboard row memo QC uses project file utils",
  qcUsesProjectFileUtils(dashboardRowMemoQcSource, ["readProjectFile"]),
  "scripts/qc-dashboard-row-memo-test.mjs"
);
record(
  "SOURCE-BOUNDARY dashboard transition QC uses project file utils",
  qcUsesProjectFileUtils(dashboardTransitionQcSource, ["readProjectFile"]),
  "scripts/qc-dashboard-transition-test.mjs"
);
record(
  "SOURCE-BOUNDARY BOM workbench UI QC uses project file utils",
  qcUsesProjectFileUtils(bomWorkbenchUiQcSource, ["readProjectFile"]),
  "scripts/qc-bom-workbench-ui.mjs"
);
record(
  "SOURCE-BOUNDARY BOM workbench review UI QC uses project file utils",
  qcUsesProjectFileUtils(bomWorkbenchReviewUiQcSource, ["readProjectFile"]),
  "scripts/qc-bom-workbench-review-ui.mjs"
);
record(
  "SOURCE-BOUNDARY PDM system detail drawer UI QC uses project file utils",
  qcUsesProjectFileUtils(pdmSystemDetailDrawerUiQcSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-pdm-system-detail-drawer-ui.mjs"
);
record(
  "SOURCE-BOUNDARY UX attribute hierarchy QC uses project file utils",
  qcUsesProjectFileUtils(uxAttributeHierarchyQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-ux-attribute-hierarchy.mjs"
);
record(
  "SOURCE-BOUNDARY GDrive folder tree settings QC uses project file utils",
  qcUsesProjectFileUtils(gdriveFolderTreeSettingsQcSource, ["readProjectFile"]),
  "scripts/qc-gdrive-folder-tree-settings.mjs"
);
record(
  "SOURCE-BOUNDARY revision lifecycle QC uses project file utils",
  qcUsesProjectFileUtils(revisionLifecycleQcSource, ["readProjectFile"]),
  "scripts/qc-revision-lifecycle-test.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase local readiness QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeLocalReadinessQcSource, [
    "projectFileExists",
    "projectPath",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-local-readiness.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase local readiness QC avoids direct sync file reads",
  supabaseRuntimeLocalReadinessQcSource.includes('readProjectFile(root, relativePath).includes("@/lib/db")') &&
    !supabaseRuntimeLocalReadinessQcSource.includes("fs.readFileSync"),
  "scripts/qc-supabase-runtime-local-readiness.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime migrations QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeMigrationsQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-migrations.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime migrations QC uses shared hash utils",
  supabaseRuntimeMigrationsQcSource.includes('import { sha256Bytes as sha256 } from "./qc-file-hash-utils.mjs"') &&
    !supabaseRuntimeMigrationsQcSource.includes('import crypto from "node:crypto"') &&
    !supabaseRuntimeMigrationsQcSource.includes("crypto.createHash"),
  "scripts/qc-supabase-runtime-migrations.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase secret boundary QC uses project file utils",
  qcUsesProjectFileUtils(supabaseSecretBoundaryQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-supabase-secret-boundary.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase secret boundary QC avoids direct sync file reads",
  supabaseSecretBoundaryQcSource.includes("const content = readProjectFile(root, relativePath)") &&
    !supabaseSecretBoundaryQcSource.includes("fs.readFileSync"),
  "scripts/qc-supabase-secret-boundary.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase local suite report QC uses project file utils",
  qcUsesProjectFileUtils(supabaseLocalSuiteReportQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-gate-b-local-suite-report.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase current change impact QC uses project file utils",
  qcUsesProjectFileUtils(supabaseCurrentChangeImpactQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-current-change-impact.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase data parity policy QC uses project file utils",
  qcUsesProjectFileUtils(supabaseDataParityPolicyQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-data-parity-policy.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase migration history policy QC uses project file utils",
  qcUsesProjectFileUtils(supabaseMigrationHistoryPolicyQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-migration-history-policy.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime approval package QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeApprovalPackageQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-approval-package.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime gate runbook QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeGateRunbookQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-gate-b-runbook.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime gate plan QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeGatePlanQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-gate-plan.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime rollback readiness QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeRollbackReadinessQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-rollback-readiness.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime smoke report template QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeSmokeReportTemplateQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-smoke-report-template.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime smoke report QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeSmokeReportQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-supabase-runtime-smoke-report.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime smoke API matrix QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeSmokeApiMatrixQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-supabase-runtime-smoke-api-matrix.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase target identity receipt QC uses project file utils",
  qcUsesProjectFileUtils(supabaseTargetIdentityReceiptQcSource, ["projectFileExists", "readProjectFile", "readProjectJson"]),
  "scripts/qc-supabase-target-identity-receipt.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase runtime smoke auth session boundary QC uses project file utils",
  qcUsesProjectFileUtils(supabaseRuntimeSmokeAuthSessionBoundaryQcSource, [
    "projectFileExists",
    "readProjectFile",
    "readProjectJson"
  ]),
  "scripts/qc-supabase-runtime-smoke-auth-session-boundary.mjs"
);
record(
  "SOURCE-BOUNDARY Supabase gate B staging validation QC uses project file utils",
  qcUsesProjectFileUtils(supabaseGateBStagingValidationQcSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-supabase-gate-b-staging-validation.mjs"
);
record(
  "SOURCE-BOUNDARY sync Supabase runtime migrations uses project file utils",
  qcUsesProjectFileUtils(syncSupabaseRuntimeMigrationsSource, ["projectPath", "readProjectFile"]),
  "scripts/sync-supabase-runtime-migrations.mjs"
);
record(
  "SOURCE-BOUNDARY production readiness industrialization gate uses report runner",
  gateUsesProductionReadinessReportRunner(productionReadinessIndustrializationGateSource),
  "scripts/qc-production-readiness-industrialization-gate.mjs"
);
record(
  "SOURCE-BOUNDARY dev task completion audit uses readiness report runner",
  gateUsesProductionReadinessReportRunner(devTaskCompletionAuditSource),
  "scripts/qc-dev-task-completion-audit.mjs"
);
record(
  "SOURCE-BOUNDARY dev task completion audit uses project file utils",
  qcUsesProjectFileUtils(devTaskCompletionAuditSource, ["projectFileExists", "readProjectFile"]),
  "scripts/qc-dev-task-completion-audit.mjs"
);
record(
  "SOURCE-BOUNDARY dev task evidence sync QC uses project file utils",
  qcUsesProjectFileUtils(devTaskEvidenceSyncQcSource, ["readProjectFile"]),
  "scripts/qc-dev-task-evidence-sync.mjs"
);
record(
  "SOURCE-BOUNDARY dev task evidence sync QC avoids local text read wrapper",
  devTaskEvidenceSyncQcSource.includes("readProjectFile(root, path.relative(root, outputTaskPath).replaceAll(path.sep, \"/\"))") &&
    devTaskEvidenceSyncQcSource.includes("readProjectFile(root, path.relative(root, fixtureTaskPath).replaceAll(path.sep, \"/\"))") &&
    !devTaskEvidenceSyncQcSource.includes("function readText(filePath)"),
  "scripts/qc-dev-task-evidence-sync.mjs"
);
record(
  "SOURCE-BOUNDARY dev task evidence sync QC cleans fixture root on exit",
  devTaskEvidenceSyncQcSource.includes("function cleanupFixtureRoot()") &&
    devTaskEvidenceSyncQcSource.includes('process.once("exit", cleanupFixtureRoot)') &&
    devTaskEvidenceSyncQcSource.includes("fs.rmSync(fixtureRoot, { recursive: true, force: true })"),
  "scripts/qc-dev-task-evidence-sync.mjs"
);
record(
  "SOURCE-BOUNDARY SW add-in report generator uses explicit fs writes",
  swAddinReportGeneratorSource.includes('import { mkdirSync, writeFileSync } from "node:fs"') &&
    swAddinReportGeneratorSource.includes("mkdirSync(outputDir, { recursive: true })") &&
    swAddinReportGeneratorSource.includes('writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    swAddinReportGeneratorSource.includes('writeFileSync(path.join(outputDir, "report.md"), buildMarkdown(report), "utf8")') &&
    !swAddinReportGeneratorSource.includes('import fs from "node:fs"') &&
    !swAddinReportGeneratorSource.includes("fs.mkdirSync") &&
    !swAddinReportGeneratorSource.includes("fs.writeFileSync"),
  "scripts/generate-sw-addin-test-report.mjs"
);
record(
  "SOURCE-BOUNDARY SW add-in report utils use explicit fs operations",
  swAddinReportUtilsSource.includes('import { existsSync, readFileSync, readdirSync } from "node:fs"') &&
    swAddinReportUtilsSource.includes("for (const entry of readdirSync(reportRoot, { withFileTypes: true }))") &&
    swAddinReportUtilsSource.includes('return JSON.parse(readFileSync(reportPath, "utf8"))') &&
    !swAddinReportUtilsSource.includes('import fs from "node:fs"') &&
    !swAddinReportUtilsSource.includes("fs.readFileSync") &&
    !swAddinReportUtilsSource.includes("fs.existsSync"),
  "scripts/sw-addin-report-utils.mjs"
);
record(
  "SOURCE-BOUNDARY restore drill report generator uses explicit fs writes",
  restoreDrillReportGeneratorSource.includes('import { mkdirSync, writeFileSync } from "node:fs"') &&
    restoreDrillReportGeneratorSource.includes("mkdirSync(outputDir, { recursive: true })") &&
    restoreDrillReportGeneratorSource.includes('writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\\n`, "utf8")') &&
    restoreDrillReportGeneratorSource.includes('writeFileSync(path.join(outputDir, "report.md"), buildMarkdown(report), "utf8")') &&
    !restoreDrillReportGeneratorSource.includes('import fs from "node:fs"') &&
    !restoreDrillReportGeneratorSource.includes("fs.mkdirSync") &&
    !restoreDrillReportGeneratorSource.includes("fs.writeFileSync"),
  "scripts/generate-restore-drill-report.mjs"
);
record(
  "SOURCE-BOUNDARY restore drill report utils use explicit fs operations",
  restoreDrillReportUtilsSource.includes('import { existsSync, readFileSync, readdirSync } from "node:fs"') &&
    restoreDrillReportUtilsSource.includes("for (const entry of readdirSync(reportRoot, { withFileTypes: true }))") &&
    restoreDrillReportUtilsSource.includes('return JSON.parse(readFileSync(reportPath, "utf8"))') &&
    !restoreDrillReportUtilsSource.includes('import fs from "node:fs"') &&
    !restoreDrillReportUtilsSource.includes("fs.readFileSync") &&
    !restoreDrillReportUtilsSource.includes("fs.existsSync"),
  "scripts/restore-drill-report-utils.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager report generator uses explicit fs writes",
  documentManagerReportGeneratorSource.includes('import { mkdirSync } from "node:fs"') &&
    documentManagerReportGeneratorSource.includes("mkdirSync(outputDir, { recursive: true })") &&
    documentManagerReportGeneratorSource.includes('writeReport(path.join(outputDir, "report.json"), report)') &&
    !documentManagerReportGeneratorSource.includes('import fs from "node:fs"') &&
    !documentManagerReportGeneratorSource.includes("fs.mkdirSync") &&
    !documentManagerReportGeneratorSource.includes("fs.writeFileSync"),
  "scripts/generate-document-manager-report.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager report utils use explicit fs operations",
  documentManagerReportUtilsSource.includes('import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"') &&
    documentManagerReportUtilsSource.includes("for (const entry of readdirSync(reportRoot, { withFileTypes: true }))") &&
    documentManagerReportUtilsSource.includes('return JSON.parse(readFileSync(reportPath, "utf8"))') &&
    documentManagerReportUtilsSource.includes('const probe = JSON.parse(readFileSync(resolvedProbePath, "utf8"))') &&
    documentManagerReportUtilsSource.includes("writeFileSync(reportPath, `${JSON.stringify(normalizedReport, null, 2)}\\n`, \"utf8\")") &&
    !documentManagerReportUtilsSource.includes('import fs from "node:fs"') &&
    !documentManagerReportUtilsSource.includes("fs.readFileSync") &&
    !documentManagerReportUtilsSource.includes("fs.existsSync") &&
    !documentManagerReportUtilsSource.includes("fs.writeFileSync"),
  "scripts/document-manager-report-utils.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager extractor probe QC uses project file utils",
  qcUsesProjectFileUtils(documentManagerExtractorProbeQcSource, ["readProjectJson"]),
  "scripts/qc-document-manager-extractor-probe.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager extractor probe QC avoids local JSON read wrapper",
  documentManagerExtractorProbeQcSource.includes("readProjectJson(root, path.relative(root, outputPath).replaceAll(path.sep, \"/\"))") &&
    !documentManagerExtractorProbeQcSource.includes("function readJson(filePath)"),
  "scripts/qc-document-manager-extractor-probe.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager extractor probe QC cleans probe paths on exit",
  documentManagerExtractorProbeQcSource.includes("function cleanupProbePaths()") &&
    documentManagerExtractorProbeQcSource.includes('process.once("exit", cleanupProbePaths)') &&
    documentManagerExtractorProbeQcSource.includes("fs.rmSync(sampleDir, { recursive: true, force: true })") &&
    documentManagerExtractorProbeQcSource.includes("fs.rmSync(outputDir, { recursive: true, force: true })"),
  "scripts/qc-document-manager-extractor-probe.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager probe redaction QC uses project file utils",
  qcUsesProjectFileUtils(documentManagerProbeRedactionQcSource, ["readProjectFile"]),
  "scripts/qc-document-manager-probe-redaction.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager probe redaction QC avoids local text read wrapper",
  documentManagerProbeRedactionQcSource.includes("readProjectFile(root, path.relative(root, outputPath).replaceAll(path.sep, \"/\"))") &&
    !documentManagerProbeRedactionQcSource.includes("function readText(filePath)"),
  "scripts/qc-document-manager-probe-redaction.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager probe redaction QC cleans probe paths on exit",
  documentManagerProbeRedactionQcSource.includes("function cleanupProbePaths()") &&
    documentManagerProbeRedactionQcSource.includes('process.once("exit", cleanupProbePaths)') &&
    documentManagerProbeRedactionQcSource.includes("fs.rmSync(sampleDir, { recursive: true, force: true })") &&
    documentManagerProbeRedactionQcSource.includes("fs.rmSync(outputDir, { recursive: true, force: true })"),
  "scripts/qc-document-manager-probe-redaction.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager probe path gate QC creates and cleans fixtures",
  documentManagerProbePathGateQcSource.includes('fs.writeFileSync(probePath, `${JSON.stringify({ ready: true }, null, 2)}\\n`, "utf8")') &&
    documentManagerProbePathGateQcSource.includes("fs.rmSync(probeDir, { recursive: true, force: true })") &&
    documentManagerProbePathGateQcSource.includes("fs.rmSync(badProbeDir, { recursive: true, force: true })"),
  "scripts/qc-document-manager-probe-path-gate.mjs"
);
record(
  "SOURCE-BOUNDARY Document Manager probe path gate QC cleans fixtures on exit",
  documentManagerProbePathGateQcSource.includes("function cleanupProbePathGateDirs()") &&
    documentManagerProbePathGateQcSource.includes('process.once("exit", cleanupProbePathGateDirs)') &&
    documentManagerProbePathGateQcSource.includes("fs.rmSync(probeDir, { recursive: true, force: true })") &&
    documentManagerProbePathGateQcSource.includes("fs.rmSync(badProbeDir, { recursive: true, force: true })"),
  "scripts/qc-document-manager-probe-path-gate.mjs"
);
record(
  "SOURCE-BOUNDARY external blocker closure QC uses project file utils",
  qcUsesProjectFileUtils(externalBlockerClosureQcSource, ["readProjectFileIfExists", "readProjectJson"]),
  "scripts/qc-external-blocker-closure-package.mjs"
);
record(
  "SOURCE-BOUNDARY external blocker closure QC avoids local read wrappers",
  externalBlockerClosureQcSource.includes('readProjectFileIfExists(root, ".ai-doc/dev_task.md")') &&
    externalBlockerClosureQcSource.includes('readProjectJson(root, "package.json")') &&
    !externalBlockerClosureQcSource.includes("function readText(relativePath)") &&
    !externalBlockerClosureQcSource.includes("function readJson(relativePath)") &&
    !externalBlockerClosureQcSource.includes("readText(") &&
    !externalBlockerClosureQcSource.includes("readJson("),
  "scripts/qc-external-blocker-closure-package.mjs"
);
record(
  "SOURCE-BOUNDARY field test issue importer uses explicit fs operations",
  fieldTestIssueImporterSource.includes('import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"') &&
    fieldTestIssueImporterSource.includes("function readJsonFile(filePath)") &&
    fieldTestIssueImporterSource.includes('return JSON.parse(readFileSync(filePath, "utf8"))') &&
    fieldTestIssueImporterSource.includes("if (!existsSync(issuePath))") &&
    fieldTestIssueImporterSource.includes("if (!existsSync(registerPath))") &&
    fieldTestIssueImporterSource.includes("mkdirSync(path.dirname(registerPath), { recursive: true })") &&
    fieldTestIssueImporterSource.includes("writeFileSync(registerPath, `${JSON.stringify(merged.register, null, 2)}\\n`, \"utf8\")") &&
    !fieldTestIssueImporterSource.includes('import fs from "node:fs"') &&
    !fieldTestIssueImporterSource.includes("function readJson(filePath)") &&
    !fieldTestIssueImporterSource.includes("fs.readFileSync") &&
    !fieldTestIssueImporterSource.includes("fs.existsSync"),
  "scripts/import-field-test-issues.mjs"
);
record(
  "SOURCE-BOUNDARY field test issue intake QC uses project file utils",
  qcUsesProjectFileUtils(fieldTestIssueIntakeQcSource, ["readProjectJson"]),
  "scripts/qc-field-test-issue-intake.mjs"
);
record(
  "SOURCE-BOUNDARY field test issue intake QC cleans tmp root on exit",
  fieldTestIssueIntakeQcSource.includes("function cleanupTmpRoot()") &&
    fieldTestIssueIntakeQcSource.includes('process.once("exit", cleanupTmpRoot)') &&
    fieldTestIssueIntakeQcSource.includes("fs.rmSync(tmpRoot, { recursive: true, force: true })"),
  "scripts/qc-field-test-issue-intake.mjs"
);
record(
  "SOURCE-BOUNDARY field test preflight uses explicit fs operations",
  fieldTestPreflightSource.includes('import { existsSync, readdirSync, statSync } from "node:fs"') &&
    fieldTestPreflightSource.includes("return existsSync(filePath) && statSync(filePath).isFile()") &&
    fieldTestPreflightSource.includes("return existsSync(dirPath) && statSync(dirPath).isDirectory()") &&
    fieldTestPreflightSource.includes("if (!dirExists(handoffRoot)) return \"\"") &&
    fieldTestPreflightSource.includes("readdirSync(handoffRoot, { withFileTypes: true })") &&
    !fieldTestPreflightSource.includes('import fs from "node:fs"') &&
    !fieldTestPreflightSource.includes("fs.existsSync") &&
    !fieldTestPreflightSource.includes("fs.statSync") &&
    !fieldTestPreflightSource.includes("fs.readdirSync"),
  "scripts/field-test-preflight.mjs"
);
record(
  "SOURCE-BOUNDARY field test handoff generator uses explicit fs operations",
  fieldTestHandoffSource.includes('import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"') &&
    fieldTestHandoffSource.includes("if (!filePath || !existsSync(filePath))") &&
    fieldTestHandoffSource.includes("if (!dirPath || !existsSync(dirPath) || !statSync(dirPath).isDirectory())") &&
    fieldTestHandoffSource.includes("if (!existsSync(handoffRoot)) return \"\"") &&
    fieldTestHandoffSource.includes("readdirSync(handoffRoot, { withFileTypes: true })") &&
    fieldTestHandoffSource.includes('existsSync(path.join(dirPath, "restore-on-test-machine.ps1"))') &&
    fieldTestHandoffSource.includes("mkdirSync(path.dirname(targetPath), { recursive: true })") &&
    fieldTestHandoffSource.includes("copyFileSync(sourcePath, targetPath)") &&
    fieldTestHandoffSource.includes("cpSync(sourcePath, targetPath, { recursive: true })") &&
    fieldTestHandoffSource.includes("writeFileSync(path.join(outputDir, \"field-test-handoff.json\"") &&
    !fieldTestHandoffSource.includes('import fs from "node:fs"') &&
    !fieldTestHandoffSource.includes("fs.existsSync") &&
    !fieldTestHandoffSource.includes("fs.writeFileSync"),
  "scripts/prepare-field-test-handoff.mjs"
);
record(
  "SOURCE-BOUNDARY field test handoff package QC uses project file utils",
  qcUsesProjectFileUtils(fieldTestHandoffPackageQcSource, ["readProjectFile", "readProjectJson"]),
  "scripts/qc-field-test-handoff-package.mjs"
);
record(
  "SOURCE-BOUNDARY field test handoff package QC avoids local read wrappers",
  fieldTestHandoffPackageQcSource.includes("readProjectJson(root, relative(manifestPath))") &&
    fieldTestHandoffPackageQcSource.includes("readProjectFile(root, relative(checklistPath))") &&
    fieldTestHandoffPackageQcSource.includes("readProjectJson(root, relative(fieldIssuesTemplatePath))") &&
    !fieldTestHandoffPackageQcSource.includes("function readJson(filePath)") &&
    !fieldTestHandoffPackageQcSource.includes("function readText(filePath)"),
  "scripts/qc-field-test-handoff-package.mjs"
);
record(
  "SOURCE-BOUNDARY external asset verifier allows empty inventory",
  externalAssetVerifierSupportsEmptyInventory(externalAssetVerifierSource),
  "scripts/verify-external-assets.mjs"
);
record(
  "SOURCE-BOUNDARY external asset verifier uses project file utils for workspace manifests",
  qcUsesProjectFileUtils(externalAssetVerifierSource, ["readProjectFile"]) &&
    externalAssetVerifierSource.includes('import { createReadStream, existsSync } from "node:fs"') &&
    externalAssetVerifierSource.includes("const stream = createReadStream(filePath)") &&
    externalAssetVerifierSource.includes("if (existsSync(originalPath))") &&
    externalAssetVerifierSource.includes("if (!existsSync(manifestPath))") &&
    !externalAssetVerifierSource.includes('import fs from "node:fs"') &&
    !externalAssetVerifierSource.includes("fs.createReadStream") &&
    !externalAssetVerifierSource.includes("fs.existsSync") &&
    !externalAssetVerifierSource.includes("fs.readFileSync"),
  "scripts/verify-external-assets.mjs"
);
record(
  "SOURCE-BOUNDARY external asset verifier avoids local text read wrapper",
  externalAssetVerifierSource.includes("readProjectFile(root, toProjectRelative(filePath))") &&
    externalAssetVerifierSource.includes('await readFile(filePath, "utf8")') &&
    !externalAssetVerifierSource.includes("function readText(filePath)") &&
    !externalAssetVerifierSource.includes("readText("),
  "scripts/verify-external-assets.mjs"
);
record(
  "SOURCE-BOUNDARY data boundary limits tracked data",
  dataBoundaryLimitsTrackedData(dataBoundaryQcSource),
  "scripts/qc-data-boundary-test.mjs"
);
record(
  "SOURCE-BOUNDARY data boundary QC uses project file utils",
  qcUsesProjectFileUtils(dataBoundaryQcSource, ["readProjectFile"]),
  "scripts/qc-data-boundary-test.mjs"
);
record(
  "SOURCE-BOUNDARY LLM config behavioral QC covers fallback parsing",
  llmConfigQcSource.includes("LLM-CONFIG-001 defaults to local provider") &&
    llmConfigQcSource.includes("LLM-CONFIG-021 rejects zero positive timeout"),
  "scripts/qc-llm-config-test.mjs"
);
record(
  "SOURCE-BOUNDARY LLM config behavioral QC covers disable toggles",
  llmConfigQcSource.includes("LLM-CONFIG-025 allows zero context limit") &&
    llmConfigQcSource.includes("LLM-CONFIG-026 allows zero cache TTL") &&
    llmConfigQcSource.includes("LLM-CONFIG-027 allows zero rate limit"),
  "scripts/qc-llm-config-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC usage log stays outside repo",
  openAiQcSource.includes("os.tmpdir()") &&
    openAiQcSource.includes("fs.mkdtempSync") &&
    cleansTempUsageDir(openAiQcSource) &&
    !writesOpenAiUsageInsideRepo(openAiQcSource) &&
    !openAiQcSource.includes("fs.readFileSync"),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC app receives temp usage dir",
  passesUsageDirToAppEnv(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC cleanup is asserted",
  verifiesUsageDirCleanup(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC temp root is asserted",
  verifiesUsageDirUnderOsTemp(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC usage log is metadata-only",
  verifiesUsageLogMetadataOnly(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC usage log fields are approved",
  verifiesUsageLogApprovedFields(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC usage log metadata quality is asserted",
  verifiesUsageLogMetadataQuality(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC usage event count is asserted",
  verifiesUsageLogExpectedEventCount(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC covers upstream HTTP errors",
  verifiesOpenAiHttpErrorCoverage(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);
record(
  "SOURCE-BOUNDARY API QC verifies supplier response id contract",
  verifiesSupplierResponseIdContract(apiQcSource),
  "scripts/qc-api-test.mjs"
);
record(
  "SOURCE-BOUNDARY OpenAI QC fixtures stay ASCII-safe",
  hasOnlyAscii(openAiQcSource),
  "scripts/qc-openai-provider-test.mjs"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
