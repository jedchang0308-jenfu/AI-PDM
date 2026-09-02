import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { DatabasePublicationEvidencePort } from "@/lib/publication-evidence";
import {
  AsyncNumberStateFlowRepository,
  canonicalNumberStateJson,
  numberingCandidateSnapshotFacts,
  type NumberingDraftWorkspaceRecord,
  type NumberingPublicationResult
} from "@/lib/repositories/number-state-flow-async-repository";
import {
  AsyncTransferPackageRepository,
  TransferPackageError,
  type TransferPackageActor,
  type TransferPackageRecord
} from "@/lib/repositories/transfer-package-async-repository";
import { AsyncBomWorkbenchRepository } from "@/lib/repositories/bom-workbench-async-repository";

export type TransferReadinessBlocker = {
  code: string;
  message: string;
  ownerRole: string;
  ownerModule: string;
  actionLabel: string;
  actionHref: string;
  workspaceId: string | null;
};

type TransferWorkspaceSnapshot = {
  workspaceId: string;
  workspaceRowVersion: number;
  factsHash: string;
  facts: ReturnType<typeof numberingCandidateSnapshotFacts>;
  lockedReservations: Array<{
    id: string;
    itemType: string;
    itemId: string;
    candidateCode: string;
    rowVersion: number;
  }>;
  evidence: {
    status: "ready" | "not_required";
    ruleVersion: string;
    references: Array<{
      evidenceId: string;
      draftDrawingId: string;
      generation: string;
      contentHash: string;
    }>;
  };
};

type TransferOfficialItemSnapshot = {
  itemId: string;
  entityType: "drawing_number" | "part_number";
  entityId: string;
  entityCode: string;
  recordStatus: string | null;
  masterUpdatedAt: string | null;
  masterContentHash: string;
  currentControlledVersionId: string | null;
  currentControlledVersion: string | null;
  currentControlledVersionStatus: string | null;
  currentControlledVersionAt: string | null;
};

export type TransferReadinessSnapshot = {
  snapshotVersion: "transfer-package-review-v1";
  packageId: string;
  companyId: string;
  packageRowVersion: number;
  authorityHash: string;
  authorityFacts: Record<string, unknown>;
  workspaceSnapshots: TransferWorkspaceSnapshot[];
  capturedAt: string;
};

export type TransferPackageReadiness = {
  packageId: string;
  packageStatus: TransferPackageRecord["status"];
  rowVersion: number;
  ready: boolean;
  stale: boolean;
  firstBlocker: TransferReadinessBlocker | null;
  blockers: TransferReadinessBlocker[];
  snapshotHash: string;
  snapshotVersion: "transfer-package-review-v1";
  snapshot: TransferReadinessSnapshot;
};

