'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const LOADER_ENV_NAMES = new Set([
  'NODE_OPTIONS',
  'NODE_PATH',
  'GLIBC_TUNABLES',
  'GCONV_PATH',
  'VIPS_PATH',
  'SHARP_FORCE_GLOBAL_LIBVIPS',
]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateImagePath(file) {
  if (typeof file !== 'string' || !file.startsWith('/') || /[\\\0:]/u.test(file)) {
    throw failure('INVALID_IMAGE_PATH');
  }
  if (file === '/') return [];
  const parts = file.slice(1).split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw failure('INVALID_IMAGE_PATH');
  }
  return parts;
}

function isExpectedKind(stat, kind) {
  if (kind === 'file') return stat.isFile();
  if (kind === 'directory') return stat.isDirectory();
  if (kind === 'symlink') return stat.isSymbolicLink();
  return false;
}

// Resolve through every symlink, while only allowing optional ENOENT for the
// final logical path itself. A dangling final symlink is still an error.
function resolveImagePath(file, {
  optional = false,
  kind = 'file',
  followFinal = true,
  io = fs,
  seen = new Set(),
} = {}) {
  const parts = validateImagePath(file);
  if (!['file', 'directory', 'symlink'].includes(kind)
    || (kind === 'symlink' && followFinal)
    || (kind !== 'symlink' && !followFinal)) {
    throw failure('INVALID_IMAGE_PATH_OPTIONS');
  }
  if (!parts.length) {
    if (kind !== 'directory') throw failure('IMAGE_PATH_KIND');
    const physicalPath = io.realpathSync('/');
    const stat = io.statSync(physicalPath);
    if (!stat.isDirectory()) throw failure('IMAGE_PATH_KIND');
    return { path: file, physicalPath, stat };
  }

  let current = '/';
  for (let index = 0; index < parts.length; index++) {
    const final = index === parts.length - 1;
    const candidate = path.posix.join(current, parts[index]);
    let stat;
    try {
      stat = io.lstatSync(candidate);
    } catch (error) {
      if (optional && final && error && error.code === 'ENOENT') return null;
      throw error;
    }

    if (final && !followFinal) {
      if (!stat.isSymbolicLink() || kind !== 'symlink') throw failure('IMAGE_PATH_KIND');
      return { path: file, physicalPath: candidate, stat };
    }

    if (stat.isSymbolicLink()) {
      if (seen.has(candidate) || seen.size >= 40) throw failure('IMAGE_SYMLINK_LOOP');
      const target = io.readlinkSync(candidate);
      if (typeof target !== 'string' || !target || /[\0\\:]/u.test(target)) {
        throw failure('INVALID_SYMLINK_TARGET');
      }
      const targetPath = path.posix.isAbsolute(target)
        ? path.posix.resolve(target)
        : path.posix.resolve(path.posix.dirname(candidate), target);
      const resolved = resolveImagePath(targetPath, {
        optional: false,
        kind: final ? kind : 'directory',
        followFinal: true,
        io,
        seen: new Set([...seen, candidate]),
      });
      if (final) return { path: file, physicalPath: resolved.physicalPath, stat: resolved.stat };
      current = resolved.physicalPath;
      continue;
    }

    const requiredKind = final ? kind : 'directory';
    if (!isExpectedKind(stat, requiredKind)) throw failure('IMAGE_PATH_KIND');
    current = candidate;
    if (final) {
      const physicalPath = io.realpathSync(candidate);
      const physicalStat = io.statSync(physicalPath);
      if (!isExpectedKind(physicalStat, kind)) throw failure('IMAGE_PATH_KIND');
      return { path: file, physicalPath, stat: physicalStat };
    }
  }
  throw failure('IMAGE_PATH_UNRESOLVED');
}

function sanitizeImageConfig(config) {
  const invalid = () => { throw failure('IMAGE_CONFIG_INVALID'); };
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || config.User !== '65532:65532'
    || config.WorkingDir !== '/app'
    || JSON.stringify(config.Entrypoint) !== JSON.stringify(['/nodejs/bin/node'])
    || JSON.stringify(config.Cmd) !== JSON.stringify(['server.js'])
    || !Array.isArray(config.Env)) invalid();

  const names = new Set();
  for (const entry of config.Env) {
    if (typeof entry !== 'string' || !entry.includes('=')) invalid();
    const split = entry.indexOf('=');
    const name = entry.slice(0, split);
    const value = entry.slice(split + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || names.has(name)) invalid();
    names.add(name);
    if ((name.startsWith('LD_') || LOADER_ENV_NAMES.has(name)) && value.length > 0) {
      throw failure('UNEXPECTED_LOADER_ENV');
    }
  }

  if (config.Volumes != null
    && (typeof config.Volumes !== 'object' || Array.isArray(config.Volumes))) invalid();
  const volumePaths = Object.keys(config.Volumes ?? {}).sort();
  if (volumePaths.length !== 0) throw failure('UNEXPECTED_IMAGE_VOLUMES');

  return {
    user: config.User,
    workingDirectory: config.WorkingDir,
    entrypoint: config.Entrypoint,
    command: config.Cmd,
    environmentNames: [...names].sort(),
    environmentValuesRedacted: true,
    nonemptyLoaderControlsAbsent: true,
    volumePaths,
  };
}

