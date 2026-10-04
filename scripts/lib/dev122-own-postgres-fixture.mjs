import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const marker = 'AIPDM_DEV122_LOCAL_V1';
export const fixtureVersion = 'ai-pdm.dev122.own-postgres-fixture.v1';
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const baseline = ['001','003','042','047','048','049','050','051','052','053','055','056','063','062','064'];
const order = [...baseline, ...Array.from({ length: 13 }, (_, i) => String(i + 65).padStart(3, '0'))];

export function compileOwnMigrations(root) {
  const directory = path.join(root, 'db/postgres');
  return order.map(ordinal => {
    const names = fs.readdirSync(directory).filter(name => name.startsWith(ordinal + '_') && name.endsWith('.sql'));
    if (names.length !== 1) throw new Error(`DEV122_ORDINAL_CONFLICT:${ordinal}`);
    const name = names[0], sourcePath = `db/postgres/${name}`;
    const bytes = fs.readFileSync(path.join(directory, name));
    let sql = bytes.toString('utf8').replaceAll('\r\n', '\n');
    const transforms = [];
    // Compile historical application namespace only. Uppercase PUBLIC privilege
    // clauses and 063's catalog layout detector retain their original meaning.
    if (baseline.includes(ordinal) && !['062', '063', '064'].includes(ordinal)) {
      sql = sql.replace(/\bpublic\./gu, 'ai_pdm_core.')
        .replace(/(SET search_path\s*=\s*)public\b/gu, '$1ai_pdm_core');
      transforms.push('historical_public_namespace_to_own');
    }
    if (ordinal === '055') {
      sql = sql.replaceAll('jenfu_platform_migrator', 'jenfu_ai_pdm_migrator');
      transforms.push('055_catalog_owner_to_own_migrator');
    }
    if (ordinal === '062') {
      for (const tag of ['import_legacy_ledger','move_public_relations','move_public_functions']) {
        const opening = `DO $${tag}$`, closing = `$${tag}$;`;
        const start = sql.indexOf(opening), end = sql.indexOf(closing, start + opening.length);
        if (start < 0 || end < 0 || sql.indexOf(opening, start + 1) >= 0) throw new Error(`DEV122_DO_SHAPE:${tag}`);
        sql = sql.slice(0, start) + `-- DEV122 fresh own namespace: omitted ${tag}.\n` + sql.slice(end + closing.length);
        transforms.push(`062_omit_exact_${tag}`);
      }
    }
    // Each migration retains its own BEGIN/COMMIT. No applied source is edited.
    return { ordinal, sourcePath, sourceHash: sha256(bytes), compiledHash: sha256(sql), transforms, sql };
  });
}

export async function bootstrapOwnSchemas(client, database) {
  if (!/^dev122_[a-f0-9]{16}$/u.test(database)) throw new Error('DEV122_DATABASE_INVALID');
  await client.query(`CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE ROLE dev122_runtime LOGIN IN ROLE jenfu_ai_pdm_runtime;
    CREATE ROLE dev122_migration LOGIN IN ROLE jenfu_ai_pdm_migrator;
    CREATE ROLE jenfu_platform_runtime NOLOGIN;
    CREATE ROLE jenfu_orgmaster_runtime NOLOGIN;
    CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
    CREATE ROLE jenfu_r1_verifier NOLOGIN;`);
  await client.query(`CREATE DATABASE ${database}`);
  // 055 executes CREATE SCHEMA IF NOT EXISTS under SET LOCAL ROLE. Database
  // CREATE is required even when our own schema already exists. Runtime has none.
  await client.query(`GRANT CREATE ON DATABASE ${database} TO jenfu_ai_pdm_migrator`);
  await client.query(`COMMENT ON DATABASE ${database} IS '${marker}'`);
}

