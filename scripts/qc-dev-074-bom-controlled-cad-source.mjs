#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-074-bom-source-${crypto.randomUUID()}`);
process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.NODE_ENV = "test";

let database;
try {
  const [dbModule, contextModule, workbenchModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/bom-create-context"),
    import("@/lib/bom-workbench-async")
  ]);
  database = dbModule.getDb();
  database.pragma("foreign_keys = OFF");
  database.exec(`
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status,
      rule_version_id, created_by, created_at, updated_at
    ) VALUES (
      'dev074-bom-root', 'company-jenfu', 'Q074B', 'DEV-074 BOM controlled source',
      'manufactured', 'Active', 'numbering-rule-v3-alpha-root', 'user-manager-demo',
      datetime('now'), datetime('now')
    );
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code,
      part_name, item_kind, is_universal, bom_usage_policy, record_status,
      rule_version_id, created_by, created_at, updated_at
    ) VALUES (
      'dev074-bom-part', 'company-jenfu', 'dev074-bom-root', 'Q074B-P01', 1, '01',
      'DEV-074 BOM assembly', 'manufactured', 0, 'undecided', 'Active',
      'numbering-rule-v3-alpha-root', 'user-manager-demo', datetime('now'), datetime('now')
    );
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no,
      is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (
      'dev074-bom-drawing', 'company-jenfu', 'dev074-bom-root', 'Q074B-M01', 'M', 1,
      1, 'Active', 'numbering-rule-v3-alpha-root', 'user-manager-demo', datetime('now'), datetime('now')
    );
    INSERT INTO drawing_part_links (
      id, drawing_number_id, part_number_id, link_type, created_by, created_at
    ) VALUES (
      'dev074-bom-link', 'dev074-bom-drawing', 'dev074-bom-part',
      'primary_manufacturing', 'user-manager-demo', datetime('now')
    );
    INSERT INTO drawing_revision_packages (
      id, company_id, drawing_number_id, drawing_number, revision, status,
      created_by, created_at, updated_at
    ) VALUES (
      'dev074-bom-package', 'company-jenfu', 'dev074-bom-drawing', 'Q074B-M01',
      '0.1', 'Pending', 'user-manager-demo', datetime('now'), datetime('now')
    );
    INSERT INTO file_assets (
      id, storage_provider, file_name, file_ext, file_size, content_hash,
      linked_entity_type, linked_entity_id, display_name, deleted_at, created_at, updated_at
    ) VALUES (
      'dev074-bom-asset', 'local_repository', 'fixture.SLDASM', 'sldasm', 42,
      'dev074-bom-content', 'drawing_number', 'dev074-bom-drawing', 'fixture.SLDASM',
      NULL, datetime('now'), datetime('now')
    );
    INSERT INTO drawing_revision_package_files (
      id, package_id, source_file_asset_id, role, role_source, display_name,
      sort_order, is_primary, created_by, created_at
    ) VALUES (
      'dev074-bom-package-file', 'dev074-bom-package', 'dev074-bom-asset',
      'cad_3d', 'extension', 'fixture.SLDASM', 0, 1, 'user-manager-demo', datetime('now')
    );
    INSERT INTO numbering_candidate_revision_drafts (
      id, company_id, workspace_id, drawing_draft_id, candidate_reservation_id,
      revision, lifecycle_status, row_version, approval_request_id, review_snapshot_hash,
      formal_drawing_number_id, formal_revision_package_id, created_by, created_at,
      updated_by, updated_at, promoted_at
    ) VALUES (
      'dev074-bom-candidate', 'company-jenfu', 'dev074-bom-workspace',
      'dev074-bom-drawing-draft', 'dev074-bom-reservation', '0.1', 'promoted', 1,
      'dev074-bom-approval', 'dev074-bom-review-hash', 'dev074-bom-drawing',
      'dev074-bom-package', 'user-manager-demo', datetime('now'), 'user-manager-demo',
      datetime('now'), datetime('now')
    );
  `);
  database.pragma("foreign_keys = ON");

  const user = database.prepare("SELECT * FROM users WHERE id = 'user-manager-demo'").get();
  assert.ok(user, "manager fixture user exists");

  const assemblyOptions = await contextModule.listBomCreateAssemblyOptionsAsync({
    user,
    companyId: "company-jenfu",
    query: "Q074B-P01"
  });
  assert.ok(assemblyOptions.some((option) => option.id === "dev074-bom-part"), "controlled SLDASM exposes the assembly owner");

  const sources = await contextModule.listBomCreateCadSourcesAsync({
    user,
    companyId: "company-jenfu",
    ownerPartNumberId: "dev074-bom-part"
  });
  assert.deepEqual(
    sources.map(({ id, sourceKind }) => ({ id, sourceKind })),
    [{ id: "dev074-bom-package", sourceKind: "revision_package" }],
    "controlled revision package is a selectable CAD source"
  );

  const created = await workbenchModule.createCanonicalBomDraftAsync({
    companyId: "company-jenfu",
    ownerPartNumberId: "dev074-bom-part",
    ownerPartNumber: "Q074B-P01",
    legacyItemId: null,
    bomRevision: "1",
    source: "cad_reference",
    sourceRevisionPackageId: "dev074-bom-package",
    actorId: user.id,
    idempotencyKey: "dev074-bom-controlled-source",
    requestFingerprint: "dev074-bom-controlled-source-fingerprint"
  });
  assert.equal(created.draft.source_submission_id, null);
  assert.equal(created.draft.source_revision_package_id, "dev074-bom-package");
  assert.equal(created.draft.source, "cad_reference");
  assert.equal(created.draft.lines.length, 0);

  console.log(
    JSON.stringify(
      {
        passed: true,
        assemblyOption: assemblyOptions.find((option) => option.id === "dev074-bom-part"),
        cadSource: sources[0],
        draftId: created.draft.id,
        sourceRevisionPackageId: created.draft.source_revision_package_id
      },
      null,
      2
    )
  );
} finally {
  if (database?.open) database.close();
  if (fixtureRoot.startsWith(path.join(root, ".tmp", "qc-dev-074-bom-source-"))) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
