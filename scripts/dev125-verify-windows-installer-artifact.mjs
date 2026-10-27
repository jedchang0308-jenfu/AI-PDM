#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyDev125WindowsInstallerArtifact } from './lib/dev125-windows-installer-artifact.mjs'

function args(argv) {
  const parsed = { requireBuildEvidence: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--require-build-evidence') parsed.requireBuildEvidence = true
    else if (value === '--root') parsed.root = argv[++index]
    else if (value === '--source-revision') parsed.sourceRevision = argv[++index]
    else throw new Error('DEV125_INSTALLER_ARGUMENT_INVALID')
  }
  if (!parsed.root || !parsed.sourceRevision) throw new Error('DEV125_INSTALLER_ARGUMENT_INVALID')
  return parsed
}

export function main(argv = process.argv.slice(2)) {
  const result = verifyDev125WindowsInstallerArtifact(args(argv))
  process.stdout.write(`${JSON.stringify({ status: 'PASS', sourceRevision: result.sourceRevision, version: result.version,
    sha256: result.sha256, size: result.size, buildEvidenceVerified: result.buildEvidenceVerified })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`${error?.code ?? error?.message ?? 'DEV125_INSTALLER_VERIFICATION_FAILED'}\n`)
    process.exitCode = 1
  }
}
