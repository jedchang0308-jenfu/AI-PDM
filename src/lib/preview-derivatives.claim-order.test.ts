import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient, AsyncDatabaseQueryParams } from "@/lib/db-async-provider";

const authority = vi.hoisted(() => ({ require: vi.fn(async () => undefined) }));
vi.mock("@/lib/principal-job-authority", async original => ({
  ...await original<typeof import("@/lib/principal-job-authority")>(),
  requireCurrentPrincipalJobAuthority: authority.require
}));

import { claimPreviewJobAsync } from "@/lib/preview-derivatives";

const now = "2026-10-28T08:30:00.000Z";
const hash = "a".repeat(64);
const initiator = {
  kind: "verified_principal" as const,
  principalId: "principal-one",
  employeeId: "employee-one",
  pdmUserId: "profile-one",
  companyId: "company-one",
  identityIssuer: "issuer-one",
  identitySubject: "subject-one",
  profileVersion: 1,
  accountLifecycleVersion: 1,
  authEpoch: 0,
  authenticatedAt: now,
  sessionIssuedAt: now
};

function job(id: string, metadataJson: unknown) {
  return {
    id,
    company_id: "company-one",
    source_file_asset_id: "asset-one",
    source_content_hash: hash,
    requested_kind: "native_thumbnail_png",
    source_extension: "sldprt",
    status: "queued",
    priority: 100,
    attempt_count: 0,
    generator_profile: "windows_solidworks_preview_worker",
    error_code: null,
    error_summary: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    locked_by: null,
    locked_at: null,
    metadata_json: metadataJson
  };
}

describe("preview PostgreSQL claim ordering", () => {
  it("skips a malformed legacy head row and claims the next valid owned job without mutating the skipped row", async () => {
    const legacy = job("job-legacy", JSON.stringify({ initiator: { principalId: initiator.principalId } }));
    const valid = job("job-valid", JSON.stringify({ initiator }));
    const selections: Array<{ sql: string; params: Record<string, unknown> }> = [];
    const queryOne = async <T>(sql: string, params?: AsyncDatabaseQueryParams): Promise<T | null> => {
      const named = (params ?? {}) as Record<string, unknown>;
      if (sql.includes("SELECT *") && sql.includes("FROM preview_jobs job")) {
        selections.push({ sql, params: named });
        return (Object.hasOwn(named, "excludedJob0") ? valid : legacy) as T;
      }
      if (sql.includes("SELECT * FROM file_assets")) {
        return {
          id: "asset-one", linked_entity_type: "drawing_revision", linked_entity_id: "revision-one",
          deleted_at: null, storage_provider: "google_cloud_storage", storage_key: "source/one",
          original_path: null, file_name: "part.sldprt", file_ext: "sldprt",
          mime_type: "application/octet-stream", file_size: 10, content_hash: hash,
          hash_algorithm: "SHA-256", document_category: "cad_3d"
        } as T;
      }
      if (sql.includes("SELECT id FROM drawing_revisions")) return { id: "revision-one" } as T;
      if (sql.includes("SELECT statement_timestamp() AS lease_clock")) return { lease_clock: now } as T;
      if (sql.includes("UPDATE preview_jobs AS job")) {
        return { ...valid, status: "running", locked_by: "worker-one", locked_at: now,
          attempt_count: 1, lease_locked_at: now } as T;
      }
      throw new Error(`UNEXPECTED_QUERY: ${sql}`);
    };
    const client: AsyncDatabaseClient = {
      kind: "postgres",
      transactionScope: "postgres",
      query: vi.fn(async () => []),
      queryOne,
      execute: vi.fn(async () => undefined),
      transaction: vi.fn(async run => await run(client)),
      close: vi.fn(async () => undefined)
    };

    const claim = await claimPreviewJobAsync(client, {
      leaseProtocolVersion: 2,
      workerId: "worker-one",
      companyId: "company-one",
      ownerPrincipalId: initiator.principalId,
      supportedKinds: ["native_thumbnail_png"],
      supportedExtensions: ["sldprt"]
    });

    expect(claim).toMatchObject({ jobId: valid.id, sourceFileAssetId: "asset-one", leaseBasis: { attemptCount: 1 } });
    expect(selections).toHaveLength(2);
    expect(selections[1]).toMatchObject({ params: { excludedJob0: legacy.id } });
    expect(selections[1].sql).toContain("job.id NOT IN (:excludedJob0)");
    expect(authority.require).toHaveBeenCalledOnce();
    expect(client.execute).not.toHaveBeenCalled();
  });
});
