import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  canonicalize,
  DataCutoverError,
  dataCutoverObjectPaths,
  deriveDataMigrationPlan,
  sha256,
} from './lib/dev012-production-data-cutover.mjs'
import {
  assertAbortCleanupReceipt,
  assertPostLiveCleanupReceipt,
  buildCutoverJob,
  buildTemporaryAccessCleanupPolicies,
  buildTemporaryAccessPolicies,
  cutoverResourceNames,
  executeProviderRun,
  executeProviderStage,
} from './lib/dev012-production-data-cutover-provider.mjs'
import { parseProviderArgs, resolveProviderInputPath } from './dev012-production-data-cutover-provider.mjs'

const config = JSON.parse(fs.readFileSync(new URL('../config/release/dev012-ai-pdm-production-data-cutover.json', import.meta.url), 'utf8'))
const sourceRevision = 'a'.repeat(40)
const migrationRunnerDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'1'.repeat(64)}`
const identityUid = 'KHjDCJsvX1QxIhtTx14h7dJ0vXU2'

function selfHash(value, field = 'receiptSha256') {
  const core = { ...value }
  delete core[field]
  return { ...core, [field]: sha256(canonicalize(core)) }
}

function firstPrincipalReceipt() {
  return selfHash({
    schemaVersion: 'jenfu.dev012.orgmaster-first-principal-bootstrap.v1',
    ownerApplicationId: 'orgmaster',
    releaseId: 'DEV012-REL-20260914-R60',
    sourceRevision: 'b'.repeat(40),
    accountType: 'human_privileged',
    assuranceLevel: 'aal1',
    authorizedAt: '2026-09-14T10:21:57.298Z',
    authorizedBy: 'OWNER_EXPLICIT_DECISION',
    emailSha256: sha256(config.identityRemap.email.toLowerCase()),
    employeeId: 'employee-shijie',
    evidenceScope: 'PRODUCTION_BOUND',
    identity: { issuer: 'https://securetoken.google.com/jenfu-platform-prod', principalId: `principal-firebase-${'c'.repeat(32)}`, subject: identityUid },
    identityEvidenceRef: { uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/identity/example.json', sha256: 'd'.repeat(64) },
    oneTimeCas: true,
    releaseAuthority: true,
    status: 'READY',
  }, 'bootstrapSha256')
}

function column(name, type = 'text') {
  return { name, type, notNull: name === 'id', hasDefault: false, generated: '', identity: '' }
}

function table(name, columns = [column('id')], rowCount = 0) {
  return { name, rowCount, columns, primaryKey: ['id'] }
}

function catalog(database, schema, tables, foreignKeys = []) {
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database, schema, tables: [...tables].sort((left, right) => left.name.localeCompare(right.name)), foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

function catalogFixtures() {
  const transforms = new Map()
  for (const rule of config.catalog.typeTransforms) {
    if (!transforms.has(rule.table)) transforms.set(rule.table, [])
    transforms.get(rule.table).push(rule)
  }
  const names = new Set([...transforms.keys(), 'users', 'platform_principal_mappings', 'numbering_rule_versions', 'pdm_workbench_state_authority_control', 'root_record', 'child_record'])
  for (let index = 1; names.size < config.catalog.expectedCopyTableCount; index += 1) names.add(`provider_table_${String(index).padStart(3, '0')}`)
  const sourceCommon = []
  const targetCommon = []
  for (const name of [...names].sort()) {
    const rules = transforms.get(name) ?? []
    const sourceColumns = [column('id'), ...rules.map((rule) => column(rule.column, rule.sourceType))]
    const targetColumns = [column('id'), ...rules.map((rule) => column(rule.column, rule.targetType))]
    const sourceCount = name === 'numbering_rule_versions' ? 3 : name === 'pdm_workbench_state_authority_control' || name === 'users' || name === 'platform_principal_mappings' || rules.length > 0 ? 1 : 0
    sourceCommon.push(table(name, sourceColumns, sourceCount))
    targetCommon.push(table(name, targetColumns, config.catalog.allowedTargetSeedRows[name] ?? 0))
  }
  const sourceOnly = Object.entries(config.catalog.sourceExcludedTables).map(([name, disposition]) => table(name, [column('id')], disposition === 'RETAIN_LEGACY_LEDGER' ? 7 : 0))
  const targetOnly = Object.entries(config.catalog.targetOnlyTables).map(([name, rowCount]) => table(name, [column('id')], rowCount))
  const foreignKeys = [{ childTable: 'child_record', parentTable: 'root_record', constraintName: 'child_root_fk', deferrable: false, childColumns: ['id'], parentColumns: ['id'] }]
  return {
    source: catalog(config.source.database, config.source.schema, [...sourceCommon, ...sourceOnly], foreignKeys),
    target: catalog(config.target.database, config.target.schema, [...targetCommon, ...targetOnly], foreignKeys),
  }
}

function seedSummaries() {
  return Object.fromEntries(Object.entries(config.catalog.allowedTargetSeedRows).map(([name, rowCount]) => [name, { rowCount, primaryKeySha256: sha256(`${name}:pk`), contentSha256: sha256(`${name}:content`) }]))
}

function ref(uri, value) {
  return { uri, sha256: sha256(Buffer.from(`${canonicalize(value)}\n`)) }
}

function harness({ failMode = null } = {}) {
  const objects = new Map()
  const rawObjects = new Map()
  const catalogs = catalogFixtures()
  const identity = firstPrincipalReceipt()
  const identityReceiptRef = ref('gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV012-REL-20260914-R60/first-principal-bootstrap.json', identity)
  const infra = selfHash({ schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'ai-pdm', projectId: config.target.projectId, region: config.target.region, sourceRevision, migrationRunnerDigest, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER', releaseAuthority: true, observedAt: '2026-09-15T00:00:00.000Z' })
  const infraReceiptRef = ref(`gs://${config.releaseBucket}/receipts/releases/FIXTURE/app-infra.json`, infra)
  objects.set(infraReceiptRef.uri, infra)
  let sequence = 1
  let service = { name: `projects/${config.source.projectId}/locations/${config.source.region}/services/${config.source.service}`, etag: `etag-value-${sequence}`, generation: String(sequence), observedGeneration: String(sequence), reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, template: { containers: [{ image: `legacy@sha256:${'2'.repeat(64)}` }] }, traffic: [{ revision: 'legacy-r1', percent: 100 }] }
  const runModes = []
  const deletedJobs = []
  let cleanupCalls = 0
  let patchCalls = 0
  const missing = () => { throw new DataCutoverError('MIGRATION_GCS_METADATA_FAILED', 'storage.googleapis.com:404') }
  const namesFor = (releaseId) => cutoverResourceNames(config, releaseId, sourceRevision)
  const jobValue = (releaseId, kind) => {
    const expected = buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind })
    const target = kind === 'source' ? config.source : config.target
    return { name: `projects/${target.projectId}/locations/${target.region}/jobs/${expected.jobId}`, uid: `${kind}-uid`, generation: '1', observedGeneration: '1', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' }, etag: `${kind}-etag`, ...structuredClone(expected.body) }
  }
  const inspectReceipt = (releaseId, mode, executionName, identityReceiptSha256) => {
    const sourceMode = mode === 'inspect-source'
    const target = sourceMode ? config.source : config.target
    const selected = sourceMode ? catalogs.source : catalogs.target
    const base = { ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, projectId: target.projectId, database: target.database, schema: target.schema, identityReceiptSha256, executionName, catalog: selected, seedSummaries: seedSummaries(), totalRowCount: selected.tables.reduce((sum, item) => sum + item.rowCount, 0), rawRowsLogged: false, completedAt: '2026-09-15T01:00:00.000Z', status: 'PASS' }
    return selfHash(sourceMode
      ? { schemaVersion: 'jenfu.dev012.ai-pdm-source-inspection-receipt.v1', ...base, identity: { pdmUserId: config.identityRemap.pdmUserId, companyId: config.identityRemap.companyId, role: config.identityRemap.role, accountStatus: config.identityRemap.accountStatus, accountLifecycleVersion: config.identityRemap.accountLifecycleVersion, priorMappingCount: 1, currentUidCollisionCount: 0 }, sessionSnapshot: { otherSessionCount: 0, hiddenSessionCount: 0, activeTransactionCount: 0, activeNonIdleCount: 0, activeMigrationSessionCount: 0 } }
      : { schemaVersion: 'jenfu.dev012.ai-pdm-target-inspection-receipt.v1', ...base, activeUidMappingCount: 0 })
  }
  const exportReceipt = (releaseId, executionName, identityReceiptSha256) => {
    const paths = dataCutoverObjectPaths(config, releaseId)
    const sourceRowCount = catalogs.source.tables.filter((item) => !Object.hasOwn(config.catalog.sourceExcludedTables, item.name)).reduce((sum, item) => sum + item.rowCount, 0)
    const bytes = Buffer.from(`fixture raw bundle for ${releaseId}`)
    rawObjects.set(paths.bundle, { bytes, generation: '1' })
    return selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-export-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256, executionName, transactionMode: 'REPEATABLE_READ_READ_ONLY', sourceSessionPreflight: { otherSessionCount: 0, hiddenSessionCount: 0, activeTransactionCount: 0, activeNonIdleCount: 0, activeMigrationSessionCount: 0 }, sourceCatalogSha256: catalogs.source.catalogSha256, copyTableCount: config.catalog.expectedCopyTableCount, sourceRowCount, identity: { pdmUserId: config.identityRemap.pdmUserId }, bundleRef: paths.bundle, bundleGeneration: '1', bundleBytesSha256: sha256(bytes), bundleBytes: bytes.length, bundleSha256: '8'.repeat(64), rawRowsLogged: false, completedAt: '2026-09-15T01:10:00.000Z', status: 'PASS' })
  }
  const importReceipt = (releaseId, executionName, exported) => {
    const migrationPlan = deriveDataMigrationPlan(config, catalogs.source, catalogs.target)
    const copyTables = catalogs.source.tables.filter((item) => !Object.hasOwn(config.catalog.sourceExcludedTables, item.name)).map((item) => ({ name: item.name, rowCount: item.rowCount, primaryKeySha256: sha256(`${item.name}:pk:target`), contentSha256: sha256(`${item.name}:content:target`) })).sort((left, right) => left.name.localeCompare(right.name))
    return selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256: exported.identityReceiptSha256, executionName, sourceCatalogSha256: exported.sourceCatalogSha256, targetPreImportCatalogSha256: catalogs.target.catalogSha256, migrationPlanSha256: migrationPlan.planSha256, bundleRef: exported.bundleRef, bundleGeneration: exported.bundleGeneration, bundleBytesSha256: exported.bundleBytesSha256, bundleSha256: exported.bundleSha256, tableCount: copyTables.length, expectedRowCount: copyTables.reduce((sum, item) => sum + item.rowCount, 0), insertedRows: 13, tableReceipts: copyTables, identity: { pdmUserId: config.identityRemap.pdmUserId, companyId: config.identityRemap.companyId, role: config.identityRemap.role, accountStatus: config.identityRemap.accountStatus, accountLifecycleVersion: config.identityRemap.accountLifecycleVersion, activeUidMappingCount: 1 }, transaction: 'SERIALIZABLE_COMMITTED', sourceProductionWrites: false, siblingSchemaWrites: 0, rawRowsLogged: false, completedAt: '2026-09-15T01:20:00.000Z', status: 'PASS' })
  }
  const transport = {
    now: () => '2026-09-15T02:00:00.000Z',
    getBilling: async (projectId) => ({ projectId, billingEnabled: true, billingAccountName: config.billingAccountName }),
    getSql: async (target) => ({ project: target.projectId, name: target.instanceConnectionName.split(':').at(-1), region: target.region, state: 'RUNNABLE', databaseVersion: 'POSTGRES_17', settings: { backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: true, transactionLogRetentionDays: 7 }, ipConfiguration: { ipv4Enabled: false, privateNetwork: `projects/${target.projectId}/global/networks/${target.network}` } } }),
    ensureFreshBackup: async () => ({ items: [{ id: '101', status: 'SUCCESSFUL', type: 'ON_DEMAND', startTime: '2026-09-15T00:00:00.000Z', endTime: '2026-09-15T00:10:00.000Z' }] }),
    getService: async () => structuredClone(service),
    getIamPolicy: async () => ({ bindings: [] }),
    listMigrationExecutions: async () => ({ executions: [] }),
    setLegacyAccessFence: async (_config, before, disabled) => { assert.equal(before.etag, service.etag); patchCalls += 1; sequence += 1; service = { ...service, etag: `etag-value-${sequence}`, generation: String(sequence), observedGeneration: String(sequence), invokerIamDisabled: disabled }; return structuredClone(service) },
    getMigrationRunnerArtifact: async () => ({ uri: migrationRunnerDigest, name: `projects/${config.target.projectId}/locations/${config.target.region}/repositories/aipdm-release/dockerImages/ai-pdm-migration-runner@sha256:${'1'.repeat(64)}`, uploadTime: '2026-09-15T00:00:00.000Z', imageSizeBytes: '123456', mediaType: 'application/vnd.oci.image.manifest.v1+json' }),
    ensureTemporaryAccess: async (_config, releaseId) => { const names = namesFor(releaseId); return { sourceObjectPrefix: names.sourceObjectPrefix, sourceMember: `serviceAccount:${config.source.serviceAccount}`, sourceCloudRunServiceAgentMember: `serviceAccount:${names.sourceCloudRunServiceAgent}`, bucketObjectCreator: 'ADDED', bucketObjectViewer: 'ADDED', artifactReader: 'ADDED', bucketPolicySha256: '3'.repeat(64), artifactPolicySha256: '4'.repeat(64), status: 'ACTIVE' } },
    cleanupTemporaryAccess: async () => { cleanupCalls += 1; return { status: 'REMOVED', bucketPolicySha256: '5'.repeat(64), artifactPolicySha256: '6'.repeat(64) } },
    ensureJob: async (_config, releaseId, _revision, _digest, kind) => jobValue(releaseId, kind),
    deleteJob: async ({ kind, releaseId }) => { deletedJobs.push(kind); const target = kind === 'source' ? config.source : config.target; const jobId = kind === 'source' ? namesFor(releaseId).sourceJobId : namesFor(releaseId).targetJobId; return { name: `projects/${target.projectId}/locations/${target.region}/jobs/${jobId}`, deleted: true, alreadyAbsent: deletedJobs.filter((item) => item === kind).length > 1 } },
    runJob: async ({ kind, args, releaseId }) => {
      const flags = Object.fromEntries(Array.from({ length: (args.length - 1) / 2 }, (_, index) => [args[index * 2 + 1], args[index * 2 + 2]]))
      const mode = flags['--mode']
      runModes.push(mode)
      if (failMode === mode) throw new DataCutoverError('DATA_CUTOVER_JOB_EXECUTION_FAILED', mode)
      const jobId = kind === 'source' ? namesFor(releaseId).sourceJobId : namesFor(releaseId).targetJobId
      const executionName = `${jobId}-${String(runModes.length).padStart(5, '0')}`
      if (mode === 'inspect-source' || mode === 'inspect-target') objects.set(flags['--receipt-ref'], inspectReceipt(releaseId, mode, executionName, flags['--identity-receipt-sha256']))
      if (mode === 'export') objects.set(flags['--receipt-ref'], exportReceipt(releaseId, executionName, flags['--identity-receipt-sha256']))
      if (mode === 'import') {
        const exported = objects.get(dataCutoverObjectPaths(config, releaseId).exportReceipt)
        objects.set(flags['--receipt-ref'], importReceipt(releaseId, executionName, exported))
      }
      const target = kind === 'source' ? config.source : config.target
      return { name: `projects/${target.projectId}/locations/${target.region}/jobs/${jobId}/executions/${executionName}`, uid: `${executionName}-uid`, completionTime: '2026-09-15T01:30:00.000Z', succeededCount: 1, failedCount: 0 }
    },
    readJsonByUri: async (uri) => objects.has(uri) ? { value: structuredClone(objects.get(uri)), ref: ref(uri, objects.get(uri)) } : missing(),
    readExternalJson: async (expectedRef, expected) => { assert.deepEqual(expectedRef, identityReceiptRef); assert.deepEqual(expected, { bucket: 'jenfu-platform-prod-orgmaster-release', prefix: 'receipts/releases' }); return { value: structuredClone(identity), ref: identityReceiptRef } },
    readJson: async (expectedRef) => { const value = objects.get(expectedRef.uri); if (!value) return missing(); assert.equal(ref(expectedRef.uri, value).sha256, expectedRef.sha256); return { value: structuredClone(value), ref: expectedRef } },
    publishJson: async (uri, _config, _prefix, value) => { const existing = objects.get(uri); if (existing) assert.equal(canonicalize(existing), canonicalize(value)); else objects.set(uri, structuredClone(value)); return { value: structuredClone(objects.get(uri)), ref: ref(uri, objects.get(uri)) } },
    readRawObject: async (uri) => { const value = rawObjects.get(uri); if (!value) return missing(); return { bytes: Buffer.from(value.bytes), generation: value.generation } },
    deleteGcsObject: async ({ uri, expectedGeneration }) => { const value = rawObjects.get(uri); if (!value) return { uri, generation: expectedGeneration, deleted: true, alreadyAbsent: true }; assert.equal(value.generation, expectedGeneration); rawObjects.delete(uri); return { uri, generation: expectedGeneration, deleted: true, alreadyAbsent: false } },
  }
  return { objects, rawObjects, transport, identityReceiptRef, infraReceiptRef, get service() { return service }, setService(value) { service = value }, runModes, deletedJobs, get cleanupCalls() { return cleanupCalls }, get patchCalls() { return patchCalls } }
}

