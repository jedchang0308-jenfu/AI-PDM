import crypto from "node:crypto";
import type { SqliteDatabase } from "@/lib/db-provider";

export type SyncFormalRelationType = "manufacturing_basis" | "reference";

/** SQLite adapter for the same formal relation authority used by async code. */
export class RelationFormalAuthoritySyncRepository {
  constructor(private readonly database: SqliteDatabase) {}

  upsertPair(input: {
    companyId: string;
    drawingNumberId: string;
    partNumberId: string;
    relationType: SyncFormalRelationType;
    actorId: string | null;
    id?: string;
  }) {
    const scope = this.database.prepare(`
      SELECT drawing.part_root_id AS root_id
      FROM drawing_numbers drawing
      JOIN part_numbers part ON part.part_root_id = drawing.part_root_id
      WHERE drawing.company_id = @companyId AND part.company_id = @companyId
        AND drawing.id = @drawingNumberId AND part.id = @partNumberId
    `).get(input) as { root_id: string } | undefined;
    if (!scope) throw new Error("DRAWING_PART_ROOT_MISMATCH");
    if (input.relationType === "manufacturing_basis") {
      this.database.prepare(`UPDATE drawing_part_links
        SET link_type = 'reference'
        WHERE part_number_id = @partNumberId
          AND link_type = 'primary_manufacturing'
          AND drawing_number_id <> @drawingNumberId`).run(input);
    }
    this.database.prepare(`DELETE FROM drawing_part_links WHERE drawing_number_id = @drawingNumberId AND part_number_id = @partNumberId`).run(input);
    this.database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
      VALUES (@id, @drawingNumberId, @partNumberId, @linkType, @actorId, @createdAt)`).run({
      ...input,
      id: input.id ?? crypto.randomUUID(),
      linkType: input.relationType === "manufacturing_basis" ? "primary_manufacturing" : "reference",
      createdAt: new Date().toISOString()
    });
  }

  removePair(input: { companyId: string; drawingNumberId: string; partNumberId: string }) {
    this.database.prepare(`DELETE FROM drawing_part_links
      WHERE drawing_number_id = @drawingNumberId AND part_number_id = @partNumberId
        AND EXISTS (SELECT 1 FROM drawing_numbers drawing JOIN part_numbers part ON part.part_root_id = drawing.part_root_id
          WHERE drawing.id = @drawingNumberId AND part.id = @partNumberId AND drawing.company_id = @companyId AND part.company_id = @companyId)`).run(input);
  }

  removeRootLinks(input: { companyId: string; rootId: string }) {
    this.database.prepare(`DELETE FROM drawing_part_links
      WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE company_id = @companyId AND part_root_id = @rootId)`).run(input);
  }
}
