import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const token = Date.now().toString().slice(-6);
const results = [];

const requiredIndexes = [
  "idx_submissions_created_at",
  "idx_submissions_submitted_created_at",
  "idx_submissions_submitted_status_created_at",
  "idx_submissions_item_created_at",
  "idx_submissions_drawing_number",
  "idx_submissions_finder_fields",
  "idx_submission_files_original_filename",
  "idx_file_references_referenced_drawing_number",
  "idx_bom_lines_child_part_revision"
];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function dbPath() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return path.join(dataDir, "ai-pdm.sqlite");
}

function explain(db, sql, ...values) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values).map((row) => String(row.detail)).join("\n");
}

function seedIndexedRows(db) {
  const now = new Date().toISOString();
  const itemId = `item-idx-${token}`;
  const submissionId = `SUB-IDX-${token}`;
  const fileId = `file-idx-${token}`;
  const referenceId = `ref-idx-${token}`;
  const bomHeaderId = `bom-idx-${token}`;
  db.prepare("INSERT OR IGNORE INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    itemId,
    `P-IDX-${token}`,
    "Search index seed",
    "A",
    now,
    now
  );
  db.prepare(
    `INSERT OR IGNORE INTO submissions (
      id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine,
      material, surface_finish, document_type, change_description, status, submitted_by, approval_required, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    submissionId,
    itemId,
    `IDX-${token}`,
    "A",
    `Line-${token}`,
    `Customer-${token}`,
    `Project-${token}`,
    `Process-${token}`,
    `Machine-${token}`,
    `Material-${token}`,
    `Finish-${token}`,
    "Drawing",
    "QC seed for search indexes",
    "Pending",
    "user-engineer-demo",
    1,
    now,
    now
  );
  db.prepare(
    "INSERT OR IGNORE INTO submission_files (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(fileId, submissionId, "pdf", `IDX-${token}.pdf`, `data/repository/IDX-${token}.pdf`, "idx-hash", 10, now);
  db.prepare(
    `INSERT OR IGNORE INTO file_references (
      id, submission_id, source_file_id, source_filename, source_file_role, referenced_filename,
      referenced_part_number, referenced_drawing_number, referenced_revision, reference_type, quantity,
      extraction_method, confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    referenceId,
    submissionId,
    fileId,
    `IDX-${token}.sldasm`,
    "sldasm",
    `IDX-CHILD-${token}.sldprt`,
    `P-IDX-CHILD-${token}`,
    `D-IDX-CHILD-${token}`,
    "A",
    "assembly_component",
    1,
    "qc_index",
    "high",
    now
  );
  db.prepare(
    "INSERT OR IGNORE INTO bom_headers (id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(bomHeaderId, itemId, submissionId, "A", "Draft", "cad_references", 1, now, now);
  db.prepare(
    "INSERT OR IGNORE INTO bom_lines (id, bom_header_id, line_no, child_part_number, child_revision, quantity, source_file_id, source_reference_id, source_filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`bom-line-idx-${token}`, bomHeaderId, 1, `P-IDX-CHILD-${token}`, "A", 1, fileId, referenceId, `IDX-${token}.sldasm`, now);
  return { submissionId };
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function run() {
  const db = new Database(dbPath());
  db.exec(await (await import("node:fs/promises")).readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  const seed = seedIndexedRows(db);
  const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name));
  for (const indexName of requiredIndexes) {
    record(`IDX-001 required index exists ${indexName}`, indexes.has(indexName));
  }

  const scopedListPlan = explain(
    db,
    "SELECT id FROM submissions WHERE submitted_by = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    "user-engineer-demo",
    "Pending",
    100,
    0
  );
  record("IDX-002 scoped status list uses composite index", scopedListPlan.includes("idx_submissions_submitted_status_created_at"), scopedListPlan);

  const createdPlan = explain(db, "SELECT id FROM submissions ORDER BY created_at DESC LIMIT ?", 100);
  record("IDX-003 all-submissions list uses created_at index", createdPlan.includes("idx_submissions_created_at"), createdPlan);

  const childPlan = explain(db, "SELECT id FROM bom_lines WHERE child_part_number = ? AND child_revision = ?", `P-IDX-CHILD-${token}`, "A");
  record("IDX-004 child part revision lookup uses index", childPlan.includes("idx_bom_lines_child_part_revision"), childPlan);

  const referencePlan = explain(db, "SELECT id FROM file_references WHERE referenced_drawing_number = ?", `D-IDX-CHILD-${token}`);
  record("IDX-005 referenced drawing lookup uses index", referencePlan.includes("idx_file_references_referenced_drawing_number"), referencePlan);
  db.close();

  const cookie = await login("engineer@example.com");
  const searchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(`IDX-${token}`)}&status=Pending`, {
    headers: { cookie }
  });
  const searchBody = await searchResponse.json().catch(() => ({}));
  record("IDX-006 API search still returns seeded row", searchBody.submissions?.some((submission) => submission.id === seed.submissionId));

  console.log(JSON.stringify({ passed: results.length, failed: 0, token, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, token, results, error: error.message }, null, 2));
  process.exit(1);
});
