# SPEC-PDM-STATUS-UX-003：狀態軸命名與資料頂部說明

狀態：Phase 1A + Phase 1B Local Implementation + QC Passed；release / production 未授權
更新日期：2026-07-16
對應任務：`DEV-049` / `DEV-PDM-STATUS-UX-003`

## 1. Human Decision Brief

來源：2026-07-16 使用者要求重新統整系統內所有與狀態有關的定義，採用不易誤解的使用者命名，並要求所有相關資料區塊的頂部欄同步新增或修改「狀態說明」視窗。

已確認決策：

- `HD-049-01..03` 已於 2026-07-16 依使用者「繼續」回覆採用建議組合 `1A 2A 3A`：Phase 1B 全系統納入、先做 scanner + 中央 scope registry、同步修正頁籤/欄名/filter/badge/頂部說明與已確認的「草稿」歧義。
- 不把所有狀態都稱為「狀態」；必須依使用者正在判斷的問題拆成不同狀態軸。
- 主資料的 backend `Draft` 對使用者顯示為「未發布」，不得顯示為「草稿」。
- 領號工作區的編輯中資料顯示為「編輯中」或「申請中」，不得與主資料「未發布」混用。
- `正式料號` 分頁改為「料號總表」；`草稿` 分頁改為「領號申請」。
- 號碼顯示精簡為「預覽／已保留／正式」三個正常效力；「已釋出」只在取消或歷史資料顯示。
- 「未取號」不是號碼狀態；尚未產生號碼時改用空狀態提示。
- `review_locked`、`approved_locked` 是審核控制，不作為一般使用者的號碼狀態；`legacy_official_reservation` 是資料來源，正常 UI 仍顯示「正式」。
- 使用者欄名採「號碼效力」，不使用「號碼資格」。
- 每個相關資料頁或資料區塊的頂部欄都要有可發現的「狀態說明」入口；說明內容只涵蓋該資料區塊實際使用的狀態軸。
- 既有欄位級 `?` 說明若與頂部說明完全重複，應移除；若欄位有獨立且更窄的語意，才保留並使用精確欄名。

## 2. 問題與目的

目前系統已建立中央中文狀態字典與欄位級 `?` popover，但仍有三個使用者問題：

1. 同一個「草稿」同時指主資料未發布與領號申請進行中，使用者無法判斷兩者是否為同一份資料。
2. 「狀態 / 階段 / 提醒」被混放在同一欄，使用者看見多個 chip 卻不知道它們屬於不同判斷軸。
3. 說明入口多位於表格欄名旁；使用者在頁面或分頁頂部看不到本區資料有哪些狀態，也無法先建立正確心智模型。

本任務目的不是增加更多術語，而是讓使用者在 5 秒內回答：

- 這個號碼現在只是預覽、已為本申請保留，還是已正式生效？
- 這筆資料現在能否使用，是否已發布或已作廢？
- 這是 EVT、DVT、PVT、正式量產還是設變中？
- 目前是編輯、送審、待補資料、核准、發布中，還是已完成？
- 若不能繼續，應補資料、等待審核、重新發布，還是不用處理？

## 3. 統一狀態軸與顯示名稱

