#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  artifactReference,
  manifestBase,
  readJson,
  runnerCoverage,
  sourceInfo,
  writeCapabilityManifest
} from "./dev-087-evidence-lib.mjs";

const root = process.cwd();
const runner = "qc-dev-087-capability-browser";
const composeRunId = process.env.DEV087_BROWSER_COMPOSE_RUN_ID?.trim() || null;
const runId = composeRunId || `DEV087-product-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID ?? null;
const outputRoot = path.join("output", "qa", "dev-087-capability");
const outputDir = path.join(root, outputRoot, runId);
const logDir = path.join(outputDir, "child-logs");
const registry = readJson(path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json"));
const coverage = runnerCoverage(registry, runner);
const expectedCases = [...coverage.caseIds];
const sourceAtStart = sourceInfo(root);
fs.mkdirSync(logDir, { recursive: true });

const uiCases = [
  ...Array.from({ length: 24 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)
];
const attachmentCases = ["P11", "P12", "P13"];
const controlCases = Array.from({ length: 11 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
const matrixCases = Array.from({ length: 14 }, (_, index) => `I${String(index + 1).padStart(2, "0")}`);
const functionalCases = [
  ...Array.from({ length: 7 }, (_, index) => `QA-087-${187 + index}`),
  ...Array.from({ length: 4 }, (_, index) => `QA-087-${198 + index}`),
  ...Array.from({ length: 3 }, (_, index) => `QA-087-${203 + index}`),
  ...Array.from({ length: 11 }, (_, index) => `QA-087-${207 + index}`)
];

function safeJson(value) { try { return JSON.stringify(value); } catch { return String(value); } }
function exactRoster(actual, expected) { return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()) && actual.length === new Set(actual).size; }
function readPrimarySnapshot() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs")], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}
function primarySafe(snapshot) {
  return snapshot && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}
function spawnChild(label, script, logName = label) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DEV087_PARENT_RUN_ID: runId }
  });
  const logPath = path.join(logDir, `${logName}.log`);
  fs.writeFileSync(logPath, `${result.stdout ?? ""}\n--- STDERR ---\n${result.stderr ?? ""}`, "utf8");
  return { result, logPath };
}
function runChild(label, script) {
  const { result, logPath } = spawnChild(label, script);
  if (result.status !== 0) throw new Error(`CHILD_RUN_FAILED:${label}:exit=${result.status}:log=${path.relative(root, logPath)}`);
  return logPath;
}
function scanManifests(baseDir, fileName) {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = path.join(baseDir, entry.name, fileName);
    if (!fs.existsSync(manifestPath)) return [];
    try { return [{ path: manifestPath, parsed: readJson(manifestPath) }]; } catch { return []; }
  });
}
function requireSingle(items, code) {
  if (items.length !== 1) throw new Error(`${code}:count=${items.length}`);
  return items[0];
}
function requireFile(filePath, code) {
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${code}:${filePath}`);
  return resolved;
}

function uiManifestForAttempt(startedAt) {
  const candidates = scanManifests(path.join(root, "output", "qa", "dev-087-ui-only-lifecycle"), "run-manifest.json")
    .filter((item) => item.parsed.parentRunId === runId
      && item.parsed.denominator?.total === 34
      && (item.parsed.cases?.length === 34
        || item.parsed.checks?.some((check) => check.name === "full runner execution"))
      && fs.statSync(item.path).mtimeMs >= startedAt - 2_000)
    .sort((left, right) => fs.statSync(left.path).mtimeMs - fs.statSync(right.path).mtimeMs);
  if (candidates.length !== 1) throw new Error(`UI_ATTEMPT_MANIFEST_CARDINALITY:count=${candidates.length}`);
  return candidates[0];
}

