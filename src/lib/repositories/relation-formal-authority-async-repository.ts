import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError, type CanonicalRelationMatrixCell, type CanonicalRelationMatrixProjection } from "@/lib/pdm-canonical-workbench-contract";
import { replayCanonicalTerminalReceipt, runCanonicalIdempotentCommand } from "@/lib/pdm-canonical-command";

type RelationAuthorityClient = Pick<AsyncDatabaseClient, "kind" | "query" | "queryOne" | "execute"> & {
  transaction?: AsyncDatabaseClient["transaction"];
};

export type RelationMatrixChange = {
  drawingNumberId: string;
  partNumberId: string;
  relationType: "manufacturing_basis" | "reference" | null;
};

export type FormalRelationLinkInput = {
  drawingNumberId: string;
  partNumberId: string;
  relationType: "manufacturing_basis" | "reference";
};

type AxisRow = { kind: "drawing" | "part"; id: string; number: string; root_id: string };
type LinkRow = { drawing_number_id: string; part_number_id: string; link_type: "primary_manufacturing" | "reference" };

function canonicalMatrixJson(input: {
  rootId: string;
  rootCode: string;
  drawings: Array<{ id: string; number: string }>;
  parts: Array<{ id: string; number: string }>;
  cells: CanonicalRelationMatrixCell[];
}) {
  return JSON.stringify({
    rootId: input.rootId,
    rootCode: input.rootCode,
    drawings: input.drawings,
    parts: input.parts,
    cells: input.cells.map((cell) => ({ drawingNumberId: cell.drawingNumberId, partNumberId: cell.partNumberId, relationType: cell.relationType }))
  });
}

function etagFor(input: Parameters<typeof canonicalMatrixJson>[0]) {
  return crypto.createHash("sha256").update(canonicalMatrixJson(input)).digest("hex");
}

function normalizeIfMatch(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^W\//u, "").replace(/^"|"$/gu, "") ?? "";
  return normalized || null;
}

export class RelationFormalAuthorityRepository {
  constructor(private readonly client: RelationAuthorityClient) {}

  async rootForEntity(input: { companyId: string; entityType: "drawing" | "part"; entityId: string }) {
    const row = input.entityType === "drawing"
      ? await this.client.queryOne<{ root_id: string }>(`SELECT part_root_id AS root_id FROM drawings WHERE company_id = :companyId AND id = :entityId`, input)
      : await this.client.queryOne<{ root_id: string }>(`SELECT part_root_id AS root_id FROM part_numbers WHERE company_id = :companyId AND id = :entityId`, input);
    return row?.root_id ?? null;
  }

  async getMatrix(input: { companyId: string; rootId: string }): Promise<CanonicalRelationMatrixProjection> {
    return this.readMatrix(this.client, input);
  }

  async upsertPair(input: { companyId: string; drawingNumberId: string; partNumberId: string; relationType: "manufacturing_basis" | "reference"; actorId: string | null; id?: string }) {
    if (this.client.transaction) return this.client.transaction((tx) => this.upsertPairInClient(tx, input));
    return this.upsertPairInClient(this.client, input);
  }

