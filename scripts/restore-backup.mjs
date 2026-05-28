#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dataDir = resolveAppPath(process.env.PDM_DATA_DIR, "data");
const repositoryDir = resolveAppPath(process.env.PDM_REPOSITORY_DIR, path.join("data", "repository"));
const backupRoot = resolveAppPath(process.env.PDM_BACKUP_DIR, path.join("data", "backups"));
const args = parseArgs(process.argv.slice(2));
const snapshotDir = resolveSnapshotDir(args.snapshot);
const manifestPath = path.join(snapshotDir, "manifest.json");

function resolveAppPath(value, fallback) {
  const configured = value?.trim();
  if (!configured) return path.join(root, fallback);
  return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

function parseArgs(argv) {
  const parsed = {
    snapshot: "--latest",
    target: "",
    inPlace: false,
    force: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--latest") {
      parsed.snapshot = "--latest";
    } else if (arg === "--snapshot") {
      parsed.snapshot = argv[++index] ?? "";
    } else if (arg === "--target") {
      parsed.target = argv[++index] ?? "";
    } else if (arg === "--in-place") {
      parsed.inPlace = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function resolveSnapshotDir(snapshotArg) {
  if (snapshotArg && snapshotArg !== "--latest") {
    return path.isAbsolute(snapshotArg) ? snapshotArg : path.join(root, snapshotArg);
  }

  if (!fs.existsSync(backupRoot)) {
    console.error(`Backup root not found at ${backupRoot}`);
    process.exit(1);
  }

  const snapshots = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(backupRoot, entry.name))
    .sort();

  if (snapshots.length === 0) {
    console.error(`No backup snapshots found at ${backupRoot}`);
    process.exit(1);
  }

  return snapshots[snapshots.length - 1];
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const file = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);

  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(file, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(file);
  }

  return hash.digest("hex");
}

function verifySnapshot(manifest) {
  const failures = [];

  for (const expected of manifest.files ?? []) {
    const filePath = path.join(snapshotDir, expected.path);
    if (!fs.existsSync(filePath)) {
      failures.push({ path: expected.path, reason: "missing" });
      continue;
    }

    const stat = fs.statSync(filePath);
    const actualHash = sha256File(filePath);
    if (stat.size !== expected.size || actualHash !== expected.sha256) {
      failures.push({ path: expected.path, reason: "checksum-mismatch" });
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ snapshotDir, valid: false, failures }, null, 2));
    process.exit(1);
  }
}

function ensureSafeDelete(targetPath) {
  const resolved = path.resolve(targetPath);
  const safeRoots = [
    path.resolve(root, "data", "restore-drills"),
    path.resolve(root, "data", "restore-targets")
  ];

  if (args.inPlace) {
    return;
  }

  if (!safeRoots.some((safeRoot) => resolved === safeRoot || resolved.startsWith(safeRoot + path.sep))) {
    console.error(`Refusing to delete outside approved restore directories: ${resolved}`);
    process.exit(1);
  }
}

function copyRequiredDirectory(source, target) {
  if (!fs.existsSync(source)) {
    console.error(`Required backup directory missing: ${source}`);
    process.exit(1);
  }
  fs.cpSync(source, target, { recursive: true });
}

function rewriteRestoredLocalPaths(dbPath, sourceRepositoryDir, targetRepositoryDir) {
  const db = new Database(dbPath);
  const sourceRoot = path.resolve(sourceRepositoryDir);
  const targetRoot = path.resolve(targetRepositoryDir);
  let rewritten = 0;

  try {
    db.exec("PRAGMA foreign_keys = ON;");
    const rows = db.prepare("SELECT id, local_path FROM submission_files").all();
    const update = db.prepare("UPDATE submission_files SET local_path = ? WHERE id = ?");

    for (const row of rows) {
      const originalPath = String(row.local_path);
      const resolvedOriginal = path.resolve(originalPath);
      let relativePath = "";

      if (resolvedOriginal === sourceRoot || resolvedOriginal.startsWith(sourceRoot + path.sep)) {
        relativePath = path.relative(sourceRoot, resolvedOriginal);
      } else {
        const normalized = originalPath.replaceAll("\\", "/");
        const marker = "/repository/";
        const markerIndex = normalized.toLowerCase().indexOf(marker);
        if (markerIndex >= 0) {
          relativePath = normalized.slice(markerIndex + marker.length).replaceAll("/", path.sep);
        }
      }

      if (relativePath) {
        update.run(path.join(targetRoot, relativePath), row.id);
        rewritten += 1;
      }
    }

    const integrity = db.prepare("PRAGMA integrity_check").get();
    const integrityValue = Object.values(integrity)[0];
    if (integrityValue !== "ok") {
      console.error(`Restored database integrity check failed: ${integrityValue}`);
      process.exit(1);
    }
  } finally {
    db.close();
  }

  return rewritten;
}

if (!fs.existsSync(manifestPath)) {
  console.error(`Backup manifest not found at ${manifestPath}`);
  process.exit(1);
}

if (!args.inPlace && !args.target) {
  console.error("Restore requires --target <directory>. Use --in-place --force only for a real restore window.");
  process.exit(1);
}

if (args.inPlace && !args.force) {
  console.error("In-place restore requires --force.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
verifySnapshot(manifest);

const restoreRoot = args.inPlace ? root : path.resolve(args.target);
const targetDataDir = args.inPlace ? dataDir : path.join(restoreRoot, "data");
const targetRepositoryDir = args.inPlace ? repositoryDir : path.join(targetDataDir, "repository");
const targetDbPath = path.join(targetDataDir, "ai-pdm.sqlite");

if (fs.existsSync(restoreRoot) && fs.readdirSync(restoreRoot).length > 0 && !args.force && !args.inPlace) {
  console.error(`Restore target is not empty. Re-run with --force to replace it: ${restoreRoot}`);
  process.exit(1);
}

if (!args.inPlace && fs.existsSync(restoreRoot)) {
  ensureSafeDelete(restoreRoot);
  fs.rmSync(restoreRoot, { recursive: true, force: true });
}

fs.mkdirSync(targetDataDir, { recursive: true });
fs.copyFileSync(path.join(snapshotDir, "database", "ai-pdm.sqlite"), targetDbPath);
copyRequiredDirectory(path.join(snapshotDir, "repository"), targetRepositoryDir);

if (fs.existsSync(path.join(snapshotDir, "config"))) {
  fs.cpSync(path.join(snapshotDir, "config"), path.join(restoreRoot, "config"), { recursive: true });
}

if (fs.existsSync(path.join(snapshotDir, "logs"))) {
  fs.cpSync(path.join(snapshotDir, "logs"), path.join(targetDataDir, "logs"), { recursive: true });
}

const rewrittenLocalPaths = rewriteRestoredLocalPaths(
  targetDbPath,
  manifest.sources?.repositoryDir ?? repositoryDir,
  targetRepositoryDir
);

console.log(
  JSON.stringify(
    {
      snapshotDir,
      restoreRoot,
      targetDbPath,
      targetRepositoryDir,
      rewrittenLocalPaths,
      restored: true
    },
    null,
    2
  )
);
