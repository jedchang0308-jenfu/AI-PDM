import type { LifecycleActionPolicy, LifecycleDetailTag } from "@/lib/pdm-lifecycle-policy";

const NUMBERING_RULE_V2_ID = "numbering-rule-v2";

function parseCompactV2PartNumber(value: string): { rootCode: string; sequenceCode: string } | null {
  const match = /^([0-9]{5})-P([0-9]{2})$/.exec(value.trim().toUpperCase());
  if (!match || match[2] === "00") return null;
  return { rootCode: match[1], sequenceCode: match[2] };
}

export type PdmChangeControlDatabaseKind = "sqlite" | "postgres";
export type PdmChangeControlQueryParams = readonly unknown[] | Record<string, unknown>;

export interface PdmChangeControlDatabaseClient {
  readonly kind: PdmChangeControlDatabaseKind;
  query<T>(sql: string, params?: PdmChangeControlQueryParams): Promise<T[]>;
  queryOne<T>(sql: string, params?: PdmChangeControlQueryParams): Promise<T | null>;
  execute(sql: string, params?: PdmChangeControlQueryParams): Promise<void>;
}

export type PartNumberDraftType = "new_part" | "replacement_part" | "drawing_revision_generated";
export type PartNumberDraftItemType = "self_made" | "purchased" | "standard";
export type PartNumberDraftStatus = "draft" | "pending_review" | "released" | "needs_reconfirmation" | "voided";
export type DrawingRevisionFffState = "no_impact" | "suspected_impact" | "confirmed_impact";
export type DrawingRevisionFffOutcome = "no_impact" | "suspected_impact" | "confirmed_impact";
export type DrawingRevisionReviewAction =
  | "confirm_bom_no_revision"
  | "confirm_original_part_reuse"
  | "return_for_replacement_part"
  | "approve_replacement_part_and_drawing_release";

export type PartNumberControlBoundaryReason =
  | "referenced_by_bom"
  | "referenced_by_replacement_link"
  | "drawing_uploaded_to_pdm"
  | "submitted_for_review"
  | "formal_part_exists";

export type PdmChangeControlActorContext = {
  userId: string;
  companyId?: string;
  role?: string | null;
  roleCodes?: string[];
};

export type PartNumberDraftRecord = {
  id: string;
  companyId: string;
  reservedPartNumber: string;
  draftType: PartNumberDraftType;
  itemType: PartNumberDraftItemType;
  status: PartNumberDraftStatus;
  sourcePartNumberId: string | null;
  sourceDrawingNumberId: string | null;
  sourceRevision: string | null;
  useType: string | null;
  createdBy: string | null;
  departmentId: string | null;
  version: number;
  voidedAt: string | null;
  recycleAvailableAt: string | null;
  recycledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartNumberControlBoundary = {
  draft: PartNumberDraftRecord;
  controlled: boolean;
  reasons: PartNumberControlBoundaryReason[];
};

export type PartNumberDraftWarningCode = "same_source_unfinished_draft" | "needs_reconfirmation" | "recycle_overdue";

export type PartNumberDraftListItem = PartNumberDraftRecord & {
  sourcePartNumber: string | null;
  sourceDrawingNumber: string | null;
  creatorName: string | null;
  sameSourceUnfinishedDraftCount: number;
  sameSourceUnfinishedDraftIds: string[];
  controlled: boolean;
  controlBoundaryReasons: PartNumberControlBoundaryReason[];
  warnings: PartNumberDraftWarningCode[];
};

export type DeletedPartNumberDraftListItem = {
  draft: PartNumberDraftListItem;
  policy: LifecycleActionPolicy;
};

export type ReservePartNumberDraftInput = {
  reservedPartNumber: string;
  draftType: PartNumberDraftType;
  itemType: PartNumberDraftItemType;
  sourcePartNumberId?: string | null;
  sourceDrawingNumberId?: string | null;
  sourceRevision?: string | null;
  useType?: string | null;
  departmentId?: string | null;
  actor: PdmChangeControlActorContext;
};

export type UpdatePartNumberDraftInput = {
  draftId: string;
  expectedVersion: number;
  itemType?: PartNumberDraftItemType;
  sourcePartNumberId?: string | null;
  sourceDrawingNumberId?: string | null;
  sourceRevision?: string | null;
  useType?: string | null;
  actor: PdmChangeControlActorContext;
};

export type DraftActionInput = {
  draftId: string;
  actor: PdmChangeControlActorContext;
};

export type ListPartNumberDraftsInput = {
  actor: PdmChangeControlActorContext;
  status?: PartNumberDraftStatus | "all";
  draftType?: PartNumberDraftType | "all";
  includeRecycled?: boolean;
  limit?: number;
};

export type MarkSameSourceDraftsNeedReconfirmationInput = {
  draftId: string;
  actor: PdmChangeControlActorContext;
};

export type SubmitDrawingRevisionFffAssessmentInput = {
  drawingNumberId: string;
  revision: string;
  formState: DrawingRevisionFffState;
  fitState: DrawingRevisionFffState;
  functionState: DrawingRevisionFffState;
  reasonCategory: string;
  note?: string | null;
  submissionId?: string | null;
  reviewPackageId?: string | null;
  currentPartNumberId?: string | null;
  replacementReservedPartNumber?: string | null;
  replacementItemType?: PartNumberDraftItemType;
  detectedPartNumber?: string | null;
  correctedPartNumber?: string | null;
  actor: PdmChangeControlActorContext;
};

export type DrawingRevisionFffAssessmentRecord = {
  id: string;
  companyId: string;
  drawingNumberId: string;
  revision: string;
  submissionId: string | null;
  reviewPackageId: string | null;
  replacementPartNumberDraftId: string | null;
  detectedPartNumber: string | null;
  correctedPartNumber: string | null;
  formState: DrawingRevisionFffState;
  fitState: DrawingRevisionFffState;
  functionState: DrawingRevisionFffState;
  reasonCategory: string;
  note: string | null;
  assessedBy: string | null;
  assessedAt: string;
};

export type SubmitDrawingRevisionFffAssessmentResult = {
  outcome: DrawingRevisionFffOutcome;
  assessment: DrawingRevisionFffAssessmentRecord;
  replacementDraft: PartNumberDraftRecord | null;
};

export type ApplyDrawingRevisionReviewActionInput = {
  assessmentId: string;
  action: DrawingRevisionReviewAction;
  result?: string | null;
  actor: PdmChangeControlActorContext;
};

export type ApplyDrawingRevisionReviewActionResult = {
  action: DrawingRevisionReviewAction;
  outcome: DrawingRevisionFffOutcome;
  assessment: DrawingRevisionFffAssessmentRecord;
  replacementDraft: PartNumberDraftRecord | null;
  replacementPartNumberId: string | null;
  bomReconfirmationFlagCount: number;
};

export type DrawingRevisionReviewListItem = DrawingRevisionFffAssessmentRecord & {
  drawingNumber: string | null;
  replacementReservedPartNumber: string | null;
  outcome: DrawingRevisionFffOutcome;
};

type PartNumberDraftRow = {
  id: string;
  company_id: string;
  reserved_part_number: string;
  draft_type: PartNumberDraftType;
  item_type: PartNumberDraftItemType;
  status: PartNumberDraftStatus;
  source_part_number_id: string | null;
  source_drawing_number_id: string | null;
  source_revision: string | null;
  use_type: string | null;
  created_by: string | null;
  department_id: string | null;
  version: number;
  voided_at: string | null;
  recycle_available_at: string | null;
  recycled_at: string | null;
  created_at: string;
  updated_at: string;
};

type PartNumberDraftListRow = PartNumberDraftRow & {
  source_part_number: string | null;
  source_drawing_number: string | null;
  creator_name: string | null;
};

type CountRow = {
  count: number | string;
};

type IdRow = {
  id: string;
};

type PartNumberIdentityRow = {
  id: string;
  part_number: string;
};

type BomDraftReferenceRow = {
  bom_draft_id: string;
};

type DrawingRevisionFffAssessmentRow = {
  id: string;
  company_id: string;
  drawing_number_id: string;
  revision: string;
  submission_id: string | null;
  review_package_id: string | null;
  replacement_part_number_draft_id: string | null;
  detected_part_number: string | null;
  corrected_part_number: string | null;
  form_state: DrawingRevisionFffState;
  fit_state: DrawingRevisionFffState;
  function_state: DrawingRevisionFffState;
  reason_category: string;
  note: string | null;
  assessed_by: string | null;
  assessed_at: string;
};

type DrawingRevisionReviewListRow = DrawingRevisionFffAssessmentRow & {
  drawing_number: string | null;
  replacement_reserved_part_number: string | null;
};

const DEFAULT_COMPANY_ID = "company-jenfu";
const RECYCLE_COOLING_DAYS = 7;
const unfinishedDraftStatuses: PartNumberDraftStatus[] = ["draft", "pending_review", "needs_reconfirmation"];

export class PdmChangeControlError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message = code, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PdmChangeControlError";
    this.code = code;
    this.details = details;
  }
}

