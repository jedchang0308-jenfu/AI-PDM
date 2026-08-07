import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";

export const DRAWING_REVISION_LIFECYCLE_ACTION = "numbering.drawing_revision_lifecycle_review";

export type DrawingRevisionLifecycleAdoptionBlocker = {
  code: string;
  detail?: Record<string, string | number | boolean | null>;
};

export type DrawingRevisionLifecycleAdoptionReviewer = {
  reviewerId: string;
  reviewerRole: string;
  requiredOrder: number;
  quorumGroup: string;
  quorumRequired: number;
};

export type DrawingRevisionLifecycleAdoptionCandidate = {
  packageId: string;
  companyId: string;
  drawingNumberId: string;
  drawingNumber: string;
  revision: string;
  submissionId: string;
  fffAssessmentId: string | null;
  submittedBy: string;
  snapshotHash: string | null;
  targetLifecycleState: "in_review" | "correction_required" | null;
  reviewers: DrawingRevisionLifecycleAdoptionReviewer[];
  blockers: DrawingRevisionLifecycleAdoptionBlocker[];
  fingerprint: string;
};

export type DrawingRevisionLifecycleAdoptionPlan = {
  candidateCount: number;
  adoptableCount: number;
  blockedCount: number;
  candidates: DrawingRevisionLifecycleAdoptionCandidate[];
};

type CandidateRow = {
  package_id: string;
  company_id: string;
  drawing_number_id: string;
  drawing_number: string;
  revision: string;
  package_status: string;
  submission_id: string;
  submission_status: string;
  submitted_by: string;
  fff_assessment_id: string | null;
  snapshot_hash: string | null;
};

type ScopeRow = {
  id: string;
  company_id: string;
  item_id: string;
  part_number_id: string;
  part_number: string;
  part_name: string;
  link_type: string;
  form_state: string;
  fit_state: string;
  function_state: string;
  fff_outcome: string;
};

type FileSnapshotRow = {
  display_name: string;
  role: string;
  is_primary: number | string | boolean;
};

type RequirementRow = { required_role: string; min_count: number };
type UserRow = { id: string };
type CountRow = { count: number };
type ActionRow = { action: string; result: string | null };

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deterministicId(prefix: string, ...parts: string[]) {
  return `${prefix}-${hash(parts).slice(0, 24)}`;
}

async function count(client: AsyncDatabaseClient, sql: string, params: Record<string, unknown>) {
  return Number((await client.queryOne<CountRow>(sql, params))?.count ?? 0);
}

async function listCandidateRows(client: AsyncDatabaseClient) {
  return client.query<CandidateRow>(`
    SELECT
      package.id AS package_id,
      package.company_id,
      package.drawing_number_id,
      package.drawing_number,
      package.revision,
      package.status AS package_status,
      submission.id AS submission_id,
      submission.status AS submission_status,
      submission.submitted_by,
      assessment.id AS fff_assessment_id,
      snapshot.snapshot_hash
    FROM drawing_revision_packages package
    JOIN submissions submission ON submission.id = package.source_submission_id
    LEFT JOIN drawing_revision_fff_assessments assessment
      ON assessment.submission_id = submission.id
     AND assessment.company_id = package.company_id
     AND assessment.drawing_number_id = package.drawing_number_id
     AND assessment.revision = package.revision
    LEFT JOIN submission_snapshots snapshot ON snapshot.submission_id = submission.id
    WHERE package.lifecycle_state IS NULL
      AND submission.status = 'Pending'
    ORDER BY package.company_id, package.drawing_number, package.revision, package.id, assessment.id
  `);
}

