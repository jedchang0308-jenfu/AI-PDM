import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  collectSharedObjectRows,
  parseImageConfig,
  resolveImagePath,
  validateSharedObjectList,
} = require('./dev015-aligned-new-loader-inspection.cjs');

const scriptPath = fileURLToPath(new URL('./dev015-aligned-new-loader-inspection.cjs', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');

function errno(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fakeIo(nodes, errors = {}) {
  const statFor = type => ({
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'symlink',
  });
  const lookup = file => {
    if (errors[file]) throw errors[file];
    const node = nodes[file];
    if (!node) throw errno('ENOENT', 'missing');
    return node;
  };
  return {
    lstatSync(file) {
      return statFor(lookup(file).type);
    },
    statSync(file) {
      return statFor(lookup(file).type);
    },
    realpathSync(file) {
      const node = lookup(file);
      return node.realpath ?? file;
    },
    readlinkSync(file) {
      const node = lookup(file);
      if (node.type !== 'symlink') throw errno('EINVAL');
      return node.target;
    },
    readFileSync(file) {
      const node = lookup(file);
      if (node.type !== 'file') throw errno('EISDIR');
      return Buffer.from(node.contents ?? 'x');
    },
  };
}

const baseConfig = () => ({
  User: '65532:65532',
  WorkingDir: '/app',
  Entrypoint: ['/nodejs/bin/node'],
  Cmd: ['server.js'],
  Env: ['PATH=/usr/bin', 'PRIVATE_TOKEN=do-not-print'],
  Volumes: {},
});

test('image config reports safe fields and redacts all environment values', () => {
  const child = spawnSync(process.execPath, [
    '-e', source, '--', '--image-config',
  ], {
    input: JSON.stringify(baseConfig()),
    encoding: 'utf8',
    env: {},
  });
  assert.equal(child.status, 0);
  assert.equal(child.stderr, '');
  assert.match(child.stdout, /^DEV015_ALIGNED_IMAGE_CONFIG=/u);
  assert.doesNotMatch(child.stdout, /do-not-print|PRIVATE_TOKEN=/u);
  const result = JSON.parse(child.stdout.slice('DEV015_ALIGNED_IMAGE_CONFIG='.length));
  assert.deepEqual(result, {
    user: '65532:65532',
    workingDirectory: '/app',
    entrypoint: ['/nodejs/bin/node'],
    command: ['server.js'],
    environmentNames: ['PATH', 'PRIVATE_TOKEN'],
    environmentValuesRedacted: true,
    nonemptyLoaderControlsAbsent: true,
    volumePaths: [],
  });
});

test('image config parser rejects malformed JSON with a fixed child message', () => {
  const child = spawnSync(process.execPath, [
    '-e', source, '--', '--image-config',
  ], {
    input: '{"Env":"secret-fragment',
    encoding: 'utf8',
    env: {},
  });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, 'DEV015_ALIGNED_IMAGE_CONFIG_FAILED\n');
});

test('image config rejects nonempty loader variables and mounted volumes', () => {
  assert.throws(() => parseImageConfig(JSON.stringify({
    ...baseConfig(),
    Env: ['LD_PRELOAD=/tmp/secret.so'],
  })));
  assert.throws(() => parseImageConfig(JSON.stringify({
    ...baseConfig(),
    Volumes: { '/app/data': {} },
  })));
});

test('optional path accepts only an absent final entry', () => {
  const io = fakeIo({
    '/': { type: 'directory' },
    '/etc': { type: 'directory' },
    '/etc/ld.so.conf': { type: 'file', contents: 'config' },
  });
  const absent = resolveImagePath('/etc/ld.so.preload', {
    optional: true,
    io,
  });
  assert.equal(absent, null);
  assert.equal(resolveImagePath('/etc/ld.so.conf', { io }).physicalPath, '/etc/ld.so.conf');
});

test('optional path rejects dangling symlink targets', () => {
  const io = fakeIo({
    '/': { type: 'directory' },
    '/lib': { type: 'directory' },
    '/lib/libx.so.1': { type: 'symlink', target: 'libx.so.1.0' },
  });
  assert.throws(() => resolveImagePath('/lib/libx.so.1', { optional: true, io }));
});

test('path resolver propagates permission errors and rejects nonregular targets', () => {
  const denied = fakeIo({
    '/': { type: 'directory' },
  }, {
    '/etc': errno('EACCES'),
  });
  assert.throws(() => resolveImagePath('/etc/ld.so.conf', { optional: true, io: denied }));

  const nonregular = fakeIo({
    '/': { type: 'directory' },
    '/lib': { type: 'directory' },
    '/lib/libx.so': { type: 'directory' },
  });
  assert.throws(() => resolveImagePath('/lib/libx.so', { kind: 'file', io: nonregular }));
});

test('unknown non-file shared-object names are rejected before collection', () => {
  assert.throws(() => validateSharedObjectList([
    'linux-vdso.so.1',
    'unresolved-native-object.so',
  ]));
  assert.throws(() => validateSharedObjectList([
    'linux-vdso.so.1',
    '/lib/x86_64-linux-gnu/libvalid.so',
    '/lib/x86_64-linux-gnu/libvalid.so',
  ]));
});

test('shared-object rows keep the established R66 VDSO and file-backed shapes', () => {
  const io = fakeIo({
    '/': { type: 'directory' },
    '/lib': { type: 'directory' },
    '/lib/libprobe.so': { type: 'file', contents: 'probe bytes' },
  });
  const rows = collectSharedObjectRows([
    'linux-vdso.so.1',
    '/lib/libprobe.so',
  ], io);
  assert.deepEqual(rows[0], {
    path: 'linux-vdso.so.1',
    kind: 'kernel-vdso',
    fileBacked: false,
    sha256: null,
  });
  assert.deepEqual(rows[1], {
    path: '/lib/libprobe.so',
    physicalPath: '/lib/libprobe.so',
    fileBacked: true,
    bytes: Buffer.byteLength('probe bytes'),
    sha256: 'd4051551881c25b0e8713de3e6541c317de4ff2cd28427100438012fa1c9fd9d',
  });
});

test('R66c raw shared-object aliases with parent segments are realpathed before hashing', () => {
  const rawPath = '/app/node_modules/sharp-linux-x64/lib/../../sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.1';
  const physicalPath = '/app/node_modules/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.1';
  const calls = [];
  const io = {
    realpathSync(file) {
      calls.push(file);
      if (file !== rawPath) throw new Error('unexpected path normalization');
      return physicalPath;
    },
    statSync(file) {
      assert.equal(file, physicalPath);
      return { isFile: () => true };
    },
    readFileSync(file) {
      assert.equal(file, physicalPath);
      return Buffer.from('libvips fixture');
    },
  };
  const rows = collectSharedObjectRows(['linux-vdso.so.1', rawPath], io);
  assert.deepEqual(calls, [rawPath]);
  assert.equal(rows[1].path, rawPath);
  assert.equal(rows[1].physicalPath, physicalPath);
  assert.equal(rows[1].fileBacked, true);
  assert.equal(rows[1].bytes, Buffer.byteLength('libvips fixture'));
});
