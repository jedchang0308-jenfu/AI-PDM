import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const vitest = resolve(root, 'node_modules', 'vitest', 'vitest.mjs')
const testFile = 'src/lib/repositories/jenfu-entitlement-repository.s4.test.ts'
const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.config.ts', testFile, '--reporter=verbose'], { cwd: root, encoding: 'utf8' })
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
if (result.status !== 0) throw new Error(output || 'DEV009_S4_ADAPTER_FAILED')
for (const id of ['QA-009-S4-01', 'QA-009-S4-02', 'QA-009-S4-03', 'QA-009-S4-04']) assert.ok(output.includes(id), `missing fixed case output: ${id}`)

const permissionPath = join(root, 'src', 'lib', 'numbering-permission-async.ts')
const permissionSource = readFileSync(permissionPath, 'utf8')
assert.match(permissionSource, /JenfuEntitlementRepository/u)
assert.doesNotMatch(permissionSource, /fetch\s*\(/u)
assert.doesNotMatch(permissionSource, /ai-pdm-role-capability|orgmaster.*https?/iu)

console.log(JSON.stringify({
  status: 'PASS',
  runner: 'DEV-009-S4-request-enforcement-adapter',
  cases: ['QA-009-S4-01', 'QA-009-S4-02', 'QA-009-S4-03', 'QA-009-S4-04'],
  negativeEmployeeWideSystemAdmin: 'PASS',
  protectedRequestDisplayHttpDependency: 'NONE',
  productionWrites: false
}))