| 狀態軸 | 回答的問題 | 主要顯示名稱 |
| --- | --- | --- |
| 號碼效力 | 這個號碼現在能否被其他申請取得，以及能否正式使用？ | 預覽、已保留、正式；已釋出只在歷史資料顯示 |
| 資料狀態 | 這筆主資料是否可用、已發布或已終止？ | 未發布、待補資料、有效、審核中、已發布、已退回、已作廢、已合併、待管理確認、主圖失效 |
| 開發階段 | 產品目前在哪一個工程成熟度階段？ | EVT 工程樣、DVT 設計驗證、PVT 製程驗證、正式量產、ECR 設變中 |
| 申請狀態 | 領號申請本身走到哪裡？ | 編輯中、申請中、已取消、已轉正式資料、已失效 |
| 審核狀態 | 誰還需要判定或補資料？ | 未送審、審核中、需補資料、已核准、已退回、已取消、已重送 |
| 發布狀態 | 已核准資料是否已成功成為正式資料？ | 尚未可發布、可發布、發布中、已發布、發布失敗、已套用、套用失敗 |
| 準備狀態 | 進入下一步的必要條件是否齊備？ | 未完成、已就緒、阻擋、需更新、不適用 |
| 檔案狀態 | 檔案、預覽或同步是否可用？ | 無檔案、等待處理、處理中、可用、需更新、處理失敗、檔案遺失、檔案不一致、已搬移、僅本機、已停用 |
| 任務狀態 | 待辦是否仍需處理？ | 待處理、已處理、已取消 |
| 帳號狀態 | 人員是否仍可登入及使用系統？ | 使用中、已停權、已到期、已離職 |
| 邀請狀態 | 帳號邀請是否仍可使用？ | 待接受、已接受、已撤銷、已過期 |

顯示規則：

- backend enum、資料庫值、audit payload 與 API contract 暫不改名；本 DEV 只統一正常 UI 的顯示語言與說明結構。
- 同一個 raw value 必須由明確 context 決定顯示名稱；不得用 `generic` 猜測重要狀態。
- 「草稿」不作為主資料或領號流程的第一層狀態名稱。可編輯流程顯示「編輯中」，主資料顯示「未發布」。
- 「狀態」不可同時包辦開發階段、提醒、成本、檔案與審核結果；表頭、篩選器與說明分組必須使用對應狀態軸名稱。

### 3.1 Phase 1A 號碼效力投影

| 內部值或畫面情境 | 正常 UI 顯示 | 說明層級 |
| --- | --- | --- |
| 建立表單的 read-only preview | 預覽 | 尚未占號，輸入改變時號碼可能改變 |
| `candidate`、reservation `active`、`review_locked`、`approved_locked` | 已保留 | 已由此申請保留，但尚不可正式使用 |
| `official`、`promoted`、`legacy_official_reservation` | 正式 | 已正式生效；舊制來源只在詳情或稽核顯示 |
| `recycled` 或已取消申請的歷史保留號碼 | 已釋出 | 只在歷史資料顯示，不列入正常 active filter |
| `unnumbered`、無 reservation 或 preview 尚未產生 | 不顯示效力 badge | 顯示「尚未產生號碼」空狀態，不把不存在的號碼包裝成狀態 |

### 3.2 Phase 1A Current Architecture Impact

- 只新增正常 UI 的 `numberEffectiveness` 顯示 context 與投影，不修改 `NumberQualification`、reservation state、資料庫、API、permission、transaction、idempotency 或發布邊界。
- `candidate`、`review_locked` 與 `approved_locked` 仍保留給 backend 併發控制、審核鎖定與 audit；正常 UI 合併顯示為「已保留」。
- `legacy_official_reservation` 仍保留相容性讀取，正常 UI 與 `official` 一樣顯示「正式」。

### 3.3 Phase 1A RD Handoff Contract

目的：先完成號碼效力精簡，不擴張到全系統其他狀態軸與所有資料頂部欄。

實作範圍：

- `src/lib/status-display.ts`：新增 `numberEffectiveness` context，固定「預覽／已保留／正式／已釋出」說明。
- `src/components/number-state-workspace.tsx`：將 filter、badge、表頭、空狀態、watermark、確認視窗與可見錯誤改成號碼效力語言；內部 type/code 不改名。
- `src/app/numbering/request/layout.tsx`、`src/app/approvals/page.tsx`、`src/app/handoff/layout.tsx`、`src/components/transfer-package-workbench.tsx`、`src/app/numbering/part-drafts/page.tsx`：同步正常使用者文案。
- `scripts/qc-pdm-number-effectiveness-ui.mjs` 與 `package.json`：新增 deterministic 顯示投影與禁止舊文案的 focused QC。
- 既有 DEV-048 request-equivalence QC 只更新受本切片取代的可見文案；既有建草稿即保留號碼、M/R、品名與查重契約保持不變。