type ApprovalSnapshotRow = {
  snapshot_hash: string;
  snapshot_json: string | TransferReadinessSnapshot;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseJson<T>(value: string | T): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function blocker(input: Omit<TransferReadinessBlocker, "workspaceId"> & { workspaceId?: string | null }) {
  return { ...input, workspaceId: input.workspaceId ?? null };
}

function activeReservations(workspace: NumberingDraftWorkspaceRecord) {
  return workspace.reservations.filter((reservation) =>
    ["active", "review_locked", "approved_locked", "promoted"].includes(reservation.state)
  );
}

function candidateFacts(workspace: NumberingDraftWorkspaceRecord) {
  return activeReservations(workspace)
    .map((reservation) => ({
      id: reservation.id,
      itemType: reservation.itemType,
      itemId: reservation.itemId,
      candidateCode: reservation.candidateCode,
      rowVersion: reservation.rowVersion
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function authorityFacts(
  record: TransferPackageRecord,
  officialItems: TransferOfficialItemSnapshot[],
  workspaces: TransferWorkspaceSnapshot[]
) {
  return {
    package: {
      id: record.id,
      companyId: record.companyId,
      title: record.title,
      caseType: record.caseType,
      caseReason: record.caseReason,
      sourceReferenceStatus: record.sourceReferenceStatus,
      sourceReference: record.sourceReference,
      sourceReferenceReason: record.sourceReferenceReason,
      ownerId: record.ownerId
    },
    officialItems: [...officialItems].sort((left, right) => left.itemId.localeCompare(right.itemId)),
    draftItems: record.draftItems
      .map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        requiredness: item.requiredness,
        inclusionReason: item.inclusionReason
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    workspaceFacts: workspaces
      .map((workspace) => ({
        workspaceId: workspace.workspaceId,
        workspaceRowVersion: workspace.workspaceRowVersion,
        factsHash: workspace.factsHash,
        reservations: workspace.lockedReservations.map(({ id: reservationId, candidateCode }) => ({ reservationId, candidateCode })),
        evidence: workspace.evidence
      }))
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))
  };
}

export async function officialItemSnapshot(
  client: AsyncDatabaseClient,
  companyId: string,
  item: TransferPackageRecord["items"][number]
): Promise<TransferOfficialItemSnapshot | null> {
  if (item.entityType === "drawing_number") {
    const row = await client.queryOne<{
      record_status: string;
      updated_at: string;
      purpose_code: string;
      purpose_description: string;
      is_primary_manufacturing: number | boolean;
      current_version_id: string | null;
      current_version: string | null;
      current_version_status: string | null;
      current_version_at: string | null;
    }>(
      `SELECT drawing.record_status, drawing.updated_at,
              drawing.purpose_code, drawing.purpose_description, drawing.is_primary_manufacturing,
              package.id AS current_version_id,
              package.revision AS current_version,
              COALESCE(package.lifecycle_state, package.status) AS current_version_status,
              COALESCE(package.released_at, package.updated_at) AS current_version_at
         FROM drawing_numbers drawing
         LEFT JOIN drawing_revision_packages package
           ON package.id = (
             SELECT candidate.id
               FROM drawing_revision_packages candidate
              WHERE candidate.company_id = drawing.company_id
                AND candidate.drawing_number_id = drawing.id
                AND (candidate.lifecycle_state = 'released' OR candidate.status = 'Released')
              ORDER BY COALESCE(candidate.released_at, candidate.updated_at) DESC, candidate.id DESC
              LIMIT 1
           )
        WHERE drawing.id = :entityId AND drawing.company_id = :companyId`,
      { entityId: item.entityId, companyId }
    );
    if (!row) return null;
    return {
      itemId: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      entityCode: item.entityCode,
      recordStatus: row.record_status,
      masterUpdatedAt: row.updated_at,
      masterContentHash: sha256(canonicalNumberStateJson({
        recordStatus: row.record_status,
        purposeCode: row.purpose_code,
        purposeDescription: row.purpose_description,
        isPrimaryManufacturing: Boolean(row.is_primary_manufacturing)
      })),
      currentControlledVersionId: row.current_version_id,
      currentControlledVersion: row.current_version,
      currentControlledVersionStatus: row.current_version_status,
      currentControlledVersionAt: row.current_version_at
    };
  }

  const row = await client.queryOne<{
    record_status: string;
    updated_at: string;
    part_name: string;
    item_kind: string;
    bom_usage_policy: string;
    custom_specification: string | null;
    series_code: string | null;
    attribute_updated_at: string | null;
    material_code: string | null;
    material_label: string | null;
    color_code: string | null;
    color_label: string | null;
    surface_treatment: string | null;
    variant_note: string | null;
    current_version_id: string | null;
    current_version: string | null;
    current_version_status: string | null;
    current_version_at: string | null;
  }>(
    `SELECT part.record_status, part.updated_at,
            part.part_name, part.item_kind, part.bom_usage_policy,
            part.custom_specification, part.series_code,
            attributes.updated_at AS attribute_updated_at,
            attributes.material_code, attributes.material_label,
            attributes.color_code, attributes.color_label,
            attributes.surface_treatment, attributes.variant_note,
            snapshot.id AS current_version_id,
            snapshot.bom_revision AS current_version,
            CASE WHEN snapshot.obsolete_at IS NULL THEN 'Released' ELSE 'Obsolete' END AS current_version_status,
            COALESCE(snapshot.obsolete_at, snapshot.released_at) AS current_version_at
       FROM part_numbers part
       LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
       LEFT JOIN bom_release_snapshots snapshot
         ON snapshot.id = (
           SELECT candidate.id
            FROM bom_release_snapshots candidate
            LEFT JOIN bom_definitions candidate_definition ON candidate_definition.id = candidate.definition_id
            WHERE candidate.company_id = part.company_id
              AND (
                (
                  candidate.snapshot_schema_version = 2
                  AND COALESCE(candidate_definition.legacy_purpose, 'manufacturing') = 'manufacturing'
                  AND candidate.obsolete_at IS NULL
                  AND EXISTS (
                    SELECT 1 FROM bom_release_parent_snapshots parent_snapshot
                    WHERE parent_snapshot.release_snapshot_id = candidate.id
                      AND parent_snapshot.parent_part_number_id = part.id
                  )
                )
                OR (
                  candidate.snapshot_schema_version = 1
                  AND candidate.owner_part_number_id = part.id
                  AND NOT EXISTS (
                    SELECT 1
                    FROM bom_definition_parent_bindings definition_binding
                    JOIN bom_definitions definition_authority ON definition_authority.id = definition_binding.definition_id
                    JOIN bom_release_snapshots shared_snapshot
                      ON shared_snapshot.definition_id = definition_binding.definition_id
                     AND shared_snapshot.snapshot_schema_version = 2
                    WHERE definition_binding.part_number_id = part.id
                      AND COALESCE(definition_authority.legacy_purpose, 'manufacturing') = 'manufacturing'
                  )
                )
              )
            ORDER BY candidate.released_at DESC, candidate.id DESC
            LIMIT 1
         )
      WHERE part.id = :entityId AND part.company_id = :companyId`,
    { entityId: item.entityId, companyId }
  );
  if (!row) return null;
  if (row.current_version_id) {
    await new AsyncBomWorkbenchRepository(client).getReleaseSnapshotById(row.current_version_id);
  }
  return {
    itemId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    entityCode: item.entityCode,
    recordStatus: row.record_status,
    masterUpdatedAt: [row.updated_at, row.attribute_updated_at].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    masterContentHash: sha256(canonicalNumberStateJson({
      recordStatus: row.record_status,
      partName: row.part_name,
      itemKind: row.item_kind,
      bomUsagePolicy: row.bom_usage_policy,
      customSpecification: row.custom_specification,
      seriesCode: row.series_code,
      materialCode: row.material_code,
      materialLabel: row.material_label,
      colorCode: row.color_code,
      colorLabel: row.color_label,
      surfaceTreatment: row.surface_treatment,
      variantNote: row.variant_note
    })),
    currentControlledVersionId: row.current_version_id,
    currentControlledVersion: row.current_version,
    currentControlledVersionStatus: row.current_version_status,
    currentControlledVersionAt: row.current_version_at
  };
}

async function ownerIsActive(client: AsyncDatabaseClient, ownerId: string, companyId: string) {
  const row = await client.queryOne<{ account_status: string; system_role_enabled: number | boolean }>(
    `SELECT account_status, system_role_enabled FROM users
     WHERE id = :ownerId AND company_id = :companyId`,
    { ownerId, companyId }
  );
  return Boolean(row && row.account_status === "active" && Boolean(row.system_role_enabled));
}

async function ruleIsActive(client: AsyncDatabaseClient, workspace: NumberingDraftWorkspaceRecord) {
  const ruleId = workspace.root?.ruleVersionId;
  if (!ruleId) return true;
  const row = await client.queryOne<{ status: string }>(
    "SELECT status FROM numbering_rule_versions WHERE id = :ruleId",
    { ruleId }
  );
  return row?.status === "active";
}

function requiredCandidateCount(workspace: NumberingDraftWorkspaceRecord) {
  return (workspace.root ? 1 : 0) + workspace.parts.length + workspace.drawings.length;
}

function hasRequiredRelations(workspace: NumberingDraftWorkspaceRecord) {
  if (workspace.drawings.length === 0 || workspace.parts.length === 0) return true;
  const linkedDrawings = new Set(workspace.relations.map((relation) => relation.drawingDraftId));
  return workspace.drawings.every((drawing) => linkedDrawings.has(drawing.id));
}

export async function buildTransferPackageReadiness(
  packageId: string,
  companyId: string,
  client: AsyncDatabaseClient = getAsyncDatabaseClient(),
  options: { ignoreExistingApprovalSnapshot?: boolean } = {}
): Promise<TransferPackageReadiness> {
  const record = await new AsyncTransferPackageRepository(client).getById(packageId, companyId);
  const blockers: TransferReadinessBlocker[] = [];
  const workspaceSnapshots: TransferWorkspaceSnapshot[] = [];
  const officialItemSnapshots: TransferOfficialItemSnapshot[] = [];

  if (record.items.length + record.draftItems.length === 0) {
    blockers.push(blocker({
      code: "transfer_scope_required",
      message: "技轉包尚未加入正式物件或草稿工作區。",
      ownerRole: "RD",
      ownerModule: "技術移轉",
      actionLabel: "加入案件範圍",
      actionHref: `/transfer-packages/${encodeURIComponent(record.id)}?section=scope`
    }));
  }

  for (const item of record.items) {
    const current = await officialItemSnapshot(client, companyId, item);
    if (!current || !["Active", "Released"].includes(current.recordStatus ?? "")) {
      blockers.push(blocker({
        code: "transfer_official_item_invalid",
        message: `正式項目 ${item.entityCode} 已不存在或不再可正式使用。`,
        ownerRole: "PDM Admin",
        ownerModule: "圖料主檔",
        actionLabel: "檢查正式項目",
        actionHref: item.entityType === "drawing_number" ? "/numbering/drawings" : "/parts"
      }));
    }
    if (current) officialItemSnapshots.push(current);
  }

  for (const item of [...record.draftItems].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId))) {
    let workspace: NumberingDraftWorkspaceRecord;
    try {
      workspace = await new AsyncNumberStateFlowRepository(client).getWorkspace(item.workspaceId, companyId);
    } catch {
      blockers.push(blocker({
        code: "transfer_workspace_adapter_unavailable",
        message: "草稿工作區目前無法讀取，技轉 readiness 已安全關閉。",
        ownerRole: "PDM Admin",
        ownerModule: "草稿工作區",
        actionLabel: "重新讀取草稿",
        actionHref: `/parts?tab=drafts&workspace=${encodeURIComponent(item.workspaceId)}`,
        workspaceId: item.workspaceId
      }));
      continue;
    }
    if (workspace.lifecycleStatus === "cancelled") {
      blockers.push(blocker({
        code: "transfer_workspace_cancelled",
        message: "案件包含已取消的草稿工作區。",
        ownerRole: "RD",
        ownerModule: "草稿工作區",
        actionLabel: "移除或更換草稿",
        actionHref: `/transfer-packages/${encodeURIComponent(record.id)}?section=scope`,
        workspaceId: workspace.id
      }));
    }
    if (!await ownerIsActive(client, workspace.ownerId, companyId)) {
      blockers.push(blocker({
        code: "transfer_workspace_owner_inactive",
        message: "草稿負責人帳號已停用或不在目前公司。",
        ownerRole: "PDM Admin",
        ownerModule: "帳號管理",
        actionLabel: "重新指派負責人",
        actionHref: "/settings/accounts",
        workspaceId: workspace.id
      }));
    }
    const reservations = activeReservations(workspace);
    if (item.requiredness === "required" && reservations.length !== requiredCandidateCount(workspace)) {
      blockers.push(blocker({
        code: "candidate_required_before_review",
        message: "必要草稿尚未完整取得編號。",
        ownerRole: "草稿負責人",
        ownerModule: "圖料草稿",
        actionLabel: "取得編號",
        actionHref: `/parts?tab=drafts&workspace=${encodeURIComponent(workspace.id)}`,
        workspaceId: workspace.id
      }));
    }
    if (!hasRequiredRelations(workspace)) {
      blockers.push(blocker({
        code: "transfer_bom_relation_required",
        message: "含圖面與料件的草稿尚未建立完整關聯。",
        ownerRole: "RD",
        ownerModule: "BOM 工作台",
        actionLabel: "補齊圖料關聯",
        actionHref: `/bom/workbench?workspaceId=${encodeURIComponent(workspace.id)}`,
        workspaceId: workspace.id
      }));
    }
    if (!await ruleIsActive(client, workspace)) {
      blockers.push(blocker({
        code: "transfer_numbering_rule_inactive",
        message: "草稿引用的編碼規則已停用。",
        ownerRole: "PDM Admin",
        ownerModule: "編碼規則",
        actionLabel: "檢查編碼規則",
        actionHref: "/settings/numbering-rules",
        workspaceId: workspace.id
      }));
    }

    const facts = numberingCandidateSnapshotFacts(workspace);
    const factsHash = sha256(canonicalNumberStateJson(facts));
    let evidence;
    try {
      evidence = await new DatabasePublicationEvidencePort(client).verify({
        companyId,
        workspaceId: workspace.id,
        snapshotHash: factsHash,
        draftDrawingIds: workspace.drawings.map((drawing) => drawing.id)
      });
    } catch {
      evidence = { status: "not_ready" as const, ruleVersion: "unavailable", references: [], token: "" };
    }
    if (evidence.status === "not_ready") {
      blockers.push(blocker({
        code: "publication_evidence_not_ready",
        message: workspace.drawings.length
          ? "圖面草稿缺少已完成且可驗證的受控檔案。"
          : "發布證據服務目前無法確認此草稿。",
        ownerRole: "文件負責人",
        ownerModule: "圖面附件",
        actionLabel: "補齊受控檔案",
        actionHref: `/numbering/drawings?workspace=${encodeURIComponent(workspace.id)}`,
        workspaceId: workspace.id
      }));
    }
    workspaceSnapshots.push({
      workspaceId: workspace.id,
      workspaceRowVersion: workspace.rowVersion,
      factsHash,
      facts,
      lockedReservations: candidateFacts(workspace),
      evidence: {
        status: evidence.status === "not_required" ? "not_required" : "ready",
        ruleVersion: evidence.ruleVersion,
        references: evidence.references.map((reference) => ({
          evidenceId: reference.evidenceId,
          draftDrawingId: reference.draftDrawingId,
          generation: reference.generation,
          contentHash: reference.contentHash
        }))
      }
    });
  }

  const facts = authorityFacts(record, officialItemSnapshots, workspaceSnapshots);
  const authorityHash = sha256(canonicalNumberStateJson(facts));
  const snapshot: TransferReadinessSnapshot = {
    snapshotVersion: "transfer-package-review-v1",
    packageId: record.id,
    companyId,
    packageRowVersion: record.rowVersion,
    authorityHash,
    authorityFacts: facts,
    workspaceSnapshots,
    capturedAt: new Date().toISOString()
  };
  const snapshotHash = sha256(canonicalNumberStateJson(snapshot));

  let stale = false;
  if (!options.ignoreExistingApprovalSnapshot && record.reviewRequestId && record.reviewSnapshotHash) {
    const frozen = await client.queryOne<ApprovalSnapshotRow>(
      `SELECT snapshot_hash, snapshot_json FROM approval_platform_impact_snapshots
       WHERE request_id = :requestId ORDER BY captured_at DESC, id DESC LIMIT 1`,
      { requestId: record.reviewRequestId }
    );
    const frozenSnapshot = frozen ? parseJson<TransferReadinessSnapshot>(frozen.snapshot_json) : null;
    stale = !frozen || frozen.snapshot_hash !== record.reviewSnapshotHash || frozenSnapshot?.authorityHash !== authorityHash;
    if (stale) {
      blockers.unshift(blocker({
        code: "approval_snapshot_stale",
        message: "技轉內容已變更，舊核准快照不可用於發布。",
        ownerRole: "RD",
        ownerModule: "技術移轉",
        actionLabel: "重建快照並重新送審",
        actionHref: `/transfer-packages/${encodeURIComponent(record.id)}`
      }));
    }
  }

  return {
    packageId: record.id,
    packageStatus: record.status,
    rowVersion: record.rowVersion,
    ready: blockers.length === 0,
    stale,
    firstBlocker: blockers[0] ?? null,
    blockers,
    snapshotHash,
    snapshotVersion: snapshot.snapshotVersion,
    snapshot
  };
}

export async function addTransferDraftWorkspace(input: {
  metadata: PdmCommandMetadata;
  actor: TransferPackageActor;
  packageId: string;
  expectedRowVersion: number;
  workspaceId: string;
  requiredness: "required" | "optional";
  inclusionReason: string;
}) {
  if (!/^[A-Za-z0-9._:/-]{1,200}$/u.test(input.workspaceId)) {
    throw new TransferPackageError("TRANSFER_WORKSPACE_ID_INVALID", "請提供有效的草稿工作區 ID。", 400);
  }
  const command = createPdmCommand({
    commandName: "pdm.transfer.add_draft_workspace",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: {
      packageId: input.packageId,
      expectedRowVersion: input.expectedRowVersion,
      workspaceId: input.workspaceId,
      requiredness: input.requiredness
    }
  });
  const execution = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: (client) => new AsyncTransferPackageRepository(client).addDraftWorkspace(input),
    event: (workbench) => ({
      aggregateType: "transfer_package",
      aggregateId: input.packageId,
      eventType: "pdm.transfer.package_draft_scope_added.v1",
      payload: {
        companyId: input.metadata.actor.organizationId,
        packageId: input.packageId,
        workspaceId: input.workspaceId,
        rowVersion: workbench.rowVersion
      }
    })
  });
  return { workbench: execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
}

