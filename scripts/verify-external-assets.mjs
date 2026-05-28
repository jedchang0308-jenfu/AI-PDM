#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const defaultManifestPath = path.join(root, "docs", "assets", "external-assets-manifest.json");
const manifestPath = path.resolve(root, readArg("--manifest") ?? defaultManifestPath);
const maxIssues = parsePositiveInt(process.env.PDM_ASSET_CHECK_MAX_ISSUES) ?? 50;

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function normalizeRelativePath(relativePath) {
  return relativePath.replaceAll("/", path.sep).replaceAll("\\", path.sep);
}

function resolveExternalRoot(manifest) {
  const configured = process.env.PDM_EXTERNAL_ASSETS_DIR?.trim();
  if (configured) {
    return path.resolve(root, configured);
  }
  return path.resolve(root, manifest.externalRoot);
}

function addIssue(issues, issue) {
  if (issues.length < maxIssues) {
    issues.push(issue);
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function isInsideDirectory(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function verifyEntry(entry, externalRoot) {
  const originalPath = path.resolve(root, normalizeRelativePath(entry.originalRelativePath));
  const targetPath = path.resolve(externalRoot, normalizeRelativePath(entry.targetRelativePath));
  const context = {
    id: entry.id,
    parentItem: entry.parentItem,
    originalRelativePath: entry.originalRelativePath,
    targetRelativePath: entry.targetRelativePath
  };

  if (!isInsideDirectory(root, originalPath)) {
    return { ...context, status: "invalid_original_path" };
  }
  if (!isInsideDirectory(externalRoot, targetPath)) {
    return { ...context, status: "invalid_target_path" };
  }
  if (fs.existsSync(originalPath)) {
    return { ...context, status: "original_still_in_workspace" };
  }

  let fileStat;
  try {
    fileStat = await stat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ...context, status: "missing" };
    }
    return { ...context, status: "unreadable", error: error instanceof Error ? error.message : String(error) };
  }

  if (!fileStat.isFile()) {
    return { ...context, status: "unreadable", error: "Target path is not a file" };
  }

  if (fileStat.size !== entry.bytes) {
    return { ...context, status: "size_mismatch", expectedBytes: entry.bytes, actualBytes: fileStat.size };
  }

  const actualSha256 = await hashFile(targetPath);
  if (actualSha256 !== entry.sha256) {
    return { ...context, status: "hash_mismatch", expectedSha256: entry.sha256, actualSha256 };
  }

  return { ...context, status: "ok", bytes: fileStat.size };
}

function summarize(results, manifest, externalRoot) {
  const summary = {
    manifestPath,
    checkedAt: new Date().toISOString(),
    schemaVersion: manifest.schemaVersion,
    externalRoot,
    total: results.length,
    ok: 0,
    missing: 0,
    unreadable: 0,
    sizeMismatch: 0,
    hashMismatch: 0,
    originalStillInWorkspace: 0,
    invalidPath: 0,
    issues: []
  };

  for (const result of results) {
    if (result.status === "ok") summary.ok += 1;
    else if (result.status === "missing") summary.missing += 1;
    else if (result.status === "unreadable") summary.unreadable += 1;
    else if (result.status === "size_mismatch") summary.sizeMismatch += 1;
    else if (result.status === "hash_mismatch") summary.hashMismatch += 1;
    else if (result.status === "original_still_in_workspace") summary.originalStillInWorkspace += 1;
    else if (result.status === "invalid_original_path" || result.status === "invalid_target_path") summary.invalidPath += 1;

    if (result.status !== "ok") {
      addIssue(summary.issues, result);
    }
  }

  return summary;
}

try {
  const manifest = readJson(manifestPath);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (manifest.schemaVersion !== 1 || entries.length === 0) {
    throw new Error("Manifest must use schemaVersion 1 and contain at least one entry.");
  }

  const externalRoot = resolveExternalRoot(manifest);
  const results = [];
  for (const entry of entries) {
    results.push(await verifyEntry(entry, externalRoot));
  }

  const summary = summarize(results, manifest, externalRoot);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.issues.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        manifestPath,
        checkedAt: new Date().toISOString(),
        total: 0,
        ok: 0,
        issues: [{ status: "error", error: error instanceof Error ? error.message : String(error) }]
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
