import {
  assertDataCutoverConfig,
  assertDataCutoverExportReceipt,
  assertDataCutoverFenceReceipt,
  assertDataCutoverHandoff,
  assertDataCutoverImportReceipt,
  assertDataCutoverTeardownReceipt,
  assertSourceInspectionReceipt,
  assertTargetInspectionReceipt,
  canonicalize,
  createDataCutoverHandoff,
  dataCutoverObjectPaths,
  DataCutoverError,
  deriveDataMigrationPlan,
  sha256,
} from './dev012-production-data-cutover.mjs'
import { publishGcsJson, readGcsObject } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u

function fail(code, detail = '') { throw new DataCutoverError(code, detail) }

function selfHash(value, field = 'receiptSha256') {
  const core = { ...value }
  delete core[field]
  return { ...core, [field]: sha256(canonicalize(core)) }
}

export function serviceSnapshot(config, service) {
  const expectedName = `projects/${config.source.projectId}/locations/${config.source.region}/services/${config.source.service}`
  if (service?.name !== expectedName || !service.etag || service.reconciling === true || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || service.generation == null || service.observedGeneration == null || String(service.generation) !== String(service.observedGeneration)) fail('DATA_CUTOVER_SOURCE_SERVICE_INVALID')
  return {
    name: service.name,
    etag: service.etag,
    generation: String(service.generation ?? ''),
    ingress: service.ingress,
    defaultUriDisabled: service.defaultUriDisabled === true,
    invokerIamDisabled: service.invokerIamDisabled === true,
    templateSha256: sha256(canonicalize(service.template)),
    trafficSha256: sha256(canonicalize(service.traffic ?? [])),
  }
}

export function directInvokerBindingCount(policy) {
  if (!policy || !Array.isArray(policy.bindings)) fail('DATA_CUTOVER_SOURCE_IAM_INVALID')
  return policy.bindings.filter((binding) => binding.role === 'roles/run.invoker').reduce((sum, binding) => sum + (Array.isArray(binding.members) ? binding.members.length : 0), 0)
}

function sqlSnapshot(configTarget, value) {
  if (value?.name !== configTarget.instanceConnectionName.split(':').at(-1) || value.project !== configTarget.projectId || value.region !== configTarget.region || value.state !== 'RUNNABLE' || value.databaseVersion !== 'POSTGRES_17') fail('DATA_CUTOVER_SQL_INSTANCE_INVALID', configTarget.projectId)
  const backup = value.settings?.backupConfiguration
  const ip = value.settings?.ipConfiguration
  const expectedNetwork = `projects/${configTarget.projectId}/global/networks/${configTarget.network}`
  if (backup?.enabled !== true || backup.pointInTimeRecoveryEnabled !== true || Number(backup.transactionLogRetentionDays ?? 0) < 1) fail('DATA_CUTOVER_SQL_PROTECTION_INVALID', configTarget.projectId)
  if (ip?.ipv4Enabled !== false || ip.privateNetwork !== expectedNetwork) fail('DATA_CUTOVER_SQL_NETWORK_INVALID', configTarget.projectId)
  return { projectId: value.project, instance: value.name, region: value.region, state: value.state, databaseVersion: value.databaseVersion, backupEnabled: true, pointInTimeRecoveryEnabled: true, transactionLogRetentionDays: Number(backup.transactionLogRetentionDays), publicIpv4Enabled: false, privateNetwork: ip.privateNetwork }
}

function latestBackupSnapshot(value, nowMs) {
  const successful = (value?.items ?? []).filter((item) => item.status === 'SUCCESSFUL' && Number.isFinite(Date.parse(item.endTime ?? item.startTime))).sort((a, b) => Date.parse(b.endTime ?? b.startTime) - Date.parse(a.endTime ?? a.startTime))
  const latest = successful[0]
  if (!latest || nowMs < Date.parse(latest.endTime ?? latest.startTime) || nowMs - Date.parse(latest.endTime ?? latest.startTime) > 24 * 60 * 60 * 1000) fail('DATA_CUTOVER_BACKUP_NOT_FRESH')
  return { id: String(latest.id), status: latest.status, type: latest.type, startTime: latest.startTime, endTime: latest.endTime ?? null }
}

export function assertFirstPrincipalBootstrap(value, config, expectedSha256 = null) {
  const core = { ...value }; delete core.bootstrapSha256
  if (!value || value.schemaVersion !== 'jenfu.dev012.orgmaster-first-principal-bootstrap.v1' || value.ownerApplicationId !== 'orgmaster' || value.status !== 'READY' || value.evidenceScope !== 'PRODUCTION_BOUND' || value.releaseAuthority !== true || value.accountType !== 'human_privileged' || value.assuranceLevel !== 'aal1' || value.oneTimeCas !== true || value.identity?.issuer !== 'https://securetoken.google.com/jenfu-platform-prod' || !/^[A-Za-z0-9_-]{20,128}$/u.test(value.identity?.subject ?? '') || !/^principal-firebase-[a-f0-9]{32}$/u.test(value.identity?.principalId ?? '') || value.emailSha256 !== sha256(config.identityRemap.email.toLowerCase()) || !H64.test(value.bootstrapSha256 ?? '') || sha256(canonicalize(core)) !== value.bootstrapSha256 || (expectedSha256 && value.bootstrapSha256 !== expectedSha256)) fail('DATA_CUTOVER_FIRST_PRINCIPAL_INVALID')
  return value
}

export function cutoverResourceNames(configInput, releaseId, sourceRevision) {
  const config = assertDataCutoverConfig(configInput)
  if (!RELEASE_ID.test(releaseId ?? '') || !H40.test(sourceRevision ?? '')) fail('DATA_CUTOVER_RESOURCE_IDENTITY_INVALID')
  const suffix = sha256(canonicalize({ ownerApplicationId: config.ownerApplicationId, releaseId, sourceRevision })).slice(0, 12)
  return {
    sourceJobId: `dev012-ai-data-export-${suffix}`,
    targetJobId: `dev012-ai-data-import-${suffix}`,
    sourceObjectPrefix: `source/migration-bundles/data-cutover/${releaseId}/`,
    sourceCloudRunServiceAgent: `service-${config.source.projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`,
    suffix,
  }
}

export function assertAppInfraReceipt(value, config, expected = {}) {
  const core = { ...value }
  delete core.receiptSha256
  if (!value || value.schemaVersion !== 'jenfu.dev012.app-infra-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.projectId !== config.target.projectId || value.region !== config.target.region || value.status !== 'APPLIED' || value.evidenceScope !== 'PRODUCTION_PROVIDER' || value.releaseAuthority !== true || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || !value.migrationRunnerDigest?.startsWith('asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:') || !H40.test(value.sourceRevision ?? '') || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision) || (expected.migrationRunnerDigest && value.migrationRunnerDigest !== expected.migrationRunnerDigest)) fail('DATA_CUTOVER_APP_INFRA_RECEIPT_INVALID')
  return value
}

export function buildCutoverJob({ config: configInput, releaseId, sourceRevision, migrationRunnerDigest, kind }) {
  const config = assertDataCutoverConfig(configInput)
  const names = cutoverResourceNames(config, releaseId, sourceRevision)
  const target = kind === 'source' ? config.source : kind === 'target' ? config.target : null
  const jobId = kind === 'source' ? names.sourceJobId : kind === 'target' ? names.targetJobId : null
  if (!target || !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(migrationRunnerDigest ?? '')) fail('DATA_CUTOVER_JOB_INPUT_INVALID')
  const body = {
    labels: { application: 'ai-pdm', component: 'data-cutover', dev: 'dev-012', owner: kind, release: names.suffix },
    template: {
      taskCount: 1,
      parallelism: 1,
      template: {
        serviceAccount: target.serviceAccount,
        timeout: '1800s',
        maxRetries: 0,
        executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
        containers: [{
          name: 'cutover',
          image: migrationRunnerDigest,
          command: ['node'],
          args: ['scripts/dev012-production-data-cutover-runtime.mjs', '--mode-required'],
          env: [
            { name: 'PDM_SOURCE_REVISION', value: sourceRevision },
            { name: 'CUTOVER_DATABASE', value: target.database },
            { name: 'CUTOVER_DATABASE_LOGIN', value: target.databaseLogin },
            { name: 'CUTOVER_INSTANCE_CONNECTION_NAME', value: target.instanceConnectionName },
            { name: 'CUTOVER_DATABASE_HOST', value: `/cloudsql/${target.instanceConnectionName}` },
          ],
          resources: { limits: { cpu: '1', memory: '1Gi' } },
          volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }],
        }],
        volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: [target.instanceConnectionName] } }],
        vpcAccess: { egress: 'ALL_TRAFFIC', networkInterfaces: [{ network: target.network, subnetwork: target.subnet }] },
      },
    },
  }
  return { jobId, body }
}

export function assertCutoverJob(value, expectedBody, config, kind) {
  const jobId = expectedBody?.jobId
  const target = kind === 'source' ? config.source : kind === 'target' ? config.target : null
  const body = expectedBody?.body
  if (!target || value?.name !== `projects/${target.projectId}/locations/${target.region}/jobs/${jobId}` || value.reconciling === true || value.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || value.generation == null || value.observedGeneration == null || String(value.generation) !== String(value.observedGeneration) || !value.etag) fail('DATA_CUTOVER_JOB_READBACK_INVALID', kind)
  for (const key of ['labels', 'template']) if (canonicalize(value[key]) !== canonicalize(body[key])) fail('DATA_CUTOVER_JOB_READBACK_INVALID', `${kind}:${key}`)
  return { name: value.name, uid: value.uid, generation: String(value.generation), etag: value.etag, templateSha256: sha256(canonicalize(value.template)), image: body.template.template.containers[0].image }
}

