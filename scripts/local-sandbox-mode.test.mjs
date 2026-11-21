import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLocalSandboxClient } from '../contracts/local-principal-sandbox/v1/client.mjs'
import { localModeOrigin, readLocalSandboxConfig } from '../contracts/local-principal-sandbox/v1/protocol.mjs'

const launcher = new URL('./local-sandbox-server.mjs', import.meta.url).href
function environment(mode) {
  return { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1',
    JENFU_LOCAL_SANDBOX_MODE: mode, JENFU_LOCAL_SANDBOX_ID: 'shared-daily',
    JENFU_LOCAL_SANDBOX_ORIGIN: `http://localhost:${mode === 'standalone' ? 1021 : 1020}`,
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: `http://localhost:${mode === 'standalone' ? 1001 : 1000}`,
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: 'postgresql://local_runtime:fake_local_password@127.0.0.1:51870/jenfu_local_shared_daily',
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_runtime' }
}
for (const mode of ['integrated', 'standalone']) test(`shared-daily ${mode} launcher retains its broker and mode contract`, () => {
  const env = environment(mode)
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import assert from 'node:assert/strict';
     const names = ['JENFU_LOCAL_SANDBOX_MODE','JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN','JENFU_LOCAL_SANDBOX_ORIGIN','PDM_LOCAL_DAILY_PARALLEL']; const before = names.map(name => process.env[name]); process.argv[2] = '--check';
     await import(${JSON.stringify(launcher)});
     assert.ok(names.every((name, index) => process.env[name] === before[index]), 'Launcher mutated mode origins or compatibility flag');`], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, ...env }, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  const config = readLocalSandboxConfig(env, 'ai-pdm')
  assert.equal(config.platformOrigin, env.JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN)
  assert.equal(config.origin, localModeOrigin('http://localhost:1020', mode, 'ai-pdm'))
  assert.doesNotThrow(() => createLocalSandboxClient({ config, clientId: 'ai-pdm', key: Buffer.alloc(32, 17).toString('base64url') }))
})
test('standalone rejects integrated broker and malformed client mode without network access', () => {
  const env = environment('standalone')
  assert.throws(() => readLocalSandboxConfig({ ...env, JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://localhost:1000' }, 'ai-pdm'), /local_origin_invalid/)
  const config = readLocalSandboxConfig(env, 'ai-pdm')
  assert.throws(() => createLocalSandboxClient({ config: Object.freeze({ ...config, platformOrigin: 'http://localhost:1000' }), clientId: 'ai-pdm', key: Buffer.alloc(32, 17).toString('base64url') }), /local_client_not_configured/)
})
