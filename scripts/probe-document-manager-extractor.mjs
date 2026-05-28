#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findLatestReport, readReport } from "./document-manager-report-utils.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const reportPath = args.report ? path.resolve(args.report) : args.latestReport ? findLatestReport(root) : "";
const report = reportPath ? readReport(reportPath) : null;
const environment = report?.environment ?? {};
const sampleFilesPath = resolveMaybe(args.sampleFilesPath || environment.sampleFilesPath || "");
const metadataCommand = args.metadataCommand || environment.extractorCommand || process.env.PDM_METADATA_EXTRACTOR_CMD || "";
const metadataArgs = args.metadataArgs || environment.extractorArgs || process.env.PDM_METADATA_EXTRACTOR_ARGS || "";
const referenceCommand =
  args.referenceCommand ||
  environment.referenceExtractorCommand ||
  process.env.PDM_CAD_REFERENCE_EXTRACTOR_CMD ||
  metadataCommand;
const referenceArgs =
  args.referenceArgs ||
  environment.referenceExtractorArgs ||
  process.env.PDM_CAD_REFERENCE_EXTRACTOR_ARGS ||
  metadataArgs;
const probeId = makeProbeId();
const outputDir = resolveMaybe(args.output || path.join(root, "data", "document-manager-probes", probeId));
const nativeExtensions = new Set([".sldprt", ".sldasm", ".slddrw"]);
const requiredMetadataFields = ["drawing_number", "part_number", "part_name", "revision", "document_type"];

function parseArgs(argv) {
  const parsed = {
    report: "",
    latestReport: false,
    sampleFilesPath: "",
    metadataCommand: "",
    metadataArgs: "",
    referenceCommand: "",
    referenceArgs: "",
    output: "",
    timeoutMs: 8000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") parsed.report = argv[++index] ?? "";
    else if (arg === "--latest-report") parsed.latestReport = true;
    else if (arg === "--sample-files-path") parsed.sampleFilesPath = argv[++index] ?? "";
    else if (arg === "--metadata-command") parsed.metadataCommand = argv[++index] ?? "";
    else if (arg === "--metadata-args") parsed.metadataArgs = argv[++index] ?? "";
    else if (arg === "--reference-command") parsed.referenceCommand = argv[++index] ?? "";
    else if (arg === "--reference-args") parsed.referenceArgs = argv[++index] ?? "";
    else if (arg === "--output") parsed.output = argv[++index] ?? "";
    else if (arg === "--timeout-ms") parsed.timeoutMs = Number(argv[++index] ?? 8000);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function makeProbeId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function resolveMaybe(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function relative(value) {
  return path.relative(root, value).replaceAll(path.sep, "/");
}

function collectNativeSampleFiles(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && nativeExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function parseCommandArgs(raw, filePath) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [filePath];

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Extractor args must be a JSON string array.");
  }
  return parsed.map((item) => item.replaceAll("{file}", filePath));
}

async function runExtractor(kind, command, rawArgs, filePath) {
  if (!command) {
    return {
      kind,
      file: filePath,
      passed: false,
      issue: `${kind} command is empty`,
      stdout: "",
      parsed: null
    };
  }

  try {
    const commandArgs = parseCommandArgs(rawArgs, filePath);
    const { stdout } = await execFileAsync(command, commandArgs, {
      timeout: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    const parsed = JSON.parse(stdout);
    return {
      kind,
      file: filePath,
      passed: true,
      issue: "",
      stdout: stdout.slice(0, 5000),
      parsed
    };
  } catch (error) {
    return {
      kind,
      file: filePath,
      passed: false,
      issue: error instanceof Error ? error.message : String(error),
      stdout: "",
      parsed: null
    };
  }
}

function metadataFrom(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  const value = parsed;
  const metadata = value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
    ? value.metadata
    : value;
  return Object.fromEntries(Object.entries(metadata).map(([key, item]) => [normalizeKey(key), String(item ?? "").trim()]));
}

function referencesFrom(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.references)) return parsed.references;
  return [];
}

function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/gu, "")
    .replace(/[\s-]+/gu, "_");
}

