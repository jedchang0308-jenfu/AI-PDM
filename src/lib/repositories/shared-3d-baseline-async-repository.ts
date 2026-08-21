import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository, type AsyncAuditLogInput } from "@/lib/repositories/audit-async-repository";

export type SharedModelOwnerScope = "part_root" | "part_number";
export type SharedCadModelStatus = "Draft" | "Pending" | "Released" | "Obsolete";
export type ModelBasisType = "shared_model" | "two_d_only";
export type ModelBasisReviewStatus = "draft" | "confirmed" | "revoked";
export type ManufacturingBaselineStatus = "Draft" | "Released" | "Obsolete" | "Cancelled";

export type SharedModelOwner = {
  companyId: string;
  ownerScope: SharedModelOwnerScope;
  ownerId: string;
  partRootId: string;
  partNumberId: string | null;
  ownerCode: string;
};

export type SharedCadModelVersion = {
  id: string;
  companyId: string;
  ownerScope: SharedModelOwnerScope;
  ownerId: string;
  partRootId: string;
  partNumberId: string | null;
  sourceFileAssetId: string;
  modelRevision: string;
  contentHash: string;
  hashAlgorithm: string;
  status: SharedCadModelStatus;
  createdBy: string | null;
  createdAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
};

export type FileAssetForSharedModel = {
  id: string;
  linkedEntityType: string;
  linkedEntityId: string;
  documentCategory: string;
  fileName: string;
  contentHash: string | null;
  hashAlgorithm: string;
};

export type DrawingPackageForModelBasis = {
  id: string;
  companyId: string;
  drawingNumberId: string;
  drawingNumber: string;
  drawingPurposeCode: string;
  drawingPartRootId: string;
  revision: string;
  status: string;
};