Phase 1A UX intent：

- 使用者：內部領號、審核與發布人員。
- 主要任務：一眼判斷號碼是否只是預覽、已被保留或已正式生效。
- 最可能誤解：把「候選號」理解成可挑選的多個方案，或把鎖定狀態誤認成另一種號碼效力。
- 安全預設：所有「已保留」仍明示不可正式使用；正式發布仍需獨立權限與確認。
- 直覺證據：建立表單預覽、申請列表、申請詳情、取消歷史、審核與技轉提示均不再要求使用者理解候選/鎖定內碼。

Failure / recovery：

- 未知 `NumberQualification` 由 TypeScript exhaustiveness 與 focused QC 阻擋，不以錯誤中文猜測。
- API 失敗仍沿用既有 human-readable recovery，不暴露 raw route 或 internal status。
- 若顯示投影與 API state 不一致，停止於現有 state-inconsistent/Admin recovery，不修改 backend state。

QA / QC：

- `npm.cmd run qc:pdm-number-effectiveness-ui`
- `npm.cmd run qc:pdm-number-effectiveness-browser`
- `npm.cmd run qc:pdm-number-state-flow-request-equivalence`
- `npm.cmd run qc:pdm-number-state-flow-phase1b`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- 真實瀏覽器驗證 `/parts?tab=drafts` 的桌面與 390px 清單、詳情與「已保留」提示；不得有 visible error、裁切或水平 overflow。

### 3.4 Phase 1A Implementation Result

完成狀態：本地產品程式與 focused QC 已完成。

實際落地：

- `src/lib/status-display.ts` 新增 `numberEffectiveness` context。
- `src/components/number-state-workspace.tsx` 的草稿清單、篩選器、badge、watermark、空狀態與說明入口改用「號碼效力」。
- `src/app/numbering/request/layout.tsx`、`src/app/approvals/page.tsx`、`src/app/handoff/layout.tsx`、`src/app/numbering/part-drafts/page.tsx` 與 `src/components/transfer-package-workbench.tsx` 同步可見文案。
- 新增 `scripts/qc-pdm-number-effectiveness-ui.mjs`、`scripts/qc-pdm-number-effectiveness-browser.mjs` 與 npm QC scripts。

已通過 evidence：

- `npm.cmd run qc:pdm-number-effectiveness-ui`：5/5。
- `npm.cmd run qc:pdm-number-effectiveness-browser`：5/5。
- `node scripts/qc-pdm-number-state-flow-request-equivalence.mjs`：11/11。
- `npm.cmd run qc:pdm-number-state-flow-phase1b`：14/14。
- `npx.cmd tsc --noEmit --pretty false`：通過。
- `npm.cmd run lint -- --quiet`：通過。
- `npm.cmd run dev:local:check`：通過，`http://127.0.0.1:3000/` 健康。

Browser evidence：

- `output/playwright/dev-049-number-effectiveness/number-effectiveness-desktop-1440.png`
- `output/playwright/dev-049-number-effectiveness/number-effectiveness-mobile-390.png`

Phase 1A 後續處理結果：

- Phase 1B 已關閉全系統 status scope registry、資料頂部說明、settings/account pages coverage、主資料 `Draft` 顯示與「草稿」歧義文案。
- 本 DEV 仍未改 DB/API/audit raw value、schema、狀態轉換、正式資料、production、merge、PR、deploy 或 release。

## 4. 資料頂部說明契約

### 4.1 位置與互動

