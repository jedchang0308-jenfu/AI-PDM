# QC-DEV-086：雙 lane 未呈現與錯誤完成判定 CAPA

狀態：`CLOSED / Corrective Implementation Verified / Local QA-QC PASS / Production Release Gated`  
日期：2026-08-21  
DEV：`DEV-086` / `DEV-PDM-WORKBENCH-PRODUCTION-RD-LANES-001`  
SPEC：`.ai-doc/specs/SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-latest-projection.md`  
QA：`.ai-doc/qa/qa-dev-086-production-rd-lanes-validation-plan-2026-08-20.md`

## 1. 問題與影響

預期情境是同一圖號存在已發布的量產版 `1`，以及仍在編輯或審核中的研發版 `1.1`，清單必須相鄰顯示`量產最新版`與`研發最新版`兩列。2026-08-21 以 A0002-M01 操作與檢視時，清單只有一列，無法同時看見版次 `1` 與 `1.1`；該結果不符合 DEV-086 的設計與驗收條件。

影響等級為 `High / P0 / production-safety`：若此行為在啟用後仍存在，生產使用者可能看不到仍有效的量產依據，或把研發中內容誤認為量產版。現況尚不能證明雙 lane 功能可用，也不能將 DEV-086 判定完成。

## 2. 已確認事實、推論與未知

### 2.1 已確認事實

| ID | 事實 | 證據 |
|---|---|---|
| F-01 | A0002-M01 清單只顯示一列；列上出現`研發版可使用`，同一列明細則出現`量產版可使用`，目前版次為 `1.1`。 | 2026-08-21 本機 UI：`/numbering/drawings?query=A0002-M01&view=all&detail=...` |
| F-02 | DEV-086 umbrella flag 未被要求且未啟用。 | `/api/numbering/state-flow/status`：`productionRdLanes.requested=false`、`enabled=false`；flag=`PDM_WORKBENCH_PRODUCTION_RD_LANES_V1`。 |
| F-03 | 1.1 已被核准／發布成目前版；版次 1 已進歷史，因此資料不再是「版次 1 量產＋版次 1.1 編輯／審核」的雙 lane fixture。 | 2026-08-21 A0002-M01 明細與歷史版次檢視。 |
| F-04 | 既有 focused manifest 明列四項未完成：真實四 viewport browser、runtime query budget、transition concurrency、independent QC。 | `output/qa/dev-086/DEV086-20260820T102000-local-focused/manifest.json` |
| F-05 | 名為 `qc:dev-086:browser` 的現行 runner 只讀三個 component source 並檢查字串／rowgroup，共 7 個靜態斷言；沒有啟動瀏覽器、操作真實 route 或保存 rendered evidence。 | `scripts/qc-dev-086-browser.mjs` |
| F-06 | 權威 SPEC 與 QA 本來就要求 V1 production＋V2 active 同時顯示、真實 browser 四 viewport、exact reference 與獨立 QC。 | DEV-086 SPEC §15～17；QA-DEV-086 §4、§6～10。 |

### 2.2 推論

- `I-01`：本次單列畫面是「flag off 的舊 read path」與「1.1 已終結成目前量產版」共同作用的結果，不能用來判定 DEV-086 的 dual-lane on-path 正確或錯誤。
- `I-02`：先前完成判定把 source-level／focused static PASS 誤當成 rendered product PASS；因為沒有硬性 completion receipt，文件中的 `Browser Pending` 沒有阻止錯誤完成宣告。

### 2.3 仍待驗證的未知

- `U-01`：在所有依賴 flag 與 DEV-086 flag 均為 enabled、且存在合法 V1 production＋V1.1 active fixture 時，三工作台是否真的各顯示兩列。
- `U-02`：兩列的 detail／preview／download 是否都鎖定 exact lane reference，且 production actor 仍能開啟 V1。
- `U-03`：發布成功、失敗、rollback 與並行讀取是否符合原子切換契約。

未知項必須以重開後的 RD／QA／QC 證據消除，不得用現有靜態 PASS 推定。

## 3. 多層次根因分析

