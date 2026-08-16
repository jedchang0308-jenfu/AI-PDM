#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-074-same-content-${crypto.randomUUID()}`);
process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";
process.env.PDM_PUBLICATION_EVIDENCE_MODE = "local_fake";
process.env.NODE_ENV = "test";

let database;
try {
  const [dbModule, providerModule, repositoryModule, detailModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-lifecycle-simplification-async-repository"),
    import("@/lib/pdm-entity-detail")
  ]);
  database = dbModule.getDb();
  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const { AsyncNumberLifecycleSimplificationRepository } = repositoryModule;
  const actorId = "dev074-relink-user";
  const companyId = "company-jenfu";
  const workspaceId = "dev074-relink-workspace";
  const drawingDraftId = "dev074-relink-drawing";

  database.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      :actorId, 'DEV-074 Relink', 'dev074-relink@example.invalid', NULL, 'R&D Manager',
      :companyId, 'active', 1, datetime('now'), datetime('now')
    )
  `).run({ actorId, companyId });
  database.prepare(`
    INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES (:actorId, :companyId, 1, datetime('now'))
  `).run({ actorId, companyId });
  database.prepare(`
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by,
      row_version, created_at, updated_at
    ) VALUES (
      :workspaceId, :companyId, 'new_bundle', 'active', :actorId, :actorId,
      1, datetime('now'), datetime('now')
    )
  `).run({ workspaceId, companyId, actorId });
  database.prepare(`
    INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES (
      'dev074-relink-root', :companyId, :workspaceId, 'DEV-074 Relink', 'manufactured',
      'numbering-rule-v3-alpha-root', datetime('now'), datetime('now')
    )
  `).run({ workspaceId, companyId });
  database.prepare(`
    INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, root_draft_id, part_name, item_kind,
      is_universal, created_at, updated_at
    ) VALUES (
      'dev074-relink-part', :companyId, :workspaceId, 'dev074-relink-root',
      'DEV-074 Relink', 'manufactured', 0, datetime('now'), datetime('now')
    )
  `).run({ workspaceId, companyId });
  database.prepare(`
    INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code,
      purpose_description, is_primary_manufacturing, created_at, updated_at
    ) VALUES (
      :drawingDraftId, :companyId, :workspaceId, 'dev074-relink-root', 'M',
      '', 1, datetime('now'), datetime('now')
    )
  `).run({ drawingDraftId, workspaceId, companyId });
  database.prepare(`
    INSERT INTO numbering_draft_relations (
      id, company_id, workspace_id, drawing_draft_id, part_draft_id,
      link_type, is_primary, created_at, updated_at
    ) VALUES (
      'dev074-relink-relation', :companyId, :workspaceId, :drawingDraftId,
      'dev074-relink-part', 'primary_manufacturing', 1, datetime('now'), datetime('now')
    )
  `).run({ drawingDraftId, workspaceId, companyId });

  const reservations = [
    ["dev074-relink-res-root", "root", "dev074-relink-root", "A074"],
    ["dev074-relink-res-part", "part", "dev074-relink-part", "A074-P01"],
    ["dev074-relink-res-drawing", "drawing", drawingDraftId, "A074-M01"]
  ];
  for (const [id, itemType, itemId, code] of reservations) {
    database.prepare(`
      INSERT INTO number_candidate_reservations (
        id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
        sequence_scope_key, sequence_no, reservation_state, row_version,
        created_by, created_at, updated_at
      ) VALUES (
        :id, :companyId, :workspaceId, :itemType, :itemId, :code,
        :scope, 1, 'active', 1, :actorId, datetime('now'), datetime('now')
      )
    `).run({ id, companyId, workspaceId, itemType, itemId, code, scope: `${itemType}:${workspaceId}`, actorId });
    const table = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = :id WHERE id = :itemId`).run({ id, itemId });
  }

  const created = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).createCandidateRevision({
    workspaceId,
    companyId,
    drawingDraftId,
    actorId,
    expectedWorkspaceRowVersion: 1
  }));
  const candidate = created.candidateRevisions[0];
  const contentHash = crypto.createHash("sha256").update("DEV-074 SAME CONTENT 2D").digest("hex");
  const added = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId,
    companyId,
    candidateRevisionId: candidate.id,
    actorId,
    expectedRowVersion: candidate.rowVersion,
    storage: {
      assetId: "dev074-relink-asset",
      fileId: "dev074-relink-file",
      storageProvider: "j_drive",
      originalPath: "J:/qc/dev074-relink.slddrw",
      storageBucket: null,
      storageKey: "qc/dev074-relink.slddrw",
      storageGeneration: "1",
      fileName: "dev074-relink.slddrw",
      fileExt: "slddrw",
      mimeType: "application/octet-stream",
      fileSize: 25,
      contentHash,
      role: "drawing_2d",
      roleSource: "extension",
      displayName: "dev074-relink.slddrw",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev074-relink-evidence",
        bucket: "dev074-local-validation",
        objectKey: "qc/dev074-relink.slddrw",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const removed = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).removeCandidateFile({
    workspaceId,
    companyId,
    candidateRevisionId: candidate.id,
    fileId: "dev074-relink-file",
    actorId,
    expectedRowVersion: added.candidateRevisions[0].rowVersion,
    reason: "QC reattach"
  }));
  const reused = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).reuseCandidateFileLink({
    workspaceId,
    companyId,
    candidateRevisionId: candidate.id,
    actorId,
    expectedRowVersion: removed.candidateRevisions[0].rowVersion,
    contentHash,
    fileSize: 25,
    role: "drawing_2d",
    isPrimary: true
  }));

  assert.ok(reused);
  assert.equal(reused.mode, "reactivated");
  assert.equal(reused.fileId, "dev074-relink-file");
  const relation = database.prepare(`
    SELECT source_file_asset_id, is_primary, removed_at, removed_by
    FROM numbering_candidate_revision_files WHERE id = 'dev074-relink-file'
  `).get();
  assert.deepEqual(relation, {
    source_file_asset_id: "dev074-relink-asset",
    is_primary: 1,
    removed_at: null,
    removed_by: null
  });
  assert.equal(database.prepare(`SELECT count(*) AS count FROM file_assets WHERE content_hash = ? AND file_size = 25`).get(contentHash).count, 1);
  assert.equal(reused.workspace.candidateRevisions[0].files.filter((file) => !file.removedAt && file.sourceFileAssetId === "dev074-relink-asset").length, 1);

  const modelContentHash = crypto.createHash("sha256").update("DEV-074 SHARED 3D MODEL").digest("hex");
  const firstReady = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId,
    companyId,
    candidateRevisionId: candidate.id,
    actorId,
    expectedRowVersion: reused.workspace.candidateRevisions[0].rowVersion,
    storage: {
      assetId: "dev074-shared-model-asset",
      fileId: "dev074-shared-model-first-link",
      storageProvider: "j_drive",
      originalPath: "J:/qc/dev074-shared-model.sldprt",
      storageBucket: null,
      storageKey: "qc/dev074-shared-model.sldprt",
      storageGeneration: "1",
      fileName: "dev074-shared-model.sldprt",
      fileExt: "sldprt",
      mimeType: "application/octet-stream",
      fileSize: 26,
      contentHash: modelContentHash,
      role: "cad_3d",
      roleSource: "extension",
      displayName: "dev074-shared-model.sldprt",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev074-shared-model-first-evidence",
        bucket: "dev074-local-validation",
        objectKey: "qc/dev074-shared-model.sldprt",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const firstSubmitted = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).submitBundleReview({
    workspaceId,
    companyId,
    actorId,
    expectedWorkspaceRowVersion: firstReady.rowVersion,
    reason: "DEV-074 first revision using shared 3D"
  }));
  const firstApproved = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).decideBundleReview({
    requestId: firstSubmitted.requestId,
    companyId,
    actorId,
    actorRole: "R&D Manager",
    decision: "approved",
    comment: "DEV-074 first shared asset approval"
  }));
  assert.equal(firstApproved.applyFailed, false);

  const secondWorkspaceId = "dev074-shared-second-workspace";
  const secondDrawingDraftId = "dev074-shared-second-drawing";
  const secondPartDraftId = "dev074-shared-second-part";
  const sourceRootId = "part-root-dev074-relink-res-root";
  database.prepare(`
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by,
      source_root_id, append_reason, row_version, created_at, updated_at
    ) VALUES (
      :workspaceId, :companyId, 'append_drawing_part', 'active', :actorId, :actorId,
      :sourceRootId, 'DEV-074 shared 3D second revision', 1, datetime('now'), datetime('now')
    )
  `).run({ workspaceId: secondWorkspaceId, companyId, actorId, sourceRootId });
  database.prepare(`
    INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, source_root_id, part_name, item_kind,
      is_universal, created_at, updated_at
    ) VALUES (
      :id, :companyId, :workspaceId, :sourceRootId, 'DEV-074 second part',
      'manufactured', 0, datetime('now'), datetime('now')
    )
  `).run({ id: secondPartDraftId, companyId, workspaceId: secondWorkspaceId, sourceRootId });
  database.prepare(`
    INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, source_root_id, purpose_code,
      purpose_description, is_primary_manufacturing, created_at, updated_at
    ) VALUES (
      :id, :companyId, :workspaceId, :sourceRootId, 'M', '', 1,
      datetime('now'), datetime('now')
    )
  `).run({ id: secondDrawingDraftId, companyId, workspaceId: secondWorkspaceId, sourceRootId });
  database.prepare(`
    INSERT INTO numbering_draft_relations (
      id, company_id, workspace_id, drawing_draft_id, part_draft_id,
      link_type, is_primary, created_at, updated_at
    ) VALUES (
      'dev074-shared-second-relation', :companyId, :workspaceId, :drawingDraftId,
      :partDraftId, 'primary_manufacturing', 1, datetime('now'), datetime('now')
    )
  `).run({ companyId, workspaceId: secondWorkspaceId, drawingDraftId: secondDrawingDraftId, partDraftId: secondPartDraftId });
  const secondReservations = [
    ["dev074-shared-second-part-res", "part", secondPartDraftId, "A074-P02", 2],
    ["dev074-shared-second-drawing-res", "drawing", secondDrawingDraftId, "A074-M02", 2]
  ];
  for (const [id, itemType, itemId, code, sequenceNo] of secondReservations) {
    database.prepare(`
      INSERT INTO number_candidate_reservations (
        id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
        sequence_scope_key, sequence_no, reservation_state, row_version,
        created_by, created_at, updated_at
      ) VALUES (
        :id, :companyId, :workspaceId, :itemType, :itemId, :code,
        :scope, :sequenceNo, 'active', 1, :actorId, datetime('now'), datetime('now')
      )
    `).run({ id, companyId, workspaceId: secondWorkspaceId, itemType, itemId, code, scope: `${itemType}:${secondWorkspaceId}`, sequenceNo, actorId });
    const table = itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = :id WHERE id = :itemId`).run({ id, itemId });
  }

  const secondCreated = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).createCandidateRevision({
    workspaceId: secondWorkspaceId,
    companyId,
    drawingDraftId: secondDrawingDraftId,
    actorId,
    expectedWorkspaceRowVersion: 1
  }));
  const secondCandidate = secondCreated.candidateRevisions[0];
  const secondWithSharedModel = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: secondWorkspaceId,
    companyId,
    candidateRevisionId: secondCandidate.id,
    actorId,
    expectedRowVersion: secondCandidate.rowVersion,
    storage: {
      assetId: "dev074-shared-model-asset",
      fileId: "dev074-shared-model-second-link",
      storageProvider: "j_drive",
      originalPath: "J:/qc/dev074-shared-model.sldprt",
      storageBucket: null,
      storageKey: "qc/dev074-shared-model.sldprt",
      storageGeneration: "1",
      fileName: "dev074-shared-model.sldprt",
      fileExt: "sldprt",
      mimeType: "application/octet-stream",
      fileSize: 26,
      contentHash: modelContentHash,
      role: "cad_3d",
      roleSource: "extension",
      displayName: "dev074-shared-model.sldprt",
      description: "",
      isPrimary: true,
      reuseExistingAssetId: "dev074-shared-model-asset",
      publicationEvidence: {
        id: "dev074-shared-model-second-evidence",
        bucket: "dev074-local-validation",
        objectKey: "qc/dev074-shared-model.sldprt",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const secondDrawingHash = crypto.createHash("sha256").update("DEV-074 SECOND 2D DRAWING").digest("hex");
  const secondReady = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: secondWorkspaceId,
    companyId,
    candidateRevisionId: secondCandidate.id,
    actorId,
    expectedRowVersion: secondWithSharedModel.candidateRevisions[0].rowVersion,
    storage: {
      assetId: "dev074-second-drawing-asset",
      fileId: "dev074-second-drawing-link",
      storageProvider: "j_drive",
      originalPath: "J:/qc/dev074-second-drawing.slddrw",
      storageBucket: null,
      storageKey: "qc/dev074-second-drawing.slddrw",
      storageGeneration: "1",
      fileName: "dev074-second-drawing.slddrw",
      fileExt: "slddrw",
      mimeType: "application/octet-stream",
      fileSize: 27,
      contentHash: secondDrawingHash,
      role: "drawing_2d",
      roleSource: "extension",
      displayName: "dev074-second-drawing.slddrw",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev074-second-drawing-evidence",
        bucket: "dev074-local-validation",
        objectKey: "qc/dev074-second-drawing.slddrw",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const secondSubmitted = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).submitBundleReview({
    workspaceId: secondWorkspaceId,
    companyId,
    actorId,
    expectedWorkspaceRowVersion: secondReady.rowVersion,
    reason: "DEV-074 second revision reuses identical 3D"
  }));
  const secondApproved = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).decideBundleReview({
    requestId: secondSubmitted.requestId,
    companyId,
    actorId,
    actorRole: "R&D Manager",
    decision: "approved",
    comment: "DEV-074 shared 3D formalization"
  }));
  assert.equal(secondApproved.applyFailed, false);
  assert.equal(database.prepare(`SELECT count(*) AS count FROM file_assets WHERE id = 'dev074-shared-model-asset'`).get().count, 1);
  assert.equal(database.prepare(`SELECT count(*) AS count FROM numbering_candidate_revision_files WHERE source_file_asset_id = 'dev074-shared-model-asset'`).get().count, 2);
  assert.equal(database.prepare(`SELECT count(*) AS count FROM drawing_revision_package_files WHERE source_file_asset_id = 'dev074-shared-model-asset'`).get().count, 2);
  const secondFormalDetail = await new detailModule.PdmEntityDetailService(client).read({
    entityKey: "drawing:drawing-number-dev074-shared-second-drawing-res",
    surface: "drawing",
    companyId,
    actorId
  });
  const secondFormalProjection = secondFormalDetail.projections.drawing?.level === "full"
    ? secondFormalDetail.projections.drawing.data
    : null;
  assert.ok(secondFormalProjection, "second formal drawing exposes a full projection");
  assert.equal(secondFormalProjection.attachments.length, 2, "second formal revision exposes both logical attachments");
  assert.ok(
    secondFormalProjection.attachments.some((attachment) => attachment.id === "dev074-shared-model-asset" && attachment.role === "cad_3d"),
    "second formal revision UI projection exposes the reused controlled 3D asset"
  );

  console.log(JSON.stringify({
    passed: 3,
    failed: 0,
    results: [
      "same-content physical asset reused; soft-removed logical revision reference reactivated exactly once",
      "two approved revisions reuse one controlled 3D asset and both retain visible formal revision references",
      "formal drawing UI projection reads the current revision package and visibly includes the reused 3D reference"
    ]
  }, null, 2));
} finally {
  try { database?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) fs.rmSync(resolvedFixture, { recursive: true, force: true });
}
