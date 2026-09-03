import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Existing-data reconciliation is deliberately a separate, release-gated
// command.  It never defaults to a write and never accepts the primary data
// directory as an implicit target.
const root = process.cwd();
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const mode = String(args.get("--mode") ?? "dry-run");
if (!["dry-run", "apply"].includes(mode)) throw new Error("DEV109_RECONCILE_MODE_INVALID");
const dataDir = requiredTaskPath("PDM_DATA_DIR");
const repositoryDir = requiredTaskPath("PDM_REPOSITORY_DIR");
if (same(dataDir, path.join(root, "data")) || same(repositoryDir, path.join(root, "repository"))) {
  throw new Error("DEV109_PRIMARY_DATA_FORBIDDEN");
}
const databasePath = path.resolve(String(args.get("--database") ?? path.join(dataDir, "ai-pdm.sqlite")));
within(databasePath, dataDir, "DEV109_DATABASE_OUTSIDE_TASK_DATA");
if (!fs.existsSync(databasePath)) throw new Error("DEV109_DATABASE_NOT_FOUND");
const evidenceDir = path.resolve(String(args.get("--evidence-dir") ?? path.join(dataDir, "dev-109-sldasm-reconcile-evidence")));
within(evidenceDir, dataDir, "DEV109_EVIDENCE_OUTSIDE_TASK_DATA");
fs.mkdirSync(evidenceDir, { recursive: true });

const db = new Database(databasePath, { readonly: mode === "dry-run", fileMustExist: true });
db.pragma("foreign_keys = ON");
const before = inventory(db);
if (mode === "dry-run") {
  const result = { mode, databasePath, dataDir, repositoryDir, productionWrites: false, before, applied: 0 };
  writeEvidence(result);
  db.close();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// `--mode=apply` is only usable against a task-owned rehearsal copy.  A
// production apply must be performed by the deployment/release gate, which
// supplies its own audited migration command and approval.
let applied = 0;
db.exec("BEGIN IMMEDIATE");
try {
  for (const row of before.exactTargets) {
    const current = db.prepare("SELECT structure_type FROM part_numbers WHERE id = ? AND company_id = ?").get(row.part_id, row.company_id);
    if (!current || current.structure_type === "assembly") continue;
    db.prepare("UPDATE part_numbers SET structure_type = 'assembly', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND structure_type <> 'assembly'").run(row.part_id, row.company_id);
    db.prepare("INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, NULL, NULL, 'bom.sldasm.existing_evidence_reconcile', ?, CURRENT_TIMESTAMP)").run(
      crypto.randomUUID(),
      JSON.stringify({
        companyId: row.company_id,
        partNumberId: row.part_id,
        drawingNumberId: row.drawing_number_id,
        beforeStructureType: current.structure_type,
        afterStructureType: "assembly",
        reason: "formal_primary_sldasm",
        evidence: "formal_primary_sldasm"
      })
    );
    applied += 1;
  }
  db.exec("COMMIT");
} catch (error) {
  try { db.exec("ROLLBACK"); } catch {}
  db.close();
  throw error;
}
const after = inventory(db);
const result = { mode, databasePath, dataDir, repositoryDir, productionWrites: false, before, after, applied, foreignKeyViolations: db.pragma("foreign_key_check") };
writeEvidence(result);
db.close();
if (result.foreignKeyViolations.length) throw new Error(`DEV109_RECONCILE_FOREIGN_KEY_CHECK_FAILED:${JSON.stringify(result.foreignKeyViolations)}`);
console.log(JSON.stringify(result, null, 2));

function inventory(database) {
  const rows = database.prepare(`
     SELECT state.company_id,
            drawing.id AS drawing_number_id,
            p.id AS part_id,
            p.structure_type,
            p.record_status,
            p.company_id AS part_company_id
       FROM canonical_workbench_states state
       JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id
       JOIN drawings canonical_drawing ON canonical_drawing.id = revision.drawing_id AND canonical_drawing.company_id = state.company_id
       JOIN drawing_numbers drawing ON drawing.id = canonical_drawing.formal_drawing_number_id
        AND drawing.company_id = state.company_id
        AND drawing.purpose_code IN ('MA', 'M') AND drawing.is_primary_manufacturing = 1
        AND drawing.record_status NOT IN ('Obsolete', 'Merged')
       JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id AND file.company_id = state.company_id
        AND file.role = 'cad_3d' AND file.is_primary = 1 AND file.removed_at IS NULL
       JOIN file_assets asset ON asset.id = file.source_file_asset_id
        AND asset.deleted_at IS NULL AND lower(trim(asset.file_ext)) = 'sldasm'
      LEFT JOIN drawing_part_links link ON link.drawing_number_id = drawing.id
       AND link.link_type = 'primary_manufacturing'
      LEFT JOIN part_numbers p ON p.id = link.part_number_id
      WHERE state.entity_type = 'drawing'
        AND state.revision_id IS NOT NULL
      ORDER BY state.company_id, drawing.id, p.id
   `).all();
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.company_id}:${row.drawing_number_id}`;
    const entry = grouped.get(key) ?? { company_id: row.company_id, drawing_number_id: row.drawing_number_id, partIds: new Set(), crossCompany: false, structures: [] };
    if (row.part_id) {
      entry.partIds.add(row.part_id);
      entry.structures.push(row.structure_type);
      if (row.part_company_id !== row.company_id) entry.crossCompany = true;
    }
    grouped.set(key, entry);
  }
  const exactTargets = [];
  let alreadyAssembly = 0;
  let noTarget = 0;
  let ambiguous = 0;
  let crossCompany = 0;
  let terminal = 0;
  for (const entry of grouped.values()) {
    if (entry.crossCompany) { crossCompany += 1; continue; }
    if (entry.partIds.size === 0) { noTarget += 1; continue; }
    if (entry.partIds.size !== 1) { ambiguous += 1; continue; }
    const partId = [...entry.partIds][0];
    const structure = entry.structures[0];
    if (structure === "assembly") alreadyAssembly += 1;
    else if (["Obsolete", "Merged"].includes(entry.record_status)) terminal += 1;
    else exactTargets.push({ company_id: entry.company_id, drawing_number_id: entry.drawing_number_id, part_id: partId });
  }
  const scopeFingerprint = hashJson(rows.map((row) => ({
    company_id: row.company_id,
    drawing_number_id: row.drawing_number_id,
    part_id: row.part_id ?? null,
    part_company_id: row.part_company_id ?? null,
    structure_type: row.structure_type ?? null,
    record_status: row.record_status ?? null
  })));
  const planHash = hashJson(exactTargets);
  return {
    activePrimarySldasmEvidence: grouped.size,
    exactTargetCount: exactTargets.length,
    alreadyAssemblyCount: alreadyAssembly,
    noTargetCount: noTarget,
    ambiguousCount: ambiguous,
    crossCompanyCount: crossCompany,
    terminalCount: terminal,
    exactTargets,
    scopeFingerprint,
    planHash,
    foreignKeyViolations: database.pragma("foreign_key_check")
  };
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requiredTaskPath(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`DEV109_${name}_REQUIRED`);
  fs.mkdirSync(value, { recursive: true });
  return path.resolve(value);
}
function within(target, base, code) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(code);
}
function same(left, right) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }
function writeEvidence(value) { fs.writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(value, null, 2)}\n`); }
