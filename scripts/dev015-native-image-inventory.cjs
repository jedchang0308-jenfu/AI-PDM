const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const result = { platform: process.platform, arch: process.arch, node: process.versions.node, uid: process.getuid(), gid: process.getgid(), elf: [], wasm: [], headers: [], symlinks: [], complete: false }
const visited = new Set()
let count = 0
function walk(dir) {
  let rows
  try { rows = fs.readdirSync(dir, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const row of rows) {
    const file = path.join(dir, row.name)
    if (++count > 250000) throw new Error('NATIVE_INVENTORY_TRUNCATED')
    if (row.isDirectory()) { walk(file); continue }
    if (row.isSymbolicLink()) {
      if (/\.so(?:\.|$)|\.node$|node$/u.test(file)) result.symlinks.push({ path: file, target: fs.readlinkSync(file) })
      continue
    }
    if (!row.isFile() || visited.has(file)) continue
    visited.add(file)
    if (/pb_ds|erase_fn_imps\.hpp/u.test(file)) result.headers.push(file)
    const fd = fs.openSync(file, 'r'), magic = Buffer.alloc(4)
    try { fs.readSync(fd, magic, 0, 4, 0) } finally { fs.closeSync(fd) }
    if (!magic.equals(Buffer.from([127, 69, 76, 70])) && !magic.equals(Buffer.from([0, 97, 115, 109]))) continue
    const bytes = fs.readFileSync(file)
    const entry = { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), pbdsMarkers: ['__gnu_pbds', 'binary_heap_', 'erase_fn_imps.hpp', 'ext/pb_ds'].filter((s) => bytes.includes(Buffer.from(s))) }
    ;(magic[0] === 127 ? result.elf : result.wasm).push(entry)
  }
}
const roots = ['/nodejs', '/usr', '/lib', '/bin', '/sbin', '/app', '/opt', '/etc', '/var', '/home', '/root']
for (const dir of roots) walk(dir)
// Invoked in an isolated, network-disabled Docker container with no host mounts.
// The external pinned Docker builder verifies the application Config.User.
result.elf.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
result.symlinks.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
result.complete = true
console.log('DEV015_NATIVE_INVENTORY=' + JSON.stringify(result))