function uiInfrastructureOnlyFailure(ui, resultStatus) {
  const evidenceDir = path.dirname(ui.path);
  const cleanup = readJson(path.join(evidenceDir, "cleanup-ledger.json"));
  const primary = readJson(path.join(evidenceDir, "primary-invariant.json"));
  const consoleErrors = ui.parsed.consoleErrors ?? [];
  return resultStatus !== 0
    && ui.parsed.status === "FAIL"
    && ui.parsed.cases?.length === 34
    && ui.parsed.cases.every((item) => item.status === "PASS")
    && ui.parsed.gates?.fail === 0
    && ui.parsed.infrastructure?.fail === 0
    && (ui.parsed.failures?.length ?? 0) === 0
    && consoleErrors.length > 0
    && consoleErrors.every((item) => /ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)/u.test(String(item.message ?? "")))
    && cleanup.status === "task-owned runtime removed"
    && cleanup.tempRootRemoved === true
    && cleanup.runtimeProjectRemoved === true
    && primary.unchanged === true
    && safeJson(primary.before) === safeJson(primary.after)
    && safeJson(readPrimarySnapshot()) === safeJson(primaryBefore)
    && safeJson(sourceInfo(root)) === safeJson(sourceAtStart);
}

function browserManifestForAttempt(startedAt) {
  const candidates = scanManifests(path.join(root, "output", "qa", "dev-087"), "manifest.json")
    .filter((item) => item.parsed.parentRunId === runId
      && Array.isArray(item.parsed.functionalCaseReceipts)
      && item.parsed.functionalCaseReceipts.length === 25
      && fs.statSync(item.path).mtimeMs >= startedAt - 2_000)
    .sort((left, right) => fs.statSync(left.path).mtimeMs - fs.statSync(right.path).mtimeMs);
  if (candidates.length !== 1) throw new Error(`BROWSER_ATTEMPT_MANIFEST_CARDINALITY:count=${candidates.length}`);
  return candidates[0];
}

function browserInfrastructureOnlyFailure(browser, resultStatus) {
  const manifest = browser.parsed;
  const failedChecks = (manifest.checks ?? []).filter((item) => item.pass !== true);
  const failures = manifest.failures ?? [];
  const exactSocketError = /^net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)$/u;
  const exactExecutionError = /^(?:page\.(?:goto|reload)|locator\.|browserType\.|request\.).*net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)/su;
  const cleanupChecksPass = (manifest.checks ?? []).some((item) => item.name === "temporary runtime port released" && item.pass === true)
    && (manifest.checks ?? []).some((item) => item.name === "temporary runtime dist removed" && item.pass === true)
    && (manifest.checks ?? []).some((item) => item.name === "next-env restored after task runtime" && item.pass === true);
  return resultStatus !== 0
    && manifest.status === "FAIL"
    && manifest.total === 132
    && manifest.passed === 131
    && manifest.failed === 1
    && failedChecks.length === 1
    && failedChecks[0]?.name === "browser execution"
    && exactExecutionError.test(String(failedChecks[0]?.detail ?? ""))
    && failures.length === 1
    && failures[0]?.kind === "requestfailed"
    && exactSocketError.test(String(failures[0]?.message ?? ""))
    && (manifest.consoleErrors?.length ?? 0) === 0
    && cleanupChecksPass
    && manifest.primaryInvariant?.unchanged === true
    && safeJson(manifest.primaryInvariant?.before) === safeJson(manifest.primaryInvariant?.after)
    && safeJson(readPrimarySnapshot()) === safeJson(primaryBefore)
    && safeJson(sourceInfo(root)) === safeJson(sourceAtStart);
}

