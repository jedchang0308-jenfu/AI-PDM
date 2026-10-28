# DEV-126：AI-PDM 地端 SSO、單一前端權限來源與無感換頁

- 文件成熟度：Implemented and Locally Validated。
- 執行狀態：Source / Local Acceptance Complete / PR Review Pending；本機與模擬驗收已完成，未merge或發布。
- Native task：AIPDM/DEV-126#frontend-permission-projection。
- 跨專案主控：JENFU/DEV-021。
- 建立日期：2026-10-28（Asia/Taipei）。

人類已確認：目標採真實 non-production SSO 與 ADC impersonation，不新增永久 fake SSO；server 撤權立即生效，前端於下一次受保護操作收到 403 後失效 projection；non-production IAM 與真實外部 Chrome SSO journey 拆到另一個 session。本次只交付 source、local runner、deterministic SSO contract tests 與 permission projection。

## 1. 已查證問題與交付結果

AI-PDM 目前至少六個 consumer 直接呼叫 /api/numbering/permissions：

- src/components/sidebar-nav.tsx
- src/components/canonical-numbering-create-action.tsx
- src/components/canonical-pdm-workbench.tsx
- src/components/canonical-change-workspace.tsx
- src/components/canonical-part-attachment-manager.tsx
- src/components/transfer-package-workbench.tsx

其中 create action 使用 cache: no-store 並在 mount 時顯示「確認權限中…」。Root layout 雖持有 SidebarNav，page action／workbench 仍各自 fetch，因此換頁會重複等待，並可能把 dependency unavailable 誤投影成 action 消失。

本任務交付：

1. 預設 http://localhost:1020、可由本 session 覆寫為 http://localhost:12020 的 task-owned local runtime。
2. 沿用 jenfu.sso-handoff.v2 的 Platform SSO callback與 AI-PDM app-local session。
3. Root app shell 唯一 PdmPermissionProvider；六個 consumer 不再 direct fetch 同一 projection。
4. Loading、ready、unauthenticated、unavailable 分流；route change 無重取、無反覆「確認權限中…」。
5. /api/numbering/permissions 與所有 mutation server authorization 保持安全權威。

## 2. 責任與範圍

### In scope

- Root provider、typed state、selector、in-flight dedupe、retry／invalidation 與 late-response guard。
- 六個已知 consumer 改接；實作時再以 rg 確認沒有新 direct consumer。
- Permission endpoint 的最小 versioned response contract，不改 permission evaluator 或 catalog ownership。
- Logout、換帳號、Principal/session stale、App permission mutation 及 server 403 的 snapshot invalidation。
- 1020 default／12020 override local entrypoint、SSO config contract、focused tests 與三頁 permission-provider browser acceptance；真實 SSO browser journey deferred。

### Out of scope

- 修改 OrgMaster role assignment、Platform session protocol、資料庫 schema、IAM／Secret、正式資料或 production runtime。
- 把 OrgMaster／FMS／ProJED 權限帶入 AI-PDM，或建立跨 App frontend store。
- 將 client snapshot 當作 mutation authorization、背景自動重送 mutation、localStorage／sessionStorage capability。
- 重做全部 numbering／entitlement 模型或無關 UI。

## 3. Permission API contract

沿用 GET /api/numbering/permissions，既有 pages／actions key 與 canonical code arrays 不變，新增最小 version metadata：

~~~ts
type PdmPermissionProjectionV1 = {
  contractVersion: 'ai-pdm.frontend-permission-projection.v1'
  applicationId: 'ai-pdm'
  generatedAt: string
  pages: Record<NumberingPagePermissionCode, boolean>
  actions: Record<NumberingActionPermissionCode, boolean>
}
~~~

規則：

