#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sampleDir = path.join(root, "data", "qc-fixtures", "document-manager-extractor-probe");
const outputDir = path.join(root, "data", "document-manager-probes", "qc-contract");
const mockExtractor = path.join(root, "scripts", "mock-native-cad-extractor.mjs");
const probeScript = path.join(root, "scripts", "probe-document-manager-extractor.mjs");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

fs.mkdirSync(sampleDir, { recursive: true });
for (const filename of ["QC-PROBE-PART.sldprt", "QC-PROBE-ASM.sldasm", "QC-PROBE-DRAWING.slddrw"]) {
  fs.writeFileSync(path.join(sampleDir, filename), `mock native CAD sample: ${filename}\n`, "utf8");
}

const probe = spawnSync(process.execPath, [
  probeScript,
  "--sample-files-path",
  sampleDir,
  "--metadata-command",
  process.execPath,
  "--metadata-args",
  JSON.stringify([mockExtractor, "--kind", "metadata", "--file", "{file}"]),
  "--reference-command",
  process.execPath,
  "--reference-args",
  JSON.stringify([mockExtractor, "--kind", "references", "--file", "{file}"]),
  "--output",
  outputDir
], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

record("DMPROBE-001 probe command exits 0", probe.status === 0, probe.stderr || probe.stdout);

const outputPath = path.join(outputDir, "probe.json");
record("DMPROBE-002 probe.json is written", fs.existsSync(outputPath), outputPath);

const output = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : {};
record("DMPROBE-003 probe ready is true", output.ready === true, JSON.stringify(output.checks ?? []));
record("DMPROBE-004 all three native sample extensions are covered", ["sldprt", "sldasm", "slddrw"].every((extension) =>
  (output.sampleResults ?? []).some((sample) => sample.extension === extension)
));
record("DMPROBE-005 metadata validation passes for all samples", (output.sampleResults ?? []).every((sample) => sample.metadata?.validationPassed));
record("DMPROBE-006 reference validation passes for at least one assembly or drawing", (output.sampleResults ?? []).some((sample) =>
  ["sldasm", "slddrw"].includes(sample.extension) && sample.references?.validationPassed
));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