  async upsertPairInClient(client: RelationAuthorityClient, input: { companyId: string; drawingNumberId: string; partNumberId: string; relationType: "manufacturing_basis" | "reference"; actorId: string | null; id?: string }) {
    const scope = await client.queryOne<{ root_id: string }>(`SELECT drawing.part_root_id AS root_id
      FROM drawing_numbers drawing JOIN part_numbers part ON part.part_root_id = drawing.part_root_id
      WHERE drawing.company_id = :companyId AND part.company_id = :companyId
        AND drawing.id = :drawingNumberId AND part.id = :partNumberId`, input);
    if (!scope) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖號與料號不屬於同一圖料根號", 422);
    await client.queryOne(`SELECT id FROM part_roots WHERE id = :rootId AND company_id = :companyId${client.kind === "postgres" ? " FOR UPDATE" : ""}`, { companyId: input.companyId, rootId: scope.root_id });
    if (input.relationType === "manufacturing_basis") {
      await client.execute(`UPDATE drawing_part_links SET link_type = 'reference'
        WHERE part_number_id = :partNumberId AND link_type = 'primary_manufacturing' AND drawing_number_id <> :drawingNumberId`, input);
    }
    await client.execute(`DELETE FROM drawing_part_links WHERE drawing_number_id = :drawingNumberId AND part_number_id = :partNumberId`, input);
    await client.execute(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
      VALUES (:id, :drawingNumberId, :partNumberId, :linkType, :actorId)`, {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      linkType: input.relationType === "manufacturing_basis" ? "primary_manufacturing" : "reference"
    });
  }

  async removePair(input: { companyId: string; drawingNumberId: string; partNumberId: string }) {
    if (this.client.transaction) return this.client.transaction((tx) => this.removePairInClient(tx, input));
    return this.removePairInClient(this.client, input);
  }

  async removePairInClient(client: RelationAuthorityClient, input: { companyId: string; drawingNumberId: string; partNumberId: string }) {
    const scope = await client.queryOne<{ root_id: string }>(`SELECT drawing.part_root_id AS root_id
      FROM drawing_numbers drawing JOIN part_numbers part ON part.part_root_id = drawing.part_root_id
      WHERE drawing.company_id = :companyId AND part.company_id = :companyId
        AND drawing.id = :drawingNumberId AND part.id = :partNumberId`, input);
    if (!scope) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖號與料號不屬於同一圖料根號", 422);
    await client.queryOne(`SELECT id FROM part_roots WHERE id = :rootId AND company_id = :companyId${client.kind === "postgres" ? " FOR UPDATE" : ""}`, { companyId: input.companyId, rootId: scope.root_id });
    await client.execute(`DELETE FROM drawing_part_links WHERE drawing_number_id = :drawingNumberId AND part_number_id = :partNumberId`, input);
  }

  /**
   * Administrative replacement used by the retired relation-work importer and
   * other lifecycle code.  It deliberately stays behind the same authority as
   * the inline matrix PATCH so no legacy flow can write drawing_part_links
   * directly.
   */
  async replaceRootLinksInClient(client: RelationAuthorityClient, input: {
    companyId: string;
    rootId: string;
    links: FormalRelationLinkInput[];
    actorId: string | null;
  }) {
    await client.queryOne<{ id: string }>(`SELECT id FROM part_roots WHERE id = :rootId AND company_id = :companyId${client.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    const seen = new Set<string>();
    for (const link of input.links) {
      const key = `${link.drawingNumberId}:${link.partNumberId}`;
      if (seen.has(key)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯格不可重複", 422);
      seen.add(key);
    }
    await this.validateRootLinks(client, input.companyId, input.rootId, input.links);
    await client.execute(`DELETE FROM drawing_part_links WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId)`, input);
    for (const link of input.links) {
      await this.upsertPairInClient(client, {
        companyId: input.companyId,
        drawingNumberId: link.drawingNumberId,
        partNumberId: link.partNumberId,
        relationType: link.relationType,
        actorId: input.actorId
      });
    }
  }

  async removeRootLinksInClient(client: RelationAuthorityClient, input: { companyId: string; rootId: string }) {
    await client.queryOne<{ id: string }>(`SELECT id FROM part_roots WHERE id = :rootId AND company_id = :companyId${client.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    await client.execute(`DELETE FROM drawing_part_links WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId)`, input);
  }

  async applyMatrix(input: {
    companyId: string;
    rootId: string;
    actorId: string;
    changes: RelationMatrixChange[];
    ifMatch: string | null | undefined;
    idempotencyKey: string;
  }) {
    const changes = validateChanges(input.changes);
    const expectedEtag = normalizeIfMatch(input.ifMatch);
    if (!expectedEtag) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "缺少有效的關聯矩陣版本", 400);
    if (changes.length > 2500) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "單次最多修改 2500 個關聯格", 413);
    const request = { rootId: input.rootId, changes, ifMatch: expectedEtag };
    const replay = await replayCanonicalTerminalReceipt<{
      rootId: string;
      changedCount: number;
      matrixEtag: string;
      matrix: CanonicalRelationMatrixProjection;
    }>(this.client as AsyncDatabaseClient, {
      companyId: input.companyId,
      command: "pdm.relation_matrix.update.v1",
      idempotencyKey: input.idempotencyKey,
      request,
      correlationId: crypto.randomUUID()
    });
    if (replay) return replay;

    const preflight = await this.getMatrix({ companyId: input.companyId, rootId: input.rootId });
    if (preflight.matrixEtag !== expectedEtag) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "關聯矩陣已被其他人修改，請重新整理", 409);
    const preflightDrawingIds = new Set(preflight.drawings.map((item) => item.id));
    const preflightPartIds = new Set(preflight.parts.map((item) => item.id));
    if (changes.some((change) => !preflightDrawingIds.has(change.drawingNumberId) || !preflightPartIds.has(change.partNumberId))) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯格不屬於目前圖料根號", 422);
    }
    const currentByPair = new Map(preflight.cells.map((cell) => [`${cell.drawingNumberId}:${cell.partNumberId}`, cell.relationType]));
    if (changes.every((change) => (currentByPair.get(`${change.drawingNumberId}:${change.partNumberId}`) ?? null) === change.relationType)) {
      return { rootId: input.rootId, changedCount: 0, matrixEtag: preflight.matrixEtag, matrix: preflight };
    }
    return runCanonicalIdempotentCommand(this.client as AsyncDatabaseClient, {
      companyId: input.companyId,
      actorId: input.actorId,
      command: "pdm.relation_matrix.update.v1",
      idempotencyKey: input.idempotencyKey,
      request,
      effectKey: `pdm.relation_matrix.update.v1:${input.rootId}:${expectedEtag}`,
      correlationId: crypto.randomUUID()
    }, async (tx) => {
      // PostgreSQL takes a row lock; SQLite's BEGIN IMMEDIATE gives the same
      // root-first serialization guarantee for the single local connection.
      const root = await tx.queryOne<{ id: string; root_code: string }>(`SELECT id, root_code FROM part_roots WHERE company_id = :companyId AND id = :rootId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, { companyId: input.companyId, rootId: input.rootId });
      if (!root) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖料根號不存在", 404);
      const current = await this.readMatrix(tx, input);
      if (current.matrixEtag !== expectedEtag) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "關聯矩陣已被其他人修改，請重新整理", 409);
      const drawingIds = new Set(current.drawings.map((item) => item.id));
      const partIds = new Set(current.parts.map((item) => item.id));
      for (const change of changes) {
        if (!drawingIds.has(change.drawingNumberId) || !partIds.has(change.partNumberId)) {
          throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯格不屬於目前圖料根號", 422);
        }
      }
      assertFinalPrimaryUniqueness(current.cells, changes);
      const changesJson = JSON.stringify(changes);
      if (tx.kind === "postgres") {
        await tx.execute(`UPDATE drawing_part_links SET link_type = 'reference'
          WHERE link_type = 'primary_manufacturing'
            AND part_number_id IN (SELECT "partNumberId" FROM jsonb_to_recordset(CAST(:changesJson AS jsonb)) AS change("drawingNumberId" text, "partNumberId" text, "relationType" text) WHERE "relationType" = 'manufacturing_basis')
            AND drawing_number_id NOT IN (SELECT "drawingNumberId" FROM jsonb_to_recordset(CAST(:changesJson AS jsonb)) AS change("drawingNumberId" text, "partNumberId" text, "relationType" text) WHERE "relationType" = 'manufacturing_basis')`, { changesJson });
        await tx.execute(`DELETE FROM drawing_part_links link USING jsonb_to_recordset(CAST(:changesJson AS jsonb)) AS change("drawingNumberId" text, "partNumberId" text, "relationType" text)
          WHERE link.drawing_number_id = change."drawingNumberId" AND link.part_number_id = change."partNumberId"`, { changesJson });
        await tx.execute(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
          SELECT md5(random()::text || clock_timestamp()::text || "drawingNumberId" || "partNumberId"), "drawingNumberId", "partNumberId",
                 CASE "relationType" WHEN 'manufacturing_basis' THEN 'primary_manufacturing' ELSE 'reference' END,
                 :actorId
            FROM jsonb_to_recordset(CAST(:changesJson AS jsonb)) AS change("drawingNumberId" text, "partNumberId" text, "relationType" text)
           WHERE "relationType" IS NOT NULL`, { changesJson, actorId: input.actorId });
      } else {
        await tx.execute(`UPDATE drawing_part_links SET link_type = 'reference'
          WHERE link_type = 'primary_manufacturing'
            AND part_number_id IN (SELECT json_extract(value, '$.partNumberId') FROM json_each(:changesJson) WHERE json_extract(value, '$.relationType') = 'manufacturing_basis')
            AND drawing_number_id NOT IN (SELECT json_extract(value, '$.drawingNumberId') FROM json_each(:changesJson) WHERE json_extract(value, '$.relationType') = 'manufacturing_basis')`, { changesJson });
        await tx.execute(`DELETE FROM drawing_part_links
          WHERE (drawing_number_id || ':' || part_number_id) IN (SELECT json_extract(value, '$.drawingNumberId') || ':' || json_extract(value, '$.partNumberId') FROM json_each(:changesJson))`, { changesJson });
        await tx.execute(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
          SELECT lower(hex(randomblob(16))), json_extract(value, '$.drawingNumberId'), json_extract(value, '$.partNumberId'),
                 CASE json_extract(value, '$.relationType') WHEN 'manufacturing_basis' THEN 'primary_manufacturing' ELSE 'reference' END, :actorId
            FROM json_each(:changesJson) WHERE json_extract(value, '$.relationType') IS NOT NULL`, { changesJson, actorId: input.actorId });
      }
      const next = await this.readMatrix(tx, input);
      return { rootId: input.rootId, changedCount: changes.length, matrixEtag: next.matrixEtag, matrix: next };
    });
  }

  private async readMatrix(client: RelationAuthorityClient, input: { companyId: string; rootId: string }): Promise<CanonicalRelationMatrixProjection> {
    const root = await client.queryOne<{ id: string; root_code: string }>(`SELECT id, root_code FROM part_roots WHERE company_id = :companyId AND id = :rootId`, input);
    if (!root) throw new CanonicalWorkbenchError("WORKBENCH_RELATION_SCOPE_INVALID", "圖料關聯資料不完整，請聯絡系統管理員", 409);
    const axes = await client.query<AxisRow>(`SELECT 'drawing' AS kind, id, drawing_number AS number, part_root_id AS root_id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId
      UNION ALL SELECT 'part' AS kind, id, part_number AS number, part_root_id AS root_id FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId
      ORDER BY kind, number, id`, input);
    const drawings = axes.filter((row) => row.kind === "drawing").map((row) => ({ id: row.id, number: row.number }));
    const parts = axes.filter((row) => row.kind === "part").map((row) => ({ id: row.id, number: row.number }));
    const links = await client.query<LinkRow>(`SELECT link.drawing_number_id, link.part_number_id, link.link_type
      FROM drawing_part_links link
      JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.company_id = :companyId AND drawing.part_root_id = :rootId
      JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = :companyId AND part.part_root_id = :rootId
      ORDER BY link.drawing_number_id, link.part_number_id, link.link_type`, input);
    const drawingNumbers = new Map(drawings.map((item) => [item.id, item.number]));
    const partNumbers = new Map(parts.map((item) => [item.id, item.number]));
    const seen = new Set<string>();
    const cells = links.map((link) => {
      const drawingNumber = drawingNumbers.get(link.drawing_number_id);
      const partNumber = partNumbers.get(link.part_number_id);
      const pair = `${link.drawing_number_id}:${link.part_number_id}`;
      if (!drawingNumber || !partNumber || seen.has(pair)) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "關聯矩陣資料重複或已失效", 409);
      seen.add(pair);
      return { drawingNumberId: link.drawing_number_id, partNumberId: link.part_number_id, drawingNumber, partNumber, relationType: link.link_type === "primary_manufacturing" ? "manufacturing_basis" as const : "reference" as const };
    });
    const projection = { rootId: root.id, rootCode: root.root_code, drawings, parts, cells };
    return { ...projection, matrixEtag: etagFor(projection) };
  }

  private async validateRootLinks(client: RelationAuthorityClient, companyId: string, rootId: string, links: FormalRelationLinkInput[]) {
    if (!links.length) return;
    const drawingIds = [...new Set(links.map((link) => link.drawingNumberId))];
    const partIds = [...new Set(links.map((link) => link.partNumberId))];
    const params = {
      companyId,
      rootId,
      ...Object.fromEntries(drawingIds.map((id, index) => [`drawing${index}`, id])),
      ...Object.fromEntries(partIds.map((id, index) => [`part${index}`, id]))
    };
    const drawings = await client.query<{ id: string }>(`SELECT id FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND id IN (${drawingIds.map((_, index) => `:drawing${index}`).join(",")})`, params);
    const parts = await client.query<{ id: string }>(`SELECT id FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND id IN (${partIds.map((_, index) => `:part${index}`).join(",")})`, params);
    if (drawings.length !== drawingIds.length || parts.length !== partIds.length) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "關聯目標已改變，請重新載入", 409);
    const primaryParts = links.filter((link) => link.relationType === "manufacturing_basis").map((link) => link.partNumberId);
    if (new Set(primaryParts).size !== primaryParts.length) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "同一料號只能有一張主要製造圖", 422);
  }
}

