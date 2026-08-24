import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  AsyncTransferPackageRepository,
  TransferPackageError,
  type TransferPackageActor,
  type TransferPackageCaseType,
  type TransferPackageEntityType,
  type TransferPackageRecord,
  type TransferPackageSourceReferenceStatus
} from "@/lib/repositories/transfer-package-async-repository";

export { TransferPackageError };
export type { TransferPackageActor, TransferPackageRecord };

export type TransferPackageBlocker = {
  id: string;
  severity: "required" | "warning";
  ownerRole: string;
  ownerModule: string;
  message: string;
  actionLabel: string;
  actionHref: string;
};

export type TransferPackageAdapter = {
  id: "intake" | "drawing_part" | "attachments" | "approval";
  label: string;
  status: "not_started" | "blocked" | "ready" | "not_applicable" | "unavailable";
  message: string;
  ownerModule: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export type TransferPackageWorkbench = TransferPackageRecord & {
  blockers: TransferPackageBlocker[];
  adapters: TransferPackageAdapter[];
  capabilities: {
    persistentDraft: true;
    scopeEditing: true;
    packAndGoIntake: false;
    baseline: false;
    formalSubmit: true;
    batchPublication: true;
  };
};

const caseTypes = new Set<TransferPackageCaseType>(["development_case", "design_change_case"]);
const referenceStatuses = new Set<TransferPackageSourceReferenceStatus>(["provided", "not_available"]);

function repository() {
  return new AsyncTransferPackageRepository(getAsyncDatabaseClient());
}

function text(value: unknown, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function requiredText(value: unknown, field: string, minimum: number, maximum: number) {
  const normalized = text(value, maximum);
  if (normalized.length < minimum) {
    throw new TransferPackageError("TRANSFER_PACKAGE_INVALID", `${field}至少需要 ${minimum} 個字。`, 400);
  }
  return normalized;
}

export function normalizeTransferPackageEntityType(value: unknown): TransferPackageEntityType | null {
  const normalized = text(value, 40).toLowerCase();
  if (["drawing", "drawing_number", "drawing-number"].includes(normalized)) return "drawing_number";
  if (["part", "part_number", "part-number"].includes(normalized)) return "part_number";
  return null;
}

function normalizeCaseType(value: unknown): TransferPackageCaseType {
  const normalized = text(value, 40) as TransferPackageCaseType;
  if (!caseTypes.has(normalized)) {
    throw new TransferPackageError("TRANSFER_PACKAGE_INVALID", "案件類型必須是開發案或設變案。", 400);
  }
  return normalized;
}

function normalizeReference(input: {
  sourceReferenceStatus?: unknown;
  sourceReference?: unknown;
  sourceReferenceReason?: unknown;
}) {
  const status = text(input.sourceReferenceStatus, 40) as TransferPackageSourceReferenceStatus;
  const sourceReferenceStatus = referenceStatuses.has(status) ? status : "not_available";
  const sourceReference = text(input.sourceReference, 300) || null;
  const sourceReferenceReason = text(input.sourceReferenceReason, 500) || null;
  if (sourceReferenceStatus === "provided" && !sourceReference) {
    throw new TransferPackageError("TRANSFER_PACKAGE_INVALID", "已選擇有來源依據，請填寫專案、ECR、ECO 或客戶需求編號。", 400);
  }
  if (sourceReferenceStatus === "not_available" && !sourceReferenceReason) {
    throw new TransferPackageError("TRANSFER_PACKAGE_INVALID", "沒有來源依據時，請填寫原因。", 400);
  }
  return {
    sourceReferenceStatus,
    sourceReference: sourceReferenceStatus === "provided" ? sourceReference : null,
    sourceReferenceReason: sourceReferenceStatus === "not_available" ? sourceReferenceReason : null
  };
}

function validateIdempotencyKey(value: unknown) {
  const normalized = text(value, 200);
  if (!/^[A-Za-z0-9._:/-]{1,200}$/u.test(normalized)) {
    throw new TransferPackageError("TRANSFER_PACKAGE_IDEMPOTENCY_KEY_REQUIRED", "建立技轉包需要有效的 Idempotency-Key。", 400);
  }
  return normalized;
}

function validateVersion(value: unknown) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new TransferPackageError("TRANSFER_PACKAGE_VERSION_REQUIRED", "請重新整理技轉包後再操作。", 400);
  }
  return version;
}

async function resolveEntity(input: {
  companyId: string;
  entityType: unknown;
  entityIdOrCode: unknown;
  required?: boolean;
}) {
  const entityType = normalizeTransferPackageEntityType(input.entityType);
  const entityIdOrCode = text(input.entityIdOrCode, 200);
  if (!entityType || !entityIdOrCode) {
    if (input.required) throw new TransferPackageError("TRANSFER_PACKAGE_SOURCE_INVALID", "請選擇有效的圖號或料號。", 400);
    return null;
  }
  const entity = await repository().resolveScopeEntity(input.companyId, entityType, entityIdOrCode);
  if (!entity) throw new TransferPackageError("TRANSFER_PACKAGE_SOURCE_NOT_FOUND", "找不到指定的圖號或料號。", 404);
  return entity;
}

