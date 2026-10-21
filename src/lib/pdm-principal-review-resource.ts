import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import type {
  ReviewPackageEntityType,
  ReviewPackageEnvelope,
  ReviewPackageFile,
  ReviewPackageRequestKind
} from "@/lib/pdm-review-package-contract";
import { reviewPackageTargetKey } from "@/lib/pdm-review-package-contract";
import { verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { canonicalCapabilityGroups, isDynamicRolePolicyInSnapshot,
  type PrincipalCapabilityGroup } from "@/lib/principal-resource-capability";

type ReviewResourceInput = {
  companyId: string;
  requestKind: ReviewPackageRequestKind;
  entityType: ReviewPackageEntityType;
  entityId: string;
  workId: string | null;
  envelope: ReviewPackageEnvelope;
};

type CanonicalReviewFile = {
  id: string;
  binding_id: string;
  source_file_asset_id: string;
  content_hash: string | null;
  binding_content_hash?: string | null;
  hash_algorithm: string;
  linked_entity_type: string;
  linked_entity_id: string;
  binding_entity_id: string;
  parent_entity_id: string;
  document_category: string;
  inactive: boolean;
};

const drawingCategories = new Set([
  "cad_3d", "intermediate", "drawing_2d", "dwg", "dwg_dxf", "pdf", "other"
]);
const partCategories = new Set([
  "cad_3d", "intermediate", "catalog", "spec_sheet", "supplier_doc",
  "test_report", "part_preview_image", "other"
]);
const sha256 = /^[a-f0-9]{64}$/iu;

function denied(code: "WORKBENCH_REVIEW_PACKAGE_INVALID" | "WORKBENCH_SNAPSHOT_DRIFT", message: string): never {
  throw new CanonicalWorkbenchError(code, message, 409);
}

function parentGroup(entityType: ReviewPackageEntityType): "drawing" | "part" {
  return entityType;
}

function requirePrimaryTarget(input: ReviewResourceInput) {
  const expectedKey = reviewPackageTargetKey(input.entityType, input.entityId);
  if (input.envelope.requestKind !== input.requestKind ||
      input.envelope.primaryTargetKey !== expectedKey) {
    denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包主要對象與申請資料不符");
  }
  const target = input.envelope.targets.find((candidate) => candidate.targetKey === expectedKey);
  if (!target || target.scope !== "submitted" || !target.markers.submitted ||
      target.workspace.kind !== input.entityType || target.workspace.entityId !== input.entityId) {
    denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少主要送審對象");
  }
  return target.workspace;
}

async function readCanonicalFiles(client: AsyncDatabaseClient, input: ReviewResourceInput,
  revisionId: string | null, includeInactive = false): Promise<CanonicalReviewFile[]> {
  if (client.kind !== "postgres" || client.transactionScope !== "postgres") {
    throw new Error("PRINCIPAL_REVIEW_RESOURCE_SNAPSHOT_REQUIRED");
  }
  if (input.entityType === "drawing") {
    if (!revisionId) denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少圖面版次");
    if (input.requestKind === "drawing_revision") {
      if (!input.workId) denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "圖面工作申請缺少工作資料");
      return client.query<CanonicalReviewFile>(`
        SELECT file.id, binding.file_binding_id AS binding_id,
          file.source_file_asset_id, asset.content_hash, asset.hash_algorithm,
          asset.linked_entity_type, asset.linked_entity_id, asset.document_category,
          binding.content_hash AS binding_content_hash,
          file.drawing_revision_id AS binding_entity_id, revision.drawing_id AS parent_entity_id,
          (file.removed_at IS NOT NULL OR asset.deleted_at IS NOT NULL) AS inactive
        FROM drawing_revision_work_files binding
        JOIN drawing_revision_files file ON file.id = binding.file_binding_id
        JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
        JOIN drawings drawing ON drawing.id = revision.drawing_id
        JOIN drawing_revision_works work ON work.id = binding.work_id
        JOIN canonical_workbench_states state ON state.work_id = work.id
          AND state.company_id = work.company_id
        JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE binding.work_id = :workId AND work.company_id = :companyId
          AND work.drawing_id = :entityId AND state.revision_id = :revisionId
          AND state.canonical_entity_id = :entityId AND state.entity_type = 'drawing'
          AND file.company_id = :companyId AND revision.company_id = :companyId
          AND revision.drawing_id = :entityId AND drawing.company_id = :companyId
          AND (:includeInactive OR (file.removed_at IS NULL AND asset.deleted_at IS NULL))
        ORDER BY binding.ordinal, binding.file_binding_id
      `, { companyId: input.companyId, entityId: input.entityId,
        revisionId, workId: input.workId, includeInactive });
    }
    if (input.requestKind !== "drawing_rd_void" || input.workId !== null) {
      denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "圖面審核類型與工作資料不符");
    }
    return client.query<CanonicalReviewFile>(`
      SELECT file.id, file.id AS binding_id, file.source_file_asset_id,
        asset.content_hash, asset.hash_algorithm, asset.linked_entity_type,
        asset.linked_entity_id, asset.document_category,
        file.drawing_revision_id AS binding_entity_id, revision.drawing_id AS parent_entity_id,
        (file.removed_at IS NOT NULL OR asset.deleted_at IS NOT NULL) AS inactive
      FROM drawing_revision_files file
      JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
      JOIN drawings drawing ON drawing.id = revision.drawing_id
      JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE file.company_id = :companyId AND revision.company_id = :companyId
        AND revision.id = :revisionId AND revision.drawing_id = :entityId
        AND drawing.company_id = :companyId
        AND (:includeInactive OR (file.removed_at IS NULL AND asset.deleted_at IS NULL))
      ORDER BY file.sort_order, file.id
    `, { companyId: input.companyId, entityId: input.entityId, revisionId, includeInactive });
  }

  if (input.requestKind !== "part_change" || !input.workId || revisionId !== null) {
    denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "料號審核類型與工作資料不符");
  }
  return client.query<CanonicalReviewFile>(`
    SELECT asset.id, asset.id AS binding_id, asset.id AS source_file_asset_id,
      asset.content_hash, asset.hash_algorithm, asset.linked_entity_type,
      asset.linked_entity_id, asset.document_category,
      part.id AS binding_entity_id, part.id AS parent_entity_id,
      (asset.deleted_at IS NOT NULL) AS inactive
    FROM part_change_works work
    JOIN part_numbers part ON part.id = work.part_id AND part.company_id = work.company_id
    JOIN file_assets asset ON asset.linked_entity_type = 'part_number'
      AND asset.linked_entity_id = part.id
    WHERE work.id = :workId AND work.company_id = :companyId
      AND work.part_id = :entityId
      AND (:includeInactive OR asset.deleted_at IS NULL)
    ORDER BY asset.created_at DESC, asset.id DESC
  `, { companyId: input.companyId, entityId: input.entityId, workId: input.workId, includeInactive });
}