async function runUiChildWithInfrastructureRetry() {
  const attempts = [];
  const canonicalLogPath = path.join(logDir, "ui-only.log");
  const ledgerPath = path.join(logDir, "ui-only-attempt-ledger.json");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const { result, logPath } = spawnChild("ui-only", "qc-dev-087-ui-only.mjs", `ui-only.attempt-${attempt}`);
    const ui = uiManifestForAttempt(startedAt);
    const retryEligible = uiInfrastructureOnlyFailure(ui, result.status);
    attempts.push({
      attempt,
      exitCode: result.status,
      runId: ui.parsed.runId,
      status: ui.parsed.status,
      log: path.relative(root, logPath).replaceAll("\\", "/"),
      manifest: path.relative(root, ui.path).replaceAll("\\", "/"),
      consoleErrors: ui.parsed.consoleErrors ?? [],
      retryEligible
    });
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ policy: "One fresh retry is allowed only for an otherwise-clean, fully-cleaned ERR_NO_BUFFER_SPACE or ERR_NETWORK_CHANGED infrastructure failure; both attempts remain evidence.", attempts }, null, 2)}\n`, "utf8");
    if (result.status === 0) {
      fs.copyFileSync(logPath, canonicalLogPath);
      return { logPath: canonicalLogPath, ui, ledgerPath, attempts };
    }
    if (!retryEligible || attempt === 2) {
      fs.copyFileSync(logPath, canonicalLogPath);
      throw new Error(`CHILD_RUN_FAILED:ui-only:exit=${result.status}:retryEligible=${retryEligible}:log=${path.relative(root, logPath)}`);
    }
    await delay(30_000);
  }
  throw new Error("UI_ONLY_RETRY_STATE_UNREACHABLE");
}

async function runBrowserChildWithInfrastructureRetry() {
  const attempts = [];
  const canonicalLogPath = path.join(logDir, "browser.log");
  const ledgerPath = path.join(logDir, "browser-attempt-ledger.json");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const { result, logPath } = spawnChild("browser", "qc-dev-087-browser.mjs", `browser.attempt-${attempt}`);
    const browser = browserManifestForAttempt(startedAt);
    const retryEligible = browserInfrastructureOnlyFailure(browser, result.status);
    attempts.push({
      attempt,
      exitCode: result.status,
      runId: browser.parsed.runId,
      status: browser.parsed.status,
      log: path.relative(root, logPath).replaceAll("\\", "/"),
      manifest: path.relative(root, browser.path).replaceAll("\\", "/"),
      failures: browser.parsed.failures ?? [],
      retryEligible
    });
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ policy: "One fresh retry is allowed only for an otherwise-clean, fully-cleaned ERR_NO_BUFFER_SPACE or ERR_NETWORK_CHANGED browser infrastructure failure; both attempts remain evidence.", attempts }, null, 2)}\n`, "utf8");
    if (result.status === 0 && browser.parsed.status === "PASS") {
      fs.copyFileSync(logPath, canonicalLogPath);
      return { logPath: canonicalLogPath, browser, ledgerPath, attempts };
    }
    if (!retryEligible || attempt === 2) {
      fs.copyFileSync(logPath, canonicalLogPath);
      throw new Error(`CHILD_RUN_FAILED:browser:exit=${result.status}:retryEligible=${retryEligible}:log=${path.relative(root, logPath)}`);
    }
    await delay(30_000);
  }
  throw new Error("BROWSER_RETRY_STATE_UNREACHABLE");
}

const primaryBefore = readPrimarySnapshot();
let primaryAfter = null;
let finalError = null;
const referenceSpecs = new Map();
const evidencePathsByCase = new Map(expectedCases.map((caseId) => [caseId, new Set()]));
let uiRetryLedgerPath = null;
let uiRetryAttempts = [];
let browserRetryLedgerPath = null;
let browserRetryAttempts = [];

function addEvidence(caseIds, filePath, childRunner) {
  const resolved = requireFile(filePath, "EVIDENCE_FILE_MISSING");
  const relative = path.relative(root, resolved).replaceAll("\\", "/");
  const current = referenceSpecs.get(relative) ?? { filePath: resolved, runner: childRunner, caseIds: new Set() };
  for (const caseId of caseIds) {
    current.caseIds.add(caseId);
    evidencePathsByCase.get(caseId)?.add(relative);
  }
  referenceSpecs.set(relative, current);
}

