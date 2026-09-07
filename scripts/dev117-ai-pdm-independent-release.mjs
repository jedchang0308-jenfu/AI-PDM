#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertDev117Config,
  assertDev117OutputPath,
  assertDev117PreflightReport,
  assertDev117SourceLock,
  buildDev117PreflightReport,
  buildDev117SourceLock,
  inspectDev117Source,
} from './lib/dev117-ai-pdm-independent-release.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(projectRoot, 'config', 'release', 'dev117-ai-pdm-independent-production.json')
const RUN_ID = /^DEV117-AIPDM-\d{8}T\d{6}Z-[0-9a-f]{8}$/u
const RELEASE_ID = /^REL-117-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function git(args, encoding = 'utf8') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding, maxBuffer: 32 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    fail('DEV117_SOURCE_INSPECTION_INVALID', `git ${args.join(' ')}`)
  }
}

function parseNull(value) {
  return value.split('\0').filter(Boolean)
}

function snapshot() {
  const status = parseNull(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']))
  const staged = []
  const unstaged = []
  const untracked = []
  for (const record of status) {
    if (record.length < 4) continue
    const pathname = record.slice(3).replaceAll('\\', '/')
    if (record.startsWith('?? ')) untracked.push(pathname)
    else {
      if (record[0] !== ' ') staged.push(pathname)
      if (record[1] !== ' ') unstaged.push(pathname)
    }
  }
  return {
    branch: git(['branch', '--show-current']).trim(),
    headRevision: git(['rev-parse', 'HEAD']).trim(),
    headTree: git(['rev-parse', 'HEAD^{tree}']).trim(),
    trackedPaths: parseNull(git(['ls-tree', '-r', '--name-only', '-z', 'HEAD'])),
    workingTree: { isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0, staged, unstaged, untracked },
  }
}

function blob(pathname) {
  try { return git(['cat-file', 'blob', `HEAD:${pathname}`], 'buffer') } catch { return null }
}

function consumeValue(args, index, name) {
  const argument = args[index]
  if (argument.startsWith(`${name}=`)) return { value: argument.slice(name.length + 1), next: index }
  if (argument === name && args[index + 1] && !args[index + 1].startsWith('--')) return { value: args[index + 1], next: index + 1 }
  return null
}

function parseArgs(args) {
  const values = { stage: null, releaseId: null, runId: null, output: null, sourceLock: null }
  const names = { '--stage': 'stage', '--release-id': 'releaseId', '--run-id': 'runId', '--output': 'output', '--source-lock': 'sourceLock' }
  for (let index = 0; index < args.length; index += 1) {
    let matched = false
    for (const [name, key] of Object.entries(names)) {
      const consumed = consumeValue(args, index, name)
      if (!consumed) continue
      if (values[key] !== null || consumed.value.length === 0) fail('DEV117_ARGUMENT_INVALID', name)
      values[key] = consumed.value
      index = consumed.next
      matched = true
      break
    }
    if (!matched) fail('DEV117_ARGUMENT_INVALID', args[index])
  }
  if (values.stage !== 'preflight') fail('DEV117_ARGUMENT_INVALID', 'expected --stage=preflight')
  if (!RELEASE_ID.test(values.releaseId ?? '')) fail('DEV117_ARGUMENT_INVALID', 'release-id')
  if (values.runId !== null && !RUN_ID.test(values.runId)) fail('DEV117_ARGUMENT_INVALID', 'run-id')
  return values
}

function generatedRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')
  return `DEV117-AIPDM-${stamp}-${crypto.randomBytes(4).toString('hex')}`
}

function assertNoSymlinkPath(targetPath) {
  const resolvedProjectRoot = path.resolve(projectRoot)
  let current = path.resolve(targetPath)
  while (current === resolvedProjectRoot || current.startsWith(`${resolvedProjectRoot}${path.sep}`)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('DEV117_OUTPUT_OUT_OF_SCOPE', current)
    if (current === resolvedProjectRoot) break
    current = path.dirname(current)
  }
}

