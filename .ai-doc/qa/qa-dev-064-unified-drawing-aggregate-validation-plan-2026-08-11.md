# QA Plan：DEV-064 圖號單一資料層

Status: `QA Plan Ready for AI Real-Operation Revalidation / Prior Local QA-QC Passed / Production Migration & Release Gated`
Date: 2026-08-11
Visible lifecycle amendment: 2026-08-15
Owner: QA
Related DEV: `DEV-064`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-AGGREGATE-001-canonical-drawing-and-revision.md`

## Objective

驗證所有圖號狀態由同一 Drawing／DrawingRevision／DrawingRevisionFile 權威承接；工作台與明細不再把 candidate/formal 當成兩種 identity，同時保留原子審核、權限與受控版次不可變性。

## Acceptance matrix

| ID | Scenario | Expected |
|---|---|---|
| QA-064-001 | 建立含兩張圖的 workspace | 立即有兩個 stable Drawing ID，workspace 不是圖面 identity |
| QA-064-002 | 取得圖號 | 原 Drawing ID 不變；只補 drawing number／reservation pointer |
| QA-064-003 | 建立首版與上傳 2D/3D | 同一 DrawingRevision 與 DrawingRevisionFile 關係建立 |
| QA-064-004 | 送審／撤回／退回 | 同一 revision 轉態；row-version 與權限 fail closed |
| QA-064-005 | 核准正式化 | Drawing／Revision／File canonical ID 不變、無第二份 canonical row |
| QA-064-006 | 研發受控／發布 mutation | 直接改 revision content 或 file relation被拒絕；建立新版可行 |
| QA-064-007 | workbench query | identity query只讀 `drawings`，無 candidate/formal UNION authority |
| QA-064-008 | detail entry | 待處理、審核中、研發受控、發布皆開啟同一 drawer frame |
| QA-064-009 | deep-link compatibility | 舊 candidate workspace key與formal drawing key zero-write解析到canonical Drawing |
| QA-064-010 | dual-write fault injection | canonical／legacy projection 任一失敗全交易 rollback |
| QA-064-011 | cross-company／tampered ID | 404/403/409 fail closed，不洩漏其他公司資料 |
| QA-064-012 | migration rerun | backfill冪等；promoted candidate與formal master只產生一個 Drawing |
| QA-064-013 | 舊 reservation 全量 adoption | 每一 source reservation ID 恰好映射一次；所有尚未正式化且非終結的舊 reservation，不論 internal bucket，使用者只見「首版準備」；正式／發布／terminal維持真實下游狀態 |
| QA-064-014 | production manifest reconciliation | `source_count = distinct_mapped_count = bucket_distinct_id_sum`；unmapped／duplicate／renumbered 全為 0，cutover freeze 期間 source hash changed 為 0 |
| QA-064-015 | root／part reservation continuity | 不誤建 Drawing，但仍由原 workspace／bundle 與 canonical relation／compatibility reference完整追溯 |
| QA-064-016 | flag rollback rehearsal | 關閉 new writes後來源與 canonical／compatibility facts仍可讀，零刪除、零 down migration |

## Production zero-loss adoption gate

本 QA 計畫不授權 production migration；實際 release 必須另外在經核准的 read-only/repeatable snapshot 上逐 company、全分頁產生 source manifest，並在 flag off backfill readback、read-only canary與activation前最後cutover freeze重跑。最小對帳單位固定為 `number_candidate_reservations.id`，不得以 workbench row、Drawing count或抽樣替代。

每筆 source ID 必須在 admin-only manifest 中恰好落入 `building/drawing_preparation/bundle_ready`、`in_review/auto_finalizing`、`drawing_addendum_required`、`rd_controlled/released`、`obsolete/merged/cancelled/history_only` 或 `recovery_required`；這些 internal buckets 只用於零遺漏對帳，不是一般使用者路徑。所有 preformal／nonterminal 舊資料在一般 UI 一律投影為「首版準備」，且不得出現 legacy、補登、差異審核、整併、復原或對帳字樣／CTA；drawing reservation 要有唯一 canonical Drawing／recovery reference，root／part reservation要有 workspace／bundle trace。任何遺漏、重複、改號、cutover freeze 期間 source hash 變更、未具名 recovery 或需要刪除資料的 rollback 均為 P0／no-go。正式開放後合法 state／row-version 前進須由command／audit證據解釋，不視為遺失。

## Required evidence

- SQLite fresh schema、existing-row backfill、rerun、foreign key與immutability trigger。
- PostgreSQL 030 static/schema parity；本輪不得套用 staging／production。
- Repository flow：create → acquire → revision → files → submit → approve → readback。
- HTTP：list/detail、old keys、permission denial、state conflict、idempotency。
- UI/browser：1440×900、1024×768、390×844；候選與formal各至少一筆，console/page/server 5xx=0、horizontal overflow=0、visible error=0。
- Regression：DEV-052 atomic recovery、DEV-053 workbench、DEV-061 file ownership、DEV-063 vocabulary、TypeScript與scoped lint。

## QC independence

RD 先完成 implementation self-check；QA 依本計畫準備 fixture 與期望；QC 僅執行事實驗證與出具 PASS/FAIL，不在 QC 階段修改產品程式。

## AI 真實操作再驗證計畫（待 QC 執行）

### 1. QA 目標與判定邊界

由 AI 扮演實際操作者與審核者，在隔離的 local Next.js、SQLite、local repository 與真實 Chromium 中完成圖號從「待你處理」到「研發可用」的主要流程，證明：

1. 所有可持續觀察的圖號狀態都由同一 canonical `Drawing` identity 承接。
2. 「待你處理」與「研發可用」都能由圖號列進入同一圖號明細 shell；差異只在狀態內容與 capability。
3. 送審、撤回、重送與正式化只轉移狀態及相容 pointer，不複製 canonical Drawing／Revision／File。
4. UI 隱藏不是安全邊界；直接繞過 UI 的非法 mutation 仍由 server／DB 拒絕。
5. 真實畫面沒有 visible error、資料異常、重疊、裁切、水平 overflow 或無法理解的下一步。

本節只制定計畫，本輪 QA 不執行案例，也不修改產品、測試程式或 `dev_task.md`。後續 QC 必須產生新的 run ID 與證據；下方既有 PASS 只能作 baseline，不得代替新一輪事實驗證。

使用思考習慣：#批判、#可驗證性、#證據基礎

### 2. 「AI 真實操作」定義

符合下列條件才算真實操作：

- 使用真實 Chromium renderer，透過 role／label／visible text 定位並執行 click、fill、upload、keyboard、reload、viewport resize；不得只呼叫 repository function 後宣稱 UI 已驗證。
- 每次 navigation、drawer／dialog 開關或狀態大幅改變後重新取得 DOM snapshot／locator state，避免沿用 stale reference。
- 主要使用者流程必須由可見 UI 控制項完成。直接 DB／API 僅可用於隔離 fixture、狀態覆蓋、negative probe 或目前產品明確沒有 UI 的 authority；必須在報告標記為 `fixture setup`、`hybrid authority` 或 `negative probe`，不得標成 UI 操作。
- AI 必須實際檢視候選、審核中、研發可用及各 viewport 截圖，逐項填寫 manual UX review；腳本回傳 PASS 但未目視證據時判定 `未充分驗證`。
- build、typecheck、focused QC 與 direct API success 都是輔助證據，不能消除目前畫面的 visible error。

現行審核決策 drawer 已退役；若 QC 仍由 `/api/approvals/requests/{id}/decisions` 建立核准事實，必須標記為 `hybrid authority`。它可證明正式化 transaction，但不可宣稱「審核者透過 UI 核准」。

### 3. Scope / Out of scope

In scope：

- `/numbering/drawings` 工作台、canonical row key、共用明細 drawer、搜尋、reload、舊 deep link。
- `drawing_preparation`、`bundle_ready`、`in_review`、`rd_controlled` 的完整實際流程。
- `building`、`released`、`obsolete`、`cancelled`、`recovery_required` 的穩定狀態讀取與 capability 檢查。
- `auto_finalizing` 短暫狀態的 transaction／event evidence；不得為截圖刻意延長正式交易鎖。
- canonical Drawing／Revision／File identity、row count、hash、state transition、immutability、跨公司與角色權限。
- 1440×900、1024×768、390×844 的 drawer、table、dialog、scroll owner 與 visible text。

Out of scope：

- staging／production migration、live backfill、deployment、release、merge、PR、正式帳號與正式資料。
- PostgreSQL 030 實際套用；需另有經核准 disposable shadow credential 才可執行。
- 在 QC 階段修復缺陷、修改測試或為了通過而改 seed／expected result。

### 4. 執行環境與硬性隔離 Gate

| Gate | 必要條件 | 失敗判定 |
|---|---|---|
| 工具 | `Get-Command npx.cmd` 成功；Playwright／Chromium 可啟動 | `阻塞` |
| App | 使用隨機空閒 port、獨立 Next dist directory；health 與 `/numbering/drawings` 回應成功 | `阻塞`，不得接手不健康的 3000 port |
| Data | `PDM_DB_PROVIDER=sqlite`、temp data directory、temp repository；不得使用工作區既有 DB | `未通過` |
| Auth | isolated operator／approver／restricted actors，測試 email 使用 `.invalid` | `阻塞` |
| Production | manifest 必須記錄 `productionConnected=false`、`productionWrites=false` | `未通過` |
| Provenance | 記錄 git SHA、dirty state、source manifest SHA-256、feature flags、run ID | `未充分驗證` |
| Cleanup | 只刪除已解析且位於 OS temp 與 repo `.tmp` 內的本輪目標；`cleanupStatus=removed` | `未通過` |

禁止使用 `npm run dev:local restart`；該字串會被 PowerShell 腳本解析成數字參數。既有 local server 不健康時，QC 使用 real-operation runner 的隔離 port，不得停止或清除未確認的共用程序。

### 5. 測試角色與資料

| Fixture | 內容 | 用途 |
|---|---|---|
| Operator | JENFU Engineer；擁有自己的 candidate workspace | 完成首版、上傳、送審、撤回、重送 |
| Approver | JENFU R&D Manager | 讀審核上下文；由現行 authority 建立核准事實 |
| Restricted actor | 同公司但沒有編輯／審核 capability | 驗證 403／隱藏 CTA／不可直接 mutation |
| Cross-company actor | 不屬於 fixture company | 驗證 404/403 fail closed 與資料不洩漏 |
| Candidate fixture | 一個 workspace、至少兩張 drawing draft；其中一張進入完整流程 | 驗證 workspace 不等於 drawing identity |
| Legacy adoption fixtures | `active`、`review_locked`、`approved_locked`、inconsistent 各至少一筆 preformal／nonterminal reservation | 四者使用者皆只見「首版準備」；source state、approval、reason與owner仍可由 admin evidence對帳 |
| Formal fixture | 既有 `rd_controlled` drawing，含 2D／3D 受控檔 | 對照正式狀態共用 shell 與唯讀能力 |
| Terminal/error fixtures | released、obsolete、cancelled、recovery_required 各一個 canonical Drawing | 狀態覆蓋與 Now What 檢查；只作 setup，不冒充操作 |

fixture code、workspace ID、canonical Drawing ID 必須在 run manifest 明列。資料不可只依 UI 文案辨識，避免同名資料誤判。

### 6. Lifecycle／Capability 驗收矩陣

| Lifecycle | 建立方式 | 明細入口與預期能力 |
|---|---|---|
| `building` | isolated seed／合法 create flow | canonical `drawing:{id}` 可讀；顯示尚未取號與下一步，不可誤認正式 |
| `drawing_preparation` | Operator 真實操作 | 「待你處理」可開共用圖號明細；可建立／編輯首版 |
| `bundle_ready` | UI 上傳並驗證 2D＋3D | 同一 Drawing／Revision；顯示可送審，沒有第二份 file authority |
| `in_review` | UI 送審 | 同一 canonical key；內容鎖定；Owner 可見撤回，非 owner 不可改 |
| `auto_finalizing` | 核准 transaction event | 只驗 transaction/event；不得要求穩定 UI 截圖或人為延長鎖 |
| `recovery_required` | isolated fault injection | 新流程 `bundle_apply_failed` 顯示必要處理資訊；legacy inconsistent adoption一般使用者只見「首版準備」，診斷留 admin evidence；兩者皆不得產生半套正式 canonical rows |
| `rd_controlled` | 核准 authority | 原 candidate row 轉為一筆「研發可用」canonical row；受控檔唯讀、可建立新版 |
| `released` | isolated fixture／合法 release flow | 同一明細 shell；不可直接改受控版次，提供建立新版或查看紀錄 |
| `obsolete` | isolated fixture／合法 obsolete flow | terminal read-only；明確說明已作廢與可採取的替代下一步 |
| `cancelled` | UI 取消或 isolated fixture | terminal read-only；不再顯示可送審／編輯 CTA |

### 7. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 待處理仍無明細 | UI 分支仍拒絕 candidate | 無法理解或處理首版 | 點圖號、DOM、截圖 | P0 | RO-064-004 |
| 共用只有外觀、資料仍複製 | promotion 建第二個 canonical row | 歷史、附件與關係分裂 | 前後 ID／count／hash | P0 | RO-064-011～013 |
| workspace 被誤當 drawing identity | 一個 workspace 只建一筆 Drawing | 多圖工作包互相覆蓋 | 兩圖 fixture 與 DB query | P0 | RO-064-003 |
| 讀取明細造成寫入 | hydration／backfill 在 GET 時執行 | reload 改變業務資料 | read 前後 business hash | P0 | RO-064-005、017 |
| UI-only 封鎖 | server／DB 未驗證狀態與權限 | 可直接 API 竄改正式版 | negative API／DB probe | P0 | RO-064-014～015 |
| 正式化只成功一半 | dual-write 不同 transaction | candidate/formal/canonical 不一致 | fault injection、row counts | P0 | RO-064-016 |
| 跨公司資料洩漏 | query 未帶 company scope | 機密圖面外洩 | cross-company actor／tampered ID | P0 | RO-064-015 |
| 畫面有 error 但腳本仍 PASS | 只檢查 API 或吞掉 console error | 使用者實際無法操作 | visible error／console／5xx sweep | P0 | 每個畫面 + RO-064-020 |
| terminal/recovery 沒有下一步 | 狀態文案只顯示原因 | 使用者不知道改做什麼 | Now What matrix、目視 | P1 | RO-064-018 |
| drawer 在小 viewport 裁切 | 固定寬度或雙捲軸 | 無法關閉或按 CTA | viewport screenshot、scroll test | P1 | RO-064-019 |
| 舊 deep link 打開另一個物件 | compatibility key 未正規化 | 同圖號出現兩份明細 | URL 與 canonical ID | P1 | RO-064-013 |
| 舊保留號暴露整併分流 | 直接顯示 source lifecycle／legacy CTA | 使用者被迫理解舊審核、補登或復原流程 | 四種 legacy fixture、可見詞掃描、截圖 | P0 | RO-064-004、018 |
| 測試誤碰正式環境或未清理 | 環境變數／path scope 錯誤 | 正式資料風險或殘留 | manifest、target resolve、cleanup | P0 | RO-064-001、021 |

### 8. AI 真實操作案例

| ID | 前置條件與 AI 操作 | 預期結果 | 必要證據 |
|---|---|---|---|
| RO-064-001 | 啟動 isolated app；記錄 port、DB、repository、dist path | 全部 target 為 temp／`.tmp`；production false | run manifest、resolved paths |
| RO-064-002 | Operator 登入並進入 `/numbering/drawings?view=work` | 工作台可見、fixture count 非 0、無 visible error | 1440 screenshot、DOM/error sweep |
| RO-064-003 | 搜尋含兩張圖的 workspace | 每張圖各有不同 stable Drawing ID；workspace 不作 row identity | API payload、DB identity map |
| RO-064-004 | 點擊「待你處理」圖號 | 開啟圖號明細 shell，標題與 canonical key 正確，可完成首版 | before/after screenshot、URL、DOM |
| RO-064-005 | 關閉、重開、搜尋、重新整理、hard reload | read path 不改任何 business table hash | before/after business hash |
| RO-064-006 | 以 keyboard 開／關 dialog 與 drawer | focus 進入合理位置，Escape 關閉後回到 opener | focus log、screenshot |
| RO-064-007 | 建立首版並用 file chooser 上傳真實 2D／3D fixture | 同一 Revision 掛兩個 file relation，hash 與檔名吻合 | UI screenshot、file/DB facts |
| RO-064-008 | 點擊送審、檢查確認摘要後確認 | 同一 Drawing 進 `in_review`；一個 request；內容鎖定 | confirmation、state/API/DB |
| RO-064-009 | Owner 從明細點撤回並確認 | 同一 Revision 回可編輯狀態；request cancelled；無新 Drawing | UI、request、identity timeline |
| RO-064-010 | 再送審；Approver 查看審核上下文 | 新 request pending；兩角色權限符合預期 | 雙 context screenshot、capabilities |
| RO-064-011 | 透過現行核准 authority 核准 | transaction 全成；同一 canonical Drawing 進 `rd_controlled` | hybrid authority log、DB transaction facts |
| RO-064-012 | Operator 回工作台搜尋同圖號並開明細 | 只有一列「研發可用」；canonical Drawing ID 不變 | row count、URL、before/after IDs |
| RO-064-013 | 檢查 Revision/File counts；開舊 candidate/formal deep link | 仍為一 Drawing／一首版 Revision／兩 file relations；舊 key zero-write 正規化 | SQL count、URL、business hash |
| RO-064-014 | 對受控 revision 嘗試直接改內容、改號、新增／刪除 file relation | server／DB 拒絕；資料 hash 不變 | status/error code、DB guard text |
| RO-064-015 | Restricted／cross-company actor 使用 canonical 與 tampered IDs 查詢／mutation | 404/403/409 fail closed；不回傳他公司 payload | response status、redacted body |
| RO-064-016 | isolated fault injection 使正式化中途失敗，再 retry | 第一次全 rollback 且同 Drawing 進 recovery；retry只正式化一次 | before/fault/retry count/hash |
| RO-064-017 | 正式化後連續 reload 三次、重複相同 idempotency key | 沒有新增 row、重複 outbox、第二份附件或第二次狀態轉移 | idempotency receipt、hash |
| RO-064-018 | 開啟四種 legacy adoption 與 released／obsolete／cancelled／bundle-apply-failed fixtures | 四種 preformal／nonterminal legacy只顯示「首版準備」且無 adoption過程字樣／CTA；formal／terminal／實際套用失敗維持真實狀態 | 每狀態 screenshot、CTA inventory、visible-text sweep |
| RO-064-019 | 候選與正式 drawer 在 1440×900、1024×768、390×844 操作、捲動、關閉 | 無裁切、重疊、水平 overflow、scroll chaining；關閉鈕與主要 CTA 可操作 | 每 viewport 截圖、overflow metrics |
| RO-064-020 | 掃描兩個 browser context 的 console、pageerror、network、visible text | unexpected console/page error、5xx、`.inline-error`、`[role=alert]` failure皆為 0 | JSON summaries、error extracts |
| RO-064-021 | 關閉 browser/app 並清理本輪 targets | cleanup removed；source files與共用程序未被改動 | cleanup.json、post-run manifest |

### 9. UI/UX 人工目視檢查

AI 必須對候選、四種 legacy adoption、審核中、研發可用、terminal／bundle-apply-failed 與三個 viewport 逐張檢視，不可只相信 DOM：

| 問題 | 通過標準 |
|---|---|
| 5 秒內知道自己在哪裡？ | 看得出圖號、狀態與明細上下文 |
| 知道下一步？ | 待處理顯示完成首版／送審；審核中顯示撤回或等待；受控狀態顯示建立新版／查看紀錄 |
| 共用入口是否被誤解為共用權限？ | drawer shell一致，但每個狀態只出現合法 CTA，disabled reason可理解 |
| 有沒有內部詞或重複文字？ | 主畫面不得出現 DEV、mock、raw status、API route；同一事實不重複兩層以上 |
| 小 viewport 是否安全？ | 無水平 overflow、按鈕擠壓、關閉鈕消失、雙捲軸混淆或 drawer 超出 viewport |
| 錯誤／terminal 是否回答「現在怎麼辦」？ | 首句先給使用者結論，並有可執行替代下一步或明確免處理 |

### 10. 證據契約

每次執行建立：

`output/playwright/dev064-ai-real-operation/<runId>/`

至少包含：

- `run-manifest.json`：run ID、時間、git SHA、dirty state、source hash、flags、isolated targets、production flags。
- `operation-events.json`：每一步 AI 操作、actor、locator／route、時間與結果。
- `identity-timeline.json`：每個階段的 Drawing／Revision／File ID、state、row version、count。
- `business-hash-before-after.json`：read-only、撤回、核准、reload、negative probe 前後 hash。
- `network-summary.json`、`console-summary.json`、`visible-error-summary.json`。
- `screenshots/`：案例 ID＋state＋viewport 命名；不得只留最後成功畫面。
- `trace.zip` 或等效操作 trace。
- `case-results.md`、`qc-verdict.md`、`cleanup.json`。

任何 assertion 必須可從上述 artifact 回推；不可只在 console 印 `PASS` 後遺失原始證據。敏感 token、cookie、password、完整 session header 不得寫入 artifact。

### 11. QC 執行順序與指令

AI QC 依下列順序執行，第一個 P0 失敗即停止後續 mutation，只繼續收集失敗證據與安全清理：

```powershell
Get-Command npx.cmd
npm.cmd run qc:dev-064-unified-drawing-aggregate
npm.cmd run qc:dev-052-number-lifecycle-flow
npm.cmd run qc:dev-053:real-operation
npm.cmd run typecheck
```

執行 `qc:dev-053:real-operation` 後，QC 必須產生新的 run ID，並把 DEV-064 案例對應到本計畫的 `RO-064-*`。既有 runner 未覆蓋的 terminal/recovery、restricted/cross-company 與 manual UX review，需由 AI 在同一 isolated source state 補做；若無法補做，結論只能是 `未充分驗證`，不可沿用舊報告補滿。

### 12. 總體判定

- `通過`：RO-064-001～021 必要案例全數通過；P0=0；manual UX review與三個 viewport證據齊全；canonical identity timeline證明無複製；production false；cleanup removed。
- production release 另須 QA-064-013～016 的目標環境 evidence 全數通過；既有 local PASS 不可替代全量正式資料對帳。
- `未通過`：任一 P0/P1 驗收失敗、visible error、5xx、資料 identity分裂、UI-only protection、跨公司洩漏、讀取寫入、正式化半套成功、viewport不可操作或清理失敗。
- `未充分驗證`：缺 screenshot目視、trace、identity timeline、business hash、角色／狀態／viewport覆蓋，或把 API setup冒充 UI 操作。
- `阻塞`：工具、Chromium、隔離 app、fixture、登入或 disposable環境無法建立，且無法安全繼續。

QC 發現缺陷時只記錄重現步驟、預期、實際、影響、route／viewport與證據，回送 RD；不得在同一 QC 執行中修改產品後直接改判 PASS。只有新 source hash 的重跑可關閉缺陷。

## Existing baseline evidence（2026-08-11，非本計畫的新執行結果）

- Focused aggregate QC：`npm.cmd run qc:dev-064-unified-drawing-aggregate`，7/7 PASS；涵蓋未取號→取號 identity 不變、多圖 workspace、一筆 revision/file 正式化前後不複製、legacy key resolution、圖號／受控內容／狀態／檔案 DB guard、canonical workbench SQL 與 migration contract。
- Lifecycle regression：DEV-052 flow 8/8 PASS；fault rollback、retry、approval evidence 與 legacy addendum 未退化。
- Workbench regression：schema 9/9、read model 10/10、HTTP 14/14、UI 24/24、flow 7/7 PASS。
- Real Chromium：run `DEV053-20260811-061739-local-isolated`，28/28 PASS；1440×900、1280×720、1024×768、390×844，candidate shared detail、upload、submit、withdraw、resubmit、approve、formal readback、legacy deep-link canonicalization、reload idempotency均通過；unexpected console／visible error／5xx = 0，production connection/write = false，cleanup = removed。
- Cross-workbench compatibility：DEV-062 core 6/6、compat 8/8 PASS；DEV-063 vocabulary 10/10 PASS。
- Static：TypeScript PASS、affected ESLint PASS、`git diff --check` 無 whitespace error。
- PostgreSQL 030 本輪只做 forward artifact 與 static parity；未取得 disposable PostgreSQL shadow credential，未執行任何 staging／production migration。正式套用仍受 release/data gate 阻擋。

QC report：`.ai-doc/qc/qc-dev-064-unified-drawing-aggregate-report-2026-08-11.md`。

## 2026-08-15 Visible Legacy-path Amendment Evidence

- `npm.cmd run qc:dev-064-unified-drawing-aggregate`：8/8 PASS；在原7項stable identity／single aggregate／DB guard基線上，新增舊保留號 user-view projection與目前統一明細契約，防止內部 legacy request/state重新產生第二條可見流程。
- `npm.cmd run qc:dev-052-number-lifecycle-data-protection`：6/6 PASS；18/18 reservation ID一對一映射，unmapped／duplicate／unexpected／changed皆0，read hashes不變。
- `npm.cmd run qc:dev-052-number-lifecycle-ui`：17/17 PASS；一般使用者看不到舊審核、補登、修復、整併、對帳與舊制重試控制。
- `npm.cmd run qc:dev-052-legacy-first-preparation-browser`：7/7 PASS；current unified drawer對pending／approved／inconsistent舊來源皆回傳 `drawing_preparation`，run `DEV053-20260815-031953-local-isolated` 的三張1440×900 screenshots已目視確認，console／failed response／visible error為0，production connection/write=false，cleanup=removed。
- 此段為本次產品修改後的RD/QA focused verification；2026-08-11獨立QC基線不被改寫，production仍需另行全量reservation manifest與release gate。

## Stop conditions

- migration 或 backfill 指向 local isolated target 以外環境；
- 任一 mutation 只能靠 UI 隱藏而無 server/domain policy；
- 受控 revision 必須就地改寫才能相容；
- dual-write 無法在同一 transaction 全成全退；
- 需要 deploy、release、merge、PR 或 production activation。
- source/adoption manifest 未涵蓋所有 company/page/state，或任一 reservation unmapped、duplicate、renumbered、cutover freeze 期間 source hash changed；
- 任一 preformal／nonterminal 舊保留號無法由「首版準備」找到，或一般 UI 暴露 legacy／補登／差異審核／整併／recovery／對帳過程；terminal／正式資料未維持真實下游狀態；
- rollback 需要刪除 canonical backfill、candidate／approval facts或改寫來源 reservation。
