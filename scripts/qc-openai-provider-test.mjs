import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const root = process.cwd();
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const mockApiKey = "mock-openai-key";
const mockModel = "mock-openai-model";
const mockHttpErrorTrigger = "force-openai-http-error";

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

      if (req.method === "POST" && url.pathname === "/v1/responses" && bodyText.includes(mockHttpErrorTrigger)) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Mock OpenAI provider unavailable" } }));
        return;
      }

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

function startApp(port, openAiBaseUrl, usageDir) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      LLM_PROVIDER: " openai ",
      OPENAI_API_KEY: ` ${mockApiKey} `,
      OPENAI_MODEL: ` ${mockModel} `,
      OPENAI_API_BASE_URL: ` ${openAiBaseUrl} `,
      OPENAI_TIMEOUT_MS: "5000",
      OPENAI_CACHE_TTL_MS: "600000",
      OPENAI_RATE_LIMIT_PER_MINUTE: "10",
      OPENAI_MAX_CONTEXT_CHARS: "12000",
      PDM_AI_USAGE_DIR: usageDir,
      PDM_AI_USAGE_LOG: "on"
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

async function postChat(baseUrl, cookie, message) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message })
  });
  return { response, body: await response.json().catch(() => ({})) };
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

function expectTrue(name, actual) {
  return { name, passed: Boolean(actual), actual: Boolean(actual), expected: true };
}

