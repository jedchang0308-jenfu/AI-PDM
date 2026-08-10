# SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001

標題：候選圖料整包送審確認視窗與 runtime 復原契約  
狀態：`Local RD Implemented / AI QA-QC Passed / Commit Pending / Production Release Gated`
對應任務：`DEV-059`  
父交付點：`DEV-057`；相關 authority：`DEV-052`、`DEV-053`  
風險：Medium；優先級：P0  
更新日期：2026-08-09  
執行邊界：本機產品修正、focused tests、AI 真實瀏覽器驗證；共享 route 保持唯讀，可逆 mutation 僅限 disposable isolated runtime；不含 production、deploy 或 release

## 1. 問題與使用者證據

使用者在 `/numbering/drawings?view=all&detail=candidate:{workspaceId}` 開啟候選圖號 `A0006-M01`，點擊送審後看見
「送交圖料與首版整包審核」確認視窗，但 `X`、`返回檢查` 與其他按鈕均無法使畫面回到可操作狀態；重新進入仍感覺停留在同一畫面。

唯讀資料查證顯示該筆資料沒有缺件：

- workspace、主根、1 個料號、1 個製造圖與主要圖料關聯存在；
- 研發版次為 `0.1`；
- `A0006.SLDPRT` 與 `A0006-M01.SLDDRW` 實體存在、大小與雜湊一致；
- 主控檔及附件均有 finalized publication evidence；
- 尚無 approval request，符合仍停留在確認送審前的狀態；
- server projection 合法判定為 `bundle_ready`。

因此真正問題不是缺資料，而是：

1. 確認視窗失去可復原出口，阻斷主要工作流；
2. `整包可送審` 與 `候選圖號尚不可正式使用` 缺少維度說明，造成使用者誤認為仍有缺件；
3. 舊 QA/QC 證據只證明隔離測試情境，不能覆蓋使用者目前可見失敗；
4. 真實頁面可能存在事件、hydration、bfcache、stale bundle、overlay 或 local runtime 中斷問題，必須先以瀏覽器證據定位，不得只改文案掩蓋。

## 2. Spec Impact Preflight

結論：`Compatible exception`。

- 保留 `SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001` 的候選首版、整包送審與核准後原子正式化 authority；
- 保留 `SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001` 的 single workbench、single primary action、deep link 與 server projection；
- 保留 `SPEC-PDM-ENTITY-DETAIL-DRAWER-001` 的共用 `DrawingWorkspaceDrawer`、nested modal 與候選／正式 adapter boundary；
- 不修改 schema、migration、候選號碼、版次、檔案 evidence、審核權限、API payload、approval authority、正式化 transaction 或 production slice；
- 本規格補強 client overlay lifecycle、狀態說明、失敗復原與真實操作驗證。

ADR 不需要：本修正局部、可逆，沒有新的架構 authority 或不可逆替代決策。

## 3. UX Intent

- 使用者：建立候選圖料與首版後準備送審的 RD／申請人。
- 使用情境：高風險提交前，需要確認範圍，也必須能安全返回檢查。
- 使用者心智模型：`可送審` 代表資料已齊；`候選號` 代表核准前仍不可正式使用，兩者不是互斥狀態。
- 主要任務：確認整包內容後選擇送審，或不寫入地返回檢查。
- 成功狀態：使用者 5 秒內知道「缺件 0、現在可以送審、核准前仍不可正式使用」，且可用滑鼠或鍵盤離開確認視窗。
- 主要 CTA：`確認整包送審`。
- 安全返回：`返回檢查`、header `X`、`Escape`，三者語意一致且不呼叫 API。
- 最可能誤解：把「候選圖號不可正式使用」誤讀為「仍缺檔、不能送審」。
- 不能發生：確認視窗無法關閉、關閉連帶關掉底層 drawer、重新載入自動重開確認、重複建立 approval request、raw API error 可見。
- 使用思考習慣：`#目的`、`#溝通設計`、`#可驗證性`。

## 4. 使用者可見狀態契約

### 4.1 Drawer readiness

`bundle_ready` 必須使用一個完整的人類結論，不得讓兩個 badge／警語互相競爭：

- 主結論：`資料已齊，可以送審`；
- 效力說明：`目前仍是候選圖號；核准完成前不可正式使用。`；
- 缺件摘要：`缺件 0`，或顯示 server-derived 未完成項目；
- 下一步：唯一 primary CTA `送交審核`。

不得把「候選圖號不可正式使用」單獨作為橘色阻擋警語放在 `bundle_ready` 主要結論旁。候選效力仍須可見，但語氣必須說明它不阻擋送審。

### 4.2 確認摘要

確認視窗必須在送出前顯示可理解的 preview：

