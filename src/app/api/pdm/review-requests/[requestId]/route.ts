import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { sanitizeDrawingRevisionWorkPayload } from "@/lib/drawing-revision-work-payload";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import { hydrateDrawingChangeImpactForWork, type DrawingPartRelationProjection } from "@/lib/drawing-change-impact";
import { parseReviewPackageSnapshot, splitReviewPackageTargetKey } from "@/lib/pdm-review-package-contract";
import { verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.approvals"); if (access.response || !access.actor) return access.response;
  try {
    const { requestId } = await params; const client = getAsyncDatabaseClient(); const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: access.actor.companyId, requestId });
    if (!item || item.reviewerUserId !== access.actor.id || !access.actor.permissions.decide || item.requestStatus !== "pending") return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const parsedSnapshot = parseReviewPackageSnapshot(item.snapshotPayload);
    if (parsedSnapshot.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    if (parsedSnapshot.kind === "v2") {
      const packageValue = verifyReviewPackageIntegrity(item.snapshotPayload, item.snapshotHash);
      const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id });
      const targetSummaries = packageValue.targets.map((target) => ({
        targetKey: target.targetKey,
        ...splitReviewPackageTargetKey(target.targetKey),
        number: target.workspace.identity.code,
        identity: target.workspace.identity,
        revision: target.workspace.identity.revision,
        scope: target.scope,
        markers: target.markers,
        evidenceHash: target.evidenceHash,
        fileCount: target.workspace.files.length,
        attachmentCount: target.workspace.attachments.length
      }));
      return Response.json({ data: {
        schemaVersion: packageValue.schemaVersion,
        requestId: item.id,
        requestKind: item.requestKind,
        entityType: item.entityType,
        entityId: item.canonicalEntityId,
        workId: item.workId,
        rowVersion: item.rowVersion,
        readonly: true,
        interaction: { mode: "review_decide", basisState: "current", canMutateContent: false, canSubmit: false, canCancel: false, canApprove: true, canReturn: true, reasonCode: null },
        primaryTargetKey: packageValue.primaryTargetKey,
        root: packageValue.root,
        matrix: packageValue.matrix,
        packageHash: packageValue.packageHash,
        submittedAt: packageValue.submittedAt,
        targets: targetSummaries,
        actions: [{ key: "approve", label: "核准" }, { key: "return_for_correction", label: "退回修改" }]
      }, meta: { contractToken, correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
    }
    let identity: unknown = null; let options: unknown = undefined; let files: unknown[] | undefined; let attachments: unknown[] | undefined; let revisionId: string | undefined; let interaction: unknown = undefined;
    let changeImpactRequired: boolean | undefined;
    let relatedParts: DrawingPartRelationProjection[] | undefined;
    let affectedParts: DrawingPartRelationProjection[] | undefined;
    const reviewPayload = item.requestKind === "drawing_revision"
      ? sanitizeDrawingRevisionWorkPayload((item.snapshotPayload as { payload?: unknown })?.payload)
      : item.requestKind === "drawing_rd_void"
        ? { revision: (item.snapshotPayload as { revision?: unknown })?.revision ?? "" }
        : item.snapshotPayload;
    if (item.entityType === "drawing") {
      identity = await client.queryOne(`SELECT drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      revisionId = typeof (item.snapshotPayload as { revisionId?: unknown })?.revisionId === "string" ? String((item.snapshotPayload as { revisionId: string }).revisionId) : undefined;
      if (item.requestKind === "drawing_revision" && item.workId) {
        const repository = new DrawingRevisionWorkAsyncRepository(client);
        const work = await repository.readWork(client, access.actor.companyId, item.workId);
        if (work) {
          const basis = await repository.resolveWorkBasis(client, work);
          const stale = basis.basisState === "stale";
          interaction = { mode: stale ? "review_stale_cleanup" : "review_decide", basisState: basis.basisState, canMutateContent: false, canSubmit: false, canCancel: false, canApprove: !stale, canReturn: true, reasonCode: stale ? "DRAWING_PRODUCTION_BASE_STALE" : null };
          const impactProjection = await hydrateDrawingChangeImpactForWork(client, {
            companyId: access.actor.companyId,
            drawingId: item.canonicalEntityId,
            revisionId: work.revision_id,
            predecessorRevisionId: work.predecessor_revision_id,
            impact: (reviewPayload as Record<string, unknown>).changeImpact
          });
          changeImpactRequired = impactProjection.changeImpactRequired;
          relatedParts = impactProjection.relatedParts;
          affectedParts = impactProjection.affectedParts;
          if (impactProjection.changeImpactRequired && impactProjection.changeImpact) {
            (reviewPayload as Record<string, unknown>).changeImpact = impactProjection.changeImpact;
          } else {
            delete (reviewPayload as Record<string, unknown>).changeImpact;
          }
        }
      } else if (item.requestKind === "drawing_rd_void") {
        // A branch-void review has no drawing revision work from which to
        // derive interaction state.  It is nevertheless a live reviewer
        // decision and must expose both terminal actions explicitly; falling
        // back from readonly=true would otherwise hide Approve forever.
        interaction = { mode: "review_decide", basisState: "current", canMutateContent: false, canSubmit: false, canCancel: false, canApprove: true, canReturn: true, reasonCode: null };
      }
      files = item.workId
        ? await client.query(`SELECT binding.file_binding_id AS id, file.source_file_asset_id, file.display_name, file.role, file.is_primary, 1 AS current_revision_upload, asset.file_name, asset.mime_type, asset.file_size FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id = binding.file_binding_id JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE binding.work_id = :workId ORDER BY binding.ordinal, binding.file_binding_id`, { workId: item.workId })
        : revisionId
          ? await client.query(`SELECT file.id, file.source_file_asset_id, file.display_name, file.role, file.is_primary, 0 AS current_revision_upload, asset.file_name, asset.mime_type, asset.file_size FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId AND file.removed_at IS NULL ORDER BY file.sort_order, file.id`, { companyId: access.actor.companyId, revisionId })
          : [];
    } else if (item.entityType === "part") {
      identity = await client.queryOne(`SELECT part_number AS code, part_name AS name FROM part_numbers WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      attachments = await client.query(`SELECT asset.id, asset.file_name, asset.display_name, asset.document_category, asset.mime_type, asset.file_size FROM file_assets asset WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :entityId AND asset.deleted_at IS NULL ORDER BY asset.created_at DESC, asset.id DESC`, { entityId: item.canonicalEntityId });
    } else {
      identity = await client.queryOne(`SELECT root_code AS code, core_name AS name FROM part_roots WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      const [drawings, parts] = await Promise.all([
        client.query(`SELECT id, drawing_number AS code FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY drawing_number`, { companyId: access.actor.companyId, rootId: item.canonicalEntityId }),
        client.query(`SELECT id, part_number AS code, part_name AS name FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY part_number`, { companyId: access.actor.companyId, rootId: item.canonicalEntityId })
      ]); options = { drawings, parts };
    }
    const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id });
    const reviewActions = interaction && typeof interaction === "object" && (interaction as { canApprove?: boolean }).canApprove === false
      ? [{ key: "return_for_correction", label: "退回修改" }]
      : [{ key: "approve", label: "核准" }, { key: "return_for_correction", label: "退回修改" }];
    return Response.json({ data: { requestId: item.id, requestKind: item.requestKind, entityType: item.entityType, entityId: item.canonicalEntityId, workId: item.workId, revisionId, payload: reviewPayload, rowVersion: item.rowVersion, readonly: true, interaction, identity, options, files, attachments, changeImpactRequired, relatedParts, affectedParts, reviewScope: item.requestKind === "part_change" ? "excluded_live" : "included", actions: reviewActions }, meta: { contractToken, correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