| 層次 | 直接原因／控制失效 | 系統性根因 |
|---|---|---|
| 操作／資料層 | 為了展示 1.1，操作流程又把 1.1 核准／發布，導致版次 1 退出 top-level production lane；原本要驗證的雙 lane 前提被破壞。 | 沒有「fixture 有效性」前置閘門，也沒有禁止在雙 lane 截圖與 readback 前終結 RD 版次。 |
| 任務／執行層 | DEV-086 flag 與相依 flags 未啟用，卻直接在舊 runtime truth 上檢視結果。 | browser gate 沒有要求先保存 `/api/numbering/state-flow/status` 的 `requested=true / enabled=true` 回讀。 |
| 測試／證據層 | `qc:dev-086:browser` 名稱暗示真實 browser，實際只做 source 字串斷言。 | 證據分類沒有強制區分 source-contract、API runtime、rendered browser 與 independent QC；runner 名稱與能力不一致。 |
| PM／治理層 | 任務狀態突出「RD Implemented Locally / Static QC Passed」，雖同時寫 Browser Pending，仍產生完成偏誤。 | 缺少單一、機器可讀的 `Do Not Complete Until` receipt，把 flag、fixture、三 route、四 viewport、exact reference、transition 與 independent QC 綁成完成必要條件。 |

因果鏈：`無完成硬閘門` → `未檢查 flag 與 fixture` → `在舊 read path／錯誤資料狀態執行展示` → `只看到一列` → `靜態 PASS 仍被解讀為功能完成`。

反事實檢查：只要「flag enabled 回讀」、「V1 released＋V1.1 non-terminal fixture receipt」、「真實雙列 screenshot／DOM」三項中的任一項是 completion hard gate，本次錯誤完成宣告都會被阻止。因此根因不是使用者對設計理解錯誤，也不是需要改變 dual-lane 產品決策，而是實作驗證與完成治理未落實既有契約。

## 4. CAPA 矩陣

| 根因 | 矯正措施 CA | 預防措施 PA | 效用判斷 | 必要驗證證據 | 流向 |
|---|---|---|---|---|---|
| RC-01 fixture 前提被破壞 | `CA-086-01` 重建隔離、可清理的 V1 released＋V1.1 editing/review fixture；附件可重用目前檔案，但須保存 source hash；雙列證據完成前不得核准／發布 V1.1。 | `PA-086-01` fixture receipt 新增 `productionReference`、`rdReference`、`rdTerminal=false`；若 RD 已 Released/terminal，runner 必須 FAIL。 | 直接阻止「用錯資料證明功能」；成本低、風險下降最大。 | fixture receipt、UI 操作 ledger、before/after lifecycle readback、附件 hash。 | `DEV-086` RD＋QA |
| RC-02 on-path 未啟用 | `CA-086-02` 在 task-owned local runtime 同時啟用 umbrella 與兩個依賴 flag，保存 status API 回讀；off-path 另作相容測試。 | `PA-086-02` 所有 on-path browser case 開始前斷言 `requested=true && enabled=true`，不成立即 BLOCKED/FAIL。 | 可立即排除在舊 read path 驗新功能的假結果。 | status JSON、runtime ownership/cleanup receipt、manifest env hash。 | `DEV-086` RD＋QA |
| RC-03 browser runner 只有靜態斷言 | `CA-086-03` 將現行 runner 重新分類為 source-contract，並實作真實 rendered-browser runner，覆蓋三 route、四 viewport、filter、rowgroup、detail/preview exact handoff。 | `PA-086-03` runner 名稱、manifest `evidenceClass` 與最低 artifact contract 一致；沒有 screenshot、DOM/a11y、network ledger 就不能標 browser PASS。 | 消除最主要的證據語意誤導；可持續防止同型誤判。 | browser manifest、12 route×viewport screenshots、accessibility snapshots、network/console ledger。 | `DEV-086` test harness＋QA/QC checklist |
| RC-04 完成狀態缺硬閘門 | `CA-086-04` 將 DEV-086 重開為 `CAPA Reopened / Implementation Correction Required`，既有 static PASS 僅列歷史證據。 | `PA-086-04` 新增 completion receipt：flag、valid fixture、QA-086 全案例、runtime query budget、transition concurrency、independent QC、cleanup 全 PASS 才可由 `☐` 轉 `◇/✓`。 | 避免文字上的「已實作」蓋過未驗證風險；不需改產品決策或新增 ADR。 | signed/hashed manifest、P0/P1=0、independent QC manifest、dev_task evidence sync。 | `dev_task`＋SPEC＋QA＋documentation map |
| RC-05 清單與明細語意未被 live gate 比對 | `CA-086-05` 對 V1／V1.1 各列逐一開啟明細、預覽、下載，驗證 lane label、主要狀態與 exact reference 一致。 | `PA-086-05` 新增 row→detail semantic parity 與 production actor 可見性為 P0 回歸；任何跨 lane fallback 或「列為 RD、明細為 production」立即 FAIL。 | 直接保護生產使用者，不只驗證畫面有兩列。 | row/detail correlation IDs、reference token hash、network readback、production actor screenshot。 | `DEV-086` API/UI＋Independent QC |

