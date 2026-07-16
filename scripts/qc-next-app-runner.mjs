import { spawn } from "node:child_process";
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

  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, mode, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: appendNodeOptions(process.env.NODE_OPTIONS, `--require ${qcListenerBudgetPreload}`),
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

export async function waitForNextAppReady(baseUrl, getOutput) {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
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
