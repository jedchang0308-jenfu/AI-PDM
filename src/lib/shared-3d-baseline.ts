import crypto from "node:crypto";
import { createAuditLogAsync } from "@/lib/audit-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { isManufacturingDrawingPurpose } from "@/lib/numbering-identity";
import {
  AsyncShared3dBaselineRepository,
  type DrawingPackageModelBasis,
  type ManufacturingBaseline,
  type ManufacturingBaselineItem,
  type ReleasedDrawingPackage,
  type SharedCadModelStatus,
  type SharedCadModelVersion,
  type SharedModelOwner,
  type SharedModelOwnerScope
} from "@/lib/repositories/shared-3d-baseline-async-repository";
import { compareRevisionCodes } from "@/lib/revision-policy";

export class Shared3dBaselineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export type SharedModelReuseCandidate = {
  id: string;
  modelRevision: string;
  contentHash: string;
  status: SharedCadModelStatus;
};

export type RequiredMaResolverResult = {
  owner: SharedModelOwner;
  required: Array<{
    drawingNumberId: string;
    drawingNumber: string;
    latestReleasedPackage: ReleasedDrawingPackage | null;
  }>;
  missing: Array<{ drawingNumberId: string; drawingNumber: string; reason: "missing_released_package" }>;
};

function normalizeModelRevision(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "unlabeled";
}

function normalizeReason(value: unknown) {
  return String(value ?? "").trim().slice(0, 500);
}

function summarizeModel(model: SharedCadModelVersion): SharedModelReuseCandidate {
  return {
    id: model.id,
    modelRevision: model.modelRevision,
    contentHash: model.contentHash,
    status: model.status
  };
}

async function resolveOwner(input: { ownerScope: SharedModelOwnerScope; ownerCode: string }, repository: AsyncShared3dBaselineRepository) {
  const owner =
    input.ownerScope === "part_number"
      ? await repository.getOwnerByPartNumber(input.ownerCode)
      : await repository.getOwnerByRootCode(input.ownerCode);
  if (!owner) throw new Shared3dBaselineError("SHARED_MODEL_OWNER_NOT_FOUND", "找不到 part/root 共用 3D 擁有者。", 404);
  return owner;
}

function sortReleasedPackages(packages: ReleasedDrawingPackage[]) {
  return [...packages].sort((a, b) => {
    const revisionCompare = compareRevisionCodes(b.revision, a.revision);
    if (revisionCompare !== 0) return revisionCompare;
    return String(b.releasedAt ?? "").localeCompare(String(a.releasedAt ?? ""));
  });
}

export async function listSharedModelVersionsAsync(input: { ownerScope: SharedModelOwnerScope; ownerCode: string }) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const owner = await resolveOwner(input, repository);
  return { owner, models: await repository.listSharedModels(owner) };
}

