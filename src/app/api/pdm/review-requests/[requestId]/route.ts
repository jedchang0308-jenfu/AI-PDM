import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.approvals"); if (access.response || !access.actor) return access.response;
  try {
    const { requestId } = await params; const client = getAsyncDatabaseClient(); const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: access.actor.companyId, requestId });
    if (!item || item.reviewerUserId !== access.actor.id || !access.actor.permissions.decide) return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    let identity: unknown = null; let options: unknown = undefined; let files: unknown[] | undefined; let attachments: unknown[] | undefined; let revisionId: string | undefined;
    if (item.entityType === "drawing") {
      identity = await client.queryOne(`SELECT drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      revisionId = typeof (item.snapshotPayload as { revisionId?: unknown })?.revisionId === "string" ? String((item.snapshotPayload as { revisionId: string }).revisionId) : undefined;
      files = item.workId
        ? await client.query(`SELECT binding.file_binding_id AS id, file.source_file_asset_id, file.display_name, file.role, asset.file_name, asset.mime_type, asset.file_size FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id = binding.file_binding_id JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE binding.work_id = :workId ORDER BY binding.ordinal, binding.file_binding_id`, { workId: item.workId })
        : revisionId
          ? await client.query(`SELECT file.id, file.source_file_asset_id, file.display_name, file.role, asset.file_name, asset.mime_type, asset.file_size FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId AND file.removed_at IS NULL ORDER BY file.sort_order, file.id`, { companyId: access.actor.companyId, revisionId })
          : [];
    } else if (item.entityType === "part") {
      identity = await client.queryOne(`SELECT part_number AS code, part_name AS name FROM part_numbers WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      attachments = await client.query(`SELECT asset.id, asset.file_name, asset.display_name, asset.mime_type, asset.file_size FROM file_assets asset WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :entityId AND asset.deleted_at IS NULL ORDER BY asset.created_at DESC, asset.id DESC`, { entityId: item.canonicalEntityId });
    } else {
      identity = await client.queryOne(`SELECT root_code AS code, core_name AS name FROM part_roots WHERE id = :entityId AND company_id = :companyId`, { entityId: item.canonicalEntityId, companyId: access.actor.companyId });
      const [drawings, parts] = await Promise.all([
        client.query(`SELECT id, drawing_number AS code FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY drawing_number`, { companyId: access.actor.companyId, rootId: item.canonicalEntityId }),
        client.query(`SELECT id, part_number AS code, part_name AS name FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY part_number`, { companyId: access.actor.companyId, rootId: item.canonicalEntityId })
      ]); options = { drawings, parts };
    }
    const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id });
    const reviewPayload = item.requestKind === "drawing_revision"
      ? ((item.snapshotPayload as { payload?: unknown })?.payload ?? {})
      : item.requestKind === "drawing_rd_void"
        ? { revision: (item.snapshotPayload as { revision?: unknown })?.revision ?? "" }
        : item.snapshotPayload;
    return Response.json({ data: { requestId: item.id, requestKind: item.requestKind, entityType: item.entityType, entityId: item.canonicalEntityId, workId: item.workId, revisionId, payload: reviewPayload, rowVersion: item.rowVersion, readonly: true, identity, options, files, attachments, reviewScope: item.requestKind === "part_change" ? "excluded_live" : "included", actions: [{ key: "approve", label: "核准" }, { key: "return_for_correction", label: "退回修改" }] }, meta: { contractToken, correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