export async function installOwnFixture(admin, entries, sourceHead, evidenceDirectory) {
  fs.mkdirSync(path.join(evidenceDirectory, 'compiled-sql'), { recursive: true });
  await admin.query(`CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    SET search_path=ai_pdm_core,pg_catalog;`);
  const ledger = [];
  for (const entry of entries) {
    fs.writeFileSync(path.join(evidenceDirectory, 'compiled-sql', `${entry.ordinal}.sql`), entry.sql);
    if (entry.ordinal === '066') await publishBaselineCatalog(admin, evidenceDirectory, ledger);
    try { await admin.query(entry.sql); }
    catch (error) {
      Object.assign(error, { fixtureMigration: entry.sourcePath,
        fixtureSourceHash: entry.sourceHash, fixtureCompiledHash: entry.compiledHash });
      throw error;
    }
    await admin.query('RESET ROLE');
    if (entry.ordinal === '055') await publishBaselineCatalog(admin, evidenceDirectory, ledger);
    if (entry.ordinal === '077') {
      await admin.query(entry.sql); // additive rerun must also succeed
      await admin.query('RESET ROLE');
    }
  }
  // Local-only ledger uses the actual source and compiled hashes, never a
  // production migration allowlist or claimed producer publication.
  for (const entry of entries) await admin.query(`INSERT INTO ai_pdm_core.schema_migrations
    (version,name,checksum_sha256,source_revision) VALUES ($1,$2,$3,$4)`,
    [`dev122-local-${entry.ordinal}`,path.basename(entry.sourcePath),entry.compiledHash,sourceHead]);
  const invariant = await readBaselineInvariants(admin);
  fs.writeFileSync(path.join(evidenceDirectory, 'baseline-invariants.json'), JSON.stringify(invariant, null, 2));
  fs.writeFileSync(path.join(evidenceDirectory, 'catalog-ledger.json'), JSON.stringify(ledger, null, 2));
  if (invariant.masterCounts.some(row => Number(row.count) !== 0) || invariant.rootViolations.length || invariant.foreignKeyViolations.length || invariant.residue.length) {
    throw new Error('DEV122_UNMODIFIED_BASELINE_INVARIANT_FAILED');
  }
  await admin.query(`GRANT USAGE ON SCHEMA ai_pdm_core,ai_pdm_contract TO jenfu_ai_pdm_runtime;
    ALTER ROLE dev122_runtime SET search_path=ai_pdm_core,pg_catalog;`);
  return invariant;
}