async function collectReviewers(
  client: AsyncDatabaseClient,
  companyId: string,
  submissionId: string,
  blockers: DrawingRevisionLifecycleAdoptionBlocker[]
) {
  let requirements = await client.query<RequirementRow>(`
    SELECT required_role, min_count
    FROM approval_matrix_requirements
    WHERE submission_id = :submissionId
      AND status = 'open'
    ORDER BY required_role
  `, { submissionId });
  if (requirements.length === 0) requirements = [{ required_role: "R&D Manager", min_count: 1 }];

  const reviewers: DrawingRevisionLifecycleAdoptionReviewer[] = [];
  let requiredOrder = 0;
  for (const requirement of requirements) {
    requiredOrder += 1;
    const users = await client.query<UserRow>(`
      SELECT DISTINCT user.id
      FROM users user
      LEFT JOIN user_company_memberships membership
        ON membership.user_id = user.id
       AND membership.company_id = :companyId
      WHERE user.role = :role
        AND user.account_status = 'active'
        AND user.system_role_enabled = 1
        AND (user.company_id = :companyId OR membership.company_id = :companyId)
      ORDER BY user.id
    `, { companyId, role: requirement.required_role });
    if (users.length !== Number(requirement.min_count)) {
      blockers.push({
        code: "reviewer_assignment_ambiguous",
        detail: { role: requirement.required_role, required: Number(requirement.min_count), resolved: users.length }
      });
      continue;
    }
    reviewers.push(...users.map((user) => ({
      reviewerId: user.id,
      reviewerRole: requirement.required_role,
      requiredOrder,
      quorumGroup: `role:${requirement.required_role}`,
      quorumRequired: Number(requirement.min_count)
    })));
  }
  return reviewers;
}