function assertInspectionJoin({ config, sourceInspection, targetInspection, identityReceiptSha256 }) {
  assertSourceInspectionReceipt(sourceInspection, config)
  assertTargetInspectionReceipt(targetInspection, config)
  if (sourceInspection.identityReceiptSha256 !== identityReceiptSha256 || targetInspection.identityReceiptSha256 !== identityReceiptSha256) fail('DATA_CUTOVER_INSPECTION_JOIN_INVALID')
  const seedNames = Object.keys(config.catalog.allowedTargetSeedRows).sort()
  if (canonicalize(Object.keys(sourceInspection.seedSummaries).sort()) !== canonicalize(seedNames) || canonicalize(Object.keys(targetInspection.seedSummaries).sort()) !== canonicalize(seedNames)) fail('DATA_CUTOVER_INSPECTION_JOIN_INVALID')
  for (const name of seedNames) {
    const source = sourceInspection.seedSummaries[name]
    const target = targetInspection.seedSummaries[name]
    if (source.rowCount !== target.rowCount || source.primaryKeySha256 !== target.primaryKeySha256) fail('DATA_CUTOVER_INSPECTION_JOIN_INVALID', name)
  }
  return deriveDataMigrationPlan(config, sourceInspection.catalog, targetInspection.catalog, { allowPopulatedTarget: targetInspection.activeUidMappingCount === 1 })
}

function assertExactRef(value, uri, code) {
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(['sha256', 'uri']) || value.uri !== uri || !H64.test(value.sha256 ?? '')) fail(code)
  return value
}

function assertMigrationRunnerArtifact(value, digest) {
  if (!value || value.uri !== digest || !/^sha256:[a-f0-9]{64}$/u.test(value.name?.split('@').at(-1) ?? '') || !Number.isFinite(Date.parse(value.uploadTime)) || Number(value.imageSizeBytes ?? 0) <= 0) fail('DATA_CUTOVER_MIGRATION_RUNNER_ARTIFACT_INVALID')
  return { uri: value.uri, name: value.name, uploadTime: value.uploadTime, imageSizeBytes: String(value.imageSizeBytes), mediaType: value.mediaType ?? null }
}

function assertTemporaryAccess(value, config, names, expectedStatus = 'ACTIVE') {
  if (!value || value.status !== expectedStatus || value.sourceObjectPrefix !== names.sourceObjectPrefix || value.sourceMember !== `serviceAccount:${config.source.serviceAccount}` || value.sourceCloudRunServiceAgentMember !== `serviceAccount:${names.sourceCloudRunServiceAgent}` || !H64.test(value.bucketPolicySha256 ?? '') || !H64.test(value.artifactPolicySha256 ?? '') || !['ADDED', 'PREEXISTING'].includes(value.bucketObjectCreator) || !['ADDED', 'PREEXISTING'].includes(value.bucketObjectViewer) || !['ADDED', 'PREEXISTING'].includes(value.artifactReader)) fail('DATA_CUTOVER_TEMPORARY_ACCESS_INVALID')
  return value
}

export function createProviderPrepareReceipt({ config, releaseId, sourceRevision, identityReceiptRef, identityReceipt, infraReceiptRef, infraReceipt, migrationRunnerArtifact, temporaryAccess, sourceJob, targetJob, sourceInspectionRef, sourceInspection, targetInspectionRef, targetInspection, sourceBilling, targetBilling, sourceSql, targetSql, sourceBackups, targetBackups, service, iamPolicy, executions, deadlineAt, observedAt }) {
  if (!RELEASE_ID.test(releaseId ?? '') || !H40.test(sourceRevision ?? '') || !Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(deadlineAt)) || Date.parse(deadlineAt) <= Date.parse(observedAt)) fail('DATA_CUTOVER_PROVIDER_PREPARE_INPUT_INVALID')
  assertFirstPrincipalBootstrap(identityReceipt, config)
  if (!identityReceiptRef || canonicalize(Object.keys(identityReceiptRef).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(identityReceiptRef.sha256 ?? '') || !identityReceiptRef.uri?.startsWith('gs://jenfu-platform-prod-orgmaster-release/receipts/releases/') || identityReceiptRef.uri.includes('..')) fail('DATA_CUTOVER_FIRST_PRINCIPAL_REF_INVALID')
  assertAppInfraReceipt(infraReceipt, config, { sourceRevision })
  if (!infraReceiptRef || canonicalize(Object.keys(infraReceiptRef).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(infraReceiptRef.sha256 ?? '') || !infraReceiptRef.uri?.startsWith(`gs://${config.releaseBucket}/receipts/`) || infraReceiptRef.uri.includes('..')) fail('DATA_CUTOVER_APP_INFRA_REF_INVALID')
  const names = cutoverResourceNames(config, releaseId, sourceRevision)
  const paths = dataCutoverObjectPaths(config, releaseId)
  const artifact = assertMigrationRunnerArtifact(migrationRunnerArtifact, infraReceipt.migrationRunnerDigest)
  const access = assertTemporaryAccess(temporaryAccess, config, names)
  const sourceJobSnapshot = assertCutoverJob(sourceJob.value ?? sourceJob, buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest: infraReceipt.migrationRunnerDigest, kind: 'source' }), config, 'source')
  const targetJobSnapshot = assertCutoverJob(targetJob.value ?? targetJob, buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest: infraReceipt.migrationRunnerDigest, kind: 'target' }), config, 'target')
  assertExactRef(sourceInspectionRef, paths.sourceInspection, 'DATA_CUTOVER_SOURCE_INSPECTION_REF_INVALID')
  assertExactRef(targetInspectionRef, paths.targetInspection, 'DATA_CUTOVER_TARGET_INSPECTION_REF_INVALID')
  assertSourceInspectionReceipt(sourceInspection, config, { releaseId, sourceRevision })
  assertTargetInspectionReceipt(targetInspection, config, { releaseId, sourceRevision })
  const plan = assertInspectionJoin({ config, sourceInspection, targetInspection, identityReceiptSha256: identityReceipt.bootstrapSha256 })
  for (const [name, value] of [['source', sourceBilling], ['target', targetBilling]]) if (value?.billingEnabled !== true || value.billingAccountName !== config.billingAccountName || value.projectId !== config[name].projectId) fail('DATA_CUTOVER_BILLING_MISMATCH', name)
  const sourceService = serviceSnapshot(config, service)
  const invokerBindings = directInvokerBindingCount(iamPolicy)
  const activeExecutions = (executions?.executions ?? []).filter((item) => !item.completionTime && !item.cancelledCount).length
  if (sourceService.ingress !== 'INGRESS_TRAFFIC_ALL' || sourceService.defaultUriDisabled !== false || sourceService.invokerIamDisabled !== true || invokerBindings !== 0 || activeExecutions !== 0) fail('DATA_CUTOVER_SOURCE_NOT_FENCE_READY')
  const core = {
    schemaVersion: 'jenfu.dev012.ai-pdm-data-provider-prepare-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, identityReceiptRef, identityReceiptSha256: identityReceipt.bootstrapSha256, identitySubjectSha256: sha256(identityReceipt.identity.subject), infraReceiptRef,
    billingAccountName: config.billingAccountName, billingLinkedProjects: [config.source.projectId, config.target.projectId].sort(), sourceSql: sqlSnapshot(config.source, sourceSql), targetSql: sqlSnapshot(config.target, targetSql), sourceBackup: latestBackupSnapshot(sourceBackups, Date.parse(observedAt)), targetBackup: latestBackupSnapshot(targetBackups, Date.parse(observedAt)), sourceService,
    migrationRunnerDigest: infraReceipt.migrationRunnerDigest, migrationRunnerArtifact: artifact, temporaryAccess: access, sourceJob: sourceJobSnapshot, targetJob: targetJobSnapshot, sourceInspectionRef, targetInspectionRef, sourceCatalogSha256: sourceInspection.catalog.catalogSha256, targetCatalogSha256: targetInspection.catalog.catalogSha256, migrationPlanSha256: plan.planSha256, sourceRowCount: sourceInspection.totalRowCount, targetBaselineRowCount: targetInspection.totalRowCount,
    directInvokerBindingCount: invokerBindings, activeMigrationExecutions: activeExecutions, remainingHumanAction: 0, evidenceScope: 'PROVIDER_VERIFIED', releaseAuthority: true, deadlineAt, observedAt, status: 'PASS',
  }
  return selfHash(core)
}

