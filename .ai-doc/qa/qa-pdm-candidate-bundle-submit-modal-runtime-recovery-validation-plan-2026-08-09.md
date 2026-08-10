# QA 驗證計畫：候選圖料整包送審確認視窗與 runtime 復原

對應規格：`SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001`  
對應任務：`DEV-059`；父交付點：`DEV-057`  
狀態：`AI Real Operation Passed / Isolated Disposable Mutation Passed / Extended Gate Complete / Release Not Authorized`  
日期：2026-08-09  
驗證風險：Medium；缺陷優先級：P0  

## 1. QA 角色與結論邊界

- QA 定義驗收、風險、資料與 QC 操作，不修改產品程式。
- RD 完成後，QC 依本計畫執行事實驗證；QC 預設不修改產品，任何失敗回送 RD。
- 使用者現場截圖是 first-class reopen evidence；舊 `DEV-057` browser PASS 只保留為歷史基線。
- 靜態 source assertion、API probe、DB 查詢、typecheck、lint 或 build 不能單獨證明本 UI 通過。
- AI 必須在真實渲染頁面，以真實 click／keyboard／reload／back-forward 操作完成本計畫；mutation 案例只使用 isolated disposable fixture。
- 判定只能是 `通過`、`未通過`、`未充分驗證` 或 `阻塞`。
- 本輪 current-route focused recovery 證據固定記錄於 `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md`；共享 `A0006-M01` 保持唯讀。送審／撤回／故障回滾由同一 UI 在 disposable isolated runtime 真實執行並留下 before/after、request、trace 與 cleanup 證據。

## 2. 驗證範圍

### In Scope

- `/numbering/drawings?view=all&detail=candidate:{workspaceId}` deep link；
- `bundle_ready` 候選 drawer 的 readiness／effectiveness 說明；
- `送交圖料與首版整包審核` modal；
- `X`、`返回檢查`、`Escape`、焦點回復與 nested overlay；
- hard reload、route re-entry、browser back/forward、bfcache、後端中斷後 local close；
- 真實 UI 送審、idempotency、unknown-result readback 與 humanized error；
- 1440×900、1024×768、390×844 與使用者原 viewport；
- visible errors、console/network、DOM、資料一致性與 cleanup。

### Out of Scope

- 變更 numbering lifecycle、approval authority、permission、schema/migration 或 API contract；
- production／staging mutation、live provider、正式資料修復、deploy、release；
- reviewer 核准後的完整原子正式化回歸；該既有 authority 只跑最小 non-regression gate；
- 真人使用性研究。AI 5 秒理解只作可觀察 UX proxy。

## 3. 測試資料與安全邊界

| 類型 | 資料 | 允許操作 | 禁止操作 |
|---|---|---|---|
| 使用者問題重現 | `A0006-M01`／`draft-workspace-285395c9-3b51-4837-acc1-103d13997f2c` 或同等 readback | 唯讀開啟 drawer、開／關確認 modal、reload、back-forward | 確認送審、取消、刪檔、改版次 |
| 實際 mutation | 名稱含 `QA_DEV059_<runId>` 的 isolated disposable bundle | 上傳 disposable 檔、開／關 modal、送審、必要時撤回／取消與 cleanup | 使用既有候選或正式資料代替 fixture |
| 故障注入 | isolated server／test route interception | 延遲、503、連線中斷、response loss、service stop after render | 對正式 server 或 production 注入故障 |

Gate 0 必須先記錄：repo root、branch、HEAD、dirty files、URL、port owner、資料庫路徑、DB provider、登入角色、company、feature flags、productionConnected、productionWrites 與 timestamp。

