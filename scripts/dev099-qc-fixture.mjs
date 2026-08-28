import crypto from "node:crypto";
import Database from "better-sqlite3";
import { fixture as dev096Fixture, requireTaskDatabase, seedDev096Fixture } from "./dev096-qc-fixture.mjs";

export const fixture = {
  companyId: dev096Fixture.companyId,
  otherCompanyId: dev096Fixture.otherCompanyId,
  users: dev096Fixture.users,
  classificationRootId: "dev099-classification-root",
  classificationRootCode: "Z9901",
  classificationParts: ["dev099-classification-red", "dev099-classification-blue", "dev099-classification-black", "dev099-classification-white"],
  classificationPartNumbers: ["Z990101", "Z990102", "Z990103", "Z990104"],
  assemblyRootId: "dev099-assembly-root",
  assemblyRootCode: "Z9902",
  assemblyPartId: "dev099-assembly-part",
  assemblyPartNumber: "Z990201",
  assemblyNoMPartId: "dev099-assembly-no-m-part",
  assemblyNoMPartNumber: "Z990202",
  purchasedAssemblyRootId: "dev099-purchased-assembly-root",
  purchasedAssemblyPartId: "dev099-purchased-assembly-part",
  purchasedAssemblyPartNumber: "Z990301",
  singlePartRootId: "dev099-single-root",
  singlePartId: "dev099-single-part",
  singlePartNumber: "Z990401",
  conflictDefinitionId: "dev099-conflict-definition",
  conflictBindingPartId: "dev099-conflict-part",
  conflictBindingPartNumber: "Z990501",
  crossCompanyPartId: "dev099-cross-company-part",
  crossCompanyPartNumber: "Z990601"
};