export async function createSharedModelVersionAsync(input: {
  ownerScope: SharedModelOwnerScope;
  ownerCode: string;
  sourceFileAssetId: string;
  modelRevision?: string | null;
  actorId: string;
  status?: SharedCadModelStatus;
  releaseReason?: string | null;
  allowSameHashNewLabel?: boolean;
}) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncShared3dBaselineRepository(client);
  const owner = await resolveOwner(input, repository);
  const file = await repository.getFileAsset(input.sourceFileAssetId);
  if (!file) throw new Shared3dBaselineError("SHARED_MODEL_FILE_NOT_FOUND", "找不到共用 3D 來源檔案。", 404);
  if (!file.contentHash) throw new Shared3dBaselineError("SHARED_MODEL_HASH_REQUIRED", "共用 3D 來源檔案缺少 content hash。", 409);
  if (file.documentCategory !== "cad_3d" && file.documentCategory !== "intermediate") {
    throw new Shared3dBaselineError("SHARED_MODEL_CATEGORY_REQUIRED", "共用 3D 來源檔案必須是 3D CAD 或中繼模型類別。", 409, {
      documentCategory: file.documentCategory
    });
  }

  const modelRevision = normalizeModelRevision(input.modelRevision);
  const byHash = await repository.findSharedModelsByHash(owner, file.contentHash);
  const reusable = byHash.find((model) => model.modelRevision === modelRevision);
  if (reusable) {
    return { owner, model: reusable, reused: true, reuseCandidates: byHash.map(summarizeModel) };
  }
  if (byHash.length > 0 && !input.allowSameHashNewLabel) {
    throw new Shared3dBaselineError("SHARED_MODEL_SAME_HASH_NEW_LABEL_REVIEW_REQUIRED", "相同 3D hash 已存在；不同 model revision 標籤需明確審核原因。", 409, {
      reuseCandidates: byHash.map(summarizeModel)
    });
  }

  const byRevision = await repository.findSharedModelsByRevision(owner, modelRevision);
  const revisionConflict = byRevision.find((model) => model.contentHash !== file.contentHash);
  if (revisionConflict) {
    throw new Shared3dBaselineError("SHARED_MODEL_REVISION_HASH_CONFLICT", "相同 model revision 指向不同 3D hash，需先修正版次或走 Admin-reviewed correction。", 409, {
      existing: summarizeModel(revisionConflict)
    });
  }

  const now = new Date().toISOString();
  const status = input.status ?? "Released";
  const model: SharedCadModelVersion = {
    id: `SCM-${crypto.randomUUID()}`,
    companyId: owner.companyId,
    ownerScope: owner.ownerScope,
    ownerId: owner.ownerId,
    partRootId: owner.partRootId,
    partNumberId: owner.partNumberId,
    sourceFileAssetId: file.id,
    modelRevision,
    contentHash: file.contentHash,
    hashAlgorithm: file.hashAlgorithm || "SHA-256",
    status,
    createdBy: input.actorId,
    createdAt: now,
    releasedBy: status === "Released" ? input.actorId : null,
    releasedAt: status === "Released" ? now : null,
    releaseReason: normalizeReason(input.releaseReason) || null
  };
  await repository.insertSharedModel(model);
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SharedCadModelVersionCreated",
    detail: {
      modelId: model.id,
      ownerScope: owner.ownerScope,
      ownerCode: owner.ownerCode,
      modelRevision,
      contentHash: model.contentHash,
      status
    }
  });
  return { owner, model, reused: false, reuseCandidates: byHash.map(summarizeModel) };
}

export async function setDrawingPackageModelBasisAsync(input: {
  packageId: string;
  actorId: string;
  sharedModelVersionId?: string | null;
  twoDOnlyReason?: string | null;
  confirmTwoDOnly?: boolean;
}) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const pkg = await repository.getDrawingPackage(input.packageId);
  if (!pkg) throw new Shared3dBaselineError("DRAWING_PACKAGE_NOT_FOUND", "找不到圖面版次附件包。", 404);

  const now = new Date().toISOString();
  let basis: DrawingPackageModelBasis;
  if (input.sharedModelVersionId) {
    const model = await repository.getSharedModelById(input.sharedModelVersionId);
    if (!model) throw new Shared3dBaselineError("SHARED_MODEL_NOT_FOUND", "找不到共用 3D model version。", 404);
    if (model.companyId !== pkg.companyId || model.partRootId !== pkg.drawingPartRootId) {
      throw new Shared3dBaselineError("SHARED_MODEL_OWNER_MISMATCH", "共用 3D 不屬於此製造圖圖號的 root/part。", 409);
    }
    basis = {
      id: `DPM-${crypto.randomUUID()}`,
      packageId: pkg.id,
      basisType: "shared_model",
      sharedModelVersionId: model.id,
      exceptionReason: null,
      exceptionConfirmedBy: null,
      exceptionConfirmedAt: null,
      reviewStatus: "confirmed",
      createdBy: input.actorId,
      createdAt: now,
      updatedAt: now
    };
  } else {
    const reason = normalizeReason(input.twoDOnlyReason);
    if (!reason) throw new Shared3dBaselineError("TWO_D_ONLY_REASON_REQUIRED", "2D-only / no 3D impact 例外需要原因。", 400);
    if (!input.confirmTwoDOnly) throw new Shared3dBaselineError("TWO_D_ONLY_CONFIRMATION_REQUIRED", "2D-only / no 3D impact 例外需要審核確認。", 409);
    basis = {
      id: `DPM-${crypto.randomUUID()}`,
      packageId: pkg.id,
      basisType: "two_d_only",
      sharedModelVersionId: null,
      exceptionReason: reason,
      exceptionConfirmedBy: input.actorId,
      exceptionConfirmedAt: now,
      reviewStatus: "confirmed",
      createdBy: input.actorId,
      createdAt: now,
      updatedAt: now
    };
  }

  await repository.upsertPackageModelBasis(basis);
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "DrawingPackageModelBasisSet",
    detail: {
      packageId: pkg.id,
      basisType: basis.basisType,
      sharedModelVersionId: basis.sharedModelVersionId,
      reviewStatus: basis.reviewStatus
    }
  });
  return basis;
}

