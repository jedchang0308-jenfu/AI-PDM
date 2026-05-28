#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PDM_QC_NATIVE_EXTRACTOR_PORT ?? 3011);
const baseUrl = `http://127.0.0.1:${port}`;
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const mockExtractor = path.join(root, "scripts", "mock-native-cad-extractor.mjs");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function isPortOpen(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "engineer@example.com", password: demoPassword })
  });
  if (!response.ok) throw new Error(`login failed: HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function runDetect(cookie) {
  const form = new FormData();
  form.append("files", new File([Buffer.from("mock native cad bytes without embedded markers")], "QC-EXT-CONTRACT.sldasm"));
  const response = await fetch(`${baseUrl}/api/file-metadata/detect`, {
    method: "POST",
    headers: { cookie },
    body: form
  });
  return { response, body: await response.json().catch(() => ({})) };
}

const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    PDM_RELEASE_MODE: "local_stub",
    PDM_METADATA_EXTRACTOR_CMD: process.execPath,
    PDM_METADATA_EXTRACTOR_ARGS: JSON.stringify([mockExtractor, "--kind", "metadata", "--file", "{file}"]),
    PDM_CAD_REFERENCE_EXTRACTOR_CMD: process.execPath,
    PDM_CAD_REFERENCE_EXTRACTOR_ARGS: JSON.stringify([mockExtractor, "--kind", "references", "--file", "{file}"])
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  const ready = await waitForServer();
  record("NATIVE-CONTRACT-001 server starts with external extractor env", ready, ready ? baseUrl : serverOutput);
  if (!ready) throw new Error("server did not start");

  const cookie = await login();
  record("NATIVE-CONTRACT-002 engineer login succeeds", Boolean(cookie));

  const { response, body } = await runDetect(cookie);
  record("NATIVE-CONTRACT-003 detect route returns 200", response.status === 200, `HTTP ${response.status}`);
  record("NATIVE-CONTRACT-004 external metadata command wins", body.metadata?.drawing_number === "QC-EXT-001", body.metadata?.drawing_number ?? "");
  record("NATIVE-CONTRACT-005 external metadata source is recorded", body.nativeMetadataFiles?.some((source) => String(source).includes("native-adapter")) ?? false);
  record("NATIVE-CONTRACT-006 external reference command returns reference", body.cadReferences?.length === 1, JSON.stringify(body.cadReferences ?? []));
  record("NATIVE-CONTRACT-007 external reference keeps quantity", body.cadReferences?.[0]?.quantity === 3, String(body.cadReferences?.[0]?.quantity ?? ""));
  record(
    "NATIVE-CONTRACT-008 external command avoids fallback warning",
    !(body.warnings ?? []).some((warning) => String(warning).includes("native file references are not extracted")),
    JSON.stringify(body.warnings ?? [])
  );
} catch (error) {
  record("NATIVE-CONTRACT-999 unexpected exception", false, error instanceof Error ? error.message : String(error));
} finally {
  server.kill();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