function expectFailure(name, actual, expected) {
  return { name, passed: false, actual, expected };
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasRawUsagePayload(event) {
  return ["prompt", "message", "messages", "input", "output", "answer", "sources", "metrics", "currentSubmission"].some((key) =>
    Object.prototype.hasOwnProperty.call(event, key)
  );
}

const allowedUsageEventKeys = new Set([
  "apiCall",
  "cacheHit",
  "contextChars",
  "createdAt",
  "durationMs",
  "errorReason",
  "estimatedInputTokens",
  "estimatedOutputTokens",
  "model",
  "promptChars",
  "promptHash",
  "provider",
  "toolHit",
  "userId"
]);

function hasOnlyAllowedUsageKeys(event) {
  return Object.keys(event).every((key) => allowedUsageEventKeys.has(key));
}

function hasIsoTimestamp(event) {
  return typeof event.createdAt === "string" && !Number.isNaN(Date.parse(event.createdAt));
}

function hasSha256PromptHash(event) {
  return typeof event.promptHash === "string" && /^[a-f0-9]{64}$/u.test(event.promptHash);
}

function isOptionalString(value) {
  return value === undefined || typeof value === "string";
}

function isOptionalNonNegativeInteger(value) {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function isOptionalPositiveInteger(value) {
  return value === undefined || (Number.isInteger(value) && value > 0);
}

function hasValidUsageMetadataTypes(event) {
  return (
    ["local", "openai"].includes(event.provider) &&
    isOptionalString(event.model) &&
    isOptionalString(event.userId) &&
    typeof event.promptHash === "string" &&
    Number.isInteger(event.promptChars) &&
    event.promptChars >= 0 &&
    isOptionalNonNegativeInteger(event.contextChars) &&
    isOptionalPositiveInteger(event.estimatedInputTokens) &&
    isOptionalPositiveInteger(event.estimatedOutputTokens) &&
    typeof event.cacheHit === "boolean" &&
    typeof event.toolHit === "boolean" &&
    typeof event.apiCall === "boolean" &&
    Number.isInteger(event.durationMs) &&
    event.durationMs >= 0 &&
    isOptionalString(event.errorReason)
  );
}

async function readUsageEvents(usageDir) {
  const usagePath = path.join(usageDir, "llm-usage.jsonl");
  if (!fs.existsSync(usagePath)) return [];
  return (await readFile(usagePath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function cleanupUsageDir(usageDir) {
  fs.rmSync(usageDir, { recursive: true, force: true });
  return !fs.existsSync(usageDir);
}

let mockOpenAi;
let app;
let usageDir;
let configuredOpenAiBaseUrl = "";
let fatalError = "";
let usageDirUnderTemp = false;
const results = [];

try {
  mockOpenAi = await startMockOpenAi();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  usageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-openai-usage-"));
  usageDirUnderTemp = isPathInside(os.tmpdir(), usageDir);
  configuredOpenAiBaseUrl = `${mockOpenAi.baseUrl}//`;
  app = startApp(port, configuredOpenAiBaseUrl, usageDir);
  await waitForApp(baseUrl, app.getOutput);
  const cookie = await login(baseUrl);

  const localChat = await postChat(baseUrl, cookie, "summary");
  results.push(expect("OPENAI-001 local-first chat returns 200", localChat.response.status, 200));
  results.push(expect("OPENAI-002 local summary makes zero OpenAI calls", mockOpenAi.state.requests.length, 0));
  results.push(expectTrue("OPENAI-003 local summary keeps sources", Array.isArray(localChat.body.sources) && localChat.body.sources.length > 0));

  const openAiQuestion = "Provide one management observation from the current PDM context";
  const openAiChat = await postChat(baseUrl, cookie, openAiQuestion);
  const request = mockOpenAi.state.requests[0];
  const userPayload = request?.body?.input?.find((item) => item.role === "user")?.content ?? "";
  results.push(expect("OPENAI-004 fallback chat returns 200", openAiChat.response.status, 200));
  results.push(expect("OPENAI-005 fallback calls mock OpenAI once", mockOpenAi.state.requests.length, 1));
  results.push(expect("OPENAI-006 provider uses Responses API", request?.path, "/v1/responses"));
  results.push(expectTrue("OPENAI-027 provider normalizes trailing base URL slashes", configuredOpenAiBaseUrl.endsWith("//") && request?.path === "/v1/responses"));
  results.push(expect("OPENAI-007 provider uses bearer API key", request?.authorization, `Bearer ${mockApiKey}`));
  results.push(expect("OPENAI-008 provider uses configured model", request?.body?.model, mockModel));
  results.push(expectTrue("OPENAI-028 provider trims string env configuration", request?.authorization === `Bearer ${mockApiKey}` && request?.body?.model === mockModel));
  results.push(expect("OPENAI-009 prompt includes read-only instruction", request?.body?.input?.[0]?.content?.includes("read-only"), true));
  results.push(expect("OPENAI-010 prompt includes dashboard metrics", userPayload.includes("metrics"), true));
  results.push(expect("OPENAI-011 answer comes from mock OpenAI", openAiChat.body.answer?.includes("Mock OpenAI PDM answer"), true));

  const cachedChat = await postChat(baseUrl, cookie, openAiQuestion);
  results.push(expect("OPENAI-012 cached fallback returns 200", cachedChat.response.status, 200));
  results.push(expect("OPENAI-013 repeated fallback uses cache", mockOpenAi.state.requests.length, 1));

  const openAiErrorQuestion = `${mockHttpErrorTrigger}: verify metadata-only handling`;
  const openAiErrorChat = await postChat(baseUrl, cookie, openAiErrorQuestion);
  results.push(expect("OPENAI-029 upstream HTTP error returns chat response", openAiErrorChat.response.status, 200));
  results.push(expect("OPENAI-030 upstream HTTP error makes a second OpenAI call", mockOpenAi.state.requests.length, 2));

  const usageEvents = await readUsageEvents(usageDir);
  const usageText = JSON.stringify(usageEvents);
  results.push(expectTrue("OPENAI-014 usage log records expected event count", usageEvents.length >= 4));
  results.push(expectTrue("OPENAI-015 usage log records local event", usageEvents.some((event) => event.provider === "local" && event.apiCall === false)));
  results.push(expectTrue("OPENAI-016 usage log records OpenAI API event", usageEvents.some((event) => event.provider === "openai" && event.apiCall === true)));
  results.push(expectTrue("OPENAI-017 usage log records cache hit", usageEvents.some((event) => event.provider === "openai" && event.cacheHit === true)));
  results.push(expectTrue("OPENAI-031 usage log records upstream HTTP error metadata", usageEvents.some((event) => event.provider === "openai" && event.errorReason === "http_503")));
  results.push(expect("OPENAI-018 usage log does not include API key", usageText.includes(mockApiKey), false));
  results.push(expect("OPENAI-019 usage log does not include raw prompt", usageText.includes(openAiQuestion), false));
  results.push(expect("OPENAI-032 usage log does not include raw HTTP error prompt", usageText.includes(openAiErrorQuestion), false));
  results.push(expectTrue("OPENAI-020 usage dir is under OS temp", usageDirUnderTemp));
  results.push(expect("OPENAI-021 usage log stays metadata-only", usageEvents.some(hasRawUsagePayload), false));
  results.push(expectTrue("OPENAI-022 usage log uses approved metadata fields", usageEvents.every(hasOnlyAllowedUsageKeys)));
  results.push(expectTrue("OPENAI-023 usage log has ISO timestamps", usageEvents.every(hasIsoTimestamp)));
  results.push(expectTrue("OPENAI-024 usage log has hashed prompts", usageEvents.every(hasSha256PromptHash)));
  results.push(expectTrue("OPENAI-025 usage log has valid metadata types", usageEvents.every(hasValidUsageMetadataTypes)));
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error);
} finally {
  if (app) await stopProcess(app.child);
  if (mockOpenAi) {
    await new Promise((resolve) => mockOpenAi.server.close(resolve));
  }
  if (usageDir) {
    try {
      results.push(expect("OPENAI-026 usage temp dir is removed", cleanupUsageDir(usageDir), true));
    } catch (error) {
      results.push(expectFailure("OPENAI-026 usage temp dir is removed", error instanceof Error ? error.message : String(error), true));
    }
  }

  const failed = results.filter((result) => !result.passed);
  const summary = {
    passed: results.length - failed.length,
    failed: failed.length + (fatalError ? 1 : 0),
    usageDir,
    results,
    ...(fatalError ? { error: fatalError } : {})
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}
