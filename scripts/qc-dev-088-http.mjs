#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev088-http-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDb = path.join(dataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvSnapshot = fs.readFileSync(nextEnvPath, "utf8");
const checks = [];
let app = null;
let port = null;
let baseUrl = "";
let distDir = "";
let cookie = "";

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function json(response) {
  return response.json().catch(() => ({}));
}

function authHeaders(extra = {}) {
  return { cookie, ...extra };
}

async function restoreNextEnv() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.writeFileSync(nextEnvPath, nextEnvSnapshot, "utf8");
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  return false;
}

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, repositoryDir, { recursive: true, force: true });
  const setup = new Database(fixtureDb);
  const source = setup.prepare(`SELECT id FROM part_numbers WHERE company_id = 'company-jenfu' AND part_number = 'A0002-P01' LIMIT 1`).get();
  check("fixture source exists", Boolean(source?.id));
  setup.prepare(`DELETE FROM part_number_drafts WHERE company_id = 'company-jenfu' AND reserved_part_number IN ('A0002-P88', 'A0002-P89', 'A0002-P90')`).run();
  setup.prepare(`DELETE FROM file_assets WHERE id = 'dev088-http-source'`).run();
  setup.prepare(`
    INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
      content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
      created_at, updated_at
    ) VALUES (
      'dev088-http-source', 'local_repository', 'dev088/http/source.txt', 'source.txt', 'txt', 'text/plain', 6,
      @hash, 'part_number', @partId, 'other', '來源說明', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run({ hash: "2".repeat(64), partId: source.id });
  setup.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  distDir = `.tmp/qc-dev088-http-${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_BUILD_COMMIT: "local-dev088",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NUMBER_LIFECYCLE_V2: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: distDir,
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-088 runtime: project=${root}; purpose=replacement attachment HTTP QA; port=${port}; owner=current QC process tree; cleanup=after HTTP assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);

  const denied = await fetch(`${baseUrl}/api/numbering/part-number-drafts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  check("anonymous mutation denied before body processing", [401, 403].includes(denied.status), `${denied.status}`);

  const login = await fetch(`${baseUrl}/api/auth/local-quick-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Admin" })
  });
  cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  check("local login succeeds", login.status === 200 && Boolean(cookie), `${login.status}`);

  const candidateResponse = await fetch(`${baseUrl}/api/parts/A0002-P01/replacement-attachment-candidates`, { headers: authHeaders() });
  const candidate = await json(candidateResponse);
  check("candidate read succeeds", candidateResponse.status === 200 && candidate.candidates?.some((item) => item.id === "dev088-http-source"), JSON.stringify(candidate));
  const selectedIds = candidate.candidates.map((item) => item.id);

  const multipartCommand = {
    companyCode: "JENFU",
    reservedPartNumber: "A0002-P88",
    draftType: "replacement_part",
    itemType: "self_made",
    sourcePartNumberId: candidate.sourcePartNumberId,
    idempotencyKey: "dev088-http-multipart-1",
    attachmentSnapshot: {
      sourcePartNumberId: candidate.sourcePartNumberId,
      sourceToken: candidate.sourceToken,
      selectedAttachmentIds: selectedIds,
      newItems: [{ clientKey: "new-http-note", ordinal: 0, displayName: "新說明.txt", documentCategory: "other" }]
    }
  };
  const buildMultipart = () => {
    const form = new FormData();
    form.append("command", JSON.stringify(multipartCommand));
    form.append("part_attachment_file:new-http-note", new Blob(["new-content"], { type: "text/plain" }), "new-note.txt");
    return form;
  };
  const first = await fetch(`${baseUrl}/api/numbering/part-number-drafts`, {
    method: "POST",
    headers: authHeaders({ "idempotency-key": "dev088-http-multipart-1" }),
    body: buildMultipart()
  });
  const firstBody = await json(first);
  check("multipart draft and files commit", first.status === 201 && Boolean(firstBody.draft?.id), JSON.stringify(firstBody));

  const replay = await fetch(`${baseUrl}/api/numbering/part-number-drafts`, {
    method: "POST",
    headers: authHeaders({ "idempotency-key": "dev088-http-multipart-1" }),
    body: buildMultipart()
  });
  const replayBody = await json(replay);
  check("multipart replay returns same draft", replay.status === 201 && replayBody.draft?.id === firstBody.draft.id, JSON.stringify(replayBody));

  const inspect = new Database(fixtureDb, { readonly: true });
  check("multipart creates one snapshot", inspect.prepare(`SELECT COUNT(*) AS count FROM part_attachment_reuse_snapshots WHERE part_number_draft_id = ?`).get(firstBody.draft.id).count === 1);
  check("multipart replay creates no duplicate target rows", inspect.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_type = 'part_number_draft' AND linked_entity_id = ?`).get(firstBody.draft.id).count === selectedIds.length + 1);
  inspect.close();

  const jsonCommand = {
    companyCode: "JENFU",
    reservedPartNumber: "A0002-P89",
    draftType: "replacement_part",
    itemType: "self_made",
    sourcePartNumberId: candidate.sourcePartNumberId,
    attachmentSnapshot: {
      sourcePartNumberId: candidate.sourcePartNumberId,
      sourceToken: candidate.sourceToken,
      selectedAttachmentIds: [],
      newItems: []
    }
  };
  const jsonResponse = await fetch(`${baseUrl}/api/numbering/part-number-drafts`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json", "idempotency-key": "dev088-http-json-1" }),
    body: JSON.stringify(jsonCommand)
  });
  const jsonBody = await json(jsonResponse);
  check("JSON explicit empty selection commits", jsonResponse.status === 201 && Boolean(jsonBody.draft?.id), JSON.stringify(jsonBody));
  const emptyInspect = new Database(fixtureDb, { readonly: true });
  const emptySnapshot = emptyInspect.prepare(`SELECT selected_count, new_count FROM part_attachment_reuse_snapshots WHERE part_number_draft_id = ?`).get(jsonBody.draft.id);
  check("empty selection remains explicit snapshot", emptySnapshot?.selected_count === 0 && emptySnapshot?.new_count === 0, JSON.stringify(emptySnapshot));
  emptyInspect.close();

  const mutate = new Database(fixtureDb);
  mutate.prepare(`UPDATE file_assets SET updated_at = '2030-01-01T00:00:00.000Z' WHERE id = 'dev088-http-source'`).run();
  mutate.close();
  const staleResponse = await fetch(`${baseUrl}/api/numbering/part-number-drafts`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json", "idempotency-key": "dev088-http-stale-1" }),
    body: JSON.stringify({ ...jsonCommand, reservedPartNumber: "A0002-P90", attachmentSnapshot: { ...jsonCommand.attachmentSnapshot, selectedAttachmentIds: selectedIds } })
  });
  const staleBody = await json(staleResponse);
  check("stale source returns stable 409", staleResponse.status === 409 && staleBody.error === "SOURCE_ATTACHMENTS_STALE", JSON.stringify(staleBody));
  const staleInspect = new Database(fixtureDb, { readonly: true });
  check("stale source leaves no draft or target rows", staleInspect.prepare(`SELECT COUNT(*) AS count FROM part_number_drafts WHERE reserved_part_number = 'A0002-P90'`).get().count === 0);
  staleInspect.close();

  const crossCompany = await fetch(`${baseUrl}/api/parts/A0002-P01/replacement-attachment-candidates?company_code=MAXIMA`, { headers: authHeaders() });
  check("cross-company candidate existence not disclosed", crossCompany.status === 404, `${crossCompany.status} ${await crossCompany.text()}`);
} catch (error) {
  checks.push({ name: "HTTP execution", pass: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
} finally {
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  if (distDir) {
    const resolvedDist = path.resolve(root, distDir);
    const allowedRoot = `${path.resolve(root, ".tmp")}${path.sep}`;
    if (resolvedDist.startsWith(allowedRoot)) {
      try { fs.rmSync(resolvedDist, { recursive: true, force: true }); } catch {}
    }
  }
  checks.push({ name: "tracked Next type entry restored", pass: await restoreNextEnv(), detail: "next-env.d.ts" });
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-088", scope: "http", status: failed.length ? "FAIL" : "PASS", port, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks };
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
