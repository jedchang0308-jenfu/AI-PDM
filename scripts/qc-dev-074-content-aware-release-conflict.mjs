#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-074-content-conflict-${crypto.randomUUID()}`);
process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.NODE_ENV = "test";

let database;
try {
  const [dbModule, providerModule, asyncReleaseModule, syncReleaseModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/release-async-repository"),
    import("@/lib/repositories/submission-file-repository")
  ]);
  database = dbModule.getDb();
  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const asyncRepository = new asyncReleaseModule.AsyncReleaseRepository(client);
  const actorId = "dev074-content-conflict-user";
  const companyId = "company-jenfu";
  const sameHash = crypto.createHash("sha256").update("DEV-074 IDENTICAL CAD BYTES").digest("hex");
  const differentHash = crypto.createHash("sha256").update("DEV-074 CHANGED CAD BYTES").digest("hex");

  database.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      :actorId, 'DEV-074 Content Conflict', 'dev074-content-conflict@example.invalid', NULL,
      'Engineer', :companyId, 'active', 1, datetime('now'), datetime('now')
    )
  `).run({ actorId, companyId });
  database.prepare(`
    INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES (:actorId, :companyId, 1, datetime('now'))
  `).run({ actorId, companyId });

  for (const [itemId, partNumber] of [["dev074-content-current-item", "A074-P01"], ["dev074-content-released-item", "A074-P02"]]) {
    database.prepare(`
      INSERT INTO items (id, company_id, part_number, part_name)
      VALUES (:itemId, :companyId, :partNumber, 'DEV-074 content identity')
    `).run({ itemId, companyId, partNumber });
  }
  for (const submission of [
    { id: "dev074-content-current", itemId: "dev074-content-current-item", drawingNumber: "A074-M01", status: "Pending" },
    { id: "dev074-content-released", itemId: "dev074-content-released-item", drawingNumber: "A074-M02", status: "Released" }
  ]) {
    database.prepare(`
      INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish,
        document_type, change_description, status, submitted_by, released_at
      ) VALUES (
        :id, :companyId, :itemId, :drawingNumber, '0.1', 'SUS304', 'none',
        'Drawing', 'DEV-074 content-aware filename conflict', :status, :actorId,
        CASE WHEN :status = 'Released' THEN datetime('now') ELSE NULL END
      )
    `).run({ ...submission, companyId, actorId });
  }
  database.prepare(`
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, sha256, file_size
    ) VALUES (
      'dev074-content-released-file', 'dev074-content-released', 'sldprt',
      'D-0007-MA1.SLDPRT', 'fixtures/D-0007-MA1.SLDPRT', :sameHash, 128
    )
  `).run({ sameHash });

  const sameContentInput = {
    submissionId: "dev074-content-current",
    files: [{ file_role: "sldprt", original_filename: "D-0007-MA1.SLDPRT", sha256: sameHash }]
  };
  const changedContentInput = {
    submissionId: "dev074-content-current",
    files: [{ file_role: "sldprt", original_filename: "D-0007-MA1.SLDPRT", sha256: differentHash }]
  };
  const unknownContentInput = {
    submissionId: "dev074-content-current",
    files: [{ file_role: "sldprt", original_filename: "D-0007-MA1.SLDPRT" }]
  };

  assert.equal(syncReleaseModule.findReleasedFilenameConflicts(sameContentInput).length, 0);
  assert.equal((await asyncRepository.findReleasedFilenameConflicts(sameContentInput)).length, 0);
  assert.equal(syncReleaseModule.findReleasedFilenameConflicts(changedContentInput).length, 1);
  assert.equal((await asyncRepository.findReleasedFilenameConflicts(changedContentInput)).length, 1);
  assert.equal(syncReleaseModule.findReleasedFilenameConflicts(unknownContentInput).length, 1);
  assert.equal((await asyncRepository.findReleasedFilenameConflicts(unknownContentInput)).length, 1);

  console.log(JSON.stringify({
    passed: 3,
    failed: 0,
    results: [
      "same filename, role, and SHA-256 content is reusable across released revisions",
      "same filename and role with different SHA-256 content remains blocked",
      "missing content identity remains fail-closed"
    ]
  }, null, 2));
} finally {
  try { database?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) fs.rmSync(resolvedFixture, { recursive: true, force: true });
}
