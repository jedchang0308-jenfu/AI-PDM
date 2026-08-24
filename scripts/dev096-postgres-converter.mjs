import crypto from "node:crypto";

export async function convertLegacySharedBomPostgres(client, options = {}) {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const plan = await buildPlan(client, createdAt);
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ai_pdm:dev096:shared-assembly-bom-v1:converter'))");
    await applyPlan(client, plan);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const rerun = await buildPlan(client, createdAt);
  return {
    plan: summarizePlan(plan),
    rerun: { ...summarizePlan(rerun), noOp: countPlannedWrites(rerun) === 0 },
    crosswalk: plan.crosswalk,
    issues: plan.issues
  };
}

async function buildPlan(client, createdAt) {
  const plan = { lineages: [], issues: [], crosswalk: [] };
  const drafts = (await client.query(`
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
    WHERE draft.source = 'manual' AND draft.owner_part_number_id IS NOT NULL AND draft.definition_id IS NULL
    ORDER BY draft.owner_part_number_id,
      CAST(COALESCE(draft.bom_revision, draft.parent_revision, '0') AS INTEGER), draft.id
  `)).rows;
  for (const [ownerPartNumberId, lineageDrafts] of groupBy(drafts, (draft) => draft.owner_part_number_id)) {
    const first = lineageDrafts[0];
    const lineageIssues = [];
    if (!first.owner_company_id || !first.owner_root_id) lineageIssues.push(issue("owner_missing", first, ownerPartNumberId, {}, createdAt));
    if (first.company_id && first.owner_company_id && first.company_id !== first.owner_company_id) lineageIssues.push(issue("cross_company", first, ownerPartNumberId, {}, createdAt));
    if (first.owner_item_kind && first.owner_item_kind !== "manufactured") lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_not_manufactured" }, createdAt));
    if (["Obsolete", "Merged", "MainDrawingInvalid"].includes(first.owner_record_status)) lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_not_current" }, createdAt));
    if (first.owner_company_id && !first.owner_primary_m_identity) lineageIssues.push(issue("definition_backfill_ambiguous", first, ownerPartNumberId, { reason: "owner_primary_m_missing" }, createdAt));
    const conflictingBinding = (await client.query("SELECT definition_id FROM bom_definition_parent_bindings WHERE part_number_id = $1 LIMIT 1", [ownerPartNumberId])).rows[0];
    if (conflictingBinding) lineageIssues.push(issue("duplicate_current_binding", first, ownerPartNumberId, { definitionId: conflictingBinding.definition_id }, createdAt));
    if (lineageDrafts.filter((draft) => ["Draft", "Rejected", "PendingReview", "Archived"].includes(draft.status)).length > 1) {
      lineageIssues.push(issue("open_revision_conflict", first, ownerPartNumberId, {}, createdAt));
    }
    const revisions = lineageDrafts.map((draft) => String(draft.bom_revision ?? draft.parent_revision ?? ""));
    if (new Set(revisions.map((revision) => revision.toUpperCase())).size !== revisions.length) {
      lineageIssues.push(issue("revision_lineage_conflict", first, ownerPartNumberId, {}, createdAt));
    }
    const nodesByDraft = new Map();
    for (const draft of lineageDrafts) {
      const nodes = await readNodes(client, draft.id);
      nodesByDraft.set(draft.id, nodes);
      for (const node of nodes.filter((candidate) => candidate.node_type === "item")) {
        const matches = (await client.query(`
          SELECT id, company_id, part_root_id, part_number, part_name
          FROM part_numbers WHERE company_id = $1 AND upper(part_number) = upper($2)
          ORDER BY id
        `, [first.owner_company_id, node.part_number ?? ""])).rows;
        if (matches.length !== 1) lineageIssues.push(issue("component_identity_ambiguous", draft, ownerPartNumberId, { nodeId: node.id, partNumber: node.part_number, matchCount: matches.length }, createdAt));
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
    const releases = (await client.query("SELECT * FROM bom_release_snapshots WHERE owner_part_number_id = $1 ORDER BY released_at, id", [ownerPartNumberId])).rows;
    for (const release of releases) {
      const replay = await planRelease(client, release, first, definitionId, createdAt);
      if (replay.issue) replayIssues.push(replay.issue);
      else lineage.releases.push(replay.release);
    }
    const pendingReviews = (await client.query(`
      SELECT review.* FROM bom_review_requests review JOIN bom_drafts draft ON draft.id = review.bom_draft_id
      WHERE draft.owner_part_number_id = $1 AND review.status = 'PendingReview' AND review.review_schema_version = 1
    `, [ownerPartNumberId])).rows;
    for (const review of pendingReviews) replayIssues.push(issue("review_snapshot_unavailable", { id: review.bom_draft_id, company_id: first.owner_company_id }, ownerPartNumberId, { reviewId: review.id }, createdAt));
    if (replayIssues.length) plan.issues.push(...replayIssues);
    else plan.lineages.push(lineage);
  }
  const existing = new Set((await client.query("SELECT id FROM bom_shared_structure_migration_issues")).rows.map((row) => row.id));
  plan.issues = plan.issues.filter((record) => !existing.has(record.id));
  return plan;
}

async function planRelease(client, release, owner, definitionId, createdAt) {
  let lines;
  try { lines = typeof release.line_snapshot_json === "string" ? JSON.parse(release.line_snapshot_json) : release.line_snapshot_json; }
  catch { return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "invalid_json" }, createdAt) }; }
  if (!Array.isArray(lines)) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "not_array" }, createdAt) };
  if (lines.some((line) => !line || typeof line !== "object" || typeof line.id !== "string" || !line.id.trim())) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "line_id_missing" }, createdAt) };
  if (new Set(lines.map((line) => line.id)).size !== lines.length) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "duplicate_line_id" }, createdAt) };
  const logicalByNode = new Map(lines.map((line) => [line.id, deterministicUuid("logical-line", line.id)]));
  const migratedLines = lines.map((line) => ({ ...line, logical_line_id: logicalByNode.get(line.id) }));
  const resolved = [];
  for (const line of lines) {
    const logicalLineId = logicalByNode.get(line.id);
    if (line.parent_line_id && !logicalByNode.has(line.parent_line_id)) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id, reason: "parent_line_missing" }, createdAt) };
    if (line.node_type !== "item" && line.node_type !== "group") return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id, reason: "node_type_invalid" }, createdAt) };
    if (line.node_type === "item") {
      const matches = (await client.query("SELECT id, part_number, part_name, part_root_id FROM part_numbers WHERE company_id = $1 AND upper(part_number) = upper($2) ORDER BY id", [owner.owner_company_id, line.part_number ?? ""])).rows;
      if (matches.length !== 1) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, nodeId: line.id }, createdAt) };
      resolved.push({ logicalLineId, parentLogicalLineId: line.parent_line_id ? logicalByNode.get(line.parent_line_id) ?? null : null, nodeType: "item", child: matches[0], groupName: null, quantity: Number(line.quantity), sequenceNo: Number(line.sequence_no), level: lineLevel(line, lines) });
    } else {
      resolved.push({ logicalLineId, parentLogicalLineId: line.parent_line_id ? logicalByNode.get(line.parent_line_id) ?? null : null, nodeType: "group", child: null, groupName: line.group_name, quantity: null, sequenceNo: Number(line.sequence_no), level: lineLevel(line, lines) });
    }
  }
  const mappings = resolved.filter((line) => line.nodeType === "item").map((line) => ({ logicalLineId: line.logicalLineId, componentMode: "fixed", childPartRootId: line.child.part_root_id, childPartNumberIds: [line.child.id], parentSelections: [] }));
  const review = (await client.query("SELECT * FROM bom_review_requests WHERE bom_draft_id = $1 AND status = 'Approved' ORDER BY reviewed_at DESC, id DESC LIMIT 1", [release.bom_draft_id])).rows[0];
  if (!review?.submitted_by) return { issue: issue("release_projection_unavailable", { id: release.bom_draft_id, company_id: owner.owner_company_id }, owner.owner_part_number_id, { releaseId: release.id, reason: "approved_review_missing" }, createdAt) };
  const parentSnapshot = [{ partNumberId: owner.owner_part_number_id, partNumber: owner.owner_part_number, name: owner.owner_part_name, selectionOrder: 0 }];
  const sharedLines = resolved.map((line) => ({ logicalLineId: line.logicalLineId, parentLogicalLineId: line.parentLogicalLineId, nodeType: line.nodeType, groupName: line.groupName, quantity: line.quantity, sequenceNo: line.sequenceNo, level: line.level }));
  const projectionHashes = [{ parentPartNumberId: owner.owner_part_number_id, hash: sha256Text(canonicalJson(resolved.map(resolvedEvidence))), lineCount: resolved.length }];
  const reviewSnapshot = canonicalJson({ schemaVersion: 2, definitionId, definitionRowVersion: 1, draftId: release.bom_draft_id, editorVersion: Number(owner.editor_version ?? 0), bomRevision: release.bom_revision, submitterId: review.submitted_by, parents: parentSnapshot, sharedLines, mappings, resolvedProjectionHashes: projectionHashes, reconfirmationCount: 0, baseReleaseSnapshotId: owner.base_release_snapshot_id ?? null });
  return { release: { ...release, definitionId, owner, migratedLines, resolved, mappings, review: { ...review, snapshotJson: reviewSnapshot, snapshotHash: sha256Text(reviewSnapshot) } } };
}

