import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import test from 'node:test'
import { createRecoveryServer, recoveryResponse } from './dev121-principal-only-recovery-server.mjs'

const dockerfile = readFileSync(new URL('../infra/google-cloud/dev-117-production-release/principal-only-recovery.Dockerfile', import.meta.url), 'utf8')
const cloudBuild = readFileSync(new URL('../infra/google-cloud/dev-117-production-release/principal-only-recovery-cloudbuild.yaml', import.meta.url), 'utf8')

test('recovery revision exposes only a static startup probe and never authorizes a business request', () => {
  assert.equal(recoveryResponse('GET', '/login').status, 200)
  for (const [method, path] of [
    ['POST', '/login'], ['GET', '/'], ['GET', '/api/auth/me'],
    ['POST', '/api/auth/jenfu-sso/callback'], ['GET', '/api/numbering/permissions'],
    ['POST', '/api/numbering/parts'], ['GET', '/api/health/ready'],
    ['GET', '/login/anything'],
  ]) {
    const result = recoveryResponse(method, path)
    assert.equal(result.status, 503, `${method} ${path}`)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.equal(result.headers['retry-after'], '60')
    assert.equal(Object.keys(result.headers).some((name) => name === 'set-cookie' || name === 'location'), false)
  }
})

test('recovery server does not echo request secrets or set a session', async () => {
  const server = createRecoveryServer().listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${origin}/api/auth/me?token=secret`, {
      method: 'GET', headers: { cookie: '__session=secret' },
    })
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('location'), null)
    assert.doesNotMatch(await response.text(), /secret/u)
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('recovery image is source-labeled, pinned and isolated from app/database dependencies', () => {
  assert.match(dockerfile, /distroless\/nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}/u)
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{SOURCE_REVISION\}"/u)
  assert.match(dockerfile, /COPY --chown=65532:65532 scripts\/dev121-principal-only-recovery-server\.mjs/u)
  assert.doesNotMatch(dockerfile, /COPY .*\b(src|db|\.next|node_modules)\b/u)
  assert.match(cloudBuild, /dir: source/u)
  assert.match(cloudBuild, /SOURCE_REVISION=\$\{_SOURCE_REVISION\}/u)
  assert.match(cloudBuild, /\$\{_IMAGE_URI\}:dev121-recovery-\$\{_SOURCE_REVISION\}/u)
})