export async function removeTransferDraftWorkspace(input: {
  metadata: PdmCommandMetadata;
  actor: TransferPackageActor;
  packageId: string;
  itemId: string;
  expectedRowVersion: number;
  reason: string;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.remove_draft_workspace",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: {
      packageId: input.packageId,
      itemId: input.itemId,
      expectedRowVersion: input.expectedRowVersion
    }
  });
  const execution = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: (client) => new AsyncTransferPackageRepository(client).removeDraftWorkspace(input),
    event: (workbench) => ({
      aggregateType: "transfer_package",
      aggregateId: input.packageId,
      eventType: "pdm.transfer.package_draft_scope_removed.v1",
      payload: {
        companyId: input.metadata.actor.organizationId,
        packageId: input.packageId,
        itemId: input.itemId,
        rowVersion: workbench.rowVersion
      }
    })
  });
  return { workbench: execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
}

async function insertTransferEvent(
  client: AsyncDatabaseClient,
  input: { companyId: string; packageId: string; eventType: string; actorId: string; detail: Record<string, unknown>; now: string }
) {
  await client.execute(
    `INSERT INTO transfer_package_events
     (id, company_id, package_id, event_type, actor_id, detail_json, created_at)
     VALUES (:id, :companyId, :packageId, :eventType, :actorId, :detailJson, :createdAt)`,
    { id: id("transfer-event"), ...input, detailJson: JSON.stringify(input.detail), createdAt: input.now }
  );
}

