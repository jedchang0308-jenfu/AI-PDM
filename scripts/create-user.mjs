#!/usr/bin/env node
/**
 * create-user.mjs — CLI tool to create a new PDM user account
 *
 * Usage:
 *   node scripts/create-user.mjs --email admin@company.com --name "系統管理員" --role Admin --password secret123
 *
 * Options:
 *   --email     (required) User email address
 *   --name      (required) Display name
 *   --role      (required) One of: Engineer, "R&D Manager", Admin, Manufacturing, Procurement
 *   --password  (required) Plaintext password (will be hashed with scrypt)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { parseArgs } from "node:util";
import { getDataDir } from "./pdm-paths.mjs";

const root = process.cwd();
const dataDir = getDataDir(root);
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");

const VALID_ROLES = ["Engineer", "R&D Manager", "Admin", "Manufacturing", "Procurement"];

// ─── Parse arguments ────────────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    password: { type: "string" }
  },
  strict: true
});

const { email, name, role, password } = values;

if (!email || !name || !role || !password) {
  console.error("Usage: node scripts/create-user.mjs --email <email> --name <name> --role <role> --password <password>");
  console.error(`Valid roles: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

// ─── Hash password (mirrors src/lib/password.ts) ────────────────────────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

// ─── Open or create database ────────────────────────────────────────────
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

if (fs.existsSync(schemaPath)) {
  db.exec(fs.readFileSync(schemaPath, "utf8"));
}

// ─── Check for existing user ────────────────────────────────────────────
const existing = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
if (existing) {
  console.error(`User with email "${email}" already exists (id: ${existing.id}).`);
  console.error("Use a different email, or update the password directly in the database.");
  db.close();
  process.exit(1);
}

// ─── Create user ────────────────────────────────────────────────────────
const userId = `user-${crypto.randomUUID().slice(0, 12)}`;
const now = new Date().toISOString();
const passwordHash = hashPassword(password);

db.prepare(
  "INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(userId, name, email, passwordHash, role, now, now);

db.close();

console.log(`✅ User created successfully!`);
console.log(`   ID:    ${userId}`);
console.log(`   Name:  ${name}`);
console.log(`   Email: ${email}`);
console.log(`   Role:  ${role}`);
