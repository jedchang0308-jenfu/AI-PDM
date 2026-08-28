import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { affectedPartFingerprint, validateDrawingChangeImpactForWork } from "@/lib/drawing-change-impact";
import {
  collectDrawingWorkFileSnapshotAnomalies,
  type DrawingWorkFileSnapshotActualRow,
  type DrawingWorkFileSnapshotSourceRow
} from "@/lib/drawing-work-file-snapshot-invariant";
import { buildDrawingRevisionPolicySnapshot, deriveDrawingRevisionBasis, drawingRevisionBasisReason, formatDrawingRevision, mergeDrawingRevisionPolicySnapshot, validateManualMinor, type DrawingRevisionBasisState, type DrawingRevisionTuple } from "@/lib/drawing-revision-lifecycle-policy";

export type RevisionTuple = DrawingRevisionTuple;
export type DrawingRevisionCandidate = { kind: "production" | "rd"; target: RevisionTuple; enabled: boolean; reason: string | null };
export type DrawingSourceState = {
  id: string; company_id: string; drawing_id: string; data_layer: "drawing_production" | "drawing_rd";
  branch_id: string | null; revision_id: string; revision: string; work_id: string | null; handling: string;
  row_version: number; base_production_revision_id: string | null; latest_approved_revision_id: string | null;
  branch_status: "open" | "historical" | null; open_branch_count: number; current_production_row_id: string | null;
  current_production_revision_id: string | null; current_production_revision: string | null;
};
export type DrawingWorkRow = {
  id: string; company_id: string; drawing_id: string; branch_id: string; target_claim_id: string;
  owner_user_id: string; proposed_payload: string | unknown; base_hash: string; row_version: number;
  target_major: number; target_minor: number; target_label: string; predecessor_revision_id: string | null;
  revision_id: string; handling: string;
};

export function parseCanonicalRevision(value: string): RevisionTuple {
  const match = /^(0|[1-9]\d*)(?:\.([1-9]\d*))?$/u.exec(value.trim());
  if (!match) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "版次格式無效", 422);
  const major = Number(match[1]); const minor = match[2] ? Number(match[2]) : 0;
  return { major, minor, label: minor ? `${major}.${minor}` : String(major) };
}

