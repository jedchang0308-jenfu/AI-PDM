import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const central = path.resolve(root, '..', 'Jenfu-Management-system', 'contracts', 'jenfu-platform-governance-availability', 'v1')
const local = path.resolve(root, 'contracts', 'jenfu-platform-governance-availability', 'v1')
const files = ['contract-manifest.json','orgmaster-role-capability-workspace.schema.json','ai-pdm-role-capability-workspace.schema.json','governance-command-receipt.schema.json','governance-error-codes.json']
for (const file of files) {
  const source = fs.readFileSync(path.join(central, file))
  const copy = fs.readFileSync(path.join(local, file))
  if (!source.equals(copy)) throw new Error(`DEV008_CONTRACT_DRIFT:${file}`)
  JSON.parse(source)
}
const errors = JSON.parse(fs.readFileSync(path.join(local, 'governance-error-codes.json'), 'utf8'))
if (!errors.command.includes('COMMAND_STILL_PROCESSING') || !errors.command.includes('COMMAND_NOOP')) throw new Error('DEV008_COMMAND_CODES_INCOMPLETE')
const fixtureDir = path.join(local, 'fixtures')
const current = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'workspace.current.json'), 'utf8'))
const stale = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'workspace.stale-snapshot.json'), 'utf8'))
if (current.roles.length !== 9 || stale.roles.length !== 9 || current.catalogPayloadHash === '0'.repeat(64) || stale.catalogPayloadHash === '0'.repeat(64)) throw new Error('DEV008_WORKSPACE_FIXTURE_INCOMPLETE')
if (stale.dataState !== 'stale_snapshot' || stale.mutationAllowed !== false || !stale.sourceDataAt) throw new Error('DEV008_STALE_FIXTURE_INVALID')
const hashes = fs.readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).map((file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureDir, file))).digest('hex'))
if (new Set(hashes).size !== hashes.length) throw new Error('DEV008_FIXTURE_HASH_COLLISION')
console.log(`DEV008_CONTRACT_OK files=${files.length} fixtures=${hashes.length}`)
