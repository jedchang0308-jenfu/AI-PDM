# DEV-087 UI-only 全生命週期 QC 執行報告

## 0. 最新 QC journey 補強與全量重跑（2026-08-22）

本輪先補三個真正由 rendered UI 操作的補充 journey，再執行原定 67-case 分母；補充 journey 不取代 67 個生命週期案例，只驗證三工作臺最小可達的「建立／進版 → 進入工作頁 → 取消 → 回清單」路徑：

| Journey | UI 起點與操作 | 結果 |
|---|---|---|
| `J01-drawing-create-cancel` | 圖號 `A0002-M01` 的量產版 1 → `進版` → 選擇可用候選 → 進入既有圖號編輯頁 → `取消本次工作` | PASS |
| `J02-part-create-cancel` | 料號 `A0002-P01` 的正式資料 → `建立修改` → 進入料號編輯頁 → `取消本次工作` | PASS |
| `J03-relation-create-cancel` | 圖料根號 `A0002` 的正式關聯 → `建立調整` → 進入圖料關聯編輯頁 → `取消本次工作` | PASS |

最新全量 run：`DEV087-ui-only-2026-08-22T07-00-51-231Z`，run manifest：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T07-00-51-231Z/run-manifest.json`，evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T07-00-51-231Z/`。其後 aggregate regression `DEV087-2026-08-22T07-07-18-304Z` 的 browser 46/46 PASS、`npm.cmd run qc:dev-087` 8/8 PASS、`typecheck:app` 與 isolated build 均 PASS。

| 指標 | 結果 |
|---|---:|
| 67-case 分母 | 67 |
| PASS / BLOCKED / FAIL | 1 / 66 / 0 |
| C01–C11 | 11/11 PASS |
| infrastructure checks | 5/5 PASS（migration、J01–J03、task-owned runtime cleanup） |
| unexpected failure / console error | 0 |
| direct business API / DB mutation | 0 |
| merged/history UI rows | 0 |

本輪先前發現的兩個問題已分流：

1. 圖號候選按鈕曾被 runner 在 `revision-targets` 尚未完成時讀取，屬 runner timing false block；加入 UI 可見候選／錯誤的等待後，focused browser 46/46 PASS，J01 亦 PASS。
2. 圖料關聯取消後曾回到不存在的 `/numbering/relations`，造成真實 UI 404；已將 relation safe return 修正為既有 `/numbering/search`，本輪 J03 PASS、`failures=[]`、console errors=0。

因此本輪沒有剩餘可歸因於產品的 `FAIL`。仍有 66 個 `BLOCKED`，原因是隔離資料沒有可由 UI 合法取得且可重複的各生命週期前置，並且沒有合法 `Merged/history` row；依 UI-only 規則不得用 seed、SQL 或 business API 補造。這是測試資料／前置能力缺口，不是產品已通過，也不應被改判為 PASS。DEV-087 仍不可宣告完整 67/67 或 release-ready。

### 剩餘結果的產品缺口判定

| 分類 | 數量 | 判定 |
|---|---:|---|
| D24 歷史清單 readback | 1 PASS | 已有合法 UI 前置，未見產品錯誤 |
| 其餘一般生命週期案例 | 63 BLOCKED | 缺少可由 UI 合法建立、可重複的測試前置；屬 QA fixture／前置能力缺口，不是產品 FAIL |
| D27／P20／R20 Merged/history | 3 BLOCKED | canonical UI 沒有合法歷史列；依契約正確停止，不是產品 FAIL |
| 可重現產品級 UI／API／DB FAIL | 0 | 目前沒有；唯一確認的 relation return 404 已修正並由 J03 重新驗證 |

執行日期：2026-08-22  
執行角色：獨立 AI-QC   
環境：Local disposable SQLite + task-owned Next runtime；未連 production/staging  
狀態：`Focused PASS / Full UI-only lifecycle NOT PASS / 67-case runner pending`  

## 1. 本輪實際執行

### 1.1 RD 修正與 commit

