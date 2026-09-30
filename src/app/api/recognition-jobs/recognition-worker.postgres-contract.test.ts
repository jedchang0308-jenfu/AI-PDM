import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { POST as claim } from "@/app/api/recognition-jobs/claim/route";
import { POST as complete } from "@/app/api/recognition-jobs/[sessionId]/complete/route";
import { POST as heartbeat } from "@/app/api/recognition-jobs/[sessionId]/heartbeat/route";
import { GET as sourceContent } from "@/app/api/recognition-jobs/[sessionId]/sources/[sourceId]/content/route";

const enabled = Boolean(process.env.PDM_DEV121_WORKER_HTTP_POSTGRES_URL);
const database = enabled ? getAsyncDatabaseClient() : null;
const sessionId = "current-http";
const token = process.env.PDM_DRAWING_RECOGNITION_WORKER_TOKEN ?? "";

function request(url: string, body: object, authorized = true) {
  return new Request(`https://ai-pdm.test${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

afterAll(async () => { await database?.close(); });

describe.runIf(enabled)("recognition worker HTTP handlers on restricted PostgreSQL", () => {
  it("rejects an unauthenticated claim before changing the queued job", async () => {
    const response = await claim(request("/api/recognition-jobs/claim", {
      workerId: "worker-http"
    }, false));
    expect(response.status).toBe(401);
    expect(await database!.queryOne<{ status: string }>(
      "SELECT status FROM drawing_recognition_sessions WHERE id=:sessionId", { sessionId }
    )).toEqual({ status: "queued" });
  });

  it("preserves the human Principal through claim, holder-only completion and replay denial", async () => {
    const claimed = await claim(request("/api/recognition-jobs/claim", {
      workerId: "worker-http", maxAttempts: 2
    }));
    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toMatchObject({
      sessionId, initiatorPrincipalId: "principal-one"
    });

    const wrongWorker = await complete(request(
      `/api/recognition-jobs/${sessionId}/complete`, {
        workerId: "worker-other", sourceSetFingerprint: "fixture-fingerprint", results: []
      }), { params: Promise.resolve({ sessionId }) });
    expect(wrongWorker.status).toBe(409);
    expect(await wrongWorker.json()).toMatchObject({
      error: { code: "RECOGNITION_JOB_LOCK_INVALID" }
    });

    const completed = await complete(request(
      `/api/recognition-jobs/${sessionId}/complete`, {
        workerId: "worker-http", sourceSetFingerprint: "fixture-fingerprint",
        results: [{ sourceId: "source-http", adapterCode: "fixture-native",
          adapterVersion: "1", status: "succeeded", observations: [{
            rawText: "HTTP result", rawValue: "HTTP result",
            normalizedValue: "HTTP result", category: "unclassified",
            fieldKey: "fixture_note", fieldLabel: "待歸類備註"
          }] }]
      }), { params: Promise.resolve({ sessionId }) });
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ session: { status: "review_ready" } });
    expect(await database!.queryOne<{ status: string; initiator_principal_id: string }>(
      "SELECT status,initiator_principal_id FROM drawing_recognition_sessions WHERE id=:sessionId",
      { sessionId }
    )).toEqual({ status: "review_ready", initiator_principal_id: "principal-one" });

    const replay = await complete(request(
      `/api/recognition-jobs/${sessionId}/complete`, {
        workerId: "worker-http", sourceSetFingerprint: "fixture-fingerprint", results: []
      }), { params: Promise.resolve({ sessionId }) });
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({
      error: { code: "RECOGNITION_JOB_LOCK_INVALID" }
    });
    expect(await database!.query<{ id: string }>(
      "SELECT id FROM drawing_recognition_adapter_results WHERE session_id=:sessionId",
      { sessionId }
    )).toHaveLength(1);
  });

  it("runs the external worker process through real HTTP handlers and restricted PostgreSQL", async () => {
    const server = createServer(async (incoming, outgoing) => {
      try {
        const pathname = new URL(incoming.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname === "/api/recognition-workers/heartbeat" ||
            pathname === "/api/settings-secret-probe-jobs/claim") {
          outgoing.writeHead(204).end();
          return;
        }
        if (pathname === "/api/preview-workers/solidworks-document-manager-key") {
          outgoing.writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ key: "task-owned-test-key", version: 1,
              fingerprint: "task-owned-test-fingerprint", source: "fixture" }));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (typeof value === "string") headers.set(name, value);
          else if (Array.isArray(value)) headers.set(name, value.join(", "));
        }
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const webRequest = new Request(`http://127.0.0.1${incoming.url}`, {
          method: incoming.method, headers,
          body: incoming.method === "GET" || incoming.method === "HEAD"
            ? undefined : Buffer.concat(chunks)
        });
        const match = /^\/api\/recognition-jobs\/([^/]+)\/(heartbeat|complete)$/u.exec(pathname);
        const sourceMatch = /^\/api\/recognition-jobs\/([^/]+)\/sources\/([^/]+)\/content$/u.exec(pathname);
        const response = pathname === "/api/recognition-jobs/claim"
          ? await claim(webRequest)
          : match?.[2] === "heartbeat"
            ? await heartbeat(webRequest, { params: Promise.resolve({ sessionId: match[1] }) })
            : match?.[2] === "complete"
              ? await complete(webRequest, { params: Promise.resolve({ sessionId: match[1] }) })
              : sourceMatch
                ? await sourceContent(webRequest, { params: Promise.resolve({
                    sessionId: sourceMatch[1], sourceId: sourceMatch[2]
                  }) })
              : new Response(null, { status: 404 });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        outgoing.writeHead(500).end(String(error));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("worker test port unavailable");
    const child = spawn(process.execPath, [
      "--experimental-transform-types", "scripts/run-drawing-recognition-worker.mjs", "--once"
    ], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env,
        PDM_DRAWING_RECOGNITION_WORKER_BASE_URL: `http://127.0.0.1:${address.port}`,
        PDM_DRAWING_RECOGNITION_WORKER_ID: "worker-process",
        PDM_DRAWING_RECOGNITION_FIXTURE_MODE: "false",
        PDM_DRAWING_RECOGNITION_METADATA_CMD: process.execPath,
        PDM_DRAWING_RECOGNITION_METADATA_ARGS: JSON.stringify([
          process.env.DEV121_NATIVE_FIXTURE_ADAPTER
        ]) }
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`worker process timed out: ${output}`));
        }, 25_000);
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("close", (code) => { clearTimeout(timer); resolve(code); });
      });
      expect(exitCode, output).toBe(0);
      expect(await database!.queryOne<{ status: string; initiator_principal_id: string }>(
        "SELECT status,initiator_principal_id FROM drawing_recognition_sessions WHERE id=:sessionId",
        { sessionId: "current-process" }
      )).toEqual({ status: "review_ready", initiator_principal_id: "principal-one" });
      expect(await database!.query<{ adapter_code: string; status: string }>(
        "SELECT adapter_code,status FROM drawing_recognition_adapter_results WHERE session_id=:sessionId ORDER BY adapter_code",
        { sessionId: "current-process" }
      )).toEqual([
        { adapter_code: "filename.v1", status: "succeeded" },
        { adapter_code: "native-metadata-bridge.v1", status: "succeeded" }
      ]);
      expect(await database!.query<{ raw_text: string }>(
        "SELECT raw_text FROM drawing_recognition_observations WHERE session_id=:sessionId AND raw_text='native source transferred'",
        { sessionId: "current-process" }
      )).toEqual([{ raw_text: "native source transferred" }]);
    } finally {
      if (!child.killed && child.exitCode === null) child.kill();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 45_000);
});