async function applyPlan(client, plan) {
  for (const lineage of plan.lineages) {
    const first = lineage.drafts[0];
    await client.query(`INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,1,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [lineage.definitionId, lineage.companyId, lineage.rootId, first.created_by, first.updated_by, first.created_at, first.updated_at]);
    await client.query(`INSERT INTO bom_definition_parent_bindings (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [deterministicUuid("definition-binding", lineage.ownerPartNumberId), lineage.companyId, lineage.definitionId, lineage.ownerPartNumberId, String(first.bom_revision ?? first.parent_revision), first.created_by, first.created_at]);
    await client.query("UPDATE part_numbers SET structure_type = 'assembly' WHERE id = $1", [lineage.ownerPartNumberId]);
    for (const draft of lineage.drafts) {
      await client.query("UPDATE bom_drafts SET definition_id = $1 WHERE id = $2 AND definition_id IS NULL", [lineage.definitionId, draft.id]);
      await client.query(`INSERT INTO bom_draft_parent_bindings (id, company_id, bom_draft_id, part_number_id, selection_order, created_by, created_at)
        VALUES ($1,$2,$3,$4,0,$5,$6) ON CONFLICT DO NOTHING`, [deterministicUuid("draft-binding", draft.id), lineage.companyId, draft.id, lineage.ownerPartNumberId, draft.created_by, draft.created_at]);
      for (const node of draft.nodes) {
        const table = node.location === "tree" ? "bom_lines_tree" : "bom_draft_floating_topics";
        await client.query(`UPDATE ${table} SET logical_line_id = $1 WHERE id = $2 AND logical_line_id IS NULL`, [node.logicalLineId, node.id]);
        if (node.node_type !== "item") continue;
        await client.query(`INSERT INTO bom_draft_component_nodes (bom_draft_id, logical_line_id, node_id, node_location, component_mode, child_part_root_id, created_by, updated_by, created_at, updated_at)
          VALUES ($1,$2,$3,$4,'fixed',$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, [draft.id, node.logicalLineId, node.id, node.location, node.canonicalChild.part_root_id, draft.created_by, draft.updated_by, node.created_at ?? draft.created_at, node.updated_at ?? draft.updated_at]);
        await client.query(`INSERT INTO bom_draft_component_candidates (bom_draft_id, logical_line_id, child_part_number_id, selection_order)
          VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`, [draft.id, node.logicalLineId, node.canonicalChild.id]);
      }
    }
    for (const release of lineage.releases) await applyRelease(client, release, lineage);
  }
  for (const record of plan.issues) {
    await client.query(`INSERT INTO bom_shared_structure_migration_issues
      (id, company_id, bom_draft_id, part_number_id, issue_code, detail_json, issue_status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,'open',$7) ON CONFLICT (id) DO NOTHING`, [record.id, record.companyId, record.bomDraftId, record.partNumberId, record.issueCode, canonicalJson(record.details), record.createdAt]);
  }
}

async function applyRelease(client, release, lineage) {
  const parent = release.owner;
  const parentSnapshot = [{ partNumberId: lineage.ownerPartNumberId, partNumber: parent.owner_part_number, name: parent.owner_part_name, selectionOrder: 0 }];
  const projectionHashes = [{ parentPartNumberId: lineage.ownerPartNumberId, hash: sha256Text(canonicalJson(release.resolved.map(resolvedEvidence))), lineCount: release.resolved.length }];
  const parentJson = canonicalJson(parentSnapshot);
  const mappingJson = canonicalJson(release.mappings);
  const resolvedJson = canonicalJson(projectionHashes);
  const lineJson = canonicalJson(release.migratedLines);
  const snapshotHash = sha256Text(canonicalJson({ schemaVersion: 2, definitionId: lineage.definitionId, bomRevision: release.bom_revision, reviewSnapshotHash: release.review.snapshotHash, parentSnapshotHash: sha256Text(parentJson), lineSnapshotHash: sha256Text(lineJson), mappingSnapshotHash: sha256Text(mappingJson), resolvedProjectionHash: sha256Text(resolvedJson) }));
  await client.query(`UPDATE bom_review_requests SET review_schema_version=2, definition_row_version=1, editor_version=$1,
    review_snapshot_json=$2::jsonb, review_snapshot_hash=$3 WHERE id=$4 AND review_schema_version=1`, [Number(parent.editor_version ?? 0), release.review.snapshotJson, release.review.snapshotHash, release.review.id]);
  await client.query(`UPDATE bom_release_snapshots SET definition_id=$1, line_snapshot_json=$2, snapshot_schema_version=2,
    parent_snapshot_json=$3::jsonb, mapping_snapshot_json=$4::jsonb, resolved_projection_json=$5::jsonb, snapshot_hash=$6
    WHERE id=$7 AND snapshot_schema_version=1`, [lineage.definitionId, lineJson, parentJson, mappingJson, resolvedJson, snapshotHash, release.id]);
  await client.query(`INSERT INTO bom_release_parent_snapshots (release_snapshot_id,parent_part_number_id,definition_id,parent_part_number,parent_part_name,selection_order)
    VALUES ($1,$2,$3,$4,$5,0) ON CONFLICT DO NOTHING`, [release.id, lineage.ownerPartNumberId, lineage.definitionId, parent.owner_part_number, parent.owner_part_name]);
  for (const line of release.resolved) {
    await client.query(`INSERT INTO bom_release_resolved_lines (id,release_snapshot_id,definition_id,parent_part_number_id,logical_line_id,parent_logical_line_id,node_type,child_part_number_id,child_part_number,child_part_name,group_name,quantity,sequence_no,level,source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual') ON CONFLICT DO NOTHING`, [deterministicUuid("resolved-line", `${release.id}|${line.logicalLineId}|${lineage.ownerPartNumberId}`), release.id, lineage.definitionId, lineage.ownerPartNumberId, line.logicalLineId, line.parentLogicalLineId, line.nodeType, line.child?.id ?? null, line.child?.part_number ?? null, line.child?.part_name ?? null, line.groupName, line.quantity, line.sequenceNo, line.level]);
  }
}

async function readNodes(client, draftId) {
  const tree = (await client.query("SELECT *, 'tree' AS location FROM bom_lines_tree WHERE bom_draft_id=$1 ORDER BY sequence_no,id", [draftId])).rows;
  const floating = (await client.query("SELECT *, 'floating' AS location FROM bom_draft_floating_topics WHERE bom_draft_id=$1 ORDER BY sequence_no,id", [draftId])).rows;
  return [...tree, ...floating];
}

function issue(issueCode, draft, partNumberId, details, createdAt) {
  const stableSourceId = `${issueCode}|${draft.id ?? "none"}|${partNumberId ?? "none"}|${canonicalJson(details)}`;
  return { id: deterministicUuid("migration-issue", stableSourceId), issueCode, companyId: draft.company_id ?? null, bomDraftId: draft.id ?? null, partNumberId: partNumberId ?? null, details, createdAt };
}
function deterministicUuid(entityKind, stableSourceId) { const bytes = crypto.createHash("sha256").update(`ai-pdm/dev096/v1|${entityKind}|${stableSourceId}`, "utf8").digest().subarray(0,16); bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128; const h=bytes.toString("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
function canonicalJson(value) { return JSON.stringify(sortCanonical(value)); }
function sortCanonical(value) { if (Array.isArray(value)) return value.map(sortCanonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,sortCanonical(value[key])])); if (typeof value === "string") return value.trim(); return value; }
function sha256Text(value) { return crypto.createHash("sha256").update(value,"utf8").digest("hex"); }
function resolvedEvidence(line) { return { logicalLineId:line.logicalLineId,parentLogicalLineId:line.parentLogicalLineId,nodeType:line.nodeType,childPartNumberId:line.child?.id??null,childPartNumber:line.child?.part_number??null,childPartName:line.child?.part_name??null,groupName:line.groupName,quantity:line.quantity,sequenceNo:line.sequenceNo,level:line.level }; }
function lineLevel(line, lines) { const byId=new Map(lines.map((row)=>[row.id,row])); let level=0; let parent=line.parent_line_id; const seen=new Set(); while(parent&&!seen.has(parent)){seen.add(parent);level+=1;parent=byId.get(parent)?.parent_line_id??null;} return level; }
function groupBy(rows,keyOf){const map=new Map();for(const row of rows){const key=keyOf(row);map.set(key,[...(map.get(key)??[]),row]);}return map;}
function dedupeIssues(issues){return [...new Map(issues.map((record)=>[record.id,record])).values()];}
function countPlannedWrites(plan){return plan.lineages.reduce((sum,lineage)=>sum+2+lineage.drafts.reduce((draftSum,draft)=>draftSum+2+draft.nodes.length+draft.nodes.filter((node)=>node.node_type==="item").length*2,0)+lineage.releases.reduce((releaseSum,release)=>releaseSum+3+release.resolved.length,0),0)+plan.issues.length;}
function summarizePlan(plan){return {lineages:plan.lineages.length,drafts:plan.lineages.reduce((sum,lineage)=>sum+lineage.drafts.length,0),releases:plan.lineages.reduce((sum,lineage)=>sum+lineage.releases.length,0),issues:plan.issues.length,plannedWrites:countPlannedWrites(plan)};}