try {
  if (!primarySafe(primaryBefore)) throw new Error(`PRIMARY_INVARIANT_UNSAFE_BEFORE:${safeJson(primaryBefore)}`);
  const uiExecution = composeRunId ? null : await runUiChildWithInfrastructureRetry();
  const uiLog = composeRunId ? requireFile(path.join(logDir, "ui-only.log"), "COMPOSE_UI_LOG_MISSING") : uiExecution.logPath;
  uiRetryLedgerPath = uiExecution?.ledgerPath ?? null;
  uiRetryAttempts = uiExecution?.attempts ?? [];
  const attachmentLog = composeRunId ? requireFile(path.join(logDir, "part-attachments.log"), "COMPOSE_ATTACHMENT_LOG_MISSING") : runChild("part-attachments", "qc-dev-087-part-attachments-browser.mjs");
  const browserExecution = composeRunId ? null : await runBrowserChildWithInfrastructureRetry();
  const browserLog = composeRunId ? requireFile(path.join(logDir, "browser.log"), "COMPOSE_BROWSER_LOG_MISSING") : browserExecution.logPath;
  browserRetryLedgerPath = browserExecution?.ledgerPath ?? null;
  browserRetryAttempts = browserExecution?.attempts ?? [];

  const ui = composeRunId
    ? requireSingle(scanManifests(path.join(root, "output", "qa", "dev-087-ui-only-lifecycle"), "run-manifest.json")
      .filter((item) => item.parsed.parentRunId === runId && item.parsed.denominator?.total === 34 && item.parsed.cases?.length === 34), "UI_PARENT_MANIFEST_CARDINALITY")
    : uiExecution.ui;
  const dev087Raw = scanManifests(path.join(root, "output", "qa", "dev-087"), "manifest.json").filter((item) => item.parsed.parentRunId === runId);
  const attachments = requireSingle(dev087Raw.filter((item) => item.parsed.scope === "part-attachments"), "ATTACHMENT_PARENT_MANIFEST_CARDINALITY");
  const browser = composeRunId
    ? requireSingle(dev087Raw.filter((item) => Array.isArray(item.parsed.functionalCaseReceipts) && item.parsed.functionalCaseReceipts.length === 25), "BROWSER_PARENT_MANIFEST_CARDINALITY")
    : browserExecution.browser;

  if (ui.parsed.status !== "PASS" || !exactRoster(ui.parsed.cases.map((item) => item.id), uiCases) || ui.parsed.cases.some((item) => item.status !== "PASS")) throw new Error("UI_LIFECYCLE_ROSTER_OR_STATUS_INVALID");
  const uiControlChecks = ui.parsed.checks.filter((item) => /^C(?:0[1-9]|1[01])$/u.test(item.name));
  if (!exactRoster(uiControlChecks.map((item) => item.name), controlCases) || uiControlChecks.some((item) => item.pass !== true)) throw new Error("UI_CONTROL_ROSTER_OR_STATUS_INVALID");
  if ((ui.parsed.failures?.length ?? 0) !== 0 || (ui.parsed.consoleErrors?.length ?? 0) !== 0) throw new Error("UI_UNEXPECTED_ERROR_PRESENT");
  const uiPrimaryPath = requireFile(path.join(path.dirname(ui.path), "primary-invariant.json"), "UI_PRIMARY_INVARIANT_MISSING");
  const uiPrimary = readJson(uiPrimaryPath);
  if (uiPrimary.unchanged !== true || safeJson(uiPrimary.before) !== safeJson(uiPrimary.after)) throw new Error("UI_PRIMARY_INVARIANT_CHANGED");

  if (attachments.parsed.status !== "PASS" || !exactRoster(attachments.parsed.caseReceipts?.map((item) => item.caseId) ?? [], attachmentCases)) throw new Error("ATTACHMENT_ROSTER_OR_STATUS_INVALID");
  if (attachments.parsed.primaryInvariant?.unchanged !== true || attachments.parsed.cleanupReceipt?.portsReleased !== true || attachments.parsed.consoleErrors?.length || attachments.parsed.failures?.length) throw new Error("ATTACHMENT_EVIDENCE_NOT_CLEAN");
  if (browser.parsed.status !== "PASS" || !exactRoster(browser.parsed.caseReceipts?.map((item) => item.caseId) ?? [], matrixCases) || !exactRoster(browser.parsed.functionalCaseReceipts?.map((item) => item.caseId) ?? [], functionalCases)) throw new Error("BROWSER_ROSTER_OR_STATUS_INVALID");
  if (browser.parsed.primaryInvariant?.unchanged !== true || browser.parsed.consoleErrors?.length || browser.parsed.failures?.length) throw new Error("BROWSER_EVIDENCE_NOT_CLEAN");

  addEvidence([...uiCases, ...controlCases], ui.path, "qc-dev-087-ui-only");
  addEvidence(attachmentCases, attachments.path, "qc-dev-087-part-attachments");
  addEvidence([...matrixCases, ...functionalCases, "C10"], browser.path, "qc-dev-087-browser");
  addEvidence(expectedCases, uiLog, runner);
  if (uiRetryLedgerPath) addEvidence(expectedCases, uiRetryLedgerPath, runner);
  addEvidence(attachmentCases, attachmentLog, runner);
  addEvidence([...matrixCases, ...functionalCases, "C10"], browserLog, runner);
  if (browserRetryLedgerPath) addEvidence([...matrixCases, ...functionalCases, "C10"], browserRetryLedgerPath, runner);

  for (const caseId of uiCases) {
    const journey = ui.parsed.lifecycleJourneys.find((item) => item.caseId === caseId);
    if (caseId !== "D24" && (!journey || journey.status !== "PASS")) throw new Error(`UI_JOURNEY_MISSING_OR_FAIL:${caseId}`);
    const journeyPath = caseId === "D24" ? null : requireFile(journey.evidence, `UI_JOURNEY_FILE_MISSING:${caseId}`);
    if (journeyPath) {
      const journeyBody = readJson(journeyPath);
      if (journeyBody.caseId !== caseId || journeyBody.status !== "PASS" || !Array.isArray(journeyBody.actions) || journeyBody.actions.length === 0) throw new Error(`UI_JOURNEY_CONTENT_INVALID:${caseId}`);
    }
    const childEvidenceRoot = journeyPath ? path.dirname(path.dirname(path.dirname(journeyPath))) : path.dirname(ui.path);
    const caseEvidenceDir = path.join(childEvidenceRoot, "cases", caseId);
    const requiredFiles = ["case.json", "actions.jsonl", "network.jsonl", "viewport-metrics.json", "visible-error-sweep.json", path.join("api-readback", "list.json"), path.join("db-readback", "list.json"), path.join("triad-diff", "list.json")];
    for (const fileName of requiredFiles) addEvidence([caseId], path.join(caseEvidenceDir, fileName), "qc-dev-087-ui-only");
    const screenshotDir = path.join(caseEvidenceDir, "screenshots");
    const screenshots = fs.existsSync(screenshotDir) ? fs.readdirSync(screenshotDir).filter((name) => name.toLowerCase().endsWith(".png")) : [];
    if (screenshots.length === 0) throw new Error(`UI_SCREENSHOT_MISSING:${caseId}`);
    for (const screenshot of screenshots) addEvidence([caseId], path.join(screenshotDir, screenshot), "qc-dev-087-ui-only");
    if (journeyPath) addEvidence([caseId], journeyPath, "qc-dev-087-ui-only");
  }

  for (const receipt of attachments.parsed.caseReceipts) {
    addEvidence([receipt.caseId], receipt.receipt, "qc-dev-087-part-attachments");
    addEvidence([receipt.caseId], receipt.screenshot, "qc-dev-087-part-attachments");
  }
  for (const receipt of [...browser.parsed.caseReceipts, ...browser.parsed.functionalCaseReceipts]) {
    addEvidence([receipt.caseId], receipt.receipt, "qc-dev-087-browser");
    addEvidence([receipt.caseId], receipt.screenshot, "qc-dev-087-browser");
  }

  const cArtifacts = {
    C01: ["prohibited-mutation-audit.json"], C02: ["coverage.json"], C03: ["fixture-mutation-ledger.json"],
    C04: ["authority.json"], C05: ["summary.md"], C06: ["cleanup-ledger.json"], C07: ["route-inventory.json"],
    C08: ["coverage.json"], C09: ["summary.md"], C10: ["primary-invariant.json"],
    C11: [path.join("fault-profiles", "system_admin.json"), path.join("fault-profiles", "blocked.json")]
  };
  for (const [caseId, files] of Object.entries(cArtifacts)) for (const file of files) addEvidence([caseId], path.join(path.dirname(ui.path), file), "qc-dev-087-ui-only");
  const qa217 = browser.parsed.functionalCaseReceipts.find((item) => item.caseId === "QA-087-217");
  addEvidence(["C10"], qa217.receipt, "qc-dev-087-browser");
  addEvidence(["C10"], qa217.screenshot, "qc-dev-087-browser");

  primaryAfter = readPrimarySnapshot();
  if (!primarySafe(primaryAfter) || safeJson(primaryBefore) !== safeJson(primaryAfter)) throw new Error(`PRIMARY_INVARIANT_CHANGED:${safeJson({ primaryBefore, primaryAfter })}`);
  const sourceAtEnd = sourceInfo(root);
  if (safeJson(sourceAtStart) !== safeJson(sourceAtEnd)) throw new Error("SOURCE_CHANGED_DURING_BROWSER_CAPABILITY_RUN");

  const auditPath = path.join(outputDir, "composition-audit.json");
  fs.writeFileSync(auditPath, `${JSON.stringify({
    runId, parentRunId, expectedCases, assigned: { uiCases, attachmentCases, controlCases, matrixCases, functionalCases },
    childRunIds: { ui: ui.parsed.runId, attachments: attachments.parsed.runId, browser: browser.parsed.runId },
    uiInfrastructureAttempts: uiRetryAttempts,
    browserInfrastructureAttempts: browserRetryAttempts,
    parentLineage: [ui.parsed.parentRunId, attachments.parsed.parentRunId, browser.parsed.parentRunId],
    rosterCounts: { ui: uiCases.length, attachments: attachmentCases.length, controls: controlCases.length, matrix: matrixCases.length, functional: functionalCases.length, total: expectedCases.length },
    primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: true },
    sourceInvariant: { before: sourceAtStart, after: sourceAtEnd, unchanged: true },
    evidenceFileCount: referenceSpecs.size,
    policy: composeRunId
      ? "Composition recovery revalidates only the exact raw children already executed under this same runId; no other run is eligible."
      : "No historical child is selected; every raw child was executed by this orchestrator and carries this runId as parentRunId."
  }, null, 2)}\n`, "utf8");
  addEvidence(expectedCases, auditPath, runner);
} catch (error) {
  finalError = error instanceof Error ? error.message : String(error);
  if (!primaryAfter) {
    try { primaryAfter = readPrimarySnapshot(); } catch {}
  }
}