function validateMetadata(parsed) {
  const metadata = metadataFrom(parsed);
  const missingFields = requiredMetadataFields.filter((field) => !metadata[field]);
  return {
    passed: missingFields.length === 0,
    missingFields,
    metadata
  };
}

function validateReferences(parsed) {
  const references = referencesFrom(parsed);
  const usable = references.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return Boolean(entry.referencedFilename || entry.referenced_filename || entry.filename || entry.name);
  });
  return {
    passed: usable.length > 0,
    count: usable.length,
    references: usable
  };
}

const samples = collectNativeSampleFiles(sampleFilesPath);
const checks = [];

if (!sampleFilesPath) checks.push({ id: "PROBE-ENV-001", passed: false, detail: "sampleFilesPath is empty" });
else checks.push({ id: "PROBE-ENV-001", passed: fs.existsSync(sampleFilesPath), detail: sampleFilesPath });
checks.push({ id: "PROBE-ENV-002", passed: samples.length > 0, detail: `${samples.length} native sample file(s)` });
checks.push({ id: "PROBE-ENV-003", passed: Boolean(metadataCommand), detail: metadataCommand || "metadata command is empty" });
checks.push({ id: "PROBE-ENV-004", passed: Boolean(referenceCommand), detail: referenceCommand || "reference command is empty" });

const sampleResults = [];
for (const filePath of samples) {
  const metadataRun = await runExtractor("metadata", metadataCommand, metadataArgs, filePath);
  const metadataValidation = metadataRun.passed ? validateMetadata(metadataRun.parsed) : { passed: false, missingFields: requiredMetadataFields, metadata: {} };
  const referenceRun = await runExtractor("references", referenceCommand, referenceArgs, filePath);
  const referenceValidation = referenceRun.passed ? validateReferences(referenceRun.parsed) : { passed: false, count: 0, references: [] };

  sampleResults.push({
    file: relative(filePath),
    extension: path.extname(filePath).toLowerCase().slice(1),
    metadata: {
      commandPassed: metadataRun.passed,
      validationPassed: metadataValidation.passed,
      missingFields: metadataValidation.missingFields,
      extracted: metadataValidation.metadata,
      issue: metadataRun.issue
    },
    references: {
      commandPassed: referenceRun.passed,
      validationPassed: referenceValidation.passed,
      count: referenceValidation.count,
      issue: referenceRun.issue
    }
  });
}

for (const extension of ["sldprt", "sldasm", "slddrw"]) {
  checks.push({
    id: `PROBE-SAMPLE-${extension.toUpperCase()}-001`,
    passed: sampleResults.some((sample) => sample.extension === extension),
    detail: `sample .${extension}`
  });
}

checks.push({
  id: "PROBE-META-001",
  passed: sampleResults.length > 0 && sampleResults.every((sample) => sample.metadata.commandPassed && sample.metadata.validationPassed),
  detail: "all sample files return required metadata fields"
});
checks.push({
  id: "PROBE-REF-001",
  passed: sampleResults.some((sample) => ["sldasm", "slddrw"].includes(sample.extension) && sample.references.commandPassed && sample.references.validationPassed),
  detail: "at least one assembly or drawing sample returns native references"
});

const failedChecks = checks.filter((check) => !check.passed);
const result = {
  probeId,
  checkedAt: new Date().toISOString(),
  ready: failedChecks.length === 0,
  reportPath: reportPath ? relative(reportPath) : "",
  outputDir: relative(outputDir),
  commands: {
    metadataCommand,
    metadataArgs,
    referenceCommand,
    referenceArgs
  },
  sampleFilesPath: relative(sampleFilesPath),
  passed: checks.length - failedChecks.length,
  failed: failedChecks.length,
  checks,
  sampleResults
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "probe.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));

if (!result.ready) process.exitCode = 1;
