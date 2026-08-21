#!/usr/bin/env node

import Database from "better-sqlite3";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-dev-077-api" });
const unique = Date.now().toString().slice(-8);
const results = [];
let rootCode = "";

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login() {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "engineer@example.com", password: "pdm-demo" })
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("DEV-077 engineer login succeeds", response.status === 200, `HTTP ${response.status}`);
  record("DEV-077 login returns session cookie", Boolean(cookie));
  return cookie;
}

async function request(method, urlPath, cookie, body, expectedStatus, idempotencyKey) {
  const headers = { "content-type": "application/json", cookie };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${apiBaseUrl}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  record(`${method} ${urlPath} returns ${expectedStatus}`, response.status === expectedStatus, `HTTP ${response.status}: ${text.slice(0, 400)}`);
  return data;
}

function bundle() {
  const db = new Database(dbPath);
  try {
    const root = db.prepare("SELECT * FROM part_roots WHERE root_code = ?").get(rootCode);
    if (!root) return null;
    return {
      root,
      parts: db.prepare("SELECT * FROM part_numbers WHERE part_root_id = ?").all(root.id),
      drawings: db.prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ?").all(root.id)
    };
  } finally {
    db.close();
  }
}

try {
  const cookie = await login();
  const created = await request("POST", "/api/numbering/records", cookie, {
    coreName: `DEV-077 API root ${unique}`,
    partName: `DEV-077 API part ${unique}`,
    itemKind: "manufactured",
    drawingRequested: true,
    drawingPurposeCode: "M"
  }, 201, `qc-dev-077-create-${unique}`);
  rootCode = created.root.rootCode;

  const impact = await request("GET", `/api/numbering/roots/${encodeURIComponent(rootCode)}/obsolete-impact`, cookie, undefined, 200);
  record("Root impact returns direct obsolete policy", impact.policy?.action === "obsolete_draft_official_number" && impact.policy?.availability === "enabled", JSON.stringify(impact.policy));
  record("Root impact returns zero controlled references", impact.dependencySummary?.controlledReferenceCount === 0, JSON.stringify(impact.dependencySummary));
  record("Root impact includes root and child approval targets", impact.approvalTargets?.length === 3, JSON.stringify(impact.approvalTargets));

  await request("POST", `/api/numbering/records/${encodeURIComponent(rootCode)}/obsolete`, cookie, { reason: "missing confirmation" }, 400, `qc-dev-077-missing-confirm-${unique}`);

  const key = `qc-dev-077-obsolete-${unique}`;
  const first = await request("POST", `/api/numbering/records/${encodeURIComponent(rootCode)}/obsolete`, cookie, {
    reason: `DEV-077 obsolete ${unique}`,
    confirmObsolete: true
  }, 200, key);
  const replay = await request("POST", `/api/numbering/records/${encodeURIComponent(rootCode)}/obsolete`, cookie, {
    reason: `DEV-077 obsolete ${unique}`,
    confirmObsolete: true
  }, 200, key);
  record("Direct obsolete returns an Obsolete root", first.result?.root?.recordStatus === "Obsolete", JSON.stringify(first));
  record("Same idempotency key replays the same result", replay.result?.root?.recordStatus === "Obsolete", JSON.stringify(replay));

  const finalBundle = bundle();
  record("Direct obsolete preserves rows and marks the whole bundle Obsolete", finalBundle?.root.record_status === "Obsolete" && finalBundle.parts.length === 1 && finalBundle.parts[0].record_status === "Obsolete" && finalBundle.drawings.length === 1 && finalBundle.drawings[0].record_status === "Obsolete", JSON.stringify(finalBundle));
  record("Direct obsolete writes an audit event", (() => {
    const db = new Database(dbPath);
    try { return Boolean(db.prepare("SELECT 1 FROM audit_logs WHERE action = 'numbering.draft.obsolete' AND detail_json LIKE ? LIMIT 1").get(`%${rootCode}%`)); }
    finally { db.close(); }
  })());
} catch (error) {
  if (!results.some((result) => !result.passed)) results.push({ name: "DEV-077 API QC execution", passed: false, detail: error instanceof Error ? error.message : String(error) });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, apiBaseUrl, results }, null, 2));
if (failed.length > 0) process.exit(1);
