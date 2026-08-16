#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const sampleDir = path.join(root, ".tmp", "qc-fixtures", "document-manager-probe-redaction");
const outputDir = path.join(root, ".tmp", "document-manager-probes", "qc-redaction");
const mockExtractor = path.join(root, "scripts", "mock-native-cad-extractor.mjs");
const probeScript = path.join(root, "scripts", "probe-document-manager-extractor.mjs");
const secrets = ["DM-LICENSE-SECRET-123", "REF-TOKEN-SECRET-456", "INLINE-PASSWORD-SECRET-789"];
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function cleanupProbePaths() {
  fs.rmSync(sampleDir, { recursive: true, force: true });
  fs.rmSync(outputDir, { recursive: true, force: true });
}

process.once("exit", cleanupProbePaths);

fs.mkdirSync(sampleDir, { recursive: true });
for (const filename of ["QC-REDACT-PART.sldprt", "QC-REDACT-ASM.sldasm", "QC-REDACT-DRAWING.slddrw"]) {
  fs.writeFileSync(path.join(sampleDir, filename), `mock native CAD sample: ${filename}\n`, "utf8");
}

const probe = spawnSync(process.execPath, [
  probeScript,
  "--sample-files-path",
  sampleDir,
  "--metadata-command",
  process.execPath,
  "--metadata-args",
  JSON.stringify([
    mockExtractor,
    "--kind",
    "metadata",
    "--license-key",
    secrets[0],
    `--password=${secrets[2]}`,
    "--file",
    "{file}"
  ]),
  "--reference-command",
  process.execPath,
  "--reference-args",
  JSON.stringify([
    mockExtractor,
    "--kind",
    "references",
    `--token=${secrets[1]}`,
    "--file",
    "{file}"
  ]),
  "--output",
  outputDir
], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

record("DM-REDACT-001 probe command exits 0", probe.status === 0, probe.stderr || probe.stdout);

const outputPath = path.join(outputDir, "probe.json");
record("DM-REDACT-002 probe.json is written", fs.existsSync(outputPath), outputPath);

const rawOutput = fs.existsSync(outputPath)
  ? readProjectFile(root, path.relative(root, outputPath).replaceAll(path.sep, "/"))
  : "";
const output = rawOutput ? JSON.parse(rawOutput) : {};

for (const secret of secrets) {
  record(`DM-REDACT-003 secret value is absent: ${secret}`, !rawOutput.includes(secret), secret);
}

record("DM-REDACT-004 redaction marker is present", rawOutput.includes("<redacted>"));
record("DM-REDACT-005 metadata command still validates samples", output.ready === true, JSON.stringify(output.checks ?? []));
record("DM-REDACT-006 metadata args remain machine-readable JSON", Array.isArray(JSON.parse(output.commands?.metadataArgs ?? "[]")));
record("DM-REDACT-007 file placeholder is not redacted", (output.commands?.metadataArgs ?? "").includes("{file}") && (output.commands?.referenceArgs ?? "").includes("{file}"));

const failed = results.filter((result) => !result.passed);
cleanupProbePaths();
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