- 「資料頂部欄」指清單、表格、工作台或分頁的資料範圍標題列，不是全站導覽列。
- 每個符合本規格的資料範圍，在標題或主要篩選器同一層提供 `狀態說明` 入口。
- 入口使用問號圓形圖示加上「狀態說明」文字；不可只放無名稱的陌生圖示。
- 桌面可使用 popover；窄螢幕改用不超出 viewport 的 drawer 或 bottom sheet。這是查閱說明，不使用阻斷操作的確認 modal。
- 支援鍵盤開啟、`Escape` 關閉、外部點擊關閉、關閉後焦點回到觸發按鈕。

### 4.2 說明內容

- 標題固定為「狀態說明」。
- 先依狀態軸分組，再列出該資料範圍實際可能出現的狀態與一句人類語言說明。
- 每個狀態先說明「現在代表什麼」，需要處理時再說「下一步做什麼」。
- 不顯示完整系統 enum、raw code、資料庫欄名或其他頁面不會出現的狀態。
- 內容由中央狀態字典與頁面 scope 設定產生，不在各頁複製獨立文案。
- 同一資料範圍只保留一個主要說明入口。欄位級 `?` 只有在其內容比頂部說明更窄、且不重複時保留。

## 5. 目前相關資料範圍盤點

以下是目前必須納入的已知範圍；RD 開始前仍須以 deterministic scanner 重新盤點所有顯示 badge、status filter、lifecycle、phase、readiness 或 job state 的頁面。

| 資料範圍 | 頂部說明至少涵蓋 |
| --- | --- |
| Dashboard / 圖面資料庫 | 資料狀態、審核狀態、任務狀態；只顯示該區塊實際存在的組別 |
| `/parts`、`/numbering/drawings`、`/numbering/search` | 號碼效力、資料狀態、開發階段、提醒 |
| `/numbering/request`、number-state workspace、`/numbering/part-drafts` | 申請狀態、號碼效力、審核狀態、發布狀態 |
| `/numbering/tasks` | 任務狀態、審核狀態、資料狀態 |
| `/numbering/dvt`、`/numbering/impact`、`/numbering/revisions` | 開發階段、準備狀態、資料狀態、審核狀態 |
| `/upload`、`/submissions/[id]`、`/approvals` | 審核狀態、發布狀態、檔案狀態 |
| `/numbering/imports` | 匯入列狀態、匯入批次狀態、還原狀態 |
| `/numbering/reports` | 執行狀態 |
| `/bom/workbench` | BOM 資料狀態、審核狀態、發布狀態、還原狀態 |
| `/settings`、`/settings/accounts`、`/settings/account-invitations` | 設定狀態、帳號狀態、身分狀態、邀請狀態 |

納入判定：只要一個可見資料範圍顯示狀態 badge、狀態 filter、生命週期、開發階段、準備度、工作狀態或失敗/完成狀態，就必須有頂部狀態說明或明確記錄為不需要的例外。

## 6. 開發範圍

### In Scope

- 建立狀態軸的中央顯示字典與可組合的頁面 scope。
- 擴充既有 `StatusHelpPopover`，或建立共用的資料頂部 `StatusScopeHelp`；不得在各頁複製說明內容。
- 在所有符合納入判定的資料頂部欄新增或修改「狀態說明」入口。
- 將頁籤、欄名、filter 與 badge 的顯示名稱同步到本規格。
- 移除完全重複的欄位級 `?`；保留者必須使用精確 label 與 context。
- 擴充 deterministic QC，防止新增狀態頁卻沒有頂部說明、使用 `generic`、出現 raw code 或重新顯示歧義「草稿」。

### Out of Scope

- 修改資料庫 enum、schema、migration、API raw value、audit payload 或歷史資料。
- 改變領號、候選號、審核、發布、回收、作廢或帳號生命週期的實際狀態轉換。
- 建立大型說明中心、教學頁或在首屏常駐完整制度文字。
- production deploy、正式資料修復、release、merge 或 PR。

## 7. 驗收方向

### Phase 1A 已驗收