export async function getTransferPackageWorkbenchContext(input: {
  companyId: string;
  sourceType?: unknown;
  sourceId?: unknown;
  caseType?: unknown;
}) {
  const sourceType = normalizeTransferPackageEntityType(input.sourceType);
  const sourceId = text(input.sourceId, 200);
  const sourceItem = sourceType && sourceId
    ? await repository().resolveScopeEntity(input.companyId, sourceType, sourceId)
    : null;
  return {
    mode: "unsaved" as const,
    caseType: caseTypes.has(text(input.caseType, 40) as TransferPackageCaseType)
      ? (text(input.caseType, 40) as TransferPackageCaseType)
      : "design_change_case" as const,
    sourceItem,
    sourceRequested: Boolean(sourceType && sourceId),
    sourceResolved: Boolean(sourceItem),
    capabilities: {
      persistentDraft: true,
      scopeEditing: true,
      packAndGoIntake: false,
      baseline: false,
      formalSubmit: true,
      batchPublication: true
    }
  };
}

export async function createTransferPackageDraft(input: {
  actor: TransferPackageActor;
  idempotencyKey: unknown;
  title: unknown;
  caseType: unknown;
  caseReason: unknown;
  sourceReferenceStatus?: unknown;
  sourceReference?: unknown;
  sourceReferenceReason?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
}) {
  const sourceItem = await resolveEntity({
    companyId: input.actor.companyId,
    entityType: input.sourceType,
    entityIdOrCode: input.sourceId,
    required: Boolean(text(input.sourceType, 40) || text(input.sourceId, 200))
  });
  const reference = normalizeReference(input);
  const record = await repository().createDraft({
    actor: input.actor,
    idempotencyKey: validateIdempotencyKey(input.idempotencyKey),
    title: requiredText(input.title, "技轉包名稱", 2, 120),
    caseType: normalizeCaseType(input.caseType),
    caseReason: requiredText(input.caseReason, "案件或變更原因", 3, 2000),
    ...reference,
    sourceItem
  });
  return buildWorkbench(record);
}

export async function getTransferPackageWorkbench(packageId: string, companyId: string) {
  return buildWorkbench(await repository().getById(requiredText(packageId, "技轉包 ID", 1, 200), companyId));
}

export async function updateTransferPackageHeader(input: {
  packageId: string;
  actor: TransferPackageActor;
  expectedRowVersion: unknown;
  title: unknown;
  caseType: unknown;
  caseReason: unknown;
  sourceReferenceStatus?: unknown;
  sourceReference?: unknown;
  sourceReferenceReason?: unknown;
}) {
  const reference = normalizeReference(input);
  const record = await repository().updateHeader({
    packageId: requiredText(input.packageId, "技轉包 ID", 1, 200),
    actor: input.actor,
    expectedRowVersion: validateVersion(input.expectedRowVersion),
    title: requiredText(input.title, "技轉包名稱", 2, 120),
    caseType: normalizeCaseType(input.caseType),
    caseReason: requiredText(input.caseReason, "案件或變更原因", 3, 2000),
    ...reference
  });
  return buildWorkbench(record);
}

export async function addTransferPackageScopeItem(input: {
  packageId: string;
  actor: TransferPackageActor;
  expectedRowVersion: unknown;
  entityType: unknown;
  entityIdOrCode: unknown;
}) {
  const entity = await resolveEntity({
    companyId: input.actor.companyId,
    entityType: input.entityType,
    entityIdOrCode: input.entityIdOrCode,
    required: true
  });
  if (!entity) throw new TransferPackageError("TRANSFER_PACKAGE_SOURCE_NOT_FOUND", "找不到指定的圖號或料號。", 404);
  const record = await repository().addScopeItem({
    packageId: requiredText(input.packageId, "技轉包 ID", 1, 200),
    actor: input.actor,
    expectedRowVersion: validateVersion(input.expectedRowVersion),
    entity
  });
  return buildWorkbench(record);
}

export async function removeTransferPackageScopeItem(input: {
  packageId: string;
  itemId: string;
  actor: TransferPackageActor;
  expectedRowVersion: unknown;
}) {
  const record = await repository().removeScopeItem({
    packageId: requiredText(input.packageId, "技轉包 ID", 1, 200),
    itemId: requiredText(input.itemId, "範圍項目 ID", 1, 200),
    actor: input.actor,
    expectedRowVersion: validateVersion(input.expectedRowVersion)
  });
  return buildWorkbench(record);
}

