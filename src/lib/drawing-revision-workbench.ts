import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { PdmChangeControlError } from "@/lib/pdm-change-control-domain";
import { compareRevisionCodes, suggestRevisionCode } from "@/lib/revision-policy";
import { listSubmissionRevisionsByDrawingAsync } from "@/lib/submissions-async";

export type DrawingRevisionResolveStatus =
  | "no_input"
  | "not_found"
  | "ambiguous_query"
  | "resolved"
  | "resolved_with_missing_part"
  | "multiple_primary_parts";

export type ResolvedDrawing = {
  id: string;
  drawingNumber: string;
  purposeCode: string;
  purposeDescription: string;
  developmentPhase: string;
  recordStatus: string;
  partRootId: string;
  rootCode: string | null;
  coreName: string | null;
};

export type ResolvedPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  developmentPhase: string;
  recordStatus: string;
};

export type DrawingRevisionResolvedContext = {
  status: DrawingRevisionResolveStatus;
  drawing: ResolvedDrawing | null;
  primaryParts: ResolvedPart[];
  selectedPrimaryPart: ResolvedPart | null;
  suggestedRevision: string;
  latestRevision: string | null;
  revisionCount: number;
  candidates: ResolvedDrawing[];
};

type DrawingRow = {
  id: string;
  drawing_number: string;
  purpose_code: string;
  purpose_description: string;
  development_phase: string;
  record_status: string;
  part_root_id: string;
  root_code: string | null;
  core_name: string | null;
};

type PartRow = {
  id: string;
  part_number: string;
  part_name: string;
  item_kind: string;
  development_phase: string;
  record_status: string;
};

type ResolveInput = {
  companyId: string;
  drawingNumberId?: string | null;
  drawingNumber?: string | null;
  partNumber?: string | null;
  query?: string | null;
  limit?: number;
};

export async function resolveDrawingRevisionContext(input: ResolveInput): Promise<DrawingRevisionResolvedContext> {
  const client = getAsyncDatabaseClient();
  const drawingNumberId = normalizeText(input.drawingNumberId);
  const drawingNumber = normalizeText(input.drawingNumber);
  const partNumber = normalizeText(input.partNumber);
  const query = normalizeText(input.query);
  const limit = clampLimit(input.limit);

  let candidates: ResolvedDrawing[] = [];
  if (drawingNumberId) {
    const row = await findDrawingById(client, input.companyId, drawingNumberId);
    if (!row) return unresolved("not_found");
    candidates = [mapDrawing(row)];
  } else if (drawingNumber) {
    const row = await findDrawingByNumber(client, input.companyId, drawingNumber);
    if (!row) return unresolved("not_found");
    candidates = [mapDrawing(row)];
  } else if (partNumber) {
    candidates = (await findDrawingsByPartNumber(client, input.companyId, partNumber, limit)).map(mapDrawing);
  } else if (query) {
    candidates = (await searchDrawings(client, input.companyId, query, limit)).map(mapDrawing);
  } else {
    return unresolved("no_input");
  }

  if (candidates.length === 0) return unresolved("not_found");
  if (candidates.length > 1) {
    return {
      ...unresolved("ambiguous_query"),
      candidates
    };
  }

  return buildResolvedContext(client, input.companyId, candidates[0]);
}

export async function requireResolvedDrawingRevisionContext(input: ResolveInput): Promise<DrawingRevisionResolvedContext> {
  const context = await resolveDrawingRevisionContext(input);
  if (!context.drawing) {
    throw new PdmChangeControlError(context.status === "ambiguous_query" ? "drawing_number_ambiguous" : "drawing_number_not_found", undefined, {
      candidates: context.candidates.map((candidate) => candidate.drawingNumber)
    });
  }
  return context;
}

async function buildResolvedContext(client: AsyncDatabaseClient, companyId: string, drawing: ResolvedDrawing) {
  const primaryParts = (await findPrimaryParts(client, companyId, drawing.id)).map(mapPart);
  const revisions = await listSubmissionRevisionsByDrawingAsync({ companyId, drawingNumber: drawing.drawingNumber });
  const latestRevision = latestRevisionByVersion(revisions.map((revision) => revision.revision));
  return {
    status: primaryParts.length === 0 ? "resolved_with_missing_part" : primaryParts.length > 1 ? "multiple_primary_parts" : "resolved",
    drawing,
    primaryParts,
    selectedPrimaryPart: primaryParts.length === 1 ? primaryParts[0] : null,
    suggestedRevision: suggestRevisionCode(revisions, "rd_workspace"),
    latestRevision,
    revisionCount: revisions.length,
    candidates: [drawing]
  } satisfies DrawingRevisionResolvedContext;
}