- Phase 1A 正常 UI 的號碼效力只有「預覽／已保留／正式」；「已釋出」只在取消或歷史資料出現。
- Phase 1A 正常 UI 不再顯示「號碼資格、未領號、候選號、審核鎖定、核准鎖定、舊制保留、已回收、尚未保留」。
- `/parts?tab=drafts` 桌面 1440 與手機 390 截圖沒有 visible error、裁切、重疊、popover 透明背景或水平 overflow。

### Phase 1B 已驗收

- 使用者在任一相關資料範圍頂部，都能找到一致的「狀態說明」入口。
- 使用者不需打開資料列，就能分辨號碼狀態、資料狀態、開發階段、申請狀態與審核/發布狀態不是同一件事。
- 主資料 backend `Draft` 顯示「未發布」；領號流程的 editable/active 狀態顯示「編輯中」或「申請中」。
- `正式料號` / `草稿` 頁籤分別改為「料號總表」/「領號申請」；`尚未保留` 改為「未取號」。
- 頂部說明只列本區實際狀態；不得出現其他模組的狀態或完整 internal enum。
- 同一內容不得同時在頂部與欄位旁重複；保留的欄位說明必須更窄且名稱精確。
- 1440、1024、768、390、320 viewport 不得出現裁切、重疊、整頁水平 overflow 或無法關閉的浮層。
- 鍵盤、focus、`Escape`、外部點擊與 screen-reader label 可驗證。
- 正常操作畫面不得顯示 raw status、visible API error、`HTTP 4xx/5xx` 或載入失敗 banner。
- 證據：deterministic QC、scope coverage、代表 route browser QC 與 TypeScript/lint 均通過，詳見第 9 節。

## 8. 風險與停止條件

風險等級：Medium。原因是跨多頁、共用元件與中央字典，但不應觸及資料或 backend 狀態機。

停止並回到規格確認的條件：

- 發現同一 raw value 在同一 context 需要兩個互斥的使用者語意。
- 必須修改狀態轉換、資料庫/API contract 或正式資料才能完成顯示一致性。
- 某頁無法由中央字典產生內容，必須另建第二套狀態 authority。
- 實作要求把完整系統 enum 放進每個頁面的說明視窗。

## 9. 下一步與成熟度

Phase 1A 與 Phase 1B 已本地完成並通過相稱 QC。`HD-049-01..03` 已依引導模式採用 `1A 2A 3A`；本 DEV 的 local product scope 已完成，未授權 production、merge、PR、deploy 或 release。

Phase 1B 證據：

- `npm.cmd run inventory:dev-049-status-scope` 產出 `output/dev-049-status-scope-inventory/status-scope-inventory.json` 與 `.md`；盤點 22 routes、198 sections、4 exceptions。
- `src/lib/status-scope-display.ts` 建立 22 個 scope definition；`src/components/status-help-popover.tsx` 新增 `StatusScopeHelp`；`src/lib/status-display.ts` 補齊多個狀態 context，且 `masterRecord Draft` 顯示為「未發布」。
- `npm.cmd run qc:pdm-status-scope-browser`：40/40，browserErrors=[]；代表 routes `/parts`、`/numbering/drawings`、`/numbering/search`、`/numbering/part-drafts`、`/approvals`、`/settings`、`/settings/accounts`、`/settings/account-invitations`；viewports 1440、1024、768、390、320。
- `npm.cmd run qc:pdm-status-ui-vocabulary`：97/97。
- `npm.cmd run qc:pdm-status-scope-coverage`：86/86。
- `npm.cmd run qc:pdm-number-effectiveness-ui`：5/5。
- `npm.cmd run qc:pdm-number-effectiveness-browser`：5/5。
- `npm.cmd run qc:pdm-number-state-flow-request-equivalence`：11/11。
- `npm.cmd run qc:pdm-number-state-flow-phase1b`：14/14。
- `npm.cmd run qc:pdm-master-workbench-layout`：207/207。
- `npx.cmd tsc --noEmit --pretty false`、`npm.cmd run lint -- --quiet`、`git diff --check`：通過。

