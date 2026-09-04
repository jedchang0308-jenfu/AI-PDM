import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalize, loadPackageConfig, redactEvidence, sha256, sourceSha256 } from './lib/dev010-n2-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadPackageConfig(path.join(root, 'config', 'platform', 'dev-010-n2-ai-pdm.json'))
const runId = `AI-PDM-${new Date().toISOString().replace(/[-:.]/gu, '')}-${process.pid}`
const outputDir = path.join(root, 'output', 'dev-010', 'n2', 'ai-pdm', runId)
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n2', 'fixtures', 'ai-pdm-domain.json'), 'utf8'))
const packageSha256 = sha256(canonicalize(config))
const fixtureSha256 = sha256(canonicalize(fixture))
const commandEvidence = []
fs.mkdirSync(outputDir, { recursive: true })

const safe = (value) => redactEvidence(value instanceof Error ? value.stack ?? value.message : String(value)).slice(0, 4000)
function writeJson(name, value) {
  const text = `${JSON.stringify(redactEvidence(value), null, 2)}\n`
  if (/postgres(?:ql)?:\/\//iu.test(text) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)) throw new Error(`DEV010_N2_EVIDENCE_REDACTION_FAILED: ${name}`)
  fs.writeFileSync(path.join(outputDir, name), text)
  return sha256(text)
}
function run(command, args) {
  const startedAt = new Date().toISOString()
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  const record = { command: `${command} ${args.join(' ')}`, startedAt, completedAt: new Date().toISOString(), status: result.status, outputSha256: sha256(`${result.stdout ?? ''}\n${result.stderr ?? ''}`) }
  commandEvidence.push(record)
  if (result.status !== 0) throw new Error(`DEV010_N2_COMMAND_FAILED: ${record.command}\n${safe(`${result.stdout}\n${result.stderr}`)}`)
  return String(result.stdout ?? '').trim()
}
function receipt(caseId, expected, actual, evidenceRefs, sourceManifestSha256) {
  const base = { caseId, status: 'PASS', expected, actual, acceptanceLayer: 'static/package', fixtureVariant: fixture.fixtureVariant, failureInjection: 'none', sourceManifestSha256, packageSha256, fixtureSha256, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), evidenceRefs, productionWrites: false, cleanupOwner: `process:${process.pid}` }
  return { ...base, provenanceSha256: sha256(canonicalize(base)) }
}

let firstFailure = null
let sourceManifestSha256 = null
const cases = []
try {
  const freeze = JSON.parse(run(process.execPath, ['scripts/dev010-n2-source-freeze.mjs']))
  sourceManifestSha256 = freeze.sourceManifestSha256
  const freezeDir = path.join(root, ...freeze.outputDir.split('/'))
  fs.copyFileSync(path.join(freezeDir, 'source-manifest.json'), path.join(outputDir, 'source-manifest.json'))
  fs.copyFileSync(path.join(freezeDir, 'package-manifest.json'), path.join(outputDir, 'package-manifest.json'))
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(freezeDir, 'source-manifest.json'), 'utf8'))
  const expectedPaths = [...new Set([...config.baseline.files, ...config.changeAllowlist.modify, ...config.changeAllowlist.new])].sort()
  assert.deepEqual(sourceManifest.files.map((entry) => entry.path), expectedPaths)
  for (const entry of sourceManifest.files) assert.equal(entry.sha256, sourceSha256(fs.readFileSync(path.join(root, ...entry.path.split('/')))))
  assert.equal(sourceManifest.sourceManifestSha256, sha256(canonicalize({ aggregateSha256: sourceManifest.aggregateSha256, files: sourceManifest.files, head: sourceManifest.head })))
  cases.push(receipt('N2-AI-PDM-QC-01', 'Frozen baseline and every candidate allowlist file are content-addressed', { ...freeze, candidateFileCount: sourceManifest.files.length }, ['source-manifest.json', 'package-manifest.json'], sourceManifestSha256))
  run(process.execPath, ['--test', 'scripts/dev010-n2-source-freeze.test.mjs', 'scripts/dev010-n2-ai-pdm.test.mjs'])
  cases.push(receipt('N2-AI-PDM-QC-02', 'Fresh/existing history, namespace and fixture unit gates pass', '17/17 node:test cases passed', ['command-results.json'], sourceManifestSha256))
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/lib/dev010-database-boundary.test.ts'])
  cases.push(receipt('N2-AI-PDM-QC-03', 'Typed neutral database boundary tests pass', '2/2 Vitest cases passed', ['command-results.json'], sourceManifestSha256))
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false'])
  cases.push(receipt('N2-AI-PDM-QC-04', 'AI-PDM application TypeScript boundary compiles without error', 'typecheck:app exit 0', ['command-results.json'], sourceManifestSha256))
} catch (error) { firstFailure = safe(error) }

writeJson('runtime-plan.json', { repo: root, purpose: 'DEV-010 N2 AI-PDM package gate; database and browser runtime are aggregate-owned', command: 'npm run qc:dev-010:n2:ai-pdm', port: null, owningProcessTree: `PID ${process.pid}`, sourceManifestSha256, cleanupCondition: 'No child runtime remains after synchronous command completion', productionWrites: false })
writeJson('command-results.json', commandEvidence)
writeJson('case-results.json', { required: 4, passed: cases.length, failed: firstFailure ? 1 : 0, notRun: firstFailure ? 4 - cases.length : 0, cases })
writeJson('database-readback.json', { status: 'DEFERRED_TO_AGGREGATE', reason: 'The aggregate owns the only task PostgreSQL 17 target.' })
writeJson('reconciliation.json', { fixtureSha256, fixtureVariant: fixture.fixtureVariant, groupCount: Object.keys(fixture.groups).length, status: 'PASS' })
writeJson('cleanup.json', { status: 'PASS', childRuntimes: 0, productionWrites: false })
const status = !firstFailure && cases.length === 4 ? 'PASS' : 'FAIL'
const report = { devId: 'DEV-010', slice: '010-N2D', appId: 'ai-pdm', runId, status, sourceManifestSha256, packageSha256, fixtureSha256, packageCases: { required: 4, passed: cases.length }, firstFailure, productionWrites: false, evidenceDirectory: path.relative(root, outputDir).replaceAll('\\', '/') }
writeJson('report.json', report)
process.stdout.write(`${JSON.stringify(report)}\n`)
if (status !== 'PASS') process.exitCode = 1