function latestRevisionByVersion(revisions: string[]) {
  return revisions.reduce<string | null>((latest, revision) => {
    if (!revision) return latest;
    if (!latest) return revision;
    return compareRevisionCodes(revision, latest, { allowLegacy: true }) > 0 ? revision : latest;
  }, null);
}

function unresolved(status: DrawingRevisionResolveStatus): DrawingRevisionResolvedContext {
  return {
    status,
    drawing: null,
    primaryParts: [],
    selectedPrimaryPart: null,
    suggestedRevision: "0.1",
    latestRevision: null,
    revisionCount: 0,
    candidates: []
  };
}

async function findDrawingById(client: AsyncDatabaseClient, companyId: string, drawingNumberId: string) {
  return client.queryOne<DrawingRow>(
    `
    SELECT d.*, r.root_code, r.core_name
    FROM drawing_numbers d
    LEFT JOIN part_roots r ON r.id = d.part_root_id
    WHERE d.company_id = :companyId
      AND d.id = :drawingNumberId
    LIMIT 1
    `,
    { companyId, drawingNumberId }
  );
}

async function findDrawingByNumber(client: AsyncDatabaseClient, companyId: string, drawingNumber: string) {
  return client.queryOne<DrawingRow>(
    `
    SELECT d.*, r.root_code, r.core_name
    FROM drawing_numbers d
    LEFT JOIN part_roots r ON r.id = d.part_root_id
    WHERE d.company_id = :companyId
      AND d.drawing_number = :drawingNumber
    LIMIT 1
    `,
    { companyId, drawingNumber }
  );
}

async function findDrawingsByPartNumber(client: AsyncDatabaseClient, companyId: string, partNumber: string, limit: number) {
  return client.query<DrawingRow>(
    `
    SELECT DISTINCT d.*, r.root_code, r.core_name
    FROM part_numbers p
    JOIN drawing_part_links l ON l.part_number_id = p.id
    JOIN drawing_numbers d ON d.id = l.drawing_number_id
    LEFT JOIN part_roots r ON r.id = d.part_root_id
    WHERE p.company_id = :companyId
      AND d.company_id = :companyId
      AND p.part_number = :partNumber
    ORDER BY CASE WHEN l.link_type = 'primary_manufacturing' THEN 0 ELSE 1 END, d.drawing_number ASC
    LIMIT :limit
    `,
    { companyId, partNumber, limit }
  );
}

async function searchDrawings(client: AsyncDatabaseClient, companyId: string, query: string, limit: number) {
  return client.query<DrawingRow>(
    `
    SELECT DISTINCT d.*, r.root_code, r.core_name
    FROM drawing_numbers d
    LEFT JOIN part_roots r ON r.id = d.part_root_id
    WHERE d.company_id = :companyId
      AND (
        d.drawing_number = :query
        OR LOWER(d.drawing_number) LIKE LOWER(:likeQuery)
        OR EXISTS (
          SELECT 1
          FROM drawing_part_links l
          JOIN part_numbers p ON p.id = l.part_number_id
          WHERE l.drawing_number_id = d.id
            AND p.company_id = :companyId
            AND (p.part_number = :query OR LOWER(p.part_number) LIKE LOWER(:likeQuery))
        )
      )
    ORDER BY CASE WHEN d.drawing_number = :query THEN 0 ELSE 1 END, d.drawing_number ASC
    LIMIT :limit
    `,
    { companyId, query, likeQuery: `%${query}%`, limit }
  );
}

async function findPrimaryParts(client: AsyncDatabaseClient, companyId: string, drawingNumberId: string) {
  return client.query<PartRow>(
    `
    SELECT p.*
    FROM drawing_part_links l
    JOIN part_numbers p ON p.id = l.part_number_id
    WHERE l.drawing_number_id = :drawingNumberId
      AND l.link_type = 'primary_manufacturing'
      AND p.company_id = :companyId
    ORDER BY p.part_number ASC
    `,
    { companyId, drawingNumberId }
  );
}

function mapDrawing(row: DrawingRow): ResolvedDrawing {
  return {
    id: row.id,
    drawingNumber: row.drawing_number,
    purposeCode: row.purpose_code,
    purposeDescription: row.purpose_description,
    developmentPhase: row.development_phase,
    recordStatus: row.record_status,
    partRootId: row.part_root_id,
    rootCode: row.root_code,
    coreName: row.core_name
  };
}

function mapPart(row: PartRow): ResolvedPart {
  return {
    id: row.id,
    partNumber: row.part_number,
    partName: row.part_name,
    itemKind: row.item_kind,
    developmentPhase: row.development_phase,
    recordStatus: row.record_status
  };
}

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function clampLimit(value: number | undefined) {
  const number = Number(value ?? 8);
  if (!Number.isFinite(number)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(number)));
}
