#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dataPath = process.env.PDM_DATA_DIR
  ? path.resolve(root, process.env.PDM_DATA_DIR, "ai-pdm.sqlite")
  : path.resolve(root, "data", "ai-pdm.sqlite");
const runId = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.resolve(root, "output", "qa", "dev-056-2d-preview", runId);
const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

fs.mkdirSync(outputDir, { recursive: true });
const db = new Database(dataPath, { readonly: true });
try {
  const source = db.prepare(`
    SELECT id, file_name, file_ext, original_path, content_hash
      FROM file_assets
     WHERE lower(file_name) = 'a0002-m01.slddrw' AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 1
  `).get();
  check("A0002-M01.SLDDRW source exists", Boolean(source), "source_file_asset not found");
  check("A0002-M01 source path exists", Boolean(source.original_path && fs.existsSync(source.original_path)), source.original_path ?? "missing original_path");

  const job = db.prepare(`
    SELECT id, requested_kind, source_content_hash, status, attempt_count, created_by
      FROM preview_jobs
     WHERE source_file_asset_id = ?
       AND requested_kind = 'native_thumbnail_png'
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1
  `).get(source.id);
  check("A0002 job uses native_thumbnail_png", job?.requested_kind === "native_thumbnail_png");
  check("A0002 native preview job succeeded", job?.status === "succeeded", JSON.stringify(job ?? null));
  check("A0002 job source hash is current", job?.source_content_hash === source.content_hash);
  check("A0002 job was claimed", Number(job?.attempt_count ?? 0) >= 1);

  const derivative = db.prepare(`
    SELECT derivative_kind, mime_type, file_name, file_size, width, height,
           source_content_hash, generator_profile, generator_version, status, created_by_worker
      FROM file_derivatives
     WHERE source_file_asset_id = ?
       AND status = 'ready'
     ORDER BY created_at DESC
     LIMIT 1
  `).get(source.id);
  check("A0002 current PNG derivative exists", derivative?.derivative_kind === "thumbnail_png");
  check("A0002 derivative is a non-fake PNG", derivative?.mime_type === "image/png" && derivative?.generator_profile === "windows_solidworks_preview_worker");
  check("A0002 derivative hash is current", derivative?.source_content_hash === source.content_hash && derivative?.file_size > 1000);
  check("A0002 derivative has usable dimensions", Number(derivative?.width) > 0 && Number(derivative?.height) > 0);

  const heartbeat = db.prepare(`
    SELECT worker_id, status, applied_secret_version, applied_secret_fingerprint,
           last_seen_at, issue_code
      FROM worker_capability_heartbeats
     WHERE capability_code = 'solidworks_2d_preview_png'
     ORDER BY last_seen_at DESC
     LIMIT 1
  `).get();
  const heartbeatFresh = heartbeat && Date.parse(heartbeat.last_seen_at) >= Date.now() - 30_000;
  check("Dedicated 2D capability heartbeat is fresh and ready", heartbeat?.status === "ready" && heartbeatFresh, JSON.stringify(heartbeat ?? null));
  check("Heartbeat acknowledges an applied secure version", Number(heartbeat?.applied_secret_version) > 0 && Boolean(heartbeat?.applied_secret_fingerprint));
  check("Derivative worker is the heartbeating worker", Boolean(heartbeat?.worker_id && heartbeat.worker_id === derivative?.created_by_worker));

  const activeSecret = db.prepare(`
    SELECT vault_provider, version, masked_hint
      FROM secret_references
     WHERE kind = 'solidworks_document_manager' AND lifecycle_status = 'active'
     ORDER BY version DESC
     LIMIT 1
  `).get();
  check("Active credential uses a secure provider", ["windows_dpapi", "google_secret_manager"].includes(activeSecret?.vault_provider), JSON.stringify(activeSecret ?? null));
  check("Evidence stores only redacted credential metadata", /^len:\d+;ending:.{1,20}$/u.test(activeSecret?.masked_hint ?? ""));

  const browserManifest = {
    surface: "A0002-M01 2D preview",
    sourceFile: source.file_name,
    derivativeKind: derivative.derivative_kind,
    mediaType: derivative.mime_type,
    state: "ready",
    sourceHashMatched: derivative.source_content_hash === source.content_hash,
    workerId: derivative.created_by_worker,
    capability: "solidworks_2d_preview_png",
    note: "Browser surface is backed by the same current-hash derivative; no credential material is included."
  };
  fs.writeFileSync(path.join(outputDir, "browser-manifest.json"), `${JSON.stringify(browserManifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "job-heartbeat-derivative.json"), `${JSON.stringify({ source: { id: source.id, fileName: source.file_name, contentHash: source.content_hash }, job, heartbeat, derivative, activeSecret: { vaultProvider: activeSecret.vault_provider, version: activeSecret.version, maskedHint: activeSecret.masked_hint } }, null, 2)}\n`, "utf8");
} finally {
  db.close();
}

check("Dedicated heartbeat route exists", read("src/app/api/preview-workers/heartbeat/route.ts").includes("solidworks_2d_preview_png"));
check("Launcher does not require plaintext key", !read("scripts/start-localhost-3000.ps1").includes('if (-not (Test-DocumentManagerPreviewKeyConfigured))'));
check("Detail projection distinguishes queued/running/stale", ["等待預覽服務", "預覽服務未回應", "lastHeartbeatAt"].every((value) => read("src/lib/pdm-entity-detail.ts").includes(value)));

console.log(JSON.stringify({ passed: checks.length, failed: 0, outputDir, checks }, null, 2));