function runInput(h) {
  return { identityReceiptRef: h.identityReceiptRef, infraReceiptRef: h.infraReceiptRef, migrationRunnerDigest, deadlineAt: '2999-01-01T00:00:00.000Z', acknowledgements: structuredClone(config.acknowledgements) }
}

test('temporary IAM is release-prefix scoped and cleanup preserves preexisting grants', () => {
  const baseBucket = { version: 3, etag: 'bucket-etag', bindings: [] }
  const baseArtifact = { version: 3, etag: 'artifact-etag', bindings: [{ role: 'roles/artifactregistry.reader', members: [`serviceAccount:${cutoverResourceNames(config, '012-R66-IAM', sourceRevision).sourceCloudRunServiceAgent}`] }] }
  const added = buildTemporaryAccessPolicies({ config, releaseId: '012-R66-IAM', sourceRevision, bucketPolicy: baseBucket, artifactPolicy: baseArtifact })
  assert.match(added.creatorCondition.expression, /source\/migration-bundles\/data-cutover\/012-R66-IAM\//u)
  assert.equal(added.temporaryAccess.artifactReader, 'PREEXISTING')
  const cleaned = buildTemporaryAccessCleanupPolicies({ config, releaseId: '012-R66-IAM', sourceRevision, temporaryAccess: added.temporaryAccess, bucketPolicy: added.bucketPolicy, artifactPolicy: added.artifactPolicy })
  assert.equal(cleaned.bucketPolicy.bindings.length, 0)
  assert.equal(cleaned.artifactPolicy.bindings[0].members.length, 1)
})

test('one command runs prepare through handoff, tears down task resources, and replays without mutations', async () => {
  const h = harness()
  const releaseId = '012-R66-FULL-RUN'
  const result = await executeProviderRun({ config, releaseId, sourceRevision, input: runInput(h), transport: h.transport })
  assert.equal(result.value.status, 'DATA_READY_FOR_CANDIDATE')
  assert.deepEqual([...h.runModes].sort(), ['export', 'import', 'inspect-source', 'inspect-target'])
  assert.equal(h.service.invokerIamDisabled, false)
  assert.equal(h.patchCalls, 1)
  assert.deepEqual([...h.deletedJobs].sort(), ['source', 'target'])
  assert.equal(h.cleanupCalls, 1)
  const runCount = h.runModes.length
  const replay = await executeProviderRun({ config, releaseId, sourceRevision, input: runInput(h), transport: h.transport })
  assert.equal(replay.ref.sha256, result.ref.sha256)
  assert.equal(h.runModes.length, runCount)
  assert.equal(h.patchCalls, 1)
})

test('provider fence resumes only while the exact fenced provider state remains active', async () => {
  const h = harness()
  const releaseId = '012-R66-FENCE-RECOVERY'
  const prepared = await executeProviderStage({ stage: 'prepare', config, releaseId, sourceRevision, input: { identityReceiptRef: h.identityReceiptRef, infraReceiptRef: h.infraReceiptRef, migrationRunnerDigest, deadlineAt: '2999-01-01T00:00:00.000Z' }, transport: h.transport })
  h.setService({ ...h.service, etag: 'etag-recovered', generation: '2', observedGeneration: '2', invokerIamDisabled: false })
  const fenced = await executeProviderStage({ stage: 'fence', config, releaseId, sourceRevision, input: { acknowledgement: config.acknowledgements.fence, prepareReceiptRef: prepared.ref }, transport: h.transport })
  assert.equal(fenced.value.baselineEtag, prepared.value.sourceService.etag)
  assert.equal(fenced.value.fencedEtag, 'etag-recovered')
  assert.equal(h.patchCalls, 0)
  h.setService({ ...h.service, invokerIamDisabled: true })
  await assert.rejects(() => executeProviderStage({ stage: 'fence', config, releaseId, sourceRevision, input: { acknowledgement: config.acknowledgements.fence, prepareReceiptRef: prepared.ref }, transport: h.transport }), (error) => error?.code === 'DATA_CUTOVER_FENCE_REPLAY_STATE_INVALID')
})

test('failed import restores legacy access, removes jobs and IAM, and terminally aborts the release id', async () => {
  const h = harness({ failMode: 'import' })
  const releaseId = '012-R66-ABORT-RUN'
  await assert.rejects(() => executeProviderRun({ config, releaseId, sourceRevision, input: runInput(h), transport: h.transport }), (error) => error?.code === 'DATA_CUTOVER_JOB_EXECUTION_FAILED')
  assert.equal(h.service.invokerIamDisabled, true)
  assert.equal(h.patchCalls, 2)
  assert.deepEqual([...h.deletedJobs].sort(), ['source', 'target'])
  assert.equal(h.cleanupCalls, 1)
  const cleanup = h.objects.get(dataCutoverObjectPaths(config, releaseId).abortCleanup)
  assertAbortCleanupReceipt(cleanup, config, { releaseId, sourceRevision })
  await assert.rejects(() => executeProviderRun({ config, releaseId, sourceRevision, input: runInput(h), transport: h.transport }), (error) => error?.code === 'DATA_CUTOVER_RELEASE_ALREADY_ABORTED')
})

test('post-live cleanup requires owner terminal RELEASED and deletes only the immutable raw bundle generation', async () => {
  const h = harness()
  const releaseId = '012-R66-POST-LIVE'
  const handoff = await executeProviderRun({ config, releaseId, sourceRevision, input: runInput(h), transport: h.transport })
  const intentSha256 = 'c'.repeat(64)
  const terminal = selfHash({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, stage: 'terminal', previousReceiptRef: { uri: `gs://${config.releaseBucket}/receipts/releases/${releaseId}/${intentSha256}/finalize.json`, sha256: 'a'.repeat(64) }, facts: { result: 'RELEASED', candidateRevision: 'ai-pdm-prod-fixture', artifactDigest: `fixture@sha256:${'b'.repeat(64)}`, databaseDisposition: 'FORWARD_APPLIED', remainingHumanAction: 0 }, observedAt: '2026-09-15T03:00:00.000Z', status: 'PASS' })
  const terminalRef = ref(`gs://${config.releaseBucket}/receipts/releases/${releaseId}/${intentSha256}/terminal.json`, terminal)
  h.objects.set(terminalRef.uri, terminal)
  const paths = dataCutoverObjectPaths(config, releaseId)
  assert.equal(h.rawObjects.has(paths.bundle), true)
  const cleaned = await executeProviderStage({ stage: 'post-live-cleanup', config, releaseId, sourceRevision, input: { handoffReceiptRef: handoff.ref, terminalReceiptRef: terminalRef }, transport: h.transport })
  assertPostLiveCleanupReceipt(cleaned.value, config, { releaseId, sourceRevision })
  assert.equal(h.rawObjects.has(paths.bundle), false)
})

test('provider CLI accepts the full stage set and resolves only regular files under the controlled input directory', async () => {
  const args = parseProviderArgs(['--stage', 'run', '--release-id', '012-R66-CLI', '--source-revision', sourceRevision, '--input', 'output/dev-012/inputs/run.json'])
  assert.equal(args.stage, 'run')
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'dev012-provider-input-'))
  try {
    const inputRoot = path.join(temporary, 'output', 'dev-012', 'inputs')
    await fsp.mkdir(inputRoot, { recursive: true })
    const inputFile = path.join(inputRoot, 'run.json')
    await fsp.writeFile(inputFile, '{}\n')
    assert.equal(await resolveProviderInputPath(temporary, 'output/dev-012/inputs/run.json'), inputFile)
    await assert.rejects(() => resolveProviderInputPath(temporary, 'output/dev-012/inputs/../outside.json'), (error) => error?.code === 'DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID')
  } finally {
    await fsp.rm(temporary, { recursive: true, force: true })
  }
})