- `ff42bf62 docs: add DEV-087 UI-only lifecycle validation plan`
- `f551870f test: make DEV-087 browser login UI-driven`

第二個 commit 將瀏覽器驗證的登入改為從 rendered `/login` 點擊「以系統管理員角色快速登入」，不再由 runner 直接 POST login API；登入後的 POST 是由可見 UI 觸發，符合 UI-only 操作邊界。

### 1.2 focused aggregate

執行：`npm.cmd run qc:dev-087`

| 子檢查 | 結果 |
|---|---:|
| contract | PASS 31 |
| repository | PASS 17 |
| commands | PASS 39 |
| migration | PASS 24 |
| retirement | PASS 30 |
| browser focused | PASS 46/46 |
| typecheck:app | PASS |
| build:isolated | PASS |
| aggregate | PASS 8/8 |

瀏覽器證據：`output/qa/dev-087/DEV087-2026-08-22T00-57-16-902Z/manifest.json`。該 run 的 console error、page/network failure 均為 0，task-owned port `62463` 已釋放。

## 2. 為何不能宣告完整 QA PASS

新 UI-only 子契約要求：`D01-D27 + P01-P20 + R01-R20 = 67/67 journeys`，另加 `C01-C11 = 11/11 common gates`。目前 focused runner 只有 46 個畫面／回歸檢查，沒有為 67 條 journey 產生 `case.json`、`actions.jsonl`、UI/API/DB triad readback、triad diff、prohibited-mutation audit 與 cleanup ledger；因此 `Not Run > 0`，不可用舊證據替代。

另外，前一輪曾有四個契約缺口；本輪已由 ADR／SPEC 固定前三項，故不再以猜測阻塞 RD。完整 runner 仍須依這些規則執行：

| Gap | 尚未定義／不可合法執行的事項 | QA 判定 |
|---|---|---|
| GAP-UI-01 | whole-object obsolete 與 active work／review／system 的優先序 | CLOSED：只允許正式 idle、無 current work/request；其他情況 fail closed |
| GAP-UI-02 | root obsolete 與子 Drawing branch／Part／Relation active work 的 impact、cancel、stale 規則 | CLOSED：不 cascade；active/open/controlled dependency 時阻擋並重讀 exact impact |
| GAP-UI-03 | `Merged` 沒有現行合法 UI 建立入口，無法不靠 seed 取得前置 | CLOSED（scope boundary）：只導覽合法既有 history；無資料即 fixture invalid，不得 seed |
| GAP-UI-04 | `system_admin／blocked` 沒有啟動前固定、由 UI 動作觸發且不改 business data 的 deterministic fault profile | C11 BLOCKED |

其中 whole-object obsolete／merged 仍由既有 authority 承接；DEV-087 只固定 fail-closed 邊界與 UI 顯示，不另造 terminal mutation。不得用 DB fixture 補造 `Merged`。

## 3. 結論與放行門檻

- DEV-087 focused implementation gate：`PASS`。
- DEV-087 新訂 UI-only 全生命週期驗證：`NOT PASS`，不是產品已通過的 67/67。
- 本輪沒有使用 prohibited business API／DB mutation 來冒充 journey 結果；也沒有刪除或重置正式資料。
- 在四個 contract gap 關閉、UI 起點可達、並完成真正 67 條 journey 的三層 evidence 前，DEV-087 不得標記為完整 QA/QC 通過或 release-ready。

## 4. RD 返工條件

1. 依 ADR／SPEC 的 fail-closed 規則實作 whole-object/root terminal guard，不得自行新增第二套狀態 authority。
2. 若執行資料沒有合法既有 `Merged` history row，runner 必須標記 fixture invalid 並停止該案例；不得 seed／SQL 補造前置。
3. 保持 deterministic fault profile 的啟動契約，並證明只由後續 UI 動作觸發狀態。
4. 建立並執行 67 條 journey runner；任何 FAIL 需保留首次失敗證據，由 RD 修正後以全新 disposable run 重跑，不得覆蓋原失敗。

