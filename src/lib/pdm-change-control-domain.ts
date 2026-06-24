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

type CountRow = {
  count: number | string;
};

const DEFAULT_COMPANY_ID = "company-jenfu";
const RECYCLE_COOLING_DAYS = 7;

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

function countValue(row: CountRow | null) {
  return Number(row?.count ?? 0);
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
