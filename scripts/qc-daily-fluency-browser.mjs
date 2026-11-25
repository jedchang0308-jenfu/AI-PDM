import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { stopNextApp, waitForNextAppReady } from './qc-next-app-runner.mjs';

// Real app/DOM, controlled synthetic API latency. No production/session/DB access.
const origin = process.env.FLUENCY_ORIGIN ?? 'http://127.0.0.1:13227';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname) || new URL(origin).protocol !== 'http:') throw new Error('Loopback HTTP runtime required');
const baseline = process.argv.includes('--baseline');
const runtimeRoot = baseline ? path.resolve('.tmp/daily-fluency-baseline') : process.cwd();
const runId = process.env.FLUENCY_RUN_ID ?? 'default';
if (!/^[a-z0-9-]+$/u.test(runId)) throw new Error('Invalid fluency run ID');
const child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', new URL(origin).port], {
  cwd: runtimeRoot, env: { ...process.env, PDM_DB_PROVIDER: 'sqlite', PDM_DATA_DIR: path.join(runtimeRoot, `.tmp/daily-fluency-data-${runId}`), PDM_REPOSITORY_DIR: path.join(runtimeRoot, `.tmp/daily-fluency-data-${runId}/repository`), PDM_NEXT_DIST_DIR: `.tmp/daily-fluency-next-${runId}` }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = ''; child.stdout.on('data', chunk => { serverOutput += chunk; }); child.stderr.on('data', chunk => { serverOutput += chunk; });
