import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDev117ArtifactReceipt,
  assertDev117CandidateReceipt,
  assertDev117Level4Join,
  assertDev117AppReleaseReceipt
} from './dev117-ai-pdm-independent-release.mjs'
import { assertDev116R02Receipt } from './dev116-r02-receipt.mjs'
import { createMigrationBundle } from './dev012-production-migration-runner.mjs'
import { assertPrincipalOnlyRecoveryBinding } from './dev121-principal-only-release.mjs'
import { assertOpenSwxWorkerRef } from './dev122-openswx-owner-release.mjs'
import { buildAiPdmPackage, deriveAiPdmMigration } from '../dev010-n1c-ai-pdm-package.mjs'

const H40 = /^[a-f0-9]{40}$/
const H64 = /^[a-f0-9]{64}$/
const V3_CONTRACT_SHA256 = '857f8a94ab13f63071156f85e76e5c675b348588b1126c147e0e54b431b6e8c5'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const LEGACY_STRICT_VALIDATORS = Object.freeze({ assertDev117ArtifactReceipt, assertDev117CandidateReceipt, assertDev117Level4Join, assertDev117AppReleaseReceipt, assertDev116R02Receipt })
function fail(code, message) { const error = new Error(message); error.code = code; throw error }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

export function assertDev117ReleaseIntent(value, profile) {
  const expected = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (value?.baselineIntentRef) expected.push('baselineIntentRef')
  if (value?.principalOnlyFenceRef) expected.push('principalOnlyFenceRef')
  if (value?.principalOnlyRecovery) expected.push('principalOnlyRecovery')
  if (Object.hasOwn(value ?? {}, 'openswxWorkerRef')) { expected.push('openswxWorkerRef'); assertOpenSwxWorkerRef(value.openswxWorkerRef) }
  expected.sort()
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected) || value.schemaVersion !== profile.schemas.releaseIntent || value.ownerApplicationId !== 'ai-pdm' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '') || !H64.test(value.sourceSha256 ?? '') || !H64.test(value.migrationManifestSha256 ?? '') || !value.previousRevision || value.previousRevision === 'latest' || !Number.isFinite(Date.parse(value.deadlineAt))) fail('RELEASE_INTENT_INVALID', 'AI-PDM release intent invalid')
  for (const name of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) if (!new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`).test(value[name]?.uri ?? '') || !H64.test(value[name]?.sha256 ?? '') || JSON.stringify(Object.keys(value[name] ?? {}).sort()) !== JSON.stringify(['sha256', 'uri'])) fail('RELEASE_INTENT_REF_INVALID', name)
  if (value.baselineIntentRef && (!new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`).test(value.baselineIntentRef.uri ?? '') || !H64.test(value.baselineIntentRef.sha256 ?? '') || JSON.stringify(Object.keys(value.baselineIntentRef).sort()) !== JSON.stringify(['sha256', 'uri']))) fail('RELEASE_INTENT_REF_INVALID', 'baselineIntentRef')
  if (value.principalOnlyFenceRef && (!new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/[A-Za-z0-9._/-]+\\.json$`).test(value.principalOnlyFenceRef.uri ?? '') || !H64.test(value.principalOnlyFenceRef.sha256 ?? '') || JSON.stringify(Object.keys(value.principalOnlyFenceRef).sort()) !== JSON.stringify(['sha256', 'uri']))) fail('RELEASE_INTENT_REF_INVALID', 'principalOnlyFenceRef')
  assertPrincipalOnlyRecoveryBinding(value, profile.artifact.releaseBucket)
  return value
}

export function assertDev117V3Profile(profile, v1, n1c) {
  if (profile?.schemaVersion !== 'jenfu.dev117.ai-pdm-continuous-release.v3' || profile.profileVersion !== 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP' || profile.contractSha256 !== V3_CONTRACT_SHA256) fail('UNSUPPORTED_PROFILE', 'Continuous v3 profile mismatch')
  if (profile.application?.id !== 'ai-pdm' || profile.application?.repository !== 'jedchang0308-jenfu/AI-PDM' || profile.application?.branch !== 'main') fail('SOURCE_SCOPE_MISMATCH', 'AI-PDM source scope mismatch')
  const target = profile.target || {}
  if (target.projectId !== 'jenfu-platform-prod' || target.projectNumber !== '9536592944' || target.region !== 'asia-east1' || target.serviceName !== 'ai-pdm-prod' || target.canonicalOrigin !== 'https://ai-pdm-prod-9536592944.asia-east1.run.app' || target.database !== 'jenfu_prod' || JSON.stringify(target.entryPolicy) !== JSON.stringify({ ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true })) fail('TARGET_MISMATCH', 'AI-PDM target mismatch')
  const runtime = profile.runtime || {}
  if (runtime.containerName !== 'ai-pdm' || runtime.cpu !== '1' || runtime.memory !== '1Gi' || runtime.port !== 8080 || runtime.concurrency !== 20 || runtime.timeoutSeconds !== 60 || runtime.maxInstances !== 1 || runtime.poolMax !== 8 || runtime.startupProbePath !== '/login' || runtime.cloudSqlConnectionName !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' || runtime.cloudSqlProxyContainer !== 'cloud-sql-proxy' || runtime.cloudSqlProxyImage !== 'gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f' || runtime.cloudSqlProxyPort !== 5432 || runtime.cloudSqlProxyMaximumConnections !== 24 || runtime.network !== 'jenfu-platform-prod-vpc' || runtime.subnet !== 'jenfu-platform-prod-runtime' || profile.artifact?.releaseBucket !== 'jenfu-platform-prod-aipdm-release' || profile.state?.backendKey !== 'dev-117/production-release/default.tfstate') fail('RUNTIME_OR_STATE_MISMATCH', 'AI-PDM runtime or state mismatch')
  if (profile.identities?.smoke !== 'aipdm-prod-smoke@jenfu-platform-prod.iam.gserviceaccount.com') fail('RUNTIME_OR_STATE_MISMATCH', 'AI-PDM smoke identity mismatch')
  if (profile.schemas?.releaseIntent !== 'jenfu.dev117.ai-pdm-release-intent.v2' || profile.schemas?.deploymentCapsule !== 'jenfu.dev117.ai-pdm-deployment-capsule.v2') fail('SCHEMA_PROFILE_MISMATCH', 'AI-PDM release/deployment capsule schema mismatch')
  if (profile.workflow?.onlyInput !== 'releaseCapsuleRef' || profile.workflow?.concurrency !== 'production-release-ai-pdm-prod') fail('WORKFLOW_CONTRACT_MISMATCH', 'AI-PDM workflow is not single-capsule')
  if (JSON.stringify(profile.workflow.jobs) !== JSON.stringify(['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'])) fail('WORKFLOW_CONTRACT_MISMATCH', 'AI-PDM workflow stage order mismatch')
  if (profile.artifact?.migrationRunnerUri !== 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner' || profile.artifact?.migrationBundlePrefix !== 'source/migration-bundles') fail('MIGRATION_ARTIFACT_MISMATCH', 'AI-PDM migration runner/bundle mismatch')
  if (profile.build?.dockerBuilderImage !== 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c' || profile.build?.dockerfile !== 'Dockerfile' || profile.build?.dockerTarget !== 'runner' || profile.build?.sourceArchiveFormat !== 'tar.gz' || profile.build?.requestedVerifyOption !== 'VERIFIED' || profile.build?.maximumAllowedSeverity !== 'MEDIUM' || !Number.isFinite(Date.parse(profile.build?.builderDigestObservedAt))) fail('BUILD_PROFILE_MISMATCH', 'AI-PDM build provenance profile mismatch')
  if (profile.verification?.refreshTokenEnvironmentName !== 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN' || profile.verification?.firebaseApiKeyEnvironmentName !== 'DEV012_AIPDM_FIREBASE_API_KEY' || profile.verification?.authModePath !== '/api/auth/mode' || profile.verification?.sessionPath !== '/api/auth/jenfu-sso/start' || profile.verification?.mePath !== '/api/auth/me' || profile.verification?.logoutPath !== '/api/auth/logout' || profile.verification?.authenticatedProbes?.length !== 1 || profile.verification?.negativeProbes?.length !== 1) fail('VERIFICATION_PROFILE_MISMATCH', 'AI-PDM automated normal-entry profile mismatch')
  if (profile.verification?.candidateSmokeMode !== 'GITHUB_PRINCIPAL_SSO_V1' || profile.verification?.brokerOrigin !== 'https://jenfu-platform-prod-9536592944.asia-east1.run.app' || profile.verification?.candidateWorkflowName !== undefined || profile.verification?.candidateRefreshTokenSecretId !== undefined) fail('VERIFICATION_PROFILE_MISMATCH', 'AI-PDM Principal candidate-smoke profile mismatch')
  if (profile.incidentRuntime?.controllerAudience !== 'https://release-controller.jenfu.internal/aipdm' || profile.incidentRuntime?.githubReadTokenSecretId !== 'aipdm-prod-controller-github-read-token' || profile.incidentRuntime?.numericSecretVersionRequired !== true || profile.incidentRuntime?.activeControlObject !== 'control/active.json') fail('INCIDENT_RUNTIME_PROFILE_MISMATCH', 'AI-PDM abort controller profile mismatch')
  if (profile.migrations?.jobName !== 'ai-pdm-prod-migration-runner' || profile.migrations?.serviceAccount !== 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' || profile.migrations?.baselineCount !== 15) fail('MIGRATION_JOB_MISMATCH', 'AI-PDM migration job mismatch')
  const integrationPlain = ['PDM_STORAGE_PROVIDER', 'PDM_GCS_PROJECT_ID', 'PDM_GCS_BUCKET', 'PDM_GCS_LIVE_ENABLED', 'PDM_WORKBENCH_AUTHORITY_COMMIT', 'PDM_JENFU_PLATFORM_AUTH_MODE', 'PDM_JENFU_ENTITLEMENT_MODE', 'JENFU_FIREBASE_PROJECT_ID', 'JENFU_IDENTITY_ISSUER', 'JENFU_IDENTITY_AUDIENCE', 'PDM_JENFU_SSO_HANDOFF_MODE', 'PDM_JENFU_SSO_BROKER_ORIGIN']
  const settingsPlain = ['PDM_SETTINGS_SECRET_PROVIDER', 'PDM_GCP_PROJECT_ID', 'PDM_GCP_EXPECTED_PROJECT_NUMBER', 'PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID', 'PDM_ENABLE_GCP_SECRET_READS', 'PDM_ENABLE_GCP_SECRET_WRITES']
  const expectedPlain = [...v1.environment.requiredPlainEnvironmentNames.filter((name) => !['PDM_CANDIDATE_CLOUD_RUN_SERVICE', 'PDM_CANDIDATE_CLOUD_RUN_TAG'].includes(name)), ...integrationPlain, ...settingsPlain]
  const expectedSecrets = [...v1.environment.requiredSecretEnvironmentNames, 'PDM_WORKLOAD_AUTH_CREDENTIALS']
  if (profile.environment.optionalExtensions != null && JSON.stringify(profile.environment.optionalExtensions) !== JSON.stringify({ openswxDispatch: { name: 'PDM_OPENSWX_DISPATCH_ENABLED', off: '0', on: '1', binding: 'openswxWorkerRef' } })) fail('OPENSWX_RUNTIME_EXTENSION_INVALID')
  const expectedSecretIds = { ...v1.environment.allowedSecretReferences, PDM_WORKLOAD_AUTH_CREDENTIALS: 'aipdm-prod-workload-auth-credentials' }
  if (JSON.stringify([...profile.environment.requiredPlainEnvironmentNames].sort()) !== JSON.stringify([...expectedPlain].sort()) || JSON.stringify([...profile.environment.requiredSecretNames].sort()) !== JSON.stringify([...expectedSecrets].sort())) fail('ENVIRONMENT_SET_DRIFT', 'V3 environment set must preserve owner integration and workload bindings')
  if (JSON.stringify(Object.entries(profile.environment.allowedSecretIds ?? {}).sort()) !== JSON.stringify(Object.entries(expectedSecretIds).sort())) fail('WORKLOAD_SECRET_BINDING_DRIFT', 'V3 requires its own workload credential Secret; session secrets are not worker credentials')
  const fixed = profile.environment.fixedValues || {}
  if (profile.environment.candidateOriginEnvironmentName !== 'PDM_RELEASE_CANDIDATE_ORIGIN'
    || fixed.PDM_PUBLIC_BASE_URL !== target.canonicalOrigin
    || fixed.PDM_SESSION_ISSUER !== target.canonicalOrigin
    || fixed.PDM_AUTH_MODE !== 'firebase_bff'
    || fixed.PDM_JENFU_PLATFORM_AUTH_MODE !== 'on'
    || fixed.PDM_JENFU_ENTITLEMENT_MODE !== 'enforce'
    || fixed.PDM_WORKBENCH_AUTHORITY_COMMIT !== '91de3a65df58dc60ddde88aab5263e9470a84565'
    || fixed.PDM_DB_PROVIDER !== 'cloud_sql_postgres'
    || fixed.PDM_STORAGE_PROVIDER !== 'google_cloud_storage'
    || fixed.PDM_GCS_PROJECT_ID !== target.projectId
    || fixed.PDM_GCS_BUCKET !== 'jenfu-platform-prod-aipdm-files'
    || fixed.PDM_GCS_LIVE_ENABLED !== '1'
    || fixed.PDM_SETTINGS_SECRET_PROVIDER !== 'google_secret_manager'
    || fixed.PDM_GCP_PROJECT_ID !== target.projectId
    || fixed.PDM_GCP_EXPECTED_PROJECT_NUMBER !== target.projectNumber
    || fixed.PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID !== 'aipdm-prod-solidworks-document-manager-key'
    || fixed.PDM_ENABLE_GCP_SECRET_READS !== 'true'
    || fixed.PDM_ENABLE_GCP_SECRET_WRITES !== 'true'
    || fixed.JENFU_FIREBASE_PROJECT_ID !== target.projectId
    || fixed.JENFU_IDENTITY_ISSUER !== `https://securetoken.google.com/${target.projectId}`
    || fixed.JENFU_IDENTITY_AUDIENCE !== target.projectId
    || fixed.PDM_FIREBASE_PROJECT_ID !== target.projectId
    || fixed.PDM_JENFU_SSO_BROKER_ORIGIN !== 'https://jenfu-platform-prod-9536592944.asia-east1.run.app') fail('ENVIRONMENT_VALUE_DRIFT', 'AI-PDM production identity, entitlement, database, SSO guard or direct-origin environment mismatch')
  if (JSON.stringify(profile.environment.controlledValues) !== JSON.stringify({ PDM_JENFU_SSO_HANDOFF_MODE: { defaultValue: 'off', allowedValues: ['off', 'on'] } })) fail('ENVIRONMENT_VALUE_DRIFT', 'AI-PDM SSO mode transition contract mismatch')
  if (profile.operations?.CONFIGURE_ENTRYPOINT !== 'run.projects.locations.services.patch?updateMask=ingress,defaultUriDisabled,invokerIamDisabled') fail('ENTRYPOINT_OPERATION_MISSING', 'AI-PDM entrypoint mutation is not exact')
  const expectedDataCutover = { gateMode: 'CUTOVER_OR_LIVE_AUTHORITY', handoffSchema: 'jenfu.dev012.ai-pdm-data-cutover-handoff.v1', importReceiptSchema: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', fenceReceiptSchema: 'jenfu.dev012.ai-pdm-data-fence-receipt.v1', teardownReceiptSchema: 'jenfu.dev012.ai-pdm-data-teardown-receipt.v1', postLiveCleanupReceiptSchema: 'jenfu.dev012.ai-pdm-data-post-live-cleanup-receipt.v1', completionReceiptSchema: 'jenfu.dev012.ai-pdm-data-post-live-cleanup-receipt.v1', postLiveCleanupRequired: true, sourceProjectId: 'jenfu-ai-pdm-prod', sourceDatabase: 'ai_pdm', targetProjectId: 'jenfu-platform-prod', targetDatabase: 'jenfu_prod', targetSchema: 'ai_pdm_core', copyTableCount: 151 }
  if (JSON.stringify(profile.dataCutover) !== JSON.stringify(expectedDataCutover)) fail('DATA_CUTOVER_PROFILE_MISMATCH', 'AI-PDM candidate must consume the one-time production data handoff')
  if (JSON.stringify(profile.edge) !== JSON.stringify({ servingDependency: false, rollbackDependency: false, ordinaryReleaseMutations: 0, disposition: 'RETAINED_UNUSED_EDGE' })) fail('EDGE_BOUNDARY_DRIFT', 'AI-PDM ordinary release must not depend on edge resources')
  const order = profile.migrations?.entries?.map((entry) => entry.path)
  const baselineOrder = n1c.migration.order
  const additions = order?.slice(baselineOrder.length)
  if (!Array.isArray(order) || order.length < baselineOrder.length || JSON.stringify(order.slice(0, baselineOrder.length)) !== JSON.stringify(baselineOrder) || profile.migrations.baselineCount !== baselineOrder.length || profile.migrations.sourceTraceOnly !== n1c.migration.sourceTraceOnly || profile.migrations.foldedVersions !== n1c.migration.foldedVersions || JSON.stringify(profile.migrations.retiredVersions) !== JSON.stringify(n1c.migration.retiredVersions) || profile.migrations.ledger !== n1c.migration.ledger) fail('MIGRATION_MANIFEST_DRIFT', 'AI-PDM historical migration prefix drifted from N1C')
  let lastVersion = Number(path.basename(baselineOrder.at(-1)).slice(0, 3))
  for (const addition of additions) {
    const version = Number(/^db\/postgres\/(\d{3})_[a-z0-9_]+\.sql$/u.exec(addition)?.[1])
    if (!Number.isInteger(version) || version <= lastVersion) fail('MIGRATION_MANIFEST_DRIFT', 'AI-PDM owner migration suffix must be forward-only')
    lastVersion = version
  }
  if (profile.migrations.entries.some((entry, index) => entry.order !== index + 1 || !H64.test(entry.sha256))) fail('MIGRATION_MANIFEST_DRIFT', 'AI-PDM migration order/checksum invalid')
  if (Object.values(profile.sideEffects).some((value) => value !== 'DISABLED')) fail('SIDE_EFFECT_ENABLED', 'Side effects must remain disabled before authorization')
  return profile
}

export function verifyDev117MigrationBytes(profile, files) {
  if (files.size !== profile.migrations.entries.length) fail('MIGRATION_SET_DRIFT', 'Migration file set must match the owner profile')
  for (const entry of profile.migrations.entries) if (!files.has(entry.path) || sha256(files.get(entry.path)) !== entry.sha256) fail('MIGRATION_CHECKSUM_MISMATCH', entry.path)
  return true
}

export function buildDev117MigrationPackage(profile, n1c) {
  const baseline = buildAiPdmPackage(n1c)
  const additions = profile.migrations.entries.slice(baseline.entries.length).map((entry) => {
    const source = fs.readFileSync(path.join(root, ...entry.path.split('/')))
    const derived = deriveAiPdmMigration(entry.path, source, n1c)
    if (sha256(source) !== entry.sha256 || derived.output.includes('ai_pdm_legacy_stage')) fail('MIGRATION_PACKAGE_INVALID', entry.path)
    return {
      version: `ai-pdm-${path.basename(entry.path).slice(0, 3)}`,
      name: path.basename(entry.path, '.sql').slice(4),
      sourcePath: entry.path,
      sourceSha256: entry.sha256,
      outputSha256: sha256(derived.output),
      sql: derived.output,
    }
  })
  return { entries: [...baseline.entries, ...additions] }
}

export function buildDev117MigrationBundle(profile, packageValue, sourceRevision) {
  if (!Array.isArray(packageValue?.entries) || packageValue.entries.length !== profile.migrations.entries.length) fail('MIGRATION_PACKAGE_INVALID', 'AI-PDM package entries invalid')
  const entries = profile.migrations.entries.map((authority, index) => {
    const item = packageValue.entries[index]
    if (item.sourcePath !== authority.path || item.sourceSha256 !== authority.sha256 || !H64.test(item.outputSha256 ?? '') || typeof item.sql !== 'string' || sha256(item.sql) !== item.outputSha256) fail('MIGRATION_PACKAGE_INVALID', authority.path)
    return { order: authority.order, version: item.version, name: item.name, path: authority.path, sourceSha256: item.sourceSha256, appliedSha256: item.outputSha256, sqlBase64: Buffer.from(item.sql, 'utf8').toString('base64') }
  })
  return createMigrationBundle({ target: { ownerApplicationId: 'ai-pdm', ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount }, sourceRevision, entries })
}

export function assertDev117WorkflowSource(source) {
  source = source.replaceAll('\r\n', '\n')
  const jobBlocks = Object.fromEntries([...source.matchAll(/\n  ([a-z][a-z-]+):\n([\s\S]*?)(?=\n  [a-z][a-z-]+:\n|$)/gu)].map((match) => [match[1], match[2]]))
  const proofReaderStages = { prepare: { actor: 'verifier', stage: 'prepare' }, migrate: { actor: 'deployer', stage: 'migrate' }, candidate: { actor: 'deployer', stage: 'candidate' }, verify: { actor: 'verifier', stage: 'verify' }, finalize: { actor: 'deployer', stage: 'finalize' }, failure: { actor: 'deployer', stage: 'rollback' } }
  const builderReadTokenBinding = 'AIPDM_OWNER_PROOF_BUILDER_READ_TOKEN: "${{ steps.proof_builder_read_auth.outputs.access_token }}"'
  const inputBlock = source.match(/workflow_dispatch:[^\S\r\n]*\r?\n\s*inputs:[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\s*concurrency:/)?.[1] || ''
  const keys = [...inputBlock.matchAll(/^\s{6}([A-Za-z0-9_-]+):/gm)].map((match) => match[1])
  if (JSON.stringify(keys) !== JSON.stringify(['releaseCapsuleRef', 'executionMode'])) fail('WORKFLOW_INPUT_DRIFT', 'Workflow accepts one capsule and a bounded execution mode')
  if (!source.includes('default: full_release') || !source.includes('options: [full_release, build_only]')
    || !source.includes('case "$EXECUTION_MODE" in full_release|build_only) ;; *) exit 1 ;; esac')
    || !source.includes("  migrate:\n    if: ${{ inputs.executionMode == 'full_release' }}\n    needs: [prepare, build]")
    || !source.includes("if: ${{ always() && inputs.executionMode == 'full_release' && needs.prepare.result == 'success' && contains(needs.*.result, 'failure') }}")) fail('WORKFLOW_BUILD_ONLY_BOUNDARY_DRIFT', 'Artifact preparation must not migrate, create candidates or roll back')
  for (const forbidden of ['product_owner_decision:', 'artifact_receipt_ref:', 'candidate_receipt_ref:', 'level4_receipt_ref:', 'stage:']) if (source.includes(forbidden)) fail('HISTORICAL_INPUT_ACTIVE', `Forbidden v1 workflow input ${forbidden}`)
  if (!source.includes('group: production-release-ai-pdm-prod')) fail('WORKFLOW_CONCURRENCY_DRIFT', 'Concurrency must be service-wide')
  for (const job of ['prepare:', 'build:', 'migrate:', 'candidate:', 'entrypoint:', 'verify:', 'decision:', 'activate:', 'canonical:', 'finalize:', 'failure:']) if (!source.includes(`\n  ${job}`)) fail('WORKFLOW_JOB_MISSING', job)
  if (!/\n  failure:[\s\S]*?needs:\s*\[prepare, build, migrate, candidate, entrypoint, verify, decision, activate, canonical, finalize\]/u.test(source)) fail('OPENSWX_FINALIZE_FAILURE_WIRING_MISSING')
  if (/CAPSULE_PROVIDER_FETCH_REQUIRED|run:\s*echo\s/iu.test(source)) fail('PROVIDER_PLACEHOLDER_ACTIVE', 'Workflow contains a provider placeholder')
  if ((source.match(/^    environment: production$/gmu) ?? []).length !== 11 || (source.match(/DEV012_AIPDM_FIREBASE_REFRESH_TOKEN:/gu) ?? []).length !== 2 || (source.match(/DEV012_AIPDM_FIREBASE_API_KEY:/gu) ?? []).length !== 2 || source.includes('DEV012_AIPDM_FIREBASE_ID_TOKEN')) fail('WORKFLOW_AUTH_PREFLIGHT_DRIFT', 'Protected environment or refresh-token smoke binding drifted')
  for (const [job, { actor, stage }] of Object.entries(proofReaderStages)) {
    const block = jobBlocks[job] ?? ''
    const steps = block.split(/\n      - /u).slice(1).map((value) => `\n      - ${value}`)
    const executeSteps = steps.filter((value) => value.includes(`run: node scripts/dev117-ai-pdm-continuous-release.mjs --stage ${stage} `))
    const primaryAuthBlock = block.match(/\n      - id: auth\n([\s\S]*?)(?=\n      - )/u)?.[1] ?? ''
    const builderReadAuthBlock = block.match(/\n      - id: proof_builder_read_auth\n([\s\S]*?)(?=\n      - )/u)?.[1] ?? ''
    if ((block.match(/google-github-actions\/auth@v3/gu) ?? []).length !== 2
      || executeSteps.length !== 1
      || !primaryAuthBlock.includes(`service_account: aipdm-prod-${actor}@jenfu-platform-prod.iam.gserviceaccount.com`)
      || !builderReadAuthBlock.includes('service_account: aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com')
      || !builderReadAuthBlock.includes('export_environment_variables: false')
      || !executeSteps[0]?.includes('GOOGLE_OAUTH_ACCESS_TOKEN: "${{ steps.auth.outputs.access_token }}"')
      || !executeSteps[0]?.includes(builderReadTokenBinding)
      || steps.filter((value) => value.includes(builderReadTokenBinding)).length !== 1) fail('WORKFLOW_PROOF_READBACK_AUTH_DRIFT', `Protected ${job} proof reader must keep primary authority separate and pass its exact builder GET token only to stage ${stage}`)
  }
  for (const job of ['build', 'entrypoint', 'decision', 'activate', 'canonical']) {
    const block = jobBlocks[job] ?? ''
    if (block.includes('proof_builder_read_auth') || block.includes('AIPDM_OWNER_PROOF_BUILDER_READ_TOKEN:')) fail('WORKFLOW_PROOF_READBACK_AUTH_DRIFT', `Protected ${job} must not receive a secondary builder token`)
  }
  if ((source.match(/AIPDM_OWNER_PROOF_BUILDER_READ_TOKEN:/gu) ?? []).length !== 6
    || (source.match(/proof_builder_read_auth/gu) ?? []).length !== 12
    || (source.match(/export_environment_variables: false/gu) ?? []).length !== 6) fail('WORKFLOW_PROOF_READBACK_AUTH_DRIFT', 'Secondary builder proof authority must be limited to the six stages that revalidate Build/Image evidence')
  for (const block of source.split(/^  (?=[a-z][a-z-]+:)/gmu).filter((value) => value.includes('google-github-actions/auth@v3'))) if (block.indexOf('actions/checkout@v4') < 0 || block.indexOf('actions/checkout@v4') > block.indexOf('google-github-actions/auth@v3')) fail('WORKFLOW_AUTH_ORDER_DRIFT', 'Checkout must precede WIF authentication')
  if (/\.\.\/Jenfu-Platform|\.\.\/OrgMaster|checkout[^\n]+repository:/i.test(source)) fail('SIBLING_CHECKOUT_DENIED', 'Workflow references sibling source')
  return true
}

export function assertDev121MigrationOnlyWorkflowSource(source, workloadIdentitySource) {
  const inputBlock = source.match(/workflow_dispatch:[^\S\r\n]*\r?\n\s*inputs:[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\s*concurrency:/)?.[1] || ''
  const inputs = [...inputBlock.matchAll(/^\s{6}([A-Za-z0-9_-]+):/gm)].map((match) => match[1])
  const jobs = [...source.matchAll(/^  ([a-z][a-z-]+):\s*$/gm)].map((match) => match[1])
  const stages = [...source.matchAll(/scripts\/dev117-ai-pdm-continuous-release\.mjs --stage ([a-z]+) --capsule-ref "\$\{\{ steps\.bind\.outputs\.capsule_uri \}\}" --capsule-sha256 "\$\{\{ steps\.bind\.outputs\.capsule_sha256 \}\}"/g)].map((match) => match[1])
  if (JSON.stringify(inputs) !== JSON.stringify(['releaseCapsuleRef']) ||
      JSON.stringify(jobs) !== JSON.stringify(['migrate']) ||
      JSON.stringify(stages) !== JSON.stringify(['prepare', 'build', 'migrate']) ||
      (source.match(/^        run:/gm) ?? []).length !== 5 ||
      (source.match(/^      - run:/gm) ?? []).length !== 2 ||
      !source.includes('permissions: { contents: read, pull-requests: read, id-token: write }') ||
      !source.includes('run: node scripts/dev012-verify-official-source.mjs') ||
      (source.match(/^    environment: production$/gm) ?? []).length !== 1 ||
      !source.includes('group: production-release-ai-pdm-prod') ||
      !source.includes('cancel-in-progress: false') ||
      source.includes('continue-on-error:') ||
      /\b(?:gcloud|terraform|psql|curl)\b/iu.test(source)) fail('MIGRATION_ONLY_WORKFLOW_DRIFT', 'Migration-only workflow must stop after migrate')
  for (const [step, identity] of [['verifier_auth', 'verifier'], ['builder_auth', 'builder'], ['deployer_auth', 'deployer']]) {
    if (!source.includes(`- id: ${step}`) || !source.includes(`service_account: aipdm-prod-${identity}@jenfu-platform-prod.iam.gserviceaccount.com`) ||
        !source.includes(`GOOGLE_OAUTH_ACCESS_TOKEN: "\${{ steps.${step}.outputs.access_token }}"`)) fail('MIGRATION_ONLY_IDENTITY_DRIFT', step)
  }
  const expectedCondition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_repository_owner_id}' && (assertion.workflow_ref == '${local.github_workflow_ref}' || assertion.workflow_ref == '${local.github_principal_migration_ref}') && assertion.environment == 'production' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'workflow_dispatch'"
  const observedCondition = workloadIdentitySource.match(/^  attribute_condition = "([^"]+)"$/m)?.[1]
  if (observedCondition !== expectedCondition) fail('MIGRATION_ONLY_WIF_DRIFT', 'Migration-only workflow WIF binding drifted')
  return true
}

export function buildDev117Mutation({ operation, service, updateMask, revision, trafficPercent, etag }) {
  if (service !== 'ai-pdm-prod' || !etag || revision === 'latest') fail('TARGET_MISMATCH', 'AI-PDM mutation target invalid')
  if (operation === 'CREATE_CANDIDATE' && (updateMask !== 'template' || trafficPercent !== 0)) fail('MIXED_MUTATION_MASK', 'Candidate must be template-only and zero traffic')
  if (operation === 'CONFIGURE_ENTRYPOINT' && (updateMask !== 'ingress,defaultUriDisabled,invokerIamDisabled' || revision != null || trafficPercent != null)) fail('MIXED_MUTATION_MASK', 'Entrypoint must use the exact three-field mask')
  if (['ACTIVATE', 'ROLLBACK'].includes(operation) && updateMask !== 'traffic') fail('MIXED_MUTATION_MASK', 'Activation/rollback must be traffic-only')
  return { operation, service, updateMask, revision, trafficPercent, etag }
}

export function buildDev117CandidateTag({ service, revision, tag, beforeTraffic, etag }) {
  if (service !== 'ai-pdm-prod' || !/^ai-pdm-prod-[a-z0-9-]+$/.test(revision || '') || !/^candidate-[a-f0-9]{12}$/.test(tag || '') || !etag || !Array.isArray(beforeTraffic) || beforeTraffic.some((row) => row.latestRevision === true || row.tag)) fail('CANDIDATE_TAG_INVALID', 'AI-PDM candidate tag invalid')
  return { operation: 'TAG_CANDIDATE', service, updateMask: 'traffic', etag, traffic: [...beforeTraffic, { revision, percent: 0, tag, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }] }
}

export function assertDev117NativeJoin(value, profile) {
  const exact = ['sourceLock', 'artifact', 'candidate', 'dev116R02', 'machineDecision', 'activation', 'canonical']
  if (!value || JSON.stringify(Object.keys(value)) !== JSON.stringify(exact)) fail('NATIVE_JOIN_KEYS', 'Native join keys/order mismatch')
  if (value.dev116R02.schemaVersion !== profile.dependencies.dev116ReceiptSchema || value.candidate.revision !== value.dev116R02.candidateRevision || value.activation.revision !== value.candidate.revision || value.canonical.revision !== value.candidate.revision) fail('NATIVE_JOIN_MISMATCH', 'DEV-116/candidate/activation/canonical do not join')
  if (value.sourceLock.environment !== 'production' || value.artifact.evidenceScope === 'LOCAL_SYNTHETIC') fail('UNTRUSTED_EVIDENCE', 'Synthetic evidence cannot pass native join')
  return true
}