- Page／action code 只由 src/lib/numbering-permission-codes.ts 的 NUMBERING_PAGE_PERMISSION_CODES 與 NUMBERING_ACTION_PERMISSION_CODES 推導；provider／consumer 禁止複製第二份 code catalog。
- Endpoint 繼續驗證 Jenfu principal session、auth mode、Platform auth mode 與 entitlement enforce mode。
- 401 表示 unauthenticated；verified principal 的 permission false 仍回 200 projection；entitlement／principal dependency unavailable 回 503。
- 503／timeout／contract mismatch 不得轉成 ready + all false。
- Response 維持 private, no-store；第一切片只在 provider 記憶體保存。
- 不在 response 放 role、assignment、email、session token、cookie 或其他 App permission。

## 4. Provider contract

新增 src/components/pdm-permission-provider.tsx（若最新基線已有同責任 owner，合併而不平行新增），由 src/app/layout.tsx 包住 SidebarNav 與 main content。

Public API：

~~~ts
type PdmPermissionState =
  | { kind: 'loading' }
  | { kind: 'ready'; projection: PdmPermissionProjectionV1 }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable'; code?: string; retryable: boolean }

type PdmPermissionContextValue = {
  state: PdmPermissionState
  allowsPage(code: NumberingPagePermissionCode): boolean
  allowsAction(code: NumberingActionPermissionCode): boolean
  invalidate(reason: PdmPermissionInvalidationReason): void
  retry(): void
}
~~~

Provider 必須：

- Shell 首次只有一個 request；concurrent consumers 共用同一 in-flight promise。
- Route／page component mount 不觸發 refresh；只有明確 invalidation 或 retry 可建立下一個 request。
- Logout、換帳號、session 401、Principal stale、App 自己完成 role／permission 異動與 server 403 會清除 snapshot。
- 403 mutation 只 invalidation + 顯示訊息，不自動重送非冪等操作。
- Unmount／account switch 後，舊 request 的 late response 不得回寫。
- Loading 時保留 layout；未 ready 的 capability 不顯示成正常 denied。Create action 不再用「確認權限中…」取代 CTA。
- 無 provider 的 consumer 在 test／錯誤 integration 中 fail fast，不靜默自行 fetch。

## 5. Consumer 改接

| Consumer | 現況 | 目標 |
|---|---|---|
| sidebar-nav.tsx | 自行 fetch | 讀 allowsPage／allowsAction；logout／session failure 觸發 invalidation |
| canonical-numbering-create-action.tsx | mount + no-store fetch、顯示確認文字 | 讀 allowsAction(numbering.create)；loading 保持穩定占位 |
| canonical-pdm-workbench.tsx | 自行 fetch | 使用 provider action selectors |
| canonical-change-workspace.tsx | 自行 fetch | 使用 provider；mutation 403 invalidation |
| canonical-part-attachment-manager.tsx | 操作前自行 fetch | 顯示由 provider 決定；server mutation仍逐次授權 |
| transfer-package-workbench.tsx | 自行 fetch | 使用 provider；resource response 與 server guard 仍優先 |

完成改接後，src 內除 provider client 外不得再出現 fetch('/api/numbering/permissions') 或等價 direct fetch。Endpoint test 與 provider test 不受此 source rule 限制。

## 6. Local SSO 與 runtime isolation

下列為下一個 non-production activation session 的固定埠 profile；本次只完成 config contract 與 deterministic tests，不建立／修改 service identity 或 IAM：

~~~dotenv
PDM_PUBLIC_BASE_URL=http://localhost:1020
PDM_AUTH_MODE=firebase_bff
PDM_JENFU_PLATFORM_AUTH_MODE=on
PDM_JENFU_SSO_HANDOFF_MODE=on
PDM_JENFU_SSO_BROKER_ORIGIN=http://localhost:1000
JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT=<ai-pdm-nonprod-service-account>
~~~

未來 activation 使用 PDM 12020、Platform 12000 的 exact origin；不得在同一次 acceptance 混用 localhost 與 127.0.0.1。若指定 CLOUDSDK_CONFIG，必須是 absolute task-owned path；只可讀 ADC 並 impersonate 非正式 service account，禁止 service-account key file。本次以 injected service-token／handoff fixtures 驗證相同 callback code，不以 fixture 宣稱真實 SSO。

