import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Dev128Provider, validateJob } from './dev128-masked-local-snapshot-provider.mjs'
import { recipientKeyIdForPublicKey } from './lib/dev128-masked-local-snapshot.mjs'

const config = JSON.parse(await readFile(new URL('../config/release/dev128-masked-local-production-snapshot.json', import.meta.url), 'utf8'))
const sourceRevision = 'a'.repeat(40)
const snapshotId = 'PDM-MASKED-20261107-987601'
const imageDigest = `${config.image.repository}@sha256:${'b'.repeat(64)}`
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const publicKeyB64 = Buffer.from(publicKeyPem).toString('base64')
const recipientKeyId = recipientKeyIdForPublicKey(publicKeyPem)
const now = Date.parse('2026-11-07T04:30:00Z')

test('builder passes the fixed WIF token to Docker and gcloud readback', async () => {
  const workflow = await readFile(new URL('../.github/workflows/build-ai-pdm-masked-local-snapshot.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workloadIdentityPools\/aipdm-dev128-builder-v3\/providers\/github/u)
  assert.match(workflow, /token_format:\s*access_token/u)
  assert.match(workflow, /create_credentials_file:\s*false/u)
  assert.match(workflow, /export_environment_variables:\s*false/u)
  assert.match(workflow, /GOOGLE_OAUTH_ACCESS_TOKEN:\s*"\$\{\{ steps\.builder_auth\.outputs\.access_token \}\}"/u)
  assert.match(workflow, /CLOUDSDK_AUTH_ACCESS_TOKEN:\s*"\$\{\{ steps\.builder_auth\.outputs\.access_token \}\}"/u)
  assert.doesNotMatch(workflow, /gcloud auth (?:login|activate-service-account)/u)
})

function job() {
  return {
    name: `projects/${config.source.projectId}/locations/${config.source.region}/jobs/ai-pdm-prod-masked-local-snapshot`,
    uid: 'fixed-job-uid',
    generation: '1',
    observedGeneration: '1',
    reconciling: false,
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    etag: 'fixed-etag',
    deletionProtection: false,
    labels: { application: 'ai-pdm', component: 'masked-local-snapshot', dev: 'dev-128' },
    template: {
      taskCount: 1,
      parallelism: 1,
      template: {
        serviceAccount: config.source.serviceAccount,
        executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
        timeout: '1800s',
        maxRetries: 0,
        containers: [{
          name: 'snapshot',
          image: imageDigest,
          command: ['node'],
          args: ['scripts/dev128-masked-local-snapshot-runner.mjs', '--snapshot-id', snapshotId, '--recipient-public-key-b64', publicKeyB64],
          env: [
            { name: 'PDM_SOURCE_REVISION', value: sourceRevision },
            { name: 'DEV128_CATALOG_SHAPE_SHA256', value: config.source.catalogShapeSha256 },
            { name: 'DEV128_RECIPIENT_KEY_ID', value: recipientKeyId },
            { name: 'DEV128_STARTS_AT', value: '2026-11-07T04:00:00Z' },
            { name: 'DEV128_EXPIRES_AT', value: '2026-11-07T06:00:00Z' },
            { name: 'DEV128_DATABASE', value: config.source.database },
            { name: 'DEV128_DATABASE_LOGIN', value: config.source.databaseLogin },
            { name: 'DEV128_INSTANCE_CONNECTION_NAME', value: config.source.instanceConnectionName },
            { name: 'DEV128_DATABASE_HOST', value: `/cloudsql/${config.source.instanceConnectionName}` },
            { name: 'DEV128_PROJECT_ID', value: config.source.projectId }
          ],
          volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }]
        }],
        volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: [config.source.instanceConnectionName] } }],
        vpcAccess: {
          egress: 'ALL_TRAFFIC',
          networkInterfaces: [{ network: config.source.network, subnetwork: config.source.subnet }]
        }
      }
    }
  }
}

test('fixed owner job binds source, recipient, object and two-hour window', () => {
  const binding = validateJob({ config, job: job(), sourceRevision, now })
  assert.equal(binding.snapshotId, snapshotId)
  assert.equal(binding.recipientKeyId, recipientKeyId)
  assert.equal(binding.imageDigest, imageDigest)
  assert.equal(binding.objectName, `${config.objectPrefix}/${snapshotId}/snapshot.encrypted.json`)
})

test('Cloud Run proto-default deletion protection is false and all other values fail closed', () => {
  const omitted = structuredClone(job())
  delete omitted.deletionProtection
  assert.doesNotThrow(() => validateJob({ config, job: omitted, sourceRevision, now }))
  for (const value of [true, null, 'false']) {
    const invalid = structuredClone(job())
    invalid.deletionProtection = value
    assert.throws(() => validateJob({ config, job: invalid, sourceRevision, now }), /DEV128_JOB_READBACK_MISMATCH/u)
  }
})

test('export workflow is bound to the rotated snapshot pool and invoker only', async () => {
  const workflow = await readFile(new URL('../.github/workflows/export-ai-pdm-masked-local-snapshot.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workloadIdentityPools\/aipdm-dev128-snapshot-v2\/providers\/github/u)
  assert.match(workflow, /service_account:\s*aipdm-dev128-invoker-v2@jenfu-platform-prod[.]iam[.]gserviceaccount[.]com/u)
  assert.doesNotMatch(workflow, /runWithOverrides|--args|--update-env-vars/u)
})

test('tag image, changed source, extra environment and expired window fail closed', () => {
  const tagged = structuredClone(job())
  tagged.template.template.containers[0].image = `${config.image.repository}:latest`
  assert.throws(() => validateJob({ config, job: tagged, sourceRevision, now }), /DEV128_JOB_TEMPLATE_MISMATCH/u)
  assert.throws(() => validateJob({ config, job: job(), sourceRevision: 'c'.repeat(40), now }), /DEV128_JOB_ENVIRONMENT_MISMATCH/u)
  const extra = structuredClone(job())
  extra.template.template.containers[0].env.push({ name: 'ARBITRARY_SQL', value: 'select 1' })
  assert.throws(() => validateJob({ config, job: extra, sourceRevision, now }), /DEV128_JOB_ENVIRONMENT_MISMATCH/u)
  assert.throws(() => validateJob({ config, job: job(), sourceRevision, now: Date.parse('2026-11-07T06:00:00Z') }), /DEV128_JOB_ENVIRONMENT_MISMATCH/u)
})

test('provider exposes read/run transport only and keeps token private', async () => {
  let authorization
  const provider = new Dev128Provider({
    token: 'synthetic-provider-token-not-a-secret',
    fetchImpl: async (_url, init) => {
      authorization = init.headers.authorization
      return new Response(Buffer.from('cipher'), { status: 200, headers: { 'content-length': '6' } })
    }
  })
  assert.equal(provider.token, undefined)
  assert.equal(provider.createJob, undefined)
  assert.equal(provider.deleteJob, undefined)
  assert.equal(provider.setIamPolicy, undefined)
  assert.equal((await provider.download('https://storage.googleapis.com/test', 12)).toString('utf8'), 'cipher')
  assert.equal(authorization, 'Bearer synthetic-provider-token-not-a-secret')
})