export async function assertDrawingPackageModelBasisForReleaseAsync(packageId: string) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const pkg = await repository.getDrawingPackage(packageId);
  if (!pkg) throw new Shared3dBaselineError("DRAWING_PACKAGE_NOT_FOUND", "找不到圖面版次附件包。", 404);
  if (!isManufacturingDrawingPurpose(pkg.drawingPurposeCode)) return { ok: true, reason: "non_ma_package" as const };

  const basis = await repository.getPackageModelBasis(packageId);
  if (!basis || basis.reviewStatus !== "confirmed") {
    throw new Shared3dBaselineError("MA_PACKAGE_MODEL_BASIS_REQUIRED", "製造圖發行前必須連結共用 3D，或提供已審核的 2D-only / no 3D impact 例外。", 409);
  }
  if (basis.basisType === "shared_model") {
    if (!basis.sharedModelVersionId) throw new Shared3dBaselineError("MA_PACKAGE_SHARED_MODEL_REQUIRED", "製造圖缺少共用 3D model version。", 409);
    const model = await repository.getSharedModelById(basis.sharedModelVersionId);
    if (!model || model.status !== "Released") {
      throw new Shared3dBaselineError("MA_PACKAGE_SHARED_MODEL_NOT_RELEASED", "製造圖連結的共用 3D 尚未 Released。", 409);
    }
  }
  if (basis.basisType === "two_d_only" && !basis.exceptionReason) {
    throw new Shared3dBaselineError("TWO_D_ONLY_REASON_REQUIRED", "2D-only / no 3D impact 例外需要原因。", 400);
  }
  return { ok: true, reason: basis.basisType };
}

export async function resolveRequiredMaForBaselineAsync(input: { ownerScope: SharedModelOwnerScope; ownerCode: string }): Promise<RequiredMaResolverResult> {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const owner = await resolveOwner(input, repository);
  const requiredDrawings = await repository.listRequiredMaDrawings(owner);
  const releasedPackages = await repository.listReleasedPackagesForDrawings(owner.companyId, requiredDrawings.map((drawing) => drawing.id));
  const packagesByDrawing = new Map<string, ReleasedDrawingPackage[]>();
  for (const pkg of releasedPackages) {
    const list = packagesByDrawing.get(pkg.drawingNumberId) ?? [];
    list.push(pkg);
    packagesByDrawing.set(pkg.drawingNumberId, list);
  }
  const required = requiredDrawings.map((drawing) => {
    const latestReleasedPackage = sortReleasedPackages(packagesByDrawing.get(drawing.id) ?? [])[0] ?? null;
    return { drawingNumberId: drawing.id, drawingNumber: drawing.drawingNumber, latestReleasedPackage };
  });
  return {
    owner,
    required,
    missing: required.filter((item) => !item.latestReleasedPackage).map((item) => ({ drawingNumberId: item.drawingNumberId, drawingNumber: item.drawingNumber, reason: "missing_released_package" }))
  };
}

