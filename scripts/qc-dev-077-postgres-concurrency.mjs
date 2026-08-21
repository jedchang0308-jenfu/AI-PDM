#!/usr/bin/env node

import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const connectionString = process.env.PDM_TEST_POSTGRES_URL;
const results = [];
const unique = `${Date.now()}-${process.pid}`;
let pool;

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function assertIsDisposablePostgresTarget(value) {
  if (!value) throw new Error("PDM_TEST_POSTGRES_URL is required and must point to a disposable PostgreSQL instance");
  const parsed = new URL(value);
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const port = Number(parsed.port || 5432);
  if (!localHost || !Number.isInteger(port) || port === 5432 || port === 54322) {
    throw new Error("PDM_TEST_POSTGRES_URL must target a loopback, non-default, disposable PostgreSQL port");
  }
}

async function request(method, path, cookie, body, expectedStatuses, idempotencyKey) {
  const headers = { cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  const accepted = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  record(`${method} ${path} returns ${accepted.join("/")}`, accepted.includes(response.status), `HTTP ${response.status}: ${text.slice(0, 500)}`);
  return { status: response.status, data, text };
}

async function login() {
  const response = await fetch(`${apiBaseUrl}/api/auth/local-quick-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Engineer" })
  });
  const text = await response.text();
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("PostgreSQL engineer local quick login succeeds", response.status === 200, `HTTP ${response.status}: ${text.slice(0, 300)}`);
  record("PostgreSQL login returns session cookie", Boolean(cookie));
  return cookie;
}

async function createRoot(cookie, label) {
  const created = await request("POST", "/api/numbering/records", cookie, {
    coreName: `DEV-077 PostgreSQL ${label} ${unique}`,
    partName: `DEV-077 PostgreSQL part ${label} ${unique}`,
    itemKind: "manufactured",
    drawingRequested: true,
    drawingPurposeCode: "M"
  }, 201, `qc-dev-077-pg-create-${label}-${unique}`);
  record(`${label} create returns a root bundle`, Boolean(created.data.root?.rootCode), JSON.stringify(created.data).slice(0, 500));
  return created.data.root;
}

async function queryOne(text, values = []) {
  const result = await pool.query(text, values);
  return result.rows[0] ?? null;
}

try {
  assertIsDisposablePostgresTarget(connectionString);
  pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 2_000, statement_timeout: 10_000 });
  await queryOne("SELECT 1");
  record("Disposable PostgreSQL target is reachable", true);

  const cookie = await login();
  const concurrentRoot = await createRoot(cookie, "concurrent");
  const concurrentPath = `/api/numbering/records/${encodeURIComponent(concurrentRoot.rootCode)}/obsolete`;
  const concurrentBody = { reason: `DEV-077 concurrent obsolete ${unique}`, confirmObsolete: true };
  const concurrentResults = await Promise.all([
    request("POST", concurrentPath, cookie, concurrentBody, [200, 409], `qc-dev-077-pg-concurrent-a-${unique}`),
    request("POST", concurrentPath, cookie, concurrentBody, [200, 409], `qc-dev-077-pg-concurrent-b-${unique}`)
  ]);
  const successful = concurrentResults.filter((item) => item.status === 200).length;
  const rejected = concurrentResults.filter((item) => item.status === 409).length;
  record("Concurrent obsolete requests have one winner and one safe rejection", successful === 1 && rejected === 1, JSON.stringify(concurrentResults));

  const concurrentState = await queryOne(`
    SELECT
      (SELECT record_status FROM part_roots WHERE id = $1) AS root_status,
      (SELECT COUNT(*)::int FROM part_numbers WHERE part_root_id = $1 AND record_status = 'Obsolete') AS obsolete_parts,
      (SELECT COUNT(*)::int FROM drawing_numbers WHERE part_root_id = $1 AND record_status = 'Obsolete') AS obsolete_drawings,
      (SELECT COUNT(*)::int FROM audit_logs WHERE action = 'numbering.draft.obsolete' AND detail_json::text LIKE $2) AS obsolete_audits
  `, [concurrentRoot.id, `%${concurrentRoot.rootCode}%`]);
  record(
    "Concurrent obsolete leaves one complete Obsolete bundle and one audit",
    concurrentState?.root_status === "Obsolete" && concurrentState.obsolete_parts === 1 && concurrentState.obsolete_drawings === 1 && concurrentState.obsolete_audits === 1,
    JSON.stringify(concurrentState)
  );

  const controlledRoot = await createRoot(cookie, "controlled-reference");
  const actor = await queryOne("SELECT id FROM users WHERE email = 'engineer@example.com' LIMIT 1");
  record("PostgreSQL fixture has the authenticated engineer", Boolean(actor?.id));
  await pool.query(`
    INSERT INTO approval_requests (
      id, company_id, request_type, action_code, entity_type, entity_id, request_status,
      reason, payload_json, requested_by, requested_at, created_at, updated_at
    ) VALUES ($1, 'company-jenfu', 'numbering', 'release', 'part_root', $2, 'pending', $3, '{}'::jsonb, $4, now(), now(), now())
  `, [`qc-dev-077-controlled-${unique}`, controlledRoot.id, "DEV-077 controlled reference", actor.id]);
  const impact = await request("GET", `/api/numbering/roots/${encodeURIComponent(controlledRoot.rootCode)}/obsolete-impact`, cookie, undefined, 200);
  record("Controlled approval reference appears in root impact", Number(impact.data.dependencySummary?.controlledReferenceCount) === 1, JSON.stringify(impact.data.dependencySummary));
  const blocked = await request("POST", `/api/numbering/records/${encodeURIComponent(controlledRoot.rootCode)}/obsolete`, cookie, {
    reason: `DEV-077 controlled reference ${unique}`,
    confirmObsolete: true
  }, 409, `qc-dev-077-pg-controlled-${unique}`);
  record("Controlled reference blocks direct obsolete without mutation", blocked.data?.error === "LIFE_ROOT_MIXED_OR_TERMINAL", JSON.stringify(blocked.data));
  const blockedState = await queryOne("SELECT record_status FROM part_roots WHERE id = $1", [controlledRoot.id]);
  record("Blocked controlled-reference root remains Draft", blockedState?.record_status === "Draft", JSON.stringify(blockedState));
} catch (error) {
  if (!results.some((result) => !result.passed)) {
    results.push({ name: "DEV-077 PostgreSQL QC execution", passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
} finally {
  try { await pool?.end(); } catch {}
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, apiBaseUrl, results }, null, 2));
if (failed.length > 0) process.exit(1);