function parseImageConfig(input) {
  if (typeof input !== 'string' && !Buffer.isBuffer(input)) throw failure('IMAGE_CONFIG_INVALID');
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  if (bytes.length > 65_536) throw failure('IMAGE_CONFIG_TOO_LARGE');
  let config;
  try {
    config = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw failure('IMAGE_CONFIG_PARSE_FAILED');
  }
  return sanitizeImageConfig(config);
}

function readFileEvidence(file, { optional = false, io = fs } = {}) {
  const resolved = resolveImagePath(file, { optional, kind: 'file', io });
  if (!resolved) {
    return { path: file, exists: false, bytes: 0, sha256: null };
  }
  const contents = io.readFileSync(resolved.physicalPath);
  if (!Buffer.isBuffer(contents)) throw failure('IMAGE_FILE_READ_INVALID');
  return {
    path: file,
    exists: true,
    bytes: contents.length,
    sha256: sha256(contents),
    contents,
  };
}

function collectControls(io = fs) {
  const controls = [];
  let preloadContents = null;
  for (const file of ['/etc/ld.so.preload', '/etc/ld.so.conf', '/etc/ld.so.cache']) {
    const evidence = readFileEvidence(file, { optional: true, io });
    if (file === '/etc/ld.so.preload' && evidence.exists) preloadContents = evidence.contents;
    const { contents, ...safe } = evidence;
    controls.push(safe);
  }
  if (preloadContents && preloadContents.length > 0) throw failure('NONEMPTY_LD_SO_PRELOAD');

  const configDirectory = resolveImagePath('/etc/ld.so.conf.d', {
    optional: true,
    kind: 'directory',
    io,
  });
  if (configDirectory) {
    const entries = io.readdirSync(configDirectory.physicalPath)
      .filter(entry => typeof entry === 'string' && entry !== '.' && entry !== '..'
        && !entry.includes('/') && !entry.includes('\\') && !entry.includes('\0'))
      .sort();
    for (const entry of entries) {
      const file = '/etc/ld.so.conf.d/' + entry;
      const evidence = readFileEvidence(file, { optional: false, io });
      const { contents, ...safe } = evidence;
      controls.push(safe);
    }
  }
  return controls;
}

function collectAliases(io = fs) {
  const aliases = [];
  for (const file of [
    '/lib/x86_64-linux-gnu/libstdc++.so.6',
    '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
  ]) {
    const link = resolveImagePath(file, {
      kind: 'symlink',
      followFinal: false,
      io,
    });
    const target = io.readlinkSync(link.physicalPath);
    if (typeof target !== 'string' || !target || /[\0\\]/u.test(target)) {
      throw failure('INVALID_LIBRARY_ALIAS');
    }
    const targetPath = path.posix.isAbsolute(target)
      ? path.posix.resolve(target)
      : path.posix.resolve(path.posix.dirname(file), target);
    const resolvedTarget = resolveImagePath(targetPath, { kind: 'file', io });
    const targetContents = io.readFileSync(resolvedTarget.physicalPath);
    if (!Buffer.isBuffer(targetContents) || targetContents.length === 0) {
      throw failure('LIBRARY_ALIAS_TARGET_UNREADABLE');
    }
    // Hash the resolved target as a readability/integrity operation. The
    // established public row shape records the literal alias only.
    sha256(targetContents);
    aliases.push({ path: file, target });
  }
  return aliases;
}

function validateSharedObjectList(sharedObjects) {
  if (!Array.isArray(sharedObjects) || new Set(sharedObjects).size !== sharedObjects.length) {
    throw failure('SHARED_OBJECT_LIST_INVALID');
  }
  for (const file of sharedObjects) {
    if (file === 'linux-vdso.so.1') continue;
    if (typeof file !== 'string' || !path.posix.isAbsolute(file) || /[\\\0:]/u.test(file)) {
      throw failure('UNEXPECTED_NONFILE_SHARED_OBJECT');
    }
  }
  if (sharedObjects.filter(file => file === 'linux-vdso.so.1').length !== 1) {
    throw failure('VDSO_MAPPING_INVALID');
  }
  return sharedObjects;
}

