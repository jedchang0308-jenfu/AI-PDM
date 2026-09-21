# DEV-118 118-A PDM 本地登入入口 QC Receipt

- 日期：2026-09-17
- 範圍：AI-PDM 本地 118-A；不含 Platform 118-B、正式 118-C
- Branch：`codex/dev-013-ai-pdm`
- 結果：`PASS`（本地切片）
- 最新續行：A03 completion audit修正與A06 viewport補驗已完成，browser **30/30**；以下原12/12為歷史，最新證據見文末。118-B local implementation gate 已由 Platform／OrgMaster owner evidence 交付；provider／target與118-C仍未交付。

2026-09-17 續行交接更新：Platform DEV-014 的 R1～R5 source closure、targeted `62／62`、LOGIN PG `5／5`、S2 `7／7`、build／regression，以及 OrgMaster DEV-049 的 `jenfu.managed-login.v1` owner receipt／migration 013／CAS／barrier／local QA 已交付。2026-09-18依風險式發布新規，這不改本receipt的118-A範圍；118-B local development已完成，provider／target與PDM C01／C02四格改列118-C Protected Release的`NOT_RUN` evidence，不再因staging fixture標為開發BLOCKED。

## 通過證據

| 驗證 | 結果 |
|---|---:|
| `npm run qc:dev-118:contract` | 10/10 PASS |
| `npm run qc:dev-118:browser` | 12/12 PASS |
| `npm run test:dev-013` | 3/3 PASS |
| `npm run qc:dev-046-login-alias` | 21/21 PASS |
| `npm run typecheck:app` | PASS |
| `npm run build:isolated` | PASS；artifact／primary invariant／cleanup=true |
| `git diff --check` | PASS |

Browser manifest：`output/qa/dev-118-login-entry/DEV118-browser-2026-09-17T00-48-58-748Z/manifest.json`。
它操作實際編譯登入頁，覆蓋 loading、SSO ready、設定 unavailable、managed compatibility、390×844／748×698 viewport、console/page error sweep、source revision／dirty fingerprint 與 `next-env` 還原；`productionConnected=false`、`productionMutation=false`，未注入成功 session。截圖位於 manifest 同層 `screenshots/`。

## 已落地行為

- SSO 靜態設定由 `auth-config.ts` 單一解析；缺 broker、base、platform mode 或非法 origin／mode 時，`/api/auth/mode` 回固定 503、`no-store`，不降級成 managed。
- SSO ready 時 PDM 只顯示「使用鉦富平台登入」，直接 Google 與一般密碼表單隱藏。
- mode loading／unavailable 不渲染可提交表單；unavailable 顯示就地錯誤與重試，晚回 response 不覆蓋新狀態。
- SSO off／demo／managed compatibility 保留既有入口；工號仍是同一核准 provider 身分的 alias，不是 PDM 自有密碼。

## 未宣稱與下一步

Platform／OrgMaster local implementation已由118-B owner evidence交付；本receipt仍不包含Google／工號真實provider互動、跨app target handoff或C01／C02四格。118-C依authentication／authorization風險採Protected Release並沿用既有owner workflow；不新增staging前置或第二次批准。本receipt不代表provider、production、deploy、traffic或DB已執行。

本次 task-owned browser runtime、4501／62707／3000 ports 與 `.tmp` 目錄均已清理；使用者原有 production browser tab 未導覽或關閉。

## 2026-09-17 completion recheck

