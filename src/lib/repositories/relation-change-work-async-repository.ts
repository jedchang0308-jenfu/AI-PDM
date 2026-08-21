import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";

export type RelationTreeLink = { drawingNumberId: string; partNumberId: string; linkType: "primary_manufacturing" | "reference" };
export type RelationChangeTree = { links: RelationTreeLink[] };
type WorkRow = { id: string; company_id: string; root_id: string; owner_user_id: string; proposed_tree: string | RelationChangeTree; proposed_tree_hash: string; base_formal_tree_hash: string; row_version: number };

export function validateRelationChangeTree(value: unknown): RelationChangeTree {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料關聯格式無效", 400);
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => key !== "links") || !Array.isArray(candidate.links)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料關聯格式無效", 422);
  const seen = new Set<string>();
  const primaryByPart = new Set<string>();
  const links = candidate.links.map((entry) => {
    if (!entry || typeof entry !== "object") throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料關聯項目無效", 422);
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["drawingNumberId", "partNumberId", "linkType"].includes(key)) || typeof row.drawingNumberId !== "string" || typeof row.partNumberId !== "string" || !["primary_manufacturing", "reference"].includes(String(row.linkType))) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料關聯項目無效", 422);
    }
    const link = { drawingNumberId: row.drawingNumberId, partNumberId: row.partNumberId, linkType: row.linkType as RelationTreeLink["linkType"] };
    const key = `${link.drawingNumberId}:${link.partNumberId}:${link.linkType}`;
    if (seen.has(key)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料關聯不可重複", 422);
    seen.add(key);
    if (link.linkType === "primary_manufacturing") {
      if (primaryByPart.has(link.partNumberId)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "同一料號只能有一張主要製造圖", 422);
      primaryByPart.add(link.partNumberId);
    }
    return link;
  }).sort((a, b) => `${a.drawingNumberId}:${a.partNumberId}:${a.linkType}`.localeCompare(`${b.drawingNumberId}:${b.partNumberId}:${b.linkType}`));
  return { links };
}

function parseTree(value: string | RelationChangeTree) { return validateRelationChangeTree(typeof value === "string" ? JSON.parse(value) : value); }

export class RelationChangeWorkAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async readWork(client: AsyncDatabaseClient, companyId: string, workId: string, lock = false) {
    return client.queryOne<WorkRow>(
      `SELECT id, company_id, root_id, owner_user_id, proposed_tree, proposed_tree_hash, base_formal_tree_hash, row_version
       FROM relation_change_works WHERE id = :workId AND company_id = :companyId${lock && client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { companyId, workId }
    );
  }

  async readFormalTree(client: AsyncDatabaseClient, companyId: string, rootId: string): Promise<RelationChangeTree> {
    const links = await client.query<RelationTreeLink & { drawing_number_id: string; part_number_id: string; link_type: RelationTreeLink["linkType"] }>(
      `SELECT link.drawing_number_id, link.part_number_id, link.link_type
       FROM drawing_part_links link
       JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.part_root_id = :rootId AND drawing.company_id = :companyId
       JOIN part_numbers part ON part.id = link.part_number_id AND part.part_root_id = :rootId AND part.company_id = :companyId
       ORDER BY link.drawing_number_id, link.part_number_id, link.link_type`,
      { companyId, rootId }
    );
    return { links: links.map((row) => ({ drawingNumberId: row.drawing_number_id, partNumberId: row.part_number_id, linkType: row.link_type })) };
  }

  async validateTreeReferences(client: AsyncDatabaseClient, companyId: string, rootId: string, tree: RelationChangeTree) {
    if (!tree.links.length) return;
    const drawingIds = [...new Set(tree.links.map((link) => link.drawingNumberId))];
    const partIds = [...new Set(tree.links.map((link) => link.partNumberId))];
    const params = { companyId, rootId, ...Object.fromEntries(drawingIds.map((id, index) => [`drawing${index}`, id])), ...Object.fromEntries(partIds.map((id, index) => [`part${index}`, id])) };
    const drawings = await client.query<{ id: string }>(`SELECT id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND id IN (${drawingIds.map((_, index) => `:drawing${index}`).join(",")})`, params);
    const parts = await client.query<{ id: string }>(`SELECT id FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND id IN (${partIds.map((_, index) => `:part${index}`).join(",")})`, params);
    if (drawings.length !== drawingIds.length || parts.length !== partIds.length) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "關聯目標已改變，請重新載入", 409);
  }

  async create(tx: AsyncDatabaseClient, input: { companyId: string; rootId: string; ownerUserId: string; expectedFormalRowVersion: number }) {
    const root = await tx.queryOne<{ id: string }>(`SELECT id FROM part_roots WHERE id = :rootId AND company_id = :companyId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (!root) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料根號不存在", 404);
    const formal = await tx.queryOne<{ row_version: number }>(`SELECT row_version FROM canonical_workbench_states WHERE company_id = :companyId AND entity_type = 'relation' AND canonical_entity_id = :rootId AND data_layer = 'relation_formal'${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (!formal || Number(formal.row_version) !== input.expectedFormalRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    if (await tx.queryOne(`SELECT id FROM relation_change_works WHERE company_id = :companyId AND root_id = :rootId`, input)) throw new CanonicalWorkbenchError("WORKBENCH_ACTIVE_WORK_EXISTS", "開啟既有工作資料", 409);
    const tree = await this.readFormalTree(tx, input.companyId, input.rootId);
    const treeHash = dev087RequestHash(tree);
    const workId = crypto.randomUUID();
    await tx.execute(
      `INSERT INTO relation_change_works (id, company_id, root_id, owner_user_id, proposed_tree, proposed_tree_hash, base_formal_tree_hash, row_version)
       VALUES (:id, :companyId, :rootId, :ownerUserId, :tree, :treeHash, :treeHash, 1)`,
      { id: workId, ...input, tree: JSON.stringify(tree), treeHash }
    );
    const stateId = crypto.randomUUID();
    await tx.execute(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, row_version) VALUES (:id, :companyId, 'relation', :rootId, 'relation_work', :workId, 'owner', 1)`, { id: stateId, ...input, workId });
    return { workId, rowId: stateId, rowVersion: 1, tree };
  }

