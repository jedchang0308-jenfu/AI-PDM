import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getDataDir, getRepositoryDir } from "./pdm-paths.mjs";

const root = process.cwd();
const dataDir = getDataDir(root);
const repositoryDir = getRepositoryDir(root);
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });

const db = new Database(dbPath);
db.exec(fs.readFileSync(schemaPath, "utf8"));

// ─── Password hashing (mirrors src/lib/password.ts) ─────────────────────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

const now = new Date().toISOString();
const demoHash = hashPassword("pdm-demo");
const engineerId = "user-engineer-demo";
const managerId = "user-manager-demo";
const itemId = "item-demo-a001";
const submissionId = "SUB-20260515-0001";
const fileId = "file-demo-a001-pdf";
const demoDir = path.join(repositoryDir, "pending", "2026", "05", submissionId);
const demoFile = path.join(demoDir, "A-001_RevA_drawing_demo.pdf");

fs.mkdirSync(demoDir, { recursive: true });
fs.writeFileSync(demoFile, "AI PDM demo PDF placeholder\n");

const hash = crypto.createHash("sha256").update(fs.readFileSync(demoFile)).digest("hex");
const size = fs.statSync(demoFile).size;

db.prepare(
  "INSERT OR IGNORE INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(engineerId, "Demo Engineer", "engineer@example.com", demoHash, "Engineer", now, now);

db.prepare(
  "INSERT OR IGNORE INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(managerId, "研發經理", "manager@example.com", demoHash, "R&D Manager", now, now);

db.prepare(
  "INSERT OR IGNORE INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run(itemId, "P-1001", "定位治具座", "A", now, now);

db.prepare(
  `INSERT OR IGNORE INTO submissions (
    id, item_id, drawing_number, revision, material, surface_finish, document_type,
    change_description, status, submitted_by, approval_required, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  submissionId,
  itemId,
  "A-001",
  "A",
  "SUS304",
  "拋光",
  "Drawing",
  "加大固定孔徑，配合新版治具定位銷",
  "Pending",
  engineerId,
  1,
  now,
  now
);

db.prepare(
  `INSERT OR IGNORE INTO submission_files (
    id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(fileId, submissionId, "pdf", "A-001_RevA.pdf", demoFile, null, "none", hash, size, now);

db.prepare(
  "INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run(crypto.randomUUID(), submissionId, engineerId, "SeedDemo", JSON.stringify({ source: "scripts/seed.mjs" }), now);

db.close();

console.log("Seeded demo users (password: pdm-demo) and one pending submission.");
