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
const oldRoles = [
  "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam",
  "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam"
];
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const result = await client.query(`
      WITH target_roles AS (
        SELECT oid, rolname FROM pg_roles WHERE rolname = ANY($1::text[])
      ), memberships AS (
        SELECT member.rolname AS member_name, granted.rolname AS granted_role
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles granted ON granted.oid = membership.roleid
        WHERE member.rolname = ANY($1::text[])
      )
      SELECT jsonb_build_object(
        'roles', (SELECT COALESCE(jsonb_agg(rolname ORDER BY rolname), '[]'::jsonb) FROM target_roles),
        'memberships', (SELECT COALESCE(jsonb_agg(to_jsonb(memberships) ORDER BY member_name, granted_role), '[]'::jsonb) FROM memberships),
        'owned_relations', (SELECT COUNT(*)::int FROM pg_class WHERE relowner IN (SELECT oid FROM target_roles)),
        'owned_functions', (SELECT COUNT(*)::int FROM pg_proc WHERE proowner IN (SELECT oid FROM target_roles)),
        'owned_types', (SELECT COUNT(*)::int FROM pg_type WHERE typowner IN (SELECT oid FROM target_roles)),
        'owned_schemas', (SELECT COUNT(*)::int FROM pg_namespace WHERE nspowner IN (SELECT oid FROM target_roles)),
        'owned_databases', (SELECT COUNT(*)::int FROM pg_database WHERE datdba IN (SELECT oid FROM target_roles))
      ) AS result
    `, [oldRoles]);
    await client.query("COMMIT");
    console.log(JSON.stringify({kind:"DEV064_STAGING_RESTORED_PRODUCTION_IAM_READBACK", result:result.rows[0].result}));
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
