#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mapNativePropertiesToAdapterResult } from "../src/lib/solidworks-metadata-mapping.ts";

const root = process.cwd();
const sourceCodePath = path.join(root, "scripts", "solidworks-document-manager-metadata-exporter.cs");
const buildDir = path.join(root, ".tmp", "solidworks-document-manager-metadata");
const exporterExePath = path.join(buildDir, "SolidWorksDocumentManagerMetadataExporter.exe");
const interopDir = process.env.PDM_SOLIDWORKS_INTEROP_DIR || "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist";
const interopDll = path.join(interopDir, "SolidWorks.Interop.swdocumentmgr.dll");
const constDll = path.join(interopDir, "SolidWorks.Interop.swconst.dll");

if (process.argv.includes("--compile-only")) {
  await ensureBuilt();
  process.stdout.write(JSON.stringify({ compiled: true, exporterExePath }));
  process.exit(0);
}

const input = await readStdinJson();
const sourcePath = String(input.sourcePath ?? "").trim();
if (!sourcePath) process.exitCode = emitFailure("native_metadata_source_missing");
else {
  try {
    await ensureBuilt();
    const result = await spawnFile(exporterExePath, [sourcePath], {
      env: { ...process.env },
      timeoutMs: Math.max(1_000, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_ADAPTER_TIMEOUT_MS ?? 30_000), 120_000))
    });
    const payload = JSON.parse(result.stdout.trim() || "{}");
    if (result.status !== 0 || payload.status === "failed") {
      process.exitCode = emitFailure(mapDiagnostic(payload.diagnostics?.[0]));
    } else {
      const mapped = mapNativePropertiesToAdapterResult({
        sourceId: String(input.sourceId ?? ""), companyId: input.companyId ?? null, companyCode: input.companyCode ?? null,
        fileName: String(input.fileName ?? path.basename(sourcePath)), fileExt: String(input.fileExt ?? path.extname(sourcePath)),
        targetContext: input.targetContext ?? { drawingId: null, drawingRevisionId: null, parts: [] }, properties: Array.isArray(payload.properties) ? payload.properties : [], diagnostics: payload.diagnostics ?? []
      });
      process.stdout.write(JSON.stringify({ schemaVersion: "drawing-recognition-extractor.v1", status: mapped.status, adapterVersion: mapped.adapterVersion, observations: mapped.observations ?? [], diagnostics: mapped.diagnostics ?? [] }));
    }
  } catch (error) {
    process.exitCode = emitFailure(mapDiagnostic(error?.message));
  }
}

async function ensureBuilt() {
  if (!fs.existsSync(sourceCodePath)) throw new Error("native_metadata_source_missing");
  if (!fs.existsSync(interopDll) || !fs.existsSync(constDll)) throw new Error("native_metadata_api_unavailable");
  await fs.promises.mkdir(buildDir, { recursive: true });
  const buildInterop = path.join(buildDir, "SolidWorks.Interop.swdocumentmgr.dll");
  const buildConst = path.join(buildDir, "SolidWorks.Interop.swconst.dll");
  await fs.promises.copyFile(interopDll, buildInterop);
  await fs.promises.copyFile(constDll, buildConst);
  const shouldCompile = !fs.existsSync(exporterExePath) || fs.statSync(exporterExePath).mtimeMs < fs.statSync(sourceCodePath).mtimeMs;
  if (!shouldCompile) return;
  const csc = [process.env.PDM_CSC_PATH, "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe", "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"].filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!csc) throw new Error("native_metadata_api_unavailable");
  const result = await spawnFile(csc, ["/nologo", "/platform:x64", `/out:${exporterExePath}`, `/reference:${buildInterop}`, `/reference:${buildConst}`, sourceCodePath]);
  if (result.status !== 0) throw new Error("native_metadata_compile_failed");
}

async function readStdinJson() { let text = ""; for await (const chunk of process.stdin) text += chunk; return JSON.parse(text || "{}"); }
async function spawnFile(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs ?? 30_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString().slice(0, 4_000_000); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(0, 8_000); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ status: 1, stdout, stderr: error.message }); });
    child.on("close", (status) => { clearTimeout(timer); resolve({ status: timedOut ? 124 : status, stdout, stderr }); });
  });
}
function mapDiagnostic(value) { const text = String(value ?? "").toLowerCase(); if (text.includes("license")) return "native_metadata_license_missing"; if (text.includes("source")) return "native_metadata_source_content_unavailable"; return "native_metadata_failed"; }
function emitFailure(code) { process.stdout.write(JSON.stringify({ schemaVersion: "drawing-recognition-extractor.v1", status: "failed", adapterVersion: "solidworks-document-manager.v1", observations: [], diagnostics: [code] })); return 1; }