export type DrawingPackageModelBasis = {
  id: string;
  packageId: string;
  basisType: ModelBasisType;
  sharedModelVersionId: string | null;
  exceptionReason: string | null;
  exceptionConfirmedBy: string | null;
  exceptionConfirmedAt: string | null;
  reviewStatus: ModelBasisReviewStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RequiredMaDrawing = {
  id: string;
  companyId: string;
  partRootId: string;
  drawingNumber: string;
  purposeCode: string;
  recordStatus: string;
};

export type ReleasedDrawingPackage = {
  id: string;
  companyId: string;
  drawingNumberId: string;
  drawingNumber: string;
  revision: string;
  releasedAt: string | null;
};

export type ManufacturingBaseline = {
  id: string;
  companyId: string;
  ownerScope: SharedModelOwnerScope;
  ownerId: string;
  partRootId: string;
  partNumberId: string | null;
  baselineCode: string;
  baselineRevision: string;
  sharedModelVersionId: string;
  status: ManufacturingBaselineStatus;
  createdBy: string;
  createdAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  snapshotJson: string;
};

export type ManufacturingBaselineItem = {
  id: string;
  baselineId: string;
  drawingNumberId: string;
  drawingNumber: string;
  packageId: string | null;
  packageRevision: string | null;
  inclusionStatus: "included" | "excluded";
  selectionReason: string | null;
  reviewStatus: "draft" | "approved";
  createdAt: string;
};

type SharedModelOwnerRow = {
  company_id: string;
  owner_scope: SharedModelOwnerScope;
  owner_id: string;
  part_root_id: string;
  part_number_id: string | null;
  owner_code: string;
};

type SharedCadModelVersionRow = {
  id: string;
  company_id: string;
  owner_scope: SharedModelOwnerScope;
  owner_id: string;
  part_root_id: string;
  part_number_id: string | null;
  source_file_asset_id: string;
  model_revision: string;
  content_hash: string;
  hash_algorithm: string;
  status: SharedCadModelStatus;
  created_by: string | null;
  created_at: string;
  released_by: string | null;
  released_at: string | null;
  release_reason: string | null;
};

type FileAssetForSharedModelRow = {
  id: string;
  linked_entity_type: string;
  linked_entity_id: string;
  document_category: string;
  file_name: string;
  content_hash: string | null;
  hash_algorithm: string;
};

type DrawingPackageForModelBasisRow = {
  id: string;
  company_id: string;
  drawing_number_id: string;
  drawing_number: string;
  drawing_purpose_code: string;
  drawing_part_root_id: string;
  revision: string;
  status: string;
};

type DrawingPackageModelBasisRow = {
  id: string;
  package_id: string;
  basis_type: ModelBasisType;
  shared_model_version_id: string | null;
  exception_reason: string | null;
  exception_confirmed_by: string | null;
  exception_confirmed_at: string | null;
  review_status: ModelBasisReviewStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type RequiredMaDrawingRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  drawing_number: string;
  purpose_code: string;
  record_status: string;
};

type ReleasedDrawingPackageRow = {
  id: string;
  company_id: string;
  drawing_number_id: string;
  drawing_number: string;
  revision: string;
  released_at: string | null;
};

type ManufacturingBaselineRow = {
  id: string;
  company_id: string;
  owner_scope: SharedModelOwnerScope;
  owner_id: string;
  part_root_id: string;
  part_number_id: string | null;
  baseline_code: string;
  baseline_revision: string;
  shared_model_version_id: string;
  status: ManufacturingBaselineStatus;
  created_by: string;
  created_at: string;
  released_by: string | null;
  released_at: string | null;
  snapshot_json: string;
};

type ManufacturingBaselineItemRow = {
  id: string;
  baseline_id: string;
  drawing_number_id: string;
  drawing_number: string;
  package_id: string | null;
  package_revision: string | null;
  inclusion_status: "included" | "excluded";
  selection_reason: string | null;
  review_status: "draft" | "approved";
  created_at: string;
};

export const SELECT_SHARED_MODEL_OWNER_BY_PART_NUMBER_SQL = `
  SELECT
    pn.company_id,
    'part_number' AS owner_scope,
    pn.id AS owner_id,
    pn.part_root_id,
    pn.id AS part_number_id,
    pn.part_number AS owner_code
  FROM part_numbers pn
  WHERE pn.part_number = :partNumber
`;

export const SELECT_SHARED_MODEL_OWNER_BY_ROOT_CODE_SQL = `
  SELECT
    pr.company_id,
    'part_root' AS owner_scope,
    pr.id AS owner_id,
    pr.id AS part_root_id,
    NULL AS part_number_id,
    pr.root_code AS owner_code
  FROM part_roots pr
  WHERE pr.root_code = :rootCode
`;

export const SELECT_FILE_ASSET_FOR_SHARED_MODEL_SQL = `
  SELECT id, linked_entity_type, linked_entity_id, document_category, file_name, content_hash, hash_algorithm
  FROM file_assets
  WHERE id = :fileAssetId
    AND deleted_at IS NULL
`;

export const SELECT_SHARED_MODEL_BY_ID_SQL = `
  SELECT *
  FROM shared_cad_model_versions
  WHERE id = :id
`;

export const SELECT_SHARED_MODELS_BY_OWNER_SQL = `
  SELECT *
  FROM shared_cad_model_versions
  WHERE company_id = :companyId
    AND owner_scope = :ownerScope
    AND owner_id = :ownerId
  ORDER BY created_at DESC, id DESC
`;

export const SELECT_SHARED_MODELS_BY_HASH_SQL = `
  SELECT *
  FROM shared_cad_model_versions
  WHERE company_id = :companyId
    AND owner_scope = :ownerScope
    AND owner_id = :ownerId
    AND content_hash = :contentHash
  ORDER BY created_at DESC, id DESC
`;

export const SELECT_SHARED_MODELS_BY_REVISION_SQL = `
  SELECT *
  FROM shared_cad_model_versions
  WHERE company_id = :companyId
    AND owner_scope = :ownerScope
    AND owner_id = :ownerId
    AND model_revision = :modelRevision
  ORDER BY created_at DESC, id DESC
`;

export const INSERT_SHARED_MODEL_VERSION_SQL = `
  INSERT INTO shared_cad_model_versions (
    id, company_id, owner_scope, owner_id, part_root_id, part_number_id,
    source_file_asset_id, model_revision, content_hash, hash_algorithm, status,
    created_by, created_at, released_by, released_at, release_reason
  ) VALUES (
    :id, :companyId, :ownerScope, :ownerId, :partRootId, :partNumberId,
    :sourceFileAssetId, :modelRevision, :contentHash, :hashAlgorithm, :status,
    :createdBy, :createdAt, :releasedBy, :releasedAt, :releaseReason
  )
`;

export const SELECT_DRAWING_PACKAGE_FOR_MODEL_BASIS_SQL = `
  SELECT
    p.id,
    p.company_id,
    p.drawing_number_id,
    p.drawing_number,
    d.purpose_code AS drawing_purpose_code,
    d.part_root_id AS drawing_part_root_id,
    p.revision,
    p.status
  FROM drawing_revision_packages p
  JOIN drawing_numbers d ON d.id = p.drawing_number_id
  WHERE p.id = :packageId
`;

export const SELECT_PACKAGE_MODEL_BASIS_SQL = `
  SELECT *
  FROM drawing_revision_package_model_links
  WHERE package_id = :packageId
`;

export const UPSERT_PACKAGE_MODEL_BASIS_SQL = `
  INSERT INTO drawing_revision_package_model_links (
    id, package_id, basis_type, shared_model_version_id, exception_reason,
    exception_confirmed_by, exception_confirmed_at, review_status, created_by, created_at, updated_at
  ) VALUES (
    :id, :packageId, :basisType, :sharedModelVersionId, :exceptionReason,
    :exceptionConfirmedBy, :exceptionConfirmedAt, :reviewStatus, :createdBy, :createdAt, :updatedAt
  )
  ON CONFLICT(package_id) DO UPDATE SET
    basis_type = excluded.basis_type,
    shared_model_version_id = excluded.shared_model_version_id,
    exception_reason = excluded.exception_reason,
    exception_confirmed_by = excluded.exception_confirmed_by,
    exception_confirmed_at = excluded.exception_confirmed_at,
    review_status = excluded.review_status,
    updated_at = excluded.updated_at
`;

export const SELECT_REQUIRED_MA_DRAWINGS_SQL = `
  SELECT id, company_id, part_root_id, drawing_number, purpose_code, record_status
  FROM drawing_numbers
  WHERE company_id = :companyId
    AND part_root_id = :partRootId
    AND purpose_code IN ('MA', 'M')
    AND record_status IN ('Active', 'Released')
  ORDER BY sequence_no ASC, drawing_number ASC
`;

export const SELECT_RELEASED_PACKAGES_FOR_DRAWINGS_SQL = `
  SELECT id, company_id, drawing_number_id, drawing_number, revision, released_at
  FROM drawing_revision_packages
  WHERE company_id = :companyId
    AND status = 'Released'
    AND drawing_number_id IN (:drawingNumberIds)
  ORDER BY drawing_number_id ASC, released_at DESC, created_at DESC
`;

export const INSERT_MANUFACTURING_BASELINE_SQL = `
  INSERT INTO manufacturing_baselines (
    id, company_id, owner_scope, owner_id, part_root_id, part_number_id, baseline_code,
    baseline_revision, shared_model_version_id, status, created_by, created_at, snapshot_json
  ) VALUES (
    :id, :companyId, :ownerScope, :ownerId, :partRootId, :partNumberId, :baselineCode,
    :baselineRevision, :sharedModelVersionId, :status, :createdBy, :createdAt, :snapshotJson
  )
`;

export const INSERT_MANUFACTURING_BASELINE_ITEM_SQL = `
  INSERT INTO manufacturing_baseline_items (
    id, baseline_id, drawing_number_id, drawing_number, package_id, package_revision,
    inclusion_status, selection_reason, review_status, created_at
  ) VALUES (
    :id, :baselineId, :drawingNumberId, :drawingNumber, :packageId, :packageRevision,
    :inclusionStatus, :selectionReason, :reviewStatus, :createdAt
  )
`;

export const SELECT_MANUFACTURING_BASELINE_SQL = `
  SELECT *
  FROM manufacturing_baselines
  WHERE id = :baselineId
`;

export const SELECT_MANUFACTURING_BASELINE_ITEMS_SQL = `
  SELECT *
  FROM manufacturing_baseline_items
  WHERE baseline_id = :baselineId
  ORDER BY drawing_number ASC
`;

export const RELEASE_MANUFACTURING_BASELINE_SQL = `
  UPDATE manufacturing_baselines
  SET status = 'Released',
      released_by = :releasedBy,
      released_at = :releasedAt,
      snapshot_json = :snapshotJson
  WHERE id = :baselineId
    AND status = 'Draft'
`;

export const SELECT_MODEL_IMPACT_BASELINES_SQL = `
  SELECT *
  FROM manufacturing_baselines
  WHERE shared_model_version_id = :sharedModelVersionId
    AND status = 'Released'
  ORDER BY released_at DESC, id DESC
`;

function mapOwner(row: SharedModelOwnerRow): SharedModelOwner {
  return {
    companyId: row.company_id,
    ownerScope: row.owner_scope,
    ownerId: row.owner_id,
    partRootId: row.part_root_id,
    partNumberId: row.part_number_id,
    ownerCode: row.owner_code
  };
}

function mapModel(row: SharedCadModelVersionRow): SharedCadModelVersion {
  return {
    id: row.id,
    companyId: row.company_id,
    ownerScope: row.owner_scope,
    ownerId: row.owner_id,
    partRootId: row.part_root_id,
    partNumberId: row.part_number_id,
    sourceFileAssetId: row.source_file_asset_id,
    modelRevision: row.model_revision,
    contentHash: row.content_hash,
    hashAlgorithm: row.hash_algorithm,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    releasedBy: row.released_by,
    releasedAt: row.released_at,
    releaseReason: row.release_reason
  };
}

function mapFileAsset(row: FileAssetForSharedModelRow): FileAssetForSharedModel {
  return {
    id: row.id,
    linkedEntityType: row.linked_entity_type,
    linkedEntityId: row.linked_entity_id,
    documentCategory: row.document_category,
    fileName: row.file_name,
    contentHash: row.content_hash,
    hashAlgorithm: row.hash_algorithm
  };
}

function mapPackage(row: DrawingPackageForModelBasisRow): DrawingPackageForModelBasis {
  return {
    id: row.id,
    companyId: row.company_id,
    drawingNumberId: row.drawing_number_id,
    drawingNumber: row.drawing_number,
    drawingPurposeCode: row.drawing_purpose_code,
    drawingPartRootId: row.drawing_part_root_id,
    revision: row.revision,
    status: row.status
  };
}

function mapBasis(row: DrawingPackageModelBasisRow): DrawingPackageModelBasis {
  return {
    id: row.id,
    packageId: row.package_id,
    basisType: row.basis_type,
    sharedModelVersionId: row.shared_model_version_id,
    exceptionReason: row.exception_reason,
    exceptionConfirmedBy: row.exception_confirmed_by,
    exceptionConfirmedAt: row.exception_confirmed_at,
    reviewStatus: row.review_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRequiredDrawing(row: RequiredMaDrawingRow): RequiredMaDrawing {
  return {
    id: row.id,
    companyId: row.company_id,
    partRootId: row.part_root_id,
    drawingNumber: row.drawing_number,
    purposeCode: row.purpose_code,
    recordStatus: row.record_status
  };
}

function mapReleasedPackage(row: ReleasedDrawingPackageRow): ReleasedDrawingPackage {
  return {
    id: row.id,
    companyId: row.company_id,
    drawingNumberId: row.drawing_number_id,
    drawingNumber: row.drawing_number,
    revision: row.revision,
    releasedAt: row.released_at
  };
}

function mapBaseline(row: ManufacturingBaselineRow): ManufacturingBaseline {
  return {
    id: row.id,
    companyId: row.company_id,
    ownerScope: row.owner_scope,
    ownerId: row.owner_id,
    partRootId: row.part_root_id,
    partNumberId: row.part_number_id,
    baselineCode: row.baseline_code,
    baselineRevision: row.baseline_revision,
    sharedModelVersionId: row.shared_model_version_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    releasedBy: row.released_by,
    releasedAt: row.released_at,
    snapshotJson: row.snapshot_json
  };
}

function mapBaselineItem(row: ManufacturingBaselineItemRow): ManufacturingBaselineItem {
  return {
    id: row.id,
    baselineId: row.baseline_id,
    drawingNumberId: row.drawing_number_id,
    drawingNumber: row.drawing_number,
    packageId: row.package_id,
    packageRevision: row.package_revision,
    inclusionStatus: row.inclusion_status,
    selectionReason: row.selection_reason,
    reviewStatus: row.review_status,
    createdAt: row.created_at
  };
}

function expandDrawingIdsSql(sql: string, drawingNumberIds: string[]) {
  return sql.replace(":drawingNumberIds", drawingNumberIds.map((_, index) => `:drawingNumberId${index}`).join(", "));
}

function drawingIdsParams(drawingNumberIds: string[]) {
  return Object.fromEntries(drawingNumberIds.map((id, index) => [`drawingNumberId${index}`, id]));
}

export class AsyncShared3dBaselineRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getOwnerByPartNumber(partNumber: string): Promise<SharedModelOwner | null> {
    const row = await this.client.queryOne<SharedModelOwnerRow>(SELECT_SHARED_MODEL_OWNER_BY_PART_NUMBER_SQL, { partNumber });
    return row ? mapOwner(row) : null;
  }

  async getOwnerByRootCode(rootCode: string): Promise<SharedModelOwner | null> {
    const row = await this.client.queryOne<SharedModelOwnerRow>(SELECT_SHARED_MODEL_OWNER_BY_ROOT_CODE_SQL, { rootCode });
    return row ? mapOwner(row) : null;
  }

  async getFileAsset(fileAssetId: string): Promise<FileAssetForSharedModel | null> {
    const row = await this.client.queryOne<FileAssetForSharedModelRow>(SELECT_FILE_ASSET_FOR_SHARED_MODEL_SQL, { fileAssetId });
    return row ? mapFileAsset(row) : null;
  }

  async getSharedModelById(id: string): Promise<SharedCadModelVersion | null> {
    const row = await this.client.queryOne<SharedCadModelVersionRow>(SELECT_SHARED_MODEL_BY_ID_SQL, { id });
    return row ? mapModel(row) : null;
  }

  async listSharedModels(owner: Pick<SharedModelOwner, "companyId" | "ownerScope" | "ownerId">): Promise<SharedCadModelVersion[]> {
    const rows = await this.client.query<SharedCadModelVersionRow>(SELECT_SHARED_MODELS_BY_OWNER_SQL, owner);
    return rows.map(mapModel);
  }

  async findSharedModelsByHash(owner: Pick<SharedModelOwner, "companyId" | "ownerScope" | "ownerId">, contentHash: string): Promise<SharedCadModelVersion[]> {
    const rows = await this.client.query<SharedCadModelVersionRow>(SELECT_SHARED_MODELS_BY_HASH_SQL, { ...owner, contentHash });
    return rows.map(mapModel);
  }

  async findSharedModelsByRevision(owner: Pick<SharedModelOwner, "companyId" | "ownerScope" | "ownerId">, modelRevision: string): Promise<SharedCadModelVersion[]> {
    const rows = await this.client.query<SharedCadModelVersionRow>(SELECT_SHARED_MODELS_BY_REVISION_SQL, { ...owner, modelRevision });
    return rows.map(mapModel);
  }

  async insertSharedModel(input: SharedCadModelVersion): Promise<void> {
    await this.client.execute(INSERT_SHARED_MODEL_VERSION_SQL, {
      id: input.id,
      companyId: input.companyId,
      ownerScope: input.ownerScope,
      ownerId: input.ownerId,
      partRootId: input.partRootId,
      partNumberId: input.partNumberId,
      sourceFileAssetId: input.sourceFileAssetId,
      modelRevision: input.modelRevision,
      contentHash: input.contentHash,
      hashAlgorithm: input.hashAlgorithm,
      status: input.status,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      releasedBy: input.releasedBy,
      releasedAt: input.releasedAt,
      releaseReason: input.releaseReason
    });
  }

  async getDrawingPackage(packageId: string): Promise<DrawingPackageForModelBasis | null> {
    const row = await this.client.queryOne<DrawingPackageForModelBasisRow>(SELECT_DRAWING_PACKAGE_FOR_MODEL_BASIS_SQL, { packageId });
    return row ? mapPackage(row) : null;
  }

  async getPackageModelBasis(packageId: string): Promise<DrawingPackageModelBasis | null> {
    const row = await this.client.queryOne<DrawingPackageModelBasisRow>(SELECT_PACKAGE_MODEL_BASIS_SQL, { packageId });
    return row ? mapBasis(row) : null;
  }

  async upsertPackageModelBasis(input: DrawingPackageModelBasis): Promise<void> {
    await this.client.execute(UPSERT_PACKAGE_MODEL_BASIS_SQL, {
      id: input.id,
      packageId: input.packageId,
      basisType: input.basisType,
      sharedModelVersionId: input.sharedModelVersionId,
      exceptionReason: input.exceptionReason,
      exceptionConfirmedBy: input.exceptionConfirmedBy,
      exceptionConfirmedAt: input.exceptionConfirmedAt,
      reviewStatus: input.reviewStatus,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    });
  }

  async listRequiredMaDrawings(owner: Pick<SharedModelOwner, "companyId" | "partRootId">): Promise<RequiredMaDrawing[]> {
    const rows = await this.client.query<RequiredMaDrawingRow>(SELECT_REQUIRED_MA_DRAWINGS_SQL, owner);
    return rows.map(mapRequiredDrawing);
  }

  async listReleasedPackagesForDrawings(companyId: string, drawingNumberIds: string[]): Promise<ReleasedDrawingPackage[]> {
    if (drawingNumberIds.length === 0) return [];
    const rows = await this.client.query<ReleasedDrawingPackageRow>(expandDrawingIdsSql(SELECT_RELEASED_PACKAGES_FOR_DRAWINGS_SQL, drawingNumberIds), {
      companyId,
      ...drawingIdsParams(drawingNumberIds)
    });
    return rows.map(mapReleasedPackage);
  }

  async insertManufacturingBaseline(input: ManufacturingBaseline, items: ManufacturingBaselineItem[]): Promise<void> {
    await this.client.transaction(async (tx) => {
      await tx.execute(INSERT_MANUFACTURING_BASELINE_SQL, {
        id: input.id,
        companyId: input.companyId,
        ownerScope: input.ownerScope,
        ownerId: input.ownerId,
        partRootId: input.partRootId,
        partNumberId: input.partNumberId,
        baselineCode: input.baselineCode,
        baselineRevision: input.baselineRevision,
        sharedModelVersionId: input.sharedModelVersionId,
        status: input.status,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        snapshotJson: input.snapshotJson
      });
      for (const item of items) {
        await tx.execute(INSERT_MANUFACTURING_BASELINE_ITEM_SQL, {
          id: item.id,
          baselineId: item.baselineId,
          drawingNumberId: item.drawingNumberId,
          drawingNumber: item.drawingNumber,
          packageId: item.packageId,
          packageRevision: item.packageRevision,
          inclusionStatus: item.inclusionStatus,
          selectionReason: item.selectionReason,
          reviewStatus: item.reviewStatus,
          createdAt: item.createdAt
        });
      }
    });
  }

  async getManufacturingBaseline(baselineId: string): Promise<ManufacturingBaseline | null> {
    const row = await this.client.queryOne<ManufacturingBaselineRow>(SELECT_MANUFACTURING_BASELINE_SQL, { baselineId });
    return row ? mapBaseline(row) : null;
  }

  async listManufacturingBaselineItems(baselineId: string): Promise<ManufacturingBaselineItem[]> {
    const rows = await this.client.query<ManufacturingBaselineItemRow>(SELECT_MANUFACTURING_BASELINE_ITEMS_SQL, { baselineId });
    return rows.map(mapBaselineItem);
  }

  async releaseManufacturingBaseline(input: { baselineId: string; releasedBy: string; releasedAt: string; snapshotJson: string }): Promise<void> {
    await this.client.execute(RELEASE_MANUFACTURING_BASELINE_SQL, input);
  }

  async releaseManufacturingBaselineWithAudit(input: { baselineId: string; releasedBy: string; releasedAt: string; snapshotJson: string; audit: AsyncAuditLogInput }): Promise<void> {
    await this.client.transaction(async (tx) => {
      const current = await tx.queryOne<{ status: ManufacturingBaselineStatus }>(
        `${SELECT_MANUFACTURING_BASELINE_SQL}${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        { baselineId: input.baselineId }
      );
      if (!current || current.status !== "Draft") throw new Error("BASELINE_RELEASE_CONFLICT");
      await tx.execute(RELEASE_MANUFACTURING_BASELINE_SQL, input);
      const released = await tx.queryOne<{ status: ManufacturingBaselineStatus }>(SELECT_MANUFACTURING_BASELINE_SQL, { baselineId: input.baselineId });
      if (!released || released.status !== "Released") throw new Error("BASELINE_RELEASE_CONFLICT");
      await new AsyncAuditRepository(tx).createAuditLog(input.audit);
    }, { serializable: true });
  }

  async listReleasedBaselinesByModel(sharedModelVersionId: string): Promise<ManufacturingBaseline[]> {
    const rows = await this.client.query<ManufacturingBaselineRow>(SELECT_MODEL_IMPACT_BASELINES_SQL, { sharedModelVersionId });
    return rows.map(mapBaseline);
  }
}