export function assertProviderPrepareReceipt(value, config, expected = {}) {
  if (!value || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-provider-prepare-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.billingAccountName !== config.billingAccountName || canonicalize(value.billingLinkedProjects) !== canonicalize([config.source.projectId, config.target.projectId].sort()) || value.sourceService?.invokerIamDisabled !== true || value.directInvokerBindingCount !== 0 || value.activeMigrationExecutions !== 0 || value.remainingHumanAction !== 0 || value.evidenceScope !== 'PROVIDER_VERIFIED' || value.releaseAuthority !== true || value.status !== 'PASS' || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (!H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256) fail('DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  for (const item of [value.sourceSql, value.targetSql]) if (item?.state !== 'RUNNABLE' || item.databaseVersion !== 'POSTGRES_17' || item.backupEnabled !== true || item.pointInTimeRecoveryEnabled !== true || item.transactionLogRetentionDays < 1 || item.publicIpv4Enabled !== false || typeof item.privateNetwork !== 'string') fail('DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  if (!value.identityReceiptRef || canonicalize(Object.keys(value.identityReceiptRef).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(value.identityReceiptRef.sha256 ?? '') || !value.identityReceiptRef.uri?.startsWith('gs://jenfu-platform-prod-orgmaster-release/receipts/releases/') || value.identityReceiptRef.uri.includes('..') || !value.infraReceiptRef || canonicalize(Object.keys(value.infraReceiptRef).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(value.infraReceiptRef.sha256 ?? '') || !value.infraReceiptRef.uri?.startsWith(`gs://${config.releaseBucket}/receipts/`) || value.infraReceiptRef.uri.includes('..') || value.sourceBackup?.status !== 'SUCCESSFUL' || value.targetBackup?.status !== 'SUCCESSFUL' || !H64.test(value.identityReceiptSha256 ?? '') || !H64.test(value.identitySubjectSha256 ?? '') || !H64.test(value.sourceCatalogSha256 ?? '') || !H64.test(value.targetCatalogSha256 ?? '') || !H64.test(value.migrationPlanSha256 ?? '') || !Number.isSafeInteger(value.sourceRowCount) || value.sourceRowCount <= 0 || !Number.isSafeInteger(value.targetBaselineRowCount) || value.targetBaselineRowCount < 0 || !Number.isFinite(Date.parse(value.deadlineAt)) || !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.deadlineAt) <= Date.parse(value.observedAt) || (expected.currentTime && Date.parse(value.deadlineAt) <= Date.parse(expected.currentTime)) || !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest ?? '')) fail('DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  const names = cutoverResourceNames(config, value.releaseId, value.sourceRevision)
  const paths = dataCutoverObjectPaths(config, value.releaseId)
  assertTemporaryAccess(value.temporaryAccess, config, names)
  assertExactRef(value.sourceInspectionRef, paths.sourceInspection, 'DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  assertExactRef(value.targetInspectionRef, paths.targetInspection, 'DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  if (value.sourceJob?.name !== `projects/${config.source.projectId}/locations/${config.source.region}/jobs/${names.sourceJobId}` || value.targetJob?.name !== `projects/${config.target.projectId}/locations/${config.target.region}/jobs/${names.targetJobId}` || value.sourceJob.image !== value.migrationRunnerDigest || value.targetJob.image !== value.migrationRunnerDigest || value.migrationRunnerArtifact?.uri !== value.migrationRunnerDigest) fail('DATA_CUTOVER_PROVIDER_PREPARE_RECEIPT_INVALID')
  return value
}

function createFencePatchReceiptFromSnapshots({ config, prepareReceipt, before, after, iamPolicy, executions, observedAt }) {
  assertProviderPrepareReceipt(prepareReceipt, config)
  const bindingCount = directInvokerBindingCount(iamPolicy)
  const activeExecutions = (executions?.executions ?? []).filter((item) => !item.completionTime && !item.cancelledCount).length
  if (before.etag !== prepareReceipt.sourceService.etag || before.invokerIamDisabled !== true || after.invokerIamDisabled !== false || before.templateSha256 !== after.templateSha256 || before.trafficSha256 !== after.trafficSha256 || bindingCount !== 0 || activeExecutions !== 0) fail('DATA_CUTOVER_FENCE_PATCH_READBACK_INVALID')
  return selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-fence-patch-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: prepareReceipt.releaseId, sourceRevision: prepareReceipt.sourceRevision, sourceProjectId: config.source.projectId, sourceService: config.source.service, baselineEtag: before.etag, fencedEtag: after.etag, updateMask: 'invokerIamDisabled', beforeInvokerIamDisabled: true, afterInvokerIamDisabled: false, directInvokerBindingCount: bindingCount, templateSha256: after.templateSha256, trafficSha256: after.trafficSha256, templateDrift: 0, trafficDrift: 0, activeMigrationExecutions: activeExecutions, accessFenced: true, observedAt, status: 'PASS' })
}

export function createFencePatchReceipt({ config, prepareReceipt, beforeService, afterService, iamPolicy, executions, observedAt }) {
  return createFencePatchReceiptFromSnapshots({ config, prepareReceipt, before: serviceSnapshot(config, beforeService), after: serviceSnapshot(config, afterService), iamPolicy, executions, observedAt })
}

export function recoverFencePatchReceipt({ config, prepareReceipt, fencedService, iamPolicy, executions, observedAt }) {
  const after = serviceSnapshot(config, fencedService)
  return createFencePatchReceiptFromSnapshots({ config, prepareReceipt, before: prepareReceipt.sourceService, after, iamPolicy, executions, observedAt })
}

export function assertFencePatchReceipt(value, config, expected = {}) {
  const core = { ...value }; delete core.receiptSha256
  if (!value || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-fence-patch-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceService !== config.source.service || value.updateMask !== 'invokerIamDisabled' || value.beforeInvokerIamDisabled !== true || value.afterInvokerIamDisabled !== false || value.directInvokerBindingCount !== 0 || value.templateDrift !== 0 || value.trafficDrift !== 0 || value.activeMigrationExecutions !== 0 || value.accessFenced !== true || value.status !== 'PASS' || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_FENCE_PATCH_RECEIPT_INVALID')
  return value
}

export function assertRestoreReceipt(value, config, expected = {}) {
  const core = { ...value }; delete core.receiptSha256
  if (!value || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-restore-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceService !== config.source.service || ![null, 'invokerIamDisabled'].includes(value.updateMask) || value.restoredAccess !== true || value.templateDrift !== 0 || value.trafficDrift !== 0 || value.status !== 'PASS' || !Number.isFinite(Date.parse(value.observedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_RESTORE_RECEIPT_INVALID')
  return value
}

export function finalizeFenceReceipt({ config, fencePatchReceipt, exportReceipt, observedAt }) {
  assertFencePatchReceipt(fencePatchReceipt, config)
  assertDataCutoverExportReceipt(exportReceipt, config, { releaseId: fencePatchReceipt.releaseId, sourceRevision: fencePatchReceipt.sourceRevision })
  return selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-fence-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: fencePatchReceipt.releaseId, sourceRevision: fencePatchReceipt.sourceRevision, sourceProjectId: config.source.projectId, sourceService: config.source.service, baselineEtag: fencePatchReceipt.baselineEtag, fencedEtag: fencePatchReceipt.fencedEtag, updateMask: 'invokerIamDisabled', beforeInvokerIamDisabled: true, afterInvokerIamDisabled: false, directInvokerBindingCount: 0, templateSha256: fencePatchReceipt.templateSha256, trafficSha256: fencePatchReceipt.trafficSha256, templateDrift: 0, trafficDrift: 0, activeMigrationExecutions: 0, activeDatabaseSessions: exportReceipt.sourceSessionPreflight.activeNonIdleCount, accessFenced: true, completedAt: observedAt, status: 'PASS' })
}

function normalizePolicy(value) {
  if (!value || !Array.isArray(value.bindings) || typeof value.etag !== 'string') fail('DATA_CUTOVER_IAM_POLICY_INVALID')
  return {
    version: Math.max(Number(value.version ?? 1), 3),
    etag: value.etag,
    bindings: value.bindings.map((binding) => ({ ...binding, members: [...(binding.members ?? [])].sort() })).sort((left, right) => canonicalize(left).localeCompare(canonicalize(right))),
  }
}

function addMember(policy, { role, member, condition = null }) {
  const result = structuredClone(normalizePolicy(policy))
  let binding = result.bindings.find((item) => item.role === role && canonicalize(item.condition ?? null) === canonicalize(condition))
  if (!binding) {
    binding = { role, members: [], ...(condition ? { condition } : {}) }
    result.bindings.push(binding)
  }
  const preexisting = binding.members.includes(member)
  if (!preexisting) binding.members.push(member)
  binding.members.sort()
  result.bindings.sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)))
  return { policy: result, disposition: preexisting ? 'PREEXISTING' : 'ADDED' }
}

function removeMember(policy, { role, member, condition = null, remove }) {
  const result = structuredClone(normalizePolicy(policy))
  if (!remove) return result
  const index = result.bindings.findIndex((item) => item.role === role && canonicalize(item.condition ?? null) === canonicalize(condition))
  if (index < 0 || !result.bindings[index].members.includes(member)) return result
  result.bindings[index].members = result.bindings[index].members.filter((item) => item !== member)
  if (result.bindings[index].members.length === 0) result.bindings.splice(index, 1)
  return result
}

function policySha256(policy) {
  const normalized = normalizePolicy(policy)
  return sha256(canonicalize({ version: normalized.version, bindings: normalized.bindings }))
}

export function buildTemporaryAccessPolicies({ config, releaseId, sourceRevision, bucketPolicy, artifactPolicy }) {
  const names = cutoverResourceNames(config, releaseId, sourceRevision)
  const sourceMember = `serviceAccount:${config.source.serviceAccount}`
  const sourceCloudRunServiceAgentMember = `serviceAccount:${names.sourceCloudRunServiceAgent}`
  const expression = `resource.name.startsWith('projects/_/buckets/${config.releaseBucket}/objects/${names.sourceObjectPrefix}')`
  const creatorCondition = { title: `dev012-${names.suffix}-source-creator`, expression }
  const viewerCondition = { title: `dev012-${names.suffix}-source-viewer`, expression }
  const creator = addMember(bucketPolicy, { role: 'roles/storage.objectCreator', member: sourceMember, condition: creatorCondition })
  const viewer = addMember(creator.policy, { role: 'roles/storage.objectViewer', member: sourceMember, condition: viewerCondition })
  const artifact = addMember(artifactPolicy, { role: 'roles/artifactregistry.reader', member: sourceCloudRunServiceAgentMember })
  const temporaryAccess = {
    sourceObjectPrefix: names.sourceObjectPrefix,
    sourceMember,
    sourceCloudRunServiceAgentMember,
    bucketObjectCreator: creator.disposition,
    bucketObjectViewer: viewer.disposition,
    artifactReader: artifact.disposition,
    bucketPolicySha256: policySha256(viewer.policy),
    artifactPolicySha256: policySha256(artifact.policy),
    status: 'ACTIVE',
  }
  return { bucketPolicy: viewer.policy, artifactPolicy: artifact.policy, temporaryAccess, creatorCondition, viewerCondition }
}

export function buildTemporaryAccessCleanupPolicies({ config, releaseId, sourceRevision, temporaryAccess, bucketPolicy, artifactPolicy }) {
  const names = cutoverResourceNames(config, releaseId, sourceRevision)
  assertTemporaryAccess(temporaryAccess, config, names)
  const expression = `resource.name.startsWith('projects/_/buckets/${config.releaseBucket}/objects/${names.sourceObjectPrefix}')`
  const sourceMember = `serviceAccount:${config.source.serviceAccount}`
  const sourceCloudRunServiceAgentMember = `serviceAccount:${names.sourceCloudRunServiceAgent}`
  let cleanedBucket = removeMember(bucketPolicy, { role: 'roles/storage.objectCreator', member: sourceMember, condition: { title: `dev012-${names.suffix}-source-creator`, expression }, remove: true })
  cleanedBucket = removeMember(cleanedBucket, { role: 'roles/storage.objectViewer', member: sourceMember, condition: { title: `dev012-${names.suffix}-source-viewer`, expression }, remove: true })
  const cleanedArtifact = removeMember(artifactPolicy, { role: 'roles/artifactregistry.reader', member: sourceCloudRunServiceAgentMember, remove: temporaryAccess.artifactReader === 'ADDED' })
  return { bucketPolicy: cleanedBucket, artifactPolicy: cleanedArtifact, bucketPolicySha256: policySha256(cleanedBucket), artifactPolicySha256: policySha256(cleanedArtifact) }
}

export function createProviderTransport({ token, fetchImpl = fetch, now = () => new Date().toISOString() }) {
  if (typeof token !== 'string' || token.length < 20) fail('DATA_CUTOVER_PROVIDER_TOKEN_REQUIRED')
  const headers = { authorization: `Bearer ${token}` }
  async function request(url, options = {}) {
    const { allow404 = false, ...fetchOptions } = options
    let response
    try { response = await fetchImpl(url, { ...fetchOptions, headers: { ...headers, ...(fetchOptions.headers ?? {}) }, signal: fetchOptions.signal ?? AbortSignal.timeout(30_000) }) } catch (error) { fail('DATA_CUTOVER_PROVIDER_OUTCOME_UNKNOWN', error?.name ?? new URL(url).hostname) }
    if (allow404 && response.status === 404) return null
    if (!response.ok) fail('DATA_CUTOVER_PROVIDER_REQUEST_FAILED', `${response.status}:${new URL(url).hostname}`)
    return response.status === 204 ? null : response.json()
  }
  async function waitOperation(operation) {
    if (!operation?.name) fail('DATA_CUTOVER_PROVIDER_OPERATION_INVALID')
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const value = await request(`https://run.googleapis.com/v2/${operation.name}`)
      if (value.done === true) { if (value.error) fail('DATA_CUTOVER_PROVIDER_OPERATION_FAILED', String(value.error.code)); return value.response }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    fail('DATA_CUTOVER_PROVIDER_OPERATION_TIMEOUT')
  }
  async function waitSqlOperation(target, operation, deadlineAt) {
    if (!operation?.name || !Number.isFinite(Date.parse(deadlineAt))) fail('DATA_CUTOVER_SQL_BACKUP_OPERATION_INVALID')
    while (Date.now() < Date.parse(deadlineAt)) {
      const value = await request(`https://sqladmin.googleapis.com/sql/v1beta4/projects/${target.projectId}/operations/${encodeURIComponent(operation.name)}`)
      if (value.status === 'DONE') {
        if (value.error?.errors?.length) fail('DATA_CUTOVER_SQL_BACKUP_FAILED', target.projectId)
        return value
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    fail('DATA_CUTOVER_SQL_BACKUP_TIMEOUT', target.projectId)
  }
  const serviceName = (config) => `projects/${config.source.projectId}/locations/${config.source.region}/services/${config.source.service}`
  async function listMigrationExecutions(config) {
    const executions = []
    let pageToken = ''
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ pageSize: '100' })
      if (pageToken) query.set('pageToken', pageToken)
      const value = await request(`https://run.googleapis.com/v2/projects/${config.source.projectId}/locations/${config.source.region}/jobs/${config.source.migrationJob}/executions?${query}`)
      if (!Array.isArray(value?.executions ?? [])) fail('DATA_CUTOVER_MIGRATION_EXECUTION_LIST_INVALID')
      executions.push(...(value.executions ?? []))
      pageToken = value.nextPageToken ?? ''
      if (!pageToken) break
      if (page === 9) fail('DATA_CUTOVER_MIGRATION_EXECUTION_LIST_INCOMPLETE')
    }
    const names = executions.map((item) => item?.name)
    if (names.some((name) => typeof name !== 'string') || new Set(names).size !== names.length) fail('DATA_CUTOVER_MIGRATION_EXECUTION_LIST_INVALID')
    return { executions }
  }
  const getService = (config) => request(`https://run.googleapis.com/v2/${serviceName(config)}`)
  const backupRunsUrl = (target) => `https://sqladmin.googleapis.com/sql/v1beta4/projects/${target.projectId}/instances/${target.instanceConnectionName.split(':').at(-1)}/backupRuns`
  const listBackups = (target) => request(`${backupRunsUrl(target)}?maxResults=100`)
  async function ensureFreshBackup(target, releaseId, deadlineAt) {
    const before = await listBackups(target)
    try { latestBackupSnapshot(before, Date.now()); return before } catch (error) { if (error?.code !== 'DATA_CUTOVER_BACKUP_NOT_FRESH') throw error }
    const operation = await request(backupRunsUrl(target), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: `DEV-012 ${releaseId} pre-cutover` }) })
    await waitSqlOperation(target, operation, deadlineAt)
    while (Date.now() < Date.parse(deadlineAt)) {
      const after = await listBackups(target)
      try { latestBackupSnapshot(after, Date.now()); return after } catch (error) { if (error?.code !== 'DATA_CUTOVER_BACKUP_NOT_FRESH') throw error }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    fail('DATA_CUTOVER_SQL_BACKUP_READBACK_TIMEOUT', target.projectId)
  }

  const jobName = (target, jobId) => `projects/${target.projectId}/locations/${target.region}/jobs/${jobId}`
  const getJob = (target, jobId, allow404 = false) => request(`https://run.googleapis.com/v2/${jobName(target, jobId)}`, { allow404 })
  async function ensureJob(config, releaseId, sourceRevision, migrationRunnerDigest, kind) {
    const expected = buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind })
    const target = kind === 'source' ? config.source : config.target
    let value = await getJob(target, expected.jobId, true)
    if (!value) {
      let operation = null
      try {
        operation = await request(`https://run.googleapis.com/v2/projects/${target.projectId}/locations/${target.region}/jobs?jobId=${encodeURIComponent(expected.jobId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(expected.body) })
        await waitOperation(operation)
      } catch (error) {
        if (error?.code !== 'DATA_CUTOVER_PROVIDER_OUTCOME_UNKNOWN') throw error
      }
      value = await getJob(target, expected.jobId, true)
      if (!value) fail('DATA_CUTOVER_JOB_CREATE_OUTCOME_UNKNOWN', kind)
    }
    assertCutoverJob(value, expected, config, kind)
    return value
  }

  async function listJobExecutions(target, jobId) {
    const values = []
    let pageToken = ''
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ pageSize: '100' })
      if (pageToken) query.set('pageToken', pageToken)
      const result = await request(`https://run.googleapis.com/v2/${jobName(target, jobId)}/executions?${query}`)
      if (!Array.isArray(result?.executions ?? [])) fail('DATA_CUTOVER_JOB_EXECUTION_LIST_INVALID')
      values.push(...(result.executions ?? []))
      pageToken = result.nextPageToken ?? ''
      if (!pageToken) break
      if (page === 9) fail('DATA_CUTOVER_JOB_EXECUTION_LIST_INCOMPLETE')
    }
    const names = values.map((value) => value?.name)
    if (names.some((name) => typeof name !== 'string' || !name.startsWith(`${jobName(target, jobId)}/executions/`)) || new Set(names).size !== names.length) fail('DATA_CUTOVER_JOB_EXECUTION_LIST_INVALID')
    return values
  }

  async function runJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind, args, deadlineAt }) {
    if (!Number.isFinite(Date.parse(deadlineAt)) || Date.parse(deadlineAt) <= Date.now() || !Array.isArray(args) || args.length < 3) fail('DATA_CUTOVER_JOB_EXECUTION_INPUT_INVALID')
    const expected = buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind })
    const target = kind === 'source' ? config.source : config.target
    assertCutoverJob(await getJob(target, expected.jobId), expected, config, kind)
    const before = new Set((await listJobExecutions(target, expected.jobId)).map((value) => value.name))
    let operationName = null
    try {
      const operation = await request(`https://run.googleapis.com/v2/${jobName(target, expected.jobId)}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides: { containerOverrides: [{ name: 'cutover', args }] } }) })
      operationName = operation?.name ?? null
      if (!operationName) fail('DATA_CUTOVER_JOB_OPERATION_REF_MISSING')
    } catch (error) {
      if (error?.code !== 'DATA_CUTOVER_PROVIDER_OUTCOME_UNKNOWN') throw error
      operationName = 'OUTCOME_UNKNOWN_EXECUTION_READBACK'
    }
    const expectedArgsSha256 = sha256(canonicalize(args))
    let selected = null
    while (!selected && Date.now() < Date.parse(deadlineAt)) {
      const matches = (await listJobExecutions(target, expected.jobId)).filter((value) => {
        const container = value?.template?.containers?.find((item) => item.name === 'cutover')
        return !before.has(value.name) && sha256(canonicalize(container?.args)) === expectedArgsSha256
      })
      if (matches.length > 1) fail('DATA_CUTOVER_JOB_EXECUTION_CARDINALITY_INVALID')
      selected = matches[0] ?? null
      if (!selected) await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    if (!selected) fail('DATA_CUTOVER_JOB_EXECUTION_NOT_FOUND')
    while (Date.now() < Date.parse(deadlineAt)) {
      const value = await request(`https://run.googleapis.com/v2/${selected.name}`)
      const container = value?.template?.containers?.find((item) => item.name === 'cutover')
      if (sha256(canonicalize(container?.args)) !== expectedArgsSha256) fail('DATA_CUTOVER_JOB_EXECUTION_READBACK_INVALID')
      const conditions = (value.conditions ?? []).filter((condition) => condition.type === 'Completed')
      if (conditions.length > 1) fail('DATA_CUTOVER_JOB_EXECUTION_READBACK_INVALID')
      if (value.completionTime || conditions[0]?.state === 'CONDITION_FAILED') {
        if (conditions[0]?.state !== 'CONDITION_SUCCEEDED' || Number(value.succeededCount ?? 0) !== 1 || Number(value.failedCount ?? 0) !== 0 || !value.completionTime) fail('DATA_CUTOVER_JOB_EXECUTION_FAILED')
        return { name: value.name, uid: value.uid, createTime: value.createTime, completionTime: value.completionTime, succeededCount: 1, failedCount: 0, argsSha256: expectedArgsSha256, providerOperationRef: operationName }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    fail('DATA_CUTOVER_JOB_EXECUTION_TIMEOUT')
  }

  async function deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind }) {
    const expected = buildCutoverJob({ config, releaseId, sourceRevision, migrationRunnerDigest, kind })
    const target = kind === 'source' ? config.source : config.target
    const before = await getJob(target, expected.jobId, true)
    if (!before) return { name: jobName(target, expected.jobId), deleted: true, alreadyAbsent: true }
    assertCutoverJob(before, expected, config, kind)
    const operation = await request(`https://run.googleapis.com/v2/${jobName(target, expected.jobId)}?etag=${encodeURIComponent(before.etag)}`, { method: 'DELETE' })
    await waitOperation(operation)
    if (await getJob(target, expected.jobId, true)) fail('DATA_CUTOVER_JOB_DELETE_READBACK_INVALID', kind)
    return { name: jobName(target, expected.jobId), deleted: true, alreadyAbsent: false }
  }

  const bucketIamUrl = (bucket) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/iam?optionsRequestedPolicyVersion=3`
  const artifactResource = (config) => `projects/${config.target.projectId}/locations/${config.target.region}/repositories/aipdm-release`
  const artifactIamUrl = (config) => `https://artifactregistry.googleapis.com/v1/${artifactResource(config)}:getIamPolicy`
  async function getBucketPolicy(config) { return request(bucketIamUrl(config.releaseBucket)) }
  async function getArtifactPolicy(config) { return request(artifactIamUrl(config)) }
  async function setBucketPolicy(config, policy) { return request(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.releaseBucket)}/iam`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policy) }) }
  async function setArtifactPolicy(config, policy) { return request(`https://artifactregistry.googleapis.com/v1/${artifactResource(config)}:setIamPolicy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy }) }) }

  async function ensureTemporaryAccess(config, releaseId, sourceRevision) {
    const [bucketBefore, artifactBefore] = await Promise.all([getBucketPolicy(config), getArtifactPolicy(config)])
    const planned = buildTemporaryAccessPolicies({ config, releaseId, sourceRevision, bucketPolicy: bucketBefore, artifactPolicy: artifactBefore })
    if (policySha256(bucketBefore) !== planned.temporaryAccess.bucketPolicySha256) await setBucketPolicy(config, planned.bucketPolicy)
    if (policySha256(artifactBefore) !== planned.temporaryAccess.artifactPolicySha256) await setArtifactPolicy(config, planned.artifactPolicy)
    const [bucketAfter, artifactAfter] = await Promise.all([getBucketPolicy(config), getArtifactPolicy(config)])
    if (policySha256(bucketAfter) !== planned.temporaryAccess.bucketPolicySha256 || policySha256(artifactAfter) !== planned.temporaryAccess.artifactPolicySha256) fail('DATA_CUTOVER_TEMPORARY_ACCESS_READBACK_INVALID')
    return planned.temporaryAccess
  }

  async function cleanupTemporaryAccess(config, releaseId, sourceRevision, temporaryAccess) {
    const [bucketBefore, artifactBefore] = await Promise.all([getBucketPolicy(config), getArtifactPolicy(config)])
    const planned = buildTemporaryAccessCleanupPolicies({ config, releaseId, sourceRevision, temporaryAccess, bucketPolicy: bucketBefore, artifactPolicy: artifactBefore })
    if (policySha256(bucketBefore) !== planned.bucketPolicySha256) await setBucketPolicy(config, planned.bucketPolicy)
    if (policySha256(artifactBefore) !== planned.artifactPolicySha256) await setArtifactPolicy(config, planned.artifactPolicy)
    const [bucketAfter, artifactAfter] = await Promise.all([getBucketPolicy(config), getArtifactPolicy(config)])
    if (policySha256(bucketAfter) !== planned.bucketPolicySha256 || policySha256(artifactAfter) !== planned.artifactPolicySha256) fail('DATA_CUTOVER_TEMPORARY_ACCESS_CLEANUP_FAILED')
    return { bucketPolicySha256: planned.bucketPolicySha256, artifactPolicySha256: planned.artifactPolicySha256, status: 'REMOVED' }
  }

  async function getMigrationRunnerArtifact(config, digest) {
    const parent = artifactResource(config)
    let pageToken = ''
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({ pageSize: '100' })
      if (pageToken) query.set('pageToken', pageToken)
      const value = await request(`https://artifactregistry.googleapis.com/v1/${parent}/dockerImages?${query}`)
      const found = (value.dockerImages ?? []).find((item) => item.uri === digest)
      if (found) return found
      pageToken = value.nextPageToken ?? ''
      if (!pageToken) break
      if (page === 19) fail('DATA_CUTOVER_ARTIFACT_LIST_INCOMPLETE')
    }
    fail('DATA_CUTOVER_MIGRATION_RUNNER_ARTIFACT_MISSING')
  }
  async function deleteGcsObject({ uri, expectedBucket, expectedPrefix, expectedGeneration }) {
    const match = /^gs:\/\/([^/]+)\/(.+)$/u.exec(uri ?? '')
    if (!match || match[1] !== expectedBucket || !match[2].startsWith(`${expectedPrefix}/`) || match[2].includes('..') || !/^[1-9][0-9]*$/u.test(expectedGeneration ?? '')) fail('DATA_CUTOVER_GCS_DELETE_INPUT_INVALID')
    const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(match[1])}/o/${encodeURIComponent(match[2])}`
    const before = await request(metadataUrl, { allow404: true })
    if (!before) return { uri, generation: expectedGeneration, deleted: true, alreadyAbsent: true }
    if (String(before.generation) !== expectedGeneration) fail('DATA_CUTOVER_GCS_DELETE_GENERATION_MISMATCH')
    await request(`${metadataUrl}?ifGenerationMatch=${encodeURIComponent(expectedGeneration)}`, { method: 'DELETE' })
    if (await request(metadataUrl, { allow404: true })) fail('DATA_CUTOVER_GCS_DELETE_READBACK_FAILED')
    return { uri, generation: expectedGeneration, deleted: true, alreadyAbsent: false }
  }
  return {
    now,
    getBilling: (projectId) => request(`https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`).then((value) => ({ projectId, billingEnabled: value.billingEnabled === true, billingAccountName: value.billingAccountName })),
    getSql: (target) => request(`https://sqladmin.googleapis.com/sql/v1beta4/projects/${target.projectId}/instances/${target.instanceConnectionName.split(':').at(-1)}`),
    listBackups,
    ensureFreshBackup,
    getService,
    getMigrationRunnerArtifact,
    ensureTemporaryAccess,
    cleanupTemporaryAccess,
    ensureJob,
    runJob,
    deleteJob,
    deleteGcsObject,
    getIamPolicy: (config) => request(`https://run.googleapis.com/v2/${serviceName(config)}:getIamPolicy`),
    listMigrationExecutions,
    async setLegacyAccessFence(config, service, disabled) {
      const operation = await request(`https://run.googleapis.com/v2/${serviceName(config)}?updateMask=invokerIamDisabled&allowMissing=false`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: serviceName(config), etag: service.etag, invokerIamDisabled: disabled }) })
      await waitOperation(operation)
      return getService(config)
    },
    readJson: async (ref, config, prefix) => {
      if (!ref || !H64.test(ref.sha256 ?? '')) fail('DATA_CUTOVER_PROVIDER_REF_INVALID')
      const value = await readGcsObject({ uri: ref.uri, expectedBucket: config.releaseBucket, expectedPrefix: prefix, token })
      if (sha256(value.bytes) !== ref.sha256) fail('DATA_CUTOVER_PROVIDER_REF_HASH_MISMATCH')
      try { return { value: JSON.parse(value.bytes.toString('utf8')), ref } } catch { fail('DATA_CUTOVER_PROVIDER_JSON_INVALID') }
    },
    readJsonByUri: async (uri, config, prefix) => {
      const result = await readGcsObject({ uri, expectedBucket: config.releaseBucket, expectedPrefix: prefix, token })
      try { return { value: JSON.parse(result.bytes.toString('utf8')), ref: { uri, sha256: sha256(result.bytes) } } } catch { fail('DATA_CUTOVER_PROVIDER_JSON_INVALID') }
    },
    readRawObject: (uri, config, prefix) => readGcsObject({ uri, expectedBucket: config.releaseBucket, expectedPrefix: prefix, token }),
    readExternalJson: async (ref, expected) => {
      if (!ref || !H64.test(ref.sha256 ?? '') || typeof expected?.bucket !== 'string' || typeof expected?.prefix !== 'string') fail('DATA_CUTOVER_PROVIDER_REF_INVALID')
      const result = await readGcsObject({ uri: ref.uri, expectedBucket: expected.bucket, expectedPrefix: expected.prefix, token })
      if (sha256(result.bytes) !== ref.sha256) fail('DATA_CUTOVER_PROVIDER_REF_HASH_MISMATCH')
      try { return { value: JSON.parse(result.bytes.toString('utf8')), ref } } catch { fail('DATA_CUTOVER_PROVIDER_JSON_INVALID') }
    },
    publishJson: async (uri, config, prefix, value) => {
      const result = await publishGcsJson({ uri, expectedBucket: config.releaseBucket, expectedPrefix: prefix, value, token })
      return { value, ref: { uri, sha256: result.sha256 } }
    },
  }
}

