#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const defaultSourceDb = path.resolve(root, "data", "ai-pdm.sqlite");
const explicitSourceDb = process.env.PDM_DEV073_SOURCE_DB ? path.resolve(root, process.env.PDM_DEV073_SOURCE_DB) : null;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev073-browser-source-"));

function walkSqliteFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) visit(resolved);
      else if (entry.isFile() && entry.name === "ai-pdm.sqlite") files.push(resolved);
    }
  };
  visit(directory);
  return files;
}

function fixtureSummary(databasePath) {
  if (!fs.existsSync(databasePath)) return { valid: false, reason: "database_missing" };
  let database;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    const drawing = database.prepare(`
      SELECT id, lifecycle_state AS lifecycleState
      FROM drawings
      WHERE drawing_number = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get("A0005-M01");
    const revisions = database.prepare(`
      SELECT revision, lifecycle_state AS lifecycleState
      FROM drawing_revisions
      WHERE drawing_id = (SELECT id FROM drawings WHERE drawing_number = ? ORDER BY updated_at DESC, id DESC LIMIT 1)
        AND revision IN (?, ?, ?)
    `).all("A0005-M01", "0.2", "0.3", "0.5");
    const partP04 = database.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number = ?").get("A0005-P04").count;
    const drawingNumber = database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number = ?").get("A0005-M01").count;
    const terminalFff = database.prepare(`
      SELECT COUNT(*) AS count
      FROM drawing_revision_fff_assessments assessment
      JOIN review_confirmation_events confirmation
        ON confirmation.review_id = assessment.id
       AND confirmation.company_id = assessment.company_id
      WHERE assessment.drawing_number_id = (SELECT id FROM drawing_numbers WHERE drawing_number = ? LIMIT 1)
        AND confirmation.action IN (?, ?, ?)
    `).get("A0005-M01", "confirm_bom_no_revision", "confirm_original_part_reuse", "approve_replacement_part_and_drawing_release").count;
    const orphan = database.prepare("SELECT COUNT(*) AS count FROM drawings WHERE drawing_number = ?").get("A0007-M01").count;
    const requiredRevisions = ["0.2", "0.3", "0.5"].every((revision) => revisions.some((row) => row.revision === revision && row.lifecycleState === "rd_controlled"));
    const valid = drawing?.lifecycleState === "rd_controlled" && requiredRevisions && Number(partP04) > 0 && Number(drawingNumber) > 0 && Number(terminalFff) >= 3 && Number(orphan) > 0;
    return { valid, drawingState: drawing?.lifecycleState ?? null, requiredRevisions, partP04: Number(partP04), drawingNumber: Number(drawingNumber), terminalFff: Number(terminalFff), orphan: Number(orphan) };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    database?.close();
  }
}

function candidateSourceDbs() {
  return [
    path.join(root, "data", "backups"),
    path.join(root, "output", "qa", "dev-073-status-actionability"),
    path.join(root, "output", "qa", "dev-068-drawing-recognition")
  ].flatMap(walkSqliteFiles).filter((candidate, index, all) => all.indexOf(candidate) === index).sort((a, b) => {
    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  });
}

function chooseSourceDb() {
  if (explicitSourceDb) {
    const summary = fixtureSummary(explicitSourceDb);
    if (!summary.valid) throw new Error(`DEV073_EXPLICIT_SOURCE_FIXTURE_INVALID:${explicitSourceDb}:${JSON.stringify(summary)}`);
    return { sourceDb: explicitSourceDb, summary, fallback: false };
  }

  const primarySummary = fixtureSummary(defaultSourceDb);
  if (primarySummary.valid) return { sourceDb: defaultSourceDb, summary: primarySummary, fallback: false };

  const fallback = candidateSourceDbs().map((candidate) => ({ candidate, summary: fixtureSummary(candidate) })).find((entry) => entry.summary.valid);
  if (!fallback) return { sourceDb: defaultSourceDb, summary: primarySummary, fallback: false };

  const stagedSourceDb = path.join(tempRoot, "ai-pdm.sqlite");
  fs.copyFileSync(fallback.candidate, stagedSourceDb);
  return { sourceDb: stagedSourceDb, summary: fallback.summary, fallback: true, sourceArtifact: fallback.candidate };
}

let selected = null;
try {
  selected = chooseSourceDb();
  if (selected.fallback) {
    console.log(`DEV-073 browser fixture fallback: ${path.relative(root, selected.sourceArtifact).replaceAll("\\", "/")}`);
    console.log(`DEV-073 browser fixture preflight: ${JSON.stringify(selected.summary)}`);
  } else if (!selected.summary.valid) {
    console.warn(`DEV-073 browser fixture preflight failed on primary source; child browser gate will fail closed: ${JSON.stringify(selected.summary)}`);
  }
  const result = spawnSync(process.execPath, ["scripts/qc-dev-073-browser.mjs"], {
    cwd: root,
    env: { ...process.env, PDM_DEV073_SOURCE_DB: selected.sourceDb },
    stdio: "inherit",
    windowsHide: true
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  const resolvedTempRoot = path.resolve(tempRoot);
  if (resolvedTempRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) && fs.existsSync(resolvedTempRoot)) {
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
}
