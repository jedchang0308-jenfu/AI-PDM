import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('local workload bootstrap isolates child credentials, preserves scope, and restores parent environment', { skip: process.platform !== 'win32' }, () => {
  const prefix = path.join(os.tmpdir(), 'aipdm-local-workload-contract-');
  const directory = fs.mkdtempSync(prefix);
  try {
    const driver = fileURLToPath(new URL('./local-workload-auth.test.ps1', import.meta.url));
    const childEnvironment = { ...process.env };
    // PowerShell 7's module path must not override Windows PowerShell 5's native modules.
    delete childEnvironment.PSModulePath;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', driver, '-TestDirectory', directory], { encoding: 'utf8', timeout: 45000, windowsHide: true, env: childEnvironment });
    assert.equal(result.status, 0, result.stderr || result.error?.message || 'PowerShell contract failed');
    const observed = JSON.parse(result.stdout.trim());
    assert.equal(observed.passed, true);
    assert.equal(observed.secretMaterialPrinted, false);
    assert.equal(observed.primaryRuntimeStarted, false);
    assert.equal(observed.databaseTouched, false);
    assert.equal(observed.checks.length, 19);
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(prefix)) && path.dirname(resolved) === path.resolve(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
