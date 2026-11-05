import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** PDM-only baseline fixture: does not create/drop or replace any producer contract.
 * Requires a task-owned disposable PG administrator connection and existing shared roles.
 * The nine legacy roles plus one custom role are retained by the tested owner upgrade.
 */
export async function installDev127ConsumerFixture(client, { pdmRoot = process.cwd(), installConsumer = true } = {}) {
 const baseVersion='ai-pdm.role-policy.00000000-0000-4000-8000-000000000127'
 await client.query(`
  CREATE SCHEMA IF NOT EXISTS ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
  CREATE SCHEMA IF NOT EXISTS ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
  GRANT USAGE,CREATE ON SCHEMA ai_pdm_contract TO jenfu_ai_pdm_migrator;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.role_catalog_publications(catalog_version text PRIMARY KEY,contract_version text,application_id text,
      published_at timestamptz,catalog_sha256 char(64),status text,published_by text,retired_at timestamptz,
      publication_format text,canonicalization_version text,role_schema_id text,role_profile_schema_id text,
      baseline_role_identity_hash char(64),role_identity_hash char(64),role_profile_hash char(64),protected_policy_hash char(64),
      registry_hash char(64),role_profiles jsonb,policy_draft_id uuid,base_catalog_version text,base_catalog_sha256 char(64),command_id uuid,publish_reason text);
    CREATE TABLE ai_pdm_core.role_catalog_entries(catalog_version text,display_order integer,stable_role_id text,role_code text,display_name text,
      assignable boolean,risk text,subject_kind text,recommendation_allowed boolean,delegation_allowed boolean,allowed_scope_kinds jsonb,
      assignment_tier text,permissions jsonb,metadata jsonb,role_definition_hash char(64),role_status text,PRIMARY KEY(catalog_version,stable_role_id));
    CREATE TABLE ai_pdm_core.active_role_catalog(application_id text PRIMARY KEY,catalog_version text,activated_at timestamptz,activated_by text,activation_reason text);
    CREATE TABLE ai_pdm_core.users(id text PRIMARY KEY,company_id text);
    CREATE TABLE ai_pdm_core.principal_accounts(principal_id text PRIMARY KEY,employee_id text,pdm_user_id text,company_id text,
      account_status text,system_role_enabled boolean,account_type text,lifecycle_version bigint,profile_version bigint,session_invalid_before timestamptz);
    CREATE TABLE ai_pdm_core.principal_session_records(principal_id text,session_id_hash text,principal_auth_epoch bigint,
      revoked_at timestamptz,assurance_level text,issued_at timestamptz,authenticated_at timestamptz,expires_at timestamptz,
      lifecycle_version bigint,profile_version bigint,PRIMARY KEY(principal_id,session_id_hash));
    CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text) RETURNS void LANGUAGE sql AS $$SELECT$$;
    CREATE FUNCTION ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
    GRANT USAGE ON SCHEMA ai_pdm_core,ai_pdm_contract TO jenfu_ai_pdm_runtime,jenfu_orgmaster_runtime,jenfu_r1_verifier;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
    RESET ROLE;`)
  const migration086 = readFileSync(join(pdmRoot, 'db/postgres/086_dev123_role_policy_editor_v1.sql'), 'utf8')
  await client.query('SET ROLE jenfu_ai_pdm_migrator')
  await client.query(migration086.slice(migration086.indexOf('CREATE TABLE ai_pdm_core.role_policy_commands'), migration086.indexOf('DO $baseline$')))
  const migration087 = readFileSync(join(pdmRoot, 'db/postgres/087_dev123_role_policy_candidate_validation.sql'), 'utf8')
  await client.query(migration087.slice(migration087.indexOf('CREATE FUNCTION ai_pdm_core.dev123_canonical_json_v1'), migration087.indexOf('CREATE FUNCTION ai_pdm_core.dev123_assert_candidate_v1')))
  const viewStart = migration086.indexOf('CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v2')
  const historyStart = migration086.indexOf('CREATE OR REPLACE VIEW ai_pdm_contract.v_role_policy_publications_v1')
  const historyEnd = migration086.indexOf('ALTER TABLE ai_pdm_core.readonly_shares', historyStart)
  await client.query(migration086.slice(viewStart, historyEnd))
  await client.query('RESET ROLE')
  const fixture = JSON.parse(readFileSync(join(pdmRoot,'config/access-control/dev127-consumer-postgres-fixture.v1.json'),'utf8'))
  const base = fixture.legacy
  async function install(candidate, baseline = false) {
    await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications(catalog_version,contract_version,application_id,published_at,catalog_sha256,status,
      publication_format,canonicalization_version,role_schema_id,role_profile_schema_id,baseline_role_identity_hash,role_identity_hash,role_profile_hash,
      protected_policy_hash,registry_hash,role_profiles) VALUES($1,'jenfu.platform-entitlement.v1','ai-pdm',clock_timestamp(),$2,'active',$3,'jenfu.canonical-json.v1',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [candidate.candidateCatalogVersion,candidate.contentHash,candidate.format,candidate.roleSchemaId,candidate.roleProfileSchemaId,
      candidate.baselineRoleIdentityHash,candidate.roleIdentityHash,candidate.roleProfileHash,candidate.protectedPolicyHash,candidate.registryHash,JSON.stringify(candidate.roleProfiles)])
    for (const [index,role] of candidate.roles.entries()) {
      await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [candidate.candidateCatalogVersion,index,role.stableRoleId,role.roleCode,role.displayName,role.assignable,role.risk,role.subjectKind,
          role.recommendationAllowed,role.delegationAllowed,JSON.stringify(role.allowedScopeKinds),role.assignmentTier,JSON.stringify(role.permissions),JSON.stringify(role.metadata),role.roleDefinitionHash,role.roleStatus])
      const { permissions,roleStatus,roleDefinitionHash,...identity }=role
      await client.query(`INSERT INTO ai_pdm_core.role_policy_role_identities(stable_role_id,role_code,display_name,origin,identity_json,identity_hash,first_catalog_version)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[role.stableRoleId,role.roleCode,role.displayName,role.stableRoleId.startsWith('role-custom-')?'custom':'builtin',JSON.stringify(identity),candidate.identityHashes[role.stableRoleId],candidate.candidateCatalogVersion])
    }
  }
  // Validator's immutable v7 baseline is installed independently of the dynamic current.
  const source = { baseCatalog: fixture.baseCatalog }
  for (const [index,role] of source.baseCatalog.roles.entries()) await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active')`,
    [source.baseCatalog.catalogVersion,index,role.stableRoleId,role.roleCode,role.displayName,role.assignable,role.risk,role.subjectKind,role.recommendationAllowed,
      role.delegationAllowed,JSON.stringify(role.allowedScopeKinds),role.assignmentTier,JSON.stringify(role.permissions),JSON.stringify(role.metadata),role.roleDefinitionHash])
  await install(base)
  await client.query(`INSERT INTO ai_pdm_core.active_role_catalog VALUES('ai-pdm',$1,clock_timestamp(),'fixture','synthetic fixture')`,[baseVersion])
  if (installConsumer) await client.query(readFileSync(join(pdmRoot, 'db/postgres/096_dev127_platform_super_admin_consumer.sql'),'utf8'))

 const request='10000000-0000-4000-8000-000000000127'
 const upgraded=fixture.upgraded
 return {base,upgraded,async upgrade(){
  await client.query('SET ROLE jenfu_ai_pdm_migrator')
  try { const {rows:[row]}=await client.query('SELECT ai_pdm_core.role_policy_upgrade_v2($1,$2,$3,$4::jsonb) AS result',
   [request,baseVersion,base.contentHash,JSON.stringify(upgraded)]); return row.result }
  finally { await client.query('RESET ROLE') }
 }}
}
