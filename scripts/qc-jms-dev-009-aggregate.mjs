#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const runId = `DEV009-S3-AGGREGATE-${new Date().toISOString().replace(/[:.]/gu, '-')}`
const evidenceDir = path.join(root, 'output', 'qa', 'dev-009', 'aggregate', runId)
const reportPath = path.join(evidenceDir, 'report.json')
const latestPath = path.join(root, 'output', 'qa', 'dev-009', 'aggregate', 'latest.json')
const browserLatestPath = path.join(root, 'output', 'qa', 'dev-009', 'browser-real', 'latest.json')
const sourceFiles = [
  'package.json', 'package-lock.json',
  'config/access-control/jenfu-role-catalog.v1.json',
  'contracts/jenfu-platform-governance-availability/v2/contract-manifest.json',
  'src/app/api/settings/access/role-capabilities/route.ts',
  'src/components/access-governance/role-capability-settings.tsx',
  'src/lib/ai-pdm-role-capability-contract.ts',
  'src/lib/ai-pdm-role-capability-service.ts',
  'src/lib/ai-pdm-role-capability-service.test.ts',
  'scripts/qc-jms-dev-009-contract.mjs', 'scripts/qc-jms-dev-009-repository.mjs',
  'scripts/qc-jms-dev-009-browser.mjs', 'scripts/qc-jms-dev-009-aggregate.mjs',
]
const commands = [
  ['contract', 'qc-jms-dev-009-contract.mjs'],
  ['repository', 'qc-jms-dev-009-repository.mjs'],
  ['browser', 'qc-jms-dev-009-browser.mjs'],
]
const stages = []
let failure = null

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const gitValue = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()

function candidateManifest() {
  const files = sourceFiles.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(root, relativePath))
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) }
  })
  return {
    files,
    fileCount: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: sha256(Buffer.from(files.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''), 'utf8')),
  }
}

for (const [label, script] of commands) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  process.stdout.write(stdout)
  process.stderr.write(stderr)
  stages.push({ label, script: `scripts/${script}`, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status, stdoutSha256: sha256(Buffer.from(stdout)), stderrSha256: sha256(Buffer.from(stderr)) })
  if (result.error || result.status !== 0) {
    failure = result.error?.message ?? `DEV009_AGGREGATE_FAILED stage=${label} exit=${result.status}`
    break
  }
}

let browserReceipt = null
if (!failure) {
  try {
    const pointer = JSON.parse(fs.readFileSync(browserLatestPath, 'utf8'))
    const browserReportPath = path.resolve(root, pointer.reportPath)
    const reportBytes = fs.readFileSync(browserReportPath)
    const browserReport = JSON.parse(reportBytes.toString('utf8'))
    assert.equal(pointer.status, 'PASS')
    assert.equal(browserReport.status, 'PASS')
    assert.equal(pointer.reportSha256, sha256(reportBytes))
    assert.equal(pointer.candidateSha256, browserReport.source.candidate.sha256)
    browserReceipt = {
      latestPath: path.relative(root, browserLatestPath).replaceAll('\\', '/'),
      reportPath: pointer.reportPath,
      reportSha256: pointer.reportSha256,
      candidateSha256: pointer.candidateSha256,
      execution: browserReport.execution,
      browser: browserReport.browser,
      viewports: browserReport.viewports,
      checkIds: browserReport.checks.map((check) => check.id),
      cleanup: browserReport.runtime.cleanup,
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
}

const candidate = candidateManifest()
const status = !failure && stages.length === commands.length && stages.every((stage) => stage.status === 'PASS') ? 'PASS' : 'FAIL'
const report = {
  runner: 'DEV-009-S3-aggregate', status, generatedAt: new Date().toISOString(), productionWrites: false,
  source: { gitHead: gitValue(['rev-parse', 'HEAD']), branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']), dirtyFiles: gitValue(['status', '--short']).split(/\r?\n/u).filter(Boolean), candidate },
  stages, browserReceipt, failure,
}
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = fs.readFileSync(reportPath)
fs.mkdirSync(path.dirname(latestPath), { recursive: true })
fs.writeFileSync(latestPath, `${JSON.stringify({
  status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes),
  candidateSha256: candidate.sha256, generatedAt: report.generatedAt,
}, null, 2)}\n`, 'utf8')

if (status !== 'PASS') {
  console.error(`DEV009_AGGREGATE_FAILED evidence=${reportPath} error=${failure}`)
  process.exitCode = 1
} else {
  console.log(`DEV009_AGGREGATE_OK evidence=${reportPath} candidate=${candidate.sha256}`)
}
