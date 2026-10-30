import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDev126LocalPostnativeOwner } from './lib/dev126-local-postnative-owner.mjs'

export function argumentsFrom(argv) {
  const options = {}
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--verify-only') {
      if (options.verifyOnly) throw new Error('POSTNATIVE_ARGUMENTS_INVALID')
      options.verifyOnly = true
      continue
    }
    const values = { '--stage': 'stage', '--root': 'root', '--task-root': 'taskRoot', '--platform-root': 'platformRoot' }
    const field = values[key]
    if (!field || options[field] !== undefined || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) {
      throw new Error('POSTNATIVE_ARGUMENTS_INVALID')
    }
    options[field] = argv[index + 1]
    index += 1
  }
  if (!['business-baseline', 'native-baseline'].includes(options.stage) ||
    ['root', 'taskRoot', 'platformRoot'].some(field => typeof options[field] !== 'string' || !path.isAbsolute(options[field]))) {
    throw new Error('POSTNATIVE_ARGUMENTS_INVALID')
  }
  return options
}

export async function runOwnerFromArguments(argv, runOwner = runDev126LocalPostnativeOwner) {
  const { platformRoot, ...ownerInput } = argumentsFrom(argv)
  return runOwner({ ...ownerInput, dependencies: { platformRoot } })
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const receipt = await runOwnerFromArguments(process.argv)
    process.stdout.write(`${JSON.stringify(receipt)}\n`)
  } catch (error) {
    const candidate = error && typeof error === 'object' ? error.code ?? error.name : null
    const code = typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,96}$/u.test(candidate)
      ? candidate : 'LOCAL_POSTNATIVE_OWNER_FAILED'
    process.stderr.write(`${JSON.stringify({ error: code })}\n`)
    process.exitCode = 1
  }
}