async function unlockFailedTransferReviewReservations(
  client: AsyncDatabaseClient,
  input: { companyId: string; packageId: string; requestId: string; actorId: string; now: string; reason: string }
) {
  const reservations = await client.query<{ id: string; workspace_id: string }>(
    `SELECT r.id, r.workspace_id
     FROM transfer_package_draft_items i
     JOIN number_candidate_reservations r
       ON r.workspace_id = i.workspace_id AND r.company_id = i.company_id
     WHERE i.package_id = :packageId AND i.company_id = :companyId
       AND r.approval_request_id = :requestId
       AND r.reservation_state = 'approved_locked'
     ORDER BY r.workspace_id, r.id`,
    input
  );
  await client.execute(
    `UPDATE number_candidate_reservations SET
       reservation_state = 'active', approval_request_id = NULL,
       row_version = row_version + 1, updated_at = :now
     WHERE company_id = :companyId AND approval_request_id = :requestId
       AND reservation_state = 'approved_locked'
       AND workspace_id IN (
         SELECT workspace_id FROM transfer_package_draft_items
         WHERE package_id = :packageId AND company_id = :companyId
       )`,
    input
  );
  for (const reservation of reservations) {
    await client.execute(
      `INSERT INTO number_candidate_events (
         id, company_id, workspace_id, reservation_id, event_type,
         actor_id, occurred_at, detail_json
       ) VALUES (
         :id, :companyId, :workspaceId, :reservationId, 'review_unlocked',
         :actorId, :occurredAt, :detailJson
       )`,
      {
        id: id("candidate-event"),
        companyId: input.companyId,
        workspaceId: reservation.workspace_id,
        reservationId: reservation.id,
        actorId: input.actorId,
        occurredAt: input.now,
        detailJson: JSON.stringify({ requestId: input.requestId, reason: input.reason })
      }
    );
  }
  await insertTransferEvent(client, {
    companyId: input.companyId,
    packageId: input.packageId,
    eventType: "SnapshotInvalidated",
    actorId: input.actorId,
    detail: {
      requestId: input.requestId,
      reason: input.reason,
      unlockedReservationCount: reservations.length
    },
    now: input.now
  });
}

