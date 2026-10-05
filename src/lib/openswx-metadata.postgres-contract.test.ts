import crypto from "node:crypto";
import fs from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AsyncDatabaseClient, AsyncDatabaseQueryParams } from "./db-async-provider";
import { OpenSwxMetadataAsyncRepository } from "./repositories/openswx-metadata-async-repository";
import { OPENSWX_READER, encodeOpenSwxCompletion, type OpenSwxInitiator } from "./openswx-metadata-contract";

/** Native SQL only. Root owns the disposable fixture/runtime and performs source 081+082 apply/rerun.
 * This suite never bootstraps roles/containers or proves current Principal/API authority. */
const url = process.env.DEV122_OPENSWX_POSTGRES_URL;
let pool: Pool, connection: PoolClient, client: AsyncDatabaseClient, initiator: OpenSwxInitiator, sessionId: string, sourceId: string, assetId: string;
const hash = "a".repeat(64);
function query(sql: string, params?: AsyncDatabaseQueryParams) {
  if (Array.isArray(params)) return connection.query(sql, [...params]);
  const values: unknown[] = [], bindings = new Map<string, number>();
  const text = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9]*)/gu, (_, name: string) => {
    if (!bindings.has(name)) { values.push((params as Record<string, unknown>)?.[name]); bindings.set(name, values.length); }
    return `$${bindings.get(name)}`;
  });
  return connection.query(text, values);
}
describe.skipIf(!url)("DEV-122 native PostgreSQL auxiliary constraints (explicit isolated runtime only)", () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || !/^\/dev122_[a-f0-9]{16}$/u.test(parsed.pathname)) throw Error("OPENSWX_PG_NOT_ISOLATED");
    // Root must retain the unmodified source snapshot invariant gate, before this suite seeds rows.
    const gatePath = process.env.DEV122_OPENSWX_FIXTURE_GATE;
    if (!gatePath) throw Error("OPENSWX_PG_FIXTURE_GATE_REQUIRED");
    const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
    if (gate.project !== "AI-PDM" || gate.database !== parsed.pathname.slice(1) || gate.masterCounts !== "PASS" || gate.rootReferences !== "PASS" || gate.migrationResidue !== "PASS" || gate.globalForeignKeys !== "PASS" || gate.unmodifiedSnapshot !== true) throw Error("OPENSWX_PG_FIXTURE_GATE_INVALID");
    pool = new Pool({ connectionString: url, max: 2 });
    const marker = await pool.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
    expect(marker.rows[0].marker).toBe("AIPDM_DEV122_LOCAL_V1");
    expect((await pool.query("SELECT to_regclass('ai_pdm_core.openswx_metadata_jobs') table_name")).rows[0].table_name).toBe("ai_pdm_core.openswx_metadata_jobs");
  });
  beforeEach(async () => {
    connection = await pool.connect(); await connection.query("BEGIN");
    await connection.query("SET LOCAL search_path=ai_pdm_core");
    const { rows } = await connection.query("SELECT * FROM ai_pdm_core.principal_accounts ORDER BY principal_id LIMIT 1");
    if (!rows[0]) throw Error("OPENSWX_PG_TYPED_PRINCIPAL_FIXTURE_REQUIRED");
    const a = rows[0];
    initiator = { companyId: a.company_id, pdmUserId: a.pdm_user_id, principalId: a.principal_id, employeeId: a.employee_id, identityIssuer: "fixture-sql-only", identitySubject: "fixture-sql-only", profileVersion: Number(a.profile_version), accountLifecycleVersion: Number(a.lifecycle_version), authEpoch: 0, authenticatedAt: "2026-10-05T00:00:00Z", sessionIssuedAt: "2026-10-05T00:00:00Z" };
    sessionId = crypto.randomUUID(); sourceId = crypto.randomUUID(); assetId = crypto.randomUUID();
    // drawing_revision is supported by both the native baseline CHECK and current service.
    // The synthetic context ID is SQL-only; it does not assert a real revision or API authority.
    await connection.query(`INSERT INTO ai_pdm_core.file_assets(id,file_name,file_ext,file_size,content_hash,linked_entity_type,linked_entity_id) VALUES($1,'auxiliary-fixture.SLDPRT','sldprt',12,$2,'drawing_revision',$3)`, [assetId, hash, sessionId]);
    await connection.query(`INSERT INTO ai_pdm_core.drawing_recognition_sessions(id,company_id,source_context_type,source_context_id,source_lineage_key,source_set_fingerprint,deduplication_key,created_by,initiator_principal_id) VALUES($1,$2,'drawing_revision',$1,$1,$3,$1,$4,$5)`, [sessionId, a.company_id, hash, a.pdm_user_id, a.principal_id]);
    await connection.query(`INSERT INTO ai_pdm_core.drawing_recognition_sources(id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,mime_type,file_size,source_role) VALUES($1,$2,$3,$4,$5,'auxiliary-fixture.SLDPRT','sldprt','application/octet-stream',12,'main')`, [sourceId, sessionId, a.company_id, assetId, hash]);
    client = { kind: "postgres", transactionScope: "postgres", query: async <T>(sql: string, params?: AsyncDatabaseQueryParams) => (await query(sql, params)).rows as T[], queryOne: async <T>(sql: string, params?: AsyncDatabaseQueryParams) => (await query(sql, params)).rows[0] as T ?? null, execute: async (sql, params) => { await query(sql, params); }, transaction: async fn => await fn(client), close: async () => {} };
  });
  afterEach(async () => { if (connection) { await connection.query("ROLLBACK"); connection.release(); } });
  afterAll(async () => { await pool?.end(); });
  async function insert() {
    const repository = new OpenSwxMetadataAsyncRepository(client);
    const source = { id: sourceId, fileAssetId: assetId, sha256: hash, bytes: 12, extension: "sldprt", storageGeneration: null };
    const job = await repository.insert({ id: crypto.randomUUID(), sessionId, sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit, initiator, sources: [source], now: "2026-10-05T00:01:00Z" });
    return { repository, job: job!, source };
  }
  async function rejected(sql: string, params: unknown[], code: string) {
    await connection.query("SAVEPOINT denied_write");
    await expect(connection.query(sql, params)).rejects.toMatchObject({ code });
    await connection.query("ROLLBACK TO SAVEPOINT denied_write");
  }
  it("native immutable snapshot rejects runtime SQL mutation and leaves exact original row", async () => {
    const { job } = await insert(); await connection.query("SET LOCAL ROLE jenfu_ai_pdm_runtime");
    await rejected("UPDATE ai_pdm_core.openswx_metadata_jobs SET initiator_json='{}' WHERE id=$1", [job.id], "23514");
    await rejected("UPDATE ai_pdm_core.openswx_metadata_jobs SET sources_json='[]' WHERE id=$1", [job.id], "23514");
    await rejected("DELETE FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1", [job.id], "42501");
    expect(await new OpenSwxMetadataAsyncRepository(client).read(job.id, initiator.companyId)).toEqual(job);
  });
  it("native same-company FK and source bounds reject forged inserts", async () => {
    const { job } = await insert();
    await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(id,company_id,session_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at) SELECT $2,company_id,$3,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [job.id, crypto.randomUUID(), "unknown-session"], "23514");
    // Remove only the synthetic job within this rollback-only transaction so the unique key
    // cannot mask the FK failure we are asserting.
    await connection.query("DELETE FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1", [job.id]);
    const sourceTooLarge = { ...job.sources[0], bytes: 268435457 };
    await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(id,company_id,session_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`, [crypto.randomUUID(),job.companyId,sessionId,hash,OPENSWX_READER.commit,initiator.principalId,initiator.pdmUserId,JSON.stringify(initiator),JSON.stringify([sourceTooLarge])], "23514");
    const invalid = { ...initiator, principalId: "unknown-principal" };
    await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(id,company_id,session_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'unknown-principal',$6,$7,$8,now(),now())`, [crypto.randomUUID(),job.companyId,sessionId,hash,OPENSWX_READER.commit,initiator.pdmUserId,JSON.stringify(invalid),JSON.stringify(job.sources)], "23503");
  });
  it("native atomic claim/completion preserve single digest receipt and audit", async () => {
    const { job, repository, source } = await insert();
    const executionName = "projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/native-fixture";
    await connection.query("UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state='dispatched',execution_name=$2 WHERE id=$1", [job.id, executionName]);
    const admitted = await repository.read(job.id, job.companyId);
    const claimed = await repository.claim(admitted!, OPENSWX_READER.id, "2026-10-05T00:01:00Z", "2026-10-05T00:02:00Z"); expect(claimed?.attemptCount).toBe(1);
    const result = encodeOpenSwxCompletion([source], [{ sourceId, payload: { schemaVersion: "aipdm.openswx-public-api.v1", status: "failed", diagnostics: ["library_open_rejected"] } }]);
    const completed = await repository.complete(claimed!, result, crypto.randomUUID(), "2026-10-05T00:01:30Z");
    await rejected("UPDATE ai_pdm_core.openswx_metadata_jobs SET completion_digest=$2 WHERE id=$1", [job.id, "b".repeat(64)], "23514");
    expect(await repository.read(job.id, job.companyId)).toEqual(completed);
    await connection.query("SAVEPOINT atomic_rollback");
    await connection.query("UPDATE ai_pdm_core.openswx_metadata_jobs SET updated_at='2026-10-05T00:03:00Z' WHERE id=$1", [job.id]);
    await connection.query("ROLLBACK TO SAVEPOINT atomic_rollback");
    expect(await repository.read(job.id, job.companyId)).toEqual(completed);
  });
});
