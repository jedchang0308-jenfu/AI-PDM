import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createSecureContext } from 'node:tls'

assert.equal(process.getuid(), 65532)
assert.equal(process.getgid(), 65532)
assert.equal(process.versions.node, '24.21.0')
for (const unusedOsOpenSslPath of [
  '/usr/lib/x86_64-linux-gnu/libssl.so.3',
  '/usr/lib/x86_64-linux-gnu/libcrypto.so.3',
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
console.log(JSON.stringify({ result: 'PASS', node: process.versions.node, nodeOpenSSL: process.versions.openssl, osOpenSSLPackage: 'ABSENT', uid: process.getuid(), gid: process.getgid(), unusedOsOpenSslPathsAbsent: 4, tlsContext: 'PASS', authenticatedEncryption: 'PASS' }))