console.log(`task-owned Next PID=${child.pid} port=${new URL(origin).port} root=${runtimeRoot}`);
async function prepareBrowser() {
  try {
    await waitForNextAppReady(origin, () => serverOutput);
    for (const route of ['/', '/numbering/drawings', '/numbering/create?from=drawing', '/numbering/drawings/drawing-a/workspace?workId=work-a', '/parts/part-a/workspace?workId=part-work-a']) await fetch(origin + route, { signal: AbortSignal.timeout(60_000) });
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (error) { await stopNextApp(child); throw error; }
}
const output = path.resolve('output/playwright/daily-fluency', runId); fs.mkdirSync(output, { recursive: true });
const codes = fs.readFileSync('src/lib/numbering-permission-codes.ts', 'utf8');
const names = [...codes.matchAll(/"([a-z][a-z_.]+)"/g)].map(m => m[1]);
let actor = 'actor-a', failList = false, listRequests = 0, mutations = 0;
let drawingVersion = 1, drawingNote = '伺服器圖號備註', partVersion = 1, failPartSave = true;
let assemblyStatus = 200, assemblyReads = 0;
let identityGate = null;
let partPayload = { partName: '量測料件', itemKind: 'manufactured', customSpecification: null, isUniversal: false, materialCode: null, materialLabel: null, colorCode: null, colorLabel: null, surfaceTreatment: null, variantNote: null };
const row = { rowKey: 'daily-drawing', entityType: 'drawing', entityId: 'drawing-a', code: 'DAILY-M01', name: '日常操作量測圖面', layer: 'rd', layerLabel: '研發版', revision: '1.1', dataState: 'editing', dataStateLabel: '編輯中', handling: 'owner', handlingLabel: '負責人處理', blockerReason: null, detailHref: '/numbering/drawings/drawing-a/workspace?workId=work-a', rowVersion: 1, basisState: 'current', actions: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await prepareBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await context.addInitScript(() => { const nativeNow = Date.now; window.__fluencyAge = 0; Date.now = () => nativeNow() + window.__fluencyAge; });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await context.route('**/api/**', async route => {
  const url = new URL(route.request().url()), p = url.pathname;
  if (!['GET', 'HEAD'].includes(route.request().method()) && p !== '/api/numbering/duplicate-check') mutations++;
  let body = {}, status = 200;
  if (p === '/api/auth/me') { if (identityGate) await identityGate; await sleep(650); body = { user: { id: actor, display_name: actor, companies: [], default_company: { id: 'company-a' } }, session: { principalId: actor, companyId: 'company-a' } }; }
  else if (p === '/api/numbering/permissions') body = { contractVersion: 'ai-pdm.frontend-permission-projection.v1', applicationId: 'ai-pdm', generatedAt: new Date().toISOString(), pages: Object.fromEntries(names.map(k => [k, true])), actions: Object.fromEntries(names.map(k => [k, true])) };
  else if (p === '/api/numbering/drawings/workbench') { listRequests++; await sleep(650); status = failList ? 503 : 200; body = failList ? { message: '受控背景更新失敗' } : { data: { groups: [{ groupKey: 'daily', rows: [row] }], nextCursor: null, previousCursor: null, previewEnabled: false, totalGroups: 1, totalRows: 1 }, meta: { contractToken: 'fresh-fixture-only', correlationId: 'daily' } }; }
  else if (p === '/api/numbering/series-codes') body = { seriesCodeOptions: ['A'] };
  else if (p === '/api/pdm/drawing-revision-works/work-a/assembly-packages') { assemblyReads++; status = assemblyStatus; body = status === 200 ? { data: null } : { error: { message: '受控組立包拒絕' } }; }
  else if (p === '/api/pdm/drawing-revision-works/work-a') {
    await sleep(650);
    if (route.request().method() === 'PATCH') { drawingVersion++; drawingNote = route.request().postDataJSON().changeImpact.note; }
    body = { data: { entityType: 'drawing', entityId: 'drawing-a', workId: 'work-a', rowVersion: drawingVersion, revision: '1.1', readonly: false, identity: { code: 'DAILY-M01' }, changeImpactRequired: true, payload: { changeImpact: { formState: 'no_impact', fitState: 'no_impact', functionState: 'no_impact', note: drawingNote } }, files: [], interaction: { mode: 'owner_edit', basisState: 'current', canMutateContent: true, canSubmit: true, canCancel: true } }, meta: { contractToken: 'fresh-drawing-only' } };
  }
  else if (p === '/api/pdm/parts/part-a/matrix-workspace') { await sleep(650); body = { data: { root: { id: 'root-a', code: 'DAILY' }, sourcePartId: 'part-a', sourceRowKey: 'part-row', columns: [{ partId: 'part-a', partNumber: 'DAILY-P01', sequenceNo: 1, formalRowVersion: 1, recordStatus: 'Released', lifecycleIntent: 'edit', canRequestRelease: false, handling: 'owner', canEdit: true, canSubmit: true, disabledReason: null, workId: 'part-work-a', workRowVersion: partVersion, workOwner: { id: actor }, valueSource: 'work', payload: partPayload, formalPayload: partPayload, attachmentCount: 0, confirmedAttributes: [] }] }, meta: { actorId: actor, companyId: 'company-a', contractToken: 'fresh-part-only' } }; }
  else if (p === '/api/pdm/part-change-works/part-work-a') {
    await sleep(650);
    if (failPartSave) { status = 503; body = { error: { message: '受控儲存失敗' } }; }
    else { partPayload = route.request().postDataJSON(); partVersion++; body = { data: { workId: 'part-work-a', rowVersion: partVersion, payload: partPayload } }; }
  }
  else if (p.includes('preview')) body = { estimated: true, observedAt: new Date().toISOString(), nextNumbers: { root: 'A0001', part: 'A0001-P01', drawing: 'A0001-M01' } };
  else if (p.includes('duplicate')) body = { blocked: false, warningsOnly: false, matches: [] };
  else if (p.includes('/inbox')) body = { rows: [], data: [], summary: { pending: 0 }, total: 0 };
  else if (p.includes('production-slice')) body = { active: false, configured: false };
  await route.fulfill({ status, json: body });
});
const measurements = {};
async function measure(label, action, visible) { const start = performance.now(); await action(); await visible(); measurements[label] = Math.round(performance.now() - start); }
try {
  await measure('homeFirstMs', () => page.goto(origin), () => page.getByRole('heading', { name: '工作台', exact: true }).waitFor());
  await measure('listFirstMs', () => page.locator('a[href="/numbering/drawings"]').first().click(), () => page.getByText(row.name, { exact: true }).first().waitFor());
  await page.locator('a[href="/"]').first().click(); await page.getByRole('heading', { name: '工作台', exact: true }).waitFor();
  const beforeFresh = listRequests;
  await measure('listFreshReturnMs', () => page.locator('a[href="/numbering/drawings"]').first().click(), () => page.getByText(row.name, { exact: true }).first().waitFor());
  await sleep(100); measurements.freshReturnRequests = listRequests - beforeFresh;
  await page.locator('a[href="/"]').first().click(); await page.getByRole('heading', { name: '工作台', exact: true }).waitFor();
  await page.evaluate(() => { window.__fluencyAge += 31_000; });
  const beforeReturn = listRequests;
  await measure('listStaleReturnMs', () => page.locator('a[href="/numbering/drawings"]').first().click(), () => page.getByText(row.name, { exact: true }).first().waitFor());
  await sleep(800); measurements.staleReturnRequests = listRequests - beforeReturn;
  await page.locator('a[href="/"]').first().click(); await page.getByRole('heading', { name: '工作台', exact: true }).waitFor();
  await page.evaluate(() => { window.__fluencyAge += 31_000; });
  failList = true;
  await page.locator('a[href="/numbering/drawings"]').first().click(); await sleep(900);
  measurements.listRetainedOn503 = await page.getByText(row.name, { exact: true }).first().isVisible();
  await measure('createFirstMs', () => page.goto(`${origin}/numbering/create?from=drawing`), () => page.getByPlaceholder('例如：馬達、固定座').waitFor());
  await page.getByPlaceholder('例如：馬達、固定座').fill('草稿復原量測');
  if (!baseline) await page.getByText('已保留本機草稿，尚未儲存至伺服器。', { exact: true }).waitFor();
  await sleep(150);
  await page.reload(); await page.getByPlaceholder('例如：馬達、固定座').waitFor();
  if (baseline) measurements.draftRecovered = (await page.getByPlaceholder('例如：馬達、固定座').inputValue()) === '草稿復原量測';
  else {
    await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
    assert.equal(await page.getByPlaceholder('例如：馬達、固定座').inputValue(), '草稿復原量測');
    measurements.draftRecovered = true;
    assert.equal(mutations, 0, 'recovery must not create business records');
    actor = 'actor-b'; await page.reload();
    await page.getByPlaceholder('例如：馬達、固定座').waitFor(); await sleep(800);
    assert.equal(await page.getByPlaceholder('例如：馬達、固定座').inputValue(), '');
    assert.equal(await page.getByRole('button', { name: '恢復草稿', exact: true }).count(), 0);
    measurements.accountIsolated = true;
    actor = 'actor-a'; await page.reload();
    await page.getByRole('button', { name: '恢復草稿', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'draft-recovery.png'), fullPage: true });
    await page.getByRole('button', { name: '捨棄草稿', exact: true }).click();
    await page.reload(); await page.getByPlaceholder('例如：馬達、固定座').waitFor(); await sleep(800);
    assert.equal(await page.getByRole('button', { name: '恢復草稿', exact: true }).count(), 0);
    measurements.discardVerified = true;
    assert.equal(measurements.listRetainedOn503, true);
  }
  await measure('drawingFormMs', () => page.goto(`${origin}/numbering/drawings/drawing-a/workspace?workId=work-a`), () => page.getByLabel(/判定備註/).waitFor());
  await page.getByLabel(/判定備註/).fill('圖號未儲存文字');
  if (!baseline) await page.getByText('已保留本機草稿，尚未儲存至伺服器。', { exact: true }).waitFor();
  await page.reload(); await page.getByLabel(/判定備註/).waitFor();
  measurements.drawingRecovery = false;
  if (!baseline) {
    await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
    assert.equal(await page.getByLabel(/判定備註/).inputValue(), '圖號未儲存文字');
    measurements.drawingRecovery = true;
    drawingVersion++; drawingNote = '伺服器較新內容'; await page.reload();
    await page.getByText('伺服器版本已變更，本機草稿僅供比對。', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/判定備註/).inputValue(), drawingNote);
    assert.equal(await page.getByRole('button', { name: '恢復草稿', exact: true }).count(), 0);
    measurements.serverVersionConflict = true;
    await page.screenshot({ path: path.join(output, 'version-conflict.png'), fullPage: true });
    await page.getByRole('button', { name: '捨棄草稿', exact: true }).click();
    let releaseIdentity;
    identityGate = new Promise(resolve => { releaseIdentity = resolve; });
    assemblyStatus = 403; await page.reload();
    await page.getByText('目前無權限讀取組立包。', { exact: true }).waitFor();
    const deniedReads = assemblyReads;
    await page.getByLabel(/判定備註/).fill('組立包拒絕後仍可編輯');
    releaseIdentity(); identityGate = null;
    await page.getByText('已保留本機草稿，尚未儲存至伺服器。', { exact: true }).waitFor();
    measurements.assemblyDeniedBeforeIdentityRetainsDraft = true;
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    await page.getByText('已儲存', { exact: true }).waitFor();
    assert.equal(drawingNote, '組立包拒絕後仍可編輯');
    await sleep(16000);
    assert.equal(assemblyReads, deniedReads, 'a denied package must not poll repeatedly');
    assert.equal(await page.getByLabel(/判定備註/).inputValue(), drawingNote);
    await page.screenshot({ path: path.join(output, 'assembly-forbidden-editor-retained.png'), fullPage: true });
    measurements.assemblyForbiddenEditorRetained = true;
    assemblyStatus = 401; await page.reload();
    await page.getByText('身分或權限已變更，請重新開啟工作資料。', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/判定備註/).count(), 0);
    measurements.invalidSessionEditorClosed = true;
    assemblyStatus = 200;
  }
  await measure('partFormMs', () => page.goto(`${origin}/parts/part-a/workspace?workId=part-work-a`), () => page.locator('[data-cell="part-a:variantNote"] textarea').waitFor());
  const partNote = page.locator('[data-cell="part-a:variantNote"] textarea');
  await partNote.fill('料號儲存失敗仍保留');
  if (!baseline) await page.getByText('已保留本機草稿，尚未儲存至伺服器。', { exact: true }).waitFor();
  await page.getByText('受控儲存失敗', { exact: true }).first().waitFor();
  await page.reload(); await partNote.waitFor(); measurements.partRecovery = false;
  if (!baseline) {
    failPartSave = false;
    await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
    assert.equal(await partNote.inputValue(), '料號儲存失敗仍保留');
    await page.getByText('已自動儲存', { exact: true }).waitFor();
    await page.reload(); await partNote.waitFor();
    assert.equal(await partNote.inputValue(), '料號儲存失敗仍保留');
    assert.equal(await page.getByRole('button', { name: '恢復草稿', exact: true }).count(), 0);
    measurements.partRecovery = true;
  }
  assert.deepEqual(errors, []);
  const report = { mode: baseline ? 'baseline' : 'improved', source: process.env.FLUENCY_SOURCE ?? 'working-tree', environment: 'isolated Next dev, headless Chromium, synthetic APIs, 650ms delay; no production acceptance', measurements, listRequests, mutations, errors };
  fs.writeFileSync(path.join(output, `${report.mode}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), errors, visible: (await page.locator('body').innerText()).slice(0, 2000) }));
  await page.screenshot({ path: path.join(output, baseline ? 'baseline-failure.png' : 'improved-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); await stopNextApp(child); }
