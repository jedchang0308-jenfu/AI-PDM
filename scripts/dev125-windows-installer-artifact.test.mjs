import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { assertDev125WindowsInstallerReceipt, verifyDev125WindowsInstallerArtifact } from './lib/dev125-windows-installer-artifact.mjs'
import { createGitArchiveWithDev125Installer } from './lib/dev012-owner-stage-executor.mjs'

const sourceRevision = 'a'.repeat(40)

function fixture(revision = sourceRevision) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-dev125-artifact-'))
  const directory = path.join(root, 'worker-downloads', 'windows-service')
  fs.mkdirSync(directory, { recursive: true })
  const fileName = 'AI-PDM-Windows-Setup-0.1.0-test.exe'
  const bytes = Buffer.from('MZ\0DEV125 fixture')
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const installer = { contractVersion: 'ai-pdm.windows-service-installer.v1', sourceRevision: revision, version: '0.1.0-test',
    protocolVersion: 1, fileName, sha256, size: bytes.length }
  fs.writeFileSync(path.join(directory, fileName), bytes)
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(installer))
  fs.writeFileSync(path.join(root, 'build-evidence.json'), JSON.stringify({
    contractVersion: 'ai-pdm.windows-service-build-evidence.v1', sourceRevision: revision, installer
  }))
  return { root, directory, fileName, installer }
}

test('DEV125 exact-source installer artifact verifies manifest, bytes and build evidence', t => {
  const value = fixture(); t.after(() => fs.rmSync(value.root, { recursive: true, force: true }))
  const result = verifyDev125WindowsInstallerArtifact({ root: value.root, sourceRevision, requireBuildEvidence: true })
  assert.equal(result.sha256, value.installer.sha256)
  assert.equal(result.protocolVersion, 1)
  assert.equal(result.fileName, value.fileName)
  assert.equal(result.buildEvidenceVerified, true)
  assert.deepEqual(result.relativeFiles, ['worker-downloads/windows-service/manifest.json',
    `worker-downloads/windows-service/${value.fileName}`])
})

test('DEV125 artifact rejects source, digest, evidence and extra-file drift', t => {
  const wrongSource = fixture(); t.after(() => fs.rmSync(wrongSource.root, { recursive: true, force: true }))
  assert.throws(() => verifyDev125WindowsInstallerArtifact({ root: wrongSource.root, sourceRevision: 'b'.repeat(40) }),
    /DEV125_INSTALLER_MANIFEST_INVALID/u)

  const digest = fixture(); t.after(() => fs.rmSync(digest.root, { recursive: true, force: true }))
  fs.appendFileSync(path.join(digest.directory, digest.fileName), 'tamper')
  assert.throws(() => verifyDev125WindowsInstallerArtifact({ root: digest.root, sourceRevision }), /DEV125_INSTALLER_DIGEST_INVALID/u)

  const evidence = fixture(); t.after(() => fs.rmSync(evidence.root, { recursive: true, force: true }))
  const changed = JSON.parse(fs.readFileSync(path.join(evidence.root, 'build-evidence.json'), 'utf8'))
  changed.installer.sha256 = 'f'.repeat(64)
  fs.writeFileSync(path.join(evidence.root, 'build-evidence.json'), JSON.stringify(changed))
  assert.throws(() => verifyDev125WindowsInstallerArtifact({ root: evidence.root, sourceRevision, requireBuildEvidence: true }),
    /DEV125_INSTALLER_BUILD_EVIDENCE_INVALID/u)

  const extra = fixture(); t.after(() => fs.rmSync(extra.root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(extra.directory, 'unexpected.txt'), 'no')
  assert.throws(() => verifyDev125WindowsInstallerArtifact({ root: extra.root, sourceRevision }),
    /DEV125_INSTALLER_DIRECTORY_INVALID/u)
})

test('DEV125 owner source archive embeds only the exact manifest-bound installer paths', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-dev125-source-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'worker-downloads', 'windows-service'), { recursive: true })
  fs.writeFileSync(path.join(root, '.gitignore'), '/worker-downloads/windows-service/*\n!/worker-downloads/windows-service/.gitkeep\n')
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n')
  fs.writeFileSync(path.join(root, 'worker-downloads', 'windows-service', '.gitkeep'), '')
  for (const args of [['init'], ['config', 'user.email', 'ci@example.invalid'], ['config', 'user.name', 'CI'], ['add', '.'], ['commit', '-m', 'fixture']]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  }
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
  const artifact = fixture(revision)
  t.after(() => fs.rmSync(artifact.root, { recursive: true, force: true }))
  fs.copyFileSync(path.join(artifact.directory, 'manifest.json'), path.join(root, 'worker-downloads', 'windows-service', 'manifest.json'))
  fs.copyFileSync(path.join(artifact.directory, artifact.fileName), path.join(root, 'worker-downloads', 'windows-service', artifact.fileName))

  const archive = createGitArchiveWithDev125Installer(root, revision, root)
  assertDev125WindowsInstallerReceipt({ sourceRevision: archive.windowsInstaller.sourceRevision,
    version: archive.windowsInstaller.version, protocolVersion: archive.windowsInstaller.protocolVersion,
    sha256: archive.windowsInstaller.sha256 }, revision)
  const listing = spawnSync('tar', ['-tf', '-'], { input: archive.bytes, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
  assert.equal(listing.status, 0, listing.stderr)
  const paths = listing.stdout.trim().split(/\r?\n/u)
  assert.ok(paths.includes('source/worker-downloads/windows-service/manifest.json'), JSON.stringify(paths))
  assert.ok(paths.includes(`source/worker-downloads/windows-service/${artifact.fileName}`), JSON.stringify(paths))
  assert.equal(paths.filter(value => value.endsWith('.exe')).length, 1)
})