- 標題：`送交圖料與首版整包審核`；
- 結論首句：`資料已齊；確認後將送交審核`；
- 效力說明：`核准前仍是候選圖料號，不可正式使用。`；
- 動態範圍：主根數、料號數、圖號數、候選版次、主要受控檔數與受控附件數；
- 影響：送審成功後圖料號、關係、版次與檔案 evidence 一起鎖定；核准後由既有 authority 原子正式化；
- 缺件為 0 時不得再顯示模糊的「請檢查是否完成」；缺件不為 0 時不得開啟可確認送審 modal。

數量來自已載入的 authoritative workspace；是否可送審仍只信任 server capability／lifecycle projection，不在 client 重建第二套 readiness 規則。

## 5. Modal 生命週期契約

1. 確認視窗只能由本次已互動 session 的明確 `送交審核` click／keyboard activation 開啟。
2. URL 的 `detail=candidate:{workspaceId}` 只允許重開底層候選 drawer，不得表示或重建 `confirmAction`。
3. `X`、`返回檢查` 與 `Escape` 在尚未送出時必須同步清除 `confirmAction`；不得 fetch、不得寫資料。
4. 關閉確認視窗後，底層 `DrawingWorkspaceDrawer`、選取列與 `detail` URL 必須保留，焦點回到原 `送交審核` 按鈕。
5. 一次 `Escape` 只關閉最上層 modal，不得同時關閉底層 drawer。
6. 關閉 drawer、切換 candidate、detail request 失效、route 離開或 component unmount 時，必須一併清除 orphan `confirmAction`。
7. hard reload、browser back/forward restore、bfcache resume 與重新進入相同 deep link 後，預設只恢復 drawer，不恢復未送出的確認視窗。
8. modal backdrop 不以 click-through 觸發底層 `送交審核`，不得造成關閉後立即重開。
9. 同一頁最多存在一個 `[role="alertdialog"]`；z-index、pointer-events 與 focus trap 必須以實際 DOM/coordinate click 驗證。

## 6. 送出、等待與復原契約

### 6.1 尚未確認

- 所有安全返回控制保持可用；
- 不存在 approval request、reservation lock 或 row version 寫入；
- 重複開啟／關閉不改變資料。

### 6.2 已按確認

- 只允許一個 POST，沿用既有 Idempotency-Key；按鈕立即防重複；
- 顯示 `正在送交審核…` 與清楚的短暫等待狀態；
- 成功後關閉 modal，重新讀取 authoritative workspace，顯示 `整包審核中` 與正確下一步；
- 不得因 client state 先行假設成功。

### 6.3 結果未確認／錯誤

- 網路中斷、逾時、server 5xx 或 client runtime failure 不得讓使用者永久困在 modal；
- 若 POST 結果未知，先顯示 `送審結果尚未確認`，提供 `重新查詢狀態` 與 `返回圖號工作台`，不得直接產生新的 mutation；
- 重新查詢發現已送審時，顯示既有 request；未送審時才允許使用原 idempotency contract 重試；
- `X`／返回不得在結果未知時謊稱「已取消送審」；只代表離開確認畫面；
- 使用者可見訊息不得出現 raw route、HTTP body、stack、SQL、`Internal Server Error` 或未翻譯 error code。

## 7. Runtime 與 hydration 防呆

- RD 第一個 slice 必須在使用者相同 deep link、current branch 與固定本機入口重現，收集 DOM、console、network、event hit、computed z-index/pointer-events 與 server-listener evidence；不得先假定是 CSS 或缺資料。
- 送審等 critical CTA 在 client interactivity 尚未 ready 時不得看起來可按；可使用既有 client-ready state／disabled reason，避免「有按鈕但無事件」的假可用狀態。
- 若確認視窗已由 client 開啟，即使後端服務隨後中斷，尚未確認前的 `X`、`返回檢查`、`Escape` 仍必須本機可用。
- 若根因是 app-wide hydration/chunk runtime，而非本規格列出的 component／overlay boundary，RD 可新增最小 app error recovery surface；不得在沒有證據時擴張成全站重構。
- 使用者目前截圖是 reopened QC evidence；全新瀏覽器成功只能證明 recovery，不能取代同 route hard-reload recheck。

## 8. Current Architecture Impact

預期受影響檔案：

- `src/components/number-state-workspace.tsx`：`ConfirmDialog`、`useOverlayLifecycle`、readiness copy／summary、error recovery；
- `src/components/drawing-workbench.tsx`：`confirmAction` lifecycle、detail change/close cleanup、mutation result readback；
- `src/components/drawing-workspace-drawer.tsx`：只有 focus／nested overlay integration 經證據證明需要時修改；
- `src/app/globals.css`：只有 pointer-events／stacking 經真實檢查證明為根因時修改；
- `scripts/qc-dev-059-candidate-submit-modal-ui.mjs`：focused contract gate；
- `scripts/qc-dev-059-candidate-submit-modal-real-operation.mjs`：isolated AI real-operation runner；
- `package.json`：新增 focused QC scripts。