function insert(database, table, columns, values, ledger) {
  const placeholders = columns.map(() => "?").join(",");
  const result = database.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`).run(...values);
  if (result.changes) ledger.push({ table, id: values[0] });
}

function stableUuid(kind, source) {
  const bytes = crypto.createHash("sha256").update(`dev099|${kind}|${source}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function seedDev099Fixture() {
  const { databasePath } = requireTaskDatabase();
  const ledger = seedDev096Fixture();
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const now = "2026-08-26T00:00:00.000Z";
  const inserted = [...(ledger.inserted ?? [])];
  const companyId = fixture.companyId;
  const engineer = fixture.users.engineer;
  const run = database.transaction(() => {
    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], [fixture.classificationRootId, companyId, fixture.classificationRootCode, "DEV099 COLOR FAMILY", "manufactured", "Active", engineer, now, now], inserted);
    for (const [index, id] of fixture.classificationParts.entries()) {
      insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [id, companyId, fixture.classificationRootId, fixture.classificationPartNumbers[index], index + 1, String(index + 1).padStart(2, "0"), `COLOR ${index + 1}`, "manufactured", "unclassified", "Active", engineer, now, now], inserted);
      insert(database, "part_variant_attributes", ["id", "part_number_id", "material_code", "material_label", "color_code", "color_label", "surface_treatment", "variant_note", "updated_by", "created_at", "updated_at"], [stableUuid("variant", id), id, "SS304", "不鏽鋼 304", `C${index + 1}`, ["紅", "藍", "黑", "白"][index], index === 3 ? "鍍鎳" : "髮絲", "顏色差異只作候選辨識，不建立獨立 BOM", engineer, now, now], inserted);
    }
    insert(database, "drawing_numbers", ["id", "company_id", "part_root_id", "drawing_number", "purpose_code", "purpose_description", "sequence_no", "is_primary_manufacturing", "record_status", "created_by", "created_at", "updated_at"], ["dev099-classification-red-drawing", companyId, fixture.classificationRootId, "Z990101-M", "M", "Primary manufacturing", 1, 1, "Active", engineer, now, now], inserted);
    insert(database, "drawing_part_links", ["id", "drawing_number_id", "part_number_id", "link_type", "created_by", "created_at"], ["dev099-classification-red-link", "dev099-classification-red-drawing", fixture.classificationParts[0], "primary_manufacturing", engineer, now], inserted);

    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], [fixture.assemblyRootId, companyId, fixture.assemblyRootCode, "DEV099 MANUFACTURED ASSEMBLY", "manufactured", "Active", engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.assemblyPartId, companyId, fixture.assemblyRootId, fixture.assemblyPartNumber, 1, "01", "ASSEMBLY WITH M", "manufactured", "assembly", "Active", engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.assemblyNoMPartId, companyId, fixture.assemblyRootId, fixture.assemblyNoMPartNumber, 2, "02", "ASSEMBLY WITHOUT M", "manufactured", "assembly", "Active", engineer, now, now], inserted);
    insert(database, "drawing_numbers", ["id", "company_id", "part_root_id", "drawing_number", "purpose_code", "purpose_description", "sequence_no", "is_primary_manufacturing", "record_status", "created_by", "created_at", "updated_at"], ["dev099-assembly-drawing", companyId, fixture.assemblyRootId, "Z990201-M", "M", "Primary manufacturing", 1, 1, "Active", engineer, now, now], inserted);
    insert(database, "drawing_part_links", ["id", "drawing_number_id", "part_number_id", "link_type", "created_by", "created_at"], ["dev099-assembly-link", "dev099-assembly-drawing", fixture.assemblyPartId, "primary_manufacturing", engineer, now], inserted);

    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], [fixture.purchasedAssemblyRootId, companyId, "Z9903", "DEV099 PURCHASED ASSEMBLY", "purchased", "Active", engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.purchasedAssemblyPartId, companyId, fixture.purchasedAssemblyRootId, fixture.purchasedAssemblyPartNumber, 1, "01", "PURCHASED ASSEMBLY", "purchased", "assembly", "Active", engineer, now, now], inserted);

    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], [fixture.singlePartRootId, companyId, "Z9904", "DEV099 SINGLE PART", "manufactured", "Active", engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.singlePartId, companyId, fixture.singlePartRootId, fixture.singlePartNumber, 1, "01", "SINGLE PART", "manufactured", "single_part", "Active", engineer, now, now], inserted);

    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], ["dev099-conflict-root", companyId, "Z9905", "DEV099 BOM CONFLICT", "manufactured", "Active", engineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.conflictBindingPartId, companyId, "dev099-conflict-root", fixture.conflictBindingPartNumber, 1, "01", "BOM CONFLICT", "manufactured", "assembly", "Active", engineer, now, now], inserted);
    insert(database, "bom_definitions", ["id", "company_id", "part_root_id", "row_version", "created_by", "updated_by", "created_at", "updated_at"], [fixture.conflictDefinitionId, companyId, "dev099-conflict-root", 1, engineer, engineer, now, now], inserted);
    insert(database, "bom_definition_parent_bindings", ["id", "company_id", "definition_id", "part_number_id", "bound_from_bom_revision", "created_by", "created_at"], ["dev099-conflict-binding", companyId, fixture.conflictDefinitionId, fixture.conflictBindingPartId, "1", engineer, now], inserted);

    insert(database, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "created_by", "created_at", "updated_at"], ["dev099-cross-company-root", fixture.otherCompanyId, "Z9906", "DEV099 CROSS COMPANY", "manufactured", "Active", fixture.users.otherEngineer, now, now], inserted);
    insert(database, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "record_status", "created_by", "created_at", "updated_at"], [fixture.crossCompanyPartId, fixture.otherCompanyId, "dev099-cross-company-root", fixture.crossCompanyPartNumber, 1, "01", "CROSS COMPANY", "manufactured", "unclassified", "Active", fixture.users.otherEngineer, now, now], inserted);
  });
  run();
  const parts = database.prepare("SELECT id, company_id FROM part_numbers WHERE company_id = ?").all(companyId);
  const insertAggregate = database.prepare(`INSERT OR IGNORE INTO pdm_workbench_aggregates (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at) VALUES (? ,?,'part',?,0,1,?)`);
  const insertState = database.prepare(`INSERT OR IGNORE INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,row_version,created_at,updated_at) VALUES (? ,?,'part',?,'part_formal',NULL,NULL,NULL,'none',1,?,?)`);
  for (const part of parts) {
    insertAggregate.run(stableUuid("aggregate", part.id), part.company_id, part.id, now);
    insertState.run(stableUuid("state", part.id), part.company_id, part.id, now, now);
  }
  database.prepare(`UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='dev099-browser-fixture', schema_hash='dev090-v1', row_version=row_version+1, switched_at=? WHERE id=1`).run(now);
  const foreignKeys = database.pragma("foreign_key_check");
  database.close();
  if (foreignKeys.length) throw new Error(`DEV099_FIXTURE_FOREIGN_KEY:${JSON.stringify(foreignKeys)}`);
  return { name: "F099", base: ledger, inserted, roots: 7, parts: 13, foreignKeyViolations: 0 };
}

export function fixtureDatabasePath() {
  return requireTaskDatabase().databasePath;
}