function normalizeCompanyId(actor: PdmChangeControlActorContext) {
  return actor.companyId?.trim() || DEFAULT_COMPANY_ID;
}

function normalizeRequiredText(value: string, code: string) {
  const normalized = value.trim();
  if (!normalized) throw new PdmChangeControlError(code);
  return normalized;
}

function mapDraft(row: PartNumberDraftRow): PartNumberDraftRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    reservedPartNumber: row.reserved_part_number,
    draftType: row.draft_type,
    itemType: row.item_type,
    status: row.status,
    sourcePartNumberId: row.source_part_number_id,
    sourceDrawingNumberId: row.source_drawing_number_id,
    sourceRevision: row.source_revision,
    useType: row.use_type,
    createdBy: row.created_by,
    departmentId: row.department_id,
    version: Number(row.version),
    voidedAt: row.voided_at,
    recycleAvailableAt: row.recycle_available_at,
    recycledAt: row.recycled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFffAssessment(row: DrawingRevisionFffAssessmentRow): DrawingRevisionFffAssessmentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    drawingNumberId: row.drawing_number_id,
    revision: row.revision,
    submissionId: row.submission_id,
    reviewPackageId: row.review_package_id,
    replacementPartNumberDraftId: row.replacement_part_number_draft_id,
    detectedPartNumber: row.detected_part_number,
    correctedPartNumber: row.corrected_part_number,
    formState: row.form_state,
    fitState: row.fit_state,
    functionState: row.function_state,
    reasonCategory: row.reason_category,
    note: row.note,
    assessedBy: row.assessed_by,
    assessedAt: row.assessed_at
  };
}

function countValue(row: CountRow | null) {
  return Number(row?.count ?? 0);
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value ?? 100), 1), 250);
}