export async function submitTransferPackageReview(input: {
  metadata: PdmCommandMetadata;
  packageId: string;
  expectedRowVersion: number;
  reason: string;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.submit_package_review",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: { packageId: input.packageId, expectedRowVersion: input.expectedRowVersion }
  });
  const execution = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: async (client) => {
      const companyId = input.metadata.actor.organizationId;
      const row = await client.queryOne<{ package_status: string; row_version: number; review_request_id: string | null }>(
        `SELECT package_status, row_version, review_request_id
         FROM transfer_packages
         WHERE id = :packageId AND company_id = :companyId
         ${client.kind === "postgres" ? "FOR UPDATE" : ""}`,
        { packageId: input.packageId, companyId }
      );
      if (!row) throw new TransferPackageError("TRANSFER_PACKAGE_NOT_FOUND", "找不到技轉包。", 404);
      if (Number(row.row_version) !== input.expectedRowVersion) {
        throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已更新，請重新整理。", 409);
      }
      if (!["Draft", "NeedsInfo", "ReleaseFailed", "ApprovedPendingPublish"].includes(row.package_status)) {
        throw new TransferPackageError("TRANSFER_REVIEW_STATE_INVALID", "目前狀態不可送審。", 409);
      }
      const rebuildingFailedReview = row.package_status === "ReleaseFailed" && Boolean(row.review_request_id);
      const rebuildingStaleApproval = row.package_status === "ApprovedPendingPublish" && Boolean(row.review_request_id);
      if (rebuildingStaleApproval) {
        const approvedReadiness = await buildTransferPackageReadiness(input.packageId, companyId, client);
        if (!approvedReadiness.stale) {
          throw new TransferPackageError("TRANSFER_REVIEW_STATE_INVALID", "目前核准快照仍有效，不需要重新送審。", 409);
        }
      }
      const rebuildingReview = rebuildingFailedReview || rebuildingStaleApproval;
      if (rebuildingReview && row.review_request_id) {
        await unlockFailedTransferReviewReservations(client, {
          companyId,
          packageId: input.packageId,
          requestId: row.review_request_id,
          actorId: input.metadata.actor.pdmUserId,
          now: new Date().toISOString(),
          reason: rebuildingStaleApproval ? "approved_snapshot_stale_resubmit" : "release_failed_resubmit"
        });
      }
      const readiness = await buildTransferPackageReadiness(
        input.packageId,
        companyId,
        client,
        { ignoreExistingApprovalSnapshot: rebuildingReview }
      );
      if (!readiness.ready) {
        throw new TransferPackageError(readiness.firstBlocker?.code ?? "TRANSFER_NOT_READY", readiness.firstBlocker?.message ?? "技轉包尚未準備完成。", 409);
      }
      const requestId = id("APR-TRF");
      const now = new Date().toISOString();
      await client.execute(
        `INSERT INTO approval_platform_requests (
           id, company_id, package_id, action_code, domain_code, request_status,
           title, reason, requested_by, requested_at, apply_status,
           payload_json, created_at, updated_at
         ) VALUES (
           :id, :companyId, NULL, 'transfer.package_review', 'transfer', 'pending',
           :title, :reason, :requestedBy, :requestedAt, 'not_ready',
           :payloadJson, :createdAt, :updatedAt
         )`,
        {
          id: requestId,
          companyId: input.metadata.actor.organizationId,
          title: `技轉包審核 ${readiness.packageId}`,
          reason: input.reason,
          requestedBy: input.metadata.actor.pdmUserId,
          requestedAt: now,
          payloadJson: JSON.stringify({ transferPackageId: input.packageId, snapshotHash: readiness.snapshotHash }),
          createdAt: now,
          updatedAt: now
        }
      );
      await client.execute(
        `INSERT INTO approval_platform_targets (
           id, request_id, target_role, target_type, target_id, target_code,
           target_label, target_status, snapshot_json, sort_order, created_at
         ) VALUES (
           :id, :requestId, 'primary', 'transfer_package', :packageId, :packageId,
           '技術移轉包', :status, :snapshotJson, 0, :createdAt
         )`,
        {
          id: id("approval-target"), requestId, packageId: input.packageId,
          status: readiness.packageStatus, snapshotJson: canonicalNumberStateJson(readiness.snapshot.authorityFacts), createdAt: now
        }
      );
      let sortOrder = 10;
      for (const workspace of readiness.snapshot.workspaceSnapshots) {
        await client.execute(
          `INSERT INTO approval_platform_targets (
             id, request_id, target_role, target_type, target_id, target_code,
             target_label, target_status, snapshot_json, sort_order, created_at
           ) VALUES (
             :id, :requestId, 'child', 'numbering_draft_workspace', :workspaceId, NULL,
             '草稿工作區', 'active', :snapshotJson, :sortOrder, :createdAt
           )`,
          {
            id: id("approval-target"), requestId, workspaceId: workspace.workspaceId,
            snapshotJson: canonicalNumberStateJson(workspace), sortOrder, createdAt: now
          }
        );
        sortOrder += 10;
      }
      await client.execute(
        `INSERT INTO approval_platform_impact_snapshots
         (id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at)
         VALUES (:id, :requestId, NULL, :snapshotHash, :snapshotJson, :capturedBy, :capturedAt)`,
        {
          id: id("approval-impact"), requestId, snapshotHash: readiness.snapshotHash,
          snapshotJson: canonicalNumberStateJson(readiness.snapshot), capturedBy: input.metadata.actor.pdmUserId, capturedAt: now
        }
      );
      for (const workspace of readiness.snapshot.workspaceSnapshots) {
        await client.execute(
          `UPDATE number_candidate_reservations
           SET reservation_state = 'review_locked', approval_request_id = :requestId,
               row_version = row_version + 1, updated_at = :updatedAt
           WHERE company_id = :companyId AND workspace_id = :workspaceId
             AND reservation_state = 'active'`,
          {
            requestId, companyId: input.metadata.actor.organizationId,
            workspaceId: workspace.workspaceId, updatedAt: now
          }
        );
      }
      const updated = await client.queryOne<{ id: string }>(
        `UPDATE transfer_packages SET
           package_status = 'InReview', review_request_id = :requestId,
           review_snapshot_hash = :snapshotHash,
           review_snapshot_version = review_snapshot_version + 1,
           submitted_by = :submittedBy, submitted_at = :submittedAt,
           approved_by = NULL, approved_at = NULL,
           release_failure_correlation_id = NULL,
           row_version = row_version + 1, updated_at = :updatedAt
         WHERE id = :packageId AND company_id = :companyId
           AND package_status IN ('Draft', 'NeedsInfo', 'ReleaseFailed', 'ApprovedPendingPublish')
           AND row_version = :expectedRowVersion
         RETURNING id`,
        {
          requestId, snapshotHash: readiness.snapshotHash,
          submittedBy: input.metadata.actor.pdmUserId, submittedAt: now, updatedAt: now,
          packageId: input.packageId, companyId: input.metadata.actor.organizationId,
          expectedRowVersion: input.expectedRowVersion
        }
      );
      if (!updated) throw new TransferPackageError("TRANSFER_PACKAGE_STALE", "技轉包已更新，請重新整理。", 409);
      await insertTransferEvent(client, {
        companyId: input.metadata.actor.organizationId,
        packageId: input.packageId,
        eventType: "ReviewSubmitted",
        actorId: input.metadata.actor.pdmUserId,
        detail: { requestId, snapshotHash: readiness.snapshotHash },
        now
      });
      return { packageId: input.packageId, requestId, snapshotHash: readiness.snapshotHash };
    },
    event: (result) => ({
      aggregateType: "transfer_package",
      aggregateId: result.packageId,
      eventType: "pdm.transfer.package_review_submitted.v1",
      payload: { companyId: input.metadata.actor.organizationId, ...result }
    })
  });
  return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
}

export async function withdrawTransferPackageReview(input: {
  metadata: PdmCommandMetadata;
  packageId: string;
  expectedRowVersion: number;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.withdraw_package_review",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: { packageId: input.packageId, expectedRowVersion: input.expectedRowVersion }
  });
  const execution = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: async (client) => {
      const row = await client.queryOne<{ review_request_id: string; owner_id: string }>(
        `SELECT review_request_id, owner_id FROM transfer_packages
         WHERE id = :packageId AND company_id = :companyId
           AND package_status = 'InReview' AND row_version = :expectedRowVersion
         ${client.kind === "postgres" ? "FOR UPDATE" : ""}`,
        { packageId: input.packageId, companyId: input.metadata.actor.organizationId, expectedRowVersion: input.expectedRowVersion }
      );
      if (!row) throw new TransferPackageError("TRANSFER_WITHDRAW_STATE_INVALID", "只有待審核技轉包可以撤回。", 409);
      if (row.owner_id !== input.metadata.actor.pdmUserId && !input.metadata.actor.roles.some((role) => ["Admin", "R&D Manager", "system_admin", "pdm_admin", "rd_manager"].includes(role))) {
        throw new TransferPackageError("TRANSFER_PACKAGE_FORBIDDEN", "只有負責人或管理角色可以撤回。", 403);
      }
      const request = await client.queryOne<{ request_status: string }>(
        "SELECT request_status FROM approval_platform_requests WHERE id = :requestId AND company_id = :companyId",
        { requestId: row.review_request_id, companyId: input.metadata.actor.organizationId }
      );
      if (request?.request_status !== "pending") throw new TransferPackageError("TRANSFER_WITHDRAW_STATE_INVALID", "審核已有決定，無法撤回。", 409);
      const now = new Date().toISOString();
      await client.execute(
        `UPDATE number_candidate_reservations SET
           reservation_state = 'active', approval_request_id = NULL,
           row_version = row_version + 1, updated_at = :updatedAt
         WHERE company_id = :companyId AND approval_request_id = :requestId
           AND reservation_state = 'review_locked'`,
        { companyId: input.metadata.actor.organizationId, requestId: row.review_request_id, updatedAt: now }
      );
      await client.execute(
        `UPDATE approval_platform_requests SET
           request_status = 'cancelled', apply_status = 'not_required',
           resolved_by = :actorId, resolved_at = :now, updated_at = :now
         WHERE id = :requestId AND request_status = 'pending'`,
        { requestId: row.review_request_id, actorId: input.metadata.actor.pdmUserId, now }
      );
      await client.execute(
        `UPDATE transfer_packages SET
           package_status = 'Draft', review_request_id = NULL, review_snapshot_hash = NULL,
           review_snapshot_version = review_snapshot_version + 1,
           row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId
           AND package_status = 'InReview' AND row_version = :expectedRowVersion`,
        { packageId: input.packageId, companyId: input.metadata.actor.organizationId, expectedRowVersion: input.expectedRowVersion, now }
      );
      await insertTransferEvent(client, {
        companyId: input.metadata.actor.organizationId, packageId: input.packageId,
        eventType: "ReviewWithdrawn", actorId: input.metadata.actor.pdmUserId,
        detail: { requestId: row.review_request_id }, now
      });
      return { packageId: input.packageId, requestId: row.review_request_id };
    },
    event: (result) => ({
      aggregateType: "transfer_package", aggregateId: result.packageId,
      eventType: "pdm.transfer.package_review_withdrawn.v1",
      payload: { companyId: input.metadata.actor.organizationId, ...result }
    })
  });
  return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
}