後續條件：

- 新增任何 status-bearing route / section 時，必須同步更新 scope registry、coverage QC 與必要 browser QC。
- 若要 merge、PR、deploy、staging、production、正式資料或 release，另走對應 gate；不得用本地完成證據取代 release gate。

## 10. Phase 1B 引導式決策

本段保留引導決策紀錄。`HD-049-01..03` 已於 2026-07-16 依使用者「繼續」回覆採用建議組合 `1A 2A 3A`；此決策授權 Phase 1B 本地實作，不代表 production、merge、PR、deploy 或 release 已授權。

### HD-049-01：Phase 1B 執行範圍

A. 全系統所有顯示狀態的資料範圍一次納入 Phase 1B。
B. 先做第一版上線相關範圍：`/parts`、`/numbering/drawings`、`/numbering/search`、number-state workspace、`/numbering/part-drafts`、`/approvals`、`/settings*`。
C. 只修目前 `qc:pdm-status-ui-vocabulary` 失敗的三個設定/帳號頁。

建議：A。原因是這個任務的真正目的不是修三個錯誤，而是消除全系統「狀態」語意混用；只做 C 會讓使用者在其他模組繼續混淆。
使用思考習慣：#目的、#效用理論、#內容組織

### HD-049-02：實作切片順序

A. 先做 scanner + 中央 scope registry，再批次套用頁面，最後做 browser QC。
B. 直接人工逐頁修改，再補 QC。
C. 先做設定/帳號頁 hotfix，其他頁另開後續。

建議：A。原因是本任務跨頁多，先建立 inventory 與 registry 才能避免漏頁、重複文案與新增頁面回歸。
使用思考習慣：#可驗證性、#限制條件、#內容組織

### HD-049-03：顯示文案調整幅度

A. 同步修正頁籤、欄名、filter label、badge label 與頂部說明；已確認的 `草稿` 歧義一併處理。
B. 只新增頂部說明，不改頁籤或欄名。
C. 只改 scanner 能證明有重複或 raw status 的位置。

建議：A。原因是只加說明不改歧義名稱，會讓使用者仍先看到錯誤心智模型，再靠說明補救。
使用思考習慣：#目的、#內容組織、#可驗證性

## 11. Phase 1B RD Contract

目標：把所有狀態承載頁面改成「狀態軸 + 資料範圍說明」模型，讓使用者先知道本區資料有哪些狀態軸，再看表格列或 badge。

### 11.1 Current Architecture Impact

- 既有 `StatusDisplayContext` 已集中於 `src/lib/status-display.ts`，但目前 context 多數仍是欄位級而非資料範圍級。
- 既有 `StatusHelpPopover` 與 `StatusColumnHeader` 位於 `src/components/status-help-popover.tsx`，可重用 keyboard、focus restore、viewport positioning 與 popover 基礎。
- 目前 `StatusColumnHeader` 適合單一欄位，不足以表達同一資料範圍中的多個狀態軸，例如「資料狀態 + 開發階段 + 提醒」。
- `qc:pdm-status-ui-vocabulary` 已能檢查部分欄位級 help，但仍不足以保證每個資料頂部欄都有 scope-level help。
- 本 Phase 不修改 DB/API/audit raw value；所有 raw value 只透過顯示層 context / scope 投影。

### 11.2 主要檔案影響

