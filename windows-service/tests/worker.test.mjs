import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function exercise(mode) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aipdm-dev125-worker-'));
  const previousProgramData = process.env.ProgramData;
  const previousFetch = globalThis.fetch;
  const calls = [];
  let stopped = false;
  let credentialReads = 0;
  let probePolls = 0;
  let clock = 0;
  const end = { backoff: 360_000, queued: 90_000, 'permission-restored': 60_000 }[mode];
  const arrivals = { queued: [16_000, 36_000, 61_000], 'permission-restored': [30_000, 44_000] }[mode] ?? [];
  let claimed = 0;
  const credential = { baseUrl: 'https://pdm.example', token: 'synthetic-device-token' };
  const leaseBasis = { companyId: 'company-one', sourceFileAssetId: 'asset-one', sourceContentHash: 'a'.repeat(64),
    attemptCount: 1, lockedAt: '2026-10-28T00:00:00.000Z' };
  try {
    const stagedService = path.join(temporary, 'install', 'service');
    await fs.mkdir(stagedService, { recursive: true });
    for (const name of ['worker.mjs', 'metadata-mapper.mjs']) {
      await fs.copyFile(path.resolve('windows-service/service', name), path.join(stagedService, name));
    }
    await fs.copyFile(path.resolve('config/solidworks-metadata-field-aliases.json'),
      path.join(stagedService, 'solidworks-metadata-field-aliases.json'));
    process.stdout.write(`${JSON.stringify({runtimeDeclaration:{project:process.cwd(),purpose:'isolated installed-worker request ordering',port:null,owningProcessTree:'node --test -> staged Windows worker module',PDM_DATA_DIR:temporary,PDM_REPOSITORY_DIR:temporary,mutationScope:temporary,cleanupCondition:'restore fetch/environment and remove exact test root'}})}\n`);
    process.env.ProgramData = temporary;
    const { runWindowsWorker } = await import(pathToFileURL(path.join(stagedService, 'worker.mjs')).href);
    globalThis.fetch = async (address, init) => {
      const url = new URL(address);
      calls.push({ at: clock, path: url.pathname, query: url.searchParams, headers: init.headers,
        body: init.body ? JSON.parse(init.body) : null });
      if (url.pathname === '/api/settings-secret-probe-jobs/claim') {
        probePolls += 1;
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/preview-jobs/claim') {
        if (mode === 'preview-forbidden') return Response.json({ error: 'WORKLOAD_FORBIDDEN' }, { status: 403 });
        return Response.json({ job: end || ['idle','recognition-retry','recognition-forbidden'].includes(mode) ? null : {
        jobId: 'job-one', sourceFileAssetId: 'asset-one', sourceContentHash: leaseBasis.sourceContentHash,
        sourceExtension: 'sldprt', leaseBasis
        } });
      }
      if (url.pathname === '/api/recognition-jobs/claim') {
        if (mode === 'backoff' || (mode === 'permission-restored' && clock < arrivals[0])) {
          return Response.json({ error: 'WORKLOAD_FORBIDDEN' }, { status: 403 });
        }
        if (end) {
          if (clock < (arrivals[claimed] ?? Infinity)) return new Response(null, { status: 204 });
          claimed += 1;
          return Response.json({ sessionId: `queued-${claimed}`,
            leaseBasis: { companyId: 'company-one', sourceSetFingerprint: 'source-set-one', attemptCount: 1,
              lockedAt: leaseBasis.lockedAt },
            sources: [{ id: 'source-one', fileName: 'owned.pdf', fileExt: 'pdf', sourceRole: 'drawing' }] });
        }
        if (mode === 'recognition-forbidden') { stopped = true; return Response.json({ error: 'WORKLOAD_FORBIDDEN' }, { status: 403 }); }
        if (mode === 'recognition-retry') return Response.json({ sessionId: 'session-one',
          leaseBasis: { companyId: 'company-one', sourceSetFingerprint: 'source-set-one', attemptCount: 1,
            lockedAt: leaseBasis.lockedAt }, sources: [{ id: 'source-one', fileName: 'owned.slddrw', fileExt: 'slddrw' }] });
        stopped = true; return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/preview-jobs/job-one/heartbeat') return Response.json({ ok: true });
      if (url.pathname === '/api/preview-workers/solidworks-document-manager-key') {
        if (url.searchParams.get('readiness') === '1') {
          if (mode === 'unready') stopped = true;
          return Response.json({ available: mode !== 'unready' });
        }
        credentialReads += 1;
        if (mode === 'key-denied') return Response.json({ error: 'WORKER_JOB_LEASE_REQUIRED' }, { status: 403 });
        if (credentialReads === 1 && ['key-missing','key-unavailable','recognition-retry'].includes(mode)) {
          return Response.json({ error: 'DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED' }, { status: mode === 'key-missing' ? 404 : 503 });
        }
        return Response.json({ key: 'synthetic-native-license', version: 2, fingerprint: 'fixture' });
      }
      if (url.pathname === '/api/preview-workers/heartbeat' || url.pathname === '/api/recognition-workers/heartbeat') {
        return Response.json({ ok: true });
      }
      // Stop before a native executable or CAD write. This test proves request
      // ordering and lease propagation; native processing has separate evidence.
      if (url.pathname === '/api/preview-jobs/job-one/content') return new Response(null, { status: 409 });
      if (url.pathname === '/api/recognition-jobs/session-one/sources/source-one/content') return new Response(null, { status: 409 });
      if (url.pathname === '/api/preview-jobs/job-one/complete') { stopped = true; return Response.json({ ok: true }); }
      if (url.pathname === '/api/recognition-jobs/session-one/complete') { stopped = true; return Response.json({ ok: true }); }
      if (url.pathname === '/api/recognition-jobs/session-one/heartbeat') return Response.json({ ok: true });
      if (/^\/api\/recognition-jobs\/queued-\d+\/(heartbeat|complete)$/u.test(url.pathname)) {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected test endpoint ${url.pathname}`);
    };
    let error = null;
    try {
      await runWindowsWorker({ credentials: credential, workerId: 'device-one:instance-one', isStopping: () => stopped,
        now: () => clock, sleep: async milliseconds => {
          assert.ok(milliseconds > 0 && milliseconds <= 5_000);
          clock += milliseconds;
          if (clock >= end) stopped = true;
        }, log() {} });
    } catch (caught) {
      if (mode !== 'key-denied') throw caught;
      error = caught;
    }
    return { calls, leaseBasis, error, probePolls };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProgramData === undefined) delete process.env.ProgramData;
    else process.env.ProgramData = previousProgramData;
    assert.ok(temporary.startsWith(path.join(os.tmpdir(), 'aipdm-dev125-worker-')));
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

test('empty and forbidden claims back off independently with bounded delays', async () => {
  const { calls } = await exercise('backoff');
  const times = route => calls.filter(call => call.path === route).map(call => call.at);
  const preview = times('/api/preview-jobs/claim');
  const recognition = times('/api/recognition-jobs/claim');
  const probe = times('/api/settings-secret-probe-jobs/claim');
  assert.deepEqual(preview.slice(0, 5), [0, 5_000, 15_000, 35_000, 55_000]);
  assert.ok(preview.slice(3).every((time, index) => time - preview[index + 2] === 20_000));
  assert.equal(preview.length, 20);
  assert.deepEqual(probe, preview);
  assert.deepEqual(recognition, [0, 15_000, 45_000, 105_000, 225_000, 345_000]);
  assert.deepEqual(times('/api/preview-workers/solidworks-document-manager-key'),
    [...new Set([...preview, ...recognition])].sort((a, b) => a - b));
});

for (const [mode, expectedCompletionTimes, nextEmptyPoll] of [
  ['queued', [35_000, 40_000, 75_000], 80_000],
  ['permission-restored', [45_000, 45_000], 50_000]
]) {
  test(`${mode} completes every offered task with its lease heartbeat and resets the claim delay`, async () => {
    const { calls } = await exercise(mode);
    const completions = calls.filter(call => call.path.endsWith('/complete'));
    assert.deepEqual(completions.map(call => call.at), expectedCompletionTimes);
    for (const completion of completions) {
      assert.equal(completion.body.results[0].status, 'succeeded');
      const pulse = calls.find(call => call.path === completion.path.replace('/complete', '/heartbeat'));
      assert.ok(pulse && calls.indexOf(pulse) < calls.indexOf(completion));
      assert.deepEqual(pulse.body.leaseBasis, completion.body.leaseBasis);
    }
    const afterCompletion = calls.slice(calls.indexOf(completions.at(-1)) + 1)
      .filter(call => call.path === '/api/recognition-jobs/claim');
    assert.deepEqual(afterCompletion.slice(0, 2).map(call => call.at),
      [expectedCompletionTimes.at(-1), nextEmptyPoll]);
  });
}

test('an idle device does not fetch a Document Manager credential or consume work', { timeout: 15000 }, async () => {
  const { calls } = await exercise('idle');
  assert.deepEqual(calls.map(call => call.path), [
    '/api/settings-secret-probe-jobs/claim', '/api/preview-workers/solidworks-document-manager-key',
    '/api/preview-jobs/claim', '/api/recognition-jobs/claim'
  ]);
  assert.equal(calls[1].query.get('readiness'), '1');
});

test('a device requests the native key only after claim and sends the exact job lease', { timeout: 15000 }, async () => {
  const { calls, leaseBasis } = await exercise('claimed');
  const claim = calls.findIndex(call => call.path === '/api/preview-jobs/claim');
  const key = calls.findIndex(call => call.path === '/api/preview-workers/solidworks-document-manager-key' && !call.query.has('readiness'));
  const source = calls.findIndex(call => call.path === '/api/preview-jobs/job-one/content');
  assert.ok(claim >= 0 && key > claim && source > key);
  assert.equal(calls[key].query.get('kind'), 'preview');
  assert.equal(calls[key].query.get('jobId'), 'job-one');
  assert.deepEqual(JSON.parse(Buffer.from(calls[key].headers['x-pdm-preview-lease'], 'base64url').toString('utf8')),
    { leaseProtocolVersion: 2, leaseBasis });
  assert.equal(calls.filter(call => call.path === '/api/preview-workers/solidworks-document-manager-key' && !call.query.has('readiness')).length, 1);
});

test('no active native credential leaves queued business work unclaimed', { timeout: 15000 }, async () => {
  const { calls } = await exercise('unready');
  assert.equal(calls.some(call => call.path === '/api/preview-jobs/claim' || call.path === '/api/recognition-jobs/claim'), false);
  assert.equal(calls.filter(call => call.path === '/api/preview-workers/solidworks-document-manager-key' && !call.query.has('readiness')).length, 0);
});

for (const mode of ['preview-forbidden', 'recognition-forbidden']) {
  test(`${mode} skips only the unavailable capability and keeps the linked device alive`, { timeout: 15000 }, async () => {
    const { calls, error } = await exercise(mode);
    assert.equal(error, null);
    assert.equal(calls.some(call => call.path === '/api/preview-jobs/claim'), true);
    assert.equal(calls.some(call => call.path === '/api/recognition-jobs/claim'), true);
    assert.equal(calls.some(call => call.path.endsWith('/complete')), false);
  });
}

for (const mode of ['key-missing', 'key-unavailable', 'recognition-retry']) {
  test(`${mode} waits on the same claim instead of failing or consuming another attempt`, { timeout: 20000 }, async () => {
    const { calls, probePolls } = await exercise(mode);
    const keys = calls.filter(call => call.path === '/api/preview-workers/solidworks-document-manager-key' && !call.query.has('readiness'));
    assert.equal(keys.length, 2);
    const kind = mode === 'recognition-retry' ? 'recognition' : 'preview';
    assert.equal(keys.every(call => call.query.get('kind') === kind), true);
    assert.deepEqual(keys[0].headers, keys[1].headers);
    assert.equal(calls.filter(call => call.path === `/api/${kind}-jobs/claim`).length, 1);
    assert.equal(probePolls, 2);
    const recoveryProbe = calls.findIndex((call, index) => index > calls.indexOf(keys[0]) &&
      call.path === '/api/settings-secret-probe-jobs/claim');
    assert.ok(recoveryProbe > calls.indexOf(keys[0]) && recoveryProbe < calls.indexOf(keys[1]));
    const completionIndex = calls.findIndex(call => call.path.endsWith('/complete'));
    assert.ok(completionIndex > calls.indexOf(keys[1]));
  });
}

test('lease denial stops the worker without completing the business job as failed', { timeout: 15000 }, async () => {
  const { calls, error } = await exercise('key-denied');
  assert.equal(error?.status, 403);
  assert.equal(calls.some(call => call.path.endsWith('/complete')), false);
});
