import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export const PUBLICATION_EVIDENCE_RULE_VERSION = "numbering-publication-evidence-v1";

export type PublicationEvidenceReference = {
  evidenceId: string;
  draftDrawingId: string;
  provider: "gcs";
  bucket: string;
  objectKey: string;
  generation: string;
  contentHash: string;
  mediaType: string;
  finalizedAt: string;
  ruleVersion: string;
};

export type PublicationEvidenceResult = {
  status: "finalized" | "not_required" | "not_ready";
  ruleVersion: string;
  token: string;
  references: PublicationEvidenceReference[];
  reason: string | null;
};

export interface PublicationEvidencePort {
  verify(input: {
    companyId: string;
    workspaceId: string;
    snapshotHash: string;
    draftDrawingIds: string[];
  }): Promise<PublicationEvidenceResult>;
}

type PublicationEvidenceEnv = {
  NODE_ENV?: string;
  PDM_LOCAL_FULL_FUNCTION_VALIDATION?: string;
  PDM_PUBLICATION_EVIDENCE_MODE?: string;
};

export function isLocalDevelopmentPublicationEvidenceEnabled(
  env: PublicationEvidenceEnv = process.env
) {
  if (String(env.NODE_ENV ?? "").trim().toLowerCase() === "production") return false;
  return String(env.PDM_LOCAL_FULL_FUNCTION_VALIDATION ?? "").trim().toLowerCase() === "true"
    || String(env.PDM_PUBLICATION_EVIDENCE_MODE ?? "").trim().toLowerCase() === "local_fake";
}

type EvidenceRow = {
  id: string;
  draft_drawing_id: string;
  provider: string;
  bucket_name: string;
  object_key: string;
  object_generation: string;
  content_hash: string;
  media_type: string;
  finalized_at: string | null;
  rule_version: string;
};

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)])
    );
  }
  return value;
}

function evidenceToken(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

function notReady(reason: string): PublicationEvidenceResult {
  return {
    status: "not_ready",
    ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
    token: evidenceToken({ ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION, reason }),
    references: [],
    reason
  };
}

export class DatabasePublicationEvidencePort implements PublicationEvidencePort {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async verify(input: {
    companyId: string;
    workspaceId: string;
    snapshotHash: string;
    draftDrawingIds: string[];
  }): Promise<PublicationEvidenceResult> {
    const drawingIds = [...new Set(input.draftDrawingIds)].sort();
    if (drawingIds.length === 0) {
      const ruleFact = {
        ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
        result: "not_required",
        scope: "root_or_part_without_drawing",
        workspaceId: input.workspaceId,
        snapshotHash: input.snapshotHash
      };
      return {
        status: "not_required",
        ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
        token: evidenceToken(ruleFact),
        references: [],
        reason: null
      };
    }

    if (!isLocalDevelopmentPublicationEvidenceEnabled()) {
      return notReady("direct_gcs_verifier_unavailable");
    }

    const rows = await this.client.query<EvidenceRow>(
      `SELECT id, drawing_draft_id AS draft_drawing_id, provider, bucket AS bucket_name, object_key, generation AS object_generation,
              content_hash, media_type, finalized_at, rule_version
       FROM numbering_publication_evidence
       WHERE company_id = :companyId
         AND workspace_id = :workspaceId
         AND rule_version = :ruleVersion
       ORDER BY draft_drawing_id, id`,
      {
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION
      }
    );
    const rowByDrawing = new Map(rows.map((row) => [row.draft_drawing_id, row]));
    const references: PublicationEvidenceReference[] = [];
    for (const draftDrawingId of drawingIds) {
      const row = rowByDrawing.get(draftDrawingId);
      if (
        !row || row.provider !== "google_cloud_storage" || !row.bucket_name || !row.object_key || !row.object_generation ||
        !/^[a-f0-9]{64}$/iu.test(row.content_hash) || !row.media_type || !row.finalized_at
      ) {
        return notReady(`drawing_evidence_not_finalized:${draftDrawingId}`);
      }
      references.push({
        evidenceId: row.id,
        draftDrawingId,
        provider: "gcs",
        bucket: row.bucket_name,
        objectKey: row.object_key,
        generation: row.object_generation,
        contentHash: row.content_hash.toLowerCase(),
        mediaType: row.media_type,
        finalizedAt: row.finalized_at,
        ruleVersion: row.rule_version
      });
    }
    const tokenFacts = {
      ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
      workspaceId: input.workspaceId,
      snapshotHash: input.snapshotHash,
      references
    };
    return {
      status: "finalized",
      ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
      token: evidenceToken(tokenFacts),
      references,
      reason: null
    };
  }
}
