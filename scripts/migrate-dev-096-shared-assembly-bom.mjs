import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const workspace = process.cwd();
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const provider = String(args.get("--provider") ?? "sqlite");
const mode = String(args.get("--mode") ?? "dry-run");
if (provider === "postgres") await rehearsePostgres();
else runSqlite();

function runSqlite() {
  if (!new Set(["dry-run", "apply"]).has(mode)) throw new Error(`DEV096_MODE_INVALID: ${mode}`);
  const dataDir = requiredTaskPath("PDM_DATA_DIR");
  requiredTaskPath("PDM_REPOSITORY_DIR");
  const primaryDataDir = path.resolve(workspace, "data");
  if (samePath(dataDir, primaryDataDir)) throw new Error("DEV096_PRIMARY_DATA_FORBIDDEN");
  const databasePath = path.resolve(String(args.get("--database") ?? path.join(dataDir, "ai-pdm.sqlite")));
  assertWithin(databasePath, dataDir, "DEV096_DATABASE_OUTSIDE_TASK_DATA");
  if (!fs.existsSync(databasePath)) throw new Error(`DEV096_DATABASE_NOT_FOUND: ${databasePath}`);
  const evidenceDir = path.resolve(String(args.get("--evidence-dir") ?? path.join(dataDir, "dev-096-migration-evidence")));
  fs.mkdirSync(evidenceDir, { recursive: true });

  const database = new Database(databasePath, { readonly: mode === "dry-run", fileMustExist: true });
  database.pragma("foreign_keys = ON");
  const source = inspect(database);
  const plan = buildPlan(database, source);
  writeJson(evidenceDir, "source-manifest.json", source);
  writeJson(evidenceDir, "crosswalk.json", plan.crosswalk);
  writeJson(evidenceDir, "issues.json", plan.issues);
  if (mode === "dry-run") {
    database.close();
    const evidence = { provider, mode, databasePath, taskDataDir: dataDir, writes: 0, source, plan: summarizePlan(plan) };
    writeJson(evidenceDir, "evidence.json", evidence);
    console.log(JSON.stringify(evidence, null, 2));
    return;
  }

  const plannedWrites = countPlannedWrites(plan);
  const schemaUpgradeRequired = needsAdditiveSchema(database);
  if (plannedWrites === 0 && !schemaUpgradeRequired) {
    const target = inspectTarget(database);
    const foreignKeyViolations = database.pragma("foreign_key_check");
    database.close();
    if (foreignKeyViolations.length) throw new Error(`DEV096_FOREIGN_KEY_CHECK_FAILED: ${JSON.stringify(foreignKeyViolations)}`);
    const rerun = { plannedWrites: 0, issueCount: 0, noOp: true };
    writeJson(evidenceDir, "target-manifest.json", target);
    writeJson(evidenceDir, "rerun-manifest.json", rerun);
    const evidence = {
      provider, mode, databasePath, backupPath: null, taskDataDir: dataDir,
      beforeTarget: target, target, rerun, foreignKeyViolations,
      productionWrites: false, databaseWrites: 0, replayed: true
    };
    writeJson(evidenceDir, "evidence.json", evidence);
    console.log(JSON.stringify(evidence, null, 2));
    return;
  }

  const backupPath = `${databasePath}.dev096-backup-${timestamp()}`;
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  ensureAdditiveSchema(database);
  const beforeTarget = inspectTarget(database);
  database.exec("BEGIN IMMEDIATE");
  try {
    applyPlan(database, plan);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const target = inspectTarget(database);
  const rerunPlan = buildPlan(database, inspect(database));
  const foreignKeyViolations = database.pragma("foreign_key_check");
  database.close();
  if (foreignKeyViolations.length) throw new Error(`DEV096_FOREIGN_KEY_CHECK_FAILED: ${JSON.stringify(foreignKeyViolations)}`);
  const rerun = { plannedWrites: countPlannedWrites(rerunPlan), issueCount: rerunPlan.issues.length, noOp: countPlannedWrites(rerunPlan) === 0 };
  writeJson(evidenceDir, "target-manifest.json", target);
  writeJson(evidenceDir, "rerun-manifest.json", rerun);
  const evidence = {
    provider, mode, databasePath, backupPath, taskDataDir: dataDir,
    beforeTarget, target, rerun, foreignKeyViolations, productionWrites: false
  };
  writeJson(evidenceDir, "evidence.json", evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

function buildPlan(database, source) {
  const plan = { lineages: [], issues: [], crosswalk: [] };
  if (!source.tables.includes("bom_drafts") || !source.tables.includes("part_numbers")) return plan;
  const draftColumns = columns(database, "bom_drafts");
  const alreadyMigratedPredicate = draftColumns.has("definition_id") ? "AND draft.definition_id IS NULL" : "";
  const drafts = database.prepare(`
    SELECT draft.*, owner.company_id AS owner_company_id, owner.part_root_id AS owner_root_id,
      owner.part_number AS owner_part_number, owner.part_name AS owner_part_name,
      owner.record_status AS owner_record_status, owner.item_kind AS owner_item_kind,
      (SELECT drawing.id FROM drawing_part_links link
        JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
        WHERE link.part_number_id = owner.id AND link.link_type = 'primary_manufacturing'
          AND drawing.company_id = owner.company_id AND drawing.part_root_id = owner.part_root_id
          AND drawing.purpose_code = 'M'
          AND drawing.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid')
        ORDER BY drawing.id LIMIT 1) AS owner_primary_m_identity
    FROM bom_drafts draft
    LEFT JOIN part_numbers owner ON owner.id = draft.owner_part_number_id
    WHERE draft.source = 'manual' AND draft.owner_part_number_id IS NOT NULL ${alreadyMigratedPredicate}
    ORDER BY draft.owner_part_number_id, CAST(COALESCE(draft.bom_revision, draft.parent_revision, '0') AS INTEGER), draft.id
  `).all();
  const byOwner = groupBy(drafts, (draft) => draft.owner_part_number_id);
  for (const [ownerPartNumberId, lineageDrafts] of byOwner) {
    const first = lineageDrafts[0];
    const lineageIssues = [];
    if (!first.owner_company_id || !first.owner_root_id) lineageIssues.push(issue("owner_missing", first, ownerPartNumberId));
    if (first.company_id && first.owner_company_id && first.company_id !== first.owner_company_id) lineageIssues.push(issue("cross_company", first, ownerPartNumberId));
    if (first.owner_item_kind && first.owner_item_kind !== "manufactured") lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_not_manufactured" }));
    if (["Obsolete", "Merged", "MainDrawingInvalid"].includes(first.owner_record_status)) lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_not_current" }));
    if (first.owner_company_id && !first.owner_primary_m_identity) lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_primary_m_missing" }));
    const conflictingBinding = columns(database, "bom_definition_parent_bindings").has("part_number_id")
      ? database.prepare("SELECT definition_id FROM bom_definition_parent_bindings WHERE part_number_id = ? LIMIT 1").get(ownerPartNumberId)
      : null;
    if (conflictingBinding) lineageIssues.push(issue("duplicate_current_binding", first, ownerPartNumberId, { definitionId: conflictingBinding.definition_id }));
    if (lineageDrafts.filter((draft) => ["Draft", "Rejected", "PendingReview", "Archived"].includes(draft.status)).length > 1) {
      lineageIssues.push(issue("open_revision_conflict", first, ownerPartNumberId));
    }
    const revisions = lineageDrafts.map((draft) => String(draft.bom_revision ?? draft.parent_revision ?? ""));
    if (new Set(revisions.map((revision) => revision.toUpperCase())).size !== revisions.length) {
      lineageIssues.push(issue("revision_lineage_conflict", first, ownerPartNumberId));
    }
    const nodesByDraft = new Map();
    for (const draft of lineageDrafts) {
      const nodes = readLegacyNodes(database, draft.id);
      nodesByDraft.set(draft.id, nodes);
      for (const node of nodes.filter((candidate) => candidate.node_type === "item")) {
        const matches = database.prepare(`
          SELECT id, company_id, part_root_id, part_number, part_name
          FROM part_numbers WHERE company_id = ? AND upper(part_number) = upper(?)
          ORDER BY id
        `).all(first.owner_company_id, node.part_number ?? "");
        if (matches.length !== 1) lineageIssues.push(issue("component_identity_ambiguous", draft, ownerPartNumberId, { nodeId: node.id, partNumber: node.part_number, matchCount: matches.length }));
        else node.canonicalChild = matches[0];
      }
    }
    if (lineageIssues.length) {
      plan.issues.push(...dedupeIssues(lineageIssues));
      continue;
    }
    const definitionId = deterministicUuid("definition", ownerPartNumberId);
    const lineage = { definitionId, ownerPartNumberId, companyId: first.owner_company_id, rootId: first.owner_root_id, drafts: [], releases: [] };
    plan.crosswalk.push({ entityKind: "definition", stableSourceId: ownerPartNumberId, targetId: definitionId });
    for (const draft of lineageDrafts) {
      const nodes = nodesByDraft.get(draft.id).map((node) => {
        const logicalLineId = deterministicUuid("logical-line", node.id);
        plan.crosswalk.push({ entityKind: "logical-line", stableSourceId: node.id, targetId: logicalLineId });
        return { ...node, logicalLineId };
      });
      lineage.drafts.push({ ...draft, nodes });
    }
    const replayIssues = [];
    const releases = database.prepare("SELECT * FROM bom_release_snapshots WHERE owner_part_number_id = ? ORDER BY released_at, id").all(ownerPartNumberId);
    for (const release of releases) {
      const replay = planRelease(database, release, first, definitionId);
      if (replay.issue) replayIssues.push(replay.issue);
      else lineage.releases.push(replay.release);
    }
    const pendingReviews = database.prepare(`
      SELECT review.* FROM bom_review_requests review JOIN bom_drafts draft ON draft.id = review.bom_draft_id
      WHERE draft.owner_part_number_id = ? AND review.status = 'PendingReview'
        ${columns(database, "bom_review_requests").has("review_schema_version") ? "AND review.review_schema_version = 1" : ""}
    `).all(ownerPartNumberId);
    for (const review of pendingReviews) replayIssues.push(issue("review_snapshot_unavailable", { id: review.bom_draft_id, company_id: first.owner_company_id }, ownerPartNumberId, { reviewId: review.id }));
    if (replayIssues.length) plan.issues.push(...replayIssues);
    else plan.lineages.push(lineage);
  }
  if (source.tables.includes("bom_shared_structure_migration_issues")) {
    const existingIssueIds = new Set(database.prepare("SELECT id FROM bom_shared_structure_migration_issues").all().map((row) => row.id));
    plan.issues = plan.issues.filter((record) => !existingIssueIds.has(record.id));
  }
  return plan;
}

function planRelease(database, release, owner, definitionId) {
  let lines;
  try {
    lines = JSON.parse(typeof release.line_snapshot_json === "string" ? release.line_snapshot_json : JSON.stringify(release.line_snapshot_json));
  } catch {
    return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "invalid_json" }) };
  }
  if (!Array.isArray(lines)) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "not_array" }) };
  if (lines.some((line) => !line || typeof line !== "object" || typeof line.id !== "string" || !line.id.trim())) {
    return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "line_id_missing" }) };
  }
  if (new Set(lines.map((line) => line.id)).size !== lines.length) {
    return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "duplicate_line_id" }) };
  }
  const resolved = [];
  const logicalByNode = new Map(lines.map((line) => [line.id, deterministicUuid("logical-line", line.id)]));
  const migratedLines = lines.map((line) => ({ ...line, logical_line_id: logicalByNode.get(line.id) }));
  for (const line of lines) {
    const logicalLineId = logicalByNode.get(line.id);
    if (!logicalLineId) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "line_id_missing" }) };
    if (line.parent_line_id && !logicalByNode.has(line.parent_line_id)) {
      return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id, reason: "parent_line_missing" }) };
    }
    if (line.node_type !== "item" && line.node_type !== "group") {
      return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id, reason: "node_type_invalid" }) };
    }
    if (line.node_type === "item") {
      const matches = database.prepare("SELECT id, part_number, part_name, part_root_id FROM part_numbers WHERE company_id = ? AND upper(part_number) = upper(?) ORDER BY id").all(owner.owner_company_id, line.part_number ?? "");
      if (matches.length !== 1) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id }) };
      resolved.push({ logicalLineId, parentLogicalLineId: line.parent_line_id ? logicalByNode.get(line.parent_line_id) ?? null : null, nodeType: "item", child: matches[0], groupName: null, quantity: Number(line.quantity), sequenceNo: Number(line.sequence_no), level: lineLevel(line, lines) });
    } else {
      resolved.push({ logicalLineId, parentLogicalLineId: line.parent_line_id ? logicalByNode.get(line.parent_line_id) ?? null : null, nodeType: "group", child: null, groupName: line.group_name, quantity: null, sequenceNo: Number(line.sequence_no), level: lineLevel(line, lines) });
    }
  }
  const mappings = resolved.filter((line) => line.nodeType === "item").map((line) => ({ logicalLineId: line.logicalLineId, componentMode: "fixed", childPartRootId: line.child.part_root_id, childPartNumberIds: [line.child.id], parentSelections: [] }));
  const review = database.prepare(`
    SELECT * FROM bom_review_requests
    WHERE bom_draft_id = ? AND status = 'Approved'
    ORDER BY reviewed_at DESC, id DESC LIMIT 1
  `).get(release.bom_draft_id);
  if (!review?.submitted_by) {
    return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "approved_review_missing" }) };
  }
  const parentSnapshot = [{ partNumberId: owner.owner_part_number_id, partNumber: owner.owner_part_number, name: owner.owner_part_name, selectionOrder: 0 }];
  const sharedLines = resolved.map((line) => ({
    logicalLineId: line.logicalLineId,
    parentLogicalLineId: line.parentLogicalLineId,
    nodeType: line.nodeType,
    groupName: line.groupName,
    quantity: line.quantity,
    sequenceNo: line.sequenceNo,
    level: line.level
  }));
  const projectionHashes = [{ parentPartNumberId: owner.owner_part_number_id, hash: sha256Text(canonicalJson(resolved.map(resolvedEvidence))), lineCount: resolved.length }];
  const reviewSnapshot = canonicalJson({
    schemaVersion: 2,
    definitionId,
    definitionRowVersion: 1,
    draftId: release.bom_draft_id,
    editorVersion: Number(owner.editor_version ?? 0),
    bomRevision: release.bom_revision,
    submitterId: review.submitted_by,
    parents: parentSnapshot,
    sharedLines,
    mappings,
    resolvedProjectionHashes: projectionHashes,
    reconfirmationCount: 0,
    baseReleaseSnapshotId: owner.base_release_snapshot_id ?? null
  });
  return { release: { ...release, definitionId, owner, migratedLines, resolved, mappings, review: { ...review, snapshotJson: reviewSnapshot, snapshotHash: sha256Text(reviewSnapshot) } } };
}

