import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

test('single-space child overrides prevent Next dotenv from restoring formal auth and base URL values', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'ai-pdm-next-env-'));
  const formalKeys = [
    'JENFU_FIREBASE_PROJECT_ID', 'JENFU_IDENTITY_ISSUER', 'JENFU_IDENTITY_AUDIENCE',
    'PDM_FIREBASE_PROJECT_ID', 'PDM_FIREBASE_API_KEY', 'PDM_FIREBASE_AUTH_DOMAIN', 'PDM_FIREBASE_APP_ID',
    'PDM_JENFU_SSO_BROKER_ORIGIN',
  ];
  const sandboxOrigin = 'http://localhost:12020';

  try {
    for (const key of formalKeys) process.env[key] = ' ';
    process.env.PDM_PUBLIC_BASE_URL = sandboxOrigin;

    const envFile = [
      ...formalKeys.map((key) => `${key}=synthetic-formal-value`),
      'PDM_PUBLIC_BASE_URL=https://synthetic-formal.example',
    ].join('\n');
    await writeFile(path.join(project, '.env.local'), envFile, 'utf8');

    const loaded = loadEnvConfig(project, true, { info() {}, error() {} }, true);

    const localEnv = loaded.loadedEnvFiles.find((file) => file.path === '.env.local');
    assert.ok(localEnv);
    for (const key of formalKeys) {
      assert.match(localEnv.contents, new RegExp(`^${key}=synthetic-formal-value$`, 'm'));
      assert.equal(process.env[key], ' ');
      assert.equal(process.env[key].length, 1);
      assert.equal(process.env[key].trim(), '');
    }
    assert.match(localEnv.contents, /^PDM_PUBLIC_BASE_URL=https:\/\/synthetic-formal\.example$/m);
    assert.equal(process.env.PDM_PUBLIC_BASE_URL, sandboxOrigin);
  } finally {
    const tempRoot = await realpath(os.tmpdir());
    const ownedProject = await realpath(project);
    assert.equal(path.dirname(ownedProject), tempRoot);
    assert.ok(path.basename(ownedProject).startsWith('ai-pdm-next-env-'));
    await rm(ownedProject, { recursive: true, force: true });
  }
});
