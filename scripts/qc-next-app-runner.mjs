import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { appendNodeOptions, qcListenerBudgetPreload } from "./qc-process-warning-guard.mjs";

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate a local port"));
        else resolve(port);
      });
    });
  });
}

export function startNextApp(root, mode, port) {
  if (mode !== "dev" && mode !== "start") {
    throw new Error(`Unsupported Next.js app mode: ${mode}`);
  }

  const standaloneServer = path.join(root, ".next", "standalone", "server.js");
  const useStandalone = mode === "start" && fs.existsSync(standaloneServer);
  if (useStandalone) prepareStandaloneAssets(root);
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const commandArgs = useStandalone ? [standaloneServer] : [nextCli, mode, "--hostname", "127.0.0.1", "--port", String(port)];
  const listenerBudgetPreload = path.resolve(root, qcListenerBudgetPreload).replaceAll("\\", "/");
  const child = spawn(process.execPath, commandArgs, {
    cwd: useStandalone ? path.dirname(standaloneServer) : root,
    env: {
      ...process.env,
      ...(useStandalone ? { HOSTNAME: "127.0.0.1", PORT: String(port) } : {}),
      NODE_OPTIONS: appendNodeOptions(process.env.NODE_OPTIONS, `--require="${listenerBudgetPreload}"`),
      PDM_RELEASE_MODE: "local_stub"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  return { child, getOutput: () => output };
}

function prepareStandaloneAssets(root) {
  const standaloneDir = path.join(root, ".next", "standalone");
  const staticSource = path.join(root, ".next", "static");
  const staticTarget = path.join(standaloneDir, ".next", "static");
  if (fs.existsSync(staticSource)) fs.cpSync(staticSource, staticTarget, { recursive: true, force: true });

  const publicSource = path.join(root, "public");
  const publicTarget = path.join(standaloneDir, "public");
  if (fs.existsSync(publicSource)) fs.cpSync(publicSource, publicTarget, { recursive: true, force: true });
}

export async function waitForNextAppReady(baseUrl, getOutput, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: controller.signal });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(requestTimeout);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${getOutput()}`);
}

export async function stopNextApp(child) {
  if (child.exitCode !== null) return;

  const waitForExit = () => {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => child.once("exit", resolve));
  };

  child.kill("SIGINT");
  await Promise.race([waitForExit(), delay(3000)]);
  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  await Promise.race([waitForExit(), delay(3000)]);
  if (child.exitCode !== null) return;

  child.kill("SIGKILL");
  await Promise.race([waitForExit(), delay(1000)]);
}

export function removeTaskOwnedWorkspaceTempDir(root, targetDir) {
  const workspaceTempRoot = path.resolve(root, ".tmp");
  const resolvedTarget = path.resolve(root, targetDir);
  if (!resolvedTarget.startsWith(`${workspaceTempRoot}${path.sep}`)) {
    return { removed: false, path: resolvedTarget, error: "unsafe-path" };
  }
  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    return { removed: !fs.existsSync(resolvedTarget), path: resolvedTarget, error: null };
  } catch (error) {
    return {
      removed: false,
      path: resolvedTarget,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
