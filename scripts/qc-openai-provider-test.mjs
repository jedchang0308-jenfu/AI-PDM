import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const root = process.cwd();
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const mockApiKey = "mock-openai-key";
const mockModel = "mock-openai-model";

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

function startMockOpenAi() {
  const state = { requests: [] };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const parsed = bodyText ? JSON.parse(bodyText) : {};
      state.requests.push({
        method: req.method,
        path: url.pathname,
        authorization: req.headers.authorization ?? "",
        contentType: req.headers["content-type"] ?? "",
        body: parsed
      });

      if (req.method === "POST" && url.pathname === "/v1/responses") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ output_text: "Mock OpenAI PDM answer: Pending 1, Released 0. Read-only response." }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Unhandled route ${req.method} ${url.pathname}` }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Mock OpenAI server did not expose an address"));
        return;
      }
      resolve({ server, state, baseUrl: `http://127.0.0.1:${address.port}/v1` });
    });
  });
}

function startApp(port, openAiBaseUrl) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: mockApiKey,
      OPENAI_MODEL: mockModel,
      OPENAI_API_BASE_URL: openAiBaseUrl,
      OPENAI_TIMEOUT_MS: "5000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return { child, getOutput: () => output };
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
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

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@example.com", password: demoPassword })
  });
  if (!response.ok) throw new Error(`Login failed: HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

let mockOpenAi;
let app;
const results = [];

try {
  mockOpenAi = await startMockOpenAi();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port, mockOpenAi.baseUrl);
  await waitForApp(baseUrl, app.getOutput);
  const cookie = await login(baseUrl);

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message: "summary" })
  });
  const body = await response.json().catch(() => ({}));
  const request = mockOpenAi.state.requests[0];
  const userPayload = request?.body?.input?.find((item) => item.role === "user")?.content ?? "";

  results.push(expect("OPENAI-001 chat returns 200", response.status, 200));
  results.push(expect("OPENAI-002 mock OpenAI was called once", mockOpenAi.state.requests.length, 1));
  results.push(expect("OPENAI-003 provider uses Responses API", request?.path, "/v1/responses"));
  results.push(expect("OPENAI-004 provider uses bearer API key", request?.authorization, `Bearer ${mockApiKey}`));
  results.push(expect("OPENAI-005 provider uses configured model", request?.body?.model, mockModel));
  results.push(expect("OPENAI-006 prompt includes read-only instruction", request?.body?.input?.[0]?.content?.includes("read-only"), true));
  results.push(expect("OPENAI-007 prompt includes dashboard metrics", userPayload.includes("metrics"), true));
  results.push(expect("OPENAI-008 answer comes from mock OpenAI", body.answer?.includes("Mock OpenAI PDM answer"), true));
  results.push(expect("OPENAI-009 response keeps sources", Array.isArray(body.sources) && body.sources.length > 0, true));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ passed: results.filter((result) => result.passed).length, failed: 1, results, error: message }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await stopProcess(app.child);
  if (mockOpenAi) {
    await new Promise((resolve) => mockOpenAi.server.close(resolve));
  }
}