function applyPlan(database, plan) {
  const insertDefinition = database.prepare("INSERT OR IGNORE INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)");
  const insertDefinitionBinding = database.prepare("INSERT OR IGNORE INTO bom_definition_parent_bindings (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertDraftBinding = database.prepare("INSERT OR IGNORE INTO bom_draft_parent_bindings (id, company_id, bom_draft_id, part_number_id, selection_order, created_by, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)");
  const insertComponent = database.prepare("INSERT OR IGNORE INTO bom_draft_component_nodes (bom_draft_id, logical_line_id, node_id, node_location, component_mode, child_part_root_id, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'fixed', ?, ?, ?, ?, ?)");
  const insertCandidate = database.prepare("INSERT OR IGNORE INTO bom_draft_component_candidates (bom_draft_id, logical_line_id, child_part_number_id, selection_order) VALUES (?, ?, ?, 0)");
  for (const lineage of plan.lineages) {
    const first = lineage.drafts[0];
    insertDefinition.run(lineage.definitionId, lineage.companyId, lineage.rootId, first.created_by, first.updated_by, first.created_at, first.updated_at);
    insertDefinitionBinding.run(deterministicUuid("definition-binding", lineage.ownerPartNumberId), lineage.companyId, lineage.definitionId, lineage.ownerPartNumberId, String(first.bom_revision ?? first.parent_revision), first.created_by, first.created_at);
    database.prepare("UPDATE part_numbers SET structure_type = 'assembly' WHERE id = ?").run(lineage.ownerPartNumberId);
    for (const draft of lineage.drafts) {
      database.prepare("UPDATE bom_drafts SET definition_id = ? WHERE id = ? AND definition_id IS NULL").run(lineage.definitionId, draft.id);
      insertDraftBinding.run(deterministicUuid("draft-binding", draft.id), lineage.companyId, draft.id, lineage.ownerPartNumberId, draft.created_by, draft.created_at);
      for (const node of draft.nodes) {
        const table = node.location === "tree" ? "bom_lines_tree" : "bom_draft_floating_topics";
        database.prepare(`UPDATE ${table} SET logical_line_id = ? WHERE id = ? AND logical_line_id IS NULL`).run(node.logicalLineId, node.id);
        if (node.node_type !== "item") continue;
        insertComponent.run(draft.id, node.logicalLineId, node.id, node.location, node.canonicalChild.part_root_id, draft.created_by, draft.updated_by, node.created_at ?? draft.created_at, node.updated_at ?? draft.updated_at);
        insertCandidate.run(draft.id, node.logicalLineId, node.canonicalChild.id);
      }
    }
    for (const release of lineage.releases) applyRelease(database, release, lineage);
  }
  const insertIssue = database.prepare("INSERT OR IGNORE INTO bom_shared_structure_migration_issues (id, company_id, bom_draft_id, part_number_id, issue_code, detail_json, issue_status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)");
  for (const record of plan.issues) insertIssue.run(record.id, record.companyId, record.bomDraftId, record.partNumberId, record.issueCode, canonicalJson(record.details), record.createdAt);
}

function applyRelease(database, release, lineage) {
  const parent = release.owner;
  const parentSnapshot = [{ partNumberId: lineage.ownerPartNumberId, partNumber: parent.owner_part_number, name: parent.owner_part_name, selectionOrder: 0 }];
  const projectionHashes = [{ parentPartNumberId: lineage.ownerPartNumberId, hash: sha256Text(canonicalJson(release.resolved.map(resolvedEvidence))), lineCount: release.resolved.length }];
  const parentJson = canonicalJson(parentSnapshot);
  const mappingJson = canonicalJson(release.mappings);
  const resolvedJson = canonicalJson(projectionHashes);
  const lineJson = canonicalJson(release.migratedLines);
  const snapshotHash = sha256Text(canonicalJson({ schemaVersion: 2, definitionId: lineage.definitionId, bomRevision: release.bom_revision, reviewSnapshotHash: release.review.snapshotHash, parentSnapshotHash: sha256Text(parentJson), lineSnapshotHash: sha256Text(lineJson), mappingSnapshotHash: sha256Text(mappingJson), resolvedProjectionHash: sha256Text(resolvedJson) }));
  database.prepare(`
    UPDATE bom_review_requests
    SET review_schema_version = 2, definition_row_version = 1, editor_version = ?,
        review_snapshot_json = ?, review_snapshot_hash = ?
    WHERE id = ? AND review_schema_version = 1
  `).run(Number(parent.editor_version ?? 0), release.review.snapshotJson, release.review.snapshotHash, release.review.id);
  database.prepare(`UPDATE bom_release_snapshots SET definition_id = ?, line_snapshot_json = ?, snapshot_schema_version = 2, parent_snapshot_json = ?, mapping_snapshot_json = ?, resolved_projection_json = ?, snapshot_hash = ? WHERE id = ? AND snapshot_schema_version = 1`).run(lineage.definitionId, lineJson, parentJson, mappingJson, resolvedJson, snapshotHash, release.id);
  database.prepare("INSERT OR IGNORE INTO bom_release_parent_snapshots (release_snapshot_id, parent_part_number_id, definition_id, parent_part_number, parent_part_name, selection_order) VALUES (?, ?, ?, ?, ?, 0)").run(release.id, lineage.ownerPartNumberId, lineage.definitionId, parent.owner_part_number, parent.owner_part_name);
  const insertResolved = database.prepare("INSERT OR IGNORE INTO bom_release_resolved_lines (id, release_snapshot_id, definition_id, parent_part_number_id, logical_line_id, parent_logical_line_id, node_type, child_part_number_id, child_part_number, child_part_name, group_name, quantity, sequence_no, level, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')");
  for (const line of release.resolved) insertResolved.run(deterministicUuid("resolved-line", `${release.id}|${line.logicalLineId}|${lineage.ownerPartNumberId}`), release.id, lineage.definitionId, lineage.ownerPartNumberId, line.logicalLineId, line.parentLogicalLineId, line.nodeType, line.child?.id ?? null, line.child?.part_number ?? null, line.child?.part_name ?? null, line.groupName, line.quantity, line.sequenceNo, line.level);
}

function ensureAdditiveSchema(database) {
  const additions = {
    part_numbers: [["structure_type", "TEXT NOT NULL DEFAULT 'single_part'"]],
    bom_drafts: [["definition_id", "TEXT"], ["base_release_snapshot_id", "TEXT"]],
    bom_lines_tree: [["logical_line_id", "TEXT"]],
    bom_draft_floating_topics: [["logical_line_id", "TEXT"]],
    bom_review_requests: [["review_schema_version", "INTEGER NOT NULL DEFAULT 1"], ["definition_row_version", "INTEGER"], ["editor_version", "INTEGER"], ["review_snapshot_json", "TEXT"], ["review_snapshot_hash", "TEXT"]],
    bom_release_snapshots: [["definition_id", "TEXT"], ["snapshot_schema_version", "INTEGER NOT NULL DEFAULT 1"], ["parent_snapshot_json", "TEXT"], ["mapping_snapshot_json", "TEXT"], ["resolved_projection_json", "TEXT"], ["snapshot_hash", "TEXT"]],
    bom_reconfirmation_flags: [["logical_line_id", "TEXT"], ["parent_part_number_id", "TEXT"], ["reference_scope", "TEXT NOT NULL DEFAULT 'legacy_line'"]]
  };
  for (const [table, definitions] of Object.entries(additions)) {
    const existing = columns(database, table);
    for (const [column, definition] of definitions) if (!existing.has(column)) database.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${definition}`);
  }
  const schema = fs.readFileSync(path.join(workspace, "db", "schema.sql"), "utf8");
  const start = schema.indexOf("-- BEGIN DEV-096 shared assembly BOM authority.");
  const endMarker = "-- END DEV-096 shared assembly BOM authority.";
  const end = schema.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("DEV096_SCHEMA_MARKER_MISSING");
  database.exec(schema.slice(start, end + endMarker.length));
}

function needsAdditiveSchema(database) {
  const requiredColumns = {
    part_numbers: ["structure_type"],
    bom_drafts: ["definition_id", "base_release_snapshot_id"],
    bom_lines_tree: ["logical_line_id"],
    bom_draft_floating_topics: ["logical_line_id"],
    bom_review_requests: ["review_schema_version", "review_snapshot_json", "review_snapshot_hash"],
    bom_release_snapshots: ["definition_id", "snapshot_schema_version", "parent_snapshot_json", "mapping_snapshot_json", "resolved_projection_json", "snapshot_hash"]
  };
  for (const [table, names] of Object.entries(requiredColumns)) {
    const existing = columns(database, table);
    if (names.some((name) => !existing.has(name))) return true;
  }
  const requiredTables = [
    "bom_definitions", "bom_definition_parent_bindings", "bom_draft_parent_bindings",
    "bom_draft_component_nodes", "bom_draft_component_candidates", "bom_draft_parent_selections",
    "bom_release_parent_snapshots", "bom_release_resolved_lines", "bom_shared_structure_migration_issues"
  ];
  const existingTables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  return requiredTables.some((table) => !existingTables.has(table));
}

async function rehearsePostgres() {
  if (mode !== "rehearsal") throw new Error(`DEV096_POSTGRES_MODE_INVALID: ${mode}`);
  const dsn = String(args.get("--dsn") ?? process.env.DEV096_POSTGRES_DSN ?? "").trim();
  if (!dsn) {
    console.log(JSON.stringify({ provider: "postgres", mode, status: "BLOCKED", reason: "DEV096_DISPOSABLE_POSTGRES_DSN_REQUIRED" }, null, 2));
    return;
  }
  const parsed = new URL(dsn);
  const fingerprint = `${parsed.hostname}/${parsed.pathname}`.toLowerCase();
  if (/prod|production|cloudsql|primary|master/u.test(fingerprint) || !/dev096|shadow|disposable|test/u.test(fingerprint)) {
    throw new Error("DEV096_POSTGRES_TARGET_GUARD");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(workspace, "db", "postgres", "048_shared_assembly_bom.sql"), "utf8");
    await client.query(sql);
    const { convertLegacySharedBomPostgres } = await import("./dev096-postgres-converter.mjs");
    const conversion = await convertLegacySharedBomPostgres(client);
    const result = await client.query("SELECT COUNT(*)::int AS open_issues FROM bom_shared_structure_migration_issues WHERE issue_status = 'open'");
    console.log(JSON.stringify({ provider: "postgres", mode, status: "PASS", openIssues: result.rows[0]?.open_issues ?? 0, conversion }, null, 2));
  } finally {
    await client.end();
  }
}

function inspect(database) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  const scalar = (sql) => tables.includes(sql.match(/FROM\s+([a-z0-9_]+)/iu)?.[1] ?? "") ? Number(database.prepare(sql).pluck().get() ?? 0) : 0;
  return {
    provider: "sqlite",
    tables,
    databaseSha256: sha256File(database.name),
    drafts: scalar("SELECT COUNT(*) FROM bom_drafts"),
    reviews: scalar("SELECT COUNT(*) FROM bom_review_requests"),
    releases: scalar("SELECT COUNT(*) FROM bom_release_snapshots"),
    treeLines: scalar("SELECT COUNT(*) FROM bom_lines_tree"),
    floatingLines: scalar("SELECT COUNT(*) FROM bom_draft_floating_topics")
  };
}

function inspectTarget(database) {
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  const scalar = (sql) => Number(database.prepare(sql).pluck().get() ?? 0);
  return {
    definitions: tables.has("bom_definitions") ? scalar("SELECT COUNT(*) FROM bom_definitions") : 0,
    definitionBindings: tables.has("bom_definition_parent_bindings") ? scalar("SELECT COUNT(*) FROM bom_definition_parent_bindings") : 0,
    draftBindings: tables.has("bom_draft_parent_bindings") ? scalar("SELECT COUNT(*) FROM bom_draft_parent_bindings") : 0,
    components: tables.has("bom_draft_component_nodes") ? scalar("SELECT COUNT(*) FROM bom_draft_component_nodes") : 0,
    candidates: tables.has("bom_draft_component_candidates") ? scalar("SELECT COUNT(*) FROM bom_draft_component_candidates") : 0,
    resolvedLines: tables.has("bom_release_resolved_lines") ? scalar("SELECT COUNT(*) FROM bom_release_resolved_lines") : 0,
    openIssues: tables.has("bom_shared_structure_migration_issues") ? scalar("SELECT COUNT(*) FROM bom_shared_structure_migration_issues WHERE issue_status='open'") : 0
  };
}

function readLegacyNodes(database, draftId) {
  const tree = database.prepare("SELECT *, 'tree' AS location FROM bom_lines_tree WHERE bom_draft_id = ? ORDER BY sequence_no, id").all(draftId);
  const floating = database.prepare("SELECT *, 'floating' AS location FROM bom_draft_floating_topics WHERE bom_draft_id = ? ORDER BY sequence_no, id").all(draftId);
  return [...tree, ...floating];
}

function issue(issueCode, draft, partNumberId, details = {}) {
  const stableSourceId = `${issueCode}|${draft.id ?? "none"}|${partNumberId ?? "none"}|${canonicalJson(details)}`;
  return { id: deterministicUuid("migration-issue", stableSourceId), issueCode, companyId: draft.company_id ?? null, bomDraftId: draft.id ?? null, partNumberId: partNumberId ?? null, details, createdAt: new Date().toISOString() };
}

function dedupeIssues(issues) { return [...new Map(issues.map((record) => [record.id, record])).values()]; }
function summarizePlan(plan) { return { lineages: plan.lineages.length, drafts: plan.lineages.reduce((sum, lineage) => sum + lineage.drafts.length, 0), releases: plan.lineages.reduce((sum, lineage) => sum + lineage.releases.length, 0), issues: plan.issues.length, plannedWrites: countPlannedWrites(plan) }; }
function countPlannedWrites(plan) { return plan.lineages.reduce((sum, lineage) => sum + 2 + lineage.drafts.reduce((draftSum, draft) => draftSum + 2 + draft.nodes.length + draft.nodes.filter((node) => node.node_type === "item").length * 2, 0) + lineage.releases.reduce((releaseSum, release) => releaseSum + 3 + release.resolved.length, 0), 0) + plan.issues.length; }
function groupBy(rows, keyOf) { const map = new Map(); for (const row of rows) { const key = keyOf(row); map.set(key, [...(map.get(key) ?? []), row]); } return map; }
function columns(database, table) { return new Set(database.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name)); }
function quote(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function lineLevel(line, lines) { const byId = new Map(lines.map((row) => [row.id, row])); let level = 0; let parent = line.parent_line_id; const seen = new Set(); while (parent && !seen.has(parent)) { seen.add(parent); level += 1; parent = byId.get(parent)?.parent_line_id ?? null; } return level; }
function resolvedEvidence(line) { return { logicalLineId: line.logicalLineId, parentLogicalLineId: line.parentLogicalLineId, nodeType: line.nodeType, childPartNumberId: line.child?.id ?? null, childPartNumber: line.child?.part_number ?? null, childPartName: line.child?.part_name ?? null, groupName: line.groupName, quantity: line.quantity, sequenceNo: line.sequenceNo, level: line.level }; }

export function deterministicUuid(entityKind, stableSourceId) {
  const bytes = crypto.createHash("sha256").update(`ai-pdm/dev096/v1|${entityKind}|${stableSourceId}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalJson(value) { return JSON.stringify(sortCanonical(value)); }
function sortCanonical(value) { if (Array.isArray(value)) return value.map(sortCanonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortCanonical(value[key])])); if (typeof value === "string") return value.trim(); return value; }
function sha256Text(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function sha256File(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function requiredTaskPath(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`DEV096_${name}_REQUIRED`); return path.resolve(value); }
function assertWithin(target, parent, code) { const relative = path.relative(parent, target); if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(code); }
function samePath(left, right) { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
function writeJson(directory, filename, value) { fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function timestamp() { return new Date().toISOString().replace(/[-:.TZ]/gu, ""); }
