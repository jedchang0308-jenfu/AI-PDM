const { Pool } = require("pg");

const target = Object.freeze({
  userId: "prod-pdm-admin-001",
  email: "jedchang0308@jenfu.com.tw",
  identityId: "auth-google-prod-pdm-admin-001",
  platformPrincipalId: "iam:principal:prod-pdm-admin-001",
  sourceFirebaseUid: "U57t2eIOzLdhAmNDUbFyOz3fdMm2",
  stagingFirebaseUid: "qxEv2napjvMEmiqIUqwhTCf6gjg2"
});

const pool = new Pool({
  host: "127.0.0.1",
  port: Number(process.env.PDM_CLOUD_SQL_PORT || 5432),
  database: process.env.PDM_CLOUD_SQL_DATABASE,
  user: process.env.PDM_CLOUD_SQL_USER,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 60000
});

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

(async () => {
  assert(
    process.env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME ===
      "jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres",
    "TARGET_DATABASE_NOT_STAGING"
  );
  assert(
    process.env.PDM_CLOUD_SQL_USER === "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam",
    "TARGET_DATABASE_USER_NOT_STAGING_MIGRATION"
  );
  assert(
    process.env.PDM_SOURCE_REVISION === "f908881a25eec0a88c40b91d756d1d306d17e92e",
    "TARGET_SOURCE_REVISION_MISMATCH"
  );
  assert(process.env.CLOUD_RUN_JOB === "ai-pdm-stg-migration-runner", "TARGET_JOB_NOT_STAGING_MIGRATION_RUNNER");

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock($1)", [7104606401]);

    const countsBefore = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM users) AS users,
        (SELECT count(*)::integer FROM auth_identities) AS auth_identities,
        (SELECT count(*)::integer FROM platform_principal_mappings) AS principal_mappings
    `);

    const users = await client.query(`
      SELECT id, lower(email) AS email, role, company_id, account_status,
             system_role_enabled, password_hash IS NULL AS no_password
      FROM users
      WHERE id = $1 OR lower(email) = $2
      ORDER BY id
      FOR UPDATE
    `, [target.userId, target.email]);
    assert(users.rowCount === 1, "TARGET_USER_CARDINALITY_MISMATCH");
    const user = users.rows[0];
    assert(user.id === target.userId && user.email === target.email, "TARGET_USER_IDENTITY_MISMATCH");
    assert(user.role === "Admin" && user.company_id === "company-jenfu", "TARGET_USER_AUTHORIZATION_MISMATCH");
    assert(user.account_status === "active" && Number(user.system_role_enabled) === 1, "TARGET_USER_NOT_ACTIVE");
    assert(user.no_password === true, "TARGET_USER_APPLICATION_PASSWORD_PRESENT");

    const identities = await client.query(`
      SELECT id, user_id, provider, provider_subject, email_normalized,
             status, identity_lifecycle_version
      FROM auth_identities
      WHERE id = $1
         OR (user_id = $2 AND provider = 'google_oauth')
         OR (provider = 'google_oauth' AND provider_subject = ANY($3::text[]))
      ORDER BY id
      FOR UPDATE
    `, [target.identityId, target.userId, [target.sourceFirebaseUid, target.stagingFirebaseUid]]);
    assert(identities.rowCount === 1, "GOOGLE_IDENTITY_COLLISION");
    const identity = identities.rows[0];
    assert(identity.id === target.identityId && identity.user_id === target.userId, "GOOGLE_IDENTITY_OWNER_MISMATCH");
    assert(identity.provider === "google_oauth" && identity.status === "active", "GOOGLE_IDENTITY_NOT_ACTIVE");
    assert([target.sourceFirebaseUid, target.stagingFirebaseUid].includes(identity.provider_subject), "GOOGLE_IDENTITY_SOURCE_UNEXPECTED");

    const mappings = await client.query(`
      SELECT platform_principal_id, pdm_user_id, mapping_source,
             mapping_status, external_subject
      FROM platform_principal_mappings
      WHERE platform_principal_id = $1
         OR pdm_user_id = $2
         OR external_subject = ANY($3::text[])
      ORDER BY platform_principal_id
      FOR UPDATE
    `, [target.platformPrincipalId, target.userId, [target.sourceFirebaseUid, target.stagingFirebaseUid]]);
    assert(mappings.rowCount === 1, "PLATFORM_PRINCIPAL_MAPPING_COLLISION");
    const mapping = mappings.rows[0];
    assert(mapping.platform_principal_id === target.platformPrincipalId, "PLATFORM_PRINCIPAL_ID_MISMATCH");
    assert(mapping.pdm_user_id === target.userId, "PLATFORM_PRINCIPAL_OWNER_MISMATCH");
    assert(mapping.mapping_source === "shared_iam" && mapping.mapping_status === "active", "PLATFORM_PRINCIPAL_NOT_ACTIVE");
    assert([target.sourceFirebaseUid, target.stagingFirebaseUid].includes(mapping.external_subject), "PLATFORM_PRINCIPAL_SOURCE_UNEXPECTED");

    const identityUpdate = await client.query(`
      UPDATE auth_identities
      SET provider_subject = $1,
          login_identifier = $2,
          email_normalized = $2,
          identity_lifecycle_version = identity_lifecycle_version + 1,
          updated_at = now()
      WHERE id = $3
        AND user_id = $4
        AND provider = 'google_oauth'
        AND provider_subject = $5
      RETURNING id
    `, [target.stagingFirebaseUid, target.email, target.identityId, target.userId, target.sourceFirebaseUid]);
    assert(identityUpdate.rowCount === (identity.provider_subject === target.sourceFirebaseUid ? 1 : 0), "GOOGLE_IDENTITY_UPDATE_COUNT_MISMATCH");

    const mappingUpdate = await client.query(`
      UPDATE platform_principal_mappings
      SET external_subject = $1,
          updated_at = now()
      WHERE platform_principal_id = $2
        AND pdm_user_id = $3
        AND mapping_source = 'shared_iam'
        AND mapping_status = 'active'
        AND external_subject = $4
      RETURNING platform_principal_id
    `, [target.stagingFirebaseUid, target.platformPrincipalId, target.userId, target.sourceFirebaseUid]);
    assert(mappingUpdate.rowCount === (mapping.external_subject === target.sourceFirebaseUid ? 1 : 0), "PLATFORM_PRINCIPAL_UPDATE_COUNT_MISMATCH");

    const readback = await client.query(`
      SELECT
        u.id AS user_id,
        lower(u.email) AS email,
        u.role,
        u.company_id,
        u.account_status,
        u.system_role_enabled,
        ai.id AS identity_id,
        ai.provider,
        ai.provider_subject,
        ai.status AS identity_status,
        ai.identity_lifecycle_version,
        ppm.platform_principal_id,
        ppm.mapping_source,
        ppm.mapping_status,
        ppm.external_subject,
        EXISTS (
          SELECT 1 FROM user_company_memberships ucm
          WHERE ucm.user_id = u.id
            AND ucm.company_id = 'company-jenfu'
            AND ucm.is_default = 1
        ) AS default_membership_ok
      FROM users u
      JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'google_oauth'
      JOIN platform_principal_mappings ppm ON ppm.pdm_user_id = u.id
      WHERE u.id = $1
    `, [target.userId]);
    assert(readback.rowCount === 1, "POST_REMAP_READBACK_CARDINALITY_MISMATCH");
    const row = readback.rows[0];
    assert(row.provider_subject === target.stagingFirebaseUid, "POST_REMAP_IDENTITY_SUBJECT_MISMATCH");
    assert(row.external_subject === target.stagingFirebaseUid, "POST_REMAP_PLATFORM_SUBJECT_MISMATCH");
    assert(row.default_membership_ok === true, "POST_REMAP_DEFAULT_MEMBERSHIP_MISSING");

    const countsAfter = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM users) AS users,
        (SELECT count(*)::integer FROM auth_identities) AS auth_identities,
        (SELECT count(*)::integer FROM platform_principal_mappings) AS principal_mappings
    `);
    assert(JSON.stringify(countsAfter.rows[0]) === JSON.stringify(countsBefore.rows[0]), "AUTH_TABLE_COUNTS_CHANGED");

    await client.query("COMMIT");
    console.log(JSON.stringify({
      kind: "DEV064_STAGING_PRINCIPAL_REMAP",
      status: "success",
      targetProject: "jenfu-ai-pdm-stg-361825",
      pdmUserId: row.user_id,
      email: row.email,
      role: row.role,
      companyId: row.company_id,
      identityId: row.identity_id,
      identityLifecycleVersion: row.identity_lifecycle_version,
      platformPrincipalId: row.platform_principal_id,
      defaultMembershipOk: row.default_membership_ok,
      countsBefore: countsBefore.rows[0],
      countsAfter: countsAfter.rows[0],
      changed: identityUpdate.rowCount === 1 && mappingUpdate.rowCount === 1
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(async (error) => {
  console.error(JSON.stringify({ kind: "DEV064_STAGING_PRINCIPAL_REMAP", status: "failed", error: error.message }));
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