export async function decideTransferPackageReview(input: {
  metadata: PdmCommandMetadata;
  requestId: string;
  decision: "approved" | "rejected" | "needs_info";
  comment: string | null;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.decide_package_review",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: { requestId: input.requestId, decision: input.decision }
  });
  const execution = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: async (client) => {
      const request = await client.queryOne<{ id: string; request_status: string }>(
        `SELECT id, request_status FROM approval_platform_requests
         WHERE id = :requestId AND company_id = :companyId AND action_code = 'transfer.package_review'
         ${client.kind === "postgres" ? "FOR UPDATE" : ""}`,
        { requestId: input.requestId, companyId: input.metadata.actor.organizationId }
      );
      if (!request) throw new TransferPackageError("APPROVAL_REQUEST_NOT_FOUND", "找不到審核申請。", 404);
      if (request.request_status !== "pending") throw new TransferPackageError("APPROVAL_REQUEST_ALREADY_DECIDED", "審核申請已有決定。", 409);
      const pkg = await client.queryOne<{ id: string }>(
        `SELECT id FROM transfer_packages
         WHERE company_id = :companyId AND review_request_id = :requestId AND package_status = 'InReview'
         ${client.kind === "postgres" ? "FOR UPDATE" : ""}`,
        { companyId: input.metadata.actor.organizationId, requestId: input.requestId }
      );
      if (!pkg) throw new TransferPackageError("TRANSFER_REVIEW_STATE_INVALID", "技轉包審核狀態不一致。", 409);
      const now = new Date().toISOString();
      await client.execute(
        `INSERT INTO approval_platform_decisions
         (id, request_id, approver_role, approver_id, decision, comment, decided_at)
         VALUES (:id, :requestId, :approverRole, :approverId, :decision, :comment, :decidedAt)`,
        {
          id: id("approval-decision"), requestId: input.requestId,
          approverRole: input.metadata.actor.roles[0] ?? "reviewer",
          approverId: input.metadata.actor.pdmUserId, decision: input.decision,
          comment: input.comment, decidedAt: now
        }
      );
      if (input.decision === "approved") {
        await client.execute(
          `UPDATE number_candidate_reservations SET
             reservation_state = 'approved_locked', row_version = row_version + 1, updated_at = :now
           WHERE company_id = :companyId AND approval_request_id = :requestId
             AND reservation_state = 'review_locked'`,
          { companyId: input.metadata.actor.organizationId, requestId: input.requestId, now }
        );
      } else {
        await client.execute(
          `UPDATE number_candidate_reservations SET
             reservation_state = 'active', approval_request_id = NULL,
             row_version = row_version + 1, updated_at = :now
           WHERE company_id = :companyId AND approval_request_id = :requestId
             AND reservation_state = 'review_locked'`,
          { companyId: input.metadata.actor.organizationId, requestId: input.requestId, now }
        );
      }
      await client.execute(
        `UPDATE approval_platform_requests SET
           request_status = :decision, apply_status = 'applied', apply_attempts = apply_attempts + 1,
           resolved_by = :actorId, resolved_at = :now,
           applied_by = :actorId, applied_at = :now, updated_at = :now
         WHERE id = :requestId AND request_status = 'pending'`,
        { decision: input.decision, actorId: input.metadata.actor.pdmUserId, now, requestId: input.requestId }
      );
      await client.execute(
        `UPDATE transfer_packages SET
           package_status = :packageStatus,
           approved_by = :approvedBy, approved_at = :approvedAt,
           row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId
           AND package_status = 'InReview' AND review_request_id = :requestId`,
        {
          packageStatus: input.decision === "approved" ? "ApprovedPendingPublish" : "NeedsInfo",
          approvedBy: input.decision === "approved" ? input.metadata.actor.pdmUserId : null,
          approvedAt: input.decision === "approved" ? now : null,
          now, packageId: pkg.id, companyId: input.metadata.actor.organizationId, requestId: input.requestId
        }
      );
      await insertTransferEvent(client, {
        companyId: input.metadata.actor.organizationId, packageId: pkg.id,
        eventType: "ReviewDecided", actorId: input.metadata.actor.pdmUserId,
        detail: { requestId: input.requestId, decision: input.decision }, now
      });
      return { packageId: pkg.id, requestId: input.requestId, decision: input.decision };
    },
    event: (result) => ({
      aggregateType: "approval_request", aggregateId: result.requestId,
      eventType: "pdm.transfer.package_review_decided.v1",
      payload: { companyId: input.metadata.actor.organizationId, ...result }
    })
  });
  return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
}

function snapshotForWorkspace(snapshot: TransferReadinessSnapshot, workspaceId: string) {
  const workspace = snapshot.workspaceSnapshots.find((item) => item.workspaceId === workspaceId);
  if (!workspace) throw new TransferPackageError("approval_snapshot_stale", "核准快照缺少草稿工作區。", 409);
  return workspace;
}

async function recordPublishFailure(input: {
  metadata: PdmCommandMetadata;
  packageId: string;
  expectedRowVersion: number;
  correlationId: string;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.record_package_publish_failure",
    idempotencyKey: `${input.metadata.idempotencyKey}:failure`,
    actor: input.metadata.actor,
    payload: { packageId: input.packageId, expectedRowVersion: input.expectedRowVersion, correlationId: input.correlationId }
  });
  return executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(),
    command,
    execute: async (client) => {
      const now = new Date().toISOString();
      const updated = await client.queryOne<{ id: string }>(
        `UPDATE transfer_packages SET
           package_status = 'ReleaseFailed', release_failure_correlation_id = :correlationId,
           row_version = row_version + 1, updated_at = :now
         WHERE id = :packageId AND company_id = :companyId
           AND package_status = 'ApprovedPendingPublish' AND row_version = :expectedRowVersion
         RETURNING id`,
        {
          correlationId: input.correlationId, now, packageId: input.packageId,
          companyId: input.metadata.actor.organizationId, expectedRowVersion: input.expectedRowVersion
        }
      );
      if (updated) {
        await insertTransferEvent(client, {
          companyId: input.metadata.actor.organizationId, packageId: input.packageId,
          eventType: "ReleaseFailed", actorId: input.metadata.actor.pdmUserId,
          detail: { correlationId: input.correlationId }, now
        });
      }
      return { packageId: input.packageId, recorded: Boolean(updated), correlationId: input.correlationId };
    },
    event: (result) => ({
      aggregateType: "transfer_package", aggregateId: result.packageId,
      eventType: "pdm.transfer.package_publish_failed.v1",
      payload: { companyId: input.metadata.actor.organizationId, ...result }
    })
  });
}