  async update(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number; tree: RelationChangeTree }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const state = await tx.queryOne<{ handling: string }>(
      `SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前資料不可編輯", 409);
    await this.validateTreeReferences(tx, input.companyId, work.root_id, input.tree);
    const treeHash = dev087RequestHash(input.tree);
    await tx.execute(`UPDATE relation_change_works SET proposed_tree = :tree, proposed_tree_hash = :treeHash, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`, { ...input, tree: JSON.stringify(input.tree), treeHash });
    await tx.execute(`UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId`, input);
    return { workId: input.workId, rowVersion: input.expectedRowVersion + 1, tree: input.tree };
  }

  async cancel(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const state = await tx.queryOne<{ handling: string }>(`SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前資料不可取消", 409);
    await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId`, input);
    await tx.execute(`DELETE FROM relation_change_works WHERE company_id = :companyId AND id = :workId`, input);
    return { cancelled: true };
  }

  async formalize(tx: AsyncDatabaseClient, input: { companyId: string; work: WorkRow; reviewCycleId: string }) {
    const before = await this.readFormalTree(tx, input.companyId, input.work.root_id);
    const after = parseTree(input.work.proposed_tree);
    await this.validateTreeReferences(tx, input.companyId, input.work.root_id, after);
    if (dev087RequestHash(before) !== input.work.base_formal_tree_hash) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    const snapshotId = crypto.randomUUID();
    await tx.execute(`INSERT INTO relation_approved_change_snapshots (id, company_id, root_id, before_tree, after_tree, content_hash, formalized_at) VALUES (:id, :companyId, :rootId, :beforeTree, :afterTree, :contentHash, CURRENT_TIMESTAMP)`, { id: snapshotId, companyId: input.companyId, rootId: input.work.root_id, beforeTree: JSON.stringify(before), afterTree: JSON.stringify(after), contentHash: dev087RequestHash({ reviewCycleId: input.reviewCycleId, before, after }) });
    await tx.execute(`DELETE FROM drawing_part_links WHERE id IN (SELECT link.id FROM drawing_part_links link JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id WHERE drawing.company_id = :companyId AND drawing.part_root_id = :rootId)`, { companyId: input.companyId, rootId: input.work.root_id });
    for (const link of after.links) {
      await tx.execute(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES (:id, :drawingNumberId, :partNumberId, :linkType, :createdBy)`, { id: crypto.randomUUID(), ...link, createdBy: input.work.owner_user_id });
    }
    await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(`DELETE FROM relation_change_works WHERE company_id = :companyId AND id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(`UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'relation' AND canonical_entity_id = :rootId AND data_layer = 'relation_formal'`, { companyId: input.companyId, rootId: input.work.root_id });
    return { snapshotId, rootId: input.work.root_id };
  }
}