| 類型 | 檔案 / 範圍 | Phase 1B 變更 |
| --- | --- | --- |
| 中央字典 | `src/lib/status-display.ts` | 補齊 `accountStatus`、`identityStatus`、`invitationStatus`、`approvalStatus`、`publicationStatus`、`readinessStatus`、`fileStatus` 等必要 context；`Draft` 在 `masterRecord` 顯示為「未發布」 |
| scope registry | `src/lib/status-display.ts` 或新檔 `src/lib/status-scope-display.ts` | 建立資料範圍到狀態軸的 mapping，例如 `partsList`、`drawingList`、`accountList`、`numberingDraftList` |
| 共用元件 | `src/components/status-help-popover.tsx` 或新檔 `src/components/status-scope-help.tsx` | 新增 `StatusScopeHelp`，支援多 context 分組、axis label、桌面 popover、窄螢幕 viewport-safe panel |
| PDM 主清單 | `src/app/parts/page.tsx`、`src/app/numbering/drawings/page.tsx`、`src/app/numbering/search/page.tsx` | filter label、欄名與資料頂部 help 改成 `資料狀態 / 開發階段 / 提醒` 的分軸說明 |
| 領號 / 草稿 | `src/components/number-state-workspace.tsx`、`src/app/numbering/request/page.tsx`、`src/app/numbering/part-drafts/page.tsx` | 保留 Phase 1A 號碼效力；補申請狀態、審核狀態、發布狀態、還原狀態的資料頂部說明 |
| 審核 / 送審 | `src/app/approvals/page.tsx`、`src/app/upload/page.tsx`、`src/app/submissions/[id]/page.tsx`、`src/components/dashboard/layout-parts.tsx` | 拆分審核狀態、發布狀態、檔案狀態；避免只顯示 generic `狀態` |
| BOM / 技轉 | `src/app/bom/workbench/page.tsx`、`src/app/handoff/page.tsx`、`src/components/transfer-package-workbench.tsx` | 補 BOM 資料狀態、審核狀態、發布/還原狀態的 scope-level help |
| 報表 / 匯入 / 任務 | `src/app/numbering/imports/page.tsx`、`src/app/numbering/reports/page.tsx`、`src/app/numbering/tasks/page.tsx` | 補匯入列、批次、還原、執行、任務狀態的資料頂部說明 |
| 設定 / 帳號 | `src/app/settings/page.tsx`、`src/app/settings/accounts/page.tsx`、`src/app/settings/account-invitations/page.tsx` | 修正已知 `qc:pdm-status-ui-vocabulary` failure；補設定狀態、帳號狀態、身分狀態、邀請狀態說明 |
| QC scripts | `scripts/qc-pdm-status-ui-vocabulary.mjs`、新增 `scripts/qc-pdm-status-scope-coverage.mjs`、新增 browser QC script | scanner、coverage、raw status、duplicated help、RWD/a11y、visible-error gate |

### 11.3 Phase 1B 任務清單

- `DEV-049-1B-00` Human Decision Gate：已完成。來源：2026-07-16 使用者回覆「繼續」，採用 `1A 2A 3A`。
- `DEV-049-1B-01` Scanner inventory：已完成；輸出 `output/dev-049-status-scope-inventory/status-scope-inventory.json` 與 `.md`。
- `DEV-049-1B-02` Scope registry：已完成；`src/lib/status-scope-display.ts` 建立 route / section / title / axes / contexts / exceptions mapping。
- `DEV-049-1B-03` Multi-axis help component：已完成；`StatusScopeHelp` 支援多 context 分組、viewport-safe panel、Escape、外部點擊與 focus restore。
- `DEV-049-1B-04` Status vocabulary cleanup：已完成；`masterRecord Draft` 顯示「未發布」，領號流程改用「編輯中 / 申請中 / 已轉正式資料」等使用者語言。
- `DEV-049-1B-05` PDM numbering surfaces：已完成；涵蓋 `/parts`、`/numbering/drawings`、`/numbering/search`、number-state workspace、`/numbering/part-drafts`、`/numbering/request`。
- `DEV-049-1B-06` Workflow and approval surfaces：已完成；涵蓋 dashboard、`/approvals`、`/upload`、`/submissions/[id]`、BOM workbench、handoff / transfer workbench。
- `DEV-049-1B-07` Utility and settings surfaces：已完成；涵蓋 imports、reports、tasks、DVT、impact、settings、accounts、account-invitations。
- `DEV-049-1B-08` Column help deduplication：已完成；保留欄位級說明僅限更窄 context。
- `DEV-049-1B-09` QC and browser evidence：已完成；deterministic QC、scope coverage scanner、representative browser QC 均通過。

