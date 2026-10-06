import crypto from "node:crypto";
import fs from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AsyncDatabaseClient, AsyncDatabaseQueryParams } from "./db-async-provider";
import { OpenSwxMetadataAsyncRepository } from "./repositories/openswx-metadata-async-repository";
import { OPENSWX_READER, encodeOpenSwxCompletion, type OpenSwxInitiator, type OpenSwxSource, type OpenSwxContextType } from "./openswx-metadata-contract";

/** Native SQL only. Root owns the disposable fixture/runtime and performs source 081+082 apply/rerun.
 * This suite never bootstraps roles/containers or proves current Principal/API authority. */
const url = process.env.DEV122_OPENSWX_POSTGRES_URL;
let pool: Pool, connection: PoolClient, client: AsyncDatabaseClient, initiator: OpenSwxInitiator, sourceId: string;
type ContextFixture = { schemaVersion: "aipdm.dev122-openswx-context-fixture.v1"; project: "AI-PDM"; database: string; sourceHead: string; baselineGateRef: string; initiator: OpenSwxInitiator; contexts: { sourceContextType: OpenSwxContextType; sourceContextId: string; ownerPrincipalId: string; sourceAssetIds: string[]; sources: OpenSwxSource[] }[] };
let fixture: ContextFixture, selected: ContextFixture["contexts"][number], source: OpenSwxSource, hash: string;
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
    const fixturePath = process.env.DEV122_OPENSWX_CONTEXT_FIXTURE;
    if (!fixturePath) throw Error("OPENSWX_PG_CONTEXT_FIXTURE_REQUIRED");
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (fixture.schemaVersion !== "aipdm.dev122-openswx-context-fixture.v1" || fixture.project !== "AI-PDM" || fixture.database !== gate.database || fixture.baselineGateRef !== gatePath || !/^[a-f0-9]{40}$/u.test(fixture.sourceHead) || fixture.contexts.length !== 4 || new Set(fixture.contexts.map(c => c.sourceContextType)).size !== 4) throw Error("OPENSWX_PG_CONTEXT_FIXTURE_INVALID");
    selected = fixture.contexts.find(c => c.sourceContextType === "drawing_number")!;
    if (!selected || selected.sources.length !== 1 || selected.sourceAssetIds[0] !== selected.sources[0].fileAssetId || selected.ownerPrincipalId !== fixture.initiator.principalId) throw Error("OPENSWX_PG_CONTEXT_FIXTURE_INVALID");
    pool = new Pool({ connectionString: url, max: 2 });
    const marker = await pool.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
    expect(marker.rows[0].marker).toBe("AIPDM_DEV122_LOCAL_V1");
    expect((await pool.query("SELECT to_regclass('ai_pdm_core.openswx_metadata_jobs') table_name")).rows[0].table_name).toBe("ai_pdm_core.openswx_metadata_jobs");
  });
  beforeEach(async () => {
    connection = await pool.connect(); await connection.query("BEGIN");
    await connection.query("SET LOCAL search_path=ai_pdm_core");
    const { rows } = await connection.query("SELECT * FROM ai_pdm_core.principal_accounts WHERE principal_id=$1 AND company_id=$2 AND pdm_user_id=$3", [fixture.initiator.principalId, fixture.initiator.companyId, fixture.initiator.pdmUserId]);
    if (rows.length !== 1) throw Error("OPENSWX_PG_TYPED_PRINCIPAL_FIXTURE_REQUIRED");
    initiator = fixture.initiator; source = selected.sources[0]; hash = source.sha256;
    sourceId = source.id;
    // Lawful context/assets are root-owned gated fixtures. No master/DM session seed here.
    client = { kind: "postgres", transactionScope: "postgres", query: async <T>(sql: string, params?: AsyncDatabaseQueryParams) => (await query(sql, params)).rows as T[], queryOne: async <T>(sql: string, params?: AsyncDatabaseQueryParams) => (await query(sql, params)).rows[0] as T ?? null, execute: async (sql, params) => { await query(sql, params); }, transaction: async fn => await fn(client), close: async () => {} };
  });
  afterEach(async () => { if (connection) { await connection.query("ROLLBACK"); connection.release(); } });
  afterAll(async () => { await pool?.end(); });
  async function insert() {
    const repository = new OpenSwxMetadataAsyncRepository(client);
    const job = await repository.insert({ id: crypto.randomUUID(), sourceContextType: selected.sourceContextType, sourceContextId: selected.sourceContextId, sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit, initiator, sources: [source], now: "2026-10-05T00:01:00Z" });
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
    const repository = new OpenSwxMetadataAsyncRepository(client), now = "2026-10-05T00:01:00Z";
    const requested = (await repository.dispatchAdmission(now, "2026-10-05T00:01:30Z"))!.job;
    await repository.dispatchBlocked({ ...requested, dispatchGeneration: 0 }, now);
    expect(await repository.read(job.id, initiator.companyId)).toEqual(requested);
    await connection.query("UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state='dispatch_unknown' WHERE id=$1", [job.id]);
    const unknown = await repository.read(job.id, initiator.companyId);
    await repository.dispatchBlocked(requested, now);
    expect(await repository.read(job.id, initiator.companyId)).toEqual(unknown);
    await connection.query("UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state='requested' WHERE id=$1", [job.id]);
    await repository.dispatchBlocked(requested, now);
    expect(await repository.read(job.id, initiator.companyId)).toMatchObject({ status: "failed", dispatchState: "terminal", dispatchGeneration: 1, executionName: null });
  });
  it("native same-company FK and source bounds reject forged inserts", async () => {
    const { job, repository } = await insert();
    await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(id,company_id,session_id,source_context_type,source_context_id,drawing_number_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at) SELECT $2,company_id,$3,source_context_type,source_context_id,drawing_number_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [job.id, crypto.randomUUID(), "unknown-session"], "23514");
    await connection.query("DELETE FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1", [job.id]);
    const values = [job.companyId, selected.sourceContextType, selected.sourceContextId, hash, OPENSWX_READER.commit, initiator.principalId, initiator.pdmUserId, JSON.stringify(initiator)];
    const statement = `INSERT INTO ai_pdm_core.openswx_metadata_jobs(id,company_id,source_context_type,source_context_id,drawing_number_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,now(),now())`;
    await rejected(statement, [crypto.randomUUID(), ...values, JSON.stringify([{ ...source, bytes: 268435457 }])], "23514");
    const invalid = { ...initiator, principalId: "unknown-principal" };
    await rejected(statement, [crypto.randomUUID(), job.companyId, selected.sourceContextType, selected.sourceContextId, hash, OPENSWX_READER.commit, invalid.principalId, initiator.pdmUserId, JSON.stringify(invalid), JSON.stringify([source])], "23503");
    // Four lawful root-owned typed parents all admit context-owned rows with no DM session.
    for (const context of fixture.contexts) {
      const contextSource = context.sources[0];
      const inserted = await repository.insert({ id: crypto.randomUUID(), sourceContextType: context.sourceContextType, sourceContextId: context.sourceContextId, sourceSetFingerprint: contextSource.sha256, readerCommit: OPENSWX_READER.commit, initiator, sources: context.sources, now: "2026-10-05T00:01:00Z" });
      expect(inserted).toMatchObject({ sessionId: null, sourceContextType: context.sourceContextType, sourceContextId: context.sourceContextId });
      const parentColumn = { drawing_number: "drawing_number_id", drawing_revision: "drawing_revision_id", revision_package: "revision_package_id", candidate_revision: "candidate_revision_id" }[context.sourceContextType];
      expect((await connection.query(`SELECT ${parentColumn} parent FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [inserted!.id])).rows[0].parent).toBe(context.sourceContextId);
      const columns = `id,company_id,source_context_type,source_context_id,${parentColumn},source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at`;
      // Unknown typed parent/source context must fail before any runtime write is committed.
      await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(${columns}) SELECT $2,company_id,source_context_type,$3,$3,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [inserted!.id, crypto.randomUUID(), "unknown-typed-parent"], "23514");
      await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(${columns}) SELECT $2,$3,source_context_type,source_context_id,${parentColumn},source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [inserted!.id, crypto.randomUUID(), "foreign-company"], "23514");
      const extraColumn = parentColumn === "drawing_number_id" ? "drawing_revision_id" : "drawing_number_id";
      await rejected(`INSERT INTO ai_pdm_core.openswx_metadata_jobs(${columns},${extraColumn}) SELECT $2,company_id,source_context_type,source_context_id,${parentColumn},source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,created_at,updated_at,$3 FROM ai_pdm_core.openswx_metadata_jobs WHERE id=$1`, [inserted!.id, crypto.randomUUID(), "extra-typed-parent"], "23514");
    }
    expect((await connection.query("SELECT COUNT(*)::int n FROM ai_pdm_core.openswx_metadata_jobs WHERE company_id=$1", [initiator.companyId])).rows[0].n).toBe(4);
  });
  it("native atomic claim/completion preserve single digest receipt and audit", async () => {
    const { job, repository, source } = await insert();
    const executionName = "projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/native-fixture";
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
