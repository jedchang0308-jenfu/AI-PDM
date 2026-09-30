import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";
import { claimPreviewJobAsync, completePreviewJobAsync, enqueuePreviewJobForSourceAsync,
  getPreviewDerivativeBytesForSourceAssetAsync } from "@/lib/preview-derivatives";

const source = {
  id: "asset-one", company_id: "company-one", storage_provider: "local_repository",
  original_path: null, storage_key: "source/one", file_name: "drawing.slddrw",
  file_ext: "slddrw", mime_type: "application/octet-stream", file_size: 10,
  content_hash: "a".repeat(64), hash_algorithm: "SHA-256",
  linked_entity_type: "drawing_revision", linked_entity_id: "revision-one"
};

describe("principal preview job provenance", () => {
  it("uses the linked domain owner's company for enqueue and worker claim", async () => {
    const database = new Database(":memory:");
    try {
      database.exec(`
        CREATE TABLE file_assets (id TEXT PRIMARY KEY, linked_entity_type TEXT NOT NULL,
          linked_entity_id TEXT NOT NULL, deleted_at TEXT, storage_key TEXT, original_path TEXT);
        CREATE TABLE drawing_revisions (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
        CREATE TABLE numbering_candidate_revision_drafts (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
        CREATE TABLE drawing_numbers (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
        CREATE TABLE part_numbers (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
        CREATE TABLE file_derivatives (id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
          source_file_asset_id TEXT NOT NULL, source_content_hash TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE preview_jobs (
          id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL,
          source_content_hash TEXT NOT NULL, requested_kind TEXT NOT NULL,
          source_extension TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
          generator_profile TEXT NOT NULL, error_code TEXT, error_summary TEXT,
          created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          completed_at TEXT, metadata_json TEXT NOT NULL, locked_by TEXT, locked_at TEXT
        );
        INSERT INTO drawing_revisions VALUES ('revision-one', 'company-one');
        INSERT INTO file_assets (id, linked_entity_type, linked_entity_id, storage_key)
          VALUES ('asset-one', 'drawing_revision', 'revision-one', 'source/one');
      `);
      const client = createAsyncDatabaseClient({ kind: "sqlite", database });
      await expect(enqueuePreviewJobForSourceAsync(client, {
        source: { ...source, company_id: "company-two" }, actorUserId: "profile-one",
        initiatorPrincipalId: "principal-one"
      })).rejects.toThrow("PREVIEW_SOURCE_COMPANY_SCOPE_INVALID");
      expect(database.prepare("SELECT count(*) AS count FROM preview_jobs").get()).toEqual({ count: 0 });

      const queued = await enqueuePreviewJobForSourceAsync(client, {
        source, actorUserId: "profile-one", initiatorPrincipalId: "principal-one"
      });
      expect(database.prepare("SELECT company_id FROM preview_jobs WHERE id = ?").get(queued.jobId))
        .toEqual({ company_id: "company-one" });

      const validClaim = await claimPreviewJobAsync(client, {
        workerId: "worker-one", supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"]
      });
      expect(validClaim).toMatchObject({ jobId: queued.jobId, sourceFileAssetId: source.id });

      database.prepare("UPDATE preview_jobs SET company_id = 'company-two', status = 'queued' WHERE id = ?")
        .run(queued.jobId);
      await expect(enqueuePreviewJobForSourceAsync(client, {
        source, actorUserId: "profile-one", initiatorPrincipalId: "principal-one"
      })).rejects.toThrow("PREVIEW_JOB_COMPANY_CONFLICT");
      const claim = await claimPreviewJobAsync(client, {
        workerId: "worker-one", supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"]
      });
      expect(claim).toBeNull();
      expect(database.prepare("SELECT status, error_code FROM preview_jobs WHERE id = ?").get(queued.jobId))
        .toEqual({ status: "failed", error_code: "source_company_scope_invalid" });

      database.prepare(`INSERT INTO file_derivatives
        (id, company_id, source_file_asset_id, source_content_hash, status, created_at)
        VALUES ('wrong-derivative', 'company-two', 'asset-one', ?, 'ready', '2026-09-29')`)
        .run(source.content_hash);
      expect(await getPreviewDerivativeBytesForSourceAssetAsync(client, {
        derivativeId: "wrong-derivative", sourceFileAssetId: source.id,
        sourceContentHash: source.content_hash
      })).toBeNull();

      database.prepare("UPDATE preview_jobs SET status = 'running', locked_by = 'worker-one' WHERE id = ?")
        .run(queued.jobId);
      const completion = await completePreviewJobAsync(client, {
        jobId: queued.jobId, workerId: "worker-one", status: "succeeded",
        sourceContentHash: source.content_hash, derivatives: []
      });
      expect(completion).toEqual({ accepted: false, derivativeIds: [] });
      expect(database.prepare("SELECT status, error_code FROM preview_jobs WHERE id = ?").get(queued.jobId))
        .toEqual({ status: "failed", error_code: "source_company_scope_invalid" });
    } finally {
      database.close();
    }
  });

  it("records verified initiator separately from the historical profile FK and keeps the first initiator on replay", async () => {
    let existing: Record<string, unknown> | null = null;
    let firstMetadataJson = "";
    const execute = vi.fn(async (sql: string, params: Record<string, unknown>) => {
      expect(sql).toContain("INSERT INTO preview_jobs");
      firstMetadataJson = String(params.metadataJson);
      existing = {
        id: params.id, company_id: source.company_id, source_file_asset_id: source.id,
        source_content_hash: source.content_hash, requested_kind: params.requestedKind,
        source_extension: "slddrw", status: "queued", attempt_count: 0,
        locked_by: null, locked_at: null, generator_profile: params.generatorProfile,
        error_code: null, error_summary: null, created_at: params.now,
        updated_at: params.now, completed_at: null, metadata_json: params.metadataJson
      };
    });
    const client = {
      execute,
      queryOne: vi.fn(async (sql: string) => sql.includes("SELECT fa.id FROM file_assets")
        ? { id: source.id } : existing),
      query: vi.fn(async () => [])
    } as unknown as AsyncDatabaseClient;
    await enqueuePreviewJobForSourceAsync(client, {
      source, actorUserId: "profile-one", initiatorPrincipalId: "principal-one"
    });
    expect(execute).toHaveBeenCalledOnce();
    const params = vi.mocked(execute).mock.calls[0][1];
    expect(params.actorUserId).toBe("profile-one");
    expect(JSON.parse(String(params.metadataJson))).toEqual({
      initiator: { kind: "verified_principal", principalId: "principal-one" }
    });
    await enqueuePreviewJobForSourceAsync(client, {
      source, actorUserId: "profile-two", initiatorPrincipalId: "principal-two"
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(firstMetadataJson).initiator.principalId)
      .toBe("principal-one");
  });

  it("rejects a synthetic profile identity presented as the security initiator", async () => {
    const execute = vi.fn();
    const client = {
      execute,
      queryOne: vi.fn(),
      query: vi.fn()
    } as unknown as AsyncDatabaseClient;
    await expect(enqueuePreviewJobForSourceAsync(client, {
      source, actorUserId: "profile-one", initiatorPrincipalId: "pdm:profile-one"
    })).rejects.toThrow("PREVIEW_PRINCIPAL_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not invent a principal when an unattributed historical caller has only a profile ID", async () => {
    const execute = vi.fn(async (_sql: string, params: Record<string, unknown>) => {
      expect(params.metadataJson).toBe("{}");
    });
    const client = {
      execute,
      queryOne: vi.fn(async (sql: string) => sql.includes("SELECT fa.id FROM file_assets")
        ? { id: source.id } : null),
      query: vi.fn(async () => [])
    } as unknown as AsyncDatabaseClient;
    await enqueuePreviewJobForSourceAsync(client, {
      source, actorUserId: "profile-only"
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});
