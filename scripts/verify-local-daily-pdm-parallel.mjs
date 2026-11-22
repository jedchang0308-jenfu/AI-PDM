import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const managedPort = 1020;
const standalonePort = 1021;
assert.ok(process.argv[2] === undefined || Number(process.argv[2]) === managedPort,
  'The daily integrated PDM uses port 1020.');
const portal = 'http://localhost:1000';
const standalonePortal = 'http://localhost:1001';
const pdm = port => `http://localhost:${port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PDM_VERIFY_EDGE === '1' ? { channel: 'msedge' } : {}) });

try {
  const context = await browser.newContext();
  const managed = await context.newPage();
  const standalone = await context.newPage();
  const options = { timeout: 90_000, waitUntil: 'domcontentloaded' };

  for (const [page, loginOrigin] of [[managed, portal], [standalone, standalonePortal]]) {
    await page.goto(loginOrigin + '/login', options);
    await page.getByRole('button', { name: '使用測試用超級管理員' }).click({ timeout: options.timeout });
    await page.waitForURL(loginOrigin + '/', options);
  }

  // Exercise two real browser SSO chains in the same cookie jar, using the
  // Portal launch endpoint for the managed instance and the normal app start
  // endpoint for the standalone instance.
  // Keep the two browser SSO handoffs sequential. The acceptance criterion is
  // independent login/redirect behavior for both live origins; starting two
  // first-time OAuth handoffs concurrently would exercise the Portal runtime
  // initializer race rather than the port-allocation contract.
  await managed.goto(portal + '/api/local-sandbox/launch?application_id=ai-pdm', options);
  await standalone.goto(pdm(standalonePort) + '/api/auth/local-sandbox/start', options);
  assert.equal(new URL(managed.url()).origin, pdm(managedPort));
  assert.equal(new URL(standalone.url()).origin, pdm(standalonePort));

  async function readSubmitted(page) {
    const origin = new URL(page.url()).origin;
    const identity = await page.request.get(origin + '/api/auth/me', { timeout: options.timeout });
    assert.equal(identity.status(), 200, 'Native PDM session is not authenticated.');
    const inbox = await page.request.get(origin + '/api/approvals/inbox?view=submitted&status=all', { timeout: options.timeout });
    assert.equal(inbox.status(), 200, 'PDM submitted approvals were not readable.');
    const { items } = await inbox.json();
    assert.ok(Array.isArray(items) && items.length > 0, 'Expected at least one existing submission.');
    return items.map(({ id, requestId, itemCode, status }) => ({ id, requestId, itemCode, status }));
  }
  const [managedRows, standaloneRows] = await Promise.all([readSubmitted(managed), readSubmitted(standalone)]);
  assert.deepEqual(managedRows, standaloneRows);
  const cookieNames = (await context.cookies()).map(cookie => cookie.name);
  assert.ok(cookieNames.includes('pdm_local_principal_shared_daily_integrated'));
  assert.ok(cookieNames.includes('pdm_local_principal_shared_daily_standalone'));
  console.log(JSON.stringify({ managedPort, standalonePort, sso: 'passed', sharedSubmittedItems: managedRows.length }));
} finally {
  await browser.close();
}
