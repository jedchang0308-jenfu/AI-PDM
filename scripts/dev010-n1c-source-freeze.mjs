#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalize, sha256 } from './lib/dev010-n2-manifest.mjs'
import { loadN1cAiPdmConfig } from './dev010-n1c-ai-pdm-package.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadN1cAiPdmConfig()
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
const porcelain = git(['status', '--porcelain=v1', '--untracked-files=all'])
if (porcelain.trim()) throw new Error('DEV010_N1C_AI_PDM_CANDIDATE_NOT_CLEAN')
const head = git(['rev-parse', 'HEAD']).trim()
const tree = git(['rev-parse', 'HEAD^{tree}']).trim()
try { git(['merge-base', '--is-ancestor', config.repository.inspectionHead, head]) } catch { throw new Error('DEV010_N1C_AI_PDM_HEAD_NOT_DESCENDANT') }
const changedPaths = git(['diff', '--name-only', `${config.repository.inspectionHead}..${head}`]).split(/\r?\n/u).map((item) => item.trim().replaceAll('\\', '/')).filter(Boolean)
const allow = new Set([...config.sourceFreeze.allowModify, ...config.sourceFreeze.allowNew])
for (const filePath of changedPaths) if (!allow.has(filePath)) throw new Error(`DEV010_N1C_AI_PDM_ALLOWLIST_DRIFT: ${filePath}`)
const files = git(['ls-tree', '-r', '--full-tree', 'HEAD']).split(/\r?\n/u).filter(Boolean).map((line) => {
  const match = /^(\d+)\s+(\w+)\s+([0-9a-f]{40})\t(.+)$/u.exec(line)
  if (!match) throw new Error('DEV010_N1C_AI_PDM_GIT_TREE_PARSE_FAILED')
  return { mode: match[1], type: match[2], object: match[3], path: match[4].replaceAll('\\', '/') }
})
const source = { changedPaths: [...changedPaths].sort(), files, head, repository: config.repository.name, tree }
const manifest = { schemaVersion: 'jenfu.dev010.n1c.source.v1', ...source, manifestSha256: sha256(canonicalize(source)), safety: config.safety, status: 'PASS' }
const runId = `SOURCE-${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${process.pid}`
const outputDir = path.join(root, 'output', 'dev-010', 'n1c', runId, 'source')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, 'ai-pdm-manifest.json')
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ head, manifestSha256: manifest.manifestSha256, outputPath: path.relative(root, outputPath).replaceAll('\\', '/'), status: 'PASS', tree })}\n`)