## 5. 返工後重驗紀錄（2026-08-22）

本節追加記錄本輪 RD 修正後的獨立重驗，不覆蓋前一輪 focused／blocked 結論。

### 5.1 已完成的修正與 focused 重驗

- `04a2391d fix: honor DEV-087 system admin state contract`：`system_admin` 不再寫入違反 schema CHECK 的 blocker reason；`blocked` 才保留人類可理解的受阻原因。
- `296d473e` 至 `09e7892a`：補齊故障路徑的 UI-only 登入、送審、審核、重新導向、fresh-page readback 與精確研發版 drawer 驗證。
- focused aggregate 最新證據：`output/qa/dev-087/DEV087-2026-08-22T01-31-47-102Z/manifest.json`。

| 子檢查 | 最新結果 |
|---|---:|
| contract | PASS 28 |
| repository | PASS 17 |
| commands | PASS 39 |
| migration | PASS 24 |
| retirement | PASS 30 |
| browser focused | PASS 46/46 |
| typecheck:app | PASS |
| build:isolated | PASS |
| aggregate | PASS 8/8 |

故障 profile 另以真正 rendered UI 重驗：

- `system_admin`：`output/qa/dev-087/DEV087-fault-system_admin-2026-08-22T01-29-43-360Z/manifest.json`，`17/17 PASS`；清單顯示「系統管理員處理」、drawer 顯示「請系統管理員處理」、無 action、DB `blocker_reason = null`。
- `blocked`：`output/qa/dev-087/DEV087-fault-blocked-2026-08-22T01-30-59-155Z/manifest.json`，`18/18 PASS`；清單顯示「受阻」、drawer 顯示單一受阻原因、無假恢復 action，正式 revision 未變更。

兩個故障 profile 均由啟動前環境設定宣告，狀態只由後續 UI 核准動作觸發；沒有案例中途 DB/API business mutation，task-owned ports 均已釋放。

### 5.2 Gap 狀態更新

| Gap | 更新後狀態 | 說明 |
|---|---|---|
| `GAP-UI-01` | CLOSED | ADR／SPEC 已固定只允許正式 idle、無 current work/request；active canonical work fail closed。 |
| `GAP-UI-02` | CLOSED | ADR／SPEC 已固定 root 不 cascade，active/open/controlled dependency 直接阻擋並要求重新讀取 exact impact。 |
| `GAP-UI-03` | CLOSED（scope boundary） | Merged 僅驗證合法既有 history 導覽；若資料集沒有合法 row，判 fixture invalid，不得補造。 |
| `GAP-UI-04` | CLOSED（focused） | `system_admin／blocked` deterministic fault profile 與 UI-triggered triad evidence 已完成；仍須納入完整 67-case run 的 C11 coverage。 |

### 5.3 目前可發布結論

本輪證明 focused implementation 與兩個 fault profile 已通過，但不改變全生命週期分母：`D01-D27 + P01-P20 + R01-R20 = 67 journeys`，另加 `C01-C11`。目前仍沒有 67 個 case 的完整 `case.json`、`actions.jsonl`、UI/API/DB triad diff 與 cleanup ledger，因此：

- `Focused implementation gate = PASS`。
- `C11 fault profile focused rerun = PASS`。
- `Full UI-only lifecycle = NOT PASS / 67-case runner pending`。
- 不得宣稱 `67/67`、不得 release-ready；下一輪直接依已固定的 ADR／SPEC 規則，以全新 disposable run 執行完整分母；缺少合法 Merged history 時只可判 fixture invalid，不可縮小分母。

## 6. RD 修正後 fault profile 重驗（2026-08-22）

上一輪 `system_admin` fault profile 曾發現 reviewer 送出決策後，瀏覽器尚未完成的唯讀檔案預覽仍帶 `reviewRequestId`，因 request 已被終止清除而收到 404，造成 console/network failure。RD 以 `974c4108 fix: silence late terminal review previews` 修正：只有在同一 work 已進入 `system_admin／blocked` terminal state 時，late read 轉為無內容的 204 terminal response，不暴露檔案 bytes；其他不存在或未授權仍維持 404。