function exactInputKeys(value, keys) {
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) fail('DATA_CUTOVER_PROVIDER_INPUT_INVALID')
}

export function assertProviderStageInput(stage, value, config) {
  const ref = (name) => {
    if (!value[name] || canonicalize(Object.keys(value[name]).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(value[name].sha256 ?? '')) fail('DATA_CUTOVER_PROVIDER_INPUT_INVALID', name)
  }
  if (stage === 'prepare') {
    exactInputKeys(value, ['identityReceiptRef', 'infraReceiptRef', 'migrationRunnerDigest', 'deadlineAt'])
    ref('identityReceiptRef'); ref('infraReceiptRef')
    if (!/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest ?? '') || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= Date.now()) fail('DATA_CUTOVER_PROVIDER_INPUT_INVALID')
  } else if (stage === 'fence') {
    exactInputKeys(value, ['acknowledgement', 'prepareReceiptRef']); ref('prepareReceiptRef')
    if (value.acknowledgement !== config.acknowledgements.fence) fail('DATA_CUTOVER_FENCE_ACKNOWLEDGEMENT_REQUIRED')
  } else if (stage === 'export') {
    exactInputKeys(value, ['acknowledgement', 'prepareReceiptRef', 'fencePatchReceiptRef', 'deadlineAt']); ref('prepareReceiptRef'); ref('fencePatchReceiptRef')
    if (value.acknowledgement !== config.acknowledgements.export || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= Date.now()) fail('DATA_CUTOVER_EXPORT_ACKNOWLEDGEMENT_REQUIRED')
  } else if (stage === 'import') {
    exactInputKeys(value, ['acknowledgement', 'prepareReceiptRef', 'exportReceiptRef', 'deadlineAt']); ref('prepareReceiptRef'); ref('exportReceiptRef')
    if (value.acknowledgement !== config.acknowledgements.import || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= Date.now()) fail('DATA_CUTOVER_IMPORT_ACKNOWLEDGEMENT_REQUIRED')
  } else if (stage === 'teardown') {
    exactInputKeys(value, ['prepareReceiptRef', 'exportReceiptRef', 'importReceiptRef']); ref('prepareReceiptRef'); ref('exportReceiptRef'); ref('importReceiptRef')
  } else if (stage === 'handoff') {
    exactInputKeys(value, ['prepareReceiptRef', 'exportReceiptRef', 'importReceiptRef', 'fencePatchReceiptRef', 'teardownReceiptRef'])
    for (const name of ['prepareReceiptRef', 'exportReceiptRef', 'importReceiptRef', 'fencePatchReceiptRef', 'teardownReceiptRef']) ref(name)
  } else if (stage === 'post-live-cleanup') {
    exactInputKeys(value, ['handoffReceiptRef', 'terminalReceiptRef']); ref('handoffReceiptRef'); ref('terminalReceiptRef')
  } else if (stage === 'restore') {
    exactInputKeys(value, ['acknowledgement', 'fencePatchReceiptRef']); ref('fencePatchReceiptRef')
    if (value.acknowledgement !== config.acknowledgements.restore) fail('DATA_CUTOVER_RESTORE_ACKNOWLEDGEMENT_REQUIRED')
  } else fail('DATA_CUTOVER_PROVIDER_STAGE_INVALID')
  return value
}

