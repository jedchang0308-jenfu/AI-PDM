import { accessSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.env.JENFU_LOCAL_SANDBOX_MODE
const port = 1020 + Number(mode === 'standalone')
if (process.env.JENFU_LOCAL_SANDBOX_ENABLED !== '1' || !['integrated', 'standalone'].includes(mode) ||
    process.env.JENFU_LOCAL_SANDBOX_BIND_HOST !== '127.0.0.1' ||
    process.env.JENFU_LOCAL_SANDBOX_ORIGIN !== `http://localhost:${port}`) {
  throw new Error('Expected a bound ai-pdm local launcher environment.')
}

const cli = new URL('../node_modules/next/dist/bin/next', import.meta.url)
accessSync(cli)
if (process.argv[2] !== '--check') {
  process.chdir(root)
  process.argv = [process.execPath, fileURLToPath(cli), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)]
  await import(cli.href)
}