修正後以全新 disposable runtime 重跑：

| Profile | Evidence | 結果 |
|---|---|---:|
| `system_admin` | `output/qa/dev-087/DEV087-fault-system_admin-2026-08-22T01-55-34-788Z/manifest.json` | 17/17 PASS，failures=0 |
| `blocked` | `output/qa/dev-087/DEV087-fault-blocked-2026-08-22T01-56-07-790Z/manifest.json` | 18/18 PASS，failures=0 |

兩個 profile 均確認 UI handling、drawer 語意、request 不再 actionable、canonical DB state 與正式版不變；task-owned ports `59868`、`50069` 均釋放。此修正只關閉 late-read 穩定性缺口，不增加新的 UI 狀態或 terminal action。

## 7. 完整 67-case UI-only runner（2026-08-22）

依 QA 計畫固定的完整分母，使用全新 disposable SQLite／repository、UI quick-login、Playwright rendered UI 及唯讀 API／DB readback 執行：

| 項目 | 結果 |
|---|---:|
| Drawing | D01–D27（27） |
| Part | P01–P20（20） |
| Relation | R01–R20（20） |
| 合計分母 | 67 |
| PASS | 1（D24 搜尋／篩選／歷史清單 readback） |
| BLOCKED | 66 |
| FAIL | 0 |
| C01–C11 | 11/11 PASS |
| infrastructure checks | 2/2 PASS |
| unexpected failure／console error | 0 |
| direct business API／DB mutation | 0 |
| merged history rows | 0 |

Evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T02-02-02-169Z/`。完整 runner 已實際造出每個 case 的 `case.json`、`actions.jsonl`、`network.jsonl`、screenshot、API／DB readback、triad diff、visible-error sweep、viewport metrics，以及 run-level manifest／schema／file／defects／cleanup 文件；task-owned port `62457` 已釋放。

66 個 BLOCKED 的共同原因是本次來源資料只有 A0002 的既有正式／研發 readback，沒有可由 UI 合法取得的每一種生命週期前置資料，且沒有合法既有 `Merged` history row。依 ADR／SPEC 與 QA 規則，不以 seed、SQL、直接 business API 或縮小分母補造，因此整體仍為 `NOT PASS`，不是產品失敗，也不能宣稱 67/67。

Runner 已修正 gate 統計：`gates` 僅計 C01–C11；migration／runtime 等列於 `infrastructure`，避免把 13 個檢查誤報為 11 個 gate。下一個必要動作是提供合法 UI 前置資料鏈（或新增可由 UI 建立且可清理的測試情境），再以全新 run 重跑；在此之前不得 release-ready。

## 8. 嚴格 UI/API/DB triad 重驗（2026-08-22）

`f62749e2` 將 runner 的 list readback 從欄位數量檢查提升為實際列集合比對：UI 可見編號／品名／人類層資料標籤、API row 與唯讀 DB row 必須逐列一致；正常 `handling=none` 不要求技術字串出現在 UI。以該 commit 重新跑完整分母：

| 項目 | 結果 |
|---|---:|
| run | `DEV087-ui-only-2026-08-22T02-17-12-187Z` |
| D/P/R | 27/27、20/20、20/20（全部有 case evidence） |
| PASS / BLOCKED / FAIL | 1 / 66 / 0 |
| C01–C11 | 11/11 PASS |
| infrastructure | 2/2 PASS |
| unexpected failure／console error | 0 |
| direct business API／DB mutation | 0 |
| runtime port | `49587`，已釋放 |

此次沒有出現可歸因於產品的 FAIL；66 個 BLOCKED 仍精確指向缺少合法 UI 前置／Merged history，而非被 triad 檢查掩蓋。Evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T02-17-12-187Z/`。

## 9. Focused aggregate 回歸（2026-08-22）

