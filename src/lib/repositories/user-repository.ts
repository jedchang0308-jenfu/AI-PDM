import crypto from "node:crypto";
import { type SqliteDatabase } from "@/lib/db-provider";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";

type UserRole = "Engineer" | "R&D Manager" | "Admin";

const DEMO_PASSWORD = "pdm-demo";

export function getAuthMode() {
  return process.env.PDM_AUTH_MODE === "managed" ? "managed" : "demo";
}

function shouldSeedDemoUsers() {
  return getAuthMode() === "demo";
}

function parseBootstrapUsers(): Array<{
  id?: string;
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
}> {
  const raw = process.env.PDM_BOOTSTRAP_USERS?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("INVALID_BOOTSTRAP_USERS: PDM_BOOTSTRAP_USERS must be a JSON array");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`INVALID_BOOTSTRAP_USERS: entry ${index} must be an object`);
    }

    const value = entry as Record<string, unknown>;
    const id = value.id ? String(value.id).trim() : undefined;
    const displayName = String(value.displayName ?? "").trim();
    const email = String(value.email ?? "").trim();
    const password = String(value.password ?? "");
    const role = String(value.role ?? "") as UserRole;

    if (!displayName || !email || !password || !["Engineer", "R&D Manager", "Admin"].includes(role)) {
      throw new Error(`INVALID_BOOTSTRAP_USERS: entry ${index} requires displayName, email, password, and valid role`);
    }

    return { id, displayName, email, password, role };
  });
}

function upsertUser(input: {
  id: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  now: string;
  database: SqliteDatabase;
}) {
  input.database
    .prepare(
      `INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         role = excluded.role,
         updated_at = excluded.updated_at`
    )
    .run(input.id, input.displayName, input.email, input.passwordHash, input.role, input.now, input.now);
}

export function seedConfiguredUsers(database: SqliteDatabase) {
  const now = new Date().toISOString();
  if (shouldSeedDemoUsers()) {
    const demoHash = hashPassword(DEMO_PASSWORD);
    upsertUser({
      id: "user-engineer-demo",
      displayName: "Demo Engineer",
      email: "engineer@example.com",
      passwordHash: demoHash,
      role: "Engineer",
      now,
      database
    });
    upsertUser({
      id: "user-manager-demo",
      displayName: "R&D Manager",
      email: "manager@example.com",
      passwordHash: demoHash,
      role: "R&D Manager",
      now,
      database
    });
  }

  for (const user of parseBootstrapUsers()) {
    upsertUser({
      id: user.id ?? `user-${crypto.createHash("sha256").update(user.email.toLowerCase()).digest("hex").slice(0, 12)}`,
      displayName: user.displayName,
      email: user.email,
      passwordHash: hashPassword(user.password),
      role: user.role,
      now,
      database
    });
  }
}

export type DbUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: "Engineer" | "R&D Manager" | "Admin";
};

export type DbUserWithPassword = DbUser & { password_hash: string | null };

export function getUserById(id: string) {
  return getDb().prepare("SELECT id, display_name, email, role FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByEmail(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, role FROM users WHERE lower(email) = lower(?)")
    .get(email) as DbUser | undefined;
}

export function getUserByEmailWithPassword(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, password_hash, role FROM users WHERE lower(email) = lower(?)")
    .get(email) as DbUserWithPassword | undefined;
}

export function createUser(input: {
  displayName: string;
  email: string;
  passwordHash: string;
  role: DbUser["role"];
}) {
  const id = `user-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, input.displayName, input.email, input.passwordHash, input.role, now, now);
  return id;
}

export function updateUserPassword(userId: string, passwordHash: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, now, userId);
}

export function ensureDemoUser(input: {
  id: string;
  displayName: string;
  email: string;
  role: DbUser["role"];
  password?: string;
}) {
  if (!shouldSeedDemoUsers()) return;

  const now = new Date().toISOString();
  const pwHash = hashPassword(input.password ?? DEMO_PASSWORD);
  upsertUser({
    id: input.id,
    displayName: input.displayName,
    email: input.email,
    passwordHash: pwHash,
    role: input.role,
    now,
    database: getDb()
  });
}
