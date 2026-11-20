import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createSecureContext } from 'node:tls'

assert.equal(process.getuid(), 65532)
assert.equal(process.getgid(), 65532)
assert.equal(process.versions.node, '24.22.3')
for (const unusedOsOpenSslPath of [
  '/usr/lib/x86_64-linux-gnu/libssl.so.3',
  '/usr/lib/x86_64-linux-gnu/libcrypto.so.3',
  '/usr/lib/x86_64-linux-gnu/engines-3/afalg.so',
  '/usr/lib/x86_64-linux-gnu/engines-3/loader_attic.so',
  '/usr/lib/x86_64-linux-gnu/engines-3/padlock.so',
  '/var/lib/dpkg/status.d/libssl3t64',
  '/var/lib/dpkg/status.d/libssl3t64.md5sums',
]) {
  assert.equal(existsSync(unusedOsOpenSslPath), false, `Unused OS OpenSSL surface present: ${unusedOsOpenSslPath}`)
}
createSecureContext({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' })
const key = Buffer.alloc(32, 1)
const iv = Buffer.alloc(12, 2)
const plain = Buffer.from('Principal-only runtime packaging smoke')
const cipher = createCipheriv('aes-256-gcm', key, iv)
const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
const decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(cipher.getAuthTag())
assert.deepEqual(Buffer.concat([decipher.update(encrypted), decipher.final()]), plain)
if (process.argv.includes('--app')) {
  const appRequire = createRequire('/app/server.js')
  const Database = appRequire('better-sqlite3')
  const db = new Database(':memory:')
  try {
    assert.equal(db.prepare('SELECT 1').pluck().get(), 1)
  } finally {
    db.close()
  }
  const data = await appRequire('sharp')({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer()
  assert.ok(data.length > 0)
}
console.log(JSON.stringify({ result: 'PASS', node: process.versions.node, nodeOpenSSL: process.versions.openssl, osOpenSSLPackage: 'ABSENT', uid: process.getuid(), gid: process.getgid(), app: process.argv.includes('--app'), tlsContext: 'PASS', authenticatedEncryption: 'PASS' }))