function validatedGroups(input: ReviewResourceInput, files: readonly ReviewPackageFile[],
  rows: readonly CanonicalReviewFile[], strictSnapshot = true): PrincipalCapabilityGroup[] {
  const parent = parentGroup(input.entityType);
  if (strictSnapshot && files.length !== rows.length) {
    denied("WORKBENCH_SNAPSHOT_DRIFT", "送審附件已改變，請退回修改後重新送審");
  }
  const rowById = new Map<string, CanonicalReviewFile>();
  let uncertainClassification = false;
  for (const row of rows) {
    if (rowById.has(row.id)) {
      if (strictSnapshot) denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "送審附件識別重複");
      uncertainClassification = true;
    }
    rowById.set(row.id, row);
  }
  const seen = new Set<string>();
  const groups = new Set<PrincipalCapabilityGroup>();
  groups.add(parent);
  for (const frozen of files) {
    const row = rowById.get(frozen.id);
    const identityMismatch = !row || seen.has(frozen.id) ||
        !frozen.sourceFileAssetId || frozen.sourceFileAssetId !== row.source_file_asset_id ||
        frozen.bindingId !== row.binding_id;
    if (identityMismatch || (strictSnapshot && row?.inactive)) {
      if (strictSnapshot) {
        denied("WORKBENCH_SNAPSHOT_DRIFT", "送審附件或所屬對象已改變，請退回修改後重新送審");
      }
      uncertainClassification = true;
      continue;
    }
    seen.add(frozen.id);
    if (!strictSnapshot) continue;
    if (!frozen.contentHash || !row.content_hash || !sha256.test(frozen.contentHash) ||
        !sha256.test(row.content_hash) || frozen.contentHash.toLowerCase() !== row.content_hash.toLowerCase() ||
        (row.binding_content_hash !== undefined && row.binding_content_hash?.toLowerCase() !== row.content_hash.toLowerCase()) ||
        row.hash_algorithm.trim().toUpperCase().replaceAll("_", "-") !== "SHA-256") {
      denied("WORKBENCH_SNAPSHOT_DRIFT", "送審附件雜湊無法確認，請重新送審");
    }
    const allowedCategories = input.entityType === "drawing" ? drawingCategories : partCategories;
    if (!allowedCategories.has(row.document_category)) {
      denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "送審附件類別無法確認，請重新送審");
    }
    const expectedLinkType = input.entityType === "drawing" ? "drawing_revision" : "part_number";
    if (row.linked_entity_type !== expectedLinkType ||
        row.linked_entity_id !== row.binding_entity_id ||
        row.parent_entity_id !== input.entityId) {
      denied("WORKBENCH_SNAPSHOT_DRIFT", "送審附件與主要對象的關聯已改變，請重新送審");
    }
    const canonical = canonicalCapabilityGroups(row.linked_entity_type, row.document_category);
    if (!canonical.includes(parent)) {
      denied("WORKBENCH_REVIEW_PACKAGE_INVALID", "送審附件缺少有效的主要資源關聯");
    }
    for (const group of canonical) groups.add(group);
  }
  if (!strictSnapshot) {
    const frozenIds = new Set(files.map(file => file.id));
    for (const row of rows) {
      // Old deleted files outside this submitted package do not form its target.
      // Active additions still count when inspecting the current comparison.
      if (row.inactive && !frozenIds.has(row.id)) continue;
      const allowedCategories = input.entityType === "drawing" ? drawingCategories : partCategories;
      const expectedLinkType = input.entityType === "drawing" ? "drawing_revision" : "part_number";
      if (!allowedCategories.has(row.document_category) ||
          row.linked_entity_type !== expectedLinkType ||
          row.linked_entity_id !== row.binding_entity_id ||
          row.parent_entity_id !== input.entityId) {
        // An uncertain current file classification must never weaken return permission.
        // Requiring both resources is bounded and still leaves the existing repair path usable.
        groups.add("model");
        continue;
      }
      const canonical = canonicalCapabilityGroups(row.linked_entity_type, row.document_category);
      if (!canonical.includes(parent)) {
        groups.add("model");
        continue;
      }
      for (const group of canonical) groups.add(group);
    }
    if (uncertainClassification) groups.add("model");
    return [...groups];
  }
  return [...groups];
}

