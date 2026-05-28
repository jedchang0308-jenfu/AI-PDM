#!/usr/bin/env node
/**
 * migrate-v2.mjs — Phase 2 database migration
 *
 * Adds:
 *   - users.password_hash column
 *   - system_settings table
 *   - submission_files.gdrive_status column
 *
 * Sets default password hash for existing demo users.
 *
 * Usage: node scripts/migrate-v2.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const root = process.cwd();
const dataDir = process.env.PDM_DATA_DIR
  ? path.resolve(root, process.env.PDM_DATA_DIR)
  : path.join(root, "data");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");

if (!fs.existsSync(dbPath)) {
  console.log("Database not found at", dbPath);
  console.log("Run 'npm run db:seed' first to create the database.");
  process.exit(1);
}

const db = new Database(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

// ─── Helper: check if column exists ─────────────────────────────────────
function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

// ─── Helper: check if table exists ──────────────────────────────────────
function tableExists(table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return Boolean(row);
}

// ─── Helper: scrypt hash (mirrors src/lib/password.ts) ──────────────────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

let migrationCount = 0;

// 1. Add password_hash to users
if (!columnExists("users", "password_hash")) {
  console.log("[migrate] Adding users.password_hash column...");
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  migrationCount++;

  // Set default password for existing demo users
  const demoHash = hashPassword("pdm-demo");
  const result = db.prepare("UPDATE users SET password_hash = ? WHERE password_hash IS NULL").run(demoHash);
  console.log(`[migrate] Set default password for ${result.changes} existing user(s).`);
} else {
  console.log("[skip] users.password_hash already exists.");
}

// 2. Create system_settings table
if (!tableExists("system_settings")) {
  console.log("[migrate] Creating system_settings table...");
  db.exec(`
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);
  migrationCount++;
} else {
  console.log("[skip] system_settings table already exists.");
}

// 3. Add gdrive_status to submission_files
if (!columnExists("submission_files", "gdrive_status")) {
  console.log("[migrate] Adding submission_files.gdrive_status column...");
  db.exec("ALTER TABLE submission_files ADD COLUMN gdrive_status TEXT NOT NULL DEFAULT 'none'");
  migrationCount++;
} else {
  console.log("[skip] submission_files.gdrive_status already exists.");
}

db.close();

if (migrationCount > 0) {
  console.log(`\n✅ Migration complete — ${migrationCount} change(s) applied.`);
} else {
  console.log("\n✅ Database is already up to date.");
}