所有可寫 local runtime 必須使用本 worktree 下 task-owned PDM_DATA_DIR／PDM_REPOSITORY_DIR。不得 seed、清理或修復 primary data，也不得干擾已安裝的 DEV-125 Windows service。

npm run dev:local 預設 1020；既有 scripts/start-localhost-3000.ps1 在本切片保留相容入口名稱，但需支援 -Port 12020、-NoBrowser、-CheckOnly，且 PID／status／log filename 依實際 port。Underlying npm run dev:server 使用相同 port，不可 script 寫 1020 而 Next 仍開 3000。

SSO callback 建立 AI-PDM local session 後，permission projection 不應依賴 Platform page 或 runtime 持續在線。

## 7. 預定程式修改面

| 檔案／模組 | 修改目的 |
|---|---|
| .env.example | PDM public base 1020、Platform 1000、local SSO／ADC 說明；不放真實 identity |
| package.json、scripts/start-localhost-3000.ps1、scripts/qc-local-dev-entrypoint.mjs | 1020 default、port override、PID／status ownership、check-only |
| src/app/layout.tsx | 掛載唯一 PdmPermissionProvider |
| src/components/pdm-permission-provider.tsx | state、fetch、shape validation、dedupe、invalidation、retry、late-response guard |
| src/lib/numbering-permission-codes.ts | 只補精確 literal type／projection type；canonical arrays 保持唯一 |
| src/app/api/numbering/permissions/route.ts | 回傳 contractVersion／applicationId，保留現有 evaluator與錯誤語意 |
| 六個已知 consumer | 移除 direct fetch，改讀 provider／selector |
| 受影響 logout／mutation client | 在 account switch、401／403 或權限異動成功後明確 invalidation |
| src/components/pdm-permission-provider.test.tsx | request dedupe、state、retry、switch、unmount、late response |
| src/app/api/numbering/permissions/principal-permissions.test.ts | v1 shape、allow／deny、401／503、no-store |
| 既有 consumer tests | loading stability、allow／deny、403 invalidation，不再 mock 六份 fetch |

若 baseline 已將 local port 改為 1020，保留已完成實作並只補缺少的 override／test；不得覆寫其他任務對 local runner 的安全改進。

## 8. 實作前置與順序

1. 讀本 repo node_modules/next/dist/docs/ 內與 root layout、Client Component、context provider 相關的本版本文件；不能以舊版 Next 慣例推定。
2. 先把本文件與 task index 做成文件 commit，fetch 後安全更新 branch；本文件建立時 branch 曾落後 origin/main 兩個 commit，實作時重新讀 live status。
3. 完成 1020 default／12020 override local runner；以 check-only 確認未知 port owner不會被停止。
4. 先建立 provider tests 與 versioned endpoint shape，再完成 provider。
5. 依表格逐一改接六個 consumer；每改一個就移除該處 direct fetch 與 duplicated loading/error state。
6. 加入 logout、account switch、403／permission mutation invalidation；證明 late response 無法污染新 session。
7. 以 deterministic principal A／B、injected service token 與 handoff fixture 驗證 callback、local session、logout／account switch；不得新增產品 fake-login bypass。
8. 執行 focused tests、typecheck、slice planner；planner 要求時才執行 build:isolated。
9. Browser 先用 12020，最後確認 1020 無未知 owner後跑 runner／permission UI；真實 Platform SSO happy path 留待下一個 activation session。

## 9. 驗收案例

### 9.1 本次 source／simulated acceptance

1. Injected service identity + deterministic handoff 建立 fixture A 的 AI-PDM local session，首次 shell 只有一個 permission request，不連線或變更 Cloud IAM。
2. 在 /parts、/numbering/drawings 與 /numbering/approvals（或當下三個有效受保護 route）連續切換，permission request count 不增加。
3. Sidebar、create action、workbench、attachment、transfer package 對同一 projection 不出現矛盾 allow／deny。
4. Loading→ready 無反覆「確認權限中…」或主要 CTA layout shift。
5. Denied capability 不顯示或停用相對 action；直接 mutation 仍由 server 回 403。
6. 401、200 denied、503／timeout／contract mismatch 有不同 state；503 不產生 all-false ready。
7. Stale snapshot 下 mutation 回 403，snapshot 失效且不自動重送。
8. Fixture A → B 後，不沿用 A 的 pages／actions；A 的 late response 不回寫。
9. Principal epoch stale fixture 使下一次 protected request fail closed。
10. Callback state、PKCE、audience、service identity、consumed code、account conflict negative cases保持既有 fail-closed 行為。
11. rg 驗證 production source 只剩 provider owner 呼叫 /api/numbering/permissions。

