import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, "scripts/run-drawing-recognition-worker.mjs"), "utf8");
const launcher = fs.readFileSync(path.join(root, "scripts/start-localhost-3000.ps1"), "utf8");
const checks = [
  ["no global key assignment", !worker.includes("process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY = key")],
  ["child env injection", worker.includes("env: { ...process.env, ...envOverrides }")],
  ["probe claim", worker.includes("/api/settings-secret-probe-jobs/claim")],
  ["probe completion", worker.includes("/api/settings-secret-probe-jobs/") && worker.includes("/complete")],
  ["capability heartbeat", worker.includes("/api/recognition-workers/heartbeat")],
  ["worker id flag is honored", worker.includes("--worker-id") && worker.includes("workerIdFromArgs")],
  ["no-key native source terminates safely without starving mixed sessions", worker.includes('buildUnsupportedAdapterResult(source.id, "native-metadata-bridge.v1", "native_metadata_not_configured")') && worker.includes('buildUnsupportedAdapterResult(source.id, "native-metadata-bridge.v1", "native_metadata_license_missing")')],
  ["metadata command independent of key", launcher.includes("Test-DocumentManagerInteropConfigured") && launcher.includes("PDM_DRAWING_RECOGNITION_METADATA_CMD")],
  ["worker discovers native commands without launcher restart", worker.includes("discoverNativeReaderCommands") && worker.includes("run-solidworks-document-manager-metadata-extractor.mjs") && worker.includes("run-solidworks-document-manager-credential-probe.mjs")],
  ["metadata child enables TypeScript transform", worker.includes('JSON.stringify(["--experimental-transform-types", metadataScript])') && launcher.includes("'[\"--experimental-transform-types\",\"scripts/run-solidworks-document-manager-metadata-extractor.mjs\"]'")],
  ["probe command configured", launcher.includes("PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD")],
  ["worker capability route", fs.existsSync(path.join(root, "src/app/api/recognition-workers/heartbeat/route.ts"))]
];
const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({ script: "qc-dev-035-worker-hot-apply", passed: failed.length === 0, checks: checks.map(([name, ok]) => ({ name, ok })), failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
