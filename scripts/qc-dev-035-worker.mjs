import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, "scripts/run-drawing-recognition-worker.mjs"), "utf8");
const exporter = fs.readFileSync(path.join(root, "scripts/solidworks-document-manager-metadata-exporter.cs"), "utf8");
const repository = fs.readFileSync(path.join(root, "src/lib/repositories/drawing-recognition-async-repository.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "src/app/api/recognition-jobs/[sessionId]/sources/[sourceId]/content/route.ts"), "utf8");
const required = ["requestSourceContent", "stageSourceContent", "sourcePathOverride", "setInterval", "terminateProcessTree", "fs.rm(staged.directory", "contentHash"];
const missing = required.filter((needle) => !worker.includes(needle));
if (!exporter.includes("Console.OutputEncoding = new UTF8Encoding(false)")) missing.push("metadata-exporter-utf8-output");
if (!repository.includes("numbering_draft_parts") || !repository.includes("number_candidate_reservations")) missing.push("draft-part-owner-context");
if (!worker.includes("isSolidWorksNativeSource(source)") || !repository.includes("const adapterPlan =")) missing.push("native-adapter-file-type-boundary");
if (!route.includes("readClaimedDrawingRecognitionSource") || !route.includes("x-pdm-recognition-worker-id")) missing.push("source-content-route-lock");
const compile = await runCompileProbe();
if (compile.status !== 0 && compile.status !== null) missing.push(`metadata-exporter-compile:${compile.stderr || compile.stdout}`.slice(0, 300));
console.log(JSON.stringify({ script: "qc-dev-035-worker", passed: missing.length === 0, missing, compile: compile.status === null ? "skipped_non_windows_or_missing_interop" : compile.status === 0 ? "passed" : "failed" }, null, 2));
if (missing.length > 0) process.exitCode = 1;

function runCompileProbe() {
  if (process.platform !== "win32") return Promise.resolve({ status: null, stdout: "", stderr: "" });
  const interop = "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist\\SolidWorks.Interop.swdocumentmgr.dll";
  if (!fs.existsSync(interop)) return Promise.resolve({ status: null, stdout: "", stderr: "" });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--experimental-transform-types", "scripts/run-solidworks-document-manager-metadata-extractor.mjs", "--compile-only"], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.on("error", (error) => resolve({ status: 1, stdout, stderr: error.message }));
  });
}