export async function cancelTransferPackage(input: {
  packageId: string;
  actor: TransferPackageActor;
  expectedRowVersion: unknown;
  reason: unknown;
}) {
  const record = await repository().cancel({
    packageId: requiredText(input.packageId, "技轉包 ID", 1, 200),
    actor: input.actor,
    expectedRowVersion: validateVersion(input.expectedRowVersion),
    reason: requiredText(input.reason, "取消原因", 3, 500)
  });
  return buildWorkbench(record);
}

export function buildTransferPackageReadinessSummary(workbench: TransferPackageWorkbench) {
  return {
    packageId: workbench.id,
    rowVersion: workbench.rowVersion,
    ready: workbench.blockers.every((blocker) => blocker.severity !== "required"),
    phase: "1D",
    packageStatus: workbench.status,
    blockerCount: workbench.blockers.filter((blocker) => blocker.severity === "required").length,
    blockers: workbench.blockers,
    capabilities: workbench.capabilities
  };
}

function buildWorkbench(record: TransferPackageRecord): TransferPackageWorkbench {
  const returnPath = `/transfer-packages/${encodeURIComponent(record.id)}`;
  const scopeHref = `${returnPath}?section=scope`;
  const firstItem = record.items[0] ?? null;
  const ownerHref = firstItem
    ? firstItem.entityType === "drawing_number"
      ? `/numbering/drawings?query=${encodeURIComponent(firstItem.entityCode)}&returnTo=${encodeURIComponent(`${scopeHref}&blocker=scope`)}`
      : `/parts?query=${encodeURIComponent(firstItem.entityCode)}&returnTo=${encodeURIComponent(`${scopeHref}&blocker=scope`)}`
    : "/numbering/search";
  const blockers: TransferPackageBlocker[] = [];
  if (["Draft", "NeedsInfo", "ReleaseFailed"].includes(record.status) && record.items.length + record.draftItems.length === 0) {
    blockers.push({
      id: "scope",
      severity: "required",
      ownerRole: "RD",
      ownerModule: "圖料工作台",
      message: "技轉包尚未加入任何受影響圖號或料號。",
      actionLabel: "加入案件範圍",
      actionHref: scopeHref
    });
  }
  if (["Draft", "NeedsInfo", "ReleaseFailed"].includes(record.status)) {
    blockers.push({
      id: "intake-unavailable",
      severity: "warning",
      ownerRole: "系統",
      ownerModule: "Pack and Go Intake",
      message: "技轉包已保存；Pack and Go 解析將在 Phase 3A-1 開放。",
      actionLabel: record.items.length ? "查看已加入範圍" : "先補齊案件範圍",
      actionHref: scopeHref
    });
  }

  const adapters: TransferPackageAdapter[] = [
    {
      id: "drawing_part",
      label: "圖料範圍",
      status: record.items.length + record.draftItems.length ? "ready" : "blocked",
      message: record.items.length + record.draftItems.length ? `已納入 ${record.items.length} 個正式項目與 ${record.draftItems.length} 個草稿。` : "尚未加入受影響圖號、料號或草稿工作區。",
      ownerModule: "圖料工作台",
      actionLabel: record.items.length ? "查看圖料" : "搜尋圖料",
      actionHref: ownerHref
    },
    {
      id: "intake",
      label: "Pack and Go",
      status: "unavailable",
      message: "解析與分類尚未開放；目前不會顯示假完成狀態。",
      ownerModule: "技轉包",
      actionLabel: null,
      actionHref: null
    },
    {
      id: "attachments",
      label: "附件",
      status: record.items.length ? "not_started" : "blocked",
      message: record.items.length ? "附件仍由圖號／料號主檔管理。" : "先加入案件範圍。",
      ownerModule: "圖料附件",
      actionLabel: record.items.length ? "前往附件主檔" : null,
      actionHref: record.items.length ? ownerHref : null
    },
    {
      id: "approval",
      label: "審核",
      status: record.status === "Published" ? "ready" : record.status === "Draft" ? "not_started" : "ready",
      message: record.status === "Published" ? "技轉包已完成審核與發布。" : record.status === "Draft" ? "readiness 完成後可送交整包審核。" : `目前狀態：${record.status}。`,
      ownerModule: "審核工作台",
      actionLabel: record.reviewRequestId ? "查看審核" : null,
      actionHref: record.reviewRequestId ? `/approvals?requestId=${encodeURIComponent(record.reviewRequestId)}` : null
    }
  ];
  return {
    ...record,
    blockers,
    adapters,
    capabilities: {
      persistentDraft: true,
      scopeEditing: true,
      packAndGoIntake: false,
      baseline: false,
      formalSubmit: true,
      batchPublication: true
    }
  };
}