function collectSharedObjectRows(sharedObjects, io = fs) {
  validateSharedObjectList(sharedObjects);
  return sharedObjects.map(file => {
    if (file === 'linux-vdso.so.1') {
      return { path: file, kind: 'kernel-vdso', fileBacked: false, sha256: null };
    }
    // Node may report an absolute loader alias containing ../ segments. Pass
    // that raw spelling to realpath so symlink resolution matches the loader.
    const physicalPath = io.realpathSync(file);
    if (typeof physicalPath !== 'string' || !path.posix.isAbsolute(physicalPath)
      || /[\\\0:]/u.test(physicalPath)) throw failure('INVALID_SHARED_OBJECT_PATH');
    if (!io.statSync(physicalPath).isFile()) throw failure('SHARED_OBJECT_NOT_FILE');
    const contents = io.readFileSync(physicalPath);
    if (!Buffer.isBuffer(contents)) throw failure('SHARED_OBJECT_NOT_READABLE');
    return {
      path: file,
      physicalPath,
      fileBacked: true,
      bytes: contents.length,
      sha256: sha256(contents),
    };
  });
}

function verifyRuntimeEnvironment(env = process.env) {
  for (const [name, value] of Object.entries(env)) {
    if ((name.startsWith('LD_') || LOADER_ENV_NAMES.has(name)) && value) {
      throw failure('UNEXPECTED_RUNTIME_LOADER_ENV');
    }
  }
}

async function runLoaderProbe() {
  if (process.platform !== 'linux' || process.arch !== 'x64'
    || typeof process.getuid !== 'function' || typeof process.getgid !== 'function'
    || process.getuid() !== 65532 || process.getgid() !== 65532) {
    throw failure('UNEXPECTED_DIAGNOSTIC_RUNTIME');
  }
  verifyRuntimeEnvironment();
  const controls = collectControls();
  const sharp = require('sharp');
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#000000' },
  }).png().toBuffer();
  if (!Buffer.isBuffer(png) || png.length === 0
    || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw failure('SHARP_PROBE_FAILED');
  }

  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  let sqliteProbePassed = false;
  try {
    sqliteProbePassed = database.prepare('SELECT 1 AS ok').get().ok === 1;
  } finally {
    database.close();
  }
  if (!sqliteProbePassed) throw failure('SQLITE_PROBE_FAILED');

  const sharedObjects = process.report?.getReport?.().sharedObjects;
  validateSharedObjectList(sharedObjects);
  const mapLines = fs.readFileSync('/proc/self/maps', 'utf8').split('\n');
  const vdsoMaps = mapLines.filter(line => /\s\[vdso\]$/u.test(line));
  if (vdsoMaps.length !== 1) throw failure('VDSO_MAPPING_INVALID');

  const rows = collectSharedObjectRows(sharedObjects);
  const aliases = collectAliases();
  const loader = {
    platform: process.platform,
    arch: process.arch,
    uid: process.getuid(),
    gid: process.getgid(),
    node: process.versions.node,
    vdsoMapCount: vdsoMaps.length,
    controls,
    aliases,
    rows,
    sqliteProbe: 'IN_MEMORY_SELECT_1',
    generatedPngSha256: sha256(png),
  };
  process.stdout.write('DEV015_ALIGNED_LOADER=' + JSON.stringify(loader) + '\n');
}

function runImageConfigMode() {
  try {
    const input = fs.readFileSync(0);
    const result = parseImageConfig(input);
    process.stdout.write('DEV015_ALIGNED_IMAGE_CONFIG=' + JSON.stringify(result) + '\n');
  } catch {
    process.stderr.write('DEV015_ALIGNED_IMAGE_CONFIG_FAILED\n');
    process.exitCode = 1;
  }
}

async function main(argv = process.argv) {
  if (argv.includes('--image-config')) {
    runImageConfigMode();
    return;
  }
  try {
    await runLoaderProbe();
  } catch {
    // Keep all runtime and filesystem details out of build logs.
    process.stderr.write('DEV015_ALIGNED_LOADER_FAILED\n');
    process.exitCode = 1;
  }
}

module.exports = {
  collectSharedObjectRows,
  parseImageConfig,
  resolveImagePath,
  sanitizeImageConfig,
  validateImagePath,
  validateSharedObjectList,
};

if (require.main === module
  || (path.basename(module.filename) === '[eval]' && process.execArgv.includes('-e'))) {
  void main();
}