function runtimeArgs({ mode, releaseId, sourceRevision, paths, identityUid, identityReceiptSha256, acknowledgement, bundleGeneration, bundleBytesSha256 }) {
  const args = ['scripts/dev012-production-data-cutover-runtime.mjs', '--mode', mode, '--release-id', releaseId, '--source-revision', sourceRevision]
  if (['inspect-source', 'inspect-target'].includes(mode)) args.push('--receipt-ref', mode === 'inspect-source' ? paths.sourceInspection : paths.targetInspection, '--identity-uid', identityUid, '--identity-receipt-sha256', identityReceiptSha256)
  if (mode === 'export') args.push('--bundle-ref', paths.bundle, '--receipt-ref', paths.exportReceipt, '--identity-uid', identityUid, '--identity-receipt-sha256', identityReceiptSha256, '--acknowledgement', acknowledgement)
  if (mode === 'import') args.push('--bundle-ref', paths.bundle, '--bundle-sha256', bundleBytesSha256, '--bundle-generation', bundleGeneration, '--receipt-ref', paths.importReceipt, '--acknowledgement', acknowledgement)
  return args
}

export async function executeProviderStage({ stage, config: configInput, releaseId, sourceRevision, input, transport }) {
  const config = assertDataCutoverConfig(configInput)
  if (!RELEASE_ID.test(releaseId ?? '') || !H40.test(sourceRevision ?? '') || !transport) fail('DATA_CUTOVER_PROVIDER_EXECUTION_INVALID')
  assertProviderStageInput(stage, input, config)
  const paths = dataCutoverObjectPaths(config, releaseId)
  const optional = async (objectUri, prefix) => {
    try { return await transport.readJsonByUri(objectUri, config, prefix) } catch (error) { if (error?.code === 'MIGRATION_GCS_METADATA_FAILED' && /:404$/u.test(error.message)) return null; throw error }
  }
  const read = (ref, prefix) => transport.readJson(ref, config, prefix)
  if (stage !== 'restore') {
    const aborted = await optional(paths.abortCleanup, 'receipts')
    if (aborted) {
      assertAbortCleanupReceipt(aborted.value, config, { releaseId, sourceRevision })
      fail('DATA_CUTOVER_RELEASE_ALREADY_ABORTED')
    }
  }

  if (stage === 'prepare') {
    const existing = await optional(paths.providerPrepare, 'receipts')
    if (existing) { assertProviderPrepareReceipt(existing.value, config, { releaseId, sourceRevision, currentTime: transport.now() }); return existing }
    const [identity, infra, sourceBilling, targetBilling, sourceSql, targetSql, sourceBackups, targetBackups, service, iamPolicy, executions] = await Promise.all([
      transport.readExternalJson(input.identityReceiptRef, { bucket: 'jenfu-platform-prod-orgmaster-release', prefix: 'receipts/releases' }),
      read(input.infraReceiptRef, 'receipts'),
      transport.getBilling(config.source.projectId), transport.getBilling(config.target.projectId), transport.getSql(config.source), transport.getSql(config.target), transport.ensureFreshBackup(config.source, releaseId, input.deadlineAt), transport.ensureFreshBackup(config.target, releaseId, input.deadlineAt), transport.getService(config), transport.getIamPolicy(config), transport.listMigrationExecutions(config),
    ])
    assertFirstPrincipalBootstrap(identity.value, config)
    assertAppInfraReceipt(infra.value, config, { sourceRevision, migrationRunnerDigest: input.migrationRunnerDigest })
    const migrationRunnerArtifact = await transport.getMigrationRunnerArtifact(config, input.migrationRunnerDigest)
    let temporaryAccess = null
    try {
      temporaryAccess = await transport.ensureTemporaryAccess(config, releaseId, sourceRevision)
      const [sourceJob, targetJob] = await Promise.all([
        transport.ensureJob(config, releaseId, sourceRevision, input.migrationRunnerDigest, 'source'),
        transport.ensureJob(config, releaseId, sourceRevision, input.migrationRunnerDigest, 'target'),
      ])
      const runInspection = async (kind, mode, receiptUri) => {
        const prefix = kind === 'source' ? 'source/migration-bundles' : 'receipts'
        let result = await optional(receiptUri, prefix)
        if (!result) {
          const execution = await transport.runJob({ config, releaseId, sourceRevision, migrationRunnerDigest: input.migrationRunnerDigest, kind, args: runtimeArgs({ mode, releaseId, sourceRevision, paths, identityUid: identity.value.identity.subject, identityReceiptSha256: identity.value.bootstrapSha256 }), deadlineAt: input.deadlineAt })
          result = await optional(receiptUri, prefix)
          if (!result || result.value.executionName !== execution.name.split('/').at(-1)) fail('DATA_CUTOVER_INSPECTION_EXECUTION_JOIN_INVALID', kind)
        }
        return result
      }
      const [sourceInspection, targetInspection] = await Promise.all([
        runInspection('source', 'inspect-source', paths.sourceInspection),
        runInspection('target', 'inspect-target', paths.targetInspection),
      ])
      const observedAt = transport.now()
      const receipt = createProviderPrepareReceipt({ config, releaseId, sourceRevision, identityReceiptRef: identity.ref, identityReceipt: identity.value, infraReceiptRef: infra.ref, infraReceipt: infra.value, migrationRunnerArtifact, temporaryAccess, sourceJob, targetJob, sourceInspectionRef: sourceInspection.ref, sourceInspection: sourceInspection.value, targetInspectionRef: targetInspection.ref, targetInspection: targetInspection.value, sourceBilling, targetBilling, sourceSql, targetSql, sourceBackups, targetBackups, service, iamPolicy, executions, deadlineAt: input.deadlineAt, observedAt })
      return transport.publishJson(paths.providerPrepare, config, 'receipts', receipt)
    } catch (error) {
      const cleanupFailures = []
      for (const kind of ['source', 'target']) {
        try { await transport.deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest: input.migrationRunnerDigest, kind }) } catch (cleanupError) { cleanupFailures.push(`${kind}:${cleanupError.code ?? cleanupError.message}`) }
      }
      if (temporaryAccess) try { await transport.cleanupTemporaryAccess(config, releaseId, sourceRevision, temporaryAccess) } catch (cleanupError) { cleanupFailures.push(`iam:${cleanupError.code ?? cleanupError.message}`) }
      if (cleanupFailures.length > 0) fail('DATA_CUTOVER_PREPARE_CLEANUP_FAILED', cleanupFailures.join(','))
      throw error
    }
  }

  if (stage === 'fence') {
    const existing = await optional(paths.fencePatch, 'receipts')
    if (existing) {
      assertFencePatchReceipt(existing.value, config, { releaseId, sourceRevision })
      const current = serviceSnapshot(config, await transport.getService(config))
      if (current.invokerIamDisabled !== false || current.templateSha256 !== existing.value.templateSha256 || current.trafficSha256 !== existing.value.trafficSha256) fail('DATA_CUTOVER_FENCE_REPLAY_STATE_INVALID')
      return existing
    }
    const prepared = await read(input.prepareReceiptRef, 'receipts')
    assertProviderPrepareReceipt(prepared.value, config, { releaseId, sourceRevision, currentTime: transport.now() })
    const [before, iamPolicy, executions] = await Promise.all([transport.getService(config), transport.getIamPolicy(config), transport.listMigrationExecutions(config)])
    const beforeSnapshot = serviceSnapshot(config, before)
    const receipt = beforeSnapshot.invokerIamDisabled
      ? createFencePatchReceipt({ config, prepareReceipt: prepared.value, beforeService: before, afterService: await transport.setLegacyAccessFence(config, before, false), iamPolicy, executions, observedAt: transport.now() })
      : recoverFencePatchReceipt({ config, prepareReceipt: prepared.value, fencedService: before, iamPolicy, executions, observedAt: transport.now() })
    return transport.publishJson(paths.fencePatch, config, 'receipts', receipt)
  }

  if (stage === 'export') {
    let existing = await optional(paths.exportReceipt, 'source/migration-bundles')
    const [prepared, fencePatch] = await Promise.all([read(input.prepareReceiptRef, 'receipts'), read(input.fencePatchReceiptRef, 'receipts')])
    assertProviderPrepareReceipt(prepared.value, config, { releaseId, sourceRevision, currentTime: transport.now() })
    assertFencePatchReceipt(fencePatch.value, config, { releaseId, sourceRevision })
    if (!existing) {
      const identity = await transport.readExternalJson(prepared.value.identityReceiptRef, { bucket: 'jenfu-platform-prod-orgmaster-release', prefix: 'receipts/releases' })
      assertFirstPrincipalBootstrap(identity.value, config, prepared.value.identityReceiptSha256)
      if (sha256(identity.value.identity.subject) !== prepared.value.identitySubjectSha256) fail('DATA_CUTOVER_EXPORT_IDENTITY_JOIN_INVALID')
      const execution = await transport.runJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'source', args: runtimeArgs({ mode: 'export', releaseId, sourceRevision, paths, identityUid: identity.value.identity.subject, identityReceiptSha256: prepared.value.identityReceiptSha256, acknowledgement: input.acknowledgement }), deadlineAt: input.deadlineAt })
      existing = await optional(paths.exportReceipt, 'source/migration-bundles')
      if (!existing || existing.value.executionName !== execution.name.split('/').at(-1)) fail('DATA_CUTOVER_EXPORT_EXECUTION_JOIN_INVALID')
    }
    assertDataCutoverExportReceipt(existing.value, config, { releaseId, sourceRevision })
    if (existing.value.identityReceiptSha256 !== prepared.value.identityReceiptSha256 || existing.value.sourceCatalogSha256 !== prepared.value.sourceCatalogSha256) fail('DATA_CUTOVER_EXPORT_IDENTITY_JOIN_INVALID')
    return existing
  }

  if (stage === 'import') {
    let existing = await optional(paths.importReceipt, 'receipts')
    const [prepared, exported] = await Promise.all([read(input.prepareReceiptRef, 'receipts'), read(input.exportReceiptRef, 'source/migration-bundles')])
    assertProviderPrepareReceipt(prepared.value, config, { releaseId, sourceRevision, currentTime: transport.now() })
    assertDataCutoverExportReceipt(exported.value, config, { releaseId, sourceRevision })
    if (!existing) {
      const execution = await transport.runJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'target', args: runtimeArgs({ mode: 'import', releaseId, sourceRevision, paths, bundleGeneration: exported.value.bundleGeneration, bundleBytesSha256: exported.value.bundleBytesSha256, acknowledgement: input.acknowledgement }), deadlineAt: input.deadlineAt })
      existing = await optional(paths.importReceipt, 'receipts')
      if (!existing || existing.value.executionName !== execution.name.split('/').at(-1)) fail('DATA_CUTOVER_IMPORT_EXECUTION_JOIN_INVALID')
    }
    assertDataCutoverImportReceipt(existing.value, config, { releaseId, sourceRevision })
    if (existing.value.identityReceiptSha256 !== prepared.value.identityReceiptSha256 || existing.value.sourceCatalogSha256 !== prepared.value.sourceCatalogSha256 || existing.value.targetPreImportCatalogSha256 !== prepared.value.targetCatalogSha256 || existing.value.migrationPlanSha256 !== prepared.value.migrationPlanSha256 || existing.value.bundleSha256 !== exported.value.bundleSha256 || existing.value.bundleBytesSha256 !== exported.value.bundleBytesSha256) fail('DATA_CUTOVER_IMPORT_JOIN_INVALID')
    return existing
  }

  if (stage === 'teardown') {
    const existing = await optional(paths.teardown, 'receipts')
    if (existing) { assertDataCutoverTeardownReceipt(existing.value, config, { releaseId, sourceRevision }); return existing }
    const [prepared, exported, imported] = await Promise.all([read(input.prepareReceiptRef, 'receipts'), read(input.exportReceiptRef, 'source/migration-bundles'), read(input.importReceiptRef, 'receipts')])
    assertProviderPrepareReceipt(prepared.value, config, { releaseId, sourceRevision })
    assertDataCutoverExportReceipt(exported.value, config, { releaseId, sourceRevision })
    assertDataCutoverImportReceipt(imported.value, config, { releaseId, sourceRevision })
    const [sourceDeleted, targetDeleted] = await Promise.all([
      transport.deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'source' }),
      transport.deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'target' }),
    ])
    const access = await transport.cleanupTemporaryAccess(config, releaseId, sourceRevision, prepared.value.temporaryAccess)
    const receipt = selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-teardown-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceJobName: sourceDeleted.name, targetJobName: targetDeleted.name, sourceJobDeleted: sourceDeleted.deleted, targetJobDeleted: targetDeleted.deleted, sourceBucketAccessRemoved: access.status === 'REMOVED', crossProjectArtifactAccessRemoved: access.status === 'REMOVED', resourceResidue: 0, observedAt: transport.now(), status: 'PASS' })
    assertDataCutoverTeardownReceipt(receipt, config, { releaseId, sourceRevision })
    return transport.publishJson(paths.teardown, config, 'receipts', receipt)
  }

  if (stage === 'handoff') {
    const existing = await optional(paths.handoff, 'receipts')
    if (existing) { assertDataCutoverHandoff(existing.value, config, { releaseId, sourceRevision }); return existing }
    const [prepared, exported, imported, fencePatch, teardown] = await Promise.all([read(input.prepareReceiptRef, 'receipts'), read(input.exportReceiptRef, 'source/migration-bundles'), read(input.importReceiptRef, 'receipts'), read(input.fencePatchReceiptRef, 'receipts'), read(input.teardownReceiptRef, 'receipts')])
    assertProviderPrepareReceipt(prepared.value, config, { releaseId, sourceRevision })
    assertDataCutoverExportReceipt(exported.value, config, { releaseId, sourceRevision })
    assertDataCutoverImportReceipt(imported.value, config, { releaseId, sourceRevision })
    assertFencePatchReceipt(fencePatch.value, config, { releaseId, sourceRevision })
    assertDataCutoverTeardownReceipt(teardown.value, config, { releaseId, sourceRevision })
    if (exported.value.sourceCatalogSha256 !== prepared.value.sourceCatalogSha256 || imported.value.sourceCatalogSha256 !== prepared.value.sourceCatalogSha256 || imported.value.targetPreImportCatalogSha256 !== prepared.value.targetCatalogSha256 || imported.value.migrationPlanSha256 !== prepared.value.migrationPlanSha256) fail('DATA_CUTOVER_HANDOFF_PREPARE_JOIN_INVALID')
    let fenced = await optional(paths.fence, 'receipts')
    if (fenced) assertDataCutoverFenceReceipt(fenced.value, config, { releaseId, sourceRevision })
    else {
      const fenceReceipt = finalizeFenceReceipt({ config, fencePatchReceipt: fencePatch.value, exportReceipt: exported.value, observedAt: transport.now() })
      assertDataCutoverFenceReceipt(fenceReceipt, config, { releaseId, sourceRevision })
      fenced = await transport.publishJson(paths.fence, config, 'receipts', fenceReceipt)
    }
    const handoff = createDataCutoverHandoff({ config, releaseId, sourceRevision, identityReceiptSha256: prepared.value.identityReceiptSha256, exportReceiptRef: exported.ref, exportReceipt: exported.value, importReceiptRef: imported.ref, importReceipt: imported.value, fenceReceiptRef: fenced.ref, fenceReceipt: fenced.value, teardownReceiptRef: teardown.ref, teardownReceipt: teardown.value, observedAt: transport.now() })
    assertDataCutoverHandoff(handoff, config, { releaseId, sourceRevision })
    return transport.publishJson(paths.handoff, config, 'receipts', handoff)
  }

  if (stage === 'post-live-cleanup') {
    const existing = await optional(paths.postLiveCleanup, 'receipts')
    if (existing) { assertPostLiveCleanupReceipt(existing.value, config, { releaseId, sourceRevision }); return existing }
    const [handoffResult, terminalResult] = await Promise.all([read(input.handoffReceiptRef, 'receipts'), read(input.terminalReceiptRef, 'receipts')])
    if (handoffResult.ref.uri !== paths.handoff) fail('DATA_CUTOVER_HANDOFF_REF_INVALID')
    const handoff = assertDataCutoverHandoff(handoffResult.value, config, { releaseId, sourceRevision })
    const terminal = assertOwnerTerminalReceipt(terminalResult.value, { releaseId, sourceRevision })
    const exportedResult = await read(handoff.exportReceiptRef, 'source/migration-bundles')
    const exported = assertDataCutoverExportReceipt(exportedResult.value, config, { releaseId, sourceRevision })
    let raw = null
    try { raw = await transport.readRawObject(paths.bundle, config, 'source/migration-bundles') } catch (error) { if (error?.code !== 'MIGRATION_GCS_METADATA_FAILED' || !/:404$/u.test(error.message)) throw error }
    if (raw && (raw.generation !== exported.bundleGeneration || sha256(raw.bytes) !== exported.bundleBytesSha256)) fail('DATA_CUTOVER_POST_LIVE_BUNDLE_READBACK_INVALID')
    const deleted = await transport.deleteGcsObject({ uri: paths.bundle, expectedBucket: config.releaseBucket, expectedPrefix: 'source/migration-bundles', expectedGeneration: exported.bundleGeneration })
    if (!deleted.deleted) fail('DATA_CUTOVER_POST_LIVE_BUNDLE_DELETE_FAILED')
    const receipt = selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-post-live-cleanup-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, handoffReceiptRef: handoffResult.ref, handoffReceiptSha256: handoff.handoffSha256, terminalReceiptRef: terminalResult.ref, terminalReceiptSha256: terminal.receiptSha256, bundleRef: paths.bundle, bundleGeneration: exported.bundleGeneration, bundleBytesSha256: exported.bundleBytesSha256, rawBundleDeleted: true, retainedHashReceipts: true, resourceResidue: 0, releaseAuthority: true, observedAt: transport.now(), status: 'PASS' })
    assertPostLiveCleanupReceipt(receipt, config, { releaseId, sourceRevision })
    return transport.publishJson(paths.postLiveCleanup, config, 'receipts', receipt)
  }

  if (stage === 'restore') {
    const existing = await optional(paths.restore, 'receipts')
    if (existing) { assertRestoreReceipt(existing.value, config, { releaseId, sourceRevision }); return existing }
    const fencePatch = await read(input.fencePatchReceiptRef, 'receipts')
    assertFencePatchReceipt(fencePatch.value, config, { releaseId, sourceRevision })
    const before = await transport.getService(config)
    const beforeSnapshot = serviceSnapshot(config, before)
    if (beforeSnapshot.templateSha256 !== fencePatch.value.templateSha256 || beforeSnapshot.trafficSha256 !== fencePatch.value.trafficSha256) fail('DATA_CUTOVER_RESTORE_BASELINE_DRIFT')
    const after = beforeSnapshot.invokerIamDisabled ? before : await transport.setLegacyAccessFence(config, before, true)
    const afterSnapshot = serviceSnapshot(config, after)
    if (!afterSnapshot.invokerIamDisabled || afterSnapshot.templateSha256 !== fencePatch.value.templateSha256 || afterSnapshot.trafficSha256 !== fencePatch.value.trafficSha256) fail('DATA_CUTOVER_RESTORE_READBACK_INVALID')
    const receipt = selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-restore-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceService: config.source.service, updateMask: beforeSnapshot.invokerIamDisabled ? null : 'invokerIamDisabled', restoredAccess: true, templateDrift: 0, trafficDrift: 0, observedAt: transport.now(), status: 'PASS' })
    assertRestoreReceipt(receipt, config, { releaseId, sourceRevision })
    return transport.publishJson(paths.restore, config, 'receipts', receipt)
  }
  fail('DATA_CUTOVER_PROVIDER_STAGE_INVALID')
}

