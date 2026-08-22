# DEV-087 UI-only 全生命週期 QC 執行報告

執行日期：2026-08-22  
執行角色：獨立 AI-QC   
環境：Local disposable SQLite + task-owned Next runtime；未連 production/staging  
狀態：`Focused PASS / Full UI-only lifecycle NOT PASS / Contract-blocked`  

## 1. 本輪實際執行

### 1.1 RD 修正與 commit

- `ff42bf62 docs: add DEV-087 UI-only lifecycle validation plan`
- `f551870f test: make DEV-087 browser login UI-driven`

第二個 commit 將瀏覽器驗證的登入改為從 rendered `/login` 點擊「以系統管理員角色快速登入」，不再由 runner 直接 POST login API；登入後的 POST 是由可見 UI 觸發，符合 UI-only 操作邊界。

### 1.2 focused aggregate

執行：`npm.cmd run qc:dev-087`

| 子檢查 | 結果 |
|---|---:|
| contract | PASS 25 |
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

另外，執行契約仍有四個阻塞：

| Gap | 尚未定義／不可合法執行的事項 | QA 判定 |
|---|---|---|
| GAP-UI-01 | whole-object obsolete 與 active work／review／system 的優先序 | BLOCKED |
| GAP-UI-02 | root obsolete 與子 Drawing branch／Part／Relation active work 的 impact、cancel、stale 規則 | BLOCKED |
| GAP-UI-03 | `Merged` 沒有現行合法 UI 建立入口，無法不靠 seed 取得前置 | D27/P20/R20 BLOCKED |
| GAP-UI-04 | `system_admin／blocked` 沒有啟動前固定、由 UI 動作觸發且不改 business data 的 deterministic fault profile | C11 BLOCKED |

其中 whole-object obsolete／merged 並非目前 DEV-087 authority 已明確承接的 mutation；權威文件目前只明確承接 Drawing RD branch 的「申請作廢」與核准後關閉分支。未經產品／ADR 決策，QC 不得自行猜測或用 DB fixture 補造。

## 3. 結論與放行門檻

- DEV-087 focused implementation gate：`PASS`。
- DEV-087 新訂 UI-only 全生命週期驗證：`NOT PASS`，不是產品已通過的 67/67。
- 本輪沒有使用 prohibited business API／DB mutation 來冒充 journey 結果；也沒有刪除或重置正式資料。
- 在四個 contract gap 關閉、UI 起點可達、並完成真正 67 條 journey 的三層 evidence 前，DEV-087 不得標記為完整 QA/QC 通過或 release-ready。

## 4. RD 返工條件

1. 由產品／ADR 固定 GAP-UI-01、GAP-UI-02 的唯一規則；若不屬 DEV-087，必須從本計畫明確移出並建立關聯任務。
2. 提供合法 UI 導覽或明確將 GAP-UI-03 標為 scope-excluded；不得 seed／SQL 補造 merged 前置。
3. 提供 deterministic fault profile 的啟動契約，並證明只由後續 UI 動作觸發狀態。
4. 建立並執行 67 條 journey runner；任何 FAIL 需保留首次失敗證據，由 RD 修正後以全新 disposable run 重跑，不得覆蓋原失敗。