const manifest = manifestBase({ root, runId, gateStage: "product", runner, provider: "sqlite", dataScope: "fresh task-owned isolated browser fixtures", parentRunId });
manifest.caseResults = expectedCases.map((caseId) => ({
  caseId,
  result: finalError ? "NOT_RUN" : "PASS",
  assertionIds: registry.cases.find((item) => item.caseId === caseId)?.assertionIds ?? [`${caseId}:FRESH_RENDERED_UI_EVIDENCE`],
  firstFailurePointer: finalError ? "child-logs" : null
}));
manifest.childManifests = [...referenceSpecs.values()].map((spec) => artifactReference(root, spec.filePath, spec.runner, [...spec.caseIds], "PASS"));
manifest.caseEvidence = Object.fromEntries(expectedCases.map((caseId) => [caseId, {
  evidenceTypes: [...coverage.requiredEvidence],
  artifactPaths: [...(evidencePathsByCase.get(caseId) ?? [])]
}]));
manifest.primaryInvariant = { status: safeJson(primaryBefore) === safeJson(primaryAfter) && primarySafe(primaryAfter) ? "unchanged" : "changed_or_unavailable", delta: safeJson(primaryBefore) === safeJson(primaryAfter) ? 0 : 1, before: primaryBefore, after: primaryAfter };
manifest.cleanupReceipt = { status: finalError ? "failed_or_incomplete" : "complete", taskOwnedRuntime: true, portsReleased: finalError ? false : true };
manifest.result = finalError ? "FAIL" : "PASS";
manifest.errorCode = finalError;
manifest.firstFailure = finalError ? { code: finalError, caseId: expectedCases[0], pointer: "child-logs" } : null;
const manifestPath = writeCapabilityManifest(root, outputRoot, manifest);
console.log(JSON.stringify({ runId, parentRunId, result: manifest.result, cases: expectedCases.length, evidenceFiles: manifest.childManifests.length, errorCode: manifest.errorCode, manifest: manifestPath }, null, 2));
if (finalError) process.exitCode = 1;