若不能證明資料與 runtime 為 local／disposable，立即停止 mutation；唯讀案例可繼續，但整體最多為 `未充分驗證`。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 三個關閉控制皆無反應 | hydration／event handler 未生效、透明層攔截、stale page | 主要流程完全卡死 | current route coordinate + semantic click、event hit、DOM、console | P0 | AI-REAL-003～005、AI-RUNTIME-001 |
| 關閉後立即重開 | click-through、底層送審按鈕收到同一事件 | 使用者無法退出 | modal count timeline、pointer target | P0 | AI-REAL-006 |
| 一次 Escape 關兩層 | modal／drawer key handler 未隔離 | 失去候選上下文 | modal/drawer count、URL | P0 | AI-REAL-005 |
| reload／返回後 modal 復現 | confirm state 被 URL、bfcache 或 stale client state 恢復 | 誤以為系統永久卡住 | hard reload、back-forward、pageshow persisted | P0 | AI-REAL-007～009 |
| 重複建立審核單 | double activation、retry 沒有沿用 idempotency | 重複鎖定與稽核污染 | request count、idempotency receipt、DB before/after | P0 | AI-WRITE-002/003 |
| POST 結果未知仍可再次送出 | timeout UI 只顯示失敗、未 readback | 可能重複送審或誤判未送出 | response loss fault、authoritative reload | P0 | AI-FAULT-003 |
| `可送審` 與 `不可正式使用` 被理解為矛盾 | 狀態維度未解釋、警語顏色像 blocker | 使用者誤認缺件、不敢操作 | 5 秒理解、visible text inventory | P1 | AI-UX-001/002 |
| 缺件數／檔案數與資料不一致 | client 重算第二套 readiness | 錯送審或錯誤阻擋 | API/DB readback 與 DOM compare | P1 | AI-DATA-001/002 |
| server 斷線使 local close 失效 | close 路徑耦合 fetch／busy | 使用者被困在舊畫面 | service stop after modal render | P1 | AI-RUNTIME-002 |
| raw 4xx/5xx／route text 可見 | drawing workbench 直接顯示 backend body | 使用者無法理解與復原 | visible-error sweep | P1 | AI-FAULT-001/002 |
| 390px modal 裁切或按鈕不可操作 | modal height、footer、long text overflow | mobile 無法返回或確認 | screenshot、scrollWidth、button box | P1 | AI-VIEW-003 |
| focus 沒回送審按鈕 | previous focus 未保存或多 overlay | 鍵盤操作迷失 | activeElement log | P2 | AI-A11Y-001 |
| 舊 isolated PASS 覆蓋 current failure | QA 只相信腳本 | 缺陷反覆出現 | evidence provenance audit | P1 | Gate 0、Gate 6 |

## 5. 驗證 Gate

### Gate 0：Provenance 與 reopen baseline

1. 保存使用者截圖來源、route、候選 ID 與問題摘要。
2. 記錄 current source、runtime、port owner、資料 provider、角色與 dirty boundary。
3. 唯讀 readback 驗證測試候選的 workspace、relation、revision、files、finalized evidence 與 approval request count。
4. 明確標記舊 `DEV-057` PASS 為歷史，不得用它直接判定本輪通過。

### Gate 1：Static／focused contract

RD 須新增 focused tests，至少涵蓋：

- confirm state 只由 explicit action 開啟；
- closeDetail／detail change／unmount 清除 orphan confirm state；
- X、返回、Escape 共用 local close contract；
- nested modal Escape isolation；
- URL 沒有 confirm state；
- reload／back-forward 不自動重開；
- readiness/effectiveness 人類文案與 preview counts；
- unknown-result readback／idempotency guard；
- raw error translation。

### Gate 2：使用者同 route 真實唯讀操作

在 current app fixed local entrypoint 或等效 authenticated current tab 執行 AI-REAL-001～009。必須包含 hard reload 與真實滑鼠／鍵盤操作，不能用 React state injection 或直接執行 handler 代替。

### Gate 3：故障復原

只在 isolated runtime 執行 service stop、503、延遲與 response loss。確認 local close、結果未知 readback 與安全返回。

### Gate 4：Disposable 真實 mutation

AI 從 UI 建立 fixture、完成最低合法首版、開／關 modal、確認送審、驗證單一 request，再依測試設計撤回／取消與 cleanup。API/DB 只作前後證據，不得代替 UI mutation。

### Gate 5：Viewport／UX／Accessibility