export function assertProviderRunInput(value, configInput) {
  const config = assertDataCutoverConfig(configInput)
  exactInputKeys(value, ['identityReceiptRef', 'infraReceiptRef', 'migrationRunnerDigest', 'deadlineAt', 'acknowledgements'])
  for (const name of ['identityReceiptRef', 'infraReceiptRef']) {
    const ref = value[name]
    if (!ref || canonicalize(Object.keys(ref).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(ref.sha256 ?? '')) fail('DATA_CUTOVER_PROVIDER_RUN_INPUT_INVALID', name)
  }
  if (!/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest ?? '') || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.deadlineAt) <= Date.now()) fail('DATA_CUTOVER_PROVIDER_RUN_INPUT_INVALID')
  if (canonicalize(value.acknowledgements) !== canonicalize(config.acknowledgements)) fail('DATA_CUTOVER_PROVIDER_RUN_ACKNOWLEDGEMENT_INVALID')
  return value
}

export function assertAbortCleanupReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  const core = { ...value }; delete core.receiptSha256
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'failureCode', 'legacyAccessRestored', 'restoreReceiptRef', 'sourceJobDeleted', 'targetJobDeleted', 'sourceBucketAccessRemoved', 'crossProjectArtifactAccessRemoved', 'resourceResidue', 'releaseAuthority', 'observedAt', 'status', 'receiptSha256']
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(exact.sort()) || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-abort-cleanup-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || typeof value.failureCode !== 'string' || value.failureCode.length < 3 || value.legacyAccessRestored !== true || value.sourceJobDeleted !== true || value.targetJobDeleted !== true || value.sourceBucketAccessRemoved !== true || value.crossProjectArtifactAccessRemoved !== true || value.resourceResidue !== 0 || value.releaseAuthority !== false || value.status !== 'RECOVERED_ABORT' || !Number.isFinite(Date.parse(value.observedAt)) || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_ABORT_CLEANUP_RECEIPT_INVALID')
  if (value.restoreReceiptRef !== null) {
    const paths = dataCutoverObjectPaths(config, value.releaseId)
    assertExactRef(value.restoreReceiptRef, paths.restore, 'DATA_CUTOVER_ABORT_CLEANUP_RECEIPT_INVALID')
  }
  return value
}