在 strict triad runner 相關 commit 後再執行 `npm.cmd run qc:dev-087`：8/8 PASS（contract 31、repository 17、commands 39、migration 24、retirement 30、browser、typecheck、isolated build）。最新 browser manifest：`output/qa/dev-087/DEV087-2026-08-22T02-22-09-783Z/manifest.json`；runtime port `54750` 已釋放。此結果只確認既有 focused gate 無回歸，不改變 §8 的完整生命週期 `1 PASS／66 BLOCKED／0 FAIL` 結論。

## 10. QC journey 補強後重驗（2026-08-22 08:09）

本節取代前文對 D04 的暫時性 runner 失敗判讀，但不取代 67-case 完整放行門檻。

### 10.1 最新 evidence

Run：`DEV087-ui-only-2026-08-22T08-09-59-844Z`
Evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-09-59-844Z/`

| 項目 | 結果 |
|---|---:|
| Supplemental J01/J02/J03 | 3/3 PASS |
| Focused lifecycle J-D04 | PASS |
| C01–C11 | 11/11 PASS |
| Infrastructure | 6/6 PASS |
| Console errors／runner failures | 0 |
| UI-only business mutation | 0 direct API／DB mutation |
| Task-owned runtime | port `63776` 已釋放 |

J-D04 的第一次 FAIL 是 runner false negative：圖號審核頁的合法提示是「目前為唯讀；欄位、檔案、預覽與智慧辨識位置和編輯者相同。」而不是料號／關聯共用文案。runner 已改以 `/目前為唯讀/` 及 disabled controls 驗證，重跑後 PASS；`review-dom.json` 保留在失敗證據中。

### 10.2 產品缺口盤點（以 QC 證據為準）

| 識別 | 類型 | 結論 |
|---|---|---|
| `GAP-PROD-01` | 已修正的產品缺口 | canonical drawing workspace 舊 CSS 保留不存在的第三欄 resizer，導致 preview layer 攔截右側 Save；已在 `src/app/globals.css` 收斂為兩欄 grid，D03 已通過。 |
| `GAP-RUNNER-01` | 已修正的 QC runner 缺口 | 審核頁唯讀提示文字 domain-specific，不能用單一 exact string；已改語意 matcher 並保留 DOM debug。 |
| `GAP-DATA-01` | QA fixture／前置缺口 | 其餘 63 條一般生命週期案例缺少合法、可由 UI 建立且可清理的前置；不得改判產品 FAIL。 |
| `GAP-DATA-02` | QA fixture／前置缺口 | D27/P20/R20 沒有合法既有 Merged/history UI row；canonical UI 無入口時依契約 BLOCKED。 |
| `GAP-CANDIDATE-01` | 待觀察穩定性議題 | terminal navigation 期間已在途 preview GET 可能在 server log 出現 404；目前沒有可見錯誤、console error 或 partial write 證據，不列產品 FAIL。下一次 full run 若重現可見影響，才升級 defect。 |

### 10.3 本輪結論

本輪已完成「先補 QC journey，再盤點產品缺口」的第一段：J01–J03、J-D04 及共用閘門已可由 UI 驗證；D04 的紅燈已證實是 runner 判定錯誤。現在真正可歸因於產品的缺口只有 `GAP-PROD-01`，且已修正、待 full run 回歸確認；其餘為 runner／資料前置／待觀察項，不可混成產品 backlog。

完整 QC 仍維持 `NOT PASS`：必須再取得合法 UI 前置鏈，完成 `D01–D27 + P01–P20 + R01–R20 = 67/67 PASS`、`Blocked=0`、`Not Run=0` 後，才可做 release 判定。

## 11. Preview terminal race 修正後重驗（2026-08-22 08:20）

`DEV087-ui-only-2026-08-22T08-15-41-715Z` 的 `J-D03` 曾得到 `GET .../files/... ?preview=1 = 404` 與一筆 browser console error。由於該請求發生在 UI 取消工作後、檔案 binding 已由正常取消交易移除，這是可重現的產品穩定性缺口。

RD 修正 `src/app/api/pdm/drawing-revision-works/[workId]/files/[fileId]/route.ts`：只對 preview 讀取查詢已完成的 `dev087:drawing.cancel` command receipt；若確認是 UI 取消造成的 terminal late read，回 `204 No Content`，不回傳檔案內容。未知工作、下載請求與其他未授權情境仍是 `404`，因此沒有放寬資源邊界。

全新 disposable 重驗：`DEV087-ui-only-2026-08-22T08-20-06-370Z`，evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-20-06-370Z/`。

