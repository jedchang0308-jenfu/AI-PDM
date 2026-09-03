import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSourceDrift,
  buildGitSourceManifest,
  buildSourceManifest,
  canonicalize,
  loadPackageConfig,
  redactEvidence,
  sha256,
} from './lib/dev010-n2-manifest.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configCandidates = [
  'config/dev-010/n2/platform-package.json',
  'config/dev-010/n2/orgmaster-package.json',
  'config/platform/dev-010-n2-ai-pdm.json',
]
const configRelative = configCandidates.find((candidate) => fs.existsSync(path.join(projectRoot, ...candidate.split('/'))))
if (!configRelative) throw new Error('DEV010_N2_PACKAGE_CONFIG_MISSING')

const config = loadPackageConfig(path.join(projectRoot, ...configRelative.split('/')))
const baselineHead = config.repository.head
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim()
try {
  execFileSync('git', ['merge-base', '--is-ancestor', baselineHead, head], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
} catch {
  throw new Error(`DEV010_N2_HEAD_NOT_ANCESTOR: baseline=${baselineHead} head=${head}`)
}

const baselineCandidate = buildGitSourceManifest({ root: projectRoot, head: baselineHead, files: config.baseline.files })
const candidateFiles = [...new Set([
  ...config.baseline.files,
  ...config.changeAllowlist.modify,
  ...config.changeAllowlist.new,
])]
const candidate = buildSourceManifest({ root: projectRoot, head, files: candidateFiles })
const appRoot = path.join(projectRoot, 'output', 'dev-010', 'n2', config.appId)
const frozenPath = path.join(appRoot, `source-freeze-baseline-${baselineHead.slice(0, 12)}-${config.baseline.aggregateSha256.slice(0, 12)}.json`)
fs.mkdirSync(appRoot, { recursive: true })

const dirtyPaths = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
  cwd: projectRoot,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll('\\', '/'))
  .sort()

let baseline
let drift = []
if (fs.existsSync(frozenPath)) {
  baseline = JSON.parse(fs.readFileSync(frozenPath, 'utf8'))
  drift = assertSourceDrift(baseline.sourceManifest, candidate, config.changeAllowlist, { allowDescendantHead: true }).drift
  const knownDirty = new Set(baseline.dirtyPaths)
  const newDirty = dirtyPaths.filter((filePath) => !knownDirty.has(filePath))
  for (const filePath of newDirty) {
    const allowed = config.changeAllowlist.modify.includes(filePath)
      || config.changeAllowlist.new.includes(filePath)
      || config.changeAllowlist.outputPrefixes.some((prefix) => filePath.startsWith(prefix))
    if (!allowed) throw new Error(`DEV010_N2_ALLOWLIST_DRIFT: ${filePath}`)
  }
} else {
  if (baselineCandidate.aggregateSha256 !== config.baseline.aggregateSha256) {
    throw new Error(`DEV010_N2_HASH_MISMATCH: expected=${config.baseline.aggregateSha256} actual=${baselineCandidate.aggregateSha256}`)
  }
  baseline = {
    configPath: configRelative,
    dirtyPaths,
    frozenAt: new Date().toISOString(),
    packageId: config.packageId,
    sourceManifest: baselineCandidate,
  }
  fs.writeFileSync(frozenPath, `${JSON.stringify(redactEvidence(baseline), null, 2)}\n`)
}

const runId = `SOURCE-${new Date().toISOString().replace(/[-:.]/gu, '')}-${process.pid}`
const outputDir = path.join(appRoot, runId)
fs.mkdirSync(outputDir, { recursive: true })
const packageBytes = Buffer.from(canonicalize(config), 'utf8')
const sourceManifest = {
  aggregateSha256: candidate.aggregateSha256,
  baselineAggregateSha256: baseline.sourceManifest.aggregateSha256,
  candidateAggregateSha256: candidate.aggregateSha256,
  drift,
  files: candidate.files,
  head,
  sourceManifestSha256: sha256(canonicalize(candidate)),
  status: 'PASS',
}
fs.writeFileSync(path.join(outputDir, 'source-manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`)
fs.writeFileSync(path.join(outputDir, 'package-manifest.json'), `${JSON.stringify({ ...config, packageSha256: sha256(packageBytes) }, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ appId: config.appId, outputDir: path.relative(projectRoot, outputDir).replaceAll('\\', '/'), sourceManifestSha256: sourceManifest.sourceManifestSha256, status: 'PASS' })}\n`)
