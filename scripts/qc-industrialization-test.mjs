import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const steps = [];

function record(name, passed, detail = "") {
  steps.push({ name, passed, detail });
}

function quoteWindowsShellArg(value) {
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn([command, ...args].map(quoteWindowsShellArg).join(" "), {
          cwd: root,
          env: { ...process.env, ...options.env },
          shell: true,
          stdio: ["ignore", "pipe", "pipe"]
        })
      : spawn(command, args, {
          cwd: root,
          env: { ...process.env, ...options.env },
          stdio: ["ignore", "pipe", "pipe"]
        });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (!options.quiet) process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

function getFreePort() {
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

async function runNpmStep(name, script, options = {}) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`\n[qc:industrialization] ${name}`);
  const result = await run(npm, ["run", script], options);
  const passed = result.code === 0;
  record(name, passed, passed ? "exit 0" : `exit ${result.code}`);
  if (!passed) throw new Error(`${name} failed with exit ${result.code}`);
}

function startProductionApp(port) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, PDM_RELEASE_MODE: "local_stub" },
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

async function waitForApp(baseUrl, getOutput) {
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

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
}

let app;

try {
  await runNpmStep("source boundary", "qc:source-boundary");
  await runNpmStep("data boundary", "qc:data-boundary");
  await runNpmStep("asset manifest", "assets:verify");
  await runNpmStep("AI/API cost gates", "qc:openai-provider");
  await runNpmStep("DB provider contract", "qc:db-provider-contract");
  await runNpmStep("DB repository split", "qc:db-repository-split");
  await runNpmStep("Postgres shadow", "qc:postgres-shadow");
  await runNpmStep("Dashboard component split", "qc:dashboard-component-split");
  await runNpmStep("CSS boundary", "qc:css-boundary");
  await runNpmStep("Document paths", "qc:doc-paths");
  await runNpmStep("Document Manager probe redaction", "qc:document-manager-probe-redaction");
  await runNpmStep("lint", "lint");
  await runNpmStep("build", "build");
  await runNpmStep("API regression", "qc:api");

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n[qc:industrialization] starting production app at ${baseUrl}`);
  app = startProductionApp(port);
  await waitForApp(baseUrl, app.getOutput);
  record("start production server", true, baseUrl);
  await runNpmStep("UI E2E", "qc:ui", { env: { PDM_BASE_URL: baseUrl } });
  await runNpmStep("file hash integrity", "qc:file-hashes");

  console.log(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 0, steps }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 1, steps, error: message }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await stopApp(app.child);
}