function addDays(isoTimestamp: string, days: number) {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isPartNumberManager(actor: PdmChangeControlActorContext) {
  const roleCodes = new Set((actor.roleCodes ?? []).map((role) => role.trim()).filter(Boolean));
  return roleCodes.has("pdm_admin") || roleCodes.has("system_admin") || actor.role === "Admin";
}

function assertDraftEditableStatus(draft: PartNumberDraftRecord) {
  if (draft.status !== "draft" && draft.status !== "needs_reconfirmation") {
    throw new PdmChangeControlError("draft_not_editable", `Draft ${draft.id} is not editable`, { status: draft.status });
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function fffOutcome(states: DrawingRevisionFffState[]): DrawingRevisionFffOutcome {
  if (states.includes("confirmed_impact")) return "confirmed_impact";
  if (states.includes("suspected_impact")) return "suspected_impact";
  return "no_impact";
}

function itemKindForDraftItemType(itemType: PartNumberDraftItemType) {
  if (itemType === "self_made") return "manufactured";
  if (itemType === "purchased") return "purchased";
  return "custom";
}

function buildPartNumberDraftLifecyclePolicyFromDomain(input: {
  draftId: string;
  status: PartNumberDraftStatus;
  controlled: boolean;
  recycled: boolean;
  numberReused: boolean;
  canDelete: boolean;
  canRestore: boolean;
}): LifecycleActionPolicy {
  if (input.status === "voided") {
    const restoreBlock = getDeletedPartNumberDraftRestoreBlock(input);
    const restorable = !restoreBlock;
    return {
      entityType: "part_number_draft",
      entityId: input.draftId,
      visibleStage: "history",
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: input.controlled ? "controlled_history" : "uncontrolled_deleted",
      detailTags: [restorable ? "可還原" : "不可還原"],
      actions: {
        delete: blockedLifecycleAction("LIFE_DRAFT_ALREADY_DELETED", "此草稿已在已刪除資料中。"),
        restore: restoreBlock ?? { allowed: true },
        obsolete: { ...blockedLifecycleAction("LIFE_UNSUPPORTED_ENTITY", "草稿不使用申請作廢流程。"), requiresApproval: false }
      }
    };
  }

  const inReview = input.status === "pending_review";
  const formal = input.status === "released";
  const editableDraft = input.status === "draft" || input.status === "needs_reconfirmation";
  const detailTags: LifecycleDetailTag[] = [];
  if (input.status === "needs_reconfirmation") detailTags.push("待補");
  if (inReview) detailTags.push("需審核");
  if (formal) detailTags.push("已發行");

  return {
    entityType: "part_number_draft",
    entityId: input.draftId,
    visibleStage: formal ? "formal" : inReview ? "in_review" : "draft",
    stageLabel: formal ? "正式" : inReview ? "審核中" : "草稿",
    uiSurface: "work_list",
    traceabilityClass: "working",
    detailTags,
    actions: {
      delete:
        editableDraft && input.canDelete && !input.controlled
          ? { allowed: true }
          : blockedLifecycleAction(
              input.controlled ? "LIFE_DRAFT_CONTROLLED_BOUNDARY" : "LIFE_DRAFT_NOT_DELETABLE",
              "此草稿目前不能直接刪除。"
            ),
      restore: blockedLifecycleAction("LIFE_DRAFT_NOT_DELETED", "此草稿尚未刪除，不需要還原。"),
      obsolete: { ...blockedLifecycleAction("LIFE_UNSUPPORTED_ENTITY", "草稿不使用申請作廢流程。"), requiresApproval: false }
    }
  };
}

function getDeletedPartNumberDraftRestoreBlock(input: {
  controlled: boolean;
  recycled: boolean;
  numberReused: boolean;
  canRestore: boolean;
}) {
  if (!input.canRestore) return blockedLifecycleAction("LIFE_PERMISSION_DENIED", "沒有還原此草稿的權限。");
  if (input.controlled) return blockedLifecycleAction("LIFE_DRAFT_CONTROLLED_BOUNDARY", "此草稿已跨受控邊界，不能從已刪除資料還原。");
  if (input.recycled) return blockedLifecycleAction("LIFE_DRAFT_ALREADY_RECYCLED", "此草稿號已被回收重用，不能還原。");
  if (input.numberReused) return blockedLifecycleAction("LIFE_DRAFT_NUMBER_REUSED", "此草稿號已被重新使用，不能還原。");
  return null;
}

function blockedLifecycleAction(reasonCode: string, message: string) {
  return { allowed: false, reasonCode, message };
}

export class PdmChangeControlDomainService {
  private readonly client: PdmChangeControlDatabaseClient;
  private readonly clock: () => string;
  private readonly idFactory: () => string;

  constructor(
    client: PdmChangeControlDatabaseClient,
    clock: () => string = () => new Date().toISOString(),
    idFactory: () => string = () => globalThis.crypto.randomUUID()
  ) {
    this.client = client;
    this.clock = clock;
    this.idFactory = idFactory;
  }

  async listPartNumberDrafts(input: ListPartNumberDraftsInput): Promise<PartNumberDraftListItem[]> {
    const companyId = normalizeCompanyId(input.actor);
    const filters = ["pnd.company_id = :companyId"];
    const params: Record<string, unknown> = {
      companyId,
      limit: normalizeLimit(input.limit)
    };

    if (input.status && input.status !== "all") {
      filters.push("pnd.status = :status");
      params.status = input.status;
    }
    if (input.draftType && input.draftType !== "all") {
      filters.push("pnd.draft_type = :draftType");
      params.draftType = input.draftType;
    }
    if (!input.includeRecycled) {
      filters.push("pnd.recycled_at IS NULL");
    }

    const rows = await this.client.query<PartNumberDraftListRow>(
      `
      SELECT
        pnd.*,
        sp.part_number AS source_part_number,
        sd.drawing_number AS source_drawing_number,
        u.display_name AS creator_name
      FROM part_number_drafts pnd
      LEFT JOIN part_numbers sp ON sp.id = pnd.source_part_number_id AND sp.company_id = pnd.company_id
      LEFT JOIN drawing_numbers sd ON sd.id = pnd.source_drawing_number_id AND sd.company_id = pnd.company_id
      LEFT JOIN users u ON u.id = pnd.created_by
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE pnd.status
          WHEN 'needs_reconfirmation' THEN 0
          WHEN 'pending_review' THEN 1
          WHEN 'draft' THEN 2
          WHEN 'voided' THEN 3
          ELSE 4
        END,
        pnd.updated_at DESC,
        pnd.created_at DESC
      LIMIT :limit
      `,
      params
    );

    const items: PartNumberDraftListItem[] = [];
    for (const row of rows) {
      const draft = mapDraft(row);
      const boundary = await this.getPartNumberControlBoundary(draft.id, input.actor);
      const sameSourceUnfinishedDraftIds = await this.listSameSourceUnfinishedDraftIds(companyId, draft);
      const warnings: PartNumberDraftWarningCode[] = [];
      if (sameSourceUnfinishedDraftIds.length > 0) warnings.push("same_source_unfinished_draft");
      if (draft.status === "needs_reconfirmation") warnings.push("needs_reconfirmation");
      if (draft.status === "voided" && draft.recycleAvailableAt && !draft.recycledAt && new Date(draft.recycleAvailableAt) <= new Date(this.clock())) {
        warnings.push("recycle_overdue");
      }
      items.push({
        ...draft,
        sourcePartNumber: row.source_part_number,
        sourceDrawingNumber: row.source_drawing_number,
        creatorName: row.creator_name,
        sameSourceUnfinishedDraftCount: sameSourceUnfinishedDraftIds.length,
        sameSourceUnfinishedDraftIds,
        controlled: boundary.controlled,
        controlBoundaryReasons: boundary.reasons,
        warnings
      });
    }
    return items;
  }

  async listDeletedPartNumberDrafts(input: ListPartNumberDraftsInput): Promise<DeletedPartNumberDraftListItem[]> {
    const drafts = await this.listPartNumberDrafts({ ...input, status: "voided", includeRecycled: false });
    return Promise.all(
      drafts.map(async (draft) => ({
        draft,
        policy: await this.buildPartNumberDraftPolicy(draft, input.actor)
      }))
    );
  }

  async reservePartNumberDraft(input: ReservePartNumberDraftInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const now = this.clock();
    const draftId = this.idFactory();
    const reservedPartNumber = normalizeRequiredText(input.reservedPartNumber, "reserved_part_number_required");
    await this.assertReservedNumberAvailable(companyId, reservedPartNumber);
    await this.client.execute(
      `
      INSERT INTO part_number_drafts (
        id, company_id, reserved_part_number, draft_type, item_type, status,
        source_part_number_id, source_drawing_number_id, source_revision, use_type,
        created_by, department_id, version, created_at, updated_at
      ) VALUES (
        :id, :companyId, :reservedPartNumber, :draftType, :itemType, 'draft',
        :sourcePartNumberId, :sourceDrawingNumberId, :sourceRevision, :useType,
        :createdBy, :departmentId, 1, :createdAt, :updatedAt
      )
      `,
      {
        id: draftId,
        companyId,
        reservedPartNumber,
        draftType: input.draftType,
        itemType: input.itemType,
        sourcePartNumberId: input.sourcePartNumberId ?? null,
        sourceDrawingNumberId: input.sourceDrawingNumberId ?? null,
        sourceRevision: input.sourceRevision?.trim() || null,
        useType: input.useType?.trim() || null,
        createdBy: input.actor.userId,
        departmentId: input.departmentId?.trim() || null,
        createdAt: now,
        updatedAt: now
      }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId,
      eventType: "draft_created",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: { reservedPartNumber, draftType: input.draftType, itemType: input.itemType }
    });
    return this.requireDraft(draftId, companyId);
  }

  async updatePartNumberDraft(input: UpdatePartNumberDraftInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const draft = await this.requireDraft(input.draftId, companyId);
    assertDraftEditableStatus(draft);
    if (draft.version !== input.expectedVersion) {
      throw new PdmChangeControlError("optimistic_lock_conflict", "Part-number draft was updated by another actor", {
        expectedVersion: input.expectedVersion,
        currentVersion: draft.version
      });
    }

    const nextItemType = input.itemType ?? draft.itemType;
    const nextSourcePartNumberId = input.sourcePartNumberId !== undefined ? input.sourcePartNumberId : draft.sourcePartNumberId;
    const nextSourceDrawingNumberId = input.sourceDrawingNumberId !== undefined ? input.sourceDrawingNumberId : draft.sourceDrawingNumberId;
    const nextSourceRevision = input.sourceRevision !== undefined ? input.sourceRevision?.trim() || null : draft.sourceRevision;
    const nextUseType = input.useType !== undefined ? input.useType?.trim() || null : draft.useType;
    const now = this.clock();
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET item_type = :itemType,
          source_part_number_id = :sourcePartNumberId,
          source_drawing_number_id = :sourceDrawingNumberId,
          source_revision = :sourceRevision,
          use_type = :useType,
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      {
        draftId: input.draftId,
        companyId,
        itemType: nextItemType,
        sourcePartNumberId: nextSourcePartNumberId,
        sourceDrawingNumberId: nextSourceDrawingNumberId,
        sourceRevision: nextSourceRevision,
        useType: nextUseType,
        updatedAt: now
      }
    );

    if (nextItemType !== draft.itemType) {
      await this.insertPartNumberEvent({
        companyId,
        draftId: draft.id,
        eventType: "item_type_changed",
        actorUserId: input.actor.userId,
        occurredAt: now,
        metadata: { before: draft.itemType, after: nextItemType }
      });
    }
    if (nextSourcePartNumberId !== draft.sourcePartNumberId) {
      await this.insertPartNumberEvent({
        companyId,
        draftId: draft.id,
        eventType: "source_part_changed",
        actorUserId: input.actor.userId,
        occurredAt: now,
        metadata: { before: draft.sourcePartNumberId, after: nextSourcePartNumberId }
      });
    }
    return this.requireDraft(input.draftId, companyId);
  }

  async submitDrawingRevisionFffAssessment(input: SubmitDrawingRevisionFffAssessmentInput): Promise<SubmitDrawingRevisionFffAssessmentResult> {
    const companyId = normalizeCompanyId(input.actor);
    await this.requireDrawing(input.drawingNumberId, companyId);
    const revision = normalizeRequiredText(input.revision, "revision_required");
    const reasonCategory = normalizeRequiredText(input.reasonCategory, "reason_category_required");
    const outcome = fffOutcome([input.formState, input.fitState, input.functionState]);
    const detectedPartNumber = input.detectedPartNumber?.trim() || null;
    const correctedPartNumber = input.correctedPartNumber?.trim() || null;
    const comparedPartNumber = correctedPartNumber || detectedPartNumber;
    let replacementDraft: PartNumberDraftRecord | null = null;

    if (outcome === "confirmed_impact") {
      const replacementReservedPartNumber = input.replacementReservedPartNumber?.trim() || null;
      if (!replacementReservedPartNumber) {
        throw new PdmChangeControlError("replacement_part_number_required");
      }
      if (!comparedPartNumber) {
        throw new PdmChangeControlError("drawing_part_number_read_required");
      }
      if (comparedPartNumber !== replacementReservedPartNumber) {
        throw new PdmChangeControlError("drawing_part_number_mismatch", "Drawing part number must match replacement part number", {
          expectedPartNumber: replacementReservedPartNumber,
          actualPartNumber: comparedPartNumber
        });
      }
      replacementDraft =
        (await this.findReusableDrawingRevisionReplacementDraft(companyId, {
          reservedPartNumber: replacementReservedPartNumber,
          drawingNumberId: input.drawingNumberId,
          revision
        })) ??
        (await this.reservePartNumberDraft({
          reservedPartNumber: replacementReservedPartNumber,
          draftType: "drawing_revision_generated",
          itemType: input.replacementItemType ?? "self_made",
          sourcePartNumberId: input.currentPartNumberId ?? null,
          sourceDrawingNumberId: input.drawingNumberId,
          sourceRevision: revision,
          actor: input.actor
        }));
    }

    const duplicate = await this.findDuplicateActiveFffAssessment(companyId, {
      drawingNumberId: input.drawingNumberId,
      revision,
      submissionId: input.submissionId?.trim() || null,
      reviewPackageId: input.reviewPackageId?.trim() || null,
      replacementPartNumberDraftId: replacementDraft?.id ?? null,
      detectedPartNumber,
      correctedPartNumber,
      formState: input.formState,
      fitState: input.fitState,
      functionState: input.functionState,
      reasonCategory,
      note: input.note?.trim() || null,
      assessedBy: input.actor.userId
    });
    if (duplicate) {
      return {
        outcome,
        assessment: mapFffAssessment(duplicate),
        replacementDraft
      };
    }

    const assessmentId = this.idFactory();
    const now = this.clock();
    await this.client.execute(
      `
      INSERT INTO drawing_revision_fff_assessments (
        id, company_id, drawing_number_id, revision, submission_id, review_package_id,
        replacement_part_number_draft_id, detected_part_number, corrected_part_number,
        form_state, fit_state, function_state, reason_category, note, assessed_by, assessed_at
      ) VALUES (
        :id, :companyId, :drawingNumberId, :revision, :submissionId, :reviewPackageId,
        :replacementPartNumberDraftId, :detectedPartNumber, :correctedPartNumber,
        :formState, :fitState, :functionState, :reasonCategory, :note, :assessedBy, :assessedAt
      )
      `,
      {
        id: assessmentId,
        companyId,
        drawingNumberId: input.drawingNumberId,
        revision,
        submissionId: input.submissionId?.trim() || null,
        reviewPackageId: input.reviewPackageId?.trim() || null,
        replacementPartNumberDraftId: replacementDraft?.id ?? null,
        detectedPartNumber,
        correctedPartNumber,
        formState: input.formState,
        fitState: input.fitState,
        functionState: input.functionState,
        reasonCategory,
        note: input.note?.trim() || null,
        assessedBy: input.actor.userId,
        assessedAt: now
      }
    );

    return {
      outcome,
      assessment: await this.requireFffAssessment(assessmentId, companyId),
      replacementDraft
    };
  }

  async applyDrawingRevisionReviewAction(input: ApplyDrawingRevisionReviewActionInput): Promise<ApplyDrawingRevisionReviewActionResult> {
    return this.runReleaseTransaction(async (service) => service.applyDrawingRevisionReviewActionInTransaction(input));
  }

  async listPendingDrawingRevisionReviews(actor: PdmChangeControlActorContext): Promise<DrawingRevisionReviewListItem[]> {
    const companyId = normalizeCompanyId(actor);
    const rows = await this.client.query<DrawingRevisionReviewListRow>(
      `
      SELECT
        a.*,
        dn.drawing_number,
        pnd.reserved_part_number AS replacement_reserved_part_number
      FROM drawing_revision_fff_assessments a
      LEFT JOIN drawing_numbers dn ON dn.id = a.drawing_number_id
      LEFT JOIN part_number_drafts pnd ON pnd.id = a.replacement_part_number_draft_id
      WHERE a.company_id = :companyId
        AND NOT EXISTS (
          SELECT 1
          FROM review_confirmation_events rce
          WHERE rce.company_id = a.company_id
            AND rce.review_id = a.id
        )
      ORDER BY a.assessed_at DESC, a.id DESC
      LIMIT 100
      `,
      { companyId }
    );
    return rows.map((row) => {
      const assessment = mapFffAssessment(row);
      return {
        ...assessment,
        drawingNumber: row.drawing_number,
        replacementReservedPartNumber: row.replacement_reserved_part_number,
        outcome: fffOutcome([assessment.formState, assessment.fitState, assessment.functionState])
      };
    });
  }

  private async applyDrawingRevisionReviewActionInTransaction(
    input: ApplyDrawingRevisionReviewActionInput
  ): Promise<ApplyDrawingRevisionReviewActionResult> {
    const companyId = normalizeCompanyId(input.actor);
    const assessment = await this.requireFffAssessment(input.assessmentId, companyId);
    const outcome = fffOutcome([assessment.formState, assessment.fitState, assessment.functionState]);
    this.assertReviewActionMatchesOutcome(input.action, outcome);

    let replacementDraft: PartNumberDraftRecord | null = null;
    let replacementPartNumberId: string | null = null;
    let bomReconfirmationFlagCount = 0;

    if (input.action === "approve_replacement_part_and_drawing_release") {
      if (!assessment.replacementPartNumberDraftId) {
        throw new PdmChangeControlError("replacement_draft_required");
      }
      replacementDraft = await this.requireDraft(assessment.replacementPartNumberDraftId, companyId);
      if (!replacementDraft.sourcePartNumberId) {
        throw new PdmChangeControlError("source_part_required_for_replacement_release");
      }
      const oldPart = await this.requireFormalPartById(companyId, replacementDraft.sourcePartNumberId);
      replacementPartNumberId = await this.createReleasedPartNumberFromDraft(companyId, replacementDraft, input.actor.userId);
      await this.client.execute(
        `
        UPDATE part_number_drafts
        SET status = 'released',
            version = version + 1,
            updated_at = :updatedAt
        WHERE id = :draftId AND company_id = :companyId
        `,
        { draftId: replacementDraft.id, companyId, updatedAt: this.clock() }
      );
      await this.client.execute(
        `
        INSERT INTO part_replacement_links (
          id, company_id, old_part_number_id, new_part_number_id, source_drawing_number_id,
          source_revision, reason_category, fff_summary_json, released_by, released_at
        ) VALUES (
          :id, :companyId, :oldPartNumberId, :newPartNumberId, :sourceDrawingNumberId,
          :sourceRevision, :reasonCategory, :fffSummaryJson, :releasedBy, :releasedAt
        )
        `,
        {
          id: this.idFactory(),
          companyId,
          oldPartNumberId: oldPart.id,
          newPartNumberId: replacementPartNumberId,
          sourceDrawingNumberId: assessment.drawingNumberId,
          sourceRevision: assessment.revision,
          reasonCategory: assessment.reasonCategory,
          fffSummaryJson: JSON.stringify({
            form: assessment.formState,
            fit: assessment.fitState,
            function: assessment.functionState
          }),
          releasedBy: input.actor.userId,
          releasedAt: this.clock()
        }
      );
      bomReconfirmationFlagCount = await this.createBomReconfirmationFlags(companyId, oldPart, replacementPartNumberId);
      replacementDraft = await this.requireDraft(replacementDraft.id, companyId);
    }

    await this.insertReviewConfirmationEvent({
      companyId,
      reviewId: assessment.id,
      action: input.action,
      reviewerUserId: input.actor.userId,
      result: input.result?.trim() || input.action,
      metadata: { outcome, replacementPartNumberId, bomReconfirmationFlagCount }
    });

    return {
      action: input.action,
      outcome,
      assessment,
      replacementDraft,
      replacementPartNumberId,
      bomReconfirmationFlagCount
    };
  }

  async getPartNumberControlBoundary(draftId: string, actor: PdmChangeControlActorContext): Promise<PartNumberControlBoundary> {
    const companyId = normalizeCompanyId(actor);
    const draft = await this.requireDraft(draftId, companyId);
    const reasons: PartNumberControlBoundaryReason[] = [];
    const formalPartId = await this.getFormalPartId(companyId, draft.reservedPartNumber);

    if (formalPartId) reasons.push("formal_part_exists");
    if (await this.hasBomReference(companyId, draft.reservedPartNumber)) reasons.push("referenced_by_bom");
    if (formalPartId && (await this.hasReplacementLinkReference(companyId, formalPartId))) reasons.push("referenced_by_replacement_link");
    if (await this.hasPdmDrawingUpload(companyId, draft)) reasons.push("drawing_uploaded_to_pdm");
    if (draft.status === "pending_review" || draft.status === "released" || (await this.hasReviewReference(companyId, draft.id))) {
      reasons.push("submitted_for_review");
    }

    return { draft, controlled: reasons.length > 0, reasons };
  }

  async assertPartNumberDraftIsRecyclable(draftId: string, actor: PdmChangeControlActorContext): Promise<PartNumberControlBoundary> {
    const boundary = await this.getPartNumberControlBoundary(draftId, actor);
    if (boundary.controlled) {
      throw new PdmChangeControlError("controlled_boundary_recycle_blocked", "Part-number draft has crossed the controlled boundary", {
        reasons: boundary.reasons
      });
    }
    return boundary;
  }

  async assertPartNumberDraftCanSubmit(draftId: string, actor: PdmChangeControlActorContext): Promise<PartNumberControlBoundary> {
    const boundary = await this.getPartNumberControlBoundary(draftId, actor);
    const { draft } = boundary;
    if (draft.status !== "draft") {
      throw new PdmChangeControlError("draft_not_submittable", `Draft ${draft.id} is not submittable`, { status: draft.status });
    }
    if (boundary.controlled) {
      throw new PdmChangeControlError("controlled_boundary_submit_blocked", "Part-number draft cannot submit after crossing boundary", {
        reasons: boundary.reasons
      });
    }
    if (draft.itemType === "self_made" && draft.draftType !== "new_part" && !draft.sourceDrawingNumberId) {
      throw new PdmChangeControlError("self_made_source_drawing_required");
    }
    return boundary;
  }

  async voidPartNumberDraft(input: DraftActionInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const boundary = await this.assertPartNumberDraftIsRecyclable(input.draftId, input.actor);
    assertDraftEditableStatus(boundary.draft);
    const now = this.clock();
    const recycleAvailableAt = addDays(now, RECYCLE_COOLING_DAYS);
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET status = 'voided',
          voided_at = :voidedAt,
          recycle_available_at = :recycleAvailableAt,
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      { draftId: input.draftId, companyId, voidedAt: now, recycleAvailableAt, updatedAt: now }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_voided",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: {}
    });
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_recycle_scheduled",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: { recycleAvailableAt }
    });
    return this.requireDraft(input.draftId, companyId);
  }

  async recyclePartNumberDraft(input: DraftActionInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const boundary = await this.assertPartNumberDraftIsRecyclable(input.draftId, input.actor);
    const { draft } = boundary;
    if (draft.status !== "voided") {
      throw new PdmChangeControlError("draft_not_voided", `Draft ${draft.id} is not voided`, { status: draft.status });
    }
    if (draft.recycledAt) {
      throw new PdmChangeControlError("draft_already_recycled");
    }
    if (draft.createdBy !== input.actor.userId && !isPartNumberManager(input.actor)) {
      throw new PdmChangeControlError("draft_recycle_forbidden");
    }

    const now = this.clock();
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET recycled_at = :recycledAt,
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      { draftId: input.draftId, companyId, recycledAt: now, updatedAt: now }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_recycled",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: { reservedPartNumber: draft.reservedPartNumber }
    });
    return this.requireDraft(input.draftId, companyId);
  }

  async restorePartNumberDraft(input: DraftActionInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const draft = await this.requireDraft(input.draftId, companyId);
    if (draft.status !== "voided") {
      throw new PdmChangeControlError("draft_not_deleted", `Draft ${draft.id} is not deleted`, { status: draft.status });
    }
    if (draft.recycledAt) {
      throw new PdmChangeControlError("draft_already_recycled");
    }
    if (draft.createdBy !== input.actor.userId && !isPartNumberManager(input.actor)) {
      throw new PdmChangeControlError("draft_restore_forbidden");
    }
    const boundary = await this.getPartNumberControlBoundary(input.draftId, input.actor);
    if (boundary.controlled) {
      throw new PdmChangeControlError("controlled_boundary_restore_blocked", "Part-number draft has crossed the controlled boundary", {
        reasons: boundary.reasons
      });
    }
    if (await this.isReservedNumberReused(companyId, draft)) {
      throw new PdmChangeControlError("draft_number_reused");
    }

    const now = this.clock();
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET status = 'draft',
          voided_at = NULL,
          recycle_available_at = NULL,
          recycled_at = NULL,
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      { draftId: input.draftId, companyId, updatedAt: now }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_reissued",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: { lifecycleAction: "restore", reservedPartNumber: draft.reservedPartNumber }
    });
    return this.requireDraft(input.draftId, companyId);
  }

  async getPartNumberDraftLifecyclePolicy(input: DraftActionInput): Promise<LifecycleActionPolicy> {
    const companyId = normalizeCompanyId(input.actor);
    const draft = await this.requireDraft(input.draftId, companyId);
    return this.buildPartNumberDraftPolicy(draft, input.actor);
  }

  async markSameSourceDraftsNeedReconfirmation(input: MarkSameSourceDraftsNeedReconfirmationInput): Promise<PartNumberDraftRecord[]> {
    const companyId = normalizeCompanyId(input.actor);
    const anchor = await this.requireDraft(input.draftId, companyId);
    const relatedIds = await this.listSameSourceUnfinishedDraftIds(companyId, anchor);
    const now = this.clock();
    const changed: PartNumberDraftRecord[] = [];
    for (const draftId of relatedIds) {
      await this.client.execute(
        `
        UPDATE part_number_drafts
        SET status = 'needs_reconfirmation',
            version = version + 1,
            updated_at = :updatedAt
        WHERE id = :draftId
          AND company_id = :companyId
          AND status IN ('draft', 'pending_review')
        `,
        { draftId, companyId, updatedAt: now }
      );
      await this.insertPartNumberEvent({
        companyId,
        draftId,
        eventType: "draft_reconfirmation_required",
        actorUserId: input.actor.userId,
        occurredAt: now,
        metadata: { anchorDraftId: anchor.id, sourcePartNumberId: anchor.sourcePartNumberId, sourceDrawingNumberId: anchor.sourceDrawingNumberId }
      });
      changed.push(await this.requireDraft(draftId, companyId));
    }
    return changed;
  }

  async reconfirmPartNumberDraft(input: DraftActionInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    const draft = await this.requireDraft(input.draftId, companyId);
    if (draft.status !== "needs_reconfirmation") {
      throw new PdmChangeControlError("draft_not_needs_reconfirmation", `Draft ${draft.id} does not need reconfirmation`, { status: draft.status });
    }
    const now = this.clock();
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET status = 'draft',
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      { draftId: input.draftId, companyId, updatedAt: now }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_reconfirmed",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: {}
    });
    return this.requireDraft(input.draftId, companyId);
  }

  async submitPartNumberDraft(input: DraftActionInput): Promise<PartNumberDraftRecord> {
    const companyId = normalizeCompanyId(input.actor);
    await this.assertPartNumberDraftCanSubmit(input.draftId, input.actor);
    const now = this.clock();
    await this.client.execute(
      `
      UPDATE part_number_drafts
      SET status = 'pending_review',
          version = version + 1,
          updated_at = :updatedAt
      WHERE id = :draftId AND company_id = :companyId
      `,
      { draftId: input.draftId, companyId, updatedAt: now }
    );
    await this.insertPartNumberEvent({
      companyId,
      draftId: input.draftId,
      eventType: "draft_submitted",
      actorUserId: input.actor.userId,
      occurredAt: now,
      metadata: {}
    });
    return this.requireDraft(input.draftId, companyId);
  }

  private async assertReservedNumberAvailable(companyId: string, reservedPartNumber: string) {
    const formal = await this.getFormalPartId(companyId, reservedPartNumber);
    if (formal) throw new PdmChangeControlError("reserved_number_already_formal_part");
    const activeDraft = await this.client.queryOne<{ id: string }>(
      `
      SELECT id
      FROM part_number_drafts
      WHERE company_id = :companyId
        AND reserved_part_number = :reservedPartNumber
        AND status IN ('draft', 'pending_review', 'released', 'needs_reconfirmation')
      LIMIT 1
      `,
      { companyId, reservedPartNumber }
    );
    if (activeDraft) throw new PdmChangeControlError("reserved_number_already_active_draft", undefined, { draftId: activeDraft.id });
  }

  private async requireDraft(draftId: string, companyId: string) {
    const row = await this.client.queryOne<PartNumberDraftRow>(
      "SELECT * FROM part_number_drafts WHERE id = :draftId AND company_id = :companyId",
      { draftId, companyId }
    );
    if (!row) throw new PdmChangeControlError("part_number_draft_not_found", `Part-number draft not found: ${draftId}`);
    return mapDraft(row);
  }

  private async getFormalPartId(companyId: string, partNumber: string) {
    const row = await this.client.queryOne<{ id: string }>(
      "SELECT id FROM part_numbers WHERE company_id = :companyId AND part_number = :partNumber LIMIT 1",
      { companyId, partNumber }
    );
    return row?.id ?? null;
  }

  private async findReusableDrawingRevisionReplacementDraft(
    companyId: string,
    input: { reservedPartNumber: string; drawingNumberId: string; revision: string }
  ) {
    const row = await this.client.queryOne<PartNumberDraftRow>(
      `
      SELECT *
      FROM part_number_drafts
      WHERE company_id = :companyId
        AND reserved_part_number = :reservedPartNumber
        AND draft_type = 'drawing_revision_generated'
        AND source_drawing_number_id = :drawingNumberId
        AND COALESCE(source_revision, '') = :revision
        AND status IN ('draft', 'pending_review', 'released', 'needs_reconfirmation')
        AND recycled_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
      {
        companyId,
        reservedPartNumber: input.reservedPartNumber,
        drawingNumberId: input.drawingNumberId,
        revision: input.revision
      }
    );
    return row ? mapDraft(row) : null;
  }

  private async findDuplicateActiveFffAssessment(
    companyId: string,
    input: {
      drawingNumberId: string;
      revision: string;
      submissionId: string | null;
      reviewPackageId: string | null;
      replacementPartNumberDraftId: string | null;
      detectedPartNumber: string | null;
      correctedPartNumber: string | null;
      formState: DrawingRevisionFffState;
      fitState: DrawingRevisionFffState;
      functionState: DrawingRevisionFffState;
      reasonCategory: string;
      note: string | null;
      assessedBy: string;
    }
  ) {
    return this.client.queryOne<DrawingRevisionFffAssessmentRow>(
      `
      SELECT *
      FROM drawing_revision_fff_assessments a
      WHERE a.company_id = :companyId
        AND a.drawing_number_id = :drawingNumberId
        AND a.revision = :revision
        AND COALESCE(a.submission_id, '') = :submissionId
        AND COALESCE(a.review_package_id, '') = :reviewPackageId
        AND COALESCE(a.replacement_part_number_draft_id, '') = :replacementPartNumberDraftId
        AND COALESCE(a.detected_part_number, '') = :detectedPartNumber
        AND COALESCE(a.corrected_part_number, '') = :correctedPartNumber
        AND a.form_state = :formState
        AND a.fit_state = :fitState
        AND a.function_state = :functionState
        AND a.reason_category = :reasonCategory
        AND COALESCE(a.note, '') = :note
        AND a.assessed_by = :assessedBy
        AND NOT EXISTS (
          SELECT 1
          FROM review_confirmation_events rce
          WHERE rce.company_id = a.company_id
            AND rce.review_id = a.id
        )
      ORDER BY a.assessed_at DESC, a.id DESC
      LIMIT 1
      `,
      {
        companyId,
        drawingNumberId: input.drawingNumberId,
        revision: input.revision,
        submissionId: input.submissionId ?? "",
        reviewPackageId: input.reviewPackageId ?? "",
        replacementPartNumberDraftId: input.replacementPartNumberDraftId ?? "",
        detectedPartNumber: input.detectedPartNumber ?? "",
        correctedPartNumber: input.correctedPartNumber ?? "",
        formState: input.formState,
        fitState: input.fitState,
        functionState: input.functionState,
        reasonCategory: input.reasonCategory,
        note: input.note ?? "",
        assessedBy: input.assessedBy
      }
    );
  }

  private async buildPartNumberDraftPolicy(draft: PartNumberDraftRecord | PartNumberDraftListItem, actor: PdmChangeControlActorContext) {
    const boundary = "controlled" in draft && "controlBoundaryReasons" in draft
      ? { controlled: draft.controlled, reasons: draft.controlBoundaryReasons }
      : await this.getPartNumberControlBoundary(draft.id, actor);
    const canManage = draft.createdBy === actor.userId || isPartNumberManager(actor);
    const numberReused = await this.isReservedNumberReused(normalizeCompanyId(actor), draft);
    return buildPartNumberDraftLifecyclePolicyFromDomain({
      draftId: draft.id,
      status: draft.status,
      controlled: boundary.controlled,
      recycled: Boolean(draft.recycledAt),
      numberReused,
      canDelete: canManage,
      canRestore: canManage
    });
  }

  private async isReservedNumberReused(companyId: string, draft: Pick<PartNumberDraftRecord, "id" | "reservedPartNumber">) {
    if (await this.getFormalPartId(companyId, draft.reservedPartNumber)) return true;
    const activeDraft = await this.client.queryOne<{ id: string }>(
      `
      SELECT id
      FROM part_number_drafts
      WHERE company_id = :companyId
        AND id <> :draftId
        AND reserved_part_number = :reservedPartNumber
        AND status IN ('draft', 'pending_review', 'released', 'needs_reconfirmation')
        AND recycled_at IS NULL
      LIMIT 1
      `,
      { companyId, draftId: draft.id, reservedPartNumber: draft.reservedPartNumber }
    );
    return Boolean(activeDraft);
  }

  private async requireDrawing(drawingNumberId: string, companyId: string) {
    const row = await this.client.queryOne<IdRow>(
      "SELECT id FROM drawing_numbers WHERE id = :drawingNumberId AND company_id = :companyId LIMIT 1",
      { drawingNumberId, companyId }
    );
    if (!row) throw new PdmChangeControlError("drawing_number_not_found", `Drawing number not found: ${drawingNumberId}`);
    return row;
  }

  private async requireFffAssessment(assessmentId: string, companyId: string) {
    const row = await this.client.queryOne<DrawingRevisionFffAssessmentRow>(
      "SELECT * FROM drawing_revision_fff_assessments WHERE id = :assessmentId AND company_id = :companyId",
      { assessmentId, companyId }
    );
    if (!row) throw new PdmChangeControlError("fff_assessment_not_found", `FFF assessment not found: ${assessmentId}`);
    return mapFffAssessment(row);
  }

  private assertReviewActionMatchesOutcome(action: DrawingRevisionReviewAction, outcome: DrawingRevisionFffOutcome) {
    if (outcome === "no_impact" && action !== "confirm_bom_no_revision") {
      throw new PdmChangeControlError("review_action_mismatch", "No-impact FFF requires BOM no-revision confirmation", { outcome, action });
    }
    if (outcome === "suspected_impact" && action !== "confirm_original_part_reuse" && action !== "return_for_replacement_part") {
      throw new PdmChangeControlError("review_action_mismatch", "Suspected-impact FFF requires reuse confirmation or return", { outcome, action });
    }
    if (outcome === "confirmed_impact" && action !== "approve_replacement_part_and_drawing_release") {
      throw new PdmChangeControlError("review_action_mismatch", "Confirmed-impact FFF requires replacement release approval", { outcome, action });
    }
  }

  private async createReleasedPartNumberFromDraft(companyId: string, draft: PartNumberDraftRecord, actorUserId: string) {
    const partNumber = draft.reservedPartNumber.trim().toUpperCase();
    const identity = parseCompactV2PartNumber(partNumber);
    if (!identity) {
      throw new PdmChangeControlError("replacement_part_number_format_invalid", "Replacement release requires a compact v2 part number.");
    }
    const existing = await this.getFormalPartId(companyId, partNumber);
    if (existing) throw new PdmChangeControlError("replacement_part_already_released", undefined, { partNumberId: existing });
    const now = this.clock();
    const existingRoot = await this.client.queryOne<{ id: string }>(
      "SELECT id FROM part_roots WHERE company_id = :companyId AND root_code = :rootCode LIMIT 1",
      { companyId, rootCode: identity.rootCode }
    );
    const rootId = existingRoot?.id ?? this.idFactory();
    const partNumberId = this.idFactory();
    if (!existingRoot) {
      await this.client.execute(
        `
        INSERT INTO part_roots (
          id, company_id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (
          :id, :companyId, :rootCode, :coreName, :itemKind, 'Release', 'Released', :ruleVersionId, :createdBy, :createdAt, :updatedAt
        )
        `,
        {
          id: rootId,
          companyId,
          rootCode: identity.rootCode,
          coreName: partNumber,
          itemKind: itemKindForDraftItemType(draft.itemType),
          ruleVersionId: NUMBERING_RULE_V2_ID,
          createdBy: actorUserId,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    await this.client.execute(
      `
      INSERT INTO part_numbers (
        id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (
        :id, :companyId, :partRootId, :partNumber, :sequenceNo, :sequenceCode, :partName,
        :itemKind, 0, 'Release', 'Released', :ruleVersionId, :createdBy, :createdAt, :updatedAt
      )
      `,
      {
        id: partNumberId,
        companyId,
        partRootId: rootId,
        partNumber,
        sequenceNo: Number(identity.sequenceCode),
        sequenceCode: identity.sequenceCode,
        partName: partNumber,
        itemKind: itemKindForDraftItemType(draft.itemType),
        ruleVersionId: NUMBERING_RULE_V2_ID,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now
      }
    );
    return partNumberId;
  }

  private async requireFormalPartById(companyId: string, partNumberId: string) {
    const row = await this.client.queryOne<PartNumberIdentityRow>(
      "SELECT id, part_number FROM part_numbers WHERE id = :partNumberId AND company_id = :companyId LIMIT 1",
      { partNumberId, companyId }
    );
    if (!row) throw new PdmChangeControlError("source_part_not_found", `Source part not found: ${partNumberId}`);
    return row;
  }

  private async createBomReconfirmationFlags(companyId: string, oldPart: PartNumberIdentityRow, newPartNumberId: string) {
    const rows = await this.client.query<BomDraftReferenceRow>(
      `
      SELECT DISTINCT bd.id AS bom_draft_id
      FROM bom_drafts bd
      JOIN bom_lines_tree blt ON blt.bom_draft_id = bd.id
      JOIN items i ON i.id = bd.parent_item_id
      WHERE i.company_id = :companyId
        AND bd.status IN ('Draft', 'PendingReview', 'Rejected')
        AND blt.part_number = :oldPartNumber
        AND NOT EXISTS (
          SELECT 1
          FROM bom_reconfirmation_flags brf
          WHERE brf.company_id = :companyId
            AND brf.bom_draft_id = bd.id
            AND brf.old_part_number_id = :oldPartNumberId
            AND brf.new_part_number_id = :newPartNumberId
            AND brf.resolved_at IS NULL
        )
      `,
      { companyId, oldPartNumber: oldPart.part_number, oldPartNumberId: oldPart.id, newPartNumberId }
    );
    const now = this.clock();
    for (const row of rows) {
      await this.client.execute(
        `
        INSERT INTO bom_reconfirmation_flags (
          id, company_id, bom_draft_id, old_part_number_id, new_part_number_id, reason, created_at
        ) VALUES (
          :id, :companyId, :bomDraftId, :oldPartNumberId, :newPartNumberId, :reason, :createdAt
        )
        `,
        {
          id: this.idFactory(),
          companyId,
          bomDraftId: row.bom_draft_id,
          oldPartNumberId: oldPart.id,
          newPartNumberId,
          reason: "replacement_part_released",
          createdAt: now
        }
      );
    }
    return rows.length;
  }

  private async insertReviewConfirmationEvent(input: {
    companyId: string;
    reviewId: string;
    action: DrawingRevisionReviewAction;
    reviewerUserId: string;
    result: string;
    metadata: Record<string, unknown>;
  }) {
    await this.client.execute(
      `
      INSERT INTO review_confirmation_events (
        id, company_id, review_id, action, reviewer_user_id, result, metadata_json
      ) VALUES (
        :id, :companyId, :reviewId, :action, :reviewerUserId, :result, :metadataJson
      )
      `,
      {
        id: this.idFactory(),
        companyId: input.companyId,
        reviewId: input.reviewId,
        action: input.action,
        reviewerUserId: input.reviewerUserId,
        result: input.result,
        metadataJson: JSON.stringify(input.metadata)
      }
    );
  }

  private async runReleaseTransaction<T>(fn: (service: PdmChangeControlDomainService) => Promise<T>): Promise<T> {
    const transactional = this.client as PdmChangeControlDatabaseClient & {
      transaction?: (callback: (client: PdmChangeControlDatabaseClient) => Promise<T>) => Promise<T>;
    };
    if (this.client.kind === "postgres" && transactional.transaction) {
      return transactional.transaction((client) => fn(new PdmChangeControlDomainService(client, this.clock, this.idFactory)));
    }

    await this.client.execute("BEGIN");
    try {
      const result = await fn(this);
      await this.client.execute("COMMIT");
      return result;
    } catch (error) {
      await this.client.execute("ROLLBACK");
      throw error;
    }
  }

  private async hasBomReference(companyId: string, partNumber: string) {
    const releasedBom = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM bom_lines bl
      JOIN bom_headers bh ON bh.id = bl.bom_header_id
      JOIN items i ON i.id = bh.parent_item_id
      WHERE i.company_id = :companyId
        AND bl.child_part_number = :partNumber
      `,
      { companyId, partNumber }
    );
    if (countValue(releasedBom) > 0) return true;

    const draftBom = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM bom_lines_tree blt
      JOIN bom_drafts bd ON bd.id = blt.bom_draft_id
      JOIN items i ON i.id = bd.parent_item_id
      WHERE i.company_id = :companyId
        AND blt.part_number = :partNumber
      `,
      { companyId, partNumber }
    );
    return countValue(draftBom) > 0;
  }

  private async hasReplacementLinkReference(companyId: string, partNumberId: string) {
    const row = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM part_replacement_links
      WHERE company_id = :companyId
        AND (old_part_number_id = :partNumberId OR new_part_number_id = :partNumberId)
      `,
      { companyId, partNumberId }
    );
    return countValue(row) > 0;
  }

  private async hasPdmDrawingUpload(companyId: string, draft: PartNumberDraftRecord) {
    const draftAsset = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM file_assets
      WHERE linked_entity_type = 'part_number_draft'
        AND linked_entity_id = :draftId
        AND deleted_at IS NULL
      `,
      { draftId: draft.id }
    );
    if (countValue(draftAsset) > 0) return true;

    if (!draft.sourceDrawingNumberId) return false;
    const drawingAsset = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM file_assets fa
      JOIN drawing_numbers dn ON dn.id = fa.linked_entity_id
      WHERE fa.linked_entity_type = 'drawing_number'
        AND fa.linked_entity_id = :drawingNumberId
        AND fa.deleted_at IS NULL
        AND dn.company_id = :companyId
      `,
      { companyId, drawingNumberId: draft.sourceDrawingNumberId }
    );
    return countValue(drawingAsset) > 0;
  }

  private async hasReviewReference(companyId: string, draftId: string) {
    const row = await this.client.queryOne<CountRow>(
      `
      SELECT COUNT(*) AS count
      FROM approval_requests
      WHERE company_id = :companyId
        AND entity_type = 'part_number_draft'
        AND entity_id = :draftId
        AND request_status IN ('pending', 'approved', 'needs_info')
      `,
      { companyId, draftId }
    );
    return countValue(row) > 0;
  }

  private async listSameSourceUnfinishedDraftIds(companyId: string, draft: PartNumberDraftRecord) {
    const ids: string[] = [];
    if (draft.sourcePartNumberId) {
      const rows = await this.client.query<IdRow>(
        `
        SELECT id
        FROM part_number_drafts
        WHERE company_id = :companyId
          AND id <> :draftId
          AND source_part_number_id = :sourcePartNumberId
          AND status IN ('draft', 'pending_review', 'needs_reconfirmation')
          AND recycled_at IS NULL
        ORDER BY updated_at DESC
        `,
        { companyId, draftId: draft.id, sourcePartNumberId: draft.sourcePartNumberId }
      );
      ids.push(...rows.map((row) => row.id));
    }
    if (draft.sourceDrawingNumberId) {
      const rows = await this.client.query<IdRow>(
        `
        SELECT id
        FROM part_number_drafts
        WHERE company_id = :companyId
          AND id <> :draftId
          AND source_drawing_number_id = :sourceDrawingNumberId
          AND status IN ('draft', 'pending_review', 'needs_reconfirmation')
          AND recycled_at IS NULL
        ORDER BY updated_at DESC
        `,
        { companyId, draftId: draft.id, sourceDrawingNumberId: draft.sourceDrawingNumberId }
      );
      ids.push(...rows.map((row) => row.id));
    }
    return uniqueStrings(ids);
  }

  private async insertPartNumberEvent(input: {
    companyId: string;
    draftId: string;
    eventType: string;
    actorUserId: string | null;
    occurredAt: string;
    metadata: Record<string, unknown>;
  }) {
    await this.client.execute(
      `
      INSERT INTO part_number_events (
        id, company_id, part_number_draft_id, event_type, actor_user_id, occurred_at, metadata_json
      ) VALUES (
        :id, :companyId, :draftId, :eventType, :actorUserId, :occurredAt, :metadataJson
      )
      `,
      {
        id: this.idFactory(),
        companyId: input.companyId,
        draftId: input.draftId,
        eventType: input.eventType,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
        metadataJson: JSON.stringify(input.metadata)
      }
    );
  }
}
