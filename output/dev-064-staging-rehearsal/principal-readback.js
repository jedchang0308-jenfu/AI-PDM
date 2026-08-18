const { Pool } = require("pg");
const pool = new Pool({
  host: "127.0.0.1",
  port: Number(process.env.PDM_CLOUD_SQL_PORT || 5432),
  database: process.env.PDM_CLOUD_SQL_DATABASE,
  user: process.env.PDM_CLOUD_SQL_USER,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 60000
});
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const users = await client.query(`
      SELECT id, lower(email) AS email, display_name, role, company_id,
             account_status, system_role_enabled, password_hash IS NULL AS no_password
      FROM users
      WHERE lower(email) = 'jedchang0308@jenfu.com.tw'
      ORDER BY id
    `);
    const userIds = users.rows.map((row) => row.id);
    const identities = await client.query(`
      SELECT id, user_id, provider, provider_subject, email_normalized,
             status, identity_lifecycle_version
      FROM auth_identities
      WHERE user_id = ANY($1::text[])
         OR provider_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2'
      ORDER BY user_id, provider, id
    `, [userIds]);
    const mappings = await client.query(`
      SELECT platform_principal_id, pdm_user_id, mapping_source,
             mapping_status, external_subject
      FROM platform_principal_mappings
      WHERE pdm_user_id = ANY($1::text[])
         OR external_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2'
      ORDER BY pdm_user_id, platform_principal_id
    `, [userIds]);
    const memberships = await client.query(`
      SELECT user_id, company_id, is_default
      FROM user_company_memberships
      WHERE user_id = ANY($1::text[])
      ORDER BY user_id, company_id
    `, [userIds]);
    await client.query("COMMIT");
    console.log(JSON.stringify({
      kind: "DEV064_STAGING_PRINCIPAL_PRE_REPAIR_READBACK",
      users: users.rows,
      identities: identities.rows,
      mappings: mappings.rows,
      memberships: memberships.rows
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(async (error) => {
  console.error(error.message);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
