import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTRACT_VERSION = 'jenfu.platform-entitlement.v1'
const EXPECTED = { uniqueFiles: 57, uniqueMethods: 71, policyEntries: 79 }
const scriptRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptRoot, '..')
const platformRoot = process.env.JENFU_MANAGEMENT_SYSTEM_ROOT?.trim()
  ? resolve(process.env.JENFU_MANAGEMENT_SYSTEM_ROOT)
  : resolve(appRoot, '..', 'Jenfu-Management-system')
const inventoryPath = join(platformRoot, 'ai-doc', 'specs', 'DEV-005-ai-pdm-authorization-route-inventory.md')
const mapPath = join(appRoot, 'config', 'access-control', 'jenfu-route-permission-map.v1.json')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseInventory(markdown) {
  const start = markdown.indexOf('### 3.1 Canonical method／discriminator map')
  const end = markdown.indexOf('\n## 4.', start)
  assert.ok(start >= 0 && end > start, 'inventory canonical map section missing')
  const section = markdown.slice(start, end)
  const rows = section.split(/\r?\n/u)
    .filter((line) => /^\|/u.test(line))
    .filter((line) => !/^\|\s*File\s*\|/u.test(line))
    .filter((line) => !/^\|\s*:?-{3}/u.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
  assert.ok(rows.length > 0, 'inventory map has no rows')
  return rows.map(([pathCell, methodCell, targetCell, scopeCell], index) => {
    assert.ok(pathCell && methodCell && targetCell && scopeCell, `inventory row ${index + 1} is incomplete`)
    const normalizedMethodCell = methodCell.replaceAll('`', '').trim()
    const methodMatch = normalizedMethodCell.match(/^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)(?:;\s*(.*))?$/u)
    assert.ok(methodMatch, `inventory row ${index + 1} has invalid method: ${methodCell}`)
    const method = methodMatch[1]
    const discriminator = (methodMatch[2] ?? '').replaceAll('`', '').trim() || null
    const target = targetCell.replaceAll('`', '').trim()
    let authorizationMode = 'permission'
    let permissionCode = target
    if (target.startsWith('retired')) {
      authorizationMode = 'retired'
      permissionCode = null
    } else if (target.startsWith('existing_command')) {
      authorizationMode = 'existing_command'
      permissionCode = null
    } else if (target.startsWith('authenticated_domain')) {
      authorizationMode = 'authenticated_domain'
      permissionCode = null
    } else if (target.startsWith('existing ')) {
      authorizationMode = 'existing_path'
      permissionCode = null
    }
    return {
      path: pathCell.replaceAll('`', '').trim(),
      method,
      discriminator,
      authorizationMode,
      permissionCode,
      authorizationTarget: target,
      scopeResolver: scopeCell.split('＋')[0].trim(),
      preservedGuards: scopeCell,
    }
  })
}

function buildMap(markdown) {
  const entries = parseInventory(markdown).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const uniqueFiles = new Set(entries.map((entry) => entry.path)).size
  const uniqueMethods = new Set(entries.map((entry) => `${entry.path}\0${entry.method}`)).size
  const denominator = { uniqueFiles, uniqueMethods, policyEntries: entries.length }
  assert.deepEqual(denominator, EXPECTED, 'route inventory denominator drifted')
  return {
    contractVersion: CONTRACT_VERSION,
    applicationId: 'ai-pdm',
    source: 'Jenfu-Management-system/ai-doc/specs/DEV-005-ai-pdm-authorization-route-inventory.md',
    sourceSha256: sha256(Buffer.from(markdown, 'utf8')),
    denominator,
    entries,
  }
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.dev005-${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}

function main() {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null
  assert.ok(mode, 'choose --write or --check')
  const markdown = readFileSync(inventoryPath, 'utf8')
  const expected = buildMap(markdown)
  if (mode === 'write') writeAtomic(mapPath, expected)
  assert.ok(existsSync(mapPath), `missing route map: ${mapPath}`)
  const actual = JSON.parse(readFileSync(mapPath, 'utf8'))
  assert.deepEqual(actual, expected, 'route permission map drifted from canonical inventory')
  process.stdout.write(`${JSON.stringify({ status: 'PASS', mode, mapPath, ...expected.denominator, sourceSha256: expected.sourceSha256 })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 authorization boundary check failed: ${error.message}\n`)
  process.exitCode = 1
}