| 項目 | 結果 |
|---|---:|
| J01/J02/J03 | 3/3 PASS |
| J-D03 Save/reload/cancel | PASS |
| C01–C11 | 11/11 PASS |
| failures／consoleErrors | 0 / 0 |
| runtime cleanup | port `53690` 已釋放 |

因此 `GAP-CANDIDATE-01` 已升級為 `GAP-PROD-01` 並修正；目前 focused scope 已無可重現產品級 FAIL。仍不可宣告完整 QA PASS，因 65/67 case 仍是合法 UI 前置不足的 BLOCKED，且完整 67-case run 尚未完成。
## 12. QC journey 連續路徑修正後重驗（2026-08-22 08:41）

### 12.1 實際結果

- 三個工作臺 smoke journey：`J01-drawing-create-cancel`、`J02-part-create-cancel`、`J03-relation-create-cancel` 全 PASS。
- 圖號連續 journey：`J-D01` 建立、`J-D02` 取消、`J-D03` 編輯／儲存／重新載入全 PASS。
- `D01-D03` 的 UI、API、唯讀 SQLite readback 三方一致；D03 以連續執行順序重現並通過，證明輸入未再被第二次初始化讀取覆蓋。

### 12.2 產品修正與分類

- 真正產品缺口：工作頁重複 GET 的過期回應會覆蓋使用者輸入；已以序號、取消控制器及過期回應防護修正。
- 前次真正產品缺口仍納入本輪確認：工作區欄位遮罩造成 Save 點擊被攔截，以及取消後預覽請求收到 404；兩者均已修正，本輪 `consoleErrors=[]`。
- QC runner 修正：不再把新建工作「標題非空」當成前置條件；這是合法空白初始值，不是產品錯誤。

### 12.3 Gate 與剩餘缺口

證據：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-41-03-941Z`。

- `C01-C11 = 11/11 PASS`、基礎設施 `8/8 PASS`、`failures=[]`、`consoleErrors=[]`、埠 `52283` 已釋放。
- 總矩陣仍是 `67` cases 中 `4 PASS / 63 BLOCKED / 0 FAIL`；所以本輪可說「已補齊且通過 D01-D03 的 QC journey」，不可說「DEV-087 全生命週期已完成」。
- 63 個 BLOCKED 目前是 journey／fixture coverage 缺口（例如尚無合法 merged/history UI 前置資料），不是已證實的產品缺陷；但在各路徑真正執行前，也不能反向宣稱產品無缺口。下一階段先補 D04-D27、P04-P20、R04-R20 的 UI-only journey，再做產品缺口判定。
## 13. 審核 terminal race 修正後重驗（2026-08-22 08:49）

`J-D04` 與 `J-D05` 都通過 UI 建立、修改、送審、唯讀審核頁與決策；審核決策後的在途 preview 不再造成瀏覽器 404。修正後證據：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-49-54-823Z`。

| 項目 | 結果 |
|---|---:|
| J01/J02/J03 | 3/3 PASS |
| J-D04/J-D05 | 2/2 PASS |
| C01-C11 | 11/11 PASS |
| failures／consoleErrors | 0 / 0 |
| runtime cleanup | port `61975` 已釋放 |

此次修正後，已實際執行的 D01-D05 journey 均有成功證據（分別來自 08:41 與 08:49 disposable runs）；D24 維持 readback-only PASS；其餘 61 個需 lifecycle journey 的案例仍是 BLOCKED coverage，不能視為產品通過，也不能在未執行前列成產品缺口。
