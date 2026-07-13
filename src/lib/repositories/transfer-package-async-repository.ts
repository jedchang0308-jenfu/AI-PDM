import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type TransferPackageCaseType = "development_case" | "design_change_case";
export type TransferPackageStatus = "Draft" | "Cancelled";
export type TransferPackageEntityType = "drawing_number" | "part_number";
export type TransferPackageSourceReferenceStatus = "provided" | "not_available";

export type TransferPackageActor = {
  userId: string;
  companyId: string;
  role: string;
};

export type ResolvedTransferPackageEntity = {
  entityType: TransferPackageEntityType;
  entityId: string;
  entityCode: string;
  displayLabel: string;
  rootCode: string | null;
  recordStatus: string | null;
};

export type TransferPackageItem = ResolvedTransferPackageEntity & {
  id: string;
  addedBy: string;
  createdAt: string;
};

export type TransferPackageEvent = {
  id: string;
  eventType: "DraftCreated" | "HeaderUpdated" | "ScopeItemAdded" | "ScopeItemRemoved" | "PackageCancelled";
  actorId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type TransferPackageRecord = {
  id: string;
  companyId: string;
  packageCode: string;
  title: string;
  caseType: TransferPackageCaseType;
  caseReason: string;
  sourceReferenceStatus: TransferPackageSourceReferenceStatus;
  sourceReference: string | null;
  sourceReferenceReason: string | null;
  status: TransferPackageStatus;
  ownerId: string;
  createdBy: string;
  rowVersion: number;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: TransferPackageItem[];
  events: TransferPackageEvent[];
};

type PackageRow = {
  id: string;
  company_id: string;
  package_code: string;
  title: string;
  case_type: TransferPackageCaseType;
  case_reason: string;
  source_reference_status: TransferPackageSourceReferenceStatus;
  source_reference: string | null;
  source_reference_reason: string | null;
  package_status: TransferPackageStatus;
  owner_id: string;
  created_by: string;
  row_version: number;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  entity_type: TransferPackageEntityType;
  entity_id: string;
  entity_code: string;
  display_label: string;
  root_code: string | null;
  record_status: string | null;
  added_by: string;
  created_at: string;
};

type EventRow = {
  id: string;
  event_type: TransferPackageEvent["eventType"];
  actor_id: string;
  detail_json: string | Record<string, unknown>;
  created_at: string;
};

export class TransferPackageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

function parseJson(value: string | Record<string, unknown>): Record<string, unknown> {
  return typeof value === "string" ? (JSON.parse(value) as Record<string, unknown>) : value;
}

function mapItem(row: ItemRow): TransferPackageItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityCode: row.entity_code,
    displayLabel: row.display_label,
    rootCode: row.root_code,
    recordStatus: row.record_status,
    addedBy: row.added_by,
    createdAt: row.created_at
  };
}

function mapEvent(row: EventRow): TransferPackageEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    detail: parseJson(row.detail_json),
    createdAt: row.created_at
  };
}

function canManagePackage(row: PackageRow, actor: TransferPackageActor) {
  return actor.role === "R&D Manager" || actor.role === "Admin" || row.owner_id === actor.userId;
}

function assertEditable(row: PackageRow, actor: TransferPackageActor) {
  if (!canManagePackage(row, actor)) {
    throw new TransferPackageError("TRANSFER_PACKAGE_FORBIDDEN", "只有技轉包負責人或管理角色可以修改。", 403);
  }
  if (row.package_status !== "Draft") {
    throw new TransferPackageError("TRANSFER_PACKAGE_TERMINAL", "已取消的技轉包不可再修改。", 409);
  }
}

