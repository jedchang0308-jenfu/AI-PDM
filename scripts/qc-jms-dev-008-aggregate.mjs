import { spawnSync } from 'node:child_process'
const commands = [
  ['qc-jms-dev-008-contract.mjs'],
  ['qc-jms-dev-008-repository.mjs'],
  ['qc-jms-dev-008-browser.mjs'],
]
for (const [script] of commands) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit', encoding: 'utf8' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('DEV008_AGGREGATE_OK')
