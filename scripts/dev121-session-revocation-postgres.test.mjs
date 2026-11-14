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
        phase.startsWith("global_") ? null : baseline, phase.startsWith("global_") ? null : baseline + 1])
      .then(result => result.rows[0].receipt);
  const session = (client, principal, hash, epoch = 0, authenticatedAt = "2026-11-01T10:00:00.000Z") =>
    client.query(`
      INSERT INTO ai_pdm_core.principal_session_records
      VALUES ($1,$2,$3,$4,now()+interval '1 hour',NULL,NULL,NULL)
    `, [principal, hash, epoch, authenticatedAt]);
  const lock = async (client, principal, hash) =>
    (await client.query("SELECT ai_pdm_core.lock_principal_session_for_command_v1($1,$2) AS valid",
      [principal, hash])).rows[0].valid;
  const readback = async (client, event, operationId, phase, hash = digest) =>
    (await client.query("SELECT ai_pdm_core.read_principal_session_revocation_v1($1,$2,$3,$4) AS receipt",
      [event, operationId, phase, hash])).rows[0].receipt;
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
      -- Migration 104 also installs the native first-login function. Its row
      -- type must resolve during DDL even though this fixture only tests fencing.
      CREATE TABLE ai_pdm_core.principal_accounts (principal_id text PRIMARY KEY);
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
    await pool.query(await readFile(new URL("../db/postgres/106_dev121_reviewer_authority.sql", import.meta.url), "utf8"));
    await Promise.all([writer, revoker, login].map(client => client.query("SET ROLE jenfu_ai_pdm_runtime")));
    await session(login, primary, "device-a");
    await session(login, primary, "device-b");
    await session(login, unrelated, "device-c");
    await pool.query("INSERT INTO ai_pdm_core.reviewer_authority VALUES ($1,1,NULL)", [unseen]);
    await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const selectReviewer = "SELECT principal_id FROM ai_pdm_core.reviewer_authority WHERE principal_id=$1 AND pending_operation_id IS NULL";
    assert.equal((await writer.query(selectReviewer,[unseen])).rowCount,1);
    const reviewerChange = randomUUID();
    await revoker.query("BEGIN");
    await apply(revoker,randomUUID(),reviewerChange,"prepare",[unseen]);
    await revoker.query("SET CONSTRAINTS ALL IMMEDIATE");
    const staleReviewer = assert.rejects(writer.query(selectReviewer+" FOR SHARE",[unseen]),{code:"40001"});
    await untilLockWait(writer.processID);
    await revoker.query("COMMIT");
    await staleReviewer;
    await writer.query("ROLLBACK");
    assert.equal((await writer.query(selectReviewer,[unseen])).rowCount,0);
    await revoker.query("BEGIN");
    await apply(revoker,randomUUID(),reviewerChange,"cancelled",[unseen]);
    await revoker.query("UPDATE ai_pdm_core.reviewer_authority SET pending_operation_id=NULL WHERE principal_id=$1 AND pending_operation_id=$2",[unseen,reviewerChange]);
    await revoker.query("COMMIT");
    assert.equal((await writer.query(selectReviewer,[unseen])).rowCount,1);
    await writer.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    assert.equal((await writer.query(selectReviewer+" FOR SHARE",[unseen])).rowCount,1);
    const reviewerChangeSecond = randomUUID();
    const reviewerPrep = apply(revoker,randomUUID(),reviewerChangeSecond,"prepare",[unseen]);
    void reviewerPrep.catch(() => {});
    await untilLockWait(revoker.processID);
    await writer.query("INSERT INTO ai_pdm_core.command_writes VALUES ('reviewer-assignment-first')");
    await writer.query("COMMIT");
    await reviewerPrep;
    assert.equal((await writer.query(selectReviewer,[unseen])).rowCount,0);
    await revoker.query("BEGIN");
    await apply(revoker,randomUUID(),reviewerChangeSecond,"cancelled",[unseen]);
    await revoker.query("UPDATE ai_pdm_core.reviewer_authority SET pending_operation_id=NULL WHERE principal_id=$1 AND pending_operation_id=$2",[unseen,reviewerChangeSecond]);
    await revoker.query("COMMIT");
    await pool.query("DELETE FROM ai_pdm_core.command_writes WHERE id='reviewer-assignment-first'");
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
    const logout = randomUUID(), logoutPrepare = randomUUID();
    await assert.rejects(apply(revoker, logout, logout, "global_logout", [unseen], 1,
      "2026-11-01T12:00:00.000Z"), { code: "23505" });
    await apply(revoker, logoutPrepare, logout, "global_prepare", [unseen], 0);
    await apply(revoker, logout, logout, "global_logout", [unseen], 1, "2026-11-01T12:00:00.000Z");
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

    const secondLogout = randomUUID(), secondPrepare = randomUUID(), concurrentLogout = randomUUID();
    await writer.query("BEGIN");
    assert.equal(await lock(writer, unseen, "fresh-snapshot"), true);
    const preparing = apply(revoker, secondPrepare, secondLogout, "global_prepare", [unseen], 1);
    void preparing.catch(() => {});
    await untilLockWait(revoker.processID);
    assert.equal(await readback(login, secondPrepare, secondLogout, "global_prepare"), null);
    await writer.query("INSERT INTO ai_pdm_core.command_writes VALUES ('global-write-first')");
    await writer.query("COMMIT");
    const prepared = await preparing;
    assert.deepEqual(await readback(login, secondPrepare, secondLogout, "global_prepare"), prepared);
    assert.deepEqual(await apply(login, secondPrepare, secondLogout, "global_prepare", [unseen], 1), prepared);
    assert.equal(await lock(writer, unseen, "fresh-snapshot"), false);
    await assert.rejects(session(login, unseen, "terminal-delayed", 2, "2026-11-01T14:00:00.000Z"), { code: "42501" });
    await apply(revoker, randomUUID(), concurrentLogout, "global_prepare", [unseen], 1);
    const overlap = randomUUID();
    await apply(revoker, randomUUID(), overlap, "prepare", [unseen], null, null, digest, 3);
    await apply(revoker, randomUUID(), overlap, "cancelled", [unseen], null, null, digest, 3);
    await assert.rejects(apply(revoker, secondLogout, secondLogout, "global_logout", [unseen], 3,
      "2026-11-01T13:30:00.000Z"), { code: "23505" });
    await assert.rejects(apply(revoker, secondLogout, secondLogout, "global_cancelled", [unseen], 0), { code: "23505" });
    const committed = await apply(revoker, secondLogout, secondLogout, "global_logout", [unseen], 2,
      "2026-11-01T13:30:00.000Z");
    assert.deepEqual(await readback(login, secondLogout, secondLogout, "global_logout"), committed);
    await assert.rejects(readback(login, randomUUID(), secondLogout, "global_cancelled"), { code: "23505" });
    await assert.rejects(session(login, unseen, "other-logout-still-pending", 2, "2026-11-01T14:00:00.000Z"),
      { code: "42501" });
    await apply(revoker, concurrentLogout, concurrentLogout, "global_cancelled", [unseen], 1);
    await assert.rejects(session(login, unseen, "old-after-cancel", 1, "2026-11-01T14:00:00.000Z"),
      { code: "42501" });
    await session(login, unseen, "new-after-both", 2, "2026-11-01T14:00:00.000Z");
    assert.equal(await lock(writer, unseen, "fresh-snapshot"), false);
    assert.equal(await lock(writer, unrelated, "device-c"), true);
  } finally {
    for (const client of [writer, revoker, login]) client.release();
    await pool.end();
  }
});