async function inspectCandidate(client: AsyncDatabaseClient, rows: CandidateRow[]) {
  const seed = rows[0];
  const blockers: DrawingRevisionLifecycleAdoptionBlocker[] = [];
  const params = { packageId: seed.package_id, submissionId: seed.submission_id, companyId: seed.company_id };

  if (rows.length !== 1 || !seed.fff_assessment_id) {
    blockers.push({ code: "active_legacy_review_count_invalid", detail: { count: rows.length } });
  }
  if (seed.package_status !== "Pending" || seed.submission_status !== "Pending") {
    blockers.push({ code: "legacy_status_not_adoptable" });
  }
  if (!seed.snapshot_hash) blockers.push({ code: "submission_snapshot_missing" });

  const packageCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM drawing_revision_packages
    WHERE company_id = :companyId
      AND drawing_number_id = (SELECT drawing_number_id FROM drawing_revision_packages WHERE id = :packageId)
      AND revision = (SELECT revision FROM drawing_revision_packages WHERE id = :packageId)
      AND status IN ('Draft', 'Pending')
  `, params);
  if (packageCount !== 1) blockers.push({ code: "active_package_count_invalid", detail: { count: packageCount } });

  const identityMismatch = await count(client, `
    SELECT COUNT(*) AS count
    FROM drawing_revision_packages package
    JOIN submissions submission ON submission.id = :submissionId
    JOIN drawing_numbers drawing ON drawing.id = package.drawing_number_id
    WHERE package.id = :packageId
      AND (
        package.company_id <> submission.company_id
        OR package.company_id <> drawing.company_id
        OR package.drawing_number <> submission.drawing_number
        OR package.drawing_number <> drawing.drawing_number
        OR package.revision <> submission.revision
      )
  `, params);
  if (identityMismatch !== 0) blockers.push({ code: "identity_mismatch" });

  const companionCount = await count(client, `
    SELECT COUNT(*) AS count FROM drawing_revision_package_review_approvals WHERE package_id = :packageId
  `, params);
  if (companionCount !== 0) blockers.push({ code: "immutable_approval_companion_present" });

  const decisions = await count(client, `
    SELECT COUNT(*) AS count FROM approval_steps WHERE submission_id = :submissionId
  `, params);
  if (decisions !== 0) blockers.push({ code: "legacy_decision_present", detail: { count: decisions } });

  const confirmations = seed.fff_assessment_id
    ? await client.query<ActionRow>(`
        SELECT action, result FROM review_confirmation_events
        WHERE review_id = :assessmentId
        ORDER BY occurred_at, id
      `, { assessmentId: seed.fff_assessment_id })
    : [];
  let targetLifecycleState: DrawingRevisionLifecycleAdoptionCandidate["targetLifecycleState"] = "in_review";
  if (confirmations.length === 1 && confirmations[0].action === "return_for_replacement_part") {
    targetLifecycleState = "correction_required";
  } else if (confirmations.length > 0) {
    blockers.push({ code: "terminal_or_contradictory_review_event", detail: { count: confirmations.length } });
    targetLifecycleState = null;
  }

  const fileFacts = await client.queryOne<{ total: number; durable: number }>(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN source_file_asset_id IS NOT NULL THEN 1 ELSE 0 END) AS durable
    FROM drawing_revision_package_files
    WHERE package_id = :packageId
  `, params);
  if (!fileFacts || Number(fileFacts.total) === 0 || Number(fileFacts.total) !== Number(fileFacts.durable)) {
    blockers.push({ code: "controlled_file_not_durable", detail: { total: Number(fileFacts?.total ?? 0), durable: Number(fileFacts?.durable ?? 0) } });
  }

  const scopes = await client.query<ScopeRow>(`
    SELECT scope.*
    FROM submission_part_scopes scope
    JOIN items item ON item.id = scope.item_id AND item.company_id = scope.company_id
    JOIN part_numbers part ON part.id = scope.part_number_id AND part.company_id = scope.company_id
    WHERE scope.submission_id = :submissionId
      AND scope.company_id = :companyId
      AND item.part_number = scope.part_number
      AND part.part_number = scope.part_number
    ORDER BY scope.part_number, scope.id
  `, params);
  const sourceScopeCount = await count(client, `
    SELECT COUNT(*) AS count FROM submission_part_scopes WHERE submission_id = :submissionId
  `, params);
  if (sourceScopeCount === 0 || sourceScopeCount !== scopes.length) {
    blockers.push({ code: "part_scope_not_durable", detail: { source: sourceScopeCount, resolved: scopes.length } });
  }
  const scopeCollisionCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM drawing_revision_package_part_scopes durable
    JOIN submission_part_scopes source
      ON source.submission_id = :submissionId
     AND source.part_number_id = durable.part_number_id
    WHERE durable.package_id = :packageId
      AND (
        durable.company_id <> source.company_id
        OR durable.item_id <> source.item_id
        OR durable.part_number <> source.part_number
        OR durable.link_type <> source.link_type
      )
  `, params);
  if (scopeCollisionCount !== 0) blockers.push({ code: "durable_part_scope_collision", detail: { count: scopeCollisionCount } });

  const dependencyChecks = [
    ["discussion_dependency", "SELECT COUNT(*) AS count FROM discussion_comments WHERE submission_id = :submissionId"],
    ["review_issue_dependency", "SELECT COUNT(*) AS count FROM review_issues WHERE submission_id = :submissionId"],
    ["markup_dependency", "SELECT COUNT(*) AS count FROM pdf_markups WHERE submission_id = :submissionId"],
    ["change_request_dependency", "SELECT COUNT(*) AS count FROM change_requests WHERE submission_id = :submissionId"],
    ["sandbox_dependency", "SELECT COUNT(*) AS count FROM sandbox_branches WHERE source_submission_id = :submissionId OR sandbox_submission_id = :submissionId"],
    ["bom_dependency", "SELECT COUNT(*) AS count FROM bom_drafts WHERE parent_submission_id = :submissionId"],
    ["supplement_dependency", "SELECT COUNT(*) AS count FROM drawing_revision_package_supplements WHERE package_id = :packageId"]
  ] as const;
  for (const [code, sql] of dependencyChecks) {
    const dependencyCount = await count(client, sql, params);
    if (dependencyCount !== 0) blockers.push({ code, detail: { count: dependencyCount } });
  }

  const workflowCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM drawing_revision_lifecycle_workflows
    WHERE package_id = :packageId OR legacy_submission_id = :submissionId
  `, params);
  if (workflowCount !== 0) blockers.push({ code: "native_workflow_already_exists", detail: { count: workflowCount } });
  const legacyLinkCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM approval_platform_legacy_links
    WHERE legacy_table IN ('submissions', 'drawing_revision_fff_assessments')
      AND legacy_id IN (:submissionId, :assessmentId)
  `, { ...params, assessmentId: seed.fff_assessment_id ?? "" });
  if (legacyLinkCount !== 0) blockers.push({ code: "native_request_or_legacy_link_exists", detail: { count: legacyLinkCount } });

  const reviewers = await collectReviewers(client, seed.company_id, seed.submission_id, blockers);
  const fingerprint = hash({
    packageId: seed.package_id,
    submissionId: seed.submission_id,
    assessmentId: seed.fff_assessment_id,
    snapshotHash: seed.snapshot_hash,
    targetLifecycleState,
    scopes,
    reviewers
  });
  return {
    packageId: seed.package_id,
    companyId: seed.company_id,
    drawingNumberId: seed.drawing_number_id,
    drawingNumber: seed.drawing_number,
    revision: seed.revision,
    submissionId: seed.submission_id,
    fffAssessmentId: seed.fff_assessment_id,
    submittedBy: seed.submitted_by,
    snapshotHash: seed.snapshot_hash,
    targetLifecycleState,
    reviewers,
    blockers,
    fingerprint
  } satisfies DrawingRevisionLifecycleAdoptionCandidate;
}

export async function planDrawingRevisionLifecycleAdoption(
  client: AsyncDatabaseClient = getAsyncDatabaseClient()
): Promise<DrawingRevisionLifecycleAdoptionPlan> {
  const rows = await listCandidateRows(client);
  const grouped = new Map<string, CandidateRow[]>();
  for (const row of rows) grouped.set(row.package_id, [...(grouped.get(row.package_id) ?? []), row]);
  const candidates: DrawingRevisionLifecycleAdoptionCandidate[] = [];
  for (const group of grouped.values()) candidates.push(await inspectCandidate(client, group));
  const blockedCount = candidates.filter((candidate) => candidate.blockers.length > 0).length;
  return {
    candidateCount: candidates.length,
    adoptableCount: candidates.length - blockedCount,
    blockedCount,
    candidates
  };
}

async function copyScopes(client: AsyncDatabaseClient, candidate: DrawingRevisionLifecycleAdoptionCandidate) {
  const scopes = await client.query<ScopeRow>(`
    SELECT * FROM submission_part_scopes
    WHERE submission_id = :submissionId AND company_id = :companyId
    ORDER BY part_number, id
  `, { submissionId: candidate.submissionId, companyId: candidate.companyId });
  for (const scope of scopes) {
    await client.execute(`
      INSERT INTO drawing_revision_package_part_scopes (
        id, package_id, company_id, item_id, part_number_id, part_number, part_name, link_type,
        form_state, fit_state, function_state, fff_outcome
      ) VALUES (
        :id, :packageId, :companyId, :itemId, :partNumberId, :partNumber, :partName, :linkType,
        :formState, :fitState, :functionState, :fffOutcome
      )
      ON CONFLICT (package_id, part_number_id) DO NOTHING
    `, {
      id: deterministicId("phase1h-scope", candidate.packageId, scope.part_number_id),
      packageId: candidate.packageId,
      companyId: scope.company_id,
      itemId: scope.item_id,
      partNumberId: scope.part_number_id,
      partNumber: scope.part_number,
      partName: scope.part_name,
      linkType: scope.link_type,
      formState: scope.form_state,
      fitState: scope.fit_state,
      functionState: scope.function_state,
      fffOutcome: scope.fff_outcome
    });
  }
}

async function buildAdoptionImpactSnapshot(client: AsyncDatabaseClient, candidate: DrawingRevisionLifecycleAdoptionCandidate) {
  const parts = await client.query<Pick<ScopeRow, "part_number" | "part_name" | "link_type" | "fff_outcome">>(`
    SELECT part_number, part_name, link_type, fff_outcome
    FROM drawing_revision_package_part_scopes
    WHERE package_id = :packageId AND company_id = :companyId
    ORDER BY part_number, id
  `, { packageId: candidate.packageId, companyId: candidate.companyId });
  const files = await client.query<FileSnapshotRow>(`
    SELECT display_name, role, is_primary
    FROM drawing_revision_package_files
    WHERE package_id = :packageId
    ORDER BY sort_order, created_at, id
  `, { packageId: candidate.packageId });
  return {
    drawing: { number: candidate.drawingNumber, revision: candidate.revision },
    parts: parts.map((part) => ({
      number: part.part_number,
      name: part.part_name,
      linkType: part.link_type,
      fffOutcome: part.fff_outcome
    })),
    files: files.map((file) => ({
      name: file.display_name,
      role: file.role,
      isPrimary: file.is_primary === true || Number(file.is_primary) === 1
    })),
    counts: { partCount: parts.length, fileCount: files.length }
  };
}

async function applyCandidate(client: AsyncDatabaseClient, candidate: DrawingRevisionLifecycleAdoptionCandidate) {
  if (!candidate.snapshotHash || !candidate.fffAssessmentId || !candidate.targetLifecycleState) {
    throw new Error(`DRAWING_LIFECYCLE_ADOPTION_INVALID_CANDIDATE:${candidate.packageId}`);
  }
  const workflowId = deterministicId("phase1h-workflow", candidate.packageId, candidate.submissionId);
  const approvalPackageId = deterministicId("phase1h-approval-package", candidate.packageId, candidate.submissionId);
  const approvalRequestId = deterministicId("phase1h-approval-request", candidate.packageId, candidate.submissionId);
  const requestStatus = candidate.targetLifecycleState === "correction_required" ? "rejected" : "pending";
  const now = new Date().toISOString();

  await copyScopes(client, candidate);
  const impactSnapshot = await buildAdoptionImpactSnapshot(client, candidate);
  await client.execute(`
    INSERT INTO approval_platform_packages (
      id, company_id, package_code, action_code, package_type, package_status, title, reason,
      submitted_by, submitted_at, payload_json, created_at, updated_at
    ) VALUES (
      :id, :companyId, :packageCode, :actionCode, 'single', :status, :title,
      'Phase 1H active adoption', :submittedBy, :now, '{}', :now, :now
    )
  `, {
    id: approvalPackageId,
    companyId: candidate.companyId,
    packageCode: `DRL-ADOPT-${hash(candidate.packageId).slice(0, 16)}`,
    actionCode: DRAWING_REVISION_LIFECYCLE_ACTION,
    status: requestStatus,
    title: `Drawing revision ${candidate.drawingNumber} ${candidate.revision}`,
    submittedBy: candidate.submittedBy,
    now
  });
  await client.execute(`
    INSERT INTO approval_platform_requests (
      id, company_id, package_id, action_code, domain_code, request_status, title, reason,
      requested_by, requested_at, apply_status, payload_json, created_at, updated_at
    ) VALUES (
      :id, :companyId, :packageId, :actionCode, 'drawing_revision', :status, :title,
      'Phase 1H active adoption', :submittedBy, :now, 'not_ready', '{}', :now, :now
    )
  `, {
    id: approvalRequestId,
    companyId: candidate.companyId,
    packageId: approvalPackageId,
    actionCode: DRAWING_REVISION_LIFECYCLE_ACTION,
    status: requestStatus,
    title: `Drawing revision ${candidate.drawingNumber} ${candidate.revision}`,
    submittedBy: candidate.submittedBy,
    now
  });
  await client.execute(`
    INSERT INTO approval_platform_package_items (id, package_id, request_id, item_status, sort_order, created_at, updated_at)
    VALUES (:id, :packageId, :requestId, :status, 0, :now, :now)
  `, {
    id: deterministicId("phase1h-package-item", approvalPackageId, approvalRequestId),
    packageId: approvalPackageId,
    requestId: approvalRequestId,
    status: requestStatus,
    now
  });
  await client.execute(`
    INSERT INTO approval_platform_targets (
      id, request_id, target_role, target_type, target_id, target_code, target_label,
      target_status, snapshot_json, sort_order, created_at
    ) VALUES (
      :id, :requestId, 'primary', 'drawing_revision_package', :targetId, :targetCode,
      :targetLabel, :targetStatus, :targetSnapshotJson, 0, :now
    )
  `, {
    id: deterministicId("phase1h-target", approvalRequestId, candidate.packageId),
    requestId: approvalRequestId,
    targetId: candidate.packageId,
    targetCode: candidate.drawingNumber,
    targetLabel: `${candidate.drawingNumber} ${candidate.revision}`,
    targetStatus: candidate.targetLifecycleState,
    targetSnapshotJson: JSON.stringify(impactSnapshot),
    now
  });
  await client.execute(`
    INSERT INTO approval_platform_impact_snapshots (
      id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at
    ) VALUES (:id, :requestId, :packageId, :snapshotHash, :snapshotJson, :capturedBy, :now)
  `, {
    id: deterministicId("phase1h-impact", approvalRequestId, candidate.snapshotHash),
    requestId: approvalRequestId,
    packageId: approvalPackageId,
    snapshotHash: candidate.snapshotHash,
    snapshotJson: JSON.stringify(impactSnapshot),
    capturedBy: candidate.submittedBy,
    now
  });
  await client.execute(`
    INSERT INTO drawing_revision_lifecycle_workflows (
      id, package_id, company_id, approval_package_id, approval_request_id,
      legacy_submission_id, legacy_fff_assessment_id, origin, state, submitted_by,
      snapshot_hash, created_at, updated_at
    ) VALUES (
      :id, :packageId, :companyId, :approvalPackageId, :approvalRequestId,
      :submissionId, :assessmentId, 'adopted_active', 'active', :submittedBy,
      :snapshotHash, :now, :now
    )
  `, {
    id: workflowId,
    packageId: candidate.packageId,
    companyId: candidate.companyId,
    approvalPackageId,
    approvalRequestId,
    submissionId: candidate.submissionId,
    assessmentId: candidate.fffAssessmentId,
    submittedBy: candidate.submittedBy,
    snapshotHash: candidate.snapshotHash,
    now
  });
  for (const reviewer of candidate.reviewers) {
    await client.execute(`
      INSERT INTO drawing_revision_lifecycle_reviewers (
        id, workflow_id, reviewer_id, reviewer_role, required_order, quorum_group, quorum_required, created_at
      ) VALUES (
        :id, :workflowId, :reviewerId, :reviewerRole, :requiredOrder, :quorumGroup, :quorumRequired, :now
      )
    `, {
      id: deterministicId("phase1h-reviewer", workflowId, reviewer.reviewerId, reviewer.reviewerRole),
      workflowId,
      reviewerId: reviewer.reviewerId,
      reviewerRole: reviewer.reviewerRole,
      requiredOrder: reviewer.requiredOrder,
      quorumGroup: reviewer.quorumGroup,
      quorumRequired: reviewer.quorumRequired,
      now
    });
  }
  await client.execute(`
    INSERT INTO approval_platform_legacy_links (
      id, request_id, legacy_table, legacy_id, legacy_status, parity_hash, migration_status, created_at, updated_at
    ) VALUES (
      :id, :requestId, 'submissions', :submissionId, 'Pending', :parityHash, 'migrated', :now, :now
    )
  `, {
    id: deterministicId("phase1h-legacy-link", approvalRequestId, candidate.submissionId),
    requestId: approvalRequestId,
    submissionId: candidate.submissionId,
    parityHash: candidate.fingerprint,
    now
  });
  await client.execute(`
    UPDATE drawing_revision_packages
    SET lifecycle_state = :lifecycleState,
        active_correction_reason = NULL,
        updated_at = :now
    WHERE id = :packageId
      AND lifecycle_state IS NULL
      AND status = 'Pending'
  `, { lifecycleState: candidate.targetLifecycleState, now, packageId: candidate.packageId });
}

export async function applyDrawingRevisionLifecycleAdoption(
  client: AsyncDatabaseClient = getAsyncDatabaseClient()
) {
  const initial = await planDrawingRevisionLifecycleAdoption(client);
  if (initial.blockedCount > 0) {
    throw new Error(`DRAWING_LIFECYCLE_ADOPTION_BLOCKED blocked=${initial.blockedCount} candidates=${initial.candidateCount}`);
  }
  return client.transaction(async (transactionClient) => {
    if (transactionClient.kind === "postgres") {
      await transactionClient.query<{ id: string }>(`
        SELECT package.id
        FROM drawing_revision_packages package
        JOIN submissions submission ON submission.id = package.source_submission_id
        WHERE package.lifecycle_state IS NULL
          AND submission.status = 'Pending'
        ORDER BY package.id
        FOR UPDATE OF package, submission
      `);
    }
    const lockedPlan = await planDrawingRevisionLifecycleAdoption(transactionClient);
    if (lockedPlan.blockedCount > 0 || lockedPlan.candidateCount !== initial.candidateCount) {
      throw new Error(`DRAWING_LIFECYCLE_ADOPTION_BLOCKED blocked=${lockedPlan.blockedCount} candidates=${lockedPlan.candidateCount}`);
    }
    const expected = initial.candidates.map((candidate) => candidate.fingerprint).sort().join(":");
    const locked = lockedPlan.candidates.map((candidate) => candidate.fingerprint).sort().join(":");
    if (expected !== locked) throw new Error("DRAWING_LIFECYCLE_ADOPTION_STATE_CHANGED");
    for (const candidate of lockedPlan.candidates) await applyCandidate(transactionClient, candidate);
    return { adoptedCount: lockedPlan.candidateCount, fingerprints: lockedPlan.candidates.map((candidate) => candidate.fingerprint) };
  });
}

export function redactDrawingRevisionLifecycleAdoptionPlan(plan: DrawingRevisionLifecycleAdoptionPlan) {
  return {
    candidateCount: plan.candidateCount,
    adoptableCount: plan.adoptableCount,
    blockedCount: plan.blockedCount,
    candidates: plan.candidates.map((candidate) => ({
      fixtureKey: hash([candidate.packageId, candidate.submissionId]).slice(0, 12),
      targetLifecycleState: candidate.targetLifecycleState,
      reviewerCount: candidate.reviewers.length,
      blockerCodes: candidate.blockers.map((blocker) => blocker.code),
      fingerprint: candidate.fingerprint
    }))
  };
}
