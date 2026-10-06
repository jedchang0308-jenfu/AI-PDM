import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrincipalRoleCatalogV6 } from './dev121-build-principal-role-catalog-v6.mjs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export function buildV6Migration(template, baseline, catalog) {
  const inventory = JSON.parse(readFileSync(join(root,'config/access-control/jenfu-active-capabilities.v1.json'),'utf8'))
  assert.deepEqual(catalog,buildPrincipalRoleCatalogV6(baseline,inventory))
  let sql = template.replaceAll('\r\n','\n')
    .replaceAll('dev121-principal-role-catalog-v5','dev121-principal-role-catalog-v6')
    .replaceAll('publish v5 after migration 069, before Principal-only service traffic.',
      'publish v6 after the verified current owner ledger in the controlled maintenance window.')
    .replaceAll('DEV121_CATALOG_V4_BASELINE_MISMATCH','DEV121_CATALOG_V5_BASELINE_MISMATCH')
    .replaceAll('DEV121_CATALOG_V5_READBACK_FAILED','DEV121_CATALOG_V6_READBACK_FAILED')
    .replaceAll('principal-only catalog v5','principal-only catalog v6')
    .replaceAll('principal-only reviewed active workflow capabilities','explicit highest-role registered capabilities')
  sql = sql.replace(/catalog jsonb := \$dev121_catalog\$[^\n]+\$dev121_catalog\$::jsonb;/u,
    'catalog jsonb := $dev121_catalog$'+JSON.stringify(catalog)+'$dev121_catalog$::jsonb;\n  baseline_catalog jsonb := $dev121_baseline$'+JSON.stringify(baseline)+'$dev121_baseline$::jsonb;')
  sql = sql.replace("previous_version text := 'ai-pdm.role-catalog.2026-09-25.v4';",
    "previous_version text := '"+baseline.catalogVersion+"';")
    .replace("previous_hash text := '32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a';",
      "previous_hash text := '"+baseline.catalogSha256+"';")
  const exactRow = alias => [
    alias+'.display_order IS DISTINCT FROM expected.ordinal - 1',
    alias+".role_code IS DISTINCT FROM expected.role->>'roleCode'",
    alias+".display_name IS DISTINCT FROM expected.role->>'displayName'",
    alias+".assignable IS DISTINCT FROM (expected.role->>'assignable')::boolean",
    alias+".risk IS DISTINCT FROM expected.role->>'risk'",
    alias+".subject_kind IS DISTINCT FROM expected.role->>'subjectKind'",
    alias+".recommendation_allowed IS DISTINCT FROM (expected.role->>'recommendationAllowed')::boolean",
    alias+".delegation_allowed IS DISTINCT FROM (expected.role->>'delegationAllowed')::boolean",
    alias+".allowed_scope_kinds IS DISTINCT FROM expected.role->'allowedScopeKinds'",
    alias+".assignment_tier IS DISTINCT FROM expected.role->>'assignmentTier'",
    alias+".metadata IS DISTINCT FROM expected.role->'metadata'",
    alias+".role_definition_hash IS DISTINCT FROM expected.role->>'roleDefinitionHash'",
    alias+".permissions IS DISTINCT FROM expected.role->'permissions'"
  ].join('\n       OR ')
  const before = '  IF previous_observed_hash IS DISTINCT FROM previous_hash OR previous_count <> 9 THEN'
  assert.ok(sql.includes(before))
  sql = sql.replace(before,
    '  SELECT count(*) INTO mismatch_count FROM jsonb_array_elements(baseline_catalog->\'roles\') WITH ORDINALITY AS expected(role, ordinal)\n'+
    '    LEFT JOIN ai_pdm_core.role_catalog_entries observed ON observed.catalog_version=previous_version AND observed.stable_role_id=expected.role->>\'stableRoleId\'\n'+
    '    WHERE observed.stable_role_id IS NULL OR '+exactRow('observed')+';\n'+
    '  IF previous_observed_hash IS DISTINCT FROM previous_hash OR previous_count <> 9 OR mismatch_count <> 0 THEN')
  sql = sql.replace(/OR observed.display_order <> expected.ordinal - 1[\s\S]+?OR observed.permissions IS DISTINCT FROM expected.role->'permissions';/u,
    'OR '+exactRow('observed')+';')
  // Reject duplicate active publications and publication metadata drift, including replay.
  const finalReadback = '  SELECT count(*) INTO mismatch_count\n    FROM jsonb_array_elements(catalog->\'roles\') WITH ORDINALITY AS expected(role, ordinal)';
  assert.equal(sql.split(finalReadback).length, 2);
  sql = sql.replace(finalReadback,
    "  IF (SELECT count(*) FROM ai_pdm_core.role_catalog_publications WHERE application_id='ai-pdm' AND status='active') <> 1 OR\n"+
    "    (SELECT contract_version FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=next_version) IS DISTINCT FROM catalog->>'contractVersion' OR\n"+
    "    (SELECT published_at FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=next_version) IS DISTINCT FROM (catalog->>'publishedAt')::timestamptz THEN\n"+
    "    RAISE EXCEPTION 'DEV121_CATALOG_STATE_MISMATCH';\n  END IF;\n"+finalReadback)
  return sql
}
function main() {
  const mode=process.argv[2]; assert.ok(mode==='--write'||mode==='--check')
  const baseline=JSON.parse(readFileSync(join(root,'config/access-control/jenfu-role-catalog.v5.json'),'utf8'))
  const catalog=JSON.parse(readFileSync(join(root,'config/access-control/jenfu-role-catalog.v6.json'),'utf8'))
  const sql=buildV6Migration(readFileSync(join(root,'db/postgres/070_dev121_principal_role_catalog_v5.sql'),'utf8'),baseline,catalog)
  const file=join(root,'db/postgres/080_dev121_principal_role_catalog_v6.sql')
  if(mode==='--write')writeFileSync(file,sql)
  assert.equal(readFileSync(file,'utf8').replaceAll('\r\n','\n'),sql)
  console.log(JSON.stringify({status:'PASS',migration:'080',catalogSha256:catalog.catalogSha256}))
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main()