export class AsyncTransferPackageRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async resolveScopeEntity(
    companyId: string,
    entityType: TransferPackageEntityType,
    entityIdOrCode: string,
    client: AsyncDatabaseClient = this.client
  ): Promise<ResolvedTransferPackageEntity | null> {
    const value = entityIdOrCode.trim();
    if (!value) return null;
    if (entityType === "drawing_number") {
      const row = await client.queryOne<{
        entity_id: string;
        entity_code: string;
        display_label: string;
        root_code: string;
        record_status: string;
      }>(
        `
        SELECT d.id AS entity_id, d.drawing_number AS entity_code,
               COALESCE(NULLIF(r.core_name, ''), d.drawing_number) AS display_label,
               r.root_code, d.record_status
        FROM drawing_numbers d
        JOIN part_roots r ON r.id = d.part_root_id AND r.company_id = d.company_id
        WHERE d.company_id = :companyId
          AND (d.id = :value OR d.drawing_number = :value)
        LIMIT 1
        `,
        { companyId, value }
      );
      return row
        ? {
            entityType,
            entityId: row.entity_id,
            entityCode: row.entity_code,
            displayLabel: row.display_label,
            rootCode: row.root_code,
            recordStatus: row.record_status
          }
        : null;
    }

    const row = await client.queryOne<{
      entity_id: string;
      entity_code: string;
      display_label: string;
      root_code: string;
      record_status: string;
    }>(
      `
      SELECT p.id AS entity_id, p.part_number AS entity_code,
             COALESCE(NULLIF(p.part_name, ''), p.part_number) AS display_label,
             r.root_code, p.record_status
      FROM part_numbers p
      JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
      WHERE p.company_id = :companyId
        AND (p.id = :value OR p.part_number = :value)
      LIMIT 1
      `,
      { companyId, value }
    );
    return row
      ? {
          entityType,
          entityId: row.entity_id,
          entityCode: row.entity_code,
          displayLabel: row.display_label,
          rootCode: row.root_code,
          recordStatus: row.record_status
        }
      : null;
  }

  async findByIdempotency(companyId: string, actorId: string, idempotencyKey: string) {
    const row = await this.client.queryOne<{ id: string }>(
      `SELECT id FROM transfer_packages
       WHERE company_id = :companyId AND created_by = :actorId AND create_idempotency_key = :idempotencyKey`,
      { companyId, actorId, idempotencyKey }
    );
    return row ? this.getById(row.id, companyId) : null;
  }

  async createDraft(input: {
    actor: TransferPackageActor;
    idempotencyKey: string;
    title: string;
    caseType: TransferPackageCaseType;
    caseReason: string;
    sourceReferenceStatus: TransferPackageSourceReferenceStatus;
    sourceReference: string | null;
    sourceReferenceReason: string | null;
    sourceItem?: ResolvedTransferPackageEntity | null;
  }): Promise<TransferPackageRecord> {
    const existing = await this.findByIdempotency(input.actor.companyId, input.actor.userId, input.idempotencyKey);
    if (existing) return existing;

    let packageId = "";
    try {
      packageId = await this.client.transaction(async (client) => {
        const now = this.clock();
        const year = new Date(now).getUTCFullYear();
        const allocation = await client.queryOne<{ allocated_value: number }>(
          `
          INSERT INTO transfer_package_counters (company_id, counter_year, next_value, updated_at)
          VALUES (:companyId, :year, 2, :now)
          ON CONFLICT(company_id, counter_year) DO UPDATE SET
            next_value = transfer_package_counters.next_value + 1,
            updated_at = :now
          RETURNING next_value - 1 AS allocated_value
          `,
          { companyId: input.actor.companyId, year, now }
        );
        if (!allocation) throw new TransferPackageError("TRANSFER_PACKAGE_CODE_ALLOCATION_FAILED", "技轉包編號配置失敗。", 500);

        const id = this.idFactory();
        const packageCode = `TP-${year}-${String(Number(allocation.allocated_value)).padStart(4, "0")}`;
        await client.execute(
          `
          INSERT INTO transfer_packages (
            id, company_id, package_code, title, case_type, case_reason,
            source_reference_status, source_reference, source_reference_reason,
            package_status, owner_id, created_by, create_idempotency_key,
            row_version, created_at, updated_at
          ) VALUES (
            :id, :companyId, :packageCode, :title, :caseType, :caseReason,
            :sourceReferenceStatus, :sourceReference, :sourceReferenceReason,
            'Draft', :ownerId, :createdBy, :idempotencyKey,
            1, :now, :now
          )
          `,
          {
            id,
            companyId: input.actor.companyId,
            packageCode,
            title: input.title,
            caseType: input.caseType,
            caseReason: input.caseReason,
            sourceReferenceStatus: input.sourceReferenceStatus,
            sourceReference: input.sourceReference,
            sourceReferenceReason: input.sourceReferenceReason,
            ownerId: input.actor.userId,
            createdBy: input.actor.userId,
            idempotencyKey: input.idempotencyKey,
            now
          }
        );

        if (input.sourceItem) {
          await this.insertScopeItem(client, id, input.actor, input.sourceItem, now);
        }
        await this.appendEvent(client, id, input.actor, "DraftCreated", {
          packageCode,
          caseType: input.caseType,
          sourceItemId: input.sourceItem?.entityId ?? null
        }, now);
        return id;
      });
    } catch (error) {
      const raced = await this.findByIdempotency(input.actor.companyId, input.actor.userId, input.idempotencyKey);
      if (raced) return raced;
      throw error;
    }
    return this.getById(packageId, input.actor.companyId);
  }

  async getById(id: string, companyId: string, client: AsyncDatabaseClient = this.client): Promise<TransferPackageRecord> {
    const row = await this.getRow(id, companyId, client);
    if (!row) throw new TransferPackageError("TRANSFER_PACKAGE_NOT_FOUND", "找不到技轉包。", 404);
    const [items, events] = await Promise.all([
      client.query<ItemRow>(
        `SELECT id, entity_type, entity_id, entity_code, display_label, root_code, record_status, added_by, created_at
         FROM transfer_package_items
         WHERE company_id = :companyId AND package_id = :packageId
         ORDER BY created_at ASC, id ASC`,
        { companyId, packageId: id }
      ),
      client.query<EventRow>(
        `SELECT id, event_type, actor_id, detail_json, created_at
         FROM transfer_package_events
         WHERE company_id = :companyId AND package_id = :packageId
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        { companyId, packageId: id }
      )
    ]);
    return {
      id: row.id,
      companyId: row.company_id,
      packageCode: row.package_code,
      title: row.title,
      caseType: row.case_type,
      caseReason: row.case_reason,
      sourceReferenceStatus: row.source_reference_status,
      sourceReference: row.source_reference,
      sourceReferenceReason: row.source_reference_reason,
      status: row.package_status,
      ownerId: row.owner_id,
      createdBy: row.created_by,
      rowVersion: Number(row.row_version),
      cancelReason: row.cancel_reason,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: items.map(mapItem),
      events: events.map(mapEvent)
    };
  }

  async updateHeader(input: {
    packageId: string;
    actor: TransferPackageActor;
    expectedRowVersion: number;
    title: string;
    caseType: TransferPackageCaseType;
    caseReason: string;
    sourceReferenceStatus: TransferPackageSourceReferenceStatus;
    sourceReference: string | null;
    sourceReferenceReason: string | null;
  }) {
    await this.client.transaction(async (client) => {
      const row = await this.requireEditableRow(client, input.packageId, input.actor);
      if (Number(row.row_version) !== input.expectedRowVersion) {
        throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已被更新，請重新整理後再儲存。", 409);
      }
      const now = this.clock();
      const updated = await client.queryOne<{ id: string }>(
        `
        UPDATE transfer_packages SET
          title = :title,
          case_type = :caseType,
          case_reason = :caseReason,
          source_reference_status = :sourceReferenceStatus,
          source_reference = :sourceReference,
          source_reference_reason = :sourceReferenceReason,
          row_version = row_version + 1,
          updated_at = :now
        WHERE id = :packageId AND company_id = :companyId AND package_status = 'Draft' AND row_version = :expectedRowVersion
        RETURNING id
        `,
        {
          title: input.title,
          caseType: input.caseType,
          caseReason: input.caseReason,
          sourceReferenceStatus: input.sourceReferenceStatus,
          sourceReference: input.sourceReference,
          sourceReferenceReason: input.sourceReferenceReason,
          now,
          packageId: input.packageId,
          companyId: input.actor.companyId,
          expectedRowVersion: input.expectedRowVersion
        }
      );
      if (!updated) throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已被更新，請重新整理後再儲存。", 409);
      await this.appendEvent(client, input.packageId, input.actor, "HeaderUpdated", { fromRowVersion: input.expectedRowVersion }, now);
    });
    return this.getById(input.packageId, input.actor.companyId);
  }

  async addScopeItem(input: {
    packageId: string;
    actor: TransferPackageActor;
    expectedRowVersion: number;
    entity: ResolvedTransferPackageEntity;
  }) {
    await this.client.transaction(async (client) => {
      const row = await this.requireEditableRow(client, input.packageId, input.actor);
      if (Number(row.row_version) !== input.expectedRowVersion) {
        throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包範圍已變更，請重新整理後再試。", 409);
      }
      const now = this.clock();
      const inserted = await this.insertScopeItem(client, input.packageId, input.actor, input.entity, now);
      if (!inserted) return;
      const updated = await client.queryOne<{ id: string }>(
        `UPDATE transfer_packages SET row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId AND package_status = 'Draft' AND row_version = :expectedRowVersion
         RETURNING id`,
        {
          now,
          packageId: input.packageId,
          companyId: input.actor.companyId,
          expectedRowVersion: input.expectedRowVersion
        }
      );
      if (!updated) throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包範圍已變更，請重新整理後再試。", 409);
      await this.appendEvent(client, input.packageId, input.actor, "ScopeItemAdded", {
        entityType: input.entity.entityType,
        entityId: input.entity.entityId,
        entityCode: input.entity.entityCode
      }, now);
    });
    return this.getById(input.packageId, input.actor.companyId);
  }

  async removeScopeItem(input: {
    packageId: string;
    itemId: string;
    actor: TransferPackageActor;
    expectedRowVersion: number;
  }) {
    await this.client.transaction(async (client) => {
      const row = await this.requireEditableRow(client, input.packageId, input.actor);
      if (Number(row.row_version) !== input.expectedRowVersion) {
        throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包範圍已變更，請重新整理後再試。", 409);
      }
      const item = await client.queryOne<ItemRow>(
        `SELECT id, entity_type, entity_id, entity_code, display_label, root_code, record_status, added_by, created_at
         FROM transfer_package_items
         WHERE id = :itemId AND package_id = :packageId AND company_id = :companyId`,
        { itemId: input.itemId, packageId: input.packageId, companyId: input.actor.companyId }
      );
      if (!item) throw new TransferPackageError("TRANSFER_PACKAGE_ITEM_NOT_FOUND", "找不到要移除的範圍項目。", 404);
      await client.execute(
        `DELETE FROM transfer_package_items
         WHERE id = :itemId AND package_id = :packageId AND company_id = :companyId`,
        { itemId: input.itemId, packageId: input.packageId, companyId: input.actor.companyId }
      );
      const now = this.clock();
      const updated = await client.queryOne<{ id: string }>(
        `UPDATE transfer_packages SET row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId AND package_status = 'Draft' AND row_version = :expectedRowVersion
         RETURNING id`,
        {
          now,
          packageId: input.packageId,
          companyId: input.actor.companyId,
          expectedRowVersion: input.expectedRowVersion
        }
      );
      if (!updated) throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包範圍已變更，請重新整理後再試。", 409);
      await this.appendEvent(client, input.packageId, input.actor, "ScopeItemRemoved", {
        entityType: item.entity_type,
        entityId: item.entity_id,
        entityCode: item.entity_code
      }, now);
    });
    return this.getById(input.packageId, input.actor.companyId);
  }

  async cancel(input: {
    packageId: string;
    actor: TransferPackageActor;
    expectedRowVersion: number;
    reason: string;
  }) {
    await this.client.transaction(async (client) => {
      const row = await this.getRow(input.packageId, input.actor.companyId, client);
      if (!row) throw new TransferPackageError("TRANSFER_PACKAGE_NOT_FOUND", "找不到技轉包。", 404);
      if (!canManagePackage(row, input.actor)) {
        throw new TransferPackageError("TRANSFER_PACKAGE_FORBIDDEN", "只有技轉包負責人或管理角色可以取消。", 403);
      }
      if (row.package_status === "Cancelled") return;
      if (Number(row.row_version) !== input.expectedRowVersion) {
        throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已被更新，請重新整理後再取消。", 409);
      }
      const now = this.clock();
      const updated = await client.queryOne<{ id: string }>(
        `UPDATE transfer_packages SET
           package_status = 'Cancelled', cancel_reason = :reason,
           cancelled_by = :actorId, cancelled_at = :now,
           row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId AND package_status = 'Draft' AND row_version = :expectedRowVersion
         RETURNING id`,
        {
          reason: input.reason,
          actorId: input.actor.userId,
          now,
          packageId: input.packageId,
          companyId: input.actor.companyId,
          expectedRowVersion: input.expectedRowVersion
        }
      );
      if (!updated) throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已被更新，請重新整理後再取消。", 409);
      await this.appendEvent(client, input.packageId, input.actor, "PackageCancelled", { reason: input.reason }, now);
    });
    return this.getById(input.packageId, input.actor.companyId);
  }

  private async getRow(id: string, companyId: string, client: AsyncDatabaseClient) {
    return client.queryOne<PackageRow>(
      `SELECT id, company_id, package_code, title, case_type, case_reason,
              source_reference_status, source_reference, source_reference_reason,
              package_status, owner_id, created_by, row_version,
              cancel_reason, cancelled_by, cancelled_at, created_at, updated_at
       FROM transfer_packages
       WHERE id = :id AND company_id = :companyId`,
      { id, companyId }
    );
  }

  private async requireEditableRow(client: AsyncDatabaseClient, packageId: string, actor: TransferPackageActor) {
    const row = await this.getRow(packageId, actor.companyId, client);
    if (!row) throw new TransferPackageError("TRANSFER_PACKAGE_NOT_FOUND", "找不到技轉包。", 404);
    assertEditable(row, actor);
    return row;
  }

  private async insertScopeItem(
    client: AsyncDatabaseClient,
    packageId: string,
    actor: TransferPackageActor,
    entity: ResolvedTransferPackageEntity,
    now: string
  ) {
    return client.queryOne<{ id: string }>(
      `
      INSERT INTO transfer_package_items (
        id, company_id, package_id, entity_type, entity_id, entity_code,
        display_label, root_code, record_status, added_by, created_at
      ) VALUES (
        :id, :companyId, :packageId, :entityType, :entityId, :entityCode,
        :displayLabel, :rootCode, :recordStatus, :addedBy, :createdAt
      )
      ON CONFLICT(package_id, entity_type, entity_id) DO NOTHING
      RETURNING id
      `,
      {
        id: this.idFactory(),
        companyId: actor.companyId,
        packageId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        entityCode: entity.entityCode,
        displayLabel: entity.displayLabel,
        rootCode: entity.rootCode,
        recordStatus: entity.recordStatus,
        addedBy: actor.userId,
        createdAt: now
      }
    );
  }

  private async appendEvent(
    client: AsyncDatabaseClient,
    packageId: string,
    actor: TransferPackageActor,
    eventType: TransferPackageEvent["eventType"],
    detail: Record<string, unknown>,
    createdAt: string
  ) {
    await client.execute(
      `INSERT INTO transfer_package_events (
         id, company_id, package_id, event_type, actor_id, detail_json, created_at
       ) VALUES (:id, :companyId, :packageId, :eventType, :actorId, :detailJson, :createdAt)`,
      {
        id: this.idFactory(),
        companyId: actor.companyId,
        packageId,
        eventType,
        actorId: actor.userId,
        detailJson: JSON.stringify(detail),
        createdAt
      }
    );
  }
}
