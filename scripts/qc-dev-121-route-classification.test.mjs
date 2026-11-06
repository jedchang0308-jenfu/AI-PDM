import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateLocalTestAdminIdentityBoundary } from './qc-dev-121-route-classification.mjs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const route = read('src/app/api/auth/local-test-admin/route.ts')
const helper = read('src/lib/local-test-admin.ts')

test('the classified local test issuer retains local isolation and native session issuance', () => {
  assert.doesNotThrow(() => validateLocalTestAdminIdentityBoundary(route, helper))
})

test('classification rejects removal of the local gate, browser origin gate or database target gate', () => {
  for (const marker of ['isLocalTestAdminAvailable(request)', 'issueLocalTestAdminSession(request)']) {
    assert.throws(() => validateLocalTestAdminIdentityBoundary(route.replace(marker, 'unsafeReplacement(request)'), helper), /required boundary/)
  }
  for (const marker of ['environment.NODE_ENV !== "development"', 'environment.K_SERVICE',
    'isLoopbackHost(new URL(request.url).hostname)', 'assertLocalSandboxRequest(request, runtime.config',
    'shobj_description', 'runtime.target.targetFingerprint', 'ensure_local_test_admin_v1',
    'JenfuPrincipalSessionRegistry(snapshot).register(claims)']) {
    assert.throws(() => validateLocalTestAdminIdentityBoundary(route, helper.replace(marker, 'unsafeReplacement')), /required boundary/)
  }
})

test('classification rejects reintroducing a Platform port, HTTP request or upstream SQL dependency', () => {
  for (const call of ['await fetch("http://localhost:1000")', 'await runtime.client.introspect({})',
    'await runtime.ports.centralRegistration.registerOrReadBack({})',
    'SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1',
    'SELECT * FROM platform_contract.read_principal_auth_state_v3']) {
    assert.throws(() => validateLocalTestAdminIdentityBoundary(route, helper + '\n' + call), /must not call SSO/)
  }
})
