import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";

const connectionString = process.env.PDM_SESSION_REVOCATION_TEST_DATABASE;
test("DEV-121 revocation coordinates independent PostgreSQL sessions", { skip: !connectionString }, async () => {
  const target = new URL(connectionString);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/dev121_session_revocation_test");
  const pool = new pg.Pool({ connectionString, max: 4, statement_timeout: 5000 });
  const writer = await pool.connect();
  const revoker = await pool.connect();
  const login = await pool.connect();
  const operation = randomUUID();
  const prepare = randomUUID();
  const terminal = randomUUID();
  const digest = "a".repeat(64);
  const operationHash = "b".repeat(64);
  const primary = "principal-sessions";
  const unseen = "principal-unseen";
  const unrelated = "principal-unrelated";
  const scope = [primary, unseen];
  const apply = (client, event, operationId, phase, principals = scope, epoch = null, cutoff = null, hash = digest,
    baseline = 1) =>
    client.query("SELECT ai_pdm_core.apply_principal_session_revocation_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS receipt",
      [event, operationId, phase, hash, operationHash, principals, epoch, cutoff,
        phase === "global_logout" ? null : baseline, phase === "global_logout" ? null : baseline + 1])
      .then(result => result.rows[0].receipt);
  const session = (client, principal, hash, epoch = 0, authenticatedAt = "2026-11-01T10:00:00.000Z") =>
    client.query(`
      INSERT INTO ai_pdm_core.principal_session_records
      VALUES ($1,$2,$3,$4,now()+interval '1 hour',NULL,NULL,NULL)
    `, [principal, hash, epoch, authenticatedAt]);
  const lock = async (client, principal, hash) =>
    (await client.query("SELECT ai_pdm_core.lock_principal_session_for_command_v1($1,$2) AS valid",
      [principal, hash])).rows[0].valid;
  const untilLockWait = async pid => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [{ wait_event_type }] = (await pool.query(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows;
      if (wait_event_type === "Lock") return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("expected PostgreSQL lock wait");
  };
  try {
    await pool.query(`
      DO $roles$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jenfu_ai_pdm_migrator') THEN
          CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jenfu_ai_pdm_runtime') THEN
          CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
        END IF;
      END $roles$;
      CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
      SET ROLE jenfu_ai_pdm_migrator;
      CREATE TABLE ai_pdm_core.principal_session_records (
        principal_id text, session_id_hash text, principal_auth_epoch bigint, authenticated_at timestamptz,
        expires_at timestamptz, revoked_at timestamptz, revoke_reason text, PRIMARY KEY(principal_id, session_id_hash)
      );
      CREATE TABLE ai_pdm_core.role_catalog_publications (application_id text, catalog_version text, status text);
      CREATE TABLE ai_pdm_core.role_priority_versions (status text, priority_json text);
      INSERT INTO ai_pdm_core.role_priority_versions VALUES ('active','["rd"]');
      CREATE TABLE ai_pdm_core.command_writes (id text);
      GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
      GRANT SELECT, INSERT ON ai_pdm_core.principal_session_records,ai_pdm_core.command_writes TO jenfu_ai_pdm_runtime;
      RESET ROLE;
    `);
    await pool.query(await readFile(new URL("../db/postgres/104_dev121_principal_session_revocation.sql", import.meta.url), "utf8"));
    await Promise.all([writer, revoker, login].map(client => client.query("SET ROLE jenfu_ai_pdm_runtime")));
    await session(login, primary, "device-a");
    await session(login, primary, "device-b");
    await session(login, unrelated, "device-c");
    await writer.query("BEGIN");
    assert.equal(await lock(writer, primary, "device-a"), true);
    const prep = apply(revoker, prepare, operation, "prepare");
    void prep.catch(() => {});
    await untilLockWait(revoker.processID);
    await writer.query("INSERT INTO ai_pdm_core.command_writes VALUES ('old-write-first')");
    await writer.query("COMMIT");
    const receipt = await prep;
    assert.deepEqual(await apply(revoker, prepare, operation, "prepare"), receipt);
    assert.equal(await lock(writer, primary, "device-a"), false);
    assert.equal(await lock(writer, primary, "device-b"), false);
    assert.equal(await lock(writer, unrelated, "device-c"), true);
    await assert.rejects(session(login, unseen, "first-device"), { code: "42501" });
    await assert.rejects(apply(revoker, randomUUID(), randomUUID(), "prepare"), { code: "23505" });
    await assert.rejects(apply(revoker, prepare, operation, "prepare", scope, null, null, "c".repeat(64)), { code: "23505" });
    await apply(revoker, terminal, operation, "cancelled");
    await session(login, unseen, "first-device");
    assert.equal(await lock(writer, primary, "device-a"), false);
    const nextOperation = randomUUID();
    await apply(revoker, randomUUID(), nextOperation, "prepare");
    assert.deepEqual(await apply(revoker, prepare, operation, "prepare"), receipt);
    await apply(revoker, terminal, operation, "cancelled");
    await assert.rejects(session(login, unseen, "blocked-again"), { code: "42501" });
    await apply(revoker, randomUUID(), randomUUID(), "global_logout", [unseen], 1, "2026-11-01T12:00:00.000Z");
    await assert.rejects(session(login, unseen, "still-blocked", 1, "2026-11-01T13:00:00.000Z"), { code: "42501" });
    await apply(revoker, randomUUID(), nextOperation, "published");
    await assert.rejects(apply(revoker, randomUUID(), randomUUID(), "prepare", [unseen]), { code: "23505" });
    await assert.rejects(session(login, unseen, "old-epoch"), { code: "42501" });
    await assert.rejects(session(login, unseen, "old-auth-time", 1), { code: "42501" });
    await session(login, unseen, "new-epoch", 1, "2026-11-01T13:00:00.000Z");
    assert.equal(await lock(writer, unseen, "new-epoch"), true);

    // A snapshot established before prepare and release still cannot insert
    // a session based on its pre-prepare authorization view.
    await login.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await login.query("SELECT 1 FROM ai_pdm_core.principal_session_records LIMIT 1");
    const racedOperation = randomUUID();
    await apply(revoker, randomUUID(), racedOperation, "prepare", [unseen], null, null, digest, 2);
    await apply(revoker, randomUUID(), racedOperation, "published", [unseen], null, null, digest, 2);
    await assert.rejects(session(login, unseen, "stale-snapshot", 1, "2026-11-01T13:00:00.000Z"), { code: "40001" });
    await login.query("ROLLBACK");
    await session(login, unseen, "fresh-snapshot", 1, "2026-11-01T13:00:00.000Z");

    await pool.query("INSERT INTO ai_pdm_core.role_catalog_publications VALUES ('ai-pdm','policy-v1','active')");
    await login.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    assert.equal((await login.query("SELECT ai_pdm_core.lock_principal_session_catalog_v1('policy-v1') AS locked")).rows[0].locked, true);
    await login.query(`
      INSERT INTO ai_pdm_core.principal_session_records
        VALUES ($1,'policy-snapshot',1,'2026-11-01T13:00:00.000Z',now()+interval '1 hour',NULL,NULL,'{"catalogVersion":"policy-v1"}')
    `, [unseen]);
    await revoker.query("RESET ROLE");
    const retirement = revoker.query("UPDATE ai_pdm_core.role_catalog_publications SET status='retired'");
    void retirement.catch(() => {});
    await untilLockWait(revoker.processID);
    await login.query("COMMIT");
    await retirement;
    assert.equal(await lock(writer, unseen, "policy-snapshot"), false);
    assert.equal(await lock(writer, unseen, "fresh-snapshot"), true);

    await login.query(`
      INSERT INTO ai_pdm_core.principal_session_records
        VALUES ($1,'priority-snapshot',1,'2026-11-01T13:00:00.000Z',now()+interval '1 hour',NULL,NULL,'{"catalogVersion":"policy-v2"}')
    `, [unseen]);
    await revoker.query("UPDATE ai_pdm_core.role_priority_versions SET status='retired'");
    assert.equal(await lock(writer, unseen, "priority-snapshot"), false);
    assert.equal(await lock(writer, unseen, "fresh-snapshot"), true);
  } finally {
    for (const client of [writer, revoker, login]) client.release();
    await pool.end();
  }
});
