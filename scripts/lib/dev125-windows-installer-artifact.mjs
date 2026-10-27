import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const manifestKeys = ['contractVersion', 'fileName', 'protocolVersion', 'sha256', 'size', 'sourceRevision', 'version']
const receiptKeys = ['protocolVersion', 'sha256', 'sourceRevision', 'version']

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

export function assertDev125WindowsInstallerReceipt(value, sourceRevision) {
  if (!exactKeys(value, receiptKeys) || value.sourceRevision !== sourceRevision || !H40.test(value.sourceRevision ?? '') ||
      !/^[0-9A-Za-z._-]{1,40}$/u.test(value.version ?? '') || value.protocolVersion !== 1 || !H64.test(value.sha256 ?? '')) {
    fail('DEV125_INSTALLER_RECEIPT_INVALID')
  }
  return value
}

function readJson(file, maxBytes) {
  let bytes
  try { bytes = fs.readFileSync(file) } catch { fail('DEV125_INSTALLER_MANIFEST_INVALID') }
  if (bytes.length < 2 || bytes.length > maxBytes) fail('DEV125_INSTALLER_MANIFEST_INVALID')
  try { return JSON.parse(bytes.toString('utf8')) } catch { fail('DEV125_INSTALLER_MANIFEST_INVALID') }
}

export function verifyDev125WindowsInstallerArtifact({ root, sourceRevision, requireBuildEvidence = false }) {
  if (typeof root !== 'string' || root.trim().length === 0) fail('DEV125_INSTALLER_ARGUMENT_INVALID')
  const resolvedRoot = path.resolve(root ?? '')
  if (!path.isAbsolute(resolvedRoot) || !H40.test(sourceRevision ?? '')) fail('DEV125_INSTALLER_ARGUMENT_INVALID')
  const directory = path.join(resolvedRoot, 'worker-downloads', 'windows-service')
  const manifestPath = path.join(directory, 'manifest.json')
  const manifest = readJson(manifestPath, 8 * 1024)
  if (!exactKeys(manifest, manifestKeys) ||
      manifest.contractVersion !== 'ai-pdm.windows-service-installer.v1' ||
      manifest.sourceRevision !== sourceRevision || manifest.protocolVersion !== 1 ||
      !/^[0-9A-Za-z._-]{1,40}$/u.test(manifest.version ?? '') ||
      !/^AI-PDM-Windows-Setup-[0-9A-Za-z._-]{1,40}\.exe$/u.test(manifest.fileName ?? '') ||
      !H64.test(manifest.sha256 ?? '') || !Number.isSafeInteger(manifest.size) ||
      manifest.size < 1 || manifest.size > 256 * 1024 * 1024) fail('DEV125_INSTALLER_MANIFEST_INVALID')

  const installerPath = path.join(directory, manifest.fileName)
  if (path.dirname(installerPath) !== directory) fail('DEV125_INSTALLER_PATH_INVALID')
  let bytes
  try { bytes = fs.readFileSync(installerPath) } catch { fail('DEV125_INSTALLER_DIGEST_INVALID') }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== manifest.size || sha256 !== manifest.sha256) fail('DEV125_INSTALLER_DIGEST_INVALID')

  let entries
  try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { fail('DEV125_INSTALLER_DIRECTORY_INVALID') }
  const allowed = new Set(['.gitkeep', 'manifest.json', manifest.fileName])
  if (entries.some(entry => !entry.isFile() || !allowed.has(entry.name)) ||
      !entries.some(entry => entry.name === 'manifest.json') || !entries.some(entry => entry.name === manifest.fileName)) {
    fail('DEV125_INSTALLER_DIRECTORY_INVALID')
  }

  let buildEvidence = null
  const evidencePath = path.join(resolvedRoot, 'build-evidence.json')
  if (requireBuildEvidence || fs.existsSync(evidencePath)) {
    buildEvidence = readJson(evidencePath, 64 * 1024)
    const bound = buildEvidence?.installer
    if (buildEvidence?.contractVersion !== 'ai-pdm.windows-service-build-evidence.v1' ||
        buildEvidence.sourceRevision !== sourceRevision || !bound ||
        bound.contractVersion !== manifest.contractVersion || bound.sourceRevision !== sourceRevision ||
        bound.version !== manifest.version || bound.protocolVersion !== manifest.protocolVersion ||
        bound.fileName !== manifest.fileName || bound.sha256 !== manifest.sha256 || bound.size !== manifest.size) {
      fail('DEV125_INSTALLER_BUILD_EVIDENCE_INVALID')
    }
  }

  return {
    sourceRevision,
    version: manifest.version,
    protocolVersion: manifest.protocolVersion,
    fileName: manifest.fileName,
    sha256,
    size: bytes.length,
    manifestPath,
    installerPath,
    relativeFiles: ['worker-downloads/windows-service/manifest.json', `worker-downloads/windows-service/${manifest.fileName}`],
    buildEvidenceVerified: Boolean(buildEvidence)
  }
}