export function assertOwnerTerminalReceipt(value, expected = {}) {
  const core = { ...value }; delete core.receiptSha256
  if (!value || value.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.stage !== 'terminal' || value.status !== 'PASS' || value.facts?.result !== 'RELEASED' || value.facts?.databaseDisposition !== 'FORWARD_APPLIED' || value.facts?.remainingHumanAction !== 0 || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || !Number.isFinite(Date.parse(value.observedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_OWNER_TERMINAL_RECEIPT_INVALID')
  return value
}

export function assertPostLiveCleanupReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  const core = { ...value }; delete core.receiptSha256
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'handoffReceiptRef', 'handoffReceiptSha256', 'terminalReceiptRef', 'terminalReceiptSha256', 'bundleRef', 'bundleGeneration', 'bundleBytesSha256', 'rawBundleDeleted', 'retainedHashReceipts', 'resourceResidue', 'releaseAuthority', 'observedAt', 'status', 'receiptSha256']
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(exact.sort()) || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-post-live-cleanup-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || !RELEASE_ID.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '')) fail('DATA_CUTOVER_POST_LIVE_CLEANUP_RECEIPT_INVALID')
  const paths = dataCutoverObjectPaths(config, value.releaseId)
  if (value.bundleRef !== paths.bundle || !/^[1-9][0-9]*$/u.test(value.bundleGeneration ?? '') || !H64.test(value.handoffReceiptSha256 ?? '') || !H64.test(value.terminalReceiptSha256 ?? '') || !H64.test(value.bundleBytesSha256 ?? '') || value.rawBundleDeleted !== true || value.retainedHashReceipts !== true || value.resourceResidue !== 0 || value.releaseAuthority !== true || value.status !== 'PASS' || !Number.isFinite(Date.parse(value.observedAt)) || !H64.test(value.receiptSha256 ?? '') || sha256(canonicalize(core)) !== value.receiptSha256 || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_POST_LIVE_CLEANUP_RECEIPT_INVALID')
  for (const name of ['handoffReceiptRef', 'terminalReceiptRef']) if (!value[name] || canonicalize(Object.keys(value[name]).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(value[name].sha256 ?? '') || !value[name].uri.startsWith(`gs://${config.releaseBucket}/receipts/`)) fail('DATA_CUTOVER_POST_LIVE_CLEANUP_RECEIPT_INVALID')
  if (value.handoffReceiptRef.uri !== paths.handoff || !new RegExp(`^gs://${config.releaseBucket}/receipts/releases/${value.releaseId}/[a-f0-9]{64}/terminal\\.json$`, 'u').test(value.terminalReceiptRef.uri)) fail('DATA_CUTOVER_POST_LIVE_CLEANUP_RECEIPT_INVALID')
  return value
}

async function recoverProviderRun({ config, releaseId, sourceRevision, prepared, fenced, failureCode, transport }) {
  const paths = dataCutoverObjectPaths(config, releaseId)
  let existing = null
  try { existing = await transport.readJsonByUri(paths.abortCleanup, config, 'receipts') } catch (error) { if (error?.code !== 'MIGRATION_GCS_METADATA_FAILED' || !/:404$/u.test(error.message)) throw error }
  if (existing) {
    assertAbortCleanupReceipt(existing.value, config, { releaseId, sourceRevision })
    return existing
  }
  const failures = []
  let restoreReceiptRef = null
  if (fenced) {
    try {
      const restored = await executeProviderStage({ stage: 'restore', config, releaseId, sourceRevision, input: { acknowledgement: config.acknowledgements.restore, fencePatchReceiptRef: fenced.ref }, transport })
      restoreReceiptRef = restored.ref
    } catch (error) { failures.push(`restore:${error.code ?? error.message}`) }
  }
  let sourceDeleted = null
  let targetDeleted = null
  try { sourceDeleted = await transport.deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'source' }) } catch (error) { failures.push(`source-job:${error.code ?? error.message}`) }
  try { targetDeleted = await transport.deleteJob({ config, releaseId, sourceRevision, migrationRunnerDigest: prepared.value.migrationRunnerDigest, kind: 'target' }) } catch (error) { failures.push(`target-job:${error.code ?? error.message}`) }
  let access = null
  try { access = await transport.cleanupTemporaryAccess(config, releaseId, sourceRevision, prepared.value.temporaryAccess) } catch (error) { failures.push(`iam:${error.code ?? error.message}`) }
  if (failures.length > 0) fail('DATA_CUTOVER_RUN_RECOVERY_FAILED', `${failureCode}:${failures.join(',')}`)
  const receipt = selfHash({ schemaVersion: 'jenfu.dev012.ai-pdm-data-abort-cleanup-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, failureCode, legacyAccessRestored: true, restoreReceiptRef, sourceJobDeleted: sourceDeleted.deleted, targetJobDeleted: targetDeleted.deleted, sourceBucketAccessRemoved: access.status === 'REMOVED', crossProjectArtifactAccessRemoved: access.status === 'REMOVED', resourceResidue: 0, releaseAuthority: false, observedAt: transport.now(), status: 'RECOVERED_ABORT' })
  assertAbortCleanupReceipt(receipt, config, { releaseId, sourceRevision })
  return transport.publishJson(paths.abortCleanup, config, 'receipts', receipt)
}

export async function executeProviderRun({ config: configInput, releaseId, sourceRevision, input, transport }) {
  const config = assertDataCutoverConfig(configInput)
  assertProviderRunInput(input, config)
  const paths = dataCutoverObjectPaths(config, releaseId)
  try {
    const aborted = await transport.readJsonByUri(paths.abortCleanup, config, 'receipts')
    assertAbortCleanupReceipt(aborted.value, config, { releaseId, sourceRevision })
    fail('DATA_CUTOVER_RELEASE_ALREADY_ABORTED')
  } catch (error) {
    if (error?.code !== 'MIGRATION_GCS_METADATA_FAILED' || !/:404$/u.test(error.message)) throw error
  }
  try {
    const completed = await transport.readJsonByUri(paths.handoff, config, 'receipts')
    assertDataCutoverHandoff(completed.value, config, { releaseId, sourceRevision })
    return completed
  } catch (error) {
    if (error?.code !== 'MIGRATION_GCS_METADATA_FAILED' || !/:404$/u.test(error.message)) throw error
  }
  let prepared = null
  let fenced = null
  try {
    prepared = await executeProviderStage({ stage: 'prepare', config, releaseId, sourceRevision, input: { identityReceiptRef: input.identityReceiptRef, infraReceiptRef: input.infraReceiptRef, migrationRunnerDigest: input.migrationRunnerDigest, deadlineAt: input.deadlineAt }, transport })
    fenced = await executeProviderStage({ stage: 'fence', config, releaseId, sourceRevision, input: { acknowledgement: input.acknowledgements.fence, prepareReceiptRef: prepared.ref }, transport })
    const exported = await executeProviderStage({ stage: 'export', config, releaseId, sourceRevision, input: { acknowledgement: input.acknowledgements.export, prepareReceiptRef: prepared.ref, fencePatchReceiptRef: fenced.ref, deadlineAt: input.deadlineAt }, transport })
    const imported = await executeProviderStage({ stage: 'import', config, releaseId, sourceRevision, input: { acknowledgement: input.acknowledgements.import, prepareReceiptRef: prepared.ref, exportReceiptRef: exported.ref, deadlineAt: input.deadlineAt }, transport })
    const teardown = await executeProviderStage({ stage: 'teardown', config, releaseId, sourceRevision, input: { prepareReceiptRef: prepared.ref, exportReceiptRef: exported.ref, importReceiptRef: imported.ref }, transport })
    return executeProviderStage({ stage: 'handoff', config, releaseId, sourceRevision, input: { prepareReceiptRef: prepared.ref, exportReceiptRef: exported.ref, importReceiptRef: imported.ref, fencePatchReceiptRef: fenced.ref, teardownReceiptRef: teardown.ref }, transport })
  } catch (error) {
    if (prepared) await recoverProviderRun({ config, releaseId, sourceRevision, prepared, fenced, failureCode: error.code ?? 'DATA_CUTOVER_RUN_FAILED', transport })
    throw error
  }
}