在 1440×900、1024×768、390×844 與使用者原 viewport 執行 modal、drawer、長檔名、捲動、focus、Visible Text Noise 與 5 秒理解檢查。

### Gate 6：Independent QC 與證據封存

QC 在產品碼凍結後重跑。P0/P1 任一不為 0 即未通過；缺任何必要 browser／mutation／cleanup／current-route evidence 即未充分驗證。

## 6. AI 真實操作案例

### 6.1 使用者問題 route：唯讀／零寫入

| ID | 前置條件 | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|---|
| AI-REAL-001 | 本機服務與 authenticated actor 可用 | hard reload 使用者相同 deep link | 只開 candidate drawer；中央 modal count=0 | URL、viewport、screenshot、DOM count |
| AI-REAL-002 | candidate 為 `bundle_ready` | 只看首屏 5 秒，不捲動、不開 help | 能回答缺件 0、可送審、核准前不可正式使用、下一步 | screenshot、逐題答案 |
| AI-REAL-003 | AI-REAL-001 | 點 `送交審核`，再點 header `X` | modal 關閉、drawer 留存、URL detail 留存、零寫入 | before/after screenshot、counts、DB hash |
| AI-REAL-004 | 重新開 modal | 點 `返回檢查` | 與 X 相同；焦點回送審按鈕 | activeElement、DOM、DB hash |
| AI-REAL-005 | 重新開 modal | 按一次 `Escape` | 只關 modal；drawer 不關；第二次 Escape 才依 drawer contract 關閉 | modal/drawer timeline、URL |
| AI-REAL-006 | 重新開 modal | 以實際 coordinate click X／返回，檢查 event target | 不 click-through、不立即重開；alertdialog max count=1 | hit target、count timeline |
| AI-REAL-007 | modal 開啟但未確認 | hard reload | modal 消失；detail URL 重新開 drawer；零寫入 | reload log、screenshot、DB before/after |
| AI-REAL-008 | modal 開啟但未確認 | 導覽安全同源頁再 Back／Forward | 未送出的 modal 不永久恢復；drawer／selection 符合 URL | URL timeline、pageshow persisted、screenshot |
| AI-REAL-009 | drawer／modal 多次開關 | 切換另一列再切回 | confirm state 不跨 candidate；identity 與 selection 一致 | rowKey、title、modal count |

每一種 close 必須獨立執行，不得以其中一個成功推論其他兩個成功。

### 6.2 Runtime／故障復原

| ID | 故障 | AI 操作 | 預期結果 | 必要證據 |
|---|---|---|---|---|
| AI-RUNTIME-001 | client interactivity 尚未 ready／chunk 延遲 | 在可控 isolated runtime 延遲 client bundle | critical CTA 不呈現假可用；恢復後才可開 modal | video/timeline、button state |
| AI-RUNTIME-002 | modal 已開、尚未確認，停止 isolated app server | 點 X、返回、Escape各一次 | local close 仍有效；不需要 API | server state、operation log |
| AI-FAULT-001 | submit route 503 | disposable fixture 點確認 | 人類訊息、可返回、可重新查詢；無 raw route/HTTP body | screenshot、visible error、network |
| AI-FAULT-002 | submit route 延遲超過 UI threshold | 等待至 recovery state | 不永久 busy；顯示結果未確認與 readback CTA | timeline、DOM text |
| AI-FAULT-003 | server 已 commit，但 client 丟失 response | 點重新查詢狀態 | 發現既有 request，不發第二次 mutation | request count、idempotency、network |

故障案例的預期 503／斷線必須在 evidence 標記為 planned fault；其他 console error、failed request 或 visible error 均為失敗。

### 6.3 Disposable 真實 mutation

