import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'

assert.equal(process.getuid(), 65532)
assert.equal(process.getgid(), 65532)
assert.equal(process.versions.node, '24.21.0')
const packageStatus = readFileSync('/var/lib/dpkg/status.d/libssl3t64', 'utf8')
assert.match(packageStatus, /^Version: 3\.5\.7-1~deb13u3$/mu)
assert.match(packageStatus, /^Architecture: amd64$/mu)
const checksums = new Map(readFileSync('/var/lib/dpkg/status.d/libssl3t64.md5sums', 'utf8')
  .trim().split('\n').map(line => {
    const [checksum, file] = line.trim().split(/\s+/u)
    return [file, checksum]
  }))
for (const library of ['usr/lib/x86_64-linux-gnu/libssl.so.3', 'usr/lib/x86_64-linux-gnu/libcrypto.so.3']) {
  const expected = checksums.get(library)
  assert.ok(expected, `Missing package checksum: ${library}`)
  assert.equal(createHash('md5').update(readFileSync(`/${library}`)).digest('hex'), expected)
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
console.log(JSON.stringify({ result: 'PASS', node: process.versions.node, nodeOpenSSL: process.versions.openssl, osOpenSSLPackage: '3.5.7-1~deb13u3', uid: process.getuid(), gid: process.getgid(), packageLibrariesVerified: 2, tlsContext: 'PASS', authenticatedEncryption: 'PASS' }))
