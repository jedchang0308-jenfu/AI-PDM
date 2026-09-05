import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const access = JSON.parse(read('config/platform/cloud-sql-access.json'))
const sql = read('db/cloud-sql/pdm_source_fence_controller_grants.sql')
const iam = read('infra/google-cloud/production/iam.tf')
const database = read('infra/google-cloud/production/database.tf')
const locals = read('infra/google-cloud/production/locals.tf')

test('source fence controller is a dedicated NOLOGIN non-privileged role', () => {
  assert.equal(access.sourceFenceControllerDatabaseRole, 'pdm_fence_controller')
  assert.equal(access.sourceFenceControllerRuntimeAttached, false)
  assert.match(sql, /CREATE ROLE pdm_fence_controller NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/u)
  assert.match(sql, /GRANT pdm_migration TO pdm_fence_controller WITH ADMIN OPTION/u)
  assert.match(sql, /GRANT pdm_fence_controller TO :"fence_iam_user"/u)
  assert.doesNotMatch(sql, /PASSWORD|(?:^|\s)LOGIN(?:\s|;)|GRANT\s+pdm_runtime\s+TO\s+:"fence_iam_user"/mu)
})

test('controller IAM identity has only Cloud SQL connection roles and no runtime attachment', () => {
  assert.match(iam, /resource "google_service_account" "source_fence"/u)
  assert.match(iam, /account_id\s*=\s*"\$\{local\.name_prefix\}-fence"/u)
  assert.match(iam, /local\.source_fence_roles/u)
  assert.match(locals, /source_fence_roles\s*=\s*toset\(\[\s*"roles\/cloudsql\.client",\s*"roles\/cloudsql\.instanceUser"/u)
  assert.doesNotMatch(locals.match(/source_fence_roles[\s\S]*?\]\)/u)?.[0] ?? '', /run\.|secretmanager|firebase|iam\.serviceAccountTokenCreator/u)
  assert.match(database, /resource "google_sql_user" "source_fence_iam"/u)
  assert.match(database, /google_service_account\.source_fence/u)
  assert.doesNotMatch(read('infra/google-cloud/production/runtime.tf'), /google_service_account\.source_fence/u)
  assert.doesNotMatch(read('infra/google-cloud/production/migration-runner.tf'), /google_service_account\.source_fence/u)
})
