# PDM Drawing Submission UI Operation Scenario Report

Generated: 2026-08-06T06:55:35.231Z
Base URL: http://127.0.0.1:3000
Result: 0/14 passed, 14 failed

## Fixture Setup

- D-QC-SUBMIT-MA1: created - Created minimal local D-QC-SUBMIT-MA1 fixture for real UI route checks; setup is not counted as UI evidence. QC-owned fixture rows and local files were removed after browser evidence was captured.
- Fixture setup is test data preparation only; pass/fail evidence comes from browser UI operations and screenshots.

| ID | Status | Scenario | Detail |
|---|---|---|---|
| AUTH-001 | fail | 三種測試角色可用登入頁表單登入 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| REAL-001 | fail | 從圖號模組點選 QC 專用圖號送審入口 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| REAL-002 | fail | Legacy drawing upload route 不回到泛用上傳表單 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| REAL-003 | fail | 泛用 /upload 已退役且導向受控來源 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| REAL-004 | fail | 既有送審明細導向同一 QC 專用正式紀錄 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-READY-001 | fail | 可送審狀態：備註與附件條件控制送出審核 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-READY-002 | fail | 未選附件時阻擋送審 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-BLOCKER-001 | fail | 主資料缺漏 blocker 與同版次 blocker 分層顯示 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-BLOCKER-002 | fail | Pending / Releasing / Released / History 狀態 UI 分流 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-RELFAIL-001 | fail | 發行未完成可整理附件並建立修正送審 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-PERM-001 | fail | 建立修正送審被權限阻擋時顯示中文 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-DETAIL-001 | fail | 送審明細：Pending 取消、非建立者限制、發行未完成角色差異 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| MOCK-DETAIL-002 | fail | 送審明細：受限摘要與找不到資料 | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
| RWD-001 | fail | 核心工作台 viewport 無水平 overflow | locator.click: Error: strict mode violation: getByRole('button', { name: /登入/ }) resolved to 2 elements:
    1) <button disabled type="button" title="未開放：Google OAuth 憑證尚未完成設定" aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定" class="secondary-button google-auth-button is-unopened">…</button> aka getByRole('button', { name: '使用 Google 帳號登入，未開放：Google' })
    2) <button type="submit" class="primary-button">…</button> aka getByRole('button', { name: '登入', exact: true })

Call log:
[2m  - waiting for getByRole('button', { name: /登入/ })[22m
 |