### 11.4 API / Data / Permission Contract

- 無 DB migration。
- 無 API request / response contract 變更。
- 無 permission、role、session、tenant、company scope 變更。
- 不修改 audit raw payload、歷史資料或正式資料。
- 若任何頁面必須靠改 backend state 才能正確顯示狀態，RD 必須停止並建立新 DEV 或回到規格確認。

### 11.5 Failure Recovery

- 找不到 scope 定義時，正常 UI 不得退回 generic help；應在開發/QC 階段 fail，或顯示最小安全 fallback 並讓 scanner 失敗。
- 新增 raw status 而中央字典無定義時，QC 失敗，不以「未分類狀態」作為通過條件。
- Mobile panel 超出 viewport、不可關閉或遮住主要操作時，UI QC 失敗。
- 若 scope-level help 與 column-level help 說明互相矛盾，保留 scope-level 作為權威，欄位級需改名或移除。

### 11.6 QA / QC Contract

必要指令：

- `npm.cmd run qc:pdm-status-ui-vocabulary`
- `npm.cmd run qc:pdm-number-effectiveness-ui`
- `npm.cmd run qc:pdm-number-state-flow-request-equivalence`
- `npm.cmd run qc:pdm-number-state-flow-phase1b`
- `npm.cmd run qc:pdm-master-workbench-layout`
- 新增：`npm.cmd run qc:pdm-status-scope-coverage`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run dev:local:check`

Browser QC：

- routes：`/parts`、`/numbering/drawings`、`/numbering/search`、`/numbering/part-drafts`、`/approvals`、`/settings`、`/settings/accounts`、`/settings/account-invitations`。
- viewports：1440、1024、768、390、320。
- required evidence：每個代表 route 至少一張 scope-level help 開啟截圖；metrics JSON 必須記錄 no visible error、no console/page/5xx error、no horizontal overflow、popover/panel inside viewport、focus restore verified。

### 11.7 Stop Conditions

- scanner inventory 發現超過 20 個 status-bearing scopes 且無法用同一 registry 低風險收斂時，停止並拆 Phase 1B into sub-phases。
- 發現頁面需要修改狀態機、DB/API contract、正式資料或權限判斷時，停止並建立新 DEV。
- 發現 `Draft` 在某一 context 同時需要「未發布」與「草稿」兩種對使用者都成立的語意時，停止並回到 Human Decision。
- 若 mobile scope help 必須改成全站 drawer / shell-level pattern，先補 UI shell contract，不在本 DEV 偷渡全站 shell redesign。

### 11.8 Phase 1B Implementation Result

完成狀態：本地產品程式與 QC 已完成；未執行 release、deploy、merge、PR、正式資料或 production 操作。

實際落地：

- 中央 scope registry：`src/lib/status-scope-display.ts`，涵蓋 22 個資料範圍。
- 狀態顯示字典：`src/lib/status-display.ts`，補齊申請、審核、發布、準備、檔案、帳號、身分、邀請、提醒與號碼效力等 context。
- 頂部說明元件：`src/components/status-help-popover.tsx` 的 `StatusScopeHelp`。
- Route rollout：22 個 status-bearing scope 已接上頂部「狀態說明」或明確 exception；代表 8 個 route 已跑 5 種 viewport browser QC。
- 防 hydration mismatch：`privacy-access-gate` 與 `sidebar-nav` 已調整初始 hydration 行為，避免 QC browser route 產生無關 mismatch。

Artifact：

- `output/dev-049-status-scope-inventory/status-scope-inventory.json`
- `output/dev-049-status-scope-inventory/status-scope-inventory.md`
- `output/playwright/dev-049-status-scope/status-scope-browser-metrics.json`
- `output/playwright/dev-049-number-effectiveness/number-effectiveness-metrics.json`
