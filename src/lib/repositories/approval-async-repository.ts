import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import type { ApprovalMatrixRequirement } from "@/lib/types";

export type AsyncApprovalDecision = "Approved" | "Rejected";

export const INSERT_ASYNC_APPROVAL_STEP_SQL = `
  INSERT INTO approval_steps (id, submission_id, reviewer_id, sequence_no, decision, comment, decided_at)
  VALUES (:id, :submissionId, :reviewerId, 1, :decision, :comment, :decidedAt)
`;

export const SELECT_ASYNC_REVIEWER_DECISION_SQL = `
  SELECT id
  FROM approval_steps
  WHERE submission_id = :submissionId
    AND reviewer_id = :reviewerId
  LIMIT 1
`;

export const SELECT_ASYNC_APPROVAL_SUMMARY_SQL = `
  SELECT decision, COUNT(*) AS count
  FROM approval_steps
  WHERE submission_id = :submissionId
  GROUP BY decision
`;

export const DEFAULT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS: Array<{
  requiredRole: ApprovalMatrixRequirement["required_role"];
  minCount: number;
}> = [
  { requiredRole: "R&D Manager", minCount: 1 },
  { requiredRole: "Admin", minCount: 1 }
];

export const SELECT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS_SQL = `
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
    WHERE a.submission_id = :submissionId
      AND a.decision = 'Approved'
    GROUP BY u.role
  ) approved ON approved.required_role = r.required_role
  WHERE r.submission_id = :submissionId
  ORDER BY
    CASE r.required_role WHEN 'R&D Manager' THEN 1 WHEN 'Admin' THEN 2 ELSE 3 END,
    r.created_at ASC,
    r.id ASC
`;

export const INSERT_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL = `
  INSERT INTO approval_matrix_requirements (
    id, submission_id, required_role, min_count, status, created_by, created_at, updated_at
  ) VALUES (:id, :submissionId, :requiredRole, :minCount, 'open', :createdBy, :now, :now)
`;

export const SATISFY_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL = `
  UPDATE approval_matrix_requirements
  SET status = 'satisfied',
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :requirementId
    AND status = 'open'
`;

export const WAIVE_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL = `
  UPDATE approval_matrix_requirements
  SET status = 'waived',
      decided_by = :decidedBy,
      decision_comment = :comment,
      decided_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :requirementId
`;

export type AsyncApprovalMatrixInitializationResult = {
  created: boolean;
  requirements: ApprovalMatrixRequirement[];
};

export type AsyncApprovalMatrixWaiverResult =
  | { ok: true; requirement: ApprovalMatrixRequirement | null }
  | { ok: false; status: 404 | 409; error: string };

export class AsyncApprovalRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async addApproval(input: {
    submissionId: string;
    reviewerId: string;
    decision: AsyncApprovalDecision;
    comment?: string | null;
  }): Promise<void> {
    await this.client.execute(INSERT_ASYNC_APPROVAL_STEP_SQL, {
      id: this.idFactory(),
      submissionId: input.submissionId,
      reviewerId: input.reviewerId,
      decision: input.decision,
      comment: input.comment ?? null,
      decidedAt: this.clock()
    });
  }

  async reviewerHasDecision(input: { submissionId: string; reviewerId: string }): Promise<boolean> {
    const row = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_REVIEWER_DECISION_SQL, {
      submissionId: input.submissionId,
      reviewerId: input.reviewerId
    });
    return Boolean(row);
  }

  async getApprovalSummary(submissionId: string): Promise<{ approved: number; rejected: number }> {
    const rows = await this.client.query<{ decision: AsyncApprovalDecision; count: number | string }>(
      SELECT_ASYNC_APPROVAL_SUMMARY_SQL,
      { submissionId }
    );

    return {
      approved: Number(rows.find((row) => row.decision === "Approved")?.count ?? 0),
      rejected: Number(rows.find((row) => row.decision === "Rejected")?.count ?? 0)
    };
  }

  async listApprovalMatrixRequirements(submissionId: string): Promise<ApprovalMatrixRequirement[]> {
    return this.client.query<ApprovalMatrixRequirement>(SELECT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS_SQL, { submissionId });
  }

  async getApprovalMatrixRequirement(input: {
    submissionId: string;
    requirementId: string;
  }): Promise<ApprovalMatrixRequirement | null> {
    const requirements = await this.listApprovalMatrixRequirements(input.submissionId);
    return requirements.find((requirement) => requirement.id === input.requirementId) ?? null;
  }

  async initializeApprovalMatrixRequirements(input: {
    submissionId: string;
    createdBy: string;
    requirements?: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }>;
  }): Promise<AsyncApprovalMatrixInitializationResult> {
    const existing = await this.listApprovalMatrixRequirements(input.submissionId);
    if (existing.length > 0) {
      return { created: false, requirements: await this.refreshApprovalMatrixRequirements(input.submissionId) };
    }

    const requirements = input.requirements?.length ? input.requirements : DEFAULT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS;
    const now = this.clock();
    for (const requirement of requirements) {
      await this.client.execute(INSERT_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        requiredRole: requirement.requiredRole,
        minCount: requirement.minCount,
        createdBy: input.createdBy,
        now
      });
    }
    await this.audit("ApprovalMatrixInitialized", input.submissionId, input.createdBy, {
      requirements: requirements.map((requirement) => ({ role: requirement.requiredRole, minCount: requirement.minCount }))
    });

    return { created: true, requirements: await this.refreshApprovalMatrixRequirements(input.submissionId) };
  }

  async refreshApprovalMatrixRequirements(submissionId: string): Promise<ApprovalMatrixRequirement[]> {
    const now = this.clock();
    const requirements = await this.listApprovalMatrixRequirements(submissionId);
    for (const requirement of requirements) {
      if (requirement.status === "open" && Number(requirement.approved_count) >= requirement.min_count) {
        await this.client.execute(SATISFY_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL, {
          submissionId,
          requirementId: requirement.id,
          now
        });
      }
    }
    return this.listApprovalMatrixRequirements(submissionId);
  }

  async waiveApprovalMatrixRequirement(input: {
    submissionId: string;
    requirementId: string;
    decidedBy: string;
    comment: string;
  }): Promise<AsyncApprovalMatrixWaiverResult> {
    const existing = await this.getApprovalMatrixRequirement({
      submissionId: input.submissionId,
      requirementId: input.requirementId
    });
    if (!existing) return { ok: false, status: 404, error: "Approval matrix requirement not found" };
    if (existing.status !== "open") {
      return { ok: false, status: 409, error: "Approval matrix requirement is already closed" };
    }

    const now = this.clock();
    await this.client.execute(WAIVE_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL, {
      submissionId: input.submissionId,
      requirementId: input.requirementId,
      decidedBy: input.decidedBy,
      comment: input.comment,
      now
    });
    await this.audit("ApprovalMatrixWaived", input.submissionId, input.decidedBy, {
      requirementId: input.requirementId,
      comment: input.comment
    });

    return {
      ok: true,
      requirement: await this.getApprovalMatrixRequirement({
        submissionId: input.submissionId,
        requirementId: input.requirementId
      })
    };
  }

  async listOpenApprovalMatrixRequirements(submissionId: string): Promise<ApprovalMatrixRequirement[]> {
    const requirements = await this.refreshApprovalMatrixRequirements(submissionId);
    return requirements.filter((requirement) => requirement.status === "open");
  }

  private async audit(action: string, submissionId: string, actorId: string, detail: Record<string, unknown>) {
    await new AsyncAuditRepository(this.client, this.clock).createAuditLog({
      submissionId,
      actorId,
      action,
      detail
    });
  }
}
