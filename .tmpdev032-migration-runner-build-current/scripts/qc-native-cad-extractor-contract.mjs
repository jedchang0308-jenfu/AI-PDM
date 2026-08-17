#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PDM_QC_NATIVE_EXTRACTOR_PORT ?? 3011);
const fallbackPort = port + 1;
const baseUrl = `http://127.0.0.1:${port}`;
const fallbackBaseUrl = `http://127.0.0.1:${fallbackPort}`;
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

async function waitForServer(portNumber, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(portNumber)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function login(url) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "engineer@example.com", password: demoPassword })
  });
  if (!response.ok) throw new Error(`login failed: HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function runDetect(url, cookie, filename = "QC-EXT-CONTRACT.sldasm") {
  const form = new FormData();
  form.append("files", new File([Buffer.from("mock native cad bytes without embedded markers")], filename));
  const response = await fetch(`${url}/api/file-metadata/detect`, {
    method: "POST",
    headers: { cookie },
    body: form
  });
  return { response, body: await response.json().catch(() => ({})) };
}

function startServer(portNumber, envOverrides) {
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(portNumber)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_RELEASE_MODE: "local_stub",
      ...envOverrides
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { server, getOutput: () => output };
}

const contractServer = startServer(port, {
    ...process.env,
    PDM_RELEASE_MODE: "local_stub",
    PDM_METADATA_EXTRACTOR_CMD: process.execPath,
    PDM_METADATA_EXTRACTOR_ARGS: JSON.stringify([mockExtractor, "--kind", "metadata", "--file", "{file}"]),
    PDM_CAD_REFERENCE_EXTRACTOR_CMD: process.execPath,
    PDM_CAD_REFERENCE_EXTRACTOR_ARGS: JSON.stringify([mockExtractor, "--kind", "references", "--file", "{file}"])
});

try {
  const ready = await waitForServer(port);
  record("NATIVE-CONTRACT-001 server starts with external extractor env", ready, ready ? baseUrl : contractServer.getOutput());
  if (!ready) throw new Error("server did not start");

  const cookie = await login(baseUrl);
  record("NATIVE-CONTRACT-002 engineer login succeeds", Boolean(cookie));

  const { response, body } = await runDetect(baseUrl, cookie);
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
  contractServer.server.kill();
}

const fallbackServer = startServer(fallbackPort, {
  PDM_METADATA_EXTRACTOR_CMD: "",
  PDM_METADATA_EXTRACTOR_ARGS: "",
  PDM_CAD_REFERENCE_EXTRACTOR_CMD: "",
  PDM_CAD_REFERENCE_EXTRACTOR_ARGS: ""
});

try {
  const ready = await waitForServer(fallbackPort);
  record("NATIVE-FALLBACK-001 server starts without external extractor env", ready, ready ? fallbackBaseUrl : fallbackServer.getOutput());
  if (!ready) throw new Error("fallback server did not start");

  const cookie = await login(fallbackBaseUrl);
  record("NATIVE-FALLBACK-002 engineer login succeeds", Boolean(cookie));

  const { response, body } = await runDetect(fallbackBaseUrl, cookie, "QC-FALLBACK.sldasm");
  record("NATIVE-FALLBACK-003 detect route returns 200 without extractor", response.status === 200, `HTTP ${response.status}`);
  record(
    "NATIVE-FALLBACK-004 warning explains native extractor requirement",
    (body.warnings ?? []).some((warning) => /Document Manager|Native SolidWorks|Native CAD/i.test(String(warning))),
    JSON.stringify(body.warnings ?? [])
  );
  record("NATIVE-FALLBACK-005 native metadata sources stay empty", Array.isArray(body.nativeMetadataFiles) && body.nativeMetadataFiles.length === 0, JSON.stringify(body.nativeMetadataFiles ?? []));
  record("NATIVE-FALLBACK-006 CAD references stay empty", Array.isArray(body.cadReferences) && body.cadReferences.length === 0, JSON.stringify(body.cadReferences ?? []));
} catch (error) {
  record("NATIVE-FALLBACK-999 unexpected exception", false, error instanceof Error ? error.message : String(error));
} finally {
  fallbackServer.server.kill();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
