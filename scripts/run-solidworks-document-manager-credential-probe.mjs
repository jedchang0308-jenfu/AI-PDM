#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const sourceCodePath = path.join(root, "scripts", "solidworks-document-manager-credential-probe.cs");
const buildDir = path.join(root, ".tmp", "solidworks-document-manager-credential-probe");
const exporterExePath = path.join(buildDir, "SolidWorksDocumentManagerCredentialProbe.exe");
const interopDir = process.env.PDM_SOLIDWORKS_INTEROP_DIR || "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist";
const interopDll = path.join(interopDir, "SolidWorks.Interop.swdocumentmgr.dll");
const constDll = path.join(interopDir, "SolidWorks.Interop.swconst.dll");

if (process.argv.includes("--compile-only")) {
  await ensureBuilt();
  process.stdout.write(JSON.stringify({ compiled: true, exporterExePath }));
  process.exit(0);
}
try {
  const input = await readStdinJson();
  await ensureBuilt();
  const result = await spawnFile(exporterExePath, [], { env: { ...process.env } });
  process.stdout.write(result.stdout.trim() || JSON.stringify({ schemaVersion: "drawing-recognition-extractor.v1", status: "failed", adapterVersion: "solidworks-document-manager-reader.v1", diagnostics: ["native_metadata_credential_probe_failed"] }));
  process.exitCode = result.status === 0 ? 0 : 1;
} catch (error) {
  process.stdout.write(JSON.stringify({ schemaVersion: "drawing-recognition-extractor.v1", status: "failed", adapterVersion: "solidworks-document-manager-reader.v1", diagnostics: [String(error?.message ?? "native_metadata_credential_probe_failed").slice(0, 120)] }));
  process.exitCode = 1;
}

async function ensureBuilt() {
  if (!fs.existsSync(sourceCodePath) || !fs.existsSync(interopDll) || !fs.existsSync(constDll)) throw new Error("native_metadata_api_unavailable");
  await fs.promises.mkdir(buildDir, { recursive: true });
  const buildInterop = path.join(buildDir, "SolidWorks.Interop.swdocumentmgr.dll");
  const buildConst = path.join(buildDir, "SolidWorks.Interop.swconst.dll");
  await fs.promises.copyFile(interopDll, buildInterop);
  await fs.promises.copyFile(constDll, buildConst);
  if (fs.existsSync(exporterExePath) && fs.statSync(exporterExePath).mtimeMs >= fs.statSync(sourceCodePath).mtimeMs) return;
  const csc = [process.env.PDM_CSC_PATH, "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe", "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"].filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!csc) throw new Error("native_metadata_api_unavailable");
  const result = await spawnFile(csc, ["/nologo", "/platform:x64", `/out:${exporterExePath}`, `/reference:${buildInterop}`, `/reference:${buildConst}`, sourceCodePath]);
  if (result.status !== 0) throw new Error("native_metadata_compile_failed");
}
async function readStdinJson() { let text = ""; for await (const chunk of process.stdin) text += chunk; return JSON.parse(text || "{}"); }
async function spawnFile(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString().slice(0, 100000); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(0, 4000); });
    child.on("error", (error) => resolve({ status: 1, stdout, stderr: error.message }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