export async function createManufacturingBaselineDraftAsync(input: {
  ownerScope: SharedModelOwnerScope;
  ownerCode: string;
  sharedModelVersionId: string;
  baselineRevision: string;
  actorId: string;
  selectedPackageIds?: string[];
  exclusions?: Array<{ drawingNumberId: string; reason: string; approved: boolean }>;
}) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const resolver = await resolveRequiredMaForBaselineAsync({ ownerScope: input.ownerScope, ownerCode: input.ownerCode });
  const model = await repository.getSharedModelById(input.sharedModelVersionId);
  if (!model || model.companyId !== resolver.owner.companyId || model.partRootId !== resolver.owner.partRootId) {
    throw new Shared3dBaselineError("BASELINE_SHARED_MODEL_INVALID", "製造基準包的共用 3D 不屬於此 part/root。", 409);
  }
  const selectedPackageIds = new Set(input.selectedPackageIds ?? []);
  const exclusions = new Map((input.exclusions ?? []).map((item) => [item.drawingNumberId, item]));
  const now = new Date().toISOString();
  const baselineId = `MBL-${crypto.randomUUID()}`;
  const items: ManufacturingBaselineItem[] = resolver.required.map((required) => {
    const exclusion = exclusions.get(required.drawingNumberId);
    if (exclusion) {
      return {
        id: `MBLI-${crypto.randomUUID()}`,
        baselineId,
        drawingNumberId: required.drawingNumberId,
        drawingNumber: required.drawingNumber,
        packageId: null,
        packageRevision: null,
        inclusionStatus: "excluded",
        selectionReason: normalizeReason(exclusion.reason),
        reviewStatus: exclusion.approved ? "approved" : "draft",
        createdAt: now
      };
    }
    const latest = required.latestReleasedPackage;
    if (!latest) {
      return {
        id: `MBLI-${crypto.randomUUID()}`,
        baselineId,
        drawingNumberId: required.drawingNumberId,
        drawingNumber: required.drawingNumber,
        packageId: null,
        packageRevision: null,
        inclusionStatus: "included",
        selectionReason: null,
        reviewStatus: "draft",
        createdAt: now
      };
    }
    return {
      id: `MBLI-${crypto.randomUUID()}`,
      baselineId,
      drawingNumberId: required.drawingNumberId,
      drawingNumber: required.drawingNumber,
      packageId: selectedPackageIds.size === 0 || selectedPackageIds.has(latest.id) ? latest.id : latest.id,
      packageRevision: latest.revision,
      inclusionStatus: "included",
      selectionReason: null,
      reviewStatus: "approved",
      createdAt: now
    };
  });
  const baseline: ManufacturingBaseline = {
    id: baselineId,
    companyId: resolver.owner.companyId,
    ownerScope: resolver.owner.ownerScope,
    ownerId: resolver.owner.ownerId,
    partRootId: resolver.owner.partRootId,
    partNumberId: resolver.owner.partNumberId,
    baselineCode: `${resolver.owner.ownerCode}-MB-${input.baselineRevision}`,
    baselineRevision: normalizeModelRevision(input.baselineRevision),
    sharedModelVersionId: model.id,
    status: "Draft",
    createdBy: input.actorId,
    createdAt: now,
    releasedBy: null,
    releasedAt: null,
    snapshotJson: JSON.stringify({ createdFrom: "required_ma_resolver", resolverMissing: resolver.missing })
  };
  await repository.insertManufacturingBaseline(baseline, items);
  return { baseline, items, resolver };
}

export async function releaseManufacturingBaselineAsync(input: { baselineId: string; actorId: string }) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const baseline = await repository.getManufacturingBaseline(input.baselineId);
  if (!baseline) throw new Shared3dBaselineError("BASELINE_NOT_FOUND", "找不到製造基準包。", 404);
  if (baseline.status !== "Draft") throw new Shared3dBaselineError("BASELINE_IMMUTABLE", "已 Released 的製造基準包不可原地修改或重複發行。", 409);
  const model = await repository.getSharedModelById(baseline.sharedModelVersionId);
  if (!model || model.status !== "Released") throw new Shared3dBaselineError("BASELINE_MODEL_NOT_RELEASED", "製造基準包使用的共用 3D 必須已 Released。", 409);
  const items = await repository.listManufacturingBaselineItems(baseline.id);
  const missing = items.filter((item) => item.inclusionStatus === "included" && !item.packageId);
  if (missing.length > 0) {
    throw new Shared3dBaselineError("BASELINE_REQUIRED_MA_MISSING", "製造基準包不能省略必要製造圖。", 409, { missing });
  }
  const unapprovedExclusions = items.filter((item) => item.inclusionStatus === "excluded" && (!item.selectionReason || item.reviewStatus !== "approved"));
  if (unapprovedExclusions.length > 0) {
    throw new Shared3dBaselineError("BASELINE_EXCLUSION_APPROVAL_REQUIRED", "排除必要製造圖需要原因與核准。", 409, { unapprovedExclusions });
  }
  const releasedAt = new Date().toISOString();
  const snapshotJson = JSON.stringify({
    schema: "manufacturing_baseline.v1",
    releasedAt,
    sharedModel: {
      id: model.id,
      modelRevision: model.modelRevision,
      contentHash: model.contentHash,
      hashAlgorithm: model.hashAlgorithm
    },
    items
  });
  await repository.releaseManufacturingBaseline({ baselineId: baseline.id, releasedBy: input.actorId, releasedAt, snapshotJson });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "ManufacturingBaselineReleased",
    detail: { baselineId: baseline.id, sharedModelVersionId: model.id, itemCount: items.length }
  });
  const released = await repository.getManufacturingBaseline(baseline.id);
  return { baseline: released, items };
}

export async function listSharedModelImpactAsync(sharedModelVersionId: string) {
  const repository = new AsyncShared3dBaselineRepository(getAsyncDatabaseClient());
  const model = await repository.getSharedModelById(sharedModelVersionId);
  if (!model) throw new Shared3dBaselineError("SHARED_MODEL_NOT_FOUND", "找不到共用 3D model version。", 404);
  return {
    model,
    releasedBaselines: await repository.listReleasedBaselinesByModel(sharedModelVersionId)
  };
}