async function resolveCanonicalResourceGroups(
  tx: AsyncDatabaseClient, input: ReviewResourceInput
): Promise<PrincipalCapabilityGroup[]> {
  if (tx.kind !== "postgres" || tx.transactionScope !== "postgres") {
    throw new Error("PRINCIPAL_REVIEW_RESOURCE_SNAPSHOT_REQUIRED");
  }
  const envelope = verifyReviewPackageIntegrity(input.envelope, input.envelope.packageHash);
  const workspace = requirePrimaryTarget({ ...input, envelope });
  const frozenFiles = input.entityType === "drawing" ? workspace.files : workspace.attachments;
  const rows = await readCanonicalFiles(tx, input, workspace.revisionId);
  return validatedGroups(input, frozenFiles, rows);
}

/** Resolve parent plus model only from the verified submitted target's canonical attachments. */
export async function resolvePrincipalReviewResourceGroupsInSnapshot(
  tx: AsyncDatabaseClient, input: ReviewResourceInput
): Promise<PrincipalCapabilityGroup[]> {
  const parent = parentGroup(input.entityType);
  if (!await isDynamicRolePolicyInSnapshot(tx)) return [parent];
  return resolveCanonicalResourceGroups(tx, input);
}

/** Dynamic reviewers must hold the parent decision and, for CAD/BOM files, model.review too. */
export async function requirePrincipalReviewResourceCapabilitiesInSnapshot(
  tx: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, input: ReviewResourceInput,
  options: { strictSnapshot?: boolean } = {}
): Promise<PrincipalCapabilityGroup[]> {
  const parent = parentGroup(input.entityType);
  if (!await isDynamicRolePolicyInSnapshot(tx)) return [parent];
  const envelope = verifyReviewPackageIntegrity(input.envelope, input.envelope.packageHash);
  const workspace = requirePrimaryTarget({ ...input, envelope });
  const files = input.entityType === "drawing" ? workspace.files : workspace.attachments;
  const rows = await readCanonicalFiles(tx, input, workspace.revisionId, options.strictSnapshot === false);
  const groups = validatedGroups(input, files, rows, options.strictSnapshot ?? true);
  const permissions = [
    { permissionKind: "action" as const, permissionCode: "approval.request.decide", resourceGroup: parent },
    ...(groups.includes("model")
      ? [{ permissionKind: "action" as const, permissionCode: "pdm.model.review", resourceGroup: "model" as const }]
      : [])
  ];
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx, verified, permissions);
  if (decisions.length !== permissions.length || decisions.some((decision, index) =>
      !decision || decision.principalId !== verified.session.principalId ||
      decision.permissionCode !== permissions[index].permissionCode)) {
    throw new CanonicalWorkbenchError("WORKBENCH_INTERNAL_ERROR", "權限資料暫時無法確認", 503);
  }
  if (decisions.some((decision) => !decision.allowed)) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }
  return groups;
}
