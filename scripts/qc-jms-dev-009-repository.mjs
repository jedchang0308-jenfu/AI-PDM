import { spawnSync } from 'node:child_process'
import path from 'node:path'

const commands = [
  ['typecheck:app', process.execPath, [path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false']],
  ['service-tests', process.execPath, [path.join('node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', 'vitest.config.ts', 'src/lib/ai-pdm-role-capability-service.test.ts']],
]
for (const [label, command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false })
  if (result.error) {
    console.error(`DEV009_REPOSITORY_SPAWN_FAILED ${label}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`PASS DEV009_REPOSITORY ${label}`)
}
console.log('DEV009_REPOSITORY_OK privilegedProjection=readonly redaction=validated staleFallback=implemented')
