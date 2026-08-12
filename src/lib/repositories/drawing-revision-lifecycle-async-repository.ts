import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { inferRevisionPackageRole, normalizeRevisionPackageFileRole, type RevisionPackageFileRole } from "@/lib/revision-package";
import { parseRevisionCode } from "@/lib/revision-policy";
import { UnifiedDrawingAsyncRepository } from "@/lib/repositories/unified-drawing-async-repository";
import { lockPdmEntityScopeAsync } from "@/lib/pdm-review-lock";

export const DRAWING_REVISION_LIFECYCLE_ACTION = "numbering.drawing_revision_lifecycle_review";

export type DrawingRevisionLifecycleState =
  | "preparing"
  | "in_review"
  | "correction_required"
  | "rd_controlled"
  | "released";

export type DrawingRevisionLifecycleProjection = {
  packageId: string;
  companyId: string;
  drawingNumberId: string;
  drawingNumber: string;
  revision: string;
  lifecycleState: DrawingRevisionLifecycleState;
  correctionReason: string | null;
  requestId: string | null;
  submittedBy: string | null;
  decisionCount: number;
  reviewerIds: string[];
  updatedAt: string;
};

export type DrawingRevisionLifecycleSubmitRecord = {
  companyId: string;
  drawingNumberId: string;
  drawingNumber: string;
  revision: string;
  submittedBy: string;
  idempotencyKeyHash: string;
  scopeHash: string;
  snapshotHash: string;
  snapshot: Record<string, unknown>;
  note: string;
  files: Array<{
    assetId: string;
    filename: string;
    displayName: string;
    description: string;
    documentCategory: string;
    role?: RevisionPackageFileRole | null;
  }>;
  parts: Array<{
    itemId: string;
    partNumberId: string;
    partNumber: string;
    partName: string;
    linkType: "primary_manufacturing" | "reference";
    formState: string;
    fitState: string;
    functionState: string;
    fffOutcome: string;
  }>;
};

type WorkflowRow = {
  id: string;
  package_id: string;
  company_id: string;
  approval_package_id: string | null;
  approval_request_id: string | null;
  legacy_submission_id: string | null;
  legacy_fff_assessment_id: string | null;
  origin: "new" | "adopted_active";
  state: "active" | "finalizing" | "cleanup_pending";
  submitted_by: string;
  snapshot_hash: string;
  cleanup_authorized_at: string | null;
};

type PackageRow = {
  id: string;
  company_id: string;
  drawing_number_id: string;
  drawing_number: string;
  revision: string;
  status: string;
  lifecycle_state: DrawingRevisionLifecycleState | null;
  active_correction_reason: string | null;
  created_by: string | null;
  updated_at: string;
};

type ReviewerRow = { reviewer_id: string };
type CountRow = { value: number | string };

export class DrawingRevisionLifecycleRepositoryError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "DrawingRevisionLifecycleRepositoryError";
  }
}

export class AsyncDrawingRevisionLifecycleRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async submit(input: DrawingRevisionLifecycleSubmitRecord) {
    return this.client.transaction(async (tx) => {
      const token = await tx.queryOne<{ scope_hash: string; result_fingerprint: string; status: string }>(
        `SELECT scope_hash, result_fingerprint, status
         FROM drawing_revision_lifecycle_command_tokens
         WHERE key_hash = :keyHash AND expires_at > :now`,
        { keyHash: input.idempotencyKeyHash, now: this.clock() }
      );
      if (token && token.scope_hash !== input.scopeHash) {
        throw new DrawingRevisionLifecycleRepositoryError(
          "DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT",
          "同一防重複識別碼已用於不同送審內容，請重新整理後再試。",
          409
        );
      }

      await lockPdmEntityScopeAsync(tx, [
        { type: "drawing_number", id: input.drawingNumberId, companyId: input.companyId },
        ...input.parts.map((part) => ({ type: "part_number", id: part.partNumberId, companyId: input.companyId })),
        ...input.files.map((file) => ({ type: "attachment", id: file.assetId, companyId: input.companyId })),
        ...((input.snapshot.root && typeof input.snapshot.root === "object" && "id" in input.snapshot.root)
          ? [{ type: "part_root", id: String((input.snapshot.root as { id: unknown }).id), companyId: input.companyId }]
          : [])
      ]);
      await this.assertSubmitScopeStable(tx, input);
      const existingProjection = await this.findProjectionByDrawingRevision(tx, {
        companyId: input.companyId,
        drawingNumberId: input.drawingNumberId,
        revision: input.revision
      });
      if (token && existingProjection) {
        return { projection: existingProjection, idempotentReplay: true };
      }
      if (existingProjection) {
        await lockPdmEntityScopeAsync(tx, [{ type: "drawing_revision_package", id: existingProjection.packageId, companyId: input.companyId }]);
      }
      if (existingProjection?.lifecycleState === "in_review") {
        throw new DrawingRevisionLifecycleRepositoryError(
          "DRAWING_LIFECYCLE_STATE_CONFLICT",
          "此圖號版次已在送審中，請查看目前進度。",
          409
        );
      }
      if (existingProjection && !["preparing", "correction_required"].includes(existingProjection.lifecycleState)) {
        throw new DrawingRevisionLifecycleRepositoryError(
          "DRAWING_LIFECYCLE_STATE_CONFLICT",
          "此圖號版次已完成審核，不能重複送審。",
          409
        );
      }

      const now = this.clock();
      const packageId = existingProjection?.packageId ?? `DRP-${this.idFactory()}`;
      const workflowId = `DRLW-${this.idFactory()}`;
      const approvalPackageId = `APP-${this.idFactory()}`;
      const requestId = `APR-${this.idFactory()}`;
      const packageCode = `DR-${input.drawingNumber}-${input.revision}-${this.idFactory().slice(0, 8).toUpperCase()}`;
      const reviewers = await this.listEligibleReviewers(tx, input.companyId);
      if (reviewers.length === 0) {
        throw new DrawingRevisionLifecycleRepositoryError(
          "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED",
          "目前沒有可承接此案的研發主管或 PDM Admin，請先聯絡系統管理員設定審核人。",
          409
        );
      }

      if (existingProjection) {
        await tx.execute(
          `UPDATE drawing_revision_packages
           SET status = 'Pending', lifecycle_state = 'in_review', active_correction_reason = NULL,
               submitted_at = :now, rejected_at = NULL, cancelled_at = NULL,
               snapshot_json = :snapshotJson, updated_at = :now
           WHERE id = :packageId AND company_id = :companyId`,
          { packageId, companyId: input.companyId, snapshotJson: JSON.stringify(input.snapshot), now }
        );
        await tx.execute(
          `DELETE FROM drawing_revision_package_files
           WHERE package_id = :packageId AND source_submission_file_id IS NULL`,
          { packageId }
        );
        await tx.execute(`DELETE FROM drawing_revision_package_part_scopes WHERE package_id = :packageId`, { packageId });
      } else {
        await tx.execute(
          `INSERT INTO drawing_revision_packages (
             id, company_id, drawing_number_id, drawing_number, revision, status, lifecycle_state,
             active_correction_reason, source_submission_id, created_by, created_at, updated_at,
             submitted_at, snapshot_json
           ) VALUES (
             :id, :companyId, :drawingNumberId, :drawingNumber, :revision, 'Pending', 'in_review',
             NULL, NULL, :createdBy, :now, :now, :now, :snapshotJson
           )`,
          {
            id: packageId,
            companyId: input.companyId,
            drawingNumberId: input.drawingNumberId,
            drawingNumber: input.drawingNumber,
            revision: input.revision,
            createdBy: input.submittedBy,
            now,
            snapshotJson: JSON.stringify(input.snapshot)
          }
        );
      }

      for (const [index, file] of input.files.entries()) {
        const role = normalizeRevisionPackageFileRole(file.role) ?? inferRevisionPackageRole(file.filename, file.documentCategory);
        await tx.execute(
          `INSERT INTO drawing_revision_package_files (
             id, package_id, source_file_asset_id, source_submission_file_id, role, role_source,
             display_name, description, sort_order, is_primary, created_by, created_at
           ) VALUES (
             :id, :packageId, :assetId, NULL, :role, :roleSource,
             :displayName, :description, :sortOrder, :isPrimary, :createdBy, :now
           )
           ON CONFLICT(package_id, source_file_asset_id) DO UPDATE SET
             role = excluded.role,
             role_source = excluded.role_source,
             display_name = excluded.display_name,
             description = excluded.description,
             sort_order = excluded.sort_order,
             is_primary = excluded.is_primary`,
          {
            id: `DRPF-${this.idFactory()}`,
            packageId,
            assetId: file.assetId,
            role,
            roleSource: file.role ? "user" : "system",
            displayName: file.displayName || file.filename,
            description: file.description,
            sortOrder: index,
            isPrimary: index === 0 ? 1 : 0,
            createdBy: input.submittedBy,
            now
          }
        );
      }

      for (const part of input.parts) {
        await tx.execute(
          `INSERT INTO drawing_revision_package_part_scopes (
             id, package_id, company_id, item_id, part_number_id, part_number, part_name, link_type,
             form_state, fit_state, function_state, fff_outcome, created_at
           ) VALUES (
             :id, :packageId, :companyId, :itemId, :partNumberId, :partNumber, :partName, :linkType,
             :formState, :fitState, :functionState, :fffOutcome, :now
           )`,
          {
            id: `DRPS-${this.idFactory()}`,
            packageId,
            companyId: input.companyId,
            itemId: part.itemId,
            partNumberId: part.partNumberId,
            partNumber: part.partNumber,
            partName: part.partName,
            linkType: part.linkType,
            formState: part.formState,
            fitState: part.fitState,
            functionState: part.functionState,
            fffOutcome: part.fffOutcome,
            now
          }
        );
      }

      await tx.execute(
        `INSERT INTO approval_platform_packages (
           id, company_id, package_code, action_code, package_type, package_status,
           title, reason, submitted_by, submitted_at, payload_json, created_at, updated_at
         ) VALUES (
           :id, :companyId, :packageCode, :actionCode, 'aggregate', 'pending',
           :title, :reason, :submittedBy, :now, '{}', :now, :now
         )`,
        {
          id: approvalPackageId,
          companyId: input.companyId,
          packageCode,
          actionCode: DRAWING_REVISION_LIFECYCLE_ACTION,
          title: `${input.drawingNumber} / rev ${input.revision}`,
          reason: input.note || "圖面進版送審",
          submittedBy: input.submittedBy,
          now
        }
      );
      await tx.execute(
        `INSERT INTO approval_platform_requests (
           id, company_id, package_id, action_code, domain_code, request_status, title, reason,
           requested_by, requested_at, apply_status, payload_json, created_at, updated_at
         ) VALUES (
           :id, :companyId, :approvalPackageId, :actionCode, 'numbering', 'pending', :title, :reason,
           :requestedBy, :now, 'not_ready', :payloadJson, :now, :now
         )`,
        {
          id: requestId,
          companyId: input.companyId,
          approvalPackageId,
          actionCode: DRAWING_REVISION_LIFECYCLE_ACTION,
          title: `${input.drawingNumber} / rev ${input.revision}`,
          reason: input.note || "圖面進版送審",
          requestedBy: input.submittedBy,
          payloadJson: JSON.stringify({
            drawingNumber: input.drawingNumber,
            revision: input.revision,
            packageId,
            allowedDecisions: ["approved", "rejected"]
          }),
          now
        }
      );
      await tx.execute(
        `INSERT INTO approval_platform_targets (
           id, request_id, target_role, target_type, target_id, target_code, target_label,
           target_status, snapshot_json, sort_order, created_at
         ) VALUES (
           :id, :requestId, 'primary', 'drawing_revision_package', :packageId, :drawingNumber,
           :targetLabel, 'in_review', :snapshotJson, 0, :now
         )`,
        {
          id: `APT-${this.idFactory()}`,
          requestId,
          packageId,
          drawingNumber: input.drawingNumber,
          targetLabel: `${input.drawingNumber} / rev ${input.revision}`,
          snapshotJson: JSON.stringify({ drawingNumber: input.drawingNumber, revision: input.revision, partCount: input.parts.length, fileCount: input.files.length }),
          now
        }
      );
      await tx.execute(
        `INSERT INTO approval_platform_impact_snapshots (
           id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at
         ) VALUES (:id, :requestId, :approvalPackageId, :snapshotHash, :snapshotJson, :capturedBy, :now)`,
        {
          id: `APIS-${this.idFactory()}`,
          requestId,
          approvalPackageId,
          snapshotHash: input.snapshotHash,
          snapshotJson: JSON.stringify(input.snapshot),
          capturedBy: input.submittedBy,
          now
        }
      );
      await tx.execute(
        `INSERT INTO approval_platform_package_items (
           id, package_id, request_id, item_status, sort_order, created_at, updated_at
         ) VALUES (:id, :packageId, :requestId, 'pending', 0, :now, :now)`,
        { id: `APPI-${this.idFactory()}`, packageId: approvalPackageId, requestId, now }
      );
      await tx.execute(
        `INSERT INTO approval_platform_events (
           id, request_id, package_id, event_type, actor_id, detail_json, created_at
         ) VALUES (:id, :requestId, :packageId, 'drawing_revision.lifecycle.submitted', :actorId, '{}', :now)`,
        { id: `APE-${this.idFactory()}`, requestId, packageId: approvalPackageId, actorId: input.submittedBy, now }
      );
      await tx.execute(
        `INSERT INTO drawing_revision_lifecycle_workflows (
           id, package_id, company_id, approval_package_id, approval_request_id,
           legacy_submission_id, legacy_fff_assessment_id, origin, state, submitted_by,
           snapshot_hash, cleanup_authorized_at, created_at, updated_at
         ) VALUES (
           :id, :packageId, :companyId, :approvalPackageId, :requestId,
           NULL, NULL, 'new', 'active', :submittedBy,
           :snapshotHash, NULL, :now, :now
         )`,
        {
          id: workflowId,
          packageId,
          companyId: input.companyId,
          approvalPackageId,
          requestId,
          submittedBy: input.submittedBy,
          snapshotHash: input.snapshotHash,
          now
        }
      );
      for (const [index, reviewer] of reviewers.entries()) {
        await tx.execute(
          `INSERT INTO drawing_revision_lifecycle_reviewers (
             id, workflow_id, reviewer_id, reviewer_role, required_order,
             quorum_group, quorum_required, created_at
           ) VALUES (
             :id, :workflowId, :reviewerId, :reviewerRole, :requiredOrder,
             'drawing_revision', 1, :now
           )`,
          {
            id: `DRLR-${this.idFactory()}`,
            workflowId,
            reviewerId: reviewer.id,
            reviewerRole: reviewer.role,
            requiredOrder: index + 1,
            now
          }
        );
      }
      await tx.execute(
        `INSERT INTO drawing_revision_lifecycle_command_tokens (
           key_hash, scope_hash, result_fingerprint, status, expires_at, created_at, updated_at
         ) VALUES (:keyHash, :scopeHash, :resultFingerprint, 'completed', :expiresAt, :now, :now)
         ON CONFLICT(key_hash) DO UPDATE SET
           result_fingerprint = excluded.result_fingerprint,
           status = excluded.status,
           updated_at = excluded.updated_at`,
        {
          keyHash: input.idempotencyKeyHash,
          scopeHash: input.scopeHash,
          resultFingerprint: hashText(`${packageId}:${input.snapshotHash}:in_review`),
          expiresAt: new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString(),
          now
        }
      );

      await new UnifiedDrawingAsyncRepository(tx).synchronizeFormalDrawing({
        drawingNumberId: input.drawingNumberId,
        companyId: input.companyId
      });
      const projection = await this.findProjectionByPackage(tx, packageId);
      if (!projection) throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_APPLY_FAILED", "送審狀態建立失敗。", 500);
      return { projection, idempotentReplay: false };
    });
  }

  async getProjectionByRequest(requestId: string) {
    const workflow = await this.findWorkflowByRequest(this.client, requestId);
    return workflow ? this.findProjectionByPackage(this.client, workflow.package_id) : null;
  }

  async getProjectionByDrawing(input: { companyId: string; drawingNumber: string }) {
    return this.client.queryOne<PackageRow>(
      `SELECT * FROM drawing_revision_packages
       WHERE company_id = :companyId AND drawing_number = :drawingNumber AND lifecycle_state IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      input
    ).then((row) => row ? this.mapProjection(this.client, row) : null);
  }

  async isAssignedReviewer(requestId: string, actorId: string) {
    const row = await this.client.queryOne<{ value: number }>(
      `SELECT 1 AS value
       FROM drawing_revision_lifecycle_workflows workflow
       JOIN drawing_revision_lifecycle_reviewers reviewer ON reviewer.workflow_id = workflow.id
       WHERE workflow.approval_request_id = :requestId AND reviewer.reviewer_id = :actorId
       LIMIT 1`,
      { requestId, actorId }
    );
    return Boolean(row);
  }

  async decide(input: {
    requestId: string;
    actorId: string;
    actorRole: string;
    decision: "approved" | "returned_for_correction";
    reason?: string | null;
    keyHash: string;
    scopeHash: string;
  }) {
    return this.client.transaction(async (tx) => {
      const token = await tx.queryOne<{ scope_hash: string }>(
        `SELECT scope_hash FROM drawing_revision_lifecycle_command_tokens
         WHERE key_hash = :keyHash AND expires_at > :now`,
        { keyHash: input.keyHash, now: this.clock() }
      );
      if (token && token.scope_hash !== input.scopeHash) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT", "同一防重複識別碼已用於不同審核內容。", 409);
      }
      const workflow = await this.findWorkflowByRequest(tx, input.requestId);
      if (!workflow) {
        if (token) return { projection: null, cleanupPending: false, idempotentReplay: true };
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_WORKFLOW_NOT_FOUND", "此審核案已完成或不存在。", 404);
      }
      const packageIdentity = await tx.queryOne<{ id: string; drawing_number_id: string; company_id: string }>(
        `SELECT id, drawing_number_id, company_id
           FROM drawing_revision_packages
          WHERE id = :packageId AND company_id = :companyId`,
        { packageId: workflow.package_id, companyId: workflow.company_id }
      );
      if (!packageIdentity) throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_STATE_CONFLICT", "版次資料已更新，請重新整理。", 409);
      await lockPdmEntityScopeAsync(tx, [
        { type: "drawing_number", id: packageIdentity.drawing_number_id, companyId: packageIdentity.company_id },
        { type: "drawing_revision_package", id: packageIdentity.id, companyId: packageIdentity.company_id }
      ]);
      const assigned = await tx.queryOne<{ value: number }>(
        `SELECT 1 AS value FROM drawing_revision_lifecycle_reviewers
         WHERE workflow_id = :workflowId AND reviewer_id = :reviewerId LIMIT 1`,
        { workflowId: workflow.id, reviewerId: input.actorId }
      );
      if (!assigned || !["R&D Manager", "Admin"].includes(input.actorRole)) {
        throw new DrawingRevisionLifecycleRepositoryError(
          "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED",
          "你不是此案目前指派的審核人，請聯絡研發主管或 PDM Admin。",
          403
        );
      }
      const request = await tx.queryOne<{ request_status: string }>(
        `SELECT request_status FROM approval_platform_requests WHERE id = :requestId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        { requestId: input.requestId }
      );
      if (!request || request.request_status !== "pending" || workflow.state !== "active") {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_STATE_CONFLICT", "此審核案狀態已更新，請重新整理。", 409);
      }

      const now = this.clock();
      const packageRow = await tx.queryOne<PackageRow>(
        `SELECT * FROM drawing_revision_packages WHERE id = :packageId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        { packageId: workflow.package_id }
      );
      if (!packageRow || packageRow.lifecycle_state !== "in_review") {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_STATE_CONFLICT", "版次狀態已更新，請重新整理。", 409);
      }
      const decision = input.decision === "approved" ? "approved" : "rejected";
      const lifecycleState: DrawingRevisionLifecycleState = input.decision === "approved"
        ? parseRevisionCode(packageRow.revision)?.kind === "major" ? "released" : "rd_controlled"
        : "correction_required";
      const compatibilityStatus = lifecycleState === "released" ? "Released" : "Pending";
      await tx.execute(
        `INSERT INTO approval_platform_decisions (
           id, request_id, approver_role, approver_id, decision, comment, decided_at
         ) VALUES (:id, :requestId, :role, :actorId, :decision, :comment, :now)`,
        {
          id: `APD-${this.idFactory()}`,
          requestId: input.requestId,
          role: input.actorRole,
          actorId: input.actorId,
          decision,
          comment: input.reason?.trim() || null,
          now
        }
      );
      await tx.execute(
        `UPDATE approval_platform_requests
         SET request_status = :status, resolved_by = :actorId, resolved_at = :now,
             apply_status = 'applied', applied_by = :actorId, applied_at = :now, updated_at = :now
         WHERE id = :requestId`,
        { status: decision, actorId: input.actorId, now, requestId: input.requestId }
      );
      await tx.execute(
        `UPDATE approval_platform_packages
         SET package_status = :status, resolved_by = :actorId, resolved_at = :now, updated_at = :now
         WHERE id = :packageId`,
        { status: decision, actorId: input.actorId, now, packageId: workflow.approval_package_id }
      );
      await tx.execute(
        `UPDATE approval_platform_package_items SET item_status = :status, updated_at = :now WHERE request_id = :requestId`,
        { status: decision, now, requestId: input.requestId }
      );
      await tx.execute(
        `UPDATE drawing_revision_packages
         SET status = :status, lifecycle_state = :lifecycleState,
             active_correction_reason = :correctionReason,
             released_at = CASE WHEN :lifecycleState = 'released' THEN :now ELSE released_at END,
             rejected_at = CASE WHEN :lifecycleState = 'correction_required' THEN :now ELSE NULL END,
             updated_at = :now
         WHERE id = :packageId`,
        {
          status: compatibilityStatus,
          lifecycleState,
          correctionReason: lifecycleState === "correction_required" ? input.reason?.trim() || null : null,
          now,
          packageId: workflow.package_id
        }
      );
      if (lifecycleState === "released") {
        await tx.execute(
          `UPDATE drawing_numbers
           SET record_status = 'Released', updated_at = :now
           WHERE id = :drawingNumberId AND company_id = :companyId`,
          { drawingNumberId: packageRow.drawing_number_id, companyId: packageRow.company_id, now }
        );
        await tx.execute(
          `UPDATE part_numbers
           SET record_status = 'Released', updated_at = :now
           WHERE company_id = :companyId
             AND id IN (
               SELECT part_number_id
               FROM drawing_revision_package_part_scopes
               WHERE package_id = :packageId AND company_id = :companyId
             )`,
          { packageId: workflow.package_id, companyId: packageRow.company_id, now }
        );
        await tx.execute(
          `UPDATE items
           SET current_revision = :revision, updated_at = :now
           WHERE company_id = :companyId
             AND id IN (
               SELECT item_id
               FROM drawing_revision_package_part_scopes
               WHERE package_id = :packageId AND company_id = :companyId
             )`,
          { packageId: workflow.package_id, companyId: packageRow.company_id, revision: packageRow.revision, now }
        );
      }
      await tx.execute(
        `UPDATE drawing_revision_lifecycle_workflows
         SET state = 'cleanup_pending', cleanup_authorized_at = :now, updated_at = :now
         WHERE id = :workflowId`,
        { workflowId: workflow.id, now }
      );
      await tx.execute(
        `INSERT INTO drawing_revision_lifecycle_command_tokens (
           key_hash, scope_hash, result_fingerprint, status, expires_at, created_at, updated_at
         ) VALUES (:keyHash, :scopeHash, :resultFingerprint, 'completed', :expiresAt, :now, :now)
         ON CONFLICT(key_hash) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        {
          keyHash: input.keyHash,
          scopeHash: input.scopeHash,
          resultFingerprint: hashText(`${workflow.package_id}:${lifecycleState}`),
          expiresAt: new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString(),
          now
        }
      );
      await new UnifiedDrawingAsyncRepository(tx).synchronizeFormalDrawing({
        drawingNumberId: packageRow.drawing_number_id,
        companyId: packageRow.company_id
      });
      const projection = await this.findProjectionByPackage(tx, workflow.package_id);
      return { projection, workflowId: workflow.id, cleanupPending: true, idempotentReplay: false };
    });
  }

  async withdraw(input: { requestId: string; actorId: string; keyHash: string; scopeHash: string }) {
    return this.client.transaction(async (tx) => {
      const token = await tx.queryOne<{ scope_hash: string }>(
        `SELECT scope_hash FROM drawing_revision_lifecycle_command_tokens
         WHERE key_hash = :keyHash AND expires_at > :now`,
        { keyHash: input.keyHash, now: this.clock() }
      );
      if (token && token.scope_hash !== input.scopeHash) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT", "同一防重複識別碼已用於不同撤回內容。", 409);
      }
      const workflow = await this.findWorkflowByRequest(tx, input.requestId);
      if (!workflow) {
        if (token) return { projection: null, workflowId: null, cleanupPending: false, idempotentReplay: true };
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_WORKFLOW_NOT_FOUND", "此審核案已完成或不存在。", 404);
      }
      if (workflow.submitted_by !== input.actorId) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_WITHDRAW_FORBIDDEN", "只有原申請人可在審核開始前撤回。", 403);
      }
      const count = await tx.queryOne<CountRow>(
        `SELECT COUNT(*) AS value FROM approval_platform_decisions WHERE request_id = :requestId`,
        { requestId: input.requestId }
      );
      if (Number(count?.value ?? 0) > 0) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_DECISION_ALREADY_STARTED", "審核已開始，不能撤回；請查看進度或依退回結果修正。", 409);
      }
      const now = this.clock();
      await tx.execute(
        `UPDATE drawing_revision_packages
         SET status = 'Draft', lifecycle_state = 'preparing', active_correction_reason = NULL, updated_at = :now
         WHERE id = :packageId`,
        { packageId: workflow.package_id, now }
      );
      await tx.execute(
        `UPDATE approval_platform_requests SET request_status = 'cancelled', updated_at = :now WHERE id = :requestId`,
        { requestId: input.requestId, now }
      );
      await tx.execute(
        `UPDATE drawing_revision_lifecycle_workflows
         SET state = 'cleanup_pending', cleanup_authorized_at = :now, updated_at = :now
         WHERE id = :workflowId`,
        { workflowId: workflow.id, now }
      );
      await tx.execute(
        `INSERT INTO drawing_revision_lifecycle_command_tokens (
           key_hash, scope_hash, result_fingerprint, status, expires_at, created_at, updated_at
         ) VALUES (:keyHash, :scopeHash, :fingerprint, 'completed', :expiresAt, :now, :now)
         ON CONFLICT(key_hash) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        {
          keyHash: input.keyHash,
          scopeHash: input.scopeHash,
          fingerprint: hashText(`${workflow.package_id}:preparing`),
          expiresAt: new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString(),
          now
        }
      );
      const packageRow = await tx.queryOne<PackageRow>(
        "SELECT * FROM drawing_revision_packages WHERE id = :packageId",
        { packageId: workflow.package_id }
      );
      if (!packageRow) throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_APPLY_FAILED", "圖面版次狀態不存在。", 500);
      await new UnifiedDrawingAsyncRepository(tx).synchronizeFormalDrawing({
        drawingNumberId: packageRow.drawing_number_id,
        companyId: packageRow.company_id
      });
      const projection = await this.findProjectionByPackage(tx, workflow.package_id);
      return { projection, workflowId: workflow.id, cleanupPending: true, idempotentReplay: false };
    });
  }

  async cleanupTerminalWorkflow(workflowId: string, command?: { keyHash: string; scopeHash: string }) {
    return this.client.transaction(async (tx) => {
      if (command) {
        const existingToken = await tx.queryOne<{ scope_hash: string; status: string }>(
          `SELECT scope_hash, status FROM drawing_revision_lifecycle_command_tokens
           WHERE key_hash = :keyHash AND expires_at > :now`,
          { keyHash: command.keyHash, now: this.clock() }
        );
        if (existingToken) {
          if (existingToken.scope_hash !== command.scopeHash) {
            throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT", "同一防重複識別碼已用於不同流程整理。", 409);
          }
          if (existingToken.status === "completed") {
            return { cleaned: true, alreadyCleaned: true, idempotentReplay: true };
          }
        } else {
          await tx.execute(
            `INSERT INTO drawing_revision_lifecycle_command_tokens (
             key_hash, scope_hash, result_fingerprint, status, expires_at, created_at, updated_at
             ) VALUES (:keyHash, :scopeHash, NULL, 'processing', :expiresAt, :now, :now)
             ON CONFLICT(key_hash) DO NOTHING`,
            {
              keyHash: command.keyHash,
              scopeHash: command.scopeHash,
              expiresAt: new Date(Date.parse(this.clock()) + 7 * 24 * 60 * 60 * 1000).toISOString(),
              now: this.clock()
            }
          );
        }
      }
      const workflow = await tx.queryOne<WorkflowRow>(
        `SELECT * FROM drawing_revision_lifecycle_workflows WHERE id = :workflowId`,
        { workflowId }
      );
      if (!workflow) {
        if (command) {
          await tx.execute(
            `UPDATE drawing_revision_lifecycle_command_tokens
             SET status = 'completed', updated_at = :now
             WHERE key_hash = :keyHash AND scope_hash = :scopeHash`,
            { keyHash: command.keyHash, scopeHash: command.scopeHash, now: this.clock() }
          );
        }
        return { cleaned: true, alreadyCleaned: true, idempotentReplay: Boolean(command) };
      }
      if (workflow.state !== "cleanup_pending" || !workflow.cleanup_authorized_at) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_STATE_CONFLICT", "此流程尚未具備清理條件。", 409);
      }
      const projection = await this.findProjectionByPackage(tx, workflow.package_id);
      if (!projection || projection.lifecycleState === "in_review") {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_APPLY_FAILED", "正式版次結果尚未完成，不能清理審核流程。", 500);
      }

      if (workflow.legacy_submission_id) {
        await tx.execute(
          `UPDATE drawing_revision_packages SET source_submission_id = NULL WHERE id = :packageId AND source_submission_id = :submissionId`,
          { packageId: workflow.package_id, submissionId: workflow.legacy_submission_id }
        );
        await tx.execute(
          `UPDATE drawing_revision_package_files SET source_submission_file_id = NULL
           WHERE package_id = :packageId AND source_submission_file_id IS NOT NULL`,
          { packageId: workflow.package_id }
        );
        await this.deleteAdoptedLegacyGraph(tx, workflow);
      }

      if (workflow.approval_request_id) {
        await tx.execute(`DELETE FROM approval_platform_decisions WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_events WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_impact_snapshots WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_legacy_links WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_targets WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_package_items WHERE request_id = :requestId`, { requestId: workflow.approval_request_id });
        await tx.execute(`DELETE FROM approval_platform_requests WHERE id = :requestId`, { requestId: workflow.approval_request_id });
      }
      if (workflow.approval_package_id) {
        await tx.execute(`DELETE FROM approval_platform_events WHERE package_id = :packageId`, { packageId: workflow.approval_package_id });
        await tx.execute(`DELETE FROM approval_platform_impact_snapshots WHERE package_id = :packageId`, { packageId: workflow.approval_package_id });
        await tx.execute(
          `DELETE FROM approval_platform_packages
           WHERE id = :packageId AND NOT EXISTS (
             SELECT 1 FROM approval_platform_requests request WHERE request.package_id = :packageId
           )`,
          { packageId: workflow.approval_package_id }
        );
      }
      await tx.execute(
        `DELETE FROM platform_outbox_events
         WHERE company_id = :companyId AND aggregate_id = :workflowId`,
        { companyId: workflow.company_id, workflowId }
      );
      if (workflow.approval_request_id) {
        await tx.execute(
          `DELETE FROM platform_outbox_events
           WHERE company_id = :companyId AND aggregate_id = :requestId`,
          { companyId: workflow.company_id, requestId: workflow.approval_request_id }
        );
      }
      if (workflow.approval_package_id) {
        await tx.execute(
          `DELETE FROM platform_outbox_events
           WHERE company_id = :companyId AND aggregate_id = :packageId`,
          { companyId: workflow.company_id, packageId: workflow.approval_package_id }
        );
      }
      await tx.execute(`DELETE FROM drawing_revision_lifecycle_reviewers WHERE workflow_id = :workflowId`, { workflowId });
      await tx.execute(`DELETE FROM drawing_revision_lifecycle_workflows WHERE id = :workflowId`, { workflowId });

      const remaining = await tx.queryOne<CountRow>(
        `SELECT COUNT(*) AS value FROM drawing_revision_lifecycle_workflows WHERE id = :workflowId`,
        { workflowId }
      );
      if (Number(remaining?.value ?? 0) !== 0) {
        throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_CLEANUP_INCOMPLETE", "流程清理未完成。", 500);
      }
      if (command) {
        await tx.execute(
          `UPDATE drawing_revision_lifecycle_command_tokens
           SET status = 'completed', result_fingerprint = :fingerprint, updated_at = :now
           WHERE key_hash = :keyHash AND scope_hash = :scopeHash`,
          {
            keyHash: command.keyHash,
            scopeHash: command.scopeHash,
            fingerprint: hashText(`${workflow.package_id}:cleanup`),
            now: this.clock()
          }
        );
      }
      return { cleaned: true, alreadyCleaned: false, idempotentReplay: false };
    });
  }

  async getLifecycleCommandToken(keyHash: string) {
    return this.client.queryOne<{ scope_hash: string; status: string }>(
      `SELECT scope_hash, status FROM drawing_revision_lifecycle_command_tokens
       WHERE key_hash = :keyHash AND expires_at > :now`,
      { keyHash, now: this.clock() }
    );
  }

  async purgeExpiredTokens() {
    await this.client.execute(`DELETE FROM drawing_revision_lifecycle_command_tokens WHERE expires_at <= :now`, { now: this.clock() });
  }

  async listCleanupPending(limit = 25) {
    return this.client.query<{ id: string }>(
      `SELECT id FROM drawing_revision_lifecycle_workflows
       WHERE state = 'cleanup_pending' AND cleanup_authorized_at IS NOT NULL
       ORDER BY updated_at ASC, id ASC LIMIT :limit`,
      { limit: Math.max(1, Math.min(limit, 100)) }
    );
  }

  async getCleanupPendingByRequest(requestId: string) {
    return this.client.queryOne<{ workflow_id: string; company_id: string; state: string; cleanup_authorized_at: string | null }>(
      `SELECT id AS workflow_id, company_id, state, cleanup_authorized_at
       FROM drawing_revision_lifecycle_workflows
       WHERE approval_request_id = :requestId
         AND state = 'cleanup_pending'
         AND cleanup_authorized_at IS NOT NULL
       LIMIT 1`,
      { requestId }
    );
  }

  private async deleteAdoptedLegacyGraph(tx: AsyncDatabaseClient, workflow: WorkflowRow) {
    const submissionId = workflow.legacy_submission_id;
    if (!submissionId) return;
    await tx.execute(
      `DELETE FROM numbering_notifications
       WHERE company_id = :companyId AND entity_type = 'submission' AND entity_id = :submissionId`,
      { companyId: workflow.company_id, submissionId }
    );
    await tx.execute(
      `DELETE FROM platform_outbox_events
       WHERE company_id = :companyId AND aggregate_id = :submissionId`,
      { companyId: workflow.company_id, submissionId }
    );
    await tx.execute(`DELETE FROM submission_attempts WHERE submission_id = :submissionId`, { submissionId });
    await tx.execute(`DELETE FROM approval_steps WHERE submission_id = :submissionId`, { submissionId });
    await tx.execute(`DELETE FROM submission_part_scopes WHERE submission_id = :submissionId`, { submissionId });
    await tx.execute(`DELETE FROM submission_snapshots WHERE submission_id = :submissionId`, { submissionId });
    if (workflow.legacy_fff_assessment_id) {
      await tx.execute(`DELETE FROM review_confirmation_events WHERE review_id = :reviewId`, { reviewId: workflow.legacy_fff_assessment_id });
      await tx.execute(`DELETE FROM drawing_revision_fff_assessments WHERE id = :reviewId`, { reviewId: workflow.legacy_fff_assessment_id });
    }
    await tx.execute(`DELETE FROM audit_logs WHERE submission_id = :submissionId`, { submissionId });
    await tx.execute(`DELETE FROM submission_files WHERE submission_id = :submissionId`, { submissionId });
    await tx.execute(`DELETE FROM submissions WHERE id = :submissionId`, { submissionId });
  }

  private async listEligibleReviewers(client: AsyncDatabaseClient, companyId: string) {
    return client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users
       WHERE company_id = :companyId
         AND role IN ('R&D Manager', 'Admin')
         AND account_status = 'active'
         AND system_role_enabled = 1
       ORDER BY CASE WHEN role = 'R&D Manager' THEN 0 ELSE 1 END, id ASC`,
      { companyId }
    );
  }

  private async findWorkflowByRequest(client: AsyncDatabaseClient, requestId: string) {
    return client.queryOne<WorkflowRow>(
      `SELECT * FROM drawing_revision_lifecycle_workflows
       WHERE approval_request_id = :requestId
       LIMIT 1${client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { requestId }
    );
  }

  private async findProjectionByDrawingRevision(
    client: AsyncDatabaseClient,
    input: { companyId: string; drawingNumberId: string; revision: string }
  ) {
    const row = await client.queryOne<PackageRow>(
      `SELECT * FROM drawing_revision_packages
       WHERE company_id = :companyId AND drawing_number_id = :drawingNumberId
         AND revision = :revision AND lifecycle_state IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      input
    );
    return row ? this.mapProjection(client, row) : null;
  }

  private async assertSubmitScopeStable(client: AsyncDatabaseClient, input: DrawingRevisionLifecycleSubmitRecord) {
    const drawing = await client.queryOne<{ id: string; drawing_number: string; company_id: string }>(
      `SELECT id, drawing_number, company_id FROM drawing_numbers WHERE id = :drawingNumberId`,
      { drawingNumberId: input.drawingNumberId }
    );
    if (!drawing || drawing.company_id !== input.companyId || drawing.drawing_number !== input.drawingNumber) {
      throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_SNAPSHOT_STALE", "圖面資料在送審期間已變更，請重新整理後再送審。", 409);
    }
    const expectedPartIds = [...new Set(input.parts.map((part) => part.partNumberId))];
    const parts = expectedPartIds.length === 0 ? [] : await client.query<{ id: string; part_number: string; part_name: string }>(
      `SELECT id, part_number, part_name FROM part_numbers WHERE company_id = :companyId AND id IN (${expectedPartIds.map((_, index) => `:partId${index}`).join(", ")})`,
      Object.fromEntries([["companyId", input.companyId], ...expectedPartIds.map((id, index) => [`partId${index}`, id])])
    );
    const partById = new Map(parts.map((part) => [part.id, part]));
    if (parts.length !== expectedPartIds.length || input.parts.some((part) => part.partNumber !== partById.get(part.partNumberId)?.part_number || part.partName !== partById.get(part.partNumberId)?.part_name)) {
      throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_SNAPSHOT_STALE", "關聯料號在送審期間已變更，請重新整理後再送審。", 409);
    }
    const expectedFileIds = [...new Set(input.files.map((file) => file.assetId))];
    const files = expectedFileIds.length === 0 ? [] : await client.query<{ id: string; file_name: string }>(
      `SELECT id, file_name FROM file_assets WHERE id IN (${expectedFileIds.map((_, index) => `:assetId${index}`).join(", ")}) AND deleted_at IS NULL`,
      Object.fromEntries(expectedFileIds.map((id, index) => [`assetId${index}`, id]))
    );
    const fileById = new Map(files.map((file) => [file.id, file]));
    if (files.length !== expectedFileIds.length || input.files.some((file) => file.filename !== fileById.get(file.assetId)?.file_name)) {
      throw new DrawingRevisionLifecycleRepositoryError("DRAWING_LIFECYCLE_SNAPSHOT_STALE", "送審檔案在送審期間已變更，請重新整理後再送審。", 409);
    }
  }

  private async findProjectionByPackage(client: AsyncDatabaseClient, packageId: string) {
    const row = await client.queryOne<PackageRow>(
      `SELECT * FROM drawing_revision_packages WHERE id = :packageId AND lifecycle_state IS NOT NULL`,
      { packageId }
    );
    return row ? this.mapProjection(client, row) : null;
  }

  private async mapProjection(client: AsyncDatabaseClient, row: PackageRow): Promise<DrawingRevisionLifecycleProjection> {
    const workflow = await client.queryOne<WorkflowRow>(
      `SELECT * FROM drawing_revision_lifecycle_workflows WHERE package_id = :packageId ORDER BY created_at DESC LIMIT 1`,
      { packageId: row.id }
    );
    const reviewerRows = workflow
      ? await client.query<ReviewerRow>(
          `SELECT reviewer_id FROM drawing_revision_lifecycle_reviewers WHERE workflow_id = :workflowId ORDER BY required_order, reviewer_id`,
          { workflowId: workflow.id }
        )
      : [];
    const decisionCount = workflow?.approval_request_id
      ? Number((await client.queryOne<CountRow>(
          `SELECT COUNT(*) AS value FROM approval_platform_decisions WHERE request_id = :requestId`,
          { requestId: workflow.approval_request_id }
        ))?.value ?? 0)
      : 0;
    return {
      packageId: row.id,
      companyId: row.company_id,
      drawingNumberId: row.drawing_number_id,
      drawingNumber: row.drawing_number,
      revision: row.revision,
      lifecycleState: row.lifecycle_state ?? "preparing",
      correctionReason: row.active_correction_reason,
      requestId: workflow?.approval_request_id ?? null,
      submittedBy: workflow?.submitted_by ?? row.created_by,
      decisionCount,
      reviewerIds: reviewerRows.map((item) => item.reviewer_id),
      updatedAt: row.updated_at
    };
  }
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
