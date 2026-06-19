import crypto from "node:crypto";
import { getAuthMode, type UserRole } from "@/lib/auth-config";
import { type SqliteDatabase } from "@/lib/db-provider";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const validUserRoles: UserRole[] = ["Engineer", "R&D Manager", "Admin", "Manufacturing", "Procurement"];

const DEMO_PASSWORD = "pdm-demo";
export { getAuthMode };

function shouldSeedDemoUsers() {
  return getAuthMode() === "demo";
}

function parseBootstrapUsers(): Array<{
  id?: string;
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  companyCodes: string[];
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
    const companyCodes = parseCompanyCodes(value.companyCodes ?? value.companyCode);

    if (!displayName || !email || !password || !validUserRoles.includes(role)) {
      throw new Error(`INVALID_BOOTSTRAP_USERS: entry ${index} requires displayName, email, password, and valid role`);
    }

    return { id, displayName, email, password, role, companyCodes };
  });
}

function parseCompanyCodes(value: unknown) {
  const raw = Array.isArray(value) ? value : value ? [value] : ["JENFU"];
  const codes = raw.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  return codes.length > 0 ? codes : ["JENFU"];
}

function upsertUser(input: {
  id: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  companyCodes?: string[];
  now: string;
  database: SqliteDatabase;
}) {
  const companyIds = resolveCompanyIds(input.database, input.companyCodes ?? ["JENFU"]);
  const defaultCompanyId = companyIds[0] ?? "company-jenfu";
  input.database
    .prepare(
      `INSERT INTO users (id, display_name, email, password_hash, role, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         role = excluded.role,
         company_id = excluded.company_id,
         updated_at = excluded.updated_at`
    )
    .run(input.id, input.displayName, input.email, input.passwordHash, input.role, defaultCompanyId, input.now, input.now);

  input.database.prepare("DELETE FROM user_company_memberships WHERE user_id = ?").run(input.id);
  for (const [index, companyId] of companyIds.entries()) {
    input.database
      .prepare("INSERT OR IGNORE INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, ?, ?)")
      .run(input.id, companyId, index === 0 ? 1 : 0);
  }
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
      companyCodes: ["JENFU"],
      now,
      database
    });
    upsertUser({
      id: "user-manager-demo",
      displayName: "R&D Manager",
      email: "manager@example.com",
      passwordHash: demoHash,
      role: "R&D Manager",
      companyCodes: ["JENFU"],
      now,
      database
    });
    upsertUser({
      id: "user-manufacturing-demo",
      displayName: "Demo Manufacturing",
      email: "manufacturing@example.com",
      passwordHash: demoHash,
      role: "Manufacturing",
      companyCodes: ["JENFU"],
      now,
      database
    });
    upsertUser({
      id: "user-procurement-demo",
      displayName: "Demo Procurement",
      email: "procurement@example.com",
      passwordHash: demoHash,
      role: "Procurement",
      companyCodes: ["JENFU"],
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
      companyCodes: user.companyCodes,
      now,
      database
    });
  }
}

export type DbUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: UserRole;
  company_id: string;
};

export type DbUserWithPassword = DbUser & { password_hash: string | null };

export function getUserById(id: string) {
  return getDb().prepare("SELECT id, display_name, email, role, company_id FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByEmail(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, role, company_id FROM users WHERE lower(email) = lower(?)")
    .get(email) as DbUser | undefined;
}

export function getUserByEmailWithPassword(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, password_hash, role, company_id FROM users WHERE lower(email) = lower(?)")
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
      "INSERT INTO users (id, display_name, email, password_hash, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, input.displayName, input.email, input.passwordHash, input.role, "company-jenfu", now, now);
  getDb()
    .prepare("INSERT OR IGNORE INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, ?, 1)")
    .run(id, "company-jenfu");
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
  companyCodes?: string[];
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
    companyCodes: input.companyCodes ?? (input.role === "Admin" ? ["JENFU", "MAXIMA"] : ["JENFU"]),
    now,
    database: getDb()
  });
}

function resolveCompanyIds(database: SqliteDatabase, companyCodes: string[]) {
  const ids: string[] = [];
  for (const companyCode of companyCodes) {
    const row = database
      .prepare("SELECT id FROM companies WHERE upper(company_code) = upper(?)")
      .get(companyCode) as { id: string } | undefined;
    if (row && !ids.includes(row.id)) ids.push(row.id);
  }
  return ids.length > 0 ? ids : ["company-jenfu"];
}
