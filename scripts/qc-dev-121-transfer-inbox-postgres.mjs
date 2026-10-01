#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-transfer-inbox-'))
assert.ok(taskRoot.startsWith(`${tempRoot}${path.sep}`))
const pdmDataDir = path.join(taskRoot, 'pdm-data')
const pdmRepositoryDir = path.join(taskRoot, 'pdm-repository')
process.env.PDM_DATA_DIR = pdmDataDir
process.env.PDM_REPOSITORY_DIR = pdmRepositoryDir
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
let port
let admin
let started = false
let stopped = false
let released = false
let tempRemoved = false

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, {
    cwd: root, encoding: 'utf8', windowsHide: true, ...options
  })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function portReleased(value) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

async function check(name, action) {
  await action()
  checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}

function probe(phase, contractUrl, testFile = 'src/lib/transfer-package-phase1d.postgres-contract.test.ts') {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
    testFile, '--reporter=dot'
  ], { cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PDM_DEV121_TRANSFER_POSTGRES_URL: contractUrl,
      PDM_DEV121_TRANSFER_PHASE: phase, PDM_DB_PROVIDER: 'postgres',
      PDM_POSTGRES_URL: contractUrl, DEV010_N2_DATABASE_BOUNDARY: 'required' } })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  assert.equal(result.status, 0, `real PostgreSQL transfer ${phase} contract failed`)
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 Principal transfer review inbox PostgreSQL contract',
    port, owningProcessTree: 'qc-dev-121-transfer-inbox-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'clients closed, cluster stopped, port released, temporary root removed',
    mutationScope: taskRoot, PDM_DATA_DIR: pdmDataDir,
    PDM_REPOSITORY_DIR: pdmRepositoryDir, productionWrites: false
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust',
    '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'],
    { stdio: 'ignore' })
  started = true
  admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query(`
    CREATE ROLE dev121_transfer_runtime LOGIN;
    CREATE SCHEMA ai_pdm_core;
    CREATE TABLE ai_pdm_core.users (
      id text PRIMARY KEY, company_id text NOT NULL, display_name text NOT NULL
    );
    CREATE TABLE ai_pdm_core.approval_platform_requests (
      id text PRIMARY KEY, company_id text NOT NULL, action_code text NOT NULL,
      request_status text NOT NULL, title text NOT NULL, reason text NOT NULL,
      requested_by text NOT NULL, requested_at timestamptz NOT NULL,
      payload_json jsonb NOT NULL
    );
    CREATE TABLE ai_pdm_core.transfer_packages (
      id text PRIMARY KEY, company_id text NOT NULL,
      package_status text NOT NULL, review_request_id text,
      review_snapshot_hash text
    );
    GRANT USAGE ON SCHEMA ai_pdm_core TO dev121_transfer_runtime;
    GRANT SELECT ON ALL TABLES IN SCHEMA ai_pdm_core TO dev121_transfer_runtime;
    INSERT INTO ai_pdm_core.users VALUES ('profile-owner', 'company-jenfu', 'Owner');
    INSERT INTO ai_pdm_core.users VALUES ('profile-reviewer', 'company-jenfu', 'Reviewer');
    INSERT INTO ai_pdm_core.approval_platform_requests VALUES
      ('APR-TRF-00000000-0000-4000-8000-000000000001', 'company-jenfu',
       'transfer.package_review', 'pending', '技轉包審核', 'ready',
       'profile-owner', now(),
       '{"transferPackageId":"package-one","snapshotHash":"snapshot-one","reviewer":{"version":1,"principalId":"principal-reviewer","profileId":"profile-reviewer"}}'::jsonb);
    INSERT INTO ai_pdm_core.transfer_packages VALUES
      ('package-one', 'company-jenfu', 'InReview',
       'APR-TRF-00000000-0000-4000-8000-000000000001', 'snapshot-one');
    INSERT INTO ai_pdm_core.approval_platform_requests VALUES
      ('APR-TRF-00000000-0000-4000-8000-000000000003', 'company-jenfu',
       'transfer.package_review', 'pending', '快照失效', 'ready',
       'profile-owner', now(),
       '{"transferPackageId":"package-tampered","snapshotHash":"snapshot-original","reviewer":{"version":1,"principalId":"principal-reviewer","profileId":"profile-reviewer"}}'::jsonb),
      ('APR-TRF-00000000-0000-4000-8000-000000000004', 'company-jenfu',
       'transfer.package_review', 'approved', '已結案', 'ready',
       'profile-owner', now(),
       '{"transferPackageId":"package-closed","snapshotHash":"snapshot-closed","reviewer":{"version":1,"principalId":"principal-reviewer","profileId":"profile-reviewer"}}'::jsonb);
    INSERT INTO ai_pdm_core.transfer_packages VALUES
      ('package-tampered', 'company-jenfu', 'InReview',
       'APR-TRF-00000000-0000-4000-8000-000000000003', 'snapshot-other'),
      ('package-closed', 'company-jenfu', 'ApprovedPendingPublish',
       'APR-TRF-00000000-0000-4000-8000-000000000004', 'snapshot-closed');
  `)
  const contractUrl = `postgresql://dev121_transfer_runtime@127.0.0.1:${port}/postgres`
  await check('Principal transfer inbox read-only contract', async () => probe('inbox', contractUrl))
  await admin.query(`
    ALTER TABLE ai_pdm_core.approval_platform_requests
      ADD COLUMN package_id text,
      ADD COLUMN domain_code text NOT NULL DEFAULT 'transfer',
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN apply_status text NOT NULL DEFAULT 'not_ready',
      ADD COLUMN apply_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN resolved_by text,
      ADD COLUMN resolved_at timestamptz,
      ADD COLUMN applied_by text,
      ADD COLUMN applied_at timestamptz,
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE ai_pdm_core.transfer_packages
      ADD COLUMN package_code text NOT NULL DEFAULT 'TRF-QC',
      ADD COLUMN title text NOT NULL DEFAULT '技轉包',
      ADD COLUMN case_type text NOT NULL DEFAULT 'new_part',
      ADD COLUMN case_reason text NOT NULL DEFAULT 'QC',
      ADD COLUMN source_reference_status text NOT NULL DEFAULT 'not_required',
      ADD COLUMN source_reference text,
      ADD COLUMN source_reference_reason text,
      ADD COLUMN owner_id text NOT NULL DEFAULT 'profile-owner',
      ADD COLUMN created_by text NOT NULL DEFAULT 'profile-owner',
      ADD COLUMN review_snapshot_version integer NOT NULL DEFAULT 0,
      ADD COLUMN submitted_by text,
      ADD COLUMN submitted_at timestamptz,
      ADD COLUMN approved_by text,
      ADD COLUMN approved_at timestamptz,
      ADD COLUMN published_by text,
      ADD COLUMN published_at timestamptz,
      ADD COLUMN release_failure_correlation_id text,
      ADD COLUMN cancel_reason text,
      ADD COLUMN cancelled_by text,
      ADD COLUMN cancelled_at timestamptz,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN row_version integer NOT NULL DEFAULT 1,
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    CREATE TABLE ai_pdm_core.transfer_package_items (
      id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
      entity_type text NOT NULL, entity_id text NOT NULL, entity_code text NOT NULL,
      display_label text NOT NULL, root_code text, record_status text NOT NULL,
      added_by text NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.numbering_draft_workspaces (
      id text PRIMARY KEY, company_id text NOT NULL, row_version integer NOT NULL,
      lifecycle_status text NOT NULL, owner_id text NOT NULL
    );
    CREATE TABLE ai_pdm_core.transfer_package_draft_items (
      id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
      workspace_id text NOT NULL, requiredness text NOT NULL,
      inclusion_reason text NOT NULL, captured_workspace_version integer NOT NULL,
      added_by text NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.part_numbers (
      id text PRIMARY KEY, company_id text NOT NULL, record_status text NOT NULL,
      updated_at timestamptz NOT NULL, part_name text NOT NULL, item_kind text NOT NULL,
      custom_specification text, series_code text
    );
    CREATE TABLE ai_pdm_core.part_variant_attributes (
      part_number_id text PRIMARY KEY, updated_at timestamptz,
      material_code text, material_label text, color_code text, color_label text,
      surface_treatment text, variant_note text
    );
    CREATE TABLE ai_pdm_core.drawing_numbers (
      id text PRIMARY KEY, company_id text NOT NULL, record_status text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), purpose_code text NOT NULL,
      purpose_description text NOT NULL, is_primary_manufacturing boolean NOT NULL
    );
    CREATE TABLE ai_pdm_core.drawings (
      id text PRIMARY KEY, company_id text NOT NULL, formal_drawing_number_id text NOT NULL
    );
    CREATE TABLE ai_pdm_core.drawing_revisions (
      id text PRIMARY KEY, company_id text NOT NULL, drawing_id text NOT NULL,
      revision text NOT NULL, lifecycle_state text NOT NULL, released_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(), row_version integer NOT NULL DEFAULT 1,
      policy_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE ai_pdm_core.canonical_workbench_states (
      id text PRIMARY KEY, company_id text NOT NULL, entity_type text NOT NULL,
      canonical_entity_id text NOT NULL, data_layer text NOT NULL,
      revision_id text, row_version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE ai_pdm_core.approval_platform_targets (
      id text PRIMARY KEY, request_id text NOT NULL, target_role text NOT NULL,
      target_type text NOT NULL, target_id text NOT NULL, target_code text,
      target_label text NOT NULL, target_status text NOT NULL,
      snapshot_json jsonb NOT NULL, sort_order integer NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.approval_platform_impact_snapshots (
      id text PRIMARY KEY, request_id text NOT NULL, package_id text,
      snapshot_hash text NOT NULL, snapshot_json jsonb NOT NULL,
      captured_by text NOT NULL, captured_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.approval_platform_decisions (
      id text PRIMARY KEY, request_id text NOT NULL,
      approver_role text NOT NULL, approver_id text NOT NULL,
      decision text NOT NULL, comment text, decided_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.number_candidate_reservations (
      id text PRIMARY KEY, company_id text NOT NULL,
      approval_request_id text, reservation_state text NOT NULL,
      row_version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ai_pdm_core.transfer_package_events (
      id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
      event_type text NOT NULL, actor_id text NOT NULL,
      detail_json jsonb NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.principal_accounts (
      principal_id text PRIMARY KEY, pdm_user_id text NOT NULL,
      employee_id text NOT NULL, account_type text NOT NULL,
      company_id text NOT NULL, lifecycle_version integer NOT NULL,
      profile_version integer NOT NULL, account_status text NOT NULL,
      system_role_enabled boolean NOT NULL, minimum_assurance text NOT NULL,
      session_invalid_before timestamptz,
      UNIQUE(company_id,pdm_user_id,principal_id)
    );
    INSERT INTO ai_pdm_core.principal_accounts VALUES
      ('principal-reviewer','profile-reviewer','employee-reviewer',
       'human_personal','company-jenfu',1,1,'active',true,'aal1',NULL),
      ('principal-owner','profile-owner','employee-owner',
       'human_personal','company-jenfu',1,1,'active',true,'aal1',NULL);
    CREATE TABLE ai_pdm_core.platform_command_receipts (
      id text PRIMARY KEY, company_id text NOT NULL, command_name text NOT NULL,
      schema_version integer NOT NULL, idempotency_key text NOT NULL,
      actor_id text, principal_id text, platform_principal_id text,
      platform_organization_id text, correlation_id text NOT NULL,
      command_status text NOT NULL, response_json jsonb NOT NULL,
      created_at timestamptz NOT NULL, completed_at timestamptz,
      UNIQUE(company_id,command_name,idempotency_key),
      FOREIGN KEY(company_id,actor_id,principal_id)
        REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id)
    );
    CREATE TABLE ai_pdm_core.platform_outbox_events (
      id text PRIMARY KEY, company_id text NOT NULL, aggregate_type text NOT NULL,
      aggregate_id text NOT NULL, event_type text NOT NULL, schema_version integer NOT NULL,
      payload_json jsonb NOT NULL, actor_id text, principal_id text,
      platform_principal_id text, platform_organization_id text,
      correlation_id text NOT NULL, idempotency_key text NOT NULL,
      delivery_status text NOT NULL, attempt_count integer NOT NULL,
      next_attempt_at timestamptz, last_error text,
      occurred_at timestamptz NOT NULL, published_at timestamptz,
      updated_at timestamptz NOT NULL,
      UNIQUE(company_id,event_type,idempotency_key),
      FOREIGN KEY(company_id,actor_id,principal_id)
        REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id)
    );
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ai_pdm_core TO dev121_transfer_runtime;
    INSERT INTO ai_pdm_core.approval_platform_requests
      (id,company_id,action_code,request_status,title,reason,requested_by,
       requested_at,payload_json)
      VALUES ('APR-TRF-00000000-0000-4000-8000-000000000002','company-jenfu',
       'transfer.package_review','pending','技轉包審核 2','ready','profile-owner',now(),
       '{"transferPackageId":"package-two","snapshotHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reviewer":{"version":1,"principalId":"principal-reviewer","profileId":"profile-reviewer"}}'::jsonb);
    INSERT INTO ai_pdm_core.transfer_packages
      (id,company_id,package_status,review_request_id,review_snapshot_hash)
      VALUES ('package-two','company-jenfu','InReview',
       'APR-TRF-00000000-0000-4000-8000-000000000002','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    INSERT INTO ai_pdm_core.transfer_packages
      (id,company_id,package_status,review_request_id,review_snapshot_hash)
      VALUES ('package-three','company-jenfu','Draft',NULL,NULL);
    INSERT INTO ai_pdm_core.part_numbers
      (id,company_id,record_status,updated_at,part_name,item_kind)
      VALUES ('part-three','company-jenfu','Active',now(),'QC part','part');
    INSERT INTO ai_pdm_core.transfer_package_items
      (id,company_id,package_id,entity_type,entity_id,entity_code,
       display_label,root_code,record_status,added_by,created_at)
      VALUES ('item-three','company-jenfu','package-three','part_number',
       'part-three','P-QC-3','QC part','P-QC-3','Active','profile-owner',now());
  `)
  if (process.argv.includes('--official-snapshot-only')) {
    await check('canonical official transfer snapshot on real PostgreSQL',
      async () => probe('snapshot', contractUrl))
  } else {
  await check('Principal transfer decision, receipt and outbox transaction',
    async () => probe('decision', contractUrl))

  const catalog = JSON.parse(fs.readFileSync(path.join(root,
    'config/access-control/jenfu-role-catalog.v5.json'), 'utf8'))
  const catalogRows = catalog.roles.map((role, displayOrder) => ({
    stableRoleId: role.stableRoleId, roleCode: role.roleCode,
    roleDefinitionHash: role.roleDefinitionHash, displayOrder
  }))
  await admin.query(`
    CREATE SCHEMA orgmaster_contract;
    CREATE SCHEMA ai_pdm_contract;
    CREATE TABLE orgmaster_contract.v_active_principal_accounts_v1 (
      principal_issuer text NOT NULL, principal_subject text NOT NULL,
      principal_id text NOT NULL, employee_id text NOT NULL,
      account_type text NOT NULL, contract_version text NOT NULL,
      employee_status text NOT NULL
    );
    CREATE TABLE orgmaster_contract.v_ai_pdm_principal_effective_grants_v3 (
      contract_version text NOT NULL, assignment_version_id text NOT NULL,
      assignment_version integer NOT NULL, assignment_id text NOT NULL,
      grant_kind text NOT NULL, delegation_id text, application_id text NOT NULL,
      principal_id text NOT NULL, employee_id text NOT NULL,
      subject_kind text NOT NULL, target_principal_id text,
      stable_role_id text NOT NULL, role_code text NOT NULL,
      catalog_version text NOT NULL, scope_kind text NOT NULL, scope_key text,
      valid_from timestamptz NOT NULL, valid_until timestamptz,
      published_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_contract.v_application_role_catalog_v1 (
      contract_version text NOT NULL, application_id text NOT NULL,
      catalog_version text NOT NULL, catalog_sha256 text NOT NULL,
      display_order integer NOT NULL, stable_role_id text NOT NULL,
      role_definition_hash text NOT NULL
    );
    CREATE TABLE ai_pdm_core.role_priority_versions (
      status text NOT NULL, priority_json text NOT NULL
    );
    INSERT INTO orgmaster_contract.v_active_principal_accounts_v1 VALUES
      ('issuer-legacy','subject-legacy','principal-reviewer','employee-reviewer',
       'human_personal','organization.active-principal.v1','active');
    GRANT USAGE ON SCHEMA orgmaster_contract,ai_pdm_contract TO dev121_transfer_runtime;
    GRANT SELECT ON ALL TABLES IN SCHEMA orgmaster_contract TO dev121_transfer_runtime;
    GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1,
      ai_pdm_core.role_priority_versions TO dev121_transfer_runtime;
  `)
  await admin.query(`INSERT INTO ai_pdm_contract.v_application_role_catalog_v1
    (contract_version,application_id,catalog_version,catalog_sha256,
     display_order,stable_role_id,role_definition_hash)
    SELECT $1,$2,$3,$4,role.display_order,role.stable_role_id,role.role_definition_hash
    FROM jsonb_to_recordset($5::jsonb) AS role(display_order integer,
      stable_role_id text,role_definition_hash text)`, [
    catalog.contractVersion, catalog.applicationId, catalog.catalogVersion,
    catalog.catalogSha256, JSON.stringify(catalogRows.map((row) => ({
      display_order: row.displayOrder, stable_role_id: row.stableRoleId,
      role_definition_hash: row.roleDefinitionHash
    })))
  ])
  await admin.query(`INSERT INTO ai_pdm_core.role_priority_versions VALUES ('active',$1)`,
    [JSON.stringify(catalog.roles.map((role) => role.roleCode))])
  await admin.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
    (contract_version,assignment_version_id,assignment_version,assignment_id,
     grant_kind,delegation_id,application_id,principal_id,employee_id,
     subject_kind,target_principal_id,stable_role_id,role_code,catalog_version,
     scope_kind,scope_key,valid_from,valid_until,published_at)
    VALUES ($1,'published-grant-one',1,'assignment-reviewer','direct',NULL,
      'ai-pdm','principal-reviewer','employee-reviewer','employee',NULL,
      'role-rd-manager','rd_manager',$2,'workspace','company-jenfu',
      '2026-01-01T00:00:00Z',NULL,'2026-09-29T00:00:00Z')`,
    ['jenfu.orgmaster.ai-pdm-principal-grants.v3',catalog.catalogVersion])
  await admin.query(`
    INSERT INTO ai_pdm_core.approval_platform_requests
      (id,company_id,action_code,request_status,title,reason,requested_by,
       requested_at,payload_json)
    SELECT 'APR-TRF-00000000-0000-4000-8000-00000000000' || suffix,
      'company-jenfu','transfer.package_review','pending','技轉授權契約',
      'ready','profile-owner',now(),
      jsonb_build_object('transferPackageId','package-grant-' || label,
        'snapshotHash',repeat('b',64),
        'reviewer',jsonb_build_object('version',1,
          'principalId','principal-reviewer','profileId','profile-reviewer'))
    FROM (VALUES ('5','allowed'),('6','scoped'),('7','revoked'),
      ('8','delegated')) AS fixture(suffix,label);
    INSERT INTO ai_pdm_core.transfer_packages
      (id,company_id,package_status,review_request_id,review_snapshot_hash)
    SELECT 'package-grant-' || label,'company-jenfu','InReview',
      'APR-TRF-00000000-0000-4000-8000-00000000000' || suffix,repeat('b',64)
    FROM (VALUES ('5','allowed'),('6','scoped'),('7','revoked'),
      ('8','delegated')) AS fixture(suffix,label);
  `)
  const grantTest = 'src/lib/transfer-package-principal-grant.postgres-contract.test.ts'
  await check('published Principal grant permits a bound transfer decision and atomic receipt',
    async () => probe('grant-assigned', contractUrl, grantTest))
  await admin.query(`UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
    SET scope_key='company-other' WHERE principal_id='principal-reviewer'`)
  await check('changed published workspace scope denies the transfer decision',
    async () => probe('grant-scoped', contractUrl, grantTest))
  await admin.query(`DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
    WHERE principal_id='principal-reviewer'`)
  await check('revoked published grant denies the transfer decision without side effects',
    async () => probe('grant-revoked', contractUrl, grantTest))
  await admin.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
    (contract_version,assignment_version_id,assignment_version,assignment_id,
     grant_kind,delegation_id,application_id,principal_id,employee_id,
     subject_kind,target_principal_id,stable_role_id,role_code,catalog_version,
     scope_kind,scope_key,valid_from,valid_until,published_at)
    VALUES ($1,'published-grant-delegated',2,'assignment-reviewer-delegated',
      'delegated','delegation-reviewer-one','ai-pdm','principal-reviewer',
      'employee-reviewer','employee',NULL,'role-rd-manager','rd_manager',$2,
      'workspace','company-jenfu','2026-01-01T00:00:00Z',NULL,
      '2026-09-29T00:00:00Z')`,
    ['jenfu.orgmaster.ai-pdm-principal-grants.v3',catalog.catalogVersion])
  await check('explicit delegated reviewer grant decides only its bound transfer request',
    async () => probe('grant-delegated', contractUrl, grantTest))
  await admin.query(`
    DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3;
    INSERT INTO orgmaster_contract.v_active_principal_accounts_v1 VALUES
      ('issuer-legacy','subject-owner','principal-owner','employee-owner',
       'human_personal','organization.active-principal.v1','active');
    INSERT INTO ai_pdm_core.transfer_packages
      (id,company_id,package_status,review_request_id,review_snapshot_hash)
      VALUES ('package-grant-flow','company-jenfu','Draft',NULL,NULL);
    INSERT INTO ai_pdm_core.part_numbers
      (id,company_id,record_status,updated_at,part_name,item_kind)
      VALUES ('part-grant-flow','company-jenfu','Active',now(),'Grant flow part','part');
    INSERT INTO ai_pdm_core.transfer_package_items
      (id,company_id,package_id,entity_type,entity_id,entity_code,
       display_label,root_code,record_status,added_by,created_at)
      VALUES ('item-grant-flow','company-jenfu','package-grant-flow','part_number',
       'part-grant-flow','P-GRANT-FLOW','Grant flow part','P-GRANT-FLOW',
       'Active','profile-owner',now());
  `)
  await admin.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
    (contract_version,assignment_version_id,assignment_version,assignment_id,
     grant_kind,delegation_id,application_id,principal_id,employee_id,
     subject_kind,target_principal_id,stable_role_id,role_code,catalog_version,
     scope_kind,scope_key,valid_from,valid_until,published_at)
    VALUES
      ($1,'published-grant-flow',3,'assignment-owner-manager','direct',NULL,
       'ai-pdm','principal-owner','employee-owner','employee',NULL,
       'role-rd-manager','rd_manager',$2,'workspace','company-jenfu',
       '2026-01-01T00:00:00Z',NULL,'2026-09-29T00:00:00Z'),
      ($1,'published-grant-flow',3,'assignment-reviewer-admin','direct',NULL,
       'ai-pdm','principal-reviewer','employee-reviewer','employee',NULL,
       'role-pdm-admin','pdm_admin',$2,'workspace','company-jenfu',
       '2026-01-01T00:00:00Z',NULL,'2026-09-29T00:00:00Z')`,
    ['jenfu.orgmaster.ai-pdm-principal-grants.v3',catalog.catalogVersion])
  await check('published owner and reviewer grants drive submit, non-owner selection, decision and reload',
    async () => probe('grant-flow', contractUrl, grantTest))
  }
} finally {
  if (admin) await admin.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'],
      { stdio: 'ignore' }); stopped = true } catch { stopped = false }
  } else stopped = true
  if (port) released = await portReleased(port)
  if (stopped && released) {
    fs.rmSync(taskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(taskRoot)
  }
  process.stdout.write(`${JSON.stringify({ runner: 'DEV-121 Principal transfer inbox PostgreSQL',
    checksPassed: checks.length, productionWrites: false,
    cleanup: { stopped, released, tempRemoved },
    retainedTempPath: tempRemoved ? null : taskRoot })}\n`)
}