export async function publishTransferPackage(input: {
  metadata: PdmCommandMetadata;
  packageId: string;
  expectedRowVersion: number;
  faultInjector?: (point: string) => void;
}) {
  const command = createPdmCommand({
    commandName: "pdm.transfer.publish_package",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: { packageId: input.packageId, expectedRowVersion: input.expectedRowVersion }
  });
  let publicationStarted = false;
  try {
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: async (client) => {
        const pkg = await client.queryOne<{
          id: string;
          review_request_id: string;
          review_snapshot_hash: string;
          row_version: number;
          package_status: string;
        }>(
          `SELECT id, review_request_id, review_snapshot_hash, row_version, package_status
           FROM transfer_packages
           WHERE id = :packageId AND company_id = :companyId
           ${client.kind === "postgres" ? "FOR UPDATE" : ""}`,
          { packageId: input.packageId, companyId: input.metadata.actor.organizationId }
        );
        if (!pkg) throw new TransferPackageError("TRANSFER_PACKAGE_NOT_FOUND", "找不到技轉包。", 404);
        if (!["ApprovedPendingPublish", "ReleaseFailed"].includes(pkg.package_status) || Number(pkg.row_version) !== input.expectedRowVersion) {
          throw new TransferPackageError("publication_not_approved", "技轉包尚未核准或版本已變更。", 409);
        }
        const frozenRow = await client.queryOne<ApprovalSnapshotRow>(
          `SELECT snapshot_hash, snapshot_json FROM approval_platform_impact_snapshots
           WHERE request_id = :requestId ORDER BY captured_at DESC, id DESC LIMIT 1`,
          { requestId: pkg.review_request_id }
        );
        if (!frozenRow || frozenRow.snapshot_hash !== pkg.review_snapshot_hash) {
          throw new TransferPackageError("approval_snapshot_stale", "核准快照不一致。", 409);
        }
        const frozen = parseJson<TransferReadinessSnapshot>(frozenRow.snapshot_json);
        const readiness = await buildTransferPackageReadiness(input.packageId, input.metadata.actor.organizationId, client);
        if (readiness.snapshot.authorityHash !== frozen.authorityHash || readiness.stale) {
          throw new TransferPackageError("approval_snapshot_stale", "技轉內容已變更，請重新送審。", 409);
        }
        if (!readiness.ready) {
          throw new TransferPackageError(readiness.firstBlocker?.code ?? "TRANSFER_NOT_READY", readiness.firstBlocker?.message ?? "技轉包尚未準備完成。", 409);
        }
        publicationStarted = true;
        const publications: Array<{ workspaceId: string; newlyPublished: boolean; result: NumberingPublicationResult | null }> = [];
        for (const workspaceId of frozen.workspaceSnapshots.map((item) => item.workspaceId).sort()) {
          const current = await new AsyncNumberStateFlowRepository(client).getWorkspace(workspaceId, input.metadata.actor.organizationId);
          const workspaceSnapshot = snapshotForWorkspace(frozen, workspaceId);
          if (current.lifecycleStatus === "published") {
            const promoted = current.reservations.filter((reservation) => reservation.state === "promoted");
            const expected = new Map(workspaceSnapshot.lockedReservations.map((reservation) => [reservation.id, reservation.candidateCode]));
            if (promoted.length !== expected.size || promoted.some((reservation) => expected.get(reservation.id) !== reservation.candidateCode)) {
              throw new TransferPackageError("state_inconsistent", "既有正式號碼與技轉快照不一致。", 409);
            }
            publications.push({ workspaceId, newlyPublished: false, result: null });
            continue;
          }
          const evidence = await new DatabasePublicationEvidencePort(client).verify({
            companyId: input.metadata.actor.organizationId,
            workspaceId,
            snapshotHash: frozenRow.snapshot_hash,
            draftDrawingIds: current.drawings.map((drawing) => drawing.id)
          });
          if (evidence.status === "not_ready") throw new TransferPackageError("publication_evidence_not_ready", "發布證據尚未完成。", 409);
          input.faultInjector?.(`before_workspace:${workspaceId}`);
          const result = await new AsyncNumberStateFlowRepository(
            client,
            undefined,
            undefined,
            (point) => input.faultInjector?.(`${workspaceId}:${point}`)
          ).publishApprovedWorkspace({
            workspaceId,
            companyId: input.metadata.actor.organizationId,
            actorId: input.metadata.actor.pdmUserId,
            evidence,
            approvalOverride: {
              requestId: pkg.review_request_id,
              snapshotHash: frozenRow.snapshot_hash,
              factsHash: workspaceSnapshot.factsHash,
              lockedReservations: workspaceSnapshot.lockedReservations,
              reservationVersionOffset: 2
            }
          });
          publications.push({ workspaceId, newlyPublished: true, result });
          input.faultInjector?.(`after_workspace:${workspaceId}`);
        }
        input.faultInjector?.("before_package_publish");
        const now = new Date().toISOString();
        await client.execute(
          `UPDATE transfer_packages SET
             package_status = 'Published', published_by = :publishedBy, published_at = :publishedAt,
             release_failure_correlation_id = NULL,
             row_version = row_version + 1, updated_at = :updatedAt
           WHERE id = :packageId AND company_id = :companyId
             AND package_status IN ('ApprovedPendingPublish', 'ReleaseFailed') AND row_version = :expectedRowVersion`,
          {
            publishedBy: input.metadata.actor.pdmUserId, publishedAt: now, updatedAt: now,
            packageId: input.packageId, companyId: input.metadata.actor.organizationId,
            expectedRowVersion: input.expectedRowVersion
          }
        );
        await insertTransferEvent(client, {
          companyId: input.metadata.actor.organizationId, packageId: input.packageId,
          eventType: "PackagePublished", actorId: input.metadata.actor.pdmUserId,
          detail: {
            requestId: pkg.review_request_id,
            snapshotHash: frozenRow.snapshot_hash,
            workspaceIds: publications.map((publication) => publication.workspaceId)
          },
          now
        });
        return { packageId: input.packageId, snapshotHash: frozenRow.snapshot_hash, publications };
      },
      event: (result) => [
        {
          aggregateType: "transfer_package",
          aggregateId: result.packageId,
          eventType: "pdm.transfer.package_published.v1",
          idempotencyKeySuffix: "package",
          payload: {
            companyId: input.metadata.actor.organizationId,
            packageId: result.packageId,
            snapshotHash: result.snapshotHash,
            workspaceIds: result.publications.map((publication) => publication.workspaceId)
          }
        },
        ...result.publications
          .filter((publication) => publication.newlyPublished && publication.result)
          .map((publication) => ({
            aggregateType: "numbering_draft_workspace",
            aggregateId: publication.workspaceId,
            eventType: "pdm.numbering.official_number_published.v1",
            idempotencyKeySuffix: `workspace:${publication.workspaceId}`,
            payload: {
              companyId: input.metadata.actor.organizationId,
              transferPackageId: result.packageId,
              workspaceId: publication.workspaceId,
              snapshotHash: result.snapshotHash,
              masters: publication.result!.masters
            }
          }))
      ],
      faultInjector: input.faultInjector
    });
    return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    if (publicationStarted) {
      const correlationId = input.metadata.actor.correlationId || crypto.randomUUID();
      try {
        await recordPublishFailure({
          metadata: input.metadata,
          packageId: input.packageId,
          expectedRowVersion: input.expectedRowVersion,
          correlationId
        });
      } catch {
        // Main publication already rolled back; failure evidence must not risk a partial retry.
      }
      if (error instanceof TransferPackageError) throw error;
      throw new TransferPackageError("TRANSFER_BATCH_PUBLICATION_FAILED", `整批發布失敗，追蹤碼 ${correlationId}。`, 409);
    }
    throw error;
  }
}