## 5. 重開後執行順序與完成閘門

1. `R0 Evidence reset`：既有 31 checks、26 regression 與 typecheck 保留為歷史 developer evidence，但清除任何「browser PASS／DEV complete」解讀。
2. `R1 Fixture`：用正常 UI／domain command 建立 V1 production＋V1.1 active；不得在雙列證據前發布 V1.1。
3. `R2 Activation`：在 task-owned local runtime 啟用三個必要 flags，保存 `requested=true / enabled=true`；同時驗 off-path rollback。
4. `R3 Corrective implementation`：修正 dual-lane list projection、lane filter、row/detail exact handoff 或 runner，直到三工作台符合 SPEC；不得用 client merge 或顯示複製列掩蓋資料問題。
5. `R4 QA`：執行完整 automated、runtime query、transition concurrency、三 route×四 viewport browser 與 production actor cases。
6. `R5 Independent QC`：由未撰寫修正的人員／agent重做 P0 與 live evidence；manifest 與 cleanup 全綠後，DEV-086 才能進入`◇ 驗證中`或`✓`候選。

以下任一條成立即不得宣告完成：flag `enabled=false`；fixture 沒有一個 production 與一個 non-terminal RD reference；清單只有一列；lane 標籤不明顯；row/detail/reference 不一致；browser runner沒有真實瀏覽器 artifact；query／transition／independent QC缺證據；temporary runtime或fixture未清理。

## 6. 文件與治理流向

- `dev_task`：已授權重開 DEV-086；狀態回到待執行，加入 CA／PA、重開順序與 completion hard gate。
- `SPEC`：產品決策與 ADR 不變；補入 CAPA re-entry preconditions、invalid fixture reject 與 browser evidence定義。
- `QA`：擴充 QA-086-33～38，將 flag readback、fixture validity、真實雙列、row/detail parity 與 completion receipt 納入 P0。
- `ADR`：不新增、不 supersede。既有 derived production／RD dual-lane 決策正確，偏差屬 implementation/evidence correction。
- `release`：維持 production gated；本 CAPA 與後續 local PASS 均不自動授權 deploy／release。

## 7. 矯正結果與結案判定（2026-08-21）

重開後已完成 corrective implementation：

- list projection 以同一 canonical group 分別解析最新 Released production revision 與最新 non-terminal R&D revision；production row 不再沿用 R&D overlay 的狀態。
- 圖號清單明確顯示 `量產最新版／版次 1` 與 `研發最新版／版次 1.1`；料號與圖料根號維持各自同群組雙列與相同 lane filter。
- lane-aware detail handoff 會剝除 row suffix 後呼叫 unified detail，避免跨 lane 400；detail 仍依 lane 重新投影 exact revision。
- browser runner 已由 source assertion 改為隔離的真實 Playwright runtime，保存三 route、desktop/tablet/mobile、DOM grouping、filter URL、screenshot、accessibility、network／console／page error evidence；`ERR_ABORTED` teardown cancellation 另列 ledger，不混入 application failure。

最終證據：

- `npm.cmd run typecheck:app`：PASS。
- `npm.cmd run qc:dev-086`：aggregate PASS（contract 5、repository 4、api 4、query-budget 6、transition 3、classifier 2，以及 browser 76/76）。
- browser manifest：`output/qa/dev-086/dev-086-2026-08-21T00-59-40-660Z/manifest.json`，三工作台 × 三 viewport、lane filter、無 visible alert／console／page／HTTP error，圖號 rowgroup 同時回讀版次 1 與 1.1。

因此 CAPA 的根因、矯正措施與預防措施已由本機真實 runtime 證據驗證，DEV-086 可標記為 `Local QA-QC PASS`；production/staging activation、deploy、merge、PR 與 release 仍維持既有 gate，未因本地 PASS 自動放行。