function writeJsonAtomic(filePath, value, runDirectory, allowedFiles) {
  const target = assertDev117OutputPath(filePath, runDirectory, allowedFiles)
  assertNoSymlinkPath(runDirectory)
  fs.mkdirSync(runDirectory, { recursive: true })
  assertNoSymlinkPath(runDirectory)
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink()) fail('DEV117_OUTPUT_OUT_OF_SCOPE', target)
    if (Buffer.compare(fs.readFileSync(target), bytes) === 0) return 'IDEMPOTENT_REPLAY'
    fail('DEV117_OUTPUT_CONFLICT', target)
  }
  const temporary = path.join(runDirectory, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`)
  let descriptor
  try {
    descriptor = fs.openSync(temporary, 'wx')
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporary, target)
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try { fs.unlinkSync(temporary) } catch { /* task-owned temporary file only */ }
    if (String(error.code ?? '').startsWith('DEV117_')) throw error
    fail('DEV117_OUTPUT_CONFLICT', target)
  }
  return 'WRITTEN'
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function workflowContract(config, workflowSource) {
  return {
    path: config.workflow.path,
    stages: [...config.workflow.stages],
    candidateBuildAllowed: false,
    candidateTagAllowed: false,
    candidateTrafficPercent: 0,
    promotionSeparateDispatch: /inputs\.stage\s*==\s*'promote'/u.test(workflowSource),
    rollbackAiPdmOnly: workflowSource.includes('DEV117_ROLLBACK_AI_PDM_ONLY'),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assertDev117Config(config)
  const runId = args.runId ?? generatedRunId()
  const observedAt = new Date().toISOString()
  const defaultRoot = path.join(projectRoot, ...config.evidence.outputRoot.split('/'))
  const runDirectory = path.resolve(args.output ?? path.join(defaultRoot, runId))
  if (!isInside(defaultRoot, runDirectory) || runDirectory === defaultRoot) fail('DEV117_OUTPUT_OUT_OF_SCOPE', runDirectory)
  const sourcePath = path.resolve(args.sourceLock ?? path.join(runDirectory, 'source-lock.json'))
  const reportPath = path.join(runDirectory, 'preflight-report.json')
  assertDev117OutputPath(sourcePath, runDirectory, config.evidence.allowedFiles)
  assertDev117OutputPath(reportPath, runDirectory, config.evidence.allowedFiles)

  const state = snapshot()
  const tracked = new Set(state.trackedPaths)
  const fileContentsByPath = Object.fromEntries(config.source.requiredTrackedFiles.map((pathname) => [pathname, tracked.has(pathname) ? blob(pathname) : null]))
  const packageBlob = blob('package.json')
  const packageScripts = packageBlob == null ? {} : JSON.parse(packageBlob.toString('utf8')).scripts ?? {}
  const sourceInspection = inspectDev117Source({
    config, branch: state.branch, headRevision: state.headRevision, headTree: state.headTree, trackedPaths: state.trackedPaths,
    fileContentsByPath, packageScripts, packageLockBytes: blob('package-lock.json'), workingTree: state.workingTree,
  })
  const sourceLock = buildDev117SourceLock({ config, releaseId: args.releaseId, runId, createdAt: observedAt, sourceInspection })
  assertDev117SourceLock(sourceLock, config)

  const workflowPath = path.join(projectRoot, ...config.workflow.path.split('/'))
  const workflowSource = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : ''
  const legacyDirty = [...state.workingTree.staged, ...state.workingTree.unstaged, ...state.workingTree.untracked].includes('.github/workflows/deploy-production.yml')
  const separationChecks = {
    aiPdmOnlyArtifact: workflowSource.includes(config.application.imageRepository) && !workflowSource.includes('orgmaster-prod'),
    legacyWorkflowUntouched: !legacyDirty,
    neutralTargetExact: workflowSource.includes(config.target.projectId) && workflowSource.includes(config.target.canonicalOrigin),
    platformMutationCapabilityAbsent: !/gcloud\s+(?:run\s+(?:deploy|services\s+update-traffic)\s+jenfu-platform-prod|artifacts[^\n]*\/platform\b)/iu.test(workflowSource),
    providerCapabilitiesDisabledLocally: Object.values(config.executionBoundary).every((value) => value === false),
  }
  const reportBlockers = [...sourceLock.blockers]
  for (const [name, passed] of Object.entries(separationChecks)) if (!passed) reportBlockers.push({ code: 'DEV117_SEPARATION_CHECK_FAILED', detail: name })
  const report = buildDev117PreflightReport({
    config, releaseId: args.releaseId, runId, observedAt, sourceLock,
    workflowContract: workflowContract(config, workflowSource),
    environmentContract: {
      fixedPlainEnvironment: structuredClone(config.environment.fixedPlainEnvironment),
      requiredPlainEnvironmentNames: [...config.environment.requiredPlainEnvironmentNames],
      secretReferences: structuredClone(config.environment.allowedSecretReferences),
      secretVersionPolicy: config.environment.secretVersionPolicy,
      credentialMaterialPresent: false,
    },
    separationChecks, blockers: reportBlockers,
  })
  assertDev117PreflightReport(report, config)
  const sourceWrite = writeJsonAtomic(sourcePath, sourceLock, runDirectory, config.evidence.allowedFiles)
  const reportWrite = writeJsonAtomic(reportPath, report, runDirectory, config.evidence.allowedFiles)
  process.stdout.write(`${JSON.stringify({
    status: report.status, sourceLockStatus: sourceLock.status, releaseId: args.releaseId, runId,
    outputDirectory: path.relative(projectRoot, runDirectory).replaceAll(path.sep, '/'), sourceLock: sourceWrite,
    preflightReport: reportWrite, providerExecution: 'NOT_RUN', providerCalls: 0, cloudMutations: 0,
    databaseWrites: 0, trafficChanges: 0, credentialAccesses: 0, siblingRepositoryReads: 0,
  })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.code ?? 'DEV117_FAILED'}: ${error.message}\n`)
  process.exitCode = 1
}