### 9.2 下一個 non-production activation session

真實 Firebase principal A／B、AI-PDM service identity 的 ADC impersonation、Platform 1000／12000 → AI-PDM 1020／12020 的外部 Chrome journey、global revoke 與 direct-entry／SSO capability equivalence 本次均為 `DEFERRED / NOT_RUN`。缺少 IAM 時由下一個 session 另行取得 exact project／authority，不回頭擴張本次 source scope。

## 10. RD 驗證與證據

文件建立回合沒有測試；2026-10-28 實作結果如下，後續仍須保留未完成項：

- 主線同步：已合併 `origin/main=6e06ea12a2a4552b5b563f942f87249270b0c4ce`，同步 commit `a1879fde1a3b27a2ab1ced965bafe460887d7f09`；同步前29個未提交檔案的內容雜湊全部保留。
- Provider／endpoint／consumer／SSO／Principal guard：最新完整組合13檔163項通過，包含saved transfer、change workspace與attachment manager的8項狀態一致性案例。Source checkpoint為`c8b040c8c8d551ff263211f31ef9790788c263b6`；測試範圍修正為`8ac490b06215bb073dd7dc1b8cf2c92962e0ec92`。
- `typecheck:app`、變更TS/TSX lint（0 error／3個既有warning）、local-entrypoint QC、DEV-079 contract、`audit:production`（0 vulnerabilities）與`git diff --check`通過。Planner為AFFECTED_SLICES；release-core／authorization／planner共305項已通過，沒有選取database／worker／infrastructure。
- 首次有效失敗保留：local-entrypoint 舊 workspace tsconfig 的3項檢查失敗；調整至實際 app／Next config後通過。另以回歸測試重現首次403沒有取代舊 in-flight projection，再修正為只合併 forbidden refresh，舊 late response不可恢復 grant。
- 最終isolated build已對`22df6d57e307d97e38adeb221fe684f905cce5e5`刷新並通過：artifact=true、primary database absent且invariant不變、暫存清理通過。163項App／SSO／Principal結果的App source inputs未變，沿原有效證據重用。
- 並行build曾讓Vitest把`.tmp`內複本一併選入，出現26檔326項中的12個Context錯配；第一個失敗保留於工具紀錄。將task-owned `.tmp`／`tmp`排除後，只執行原定13檔，163項通過；沒有排除產品source案例。曾在generated next-env差異存在時觸發FULL fallback，既有30個legacy script group加planner均通過；恢復自動產生的next-env差異後，最終planner回到AFFECTED_SLICES且沒有unknown paths。
- `http://localhost:12020` runner health：`/`=200、`/login`=200、`/api/auth/me`=401（正常未登入）。最終browser fixture重跑7/7通過，包含三頁換頁projection僅1次、loading尺寸、denied、401、503明確retry、transfer mutation403僅1次且projection重取。證據為`output/playwright/dev126/result.json`與同目錄7張截圖，綁source `8ac490b06215bb073dd7dc1b8cf2c92962e0ec92`及僅含Next自動產生metadata的dirty hash；該metadata已還原。不代表server guard／真實SSO。
- 1020原先有一般工作樹的PID27096，原先只讀CheckOnly確實拒絕且未停止它。2026-10-28使用者另行明確指示「停止後驗證新工作樹」，主控重新驗明原Next CLI33548／worker27096的來源與建立時間後才停止；沒有擴張為任意port owner termination。
- 本次工作樹以無Port override的入口實際啟動1020，health為200／200／401，data/repository位於`tmp/local-dev/1020/`。1020的7個browser案例全數通過（`output/playwright/dev126/1020/result.json`、7張截圖，source `22df6d57e`）；12020沿前列有效App UI結果。原server與兩次驗證程序現在都已停止，1020／12020已釋放；所有本任務capacity lease也已釋放，未啟停已安裝Windows service。
- 實測補正：共用node_modules時Next worker command解析為依賴實體路徑，舊predicate把自己的worker誤認foreign。加入npm `--prefix`、worktree/port與啟動PID建立時間證明、8層有界父鏈；後續審查再取消僅靠listener命令文字的shortcut，要求每個owner都通過recorded npm祖先、Node executable與完整固定命令列核對。PID重用／cycle／時間相等或倒置／路徑穿越／其他參數夾帶root均拒絕；1個Node測試內19個正反情境通過，已接入`qc:local-dev-entrypoint`。
- 最終啟動器實測：無Port override啟動1020，native npm PID35568／start token `134376670449967321`，連續兩次CheckOnly均回`healthy_existing`且保留同一證明，沒有重啟。首次嚴格命令列比對因Windows加在尾端的空格而拒絕，保留首敗並補positive regression；僅Trim命令列外圍空白後通過。實測程序已按fingerprint停止，1020釋放。此次follow-up只改launcher／regression，App source與前列瀏覽器、型別及isolated build inputs未變，重用原有效結果；最終required CI仍按PR exact head執行。
- 依賴先重用已比對的工作樹，該來源後來已不存在；目前 junction改接 `C:\VIBE CODING\.worktrees\d125-infra-20261027\AI_PDM\node_modules`，710個manifest與lock integrity零差異，未執行安裝。Junction 模式以已安裝Next版本支援的 `--webpack`啟動，避免Turbopack外部root限制。
- 已建立[PR #555](https://github.com/jedchang0308-jenfu/AI-PDM/pull/555)，沒有merge／release；required CI以該PR的provider狀態為準，本機結果不等於required CI通過。真實non-production IAM／ADC／外部Chrome SSO維持`DEFERRED / NOT_RUN`。

實作回合至少執行：

實作盤點補正：既有 qc:pdm-numbering-permission-guard-ui 仍透過已退休的 demo login／admin matrix 寫入測試，且會記錄 session cookie，不適用 Principal-only。沿原命令改成真實 App rendering + browser route fixtures，驗證三 route 只讀一次 projection、denied／401／503與 retry；server guard／SSO 拒絕由既有 Principal focused tests承接。沒有新增產品 fake-login path。Local runner／.env.example 在 slice planner 精確列入 application，其他未知路徑仍走 FULL fallback。

qc:local-dev-entrypoint 的型別範圍檢查以實際 daily typecheck 使用的 tsconfig.app.json 與 Next 使用的 tsconfig.next.json 為準；禁止包含非 App／臨時路徑，不再以舊 workspace tsconfig 的700個檔案上限判斷啟動契約。歷史 workspace include 不因本切片被改寫。

~~~powershell
npx vitest run src/app/api/numbering/permissions/principal-permissions.test.ts src/components/pdm-permission-provider.test.tsx src/components/canonical-numbering-create-action.test.tsx src/components/canonical-workspace-error-feedback.test.tsx
npm run typecheck:app
npm run qc:pdm-numbering-permission-guard-ui
node scripts/plan-production-slice.mjs
rg -n '/api/numbering/permissions' src --glob '!**/*.test.*'
git diff --check
~~~

若 slice planner 對實際 diff 選中 app/build input，再執行 npm run build:isolated；未選中不因文件要求重跑 full historical suite。

本次 Browser evidence 綁 exact commit、PDM URL、fixture、route sequence、permission request count、HTTP status、sanitized code／correlation ID 與必要截圖，只證明 local runner／projection。禁止記錄 cookie、token、ADC、密碼或驗證碼；真實 SSO browser evidence 留待下一個 activation session。

## 11. 完成與停止條件

完成條件：

- 1020 default／12020 override 由 task-owned runner 啟動，PDM_DATA_DIR／PDM_REPOSITORY_DIR 可追溯。
- 六個已知 consumer 全部改接，source 中只有 provider owner direct fetch endpoint。
- Provider／endpoint／consumer focused tests、typecheck 與 planner-selected gate 通過。
- Deterministic SSO contract、三 route request count、401／403／503、403 後失效、fixture switch 與 late response 都有實際結果。
- 真實 non-production IAM、ADC impersonation 與外部 Chrome SSO 明確為 `DEFERRED / NOT_RUN`，不列入本次 PASS。
- 本 repo diff／commit／PR 可獨立於 Platform／OrgMaster review。

遇到下列情況只停止受影響動作並記回本 DEV：

- consumer 綁定不同 company／workspace／resource scope，不能安全共用同一 projection。
- server authorization 不存在，或需修改 OrgMaster／Platform 才能讓 AI-PDM action真正安全。
- local runtime 將寫入 primary data，或 port／PID owner 無法驗證。
- 任何 non-production／production IAM、Secret、credential authority、下載 key file 或 production change；本次一律 deferred。
- 工作樹有未知且與本任務檔案重疊的修改。
- Planner 或 focused test 出現與本切片相關失敗；不得以 UI snapshot 繞過 required gate。

本地 RD PASS 不等於正式角色驗收、獨立 QC 或 production acceptance；發布仍走 AI-PDM protected PR、required CI 與現行 release gate。

## 12. P5 續授權 checkpoint（2026-10-28）

使用者已指示續做三 repo 審查合併及真實 non-production SSO，接受本次整鏈 10 GiB 容量風險，並完成 ADC 重新授權；前文 deferred 為上一階段快照，現行主控紀錄在 Platform DEV-021 §12。沒有正式發布／資料／IAM／Secret 操作。

實際使用 non-production Firebase A／B、獨立 AI-PDM service identity、localhost 12020 與 task-owned PostgreSQL 15432 真實 owner migrations。PDM 設為 `firebase_bff`、Platform auth／SSO `on`、`PDM_JENFU_ENTITLEMENT_MODE=enforce`，runtime 為非 owner／migrator。Portal 真實 SSO 已首次建立 A 的 PDM profile，`/me` 與 permission projection 200；RD create 為 true，review-decide／settings-admin 為 false。reload 加 `/numbering/search`、`/numbering/drawings`、`/parts` 實際換頁只有 1 次 permission request，無「確認權限中」。本節不宣稱這些空 fixture 頁面的完整業務資料功能通過。

Portal B 的兩個入口 no-access，直接 launch 404；Platform 全域登出後 PDM `/me` 與 projection 均 401。初次 503 分別源自測試設定仍為 legacy、隔離 company code 不符，以及缺少 active role-priority；已以 canonical source／既有預設資料補正，不放寬 guard 或角色。Next auth／SSO request URL logging 已排除，canary 未進 stdout／stderr。

launcher 已覆蓋雙棧所有 listener owner，20 個正反情境與 local-entrypoint QC 通過。PR 與 main 的衝突僅來自 DEV-125／126 文件入口，已保留兩者並同步 main。既有 session 直接開啟 App 與 Portal SSO 取得相同 pages／actions；錯誤 callback 返回登入頁且原 Principal 不變；兩個真實 service-identity／audience 負測均為 broker401。

Principal 撤權依使用者明確決定 `DEFERRED / NOT_RUN`，不以 app-grant withdrawal 或全域登出代替；缺少可走 OrgMaster lifecycle 的非正式 managed identity。其餘本輪 P5 已完成。任務 npm40056 樹、Chrome、另外兩 App 與 PG15432 已按指紋停止，12000／12010／12020／15432 全釋放；runtime registry／capacity lease／session 已結束，隔離資料與私密設定保留供後續、未入 Git。最新 exact-head CI／merge 依 PR #555 provider，之前成功 CI 不代表新增 head 已驗證，沒有 production 變更。