不預期修改：

- `/api/numbering/draft-workspaces/{id}/submit-bundle-review` contract；
- `src/lib/number-lifecycle-simplification.ts` readiness authority；
- approval platform、repository、schema、migration、permission model 或正式資料。

若實作需要修改上述不預期面向，停止並回 PM 做新的 Spec Impact Preflight。

## 9. RD 執行切片

### Phase 1A：重現與 root-cause evidence

- 在固定入口啟動 current source；重現使用者 deep link；
- 驗證三種 close control、computed overlay、event hit、console/network 與 hard reload；
- 分類為 client state、overlay、runtime/hydration、bfcache/stale page 或混合原因；
- 建立會失敗的 focused test／real-operation case。

### Phase 1B：Modal lifecycle 與錯誤復原

- 實作 local close、orphan cleanup、focus restoration、reload/back-forward contract；
- 實作 mutation waiting、unknown-result readback 與 idempotent retry guard；
- 保持 API、lifecycle、permission authority 不變。

### Phase 1C：Readiness 說明與 preview

- 將 `可送審` 與 `候選效力` 合成同一人類結論；
- 顯示缺件與送審範圍，移除互相競爭的警語；
- 通過 5 秒理解與 Visible Text Noise Gate。

### Phase 1D：QA／QC 與 AI 真實操作

- 執行 focused/static gates；
- AI 在真實瀏覽器操作 current deep link、三種關閉、reload、back-forward、offline close、可逆真實送審與 cleanup；
- 1440×900、1024×768、390×844 及使用者原 viewport 留下證據；
- independent QC 只驗證、不修改產品；失敗回送 RD。

## 10. 驗收標準

1. 使用者相同 deep link hard reload 後只開啟 candidate drawer，不自動出現確認 modal。
2. `送交審核` 開啟恰好一個 modal；`X`、`返回檢查`、`Escape` 分別都能關閉，底層 drawer 保留。
3. 三種關閉方式均為零寫入；approval request count、reservation state 與 workspace row version 不變。
4. modal 開啟後 hard reload、browser back/forward 或 bfcache resume 不會把未送出的確認視窗永久復原。
5. 後端服務在 modal 開啟後中斷，尚未確認前仍能關閉；畫面不凍結、不 click-through、不連帶關 drawer。
6. 使用者 5 秒內能回答：缺件是否為 0、現在能否送審、為何仍不可正式使用、如何返回檢查。
7. preview 數量與 workspace readback 一致，readiness 不在 client 另建規則。
8. disposable fixture 透過真實 UI 確認送審只建立一個 request；double activation／retry 不重複建立。
9. timeout／5xx／斷線顯示人類結論、重新查詢與安全返回；無 raw runtime/API error。
10. 三個必要 viewport 無 modal 裁切、重疊、overflow、焦點遺失或不可操作按鈕。
11. console error 0、非預期 failed request 0；故障注入案例只允許計畫內錯誤且 UI recovery 符合預期。
12. 使用者當前 surface 或等效同 route hard-reload recheck 通過前，不得恢復 `DEV-057 Independent QA-QC Passed`。

## 11. Stop Conditions

- 無法確認測試環境為 local／disposable；
- 只能使用正式／不可清理資料做 mutation；
- 發現 schema、permission、approval authority 或 lifecycle truth 必須改變；
- 發生跨公司資料、重複送審、正式資料污染、cleanup 失敗或無法判斷 request 是否建立；
- 無法取得真實瀏覽器、URL、viewport、截圖、DOM、console/network 或 before/after data evidence；
- 需要 production、deploy、live migration、merge、PR 或 release 動作。

## 12. Required Evidence

以 `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md` 為唯一 focused QA 執行契約。證據固定輸出至：

`output/qa/pdm-candidate-submit-modal-recovery/<runId>/`

本輪 focused evidence：`.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md`。AI 已完成同一路由 X／返回／Escape／hard reload／back-forward／候選切換與 1440/1024/390 viewport；共享工作區保持唯讀。隔離 disposable UI mutation run `DEV059-20260809-161835-isolated` 以真實 UI 完成建立、送審、單一 request、planned 503、response-loss readback、撤回／取消與 cleanup，11/11 PASS，`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`。完整證據位於 `output/qa/pdm-candidate-submit-modal-recovery/DEV059-20260809-161835-isolated/`。缺少 current-route、viewport、cleanup 或 visible-error evidence 仍只能判定 `未充分驗證`；本輪不執行 production、deploy、merge、PR 或 release。