- Current HEAD：`5d4b5f129`；DEV-118 implementation commit `de4c3c629` 是其 ancestor。
- `de4c3c629..HEAD` 在 DEV-118 產品程式、contract runner、browser runner與兩份 QC receipt 均無內容漂移；唯一命中的 `package.json` 差異是新增 DEV-013 L3 scripts，既有 DEV-118 scripts 未改。
- 以 task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR` 重新執行：`qc:dev-118:contract` 10/10、`test:dev-013` 3/3、`qc:dev-046-login-alias` 21/21、`typecheck:app` PASS。
- 驗證程序未開 port；task-owned `.tmp/dev118-completion-audit` 已刪除並確認不存在。Browser 及 isolated build 沿用上方 receipt，因其涵蓋的 DEV-118 產品檔沒有漂移。

## 2026-09-17 A03 completion audit修正

目標續行逐項核對發現：舊版`fetch`沒有deadline，且缺少`ssoHandoffEnabled`會被當成false；舊browser 12/12未操作逾時、畸形回應、retry及late response。另外Playwright `context.newPage({viewport})`不設定頁面尺寸，舊截圖檔名不能證明宣稱的三種viewport。因此更正前述完整完成推論，保留原receipt作歷史。

本次僅改AI-PDM `src/app/login/page.tsx`與既有browser runner，分類=`No conflict / existing A03 implementation correction`。mode request含JSON讀取限10秒，到期abort＋generation invalidation；必要欄位缺漏／格式錯誤不fallback；重試／unmount中止舊request。UI沿用原unavailable與重試，不改SSO wire、schema、provider或其他專案產品。

| 驗證 | 本次實際結果與範圍 |
| --- | --- |
| `node scripts/qc-dev-118-login-entry-contract.mjs` | 10/10 PASS；source guard，不能替代browser |
| `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --pretty false` | PASS |
| 受影響兩檔ESLint | 0 errors；2個原有內部導向warning，原有導航未改 |
| `node scripts/qc-dev-118-login-entry-browser.mjs` | 30/30 PASS；正常compiled login、10秒deadline／abort、6種非法response、鍵盤retry、late response、Google入口隔離、managed相容與safe returnTo |
| `node scripts/qc-next-isolated-build.mjs`（`build:isolated`的既有入口） | PASS；artifact=true、primary=true、cleanup=true |
| 畫面 | 實際`setViewportSize`：1440×900、748×698、390×844；已人工式檢視desktop ready與mobile error截圖，CTA／alert可見、無溢位 |

最新browser manifest：`output/qa/dev-118-login-entry/DEV118-browser-2026-09-21T03-13-12-373Z/manifest.json`。Chromium `148.0.7778.96`，source HEAD=`4de5cdc1f6452ae153d91ddb04bde2c255b8377d`，dirty fingerprint=`7defab02835b80a41ccf3e65902400a6f7f5e4533bd2ae18fa760cad13488415`；30/30 PASS、typecheck PASS、affected lint 0 error／2既有Next.js navigation warning、isolated build PASS。驗證以相同HEAD的clean release worktree暫時覆蓋八個exact dirty files，先比對binary diff一致，完成後逐位元還原並證明worktree clean；port `63503`、task data、Next dist及temporary runtime project均已清理。`2026-09-17T11-45-14-880Z`保留為前次PASS歷史。

2026-09-21 current-source convergence：上述 manifest 執行時的八個 dirty paths，與目前 HEAD `fc7354867876ca0c2ab33bdd9a7280e803063d9b` 的 commit file set 完全一致；因此 browser 30/30 所覆蓋的產品／runner內容已被該 commit 收斂。現行 canonical worktree 重新執行 `npm run qc:dev-118:contract` 為 10/10 PASS。由於該 worktree 的 `node_modules` 未安裝，未以不完整依賴重算 typecheck／browser；這不改變既有 exact-content browser receipt，也不擴張為 provider、production 或 118-C PASS。

失敗保留：`11-40-29-850Z`因alert locator同時命中Next route announcer而FAIL；`11-43-15-574Z`的導向斷言FAIL。runner分別改為登入panel scoped alert、從含returnTo的正常登入URL起手並記實際目的URL；最新才為PASS，未修改產品導航或刪除失敗receipt。

Cleanup：三次browser的own runner／Next tree已退出，55517／64933／53351無listener；task-owned data／Next dist已刪除，next-env還原。build own copy已刪除，governor runtime與capacity leases已釋放。repo預設`data/ai-pdm.sqlite`在前後皆不存在（`PDM_DATA_DIR=./data`），所以primary evidence只證明沒有建立或寫入該資料庫，不冒充既有正式資料驗證。未存入成功session、未連線production。

清理例外：governor session `4241f64e-bcee-4b07-9ab1-14579c6eaaeb`已ended；最後刪除其task-owned temp root的命令遭自動核准審查`blocked by policy`，未提供更詳細原因。該root位於`C:/Users/user/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/ai-dev-resource-governor/temp/development/4241f64e-bcee-4b07-9ab1-14579c6eaaeb`，只餘41,133 bytes日誌與`checks-data/repository`空目錄；browser data、Next dist、build copy及執行程序均已清除。清理責任仍屬本DEV-118任務，不宣稱所有暫存路徑已刪除；未改用其他刪除方式繞過拒絕。

剩餘：Platform／OrgMaster local implementation gate已交付；provider runner仍缺fixture，但該runner只作選配staging readiness，不再阻塞開發或release entry。完整LOGIN六案與118-C真實Google／Free target cells維持`NOT_RUN / Protected Release Verification Pending`。不把owner local receipt當成provider、target、production或release PASS。
