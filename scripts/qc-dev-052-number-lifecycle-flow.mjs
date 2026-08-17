#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-052-flow-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";
process.env.PDM_PUBLICATION_EVIDENCE_MODE = "local_fake";
process.env.NODE_ENV = "test";

let database;
try {
  const [dbModule, providerModule, repositoryModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-lifecycle-simplification-async-repository")
  ]);
  database = dbModule.getDb();
  const fileAssetsDefinition = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'file_assets'")
    .get()?.sql;
  const currentProviderClause =
    "storage_provider TEXT NOT NULL DEFAULT 'local_repository' CHECK (storage_provider IN ('j_drive', 'local_repository', 'supabase_storage', 's3_compatible', 'google_cloud_storage', 'external'))";
  const legacyProviderClause =
    "storage_provider TEXT NOT NULL DEFAULT 'j_drive' CHECK (storage_provider IN ('j_drive', 'supabase_storage', 'external'))";
  if (!fileAssetsDefinition?.includes(currentProviderClause)) {
    throw new Error("DEV-052 fixture cannot establish the legacy file_assets provider contract.");
  }
  if (database.prepare("SELECT COUNT(*) AS count FROM file_assets").get().count !== 0) {
    throw new Error("DEV-052 fixture expected an empty file_assets table before compatibility setup.");
  }
  database.pragma("foreign_keys = OFF");
  database.exec("DROP TABLE file_assets");
  database.exec(fileAssetsDefinition.replace(currentProviderClause, legacyProviderClause));
  database.pragma("foreign_keys = ON");
  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const { AsyncNumberLifecycleSimplificationRepository, NumberLifecycleRepositoryFault } = repositoryModule;

  database.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      'dev052-flow-user', 'DEV-052 Flow', 'dev052-flow@example.invalid', NULL, 'R&D Manager',
      'company-jenfu', 'active', 1, datetime('now'), datetime('now')
    )
  `).run();
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
                    VALUES ('dev052-flow-user', 'company-jenfu', 1, datetime('now'))`).run();
  database.prepare(`
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev052-flow', 'company-jenfu', 'new_bundle', 'active', 'dev052-flow-user', 'dev052-flow-user', 1, datetime('now'), datetime('now'))
  `).run();
  database.prepare(`
    INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev052-root', 'company-jenfu', 'dev052-flow', 'DEV-052 Motor', 'manufactured', 'numbering-rule-v3-alpha-root', datetime('now'), datetime('now'))
  `).run();
  database.prepare(`
    INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, series_code, created_at, updated_at
    ) VALUES ('dev052-part', 'company-jenfu', 'dev052-flow', 'dev052-root', 'DEV-052 Motor', 'manufactured', 0, 'JF', datetime('now'), datetime('now'))
  `).run();
  database.prepare(`
    INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, created_at, updated_at
    ) VALUES ('dev052-drawing', 'company-jenfu', 'dev052-flow', 'dev052-root', 'M', '', 1, datetime('now'), datetime('now'))
  `).run();
  database.prepare(`
    INSERT INTO numbering_draft_relations (
      id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
    ) VALUES ('dev052-relation', 'company-jenfu', 'dev052-flow', 'dev052-drawing', 'dev052-part', 'primary_manufacturing', 1, datetime('now'), datetime('now'))
  `).run();
  const reservations = [
    ["dev052-res-root", "root", "dev052-root", "A052"],
    ["dev052-res-part", "part", "dev052-part", "A052-P01"],
    ["dev052-res-drawing", "drawing", "dev052-drawing", "A052-M01"]
  ];
  for (const [id, itemType, itemId, code] of reservations) {
    database.prepare(`
      INSERT INTO number_candidate_reservations (
        id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
        sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', 'dev052-flow', :itemType, :itemId, :code,
        :scope, 1, 'active', 1, 'dev052-flow-user', datetime('now'), datetime('now'))
    `).run({ id, itemType, itemId, code, scope: `${itemType}:dev052-flow` });
    const table = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = :id WHERE id = :itemId`).run({ id, itemId });
  }

  const repository = new AsyncNumberLifecycleSimplificationRepository(client, () => new Date().toISOString(), () => crypto.randomUUID());
  const created = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).createCandidateRevision({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    drawingDraftId: "dev052-drawing",
    actorId: "dev052-flow-user",
    expectedWorkspaceRowVersion: 1
  }));
  const candidate = created.candidateRevisions[0];
  record(
    "DEV052-FLOW-001 explicit action creates one candidate revision with policy suggestion",
    created.rowVersion === 2 && candidate?.revision === "0.1" && candidate.lifecycleStatus === "draft",
    JSON.stringify({ workspaceVersion: created.rowVersion, candidateRevision: candidate?.revision })
  );

  const drawingAdded = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    candidateRevisionId: candidate.id,
    actorId: "dev052-flow-user",
    expectedRowVersion: candidate.rowVersion,
    storage: {
      assetId: "dev052-drawing-file-asset",
      fileId: "dev052-drawing-candidate-file",
      storageProvider: "local_repository",
      originalPath: null,
      storageBucket: null,
      storageKey: "candidate-revisions/dev052-flow/first.slddrw",
      storageGeneration: null,
      fileName: "first.slddrw",
      fileExt: "slddrw",
      mimeType: "application/octet-stream",
      fileSize: 12,
      contentHash: crypto.createHash("sha256").update("DEV-052 DRAWING").digest("hex"),
      role: "drawing_2d",
      roleSource: "user",
      displayName: "first.slddrw",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev052-drawing-evidence",
        bucket: "dev052-local-fake",
        objectKey: "candidate-revisions/dev052-flow/first.slddrw",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const added = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    candidateRevisionId: candidate.id,
    actorId: "dev052-flow-user",
    expectedRowVersion: drawingAdded.candidateRevisions[0].rowVersion,
    storage: {
      assetId: "dev052-model-file-asset",
      fileId: "dev052-model-candidate-file",
      storageProvider: "local_repository",
      originalPath: null,
      storageBucket: null,
      storageKey: "candidate-revisions/dev052-flow/first.sldprt",
      storageGeneration: null,
      fileName: "first.sldprt",
      fileExt: "sldprt",
      mimeType: "application/octet-stream",
      fileSize: 12,
      contentHash: crypto.createHash("sha256").update("DEV-052 MODEL").digest("hex"),
      role: "cad_3d",
      roleSource: "user",
      displayName: "first.sldprt",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev052-model-evidence",
        bucket: "dev052-local-fake",
        objectKey: "candidate-revisions/dev052-flow/first.sldprt",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const storedAssets = database
    .prepare("SELECT storage_provider, sync_status FROM file_assets WHERE id IN ('dev052-drawing-file-asset', 'dev052-model-file-asset') ORDER BY id")
    .all();
  const candidateFiles = added.candidateRevisions[0]?.files ?? [];
  record(
    "DEV052-FLOW-002 primary 2D and 3D files with finalized evidence make the bundle ready",
    added.lifecycleV2?.stage === "bundle_ready" &&
      ["drawing_2d", "cad_3d"].every((role) => candidateFiles.some((file) => file.role === role && file.isPrimary && file.publicationEvidenceId)) &&
      storedAssets.length === 2 &&
      storedAssets.every((asset) => asset.storage_provider === "j_drive" && asset.sync_status === "local_only"),
    JSON.stringify({
      stage: added.lifecycleV2?.stage,
      files: candidateFiles.map((file) => ({ role: file.role, evidence: file.publicationEvidenceId })),
      storedAssets
    })
  );

  const removedDrawing = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).removeCandidateFile({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    candidateRevisionId: candidate.id,
    fileId: "dev052-drawing-candidate-file",
    actorId: "dev052-flow-user",
    expectedRowVersion: added.candidateRevisions[0].rowVersion,
    reason: "QC same-content relink"
  }));
  const drawingAsset = database.prepare(`SELECT content_hash, file_size FROM file_assets WHERE id = 'dev052-drawing-file-asset'`).get();
  const reusedDrawing = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).reuseCandidateFileLink({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    candidateRevisionId: candidate.id,
    actorId: "dev052-flow-user",
    expectedRowVersion: removedDrawing.candidateRevisions[0].rowVersion,
    contentHash: drawingAsset.content_hash,
    fileSize: Number(drawingAsset.file_size),
    role: "drawing_2d",
    isPrimary: true
  }));
  const restoredDrawing = database.prepare(`
    SELECT source_file_asset_id, is_primary, removed_at, removed_by
    FROM numbering_candidate_revision_files
    WHERE id = 'dev052-drawing-candidate-file'
  `).get();
  record(
    "DEV052-FLOW-002A same-content upload restores the soft-removed revision reference without duplicating the physical asset",
    reusedDrawing?.mode === "reactivated" &&
      reusedDrawing.fileId === "dev052-drawing-candidate-file" &&
      reusedDrawing.workspace.lifecycleV2?.stage === "bundle_ready" &&
      restoredDrawing.source_file_asset_id === "dev052-drawing-file-asset" &&
      Number(restoredDrawing.is_primary) === 1 && restoredDrawing.removed_at === null && restoredDrawing.removed_by === null &&
      database.prepare(`SELECT count(*) AS count FROM file_assets WHERE content_hash = ? AND file_size = ?`).get(drawingAsset.content_hash, drawingAsset.file_size).count === 1,
    JSON.stringify({ mode: reusedDrawing?.mode, fileId: reusedDrawing?.fileId, restoredDrawing })
  );

  const submitted = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).submitBundleReview({
    workspaceId: "dev052-flow",
    companyId: "company-jenfu",
    actorId: "dev052-flow-user",
    expectedWorkspaceRowVersion: reusedDrawing.workspace.rowVersion,
    reason: "QC bundle review"
  }));
  const snapshotRow = database.prepare(`SELECT snapshot_hash, snapshot_json FROM approval_platform_impact_snapshots WHERE request_id = ?`).get(submitted.requestId);
  const snapshot = JSON.parse(snapshotRow.snapshot_json);
  record(
    "DEV052-FLOW-003 submit freezes one canonical bundle snapshot and locks all facts",
    submitted.workspace.lifecycleV2?.stage === "in_review" &&
      submitted.workspace.reservations.every((reservation) => reservation.state === "review_locked") &&
      submitted.workspace.candidateRevisions.every((entry) => entry.lifecycleStatus === "review_locked") &&
      snapshot.snapshotVersion === "numbering-candidate-bundle-review-v1" && snapshot.candidateRevisions[0].files[0].generation === "1",
    JSON.stringify({ requestId: submitted.requestId, snapshotHash: snapshotRow.snapshot_hash, stage: submitted.workspace.lifecycleV2?.stage })
  );

  const beforeFormalCounts = Object.fromEntries(["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "drawing_revision_packages", "drawing_revision_package_review_approvals"].map((table) => [table, database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
  const failedDecision = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(
    tx,
    () => new Date().toISOString(),
    () => crypto.randomUUID(),
    (point) => {
      if (point === "after_formal_master_promotion") throw new NumberLifecycleRepositoryFault(point);
    }
  ).decideBundleReview({
    requestId: submitted.requestId,
    companyId: "company-jenfu",
    actorId: "dev052-flow-user",
    actorRole: "R&D Manager",
    decision: "approved",
    comment: "QC approved"
  }));
  const afterFaultCounts = Object.fromEntries(Object.keys(beforeFormalCounts).map((table) => [table, database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
  const failedRequest = database.prepare(`SELECT request_status, apply_status, apply_attempts FROM approval_platform_requests WHERE id = ?`).get(submitted.requestId);
  record(
    "DEV052-FLOW-004 formalization fault rolls back all formal data but preserves decision and diagnostic",
    failedDecision.applyFailed === true && JSON.stringify(beforeFormalCounts) === JSON.stringify(afterFaultCounts) &&
      failedRequest.request_status === "apply_failed" && failedRequest.apply_status === "failed" &&
      database.prepare(`SELECT count(*) AS count FROM approval_platform_decisions WHERE request_id = ?`).get(submitted.requestId).count === 1,
    JSON.stringify({ beforeFormalCounts, afterFaultCounts, failedRequest })
  );

  const retried = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).retryBundleApply({
    requestId: submitted.requestId,
    companyId: "company-jenfu",
    actorId: "dev052-flow-user"
  }));
  const packageRow = database.prepare(`
    SELECT package.status, candidate.revision, candidate.formal_revision_package_id,
           companion.snapshot_hash, candidate.review_snapshot_hash
    FROM drawing_revision_packages package
    JOIN numbering_candidate_revision_drafts candidate ON candidate.formal_revision_package_id = package.id
    JOIN drawing_revision_package_review_approvals companion ON companion.package_id = package.id
    WHERE candidate.workspace_id = 'dev052-flow'
  `).get();
  record(
    "DEV052-FLOW-005 retry formalizes once and projects ReviewApproved without widening physical status",
    retried.workspace.lifecycleV2?.stage === "official_controlled" && packageRow.status === "Pending" &&
      packageRow.snapshot_hash === packageRow.review_snapshot_hash &&
      retried.workspace.candidateRevisions[0]?.effectiveStatus === "ReviewApproved" &&
      database.prepare(`SELECT count(*) AS count FROM drawing_revision_packages WHERE drawing_number = 'A052-M01'`).get().count === 1,
    JSON.stringify({ stage: retried.workspace.lifecycleV2?.stage, packageRow, effectiveStatus: retried.workspace.candidateRevisions[0]?.effectiveStatus })
  );
  record(
    "DEV052-FLOW-006 successful formalization promotes all reservations and never creates Released minor revision",
    retried.workspace.reservations.every((reservation) => reservation.state === "promoted") &&
      database.prepare(`SELECT count(*) AS count FROM drawing_revision_packages WHERE status = 'Released' AND revision LIKE '%.%'`).get().count === 0,
    JSON.stringify(retried.workspace.reservations.map((reservation) => reservation.state))
  );
  record(
    "DEV052-FLOW-007 audit, approval events and immutable decision evidence are present",
    database.prepare(`SELECT count(*) AS count FROM audit_logs WHERE action LIKE 'pdm.numbering.%candidate%bundle%' OR action = 'pdm.numbering.publish_official_numbers'`).get().count >= 3 &&
      database.prepare(`SELECT count(*) AS count FROM approval_platform_events WHERE request_id = ?`).get(submitted.requestId).count >= 3 &&
      database.prepare(`SELECT count(*) AS count FROM approval_platform_decisions WHERE request_id = ?`).get(submitted.requestId).count === 1,
    submitted.requestId
  );

  database.prepare(`
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev052-legacy', 'company-jenfu', 'new_bundle', 'active', 'dev052-flow-user', 'dev052-flow-user', 1, datetime('now'), datetime('now'))
  `).run();
  database.prepare(`INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev052-legacy-root', 'company-jenfu', 'dev052-legacy', 'Legacy Motor', 'manufactured', 'numbering-rule-v3-alpha-root', datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, created_at, updated_at
    ) VALUES ('dev052-legacy-part', 'company-jenfu', 'dev052-legacy', 'dev052-legacy-root', 'Legacy Motor', 'manufactured', 0, datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, created_at, updated_at
    ) VALUES ('dev052-legacy-drawing', 'company-jenfu', 'dev052-legacy', 'dev052-legacy-root', 'M', '', 1, datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_relations (
      id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
    ) VALUES ('dev052-legacy-relation', 'company-jenfu', 'dev052-legacy', 'dev052-legacy-drawing', 'dev052-legacy-part', 'primary_manufacturing', 1, datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO approval_platform_requests (
      id, company_id, action_code, domain_code, request_status, title, reason, requested_by, requested_at,
      resolved_by, resolved_at, apply_status, apply_attempts, applied_by, applied_at, payload_json, created_at, updated_at
    ) VALUES ('dev052-legacy-approval', 'company-jenfu', 'numbering.candidate_publication_review', 'numbering', 'approved',
      'Legacy number approval', 'legacy', 'dev052-flow-user', datetime('now'), 'dev052-flow-user', datetime('now'),
      'applied', 1, 'dev052-flow-user', datetime('now'), '{"snapshotHash":"dev052-legacy-hash"}', datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO approval_platform_targets (
      id, request_id, target_role, target_type, target_id, target_label, target_status, snapshot_json, created_at
    ) VALUES ('dev052-legacy-target', 'dev052-legacy-approval', 'primary', 'numbering_draft_workspace',
      'dev052-legacy', 'Legacy Motor', 'approved_locked', '{}', datetime('now'))`).run();
  database.prepare(`INSERT INTO approval_platform_impact_snapshots (
      id, request_id, snapshot_hash, snapshot_json, captured_by, captured_at
    ) VALUES ('dev052-legacy-snapshot', 'dev052-legacy-approval', 'dev052-legacy-hash', '{}', 'dev052-flow-user', datetime('now'))`).run();
  const legacyReservations = [
    ["dev052-legacy-res-root", "root", "dev052-legacy-root", "A054"],
    ["dev052-legacy-res-part", "part", "dev052-legacy-part", "A054-P01"],
    ["dev052-legacy-res-drawing", "drawing", "dev052-legacy-drawing", "A054-M01"]
  ];
  for (const [id, itemType, itemId, code] of legacyReservations) {
    database.prepare(`INSERT INTO number_candidate_reservations (
        id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
        sequence_scope_key, sequence_no, reservation_state, row_version, approval_request_id, created_by, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', 'dev052-legacy', :itemType, :itemId, :code,
        :scope, 1, 'approved_locked', 2, 'dev052-legacy-approval', 'dev052-flow-user', datetime('now'), datetime('now'))`).run({
      id, itemType, itemId, code, scope: `${itemType}:dev052-legacy`
    });
    const table = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = :id WHERE id = :itemId`).run({ id, itemId });
  }
  const legacyCreated = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).createCandidateRevision({
    workspaceId: "dev052-legacy",
    companyId: "company-jenfu",
    drawingDraftId: "dev052-legacy-drawing",
    actorId: "dev052-flow-user",
    expectedWorkspaceRowVersion: 1
  }));
  const legacyCandidate = legacyCreated.candidateRevisions[0];
  const legacyDrawingAdded = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: "dev052-legacy",
    companyId: "company-jenfu",
    candidateRevisionId: legacyCandidate.id,
    actorId: "dev052-flow-user",
    expectedRowVersion: legacyCandidate.rowVersion,
    storage: {
      assetId: "dev052-legacy-drawing-file-asset",
      fileId: "dev052-legacy-drawing-candidate-file",
      storageProvider: "local_repository",
      originalPath: null,
      storageBucket: null,
      storageKey: "candidate-revisions/dev052-legacy/first.slddrw",
      storageGeneration: null,
      fileName: "legacy-first.slddrw",
      fileExt: "slddrw",
      mimeType: "application/octet-stream",
      fileSize: 16,
      contentHash: crypto.createHash("sha256").update("DEV-052 LEGACY DRAWING").digest("hex"),
      role: "drawing_2d",
      roleSource: "user",
      displayName: "legacy-first.slddrw",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev052-legacy-drawing-evidence",
        bucket: "dev052-local-fake",
        objectKey: "candidate-revisions/dev052-legacy/first.slddrw",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const legacyAdded = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).addCandidateFile({
    workspaceId: "dev052-legacy",
    companyId: "company-jenfu",
    candidateRevisionId: legacyCandidate.id,
    actorId: "dev052-flow-user",
    expectedRowVersion: legacyDrawingAdded.candidateRevisions[0].rowVersion,
    storage: {
      assetId: "dev052-legacy-model-file-asset",
      fileId: "dev052-legacy-model-candidate-file",
      storageProvider: "local_repository",
      originalPath: null,
      storageBucket: null,
      storageKey: "candidate-revisions/dev052-legacy/first.sldprt",
      storageGeneration: null,
      fileName: "legacy-first.sldprt",
      fileExt: "sldprt",
      mimeType: "application/octet-stream",
      fileSize: 16,
      contentHash: crypto.createHash("sha256").update("DEV-052 LEGACY MODEL").digest("hex"),
      role: "cad_3d",
      roleSource: "user",
      displayName: "legacy-first.sldprt",
      description: "",
      isPrimary: true,
      publicationEvidence: {
        id: "dev052-legacy-model-evidence",
        bucket: "dev052-local-fake",
        objectKey: "candidate-revisions/dev052-legacy/first.sldprt",
        generation: "1",
        finalizedAt: new Date().toISOString()
      }
    }
  }));
  const legacySubmitted = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).submitBundleReview({
    workspaceId: "dev052-legacy",
    companyId: "company-jenfu",
    actorId: "dev052-flow-user",
    expectedWorkspaceRowVersion: legacyAdded.rowVersion,
    reason: "Legacy drawing addendum"
  }));
  const legacyBundleSnapshot = JSON.parse(database.prepare(`SELECT snapshot_json FROM approval_platform_impact_snapshots WHERE request_id = ?`).get(legacySubmitted.requestId).snapshot_json);
  const legacyDecision = await client.transaction((tx) => new AsyncNumberLifecycleSimplificationRepository(tx).decideBundleReview({
    requestId: legacySubmitted.requestId,
    companyId: "company-jenfu",
    actorId: "dev052-flow-user",
    actorRole: "R&D Manager",
    decision: "approved",
    comment: "Approve drawing addendum"
  }));
  record(
    "DEV052-FLOW-008 approved legacy number continues through referenced drawing addendum",
    legacyCandidate.legacyBaselineRequestId === "dev052-legacy-approval" &&
      legacyCandidate.legacyBaselineSnapshotHash === "dev052-legacy-hash" &&
      legacyBundleSnapshot.mode === "legacy_addendum" &&
      legacyBundleSnapshot.candidateRevisions[0].legacyBaselineRequestId === "dev052-legacy-approval" &&
      legacyDecision.applyFailed === false && legacyDecision.workspace.lifecycleV2?.stage === "official_controlled" &&
      database.prepare(`SELECT count(*) AS count FROM approval_platform_decisions WHERE request_id = 'dev052-legacy-approval'`).get().count === 0,
    JSON.stringify({ mode: legacyBundleSnapshot.mode, baseline: legacyCandidate.legacyBaselineRequestId, stage: legacyDecision.workspace.lifecycleV2?.stage })
  );
} catch (error) {
  record("DEV052-FLOW-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try { database?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) fs.rmSync(resolvedFixture, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