async function publishBaselineCatalog(client, evidenceDirectory, ledger) {
  // Repository's committed v3 publication is the exact prerequisite of 066.
  // First call occurs before 062 moves private publication tables to own core.
  if (ledger.length) return;
  // Caller sets a verified source path rather than deriving a sibling input.
  const source = process.env.DEV122_SOURCE_ROOT;
  if (!source) throw new Error('DEV122_SOURCE_ROOT_REQUIRED');
  const sourcePath = 'config/access-control/jenfu-role-catalog.v1.json';
  const bytes = fs.readFileSync(path.join(source, sourcePath));
  const catalog = JSON.parse(bytes.toString('utf8'));
  const schema = 'ai_pdm_contract';
  await client.query(`INSERT INTO ${schema}.role_catalog_publications
    (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
    VALUES ($1,$2,$3,$4,$5,'active','DEV122 local prerequisite')`,
    [catalog.catalogVersion,catalog.contractVersion,catalog.applicationId,catalog.publishedAt,catalog.catalogSha256]);
  for (const [index, role] of catalog.roles.entries()) await client.query(`INSERT INTO ${schema}.role_catalog_entries
    (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
     recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [catalog.catalogVersion,index,role.stableRoleId,role.roleCode,role.displayName,role.assignable,role.risk,
      role.subjectKind,role.recommendationAllowed,role.delegationAllowed,JSON.stringify(role.allowedScopeKinds),
      role.assignmentTier,JSON.stringify(role.permissions),role.metadata ?? null,role.roleDefinitionHash]);
  await client.query(`INSERT INTO ${schema}.active_role_catalog
    (application_id,catalog_version,activated_at,activated_by,activation_reason)
    VALUES ($1,$2,$3,'DEV122 fixture','committed catalog prerequisite')`,[catalog.applicationId,catalog.catalogVersion,catalog.publishedAt]);
  ledger.push({ sourcePath, sourceHash: sha256(bytes), catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256, roleCount: catalog.roles.length, boundary: 'FIXTURE' });
}

export async function readBaselineInvariants(client) {
  const masterCounts = [];
  for (const table of ['part_roots','part_numbers','drawing_numbers','drawings']) masterCounts.push({ table, ...(await client.query(`SELECT count(*)::int AS count FROM ai_pdm_core.${table}`)).rows[0] });
  const rootViolations = (await client.query(`SELECT part.id FROM ai_pdm_core.part_numbers part
    LEFT JOIN ai_pdm_core.part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id
    WHERE root.id IS NULL UNION ALL SELECT drawing.id FROM ai_pdm_core.drawing_numbers drawing
    LEFT JOIN ai_pdm_core.part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id
    WHERE root.id IS NULL`)).rows;
  const foreignKeyViolations = [];
  const keys = (await client.query(`SELECT c.oid,c.conname,c.convalidated,c.confmatchtype,
    n.nspname AS schema,t.relname AS table,rn.nspname AS referenced_schema,rt.relname AS referenced_table,
    array_agg(a.attname::text ORDER BY k.position) AS columns,array_agg(ra.attname::text ORDER BY k.position) AS referenced_columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class rt ON rt.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(attnum,referenced_attnum,position)
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
    JOIN pg_attribute ra ON ra.attrelid=rt.oid AND ra.attnum=k.referenced_attnum
    WHERE c.contype='f' AND n.nspname='ai_pdm_core'
    GROUP BY c.oid,c.conname,c.convalidated,c.confmatchtype,n.nspname,t.relname,rn.nspname,rt.relname`)).rows;
  const quote = identifier => '"' + identifier.replaceAll('"','""') + '"';
  // Read every native FK, including NOT VALID constraints, without changing
  // the migration baseline or convalidated metadata.
  for (const key of keys) {
    if (!['ai_pdm_core','ai_pdm_contract'].includes(key.referenced_schema)) throw new Error('DEV122_FOREIGN_FK_REJECTED');
    const matches=key.columns.map((column,index)=>`parent.${quote(key.referenced_columns[index])}=child.${quote(column)}`).join(' AND ');
    const allNotNull=key.columns.map(column=>`child.${quote(column)} IS NOT NULL`).join(' AND ');
    const anyNotNull=key.columns.map(column=>`child.${quote(column)} IS NOT NULL`).join(' OR ');
    const anyNull=key.columns.map(column=>`child.${quote(column)} IS NULL`).join(' OR ');
    const orphan=`NOT EXISTS(SELECT 1 FROM ${quote(key.referenced_schema)}.${quote(key.referenced_table)} parent WHERE ${matches})`;
    const predicate=key.confmatchtype==='f'?`(${anyNotNull}) AND ((${anyNull}) OR ${orphan})`:`(${allNotNull}) AND ${orphan}`;
    const count=Number((await client.query(`SELECT count(*) AS count FROM ai_pdm_core.${quote(key.table)} child WHERE ${predicate}`)).rows[0].count);
    if(count)foreignKeyViolations.push({table:key.table,constraint:key.conname,count});
  }
  const residue = (await client.query(`SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' AND c.relkind IN ('r','p','v','m','S'))
       OR (n.nspname NOT IN ('public','ai_pdm_core','ai_pdm_contract','information_schema')
           AND n.nspname NOT LIKE 'pg_%')`)).rows;
  return { masterCounts, rootViolations, foreignKeyViolations, foreignKeyCount: keys.length,
    constraints: keys.map(({oid,...key})=>key), residue,
    snapshot: 'unmodified migration baseline before case seed' };
}

export async function installContractFixture(admin) {
  await admin.query(`CREATE TABLE ai_pdm_contract.dev122_fixture_active_principal_accounts_v1 (
    contract_version text NOT NULL,principal_issuer text NOT NULL,principal_subject text NOT NULL,
    principal_id text NOT NULL,employee_id text NOT NULL,employee_status text NOT NULL,
    mapping_version bigint NOT NULL,published_at timestamptz NOT NULL,account_type text NOT NULL,
    PRIMARY KEY(principal_issuer,principal_subject));
    CREATE VIEW ai_pdm_contract.dev122_fixture_active_principal_mappings_v1 AS
      SELECT * FROM ai_pdm_contract.dev122_fixture_active_principal_accounts_v1;
    CREATE TABLE ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 (
      contract_version text NOT NULL,assignment_version_id text NOT NULL,assignment_version bigint NOT NULL,
      assignment_id text PRIMARY KEY,grant_kind text NOT NULL,delegation_id text,application_id text NOT NULL,
      principal_id text NOT NULL,employee_id text NOT NULL,subject_kind text NOT NULL,target_principal_id text,
      stable_role_id text NOT NULL,role_code text NOT NULL,catalog_version text NOT NULL,
      scope_kind text NOT NULL,scope_key text,valid_from timestamptz NOT NULL,valid_until timestamptz,published_at timestamptz NOT NULL);
    CREATE VIEW ai_pdm_contract.dev122_fixture_principal_effective_grants_v4 AS
      SELECT * FROM ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4
      WHERE valid_from <= transaction_timestamp()
        AND (valid_until IS NULL OR transaction_timestamp() < valid_until);
    CREATE TABLE ai_pdm_contract.dev122_fixture_principal_auth_state_v3 (
      principal_id text PRIMARY KEY,auth_epoch bigint NOT NULL,revoked_before timestamptz);
    ALTER TABLE ai_pdm_contract.dev122_fixture_active_principal_accounts_v1 OWNER TO jenfu_ai_pdm_migrator;
    ALTER VIEW ai_pdm_contract.dev122_fixture_active_principal_mappings_v1 OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 OWNER TO jenfu_ai_pdm_migrator;
    ALTER VIEW ai_pdm_contract.dev122_fixture_principal_effective_grants_v4 OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_contract.dev122_fixture_principal_auth_state_v3 OWNER TO jenfu_ai_pdm_migrator;
    REVOKE ALL ON ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4,
      ai_pdm_contract.dev122_fixture_principal_effective_grants_v4 FROM PUBLIC,jenfu_ai_pdm_runtime,dev122_runtime;
    GRANT SELECT ON ai_pdm_contract.dev122_fixture_active_principal_accounts_v1,
      ai_pdm_contract.dev122_fixture_active_principal_mappings_v1,
      ai_pdm_contract.dev122_fixture_principal_effective_grants_v4,
      ai_pdm_contract.dev122_fixture_principal_auth_state_v3 TO jenfu_ai_pdm_runtime;`);
  const readback=(await admin.query(`SELECT
    has_table_privilege('dev122_runtime','ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4','SELECT,INSERT,UPDATE,DELETE') AS base_access,
    has_table_privilege('dev122_runtime','ai_pdm_contract.dev122_fixture_principal_effective_grants_v4','SELECT') AS view_select,
    has_table_privilege('dev122_runtime','ai_pdm_contract.dev122_fixture_principal_effective_grants_v4','INSERT,UPDATE,DELETE') AS view_mutation,
    pg_get_viewdef('ai_pdm_contract.dev122_fixture_principal_effective_grants_v4'::regclass,true) AS view_definition`)).rows[0];
  if(!readback||readback.base_access||!readback.view_select||readback.view_mutation)throw new Error('DEV122_EFFECTIVE_FIXTURE_PRIVILEGE_READBACK_FAILED');
  return readback;
}
