import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const baseDir = path.resolve(import.meta.dirname, "..");
const product = JSON.parse(fs.readFileSync(path.join(baseDir, "product.json"), "utf8"));
const helperPath = path.join(baseDir, "tools", "AipdmCredentialHelper.exe");
const protocolVersion = 1;
const backoffMs = [2_000, 5_000, 15_000, 30_000];
let stopping = false;
let mutexProcess = null;

function log(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSingleton() {
  return await new Promise((resolve, reject) => {
    const child = spawn(helperPath, ["mutex"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("SINGLETON_LOCK_TIMEOUT"));
    }, 5_000);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes("LOCKED")) {
        clearTimeout(timer);
        mutexProcess = child;
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(0, 1_000); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!mutexProcess) reject(new Error(code === 75 ? "SERVICE_ALREADY_RUNNING" : `SINGLETON_LOCK_FAILED:${code}:${stderr}`));
    });
    child.once("error", reject);
  });
}

async function readCredentials() {
  return await new Promise((resolve, reject) => {
    const child = spawn(helperPath, ["read"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString().slice(0, 16_384); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(0, 1_000); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 66) return resolve(null);
      if (code !== 0) return reject(new Error(`CREDENTIAL_READ_FAILED:${code}:${stderr}`));
      try {
        const value = JSON.parse(stdout);
        if (value.baseUrl !== product.baseUrl || value.protocolVersion !== protocolVersion ||
            !/^[0-9a-f-]{36}$/u.test(value.deviceId) ||
            !/^[A-Za-z0-9_-]{43}$/u.test(value.token)) {
          throw new Error("CREDENTIAL_CONTRACT_INVALID");
        }
        resolve(value);
      } catch (error) { reject(error); }
    });
  });
}

async function requestJson(credentials, endpoint, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${credentials.baseUrl}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${credentials.token}`,
        ...(init.workerId ? { "x-pdm-worker-id": init.workerId } : {}),
        ...(init.body ? { "content-type": "application/json" } : {})
      }
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } finally { clearTimeout(timeout); }
}

async function startInstance(credentials) {
  const own = await requestJson(credentials, "/api/windows-service/self");
  if (own.response.status === 426) throw new Error("WORKER_PROTOCOL_UNSUPPORTED");
  if (!own.response.ok) throw new Error(`SELF_FAILED:${own.response.status}`);
  const instanceId = randomUUID();
  const started = await requestJson(credentials, "/api/windows-service/start", {
    method: "POST",
    body: JSON.stringify({
      instanceId,
      expectedRowVersion: own.body.rowVersion,
      serviceVersion: product.version,
      protocolVersion
    })
  });
  if (!started.response.ok) throw new Error(`START_FAILED:${started.response.status}`);
  return { instanceId, workerId: `${credentials.deviceId}:${instanceId}` };
}

async function heartbeatLoop(credentials, instance) {
  while (!stopping) {
    const result = await requestJson(credentials, "/api/windows-service/heartbeat", {
      method: "POST",
      workerId: instance.workerId,
      body: JSON.stringify({ instanceId: instance.instanceId })
    });
    if (result.response.status === 401 || result.response.status === 403 || result.response.status === 426) {
      throw new Error(`DEVICE_AUTH_REJECTED:${result.response.status}`);
    }
    if (!result.response.ok) throw new Error(`HEARTBEAT_FAILED:${result.response.status}`);
    await delay(10_000);
  }
}

async function main() {
  await acquireSingleton();
  log("service_started", { version: product.version, protocolVersion });
  let retry = 0;
  while (!stopping) {
    let credentials = null;
    try {
      credentials = await readCredentials();
      if (!credentials) {
        log("waiting_for_registration");
        await delay(5_000);
        continue;
      }
      const instance = await startInstance(credentials);
      log("instance_started", { deviceId: credentials.deviceId, instanceId: instance.instanceId });
      retry = 0;
      await heartbeatLoop(credentials, instance);
    } catch (error) {
      credentials = null;
      const message = error instanceof Error ? error.message : String(error);
      log("service_retry", { reason: message.replace(/Bearer\s+\S+/giu, "Bearer [redacted]") });
      await delay(backoffMs[Math.min(retry, backoffMs.length - 1)]);
      retry += 1;
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(signal, () => {
    stopping = true;
    if (mutexProcess?.stdin.writable) mutexProcess.stdin.end();
  });
}

main().catch((error) => {
  log("service_fatal", { reason: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
