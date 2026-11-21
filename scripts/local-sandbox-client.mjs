import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ownerWorktree = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const gitDir = execFileSync('git', ['-C', ownerWorktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
  { encoding: 'utf8', windowsHide: true }).trim()
const platformRoot = path.resolve(gitDir, '..', '..', 'Jenfu-Platform')
const { runDailyLocal } = await import(pathToFileURL(path.join(platformRoot, 'scripts/dev-local-daily.mjs')))
await runDailyLocal(process.argv.slice(2), platformRoot, { ownerWorktree, app: 'ai-pdm' })