function validateChanges(value: RelationMatrixChange[]) {
  if (!Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯矩陣格式無效", 400);
  const seen = new Set<string>();
  return value.map((change) => {
    if (!change || typeof change.drawingNumberId !== "string" || typeof change.partNumberId !== "string" || !["manufacturing_basis", "reference", null].includes(change.relationType)) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯矩陣格式無效", 400);
    }
    const drawingNumberId = change.drawingNumberId.trim();
    const partNumberId = change.partNumberId.trim();
    if (!drawingNumberId || !partNumberId) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "關聯格識別不可為空", 400);
    const key = `${drawingNumberId}:${partNumberId}`;
    if (seen.has(key)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "同一關聯格不可重複提交", 422);
    seen.add(key);
    return { drawingNumberId, partNumberId, relationType: change.relationType };
  });
}

function assertFinalPrimaryUniqueness(current: CanonicalRelationMatrixCell[], changes: RelationMatrixChange[]) {
  const finalByPair = new Map(current.map((cell) => [`${cell.drawingNumberId}:${cell.partNumberId}`, cell.relationType]));
  for (const change of changes) {
    const key = `${change.drawingNumberId}:${change.partNumberId}`;
    if (change.relationType === null) finalByPair.delete(key);
    else finalByPair.set(key, change.relationType);
  }
  const manufacturingByPart = new Set<string>();
  for (const [key, relationType] of finalByPair) {
    if (relationType !== "manufacturing_basis") continue;
    const partNumberId = key.slice(key.indexOf(":") + 1);
    if (manufacturingByPart.has(partNumberId)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "同一料號只能有一張主要製造圖", 409);
    manufacturingByPart.add(partNumberId);
  }
}