| ID | 前置條件 | AI 真實操作 | 預期結果 | 必要證據 |
|---|---|---|---|---|
| AI-WRITE-001 | isolated DB、建立權限 | 由 UI 建立 `QA_DEV059_<runId>` bundle，完成版次、關聯與真實 disposable 檔案 | server 投影 `bundle_ready`、缺件 0 | operation log、workspace readback、file hash |
| AI-WRITE-002 | AI-WRITE-001 | 開 modal，快速 double activate 確認控制 | 只送出一次；按鈕防重複 | request/network count |
| AI-WRITE-003 | POST 成功 | 從 UI 查看送審結果並 reload | 只有一個 pending request、reservation/revision lock一致、CTA轉為查看審核 | UI、API/DB readback |
| AI-WRITE-004 | actor 具安全撤回權限且尚無 decision | 從 UI 撤回，再取消 disposable candidate | request terminal、號碼釋出、無正式 master、cleanup 完成 | cleanup.json、before/after counts |

若無法安全撤回／取消，不得改用直接 DB delete 冒充 cleanup；停止並回報阻塞。

## 7. Viewport 與 UI/UX 驗證

### 必測 viewport

- `1440x900`：一般 desktop；
- `1024x768`：低高度 laptop；
- `390x844`：mobile portrait；
- 使用者截圖原 viewport 或同等最大化 Chrome viewport。

### 可觀察門檻

| ID | Acceptance Criteria | Auto Evidence | Manual／AI Evidence |
|---|---|---|---|
| UX-059-001 | 5 秒內知道缺件、可否送審、候選效力與下一步 | required text／CTA count | 首屏 screenshot + 逐題答案 |
| UX-059-002 | 正常狀態只有一個 primary CTA | DOM class/count | screenshot |
| UX-059-003 | modal preview 顯示圖料、版次、主控檔與附件範圍 | DOM values vs readback | screenshot + data compare |
| UX-059-004 | X／返回／Escape 都能復原且結果可預測 | modal/drawer count | operation log |
| UX-059-005 | 候選效力不是阻擋送審的孤立警語 | text scan | 5 秒理解／紅筆刪除測試 |
| UX-059-006 | error／unknown result 先回答使用者現在要做什麼 | state text | failure screenshot |
| UX-059-007 | modal 完整落在 viewport，按鈕可見可按 | bounding box／scroll metrics | 三 viewport screenshot |
| UX-059-008 | 沒有 raw status、route、HTTP、stack 或 API text | rendered text sweep | screenshot／defects log |

### Now What Matrix

| State | 使用者問題 | 第一行人類結論 | 下一步 |
|---|---|---|---|
| bundle_ready | 我是否還缺東西？ | `資料已齊，可以送審` | `送交審核` |
| candidate effectiveness | 為何還不能正式用？ | `核准前仍是候選圖料號，不可正式使用` | 完成送審／等待核准 |
| confirm open | 我現在會送出什麼？ | `資料已齊；確認後將送交審核` | 確認或返回檢查 |
| submitting | 有送出去嗎？ | `正在送交審核…` | 暫時等待，防重複 |
| result unknown | 到底有沒有送出？ | `送審結果尚未確認` | 重新查詢狀態／返回工作台 |
| failed | 我怎麼恢復？ | 人類化失敗結論 | 重試／返回／依權限找管理者 |
| in_review | 還要再送一次嗎？ | `整包審核中，不需重複送審` | 查看審核 |

## 8. Data Sanity 與零寫入 Gate

唯讀 close/reload 案例前後至少比較：

- workspace `row_version`；
- reservations 的 state、row version、approval request ID；
- candidate revision row version、lifecycle、approval request ID、snapshot hash；
- approval request count；
- file/evidence count、primary marker、hash；
- formal master count。

AI-REAL-003～009 任一欄位變動即 P0。AI-WRITE 案例只允許 disposable fixture 產生計畫內差異。

## 9. Required Commands

RD 完成後至少執行：

```powershell
npm.cmd run typecheck
npm.cmd run qc:dev-059:candidate-submit-modal-ui
npm.cmd run qc:dev-059:candidate-submit-modal-real-operation
npm.cmd run qc:dev-053:flow
npm.cmd run qc:pdm-number-state-flow-approval-integration
npm.cmd run qc:pdm-number-state-flow-phase1c-http
npx.cmd eslint src/components/number-state-workspace.tsx src/components/drawing-workbench.tsx scripts/qc-dev-059-candidate-submit-modal-ui.mjs scripts/qc-dev-059-candidate-submit-modal-real-operation.mjs --quiet
```

