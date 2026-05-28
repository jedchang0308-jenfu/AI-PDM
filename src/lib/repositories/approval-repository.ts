import crypto from "node:crypto";
import { createAuditLog, getDb } from "@/lib/db";
import type { ApprovalMatrixRequirement } from "@/lib/types";

export function addApproval(input: { submissionId: string; reviewerId: string; decision: "Approved" | "Rejected"; comment?: string }) {
  getDb()
    .prepare(
      `
      INSERT INTO approval_steps (id, submission_id, reviewer_id, sequence_no, decision, comment, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(crypto.randomUUID(), input.submissionId, input.reviewerId, 1, input.decision, input.comment ?? null, new Date().toISOString());
}

export function reviewerHasDecision(input: { submissionId: string; reviewerId: string }) {
  const row = getDb()
    .prepare("SELECT id FROM approval_steps WHERE submission_id = ? AND reviewer_id = ? LIMIT 1")
    .get(input.submissionId, input.reviewerId) as { id: string } | undefined;
  return Boolean(row);
}

export function getApprovalSummary(submissionId: string) {
  const rows = getDb()
    .prepare("SELECT decision, COUNT(*) AS count FROM approval_steps WHERE submission_id = ? GROUP BY decision")
    .all(submissionId) as Array<{ decision: string; count: number }>;

  return {
    approved: rows.find((row) => row.decision === "Approved")?.count ?? 0,
    rejected: rows.find((row) => row.decision === "Rejected")?.count ?? 0
  };
}

const DEFAULT_APPROVAL_MATRIX_REQUIREMENTS: Array<{
  requiredRole: ApprovalMatrixRequirement["required_role"];
  minCount: number;
}> = [
  { requiredRole: "R&D Manager", minCount: 1 },
  { requiredRole: "Admin", minCount: 1 }
];

export function listApprovalMatrixRequirements(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        r.*,
        creator.display_name AS created_by_name,
        decider.display_name AS decided_by_name,
        COALESCE(approved.approved_count, 0) AS approved_count
      FROM approval_matrix_requirements r
      JOIN users creator ON creator.id = r.created_by
      LEFT JOIN users decider ON decider.id = r.decided_by
      LEFT JOIN (
        SELECT u.role AS required_role, COUNT(DISTINCT a.reviewer_id) AS approved_count
        FROM approval_steps a
        JOIN users u ON u.id = a.reviewer_id
        WHERE a.submission_id = ? AND a.decision = 'Approved'
        GROUP BY u.role
      ) approved ON approved.required_role = r.required_role
      WHERE r.submission_id = ?
      ORDER BY
        CASE r.required_role WHEN 'R&D Manager' THEN 1 WHEN 'Admin' THEN 2 ELSE 3 END,
        r.rowid ASC
    `
    )
    .all(submissionId, submissionId) as ApprovalMatrixRequirement[];
}

export function getApprovalMatrixRequirement(input: { submissionId: string; requirementId: string }) {
  return listApprovalMatrixRequirements(input.submissionId).find((requirement) => requirement.id === input.requirementId) ?? null;
}

export function initializeApprovalMatrixRequirements(input: {
  submissionId: string;
  createdBy: string;
  requirements?: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }>;
}) {
  const existing = listApprovalMatrixRequirements(input.submissionId);
  if (existing.length > 0) return { created: false, requirements: refreshApprovalMatrixRequirements(input.submissionId) };

  const requirements = input.requirements?.length ? input.requirements : DEFAULT_APPROVAL_MATRIX_REQUIREMENTS;
  const now = new Date().toISOString();
  const insert = getDb().prepare(
    `
    INSERT INTO approval_matrix_requirements (
      id, submission_id, required_role, min_count, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
  `
  );
  const createDefaults = getDb().transaction(() => {
    for (const requirement of requirements) {
      insert.run(crypto.randomUUID(), input.submissionId, requirement.requiredRole, requirement.minCount, input.createdBy, now, now);
    }
  });
  createDefaults();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ApprovalMatrixInitialized",
    detail: { requirements: requirements.map((requirement) => ({ role: requirement.requiredRole, minCount: requirement.minCount })) }
  });

  return { created: true, requirements: refreshApprovalMatrixRequirements(input.submissionId) };
}

export function refreshApprovalMatrixRequirements(submissionId: string) {
  const now = new Date().toISOString();
  const requirements = listApprovalMatrixRequirements(submissionId);
  for (const requirement of requirements) {
    if (requirement.status === "open" && requirement.approved_count >= requirement.min_count) {
      getDb()
        .prepare(
          `
          UPDATE approval_matrix_requirements
          SET status = 'satisfied', updated_at = ?
          WHERE submission_id = ? AND id = ? AND status = 'open'
        `
        )
        .run(now, submissionId, requirement.id);
    }
  }
  return listApprovalMatrixRequirements(submissionId);
}

export function waiveApprovalMatrixRequirement(input: {
  submissionId: string;
  requirementId: string;
  decidedBy: string;
  comment: string;
}) {
  const existing = getApprovalMatrixRequirement({ submissionId: input.submissionId, requirementId: input.requirementId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到簽核矩陣需求" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的簽核矩陣需求可以豁免" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE approval_matrix_requirements
      SET status = 'waived', decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.decidedBy, input.comment, now, now, input.submissionId, input.requirementId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "ApprovalMatrixWaived",
    detail: { requirementId: input.requirementId, comment: input.comment }
  });

  return { ok: true as const, requirement: getApprovalMatrixRequirement({ submissionId: input.submissionId, requirementId: input.requirementId }) };
}

export function listOpenApprovalMatrixRequirements(submissionId: string) {
  return refreshApprovalMatrixRequirements(submissionId).filter((requirement) => requirement.status === "open");
}