export class DrawingRevisionWorkAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async readSourceState(client: AsyncDatabaseClient, companyId: string, rowId: string, lock = false) {
    if (lock) await this.lockSourceBasis(client, companyId, rowId);
    return client.queryOne<DrawingSourceState>(
      `SELECT state.id, state.company_id, state.canonical_entity_id AS drawing_id, state.data_layer,
              state.branch_id, state.revision_id, revision.revision, state.work_id, state.handling, state.row_version,
              branch.base_production_revision_id, branch.latest_approved_revision_id, branch.status AS branch_status,
              aggregate.open_branch_count,
              production.id AS current_production_row_id, production.revision_id AS current_production_revision_id,
              production_revision.revision AS current_production_revision
       FROM canonical_workbench_states state
       JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id
       JOIN pdm_workbench_aggregates aggregate ON aggregate.company_id = state.company_id AND aggregate.entity_type = 'drawing' AND aggregate.canonical_entity_id = state.canonical_entity_id
       LEFT JOIN drawing_rd_branches branch ON branch.id = state.branch_id AND branch.company_id = state.company_id
       LEFT JOIN canonical_workbench_states production
         ON production.company_id = state.company_id AND production.entity_type = 'drawing'
        AND production.canonical_entity_id = state.canonical_entity_id AND production.data_layer = 'drawing_production'
       LEFT JOIN drawing_revisions production_revision ON production_revision.id = production.revision_id AND production_revision.company_id = production.company_id
       WHERE state.id = :rowId AND state.company_id = :companyId AND state.entity_type = 'drawing'`,
      { companyId, rowId }
    );
  }

  private async lockSourceBasis(client: AsyncDatabaseClient, companyId: string, rowId: string) {
    const source = await client.queryOne<{ drawing_id: string; branch_id: string | null }>(
      `SELECT canonical_entity_id AS drawing_id, branch_id FROM canonical_workbench_states WHERE id = :rowId AND company_id = :companyId AND entity_type = 'drawing'`,
      { companyId, rowId }
    );
    if (!source) return;
    await this.lockDrawingBasis(client, { companyId, drawingId: source.drawing_id, sourceRowId: rowId, branchId: source.branch_id });
  }

  async lockDrawingBasis(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; sourceRowId?: string | null; branchId?: string | null }) {
    const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
    await client.queryOne(`SELECT id FROM pdm_workbench_aggregates WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId${lock}`, input);
    await client.queryOne(`SELECT id FROM canonical_workbench_states WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND data_layer = 'drawing_production'${lock}`, input);
    if (input.sourceRowId) await client.queryOne(`SELECT id FROM canonical_workbench_states WHERE id = :sourceRowId AND company_id = :companyId AND entity_type = 'drawing'${lock}`, input);
    if (input.branchId) await client.queryOne(`SELECT id FROM drawing_rd_branches WHERE id = :branchId AND company_id = :companyId${lock}`, input);
  }

  async listCandidates(client: AsyncDatabaseClient, source: DrawingSourceState): Promise<DrawingRevisionCandidate[]> {
    const tuple = parseCanonicalRevision(source.revision);
    const basisState = deriveDrawingRevisionBasis({ dataLayer: source.data_layer, baseProductionRevisionId: source.base_production_revision_id, currentProductionRevisionId: source.current_production_revision_id });
    if (basisState === "stale") return [];
    const baseTuple = source.current_production_revision ? parseCanonicalRevision(source.current_production_revision) : { major: 0, minor: 0, label: "0" };
    const majorTarget = { major: baseTuple.major + 1, minor: 0, label: String(baseTuple.major + 1) };
    const claimed = await client.query<{ target_major: number; target_minor: number }>(
      `SELECT target_major, target_minor FROM drawing_revision_claims WHERE company_id = :companyId AND drawing_id = :drawingId`,
      { companyId: source.company_id, drawingId: source.drawing_id }
    );
    const occupied = new Set(claimed.map((row) => `${Number(row.target_major)}.${Number(row.target_minor)}`));
    const startMinor = source.data_layer === "drawing_rd" ? tuple.minor + 1 : 1;
    let minor = startMinor;
    while (occupied.has(`${baseTuple.major}.${minor}`)) minor += 1;
    const majorClaimed = occupied.has(`${majorTarget.major}.0`);
    return [
      { kind: "production", target: majorTarget, enabled: !majorClaimed, reason: majorClaimed ? "目標版次已被占用" : null },
      { kind: "rd", target: { major: basisState === "preproduction" ? 0 : baseTuple.major, minor, label: formatDrawingRevision(basisState === "preproduction" ? 0 : baseTuple.major, minor) }, enabled: true, reason: null }
    ];
  }

  async readWork(client: AsyncDatabaseClient, companyId: string, workId: string, lock = false) {
    if (lock) {
      const meta = await client.queryOne<{ drawing_id: string; branch_id: string | null; source_row_id: string | null }>(
        `SELECT work.drawing_id, work.branch_id, state.id AS source_row_id
           FROM drawing_revision_works work
           LEFT JOIN canonical_workbench_states state ON state.work_id = work.id AND state.company_id = work.company_id
          WHERE work.id = :workId AND work.company_id = :companyId`,
        { companyId, workId }
      );
      if (meta) await this.lockDrawingBasis(client, { companyId, drawingId: meta.drawing_id, sourceRowId: meta.source_row_id, branchId: meta.branch_id });
    }
    const work = await client.queryOne<DrawingWorkRow>(
      `SELECT work.id, work.company_id, work.drawing_id, work.branch_id, work.target_claim_id, work.owner_user_id,
              work.proposed_payload, work.base_hash, work.row_version, claim.target_major, claim.target_minor,
              claim.target_label, claim.predecessor_revision_id, state.revision_id, state.handling
       FROM drawing_revision_works work
       JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id AND claim.company_id = work.company_id
       JOIN canonical_workbench_states state ON state.work_id = work.id AND state.company_id = work.company_id
       WHERE work.id = :workId AND work.company_id = :companyId${lock && client.kind === "postgres" ? " FOR UPDATE OF work, claim, state" : ""}`,
      { companyId, workId }
    );
    if (work) await this.assertWorkFileSnapshot(client, work);
    return work;
  }

  async resolveWorkBasis(client: AsyncDatabaseClient, work: Pick<DrawingWorkRow, "company_id" | "drawing_id" | "branch_id" | "id">, lock = false) {
    if (lock) await this.lockDrawingBasis(client, { companyId: work.company_id, drawingId: work.drawing_id, branchId: work.branch_id });
    const source = await client.queryOne<DrawingSourceState>(
      `SELECT state.id, state.company_id, state.canonical_entity_id AS drawing_id, state.data_layer,
              state.branch_id, state.revision_id, revision.revision, state.work_id, state.handling, state.row_version,
              branch.base_production_revision_id, branch.latest_approved_revision_id, branch.status AS branch_status,
              aggregate.open_branch_count,
              production.id AS current_production_row_id, production.revision_id AS current_production_revision_id,
              production_revision.revision AS current_production_revision
       FROM canonical_workbench_states state
       JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id
       JOIN pdm_workbench_aggregates aggregate ON aggregate.company_id = state.company_id AND aggregate.entity_type = 'drawing' AND aggregate.canonical_entity_id = state.canonical_entity_id
       LEFT JOIN drawing_rd_branches branch ON branch.id = state.branch_id AND branch.company_id = state.company_id
       LEFT JOIN canonical_workbench_states production
         ON production.company_id = state.company_id AND production.entity_type = 'drawing'
        AND production.canonical_entity_id = state.canonical_entity_id AND production.data_layer = 'drawing_production'
       LEFT JOIN drawing_revisions production_revision ON production_revision.id = production.revision_id AND production_revision.company_id = production.company_id
       WHERE state.company_id = :companyId AND state.work_id = :workId AND state.entity_type = 'drawing'`,
      { companyId: work.company_id, workId: work.id }
    );
    if (!source) throw new CanonicalWorkbenchError("DRAWING_REVISION_BASIS_INVALID", "圖面版次基準不存在，請交由系統管理員處理", 409);
    const basisState = deriveDrawingRevisionBasis({ dataLayer: source.data_layer, baseProductionRevisionId: source.base_production_revision_id, currentProductionRevisionId: source.current_production_revision_id });
    return { ...source, basisState };
  }

  async assertWorkMutationBasis(client: AsyncDatabaseClient, work: Pick<DrawingWorkRow, "company_id" | "drawing_id" | "branch_id" | "id">, options: { cleanup?: boolean } = {}) {
    const basis = await this.resolveWorkBasis(client, work, true);
    if (basis.basisState === "stale" && !options.cleanup) {
      throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", drawingRevisionBasisReason(basis.basisState) ?? "量產基準已更新", 409);
    }
    return basis;
  }

  async assertWorkFileSnapshot(client: AsyncDatabaseClient, work: Pick<DrawingWorkRow, "id" | "company_id" | "drawing_id" | "revision_id" | "proposed_payload">) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = (typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload) as Record<string, unknown> | null;
    } catch {
      payload = null;
    }
    const migrated = payload?.migrated === true;
    if (migrated && ((payload?.drawingId && payload.drawingId !== work.drawing_id) || (payload?.revisionId && payload.revisionId !== work.revision_id))) {
      throw new CanonicalWorkbenchError("DRAWING_WORK_FILE_SNAPSHOT_INVALID", "圖面工作檔案快照需要修復，請交由系統管理員處理", 409);
    }
    const sourceRows = migrated ? await client.query<DrawingWorkFileSnapshotSourceRow>(
      `SELECT file.id, file.company_id, revision.drawing_id, file.drawing_revision_id, file.source_file_asset_id,
              file.sort_order, file.removed_at, file.removed_by, asset.id AS asset_id, asset.content_hash,
              asset.deleted_at, asset.deleted_by, asset.deleted_reason
       FROM drawing_revision_files file
       JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id AND revision.company_id = file.company_id
       LEFT JOIN file_assets asset ON asset.id = file.source_file_asset_id
       WHERE file.company_id = :companyId AND revision.drawing_id = :drawingId AND file.drawing_revision_id = :revisionId
      ORDER BY file.sort_order, file.id`,
      { companyId: work.company_id, drawingId: work.drawing_id, revisionId: work.revision_id }
    ) : [];
    const actualRows = await client.query<DrawingWorkFileSnapshotActualRow>(
      `SELECT binding.work_id, binding.file_binding_id, binding.ordinal, binding.content_hash,
              file.company_id, revision.drawing_id, file.drawing_revision_id, file.source_file_asset_id,
              file.removed_at, asset.id AS asset_id, asset.content_hash AS asset_content_hash, asset.deleted_at
       FROM drawing_revision_work_files binding
       LEFT JOIN drawing_revision_files file ON file.id = binding.file_binding_id
       LEFT JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id AND revision.company_id = file.company_id
       LEFT JOIN file_assets asset ON asset.id = file.source_file_asset_id
       WHERE binding.work_id = :workId
      ORDER BY binding.ordinal, binding.file_binding_id`,
      { workId: work.id }
    );
    const anomalies = collectDrawingWorkFileSnapshotAnomalies({
      scope: {
        id: work.id,
        companyId: work.company_id,
        drawingId: work.drawing_id,
        revisionId: work.revision_id,
        migrated
      },
      sourceRows,
      actualRows
    });
    if (anomalies.length > 0) throw new CanonicalWorkbenchError("DRAWING_WORK_FILE_SNAPSHOT_INVALID", "圖面工作檔案快照需要修復，請交由系統管理員處理", 409);
  }

  async create(tx: AsyncDatabaseClient, input: { companyId: string; sourceRowId: string; ownerUserId: string; expectedRowVersion: number; target: RevisionTuple; selectionMode: "recommended" | "manual_minor"; requestedMinor: number | null }) {
    const source = await this.readSourceState(tx, input.companyId, input.sourceRowId, true);
    if (!source || source.row_version !== input.expectedRowVersion || source.handling !== "none" || source.work_id) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const basisState = deriveDrawingRevisionBasis({ dataLayer: source.data_layer, baseProductionRevisionId: source.base_production_revision_id, currentProductionRevisionId: source.current_production_revision_id });
    if (basisState === "stale") throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", drawingRevisionBasisReason(basisState) ?? "量產基準已更新", 409);
    const candidates = await this.listCandidates(tx, source);
    const candidate = input.selectionMode === "recommended" ? candidates.find((entry) => entry.target.major === input.target.major && entry.target.minor === input.target.minor) : null;
    if (input.selectionMode === "recommended" && (!candidate || !candidate.enabled)) throw new CanonicalWorkbenchError("DRAWING_TARGET_REVISION_CLAIMED", "目標版次已被占用", 409);
    if (input.selectionMode === "manual_minor") {
      const claimed = await tx.query<{ target_major: number; target_minor: number }>(`SELECT target_major, target_minor FROM drawing_revision_claims WHERE company_id = :companyId AND drawing_id = :drawingId`, { companyId: input.companyId, drawingId: source.drawing_id });
      const occupied = new Set(claimed.map((row) => `${Number(row.target_major)}.${Number(row.target_minor)}`));
      const predecessor = parseCanonicalRevision(source.revision);
      const baseMajor = source.current_production_revision ? parseCanonicalRevision(source.current_production_revision).major : 0;
      try {
        const validated = validateManualMinor({ basisState, major: baseMajor, predecessor, requestedMinor: input.requestedMinor, occupied });
        if (validated.major !== input.target.major || validated.minor !== input.target.minor) throw new Error("DRAWING_MANUAL_MINOR_INVALID");
      } catch (error) {
        const code = error instanceof Error ? error.message : "DRAWING_MANUAL_MINOR_INVALID";
        if (code === "DRAWING_PRODUCTION_BASE_STALE") throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", "量產基準已更新", 409);
        if (code === "DRAWING_TARGET_REVISION_CLAIMED") throw new CanonicalWorkbenchError("DRAWING_TARGET_REVISION_CLAIMED", "目標版次已被占用", 409);
        if (code === "DRAWING_MANUAL_MINOR_NOT_FORWARD") throw new CanonicalWorkbenchError("DRAWING_MANUAL_MINOR_NOT_FORWARD", "自訂小版次必須大於來源版次", 422);
        if (code === "DRAWING_MANUAL_MINOR_CROSS_MAJOR") throw new CanonicalWorkbenchError("DRAWING_MANUAL_MINOR_CROSS_MAJOR", "自訂小版次不可跨越主版次", 422);
        throw new CanonicalWorkbenchError("DRAWING_MANUAL_MINOR_INVALID", "自訂小版次格式無效", 422);
      }
    }
    let branchId = source.branch_id;
    let newBranch = false;
    if (source.data_layer === "drawing_production") {
      const result = tx.kind === "postgres"
        ? await tx.query<{ id: string }>(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count + 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND open_branch_count < 3 RETURNING id`, { companyId: input.companyId, drawingId: source.drawing_id })
        : (await tx.execute(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count + 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND open_branch_count < 3`, { companyId: input.companyId, drawingId: source.drawing_id }), await tx.query<{ id: string }>(`SELECT id FROM pdm_workbench_aggregates WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND open_branch_count BETWEEN 1 AND 3`, { companyId: input.companyId, drawingId: source.drawing_id }));
      if (!result.length || source.open_branch_count >= 3) throw new CanonicalWorkbenchError("DRAWING_RD_BRANCH_LIMIT_REACHED", "已有 3 個研發分支，請先完成其中一個", 409);
      branchId = crypto.randomUUID(); newBranch = true;
      // The production row is the source snapshot embedded in every
      // candidate token.  Advance its row version as part of the same
      // transaction that claims a branch so a second tab holding the old
      // snapshot fails closed, even if the first work is later cancelled.
      await tx.execute(`UPDATE canonical_workbench_states
        SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = :sourceRowId AND company_id = :companyId AND row_version = :expectedRowVersion
          AND handling = 'none' AND work_id IS NULL`, {
        sourceRowId: input.sourceRowId,
        companyId: input.companyId,
        expectedRowVersion: input.expectedRowVersion
      });
      const versionedSource = await this.readSourceState(tx, input.companyId, input.sourceRowId, true);
      if (!versionedSource || versionedSource.row_version !== input.expectedRowVersion + 1) {
        throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      }
      await tx.execute(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, status, row_version) VALUES (:id, :companyId, :drawingId, :baseRevisionId, 'open', 1)`, { id: branchId, companyId: input.companyId, drawingId: source.drawing_id, baseRevisionId: source.revision_id });
    }
    if (!branchId) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "研發分支不存在", 409);
    if (await tx.queryOne(`SELECT id FROM drawing_revision_works WHERE company_id = :companyId AND branch_id = :branchId`, { companyId: input.companyId, branchId })) throw new CanonicalWorkbenchError("WORKBENCH_ACTIVE_WORK_EXISTS", "開啟既有工作資料", 409);
    const claimId = crypto.randomUUID();
    try {
      await tx.execute(`INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES (:id, :companyId, :drawingId, :branchId, :major, :minor, :label, :predecessorId, 'work')`, { id: claimId, companyId: input.companyId, drawingId: source.drawing_id, branchId, major: input.target.major, minor: input.target.minor, label: input.target.label, predecessorId: source.revision_id });
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new CanonicalWorkbenchError("DRAWING_TARGET_REVISION_CLAIMED", "目標版次已被占用", 409);
      throw error;
    }
    const revisionId = crypto.randomUUID();
    const policySnapshot = buildDrawingRevisionPolicySnapshot({
      selectionMode: input.selectionMode,
      sourceRowId: source.id,
      sourceRowVersion: input.expectedRowVersion,
      sourceRevisionId: source.revision_id,
      sourceBaseProductionRevisionId: source.base_production_revision_id,
      currentProductionRevisionId: source.current_production_revision_id,
      predecessorRevisionId: source.revision_id,
      resolvedMajor: input.target.major,
      requestedMinor: input.requestedMinor,
      resolvedMinor: input.target.minor,
      resolvedLabel: input.target.label
    });
    await tx.execute(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json, row_version, created_by, updated_by) VALUES (:id, :companyId, :drawingId, :revision, 'preparing', :policySnapshot, 1, :actorId, :actorId)`, { id: revisionId, companyId: input.companyId, drawingId: source.drawing_id, revision: input.target.label, policySnapshot: JSON.stringify(policySnapshot), actorId: input.ownerUserId });
    const workId = crypto.randomUUID();
    const relationRows = await tx.query<{ id: string; link_type: string }>(
      `SELECT link.part_number_id AS id, link.link_type
         FROM drawing_part_links link
         JOIN drawings drawing ON drawing.formal_drawing_number_id = link.drawing_number_id AND drawing.company_id = :companyId
        WHERE drawing.id = :drawingId
        ORDER BY link.part_number_id, link.link_type`,
      { companyId: input.companyId, drawingId: source.drawing_id }
    );
    const affectedPartNumberIds = [...new Set(relationRows.filter((row) => row.link_type === "primary_manufacturing" || row.link_type === "reference").map((row) => row.id))].sort();
    const payload = {
      recognitionNotes: "",
      changeImpact: {
        schemaVersion: 2,
        affectedPartNumberIds,
        affectedPartFingerprint: affectedPartFingerprint({ companyId: input.companyId, drawingId: source.drawing_id, revisionId, partIds: affectedPartNumberIds, relationEtag: JSON.stringify(relationRows) }),
        formState: null,
        fitState: null,
        functionState: null,
        reasonCategory: null,
        note: null,
        replacement: null
      }
    };
    await tx.execute(`INSERT INTO drawing_revision_works (id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id, proposed_payload, base_hash, row_version) VALUES (:id, :companyId, :drawingId, :branchId, :claimId, :ownerUserId, :payload, :baseHash, 1)`, { id: workId, companyId: input.companyId, drawingId: source.drawing_id, branchId, claimId, ownerUserId: input.ownerUserId, payload: JSON.stringify(payload), baseHash: dev087RequestHash({ predecessorRevisionId: source.revision_id }) });
    await tx.execute(`INSERT INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash)
      SELECT :workId, file.id, file.sort_order, COALESCE(asset.content_hash, 'unhashed:' || file.id)
      FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE file.company_id = :companyId AND file.drawing_revision_id = :sourceRevisionId AND file.removed_at IS NULL`,
      { workId, companyId: input.companyId, sourceRevisionId: source.revision_id });
    if (newBranch) {
      await tx.execute(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling, row_version) VALUES (:id, :companyId, 'drawing', :drawingId, 'drawing_rd', :branchId, :revisionId, :workId, 'owner', 1)`, { id: crypto.randomUUID(), companyId: input.companyId, drawingId: source.drawing_id, branchId, revisionId, workId });
    } else {
      await tx.execute(`UPDATE canonical_workbench_states SET revision_id = :revisionId, work_id = :workId, handling = 'owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :sourceRowId AND company_id = :companyId AND row_version = :expectedRowVersion`, { ...input, revisionId, workId });
    }
    return { workId, branchId, revisionId, revision: input.target.label, rowVersion: 1 };
  }

  async cancel(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    await this.assertWorkMutationBasis(tx, work, { cleanup: true });
    const branch = await tx.queryOne<{ latest_approved_revision_id: string | null }>(`SELECT latest_approved_revision_id FROM drawing_rd_branches WHERE id = :branchId AND company_id = :companyId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, { companyId: input.companyId, branchId: work.branch_id });
    const state = await tx.queryOne<{ handling: string }>(`SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前版本不可取消", 409);
    const recognitionSessions = await tx.query<{ id: string }>(
      `SELECT id FROM drawing_recognition_sessions
       WHERE company_id = :companyId AND source_context_type = 'drawing_revision' AND drawing_revision_id = :revisionId
       ${tx.kind === "postgres" ? "FOR UPDATE" : ""}`,
      { companyId: input.companyId, revisionId: work.revision_id }
    );
    if (recognitionSessions.length > 0) {
      const formalized = await tx.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM drawing_recognition_formalization_events event
         JOIN drawing_recognition_sessions session ON session.id = event.session_id
         WHERE session.company_id = :companyId AND session.drawing_revision_id = :revisionId`,
        { companyId: input.companyId, revisionId: work.revision_id }
      );
      if (Number(formalized?.count ?? 0) > 0) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "辨識結果已正式寫入，這筆工作資料不可直接取消", 409);
      if (tx.kind === "postgres") await tx.query(`SELECT set_config('app.dev087_cancel_revision_id', :revisionId, true)`, { revisionId: work.revision_id });
      await tx.execute(`UPDATE drawing_recognition_sessions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, locked_by = NULL, locked_at = NULL, heartbeat_at = NULL, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND drawing_revision_id = :revisionId`, { companyId: input.companyId, revisionId: work.revision_id });
      for (const table of ["drawing_recognition_decisions", "drawing_recognition_candidate_observations", "drawing_recognition_observations", "drawing_recognition_adapter_results"] as const) {
        const predicate = table === "drawing_recognition_candidate_observations"
          ? `candidate_id IN (SELECT candidate.id FROM drawing_recognition_candidates candidate JOIN drawing_recognition_sessions session ON session.id = candidate.session_id WHERE session.company_id = :companyId AND session.drawing_revision_id = :revisionId)`
          : `session_id IN (SELECT id FROM drawing_recognition_sessions WHERE company_id = :companyId AND drawing_revision_id = :revisionId)`;
        await tx.execute(`DELETE FROM ${table} WHERE ${predicate}`, { companyId: input.companyId, revisionId: work.revision_id });
      }
      await tx.execute(`DELETE FROM drawing_recognition_candidates WHERE session_id IN (SELECT id FROM drawing_recognition_sessions WHERE company_id = :companyId AND drawing_revision_id = :revisionId)`, { companyId: input.companyId, revisionId: work.revision_id });
      await tx.execute(`DELETE FROM drawing_recognition_sources WHERE session_id IN (SELECT id FROM drawing_recognition_sessions WHERE company_id = :companyId AND drawing_revision_id = :revisionId)`, { companyId: input.companyId, revisionId: work.revision_id });
      await tx.execute(`UPDATE drawing_recognition_sessions SET supersedes_session_id = NULL WHERE company_id = :companyId AND drawing_revision_id = :revisionId`, { companyId: input.companyId, revisionId: work.revision_id });
      await tx.execute(`DELETE FROM drawing_recognition_sessions WHERE company_id = :companyId AND drawing_revision_id = :revisionId`, { companyId: input.companyId, revisionId: work.revision_id });
    }
    if (branch?.latest_approved_revision_id) {
      await tx.execute(`UPDATE canonical_workbench_states SET revision_id = :revisionId, work_id = NULL, handling = 'none', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND branch_id = :branchId`, { companyId: input.companyId, branchId: work.branch_id, revisionId: branch.latest_approved_revision_id });
    } else {
      await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND branch_id = :branchId`, { companyId: input.companyId, branchId: work.branch_id });
    }
    await tx.execute(`DELETE FROM drawing_revision_work_files WHERE work_id = :workId`, input);
    await tx.execute(
      `UPDATE shared_cad_model_versions
       SET status = 'Obsolete'
       WHERE source_file_asset_id IN (
         SELECT source_file_asset_id FROM drawing_revision_files
         WHERE company_id = :companyId AND drawing_revision_id = :revisionId
       ) AND status IN ('Draft', 'Pending')`,
      { companyId: input.companyId, revisionId: work.revision_id }
    );
    await tx.execute(
      `UPDATE file_assets
       SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
           deleted_by = COALESCE(deleted_by, :actorId),
           deleted_reason = COALESCE(deleted_reason, 'drawing_revision_work_cancelled'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT source_file_asset_id FROM drawing_revision_files
         WHERE company_id = :companyId AND drawing_revision_id = :revisionId
       ) AND linked_entity_type = 'drawing_revision' AND linked_entity_id = :revisionId`,
      { companyId: input.companyId, revisionId: work.revision_id, actorId: work.owner_user_id }
    );
    await tx.execute(
      `DELETE FROM drawing_revision_files WHERE company_id = :companyId AND drawing_revision_id = :revisionId`,
      { companyId: input.companyId, revisionId: work.revision_id }
    );
    await tx.execute(`DELETE FROM drawing_revision_works WHERE id = :workId AND company_id = :companyId`, input);
    await tx.execute(`DELETE FROM drawing_revisions WHERE id = :revisionId AND company_id = :companyId AND lifecycle_state IN ('preparing','correction_required')`, { companyId: input.companyId, revisionId: work.revision_id });
    await tx.execute(`DELETE FROM drawing_revision_claims WHERE id = :claimId AND company_id = :companyId AND claim_state = 'work'`, { companyId: input.companyId, claimId: work.target_claim_id });
    if (!branch?.latest_approved_revision_id) {
      await tx.execute(`DELETE FROM drawing_rd_branches WHERE company_id = :companyId AND id = :branchId`, { companyId: input.companyId, branchId: work.branch_id });
      await tx.execute(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count - 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND open_branch_count > 0`, { companyId: input.companyId, drawingId: work.drawing_id });
    }
    return { cancelled: true };
  }

  async update(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number; payload: unknown }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    await this.assertWorkMutationBasis(tx, work);
    const state = await tx.queryOne<{ handling: string }>(`SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前版本不可編輯", 409);
    await tx.execute(`UPDATE drawing_revision_works SET proposed_payload = :payload, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`, { ...input, payload: JSON.stringify(input.payload) });
    await tx.execute(`UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId`, input);
    return { workId: input.workId, rowVersion: input.expectedRowVersion + 1, payload: input.payload };
  }

  async assertFormalizationAllowed(tx: AsyncDatabaseClient, work: DrawingWorkRow) {
    const basis = await this.assertWorkMutationBasis(tx, work);
    if (Number(work.target_minor) === 0) {
      if (basis.basisState === "stale") throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", "量產基準已更新，不能採用這個研發分支", 409);
      const pending = await tx.queryOne<{ id: string }>(
        `SELECT id FROM canonical_workbench_states
         WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId
           AND data_layer = 'drawing_rd' AND branch_id <> :branchId
           AND handling IN ('system', 'system_admin', 'blocked') LIMIT 1`,
        { companyId: work.company_id, drawingId: work.drawing_id, branchId: work.branch_id }
      );
      if (pending) throw new CanonicalWorkbenchError("DRAWING_FORMALIZATION_PENDING", "其他研發分支仍有未完成的系統處理，請先完成或解除受阻狀態", 409);
    }
    return basis;
  }

  async formalize(tx: AsyncDatabaseClient, input: { companyId: string; work: DrawingWorkRow }) {
    await this.assertFormalizationAllowed(tx, input.work);
    const proposed = typeof input.work.proposed_payload === "string" ? JSON.parse(input.work.proposed_payload) as Record<string, unknown> : input.work.proposed_payload as Record<string, unknown>;
    const changeImpact = input.work.predecessor_revision_id === null ? null : await validateDrawingChangeImpactForWork(tx, {
      companyId: input.companyId,
      drawingId: input.work.drawing_id,
      revisionId: input.work.revision_id,
      predecessorRevisionId: input.work.predecessor_revision_id,
      impact: proposed.changeImpact,
      mode: "submit"
    });
    if (changeImpact?.replacement) {
      if (!changeImpact.affectedPartNumberIds.includes(changeImpact.replacement.sourcePartNumberId)) {
        throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "替代料號的來源料件已不在本次影響集合，請重新整理後再送審", 409);
      }
      const [sourcePart, replacementPart, drawingIdentity] = await Promise.all([
        tx.queryOne<{ id: string }>(
          `SELECT id FROM part_numbers WHERE id = :partId AND company_id = :companyId`,
          { companyId: input.companyId, partId: changeImpact.replacement.sourcePartNumberId }
        ),
        tx.queryOne<{ id: string }>(
          `SELECT id FROM part_numbers WHERE part_number = :partNumber AND company_id = :companyId`,
          { companyId: input.companyId, partNumber: changeImpact.replacement.reservedPartNumber }
        ),
        tx.queryOne<{ formal_drawing_number_id: string | null }>(
          `SELECT formal_drawing_number_id FROM drawings WHERE id = :drawingId AND company_id = :companyId`,
          { companyId: input.companyId, drawingId: input.work.drawing_id }
        )
      ]);
      if (!sourcePart || !replacementPart) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "替代料號必須先保留為正式 Part identity 才能核准", 422);
      }
      if (sourcePart.id === replacementPart.id) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "替代料號不可與原料號相同", 422);
      }
      await tx.execute(
        `INSERT INTO part_replacement_links
          (id, company_id, old_part_number_id, new_part_number_id, source_drawing_number_id,
           source_revision, reason_category, fff_summary_json, released_by, released_at)
         VALUES
          (:id, :companyId, :oldPartId, :newPartId, :drawingNumberId,
           :sourceRevision, :reasonCategory, :fffSummary, :releasedBy, CURRENT_TIMESTAMP)
         ON CONFLICT (old_part_number_id, new_part_number_id) DO NOTHING`,
        {
          id: crypto.randomUUID(),
          companyId: input.companyId,
          oldPartId: sourcePart.id,
          newPartId: replacementPart.id,
          drawingNumberId: drawingIdentity?.formal_drawing_number_id ?? null,
          sourceRevision: input.work.target_label,
          reasonCategory: changeImpact.reasonCategory,
          fffSummary: JSON.stringify({
            schemaVersion: changeImpact.schemaVersion,
            formState: changeImpact.formState,
            fitState: changeImpact.fitState,
            functionState: changeImpact.functionState,
            outcome: changeImpact.outcome,
            note: changeImpact.note,
            affectedPartNumberIds: changeImpact.affectedPartNumberIds,
            affectedPartFingerprint: changeImpact.affectedPartFingerprint
          }),
          releasedBy: input.work.owner_user_id
        }
      );
    }
    const existingPolicy = await tx.queryOne<{ policy_snapshot_json: string | null }>(`SELECT policy_snapshot_json FROM drawing_revisions WHERE id = :revisionId AND company_id = :companyId`, { companyId: input.companyId, revisionId: input.work.revision_id });
    let policy: unknown = {};
    try { policy = existingPolicy?.policy_snapshot_json ? JSON.parse(existingPolicy.policy_snapshot_json) : {}; } catch { policy = {}; }
    const nextPolicy: Record<string, unknown> = mergeDrawingRevisionPolicySnapshot(policy, {});
    if (changeImpact) nextPolicy.changeImpact = changeImpact;
    else delete nextPolicy.changeImpact;
    await tx.execute(`UPDATE drawing_revisions SET policy_snapshot_json = :policySnapshot WHERE id = :revisionId AND company_id = :companyId`, { companyId: input.companyId, revisionId: input.work.revision_id, policySnapshot: JSON.stringify(nextPolicy) });
    const files = await tx.query<{
      source_file_asset_id: string; role: string; role_source: string; display_name: string; description: string;
      sort_order: number | string; is_primary: number | string;
    }>(`SELECT file.source_file_asset_id, file.role, file.role_source, file.display_name, file.description, file.sort_order, file.is_primary
        FROM drawing_revision_work_files binding
        JOIN drawing_revision_files file ON file.id = binding.file_binding_id AND file.company_id = :companyId
        WHERE binding.work_id = :workId
        ORDER BY binding.ordinal, binding.file_binding_id`, { companyId: input.companyId, workId: input.work.id });
    for (const file of files) {
      await tx.execute(`INSERT INTO drawing_revision_files
        (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, description, sort_order, is_primary, created_by)
        VALUES (:id, :companyId, :revisionId, :sourceFileAssetId, :role, :roleSource, :displayName, :description, :sortOrder, :isPrimary, :actorId)
        ON CONFLICT (drawing_revision_id, source_file_asset_id) DO NOTHING`, {
        id: crypto.randomUUID(), companyId: input.companyId, revisionId: input.work.revision_id,
        sourceFileAssetId: file.source_file_asset_id, role: file.role, roleSource: file.role_source,
        displayName: file.display_name, description: file.description, sortOrder: Number(file.sort_order),
        isPrimary: Number(file.is_primary), actorId: input.work.owner_user_id
      });
    }
    await tx.execute(`UPDATE drawing_revision_claims SET claim_state = 'approved' WHERE id = :claimId AND company_id = :companyId AND claim_state = 'work'`, { companyId: input.companyId, claimId: input.work.target_claim_id });
    if (Number(input.work.target_minor) === 0) {
      await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'superseded', superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND drawing_id = :drawingId AND lifecycle_state = 'released'`, { companyId: input.companyId, drawingId: input.work.drawing_id });
      await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'released', released_at = CURRENT_TIMESTAMP, controlled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :revisionId AND company_id = :companyId`, { companyId: input.companyId, revisionId: input.work.revision_id });
      const productionState = await tx.queryOne<{ id: string }>(
        `SELECT id FROM canonical_workbench_states
          WHERE company_id = :companyId AND entity_type = 'drawing'
            AND canonical_entity_id = :drawingId AND data_layer = 'drawing_production'
          LIMIT 1${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        { companyId: input.companyId, drawingId: input.work.drawing_id }
      );
      if (productionState) {
        await tx.execute(`UPDATE canonical_workbench_states
          SET revision_id = :revisionId, work_id = NULL, handling = 'none', blocker_reason = NULL,
              row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = :stateId AND company_id = :companyId`, {
          stateId: productionState.id,
          companyId: input.companyId,
          revisionId: input.work.revision_id
        });
      } else {
        // Pre-production drawings have no production row yet. Promotion of
        // the first major revision must create the authoritative current row
        // before the source RD branch is removed; an UPDATE-only path would
        // release revision 1 while making the drawing disappear from the UI.
        await tx.execute(`INSERT INTO canonical_workbench_states
          (id, company_id, entity_type, canonical_entity_id, data_layer,
           branch_id, revision_id, work_id, handling, blocker_reason, row_version)
          VALUES
          (:id, :companyId, 'drawing', :drawingId, 'drawing_production',
           NULL, :revisionId, NULL, 'none', NULL, 1)`, {
          id: crypto.randomUUID(),
          companyId: input.companyId,
          drawingId: input.work.drawing_id,
          revisionId: input.work.revision_id
        });
      }
      await tx.execute(`UPDATE drawing_rd_branches SET status = 'historical', closed_reason = 'production_promoted', closed_at = CURRENT_TIMESTAMP, row_version = row_version + 1 WHERE id = :branchId AND company_id = :companyId AND status = 'open'`, { companyId: input.companyId, branchId: input.work.branch_id });
      await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND branch_id = :branchId`, { companyId: input.companyId, branchId: input.work.branch_id });
      await tx.execute(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count - 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND open_branch_count > 0`, { companyId: input.companyId, drawingId: input.work.drawing_id });
    } else {
      await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'rd_controlled', controlled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :revisionId AND company_id = :companyId`, { companyId: input.companyId, revisionId: input.work.revision_id });
      await tx.execute(`UPDATE drawing_rd_branches SET latest_approved_revision_id = :revisionId, row_version = row_version + 1 WHERE id = :branchId AND company_id = :companyId AND status = 'open'`, { companyId: input.companyId, branchId: input.work.branch_id, revisionId: input.work.revision_id });
      await tx.execute(`UPDATE canonical_workbench_states SET revision_id = :revisionId, work_id = NULL, handling = 'none', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND branch_id = :branchId`, { companyId: input.companyId, branchId: input.work.branch_id, revisionId: input.work.revision_id });
    }
    await tx.execute(`DELETE FROM drawing_revision_work_files WHERE work_id = :workId`, { workId: input.work.id });
    await tx.execute(`DELETE FROM drawing_revision_works WHERE id = :workId AND company_id = :companyId`, { companyId: input.companyId, workId: input.work.id });
    return { drawingId: input.work.drawing_id, revisionId: input.work.revision_id, revision: input.work.target_label };
  }
}
