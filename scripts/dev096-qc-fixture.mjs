import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const fixture = {
  companyId: "company-jenfu",
  otherCompanyId: "dev096-other-company",
  users: {
    engineer: "dev096-engineer",
    manager: "dev096-manager",
    admin: "dev096-admin",
    manufacturing: "dev096-manufacturing",
    procurement: "dev096-procurement",
    otherEngineer: "dev096-other-engineer"
  },
  parentRootId: "dev096-parent-root",
  childRootId: "dev096-child-root",
  otherRootId: "dev096-other-root",
  parents: { red: "dev096-parent-red", blue: "dev096-parent-blue", black: "dev096-parent-black" },
  children: { red: "dev096-child-red", blue: "dev096-child-blue", black: "dev096-child-black" }
};

export function requireTaskDatabase() {
  const dataDirValue = process.env.PDM_DATA_DIR?.trim();
  const repositoryDirValue = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!dataDirValue || !repositoryDirValue) throw new Error("DEV096_TASK_PATHS_REQUIRED");
  const root = process.cwd();
  const dataDir = path.resolve(dataDirValue);
  const primary = path.resolve(root, "data");
  if (dataDir.toLowerCase() === primary.toLowerCase()) throw new Error("DEV096_PRIMARY_DATA_FORBIDDEN");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  if (!fs.existsSync(databasePath)) throw new Error(`DEV096_DATABASE_NOT_FOUND:${databasePath}`);
  return { dataDir, repositoryDir: path.resolve(repositoryDirValue), databasePath };
}

export function seedDev096Fixture() {
  const { databasePath } = requireTaskDatabase();
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const before = snapshot(database);
  const now = "2026-08-24T00:00:00.000Z";
  const inserted = [];
  const run = database.transaction(() => {
    insert(database, "companies", ["id", "company_code", "display_name", "created_at", "updated_at"], [fixture.otherCompanyId, "DEV096X", "DEV096 Other Company", now, now], inserted);
    for (const [key, role] of [["engineer", "Engineer"], ["manager", "R&D Manager"], ["admin", "Admin"], ["manufacturing", "Manufacturing"], ["procurement", "Procurement"]]) {
      const id = fixture.users[key];
      insert(database, "users", ["id", "display_name", "email", "role", "company_id", "created_at", "updated_at"], [id, `DEV096 ${key}`, `${id}@example.invalid`, role, fixture.companyId, now, now], inserted);
    }
    insert(database, "users", ["id", "display_name", "email", "role", "company_id", "created_at", "updated_at"], [fixture.users.otherEngineer, "DEV096 Other Engineer", "dev096-other@example.invalid", "Engineer", fixture.otherCompanyId, now, now], inserted);
    for (const [id, code, name, companyId] of [
      [fixture.parentRootId, "Z9601", "ASM COLOR", fixture.companyId],
      [fixture.childRootId, "Z9602", "CHILD COLOR", fixture.companyId],
      [fixture.otherRootId, "Z9603", "OTHER ROOT", fixture.companyId],
      ["dev096-cross-company-root", "Z9604", "CROSS COMPANY", fixture.otherCompanyId]
    ]) insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], [id, companyId, code, name, "manufactured", "Active", companyId === fixture.companyId ? fixture.users.engineer : fixture.users.otherEngineer, now, now], inserted);
    const parents = [
      [fixture.parents.red, "Z960101", "RED ASSEMBLY", "01"],
      [fixture.parents.blue, "Z960102", "BLUE ASSEMBLY", "02"],
      [fixture.parents.black, "Z960103", "BLACK ASSEMBLY", "03"]
    ];
    for (const [id, number, name, sequence] of parents) {
      insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [id, fixture.companyId, fixture.parentRootId, number, Number(sequence), sequence, name, "manufactured", "assembly", "Active", fixture.users.engineer, now, now], inserted);
      const drawingId = `${id}-drawing`;
      insert(database, "drawing_numbers", ["id", "company_id", "part_root_id", "drawing_number", "purpose_code", "purpose_description", "sequence_no", "is_primary_manufacturing", "record_status", "created_by", "created_at", "updated_at"], [drawingId, fixture.companyId, fixture.parentRootId, `${number}-M`, "M", "Primary manufacturing", Number(sequence), 1, "Active", fixture.users.engineer, now, now], inserted);
      insert(database, "drawing_part_links", ["id", "drawing_number_id", "part_number_id", "link_type", "created_by", "created_at"], [`${id}-link`, drawingId, id, "primary_manufacturing", fixture.users.engineer, now], inserted);
    }
    for (const [id, number, name, sequence] of [
      [fixture.children.red, "Z960201", "RED CHILD", "01"],
      [fixture.children.blue, "Z960202", "BLUE CHILD", "02"],
      [fixture.children.black, "Z960203", "BLACK CHILD", "03"]
    ]) insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [id, fixture.companyId, fixture.childRootId, number, Number(sequence), sequence, name, "manufactured", "single_part", "Active", fixture.users.engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], ["dev096-single-parent", fixture.companyId, fixture.parentRootId, "Z960104", 4, "04", "SINGLE", "manufactured", "single_part", "Active", fixture.users.engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], ["dev096-no-m-parent", fixture.companyId, fixture.parentRootId, "Z960105", 5, "05", "NO M", "manufactured", "assembly", "Active", fixture.users.engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], ["dev096-inactive-parent", fixture.companyId, fixture.parentRootId, "Z960106", 6, "06", "INACTIVE", "manufactured", "assembly", "Obsolete", fixture.users.engineer, now, now], inserted);
  });
  run();
  const after = snapshot(database);
  const foreignKeys = database.pragma("foreign_key_check");
  database.close();
  if (foreignKeys.length) throw new Error(`DEV096_FIXTURE_FOREIGN_KEY:${JSON.stringify(foreignKeys)}`);
  return { before, after, inserted };
}

function insert(database, table, columns, values, ledger) {
  const placeholders = columns.map(() => "?").join(",");
  const result = database.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`).run(...values);
  if (result.changes) ledger.push({ table, id: values[0] });
}

function snapshot(database) {
  const count = (table) => Number(database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() ?? 0);
  return { companies: count("companies"), users: count("users"), roots: count("part_roots"), parts: count("part_numbers"), drawings: count("drawing_numbers"), links: count("drawing_part_links") };
}