export type PublishedTransferHandoff = {
  id: string;
  packageCode: string;
  title: string;
  caseType: string;
  publishedAt: string;
  items: Array<{ type: "drawing_number" | "part_number" | "part_root"; id: string; code: string }>;
};

export async function listPublishedTransferHandoffs(
  companyId: string,
  client: AsyncDatabaseClient = getAsyncDatabaseClient()
): Promise<PublishedTransferHandoff[]> {
  const packages = await client.query<{
    id: string; package_code: string; title: string; case_type: string; published_at: string;
  }>(
    `SELECT id, package_code, title, case_type, published_at
     FROM transfer_packages
     WHERE company_id = :companyId AND package_status = 'Published'
     ORDER BY published_at DESC, id DESC`,
    { companyId }
  );
  const handoffs = await Promise.all(packages.map(async (pkg) => {
    const [official, draftScopes, reservations] = await Promise.all([
      client.query<{
        entity_type: "drawing_number" | "part_number";
        entity_id: string;
        entity_code: string;
        current_status: string | null;
      }>(
        `SELECT i.entity_type, i.entity_id, i.entity_code,
                CASE
                  WHEN i.entity_type = 'drawing_number' THEN drawing.record_status
                  WHEN i.entity_type = 'part_number' THEN part.record_status
                  ELSE NULL
                END AS current_status
         FROM transfer_package_items i
         LEFT JOIN drawing_numbers drawing
           ON i.entity_type = 'drawing_number'
          AND drawing.id = i.entity_id
          AND drawing.company_id = i.company_id
         LEFT JOIN part_numbers part
           ON i.entity_type = 'part_number'
          AND part.id = i.entity_id
          AND part.company_id = i.company_id
         WHERE i.company_id = :companyId AND i.package_id = :packageId
         ORDER BY i.entity_type, i.entity_code`,
        { companyId, packageId: pkg.id }
      ),
      client.query<{ workspace_id: string; lifecycle_status: string | null }>(
        `SELECT i.workspace_id, w.lifecycle_status
         FROM transfer_package_draft_items i
         LEFT JOIN numbering_draft_workspaces w
           ON w.id = i.workspace_id AND w.company_id = i.company_id
         WHERE i.company_id = :companyId AND i.package_id = :packageId
         ORDER BY i.workspace_id`,
        { companyId, packageId: pkg.id }
      ),
      client.query<{
        workspace_id: string;
        reservation_state: string;
        promoted_master_type: "drawing_number" | "part_number" | "part_root" | null;
        promoted_master_id: string | null;
        candidate_code: string;
        current_status: string | null;
      }>(
        `SELECT r.workspace_id, r.reservation_state, r.promoted_master_type,
                r.promoted_master_id, r.candidate_code,
                CASE
                  WHEN r.promoted_master_type = 'drawing_number' THEN drawing.record_status
                  WHEN r.promoted_master_type = 'part_number' THEN part.record_status
                  WHEN r.promoted_master_type = 'part_root' THEN root.record_status
                  ELSE NULL
                END AS current_status
         FROM transfer_package_draft_items i
         JOIN number_candidate_reservations r
           ON r.workspace_id = i.workspace_id AND r.company_id = i.company_id
         LEFT JOIN drawing_numbers drawing
           ON r.promoted_master_type = 'drawing_number'
          AND drawing.id = r.promoted_master_id
          AND drawing.company_id = r.company_id
         LEFT JOIN part_numbers part
           ON r.promoted_master_type = 'part_number'
          AND part.id = r.promoted_master_id
          AND part.company_id = r.company_id
         LEFT JOIN part_roots root
           ON r.promoted_master_type = 'part_root'
          AND root.id = r.promoted_master_id
          AND root.company_id = r.company_id
         WHERE i.company_id = :companyId AND i.package_id = :packageId
         ORDER BY r.promoted_master_type, r.candidate_code`,
        { companyId, packageId: pkg.id }
      )
    ]);
    const formalStatuses = new Set(["Active", "Released"]);
    const officialReady = official.every((item) => formalStatuses.has(item.current_status ?? ""));
    const draftReady = draftScopes.every((scope) =>
      scope.lifecycle_status === "published" &&
      reservations.some((reservation) => reservation.workspace_id === scope.workspace_id) &&
      reservations
        .filter((reservation) => reservation.workspace_id === scope.workspace_id)
        .every((reservation) =>
          reservation.reservation_state === "promoted" &&
          Boolean(reservation.promoted_master_type) &&
          Boolean(reservation.promoted_master_id) &&
          formalStatuses.has(reservation.current_status ?? "")
        )
    );
    if (official.length + draftScopes.length === 0 || !officialReady || !draftReady) return null;

    const promoted = reservations.filter((reservation): reservation is typeof reservation & {
      promoted_master_type: "drawing_number" | "part_number" | "part_root";
      promoted_master_id: string;
    } => reservation.reservation_state === "promoted" && Boolean(reservation.promoted_master_type) && Boolean(reservation.promoted_master_id));
    return {
      id: pkg.id,
      packageCode: pkg.package_code,
      title: pkg.title,
      caseType: pkg.case_type,
      publishedAt: pkg.published_at,
      items: [
        ...official.map((item) => ({ type: item.entity_type, id: item.entity_id, code: item.entity_code })),
        ...promoted.map((item) => ({ type: item.promoted_master_type, id: item.promoted_master_id, code: item.candidate_code }))
      ]
    };
  }));
  return handoffs.filter((handoff): handoff is PublishedTransferHandoff => handoff !== null);
}

export async function listTransferPackages(companyId: string) {
  return new AsyncTransferPackageRepository(getAsyncDatabaseClient()).listByCompany(companyId);
}