若變更實際觸及 `src/app/globals.css`，加跑既有 CSS boundary gate。若變更觸及 app error boundary，另跑 isolated build；build 仍不能替代真實瀏覽器操作。

## 10. 證據輸出契約

固定輸出：`output/qa/pdm-candidate-submit-modal-recovery/<runId>/`

| Artifact | 必要內容 |
|---|---|
| `run-manifest.json` | branch、HEAD、dirty boundary、URL、port、provider、actor、fixture、flags、viewports、productionConnected/Writes |
| `baseline.md` | 使用者問題、舊 PASS 為何被 reopen、current readback |
| `operation-log.md` | 每個案例的前置、實際 click/key/reload、預期、實際、判定 |
| `screenshots/` | current deep link、三種 close、reload、fault、success、三 viewport，不可只留成功畫面 |
| `dom-metrics.json` | modal/drawer count、roles、focus、event target、z-index、pointer-events、overflow |
| `console-network.json` | console、request/response、planned faults、unexpected failures |
| `data-before-after.json` | workspace/reservation/revision/request/file/evidence/formal master 差異 |
| `ux-review.md` | 5 秒答案、Now What、紅筆刪除、visible text inventory |
| `defects.md` | severity、route、viewport、steps、expected/actual、evidence、RD disposition |
| `cleanup.json` | fixture IDs、撤回/取消、號碼釋出、正式資料零污染、殘留 count |

## 11. 缺陷分級

| 等級 | 定義 | 結果 |
|---|---|---|
| P0 | modal 無法退出、兩層一起關閉、重複送審、正式／既有資料污染、跨公司資料 | 立即停止，整體未通過 |
| P1 | 主要流程不可用、readiness 誤導、visible error、結果未知無復原、關鍵 viewport 不可操作 | 整體未通過，回送 RD |
| P2 | 可完成但 focus、文字雜訊、一致性或次要 viewport 有缺口 | 不得恢復完整 UI PASS；需 disposition |
| P3 | 不影響任務的小幅 polish | 可列改善，不阻擋本機功能判定 |

## 12. 最終通過條件

父交付點 `DEV-057` 的本機 QA/QC 已由本輪 DEV-059 extended gate 恢復；production、merge、PR、deploy 與 release 仍未授權。本輪判定依 current-route AI evidence 與 disposable isolated UI mutation evidence：

1. Gate 0～6 完整；
2. 使用者同 route 或等效 current-source hard-reload recheck 通過；
3. X、返回、Escape、reload、back-forward、offline close 全部有真實操作證據；
4. isolated UI runner `DEV059-20260809-161835-isolated` 已證明由真實 UI 建立 disposable bundle、送審鎖定、撤回／取消清理、planned 503 recovery、response-loss readback 與 idempotent replay；共享工作區未執行 mutation；
5. 三個必要 viewport及使用者原 viewport無阻塞缺陷；
6. Visible Error Sweep 通過；非計畫內 console error／failed request 為 0；
7. P0/P1 為 0；P2 均有可接受 disposition；
8. data before/after 證明 current-route 唯讀案例零寫入、mutation 只影響 `QA_DEV059_<runId>` disposable fixture，且 cleanup `removed`、正式主檔污染為 0；
9. focused/static、typecheck、lint 與直接相關回歸 gate 通過；
10. QC 報告逐項引用證據，不以 RD 自述或舊 PASS 代替。

本輪完整證據位於 `output/qa/pdm-candidate-submit-modal-recovery/DEV059-20260809-161835-isolated/`，執行 `npm.cmd run qc:dev-059:candidate-submit-modal-real-operation`，11/11 PASS、`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`、非預期瀏覽器錯誤為 0。缺少 current-route 真實瀏覽器、close/reload/history、viewport 或 cleanup 證據，仍判定 `未充分驗證`；本輪共享資料不執行 mutation，所有可逆 mutation 均限定 disposable fixture。
