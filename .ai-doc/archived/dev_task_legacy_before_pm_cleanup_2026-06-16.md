# AI PDM Dev Task Backlog

更新日期：2026-06-10
維護規則：主檔只保留未完成、進行中、阻塞與近期規格導向任務；完成任務以索引方式保留，詳細證據回到 RD/QA/QC 文件與 archive。
狀態圖例：`[ ]` 待辦、`[/]` 進行中、`[x]` 已完成、`[!]` 阻塞或外部等待。

## 整理原則

- 未完成任務不得從主檔消失。
- 未完成 spec 不得刪除；active PM-dev 文件統一集中於 `.ai-doc/`。
- 主檔不再混入大量已完成任務細節、舊報告全文或亂碼內容。
- 每個 active task 必須有 RD 範圍、QA 驗證計畫、QC 驗收標準。
- 新的大型功能必須連到 spec。

## 2026-06-15 PM 執行節奏修正

觸發原因：`DEV-SUPABASE-DB-001` 剩餘 async provider 開發被 `/goal 完成剩下的開發任務` 放大成開放式長跑，實際耗時已超出 PM 可控範圍。技術方向仍維持 provider-neutral async repository migration，但執行方法改為小批次、時間盒與分層驗證。

後續執行規則：

- 每輪只處理一個明確 route group；除非使用者明確授權，不得自動接續下一個 route group。
- 每輪開始必須先回報剩餘 direct `@/lib/db` API route count、選定 slice、預期完成線。
- 單輪時間盒以 60-90 分鐘為上限；超時或遇到 schema/runtime 不確定性時，停止並回報狀態，不得靜默長跑。
- 驗證分層執行：單 route slice 先跑 `tsc --noEmit`、exact route sync scan、相關 QC script syntax check、targeted QC；每 3-5 個 slice 或 shared repository 大改後才跑 `lint` / `build`。
- Runtime smoke 只用於使用者可見、高風險、或代表性 route；必須使用 isolated `PDM_DATA_DIR`、臨時 port、finally cleanup，並確認沒有 temp data/log/pid/listener 殘留。
- 文件證據改為批次化：route 行為有實質 API/runtime 風險時補 RD report；低風險機械轉換可合併到 batch addendum，避免每個小 slice 都產生 release 級文件成本。
- 目前已進行中的 Phase 3CH 只允許完成剩餘 runtime smoke、文件補證與清理檢查；完成後必須停下回報，不得自動進入 Phase 3CI。

## Active Task Overview

### P0 外部阻塞 / 正式驗證

| 狀態 | ID | 任務 | 目標 | 通過標準 |
|---|---|---|---|---|
| [!] | DEV-CAD-001 | SolidWorks Document Manager 或等效讀取元件 | Web / Windows 上傳可直接讀 `.sldprt`、`.sldasm`、`.slddrw` 自訂屬性與 CAD references | 不依賴 sidecar 或檔名推測即可帶入圖號、料號、版次與組合關係 |
| [!] | DEV-SW-001 | SolidWorks Add-in 實機驗證 | 在真實 CAD 電腦完成 COM 註冊、SolidWorks UI、真實檔案端到端送審 | 實機報告含安裝、登入、屬性讀取、PDF/DWG 匯出、送審結果 |
| [!] | DEV-BACKUP-001 | 離線單向備份與還原實測 | 在獨立測試機執行 restore drill 並回填報告 | 備份可還原、checksum 正確、交接包可被第三方復原 |
| [!] | DEV-FIELD-001 | 正式現場測試閉環 | 執行現場測試 preflight、handoff 與問題回收 | 現場測試報告完成，未通過項目轉為新 task |
| [!] | DEV-IND-007 | SQLite 到 Postgres / Supabase shadow migration | 以 dedicated staging / disposable shadow target 驗證 migration / compare / RLS 路徑 | 不誤跑既有專案；target connector/guard/live compare 證據完整 |
| [/] | DEV-SUPABASE-DB-001 | Supabase 正式資料庫 runtime 遷移 | 在資料清空後建立 AI_PDM 專用 Supabase staging/prod，導入 Postgres runtime provider 與 cutover gate | SQLite fallback 與 Postgres runtime 都通過；不使用既有 ProJED/ProJED_TEST；RLS/advisor/build/API QC 通過 |

### P1 產品能力

| 狀態 | ID | 任務 | 目標 | 通過標準 |
|---|---|---|---|---|
| [x] | DEV-BOM-VISUAL-EDITOR-001 | BOM XMind 式圖像化編輯器 | 將 BOM 工作台主編輯區升級為 React Flow 混合畫布，支援父子件與同層排序拖拉，右側屬性改用圖號模組同款 drawer | 已完成；工程師可用圖像化樹狀畫布編輯 BOM 關係；資料仍以 parentLineId + sequenceNo 為準；UI/QC 驗證無 overflow、無 console error |
| [x] | DEV-UX-PLATFORM-001 | 多角色 AI PDM 平台 UX 架構優化 | 將首頁、導覽與物件頁從 RD 功能清單升級為多角色、物件中心、任務路由的平台 UX | Phase 1A/1B 已完成首頁工作台、sidebar 分群、主要流程 CTA、空狀態/完成狀態與 UI 驗證；自適應任務引擎另列 DEV-UX-PLATFORM-002 |
| [x] | DEV-UX-RD-LIFECYCLE-001 | RD 圖號料號物件級生命週期狀態修復 | 依 QA 實測修補 RD 領號、送審、首頁、待辦與圖料查詢中「不知道目前狀態」的 UX 斷點 | 已完成；不新增 schema/API，以物件級狀態面板、草稿追蹤與領號到送審 context bridge 修復 |
| [x] | DEV-BOM-WORKBENCH-001 | BOM 工作台獨立模組 | 建立獨立 BOM 工作台，支援 CAD 自動 Draft、SolidWorks BOM XLS、人工拖拉、多 Draft、Active Draft、主管審核與 Released Snapshot | 第一版完成；BOM 工作台 UI、主管 diff 審核、Released Snapshot、匯出、權限與 regression QC 通過 |
| [x] | DEV-PDM-NUMBERING-001 | 圖號與料號自動化管理 | 將圖號、料號、主根號、同圖多料號、DVT/發行審核、override、audit 與月報轉為 PDM 模組 | RD 可先領號後補文件；DVT/發行管制可設定；總表可匯入/匯出；audit 與 QC 通過 |
| [x] | DEV-PDM-DRAWING-001 | 圖號管理模組補齊 | 將圖號從圖料查詢中拆出為 PDM 主資料模組，支援圖號清單、MA/OT、狀態/階段、關聯料號、提醒與影響/追溯入口 | `/numbering/drawings`、`/api/numbering/drawings`、sidebar、權限矩陣與 QC static checks 已完成；圖料查詢保留跨物件追溯角色 |
| [x] | DEV-PDM-MASTER-WORKBENCH-001 | 圖料三頁主資料工作台一致化 | 將圖料查詢、圖號管理、料號模組三頁改為同權重主資料入口，統一 topbar、filter、左側總表與右側固定明細 | 已完成；三頁共用 `pdm-master-*` layout，桌機左右工作台、手機上下排列、總表主視覺與 runtime QC 通過 |
| [x] | DEV-PDM-IDENTITY-LIST-001 | 圖料三頁主識別清單 UI/UX 優化 | 將圖料查詢、圖號管理、料號模組清單主畫面調整為圖號 / 品名 / 料號優先，其他資訊降級為 compact meta | 已完成；三頁清單表頭統一、主識別三欄 81.9%、其他欄 18.0%、手機卡片堆疊無水平溢出，右側明細動作仍可用 |
| [x] | DEV-PDM-DRAWING-SHORTCUTS-001 | 圖號模組清單安全快捷鍵 | 依 `ui-design-principles` 管理系統清單頁模板補齊圖號清單 Excel 類安全查閱快捷鍵 | 已完成；支援 Arrow/Home/Page/Enter/Escape/Ctrl+C，保留瀏覽器快捷鍵與輸入框原生行為，QC 169/169 通過 |
| [x] | DEV-PDM-DETAIL-DRAWER-001 | 全系統右側明細 Drawer 一致化 | 將點選清單列後出現的右側明細欄統一為圖號模組同款 drawer，支援不暗幕、ESC/外部關閉、切換列、拖拉寬度記憶與安全快捷鍵 | 已完成；共用 drawer、寬度記憶與安全快捷鍵工具已落地，dashboard 與 numbering 明細頁完成一致化，BOM 工具面板與高風險固定 decision panel 保持排除 |
| [x] | DEV-GDRIVE-001 | Google Drive 資料夾樹狀設定 | 將 `/settings` 的手動 Folder ID 輸入改為 Windows Explorer 式資料夾樹與驗證流程 | Admin 可用樹狀圖指定 pending/released folders；阻擋同資料夾與非資料夾；舊 Folder ID POST 相容 QC 通過 |
| [x] | DEV-UX-FILE-DROPZONE-001 | 全系統拖曳上傳 UX | 將送審、BOM XLS、圖號附件庫與料號附件庫上傳入口統一為可拖曳/可點擊的 dropzone | 已完成；共用 FileDropzone 落地；單檔區多檔拖入會拒絕；QC、tsc、lint、build 與 browser smoke 通過 |
| [x] | DEV-UX-005 | 全系統 UI 屬性視覺層級一致化 | 建立一致的識別、狀態、metadata、系統診斷資訊呈現規則 | 主要頁面 100% 縮放無重疊；dashboard/upload/handoff/share 視覺 QC 通過 |

### P2 後續平台成本 / Storage follow-up

| 狀態 | ID | 任務 | 目標 | 通過標準 |
|---|---|---|---|---|
| [/] | DEV-STORAGE-COST-001 | 檔案儲存成本控管與可替換 provider 架構 | 將 PDM 檔案本體從寫死 local / Supabase storage 路徑改為 server-side `FileStorageService` 抽象，支援 Supabase Storage、S3-compatible provider、NAS gateway、去重、生命週期與成本報表 | local provider、Supabase staging private bucket、至少一個 S3-compatible dry-run、metadata / hash / lifecycle / migration rollback QC 通過；不得混入 `DEV-SUPABASE-DB-001` 完成率 |

## Spec Index

| 狀態 | Spec | 關聯任務 | 位置 | 備註 |
|---|---|---|---|---|
| [/] | SPEC-SUPABASE-DB-001 | DEV-SUPABASE-DB-001 | [.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md) | Spec / ADR / RD / QA / QC / PM package 已建立；資料庫先行，Storage 延後；以新 AI_PDM Supabase staging/prod 執行正式 runtime 遷移 |
| [x] | SPEC-BOM-VISUAL-EDITOR-001 | DEV-BOM-VISUAL-EDITOR-001 | [.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md) | Implemented；BOM 工作台升級為 XMind 式混合畫布與圖號模組同款 drawer，QC 通過 |
| [x] | SPEC-UX-PLATFORM-001 | DEV-UX-PLATFORM-001 | [.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md) | Phase 1A/1B Implemented；首頁工作台、平台導覽、流程定位、空狀態/完成狀態 CTA 已落地 |
| [x] | SPEC-UX-RD-LIFECYCLE-001 | DEV-UX-RD-LIFECYCLE-001 | [.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md) | Implemented；依 RD 實測 QA 報告修補物件級狀態、草稿追蹤與領號到送審 context bridge |
| [x] | SPEC-BOM-WORKBENCH-001 | DEV-BOM-WORKBENCH-001 | [.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md) | Implemented；BOM 工作台第一版 QC 通過 |
| [x] | SPEC-PDM-NUMBERING-001 | DEV-PDM-NUMBERING-001 | [.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md) | Implemented；圖號料號自動化第一版 QC 通過 |
| [x] | SPEC-PDM-PART-COST-001 | DEV-PDM-PART-COST-001 | [.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md) | Implemented；料號變體、成本 profile/tier/standard/change request、圖號反向明細、審核閉環與 QC 已完成 |
| [x] | SPEC-PDM-MASTER-WORKBENCH-001 | DEV-PDM-MASTER-WORKBENCH-001 | [.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md) | Implemented；三頁一致化主資料工作台與 QC script 已落地 |
| [x] | SPEC-PDM-IDENTITY-LIST-001 | DEV-PDM-IDENTITY-LIST-001 | [.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md) | Spec document created；延伸三頁主資料工作台，定義圖號 / 品名 / 料號主識別清單與欄寬驗收 |
| [x] | SPEC-PDM-DETAIL-DRAWER-001 | DEV-PDM-DETAIL-DRAWER-001 | [.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md) | Implemented；全系統資料明細 drawer 模板、排除範圍與 QC 檢查已落地 |
| [x] | SPEC-UX-FILE-DROPZONE-001 | DEV-UX-FILE-DROPZONE-001 | [.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md) | Implemented；全系統上傳入口統一拖曳 UX |
| [x] | Google Drive Folder Tree Settings Spec | DEV-GDRIVE-001 | [.ai-doc/specs/google-drive-folder-tree-settings-spec-2026-05-30.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/google-drive-folder-tree-settings-spec-2026-05-30.md) | Implemented；保留於既有 docs 位置 |

## DEV-BOM-VISUAL-EDITOR-001：BOM XMind 式圖像化編輯器

狀態：[x]
優先級：P1
類型：UX / BOM 關係編輯器
關聯 spec：[.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md)

## 任務目標

將 `/bom/workbench` 從清單型樹狀編輯升級為混合式圖像畫布：中央使用 React Flow 呈現 parent assembly、group、item 與 BOM edge；左側保留料件搜尋/拖入；右側節點屬性改用圖號模組同款 `PdmDetailDrawer`。拖拉操作必須能改父子件與同層排序，但 BOM 真實資料仍只由 `parentLineId` 與 `sequenceNo` 決定。

## RD 實作項目

- [x] 引入 `@xyflow/react` 並在 BOM 工作台建立自訂 BOM node / edge 畫布。
- [x] 將 `selectedDraft.lines` 轉換為 deterministic flow nodes/edges，不保存自由座標。
- [x] 支援節點選取、節點拖拉改 parent、同層排序、搜尋結果拖入畫布與空白區回 root。
- [x] 以 `PdmDetailDrawer` 取代常駐右側屬性 panel，保留節點編輯、XLS 貼上、送審與 draft compare。
- [x] 保留既有 save / active / clone / submit review API contract。

## QA 驗證計畫

- [x] 桌面 1440px 驗證畫布節點、edge、toolbar、左側料件庫與 drawer 資訊層級。
- [x] 手機 390px 驗證不水平溢出，drawer 可開關。
- [x] 驗證拖入料件、拖成子件、同層排序、非法循環阻擋與 save 後 hierarchy 保留。
- [x] 驗證 Undo/Redo 與 drawer 編輯流程；快捷鍵完整化保留後續 keyboard interaction slice。

## QC 驗證項目

- [x] `npm.cmd run lint`
- [x] `npm.cmd run build`
- [x] `npm.cmd run qc:bom-workbench-tree-rules`
- [x] `npm.cmd run qc:bom-workbench-ui`
- [x] `npm.cmd run qc:pdm-system-detail-drawer-ui`

## PM evidence

- SPEC：`SPEC-BOM-VISUAL-EDITOR-001`
- DEV：`DEV-BOM-VISUAL-EDITOR-001`
- RD 證據：BOM 工作台 React Flow 畫布與 drawer 實作 diff；[.ai-doc/reports/rd/rd-qc-bom-visual-editor-report-2026-06-07.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-qc-bom-visual-editor-report-2026-06-07.md)
- QA/QC 證據：`lint`、`build`、`qc:bom-workbench-tree-rules` 22/22、`qc:bom-workbench-ui` 34/34、`qc:pdm-system-detail-drawer-ui` 53/53 通過

## DEV-UX-PLATFORM-001：多角色 AI PDM 平台 UX 架構優化

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md)

## 任務目標

將 AI PDM 從 RD 導向的功能清單介面，升級為可支援 RD、QA、QC、PM、製造、採購/供應商、管理者與系統管理者的多角色平台 UX。第一階段優先收斂首頁工作台、sidebar 資訊架構、物件中心入口、任務路由與空狀態/完成後下一步，不調整資料庫 schema、不重寫核心 API、不建立完整自適應任務引擎。

## RD 執行項目

- [x] 將首頁定位從單純 dashboard 調整為「工作台」，首頁應優先呈現我的待辦、最近物件、關注物件、跨部門阻塞、系統建議下一步與快速搜尋。
- [x] 將 sidebar 第一層從功能平鋪改為平台導覽：工作台、專案 / 圖料、BOM、變更 / 審核、驗證 / 品質、發行 / 交接、報表、設定。
- [x] 保留現有頁面直連與權限過濾；權限過濾後不得顯示空群組，不得讓無權限 numbering 頁面重新出現。
- [x] 建立第一版物件中心入口規則，讓圖號/料號、BOM、審核任務與交接包能從首頁或搜尋回到一致的物件脈絡。
- [x] 在主要作業頁補上流程定位與下一步 CTA：上傳送審、領號申請、BOM 工作台、BOM 審核、圖號待辦、總表匯入、MA 影響分析、製造交接。
- [x] 改寫關鍵空狀態與完成狀態文案，空狀態需提供可執行下一步，完成狀態需提供合理後續入口。
- [x] 使用現有 CSS token、panel、button、badge、metadata 視覺語彙，不新增大型 landing page、不使用行銷式 hero。
- [x] 手機版需保留可操作導覽，不得因分群造成第一畫面高度過高或橫向溢出不可用。

## QA 驗證計畫

- [x] 依角色建立驗證情境：RD、QA/QC、PM、製造、管理者各自能在首頁找到主要工作入口。
- [x] 驗證 sidebar 第一層不超過 8 類，且二級入口能覆蓋既有主要功能。
- [x] 驗證權限過濾後不出現空群組、斷裂連結或無權限入口。
- [x] 驗證首頁不變成功能入口牆，而是呈現待辦、物件、阻塞與下一步。
- [x] 驗證主要頁面流程定位與 CTA 不誤導使用者，不造成跨部門工作流斷點。
- [x] 驗證桌機、平板、手機主要 viewport 下文字不重疊、按鈕不溢出、導覽可操作。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] `npm.cmd run qc:dashboard-quick-access` 通過或依新 UX 更新測試後通過。
- [x] `npm.cmd run qc:dashboard-find-first` 通過或依新 UX 更新測試後通過。
- [x] `npm.cmd run qc:pdm-numbering-task-center-ui` 通過。
- [x] `npm.cmd run qc:pdm-numbering-import-center-ui` 通過。
- [x] `npm.cmd run qc:pdm-numbering-impact-ui` 通過。
- [x] `npm.cmd run qc:bom-workbench-ui` 通過。
- [x] `npm.cmd run qc:bom-workbench-review-ui` 通過。
- [x] Handoff Playwright smoke 通過。
- [x] Playwright 或等效 UI 檢查覆蓋 `/`、`/upload`、`/bom/workbench`、`/bom/reviews`、`/numbering/tasks`、`/numbering/imports`、`/handoff`、`/settings`。
- [x] QC 報告需截圖或記錄桌機與手機版 sidebar / 工作台 / 主要頁面 CTA 證據。

## 阻塞 / 依賴

- [x] 第一階段依賴現有 submission、numbering task、notification、BOM review、handoff readiness 資料，不新增任務引擎 schema。
- [x] QA/QC 驗證 / 品質模組若尚未產品化，第一階段只能以證據、報告、阻塞摘要或未來模組入口呈現，不建立空頁。
- [x] 若後續要做完整自適應任務排序，需另開 Phase 3 task 定義任務摘要模型、排序權重、角色視角與資料來源。

## DEV-UX-RD-LIFECYCLE-001：RD 圖號料號物件級生命週期狀態修復

狀態：[x]
優先級：P0
類型：UX 修復 / RD lifecycle
關聯 spec：[.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md)
來源報告：[.ai-doc/reports/qa/qa-rd-lifecycle-ux-validation-report-2026-06-07.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qa/qa-rd-lifecycle-ux-validation-report-2026-06-07.md)

## 任務目標

修復 RD 視角「完全不知道現在狀態」的 P0 UX 缺口。此任務不新增 schema、不新增 public API、不改核心狀態機，先以既有 numbering / submission / task / notification 資料補齊物件級狀態、草稿追蹤與領號到送審的上下文連接。

## RD 執行項目

- [x] 新增 `ObjectLifecycleStatusPanel`，將 Draft / Active / PendingReview / Released / Obsolete 等狀態轉成使用者語言、缺口、下一步與 CTA。
- [x] 領號結果嵌入物件級狀態，清楚顯示主根號、料號、圖號、目前 Draft、尚未送審與下一步。
- [x] 領號結果的上傳 CTA 帶入 query string，讓 `/upload` 預填圖號、料號、品名與來源提示。
- [x] 首頁工作台新增 RD「我的開發中圖料」區塊，列出 Draft 草稿與待送審入口。
- [x] 圖號待辦新增「待送審草稿」區塊，避免 0 task 空狀態掩蓋草稿生命週期。
- [x] 圖料查詢 drawer 在主根明細上方顯示物件級狀態與下一步。

## QA 驗證計畫

- [x] RD 建立新料號後，結果頁能理解目前狀態、缺口與下一步。
- [x] 從領號結果進入 `/upload`，metadata 已預填且缺欄位仍明確。
- [x] 首頁與圖號待辦能看到待送審草稿，而不是只看到 0 待辦。
- [x] 圖料查詢 drawer 能用使用者語言呈現狀態、風險與下一步。
- [x] 不得誤導 RD 去做主管核准；核准 / 放行仍由既有審核流程處理。

## QC 驗收標準

- [x] `npm.cmd run lint`
- [x] `npm.cmd run qc:dashboard-quick-access`
- [x] `npm.cmd run qc:dashboard-find-first`
- [x] `npm.cmd run qc:pdm-numbering-request-ui`
- [x] `npm.cmd run qc:pdm-numbering-search-ui`
- [x] `npm.cmd run qc:pdm-numbering-task-center-ui`
- [x] Browser smoke 覆蓋領號結果、上傳預填、首頁草稿追蹤與圖料 drawer。

## PM evidence

- SPEC：`SPEC-UX-RD-LIFECYCLE-001`
- DEV：`DEV-UX-RD-LIFECYCLE-001`
- RD 證據：[.ai-doc/reports/rd/rd-qc-rd-lifecycle-ux-implementation-report-2026-06-07.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-qc-rd-lifecycle-ux-implementation-report-2026-06-07.md)
- QA/QC 證據：`lint`、request 23/23、dashboard quick access 16/16、dashboard find-first 16/16、numbering search 28/28、numbering task center 22/22、browser smoke 通過；截圖位於 `artifacts/ux-rd-lifecycle-implementation/`

## DEV-UX-PLATFORM-002：自適應任務路由與角色視角模型

狀態：[x]
優先級：P2
關聯 spec：[.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md)

## 任務目標

在 Phase 1 平台 UX 已穩定後，定義自適應任務摘要模型、角色視角、排序權重與資料來源，讓首頁工作台能依 RD、QA/QC、PM、製造、採購/供應商、管理者與系統管理者顯示不同優先任務與下一步。

## RD 執行項目

- [x] 定義 task summary domain model，不直接綁死單一頁面或單一角色。
- [x] 定義角色視角與排序權重，至少涵蓋逾期、阻塞、風險、待審、即將交接與系統異常。
- [x] 定義資料來源 adapter，串接 numbering task、notification、BOM review、handoff readiness 與未來 QA/QC evidence。
- [x] 建立首頁自適應 task feed MVP，保留現有工作台卡片作 fallback。

## QA 驗證計畫

- [x] 以 RD、QA/QC、PM、製造、採購/供應商、管理者、系統管理者驗證 task feed 排序是否符合主要工作流。
- [x] 驗證資料缺漏、權限不足、無待辦、跨部門阻塞時仍提供可行下一步。
- [x] 驗證排序不會掩蓋 critical / overdue / release-blocking 任務。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] 新增或更新對應 QC script，覆蓋主要角色與桌機/手機 viewport。
- [x] QC 報告記錄角色輸入、排序結果、證據與殘留風險。

## 2026-06-11 Evidence Addendum

- Delivery: 新增 `src/lib/adaptive-task-feed.ts`，定義 `TaskSummary`、`TaskSummaryRole`、`TaskSummarySource`、`TaskSummarySignal`、`ROLE_TASK_WEIGHTS` 與 `buildAdaptiveTaskFeed`。
- Delivery: 首頁 dashboard 新增 `AdaptiveTaskFeedPanel`，從既有 submissions、notifications、numbering drafts 與 storage evidence 組出排序後任務 feed；原本多角色工作台卡片保留為 fallback。
- Delivery: 新增 `scripts/qc-adaptive-task-feed.mjs` 與 `qc:adaptive-task-feed`，檢查角色、訊號、資料來源 adapter、排序、fallback、dashboard 接線與 CSS 狀態 class。
- Evidence: [.ai-doc/reports/rd/rd-adaptive-task-feed-report-2026-06-11.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-adaptive-task-feed-report-2026-06-11.md)
- Verification: `npx.cmd tsc --noEmit`、`npm.cmd run qc:adaptive-task-feed` 43/43、`npm.cmd run lint`、`npm.cmd run build` 通過；Browser smoke `/` HTTP 200，未登入畫面正常，console 僅預期 401 resource 訊息。
- Residual: 目前不新增 task engine schema；BOM review 與未來 QA/QC evidence 已保留 source type，待該 domain 有穩定 API 後可改成 server-side feed。

## DEV-PDM-MASTER-WORKBENCH-001：圖料三頁主資料工作台一致化

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md)

## 任務目標

將 `/numbering/search`、`/numbering/drawings`、`/parts` 改成相同主資料工作台版型：topbar、filter row、左側總表、右側固定明細，手機版總表在上、明細在下。三頁同權重，總表為主畫面，compact summary 不搶主視覺。

## 已定案決策

- [x] 三頁同權重。
- [x] 桌機採左右工作台。
- [x] 左側為總表主畫面。
- [x] 右側為固定明細檢視。
- [x] 手機改為總表在上、明細在下。
- [x] 本次不改 API、schema、權限矩陣或 sidebar 資訊架構。

## RD 執行項目

- [x] 建立共用 layout CSS class：`pdm-master-workbench`、`pdm-master-toolbar`、`pdm-master-grid`、`pdm-master-table-panel`、`pdm-master-detail-panel`。
- [x] 調整 `/numbering/search` 為左側跨物件總表、右側主根明細。
- [x] 調整 `/numbering/drawings` 為左側圖號總表、右側圖號治理明細，移除大型 stats cards 的主視覺優先權。
- [x] 調整 `/parts` 為左側料號總表、右側料號屬性、圖號、成本明細，避免右側明細比總表更強。
- [x] 統一未登入、錯誤、載入、空狀態位置與文案層級。
- [x] 確保手機版無頁面層水平溢出。

## QA 驗證計畫

- [x] 驗證三頁桌機版皆呈現 `topbar -> filter -> left table / right detail`。
- [x] 驗證三頁手機版皆呈現 `topbar -> filter -> table -> detail`。
- [x] 驗證點選總表列後右側明細更新且選取列高亮一致。
- [x] 驗證 compact summary 不會將總表推到第二視覺層。
- [x] 驗證不需 API、schema、權限矩陣或 sidebar 變更即可完成。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過；仍有既有 Turbopack dynamic path / NFT trace warning，與本任務無關。
- [x] `npm.cmd run qc:pdm-numbering-core` 通過。
- [x] `npm.cmd run qc:pdm-numbering-search-ui` 通過。
- [x] `npm.cmd run qc:part-number-module` 通過。
- [x] 新增 `npm.cmd run qc:pdm-master-workbench-layout`，覆蓋三頁共用 layout class、桌機左右工作台、手機上下排列、點選列更新明細、四個 URL 回 200。

## 風險 / 注意事項

- [x] 目前 dev server 建議使用 `next dev --webpack`，避免 Turbopack dev 對大型首頁卡死。
- [x] 文件與 UI 若遇終端亂碼，需以實際 source UTF-8 與瀏覽器呈現為準。
- [x] 不得在此任務中順手重構 API、權限矩陣或 sidebar。

## DEV-PDM-IDENTITY-LIST-001：圖料三頁主識別清單 UI/UX 優化

狀態：[x]
優先級：P1
類型：UX / PDM 主資料清單優化
關聯 spec：[.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md)
關聯任務：`DEV-PDM-MASTER-WORKBENCH-001`

## 任務目標

將 `/numbering/search`、`/numbering/drawings`、`/parts` 的左側清單從平均欄位配置調整為主識別優先配置。三頁清單第一視覺應服務 RD 掃描 `圖號 / 品名 / 料號`，狀態、階段、用途、成本、提醒、關聯數量與動作降級為 compact meta 或右側明細，避免資訊爆炸造成疲勞。

## 已定案決策

- [x] 三頁清單表頭統一為 `圖號 / 品名 / 料號 / 其他`。
- [x] `品名` 是最大彈性欄。
- [x] `圖號` 與 `料號` 以內容容納寬度為主。
- [x] 次要資訊降級為 compact badge、icon hint 或右側明細。
- [x] 圖號管理清單不保留大型動作欄，追溯與 MA 影響分析入口放右側固定明細。
- [x] 手機版使用卡片式堆疊，避免頁面層水平溢出。
- [x] 本輪只寫專案文件，不執行 UI 開發。

## RD 執行項目

- [x] 建立共用 identity list CSS class：`pdm-identity-table`、`pdm-identity-code`、`pdm-identity-name`、`pdm-identity-meta`、`pdm-meta-strip`。
- [x] 調整 `/numbering/search` 清單為圖號、品名、料號、其他四欄，並允許 backward-compatible `coreName` 擴充供 drawing/root row 顯示品名。
- [x] 調整 `/numbering/drawings` 清單為 `drawingNumber / coreName / linkedPartNumbers / compact meta`，移除清單大型動作欄。
- [x] 調整 `/parts` 清單為 `primaryDrawingNumber / partName / partNumber / compact meta`，材質、顏色、成本摘要降級為其他欄或右側明細。
- [x] 手機版將 identity row 改為卡片式堆疊：圖號、品名、料號、其他 chips。
- [x] 保留現有 row click、selected-row 高亮、右側固定明細更新流程。

## QA 驗證計畫

- [x] 驗證三頁表頭順序皆為 `圖號 / 品名 / 料號 / 其他`。
- [x] 驗證桌機版主識別三欄合計寬度 >= 清單可視寬度 70%。
- [x] 驗證 `其他` 欄寬 <= 清單可視寬度 22%。
- [x] 驗證狀態、階段、用途、成本、提醒與關聯數量不再形成大型獨立欄位。
- [x] 驗證圖號管理清單移除動作欄後，右側明細仍提供追溯與 MA 影響分析入口。
- [x] 驗證手機版無 page-level horizontal overflow，且 identity row 可讀。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過；仍有既有 Turbopack dynamic path / NFT trace warning，與本任務無關。
- [x] `npm.cmd run qc:pdm-master-workbench-layout` 通過，125/125。
- [x] `npm.cmd run qc:pdm-numbering-search-ui` 通過，26/26。
- [x] `npm.cmd run qc:part-number-module` 通過，41/41。
- [x] 新增或擴充 UI QC，覆蓋 identity table class、表頭順序、欄寬比例、手機無水平溢出與圖號管理右側動作入口。

## 風險 / 注意事項

- [x] 不得重開或覆蓋已完成的 `DEV-PDM-MASTER-WORKBENCH-001`。
- [x] 不得順手修改圖號 / 料號 / 主根號命名規則。
- [x] 不得修改審核矩陣、BOM 關聯或成本審核流程。
- [x] 若圖料查詢需 `coreName`，僅允許 backward-compatible response 擴充，不做 DB schema migration。

## DEV-PDM-DRAWING-SHORTCUTS-001：圖號模組清單安全快捷鍵

狀態：[x]
優先級：P1
節點類型：開發點
父交付點：`DEV-PDM-DRAWING-001`、`DEV-PDM-IDENTITY-LIST-001`
是否計入產品交付完成：否
關聯 skill：`ui-design-principles`

## 任務目標

依管理系統清單頁模板，讓 `/numbering/drawings` 圖號清單具備 Excel 類查閱肌肉記憶，同時不覆蓋瀏覽器原生快捷鍵、不啟用資料異動快捷鍵。

## RD 執行項目

- [x] 圖號清單區加入 focusable region 與 `aria-keyshortcuts`，不在主畫面顯示大量快捷鍵說明。
- [x] 支援 `ArrowUp / ArrowDown` 上下移動選取列。
- [x] 支援 `Enter` 開啟目前選取圖號明細。
- [x] 支援 `Escape` 關閉右側 drawer。
- [x] 支援 `PageUp / PageDown` 清單翻頁、`Home / End` 第一筆 / 最後一筆。
- [x] 支援 `Ctrl+C` 在沒有文字反白時複製目前選取圖號。
- [x] 焦點在 `input`、`textarea`、`select`、contenteditable、modal 或確認流程時不攔截清單快捷鍵。
- [x] 未啟用 `Ctrl+F`、`Ctrl+R/F5`、`Ctrl+S`、`Ctrl+N`、`Ctrl+A`、`Delete`、`F2` 等瀏覽器或資料異動快捷鍵。

## QA 驗證計畫

- [x] 驗證清單 focus 時 `Home`、`End`、`ArrowDown`、`PageUp/PageDown` 會改變選取列。
- [x] 驗證 `Enter` 會開啟目前選取列右側明細，`Escape` 可關閉。
- [x] 驗證 `Ctrl+C` 會複製目前選取圖號。
- [x] 驗證輸入框 focus 時不攔截清單快捷鍵。
- [x] 驗證有文字反白時 `Ctrl+C` 保留瀏覽器原生複製。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過；仍有既有 Turbopack dynamic path / NFT trace warning，與本任務無關。
- [x] `npm.cmd run qc:pdm-master-workbench-layout` 通過，169/169。

## 風險 / 注意事項

- [x] 本任務只補圖號模組查閱型快捷鍵，不擴大到料號模組或圖料查詢。
- [x] 不啟用任何資料異動快捷鍵；若未來要在 inline edit 頁使用，需頁面級 opt-in、權限、確認、防誤觸設計與 QC。

## DEV-PDM-DETAIL-DRAWER-001：全系統右側明細 Drawer 一致化

狀態：[x]
優先級：P1
類型：UX / 管理系統清單頁明細互動一致化
關聯 spec：[.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md)
關聯 skill：`ui-design-principles`
關聯任務：`DEV-PDM-DRAWING-SHORTCUTS-001`、`DEV-PDM-MASTER-WORKBENCH-001`

## 任務目標

以圖號模組右側 drawer 作為全系統清單頁明細模板，將「點選清單列後出現的資料明細欄」改為一致互動：右側浮出、不暗化底頁、可直接切換列、可用 `Escape` 或點擊外部關閉、可拖拉寬度並記憶，同步補齊安全查閱快捷鍵。

## 已定案範圍

- [x] 首頁 / 工作台圖面送審明細。
- [x] `/numbering/approvals` 審核批次明細。
- [x] `/numbering/imports` 匯入批次 / staging 檢查明細。
- [x] `/numbering/reports` 月報明細。
- [x] 保留 `/numbering/search`、`/numbering/drawings`、`/parts` 既有圖號模組同款 drawer 行為，必要時抽共用邏輯。

## 不納入本次

- [x] 不改全域左側 sidebar。
- [x] 不改 BOM 工作台左側搜尋 / 樹狀面板。
- [x] 不改 BOM 工作台節點屬性面板。
- [x] 不改 BOM 審核頁固定 decision panel。
- [x] 不改 API、DB schema、權限矩陣或 sidebar 資訊架構。

## RD 執行項目

- [x] 建立共用 drawer / width memory / outside close / Escape close 工具。
- [x] 建立或抽出共用清單安全快捷鍵工具。
- [x] 將首頁工作台明細改為右側 drawer，底頁保持可讀且可直接切換列。
- [x] 將 `/numbering/approvals` 批次明細改為右側 drawer。
- [x] 將 `/numbering/imports` staging 檢查明細改為右側 drawer。
- [x] 將 `/numbering/reports` 月報明細改為右側 drawer。
- [x] 確認 drawer 寬度可拖拉並用 localStorage 記憶。
- [x] 確認清單快捷鍵不攔截輸入欄位、下拉欄位、contenteditable 與文字反白。

## QA 驗證計畫

- [x] 驗證每個納入頁面點選列會開啟右側 drawer。
- [x] 驗證 drawer 開啟後可直接點其他列切換明細。
- [x] 驗證 `Escape` 與點擊外部可關閉 drawer。
- [x] 驗證 drawer 不使用深色遮罩，底頁清單仍可讀。
- [x] 驗證拖拉 drawer 寬度後重新整理仍保留寬度。
- [x] 驗證 `ArrowUp/Down`、`Enter`、`Escape`、`PageUp/PageDown`、`Home/End`、`Ctrl+C` 的安全查閱行為。
- [x] 驗證 desktop / laptop / mobile 無水平 overflow、重疊、裁切或按鈕擠壓。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] `npm.cmd run qc:pdm-master-workbench-layout` 通過。
- [x] `npm.cmd run qc:dashboard-detail-priority` 通過。
- [x] `npm.cmd run qc:pdm-numbering-approval-review-ui` 通過。
- [x] `npm.cmd run qc:pdm-numbering-import-center-ui` 通過。
- [x] `npm.cmd run qc:pdm-numbering-report-center-ui` 通過。
- [x] `npm.cmd run qc:dashboard-quick-access` 通過。
- [x] `npm.cmd run qc:dashboard-search-assist` 通過。
- [x] 新增或更新 UI QC，覆蓋全系統資料明細 drawer 一致化。

## 風險 / 注意事項

- [x] 固定工具面板與資料明細 drawer 的用途不同，不應為追求一致而誤改。
- [x] 若某頁沒有資料，QC 需驗證空狀態位置一致，但不可因此略過有資料時的 drawer 行為。
- [x] drawer 不暗化底頁，但仍需用陰影、邊線與 z-index 做出足夠視覺區隔。

## DEV-UX-FILE-DROPZONE-001：全系統拖曳上傳 UX

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md)

## 任務目標

將系統內既有上傳入口統一為可拖曳、可點擊、可鍵盤操作的 dropzone，降低從 Windows 檔案總管上傳送審檔、BOM XLS、圖號附件與料號附件的 UX 摩擦。

## RD 執行項目

- [x] 新增共用 `FileDropzone` client component，支援 multiple/single、accept、disabled、drag-over、reject callback 與 keyboard focus。
- [x] `/upload` 改用共用 dropzone，保留多檔、metadata detection、sidecar 分類、移除檔案與送審流程。
- [x] BOM 工作台 XLS 匯入改用 compact single-file dropzone，拖入多檔時拒絕。
- [x] 圖號/料號附件庫改用 single-file dropzone，顯示已選檔案與清除動作。
- [x] 新增全域樣式，確保 drawer 與 mobile viewport 不 overflow、不重疊。

## QA 驗證計畫

- [x] 多檔送審可拖曳、多檔清單與 metadata detection 不回退。
- [x] BOM XLS 單檔拖曳可匯入，多檔拖入拒絕並提示。
- [x] 圖號/料號附件單檔拖曳可選取，多檔拖入拒絕並提示。
- [x] disabled/loading 狀態不接受 drop/click。
- [x] desktop/mobile 與 drawer 內無文字重疊、按鈕跳動或水平 overflow。

## QC 驗收標準

- [x] `npm.cmd run qc:file-dropzone-ux` 通過。
- [x] `npx.cmd tsc --noEmit` 通過。
- [x] `npm.cmd run lint` 通過。
- [x] `node node_modules/next/dist/bin/next build` 通過。
- [x] Browser smoke 確認 `/upload`、BOM 工作台、圖號附件庫、料號附件庫皆顯示 dropzone。

## DEV-PDM-PART-COST-001：主根號關聯圖號料號與料號成本模組

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md)

## 任務目標

在既有圖號與料號自動化管理基礎上，建立圖號模組與料號模組的清楚責任邊界：圖號管理技術文件與版次，料號管理材質、顏色、採購/製造語意與成本。系統需依相同主根號自動關聯圖號與料號，支援一張 MA 圖對多個料號變體，並讓不同料號保留各自成本 profile、數量級距、標準成本與採購變更 / 主管審核流程。

## 使用者已定案決策

- [x] 一圖多料號的主要原因是不同材質、不同顏色。
- [x] 成本以標準成本為主，但同一料號需保留其他成本 profile，例如委外加工、自行製作、採購或試算。
- [x] 成本會隨數量改變，需支援數量級距。
- [x] 採購可提出成本變更，主管審核後才生效。
- [x] 圖面改版不需要觸發成本重審。
- [x] 系統需同時有圖號模組及料號模組，兩者透過相同主根號自動關聯。
- [x] 料號流水號不編碼材質 / 顏色；材質、顏色、表面處理與差異說明保存於 `part_variant_attributes`，避免字典或描述調整造成重編號。
- [x] 標準成本第一版預設基準數量為 `1 pcs`；大量採購、委外或試算差異以 `part_cost_tiers` 管理。
- [x] 成本金額可見角色限定為 `Admin`、`R&D Manager`、`Procurement` 與 ACL `system_admin`、`pdm_admin`、`rd_manager`、`procurement`；RD、製造、品保與供應商只看成本狀態。
- [x] 材質 / 顏色第一版採自由欄位收斂實際用語，保留 nullable `material_code` / `color_code` 供後續標準字典接管。

## RD 執行項目

### 資料模型 / Migration
- [x] 評估既有 `part_roots`、`drawing_numbers`、`part_numbers`、`drawing_part_links`、`same_drawing_variants` 是否足以承接主根號自動關聯與一圖多料號變體。
- [x] 新增或延伸料號變體屬性，至少支援材質、顏色、表面處理與差異說明。
- [x] 新增 `part_cost_profiles`，支援 `outsource`、`in_house`、`purchase`、`trial` 等成本情境與版本狀態。
- [x] 新增 `part_cost_tiers`，支援數量級距、單價、設定費、交期與備註。
- [x] 新增 `part_standard_costs`，以 approved cost profile 與基準數量指定 current standard cost。
- [x] 新增 `part_cost_change_requests`，保存採購提出、主管審核、退回、核准與異動前後 snapshot。
- [x] 成本主關聯必須掛在 `part_number_id`，不得以 `drawing_number_id` 作正式成本主關聯。

### 後端服務 / API
- [x] 實作同主根號自動關聯規則：相同 `part_root_id` 才可自動關聯，MA 圖可作 primary manufacturing link，OT 圖只能作 reference link。
- [x] 實作一圖多料號的變體完整性檢查，DVT / Release 起材質、顏色或差異說明不得缺漏。
- [x] 實作成本 profile CRUD，採購可建立 draft / pending review，但不可直接改變 approved standard cost。
- [x] 實作成本級距驗證，避免數量區間重疊，查詢時可明確回報無級距或級距衝突。
- [x] 實作標準成本解析演算法：輸入料號、數量與日期，解析有效標準成本 profile 與對應級距。
- [x] 實作指定成本情境解析演算法：可查委外、自製、採購等 approved profile 的有效成本。
- [x] 實作成本變更審核流程，主管核准後才讓 profile approved 或 set standard 生效。
- [x] 圖面 revision event 不得自動建立成本審核單；若材質、顏色或製程條件變更，需由料號 / 成本流程另行處理。
- [x] 成本異動、標準成本指定與審核結果需寫入 append-only audit log。

### UI / UX
- [x] 圖號明細頁顯示同主根號料號清單、材質、顏色、料號狀態、標準成本狀態與 primary MA link。
- [x] 料號明細頁顯示同主根號圖號、材質、顏色、差異說明、BOM 使用狀態、成本 profile、數量級距與標準成本。
- [x] 成本審核中心顯示採購送審、異動前後、影響料號、核准 / 退回與審核意見。
- [x] 一圖多料號清單需讓使用者能比較同主根號下不同材質、顏色與成本差異。
- [x] 若圖面 title block 寫死材質或顏色，UI 需提醒同圖多料號可能不成立，需改用「依料號規格」或建立變體表。

## QA 驗證計畫

- [x] 驗證圖號模組可從 MA 圖看到同主根號下多個料號。
- [x] 驗證料號模組可從料號看到同主根號下可關聯 MA / OT 圖。
- [x] 驗證同一 MA 圖可對應不同材質 / 顏色料號，且 DVT / Release 起缺少差異欄位會被阻擋。
- [x] 驗證成本只能掛料號，不會因同圖多料號而共用錯誤成本。
- [x] 驗證採購建立成本 profile 後，在主管核准前不會影響標準成本。
- [x] 驗證主管核准後，標準成本依指定基準數量與數量級距解析。
- [x] 驗證同一料號可同時保留委外、自製、採購等成本情境。
- [x] 驗證圖面改版不會自動觸發成本重審或改變標準成本。
- [x] 驗證 audit log 可追溯成本異動前後、申請人、審核人與理由。

## QC 驗收標準

- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] 新增或更新資料模型 / repository 單元測試，覆蓋主根號自動關聯與一圖多料號變體。
- [x] 新增或更新成本 profile / tier / standard cost API 測試。
- [x] 新增成本金額可視權限 redaction QC，驗證未授權角色 API 回應不輸出成本金額與成本 profile 級距明細。
- [x] 新增或更新採購送審與主管審核 E2E 測試。
- [x] 新增或更新 UI QC，覆蓋圖號明細、料號明細與成本審核中心。
- [x] QC 報告需記錄測試資料中的圖號、料號、材質、顏色、成本級距、審核結果與 audit evidence。

## 阻塞 / 待確認

- [x] 料號流水號不編碼材質 / 顏色，只保存於屬性欄位。
- [x] 標準成本預設基準數量採 `1 pcs`。
- [x] 成本金額可見角色已限定，製造、品保、供應商與一般 RD 視角不顯示金額。
- [x] 材質 / 顏色第一版先用自由欄位，後續依實際用語收斂標準字典。

## 2026-06-11 Evidence Addendum

- Task: `DEV-PDM-PART-COST-001` 料號成本 profile / standard cost 審核閉環。
- Delivery: `createPartCostProfile` 改為嚴格驗證成本級距，重疊、反向、負數或無效數量會 fail closed。
- Delivery: 既有同主根號關聯規則已確認，`drawing_part_links` 會拒絕跨 root，MA 圖為 `primary_manufacturing`，OT 圖為 `reference`。
- Delivery: `evaluateNumberingGate` 新增同圖多料號 DVT/Release blocker；同一主要 MA 圖連到多個料號時，缺少材質、顏色或差異說明會阻擋晉升/發行。
- Delivery: 新增 `resolvePartCost`，可解析 active approved standard cost 或指定 approved cost type，並在無標準成本、無 approved profile、無對應級距時回傳明確 blocker。
- Delivery: 新增 `decidePartCostChangeRequest`，主管核准後才會將 profile 改為 approved、關閉舊 active standard cost、建立新 `part_standard_costs`，退回時 profile 轉 rejected；兩種決策都寫入 append-only audit。
- Delivery: 新增 `/api/parts/[partNumber]/cost-resolution` 與 `/api/parts/[partNumber]/cost-change-requests/[requestId]`，沿用既有 numbering 權限與成本金額 redaction。
- Delivery: `/parts` 料號明細新增「成本審核」區塊，pending request 可直接核准或退回。
- Delivery: `/numbering/drawings` 圖號明細新增同主根號料號清單，顯示材質、顏色、料號狀態、標準成本狀態與 primary MA link；同圖多料號且圖面描述含材質/顏色/表面處理語彙時顯示 title-block 變體風險提醒。
- Delivery: `qc:part-number-module` 新增 revision history read-only contract，確認 `/api/items/[partNumber]/revisions` 僅讀取 revision history，不呼叫成本審核流程且不觸碰 `part_cost_change_requests` / `part_standard_costs`。
- Delivery: 新增 `scripts/qc-part-cost-review-e2e.mjs` 與 `qc:part-cost-review-e2e`，以 in-memory SQLite 正式 schema 驗證採購送審 pending 不生效、主管核准建立 active standard cost、退回不覆蓋標準成本、audit 追溯與 revision lookup 不觸發成本流程。
- Evidence: [.ai-doc/reports/rd/rd-part-cost-review-resolution-report-2026-06-11.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-part-cost-review-resolution-report-2026-06-11.md)
- Verification: `npx.cmd tsc --noEmit`、`npm.cmd run qc:part-number-module` 79/79、`npm.cmd run qc:part-cost-review-e2e` 16/16、`npm.cmd run lint`、`npm.cmd run build`、`npm.cmd run qc:file-storage-contract` 81/81、`npm.cmd run qc:db-provider-postgres` 9/9 通過；Browser smoke `/parts`、`/`、`/numbering/drawings` HTTP 200，未登入 / 未授權畫面正常，console 僅預期 401 resource 訊息。
- Residual: Supabase live target / provider cutover 仍保留外部阻塞；完整瀏覽器登入跨角色流程可在帳號/測試資料固定後另做 UI E2E，但本任務的成本審核資料流 E2E 已有 in-memory schema fixture。

## DEV-PDM-NUMBERING-001：圖號與料號自動化管理

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md)

## 任務目標

建立 PDM 圖料號自動化管理模組，讓 RD 可先建立料號/圖號並由系統集中分配主根號、避免撞號、支援同圖多料號、DVT/發行審核、override、MA 圖作廢影響分析、既有總表匯入/匯出、append-only audit log 與每月稽核報表。第一版不要求建圖號時檢查 CAD 檔，不搬移 J 槽檔案，只保存路徑、hash 與未來 Supabase Storage 轉移欄位。

## 引導模式定案決策

- 階段管制：DVT 起正式管制；EVT 保持彈性，但塑膠射出、模具、發包加工、高成本長交期或需製程管制件需在 EVT 提醒 RD 可提前納管。
- 草稿原則：全系統草稿建立、修改、作廢預設不審核；若後續發現已發行引用、主要 MA 圖失效或發行阻擋等高風險，再以 `!`、待辦或送審處理。
- 占號原則：表單一建立即正式占號；主根號、料號、圖號不可手動撞號；作廢、合併、退回、未核准與待審號碼都不可釋放重用。
- CAD 實務限制：建圖號時不可檢查 CAD 檔是否存在，因 RD 需先領圖號才能填入 CAD；CAD 檔名、路徑、版次與引用檢查放在掛載文件、DVT 或發行階段。
- DVT 晉升效率：EVT 進 DVT 不要求人工另外設定；系統自動掃描專案料號、圖號與文件，產生 DVT 納管清單，讓 RD 批次選擇送入 DVT、保留 EVT 草稿、EVT 停用或作廢。
- BOM 關係：料號不強制進 BOM，也不與 BOM 建立強制使用關係；BOM 僅在影響分析與發行閘門中作提醒或引用來源。
- 同圖多料號：允許一張 MA 圖對多個料號；DVT 起差異欄位必填，第一版內建常用選項並允許自由填寫，未來再整理成標準字典。
- 外購與萬用料號：所有外購件需要料號；外購標準品不需要圖號；萬用料號 `000` 只需使用理由，不強制結構化尺寸參數，但需提醒實際規格需可追溯。
- OT 用途：OT 圖建立時用途描述必填；系統內建爆炸圖、概念圖、組裝參考、包裝示意、檢驗參考、客戶/供應商溝通、測試配置與其他自行填寫。
- 影響文件：品名、規格、材質、顏色、表面處理、圖號、料號、版次、製程管制需求、供應商或外購規格異動時，系統需偵測受影響文件並讓 RD 建立對應進版待辦；主管審核畫面也需看到影響範圍。
- MA 圖作廢：作廢前必須跳出影響範圍提醒；套用後受影響料號轉 `MainDrawingInvalid` 並完全阻擋使用，需重新送審通過後才能恢復。
- override 與提醒：所有 override 都必須留痕並在畫面、總表匯出與 audit 標示；所有高風險資訊統一以 `!` 做懸浮說明或跳出頁面說明。
- 後台矩陣：審核權限不可寫死；後台需提供角色列 x 權限欄的矩陣設定台，管理員可設定頁面權限、動作權限、自訂角色、使用者角色指派、主管可視範圍與代理人。
- 權限衝突：同一使用者多角色衝突時採最高權限角色優先；只有系統管理員可調整角色排序，所有調整需記錄前後排序、原因、版本與 audit。
- 代理與代送審：代理人只能由管理員設定，需限制專案、動作與時間區間；管理員可代送審，但必須標示代送審且原因必填。
- 批次審核：同專案可批次審核，不允許跨專案批次審核；退回後保留原批次，補完後只重新送退回項目。
- 通知與待辦：第一版只做系統內通知，不做 email、LINE 或 Teams；資訊類通知可關閉，待處理與阻擋通知不可關閉、不可延後。
- 稽核與儲存：audit log append-only 且保存 before/after/diff；第一版使用本機資料庫與 J 槽路徑/hash 索引，先預留 Postgres/Supabase 與 Supabase Storage 欄位，未來再移轉以控制初期成本。

## RD 執行項目

### 資料模型 / Migration
- [x] 新增 `part_roots`、`part_numbers`、`drawing_numbers`、`drawing_part_links`、`same_drawing_variants`，支援主根號、料號、圖號、主要 MA 圖與同圖多料號。
- [x] 新增唯一約束：主根號、料號、圖號不可重複；一個料號最多一張主要 MA 圖；作廢/合併號碼不可重用。
- [x] 新增狀態欄位與流程資料，支援 Draft、NeedInfo、Active、PendingReview、Released、Obsolete、Merged、EVTDisabled、PendingAdminConfirm、MainDrawingInvalid。
- [x] 新增 `rule_versions`、`rule_templates`、`approval_rules`、`approval_requests`、`approval_decisions`，支援審核矩陣、三模板與規則版本生效。
- [x] 新增 `roles`、`role_permissions`、`role_priority_versions`、`user_role_assignments`、`approval_delegations`，支援內建角色、自訂角色、使用者角色指派、最高權限排序與代理人。
- [x] 新增 `import_batches`、`import_staging_rows`，支援既有總表 staging 匯入、檢查報告、管理員確認與舊制保留。
- [x] 新增 `audit_logs` append-only、`file_assets`、`monthly_audit_reports`，支援 before/after/diff、J 槽路徑與 hash、未來 Supabase Storage key、每月報表 metadata。

### 後端服務 / API
- [x] 實作交易式占號服務，建立表單時立即產生主根號、料號、必要時產生圖號，並確保併發不撞號。
- [x] 實作編碼規則版本記錄，舊資料依建立當下規則解讀，新申請套用新規則。
- [x] 實作圖號用途規則：MA 可作主要製造圖，OT 必填用途描述且不可作主要製造圖。
- [x] 實作同圖多料號後端服務：一張 MA 圖可對多料號、一料號最多一張主要 MA 圖、DVT/多料號差異欄位必填。
- [x] 實作發行後新增同圖多料號需審核且待審不可用，核准後才套用同圖連結與差異欄位。
- [x] 實作 DVT/Release MA 圖 gate evaluator：自製/發包/客製件缺主要 MA 圖時阻擋並標示 override/action code。
- [x] 實作缺 MA 圖 override 申請、審核與發行再次確認資料流，DVT/Release 使用不同 action code 留痕。
- [x] 實作 MA 圖作廢影響分析與套用失效：回傳受影響料號/文件清單，套用後料號與主根號轉 MainDrawingInvalid。
- [x] 實作 MainDrawingInvalid 重新送審通過後恢復可用流程。
- [x] 實作查重提醒與高相似紀錄，高相似只提醒、不阻擋、不要求 RD 填原因。
- [x] 實作審核 rule evaluator，輸入動作、階段、狀態、料件類型、風險旗標後回傳審核、阻擋、警示與角色。
- [x] 實作送審批次、同專案批次審核、退回後保留原批次且只重送退回項目。
- [x] 實作待辦中心 API 與系統內通知 API，通知需分已讀/未讀與已處理/未處理。
- [x] 實作角色權限矩陣 API，支援內建角色、自訂角色、頁面權限與動作權限讀取/更新。
- [x] 實作使用者角色指派 API，支援管理員將內建或自訂角色指派給使用者、撤銷、audit 與權限判斷套用。
- [x] 實作最高權限角色排序 API，只有系統管理員可調整，並記錄調整前後排序、原因、版本與 audit。
- [x] 實作主管可視範圍 API，支援部門、專案、審核動作與待辦可視範圍設定。
- [x] 實作代理人 API，支援被代理人、代理人、專案、動作、時間區間、原因、撤銷與 audit。
- [x] 將主管範圍與代理人規則套用到審核批次清單、待辦與通知可視範圍。
- [x] 將角色矩陣頁面/動作權限套用到所有可操作 API 與 UI guard。
- [x] 實作總表匯入 staging、檢查報告、管理員確認轉正式主檔。
- [x] 實作總表匯出，支援不含稽核、最後異動摘要、完整異動摘要。
- [x] 實作每月 1 日報表 metadata 產生與管理員手動重產。

### UI / UX
- [x] 新增圖料號申請精靈，支援外購、自製、發包、共用件、客製尺寸、先料號後圖號。
- [x] 新增料件、料號、圖號查詢與明細頁，顯示 `!` 懸浮說明或跳出影響頁。
- [x] 新增 EVT 到 DVT 晉升清單，支援送入 DVT、保留 EVT 草稿、EVT 停用、作廢與批次送審。
- [x] 新增 DVT/發行審核頁，支援同專案批次審核、共用意見、異常項個別意見、代送審標示。
- [x] 新增 MA 圖作廢影響範圍頁，主管審核畫面需看到受影響料號、狀態、文件引用與進版待辦。
- [x] 新增後台審核矩陣設定台 MVP，包含矩陣總覽、規則編輯器、規則模擬器、不可關閉硬限制與 `!` 說明。
- [x] 補齊審核矩陣三模板套用與規則版本紀錄 UI。
- [x] 新增角色權限矩陣 UI，以角色列 x 權限欄呈現，支援頁面權限、動作權限、內建常用權限與自訂角色。
- [x] 新增使用者角色指派 UI，管理員可把內建或自訂 PDM 角色指派給使用者並撤銷，指派會納入最高權限排序與 audit 標示。
- [x] 新增最高權限排序 UI，只有系統管理員可調整，需顯示目前排序、調整原因、版本與異動紀錄。
- [x] 新增主管範圍設定 UI，支援部門、專案、可視待辦範圍與可審核動作範圍。
- [x] 新增代理人設定 UI，由管理員設定被代理人、代理人、專案、動作、時間區間、原因與撤銷。
- [x] 在審核、待辦與通知畫面標示代理審核、代送審、override 與影響範圍提醒，主管審核畫面需看得到。
- [x] 新增待辦中心與通知中心，預設依風險排序，允許使用者切換排序；資訊類通知可關閉，待處理/阻擋不可關閉。
- [x] 新增既有總表匯入 UI，顯示 staging 檢查報告、衝突、待補、舊制保留與管理員確認。
- [x] 新增稽核報表 UI，支援全公司總覽、部門分頁、下載與手動重產。

## QA 驗證計畫
- [x] 驗證併發建立料號/圖號不撞號，作廢、退回、未核准號碼不可重用。
- [x] 驗證草稿階段建立、修改、作廢不需審核；草稿 30 天未補齊轉待管理員確認。
- [x] 驗證圖料號申請精靈可建立外購/自製/發包/共用件/客製尺寸，支援先料號後圖號、客製規格保存、共用件理由強制填寫與查重 warning 不阻擋。
- [x] 驗證 DVT 晉升清單可正確分類送入 DVT、保留、EVT 停用、作廢；完整資料先送審，不完整留待補。
- [x] 驗證自製/發包/客製件 DVT/Release 缺 MA 圖 gate evaluator 會阻擋並產生 override/action code。
- [x] 驗證 override 申請審核與發行再次確認資料流具備 request/decision/audit/action code。
- [x] 驗證同圖多料號：一個料號最多一張主要 MA 圖、一張 MA 圖可對多料號、DVT/多料號差異欄位必填。
- [x] 驗證發行後新增同圖多料號需審核且待審不可用，未核准不得直接連結。
- [x] 驗證 MA 圖作廢前可產生影響範圍，作廢套用後受影響料號轉 MainDrawingInvalid。
- [x] 驗證 MA 圖作廢影響範圍頁可顯示受影響料號、狀態、文件進版待辦，且套用失效前需確認。
- [x] 驗證 MainDrawingInvalid 重新送審通過後才恢復可用。
- [x] 驗證高相似查重只提醒不阻擋，並保存 warning event 供管理員畫面標示。
- [x] 驗證料件、料號、圖號查詢與明細頁可依關鍵字、類型、狀態、階段查詢，並顯示同圖多料號、warning、audit 與 MA 圖作廢影響資訊。
- [x] 驗證審核矩陣三模板、規則版本、規則模擬器、不可關閉硬限制。
- [x] 驗證後台審核矩陣設定台 MVP 可讀取、編輯、新增規則、顯示不可關閉硬限制並執行規則模擬器。
- [x] 驗證審核矩陣三模板套用與規則版本紀錄 UI。
- [x] 驗證待辦中心與通知中心可依風險排序、切換待辦/通知篩選、標示已讀/已處理，且待處理/阻擋通知在 UI 與後端皆不可關閉。
- [x] 驗證 DVT/發行審核頁可載入同專案批次、顯示代送審與異常/Override、套用共用意見與異常項個別意見並完成批次核准。
- [x] 驗證角色權限矩陣 UI 可調整頁面權限、動作權限與自訂角色，且非管理員不可進入設定台。
- [x] 驗證最高權限排序只有系統管理員可調整，且排序異動有版本與 audit。
- [x] 驗證多角色衝突時實際操作權限採最高權限角色優先。
- [x] 驗證主管可視範圍依部門、專案與動作限制待辦、通知與審核清單。
- [x] 驗證代理人只能由管理員設定，且代理審核需依專案、動作與時間區間生效並可撤銷。
- [x] 驗證代理人、代送審、批次退回重送、主管待辦可視範圍在審核頁、待辦中心與 audit 中一致標示；`qc:pdm-numbering-cross-role-audit-e2e` 已驗證主管 scope、代理人 marker、代送審 marker、影響範圍 marker、批次退回重送與 audit envelope。
- [x] 驗證 audit log append-only，所有異動都有 before/after/diff，相關 RD、主管、管理員可依權限查看。
- [x] 驗證總表 staging 匯入不直接污染主檔，舊制保留可查詢與追溯。
- [x] 驗證總表匯出與每月稽核報表欄位、權限與重產行為。
- [x] 驗證稽核報表 UI 可顯示全公司總覽、部門/角色分頁、專案分頁、近期報表、近期匯出，且可手動重產與下載 JSON。

## QC 驗收標準
- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] `npm.cmd run qc:pdm-numbering-core` 234/234 通過，覆蓋核心資料表、唯一約束、同圖多料號、DVT/Release MA gate、DVT 晉升清單 workflow、DVT promotion approval rule、DVT/發行審核頁 static check、approval review batch 清單、批次個別意見、MA 圖作廢影響、MainDrawingInvalid 恢復、待辦/通知 read/handled 狀態、不可關閉通知後端 guard、待辦中心 UI static check、側欄入口、圖料號申請精靈 API/UI static check、客製規格欄位、共用件後端正規化、圖料查詢/明細 API/UI static check、MA 圖作廢影響頁 static check、總表匯入 staging/confirm、總表匯入清單 API、總表匯入 UI static check、總表匯出、每月報表 metadata、報表清單 API、部門/專案報表 metadata、稽核報表 UI static check、審核矩陣設定台 API/UI static check、三模板套用與規則版本紀錄、角色權限矩陣、使用者角色指派、主管範圍、代理人 upsert/revoke、角色矩陣預設 page/action 權限 seed、實際操作 permission guard、最高權限優先判斷、代理人 scope 權限比對、permissions route、sidebar 權限 guard、審核/待辦/通知共用 attention marker、代理審核紀錄、override/影響範圍 marker、audit log append-only trigger、before/after/diff 正規化、audit marker normalization、API regression script、data consistency script、concurrency/reuse script、draft lifecycle workflow/script、cross-role audit E2E script、cross-role permission script、查重/高相似 warning event、approval rule evaluator、approval batch、approval request/decision 與 API route static check。
- [x] `npm.cmd run qc:pdm-numbering-settings-ui` 22/22 通過，覆蓋 Admin 登入、桌面/手機寬度矩陣載入、三模板、規則版本紀錄、硬限制提示、規則模擬器、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-task-center-ui` 22/22 通過，覆蓋 Admin 登入、桌面/手機待辦中心、通知中心、代送審/Override/影響範圍 marker、資訊類通知可處理、不可關閉通知按鈕 disabled、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-report-center-ui` 20/20 通過，覆蓋 Admin 登入、桌面/手機報表中心、手動重產月報、部門/專案分頁、JSON 匯出下載、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-import-center-ui` 22/22 通過，覆蓋 Admin 登入、桌面/手機總表匯入、staging 建立、衝突/待補列顯示、檢查報告 JSON 下載、管理員確認、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-search-ui` 24/24 通過，覆蓋 Admin 登入、桌面/手機圖料查詢、料號/圖號查詢、主根明細、`!` 提醒、MA 圖作廢影響分析、圖號 filter、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-impact-ui` 24/24 通過，覆蓋 Admin 登入、桌面/手機 MA 圖影響頁、受影響料號、文件進版待辦、`!` 提醒、套用失效、DB 轉 MainDrawingInvalid、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-request-ui` 20/20 通過，覆蓋 Admin 登入、桌面/手機圖料號申請精靈、查重 warning、客製尺寸保存、先料號後圖號、自製件同步 MA 圖號、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-dvt-ui` 23/23 通過，覆蓋 Admin 登入、桌面/手機 DVT 晉升清單、完整/缺漏分類、批次送審、缺 MA 留 EVT、EVT 停用、保留 EVT、作廢、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-approval-review-ui` 25/25 通過，覆蓋代理 Engineer 登入、桌面/手機 DVT/發行審核頁、同專案批次、代理審核、代送審、異常/Override、影響範圍、共用意見、異常項個別意見、批次核准、DB decision comment、代理審核 role 紀錄、DVT Active、無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-api-regression` 26/26 通過，覆蓋編碼占號、同圖多料號、審核矩陣、MA 圖作廢、staging 匯入、audit log、報表 metadata。
- [x] `npm.cmd run qc:pdm-numbering-role-delegation-ui` 24/24 通過，覆蓋角色矩陣、最高權限排序、主管範圍、代理人設定/撤銷、桌機/手機無 console error 與無頁面層水平溢出。
- [x] `npm.cmd run qc:pdm-numbering-permission-guard-ui` 35/35 通過，覆蓋 RD page/action 權限開關、API 403、sidebar 權限隱藏/還原、桌機/手機無 console error 與無頁面層水平溢出。
- [x] UI E2E 已覆蓋角色矩陣權限套用到主要操作 guard；角色/代理人設定、DVT/發行審核、DVT 晉升、申請精靈、圖料查詢/明細、MA 圖作廢影響頁、後台審核矩陣、待辦/通知、稽核報表、總表匯出與總表匯入已由專用 UI QC 覆蓋。
- [x] `npm.cmd run qc:pdm-numbering-data-consistency` 16/16 通過，證明主根號、料號、圖號唯一；作廢號不可重用；override 與 MA 圖恢復轉向關係可追溯。
- [x] `npm.cmd run qc:pdm-numbering-concurrency-reuse` 32/32 通過，證明 12 筆併發建立料號/MA 圖號不撞號，且 pending/未核准、rejected/退回、obsolete/作廢狀態下的主根號、料號與圖號皆不可重用，duplicate-check 也會回 blocker。
- [x] `npm.cmd run qc:pdm-numbering-draft-lifecycle` 29/29 通過，證明工程師可在草稿階段建立、修改、作廢圖料號且不產生審核單；草稿逾 30 天後由管理員轉 `PendingAdminConfirm`，並建立 PDM 管理員待辦與不可關閉通知。
- [x] `npm.cmd run qc:pdm-numbering-cross-role-audit-e2e` 39/39 通過，證明主管 scoped batch/task/notification 可視範圍、代理人 `delegated_review`、代送審 `proxy_submission`、影響範圍 `impact_scope`、批次退回重送與 decision/resubmit audit envelope 一致。
- [x] `npm.cmd run qc:pdm-numbering-cross-role-permission` 45/45 通過，證明 RD 關閉後工程師被 API guard 阻擋，自訂角色指派且排到最高權限後工程師可建號，撤銷後再阻擋；同時驗證 RD、主管、PDM 管理員、系統管理員、自訂角色與設定頁 UI/audit envelope。
- [x] 權限測試證明 RD、主管、PDM 管理員、系統管理員、自訂角色與代理人可視/可操作範圍符合矩陣；`qc:pdm-numbering-permission-guard-ui`、`qc:pdm-numbering-role-delegation-ui` 與 `qc:pdm-numbering-cross-role-permission` 已覆蓋 RD/Admin guard、最高權限排序、代理 scope 與自訂角色指派 E2E。

## 風險 / 依賴
- [!] 既有總表資料可能格式不一致，需透過 staging 與舊制保留降低一次性清理風險。
- [!] Postgres / Supabase 正式遷移依賴 DEV-IND-007；第一版先不啟用正式 Supabase 專案與長期雲端成本，但 schema 與 repository 設計需避免 SQLite-only 假設。
- [!] 第一版只保存 J 槽路徑與 hash，不搬移檔案；若使用者未掛載 J 槽或無權限，仍可能無法開啟檔案。
- [!] 審核矩陣彈性高，需以不可關閉硬限制、規則模擬器與 audit log 降低設定錯誤風險。
- [!] 代理人與主管範圍屬擴權功能，需強制專案/動作/時間範圍、撤銷機制、畫面標示與 audit，避免審核責任不清。

## DEV-BOM-WORKBENCH-001：BOM 工作台獨立模組

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md)

## 任務目標

建立獨立 `BOM 工作台`，讓研發、研發主管、製造、採購圍繞同一份正式產品結構協作。工程端可用 CAD 組合件、SolidWorks BOM XLS 與人工拖拉三種方式建立與校正 Draft；研發主管審核後才形成 Released BOM Snapshot；製造與採購只能讀取 Released BOM。

## 引導模式定案決策

- 模組定位：BOM 工作台是獨立產品結構治理模組，不只是送審明細的附屬 BOM；既有 Dashboard BOM、BOM diff、Where-used 需維持相容。
- 建立來源：第一版同時支援 CAD references 自動 Draft、SolidWorks BOM XLS 匯入 Draft、人工拖拉校正；XLS 匯入永遠建立新 Draft，不覆蓋既有 Draft。
- 來源優先權：人工校正為最高權限來源，衝突規則固定為 `manual > solidworks_xls > cad_reference`；儲存時需保留來源、來源優先權、操作者與 edit event。
- Draft 原則：同一 parent item + revision 可有多個 Draft，但同時間只能有一個 Active Draft；送審預設使用 Active Draft。
- Released 原則：主管核准後建立不可原地修改的 Released Snapshot；同 parent item + revision 的舊 Released Snapshot 自動轉 `Obsolete`。
- Release Gate：Draft 階段可引用 Pending 或 Draft 候選子件以提高 RD 效率，但發布前必須阻擋缺件、Pending、Rejected、Obsolete 與非最新版 Released 子件。
- Rejected 流程：Rejected Draft 可原地修改後重新送審，需保留退回紀錄、重新送審紀錄與 `review_attempt`。
- 權限邊界：研發工程師與研發主管可看 Draft；製造與採購只能看 Released Snapshot，Draft API 也必須阻擋，不可只靠 UI 隱藏。
- 審核體驗：主管審核第一畫面以「與上一版 Released BOM 差異」為主，顯示新增、移除、數量、階層與版次變更；完整覆寫紀錄放第二層追溯。
- UI 心智：採 Windows 檔案總管式樹狀操作；左側搜尋料號 / 圖面，中間 BOM 樹，右側節點屬性，上方工具列提供匯入、群組、復原、重做、儲存、送審、比較與匯出。
- 人工編輯邊界：第一版只允許調整階層、排序、數量與虛擬群組；不允許直接修改 item master 的料號、品名、版次、材質或表面處理。
- 虛擬群組：可新增、改名、刪除與拖拉；不需要料號、版次、Released 狀態或數量；最大深度仍受 10 層限制。
- 匯出規則：只有 Released Snapshot 可提供正式 Excel / CSV 匯出，檔名固定為 `BOM_{part_number}_Rev{revision}_{YYYYMMDD}`。
- 資料庫策略：第一版維持本機 SQLite / repository 抽象執行，不啟用正式 Supabase 成本；schema 與欄位需保留 Postgres / Supabase 遷移可能性，後續由 `DEV-IND-007` 驗證 shadow migration。

## RD 執行項目

### 資料模型 / Migration
- [x] 設計並新增支援多 Draft、樹狀 line、虛擬群組、Active Draft、審核與 Released Snapshot 的 BOM schema。
- [x] 保留既有 `bom_headers` / `bom_lines` 讀取相容策略，避免既有 Dashboard BOM、BOM diff、Where-used 立即失效。
- [x] 新增 `bom_import_profiles`，支援 SolidWorks BOM XLS 標準格式版本。
- [x] 新增 edit event 或 audit log 寫入策略，保存儲存前後差異、操作者與來源。
- [x] 實作 Released 後自動將同 parent item 舊版 Released BOM 標記為 `Obsolete`。

### 建立來源
- [x] 由既有 CAD references / 組合件匯入建立 BOM Draft。
- [x] 新增 SolidWorks BOM XLS 匯入流程，每次匯入都建立新 Draft，不覆蓋既有 Draft。
- [x] 保存 XLS 原始檔、import profile version、匯入者、匯入時間與轉換後 BOM lines。
- [x] 人工拖拉來源優先權最高，衝突規則採 `manual > solidworks_xls > cad_reference`。

### BOM 工作台 UI
- [x] 新增獨立 BOM 工作台頁面與導航入口。
- [x] 採 Windows 檔案總管式樹狀結構：左側料號 / 圖面搜尋，中間 BOM 樹，右側節點屬性。
- [x] 支援既有 BOM 節點內拖拉調整階層與排序。
- [x] 支援從料號庫 / 圖面清單拖入子件。
- [x] 支援調整實體子件數量。
- [x] 支援新增、改名、刪除虛擬群組；虛擬群組不需要料號、版次、Released 狀態或數量。
- [x] 支援本次編輯 session 的 Undo / Redo 與未儲存離開提示。
- [x] 支援多 Draft 清單、設為 Active Draft、複製 Draft、比較 Draft。

### 規則 / Release Gate
- [x] 同一父層同料號同版次預設自動合併數量。
- [x] 阻擋超過 10 層的拖拉與匯入。
- [x] 阻擋循環父子關係。
- [x] Draft 可引用 Pending 子件，但發布前 Release Gate 必須阻擋未 Released、缺件、Rejected、Obsolete 或非最新版 Released 子件。
- [x] 同一 parent item + revision 同時間只能有一個 `PendingReview` BOM。

### 審核 / 匯出
- [x] 送審 BOM 時必填整體變更原因。
- [x] 研發主管審核頁以「與上一版 Released BOM 的差異」為主要畫面。
- [x] Rejected Draft 允許原地修改後重新送審，保留退回紀錄與 review attempt。
- [x] Released BOM Snapshot 支援 Excel `.xlsx` 與 CSV `.csv` 匯出。
- [x] 匯出檔名固定為 `BOM_{part_number}_Rev{revision}_{YYYYMMDD}.xlsx` / `.csv`。

## QA 驗證計畫
- [x] 工程師由 CAD 組合件建立 BOM Draft，指定 Active Draft，拖拉調整後送審。
- [x] 工程師匯入 SolidWorks BOM XLS，系統建立新 Draft，不覆蓋既有 Draft。
- [x] 工程師可從料號庫 / 圖面清單拖入子件，也可在既有 BOM 樹中調整階層、排序與數量。
- [x] 研發主管審核時先看到與上一版 Released BOM 的新增、移除、數量、階層與版次差異。
- [x] 研發主管退回後，工程師可原地修改 Rejected Draft 並重新送審。
- [x] 製造 / 採購只能看到 Released BOM，不能透過 UI 或 API 讀 Draft。
- [x] Released BOM 可匯出 Excel 與 CSV，檔名符合規則。

## QC 驗收標準
- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] BOM API regression 覆蓋 CAD Draft、XLS import Draft、多 Draft、Active Draft、樹狀保存、虛擬群組、同層合併、10 層限制、循環阻擋。
- [x] BOM review API regression 覆蓋送審、退回、重新送審、核准、Released Snapshot、舊版 Obsolete。
- [x] 權限測試證明製造 / 採購無法讀取 Draft API。
- [x] UI E2E 覆蓋 Windows 樹狀拖拉、Undo / Redo、未儲存提示、Active Draft、主管 diff 審核、Excel/CSV 匯出。
- [x] Release Gate 測試覆蓋缺件、Pending、Rejected、Obsolete、非最新版 Released 子件。
- [x] `npm.cmd run qc:bom-workbench-foundation` 27/27 通過，覆蓋 workbench schema、legacy BOM 相容、CAD references 建立多 Draft、同父層同料號同版次合併數量、Active Draft 切換、draft detail、edit event 與 audit log。
- [x] `npm.cmd run qc:bom-workbench-tree-rules` 22/22 通過，覆蓋 draft tree save、虛擬群組、同層重複料號合併、manual source、item master 屬性不可由 BOM PATCH 修改、10 層限制、循環阻擋、Active Draft endpoint、edit event 與 audit log。
- [x] `npm.cmd run qc:bom-workbench-review-release` 25/25 通過，覆蓋送審原因必填、工程師不可核准、主管核准發布、Released Snapshot、舊 snapshot obsolete、主管退回、缺件 release gate 與 audit log。
- [x] `npm.cmd run qc:bom-workbench-release-gate-resubmit` 43/43 通過，覆蓋缺件、Pending、Rejected、Obsolete、非最新版 Released 子件、同 parent/revision 單一 PendingReview、Rejected 原地修改重送、review attempt 與退回紀錄保留。
- [x] `npm.cmd run qc:bom-workbench-release-export` 21/21 通過，覆蓋 Released Snapshot CSV/XLSX 匯出、固定檔名、XLSX ZIP/worksheet 結構、固定欄位、子件數量、unsupported format 與 missing snapshot。
- [x] `npm.cmd run qc:bom-workbench-released-only-permission` 31/31 通過，覆蓋 Manufacturing / Procurement 角色登入、Pending submission detail 阻擋、BOM Draft workbench/detail/patch/set-active/submit-review/from-assembly 全部 403，以及 Released Snapshot CSV 匯出 200、固定檔名與 released child 內容。
- [x] `npm.cmd run qc:bom-workbench-solidworks-xls-import` 34/34 通過，覆蓋 TSV/Excel HTML SolidWorks BOM XLS 匯入、新 Draft、不覆蓋舊 Draft、Active Draft 切換、重複料號版次合併、原始檔 asset、import profile/job metadata、source priority、人工校正提升為 manual priority 30、edit event、audit log 與二進位 XLS 明確拒絕。
- [x] `npm.cmd run qc:bom-workbench-review-ui` 32/32 通過，覆蓋主管待審清單、與上一版 Released BOM diff baseline、新增子件、數量與階層變更、主管核准、XLSX/CSV 匯出連結、桌面/手機無頁面層水平溢出與桌面無 console error。
- [x] `npm.cmd run qc:bom-workbench-ui` 35/35 通過，覆蓋獨立 `/bom/workbench` 頁面、sidebar 導航、三欄式工作台、CAD Draft、料號/圖面搜尋拖入、數量編輯、虛擬群組、排序與縮排、Undo/Redo、未儲存提示、儲存 PATCH 回應階層/數量、複製 Draft、Active Draft、Draft 比較、送審、桌機/手機無水平溢出。

## 依賴 / 限制
- [x] 依賴既有 CAD reference / BOM / Where-used 基礎資料，不應破壞既有 `/api/submissions/[id]/bom`、BOM diff、Where-used。
- [x] SolidWorks BOM XLS 標準格式需有第一版 import profile 範例檔。
- [x] 第一版人工編輯只允許階層、排序、數量與虛擬群組，不允許改 item master 屬性。
- [x] 製造 / 採購只能讀 Released Snapshot。
- [x] 第一版不啟用正式 Supabase；BOM schema、repository 與檔案欄位需保留未來 Postgres / Supabase / Supabase Storage 遷移路徑。

## DEV-GDRIVE-001：Google Drive 資料夾樹狀設定

狀態：[x]
優先級：P1
關聯 spec：[.ai-doc/specs/google-drive-folder-tree-settings-spec-2026-05-30.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/google-drive-folder-tree-settings-spec-2026-05-30.md)

## 任務目標

讓 Admin 不需要手動理解或貼上 Google Drive Folder ID，而是能在符合 Windows 檔案總管心智模型的資料夾樹上直接指定 PDM 使用的待審核暫存區與正式發布區。系統仍以 Folder ID 作為正式設定值，畫面提供 folder name、path snapshot 與權限驗證降低誤設風險。

## RD 執行項目

### API / Google Drive
- [x] 在 `src/lib/gdrive.ts` 增加列出子資料夾能力，只回傳資料夾、不遞迴掃描整個 Drive。
- [x] 支援 Shared Drive 查詢參數，例如 `supportsAllDrives` 與 `includeItemsFromAllDrives`。
- [x] 新增 `GET /api/settings/gdrive/folders?parentId=...`，僅 Admin 可呼叫。
- [x] 新增 `POST /api/settings/gdrive/folders/verify`，驗證 folder 存在、mimeType 為資料夾、service account 可讀取與可加入子項目。
- [x] 保留實際發布流程的錯誤處理，不把 verify 結果當作永久權限保證。

### 設定保存
- [x] 擴充 `/api/settings` 允許保存 folder metadata snapshot：name、path、verified_at。
- [x] 儲存前阻擋 pending folder 與 released folder 指向同一 Folder ID。
- [x] 儲存前阻擋未驗證、無權限或非資料夾的設定。
- [x] `createAuditLog` 記錄設定變更者、folder ID 與 metadata snapshot，不記錄 access token 或 service account key path。

### UI
- [x] 將 `/settings` Google Drive 區塊改為雙欄式介面：左側資料夾樹、右側資料夾詳細資訊與設定動作。
- [x] 樹狀圖採 lazy load，展開節點才呼叫 children API。
- [x] 上方顯示左到右 breadcrumb，例如 `Google Drive > AI_PDM > 00_Pending`。
- [x] 右側顯示 folder name、path、Folder ID、Drive 類型、權限狀態、最後驗證時間。
- [x] 提供 `設為待審核暫存區`、`設為正式發布區`、`重新驗證權限`、`開啟 Google Drive`、`複製 Folder ID`。
- [x] 保留手動貼 Folder ID 的進階 fallback，但預設收合。

## QA 驗證計畫
- [x] Admin 進入 `/settings` 後可看見 Google Drive service account 狀態、目前設定摘要與資料夾樹。
- [x] Admin 可展開資料夾、選取資料夾、查看 breadcrumb 與 folder 詳細資訊。
- [x] Admin 可將不同資料夾分別指定為待審核暫存區與正式發布區，儲存後重新載入仍顯示正確 name/path snapshot。
- [x] Service account 未設定或無權限時，畫面顯示可處理的錯誤訊息。

## QC 驗收標準
- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] Settings API 測試覆蓋 Admin 權限、children API、verify API、同資料夾阻擋、無權限阻擋、非資料夾阻擋。
- [x] Settings UI 測試覆蓋 lazy load、breadcrumb、指定 pending/released、儲存後重載、錯誤狀態。
- [x] 初次載入不呼叫高成本或遞迴 Drive 掃描。
- [x] UI 不顯示 access token、service account key path 或敏感錯誤內容。
- [x] `npm.cmd run qc:gdrive-folder-tree-settings` 35/35 通過，覆蓋 Admin-only folder tree API、Shared Drive flags、verify folder、non-folder rejection、same-folder rejection、metadata snapshot、桌面/手機 settings UI、無水平溢出與無 console error。
- [x] `npm.cmd run qc:release-folders` 10/10 通過，證明舊版只 POST Folder ID 的 release folder selection 流程仍相容。
- [x] `npm.cmd run qc:pdm-numbering-settings-ui` 22/22 通過，證明審核矩陣設定台未被 GDrive settings 改動破壞。

## 依賴 / 限制
- [x] 需要 Google Drive service account 已設定，或測試環境提供 `GOOGLE_DRIVE_API_BASE_URL` mock。
- [x] Windows 同步路徑只作為使用者心智參考，不作為正式設定值。
- [x] 第一版只支援資料夾選擇，不支援建立、刪除、重新命名或拖曳搬移 Drive 資料夾。

## DEV-UX-005：全系統 UI 屬性視覺層級一致化

狀態：[x]
優先級：P1

## 任務目標

建立並套用共用視覺語彙，讓主識別、格式/分類/狀態、數值/時間、系統診斷資訊各有一致呈現層級，避免欄位全部用同一種文字串接，造成掃描困難。

## RD 執行項目
- [x] 建立共用視覺語彙：主識別用主要文字，格式/分類/狀態用 badge，數值/時間用 metadata row，SHA256/local path/Drive ID/submission ID 用等寬或展開診斷值。
- [x] 修正 Dashboard 搜尋建議、明細 header、工程上下文、CAD 引用、BOM、BOM diff、Where-used、AI 沿用候選、重複幾何、協作紀錄與系統診斷。
- [x] 修正 Upload、Handoff、Public Share 中屬性被同字重串接的 UI。
- [x] 不新增 API/schema，不增加首次開明細高成本 API。

## QA 驗證計畫
- [x] 盤點至少 12 處 UI 屬性呈現，確認格式與檔名、圖號與版次、料號與品名、狀態與說明、系統診斷與操作資訊可視覺區分。
- [x] 檢查 dashboard、upload、handoff、share 的桌面與行動版主要路徑。

## QC 驗收標準
- [x] `npm.cmd run lint` 通過。
- [x] `npm.cmd run build` 通過。
- [x] Dashboard / upload / handoff / share 視覺 QC 通過。
- [x] 100% 縮放下無文字重疊。

## DEV-CAD-001：SolidWorks Document Manager 或等效讀取元件

狀態：[!]
優先級：P0

## 任務目標

讓 Web / Windows 上傳與後續 BOM 工作台能直接讀取 `.sldprt`、`.sldasm`、`.slddrw` 的自訂屬性與 native CAD references，不再依賴 sidecar 或檔名推測。

## RD 執行項目
- [ ] 確認 SolidWorks Document Manager 授權、部署方式、測試檔來源與執行環境。
- [x] 完成可替換 native extractor adapter contract：`src/lib/pdm-metadata-adapter.ts` 與 `src/lib/cad-extraction.ts` 支援外部 command / args / `{file}` contract。
- [x] 建立 metadata adapter contract，支援圖號、料號、品名、版次、材質、表面處理、文件類型；正式 Document Manager / 等效元件仍需外部 report 證明。
- [x] 建立 references adapter contract，支援 assembly component、drawing model、derived references normalization；正式樣本仍需外部 report 證明。
- [x] 輸出機器可讀 probe 結果，遮蔽 license/token/password/secret 類參數。

## QA 驗證計畫
- [ ] 使用真實或授權測試檔：part、assembly、drawing。
- [ ] 檢查 native metadata 與 sidecar / mock 結果一致或可解釋差異。
- [ ] 檢查至少一個 assembly reference 與 drawing model reference。

## QC 驗收標準
- [x] `npm.cmd run qc:document-manager-probe-redaction` 通過。
- [x] `npm.cmd run qc:document-manager-extractor-probe` 通過；此為 mock equivalent extractor contract，正式實機 / 授權 probe 仍由 evidence report gate 管制。
- [x] 上傳 API 不因 native extractor 缺失而崩潰；錯誤訊息可操作。

## 阻塞 / 依賴
- [!] 需要 SolidWorks Document Manager 授權或等效讀取器。
- [!] 需要可用的真實 SolidWorks 測試檔。
- [!] 2026-06-02 QC：local adapter contract / probe tooling 已通過；`qc:native-cad-extractor-contract` 14/14、`qc:document-manager-extractor-probe` 6/6、`qc:document-manager-probe-redaction` 9/9、`qc:document-manager-probe-path-gate` 4/4。正式 `qc:document-manager-report:report` 仍需外部授權、部署、真實樣本與簽核 evidence。
- [!] 2026-06-01 QC：`qc:document-manager-report:report` 回報 `ready=false`，report `20260527-145712`，15 cases / 0 pass，缺 license owner、extractor command、probe path 與 sample files evidence。

## DEV-SW-001：SolidWorks Add-in 實機驗證

狀態：[!]
優先級：P0

## 任務目標

在真實 SolidWorks 電腦完成 Add-in 端到端驗證，證明安裝、登入、屬性讀取、PDF/DWG 匯出、送審與後端串接可用。

## RD 執行項目
- [ ] 在真實 CAD 電腦完成 COM 註冊與 Add-in 載入。
- [ ] 驗證 Add-in 登入與 API token 流程。
- [ ] 驗證 part、assembly、drawing 的屬性讀取。
- [ ] 驗證工程圖 PDF / DWG 匯出。
- [ ] 完成端到端送審並保存實機證據。

## QA 驗證計畫
- [ ] 使用公司標準測試檔與至少一組 assembly。
- [ ] 驗證成功路徑與屬性缺漏、網路錯誤、登入失敗等錯誤路徑。

## QC 驗收標準
- [ ] 實機報告完成，含安裝、登入、屬性讀取、匯出、送審結果。
- [ ] 若有失敗，需記錄重現步驟、錯誤訊息、環境與 log。

## 阻塞 / 依賴
- [!] 需要真實 SolidWorks 電腦與管理員權限。
- [!] 2026-06-01 QC：`field-test:preflight -- --profile all --require-evidence` 回報 `CAD-EVIDENCE-001` failed，real-machine report `ready=false issues=51`，且 COM registration 仍需 Administrator PowerShell。

## DEV-BACKUP-001：離線單向備份與還原實測

狀態：[!]
優先級：P0

## 任務目標

在獨立測試機完成還原演練，證明正式備份不只是檔案存在，而是可被第三方復原並驗證 checksum。

## RD 執行項目
- [ ] 準備獨立測試機或隔離還原環境。
- [ ] 使用既有備份 snapshot 執行 restore drill。
- [ ] 驗證 DB、repository、settings、reports 可被還原。
- [ ] 產出 restore drill 報告。

## QA 驗證計畫
- [ ] 檢查備份來源、目標、checksum、還原步驟與失敗復原證據。

## QC 驗收標準
- [ ] 還原報告完成。
- [ ] checksum 正確。
- [ ] 交接包可由非原開發者依 SOP 復原。

## 阻塞 / 依賴
- [!] 需要獨立測試機或隔離還原環境。
- [!] 2026-06-01 QC：`field-test:preflight -- --profile all --require-evidence` 回報 `RESTORE-EVIDENCE-001` failed，restore drill report `ready=false issues=24`。

## DEV-FIELD-001：正式現場測試閉環

狀態：[!]
優先級：P0

## 任務目標

完成正式現場測試，將未通過項目轉為可追蹤 task，讓 MVP 從內部驗證進入可交付狀態。

## RD 執行項目
- [x] 執行 `field-test:preflight -- --profile all`。
- [x] 執行 `field-test:handoff`。
- [x] 整理現場測試 handoff package。
- [x] 建立 field issue intake template、defect register import 工具與 P0/P1 defect-zero gate。
- [x] 建立外部 blocker closure QC gate，確認 5 個外部 gate 均有最新 handoff、可執行命令、report gate 與不誤完成證據。
- [ ] 將現場問題轉為新 task 或 defect register。

## QA 驗證計畫
- [ ] 驗證現場測試流程涵蓋登入、送審、審核、發布、交接、備份與權限。

## QC 驗收標準
- [ ] 現場測試報告完成。
- [ ] 未通過項目皆有重現步驟與後續 owner。

## 阻塞 / 依賴
- [!] 已產生 field-test handoff package `data/field-test-handoffs/20260602-090136`，但正式現場測試報告與 issue closure 仍需外部實測回填。
- [!] 2026-06-02 QC：`qc:external-blocker-closure` 驗證 5 個外部 blocker 仍在 production readiness 中、field-test / postgres-shadow 最新 handoff package 存在、外部 handoff 文件涵蓋 Document Manager、SolidWorks Add-in、restore drill、field issue intake、Supabase shadow commands、安全規則與不誤完成狀態。正式 evidence 尚未回填，故不勾現場問題 closure / field report。
- [!] 2026-06-02 QC：`field-test:preflight -- --profile all` 回報 `ready=true`，19 passed / 0 failed / 1 warning；`field-test:handoff` 產生 `20260602-090136`；`qc:field-test-handoff-package` 53/53 通過，並確認 external handoff docs 沒有舊 package id；`qc:field-test-issue-intake` 11/11 通過，證明現場 issue 可 dry-run / write 到 defect register，且 active P0/P1 會被 `qc:defects-zero` 擋住。正式 closure 仍需 `field-test:preflight -- --profile all --require-evidence` 與現場 issue closure 通過。
- [!] 2026-06-01 QC：`field-test:preflight -- --profile all --require-evidence` 回報 `ready=false`，19 passed / 3 failed / 1 warning；失敗項目來自 CAD、restore、Document Manager evidence 未 ready。

## DEV-IND-007：SQLite 到 Postgres / Supabase shadow migration

狀態：[!]
優先級：P0

## 任務目標

準備 SQLite 到 Postgres / Supabase 的 shadow migration 路徑，並確保 migration / compare 不會誤跑到既有正式專案或非 AI_PDM schema。

## RD 執行項目
- [x] 取得 dedicated staging / disposable Supabase / Postgres shadow target；`AI_PDM_STAGING` 已由人類提供、完成 connector 只讀驗證，且 2026-06-15 live pre-migration guard 通過。
- [ ] 在 disposable target 執行 schema migration。
- [x] 完成本地 static SQLite/Postgres shadow compare，並輸出可追溯 migration 檔案 hash。
- [x] 建立 disposable Supabase/Postgres shadow target handoff package，包含 SQL copy/hash、pre-migration guard、migration apply、live compare、advisor checklist 與 final QC checklist。
- [ ] 在 disposable target 執行 SQLite/Postgres compare。
- [ ] 驗證 live RLS plan、Supabase advisor 與 production readiness gate。

## QA 驗證計畫
- [x] 確認 target guard 會阻擋非空、非 disposable、非 AI_PDM schema 目標。
- [x] 確認 compare 結果可追溯到 migration 版本。
- [x] 確認 handoff package 不保存連線字串、禁止 `ProJED` / `ProJED_TEST`，並強制外部文件引用最新 package。
- [ ] 確認 disposable target live compare 與 RLS/advisor 驗證可重複執行。

## QC 驗收標準
- [x] `npm.cmd run qc:postgres-shadow-target-guard` 通過。
- [x] `npm.cmd run qc:postgres-shadow` 本地 static shadow / traceability 檢查通過。
- [x] `npm.cmd run qc:postgres-shadow-handoff-package` 通過。
- [ ] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。
- [ ] production readiness 報告不再因 shadow target 缺失而標記 blocked。

## 阻塞 / 依賴
- [!] staging target 已提供：`AI_PDM_STAGING / qerabudthnnpqvybpcsq` 已由 connector 讀取驗證，且 live pre-migration target guard 已通過；仍待 migration apply、live compare、post-apply RLS/advisor evidence 與 production readiness closure。
- [!] 2026-06-02 RD/QA/QC：已產生 Postgres shadow handoff package `data/postgres-shadow-handoffs/20260602-091309`；package 內含 `postgres-shadow-handoff.json`、SQL copy/hash、`01-pre-migration-guard.ps1`、`02-apply-migration.ps1`、`03-compare-shadow.ps1`、`supabase-advisor-checklist.md` 與 `qc-checklist.ps1`。`qc:postgres-shadow-handoff-package` 驗證 package 檔案、hash、禁用既有 `ProJED` / `ProJED_TEST`、不硬編 Postgres URL、外部文件引用最新 package，QC 通過。實際 disposable target 建立、migration apply、live compare、Supabase advisor 證據與 production readiness closure 仍維持外部阻塞。
- [!] 2026-06-01 本地防呆與 traceability 已完成：`qc:postgres-shadow-target-guard` 10/10 通過，`qc:postgres-shadow` 21/21 通過；compare report 已包含 `db/schema.sql`、`db/postgres/001_initial_schema.sql`、`db/postgres/002_supabase_rls_plan.sql` 的 SHA-256，可追溯 migration 輸入。
- [!] 2026-06-01 續查：Supabase connector 已可用，organization `JED` 下有 `ProJED` 與 `ProJED_TEST`；兩者 public schema 都有既有 `profiles/projects/wbs_items/...`，不是乾淨 disposable shadow target。`_get_cost` 顯示 new project `0/monthly`、branch `0.01344/hourly`，但建立新 project/branch 仍需使用者先確認成本與 organization/region。
- [!] 本機 fallback 不可用：未找到 `psql` / `postgres`，Docker daemon 未啟動且 Docker config access denied。

## DEV-SUPABASE-DB-001：Supabase 正式資料庫 runtime 遷移

狀態：[/]
優先級：P0
類型：資料庫平台 / Supabase runtime cutover
關聯 spec：[.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md)
關聯 ADR：[.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md)
RD 計畫：[.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md)
QA 計畫：[.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md)
QC 計畫：[.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md)
PM 文件包：[.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md)
開發文件總索引：[.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md)
2026-06-09 重新制定主文件：[.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md)

## 任務目標

將 AI_PDM 正式資料庫 runtime 從 SQLite 升級為 Supabase Postgres。因 2026-06-08 已完成本機 `data` reset，本任務不搬遷舊測試檔案或舊 runtime artifacts；只建立乾淨 schema、受控 seed、Postgres runtime provider、staging/prod cutover gate 與 rollback evidence。

## RD 執行項目

- [x] 取得使用者對新 Supabase target 與成本的確認，不使用既有 `ProJED` / `ProJED_TEST`；2026-06-11 已補 connector evidence。
- [x] `AI_PDM_STAGING` 已由人類建立並由 connector 讀取驗證；2026-06-12 read-only preflight 證明 target active healthy、public schema 空、migration history 空、security advisor 無 lint、performance advisor 僅 Auth connection INFO；2026-06-15 live pre-migration target guard 通過。
- [x] 建立 `supabase/migrations` 本機 migration mirror，並以 `npm.cmd run supabase:migrations:sync` 從 `db/postgres/*.sql` 同步。
- [x] 新增 `npm.cmd run qc:supabase-runtime-migrations` 驗證 migration mirror、source hash、RLS baseline、CLI migration-list readiness、env 與文件。
- [x] 強化 target identity guard，對已知 `ProJED` / `ProJED_TEST` project ref 或 `PDM_SUPABASE_TARGET_NAME` 先行 fail closed。
- [/] 在 Supabase CLI 安裝後，將本機 mirror 轉為正式 CLI migration history 並跑 `supabase migration list`；2026-06-12 已依官方 CLI reference 修正命令並讓 manifest 記錄 `localMigrationList`，目前本機 CLI 不存在，故未宣稱 history 已驗。
- [x] 新增 `postgres` async runtime provider，保留 `sqlite` fallback；`getAsyncDatabaseClient()` 會依 `PDM_DB_PROVIDER` 選擇 SQLite 或 Postgres，未設定 `PDM_POSTGRES_URL` 時 fail closed，live cutover 仍待 staging target。
- [x] 建立 async DB interface 與 SQLite async adapter，先不切換既有同步 SQLite runtime。
- [x] 建立 Postgres async adapter 最小實作，使用 server-side `pg` pool、unnamed query、transaction boundary 與 missing URL fail-closed。
- [x] 建立第一個 provider-neutral repository pilot：async system settings repository。
- [x] 建立第二個 provider-neutral repository pilot：async access-control repository，覆蓋 roles / users / role_permissions。
- [x] 將 `/api/numbering/permissions` 只讀路徑接到 async access-control repository，保留 response contract。
- [x] 建立 async numbering permission guard helper，並將第一批低風險 read-only routes 改用 async page guard：`/api/numbering/search`、`/api/numbering/tasks`、`/api/numbering/notifications`、`/api/parts`、`/api/numbering/drawings`。
- [x] 建立 async user repository 與 `requireAuthAsync`，讓 async permission guard 的 session user lookup 脫離同步 `getUserById` 執行路徑。
- [x] 將 `/api/auth/login` 與 `/api/auth/token` 的 password user lookup 改用 async user repository。
- [x] 建立 async audit repository，並將 `/api/auth/login` 與 `/api/auth/token` 的 Login audit 寫入改用 async helper。
- [x] 建立 Supabase DB migration 開發文件總索引，集中 PM/RD/QA/QC/SPEC/ADR/README 閱讀順序與下一步切片。
- [x] 依 2026-06-08 full data reset 後狀態，重新制定 2026-06-09 Supabase DB migration 主開發文件，明確定義 clean baseline、DB-first、Storage follow-up、Phase 0-6、風險與完成條件。
- [ ] 逐步移除 repository SQLite-only API。
- [ ] 遷移 auth/users/settings、submissions、numbering、approval、BOM、release/file metadata repository。
- [/] 新增 Postgres provider contract QC 與 Postgres-mode API regression；本機 `qc:db-provider-postgres` 已通過，真實 `PDM_POSTGRES_URL` 下的 Postgres-mode API regression 仍待 live target。
- [ ] 在 staging 跑 migration、seed、compare、RLS、advisor、build 與 smoke。
- [ ] 建立 `AI_PDM_PROD` 並執行 production cutover。
- [x] 另開 Supabase Storage follow-up，不把檔案本體遷移混入本任務；已以 `DEV-STORAGE-COST-001` 獨立追蹤檔案本體 / provider / lifecycle / cost-control，DB runtime 任務只保留資料庫 cutover。

## QA 驗證計畫

- [ ] 驗證 clean baseline：無歷史 test files 需搬遷，只保留受控 seed。
- [x] 驗證本機 migration mirror 與 `db/postgres` source hash 對齊。
- [x] 驗證 target identity guard 會阻擋已知非 AI_PDM Supabase project ref。
- [x] 驗證 target guard：非空、非 AI_PDM、partial schema、既有 `ProJED` / `ProJED_TEST` 都被阻擋。
- [x] 驗證 SQLite fallback：`db:init`、主要 QC、`build` 可在 SQLite mode 通過；2026-06-12 已以 `PDM_DB_PROVIDER=sqlite` 跑過 `db:init`、provider contract、doc-paths、`tsc`、`lint --quiet`、`build` 與 dev-mode `qc:api` 409/409。
- [x] 驗證 async provider contract：query、queryOne、execute、transaction 邊界存在，SQLite async transaction 會拒絕 awaited callback 誤用。
- [x] 驗證 Postgres async adapter 本機 gate：`pg` dependency、connection string required、unnamed query、named parameter normalization、BEGIN/COMMIT/ROLLBACK、nested transaction fail-closed。
- [x] 驗證 async system settings repository：無 `getDb` / `better-sqlite3` 依賴，SQL 常數可在 in-memory SQLite 上完成 insert/update/read/get-all 語意。
- [x] 驗證 async access-control repository：無 `getDb` / `better-sqlite3` 依賴，SQL 常數可在 in-memory SQLite 上完成 role list、user list、role lookup、permission upsert、permission list 語意。
- [x] 驗證 async permission API read path：role matrix enable/disable、custom role priority、assignment、delegation、sidebar visibility 與 backend guard parity 通過。
- [x] 驗證 async permission guard helper 與第一批 read-only route 接線。
- [x] 驗證 async user repository、`requireAuthAsync` 與 async permission guard 接線。
- [x] 驗證 managed login 與 bearer token auth 在 async password lookup 後仍通過。
- [x] 驗證 login/token async audit 寫入 route 行為與 audit row。
- [/] 驗證 Postgres provider contract：query、queryOne、execute、transaction 語意一致；本機 adapter/selector gate 已通過，live query/transaction parity 需在 `PDM_POSTGRES_URL` 設定後補驗。
- [ ] 驗證 API parity：主要流程在 Postgres mode 不退回 SQLite。
- [/] 驗證 RLS deny-by-default 與 secret boundary；本機 migration mirror / RLS SQL baseline 與 `qc:supabase-secret-boundary` 已通過，schema apply 後的 live RLS proof 仍待補驗。
- [/] 驗證 Supabase advisor 無 cutover blocker；2026-06-12 pre-migration read-only advisor：security 無 lint，performance 只有 Auth connection allocation INFO。post-migration advisor / RLS blocker 仍需在 schema apply 後補驗。
- [ ] 驗證 production smoke 與 rollback drill。

## QC 驗收標準

- [ ] `npm.cmd run db:postgres:guard -- --phase pre-migration` 對 staging/prod target 通過。
- [x] `npm.cmd run qc:supabase-runtime-migrations` 通過。
- [x] `npm.cmd run qc:postgres-shadow-target-guard` 對 forbidden Supabase project ref 的 fail-closed case 通過。
- [ ] `npm.cmd run db:postgres:compare -- --require-postgres` 有 migration trace 且無 mismatch。
- [ ] `npm.cmd run qc:postgres-shadow` 在 live target 通過。
- [x] 新增 `npm.cmd run qc:db-provider-postgres` 通過；2026-06-12 passed 9/9，live probe skipped because `PDM_POSTGRES_URL` is not configured。
- [x] 新增 `npm.cmd run qc:access-control-async-repository` 通過。
- [x] `npm.cmd run qc:pdm-numbering-cross-role-permission` 通過。
- [x] `npm.cmd run qc:pdm-numbering-permission-guard-ui` 通過。
- [ ] 新增 `npm.cmd run qc:api:postgres` 通過。
- [x] 新增 `npm.cmd run qc:supabase-secret-boundary` 通過；2026-06-12 passed 15/15，驗證 Postgres/Supabase secrets 僅使用 server-side env，且不進 `NEXT_PUBLIC_*` / `next.config` frontend env。
- [/] Supabase security/performance advisor 沒有未處理 blocker；2026-06-12 pre-migration read-only advisor security 無 lint、performance 僅 INFO，schema apply 後仍需重新驗證。
- [x] `npm.cmd run build` 通過；2026-06-12 passed，仍有既有 Turbopack NFT trace warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`。
- [ ] production smoke 證明新資料寫入 Supabase Postgres。

## 阻塞 / 依賴

- [/] Staging target 已由使用者建立並完成 connector 只讀驗證；production target / branch cost confirmation 仍待正式 cutover 前確認。
- [!] 本機未安裝 Supabase CLI；目前只產生可驗證 migration mirror，manifest 已記錄 `localMigrationList.attempted=false`，正式 CLI migration history 需待 CLI 可用並 linked target 後補驗。
- [!] 需新建 AI_PDM 專用 target；現有 `ProJED` / `ProJED_TEST` 禁止作為本任務 target。
- [!] 需要 repository async 化，這是主要工程風險。
- [!] Storage 不是本任務完成條件，後續需另開檔案儲存 provider 任務。

## 2026-06-12 Postgres Async Provider Local Gate Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: local async runtime provider checklist sync.
- Evidence: [.ai-doc/reports/rd/rd-postgres-async-provider-local-gate-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-postgres-async-provider-local-gate-report-2026-06-12.md)
- Local state: `getAsyncDatabaseClient()` supports `sqlite` and `postgres`; SQLite remains the fallback, and Postgres requires `PDM_POSTGRES_URL` fail-closed.
- Verification: `npm.cmd run qc:db-provider-contract` passed 35/35.
- Verification: `npm.cmd run qc:db-provider-postgres` passed 9/9; live probe was skipped because `PDM_POSTGRES_URL` is not configured.
- Boundary: this addendum closes only the local async provider / QC checklist gap. Live Postgres query parity, Postgres-mode API regression, migration apply, RLS/advisor evidence, production cutover, and rollback remain open.

## 2026-06-12 Supabase Secret Boundary QC Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: server-side secret boundary static gate.
- Evidence: [.ai-doc/reports/rd/rd-supabase-secret-boundary-qc-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supabase-secret-boundary-qc-report-2026-06-12.md)
- Added `scripts/qc-supabase-secret-boundary.mjs` and `qc:supabase-secret-boundary`.
- Coverage: `.env.example` documents server-only Postgres runtime/admin vars without `NEXT_PUBLIC_*` secrets; `next.config.mjs` exposes no `env` block; `PDM_POSTGRES_URL` is scoped to `src/lib/db-async-provider.ts`; Storage rejects public Supabase service-role and S3 credential env names; SPEC / ADR / handoff docs preserve server-side secret boundary.
- Verification: `node --check scripts/qc-supabase-secret-boundary.mjs` passed.
- Verification: `npm.cmd run qc:supabase-secret-boundary` passed 15/15.
- Boundary: no credentials were read, no Supabase connector calls, no DB connection, no migration, and no runtime provider pointer change.

## 2026-06-12 Supabase Staging Read-only Preflight Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: staging target identity / emptiness / advisor preflight.
- Evidence: [.ai-doc/reports/rd/rd-supabase-staging-readonly-preflight-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supabase-staging-readonly-preflight-report-2026-06-12.md)
- Connector evidence: `list_projects` and `get_project` confirmed `AI_PDM_STAGING / qerabudthnnpqvybpcsq`, organization `Jenfu Machinery / ydxbtstvlunmpjdlrhml`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`, Postgres engine `17`, database version `17.6.1.127`.
- Connector evidence: `list_tables(public)` returned empty, and `list_migrations` returned empty.
- Connector evidence: project URL resolved; publishable key inventory exists and keys are not disabled, but key values were not recorded.
- Advisor evidence: security advisor returned no lints; performance advisor returned one INFO for Auth DB connection allocation, not a pre-migration schema/cutover blocker.
- Boundary: no SQL, no `apply_migration`, no Supabase project/branch creation, no credential write, no runtime provider pointer change. Migration apply, RLS proof, schema compare, Postgres-mode API parity, production cutover, and rollback remain open.

## 2026-06-12 SQLite Fallback Local Gate Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: SQLite fallback local runtime gate.
- Evidence: [.ai-doc/reports/rd/rd-sqlite-fallback-local-gate-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-sqlite-fallback-local-gate-report-2026-06-12.md)
- Local state: with `PDM_DB_PROVIDER=sqlite`, `db:init` initialized `data/ai-pdm.sqlite`; provider contracts, TypeScript, lint, production build, and dev-mode API regression all passed against SQLite fallback.
- Verification: `npm.cmd run db:init` passed.
- Verification: `npm.cmd run qc:db-provider-contract` passed 35/35.
- Verification: `npm.cmd run qc:db-provider-postgres` passed 9/9 with live Postgres probe skipped because `PDM_POSTGRES_URL` is not configured.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build retained the existing Turbopack NFT trace warning.
- Verification: `node scripts/qc-api-test.mjs` against a temporary `next dev` server on `127.0.0.1:3002` passed 409/409; output saved to `output/sqlite-fallback-qc-api-2026-06-12.json`.
- Boundary: no Supabase connector calls, no live Postgres connection, no migration apply, no RLS/advisor post-apply proof, no production cutover, and no runtime provider pointer change. The API regression intentionally wrote local QC data to SQLite.

## DEV-STORAGE-COST-001：檔案儲存成本控管與可替換 provider 架構

狀態：[/]
優先級：P2
節點類型：交付點
父交付點：無；但實作順序應晚於 `DEV-SUPABASE-DB-001` 的 staging/prod DB runtime gate
是否計入產品交付完成：是，Phase 0A storage inventory / cost report、Phase 1A local service boundary、Phase 1B/1C local file IO boundary、Phase 2A/2B metadata audit、Phase 3A migration dry-run、Phase 3B Supabase provider contract、Phase 3C download access contract、Phase 3D route-level authenticated storage access audit、Phase 3E public share package access audit、Phase 4A egress analytics report、Phase 4B monthly PM/QC evidence generator、Phase 4C scheduled evidence runner、Phase 4D dashboard / notification evidence source、Phase 4E dashboard storage evidence panel、Phase 4F archive restore drill、Phase 4G migration runbook package、Phase 4H controlled migration execution gate、Phase 4I S3-compatible dry-run / adapter contract、Phase 4J lifecycle policy dry-run、Phase 4K metadata model blueprint / QC、Phase 4L dedup reference dry-run、Phase 4M runtime upload policy gate、Phase 4N large-file decision gate、Phase 4O controlled Admin upload override gate、Phase 4P alternate large-file intake package、Phase 4Q external large-file registration contract、Phase 4R schema migration proposal package、Phase 4S disposable schema apply gate、Phase 4T read-only schema verify gate、Phase 4U schema promotion evidence gate、Phase 4V Supabase advisor evidence normalizer、Phase 4W known Supabase target denylist、Phase 4X Supabase target readiness gate、Phase 4Y target readiness handoff package、Phase 4Z target cost confirmation package、Phase 5A formal migration review package、Phase 5B actual target provisioning evidence、Phase 5C user cost confirmation evidence gate、Phase 5D actual blocked confirmation evidence folder、Phase 5E Supabase target create request gate、Phase 5F target create result evidence gate、Phase 5G connector receipt evidence gate、Phase 5H formal review provisioning-result integration、Phase 5I target provisioning execution package、Phase 5J forced RLS hardening 已啟動
最新補充：Phase 5K cost-confirmation freshness hardening、Phase 5L governance snapshot、Phase 5M governance gate artifact、Phase 5N storage access audit QC gate、Phase 5O runtime API storage access audit regression、Phase 5P QC runtime provenance / governance exclusion、Phase 5Q evidence provenance quality governance、Phase 5R scheduled evidence quality handoff、Phase 5S migration execution governance gate integration、Phase 5T migration runbook governance handoff、Phase 5U local provider file-domain regression gate、Phase 5V file storage role/share access gate、Phase 5W upload detail metadata gate、Phase 5X local upload dedup gate、Phase 5Y migration link-invariance dry-run gate 已啟動；目前仍未建立 Supabase target、未套用正式 DB migration、未做 live provider cutover。
PM 開發計畫：[.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md)

## 任務目標

建立 AI_PDM 檔案本體的成本控管與可替換 storage provider 架構。資料庫只保存 metadata、hash、provider、bucket/key、版本、生命週期與 audit；檔案本體透過 server-side `FileStorageService` 存取，避免未來因 Supabase Storage 容量或 egress 成本升高時必須重寫 PDM。

## 開發範圍

- [x] 建立 storage inventory / cost report 第一版，統計容量、檔案數、重複 hash、top large files 與 provider 分布；目前尚未有實際 egress log。
- [x] 新增 `FileStorageService` interface 與 `LocalRepositoryStorageAdapter`，包住現有 `PDM_REPOSITORY_DIR` 行為。
- [/] 正規化檔案 metadata，支援 provider、bucket、object key、content hash、size、mime、version、lifecycle tier；目前完成 read-only metadata descriptor normalizer、provider-neutral metadata model blueprint、dedup/reference preview、external large-file registration contract、schema migration proposal package 與 QC，尚未套用正式 DB `storage_objects` schema migration。
- [/] 建立 SHA-256 deduplication reference flow，讓相同 physical object 可被多個 business records 引用；目前完成 read-only dedup reference dry-run、canonical object selection、reference preview、blocked/missing/hash guard、external large-file registration repository contract、local provider upload-time physical-object dedup 與 QC，尚未套用正式 DB migration 或啟用 physical object cleanup。
  - [/] 建立 Supabase Storage private bucket adapter，透過 server API 控制 upload / preview / download / signed URL；目前完成 provider registry 與 fail-closed adapter contract，尚未連 staging bucket。
- [/] 建立成本控管規則：上傳大小限制、草稿保留、released file 保護、熱/溫/冷 lifecycle、成本警示；目前完成 runtime upload policy helper、large-file decision gate、controlled Admin upload override gate、alternate large-file intake package、external large-file registration contract、read-only lifecycle policy dry-run 與 QC，尚未啟用 live cleanup / alternate large-file executor。
- [/] 建立 S3-compatible adapter dry-run，至少覆蓋 R2 / S3 / B2 / Wasabi / NAS gateway 其中一種 provider path；目前完成 `s3_compatible` fail-closed adapter contract 與 Cloudflare R2 profile dry-run，尚未做 live provider request。
- [/] 建立 migration dry-run / execute / verify / rollback tooling；目前完成 read-only migration dry-run、migration runbook package、business-link invariance contract 與預設 disabled 的 controlled execution gate，可在隔離 local staging target 驗證 copy / SHA-256 / rollback source evidence；尚未執行 live provider 搬檔、verify cutover 或 metadata pointer 更新。
- [/] 建立 archive restore drill，證明 cold storage 可用 checksum 還原；目前完成本機 metadata-driven isolated restore drill 與 hash verification，尚未接外部 cold provider。

## 驗收標準

- [x] 現有上傳、下載、PDF 預覽、發行包流程在 local provider 下不退化；2026-06-12 新增 `qc:file-storage-local-provider-regression` 34/34，鎖住 upload metadata、server-stream download、PDF inline preview、release package ZIP、public share package、StorageAccessed audit 與既有 `qc:api` runtime assertions。
  - [/] Supabase Storage staging private bucket 可完成 upload / preview / download，且 secret 不進 frontend bundle；目前已完成 server-only env contract 與 public service key guard，尚未 live bucket 驗證。
  - [/] 下載使用短效 signed URL 或 server-streaming，並留下 audit；目前完成 service-level access contract，並已在 authenticated submission file download / PDF preview / release package download route、public share package route 接上 `StorageAccessed` audit；staging signed URL live bucket 驗證仍待後續切片。
- [/] 重複 SHA-256 檔案不重複存 physical object，除非設定明確要求保留副本；目前 local provider upload-time dedup 已共用 canonical physical file，cost report 也改以 unique physical object 計算 recoverable bytes；正式 `storage_object_references` 寫入與 live provider dedup 仍待 schema / provider gate。
- [/] Released official files 不會被草稿清理或 lifecycle rule 誤刪；目前 lifecycle policy dry-run 已將 released / release package 標為 protected，尚未啟用真實 lifecycle rule。
- [/] provider migration dry-run 不刪檔、不改 pointer；controlled execution gate 已證明 copy 後 verify hash 與 rollback source verification，live provider pointer update 仍維持 disabled。
- [/] rollback 可將 metadata pointer 切回原 provider；目前已完成 pointer rollback plan、rollback source verification 與 QC，尚未在 staging/live provider 執行實際 pointer rollback。
- [/] cost report 可列出 storage size、duplicate candidate size、large file list、provider 分布與 audited egress；目前 storage inventory、`StorageAccessed` egress analytics、monthly PM/QC evidence generator、scheduled runner、dashboard API、notification alert source、首頁 storage evidence panel、archive restore drill、migration runbook package、controlled execution gate、S3-compatible dry-run 與 lifecycle policy dry-run 已完成，尚未做 live provider migration execute / rollback / external cold provider restore。

## RD 執行計畫

- [x] 檢查現有 `src/lib/file-store.ts`、`src/lib/file-response.ts`、release package 與 attachment repository 的 filesystem 邊界，先以 metadata report 切入。
- [x] 新增 `scripts/generate-file-storage-cost-report.mjs` 與 `scripts/qc-file-storage-cost-report.mjs`。
- [x] 新增 `storage:cost-report` 與 `qc:file-storage-cost-report` npm scripts。
- [x] 新增 provider-neutral file storage service 與 local adapter。
- [/] 擴充或新增 storage metadata model，避免在 `storage_provider` CHECK constraint 中寫死所有未來 provider；目前完成 `storage_providers` / `storage_objects` / `storage_object_references` blueprint、proposal SQL package 與 QC，正式 schema migration 等 DB runtime gate 後再套用。
- [/] 將 upload / preview / download 入口逐步改為 service 呼叫；目前已完成 upload 寫入、download / PDF preview 讀取、release package 建立時的 submission source file 讀取、release package zip 本體讀寫，以及 master attachment 讀寫。
  - [/] 新增 Supabase adapter 後，只在 staging private bucket 驗證，不直接 production cutover；目前 adapter contract 已存在，live IO 預設 disabled。
- [/] 新增 S3-compatible adapter dry-run path；目前完成 `s3_compatible` provider resolver、server-only env guard、fail-closed adapter contract 與 Cloudflare R2 dry-run profile，live signed request 尚未啟用。
- [x] 實作 cost / duplicate / orphan / hash mismatch report 第一版；目前為 read-only inventory / audit report，不執行 migration 或 cleanup。
- [/] 實作 migration dry-run 與 rollback-first 搬遷工具；目前完成 dry-run plan、execute / verify / rollback runbook package、pointer rollback plan 與預設 disabled controlled execution gate，live provider execute 尚未啟用。
- [x] 新增 monthly PM/QC evidence generator，將 storage cost report 與 egress report 匯總成可留存的 JSON / Markdown 月報。
- [x] 新增 scheduled evidence runner 與 Windows Task Scheduler 安裝腳本，讓月報可由固定排程產出 run manifest / latest manifest。
- [x] 新增 storage evidence dashboard API 與 notification alert source，讓 monthly evidence latest manifest 可被 UI / notification center 消費。
- [x] 新增 dashboard `Storage Evidence` panel，Admin / R&D Manager 可在首頁工作台查看 monthly evidence status、storage / egress 摘要、blockers、warnings、threshold usage 與下一步。
- [x] 新增 storage archive restore drill，從 metadata 選取可驗證本機物件，複製到 isolated restore target，重新計算 SHA-256，並輸出 JSON / Markdown 證據。
- [x] 新增 storage lifecycle policy dry-run，覆蓋 draft retention、released protection、warm/cold tier candidate、upload size warning、storage threshold status 與 hash audit blocker。
- [x] 新增 storage dedup reference dry-run，從 SHA-256 duplicate groups 產生 canonical object、storage object reference preview、blocked group 與 recoverable bytes evidence。

## QA 驗證計畫

- [x] Engineer 上傳 CAD / PDF / DWG 後，submission detail metadata 正確；2026-06-12 `qc:file-storage-upload-detail-metadata` 13/13 鎖住允許副檔、role normalizer、upload saved metadata、DB insert、detail `files` payload、file count / role summary 與既有 `qc:api` detail/runtime coverage。
- [x] PDF 預覽不自動下載原始 CAD；local provider regression gate 驗證 `/files/preview/[fileId]` 僅允許 PDF inline preview，非 PDF preview 以 415 阻擋，且 `qc:api` 保留 `FILE-003` 至 `FILE-005`。
- [x] Manufacturing / Procurement 只能下載被授權的 released files；2026-06-12 `qc:file-storage-role-access` 21/21 鎖住 released-only role helper、submission file route、release package route 與既有 procurement API redaction / role-denial assertions。
- [/] supplier share 只能存取被分享的發行包或指定檔案；2026-06-12 `qc:file-storage-role-access` 21/21 鎖住 token-scoped public package route、非 active share blocking、revoked share/package 404 與 metadata redaction。指定單檔 share 尚未產品化，仍待後續。
- [/] 大檔超過門檻時被阻擋或要求 Admin override；目前 submissions 與 master attachment runtime 已共用 `storage-upload-policy` 門檻，送審 API 會輸出 `storage_upload_decision` details 區分 `admin_override_required` 與 `alternate_large_file_path_required`，且 Admin 可用 `storage_upload_override` + `storage_upload_override_reason` 對中型大檔做受控覆核並寫入 Submit audit；超過 large-file threshold 時會輸出 `large_file_intake_required=true` intake package detail，並已有 external large-file registration contract / async repository QC；正式 alternate large-file executor 尚未落地。
- [x] 重複檔案上傳時不重複存 physical object，但業務關聯與 audit 都保留；2026-06-12 `qc:file-storage-upload-dedup` 14/14 實際執行 local adapter，證明相同 SHA-256 上傳共用 canonical localPath/storageKey，不同內容仍建立新 physical file，`submission_files` 仍逐筆保留，Submit audit 仍記錄原始 fileCount。
- [/] provider 搬遷後，submission / drawing / part / BOM 連結不變；2026-06-12 dry-run / runbook / execution-gate 已鎖住 `businessLinkInvariant`，限制搬遷只能改 storage pointer 欄位並保持 `submissions`、`items`、`bom_*`、`drawing_numbers`、`part_numbers`、`drawing_part_links` 不動。live provider pointer update / app smoke 仍待正式搬遷後補驗。
- [x] hash mismatch、missing object、orphan metadata 都能被辨識；`qc:file-storage-local-provider-regression` 鎖住 `generate-file-storage-cost-report` / `qc-file-storage-cost-report` 的 missing local object、hash mismatch 與 orphan local file fixture。
- [/] cold archive restore 後 SHA-256 一致並可下載；目前 isolated local restore drill 可證明 SHA-256 一致，外部 cold provider restore / app download smoke 尚未完成。

## QC 驗收標準

  - [x] `npx.cmd tsc --noEmit` 通過。
  - [x] `npm.cmd run lint -- --quiet` 通過。
  - [x] `npm.cmd run build` 通過。
- [x] `npm.cmd run qc:api` 或等效 file domain regression 通過；2026-06-12 `npm.cmd run qc:file-storage-local-provider-regression` passed 34/34。
- [x] 新增 `npm.cmd run qc:file-storage-contract` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-metadata` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-local-provider-regression` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-role-access` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-upload-detail-metadata` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-upload-dedup` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-dedup-reference` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-upload-policy` 通過。
- [x] 新增 `npm.cmd run qc:external-large-file-intake` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-migration-package` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-apply-gate` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-verify-gate` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-target-readiness` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-target-readiness-package` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-formal-review-package` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-advisor-evidence` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-schema-promotion-gate` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-cost-report` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-evidence-dashboard` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-egress-report` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-lifecycle-policy` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-monthly-evidence` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-monthly-evidence-schedule` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-migration-dry-run` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-migration-runbook` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-migration-execution-gate` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-s3-compatible-dry-run` 通過。
- [x] 新增 `npm.cmd run qc:file-storage-archive-restore` 通過。

## 阻塞 / 依賴

- [!] `DEV-SUPABASE-DB-001` 尚未完成 live `AI_PDM_STAGING` / `AI_PDM_PROD` DB runtime validation。
- [!] Supabase Storage 實作前需重新確認 Supabase pricing、organization、region 與 bucket policy。
- [!] 外部 S3-compatible provider 需使用者決策：R2 / AWS S3 / B2 / Wasabi / NAS gateway。
- [!] 大檔與草稿保留規則需使用者確認，避免誤刪正式工程資料。

## 2026-06-10 Phase 0A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: storage inventory / cost report first slice。
- Delivery: added `scripts/generate-file-storage-cost-report.mjs` to produce a read-only JSON inventory from `submission_files`, `release_packages`, `file_assets`, and `PDM_REPOSITORY_DIR`.
- Delivery: added `scripts/qc-file-storage-cost-report.mjs` with a fixture SQLite database and repository files to validate provider summaries, duplicate hash grouping, missing local object checks, and no migration/delete assumptions.
- Delivery: added `npm.cmd run storage:cost-report` and `npm.cmd run qc:file-storage-cost-report`.
- Current local report: `data/ai-pdm.sqlite` and `data/repository` exist; metadata file count is 0; repository scanned file count is 0; report recommends keeping Storage follow-up before provider cutover until real PDM uploads exist.
- Verification: `npm.cmd run qc:file-storage-cost-report` passed 12/12; `node --check scripts/generate-file-storage-cost-report.mjs` passed; `node --check scripts/qc-file-storage-cost-report.mjs` passed; `npm.cmd run qc:doc-paths` passed 23/23; `npm.cmd run lint -- --quiet` passed.
- Guardrail: no file migration, no deletion, no Supabase bucket creation, and no provider cutover were performed in this slice.

## 2026-06-10 Phase 1A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: local `FileStorageService` provider boundary first slice。
- Delivery: added `src/lib/file-storage.ts` with `FileStorageService`, `LocalRepositoryStorageAdapter`, provider-safe storage keys, SHA-256 helper, and repository-root boundary checks.
- Delivery: updated `src/lib/file-store.ts` so `saveUploadedFiles` writes through `createFileStorageService().putObject(...)` while preserving `localPath`, `sha256`, and `fileSize` output.
- Delivery: added `scripts/qc-file-storage-contract.mjs` and `npm.cmd run qc:file-storage-contract`.
- Verification: `npm.cmd run qc:file-storage-contract` passed 12/12; `npm.cmd run qc:file-storage-cost-report` passed 12/12; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning; `npm.cmd run storage:cost-report` passed.
- Guardrail: default provider remains `local_repository`; no Supabase bucket, external provider, migration, deletion, or production cutover was performed.

## 2026-06-10 Phase 1B Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: download / preview / release source file read provider boundary。
- Delivery: added `storageKeyFromLocalPath(...)` in `src/lib/file-storage.ts` to bridge existing `submission_files.local_path` metadata into provider-safe storage keys.
- Delivery: updated `src/lib/file-response.ts` so submission file download and PDF preview reads use `createFileStorageService().readObject(storageKey)` instead of direct `fs.readFile`.
- Delivery: updated `src/lib/release-package-async.ts` and `src/lib/release-package.ts` so release package creation reads submission source files through `FileStorageService` and verifies hashes through the shared `sha256(...)` helper.
- QC expansion: `scripts/qc-file-storage-contract.mjs` now checks file-response, sync release package, and async release package storage-service usage.
- Verification: `npm.cmd run qc:file-storage-contract` passed 19/19; `npm.cmd run qc:file-storage-cost-report` passed 12/12; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning; `npm.cmd run storage:cost-report` passed.
- Guardrail: release package zip output remains under `data/release-packages`; this slice only moves source file reads to the storage service boundary. No Supabase bucket, external provider, migration, deletion, or production cutover was performed.

## 2026-06-10 Phase 1C Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: release package zip body and master attachment provider boundary。
- Delivery: added `createReleasePackageStorageService(...)` and `getReleasePackageRoot(...)` in `src/lib/file-storage.ts`, backed by the same local adapter while scoped to `data/release-packages`.
- Delivery: updated `src/lib/release-package.ts` and `src/lib/release-package-async.ts` so release package zip output uses `packageStorage.putObject(...)`; `release_packages.local_path` remains populated from the stored local path.
- Delivery: updated `src/lib/release-package-file.ts` so release package downloads read zip bytes through `createReleasePackageStorageService().readObject(...)` after root-boundary validation.
- Delivery: updated `src/lib/repositories/master-attachment-repository.ts` so master attachment save/read uses `createFileStorageService().putObject(...)` / `readObject(...)`, shared `sha256(...)`, and existing `storage_key` metadata; `original_path` remains available for Google Drive sync compatibility.
- QC expansion: `scripts/qc-file-storage-contract.mjs` now checks 29 storage-boundary rules covering upload, file response, release package source reads, release package zip reads/writes, and master attachment reads/writes.
- Verification: `npm.cmd run qc:file-storage-contract` passed 29/29; `npm.cmd run qc:file-storage-cost-report` passed 12/12; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with an existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`; `npm.cmd run storage:cost-report` passed.
- Guardrail: no Supabase bucket, external provider, migration, deletion, lifecycle rule, signed URL change, or production cutover was performed.

## 2026-06-10 Phase 2A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: metadata normalization model first slice。
- Delivery: added `scripts/storage-metadata-normalizer.mjs` to normalize `submission_files`, `release_packages`, and `file_assets` into one read-only storage object descriptor shape: source, provider, lifecycle tier, linked entity, filename, extension, bytes, hash, storage key, local path, and local root.
- Delivery: updated `scripts/generate-file-storage-cost-report.mjs` to use the shared normalizer and to summarize `metadata.byLifecycleTier`.
- Delivery: updated `scripts/qc-file-storage-cost-report.mjs` so the fixture places release package zip files under `data/release-packages`, verifies release-package-root storage keys, and expands cost-report QC from 12 to 14 checks.
- Verification: `npm.cmd run qc:file-storage-cost-report` passed 14/14; `npm.cmd run qc:file-storage-contract` passed 29/29; `node --check scripts/storage-metadata-normalizer.mjs` passed; `node --check scripts/generate-file-storage-cost-report.mjs` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`; `npm.cmd run storage:cost-report` passed and reported metadata count 0 / repository scanned file count 0.
- Guardrail: this slice does not create or migrate a `storage_objects` table, does not mutate DB rows, does not move files, and does not change any provider pointer.

## 2026-06-10 Phase 2B Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: duplicate / orphan / hash mismatch read-only local object audit。
- Delivery: updated `scripts/generate-file-storage-cost-report.mjs` with `localObjectAudit`, scanning both `data/repository` and `data/release-packages` roots.
- Delivery: `localObjectAudit` now reports missing local objects, SHA-256 hash mismatches, orphan local files, scanned root summaries, and combined local-root threshold usage.
- Delivery: recommendations now explicitly block provider migration when hash mismatches exist and ask for orphan local file review before lifecycle cleanup or migration.
- QC expansion: `scripts/qc-file-storage-cost-report.mjs` now covers valid duplicate hash groups, missing metadata targets, hash mismatch targets, orphan local files, release package root scanning, and all-local-roots threshold usage.
- Verification: `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-contract` passed 29/29; `node --check scripts/generate-file-storage-cost-report.mjs` passed; `node --check scripts/qc-file-storage-cost-report.mjs` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`; `npm.cmd run storage:cost-report` passed and reported metadata count 0 / repository scanned file count 0 / release package root missing.
- Guardrail: this slice is read-only; it does not delete orphan files, repair hashes, mutate metadata, run migration, or alter provider pointers.

## 2026-06-10 Phase 3A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: migration dry-run first slice。
- Delivery: added `scripts/generate-file-storage-migration-dry-run.mjs` to produce a read-only migration plan from normalized storage metadata.
- Delivery: added `npm.cmd run storage:migration-dry-run`; default target is `supabase_storage` bucket `pdm-hot` prefix `ai-pdm`, configurable through `PDM_STORAGE_DRY_RUN_TARGET_PROVIDER`, `PDM_STORAGE_DRY_RUN_TARGET_BUCKET`, and `PDM_STORAGE_DRY_RUN_TARGET_PREFIX`.
- Delivery: dry-run classifies metadata objects into `planned`, `blocked`, and `skipped`; valid local objects include target key and pointer preview; missing files, path escapes, missing hashes, and SHA-256 mismatches are blocked; already non-local provider rows are skipped.
- Delivery: added `scripts/qc-file-storage-migration-dry-run.mjs` and `npm.cmd run qc:file-storage-migration-dry-run`.
- Verification: `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-contract` passed 29/29; `node --check scripts/generate-file-storage-migration-dry-run.mjs` passed; `node --check scripts/qc-file-storage-migration-dry-run.mjs` passed; `npm.cmd run storage:migration-dry-run` passed and reported total metadata objects 0 / planned 0 / blocked 0 / skipped 0; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: dry-run is read-only and states `noProviderMigrationExecuted`, `noFilesCopied`, `noFilesDeleted`, and `noMetadataPointersUpdated`; it does not require target credentials and does not call a provider SDK.

## 2026-06-10 Phase 3B Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: provider registry / Supabase Storage adapter contract。
- Delivery: expanded `src/lib/file-storage.ts` provider registry to include `supabase_storage` while keeping `createFileStorageService()` defaulted to `LocalRepositoryStorageAdapter`.
- Delivery: added `createConfiguredFileStorageService(...)`, `resolveFileStorageProvider(...)`, `resolveSupabaseStorageConfig(...)`, and `SupabaseStorageAdapter`.
- Delivery: Supabase config uses server-only `PDM_SUPABASE_URL`, `PDM_SUPABASE_SERVICE_ROLE_KEY`, `PDM_SUPABASE_STORAGE_BUCKET`, and rejects `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Delivery: Supabase live object IO is fail-closed unless `PDM_SUPABASE_STORAGE_LIVE_ENABLED=1`; delete remains disabled until lifecycle and rollback gates are implemented.
- Delivery: `scripts/qc-file-storage-contract.mjs` expanded to 42 static contract checks covering provider registry, default local behavior, Supabase server-only config, authenticated private object reads, non-upsert writes, provider-scoped pointers, and fail-closed delete.
- Verification: `npm.cmd run qc:file-storage-contract` passed 42/42; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run storage:cost-report` passed with metadata count 0; `npm.cmd run storage:migration-dry-run` passed with total metadata objects 0 / planned 0 / blocked 0 / skipped 0; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: no Supabase bucket was created, no provider cutover was performed, no credentials were required, no file was copied, no metadata pointer was updated, and production storage remains local by default.

## 2026-06-10 Phase 3C Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: download access / signed URL policy contract。
- Source checked: Supabase docs confirm private bucket assets are accessed only by server-signed time-limited URLs or authenticated object requests; JS reference documents `createSignedUrl(path, expiresIn)` and `download` option.
- Delivery: `src/lib/file-storage.ts` added `CreateDownloadUrlInput`, `DownloadUrl`, and `createDownloadUrl(...)` to `FileStorageService`.
- Delivery: `LocalRepositoryStorageAdapter.createDownloadUrl(...)` returns `mode: "server_stream"`, `url: null`, `authorizationHeaderRequired: true`, and `auditRequired: true`, preserving server-side download/preview behavior.
- Delivery: `SupabaseStorageAdapter.createDownloadUrl(...)` uses the Supabase object signing path, produces `mode: "signed_url"`, accepts both `signedURL` and `signedUrl` response casing, supports explicit download filename, and returns an absolute storage URL.
- Delivery: Supabase signed URL TTL defaults to `PDM_SUPABASE_SIGNED_URL_TTL_SECONDS=300` and is clamped by `PDM_SUPABASE_SIGNED_URL_MAX_TTL_SECONDS=3600` unless configured otherwise.
- Delivery: Supabase signed URL creation remains fail-closed behind `PDM_SUPABASE_STORAGE_LIVE_ENABLED=1`.
- Delivery: `scripts/qc-file-storage-contract.mjs` expanded from 42 to 52 checks, covering download contract, local server-stream mode, audit-required access, Supabase signed URL mode, TTL env/default clamp, explicit download flag, and signed URL response casing.
- Verification: `npm.cmd run qc:file-storage-contract` passed 52/52; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run storage:cost-report` passed with metadata count 0 / repository scanned file count 0; `npm.cmd run storage:migration-dry-run` passed with total metadata objects 0 / planned 0 / blocked 0 / skipped 0; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: no browser-facing storage secret was introduced; no live Supabase request was made; no bucket was created; no file was copied, deleted, or migrated; route-level audit writing remains a later slice.

## 2026-06-10 Phase 3D Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: route-level storage access audit for authenticated downloads。
- Delivery: added `src/lib/storage-access-audit.ts` with `auditStorageAccess(...)`, writing `StorageAccessed` audit details for access kind, file id, filename, bytes, provider, bucket, storage key, access mode, TTL metadata, authorization-header policy, and route.
- Delivery: updated `/api/submissions/[id]/files/[...filePath]` so authenticated file download and PDF preview call `createFileStorageService().createDownloadUrl(...)` and write `submission_file` / `submission_file_preview` audit evidence before returning the existing server-streamed response.
- Delivery: updated `/api/submissions/[id]/release-package` so release package download derives `getReleasePackageStorageKey(...)`, calls `createReleasePackageStorageService().createDownloadUrl(...)`, and writes `release_package` audit evidence before returning the existing zip response.
- Delivery: `scripts/qc-file-storage-contract.mjs` expanded from 52 to 66 checks, covering storage access audit helper behavior, omission of signed URL values from audit detail, submission file route audit wiring, release package route audit wiring, and storage key propagation.
- Verification: `npm.cmd run qc:file-storage-contract` passed 66/66; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: production storage remains local by default; no Supabase bucket was created; no credential was used; no live Supabase request was made; no file was copied, deleted, or migrated; signed URL values are not stored in audit detail; public share / supplier share audit remains a later slice.

## 2026-06-10 Phase 3E Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: public share package storage access audit and token scope evidence。
- Delivery: extended `src/lib/storage-access-audit.ts` so `StorageAccessed` supports `public_share_package`, nullable actor id for external token access, `shareId`, and `externalAccess` metadata.
- Delivery: updated `/api/public/shares/[token]/package` so supplier/public package download derives `getReleasePackageStorageKey(...)`, calls `createReleasePackageStorageService().createDownloadUrl(...)` with `purpose: "supplier_share"`, and writes audit evidence before returning the existing zip response.
- Delivery: public share audit records `shareId`, provider, bucket, storage key, access mode, TTL metadata, bytes, filename, route, and external access flag; raw share token and token hash are not written to audit detail.
- Delivery: `scripts/qc-file-storage-contract.mjs` expanded from 66 to 75 checks, covering public share package kind, anonymous external actor support, share scope metadata, public route audit wiring, supplier-share purpose, raw-token omission, and storage key propagation.
- Verification: `npm.cmd run qc:file-storage-contract` passed 75/75; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: production storage remains local by default; response remains server-streamed; no Supabase bucket was created; no credential was used; no live Supabase request was made; no file was copied, deleted, or migrated; supplier response POST remains unchanged because it does not download file bytes.

## 2026-06-10 Phase 4A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: `StorageAccessed` egress analytics report。
- Delivery: added `scripts/generate-file-storage-egress-report.mjs`, a read-only JSON report that scans `audit_logs` action `StorageAccessed` and summarizes audited egress by access kind, route, provider, access mode, external/authenticated access, share id, and top provider-scoped objects.
- Delivery: added `npm.cmd run storage:egress-report`; current local report runs successfully against `data/ai-pdm.sqlite`, finds 0 `StorageAccessed` rows, and recommends observation mode until real downloads exist.
- Delivery: added `scripts/qc-file-storage-egress-report.mjs` and `npm.cmd run qc:file-storage-egress-report`; fixture covers authenticated download, preview, release package, public share package, signed URL metadata, malformed audit rows, threshold usage, provider-scoped object aggregation, and public-share shareId aggregation.
- Guardrail: egress report does not read file bytes, does not call any storage provider, does not execute migration, does not require credentials, does not output signed URL values, and does not output raw share tokens or token hashes even when fixture audit detail contains those fields.
- Verification: `npm.cmd run qc:file-storage-egress-report` passed 18/18; `npm.cmd run qc:file-storage-contract` passed 75/75; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-10 Phase 4B Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: monthly PM/QC storage cost and egress evidence package。
- Delivery: added `scripts/generate-file-storage-monthly-evidence.mjs`, which combines the storage cost inventory and `StorageAccessed` egress audit into one monthly evidence object with summary metrics, readiness blockers, warnings, threshold usage, and merged `[storage]` / `[egress]` recommendations.
- Delivery: added `npm.cmd run storage:monthly-evidence`; the CLI writes `storage-monthly-evidence.json` and `storage-monthly-evidence.md` for the selected `--period`, with default output under the report root and support for explicit `--output`.
- Delivery: added `scripts/qc-file-storage-monthly-evidence.mjs` and `npm.cmd run qc:file-storage-monthly-evidence`; fixture covers embedded cost and egress reports, public share bytes, migration readiness blockers, Markdown review sections, written files, and token / signed URL redaction.
- Guardrail: monthly evidence is read-only; it does not migrate providers, delete files, require provider credentials, call storage providers, expose signed URL values, or expose raw share tokens / token hashes.
- Verification: `npm.cmd run qc:file-storage-monthly-evidence` passed 15/15; `node --check scripts/generate-file-storage-monthly-evidence.mjs` passed; `node --check scripts/qc-file-storage-monthly-evidence.mjs` passed; `npm.cmd run storage:monthly-evidence -- --period 2026-06 --output <temp>` passed and wrote JSON / Markdown outputs; `npm.cmd run qc:file-storage-egress-report` passed 18/18; `npm.cmd run qc:file-storage-cost-report` passed 18/18; `npm.cmd run qc:file-storage-contract` passed 75/75; `npm.cmd run qc:file-storage-migration-dry-run` passed 14/14; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-10 Phase 4C Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: scheduled monthly evidence runner and Windows Task Scheduler handoff。
- Delivery: added `scripts/run-file-storage-monthly-evidence-schedule.mjs`, a schedule-friendly wrapper around the monthly evidence generator that writes `storage-monthly-evidence.json`, `storage-monthly-evidence.md`, `storage-monthly-evidence-run.json`, and a latest manifest pointer.
- Delivery: added `npm.cmd run storage:monthly-evidence:scheduled`; it supports `--period`, `--output`, `--latest-output`, `--no-latest`, `--fail-on-blocker`, and `--fail-on-warning` so CI or scheduled jobs can decide whether storage blockers should raise a nonzero exit code.
- Delivery: added `scripts/install-storage-monthly-evidence-task.ps1` and `npm.cmd run storage:monthly-evidence:install-task` to register a monthly Windows Scheduled Task for the storage evidence runner.
- Delivery: added `scripts/qc-file-storage-monthly-evidence-schedule.mjs` and `npm.cmd run qc:file-storage-monthly-evidence-schedule`; fixture covers blocked readiness, nonzero suggested exit policy, latest manifest writing, command manifest, raw token redaction, signed URL redaction, provider-request guardrails, and installer wiring.
- Guardrail: the scheduled runner remains read-only; it does not migrate providers, delete files, alter pointers, create buckets, call storage providers, or expose signed URLs / raw share tokens / token hashes.
- Verification: `npm.cmd run qc:file-storage-monthly-evidence-schedule` passed 13/13; `node --check scripts/run-file-storage-monthly-evidence-schedule.mjs` passed; `node --check scripts/qc-file-storage-monthly-evidence-schedule.mjs` passed; `npm.cmd run storage:monthly-evidence:scheduled -- --period 2026-06 --output <temp> --latest-output <temp>` passed and wrote evidence / run / latest manifests; local run status was `warning` because the current local DB has no real `StorageAccessed` rows yet.

## 2026-06-11 Phase 4D Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: storage evidence dashboard API and notification alert source。
- Delivery: added `src/lib/storage-evidence-dashboard.ts`, which reads the scheduled runner latest manifest and returns a redacted dashboard summary with status, severity, readiness, threshold usage, next actions, and evidence file pointers.
- Delivery: added `/api/storage/evidence` as a manager/admin-only endpoint for dashboard consumers; it does not expose full cost / egress report payloads.
- Delivery: extended `/api/notifications` so `Admin` and `R&D Manager` receive a `storage_evidence_alert` notification derived from the latest storage evidence status; `Engineer` remains scoped out of platform-level storage cost alerts.
- Delivery: added `scripts/qc-file-storage-evidence-dashboard.mjs` and `npm.cmd run qc:file-storage-evidence-dashboard`; fixture covers latest manifest parsing, missing-manifest controlled empty state, severity mapping, readiness blockers, next actions, redaction, API role scope, notification kind, and package script registration.
- Guardrail: dashboard / notification source is read-only; it does not run scheduled evidence generation, migrate providers, delete files, update metadata pointers, create buckets, call storage providers, or expose signed URL values / raw share tokens / token hashes.
- Verification: `npm.cmd run qc:file-storage-evidence-dashboard` passed 13/13; `node --check scripts/qc-file-storage-evidence-dashboard.mjs` passed; `npx.cmd tsc --noEmit` passed.

## 2026-06-11 Phase 4E Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: dashboard storage evidence panel and UI smoke validation。
- Delivery: added a dashboard `Storage Evidence` panel in `src/components/dashboard.tsx`, visible only to `Admin` / `R&D Manager`, backed by `/api/storage/evidence`.
- Delivery: panel shows redacted monthly evidence status, storage GB, audited egress GB, blocker / warning counts, threshold usage, duplicate recoverable bytes, object counts, missing-local count, hash mismatch count, public-share egress, and primary next action.
- Delivery: added responsive CSS in `src/app/globals.css` for the panel; mobile layout collapses to one column and keeps action controls within viewport.
- Delivery: expanded `scripts/qc-file-storage-evidence-dashboard.mjs` from 13 to 17 checks, adding dashboard UI wiring, manager/admin scope, and frontend redaction assertions.
- Guardrail: frontend consumes only the redacted dashboard API; it does not import full cost / egress report payloads, expose `rawToken` / `signedUrl`, call storage providers, migrate files, delete files, or update metadata pointers.
- Verification: `npm.cmd run qc:file-storage-evidence-dashboard` passed 17/17; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Verification: storage regression gates passed: `qc:file-storage-monthly-evidence-schedule` 13/13, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-egress-report` 18/18, `qc:file-storage-cost-report` 18/18, `qc:file-storage-contract` 75/75, `qc:file-storage-migration-dry-run` 14/14, and `qc:doc-paths` 23/23.
- Verification: Playwright smoke on port 3001 as `manager@example.com` confirmed `.storage-evidence-panel` visible at 1440x1000 and 390x920 with no horizontal overflow; screenshots were written to `%TEMP%\ai-pdm-storage-evidence-desktop.png` and `%TEMP%\ai-pdm-storage-evidence-mobile.png`; the temporary 3001 dev server was stopped.

## 2026-06-11 Phase 4F Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: storage archive restore drill and checksum evidence。
- Delivery: added `scripts/generate-file-storage-archive-restore-drill.mjs`, which reads normalized storage metadata, selects eligible `local_repository` objects, copies them to an isolated restore target, recalculates SHA-256, and returns restored / blocked / skipped evidence.
- Delivery: added `storage:archive-restore-drill`; with `--output <dir>` it writes `storage-archive-restore-drill.json` and `storage-archive-restore-drill.md` plus the isolated restore target.
- Delivery: added `scripts/qc-file-storage-archive-restore.mjs` and `qc:file-storage-archive-restore`; fixture covers valid submission file restore, release package restore, missing object block, hash mismatch block, remote provider skip, source-file preservation, hash verification, JSON / Markdown output, secret redaction, and package script registration.
- Guardrail: archive restore drill is not provider migration; it does not update metadata pointers, delete source files, create buckets, call Supabase / S3 providers, require provider credentials, or restore into production paths.
- Verification: `npm.cmd run qc:file-storage-archive-restore` passed 15/15.
- Verification: `npm.cmd run storage:archive-restore-drill -- --output <temp>` passed and wrote JSON / Markdown outputs; current local DB has 0 storage metadata objects, so the live local summary restored 0 objects while preserving controlled empty-state evidence.
- Verification: `node --check scripts/generate-file-storage-archive-restore-drill.mjs` and `node --check scripts/qc-file-storage-archive-restore.mjs` passed.
- Verification: regression gates passed: `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-monthly-evidence-schedule` 13/13, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-egress-report` 18/18, `qc:file-storage-cost-report` 18/18, `qc:file-storage-contract` 75/75, `qc:file-storage-migration-dry-run` 14/14, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4G Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: migration execute / verify / rollback runbook package。
- Delivery: added `scripts/generate-file-storage-migration-runbook.mjs`, which wraps the existing dry-run report into a runbook-only package with readiness gates, execution checklist, verification checklist, rollback checklist, planned batches, and pointer rollback plan.
- Delivery: added `storage:migration-runbook`; with `--output <dir>` it writes `storage-migration-runbook.json`, `storage-migration-runbook.md`, and `storage-migration-pointer-rollback-plan.json`.
- Delivery: added `scripts/qc-file-storage-migration-runbook.mjs` and `qc:file-storage-migration-runbook`; fixture covers planned / blocked / skipped objects, readiness blockers, batch size, pointer rollback entries, output files, guardrails, and no-secret output.
- Safety boundary: this slice does not execute provider migration, does not copy files, does not delete files, does not call Supabase / S3-compatible provider, and does not update metadata pointers.
- Verification: `node --check scripts/generate-file-storage-migration-runbook.mjs` and `node --check scripts/qc-file-storage-migration-runbook.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-migration-runbook` passed 24/24.
- Verification: `npm.cmd run storage:migration-runbook -- --output <temp>` passed and wrote JSON / Markdown / pointer rollback plan outputs; current local DB has 0 storage metadata objects, so the live local summary planned 0 / blocked 0 / skipped 0 and remained `readyToExecute=false`.
- Verification: regression gates passed: `qc:file-storage-archive-restore` 15/15, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-contract` 75/75, `qc:file-storage-cost-report` 18/18, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4H Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: controlled migration execution / verify / rollback gate。
- Delivery: added `scripts/generate-file-storage-migration-execution-gate.mjs`, which consumes the migration runbook and remains disabled unless `PDM_STORAGE_MIGRATION_EXECUTE_ENABLED=1` and `--confirm-staging` are both present.
- Delivery: added `storage:migration-execution-gate`; with `--output <dir>` it writes `storage-migration-execution-gate.json` and `storage-migration-execution-gate.md`.
- Delivery: the only executable target mode is `local_staging_directory`, so QC can prove copy / hash verify / rollback source verification without calling Supabase or any S3-compatible provider.
- Delivery: added `scripts/qc-file-storage-migration-execution-gate.mjs` and `qc:file-storage-migration-execution-gate`; fixture covers default disabled behavior, blocker refusal, successful local staging copy, hash verification, rollback source verification, source preservation, output files, no provider requests, no metadata pointer updates, and no-secret output.
- Safety boundary: this slice does not execute live provider migration, does not delete files, does not call Supabase / S3-compatible provider, and does not update metadata pointers.
- Verification: `node --check scripts/generate-file-storage-migration-execution-gate.mjs`, `node --check scripts/qc-file-storage-migration-execution-gate.mjs`, and `node --check scripts/generate-file-storage-migration-runbook.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-migration-execution-gate` passed 19/19.
- Verification: `npm.cmd run storage:migration-execution-gate -- --output <temp>` passed in default disabled mode; current local DB has 0 storage metadata objects, copied 0, and no metadata pointer updates.
- Verification: regression gates passed: `qc:file-storage-migration-runbook` 24/24, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-archive-restore` 15/15, `qc:file-storage-contract` 75/75, `qc:file-storage-cost-report` 18/18, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4I Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: S3-compatible dry-run / adapter contract。
- Delivery: extended `src/lib/file-storage.ts` with `s3_compatible` provider resolution, `S3CompatibleStorageConfig`, `S3CompatibleStorageAdapter`, server-only credential env guard, provider profile validation, and fail-closed live IO behavior.
- Delivery: added `scripts/generate-file-storage-s3-compatible-dry-run.mjs` and `storage:s3-compatible-dry-run`; it produces S3-compatible target profiles for Cloudflare R2 / AWS S3 / Backblaze B2 / Wasabi / NAS gateway without provider requests or credentials.
- Delivery: added `scripts/qc-file-storage-s3-compatible-dry-run.mjs` and `qc:file-storage-s3-compatible-dry-run`; fixture covers Cloudflare R2 target path, planned / blocked / skipped objects, S3-compatible pointer URI, required server env names, pointer rollback plan retention, output files, adapter contract, and no-secret output.
- Delivery: expanded `qc:file-storage-contract` to include S3-compatible provider registration, adapter contract, server-only env guard, default live IO disablement, and provider-scoped pointer scheme.
- Safety boundary: this slice does not call Cloudflare R2, AWS S3, Backblaze B2, Wasabi, NAS gateway, Supabase, or any S3-compatible endpoint; it does not copy files, delete files, or update metadata pointers.
- Verification: `node --check scripts/generate-file-storage-s3-compatible-dry-run.mjs` and `node --check scripts/qc-file-storage-s3-compatible-dry-run.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-s3-compatible-dry-run` passed 19/19.
- Verification: `npm.cmd run storage:s3-compatible-dry-run -- --profile cloudflare_r2 --output <temp>` passed and wrote JSON / Markdown outputs; current local DB has 0 storage metadata objects, so the live local summary planned 0 / blocked 0 / skipped 0 while preserving controlled empty-state evidence.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-migration-execution-gate` 19/19, `qc:file-storage-migration-runbook` 24/24, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-cost-report` 18/18, `qc:file-storage-archive-restore` 15/15, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4J Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: lifecycle / retention / upload-size policy dry-run。
- Delivery: added `scripts/generate-file-storage-lifecycle-policy-dry-run.mjs` and `storage:lifecycle-policy-dry-run`; it classifies normalized storage metadata against draft retention, warm / cold age thresholds, upload size limits, storage threshold usage, released official protection, and lifecycle cleanup blockers.
- Delivery: added `scripts/qc-file-storage-lifecycle-policy-dry-run.mjs` and `qc:file-storage-lifecycle-policy`; fixture covers stale draft review, released file and release package protection, cold archive candidate detection, upload size warning, storage threshold status, missing / hash mismatch blockers, output files, and no-secret output.
- Safety boundary: this slice is read-only; it does not delete files, update metadata pointers, apply provider lifecycle rules, or call Supabase / S3-compatible providers.
- Verification: `node --check scripts/generate-file-storage-lifecycle-policy-dry-run.mjs` and `node --check scripts/qc-file-storage-lifecycle-policy-dry-run.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-lifecycle-policy` passed 16/16.
- Verification: `npm.cmd run storage:lifecycle-policy-dry-run -- --output <temp>` passed and wrote JSON / Markdown outputs; current local DB has 0 storage metadata objects, so the live local summary found no action candidates and preserved controlled empty-state evidence.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-s3-compatible-dry-run` 19/19, `qc:file-storage-migration-execution-gate` 19/19, `qc:file-storage-migration-runbook` 24/24, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-cost-report` 18/18, `qc:file-storage-archive-restore` 15/15, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4K Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: provider-neutral storage metadata model blueprint / QC。
- Delivery: added `scripts/storage-metadata-model.mjs` with a non-applied blueprint for `storage_providers`, `storage_objects`, and `storage_object_references`, plus descriptor validation, object reference preview, and SHA-256 deduplication preview helpers.
- Delivery: added `scripts/qc-file-storage-metadata.mjs` and `qc:file-storage-metadata`; fixture covers legacy `j_drive` alias normalization to `local_repository`, future provider passthrough such as `cloudflare_r2`, required descriptor fields, release package role protection, reference preview, dedup preview, cold lifecycle descriptor mapping, package script registration, and no-secret output.
- Delivery: updated `scripts/storage-metadata-normalizer.mjs` so legacy `j_drive` / `local` provider values normalize to `local_repository` while unknown future provider ids pass through without enum changes.
- Safety boundary: this slice does not apply a DB migration, does not create runtime `storage_objects` tables, does not mutate metadata pointers, does not move files, and does not call Supabase / S3-compatible providers.
- Verification: `node --check scripts/storage-metadata-model.mjs`, `node --check scripts/qc-file-storage-metadata.mjs`, and `node --check scripts/storage-metadata-normalizer.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-metadata` passed 18/18.
- Verification: `npm.cmd run storage:cost-report -- --out <temp>/storage-cost-report.json` passed; current local DB has 0 storage metadata objects and preserved controlled empty-state evidence.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-s3-compatible-dry-run` 19/19, `qc:file-storage-lifecycle-policy` 16/16, `qc:file-storage-cost-report` 18/18, `qc:file-storage-migration-execution-gate` 19/19, `qc:file-storage-migration-runbook` 24/24, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-archive-restore` 15/15, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4L Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: SHA-256 deduplication reference dry-run。
- Delivery: added `scripts/generate-file-storage-dedup-reference-dry-run.mjs` and `storage:dedup-reference-dry-run`; it groups normalized metadata by provider + SHA-256, chooses a conservative canonical object, builds future `storage_object_references` previews, estimates recoverable bytes, and blocks groups with missing files, outside-root paths, missing SHA-256, unsupported hash algorithm, or hash mismatch.
- Delivery: added `scripts/qc-file-storage-dedup-reference.mjs` and `qc:file-storage-dedup-reference`; fixture covers local duplicate groups, release package canonical preference, remote metadata-only duplicate groups, missing-file blockers, no-hash skips, JSON / Markdown outputs, package scripts, and no-secret output.
- Safety boundary: this slice is read-only; it does not apply schema migrations, create runtime `storage_objects`, delete files, merge objects, update metadata pointers, or call Supabase / S3-compatible providers.
- Verification: `node --check scripts/generate-file-storage-dedup-reference-dry-run.mjs` and `node --check scripts/qc-file-storage-dedup-reference.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-dedup-reference` passed 17/17.
- Verification: `npm.cmd run storage:dedup-reference-dry-run -- --output <temp>` passed and wrote JSON / Markdown outputs; current local DB has 0 storage metadata objects, so it preserved controlled empty-state evidence.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-metadata` 18/18, `qc:file-storage-cost-report` 18/18, `qc:file-storage-lifecycle-policy` 16/16, `qc:file-storage-s3-compatible-dry-run` 19/19, `qc:file-storage-migration-dry-run` 14/14, `qc:file-storage-migration-runbook` 24/24, `qc:file-storage-migration-execution-gate` 19/19, `qc:file-storage-archive-restore` 15/15, `qc:file-storage-evidence-dashboard` 17/17, `qc:file-storage-egress-report` 18/18, `qc:file-storage-monthly-evidence` 15/15, `qc:file-storage-monthly-evidence-schedule` 13/13, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4M Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: runtime upload-size policy gate。
- Delivery: added `src/lib/storage-upload-policy.ts` with a shared 50 MiB default, `PDM_MAX_UPLOAD_FILE_BYTES` byte override, `PDM_STORAGE_MAX_UPLOAD_MB` cost-policy fallback, master-attachment scoped override, and `file_too_large` validator output.
- Delivery: updated `src/app/api/submissions/route.ts`, `src/lib/config.ts`, and `src/lib/repositories/master-attachment-repository.ts` to use the shared upload policy instead of parsing upload-size env values in multiple places.
- Delivery: added `scripts/qc-file-storage-upload-policy.mjs` and `qc:file-storage-upload-policy`; QC covers default behavior, env precedence, MB fallback, invalid env fallback, attachment override, validator behavior, runtime wiring, package script registration, and no-secret output.
- Safety boundary: this slice does not change provider storage, create buckets, execute migration, delete files, enable Admin override workflow, or introduce an alternate large-file upload path; it only centralizes runtime gate policy.
- Verification: `node --check scripts/qc-file-storage-upload-policy.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-policy` passed 14/14.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-lifecycle-policy` 16/16, `qc:file-storage-metadata` 18/18, `qc:file-storage-dedup-reference` 17/17, `qc:file-storage-cost-report` 18/18, and `qc:access-control-async-repository` 169/169.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4N Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: large-file upload decision gate。
- Delivery: extended `src/lib/storage-upload-policy.ts` with `DEFAULT_STORAGE_LARGE_FILE_THRESHOLD_BYTES`, `PDM_STORAGE_LARGE_FILE_THRESHOLD_MB`, large-file threshold clamping, and upload dispositions: `normal_upload`, `admin_override_required`, and `alternate_large_file_path_required`.
- Delivery: updated `src/app/api/submissions/route.ts` so validation failures include ASCII `storage_upload_decision=...` detail records for files above the configured upload limit.
- Delivery: updated `.env.example` and `README.md` with `PDM_STORAGE_LARGE_FILE_THRESHOLD_MB=500`.
- Delivery: expanded `scripts/qc-file-storage-upload-policy.mjs` / `qc:file-storage-upload-policy` from 14 to 23 checks, covering default 500 MiB threshold, env override, clamping, admin override classification, alternate large-file path classification, actionable decision filtering, route detail emission, package registration, and no-secret output.
- Safety boundary: this slice still does not allow bypassing the upload limit, does not implement Admin approval execution, does not create an alternate upload executor, does not create buckets, and does not call Supabase / S3-compatible providers.
- Verification: `node --check scripts/qc-file-storage-upload-policy.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-policy` passed 23/23.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81, `qc:file-storage-lifecycle-policy` 16/16, `qc:file-storage-cost-report` 18/18, and `qc:access-control-async-repository` 169/169.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4O Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: controlled Admin upload override gate。
- Delivery: updated `src/lib/validation.ts` so oversized-file validation can be bypassed only when the caller explicitly passes `{ allowOversizedFiles: true }`.
- Delivery: updated `src/app/api/submissions/route.ts` to accept `storage_upload_override` and `storage_upload_override_reason`, restrict approval to `Admin`, require a 10-300 character reason, and reject override when any file is classified as `alternate_large_file_path_required`.
- Delivery: updated `src/lib/repositories/submission-write-async-repository.ts` so approved override evidence is included in the `Submit` audit detail as `storageUploadOverride` with approver, reason, thresholds, and affected files.
- Delivery: expanded `scripts/qc-file-storage-upload-policy.mjs` / `qc:file-storage-upload-policy` from 23 to 31 checks, covering controlled oversized validation, route form fields, Admin-only enforcement, reason requirement, alternate large-file blocking, audit forwarding, repository input contract, and no-secret output.
- Safety boundary: this slice does not create an alternate large-file upload executor, does not create buckets, does not call Supabase / S3-compatible providers, and does not loosen large-file threshold handling.
- Verification: `node --check scripts/qc-file-storage-upload-policy.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-policy` passed 31/31.
- Verification: regression gates passed: `qc:file-storage-contract` 81/81 and `qc:access-control-async-repository` 169/169.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4P Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: alternate large-file intake package。
- Delivery: extended `src/lib/storage-upload-policy.ts` with `getAlternateLargeFileIntakePackage(...)`, `AlternateLargeFileIntakePackage`, required metadata contract, provider profile hints, next steps, and guardrails for files classified as `alternate_large_file_path_required`.
- Delivery: updated `src/app/api/submissions/route.ts` so large-file validation failures also emit ASCII `large_file_intake_required=true` detail records with package version, intake action, audit action, required metadata, and allowed provider profiles.
- Delivery: expanded `scripts/qc-file-storage-upload-policy.mjs` / `qc:file-storage-upload-policy` from 31 to 35 checks, covering threshold-only package generation, metadata contract, empty package behavior for normal/Admin-override files, and route detail emission.
- Safety boundary: this slice does not upload, copy, register, migrate, delete, or create external storage objects; it only creates an intake contract for a later NAS / S3-compatible / Supabase staging executor.
- Verification: `node --check scripts/qc-file-storage-upload-policy.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-policy` passed 35/35.
- Verification: `npm.cmd run qc:file-storage-contract` passed 81/81 and `npm.cmd run qc:access-control-async-repository` passed 169/169.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4Q Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: external large-file registration contract。
- Delivery: added `src/lib/external-large-file-intake.ts` with `EXTERNAL_LARGE_FILE_INTAKE_CONTRACT_VERSION`, required metadata validation, provider profile validation, SHA-256 validation, threshold validation, object/reference metadata builders, and audit detail redaction for raw `sourcePath`.
- Delivery: added `src/lib/repositories/external-large-file-intake-async-repository.ts` with provider-neutral `storage_objects` upsert, `storage_object_references` upsert, and append-only `LargeFileIntakeRegistered` audit contract.
- Delivery: added `src/lib/external-large-file-intake-async.ts` runtime helper and `scripts/qc-external-large-file-intake.mjs` / `qc:external-large-file-intake`.
- Safety boundary: this slice does not apply a DB migration, create runtime tables, upload/copy/delete files, call Supabase / S3-compatible providers, create signed URLs, or expose raw source paths in audit detail.
- Verification: `node --check scripts/qc-external-large-file-intake.mjs` passed.
- Verification: `npm.cmd run qc:external-large-file-intake` passed 15/15, covering valid/invalid registration input, provider allow-list, SHA-256, large-file threshold, object/reference/audit semantic insert, duplicate upsert behavior, no-secret audit output, PM evidence, and no live provider IO.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:file-storage-upload-policy` passed 35/35; `npm.cmd run qc:file-storage-contract` passed 81/81; `npm.cmd run qc:access-control-async-repository` passed 169/169; `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4R Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: storage schema migration proposal package。
- Delivery: added `scripts/generate-file-storage-schema-migration-package.mjs` and `storage:schema-migration-package`; it emits JSON, Markdown, and `storage-schema-migration-proposal.sql` for `storage_providers`, `storage_objects`, and `storage_object_references`.
- Delivery: proposal SQL aligns with Phase 4Q repository columns, seeds baseline provider rows, preserves provider-neutral uniqueness, adds dedup/reference indexes, enables RLS, and revokes anon/authenticated/PUBLIC table privileges.
- Delivery: added `scripts/qc-file-storage-schema-migration-package.mjs` and `qc:file-storage-schema-migration-package`.
- Safety boundary: this slice does not apply a DB migration, does not write into `db/postgres` or `supabase/migrations`, does not create runtime tables, does not call Supabase/S3/NAS providers, and does not grant browser/Data API access.
- Supabase docs note: proposal follows the current Supabase guidance that Data API grants and RLS must be handled together; public-schema storage tables are proposed with RLS enabled and no anon/authenticated grants.
- Verification: `node --check scripts/generate-file-storage-schema-migration-package.mjs` and `node --check scripts/qc-file-storage-schema-migration-package.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-migration-package` passed 17/17, covering proposal-only guardrails, table/FK/index contract, RLS/revoke behavior, provider-neutral design, output files, package scripts, PM evidence, and no-secret output.
- Verification: `npm.cmd run storage:schema-migration-package -- --output <temp>` passed and wrote JSON / Markdown / SQL outputs; the generated SQL remains proposal-only and was not applied.
- Verification: `npm.cmd run qc:external-large-file-intake` passed 15/15; `npm.cmd run qc:file-storage-metadata` passed 18/18; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23; `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4S Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: disposable storage schema apply gate。
- Delivery: added `scripts/generate-file-storage-schema-apply-gate.mjs` and `storage:schema-apply-gate`; the gate can apply the Phase 4R proposal SQL only when `PDM_STORAGE_SCHEMA_APPLY_ENABLED=1`, `--confirm-disposable`, a database URL, and a disposable/staging/shadow/test target name are all present.
- Delivery: added disposable target guardrails, post-apply schema introspection for required tables, RLS verification, and anon/authenticated/PUBLIC grant checks.
- Delivery: added `scripts/qc-file-storage-schema-apply-gate.mjs` and `qc:file-storage-schema-apply-gate` with fake-client coverage so CI can verify execution behavior without a live Postgres target.
- Safety boundary: default mode does not connect to a database, does not apply SQL, does not write into official migration directories, does not call storage providers, does not update metadata pointers, and does not print database URLs.
- Verification: `node --check scripts/generate-file-storage-schema-apply-gate.mjs` and `node --check scripts/qc-file-storage-schema-apply-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-apply-gate` passed 19/19, covering default disabled mode, no-connect behavior, missing database URL, production-like target blocking, unsupported target kind blocking, safe disposable apply behavior through fake client, schema/RLS/grant introspection, output files, package scripts, PM evidence, no official migration directory writes, and no credential marker output.
- Verification: `npm.cmd run storage:schema-apply-gate -- --output <temp>` passed in default disabled mode and wrote JSON / Markdown outputs without applying SQL.
- Verification: `npm.cmd run qc:file-storage-schema-migration-package` passed 17/17; `npm.cmd run qc:external-large-file-intake` passed 15/15; `npm.cmd run qc:file-storage-metadata` passed 18/18.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4T Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: read-only storage schema verify gate。
- Delivery: added `scripts/generate-file-storage-schema-verify-gate.mjs` and `storage:schema-verify-gate`; the gate verifies an already-applied non-production storage schema without applying SQL.
- Delivery: verification covers required storage metadata tables, RLS, disallowed anon/authenticated/PUBLIC table grants, expected indexes, unique constraints, and baseline provider seed rows.
- Delivery: added `scripts/qc-file-storage-schema-verify-gate.mjs` and `qc:file-storage-schema-verify-gate` with fake-client coverage for clean verification and finding scenarios.
- Safety boundary: default mode does not connect to a database; enabled mode is read-only, blocks production-like target names, does not write migration files, does not apply SQL, does not call storage providers, does not update metadata pointers, and does not print database URLs.
- Verification: `node --check scripts/generate-file-storage-schema-verify-gate.mjs` and `node --check scripts/qc-file-storage-schema-verify-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-verify-gate` passed 23/23, covering default disabled mode, no-connect behavior, missing database URL, production-like target blocking, clean schema verification through fake client, read-only behavior, finding downgrade, output files, package scripts, PM evidence, no official migration directory writes, and no credential marker output.
- Verification: `npm.cmd run storage:schema-verify-gate -- --output <temp>` passed in default disabled mode and wrote JSON / Markdown outputs without connecting or applying SQL.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-apply-gate` 19/19, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4U Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: storage schema promotion evidence gate。
- Delivery: added `scripts/generate-file-storage-schema-promotion-gate.mjs` and `storage:schema-promotion-gate`; it consumes apply, verify, and Supabase advisor evidence reports and decides whether the schema package is ready for formal migration review.
- Delivery: promotion requires `storage-schema-apply-gate` status `applied_to_disposable`, `storage-schema-verify-gate` status `verified`, clean readiness, no disallowed grants, seeded providers, and passed security/performance advisor evidence.
- Delivery: added `scripts/qc-file-storage-schema-promotion-gate.mjs` and `qc:file-storage-schema-promotion-gate`, covering missing evidence, failed apply evidence, verify findings, advisor findings, ready evidence, output files, PM evidence, and no credential marker output.
- Safety boundary: this gate is evidence-only; it does not connect to a database, does not apply SQL, does not write official migration files, does not call storage providers, and does not update metadata pointers.
- Verification: `node --check scripts/generate-file-storage-schema-promotion-gate.mjs` and `node --check scripts/qc-file-storage-schema-promotion-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-promotion-gate` passed 18/18, covering missing evidence, clean ready evidence, failed apply evidence, verify findings, advisor findings, output files, package scripts, PM evidence, official migration directory guard, and no credential marker output.
- Verification: `npm.cmd run storage:schema-promotion-gate -- --output <temp>` passed in default missing-evidence mode and wrote JSON / Markdown outputs with `blocked_missing_evidence`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-verify-gate` 23/23, `npm.cmd run qc:file-storage-schema-apply-gate` 19/19, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4V Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: Supabase advisor evidence normalizer for schema promotion。
- Delivery: added `scripts/generate-file-storage-schema-advisor-evidence.mjs` and `storage:schema-advisor-evidence`; it converts exported Supabase security/performance advisor JSON into `supabase-advisor-evidence.json` and Markdown.
- Delivery: advisor evidence requires an explicitly non-production target name containing disposable, staging, shadow, or test; production-like names fail the report even when advisor exports are clean.
- Delivery: normalized output is compatible with `storage:schema-promotion-gate`, using `security.status`, `performance.status`, and sanitized findings arrays.
- Delivery: added `scripts/qc-file-storage-schema-advisor-evidence.mjs` and `qc:file-storage-schema-advisor-evidence`, covering missing exports, clean pass, promotion-gate compatibility, security findings, performance findings, unsafe target names, output files, PM evidence, official migration directory guard, and credential redaction.
- Safety boundary: this normalizer is evidence-only; it does not connect to Supabase, does not apply SQL, does not write official migration files, does not call storage providers, and does not update metadata pointers.
- Verification: `node --check scripts/generate-file-storage-schema-advisor-evidence.mjs` and `node --check scripts/qc-file-storage-schema-advisor-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-advisor-evidence` passed 18/18, covering missing exports, clean pass, promotion-gate compatibility, security findings, performance findings, unsafe target names, output files, package scripts, PM evidence, official migration directory guard, and credential redaction.
- Verification: `npm.cmd run storage:schema-advisor-evidence -- --output <temp>` passed in default missing-export mode and wrote JSON / Markdown outputs with `blocked_missing_advisor_exports`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18, `npm.cmd run qc:file-storage-schema-verify-gate` 23/23, `npm.cmd run qc:file-storage-schema-apply-gate` 19/19, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4W Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: known Supabase target denylist for storage schema gates。
- Supabase discovery evidence: connector currently lists only `ProJED` (`knodlkxqpcqyrtgwpdst`) and `ProJED_TEST` (`fhisnnufoeulxqrchldf`); existing DB migration PM evidence says these are not approved AI_PDM migration targets.
- Delivery: added `scripts/file-storage-schema-target-safety.mjs` with a shared target safety evaluator and explicit denylist for `ProJED` / `ProJED_TEST` project names and refs.
- Delivery: updated `storage:schema-apply-gate`, `storage:schema-verify-gate`, and `storage:schema-advisor-evidence` to fail closed with `unsafe_known_target` before connection or promotion evidence can pass.
- Delivery: expanded QC so `ProJED_TEST` target name and `db.fhisnnufoeulxqrchldf.supabase.co` database ref are blocked, while valid disposable/staging/shadow/test targets still pass.
- Safety boundary: this phase does not connect to `ProJED` / `ProJED_TEST`, does not apply SQL, does not write official migration files, and does not use those projects as storage schema targets.
- Verification: `node --check scripts/file-storage-schema-target-safety.mjs`, `node --check scripts/generate-file-storage-schema-apply-gate.mjs`, `node --check scripts/generate-file-storage-schema-verify-gate.mjs`, `node --check scripts/generate-file-storage-schema-advisor-evidence.mjs`, `node --check scripts/qc-file-storage-schema-apply-gate.mjs`, `node --check scripts/qc-file-storage-schema-verify-gate.mjs`, and `node --check scripts/qc-file-storage-schema-advisor-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-apply-gate` passed 21/21; `npm.cmd run qc:file-storage-schema-verify-gate` passed 25/25; `npm.cmd run qc:file-storage-schema-advisor-evidence` passed 19/19.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18 and `npm.cmd run qc:file-storage-schema-migration-package` 17/17.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4X Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: Supabase target readiness gate before storage schema apply。
- Delivery: added `scripts/generate-file-storage-schema-target-readiness.mjs` and `storage:schema-target-readiness`; it consumes an exported Supabase project inventory JSON and decides whether an approved AI_PDM disposable/staging/shadow/test target exists.
- Delivery: target readiness requires a safe non-production target name, rejects known `ProJED` / `ProJED_TEST` project names and refs through the shared target safety module, and requires an `AI_PDM`-named candidate before storage schema apply.
- Delivery: added `scripts/qc-file-storage-schema-target-readiness.mjs` and `qc:file-storage-schema-target-readiness`, covering missing inventory, only known forbidden projects, unsafe expected target, dedicated `AI_PDM_STAGING` pass, production-like target block, output files, PM evidence, official migration directory guard, and credential marker redaction.
- Safety boundary: this gate is evidence-only; it does not create Supabase projects, does not accept cost, does not connect to a database, does not apply SQL, does not write official migration files, and does not call storage providers.
- Verification: `node --check scripts/generate-file-storage-schema-target-readiness.mjs` and `node --check scripts/qc-file-storage-schema-target-readiness.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-readiness` passed 16/16, covering missing inventory, only known forbidden projects, unsafe expected target, dedicated `AI_PDM_STAGING` readiness, production-like target block, output files, package scripts, PM evidence, official migration directory guard, and credential marker redaction.
- Verification: `npm.cmd run storage:schema-target-readiness -- --output <temp>` passed in default missing-inventory mode and wrote JSON / Markdown outputs with `blocked_missing_project_inventory`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-apply-gate` 21/21, `npm.cmd run qc:file-storage-schema-verify-gate` 25/25, `npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19, `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4Y Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: target readiness handoff package before storage schema apply。
- Delivery: added `scripts/generate-file-storage-schema-target-readiness-package.mjs` and `storage:schema-target-readiness-package`; it consumes a Supabase project inventory export, embeds the target readiness report, and emits the handoff commands required for apply / verify / advisor / promotion evidence.
- Delivery: blocked packages tell PM/RD not to use `ProJED` / `ProJED_TEST`, require a dedicated AI_PDM staging/disposable/shadow target, and list external inputs without printing database URLs.
- Delivery: ready packages include command templates for `storage:schema-apply-gate`, `storage:schema-verify-gate`, `storage:schema-advisor-evidence`, and `storage:schema-promotion-gate`.
- Delivery: added `scripts/qc-file-storage-schema-target-readiness-package.mjs` and `qc:file-storage-schema-target-readiness-package`, covering missing inventory, forbidden inventory, ready inventory, handoff commands, output files, package scripts, PM evidence, official migration directory guard, no project creation calls, and credential marker redaction.
- Safety boundary: this package is evidence-only; it does not create Supabase projects, does not accept cost, does not connect to a database, does not apply SQL, does not write official migration files, and does not call storage providers.
- Verification: `node --check scripts/generate-file-storage-schema-target-readiness-package.mjs` and `node --check scripts/qc-file-storage-schema-target-readiness-package.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-readiness-package` passed 15/15, covering missing inventory, forbidden inventory, ready inventory, handoff commands, output files, package scripts, PM evidence, official migration directory guard, no project creation calls, and credential marker redaction.
- Verification: `npm.cmd run storage:schema-target-readiness-package -- --output <temp>` passed in default missing-inventory mode and wrote JSON / Markdown outputs with `blocked_target_readiness`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-target-readiness` 16/16, `npm.cmd run qc:file-storage-schema-apply-gate` 21/21, `npm.cmd run qc:file-storage-schema-verify-gate` 25/25, `npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19, `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 4Z Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: Supabase target cost confirmation package before creating `AI_PDM_STAGING` or disposable branch。
- Supabase cost evidence: connector `_get_cost` for organization `igzdpafkvqqpsyadmage` returned project `0/monthly` and branch `0.01344/hourly` on 2026-06-11.
- Delivery: added `scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs` and `storage:schema-target-cost-confirmation-package`; it packages organization, region, target name, preferred resource type, and current project/branch cost evidence into a user-confirmation handoff.
- Delivery: the package can reach `ready_for_user_cost_confirmation`, but never `readyForSupabaseCreateCall`; explicit user confirmation is still required before any Supabase cost confirmation or project/branch creation.
- Delivery: added `scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs` and `qc:file-storage-schema-target-cost-confirmation-package`, covering unsafe target, missing selected cost, project cost, branch cost, confirmation text, output files, package scripts, PM evidence, official migration directory guard, no creation API calls, and credential redaction.
- Safety boundary: this package is evidence-only; it does not call Supabase cost confirmation, does not create projects or branches, does not connect to a database, does not apply SQL, does not write official migration files, and does not call storage providers.
- Verification: `node --check scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs` and `node --check scripts/qc-file-storage-schema-target-cost-confirmation-package.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` passed 17/17, covering unsafe target, missing selected cost, project cost, branch cost, confirmation text, output files, package scripts, PM evidence, official migration directory guard, no connector creation calls, and credential redaction.
- Verification: `npm.cmd run storage:schema-target-cost-confirmation-package -- --organization-id igzdpafkvqqpsyadmage --organization-name JED --target-name AI_PDM_STAGING --region ap-southeast-1 --preferred-resource project --project-cost-amount 0 --project-cost-recurrence monthly --branch-cost-amount 0.01344 --branch-cost-recurrence hourly --output <temp>` passed and wrote JSON / Markdown outputs with `ready_for_user_cost_confirmation`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-target-readiness-package` 15/15, `npm.cmd run qc:file-storage-schema-target-readiness` 16/16, `npm.cmd run qc:file-storage-schema-apply-gate` 21/21, `npm.cmd run qc:file-storage-schema-verify-gate` 25/25, `npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19, `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## 2026-06-11 Phase 5A Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: formal migration review package。
- Delivery: added `scripts/generate-file-storage-schema-formal-review-package.mjs` and `storage:schema-formal-review-package`; it aggregates target readiness, cost confirmation package, explicit user cost confirmation evidence, and schema promotion gate into one formal migration review handoff.
- Delivery: package statuses include `blocked_missing_evidence`, `blocked_target_readiness`, `blocked_cost_confirmation`, `blocked_schema_promotion`, and `ready_for_formal_migration_review`.
- Delivery: added `scripts/qc-file-storage-schema-formal-review-package.mjs` and `qc:file-storage-schema-formal-review-package`, covering missing evidence, blocked target readiness, missing user cost confirmation, incomplete cost evidence, blocked promotion gate, clean ready path, output files, package scripts, PM evidence, official migration directory guard, no connector resource API calls, and credential redaction.
- Verification: `node --check scripts/generate-file-storage-schema-formal-review-package.mjs` and `node --check scripts/qc-file-storage-schema-formal-review-package.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-formal-review-package` passed 18/18; `npm.cmd run storage:schema-formal-review-package -- --output <temp>` wrote JSON / Markdown outputs with `blocked_missing_evidence`.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` 17/17, `npm.cmd run qc:file-storage-schema-target-readiness-package` 15/15, `npm.cmd run qc:file-storage-schema-target-readiness` 16/16, `npm.cmd run qc:file-storage-schema-promotion-gate` 18/18, `npm.cmd run qc:file-storage-schema-advisor-evidence` 19/19, `npm.cmd run qc:file-storage-schema-apply-gate` 21/21, `npm.cmd run qc:file-storage-schema-verify-gate` 25/25, `npm.cmd run qc:file-storage-schema-migration-package` 17/17, and `npm.cmd run qc:external-large-file-intake` 15/15.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:doc-paths`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: this package is evidence-only; it does not confirm cost, create Supabase resources, connect to DB, apply SQL, write official migrations, or update metadata pointers.

## 2026-06-11 Phase 5B Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: actual Supabase target provisioning evidence。
- External state: Supabase connector `list_projects` currently returns only `ProJED` (`knodlkxqpcqyrtgwpdst`) and `ProJED_TEST` (`fhisnnufoeulxqrchldf`); no `AI_PDM_STAGING` project exists.
- External cost evidence: Supabase connector `get_cost` returned project `0/monthly` and branch `0.01344/hourly` for organization `igzdpafkvqqpsyadmage`.
- Delivery: added `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/project-inventory.json` and generated readiness / cost / formal-review evidence in the same folder.
- Delivery: actual readiness evidence is `blocked_target_readiness`; cost package is `ready_for_user_cost_confirmation`; formal review remains blocked because target readiness, user cost confirmation evidence, and schema promotion evidence are missing.
- Delivery: added `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` and `qc:file-storage-schema-target-provisioning-evidence` to verify the real evidence folder.
- Verification: `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 17/17, covering real connector inventory, forbidden target refs, blocked readiness, ready cost confirmation package, blocked formal review, PM evidence, and credential marker redaction.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-formal-review-package` 18/18 and `npm.cmd run qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: no Supabase cost confirmation, project creation, branch creation, DB connection, SQL apply, official migration write, or provider IO was performed.

## 2026-06-11 Phase 5C Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: user cost confirmation evidence gate。
- Delivery: added `scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs` and `storage:schema-user-cost-confirmation-evidence`; it reads a target cost confirmation package and emits `supabase-target-user-cost-confirmation-evidence`.
- Delivery: confirmation is recorded only when `--confirmation-text` exactly matches the package confirmation text and `--confirmed-by` is present; mismatched, missing, or incomplete confirmations remain blocked.
- Delivery: added `scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs` and `qc:file-storage-schema-user-cost-confirmation-evidence`, covering missing package, missing text, mismatch, missing confirmed-by, exact confirmation, formal-review compatibility, output files, package scripts, PM evidence, no connector API calls, and credential redaction.
- Verification: `node --check scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs` and `node --check scripts/qc-file-storage-schema-user-cost-confirmation-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence` passed 17/17; CLI default against current cost package wrote `blocked_missing_user_confirmation` and did not record confirmation.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-formal-review-package` 18/18, `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` 17/17, `npm.cmd run qc:file-storage-schema-target-cost-confirmation-package` 17/17, and `npm.cmd run qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: this gate does not call Supabase `confirm_cost`, does not create a project or branch, does not connect to DB, and does not apply SQL.

## 2026-06-11 Phase 5D Evidence Addendum

- Task: `DEV-STORAGE-COST-001` 檔案儲存成本控管與可替換 provider 架構。
- Phase: actual blocked user confirmation evidence folder。
- Delivery: generated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/user-cost-confirmation-evidence.json` and Markdown from the current target cost confirmation package without user confirmation text.
- Delivery: generated user confirmation evidence is intentionally `blocked_missing_user_confirmation`, `confirmationRecorded=false`, and `readyForSupabaseConfirmCost=false`.
- Delivery: regenerated `storage-schema-formal-review-package.json/md` with `--user-cost-confirmed-evidence`; formal review now records `userCostConfirmation.status=failed` instead of missing the file.
- Delivery: expanded `qc:file-storage-schema-target-provisioning-evidence` to require the real evidence folder to include blocked user confirmation evidence and to verify formal review sees that blocker.
- Verification: `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 20/20, covering real connector inventory, forbidden targets, blocked readiness, ready cost package, blocked user confirmation evidence, formal-review blocker propagation, PM evidence, and credential redaction.
- Verification: regression gates passed: `npm.cmd run qc:file-storage-schema-user-cost-confirmation-evidence` 17/17 and `npm.cmd run qc:file-storage-schema-formal-review-package` 18/18.
- Verification: `npm.cmd run qc:doc-paths` 23/23, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT warning on `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.
- Guardrail: no Supabase `confirm_cost`, project creation, branch creation, DB connection, SQL apply, official migration write, or provider IO was performed.

## Completed / Archived Index

以下項目已完成，主檔只保留索引；詳細證據見 `.ai-doc/reports/rd/`、`.ai-doc/qa/`、`.ai-doc/qc/`、`.ai-doc/reports/industrialization/` 或 [.ai-doc/dev_task_archive_2026-05.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/dev_task_archive_2026-05.md)。

### Dashboard / UI Performance
- [x] DEV-PERF-001：搜尋輸入 debounce 與短字元保護。
- [x] DEV-PERF-002：通知請求拆離搜尋與狀態切換。
- [x] DEV-PERF-003：明細載入取消與競態保護。
- [x] DEV-PERF-004：明細載入分層。
- [x] DEV-PERF-005：合併明細 state 更新。
- [x] DEV-PERF-006：圖面清單分頁或 cursor 載入。
- [x] DEV-PERF-007：表格列虛擬化。
- [x] DEV-PERF-008：搜尋與清單查詢索引化。
- [x] DEV-PERF-009：清單 API 只回傳摘要欄位。
- [x] DEV-PERF-010：點選圖面立即回饋與 skeleton。
- [x] DEV-PERF-011：搜尋/篩選導入 `useTransition`。
- [x] DEV-PERF-012：拆分 Dashboard 巨型元件。
- [x] DEV-PERF-013：表格列 memo 化。

### Search / BOM / Assembly / AI
- [x] DEV-FINDER-001：自訂搜尋選項。
- [x] DEV-FINDER-002：儲存自訂搜尋與常用條件。
- [x] DEV-AIOCR-001：AI/OCR 圖面資訊擷取。
- [x] DEV-ASM-001：組合圖階層管理。
- [x] DEV-ASM-002：組合圖搜尋與 Where-used 強化。
- [x] DEV-BOM-001：BOM 產出產品化。
- [x] DEV-BOM-002：BOM diff 產品化。
- [x] DEV-AIRISK-001：AI BOM / 組合圖風險摘要。

### Workflow UX / QC
- [x] DEV-UX-001：圖面明細工作流分層重設計。
- [x] DEV-UX-002：工作層欄位語意與 raw ID 清理。
- [x] DEV-UX-003：交付與公開分享診斷資訊分層。
- [x] DEV-UX-004：上傳成功訊息語意化。
- [x] DEV-QC-001：UI QC 禁止以 raw submissionId 當載入成功依據。

### Industrialization Round
- [x] DEV-IND-001：Establish repo baseline and current-state inventory。
- [x] DEV-IND-002：Create external large-asset manifest and relocation rules。
- [x] DEV-IND-003：Clean generated/dependency output boundaries。
- [x] DEV-IND-004：Split `data/` runtime, fixture, and evidence management policy。
- [x] DEV-IND-005：Add AI/API cost gates and usage logging。
- [x] DEV-IND-006：Extract DB provider and repository contracts。
- [x] DEV-IND-008：Split `src/lib/db.ts` by feature repository。
- [x] DEV-IND-009：Split Dashboard UI giant component。
- [x] DEV-IND-010：Split global CSS and design tokens。
- [x] DEV-IND-011：Reorganize RD/QA/QC documents and report paths。
- [x] DEV-IND-012：Add industrialization acceptance gate。

## Cross-Task Dependencies

- DEV-BOM-WORKBENCH-001 depends on current CAD reference / BOM / Where-used base; native extraction quality improves after DEV-CAD-001.
- DEV-SW-001 depends on real SolidWorks machine access and may provide evidence for DEV-CAD-001.
- DEV-FIELD-001 depends on DEV-SW-001 and DEV-BACKUP-001 for complete production-readiness closure.
- DEV-IND-007 needs a disposable database target and should not proceed against any production or existing non-empty project.
- DEV-GDRIVE-001 should preserve current `gdrive_pending_folder_id` and `gdrive_released_folder_id` compatibility.
- DEV-PDM-NUMBERING-001 depends on DEV-IND-007 for production Supabase/Postgres readiness, and should remain compatible with J drive path/hash indexing before any future Supabase Storage migration.
- DEV-PDM-PART-COST-001 extends DEV-PDM-NUMBERING-001 and should reuse `part_roots` / `drawing_part_links`; it must not re-open completed numbering behavior unless schema compatibility requires a scoped extension.
- DEV-PDM-IDENTITY-LIST-001 extends DEV-PDM-MASTER-WORKBENCH-001 and must preserve the existing left-table/right-detail layout while changing only list information hierarchy.
- DEV-UX-PLATFORM-001 depends on current Dashboard / sidebar / numbering / BOM / handoff UI shape, and should not introduce schema changes until a later task defines the adaptive task routing model.

## Update Log

- 2026-06-10：`DEV-PDM-PART-COST-001` 收斂四項待決策：料號不編碼材質 / 顏色、標準成本預設 `1 pcs`、成本金額可見角色限定、材質 / 顏色第一版採自由欄位並保留 code 欄位。新增 `src/lib/part-cost-visibility.ts`，讓 `/api/parts`、`/api/parts/[partNumber]` 與成本 profile 建立回應依角色遮罩成本金額與 profile 級距明細；更新 `/parts` 顯示已遮罩標準成本狀態；`qc:part-number-module` 新增成本金額 redaction 靜態驗證。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3G async auth audit write pilot。新增 `src/lib/repositories/audit-async-repository.ts` 與 `src/lib/audit-async.ts`，以 `AsyncDatabaseClient` 實作 append-only audit insert；`/api/auth/login` 的 demo shortcut / password login 與 `/api/auth/token` 的 Login audit 改用 `await createAuditLogAsync(...)`。`qc:access-control-async-repository` 擴充 async audit repository/helper、login/token route 接線與 in-memory SQLite audit insert semantic checks；`qc:managed-auth` 擴充 audit row 驗證，確認 managed login/token 會寫入 `audit_logs`，且 token audit 保留 `SolidWorks Add-in` client marker。驗證：`npm.cmd run qc:access-control-async-repository` 37/37、`npm.cmd run qc:managed-auth` 11/11、`npm.cmd run qc:pdm-numbering-core` 238/238、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet`、`npm.cmd run build` 通過；build 僅有既有 Turbopack NFT tracing warning。本輪仍未切一般 API audit 寫入、user create/update password、正式 Postgres runtime 或 Supabase live target。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3F async login/token user lookup pilot。`src/lib/auth-async.ts` 新增 `getUserByEmailWithPasswordAsync`，`/api/auth/login` 與 `/api/auth/token` 改用 async user repository 讀取 password hash；`ensureDemoUser`、`createAuditLog`、password verify 與 session/token 產生邏輯維持原樣。`qc:access-control-async-repository` 擴充 login/token route 靜態檢查，`qc:managed-auth` 擴充 bearer token flow，驗證 managed admin 可取得 token 並以 bearer token 讀取 settings。驗證：`npm.cmd run qc:access-control-async-repository` 32/32、`npm.cmd run qc:managed-auth` 9/9、`npm.cmd run qc:pdm-numbering-core` 238/238、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet`、`npm.cmd run build` 通過；build 僅有既有 Turbopack NFT tracing warning。本輪仍未切 user create/update password、audit 寫入、一般 API sync auth 或 Supabase live target。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3E async auth/session user lookup pilot。新增 `src/lib/repositories/user-async-repository.ts`，以 `AsyncDatabaseClient` 實作 `getUserById`、`getUserByEmail`、`getUserByEmailWithPassword` 的 provider-neutral SQL；新增 `src/lib/auth-async.ts`，解析既有 `pdm_session` cookie / bearer token 並透過 `AsyncUserRepository` 讀取 session user；`requireNumberingPermissionAsync` 改用 `requireAuthAsync`，同步 `requireAuth` 與同步 guard 保留不動。`qc:access-control-async-repository` 擴充 async user repository、async auth、async guard 接線與 in-memory SQLite user lookup semantic checks。驗證：`npm.cmd run qc:access-control-async-repository` 30/30、`npm.cmd run qc:pdm-numbering-core` 238/238、`npm.cmd run qc:managed-auth` 7/7、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet`、`npm.cmd run build` 通過；build 僅有既有 Turbopack NFT tracing warning。本輪仍未切 login/password 寫入、一般 API auth、production runtime 或 Supabase live target。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3D async permission guard route migration。`src/lib/numbering-permission-guard.ts` 新增 `requireNumberingPermissionAsync`、`requireNumberingPageAsync`、`requireNumberingActionAsync` 與 `canUserUseNumberingActionAsync`，同步 helper 保留不動；`/api/numbering/search`、`/api/numbering/tasks`、`/api/numbering/notifications`、`/api/parts`、`/api/numbering/drawings` 改用 `await requireNumberingPageAsync(...)`，作為第一批低風險 read-only route guard 遷移。`qc:access-control-async-repository` 擴充檢查 async guard helper、5 個 read-only route 接線與既有 access-control semantic SQL。驗證：`npm.cmd run qc:access-control-async-repository` 23/23、`npm.cmd run qc:pdm-numbering-core` 238/238、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet`、`npm.cmd run build` 通過；build 僅有既有 Turbopack NFT tracing warning。本輪仍未切寫入 route、admin matrix、auth user lookup 或 production runtime。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3C permission API async read path。新增 `src/lib/numbering-permission-async.ts`，以 `SQLiteAsyncDatabaseClient(getDb())` bridge 現有 SQLite runtime 與 `AsyncAccessControlRepository`；`AsyncAccessControlRepository` 新增 `checkPermission`，覆蓋 base roles、assigned roles、active role priority、delegation scope、enabled role 與 explicit permission lookup；`/api/numbering/permissions` 改用 `checkNumberingPermissionAsync`，response contract 維持 `{ generatedAt, pages, actions }`。修正 `qc:pdm-numbering-permission-guard-ui` selector，只檢查 `.sidebar` 內的 `/numbering/request` link。驗證：`qc:access-control-async-repository` 21/21、`qc:pdm-numbering-cross-role-permission` 45/45、`qc:pdm-numbering-permission-guard-ui` 35/35、`npx.cmd tsc --noEmit` 通過。`requireNumberingPermission` 與 admin matrix 寫入本輪仍保留同步 repository，避免一次性翻動所有 guard 與 audit 寫入。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3B repository async migration pilot。新增 `src/lib/repositories/access-control-async-repository.ts`，以 `AsyncDatabaseClient` 抽出 roles / users / role_permissions 的 provider-neutral access-control repository，支援 role/user list、role lookup、role permission list 與 permission upsert；SQL 使用 named params、JOIN 與 `ON CONFLICT(role_id, permission_kind, permission_code) DO UPDATE`，不依賴 `getDb` 或 `better-sqlite3`，role 不存在時以 `ACCESS_CONTROL_ROLE_NOT_FOUND` fail closed。新增 `npm.cmd run qc:access-control-async-repository`，直接抽取 SQL 常數並在 in-memory SQLite 驗證 role list、user list、role lookup、permission upsert、permission list deterministic order。驗證：`npm.cmd run qc:access-control-async-repository` 14/14、`npx.cmd tsc --noEmit` 通過。本輪未切 numbering admin API runtime，避免 staging Postgres gate 前擴大風險。
- 2026-06-08：依 PM-dev 文件治理補齊 `DEV-SUPABASE-DB-001` 開發文件包，新增 `.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md` 作為總控索引，並重寫 Supabase SPEC、ADR、RD、QA、QC 文件為可讀版本。任務狀態調整為 `[/]` 進行中；仍未宣稱完成，因 Supabase staging/prod target、Postgres runtime provider、live advisor 與 production cutover 尚未完成。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 2A async provider contract 切片。新增 `src/lib/db-async-provider.ts`，定義 `AsyncDatabaseClient`、`SQLiteAsyncDatabaseClient`、`query` / `queryOne` / `execute` / `transaction` contract，並讓 `postgres` provider 以 `POSTGRES_PROVIDER_NOT_IMPLEMENTED` fail closed；SQLite async transaction 若 callback 回傳 Promise 會以 `SQLITE_ASYNC_TRANSACTION_CALLBACK_UNSUPPORTED` 拒絕，避免 `better-sqlite3` transaction 跨 await 誤用。新增 `qc:db-provider-async-contract` alias 並擴充 `qc:db-provider-contract`。驗證：`npm.cmd run qc:db-provider-contract` 27/27、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet` 通過。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 2B Postgres async adapter 最小實作。新增 `pg` 與 `@types/pg`，`src/lib/db-async-provider.ts` 新增 `PostgresAsyncDatabaseClient` 與 transaction client，使用 `Pool`、unnamed `query(text, values)`、named parameter normalization、`BEGIN` / `COMMIT` / `ROLLBACK`、nested transaction fail-closed；未設定 `PDM_POSTGRES_URL` 時不做 live probe，也不宣稱 staging 驗證。新增 `npm.cmd run qc:db-provider-postgres`。驗證：`npm.cmd run qc:db-provider-contract` 31/31、`npm.cmd run qc:db-provider-postgres` 8/8、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet` 通過；live Postgres probe skipped without env。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成 Phase 3A repository async migration pilot。新增 `src/lib/repositories/system-settings-async-repository.ts`，以 `AsyncDatabaseClient` 實作 `getSetting` / `setSetting` / `getAllSettings`，SQL 使用 named params 與 `ON CONFLICT(key) DO UPDATE`，不依賴 `getDb` 或 `better-sqlite3`。新增 `npm.cmd run qc:system-settings-async-repository`，直接抽取 repository SQL 常數並在 in-memory SQLite 驗證 insert、update、missing read、get-all 語意。驗證：`npm.cmd run qc:system-settings-async-repository` 11/11、`npx.cmd tsc --noEmit`、`npm.cmd run lint -- --quiet` 通過。本輪未切 `/api/settings` runtime，避免在全 repository migration 前破壞既有同步路徑。
- 2026-06-08：`DEV-SUPABASE-DB-001` 完成第一個本機 RD 切片。新增 `supabase/migrations` mirror、`supabase/README.md`、`supabase:migrations:sync`、`qc:supabase-runtime-migrations`，並在 `.env.example` 補上 Postgres runtime URL / admin URL / pooler mode / target name。因本機沒有 Supabase CLI，未宣稱已建立正式 CLI migration history；目前 mirror 由 `db/postgres/*.sql` 產生並以 source SHA-256、RLS deny-by-default 與 ProJED/ProJED_TEST 禁用規則做 QC。Target guard 同步強化，會在連線前拒絕已知非 AI_PDM Supabase project ref。驗證：`npm.cmd run supabase:migrations:sync` 通過且 manifest 顯示 `supabaseCli.available=false`；`npm.cmd run qc:supabase-runtime-migrations` 17/17 通過；`npm.cmd run db:postgres:compare -- --no-write` 通過，64/64 tables、0 missing、0 RLS missing；`npm.cmd run qc:postgres-shadow-target-guard` 11/11 通過；`npm.cmd run qc:postgres-shadow` 22/22 通過；`npm.cmd run lint` 通過；`npm.cmd run build` 通過，僅保留既有 Turbopack NFT tracing warning。
- 2026-06-08：建立 `DEV-SUPABASE-DB-001` 正式 Supabase 資料庫 runtime 遷移開發文件。新增 `SPEC-SUPABASE-DB-001`、`ADR-SUPABASE-DB-001`、RD 開發計畫、QA 驗證計畫、QC 事實查核計畫與 industrialization runtime migration plan；決策為資料庫先行、Storage 延後、建立新 `AI_PDM_STAGING` / `AI_PDM_PROD`，不使用既有 `ProJED` / `ProJED_TEST`，並以 async DB provider + target guard + RLS deny-by-default 作為遷移主軸。本輪僅文件化與任務建檔，未建立 Supabase 專案、未套用 migration、未切換 runtime。
- 2026-06-07：`DEV-UX-RD-LIFECYCLE-001` 完成 RD 圖號料號物件級生命週期狀態修復。新增 `SPEC-UX-RD-LIFECYCLE-001` 與 `ObjectLifecycleStatusPanel`，將 Draft / Active / PendingReview / Released / Obsolete 等狀態轉成使用者語言、卡點、下一步與 CTA；領號結果可帶入 `/upload` 預填圖號、料號、品名；首頁新增「我的開發中圖料」；圖號待辦新增「待送審草稿」；圖料查詢 drawer 顯示主根物件級 lifecycle panel。驗證：`lint`、`qc:pdm-numbering-request-ui` 23/23、`qc:dashboard-quick-access` 16/16、`qc:dashboard-find-first` 16/16、`qc:pdm-numbering-search-ui` 28/28、`qc:pdm-numbering-task-center-ui` 22/22、Playwright browser smoke 通過；證據見 `.ai-doc/reports/rd/rd-qc-rd-lifecycle-ux-implementation-report-2026-06-07.md` 與 `artifacts/ux-rd-lifecycle-implementation/`。
- 2026-06-07：`DEV-BOM-VISUAL-EDITOR-001` 完成 BOM XMind 式圖像化編輯器。`/bom/workbench` 中央主編輯區改為 React Flow 混合畫布，parent assembly、group、item 以節點與 edge 呈現；左側搜尋結果新增明確 drag handle 與標準 `DataTransfer` payload；節點可拖曳改 parent / root / 同層排序；右側屬性改用圖號模組同款 `PdmDetailDrawer`，保留 Qty、group、XLS 貼上、送審與 compare 操作。新增 `@xyflow/react` 與更新 `qc:bom-workbench-ui` 視覺化 QC；`lint`、`build`、`qc:bom-workbench-tree-rules` 22/22、`qc:bom-workbench-ui` 34/34、`qc:pdm-system-detail-drawer-ui` 53/53 通過；build 僅保留既有 Turbopack dynamic path / NFT trace warnings。
- 2026-06-07：`DEV-UX-FILE-DROPZONE-001` 完成 RD 實作。新增共用 `FileDropzone`，將 `/upload` 多檔送審、`/bom/workbench` BOM XLS 匯入、圖號附件庫與料號附件庫統一為可拖曳/可點擊 dropzone；單檔入口支援多檔拒絕提示，附件庫顯示已選檔案與清除動作，後端 API 與 Google Drive 同步流程不變。驗證：`npm.cmd run qc:file-dropzone-ux` 23/23、`npx.cmd tsc --noEmit`、`npm.cmd run lint`、`node node_modules/next/dist/bin/next build` 通過；Browser smoke 確認 `/upload`、BOM 工作台、圖號附件 drawer、料號附件 drawer 皆顯示 dropzone，附件 API 回 200。`npm.cmd run build` 因既有 dev server 鎖定 `.next/dev-3000.err.log` 未採用，改以 direct Next build 驗證。
- 2026-06-06：`DEV-PDM-DETAIL-DRAWER-001` 完成 RD 實作。新增共用 `PdmDetailDrawer`、`useRememberedDrawerWidth` 與 `useListKeyboardShortcuts`，將首頁工作台圖面送審明細、`/numbering/approvals`、`/numbering/imports`、`/numbering/reports` 的資料明細改為圖號模組同款右側 drawer；支援不暗幕、`Escape`/外部關閉、列切換、拖拉寬度記憶與安全查閱快捷鍵；保留 BOM 工具面板、固定 decision panel、API、DB schema 與權限矩陣不變。驗證：`tsc --noEmit`、`lint`、`build`、`qc:pdm-system-detail-drawer-ui` 53/53、`qc:dashboard-detail-priority` 32/32、`qc:dashboard-quick-access` 16/16、`qc:dashboard-search-assist` 10/10、`qc:pdm-numbering-approval-review-ui` 27/27、`qc:pdm-numbering-import-center-ui` 24/24、`qc:pdm-numbering-report-center-ui` 22/22、`qc:pdm-master-workbench-layout` 224/224 通過；build 仍有既有 Turbopack dynamic path / NFT trace warning，與本輪無關。
- 2026-06-06：建立 `SPEC-PDM-DETAIL-DRAWER-001` 與 `DEV-PDM-DETAIL-DRAWER-001`，將圖號模組右側明細 drawer 抽象為全系統資料明細欄模板。決策：範圍限點選清單列後出現的資料明細 drawer；同步要求不暗幕、ESC/外部關閉、切換列、拖拉寬度記憶與安全查閱快捷鍵；不納入 sidebar、BOM 工具面板、高風險固定 decision panel、API、DB schema 或權限矩陣。本輪文件建立後接續 RD 實作。
- 2026-06-05：`DEV-PDM-DRAWING-SHORTCUTS-001` 完成 RD 實作。依 `ui-design-principles` 管理系統清單頁模板，為 `/numbering/drawings` 補上查閱型安全快捷鍵：`ArrowUp/Down`、`Enter`、`Escape`、`PageUp/PageDown`、`Home/End`、`Ctrl+C`；焦點在輸入框、下拉欄位、contenteditable 或有文字反白時不攔截；未覆蓋 `Ctrl+F`、`Ctrl+R/F5`、`Ctrl+S`、`Ctrl+N`、`Ctrl+A`，也未啟用 `Delete` / `F2`。擴充 `qc:pdm-master-workbench-layout`，驗證快捷鍵導覽、開關 drawer、複製選取圖號、輸入框不攔截與文字反白原生複製。驗證：`lint`、`build`、`qc:pdm-master-workbench-layout` 169/169 通過；build 仍有既有 Turbopack dynamic path / NFT trace warning，與本輪無關。
- 2026-06-04：`DEV-PDM-IDENTITY-LIST-001` 完成 RD 實作。新增共用 `pdm-identity-*` / `pdm-meta-strip` 清單樣式，將 `/numbering/search`、`/numbering/drawings`、`/parts` 清單統一為 `圖號 / 品名 / 料號 / 其他`；圖號管理清單移除大型動作欄，追溯與 MA 影響分析保留於右側明細；料號模組將材質、成本、狀態降級為 compact meta；圖料查詢以 backward-compatible `coreName` response 擴充補足 drawing/root row 品名。擴充 `qc:pdm-master-workbench-layout` 與 `qc:pdm-numbering-search-ui`，驗證三頁 identity class、表頭順序、桌機主識別欄 81.9%、其他欄 18.0%、手機卡片堆疊、無水平溢出與右側動作入口。驗證：`lint`、`build`、`qc:pdm-numbering-core` 238/238、`qc:pdm-master-workbench-layout` 125/125、`qc:pdm-numbering-search-ui` 26/26、`qc:part-number-module` 41/41 通過；build 仍有既有 Turbopack dynamic path / NFT trace warning，與本輪無關。
- 2026-06-04：建立 `SPEC-PDM-IDENTITY-LIST-001` 與 `DEV-PDM-IDENTITY-LIST-001`，將圖料查詢、圖號管理、料號模組清單主畫面優化定義為 P1 UX / PDM 主識別清單任務。決策：三頁表頭統一為 `圖號 / 品名 / 料號 / 其他`，品名為最大彈性欄，圖號與料號以內容容納寬度為主，次要資訊降級為 compact meta 或右側明細；本輪僅寫入專案文件，未執行 UI 開發。
- 2026-06-04：`DEV-PDM-MASTER-WORKBENCH-001` 完成 RD 實作。新增共用 `pdm-master-*` layout CSS，將 `/numbering/search`、`/numbering/drawings`、`/parts` 統一為 topbar、filter row、左側總表、右側固定明細；圖號頁移除大型 stats cards 主視覺，改 compact summary；料號頁新增類型篩選位置但不改 API / schema / 權限 / sidebar。新增 `qc:pdm-master-workbench-layout`，驗證三頁共用 layout class、桌機左右工作台、手機上下排列、四個 URL 回 200 與無水平溢出。驗證：`lint`、`build`、`qc:pdm-numbering-core` 238/238、`qc:pdm-numbering-search-ui` 24/24、`qc:part-number-module` 41/41、`qc:pdm-master-workbench-layout` 76/76 通過；build 仍有既有 Turbopack dynamic path / NFT trace warning，與本輪無關。
- 2026-06-04：建立 `SPEC-PDM-MASTER-WORKBENCH-001` 與 `DEV-PDM-MASTER-WORKBENCH-001`，將圖料查詢、圖號管理、料號模組三頁一致化定義為 P1 UX / PDM 主資料工作台任務。決策：三頁同權重、桌機左右工作台、左側總表為主畫面、右側固定明細、手機上下排列；本輪僅寫入專案文件，未修改 UI 程式。
- 2026-06-03：`DEV-PDM-DRAWING-001` 完成圖號管理模組補齊。新增 `listDrawingModuleRecords`、`/api/numbering/drawings`、`/numbering/drawings`、sidebar 入口、`numbering.drawings.view` 頁面權限與預設 seed；圖號頁支援關鍵字、MA/OT、狀態、階段篩選，顯示關聯料號、未處理提醒、追溯與 MA 影響入口；圖料查詢保留跨圖號/料號/主根號搜尋角色。驗證：`qc:pdm-numbering-core` 238/238、`lint`、`build` 通過；build 仍有既有 Turbopack dynamic path warning，與本輪無關。
- 2026-06-03：`DEV-PDM-PART-COST-001` 完成第一版料號模組切片。新增 SQLite / Postgres `part_variant_attributes`、`part_cost_profiles`、`part_cost_tiers`、`part_standard_costs`、`part_cost_change_requests` 與 Supabase RLS baseline 清單；新增料號 repository、`/api/parts`、`/api/parts/[partNumber]`、變體更新、成本 profile 送審 API；新增 `/parts` 料號工作台與 sidebar 入口；新增 `qc:part-number-module`。任務狀態改為 `[/]`，保留完整成本級距衝突檢查、標準成本解析演算法、主管核准生效流程、圖號明細反向呈現與成本審核中心為後續項目。
- 2026-06-03：新增 `SPEC-PDM-PART-COST-001` 與 `DEV-PDM-PART-COST-001`，將一圖多料號、材質 / 顏色變體、料號成本 profile、數量級距、標準成本、採購變更、主管審核與圖面改版不觸發成本重審寫成正式專案文件。Spec Index 標記為文件已建立，實作任務仍列為 backlog 詳細 task，未加入 Active Task Overview，避免與已完成任務盤點混淆。
- 2026-06-02：`DEV-UX-PLATFORM-001` 完成 Phase 1B。新增共用 `NextStepState`，補齊首頁、待辦中心、匯入中心、領號結果、上傳完成、MA 影響分析、BOM 工作台、BOM 審核與製造交接的空狀態 / 完成狀態下一步入口；修正匯入中心、MA 影響分析與 BOM 審核頁的 heading/text 重複，避免 Playwright strict locator 不穩。`DEV-UX-PLATFORM-001` 改為 `[x]`，自適應任務路由另開 `DEV-UX-PLATFORM-002`。驗證：`lint`、`build`、`git diff --check`、`qc:dashboard-quick-access` 16/16、`qc:dashboard-find-first` 16/16、`qc:pdm-numbering-task-center-ui` 22/22、`qc:pdm-numbering-import-center-ui` 22/22、`qc:pdm-numbering-impact-ui` 24/24、`qc:bom-workbench-ui` 35/35、`qc:bom-workbench-review-ui` 32/32、handoff Playwright smoke 16/16。
- 2026-06-02：`DEV-UX-PLATFORM-001` 完成 Phase 1A RD 實作。新增 sidebar 平台分群、首頁多角色工作台、共用 `WorkflowStrip`，並接入 `/upload`、`/numbering/request`、`/numbering/tasks`、`/numbering/imports`、`/numbering/impact`、`/bom/workbench`、`/bom/reviews`、`/handoff`；修正首頁搜尋 placeholder 與最近圖號同步。新增 RD/QC 文件：`.ai-doc/reports/rd/rd-ux-platform-report-2026-06-02.md`、`.ai-doc/qc/qc-ux-platform-validation-report-2026-06-02.md`。驗證：`lint`、`build`、`qc:dashboard-quick-access` 16/16、`qc:dashboard-find-first` 16/16、`qc:pdm-numbering-task-center-ui` 22/22、`qc:pdm-numbering-import-center-ui` 22/22、`qc:pdm-numbering-impact-ui` 24/24、`qc:bom-workbench-ui` 35/35、Playwright smoke check 首頁 5 cards / 6 nav sections / overflow 0。任務維持 `[/]`，剩餘逐頁空狀態/完成狀態文案與完整自適應任務引擎另切。
- 2026-06-02：建立 `SPEC-UX-PLATFORM-001` 與 `DEV-UX-PLATFORM-001`，將多角色 AI PDM 平台 UX 從 RD 功能清單重定位為物件中心、任務路由、角色視角與流程地圖組合；第一階段聚焦工作台、sidebar 平台導覽、主要頁面下一步 CTA 與空狀態，不新增 schema 或完整自適應任務引擎。
- 2026-06-02：`DEV-IND-007` 完成本機 Postgres shadow handoff package 收斂。新增 `postgres-shadow:handoff` 與 `qc:postgres-shadow-handoff-package`；`postgres-shadow:handoff` 產生 `data/postgres-shadow-handoffs/20260602-091309`，封裝 `db/schema.sql`、`db/postgres/001_initial_schema.sql`、`db/postgres/002_supabase_rls_plan.sql` copy/hash、pre-migration target guard、migration/RLS apply、live compare、Supabase advisor evidence checklist 與 final QC checklist。`qc:postgres-shadow-handoff-package` 驗證 package 檔案、manifest、hash trace、指令內容、RLS deny-by-default copy、無 hardcoded Postgres URL、外部文件皆引用最新 package。實際 disposable Supabase/Postgres target、live migration/compare、advisor evidence 與 production readiness closure 仍維持外部阻塞。
- 2026-06-02：新增 `qc:external-blocker-closure` 作為五個外部 blocker 的 closure 交接一致性 gate。此 QC 檢查 production readiness 仍回報 `DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001`、`DEV-FIELD-001`、`DEV-IND-007`，確認 latest field-test handoff `data/field-test-handoffs/20260602-090136`、latest Postgres shadow handoff `data/postgres-shadow-handoffs/20260602-091309`、外部 handoff command coverage、Supabase target safety、field issue 轉 defect/task 規則、active blocker report 不誤標 complete 與無舊 package id。此項僅完成本機 closure gate，不代表外部 evidence 已完成。
- 2026-06-02：完成 active goal blocked audit。`qc:dev-task-completion-audit` 8/8、`qa:dev-task:sync` dry-run 0 changes、`qc:dev-task-evidence-sync` 13/13、`qc:production-readiness:report` `ready=false` 且 5 個 P0 external blockers、`qc:external-blocker-closure` 83/83；三份 external report 仍 `ready=false`，strict field preflight 在 `--require-evidence` 下 19 passed / 3 failed / 1 warning。判定目前無本機可關閉的未分類 task，剩餘項需外部實機、正式 evidence 或 disposable Supabase/Postgres target。
- 2026-06-02：blocked 後 resumed audit 第 1 輪。重跑 `qc:dev-task-completion-audit`、`qa:dev-task:sync`、`qc:production-readiness:report`、`qc:external-blocker-closure`、三份 external report allow-open gate 與 strict field preflight，結果仍為同一組 5 個外部 blocker。Supabase connector 目前只看到 `ProJED` / `ProJED_TEST`，兩者 public schema 均已有既有 tables/rows，仍不可作為 `DEV-IND-007` disposable shadow target；本輪未更動任何 task checkbox。
- 2026-06-02：blocked 後 resumed audit 第 2 輪。重跑 `qc:dev-task-completion-audit` 8/8、`qa:dev-task:sync` 0 changes / `unsafeCompleted=[]`、`qc:production-readiness:report` `ready=false`、`qc:external-blocker-closure` 83/83、三份 external report allow-open gate 與 strict field preflight；結果仍為同一組 5 個外部 blocker。Supabase connector 仍只看到 `ProJED` / `ProJED_TEST`，`ProJED` 有 20 個 public tables 且 `ProJED_TEST` 有 19 個 public tables，均已有既有 rows，不是 disposable AI_PDM shadow target；本輪未更動任何 task checkbox。
- 2026-06-02：blocked 後 resumed audit 第 3 輪。重跑 `qc:dev-task-completion-audit` 8/8、`qa:dev-task:sync` 0 changes / `unsafeCompleted=[]`、`qc:production-readiness:report` `ready=false` 且仍為 5 個 P0 external blockers、`qc:external-blocker-closure` 83/83、三份 external report allow-open gate 與 strict field preflight；結果與第 1、2 輪相同。Supabase connector 仍只有 `ProJED` / `ProJED_TEST`，兩者 public schema 都已有 rows，不是 disposable AI_PDM shadow target；本輪未更動任何 task checkbox。此為 blocked 後 resumed audit 第 3 次同條件重複，已達 strict blocked 門檻。
- 2026-06-02：`DEV-FIELD-001` 完成本機 field-test handoff package 與 field issue intake 收斂。`field-test:preflight -- --profile all` 回報 `ready=true`、19 passed / 0 failed / 1 warning；`field-test:handoff` 產生 `data/field-test-handoffs/20260602-090136`；新增 `field-test:issues:import` 與 `qc:field-test-issue-intake`，可將現場 `field-issues.json` dry-run / write 到 `data/quality/defect-register.json`，active P0/P1 會被 `qc:defects-zero` 擋住；`qc:field-test-issue-intake` 11/11 通過。`qc:field-test-handoff-package` 驗證最新 package manifest、README、restore/SW/Document Manager 指令、field issue template/import command、三份 report copy、restore handoff 副本、final QC checklist 與外部文件無舊 package id，QC 53/53 通過。正式 field execution、signed evidence、issue closure 與 `--require-evidence` gate 仍維持外部阻塞。
- 2026-06-02：`DEV-CAD-001` 完成本機 native extractor adapter contract / probe tooling 局部收斂。將 Document Manager mock probe / redaction / path gate fixture 改到 `.tmp/`，避免 Windows / sync client 對 `data/qc-fixtures` 既有檔案覆寫回 EPERM；`qc:native-cad-extractor-contract` 新增 no-extractor fallback branch，證明 Web metadata detect API 在未配置 native extractor 時仍回 200 並提供可操作 warning。QC：`qc:native-cad-extractor-contract` 14/14、`qc:document-manager-extractor-probe` 6/6、`qc:document-manager-probe-redaction` 9/9、`qc:document-manager-probe-path-gate` 4/4 通過；正式 Document Manager / 等效元件授權、真實 CAD 樣本與 `qc:document-manager-report:report` 仍維持外部阻塞。
- 2026-06-02：補齊 `qa:dev-task:sync` 對 `DEV-IND-007` 的 Supabase/Postgres live shadow evidence gate。同步工具現在讀取最新 `data/quality/postgres-shadow/shadow-compare-*.json`，只有 `postgresShadowConfigured=true`、target guard safe、Postgres stats 存在、無 compare error / missing table / RLS missing / mismatch 時，才允許將 `DEV-IND-007` overview 與 live target/migration/compare/RLS/readiness checkbox 同步為 `[x]`；同時收窄 matcher，避免誤改其他任務的風險說明。QC：`qa:dev-task:sync` dry-run 顯示 `supabaseShadowReady=false` 並保留 `DEV-IND-007` blocked；`qc:dev-task-evidence-sync` 13/13 通過；`qc:dev-task-completion-audit` 8/8 通過。
- 2026-06-02：修正 active goal 進度閘門的 task 路徑與同步相容性。`qc:dev-task-completion-audit`、`qc:production-readiness:report`、`qa:dev-task:sync` 現在優先讀取 `.ai-doc/dev_task.md`，保留 legacy `dev_task.md` / `PDM_dev_task.md` fallback；`qa:dev-task:sync` 支援新版 task 表格列 `[!]` -> `[x]` 同步，並忽略 heading/說明文字。新增 `.tmp/` gitignore 供 QC fixture 使用。QC：`qc:dev-task-evidence-sync` 12/12、`qc:dev-task-completion-audit` 8/8、`qc:doc-paths` 20/20、`qc:production-readiness:report` parse pass 並回報 5 個 P0 外部 blocker、`qa:dev-task:sync` dry-run 無 eligible changes、`field-test:preflight -- --profile all --require-evidence` 仍為 19 passed / 3 failed / 1 warning、`lint` 與 `git diff --check` 通過。
- 2026-06-02：同步外部驗證交接文件到目前 `.ai-doc/dev_task.md` 權威路徑。更新 `.ai-doc/reports/pm/external-evidence-handoff-checklist-2026-05-27.md` 與 `.ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md`，補上 2026-06-02 local gate 狀態、`DEV-IND-007` disposable Supabase/Postgres target 決策條件、現有 Supabase projects 不可作 shadow target 的限制，以及外部證據 ready 後應重跑的 completion/readiness/evidence sync 指令。
- 2026-06-01：完成 active goal 剩餘阻塞盤點。`qc:document-manager-report:report` 回報 Document Manager report `ready=false`、15 cases / 0 pass；`field-test:preflight -- --profile all --require-evidence` 回報 19 passed / 3 failed / 1 warning，失敗集中於 CAD real-machine evidence、restore drill evidence、Document Manager evidence。將 `DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001`、`DEV-FIELD-001` 狀態補正為 `[!]` 外部阻塞；`DEV-IND-007` 仍需 disposable Supabase/Postgres target 或 connector re-auth。
- 2026-06-01：續查 `DEV-IND-007` Supabase / Postgres shadow target。Supabase connector 已恢復並列出 `ProJED`、`ProJED_TEST`；兩者 public schema 皆含既有 `profiles/projects/wbs_items/...`，不符合 disposable AI_PDM shadow target。查詢成本：new project `0/monthly`、branch `0.01344/hourly`；本機無 `psql/postgres`，Docker daemon 未啟動。下一步需使用者確認是否在 `JED` organization 建立全新 disposable shadow project 與 region。
- 2026-06-01：`DEV-IND-007` 完成本地 target guard 與 compare traceability 收斂。`compare-sqlite-postgres-shadow` report 新增 `migrationTrace`，記錄 `db/schema.sql`、`db/postgres/001_initial_schema.sql`、`db/postgres/002_supabase_rls_plan.sql` 的 SHA-256；`qc:postgres-shadow` 新增 PG-018 驗證 traceability。QC：`qc:postgres-shadow-target-guard` 10/10 通過，`qc:postgres-shadow` 21/21 通過；live disposable Supabase/Postgres target 仍待使用者確認後建立或提供。
- 2026-06-01：`DEV-UX-005` 完成全系統 UI 屬性視覺層級一致化。Dashboard 表格與明細、Upload 檔案列與送審成功訊息、Handoff 發布卡片、Public Share 發布包/檔案/BOM 來源資訊套用主識別、metadata badge、metadata row、diagnostic value 四層視覺語彙；修正 `.detail-row` CSS 過度套用巢狀 metadata 的問題，SHA256/local path/Drive ID/submission ID 改為等寬診斷值。新增 QA/QC 文件與 `qc:ux-attribute-hierarchy`；`qc:ux-attribute-hierarchy` 31/31、`tsc`、`lint`、`build` 通過，僅有既有 Turbopack tracing warnings。
- 2026-06-01：`DEV-GDRIVE-001` 完成 Google Drive 資料夾樹狀設定。新增 `/api/settings/gdrive/folders` 與 `/api/settings/gdrive/folders/verify`，Admin 可用 Windows Explorer 式樹狀 UI lazy load Google Drive / Shared Drive 資料夾、檢視 path / Folder ID / Drive type / 權限 / 最後驗證時間、指定 pending / released folders、保留手動 Folder ID fallback；設定儲存會阻擋同資料夾、要求已驗證 metadata，audit log 僅記錄 before / after 設定快照且不暴露 token 或 key path。新增 QA/QC 文件；`qc:gdrive-folder-tree-settings` 35/35、`qc:release-folders` 10/10、`qc:pdm-numbering-settings-ui` 22/22、`tsc`、`lint`、`build` 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成主管 diff 審核 UI 收尾並關閉第一版 task。新增 `/bom/reviews` 研發主管審核頁、`/api/bom/drafts/[draftId]/diff` 與 `/api/bom/reviews/pending`，以同 parent item 最新 Released Snapshot 作為 baseline，主管第一畫面顯示新增、移除、數量、階層、版次與排序差異；核准後同頁提供 Released Snapshot XLSX/CSV 匯出連結。新增 QA/QC 文件；`qc:bom-workbench-review-ui` 32/32、`qc:bom-workbench-review-release` 25/25、`lint`、`build`、`git diff --check` 通過，僅有既有 CRLF / Turbopack tracing warnings。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 BOM 工作台 UI 基礎切片。新增 `/bom/workbench` 獨立頁面與 sidebar 導航入口，採左側料號/圖面搜尋、中間 BOM 樹、右側節點屬性的三欄工作台；支援 CAD Draft、SolidWorks XLS 檔案/貼上匯入、搜尋結果拖入子件、數量編輯、虛擬群組、排序/縮排、Undo/Redo、未儲存離開提示、儲存、複製 Draft、設為 Active Draft、Draft 比較與送主管審核。新增 `qc:bom-workbench-ui` Playwright QC，驗證儲存後 PATCH 回應保留 quantity 3 與 child parent_line_id 指向群組；新增 QA/QC 文件；`qc:bom-workbench-ui` 35/35、`qc:bom-workbench-foundation` 27/27、`qc:pdm-numbering-core` 234/234、`tsc`、`lint`、`build` 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 Postgres / Supabase 遷移路徑保留檢查。`BomRepository` contract 補上 `createWorkbenchDraftFromSolidWorksXls` 與 `getImportJobById`，新增 `qc:bom-workbench-migration-path` 靜態 QC，確認 SQLite/Postgres schema 都包含 BOM workbench 與 `file_assets` 表、Postgres import metadata 使用 JSONB、`file_assets` 保留 `supabase_storage` / `storage_key` / `content_hash` / `sync_status`、repository 會寫入 import asset，且第一版仍 SQLite-only、未引入正式 Supabase dependency。新增 QA/QC 文件；`qc:bom-workbench-migration-path` 21/21、`tsc`、`lint`、`git diff --check` 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 SolidWorks BOM XLS 匯入與來源優先權 slice。新增 `/api/bom/drafts/import-xls`，支援 TSV、CSV、Excel HTML、SpreadsheetML 文字型 SolidWorks BOM 匯出，每次匯入建立新的 `solidworks_xls` Draft 並可成為 Active Draft；新增 `createBomWorkbenchDraftFromSolidWorksXls`、`BomXlsImportError`、`getBomImportJobById`，保存原始檔至 repository 並寫入 `file_assets`、`bom_import_jobs`、`bom_import_profiles`、`bom_lines_tree` source metadata、edit event 與 audit log；Postgres shadow schema 補上 `file_assets`。QC 證明 TSV 重複料號版次會合併數量、HTML XLS 可建立第二 Draft 且不覆蓋舊 Draft、人工校正 XLS Draft 後會提升為 `manual` source priority 30、二進位 OLE `.xls` 以 `BOM_XLS_BINARY_UNSUPPORTED` 明確拒絕；新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-solidworks-xls-import` 34/34、`qc:bom-workbench-foundation` 27/27 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成製造 / 採購 Released-only 權限邊界。新增 `Manufacturing`、`Procurement` 使用者角色與既有 SQLite `users` role constraint 自動遷移，BOM Draft routes 改用 `canReadBomDraft` 阻擋 released-only 角色，Released Snapshot export 改用 `canReadBomReleasedSnapshot` 允許正式 BOM 匯出；新增 `qc:bom-workbench-released-only-permission`。QC 證明製造 / 採購可登入，不能讀 pending submission detail，也不能讀取或修改 BOM Draft API，但可匯出 Released BOM CSV；新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-released-only-permission` 31/31、`qc:bom-workbench-review-release` 25/25、`qc:bom-workbench-release-export` 21/21 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 Released Snapshot 匯出。新增 `/api/bom/releases/[releaseId]/export?format=csv|xlsx`，由 `bom_release_snapshots` 輸出固定欄位 CSV 與真正 OOXML zip `.xlsx`，檔名固定為 `BOM_{part_number}_Rev{revision}_{YYYYMMDD}`；新增 `getBomReleaseSnapshotById` repository 查詢與 `qc:bom-workbench-release-export`。QC 證明 CSV/XLSX content type、固定檔名、欄位、子件數量、XLSX zip header/EOCD/workbook parts、unsupported format 400 與 missing snapshot 404；新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-release-export` 21/21 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 release gate / resubmit 補強。`submitBomWorkbenchDraftReview` 新增 `BOM_PENDING_REVIEW_EXISTS` 明確錯誤，release gate issue 補上 `child_status` 與 `latest_released_revision`，新增 `qc:bom-workbench-release-gate-resubmit`。QC 以 HTTP API 證明缺件、Pending、Rejected、Obsolete、非最新版 Released 子件皆在主管核准前被 409 阻擋；同 parent/revision 第二個 PendingReview 回 400；Rejected Draft 可原地修改、`review_attempt` 增為 2、保留退回紀錄並可重新核准發布。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-release-gate-resubmit` 43/43、既有 `qc:bom-workbench-review-release` 25/25 通過。
- 2026-06-01：將 `DEV-BOM-WORKBENCH-001` 引導模式定案決策寫入 task，補齊 BOM 工作台定位、三種建立來源、`manual > solidworks_xls > cad_reference` 來源優先權、多 Draft / Active Draft、Release Gate、Rejected 原地重送、製造 / 採購 Released-only 權限、主管差異審核、Windows 樹狀 UI、虛擬群組、正式匯出與未來 Supabase 遷移保留策略。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 BOM 工作台 review/release slice。新增 `/api/bom/drafts/[draftId]/submit-review`、`/api/bom/reviews/[reviewId]/approve`、`/api/bom/reviews/[reviewId]/reject`，支援送審原因必填、主管核准/退回、Released Snapshot、同 parent/revision 舊 snapshot obsolete，以及缺件 release gate。新增 `qc:bom-workbench-review-release`；QC 證明工程師可送審但不可核准、主管核准後 draft 成為 `Released`、第二次 release 會將前一 snapshot 標記 obsolete、主管退回後 draft 成為 `Rejected`、缺件 approval 回 409。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-review-release` 25/25 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 BOM 工作台 tree-rules slice。新增 `PATCH /api/bom/drafts/[draftId]` 與 `/api/bom/drafts/[draftId]/active`，集中在 repository 驗證虛擬群組、manual tree save、同父層同料號同版次合併、10 層限制與循環阻擋，並記錄 `save_tree` / `set_active` edit event 與 audit。新增 `qc:bom-workbench-tree-rules`；QC 證明 group 無 quantity、重複子件數量合併為 5、BOM PATCH 夾帶 item master 欄位不會改 `items.part_name/current_revision`、超過 10 層與循環皆回 400、Active Draft 可切換且舊 Active 取消。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-tree-rules` 22/22 通過。
- 2026-06-01：`DEV-BOM-WORKBENCH-001` 完成 BOM 工作台 foundation slice。新增 `bom_drafts`、`bom_lines_tree`、`bom_import_profiles`、`bom_import_jobs`、`bom_edit_events`、`bom_review_requests`、`bom_release_snapshots` 與 Postgres shadow schema 對應；新增 `/api/bom/workbench`、`/api/bom/drafts/from-assembly`、`/api/bom/drafts/[draftId]`，保留舊 `bom_headers` / `bom_lines` 相容。新增 `qc:bom-workbench-foundation`；QC 證明 legacy BOM route 未破壞、CAD references 可建立多 Draft、同父層同料號同版次會合併數量、最新 draft 成為 Active 並保留舊 draft、edit event 與 audit log 有紀錄。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:bom-workbench-foundation` 27/27 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成跨角色 audit E2E 收尾，新增 `qc:pdm-numbering-cross-role-audit-e2e`，以主管 scoped batch/task/notification、代理工程師、代送審 payload、影響範圍 marker、批次退回重送與 audit envelope 驗證審核頁、待辦中心、通知中心與 audit 標示一致。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 234/234、`qc:pdm-numbering-cross-role-audit-e2e` 39/39 通過，`DEV-PDM-NUMBERING-001` 第一版 task 全部完成。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成草稿生命週期 QC，新增草稿更新、草稿作廢與逾期草稿管理員確認 API，並新增 `qc:pdm-numbering-draft-lifecycle`。QC 證明 RD/工程師草稿建立、修改、作廢皆不產生審核單，RD 無法執行逾期管理員確認；逾 30 天草稿會轉 `PendingAdminConfirm` 並建立 PDM 管理員待辦與不可關閉通知。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 232/232、`qc:pdm-numbering-draft-lifecycle` 29/29 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成併發占號與不可重用 QC，新增 `qc:pdm-numbering-concurrency-reuse`，以 12 筆並發 HTTP 建號驗證主根號、料號、MA 圖號不撞號，並驗證 pending/未核准、rejected/退回、obsolete/作廢狀態下 root/part/drawing 皆無法直接重複插入且 duplicate-check 回 blocker。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 221/221、`qc:pdm-numbering-concurrency-reuse` 32/32 通過。
- 2026-06-01：將引導模式定案的 `DEV-PDM-NUMBERING-001` 設計決策寫入 task，補齊階段管制、草稿免審、占號不可重用、CAD 先領號限制、DVT 晉升效率、BOM 非強制關聯、同圖多料號、影響文件、MA 圖作廢、override/`!`、後台權限矩陣、代理/代送審、批次審核、系統內通知與未來 Supabase 遷移保留策略。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成使用者角色指派與跨角色權限矩陣 E2E。新增 `user_role_assignments`、管理員 role assignment API/UI、權限判斷套用指派角色與代理角色，並新增 `qc:pdm-numbering-cross-role-permission`。QC 證明 RD 權限關閉後工程師被阻擋，自訂角色指派且排到最高權限後可建號，撤銷後再阻擋；同時驗證 Admin、主管、PDM/system admin 角色、設定頁 UI 與 audit before/after/diff/marker envelope。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 219/219、`qc:pdm-numbering-cross-role-permission` 45/45、`qc:pdm-numbering-permission-guard-ui` 35/35、`qc:pdm-numbering-role-delegation-ui` 24/24 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成資料一致性 QC，新增 `qc:pdm-numbering-data-consistency`，驗證作廢/失效後 root code、part number、drawing number 仍不可重用，MA 圖恢復會保留舊圖 reference 與新圖 primary link，missing-MA override 保留 request/decision/audit marker trace。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 213/213、`qc:pdm-numbering-data-consistency` 16/16 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 API regression QC，新增 `qc:pdm-numbering-api-regression`，以 HTTP API 覆蓋圖料號占號、查重、同圖多料號 variant、查詢/明細 audit trail、MA 圖作廢影響、總表 staging/confirm、審核矩陣與月報 metadata；測試資料清理保留 append-only audit log。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 212/212、`qc:pdm-numbering-api-regression` 26/26 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 audit log append-only 與 before/after/diff 正規化，新增 `audit_logs` update/delete trigger、numbering audit detail normalization、marker detail 輸出與 append-only QC；移除 UI QC 腳本對 audit log 的刪除清理以符合不可竄改要求。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 211/211、`qc:pdm-numbering-approval-review-ui` 25/25 通過。批次退回重送與主管可視範圍的跨角色 audit E2E 仍保留待辦。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成審核/待辦/通知 attention marker，一致標示代理審核、代送審、Override 與影響範圍；審核 DTO 新增 marker 與代理決策識別，待辦/通知 detail 保留 payload 並導向 `/numbering/approvals`。新增 QA/QC 文件；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 204/204、`qc:pdm-numbering-approval-review-ui` 25/25、`qc:pdm-numbering-task-center-ui` 22/22 通過；audit append-only before/after/diff 完整驗證仍保留待辦。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成角色矩陣權限 guard，將 page/action 權限套用到 numbering 可操作 API、permissions route 與 sidebar UI guard，並新增預設 operational permissions、最高權限優先判斷與代理人 scope 權限比對；新增 QA/QC 文件與 `qc:pdm-numbering-permission-guard-ui`。`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 201/201、`qc:pdm-numbering-permission-guard-ui` 35/35 通過；後續仍需補完整跨角色 E2E、資料一致性追溯測試，以及代理審核、代送審、override 與影響範圍在審核/待辦/audit 的一致標示驗證。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成角色權限矩陣後台設定台第二階段，新增角色/頁面/動作權限 API、最高權限排序版本、主管範圍、代理人設定/撤銷與 audit，並將主管範圍與代理人套用到審核批次、待辦與通知可視範圍；新增 QA/QC 文件與 `qc:pdm-numbering-role-delegation-ui`。`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 190/190、`qc:pdm-numbering-role-delegation-ui` 24/24 通過；後續仍需把角色矩陣操作權限套用到所有 API/UI guard，並補齊代理審核、代送審、override 與影響範圍在審核/待辦/audit 的一致標示驗證。
- 2026-06-01：補充 `DEV-PDM-NUMBERING-001` 角色、權限矩陣、主管範圍與代理人設定的 RD/QA/QC 拆解；第一版維持本機資料庫與 J 槽索引，僅預留 Supabase/Postgres 與 Supabase Storage 轉移路徑以控制成本。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 DVT/發行審核頁與側欄入口，新增 approval batch 清單 API、審核 DTO、代送審標示、異常/Override 標示、共用意見、異常項個別意見與批次核准 UI；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 178/178、`qc:pdm-numbering-approval-review-ui` 21/21 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 EVT 到 DVT 晉升清單與側欄入口，新增 `/api/numbering/dvt-candidates` 與 `/numbering/dvt`，支援 DVT gate 分類、完整項目批次送審、`dvt_promotion` approval request/batch、缺 MA 留 EVT 待補、保留 EVT、EVT 停用與作廢；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 172/172、`qc:pdm-numbering-dvt-ui` 23/23 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成圖料號申請精靈與側欄入口，新增 `/api/numbering/records` 與 `/numbering/request`，支援外購/自製/發包/共用件/客製尺寸、查重預檢、客製規格保存、共用件理由強制填寫、先料號後圖號與同步建立 MA/OT 圖號；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 161/161、`qc:pdm-numbering-request-ui` 20/20 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 MA 圖作廢影響範圍頁與側欄入口，支援輸入 MA 圖號與作廢原因、先分析受影響料號/狀態/文件進版待辦、確認後套用失效；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 152/152、`qc:pdm-numbering-impact-ui` 24/24 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成圖料查詢與主根明細頁，新增 `/api/numbering/search`、`/api/numbering/roots/[rootCode]`、`/numbering/search` 與側欄入口，支援關鍵字/類型/狀態/階段篩選、同圖多料號與差異欄位、`!` 提醒、warning、audit trail 與 MA 圖作廢影響分析；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 148/148、`qc:pdm-numbering-search-ui` 24/24 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成總表匯入 UI 與側欄入口，新增 import batch GET 清單 API、CSV/TSV/JSON staging、逐列衝突/待補顯示、檢查報告 JSON 下載與管理員確認；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 141/141、`qc:pdm-numbering-import-center-ui` 22/22 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成圖號稽核報表 UI 與側欄入口，新增 export/monthly report GET 清單 API、月報部門/角色分頁與專案分頁 metadata、手動重產月報、近期報表/近期匯出與 JSON 下載；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 136/136、`qc:pdm-numbering-report-center-ui` 20/20 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成圖號待辦/通知中心 UI 與側欄入口，支援待辦狀態篩選、通知已讀/已處理篩選、風險標示、資訊類通知可處理、待處理/阻擋通知不可關閉，並補上不可關閉通知後端 guard；`qc:pdm-numbering-core` 129/129、`qc:pdm-numbering-task-center-ui` 16/16、`qc:pdm-numbering-settings-ui` 22/22 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成後台審核矩陣設定台，新增 Admin matrix API、規則 upsert/audit、三模板套用、規則版本紀錄、設定頁矩陣表、硬限制 `!` 說明與規則模擬器；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 125/125、`qc:pdm-numbering-settings-ui` 22/22 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成總表匯出三模式與每月報表 metadata/管理員手動重產 API；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 116/116 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成總表匯入 staging、row-level 檢查報告與管理員確認轉正式主檔 API；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 105/105 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 numbering 待辦中心 API、系統內通知 API、已讀/未讀與已處理/未處理狀態；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 96/96 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成送審批次、批次審核與退回項目重送資料流，新增 `/api/numbering/approval-batches` 與 `/api/numbering/approval-batches/[batchId]`；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 82/82 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成審核 rule evaluator、預設 approval rules、不可關閉硬限制與 `rule-simulator` actionCode 模擬；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 72/72 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 `MainDrawingInvalid` 重新送審恢復流程，核准後才恢復料號可用並可重新指定有效 MA 圖；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 68/68 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成 numbering approval request/decision、已發行同圖多料號審核 gate、缺 MA 圖 DVT/Release override action code 與 `/api/numbering/approval-requests`、`/api/numbering/approval-decisions`；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 62/62 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成查重與高相似提醒後端、`duplicate_check_events`、`warning_events` 與 `/api/numbering/duplicate-check`；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 50/50 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成同圖多料號後端服務、DVT/Release MA gate evaluator、MA 圖作廢影響分析與 `/api/numbering/variants`、`/api/numbering/rule-simulator`、`/api/numbering/impact-analysis`；`tsc`、`lint`、`build`、`qc:pdm-numbering-core` 通過。
- 2026-06-01：`DEV-PDM-NUMBERING-001` 完成核心資料模型、交易式占號 repository、rule/template/role seed 與本輪 QA/QC 文件；`lint`、`build`、`qc:pdm-numbering-core` 通過。
- 2026-05-31：建立圖號與料號自動化 spec 並新增 `DEV-PDM-NUMBERING-001`。
- 2026-05-31：重構 `dev_task.md`，保留 active tasks 與未完成 specs，將已完成項目濃縮為 archived index。
- 2026-05-30：建立 BOM 工作台 spec 與 `DEV-BOM-WORKBENCH-001`。
- 2026-05-30：建立 Google Drive 資料夾樹狀設定 spec 與 `DEV-GDRIVE-001`。

## 2026-06-08 Phase 3H Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: async auth user write pilot.
- Added `src/lib/auth-config.ts` to separate auth mode / role typing from the sync DB aggregate.
- Added provider-neutral async user write SQL in `src/lib/repositories/user-async-repository.ts` for upsert, create, and password hash update.
- Added `createUserAsync`, `updateUserPasswordAsync`, and `ensureDemoUserAsync` in `src/lib/auth-async.ts`.
- Updated `/api/auth/login` and `/api/auth/token` so demo/admin seed uses async helpers and the routes no longer import `@/lib/db` for auth mode / seed behavior.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:managed-auth` passed 11/11, and `npx.cmd tsc --noEmit` passed.
- Remaining gates: full runtime provider selection, additional sync API/repository migration, live Supabase staging/prod validation, Supabase advisors, Postgres-mode regression, and rollback evidence.

## 2026-06-08 Phase 3I Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/settings` async runtime wiring.
- Added `src/lib/system-settings-async.ts` as the SQLite fallback bridge to `AsyncSystemSettingsRepository`.
- Added `requireRoleAsync` in `src/lib/auth-async.ts` so admin-only routes can use async auth/session lookup.
- Updated `src/app/api/settings/route.ts` to use async role guard, async settings read/write, and async audit insert; the route no longer imports the sync DB aggregate.
- Expanded `scripts/qc-system-settings-async-repository.mjs` to verify helper wiring, async role guard wiring, forbidden role semantics, settings route async wiring, and SQLite semantic settings SQL.
- Verification: `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run qc:api` passed 391/391 with a temporary local dev server, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, and `npm.cmd run build` passed with the existing Turbopack NFT warning.
- Remaining gates after Phase 3I: additional sync API/repository migration, provider selection beyond SQLite bridge, live Supabase staging/prod validation, Supabase advisors, Postgres-mode regression, and rollback evidence.

## 2026-06-08 Phase 3J Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: async runtime provider selector.
- Added `getAsyncDatabaseClient()` and `closeAsyncDatabaseClient()` in `src/lib/db-async-provider.ts`; async runtime now selects SQLite or Postgres from `PDM_DB_PROVIDER`, `PDM_POSTGRES_URL`, `PDM_POSTGRES_POOLER_MODE`, and `PDM_POSTGRES_MAX_CONNECTIONS`.
- Updated `src/lib/auth-async.ts`, `src/lib/audit-async.ts`, `src/lib/numbering-permission-async.ts`, and `src/lib/system-settings-async.ts` so the already-migrated auth, audit, numbering permission, and settings paths use the runtime async provider selector instead of hard-coded SQLite adapters.
- Updated `.env.example` with `PDM_POSTGRES_MAX_CONNECTIONS=5`.
- Expanded provider and repository QC to verify runtime selector wiring and to stop treating SQLite-only helper wiring as the desired state.
- Verification: `npm.cmd run qc:db-provider-contract` passed 35/35, `npm.cmd run qc:db-provider-postgres` passed 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:pdm-numbering-core` passed 238/238, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3K Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: auth session route async migration.
- Updated `src/app/api/auth/me/route.ts` to use `await getSessionUserAsync(request)` instead of sync `getSessionUser`.
- Updated `src/app/api/auth/logout/route.ts` to use `await getSessionUserAsync(request)` and `await createAuditLogAsync(...)`; logout cookie behavior remains unchanged through `createLogoutCookie()`.
- Expanded `scripts/qc-managed-auth-test.mjs` to verify cookie session `/api/auth/me`, bearer `/api/auth/me`, logout response/cookie clearing, and logout audit writes. Added retrying temp-dir cleanup to avoid Windows EPERM cleanup failures from masking passed QC assertions.
- Expanded `scripts/qc-access-control-async-repository.mjs` to statically verify `auth/me` and `auth/logout` no longer use sync session lookup or `@/lib/db`.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 44/44, `npm.cmd run qc:managed-auth` passed 18/18, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3L Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: settings Google Drive admin route async guard migration.
- Updated `src/app/api/settings/gdrive/folders/route.ts` and `src/app/api/settings/gdrive/folders/verify/route.ts` to use `await requireRoleAsync(request, ["Admin"])` instead of sync `requireRole`.
- Expanded `scripts/qc-system-settings-async-repository.mjs` to statically verify both Google Drive settings subroutes use async admin guard and do not import sync auth or the DB aggregate.
- Updated `scripts/qc-gdrive-folder-tree-settings.mjs` static checks so the Google Drive folder tree QC expects async admin guard while preserving runtime admin/engineer behavior checks.
- Verification: `npm.cmd run qc:system-settings-async-repository` passed 16/16, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3M Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: file metadata detect route async role guard migration.
- Updated `src/app/api/file-metadata/detect/route.ts` to use `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync `requireRole`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-001`, which statically verifies `/api/file-metadata/detect` uses the async role guard and does not import sync auth or the DB aggregate.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 45/45, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `META-001` through `META-004` proved `/api/file-metadata/detect` still returns 200 for an Engineer and preserves native CAD metadata detection behavior.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3N Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: manufacturing handoff route async auth guard migration.
- Updated `src/app/api/handoff/route.ts` and `src/app/api/handoff/export/route.ts` to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Tightened `src/lib/auth-async.ts` result typing with `AsyncAuthResult` and `AsyncRoleResult`, so routes can prove `auth.response === null` implies an authenticated user is present.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-002`, which statically verifies both handoff routes use async auth guard and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 46/46, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` proved unauthenticated handoff requests still return 401, manager handoff returns 200, and CSV export still includes expected release/package data.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3O Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: search and notifications read-only route async auth guard migration.
- Updated `src/app/api/search/route.ts` and `src/app/api/notifications/route.ts` to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-003`, which statically verifies both routes use async auth guard and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 47/47, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` proved unauthenticated search/notifications remain blocked, manager/engineer read paths still return 200, and engineer scoping still excludes other engineers' records.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression with a real target, production cutover, and rollback evidence.

## 2026-06-08 Phase 3P Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: PM development documentation consolidation.
- Added `.ai-doc/reports/pm/supabase-db-migration-master-development-document-2026-06-08.md` as the clean Traditional Chinese master development document.
- Consolidated the full data reset decision, current migration scope, DB-first Supabase architecture, target guard rules, phased implementation plan, validation commands, risk controls, future modification expectations, and completion definition.
- Updated `.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md` and `.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md` so the master document is the primary entry point while the existing PM/RD/QA/QC/SPEC/ADR files remain supporting evidence.
- Supabase official documentation alignment checked for Row Level Security, secure data handling, and shared responsibility model.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Q Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: item revision history and where-used read-only route async auth guard migration.
- Updated `src/app/api/items/[partNumber]/revisions/route.ts` and `src/app/api/items/[partNumber]/where-used/route.ts` to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Kept `listItemRevisionHistory` and `listWhereUsed` query behavior unchanged for this slice; repository async migration for these queries remains a later step.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-004`, which statically verifies both item routes use async auth guard and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 48/48, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` proved unauthenticated blocking, manager visibility, engineer scoping, and empty where-used behavior after the async guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3R Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: procurement releases integration read-only route async role guard migration.
- Updated `src/app/api/integrations/procurement/releases/route.ts` to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])` instead of sync `requireAuth` plus local role branching.
- Kept `listManufacturingHandoffEntries`, released payload filtering, package/file/BOM/approval mapping, and response schema unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-005`, which statically verifies the procurement releases route uses async role guard and does not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` proved unauthenticated blocking, Engineer 403, Manager 200, package/file/BOM payload shape, redaction, `partNumber` filtering, and future `since` empty-result behavior after the async role guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3S Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering permissions matrix route async auth guard hardening.
- Updated `src/app/api/numbering/permissions/route.ts` to use `await requireAuthAsync(request)` while preserving `checkNumberingPermissionAsync`, the parallel permission matrix evaluation, and the response contract `{ generatedAt, pages, actions }`.
- Expanded `scripts/qc-access-control-async-repository.mjs` `ACCESS-ASYNC-012` so the static gate verifies both async auth and async permission service wiring, and rejects sync auth import regression.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:pdm-numbering-permission-guard-ui` passed 35/35, `npm.cmd run qc:pdm-numbering-cross-role-permission` passed 45/45, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:pdm-numbering-permission-guard-ui` covered enable/disable behavior, sidebar visibility, backend 403 guard, and `/api/numbering/permissions` reads; `qc:pdm-numbering-cross-role-permission` covered Admin, R&D Manager, custom role assignment, delegation, revocation, and permission matrix parity through `/api/numbering/permissions`.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3T Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: procurement sync-runs route async role guard migration.
- Updated `src/app/api/integrations/procurement/sync-runs/route.ts` and `src/app/api/integrations/procurement/sync-runs/[runId]/route.ts` to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])` instead of sync `requireAuth` plus route-local role branching.
- Updated `src/lib/auth-async.ts` `AsyncRoleResult` to a discriminated union and re-exported `forbidden`, allowing migrated async guarded routes to keep existing 403 semantics without importing the sync auth module.
- Kept `listProcurementSyncRuns`, `createProcurementSyncRun`, `decideProcurementSyncRun`, released-submission checks, payload shape, and acknowledgement behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-006`, which statically verifies procurement sync-run routes use async role guard and do not import sync auth or keep the route-local role helper.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 50/50, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` proved unauthenticated blocking, Engineer 403, Pending submission 409, Manager create/list/acknowledge behavior, package payload preservation, external reference preservation, and duplicate acknowledgement 409 after the async role guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3U Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: chat route async auth guard migration.
- Updated `src/app/api/chat/route.ts` to use `await requireAuthAsync(request)` and import `forbidden` from `@/lib/auth-async`, so chat session lookup no longer imports the sync auth module.
- Kept `answerPdmQuestion`, `createLlmConversation`, `getLlmConversation`, `addLlmMessage`, conversation ownership checks, source payloads, and cross-user 403 behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-007`, which statically verifies `/api/chat` uses async auth guard, preserves `forbidden()`, and does not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 51/51, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, and `npm.cmd run build` passed with the existing Turbopack NFT warning.
- Runtime route evidence: after warming the temporary local dev server, `npm.cmd run qc:api` passed 391/391; `AUTH-012` and `AI-009` through `AI-021` proved unauthenticated chat blocking, conversation creation, message append, source lists, conversation continuation, cross-user 403, whitelisted/non-whitelisted tool behavior, and policy RAG behavior after the async auth guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3V Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission file download and PDF preview route async auth guard migration.
- Replaced the separate file download and preview handlers with `src/app/api/submissions/[id]/files/[...filePath]/route.ts`, which uses `await requireAuthAsync(request)` and preserves both `/api/submissions/[id]/files/[fileId]` download and `/api/submissions/[id]/files/preview/[fileId]` PDF preview URLs.
- Kept `getStoredSubmissionFile`, `buildFileResponse`, attachment download disposition, inline PDF preview disposition, PDF content type behavior, and non-PDF preview `415` behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-008`, which statically verifies the catch-all submission file route uses async auth guard, preserves stored-file lookup, supports attachment download and inline PDF preview modes, and does not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 52/52, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` proved unauthenticated file download remains 401, file download returns 200 with attachment disposition, and PDF preview returns 200 with `application/pdf` plus inline disposition after the async auth guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3W Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission discussions and review issues route async auth guard migration.
- Updated `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, and `src/app/api/submissions/[id]/issues/[issueId]/route.ts` to use `await requireAuthAsync(request)` and import `forbidden` from `@/lib/auth-async`.
- Kept `getSubmission`, `canReadSubmission`, `listDiscussionComments`, `createDiscussionComment`, `resolveDiscussionComment`, `listReviewIssues`, `createReviewIssue`, `resolveReviewIssue`, file ownership checks, assignee validation, and response status behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-009`, which statically verifies discussion/issue routes use async auth guard, preserve their domain helpers, and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 53/53, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` proved unauthenticated blocking, create/list/resolve behavior, file metadata exposure, cross-submission file validation, manager/team visibility, and engineer cross-submission 403 behavior after the async auth guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3X Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission change request route async auth and role guard migration.
- Updated `src/app/api/submissions/[id]/changes/route.ts` GET to use `await requireAuthAsync(request)` and POST to use `await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"])`; updated `src/app/api/submissions/[id]/changes/[changeId]/route.ts` PATCH to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Kept `getSubmission`, `canReadSubmission`, `listChangeRequests`, `createChangeRequest`, `decideChangeRequest`, ECR/ECO/ECN validation, manager decision behavior, and duplicate-decision conflict behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-010`, which statically verifies change routes use async auth/role guards, preserve change request helpers, and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 54/54, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHANGE-001` through `CHANGE-017` proved unauthenticated blocking, validation errors, Engineer ECR/ECN create, Manager ECO create, change list behavior, Engineer decision 403, Manager approval, decision metadata, duplicate-decision 409, and engineer cross-submission 403 behavior after the async guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Y Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission phase gate route async auth and role guard migration.
- Updated `src/app/api/submissions/[id]/phase-gates/route.ts` GET to use `await requireAuthAsync(request)` and POST to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`; updated `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts` PATCH to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Kept `getSubmission`, `canReadSubmission`, `listPhaseGateChecks`, `initializePhaseGateChecks`, `buildPhaseGateSummary`, `getPhaseGateCheck`, `decidePhaseGateCheck`, phase gate decision validation, required-check blocking, and duplicate-decision conflict behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-011`, which statically verifies phase gate routes use async auth/role guards, preserve phase gate helpers, and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 55/55, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PHASE-001` through `PHASE-013` proved unauthenticated blocking, Engineer 403, Manager initialization, default required check count, approval blocking while open, Manager decisions, ready summary, duplicate-decision 409, and release flow after required checks are completed.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Z Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission approval matrix route async auth and role guard migration.
- Updated `src/app/api/submissions/[id]/approval-matrix/route.ts` GET to use `await requireAuthAsync(request)` and POST to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`; updated `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts` PATCH to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Kept `getSubmission`, `canReadSubmission`, `refreshApprovalMatrixRequirements`, `initializeApprovalMatrixRequirements`, `buildApprovalMatrixSummary`, `parseRequirements`, `getApprovalMatrixRequirement`, `waiveApprovalMatrixRequirement`, required-role validation, waiver flow, and matrix release gating unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-012`, which statically verifies approval matrix routes use async auth/role guards, preserve approval matrix helpers, and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 56/56, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning after a clean rerun, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `MATRIX-001` through `MATRIX-015` proved unauthenticated blocking, Engineer 403, Manager initialization, default matrix count/open roles, Manager/Admin approval progression, release after required roles approve, Admin waiver, and manager-only release after waiver.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AA Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission preflight lock route async role guard migration.
- Updated `src/app/api/submissions/preflight-lock/route.ts` POST to use `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync `requireRole`.
- Kept request parsing, drawing/part number validation, `findActiveItemLockForSubmissionIdentifiers`, `locked`, `lockedByCurrentUser`, `matchedBy`, and `lock` response fields unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-013`, which statically verifies the preflight lock route uses async role guard, preserves active-lock lookup helpers, and does not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 57/57, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` proved unauthenticated preflight remains 401, owner preflight returns 200 with `lockedByCurrentUser=true`, and other engineer preflight exposes active lock ownership with `lockedByCurrentUser=false`.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AB Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission checkout route async role guard migration.
- Updated `src/app/api/submissions/[id]/checkout/route.ts` POST and DELETE to use `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync `requireRole`.
- Kept `getSubmission`, `canReadSubmission`, `createItemLock`, `releaseItemLock`, reason/hour validation, conflict payload, `reused`, admin force release, and `released` response behavior unchanged for this slice.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-014`, which statically verifies the checkout route uses async role guards for both acquire and release paths, preserves lock helpers, and does not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 58/58, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` proved unauthenticated checkout remains 401, Manager remains 403, Engineer can acquire/reuse lock, competing checkout returns 409 with owner, and Engineer can release lock.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AC Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission approve/reject route async role guard migration plus file preview route stabilization.
- Updated `src/app/api/submissions/[id]/approve/route.ts` and `src/app/api/submissions/[id]/reject/route.ts` POST handlers to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])` instead of sync `requireRole`.
- Kept approve behavior unchanged: Pending-only checks, duplicate reviewer decision blocking, active sandbox blocking, required phase gate blocking, approval matrix blocking, multi-reviewer pending/release flow, cloud release invocation, release package creation, lifecycle obsolete marking, and ReleaseFailed handling.
- Kept reject behavior unchanged: Pending-only check, duplicate reviewer decision blocking, `addApproval`, `updateSubmissionStatus`, reject reason/comment handling, and audit log creation.
- Stabilized file delivery by replacing the old sibling/nested file routes with `src/app/api/submissions/[id]/files/[...filePath]/route.ts`; the route keeps both public URL shapes and fixes the observed Next runtime 404 for `/files/preview/[fileId]`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-015` for approve/reject and updated `ROUTE-AUTH-ASYNC-008` for the catch-all file route.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 59/59, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and redirected `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-002`, `WF-001` through `WF-010`, `PKG-001`, `FILE-003` through `FILE-005`, `PHASE-006`, `PHASE-013`, `MATRIX-011`, and `MATRIX-015` proved role denial, approve/reject status gates, two-reviewer release, package creation, PDF inline preview, phase gate blocking, approval matrix blocking, and release progression.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AD Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: release package, read-only share, and supplier response route async guard migration.
- Updated `src/app/api/submissions/[id]/release-package/route.ts` GET to use `await requireAuthAsync(request)` while preserving `getSubmission`, `canReadSubmission`, released/obsolete package gates, ZIP response headers, and release package file read behavior.
- Updated `src/app/api/submissions/[id]/shares/route.ts` GET/POST and `src/app/api/submissions/[id]/shares/[shareId]/route.ts` PATCH to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])` instead of sync auth plus route-local `canManageShares`.
- Updated `src/app/api/submissions/[id]/supplier-responses/route.ts` GET and `src/app/api/submissions/[id]/supplier-responses/[responseId]/route.ts` PATCH to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])` instead of sync auth plus route-local `canManageSupplierPortal`.
- Kept share/supplier behavior unchanged: submission visibility checks, Released-only share creation, package-required gate, share token creation/list redaction/revoke, supplier response list/close, duplicate close 409, and public portal behavior.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-016`, which statically verifies release package async auth and share/supplier async role guards while rejecting sync auth import regressions.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 60/60, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and redirected `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PKG-003` through `PKG-008`, `SHARE-001` through `SHARE-014`, and `SUPPLIER-006` through `SUPPLIER-011` proved unauthenticated package/share blocking, Manager package download, Engineer share/supplier denial, Manager share create/list/revoke, public share package behavior, Manager supplier response list/close, and duplicate close conflict behavior.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AE Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: AI submission summary and AI risk route async auth guard migration.
- Updated `src/app/api/submissions/[id]/ai-summary/route.ts` and `src/app/api/submissions/[id]/ai-risks/route.ts` GET handlers to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Kept AI route behavior unchanged: `getSubmission`, `canReadSubmission`, `scopedSubmittedBy`, `buildAiSubmissionSummary`, `buildAiRiskReport`, Engineer own-submission access, Manager access, and cross-engineer 403 scoping.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-017`, which statically verifies both AI routes use async auth guard, preserve summary/risk helpers, and do not import sync auth.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 61/61, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and redirected `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `SUMMARY-001` through `SUMMARY-012` and `RISK-001` through `RISK-011` proved unauthenticated blocking, Engineer/Manager access, cross-engineer denial, traceable BOM/Where-used AI sources, missing handoff/file risks, Released filename conflict risk detection, and Pending status preservation.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AF Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission list, create, and detail route async auth/role guard migration.
- Updated `src/app/api/submissions/route.ts` GET to use `await requireAuthAsync(request)` and POST to use `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync auth helpers.
- Updated `src/app/api/submissions/[id]/route.ts` GET to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Kept core submission behavior unchanged: pagination/status filtering, `scopedSubmittedBy`, dashboard metrics scoping, form/file validation, duplicate drawing/revision 409, CAD reference parsing, local file save/cleanup, background Google Drive upload, detail visibility check, and cross-engineer 403.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-018`, which statically verifies the list/create/detail routes use async guards, preserve critical helper calls, and avoid sync auth imports.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 62/62, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning after a clean rerun, `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches, `npm.cmd run qc:postgres-shadow` passed 22/22, and redirected `qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` covered unauthenticated submissions list blocking, positive submission create, submission input/file validation failures, duplicate drawing/revision conflict, Engineer list scoping, Engineer cross-submission detail denial, and Manager detail access after the async guard migration.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression against a real target, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AG Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission BOM materialize/read/diff/export route async auth guard migration.
- Updated `src/app/api/submissions/[id]/bom/route.ts`, `src/app/api/submissions/[id]/bom/diff/route.ts`, and `src/app/api/submissions/[id]/bom/export/route.ts` GET handlers to use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Kept BOM behavior unchanged: submission visibility through `canReadSubmission`, BOM materialization from CAD references, existing BOM read, missing BOM 404/409 handling, previous/explicit base diff selection, CSV export, XLS Spreadsheet XML export, filename sanitization, content type headers, UTF-8 BOM CSV output, and cross-engineer 403.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-019`, which statically verifies the three submission BOM routes use async auth, preserve critical BOM helper calls, and avoid sync auth imports.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 63/63, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches, `npm.cmd run qc:postgres-shadow` passed 22/22, and redirected `qc:api` passed 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `BOM-001` through `BOM-013`, `BOMEXPORT-001` through `BOMEXPORT-010`, and `BOMDIFF-001` through `BOMDIFF-013` proved unauthenticated blocking, Engineer own BOM materialize/read/export/diff, Manager read/export/diff, CSV/XLS export contract, missing BOM errors, explicit diff base, and cross-engineer 403 after the async guard migration.
- Remaining gates: additional sync API/repository migration, BOM repository async conversion, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression against a real target, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AH Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: PM-dev replanned development documentation after full data reset.
- Added `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md` as the current first-read master development document.
- Documented current baseline: old `submission_files` / `release_packages` / QC artifacts are test-like and are not migrated; `file_assets` has no rows; Supabase DB migration starts from clean schema and controlled seed.
- Documented implementation strategy: DB-first, Supabase Storage follow-up, dedicated `AI_PDM_STAGING` / `AI_PDM_PROD` targets, target guard against `ProJED` / `ProJED_TEST`, server API boundary, SQLite fallback, Phase 0-6 gates, risk register, future modification policy, and completion definition.
- Updated `.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md` to list the 2026-06-09 replanned document as the first PM entry.
- Updated `.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md` with a Phase 3AH PM addendum.
- Updated this `dev_task` entry with the new master document link and RD checklist item.
- Status remains in progress: live Supabase staging/prod validation, advisor/RLS evidence, Postgres-mode regression against a real target, production cutover, rollback drill, and Storage follow-up are still open.

## 2026-06-09 Phase 3AI Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: BOM workbench, draft, review, and release export route async guard migration.
- Updated `src/app/api/bom/workbench/route.ts`, `src/app/api/bom/drafts/from-assembly/route.ts`, `src/app/api/bom/drafts/import-xls/route.ts`, `src/app/api/bom/drafts/[draftId]/route.ts`, `src/app/api/bom/drafts/[draftId]/active/route.ts`, `src/app/api/bom/drafts/[draftId]/diff/route.ts`, `src/app/api/bom/drafts/[draftId]/submit-review/route.ts`, and `src/app/api/bom/releases/[releaseId]/export/route.ts` to use `await requireAuthAsync(request)`.
- Updated `src/app/api/bom/reviews/pending/route.ts`, `src/app/api/bom/reviews/[reviewId]/approve/route.ts`, and `src/app/api/bom/reviews/[reviewId]/reject/route.ts` to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`; removed route-local review role comparisons.
- Kept behavior unchanged: `canReadBomDraft`, `canReadSubmission`, `canReadBomReleasedSnapshot`, workbench summary, create-from-assembly, SolidWorks XLS import, draft detail/save/active/diff/submit-review, pending review list, approve/reject release gates, CSV/XLSX release export, edit events, audit logs, and released-only Manufacturing/Procurement export access.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-020`, which statically verifies the 11 BOM workbench/draft/review/release routes use async guards, preserve critical BOM helpers, remove manual review role checks, and avoid sync auth imports.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 64/64, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches, `npm.cmd run qc:postgres-shadow` passed 22/22, `npm.cmd run qc:bom-workbench-foundation` passed 27/27, `npm.cmd run qc:bom-workbench-tree-rules` passed 22/22, `npm.cmd run qc:bom-workbench-release-gate-resubmit` passed 43/43, `npm.cmd run qc:bom-workbench-solidworks-xls-import` passed 34/34, `npm.cmd run qc:bom-workbench-release-export` passed 21/21, `npm.cmd run qc:bom-workbench-review-release` passed 25/25, `npm.cmd run qc:bom-workbench-released-only-permission` passed 31/31, and redirected `qc:api` passed 391/391 with a temporary local dev server.
- Remaining gates: additional sync API/repository migration, BOM repository async conversion, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode regression against a real target, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AJ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission auxiliary routes plus numbering approval batch detail route async guard migration.
- Updated `src/app/api/submissions/[id]/reuse-candidates/route.ts` and `src/app/api/submissions/[id]/duplicate-geometry/route.ts` to use `await requireAuthAsync(request)` while preserving `canReadSubmission`, `scopedSubmittedBy`, `listDesignReuseCandidates`, and `listDuplicateGeometryCandidates`.
- Updated `src/app/api/submissions/[id]/retry-upload/route.ts` to use `await requireRoleAsync(request, ["R&D Manager", "Admin"])`, `await getSystemSettingAsync("gdrive_pending_folder_id")`, and `await createAuditLogAsync(...)` while preserving pending folder fallback, `getFilesNeedingUpload`, upload retry, status update, and success/failure response behavior.
- Updated `src/app/api/submissions/[id]/sandbox/route.ts` and `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts` to use async auth/role guards while preserving sandbox list/create/detail/merge/promote/close behavior, branch ownership check, `canReadSubmission`, and merge preview.
- Updated `src/app/api/submissions/[id]/pdf-markups/route.ts` and `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts` to use `await requireAuthAsync(request)` while preserving PDF-only validation, coordinate validation, create/list/resolve behavior, and cross-submission scoping.
- Updated `src/app/api/numbering/approval-batches/[batchId]/route.ts` to use `await requireNumberingPageAsync(request, "numbering.approvals")` and `await canUserUseNumberingActionAsync(...)` while preserving batch read, decide, item comments, resubmit rejected items, reviewer role fallback, and permission denial behavior.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-021` for submission auxiliary routes and `ROUTE-AUTH-ASYNC-022` for numbering approval batch detail route.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 66/66, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:pdm-numbering-core` passed 238/238, `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches, `npm.cmd run qc:postgres-shadow` passed 22/22, `npm.cmd run build` passed with the existing Turbopack NFT warning, and redirected `qc:api` passed 391/391 with a temporary local dev server.
- Static cleanup evidence: `rg -n 'requireAuth\(|requireRole\(|from ["'']@/lib/auth["'']' src\app\api -g 'route.ts'` returned no matches, so direct sync auth imports/calls are now cleared from API route files.
- Runtime route evidence: `qc:api` covered `SANDBOX-001` through `SANDBOX-019`, `MARKUP-001` through `MARKUP-012`, `REUSE-001` through `REUSE-010`, duplicate geometry checks, retry/upload-adjacent submission flows, and full API auth regression after the async guard migration.
- Remaining gates: numbering routes still contain sync numbering permission guard calls (`requireNumberingPage`, `requireNumberingAction`, `canUserUseNumberingAction`) outside this detail route, domain repositories still require async conversion, BOM repository async conversion remains open, live Supabase staging/prod validation is not configured, and advisor/RLS, Postgres-mode regression, cutover, and rollback evidence remain required.

## 2026-06-09 Phase 3AK Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering and numbering-adjacent parts API permission guard async migration.
- Updated all remaining `src/app/api/numbering/**/route.ts` sync numbering permission guard usages to `requireNumberingPageAsync`, `requireNumberingActionAsync`, or `canUserUseNumberingActionAsync` with `await`.
- Also updated numbering-adjacent parts routes under `src/app/api/parts/[partNumber]/**` to async numbering permission guards, covering part detail, attachments, attachment sync/delete, variant update, and cost profile create routes.
- Repointed the remaining API-local `forbidden` helper imports in `numbering/admin/matrix` and `numbering/approval-decisions` from `@/lib/auth` to `@/lib/auth-async`, clearing direct sync auth imports from API routes.
- Expanded `scripts/qc-access-control-async-repository.mjs` with recursive route scans and `ROUTE-AUTH-ASYNC-023` / `ROUTE-AUTH-ASYNC-024`, which fail if numbering or numbering-adjacent parts API routes reintroduce sync numbering permission guards.
- Verification: `rg -n 'requireAuth\(|requireRole\(|from ["'']@/lib/auth["'']|requireNumberingPage\(|requireNumberingAction\(|canUserUseNumberingAction\(' src\app\api -g 'route.ts'` returned no matches; `npm.cmd run qc:access-control-async-repository` passed 68/68; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:managed-auth` passed 18/18; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:pdm-numbering-core` passed 238/238; `npm.cmd run db:postgres:compare -- --no-write` passed with 64 SQLite tables and 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT warning; `npm.cmd run qc:api` passed 391/391 with a temporary local server that was stopped and cleaned afterward.
- Current local state: API route files no longer contain direct sync auth imports/calls or sync numbering permission guard calls. Remaining gates are async conversion for remaining sync domain repositories, live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression against a real target, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 DEV-SUPABASE-DB-001 PM-dev Documentation Addendum

- Status: `[/] In Progress`.
- Added executable development document: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- PM decision: after full `data` reset, Supabase migration starts from clean schema and controlled seed; old test-like local files, release packages, QC artifacts, handoff packages, backups, and the tracked defect register are not migrated.
- Architecture decision: DB runtime migration comes before Supabase Storage; browser traffic continues through Next.js server APIs; secrets remain server-side; SQLite remains fallback and rollback baseline.
- Completed local gates: migration mirror, target guard, async DB provider foundation, async auth/audit/settings/user/access-control pilots, and API route guard migration through Phase 3AK.
- Still open: provider-neutral async domain repository conversion, real `AI_PDM_STAGING` / `AI_PDM_PROD` validation, Supabase advisors/RLS evidence, Postgres-mode API regression, production cutover, rollback drill, and Storage follow-up.
- Next recommended DEV slice: Phase 3AL item revision history and where-used async/provider-neutral repository conversion.

## 2026-06-09 Phase 3AL Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: item revision history and where-used provider-neutral async repository conversion.
- Added `src/lib/repositories/item-insight-async-repository.ts` with `AsyncItemInsightRepository`, `SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL`, and `SELECT_ASYNC_WHERE_USED_SQL`.
- Added `src/lib/item-insights-async.ts` runtime wrapper using `getAsyncDatabaseClient`.
- Updated `src/app/api/items/[partNumber]/revisions/route.ts` and `src/app/api/items/[partNumber]/where-used/route.ts` to await async helpers instead of importing sync helpers from `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-025` and `ITEM-INSIGHT-ASYNC-001` through `ITEM-INSIGHT-ASYNC-006`, including SQLite semantic checks for revision ordering, submittedBy scoping, where-used case-insensitive lookup, outdated child detection, and quantity preservation.
- Verification: item route sync DB search returned no matches; `npm.cmd run qc:access-control-async-repository` passed 75/75; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:managed-auth` passed 18/18; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:api` passed 391/391 with a temporary local server that was stopped and cleaned afterward.
- Current local state: item revision history and where-used routes no longer depend on sync DB helpers. Remaining gates are broader async/provider-neutral domain repository conversion, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AM Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: dashboard metrics read-only provider-neutral async repository conversion.
- Added `src/lib/repositories/dashboard-async-repository.ts` with `AsyncDashboardRepository` and `SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL`.
- Added `src/lib/dashboard-metrics-async.ts` runtime wrapper using `getAsyncDatabaseClient`.
- Updated `src/app/api/submissions/route.ts` GET response to await `getDashboardMetricsAsync(submittedBy)` while keeping submission list/create/write paths on existing sync repositories for later bounded slices.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-026` and `DASHBOARD-METRICS-ASYNC-001` through `DASHBOARD-METRICS-ASYNC-005`, including in-memory SQLite semantic checks for all-status counts and submittedBy scoping.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 81/81; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run in this slice because the local runtime DB had just been reset and `qc:api` repopulates `P-QC-*` test submissions.
- Current local state: `/api/submissions` dashboard metrics no longer use the sync `getDashboardMetrics` helper. Remaining gates are async/provider-neutral conversion for submission list/search/write paths and other domain repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AN Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission list read-only provider-neutral async repository conversion.
- Added `src/lib/repositories/submission-list-async-repository.ts` with `AsyncSubmissionListRepository`, SQLite/Postgres SQL constants, provider-specific aggregate handling, pagination, status filter, submittedBy scoping, release-package flag, active-lock flag, and numeric aggregate normalization.
- Added `src/lib/submissions-async.ts` runtime wrapper using `getAsyncDatabaseClient`.
- Updated `/api/submissions` GET list path to await `listSubmissionsAsync({ status, submittedBy, limit: limit + 1, offset })` while preserving pagination, `hasMore`, dashboard metrics, authentication scoping, and existing POST/write behavior for later bounded slices.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-027` and `SUBMISSION-LIST-ASYNC-001` through `SUBMISSION-LIST-ASYNC-005`, including in-memory SQLite semantic checks for newest-first ordering, file count/roles, release package flag, active lock flag, status filter, submittedBy filter, limit, and offset.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 87/87; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run in this slice because the local runtime DB had just been reset and `qc:api` repopulates `P-QC-*` test submissions.
- Current local state: `/api/submissions` GET dashboard metrics and submission list reads no longer use sync DB helpers. Remaining gates are async/provider-neutral conversion for `searchSubmissions`, submission detail/create/write/upload paths, BOM, numbering, release, collaboration, attachment, and AI repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AO Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/search` submission search read-only provider-neutral async repository conversion.
- Extended `src/lib/repositories/submission-list-async-repository.ts` with `searchSubmissions(...)`, `SELECT_ASYNC_SUBMISSION_SEARCH_SQLITE`, `SELECT_ASYNC_SUBMISSION_SEARCH_POSTGRES`, portable named-parameter filter building, file-reference search, submittedBy scoping, finder filters, child part/drawing filters, and provider-neutral BOM issue filters without SQLite-only `datetime(...)` or `rowid`.
- Extended `src/lib/submissions-async.ts` with `searchSubmissionsAsync(...)` using `getAsyncDatabaseClient`.
- Updated `src/app/api/search/route.ts` to import `searchSubmissionsAsync` from `@/lib/submissions-async` and await it while preserving auth, query threshold, filters, scopedSubmittedBy, and `{ submissions }` response shape.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-028` and `SUBMISSION-SEARCH-ASYNC-001` through `SUBMISSION-SEARCH-ASYNC-006`, including in-memory SQLite semantic checks for file query search, status/submittedBy/finder filters, child part filter, and outdated BOM filter.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 94/94; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run in this slice because the local runtime DB had just been reset and `qc:api` repopulates `P-QC-*` test submissions; business tables remained at 0 after validation.
- Current local state: `/api/search` no longer imports `@/lib/db` or calls sync `searchSubmissions`. Remaining gates are async/provider-neutral conversion for submission detail/create/write/upload paths, BOM, numbering, release, collaboration, attachment, and AI repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AP Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/submissions/[id]` submission detail read-only provider-neutral async repository conversion.
- Extended `src/lib/repositories/submission-list-async-repository.ts` with `getSubmission(...)`, provider-neutral detail SQL constants, files, file references, approvals, audit logs, active lock, release package, BOM header, and BOM line loading through `AsyncDatabaseClient`.
- Extended `src/lib/submissions-async.ts` with `getSubmissionAsync(id)` using `getAsyncDatabaseClient`.
- Updated `src/app/api/submissions/[id]/route.ts` GET to await `getSubmissionAsync(id)` instead of importing sync `getSubmission` from `@/lib/db`.
- Preserved behavior: async auth guard, `canReadSubmission`, 404 behavior, `{ submission }` response shape, file/reference/approval/audit/release-package detail payload, active-lock flag, and BOM detail payload.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `ROUTE-AUTH-ASYNC-029` and `SUBMISSION-DETAIL-ASYNC-001` through `SUBMISSION-DETAIL-ASYNC-006`, including in-memory SQLite semantic checks for full detail payload, files, active lock, release package, references, approvals, audit, BOM, and missing detail handling.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 101/101; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, and `item_locks` remained at 0 after validation.
- Current local state: `/api/submissions/[id]` GET no longer imports `@/lib/db` or calls sync `getSubmission`. Remaining gates are submission create/write/upload paths, submission file/download routes, BOM, numbering, release, collaboration, attachment, and AI repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AQ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission file metadata read/update provider-neutral async repository conversion.
- Added `src/lib/repositories/submission-file-async-repository.ts` with `AsyncSubmissionFileRepository`, provider-neutral file lookup, upload queue lookup, and Google Drive status update SQL constants.
- Added `src/lib/submission-files-async.ts` runtime helper using `getAsyncDatabaseClient`.
- Updated `src/lib/file-response.ts` to use `getSubmissionAsync` and `getSubmissionFileAsync` before reading local bytes, preserving authorization, repository-root containment, content type, content disposition, and private no-store headers.
- Updated `src/app/api/submissions/[id]/retry-upload/route.ts` to use `getSubmissionAsync`, `getFilesNeedingUploadAsync`, and `updateFileGDriveStatusAsync` while preserving pending folder lookup, Google Drive retry loop, audit logging, and success/failure response behavior.
- Updated `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/discussions/route.ts`, and `src/app/api/submissions/[id]/issues/route.ts` so file validation and submission authorization use async helpers; existing collaboration write/list helpers remain sync for later bounded slices.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `SUBMISSION-FILE-ASYNC-001` through `SUBMISSION-FILE-ASYNC-007`, covering repository boundary, runtime helper, file-response boundary, route wiring, in-memory SQLite file lookup, upload queue, and status update semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 108/108; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, and `pdf_markups` remained at 0 after validation.
- Current local state: file download/preview metadata, retry upload metadata, PDF markup file validation, discussion file validation, and issue file validation no longer use sync submission file helpers. Remaining gates are submission create/write/upload, collaboration write/list repositories, BOM, numbering, release, attachment, and AI repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AR Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: collaboration discussion, review issue, and PDF markup list/create/resolve provider-neutral async repository conversion.
- Added `src/lib/repositories/collaboration-async-repository.ts` with `AsyncCollaborationRepository`, provider-neutral SQL constants for discussion comments, review issues, PDF markups, and audit-backed create/resolve operations.
- Added `src/lib/collaboration-async.ts` runtime helper using `getAsyncDatabaseClient`.
- Extended `src/lib/auth-async.ts` with `getUserByIdAsync` so issue assignee validation no longer imports sync auth/DB helpers.
- Updated `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, `src/app/api/submissions/[id]/issues/[issueId]/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, and `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts` to use async collaboration helpers while preserving auth, authorization, validation, and response shapes.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `COLLABORATION-ASYNC-001` through `COLLABORATION-ASYNC-008`, including static route/repository checks and in-memory SQLite create/list/resolve/audit semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 116/116; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: discussion, review issue, and PDF markup collaboration routes no longer import `@/lib/db` or call sync collaboration helpers. Remaining gates are submission create/write/upload, change request, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AS Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: change request list/create/decide provider-neutral async repository conversion.
- Extended `src/lib/repositories/collaboration-async-repository.ts` with `SELECT_ASYNC_CHANGE_REQUESTS_SQL`, `INSERT_ASYNC_CHANGE_REQUEST_SQL`, `DECIDE_ASYNC_CHANGE_REQUEST_SQL`, and async change request list/get/create/decide methods with audit-backed writes.
- Extended `src/lib/collaboration-async.ts` with `listChangeRequestsAsync`, `getChangeRequestAsync`, `createChangeRequestAsync`, and `decideChangeRequestAsync`.
- Updated `src/app/api/submissions/[id]/changes/route.ts` and `src/app/api/submissions/[id]/changes/[changeId]/route.ts` to use `getSubmissionAsync` and async change request helpers; both routes now avoid direct sync `@/lib/db` imports.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `CHANGE-REQUEST-ASYNC-001` through `CHANGE-REQUEST-ASYNC-007`, including static route/repository checks and in-memory SQLite create/list/decide/audit semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 123/123; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: change request routes no longer import `@/lib/db` or call sync change request helpers. Remaining gates are submission create/write/upload, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AT Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: phase gate list/initialize/decide provider-neutral async repository conversion.
- Extended `src/lib/repositories/collaboration-async-repository.ts` with `DEFAULT_ASYNC_PHASE_GATE_CHECKS`, `SELECT_ASYNC_PHASE_GATE_CHECKS_SQL`, `INSERT_ASYNC_PHASE_GATE_CHECK_SQL`, `DECIDE_ASYNC_PHASE_GATE_CHECK_SQL`, async list/get/initialize/decide methods, open-required helper, and audit-backed phase gate writes.
- Extended `src/lib/collaboration-async.ts` with `listPhaseGateChecksAsync`, `getPhaseGateCheckAsync`, `initializePhaseGateChecksAsync`, `decidePhaseGateCheckAsync`, and `listOpenRequiredPhaseGateChecksAsync`.
- Updated `src/app/api/submissions/[id]/phase-gates/route.ts` and `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts` to use `getSubmissionAsync` plus async phase gate helpers; both routes now avoid direct sync `@/lib/db` imports.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `PHASE-GATE-ASYNC-001` through `PHASE-GATE-ASYNC-007`, including static route/repository checks and in-memory SQLite list/decide/audit semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 130/130; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: phase gate routes no longer import `@/lib/db` or call sync phase gate helpers. Remaining gates are submission create/write/upload, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AU Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: approval matrix list/initialize/refresh/waive provider-neutral async repository conversion.
- Added `src/lib/repositories/approval-async-repository.ts` with `AsyncApprovalRepository`, default approval matrix requirements, provider-neutral SQL constants, list/get/initialize/refresh/waive/open-required methods, automatic satisfied refresh behavior, and audit-backed initialize/waive writes.
- Added `src/lib/approval-async.ts` runtime helper using `getAsyncDatabaseClient`.
- Updated `src/app/api/submissions/[id]/approval-matrix/route.ts` and `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts` to use `getSubmissionAsync` plus async approval matrix helpers; both routes now avoid direct sync `@/lib/db` imports.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `APPROVAL-MATRIX-ASYNC-001` through `APPROVAL-MATRIX-ASYNC-007`, including static route/repository checks and in-memory SQLite list/approved-count/refresh/waive/audit semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 137/137; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: approval matrix routes no longer import `@/lib/db` or call sync approval matrix helpers. Remaining gates are submission create/write/upload, approve/reject release decision flows, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AV Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: reject release decision flow provider-neutral async repository conversion.
- Extended `src/lib/repositories/approval-async-repository.ts` with approval decision SQL constants and async `addApproval`, `reviewerHasDecision`, and `getApprovalSummary` methods.
- Extended `src/lib/approval-async.ts` with `addApprovalAsync`, `reviewerHasDecisionAsync`, and `getApprovalSummaryAsync`.
- Added `src/lib/repositories/submission-status-async-repository.ts` and `src/lib/submission-status-async.ts` for the bounded reject status update path.
- Updated `src/app/api/submissions/[id]/reject/route.ts` to use `getSubmissionAsync`, async approval decision helpers, `rejectSubmissionAsync`, and `createAuditLogAsync`; the route no longer imports `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `APPROVAL-DECISION-ASYNC-001` through `APPROVAL-DECISION-ASYNC-005` plus `SUBMISSION-STATUS-ASYNC-001` and `SUBMISSION-STATUS-ASYNC-002`, including static route/repository checks and in-memory SQLite decision/reject/audit semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 144/144; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, `bom_release_snapshots`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: reject decision flow no longer imports `@/lib/db` or calls sync approval/status/audit helpers. Remaining gates are submission create/write/upload, approve release decision flow, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AW Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: approve release decision flow provider-neutral async repository conversion.
- Extended `src/lib/repositories/submission-status-async-repository.ts` and `src/lib/submission-status-async.ts` with active sandbox lookup, releasing/failure updates, released lifecycle update, previous release obsolete update, and obsolete audit insertion.
- Added `src/lib/repositories/release-async-repository.ts` and `src/lib/release-records-async.ts` for release package lookup/upsert and released filename conflict lookup.
- Added async release service wrappers in `src/lib/release-async.ts` and `src/lib/release-package-async.ts`.
- Updated `src/app/api/submissions/[id]/approve/route.ts` to use async submission, approval, collaboration blocker, status, release, package, and audit helpers; the route no longer imports `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with approve-release static records and SQLite semantic checks for active sandbox, filename conflict, releasing/failure updates, package upsert, and released/obsolete lifecycle behavior.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 153/153; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; business, BOM, approval, collaboration, release, and sandbox runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: approve decision flow no longer imports `@/lib/db` or calls sync approval/status/release/package/audit helpers. Remaining gates are submission create/write/upload, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AX Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/submissions` POST create/write provider-neutral async repository conversion.
- Added `src/lib/repositories/submission-write-async-repository.ts` with `AsyncSubmissionWriteRepository`, provider-neutral SQL constants, drawing/revision duplicate lookup, item upsert, submission insert, submission file insert, file reference insert, submit audit insert, and BOM header/line materialization from assembly component references.
- Extended `src/lib/submissions-async.ts` with `submissionRevisionExistsAsync` and `createSubmissionRecordAsync`.
- Updated `src/app/api/submissions/route.ts` POST and background upload status flow to use async submission write, system setting, and submission file helpers; the route no longer imports sync `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `SUBMISSION-WRITE-ASYNC-001` through `SUBMISSION-WRITE-ASYNC-008`, including static provider-neutral route/repository checks and in-memory SQLite duplicate, item upsert, file/reference/audit, and BOM materialization semantics.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 161/161; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: `/api/submissions` list, metrics, and create/write paths no longer import `@/lib/db` or call sync submission write/file/settings helpers. Remaining gates are BOM workbench/domain repositories, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-09 Phase 3AY Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/workbench` GET summary read provider-neutral async repository conversion.
- Added `src/lib/repositories/bom-workbench-async-repository.ts` with `AsyncBomWorkbenchRepository`, provider-neutral SQL constants for workbench parent lookup, draft summary list, draft detail lookup, and draft line lookup.
- Added `src/lib/bom-workbench-async.ts` runtime helpers through `getAsyncDatabaseClient`.
- Updated `src/app/api/bom/workbench/route.ts` to use `getSubmissionAsync` and `getBomWorkbenchBySubmissionIdAsync`; the route no longer imports sync `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with `BOM-WORKBENCH-ASYNC-001` through `BOM-WORKBENCH-ASYNC-008`, including static provider-neutral route/repository checks and in-memory SQLite parent/draft/active-line/missing-row semantics.
- Verification: `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 169/169; `npm.cmd run lint -- --quiet` passed; `npm.cmd run db:postgres:compare -- --no-write` passed with 64/64 table coverage and no mismatches; `npm.cmd run qc:postgres-shadow` passed 22/22; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Data hygiene: full `qc:api` was intentionally not run because it repopulates local `P-QC-*` submissions; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Current local state: `/api/bom/workbench` no longer imports `@/lib/db` or calls sync `getSubmission` / `getBomWorkbenchBySubmissionId`. Remaining gates are BOM draft create/save/active/diff/review/release/export paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3AZ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/[draftId]/active` active draft mutation provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.setActiveDraft(...)` with provider-neutral SQL constants for active draft deactivation/activation, `bom_edit_events` insertion, and `audit_logs` insertion.
- Added `setBomWorkbenchActiveDraftAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `src/app/api/bom/drafts/[draftId]/active/route.ts` to use async auth, async submission lookup, async BOM draft lookup, and async active draft mutation; the route no longer imports sync `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with active draft route static wiring checks and in-memory SQLite semantic verification for active draft switching, previous active draft deactivation, edit event evidence, and audit log evidence.
- Added RD evidence report: `.ai-doc/reports/rd/rd-bom-active-draft-async-provider-report-2026-06-12.md`.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 171/171; `npx.cmd tsc --noEmit` passed; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:bom-workbench-foundation` passed 27/27; `npm.cmd run qc:bom-workbench-tree-rules` passed 22/22; `npm.cmd run qc:bom-workbench-review-release` passed 25/25; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Runtime note: BOM HTTP regressions were run on temporary `next dev` at `127.0.0.1:3003` because an existing port 3000 dev server accepted TCP but timed out on `/login`; the temporary 3003 listener was stopped after validation.
- Current local state: `/api/bom/workbench` and `/api/bom/drafts/[draftId]/active` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/diff/review/release/export paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BA Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/[draftId]/diff` draft diff read provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.getDraftDiff(...)` with provider-neutral latest release snapshot lookup and async draft line comparison.
- Added `getBomWorkbenchDraftDiffAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `src/app/api/bom/drafts/[draftId]/diff/route.ts` to use async auth, async submission lookup, async BOM draft lookup, and async draft diff lookup; the route no longer imports sync `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with diff route static wiring checks, latest release snapshot SQL extraction, and in-memory SQLite baseline snapshot semantic verification.
- Added RD evidence report: `.ai-doc/reports/rd/rd-bom-draft-diff-async-provider-report-2026-06-12.md`.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 173/173; `npm.cmd run lint -- --quiet` passed; `npm.cmd run qc:bom-workbench-review-release` passed 25/25; `npm.cmd run qc:bom-workbench-review-ui` passed 32/32; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- Runtime note: BOM HTTP regressions were run on temporary `next dev` at `127.0.0.1:3004`; the temporary 3004 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, and `/api/bom/drafts/[draftId]/diff` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/from-assembly/import-xls/submit-review/review approve/reject/pending/release-export paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BB Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/reviews/pending` pending review list provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.listPendingReviews(...)` with provider-neutral pending review SQL and async diff payload composition.
- Added `listPendingBomWorkbenchReviewsAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `src/app/api/bom/reviews/pending/route.ts` to use the async helper; the route no longer imports sync `@/lib/db`.
- Expanded `scripts/qc-access-control-async-repository.mjs` with pending review route static wiring checks and in-memory SQLite semantic verification for review metadata, submitter display name, parent/draft metadata, and diff baseline lookup.
- Added RD evidence report: `.ai-doc/reports/rd/rd-bom-pending-reviews-async-provider-report-2026-06-12.md`.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 175/175; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-review-ui` passed 32/32.
- Runtime note: BOM review UI regression was run on temporary `next dev` at `127.0.0.1:3005`; the temporary 3005 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, and `/api/bom/reviews/pending` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/from-assembly/import-xls/submit-review/review approve/reject/release-export paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BC Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/releases/[releaseId]/export` release snapshot export provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.getReleaseSnapshotById(...)`, `SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL`, and shared release snapshot parsing for by-id snapshot reads.
- Added `getBomReleaseSnapshotByIdAsync(...)` and rewired the release export route to use async snapshot and submission helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with release export route wiring checks and an in-memory SQLite semantic gate for release snapshot lookup by id.
- RD evidence: [.ai-doc/reports/rd/rd-bom-release-export-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-release-export-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 177/177; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-release-export` passed 21/21.
- Runtime note: BOM release export regression was run on temporary `next dev` at `127.0.0.1:3006`; the temporary 3006 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/reviews/pending`, and `/api/bom/releases/[releaseId]/export` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/from-assembly/import-xls/submit-review/review approve/reject paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BD Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/reviews/[reviewId]/reject` review rejection provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.getReviewById(...)`, `AsyncBomWorkbenchRepository.rejectReview(...)`, `SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`, `REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL`, and `REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`.
- Added `getBomWorkbenchReviewByIdAsync(...)` and `rejectBomWorkbenchReviewAsync(...)`, then rewired the reject route to use async review, draft, submission, and reject helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with reject route wiring checks and an in-memory SQLite semantic gate proving draft status, review decision metadata, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-review-reject-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-review-reject-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 179/179; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-review-release` passed 25/25.
- Runtime note: BOM review release regression was run on temporary `next dev` at `127.0.0.1:3007`; the temporary 3007 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/reviews/pending`, `/api/bom/releases/[releaseId]/export`, and `/api/bom/reviews/[reviewId]/reject` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/from-assembly/import-xls/submit-review/review approve paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BE Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/[draftId]/submit-review` draft review submission provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.submitReview(...)`, `SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL`, `SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL`, and `INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`.
- Added `submitBomWorkbenchDraftReviewAsync(...)`, then rewired the submit-review route to use async draft, submission, and submit-review helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with submit-review route wiring checks and an in-memory SQLite semantic gate proving pending conflict lookup, review_attempt increment, review request insert, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-submit-review-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-submit-review-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 181/181; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-review-release` passed 25/25.
- Runtime note: BOM review release regression was run on temporary `next dev` at `127.0.0.1:3008`; the temporary 3008 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/reviews/pending`, `/api/bom/releases/[releaseId]/export`, `/api/bom/reviews/[reviewId]/reject`, and `/api/bom/drafts/[draftId]/submit-review` no longer import `@/lib/db`. Remaining gates are BOM draft create/save/from-assembly/import-xls/review approve paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BF Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/[draftId]` draft detail read and manual tree save provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.saveDraftTree(...)`, child item lookup SQL, draft line delete/insert SQL, and draft summary update SQL.
- Ported draft tree normalization into the async repository, preserving duplicate id, missing parent, cycle/depth, sibling merge, and deterministic ordering behavior.
- Added `saveBomWorkbenchDraftTreeAsync(...)`, then rewired the draft detail/save route to use async draft, submission, and save helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with draft route wiring checks and an in-memory SQLite semantic gate proving line replacement, item lookup, draft update, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-draft-save-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-draft-save-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 183/183; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-review-release` passed 25/25.
- Runtime note: BOM review release regression was run on temporary `next dev` at `127.0.0.1:3009`; the temporary 3009 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/drafts/[draftId]`, `/api/bom/reviews/pending`, `/api/bom/releases/[releaseId]/export`, `/api/bom/reviews/[reviewId]/reject`, and `/api/bom/drafts/[draftId]/submit-review` no longer import `@/lib/db`. Remaining gates are BOM draft create/from-assembly/import-xls/review approve paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BG Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/from-assembly` draft creation from CAD assembly references provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.createDraftFromAssembly(...)`, assembly reference lookup SQL, and workbench draft insert SQL.
- Ported assembly-reference merge behavior into the async repository, preserving child part/revision grouping, quantity summing, active draft deactivation, child item lookup, `create_from_assembly` edit event, and `BomWorkbenchDraftCreated` audit evidence.
- Added `createBomWorkbenchDraftFromAssemblyAsync(...)`, then rewired the from-assembly route to use async submission and draft-creation helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with from-assembly route wiring checks and an in-memory SQLite semantic gate proving draft insert, line insert, source reference traceability, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-draft-from-assembly-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-draft-from-assembly-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed; `npx.cmd tsc --noEmit` passed; `npm.cmd run qc:access-control-async-repository` passed 185/185; `npm.cmd run lint -- --quiet` passed; `npm.cmd run build` passed with the existing Turbopack NFT tracing warning; `npm.cmd run qc:bom-workbench-foundation` passed 27/27.
- Runtime note: BOM workbench foundation regression was run on temporary `next dev` at `127.0.0.1:3010`; the temporary 3010 listener was stopped after validation.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/drafts/[draftId]`, `/api/bom/drafts/from-assembly`, `/api/bom/reviews/pending`, `/api/bom/releases/[releaseId]/export`, `/api/bom/reviews/[reviewId]/reject`, and `/api/bom/drafts/[draftId]/submit-review` no longer import `@/lib/db`. Remaining gates are BOM draft import-xls/review approve paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BH Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/reviews/[reviewId]/approve` review approval / release snapshot provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.approveReview(...)`, async `BomReleaseGateError`, release gate submission SQL, latest released child revision SQL, prior snapshot/draft obsoletion SQL, release snapshot insert SQL, draft release SQL, and review approval SQL.
- Ported release gate behavior into the async repository: missing child item, missing child revision, child not released, and child outdated revision still block approval with `BOM_RELEASE_GATE_BLOCKED`.
- Added `approveBomWorkbenchReviewAsync(...)`, then rewired the approve route to use async review, draft, submission, and approval helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with approve route wiring checks and an in-memory SQLite semantic gate proving gate lookup, review approval, draft release, snapshot insertion, prior snapshot/draft obsoletion, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-review-approve-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-review-approve-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 187/187, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.
- Runtime verification: `npm.cmd run qc:bom-workbench-review-release` passed 25/25 and `npm.cmd run qc:bom-workbench-release-gate-resubmit` passed 43/43 against temporary `next dev` at `127.0.0.1:3011`; the 3011 listener was stopped afterward.
- Current local state: `/api/bom/workbench`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/drafts/[draftId]`, `/api/bom/drafts/from-assembly`, `/api/bom/reviews/pending`, `/api/bom/releases/[releaseId]/export`, `/api/bom/reviews/[reviewId]/approve`, `/api/bom/reviews/[reviewId]/reject`, and `/api/bom/drafts/[draftId]/submit-review` no longer import `@/lib/db`. Remaining gates are BOM draft import-xls path, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BI Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/bom/drafts/import-xls` SolidWorks XLS draft import provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository.createDraftFromSolidWorksXls(...)`, async `BomXlsImportError`, import profile SQL, import job SQL, file asset insert SQL, and parser/file-save helpers for tab-delimited / CSV, Excel HTML, and SpreadsheetML text exports.
- Preserved existing import semantics: binary `.xls` explicit rejection, duplicate part/revision row merge, default `solidworks_bom_default` profile, original repository file write, `file_assets` metadata, `solidworks_xls` source priority 20, active draft switching, `import_solidworks_xls` edit event, and `BomWorkbenchDraftImported` audit.
- Added `createBomWorkbenchDraftFromSolidWorksXlsAsync(...)`, then rewired the import-xls route to use async submission and import helpers instead of direct `@/lib/db` imports.
- Expanded `qc:access-control-async-repository` with import-xls route wiring checks and an in-memory SQLite semantic gate proving profile, file asset, import job, draft line, edit event, and audit log writes.
- RD evidence: [.ai-doc/reports/rd/rd-bom-draft-import-xls-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-bom-draft-import-xls-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 189/189, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.
- Runtime verification: `npm.cmd run qc:bom-workbench-solidworks-xls-import` passed 34/34 against temporary `next dev` at `127.0.0.1:3012`; the 3012 listener was stopped afterward.
- Route scan: `rg -n '@/lib/db|from "@/lib/db"' src/app/api/bom` returned no matches. All current BOM API routes are now free of direct `@/lib/db` imports.
- Remaining gates are numbering, release package/share/supplier/sandbox, attachment, AI, remaining non-BOM sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BJ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/notifications` provider-neutral async read conversion.
- Added `AsyncNotificationRepository`, async notification SQL constants, and `src/lib/notifications-async.ts` so release failure, pending review, upload failure, missing release package, and active lock notifications are read through `AsyncDatabaseClient`.
- Rewired `/api/notifications` to use `listNotificationsAsync(...)` and `summarizeNotifications(...)` instead of direct `@/lib/db` imports while preserving the Admin / R&D Manager storage evidence alert and `{ notifications, summary }` response contract.
- Expanded `qc:access-control-async-repository` with notification route wiring checks, sync DB import denial, SQL constant extraction, in-memory SQLite semantic notification coverage, and engineer scope enforcement.
- RD evidence: [.ai-doc/reports/rd/rd-notifications-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-notifications-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 194/194, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.
- Runtime verification: manager login returned 200 and `/api/notifications` returned 200 with `summary` and `notifications` against temporary `next dev` at `127.0.0.1:3013`; the 3013 listener was stopped afterward. This local smoke wrote only the normal login/session/audit side effects.
- Current local state: all current BOM API routes and `/api/notifications` are free of direct `@/lib/db` imports.
- Remaining gates are handoff, procurement, supplier/share/sandbox, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI/chat, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BK Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/handoff`, `/api/handoff/export`, and `/api/integrations/procurement/releases` provider-neutral async read conversion.
- Added `AsyncHandoffRepository` and `listManufacturingHandoffEntriesAsync(...)` so manufacturing handoff release ids are selected through `AsyncDatabaseClient`, then detailed rows are hydrated through the existing async submission detail repository.
- Rewired the handoff JSON route, handoff CSV export route, and procurement releases integration route to use `@/lib/handoff-async` instead of direct `@/lib/db` imports.
- Preserved existing contracts: latest Released submission per item, engineer submittedBy scoping through `scopedSubmittedBy(...)`, R&D Manager / Admin procurement access, handoff JSON shape, CSV export header/body, and procurement `schema_version=1` payload.
- Expanded `qc:access-control-async-repository` with handoff static route/repository checks and in-memory SQLite semantic coverage for latest release selection, superseded release exclusion, submittedBy scope, and limit behavior.
- RD evidence: [.ai-doc/reports/rd/rd-handoff-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-handoff-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 199/199, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.
- Runtime verification: manager login returned 200; `/api/handoff`, `/api/handoff/export`, and `/api/integrations/procurement/releases?limit=5` returned 200 against temporary `next dev` at `127.0.0.1:3014`; the 3014 listener was stopped afterward. This local smoke wrote only the normal login/session/audit side effects.
- Current local state: all current BOM API routes, `/api/notifications`, `/api/handoff`, `/api/handoff/export`, and `/api/integrations/procurement/releases` are free of direct `@/lib/db` imports.
- Remaining gates are procurement sync-run write/decision routes, supplier/share/sandbox, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI/chat, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BL Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/integrations/procurement/sync-runs` list/create and `/api/integrations/procurement/sync-runs/[runId]` decision provider-neutral async conversion.
- Extended `AsyncReleaseRepository` with provider-neutral procurement sync-run list/get/insert/decision SQL and same-client async audit writes for `ProcurementSyncSent`, `ProcurementSyncAcknowledged`, and `ProcurementSyncFailed`.
- Extended `release-records-async.ts` with `listProcurementSyncRunsAsync(...)`, `createProcurementSyncRunAsync(...)`, and `decideProcurementSyncRunAsync(...)`.
- Rewired procurement sync-run routes to use async release helpers and `getSubmissionAsync(...)` instead of direct `@/lib/db` imports.
- Preserved route behavior: R&D Manager / Admin guard, target-system validation, submission read guard, Released-only guard, release-package-required guard, sent-only acknowledge/fail guard, payload shape, and audit actions.
- Expanded `qc:access-control-async-repository` with procurement sync-run static route/repository checks and in-memory SQLite semantic coverage for create/list/get/filter/decision/audit behavior.
- RD evidence: [.ai-doc/reports/rd/rd-procurement-sync-runs-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-procurement-sync-runs-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 204/204, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.
- Runtime verification: manager login returned 200; procurement sync-run GET returned 200; POST returned 201 with `status=sent`; PATCH acknowledge returned 200 with `status=acknowledged`; filtered GET returned the created run against temporary `next dev` at `127.0.0.1:3015`; the 3015 listener was stopped afterward. This local smoke wrote one normal procurement sync-run and its acknowledge/audit side effects.
- Current local state: all current BOM API routes, `/api/notifications`, `/api/handoff`, `/api/handoff/export`, `/api/integrations/procurement/releases`, and procurement sync-run routes are free of direct `@/lib/db` imports.
- Remaining gates are supplier/share/sandbox, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI/chat, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BM Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: `/api/chat` LLM conversation/message persistence provider-neutral async conversion.
- Added `AsyncAiRepository` with provider-neutral `llm_conversations` / `llm_messages` SQL for conversation create/get, message insert, and conversation timestamp update.
- Added `src/lib/ai-async.ts` helper methods: `createLlmConversationAsync(...)`, `getLlmConversationAsync(...)`, and `addLlmMessageAsync(...)`.
- Rewired `/api/chat` to persist conversations and messages through async helpers instead of direct `@/lib/db` imports while preserving `requireAuthAsync(...)`, cross-user conversation denial, answer generation, source payload, and `{ answer, sources, conversationId }` contract.
- Expanded `qc:access-control-async-repository` with `AI-CHAT-ASYNC-001` through `AI-CHAT-ASYNC-005`, covering static async repository/helper/route wiring and SQLite semantic conversation create/get/message timestamp behavior.
- RD evidence: [.ai-doc/reports/rd/rd-chat-conversation-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-chat-conversation-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 209/209, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime verification: manager login returned 200; first `POST /api/chat` returned `conversationId=f1cd1512-8cf2-4efa-a409-4ff60f949135`, `answer`, and one source; second `POST /api/chat` with the same `conversationId` returned the same `conversationId`; temporary `next dev` at `127.0.0.1:3016` was stopped afterward. This local smoke wrote one normal chat conversation and its user/assistant message rows.
- Current local state: all current BOM API routes, `/api/notifications`, `/api/handoff`, `/api/handoff/export`, `/api/integrations/procurement/releases`, procurement sync-run routes, and `/api/chat` conversation persistence are free of direct `@/lib/db` imports.
- Remaining gates are supplier/share/sandbox, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI grounding/tooling internals under `src/lib/chat.ts` and related helpers, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BN Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: supplier response and public share response provider-neutral async conversion.
- Extended `AsyncReleaseRepository` with provider-neutral readonly-share token lookup and supplier response list/get/create/close SQL.
- Extended `src/lib/release-records-async.ts` with `getReadonlyShareByTokenHashAsync(...)`, `listSupplierPortalResponsesAsync(...)`, `createSupplierPortalResponseAsync(...)`, and `closeSupplierPortalResponseAsync(...)`.
- Added `src/lib/readonly-share-async.ts`; public share validation now avoids importing the synchronous `readonly-share.ts` module and uses `getSubmissionAsync(...)`.
- Rewired `/api/submissions/[id]/supplier-responses`, `/api/submissions/[id]/supplier-responses/[responseId]`, and `/api/public/shares/[token]/responses` away from direct `@/lib/db` imports.
- Preserved route behavior: R&D Manager / Admin guard, submission read guard, public token validation, Released + release-package requirement, response create/list/close payload shape, and `SupplierPortalResponseCreated` / `SupplierPortalResponseClosed` audit actions.
- Expanded `qc:access-control-async-repository` with `SUPPLIER-RESPONSE-ASYNC-001` through `SUPPLIER-RESPONSE-ASYNC-005`, covering static async wiring and SQLite semantic share lookup, response create/list/filter/close, and audit behavior.
- RD evidence: [.ai-doc/reports/rd/rd-supplier-response-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supplier-response-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 214/214, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime verification: manager login returned 200; released submission with package was discovered via API; management share creation returned a token; public supplier response POST returned `status=open`; management supplier response GET returned the created response; management supplier response PATCH returned `status=closed` and `closed_by=user-manager-demo` against temporary `next dev` at `127.0.0.1:3017`; the 3017 listener was stopped afterward. This local smoke wrote normal share, supplier response, close, and audit side effects.
- Current local state: all current BOM API routes, `/api/notifications`, `/api/handoff`, `/api/handoff/export`, `/api/integrations/procurement/releases`, procurement sync-run routes, `/api/chat` conversation persistence, and supplier response routes are free of direct `@/lib/db` imports.
- Remaining gates are share create/revoke route persistence, share serialization/package routes, sandbox routes, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI grounding/tooling internals under `src/lib/chat.ts` and related helpers, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-12 Phase 3BO Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: readonly share create/list/revoke provider-neutral async conversion.
- Extended `AsyncReleaseRepository` with provider-neutral readonly share list/token lookup/insert/revoke SQL and same-client async audit writes for `ReadonlyShareCreated` and `ReadonlyShareRevoked`.
- Extended `src/lib/release-records-async.ts` with `listReadonlySharesAsync(...)`, `createReadonlyShareAsync(...)`, and `revokeReadonlyShareAsync(...)`.
- Extended `src/lib/readonly-share-async.ts` with token generation, token hashing, public URL building, and public share validation without importing the synchronous `readonly-share.ts` module.
- Rewired `/api/submissions/[id]/shares` and `/api/submissions/[id]/shares/[shareId]` away from direct `@/lib/db` imports and toward `getSubmissionAsync(...)` plus async share helpers.
- Preserved route behavior: R&D Manager / Admin guard, submission read guard, Released-only share creation, release-package-required guard, share token/public URL response, revoke response shape, and readonly share audit actions.
- Expanded `qc:access-control-async-repository` with `READONLY-SHARE-ASYNC-001` through `READONLY-SHARE-ASYNC-005`, covering static async wiring and SQLite semantic share create/list/revoke/audit behavior.
- RD evidence: [.ai-doc/reports/rd/rd-readonly-share-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-readonly-share-async-provider-report-2026-06-12.md)
- Verification: `node --check scripts/qc-access-control-async-repository.mjs`, `npx.cmd tsc --noEmit`, `npm.cmd run qc:access-control-async-repository` 219/219, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime verification: manager login returned 200; released submission with package was discovered via API; share POST returned share id, token, and public URL; share GET returned the created share with `status=active`; share PATCH returned `status=revoked` and `revoked_by=user-manager-demo` against temporary `next dev` at `127.0.0.1:3018`; the 3018 listener was stopped afterward. This local smoke wrote normal share create/revoke and audit side effects.
- Current local state: all current BOM API routes, `/api/notifications`, `/api/handoff`, `/api/handoff/export`, `/api/integrations/procurement/releases`, procurement sync-run routes, `/api/chat` conversation persistence, readonly share routes, and supplier response routes are free of direct `@/lib/db` imports.
- Remaining gates are public share serialization/package routes, sandbox routes, submission legacy BOM routes, numbering routes/repositories, parts/cost/attachments, AI grounding/tooling internals under `src/lib/chat.ts` and related helpers, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Supabase Storage follow-up.

## 2026-06-11 Phase 5E Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: Supabase target create request gate.
- Added `scripts/generate-file-storage-schema-target-create-request.mjs` and `storage:schema-target-create-request`; it consumes target cost and explicit user confirmation evidence and emits a connector execution request only when both are clean.
- Added `scripts/qc-file-storage-schema-target-create-request.mjs` and `qc:file-storage-schema-target-create-request`, covering missing cost package, missing/blocked user evidence, confirmed project request, branch source-project guard, output files, PM evidence, no connector side effects, and credential marker redaction.
- Generated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/supabase-target-create-request.json/md`; current status is `blocked_user_cost_not_confirmed`, `readyForConnectorExecution=false`, and `connectorPlan=[]`.
- Updated `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` so the actual provisioning evidence folder must include the blocked create request before passing QC.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-target-create-request.mjs`, `node --check scripts/qc-file-storage-schema-target-create-request.mjs`, and `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-create-request` passed 17/17.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 23/23.
- Verification: regressions passed with `qc:file-storage-schema-user-cost-confirmation-evidence` 17/17, `qc:file-storage-schema-formal-review-package` 18/18, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5F Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: target create result evidence gate.
- Added `scripts/generate-file-storage-schema-target-create-result-evidence.mjs` and `storage:schema-target-create-result-evidence`; it consumes target create request evidence and refreshed Supabase project inventory.
- Added `scripts/qc-file-storage-schema-target-create-result-evidence.mjs` and `qc:file-storage-schema-target-create-result-evidence`, covering missing create request, blocked create request, missing inventory, target-not-found inventory, verified target inventory, output files, PM evidence, no connector side effects, and credential marker redaction.
- Generated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/supabase-target-create-result-evidence.json/md`; current status is `blocked_create_request_not_ready`, `verifiedTargetCount=0`, and `readyForTargetReadinessGate=false`.
- Updated `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` so the actual provisioning evidence folder must include blocked create result evidence before passing QC.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-target-create-result-evidence.mjs`, `node --check scripts/qc-file-storage-schema-target-create-result-evidence.mjs`, and `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-create-result-evidence` passed 14/14.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 26/26.
- Verification: regression `npm.cmd run qc:file-storage-schema-target-create-request` passed 17/17.
- Verification: regression `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5G Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: connector receipt evidence gate.
- Added `scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs` and `storage:schema-target-connector-receipt-evidence`; it records evidence for Supabase `confirm_cost` and `create_project` / `create_branch` receipts without calling connector APIs.
- Added `scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs` and `qc:file-storage-schema-target-connector-receipt-evidence`, covering missing create request, blocked create request, missing confirm receipt, missing create receipt, mismatched receipt, recorded receipt, create-result compatibility, output files, PM evidence, no connector side effects, and credential marker redaction.
- Updated `scripts/generate-file-storage-schema-target-create-result-evidence.mjs` so a ready create request must also provide recorded connector receipt evidence before refreshed inventory can verify the target.
- Generated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/supabase-target-connector-receipt-evidence.json/md`; current status is `blocked_create_request_not_ready`, `receiptRecorded=false`, and `readyForCreateResultEvidence=false`.
- Regenerated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/supabase-target-create-result-evidence.json/md` with connector receipt input; current status remains `blocked_create_request_not_ready`.
- Updated `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` so the actual provisioning evidence folder must include blocked connector receipt evidence before passing QC.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs`, `node --check scripts/qc-file-storage-schema-target-connector-receipt-evidence.mjs`, `node --check scripts/generate-file-storage-schema-target-create-result-evidence.mjs`, and `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-connector-receipt-evidence` passed 15/15.
- Verification: `npm.cmd run qc:file-storage-schema-target-create-result-evidence` passed 15/15.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 29/29.
- Verification: regressions passed with `qc:file-storage-schema-formal-review-package` 18/18 and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5H Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: formal review provisioning-result integration.
- Updated `scripts/generate-file-storage-schema-formal-review-package.mjs` with `--target-create-result-evidence`; formal review now requires `supabase-target-create-result-evidence` status `target_created_inventory_verified` and `verifiedTargetCount > 0`.
- Updated `scripts/qc-file-storage-schema-formal-review-package.mjs`; formal review QC now covers missing target create result evidence and blocked target create result evidence.
- Regenerated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/storage-schema-formal-review-package.json/md` with `--target-create-result-evidence`; current formal review records `targetCreateResult.status=blocked_create_request_not_ready`.
- Updated `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` so the actual provisioning evidence folder must prove formal review records the blocked target create result.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-formal-review-package.mjs`, `node --check scripts/qc-file-storage-schema-formal-review-package.mjs`, and `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-formal-review-package` passed 20/20.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 30/30.
- Verification: regression `npm.cmd run qc:file-storage-schema-target-connector-receipt-evidence` passed 15/15.
- Verification: regression `npm.cmd run qc:file-storage-schema-target-create-result-evidence` passed 15/15.
- Verification: regression `npm.cmd run qc:doc-paths` passed 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5I Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: target provisioning execution package.
- Added `scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs` and `storage:schema-target-provisioning-execution-package`; it combines target create request, connector receipt evidence, and target create result evidence into a single execution-state handoff.
- Added `scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs` and `qc:file-storage-schema-target-provisioning-execution-package`, covering blocked create request, ready connector execution, receipt recorded but inventory pending, verified target provisioning, output files, PM evidence, no connector side effects, and credential marker redaction.
- Generated `.ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11/supabase-target-provisioning-execution-package.json/md`; current status is `blocked_create_request_not_ready` and `readyForConnectorExecution=false`.
- Updated `scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` so the actual provisioning evidence folder must include the execution package and prove it remains blocked while user cost confirmation is missing.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs`, `node --check scripts/qc-file-storage-schema-target-provisioning-execution-package.mjs`, and `node --check scripts/qc-file-storage-schema-target-provisioning-evidence.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-execution-package` passed 15/15.
- Verification: `npm.cmd run qc:file-storage-schema-target-provisioning-evidence` passed 34/34.
- Verification: regressions passed with `qc:file-storage-schema-formal-review-package` 20/20, `qc:file-storage-schema-target-connector-receipt-evidence` 15/15, `qc:file-storage-schema-target-create-result-evidence` 15/15, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5J Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: forced RLS hardening for storage metadata schema gates.
- Updated `scripts/generate-file-storage-schema-migration-package.mjs`; the proposal SQL now forces RLS on `storage_providers`, `storage_objects`, and `storage_object_references` after enabling RLS.
- Updated `scripts/generate-file-storage-schema-apply-gate.mjs`; disposable apply verification now reads `pg_class.relforcerowsecurity`, reports `forcedRlsVerifiedCount`, and does not return `applied_to_disposable` unless all storage metadata tables have forced RLS.
- Updated `scripts/generate-file-storage-schema-verify-gate.mjs`; read-only verification now reports `forcedRlsVerifiedCount` and emits `RLS not forced for <table>` findings.
- Updated `qc:file-storage-schema-migration-package`, `qc:file-storage-schema-apply-gate`, and `qc:file-storage-schema-verify-gate` to require Phase 5J evidence and forced RLS coverage.
- Scope: no Supabase connector calls, no DB connection, no SQL apply, no official migration writes, and no provider pointer updates.
- Verification: `node --check scripts/generate-file-storage-schema-migration-package.mjs`, `node --check scripts/generate-file-storage-schema-apply-gate.mjs`, `node --check scripts/generate-file-storage-schema-verify-gate.mjs`, `node --check scripts/qc-file-storage-schema-migration-package.mjs`, `node --check scripts/qc-file-storage-schema-apply-gate.mjs`, and `node --check scripts/qc-file-storage-schema-verify-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-schema-migration-package` passed 18/18.
- Verification: `npm.cmd run qc:file-storage-schema-apply-gate` passed 22/22.
- Verification: `npm.cmd run qc:file-storage-schema-verify-gate` passed 26/26.
- Verification: regressions passed with `qc:file-storage-schema-promotion-gate` 18/18, `qc:file-storage-schema-formal-review-package` 20/20, `qc:file-storage-schema-target-provisioning-evidence` 34/34, and `qc:doc-paths` 23/23.
- Verification: `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, and `npm.cmd run build` passed; build still reports the existing Turbopack NFT tracing warning.

## 2026-06-11 Phase 5K Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: Supabase target provisioning cost-confirmation freshness hardening.
- Updated `scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs`; user confirmation evidence now records the source cost package version, generated timestamp, target, resource type, and confirmation text, and blocks cost packages older than 24 hours.
- Updated `scripts/generate-file-storage-schema-target-create-request.mjs`; create requests now require fresh cost and user confirmation evidence and verify the user confirmation came from the exact same current cost package.
- Updated `scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs`; connector execution readiness now requires `upstreamEvidenceFresh=true` and `userConfirmationSourceMatchesCostPackage=true`.
- Updated QC coverage for stale cost packages, mismatched source packages, and stale ready create requests.
- Scope: no Supabase `confirm_cost`, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.

## 2026-06-11 Phase 5L Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: storage evidence governance snapshot.
- Updated `src/lib/storage-evidence-dashboard.ts`; monthly evidence dashboard now derives governance level `stable`, `observe`, `review`, `control`, or `blocked` from readiness blockers, storage / egress threshold usage, audited egress rows, and public-share egress.
- Updated `src/app/api/notifications/route.ts`; storage evidence notifications now include the governance label for Admin / R&D Manager review.
- Updated `src/components/dashboard.tsx`; Storage Evidence panel now shows governance label, next review trigger, and alternate provider review recommendation.
- Updated `scripts/qc-file-storage-evidence-dashboard.mjs`; QC now covers blocked governance, critical usage provider-review governance, missing evidence governance, notification copy, and dashboard rendering.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no DB SQL, no official migration writes, and no provider pointer updates.

## 2026-06-11 Phase 5M Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: storage governance gate artifact.
- Added `scripts/generate-file-storage-governance-gate.mjs` and `storage:governance-gate`; it reads the latest monthly storage evidence manifest and emits `file-storage-governance-gate.json/md`.
- Gate statuses cover `blocked_missing_evidence`, `blocked_storage_integrity`, `observation_required`, `cost_review_required`, `cost_controls_required`, and `stable`.
- Gate decisions explicitly record provider migration, lifecycle cleanup, and alternate provider review allow/deny reasons.
- Added `scripts/qc-file-storage-governance-gate.mjs` and `qc:file-storage-governance-gate`; QC covers missing / blocked / observe / review / control / stable governance states, output files, PM evidence, no side-effect imports, and credential redaction.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no DB SQL, no provider request, no file deletion, no metadata pointer update.

## 2026-06-11 Phase 5N Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: storage access audit QC gate.
- Added `scripts/qc-file-storage-access-audit.mjs` and `qc:file-storage-access-audit`; it verifies the storage audit helper, authenticated download / preview route instrumentation, release package route instrumentation, public share package route instrumentation, and package script registration.
- The QC uses an isolated fixture SQLite database and the production `buildStorageEgressReport(...)` builder to prove four `StorageAccessed` access kinds are normalized into governance-ready egress totals: `submission_file`, `submission_file_preview`, `release_package`, and `public_share_package`.
- The QC verifies signed URL metadata is preserved as mode / TTL / provider summary only, while raw signed URL values, raw share tokens, and token hashes are not present in report output.
- Current local runtime DB still has zero real `StorageAccessed` rows; governance remains `observation_required` until actual authenticated downloads / previews / share-package downloads are exercised in an accepted runtime test or field run.
- Scope: fixture-only read, no Supabase connector calls, no Supabase project/branch creation, no DB SQL migration, no provider request, no file deletion, no metadata pointer update, and no production audit-row seeding.
- Verification: `node --check scripts/qc-file-storage-access-audit.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-access-audit` passed 28/28.

## 2026-06-11 Phase 5O Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: runtime API storage access audit regression.
- Updated `scripts/qc-api-test.mjs`; existing HTTP runtime flows now assert that authenticated file download, PDF preview, authenticated release package download, and public share package download each write `StorageAccessed` audit rows.
- Runtime assertions verify access kind, route, disposition, positive byte counts, external public-share flag, share id scoping, and redaction of raw URL/token material.
- Updated `scripts/qc-file-storage-access-audit.mjs`; the focused storage access audit QC now also locks the `qc:api` runtime assertions so they cannot be removed silently.
- Runtime evidence: `npm.cmd run qc:api` against `http://127.0.0.1:3001` passed 406/406 after starting an isolated dev server on port 3001 because port 3000 was already occupied by another local process.
- Runtime DB evidence after `qc:api`: `StorageAccessed` rows exist for `submission_file`, `submission_file_preview`, `release_package`, and `public_share_package`, one row each in the current local QC data.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update. The local runtime DB was mutated only by the existing `qc:api` regression flow.
- Verification: `node --check scripts/qc-api-test.mjs` passed.
- Verification: `node --check scripts/qc-file-storage-access-audit.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-access-audit` passed 31/31.
- Verification: `npm.cmd run qc:api` passed 406/406.

## 2026-06-11 Phase 5P Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: QC runtime provenance / governance exclusion.
- Updated `src/lib/storage-access-audit.ts`; `StorageAccessed` audit rows now include `storageAccessSource` and `qcRunId`, and QC provenance headers are honored only outside production.
- Updated authenticated file download / preview, authenticated release package, and public share package routes to pass storage access audit provenance.
- Updated `scripts/qc-api-test.mjs`; runtime storage access requests now send a QC run header and verify the resulting audit rows carry `storageAccessSource=qc_api` with the expected run id.
- Updated `scripts/generate-file-storage-egress-report.mjs`; egress governance now excludes `qc_api` rows by default, reports `excludedQcRuntime`, keeps an explicit override through `PDM_STORAGE_EGRESS_INCLUDE_QC_RUNTIME=1`, and flags legacy/unclassified rows that predate provenance.
- Updated `scripts/qc-file-storage-egress-report.mjs`, `scripts/qc-file-storage-monthly-evidence.mjs`, and `scripts/qc-file-storage-access-audit.mjs`; fixtures now prove QC runtime rows are excluded from monthly governance totals while still preserving runtime regression evidence.
- Runtime local DB evidence after the new `qc:api`: `StorageAccessed` rows include 4 older unclassified rows and 4 new `qc_api` rows. New rows are excluded by governance; older unclassified local QC rows remain visible as legacy rows and must not be treated as formal monthly cost evidence without review.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update. The local runtime DB was mutated only by the existing `qc:api` regression flow.
- Verification: `node --check scripts/generate-file-storage-egress-report.mjs`, `node --check scripts/qc-file-storage-egress-report.mjs`, `node --check scripts/qc-file-storage-monthly-evidence.mjs`, and `node --check scripts/qc-file-storage-access-audit.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-egress-report` passed 20/20.
- Verification: `npm.cmd run qc:file-storage-monthly-evidence` passed 17/17.
- Verification: `npm.cmd run qc:file-storage-access-audit` passed 39/39.
- Verification: `npm.cmd run qc:api` against `http://127.0.0.1:3001` passed 409/409 after starting an isolated dev server on port 3001 because port 3000 was already occupied by another local process; the port 3001 server was stopped afterward.

## 2026-06-11 Phase 5Q Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: evidence provenance quality governance.
- Updated `scripts/generate-file-storage-monthly-evidence.mjs`; monthly evidence summary now includes `excludedQcRuntimeRows` and `legacyUnclassifiedRows`, and readiness warnings explicitly call out excluded QC runtime rows and legacy `StorageAccessed` rows without provenance.
- Updated `src/lib/storage-evidence-dashboard.ts`; the dashboard normalizes the new provenance-quality summary fields, adds a PM next action for legacy rows, and sets governance level to `review` with label `Evidence provenance review required` when legacy unclassified rows exist.
- Updated `scripts/qc-file-storage-monthly-evidence.mjs`, `scripts/qc-file-storage-evidence-dashboard.mjs`, and `scripts/qc-file-storage-governance-gate.mjs`; fixtures prove QC rows are excluded, legacy rows are summarized, and governance does not report `stable` until legacy provenance is reviewed.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update.
- Verification: `node --check scripts/generate-file-storage-monthly-evidence.mjs`, `node --check scripts/qc-file-storage-monthly-evidence.mjs`, `node --check scripts/qc-file-storage-evidence-dashboard.mjs`, and `node --check scripts/qc-file-storage-governance-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-monthly-evidence` passed 19/19.
- Verification: `npm.cmd run qc:file-storage-evidence-dashboard` passed 26/26.
- Verification: `npm.cmd run qc:file-storage-governance-gate` passed 16/16.

## 2026-06-11 Phase 5R Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: scheduled evidence quality handoff.
- Updated `scripts/run-file-storage-monthly-evidence-schedule.mjs`; scheduled run manifests now include `evidenceQuality` with `excludedQcRuntimeRows`, `legacyUnclassifiedRows`, `provenanceReviewRequired`, `qcRuntimeRowsExcluded`, and provenance-related warnings.
- Updated `scripts/generate-file-storage-governance-gate.mjs`; governance gate JSON and Markdown now include an explicit Evidence Quality section so PM handoff does not rely only on warning counts.
- Updated `scripts/qc-file-storage-monthly-evidence-schedule.mjs`; fixture now covers runtime, QC runtime, and legacy storage access rows and verifies scheduled handoff quality fields.
- Updated `scripts/qc-file-storage-governance-gate.mjs`; QC now verifies evidence quality counts and markdown output for legacy provenance review.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update.
- Verification: `node --check scripts/run-file-storage-monthly-evidence-schedule.mjs`, `node --check scripts/generate-file-storage-governance-gate.mjs`, `node --check scripts/qc-file-storage-monthly-evidence-schedule.mjs`, and `node --check scripts/qc-file-storage-governance-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-monthly-evidence-schedule` passed 17/17.
- Verification: `npm.cmd run qc:file-storage-governance-gate` passed 18/18.

## 2026-06-11 Phase 5S Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: migration execution governance gate integration.
- Updated `scripts/generate-file-storage-migration-execution-gate.mjs`; staging execution now accepts `--governance-gate <file>` or `PDM_STORAGE_GOVERNANCE_GATE_PATH` and refuses copy when the governance gate is missing, invalid, not migration-ready, still in observation/review, or still requires provenance review.
- The execution report now records the governance gate path, governance status, governance level, evidence-quality counts, provenance-review state, and reason for allow/block.
- Updated `scripts/qc-file-storage-migration-execution-gate.mjs`; QC now covers missing governance gate refusal, legacy provenance review refusal, stable governance approval, output files, no provider requests, no metadata pointer updates, source preservation, and credential-marker redaction.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update.
- Verification: `node --check scripts/generate-file-storage-migration-execution-gate.mjs` and `node --check scripts/qc-file-storage-migration-execution-gate.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-migration-execution-gate` passed 22/22.

## 2026-06-11 Phase 5T Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: migration runbook governance handoff.
- Updated `scripts/generate-file-storage-migration-runbook.mjs`; the runbook now records `governanceGateRequiredForExecution=true`, `requiresGovernanceGate=true`, a `storage:governance-gate` generation command, and a staging execution command that passes `--governance-gate <file-storage-governance-gate.json>`.
- Updated the runbook execution checklist so governance gate evidence is attached before provider credentials, copy, hash verification, metadata pointer update, and source-retention steps.
- Updated `scripts/qc-file-storage-migration-runbook.mjs`; QC now proves the governance handoff appears in assumptions, readiness, execution checklist, and generated execution command.
- Scope: no Supabase connector calls, no Supabase project/branch creation, no schema migration, no provider request, no file deletion, no metadata pointer update.
- Verification: `node --check scripts/generate-file-storage-migration-runbook.mjs` and `node --check scripts/qc-file-storage-migration-runbook.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-migration-runbook` passed 26/26.

## 2026-06-12 Phase 5U Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: local provider file-domain regression gate.
- Added `scripts/qc-file-storage-local-provider-regression.mjs` and `qc:file-storage-local-provider-regression`; the focused gate locks local provider upload metadata, server-stream download, PDF inline preview / CAD preview blocking, release package ZIP download, public supplier share package access, storage access audit provenance, procurement-release redaction checks, and missing/hash/orphan cost-report detection.
- Updated `.ai-doc/reports/rd/rd-file-storage-local-provider-regression-report-2026-06-12.md` with scope, coverage, verification, guardrails, and remaining live-provider work.
- Updated `DEV-STORAGE-COST-001` acceptance and QC checklist to treat `qc:file-storage-local-provider-regression` as the equivalent file-domain regression for this local-provider slice.
- Scope: no Supabase connector calls, no Supabase Storage bucket creation, no S3-compatible provider request, no DB schema migration, no provider pointer update, no file migration, and no deletion.
- Verification: `node --check scripts/qc-file-storage-local-provider-regression.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-local-provider-regression` passed 34/34.

## 2026-06-12 Phase 5V Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: file storage role/share access gate.
- Added `scripts/qc-file-storage-role-access.mjs` and `qc:file-storage-role-access`; the focused gate locks Manufacturing / Procurement released-only submission file and release package access, PDF-only preview guard, token-scoped public package share access, revoked/expired share rejection, share metadata redaction, and existing procurement release API denial/redaction coverage.
- Updated [.ai-doc/reports/rd/rd-file-storage-role-access-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-file-storage-role-access-report-2026-06-12.md) with scope, coverage, verification, and boundary.
- Boundary: this gate covers supplier access to shared release packages. Specified single-file supplier share is not productized yet and remains a separate open slice.
- Scope: no Supabase connector calls, no Supabase Storage bucket creation, no S3-compatible provider request, no DB schema migration, no provider pointer update, no file migration, no deletion, and no production data mutation.
- Verification: `node --check scripts/qc-file-storage-role-access.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-role-access` passed 21/21.

## 2026-06-12 Phase 5W Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: upload detail metadata gate.
- Added `scripts/qc-file-storage-upload-detail-metadata.mjs` and `qc:file-storage-upload-detail-metadata`; the focused gate locks CAD / PDF / DWG allowed roles, upload saved metadata, submission file DB insert fields, submission detail `files` payload, file count / role summary, auth visibility guard, and existing `qc:api` runtime detail metadata coverage.
- Updated [.ai-doc/reports/rd/rd-file-storage-upload-detail-metadata-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-file-storage-upload-detail-metadata-report-2026-06-12.md) with scope, coverage, verification, and boundary.
- Scope: no Supabase connector calls, no Supabase Storage bucket creation, no S3-compatible provider request, no DB schema migration, no provider pointer update, no file migration, no deletion, no server startup, and no production data mutation.
- Verification: `node --check scripts/qc-file-storage-upload-detail-metadata.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-detail-metadata` passed 13/13.

## 2026-06-12 Phase 5X Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: local provider upload-time deduplication gate.
- Updated `src/lib/file-storage.ts`; `LocalRepositoryStorageAdapter.putObject(...)` now computes SHA-256 before write and reuses an existing repository object with the same hash, so duplicate local uploads point to one canonical physical file.
- Updated `scripts/generate-file-storage-cost-report.mjs`; duplicate recoverable bytes are now computed from unique physical objects, so already-shared local paths are not counted as reclaimable duplicate storage.
- Added `scripts/qc-file-storage-upload-dedup.mjs` and `qc:file-storage-upload-dedup`; runtime fixture compiles the adapter, writes duplicate and distinct objects in an isolated repository, verifies canonical reuse, verifies read/hash behavior, and verifies business file rows / Submit audit remain per upload.
- Updated [.ai-doc/reports/rd/rd-file-storage-upload-dedup-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-file-storage-upload-dedup-report-2026-06-12.md) with scope, coverage, verification, and boundary.
- Boundary: this closes local provider upload-time physical-object dedup only. Formal `storage_objects` / `storage_object_references` persistence and live provider dedup remain open under schema / provider gates.
- Scope: no Supabase connector calls, no Supabase Storage bucket creation, no S3-compatible provider request, no DB schema migration, no provider pointer update, no file migration, no deletion, no server startup, and no production data mutation.
- Verification: `node --check scripts/qc-file-storage-upload-dedup.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-upload-dedup` passed 14/14.
- Verification: `npm.cmd run qc:file-storage-cost-report` passed 19/19.

## 2026-06-12 Phase 5Y Evidence Addendum

- Task: `DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan.
- Phase: provider migration business-link invariance dry-run gate.
- Updated `scripts/generate-file-storage-migration-dry-run.mjs`; planned objects now include `businessLinkInvariant`, which records preserved source identity, linked entity type / id, SHA-256, allowed storage pointer fields, and relationship tables that must remain untouched.
- Updated `scripts/qc-file-storage-migration-dry-run.mjs`; QC now proves pointer fields do not include `submission_id`, `item_id`, `drawing_number`, `part_number`, or `bom_header_id`, and that relationship tables including `submissions`, `bom_lines`, and `drawing_part_links` are explicitly untouched by dry-run.
- Updated [.ai-doc/reports/rd/rd-file-storage-migration-link-invariance-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-file-storage-migration-link-invariance-report-2026-06-12.md) with scope, coverage, verification, and boundary.
- Boundary: this proves dry-run / runbook / execution-gate link invariance only. Live provider migration, metadata pointer update, app smoke, and rollback proof remain open.
- Scope: no Supabase connector calls, no Supabase Storage bucket creation, no S3-compatible provider request, no DB schema migration, no live provider copy, no metadata pointer update, no file deletion, and no production data mutation.
- Verification: `node --check scripts/generate-file-storage-migration-dry-run.mjs` passed.
- Verification: `node --check scripts/qc-file-storage-migration-dry-run.mjs` passed.
- Verification: `npm.cmd run qc:file-storage-migration-dry-run` passed 17/17.
- Verification: `npm.cmd run qc:file-storage-migration-runbook` passed 26/26.
- Verification: `npm.cmd run qc:file-storage-migration-execution-gate` passed 22/22.
- Verification: `npm.cmd run qc:file-storage-contract` passed 81/81.
- Verification: `npm.cmd run qc:file-storage-local-provider-regression` passed 34/34.

## 2026-06-11 Supabase Connector Refresh / Staging Preflight Evidence

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- Phase: connector refresh, staging target identity proof, and local preflight before live migration planning.
- Connector evidence: Supabase connector `list_organizations` returned `Jenfu Machinery / ydxbtstvlunmpjdlrhml`.
- Connector evidence: Supabase connector `list_projects` returned `AI_PDM_STAGING / qerabudthnnpqvybpcsq` under `ydxbtstvlunmpjdlrhml`.
- Connector evidence: Supabase connector `get_project(qerabudthnnpqvybpcsq)` returned `region=ap-northeast-1` and `status=ACTIVE_HEALTHY`.
- Human confirmation state: `AI_PDM_STAGING` target and cost are treated as confirmed by the user; this target is a staging project, not a development branch.
- Safety boundary: no SQL was executed, no `apply_migration` was called, no Supabase project or branch was created, and no runtime provider pointer was changed before or during this evidence capture.
- Forbidden targets remain blocked: `ProJED / knodlkxqpcqyrtgwpdst` and `ProJED_TEST / fhisnnufoeulxqrchldf` are still forbidden migration targets.
- Local preflight: `npm.cmd run qc:postgres-shadow-target-guard` passed 11/11 and verified empty-schema allow, non-empty / partial / non-AI_PDM blocking, forced RLS checks, and known non-AI_PDM project ref fail-closed behavior.
- Local preflight: `npm.cmd run qc:postgres-shadow` passed 22/22; report showed `postgresShadowConfigured=false`, so the check stayed local and did not connect to a live DB.
- Local preflight: `npm.cmd run supabase:migrations:sync` passed; it regenerated the repo migration mirror and reported `supabaseCli.available=false` plus `localMigrationList.attempted=false`, with no live Supabase migration history operation.
- Local preflight: `npm.cmd run qc:supabase-runtime-migrations` passed 19/19, covering migration mirror files, source hashes, forced RLS / direct-access deny baseline, CLI migration-list readiness, README guard text, env documentation, package scripts, and `dev_task` traceability.
- Evidence report: [.ai-doc/reports/rd/rd-supabase-cli-migration-list-readiness-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supabase-cli-migration-list-readiness-report-2026-06-12.md).
- PM status correction: the Supabase Storage follow-up gate under `DEV-SUPABASE-DB-001` is closed by the separate active `DEV-STORAGE-COST-001` task; RLS / secret-boundary QA is marked partial because local RLS baseline and server-side secret boundary are verified, while live post-apply RLS proof remains open.
- Next gate: with the server-side staging database URL configured outside the repo and live pre-migration target guard passed, PM/RD may plan staging migration apply, then post-apply guard, advisor evidence, schema compare, and Postgres-mode API regression.

## 2026-06-15 Live Pre-Migration Target Guard Evidence

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- Phase: live staging pre-migration target guard after human-provided server-side connection configuration.
- Human-run command: `npm.cmd run db:postgres:guard -- --phase pre-migration`.
- Evidence: guard returned `postgresShadowConfigured=true`, `configuredTargetName=AI_PDM_STAGING`, `targetIdentity.safe=true`, `safe=true`, `phase=pre-migration`, and `mode=empty_public_schema`.
- Evidence: guard confirmed forbidden project refs remain `knodlkxqpcqyrtgwpdst` and `fhisnnufoeulxqrchldf`, with no identity issues.
- Evidence: target had `publicTableCount=0`, `unknownTables=[]`, and `issues=[]`, so it is safe for controlled staging migration planning.
- Safety boundary: no mutation SQL, no `apply_migration`, no project / branch creation, no provider pointer switch, and no secret value was recorded in repo or chat.
- Next gate: require explicit human approval before staging migration apply; after apply, run compare-phase guard, schema compare, Supabase advisor evidence, and Postgres-mode API regression.

## 2026-06-12 Phase 3BP Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: public share serialization and package access async provider conversion.
- Updated `src/lib/repositories/release-async-repository.ts`; added provider-neutral readonly share access SQL to increment `access_count` and update `last_accessed_at` / `updated_at` through the async database client.
- Updated `src/lib/release-records-async.ts`; added `recordReadonlyShareAccessAsync(...)`.
- Updated `src/lib/readonly-share-async.ts`; added `recordPublicShareAccessAsync(...)` and `serializePublicShareAsync(...)`, including async supplier response lookup for public share payloads.
- Updated `src/app/api/public/shares/[token]/route.ts` and `src/app/api/public/shares/[token]/package/route.ts`; both now use async public share helpers and avoid sync `@/lib/readonly-share` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; added `PUBLIC-SHARE-ASYNC-001..004`, route source checks, access SQL extraction, and SQLite semantic proof for access count/timestamp updates.
- Updated [.ai-doc/reports/rd/rd-public-share-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-public-share-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3019` passed manager login, share creation, public share serialization, and public package ZIP download for `SUB-20260612-284CDBA2`; package response returned `application/zip`, `content-length=1931`, and filename `QC-REL-A-791882_rev-A_release-package.zip`.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 223/223.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BQ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: authenticated release package download route async provider conversion.
- Updated `src/app/api/submissions/[id]/release-package/route.ts`; route now uses `getSubmissionAsync(...)` instead of direct synchronous `getSubmission(...)` from `@/lib/db`.
- Preserved route behavior: `requireAuthAsync(...)`, `canReadSubmission(...)`, Released / Obsolete guard, release-package-required guard, storage key read, storage access audit, zip headers, and existing error handling.
- Updated `scripts/qc-access-control-async-repository.mjs`; `ROUTE-AUTH-ASYNC-016` now rejects sync DB imports across release package/share/supplier response routes, and `RELEASE-PACKAGE-ASYNC-001` locks async submission detail plus package audit/download markers.
- Updated [.ai-doc/reports/rd/rd-release-package-download-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-release-package-download-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3020` passed manager login and direct `GET /api/submissions/SUB-20260612-284CDBA2/release-package`; response returned `application/zip`, `content-length=1931`, filename `QC-REL-A-791882_rev-A_release-package.zip`, and matching downloaded byte length.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 224/224.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BR Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: AI summary and AI risk routes async provider conversion.
- Updated `src/app/api/submissions/[id]/ai-summary/route.ts` and `src/app/api/submissions/[id]/ai-risks/route.ts`; both routes now use `getSubmissionAsync(...)` instead of direct synchronous `getSubmission(...)` from `@/lib/db`.
- Preserved route behavior: `requireAuthAsync(...)`, `canReadSubmission(...)`, Engineer-scoped `submittedBy`, `buildAiSubmissionSummary(...)`, `buildAiRiskReport(...)`, and existing response envelope shapes.
- Updated `scripts/qc-access-control-async-repository.mjs`; `ROUTE-AUTH-ASYNC-017` now rejects sync DB imports and `AI-ROUTE-ASYNC-001` locks async submission detail plus AI builder markers.
- Updated [.ai-doc/reports/rd/rd-ai-summary-risk-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-ai-summary-risk-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3021` passed manager login, `GET /api/submissions/SUB-20260612-24EA18A9/ai-summary`, and `GET /api/submissions/SUB-20260612-24EA18A9/ai-risks`; summary returned keys `submission_id`, `title`, `generated_at`, `sections`, `missing_file_roles`, `source_count`, `sources`; risk report returned keys `submission_id`, `generated_at`, `risk_count`, `risks`.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no LLM provider behavior change, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 225/225.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BS Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: preflight-lock active item lock lookup async provider conversion.
- Added `src/lib/repositories/item-lock-async-repository.ts`; it expires stale locks and looks up active unreleased item locks by provider-neutral async SQL for part number or drawing number.
- Added `src/lib/item-locks-async.ts`; it exposes `findActiveItemLockForSubmissionIdentifiersAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/submissions/preflight-lock/route.ts`; the route now uses the async item lock helper and no longer imports synchronous `@/lib/db`.
- Updated `scripts/qc-access-control-async-repository.mjs`; added static route/source checks and SQLite semantic proof for active lookup by part number, active lookup by drawing number, and expired lock release.
- Updated [.ai-doc/reports/rd/rd-preflight-lock-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-preflight-lock-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3022` passed Engineer login, checkout setup lock creation for `SUB-20260612-3D550288`, preflight lookup by drawing number, preflight lookup by part number, missing drawing unlocked response, checkout lock release, and server cleanup.
- Boundary: checkout create/release still uses synchronous DB helpers and was used only as smoke setup/cleanup for this phase.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 228/228.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BT Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: checkout lock create/release route async provider conversion.
- Updated `src/lib/repositories/item-lock-async-repository.ts`; added provider-neutral async SQL and methods for submission item lookup, active item lock lookup by item id, create lock, release lock, and checkout audit writes.
- Updated `src/lib/item-locks-async.ts`; added `createItemLockAsync(...)` and `releaseItemLockAsync(...)`.
- Updated `src/app/api/submissions/[id]/checkout/route.ts`; the route now uses `getSubmissionAsync(...)`, `createItemLockAsync(...)`, and `releaseItemLockAsync(...)`, and no longer imports synchronous `@/lib/db`.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync checkout DB/helper usage and SQLite semantic coverage now proves checkout create/release/audit SQL.
- Updated [.ai-doc/reports/rd/rd-checkout-lock-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-checkout-lock-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3023` passed Engineer login, unlocked submission selection, checkout create for `SUB-20260612-3D550288`, same-user reuse, preflight lock visibility, checkout release, second release=false, and server cleanup.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact checkout route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 229/229.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BU Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: design reuse and duplicate geometry candidate route async provider conversion.
- Updated `src/lib/repositories/submission-list-async-repository.ts`; added provider-neutral SQLite/Postgres candidate SQL, async reuse candidate lookup, async duplicate geometry lookup, and scoring helpers matching the existing synchronous behavior.
- Updated `src/lib/submissions-async.ts`; added `listDesignReuseCandidatesAsync(...)` and `listDuplicateGeometryCandidatesAsync(...)`.
- Updated `src/app/api/submissions/[id]/reuse-candidates/route.ts` and `src/app/api/submissions/[id]/duplicate-geometry/route.ts`; both now use `getSubmissionAsync(...)` and async candidate helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync candidate route DB/helper usage and SQLite semantic coverage proves reuse file names plus duplicate fingerprints.
- Updated [.ai-doc/reports/rd/rd-reuse-duplicate-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-reuse-duplicate-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3024` passed Manager login, reuse candidate response for `SUB-20260612-3D550288` with 6 candidates, duplicate geometry response shape with `method=file_fingerprint`, and server cleanup.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact reuse/duplicate route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 231/231.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BV Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission BOM route async provider conversion.
- Added `src/lib/repositories/bom-async-repository.ts`; it provides provider-neutral async SQL and repository methods for submission BOM detail lookup, BOM draft materialization from CAD references, previous BOM submission lookup, and BOM diff generation.
- Added `src/lib/bom-async.ts`; it exposes `getBomBySubmissionIdAsync(...)`, `materializeBomDraftFromReferencesAsync(...)`, `findPreviousBomSubmissionIdAsync(...)`, and `getBomDiffBetweenSubmissionsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/submissions/[id]/bom/route.ts`, `src/app/api/submissions/[id]/bom/export/route.ts`, and `src/app/api/submissions/[id]/bom/diff/route.ts`; all three routes now use `getSubmissionAsync(...)` and BOM async helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync BOM route DB/helper usage and SQLite semantic coverage proves BOM detail SQL, previous BOM ordering, materialize upsert/delete/insert, and `BomDraftMaterialized` audit write.
- Updated [.ai-doc/reports/rd/rd-submission-bom-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-submission-bom-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3025` passed `qc:bom-productized` 23/23 and an API-only BOM smoke 8/8 covering manager/engineer login, BOM detail, BOM CSV export, explicit BOM diff, and diff CSV export; server and temporary logs were cleaned up.
- Runtime note: `qc:bom-diff-productized` API checks passed through `BDIFF-008`, then failed in the UI locator section because the matching metadata span was hidden. This is tracked as a UI locator issue outside the 3BV API provider conversion boundary.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact submission BOM route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 233/233.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BW Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: submission sandbox route async provider conversion.
- Added `src/lib/repositories/sandbox-async-repository.ts`; it provides provider-neutral async SQL and repository methods for sandbox branch list/detail, merge preview, branch creation, branch close, branch merge, copied submission files/references, BOM draft materialization, and audit writes.
- Added `src/lib/sandbox-async.ts`; it exposes `listSandboxBranchesForSubmissionAsync(...)`, `getSandboxBranchByIdAsync(...)`, `getSandboxMergePreviewAsync(...)`, `createSandboxBranchAsync(...)`, `updateSandboxBranchStatusAsync(...)`, and `mergeSandboxBranchAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/submissions/[id]/sandbox/route.ts` and `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`; both routes now use `getSubmissionAsync(...)` and sandbox async helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync sandbox route DB/helper usage and SQLite semantic coverage proves sandbox branch create/list/close/merge SQL.
- Updated [.ai-doc/reports/rd/rd-sandbox-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-sandbox-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3026` passed API smoke 7/7 covering engineer login, source submission with assembly reference, sandbox branch creation, source branch list, sandbox current branch lookup, branch detail with merge preview, branch close, and server cleanup.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact submission sandbox route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 235/235.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BX Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering duplicate-check route async provider conversion.
- Added `src/lib/repositories/numbering-async-repository.ts`; it provides provider-neutral async SQL and repository behavior for duplicate root/part/drawing lookup, name similarity candidates, warning event writes, duplicate check event writes, and numbering audit writes.
- Added `src/lib/numbering-async.ts`; it exposes `checkNumberingDuplicatesAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/duplicate-check/route.ts`; the route now uses `checkNumberingDuplicatesAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync duplicate-check DB/helper usage and SQLite semantic coverage proves duplicate lookup, warning event, duplicate event, and audit SQL.
- Updated [.ai-doc/reports/rd/rd-numbering-duplicate-check-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-duplicate-check-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3027` passed API smoke 3/3 covering engineer login, empty duplicate-check 400 validation, valid duplicate-check response shape, and server cleanup.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering duplicate-check route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 237/237.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BY Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering task status route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral async SQL and mapping for numbering task status update and task lookup.
- Updated `src/lib/numbering-async.ts`; added `updateNumberingTaskStatusAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/tasks/[taskId]/route.ts`; PATCH now uses `updateNumberingTaskStatusAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync task status DB/helper usage and SQLite semantic coverage proves handled/cancelled SQL behavior.
- Updated [.ai-doc/reports/rd/rd-numbering-task-status-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-task-status-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3028` passed admin login, temporary task fixture insert, PATCH task handled response, fixture cleanup, and server cleanup.
- Scope: did not convert `src/app/api/numbering/tasks/route.ts` GET in this slice; no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering task status route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 238/238.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3BZ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering task list route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral task list SQL, assigned role lookup, allowed role scope lookup, active delegation lookup, non-admin access filtering, and delegated review marker mapping.
- Updated `src/lib/numbering-async.ts`; added `listNumberingTasksAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/tasks/route.ts`; GET now uses `requireNumberingPageAsync(...)` and `listNumberingTasksAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync task list DB/helper usage and SQLite semantic coverage proves role assignment, role scope, active delegation, and task list SQL.
- Updated [.ai-doc/reports/rd/rd-numbering-task-list-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-task-list-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3029` passed admin demo login and `GET /api/numbering/tasks?status=open`; response returned `200 OK` with `generatedAt` and `tasks` JSON fields, then server and temporary files were cleaned up.
- Runtime boundary: local `data/ai-pdm.sqlite` did not contain numbering task tables, so row-level task list behavior is covered by the in-memory SQLite semantic QC fixture rather than a persisted runtime fixture.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering task list route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 239/239.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3CA Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering notification list/read/handled routes async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral notification list SQL, notification lookup SQL, state update SQL, access filtering, and delegated marker mapping.
- Updated `src/lib/numbering-async.ts`; added `listNumberingNotificationsAsync(...)` and `updateNumberingNotificationStateAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/notifications/route.ts`, `src/app/api/numbering/notifications/[notificationId]/read/route.ts`, and `src/app/api/numbering/notifications/[notificationId]/handled/route.ts`; all three now use async numbering helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync notification DB/helper usage and SQLite semantic coverage proves notification list, read update, handled update, and non-dismissible fixture behavior.
- Updated [.ai-doc/reports/rd/rd-numbering-notifications-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-notifications-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3030` passed admin demo login, `GET /api/numbering/notifications?read=unread&handled=unhandled`, POST read, and POST handled for `notification-runtime-async-3030`; server, temporary files, and fixture row were cleaned up.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering notification route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 240/240.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3CB Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering export-job list/create/detail routes async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral export roots/parts/drawings/audit payload SQL, export job insert/list/get SQL, completed-on-create behavior, and export audit write.
- Updated `src/lib/numbering-async.ts`; added `createNumberingExportJobAsync(...)`, `getNumberingExportJobAsync(...)`, and `listNumberingExportJobsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/export-jobs/route.ts` and `src/app/api/numbering/export-jobs/[jobId]/route.ts`; both now use async numbering helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync export-job DB/helper usage and SQLite semantic coverage proves export payload, job insert/list/get, and audit SQL.
- Updated [.ai-doc/reports/rd/rd-numbering-export-jobs-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-export-jobs-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3031` passed admin demo login, POST create, GET list, and GET detail for export job `82cc7e5e-717d-43dc-b0f5-63d22ff16c5a`.
- Runtime cleanup: temporary server and files were cleaned; the temporary export job row was deleted; the local append-only audit row `df18d237-7a6d-489d-ba76-3a0cbb6a4b68` remains because `AUDIT_LOG_APPEND_ONLY` prevents audit deletion by design.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering export-job route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 241/241.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## 2026-06-12 Phase 3CC Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering monthly audit report list/create/detail routes async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral monthly audit count SQL, role-specific task/rule counts, project bucket aggregation, report insert/list/get SQL, per-department report page generation, and monthly audit write.
- Updated `src/lib/numbering-async.ts`; added `generateMonthlyNumberingAuditReportAsync(...)`, `getMonthlyNumberingAuditReportAsync(...)`, and `listMonthlyNumberingAuditReportsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/monthly-audit-reports/route.ts` and `src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts`; both now use async numbering helpers without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync monthly-audit DB/helper usage and SQLite semantic coverage proves monthly counts, department page source counts, project bucket aggregation, report insert/list/get, and audit SQL.
- Updated [.ai-doc/reports/rd/rd-numbering-monthly-audit-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-monthly-audit-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3032` passed admin demo login, POST create, GET list, and GET detail for monthly audit report `8ceb8240-ed59-4e8a-a40d-7aac58fa75cb`.
- Runtime cleanup: temporary server and files were cleaned; the temporary monthly audit report row was deleted; local append-only audit rows `91094a84-b0bf-4e90-96e3-977c80c41eeb` and `54090252-90dd-4bb3-8e12-8152b5b6d18c` remain because `AUDIT_LOG_APPEND_ONLY` prevents audit deletion by design.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering monthly-audit route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 242/242.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Verification: `npm.cmd run qc:doc-paths` passed 23/23.
- PM status: direct `@/lib/db` API route mentions decreased to 29 after this slice.

## 2026-06-12 Phase 3CD Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering drafts overdue route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral overdue draft root selection, root/part/drawing `PendingAdminConfirm` updates, task insert, notification insert, audit snapshot, and audit write.
- Updated `src/lib/numbering-async.ts`; added `markOverdueDraftNumberingRecordsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/drafts/overdue/route.ts`; POST now uses `markOverdueDraftNumberingRecordsAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync overdue draft DB/helper usage and SQLite semantic coverage proves overdue selection, state updates, task, notification, and audit SQL.
- Added [.ai-doc/reports/rd/rd-numbering-drafts-overdue-async-provider-report-2026-06-12.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-drafts-overdue-async-provider-report-2026-06-12.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3033` with isolated `PDM_DATA_DIR=tmp-runtime-3cd-data` passed admin demo login, overdue fixture insert, POST overdue mark, and DB verification for root/part/drawing status plus task, notification, and audit creation.
- Runtime cleanup: temporary server, files, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering drafts overdue route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 243/243.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- PM status: direct `@/lib/db` API route mentions decreased to 28 after this slice.

## 2026-06-14 Phase 3CE Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering root detail route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral root detail SQL and mapping for root, parts, drawings, drawing-part links, same-drawing variants, warning events, and numbering audit trail.
- Updated `src/lib/numbering-async.ts`; added `getNumberingRootDetailAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/roots/[rootCode]/route.ts`; GET now uses `getNumberingRootDetailAsync(...)` without synchronous numbering repository access.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync root detail DB/helper usage and SQLite semantic coverage proves parts, drawings, links, variants, warnings, and audit SQL.
- Added [.ai-doc/reports/rd/rd-numbering-root-detail-async-provider-report-2026-06-14.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-root-detail-async-provider-report-2026-06-14.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3034` with isolated `PDM_DATA_DIR=tmp-runtime-3ce-data` passed admin login, root detail fixture insert, GET root detail, and response verification for one part, one drawing, one primary manufacturing count, one link, one variant, one warning, and one audit entry.
- Runtime cleanup: temporary server, files, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering root detail route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 244/244.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- PM status: direct `@/lib/db` API route mentions decreased to 27 after this slice.

## 2026-06-15 Phase 3CF Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering search route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral search SQL and mapping for numbering roots, part numbers, and drawing numbers.
- Updated `src/lib/numbering-async.ts`; added `searchNumberingRecordsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/search/route.ts`; GET now uses `searchNumberingRecordsAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync search DB/helper usage and SQLite semantic coverage proves root, part, drawing, primary drawing, warning count, and linked part count SQL.
- Added [.ai-doc/reports/rd/rd-numbering-search-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-search-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3035` with isolated `PDM_DATA_DIR=tmp-runtime-3cf-data` passed admin login, search fixture insert, GET numbering search, and response verification for root, part, drawing, primary drawing, warning count, and linked part count.
- Runtime cleanup: temporary server, files, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering search route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 245/245.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- PM status: direct `@/lib/db` API route mentions decreased to 26 after this slice.

## 2026-06-15 Phase 3CG Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: numbering drawings list route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral drawing module SQL, linked part number loading, same-root part summary loading, drawing module mapping, and title-block variant warning mapping.
- Updated `src/lib/numbering-async.ts`; added `listDrawingModuleRecordsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/numbering/drawings/route.ts`; GET now uses `listDrawingModuleRecordsAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync drawing module DB/helper usage and SQLite semantic coverage proves drawing rows, linked part numbers, same-root parts, variant attributes, and standard cost status.
- Added [.ai-doc/reports/rd/rd-numbering-drawings-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-numbering-drawings-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3036` with isolated `PDM_DATA_DIR=tmp-runtime-3cg-data` passed admin login, drawing fixture insert, GET numbering drawings, and response verification for linked part count, linked part numbers, same-root parts, warning count, title-block variant warning, and active standard cost status.
- Runtime cleanup: temporary server, files, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact numbering drawings route scan found no sync DB/helper match.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 246/246.
- Verification: `npm.cmd run lint -- --quiet` passed.
- Verification: `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- PM status: direct `@/lib/db` API route mentions decreased to 25 after this slice.

## 2026-06-15 Phase 3CH Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts list route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral parts list SQL, part variant mapping, active standard cost mapping, drawing count, primary drawing, and pending cost request count.
- Updated `src/lib/numbering-async.ts`; added `listPartModuleRecordsAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/route.ts`; GET now uses `listPartModuleRecordsAsync(...)` and `requireNumberingPageAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync parts list DB/helper usage and SQLite semantic coverage proves variant, primary drawing, drawing count, pending cost request count, and standard cost fields.
- Added [.ai-doc/reports/rd/rd-parts-list-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-list-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3037` with isolated `PDM_DATA_DIR=tmp-runtime-3ch-data` passed admin login, parts fixture insert, GET parts list, and response verification for primary drawing, drawing count, pending cost request count, variant material, standard cost profile, and standard unit cost.
- Runtime cleanup: temporary server, logs, pid file, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: current post-smoke checks passed: `npx.cmd tsc --noEmit`, exact parts route scan, `node --check scripts/qc-access-control-async-repository.mjs`, `npm.cmd run qc:access-control-async-repository` 247/247, and `npm.cmd run qc:doc-paths` 23/23. Pre-smoke code verification also passed `npm.cmd run lint -- --quiet` and `npm.cmd run build` with the existing Turbopack NFT tracing warning.
- PM status: direct `@/lib/db` API route mentions decreased to 24 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CH and does not automatically continue into Phase 3CI.

## 2026-06-15 Phase 3CI Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts detail route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral part detail loading for the base part row, linked drawings, same-drawing variants, cost profiles, cost tiers, and cost change requests.
- Updated `src/lib/numbering-async.ts`; added `getPartModuleDetailAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/[partNumber]/route.ts`; GET now uses `getPartModuleDetailAsync(...)` and `requireNumberingPageAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync part detail DB/helper usage and SQLite semantic coverage proves linked drawing, same-drawing variant, cost profile, tier, and pending cost change SQL.
- Added [.ai-doc/reports/rd/rd-parts-detail-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-detail-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3038` with isolated `PDM_DATA_DIR=tmp-runtime-3ci-data` passed admin login, parts detail fixture insert, GET part detail, 404 missing part check, and response verification for linked drawing, same-drawing variant, cost profile tier, standard cost, and cost change request.
- Runtime cleanup: temporary server, logs, pid file, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact parts detail route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 248/248.
- PM status: direct `@/lib/db` API route mentions decreased from 24 to 23 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CI and does not automatically continue into Phase 3CJ.

## 2026-06-15 Phase 3CJ Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts variant route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral part variant select/update/insert SQL, async upsert method, audit write, and same-client part detail readback for transaction consistency.
- Updated `src/lib/numbering-async.ts`; added `upsertPartVariantAttributesAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/[partNumber]/variant/route.ts`; PUT now uses `upsertPartVariantAttributesAsync(...)` and `requireNumberingActionAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync part variant DB/helper usage and SQLite semantic coverage proves variant update, insert, detail readback, and audit SQL.
- Added [.ai-doc/reports/rd/rd-parts-variant-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-variant-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3039` with isolated `PDM_DATA_DIR=tmp-runtime-3cj-data` passed admin login, PUT insert, PUT update via snake_case aliases, missing part 400 check, response verification for variant fields, and audit-row verification.
- Runtime cleanup: temporary server, logs, pid file, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact parts variant route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 249/249.
- PM status: direct `@/lib/db` API route mentions decreased from 23 to 22 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CJ and does not automatically continue into Phase 3CK.

## 2026-06-15 Phase 3CK Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts cost profiles route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral part cost profile, cost tier, pending cost change request, audit SQL, async create method, and same-client part detail readback for transaction consistency.
- Updated `src/lib/numbering-async.ts`; added `createPartCostProfileAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/[partNumber]/cost-profiles/route.ts`; POST now uses `createPartCostProfileAsync(...)` and `requireNumberingActionAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync part cost profile DB/helper usage and SQLite semantic coverage proves profile, tier, pending change request, and audit SQL.
- Added [.ai-doc/reports/rd/rd-parts-cost-profiles-async-provider-report-2026-06-15.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-cost-profiles-async-provider-report-2026-06-15.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3040` with isolated `PDM_DATA_DIR=tmp-runtime-3ck-data` passed admin login, POST create, missing part 400 check, unsupported costType 400 validation check, response verification for profile/tier/change request fields, and audit-row verification.
- Runtime cleanup: temporary server, logs, pid file, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact parts cost profiles route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 250/250.
- PM status: direct `@/lib/db` API route mentions decreased from 22 to 21 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CK and does not automatically continue into Phase 3CL.

## 2026-06-16 Phase 3CL Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts cost change request route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral cost change request lookup, profile lookup, decision update, approve/reject profile update, active standard-cost close, standard-cost insert, audit write, async decision method, and same-client part detail readback for transaction consistency.
- Updated `src/lib/numbering-async.ts`; added `decidePartCostChangeRequestAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts`; PATCH now uses `decidePartCostChangeRequestAsync(...)` and `requireNumberingActionAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync part cost change DB/helper usage and SQLite semantic coverage proves approve standard-cost behavior plus reject pending-profile behavior.
- Added [.ai-doc/reports/rd/rd-parts-cost-change-request-async-provider-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-cost-change-request-async-provider-report-2026-06-16.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3041` with isolated `PDM_DATA_DIR=tmp-runtime-3cl-data` passed admin login, cost-profile fixture creation, approve PATCH, already-decided 400 check, reject PATCH, invalid decision 400 check, response verification for profile/request/standard-cost fields, and approve/reject audit-row verification.
- Runtime cleanup: temporary server, logs, pid file, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact parts cost change request route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 251/251.
- PM status: direct `@/lib/db` API route mentions decreased from 21 to 20 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CL and does not automatically continue into Phase 3CM.

## 2026-06-16 Phase 3CM Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: parts cost resolution route async provider conversion.
- Updated `src/lib/repositories/numbering-async-repository.ts`; added provider-neutral approved typed cost profile lookup, approved standard cost lookup, effective-date validation, and async cost resolution method.
- Updated `src/lib/numbering-async.ts`; added `resolvePartCostAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/parts/[partNumber]/cost-resolution/route.ts`; GET now uses `resolvePartCostAsync(...)` and `requireNumberingPageAsync(...)` without synchronous `@/lib/db` imports.
- Updated `scripts/qc-access-control-async-repository.mjs`; static checks now reject sync part cost resolution DB/helper usage and SQLite semantic coverage proves standard and typed approved profile tier resolution.
- Added [.ai-doc/reports/rd/rd-parts-cost-resolution-async-provider-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-parts-cost-resolution-async-provider-report-2026-06-16.md) with scope, coverage, verification, runtime smoke evidence, and boundary.
- Runtime smoke: temporary `next dev` on `http://127.0.0.1:3042` with isolated `PDM_DATA_DIR=tmp-runtime-3cm-data` passed admin login, standard cost resolution, typed `in_house` cost resolution, missing tier 400 check, missing part 400 check, and response verification for selected profiles, tiers, unit costs, setup costs, and extended costs.
- Runtime cleanup: temporary server, logs, pid file, port listener, and temporary data directory were cleaned; local `data/ai-pdm.sqlite` was not mutated.
- Scope: no Supabase connector calls, no migration apply, no Supabase project/branch creation, no live Postgres validation, no provider pointer update, no production cutover, and no rollback operation.
- Verification: `npx.cmd tsc --noEmit` passed.
- Verification: exact parts cost resolution route scan found no sync DB/helper match.
- Verification: `node --check scripts/qc-access-control-async-repository.mjs` passed.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 252/252.
- PM status: direct `@/lib/db` API route mentions decreased from 20 to 19 after this slice.
- PM stop point: per 2026-06-15 PM batch-control correction, work stops after Phase 3CM and does not automatically continue into the next route group.

## 2026-06-15 Staging Migration Post-Apply Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- Target: Supabase org `Jenfu Machinery / ydxbtstvlunmpjdlrhml`, project `AI_PDM_STAGING / qerabudthnnpqvybpcsq`, region `ap-northeast-1`.
- Safety boundary: no ProJED / `knodlkxqpcqyrtgwpdst` use, no ProJED_TEST / `fhisnnufoeulxqrchldf` use, no service role / secret / database password recorded in repository or chat, and no runtime provider pointer update.
- Pre-apply evidence: user confirmed `npm.cmd run db:postgres:guard -- --phase pre-migration` returned `postgresShadowConfigured=true`, `configuredTargetName=AI_PDM_STAGING`, `safe=true`, `mode=empty_public_schema`, `publicTableCount=0`, `unknownTables=[]`, and `issues=[]`.
- Apply boundary: Codex did not receive or store the DB password; staging SQL apply was performed from the user's local PowerShell session after explicit approval, using the already configured `PDM_POSTGRES_SHADOW_URL`.
- Post-apply guard evidence: user confirmed `npm.cmd run db:postgres:guard -- --phase compare` returned `postgresShadowConfigured=true`, `configuredTargetName=AI_PDM_STAGING`, `safe=true`, `mode=ai_pdm_shadow_schema`, `expectedTableCount=64`, `publicTableCount=64`, `missingExpectedTables=[]`, `unknownTables=[]`, and `issues=[]`.
- Connector table inventory: Supabase connector `list_tables(public)` on `qerabudthnnpqvybpcsq` returned 64 public tables, all with `rls_enabled=true`, and zero rows.
- Connector RLS catalog proof: read-only catalog query returned `public_table_count=64`, `rls_enabled_count=64`, `force_rls_count=64`, and `not_force_rls_count=0`.
- Connector migration-history caveat: `list_migrations` returned an empty migration list because the staging apply path used raw `psql -f` rather than Supabase CLI / MCP migration history tracking. This must be resolved before production cutover, either by adopting a formal Supabase migration history path or documenting the accepted staging exception.
- Security advisor caveat: Supabase Security Advisor reported expected INFO items for `rls_enabled_no_policy` under the current deny-by-default baseline, and one WARN for `public.set_updated_at` mutable `search_path`.
- Connector function proof: read-only query on `public.set_updated_at` returned empty `proconfig`, confirming the `search_path` hardening issue is real and should be fixed by a follow-up migration before production promotion.
- Performance advisor caveat: Supabase Performance Advisor reported INFO-level findings such as unindexed foreign keys, unused indexes on the empty staging database, and auth DB connection guidance; these require triage but did not invalidate the schema/RLS post-apply guard.
- PM status: `DEV-IND-007` blocker moves from target/apply blocked to post-apply verification; remaining gates are advisor hardening, live schema/data compare policy, runtime provider smoke, rollback proof, and production target/cost confirmation.
- PM status: `DEV-SUPABASE-DB-001` remains in progress; staging schema/RLS baseline is applied and verified, but runtime provider cutover is not approved until the `set_updated_at` hardening migration and live runtime smoke are complete.

## 2026-06-15 Staging Function Hardening Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- Approval: user explicitly approved Codex to use the Supabase connector on `AI_PDM_STAGING / qerabudthnnpqvybpcsq` for the `set_updated_at` `search_path` hardening migration and follow-up advisor/catalog validation.
- Live mutation: Supabase connector `apply_migration` succeeded with migration `20260615040619_harden_set_updated_at_search_path`.
- Applied SQL boundary: only `ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;` was applied; no tables, rows, providers, secrets, production targets, ProJED, or ProJED_TEST were modified.
- Connector function proof after apply: `public.set_updated_at` now has `proconfig={"search_path=public, pg_temp"}` and `pg_get_functiondef(...)` includes `SET search_path TO 'public', 'pg_temp'`.
- Connector RLS proof after apply: read-only catalog query still returned `public_table_count=64`, `rls_enabled_count=64`, `force_rls_count=64`, and `not_force_rls_count=0`.
- Connector migration history: `list_migrations` now includes `20260615040619 / harden_set_updated_at_search_path`. Earlier base migrations remain a staging-history caveat because they were applied via raw `psql -f` before this MCP migration.
- Security Advisor after apply: the previous `function_search_path_mutable` WARN for `public.set_updated_at` no longer appears; remaining security lints are INFO-level `rls_enabled_no_policy`, which is expected under the current deny-by-default baseline.
- Performance Advisor after apply: remaining performance lints are INFO-level items such as unindexed foreign keys, unused indexes on the empty staging database, and Auth connection strategy guidance; these require performance triage but did not block function hardening.
- Repo trace: added `db/postgres/003_harden_set_updated_at_search_path.sql`, generated `supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql`, and updated Supabase migration sync/QC scripts plus README references.
- Verification: `npm.cmd run supabase:migrations:sync` passed and manifest now records three migrations.
- Verification: `npm.cmd run qc:supabase-runtime-migrations` passed 22/22.
- Verification: diff-level secret scan found no privileged Supabase key marker, Postgres URL, password assignment, or secret assignment in the hardening changes.
- PM status: `set_updated_at` hardening blocker is closed for staging; remaining gates are base migration history policy, schema/data compare policy, runtime provider smoke, rollback proof, and production target/cost confirmation.

## 2026-06-15 Schema/RLS-only Compare Policy Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- Problem: the existing full compare command checks row counts and primary-key hashes, so an intentionally empty staging database can fail or be misread as a data migration problem even when schema and forced RLS are correct.
- Delivery: added `--schema-rls-only` mode to `scripts/compare-sqlite-postgres-shadow.mjs`.
- Delivery: added npm alias `db:postgres:compare:schema-rls` for staging schema/RLS validation.
- Delivery: schema/RLS-only reports include `comparePolicy="schema_rls_only"`, `dataCompareSkipped=true`, and a skip reason that documents why row-count/key-hash parity is intentionally bypassed.
- Delivery: full `db:postgres:compare` remains available as the row-count/key-hash data parity gate; it should run only after controlled seed or data migration policy is approved.
- Delivery: updated `db/postgres/README.md` and `supabase/README.md` so staging post-apply workflow uses `db:postgres:compare:schema-rls -- --require-postgres`.
- QC coverage: `scripts/qc-postgres-shadow-test.mjs` now verifies the schema/RLS-only command, npm alias, report policy marker, data-skip marker, and empty mismatch list.
- Verification: `node --check scripts/compare-sqlite-postgres-shadow.mjs` passed.
- Verification: `node --check scripts/qc-postgres-shadow-test.mjs` passed.
- Verification: `npm.cmd run db:postgres:compare:schema-rls -- --no-write` passed locally and returned `comparePolicy=schema_rls_only`.
- Verification: `npm.cmd run db:postgres:compare -- --no-write` still passed locally and returned `comparePolicy=schema_data`.
- Verification: `npm.cmd run qc:postgres-shadow` passed 25/25.
- Verification: `npm.cmd run qc:supabase-runtime-migrations` passed 22/22.
- PM status: schema/data compare policy blocker is reduced to an operational live run on `AI_PDM_STAGING`; data parity remains explicitly separate from schema/RLS readiness.

## 2026-06-15 Live Schema/RLS-only Compare Evidence Addendum

- Task: `DEV-SUPABASE-DB-001` and `DEV-IND-007`.
- User-run command: `npm.cmd run db:postgres:compare:schema-rls -- --require-postgres --no-write`.
- Target: `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`; `postgresShadowConfigured=true`.
- Result: `comparePolicy=schema_rls_only`, `dataCompareSkipped=true`, `missingInPostgres=[]`, `rlsMissingTables=[]`, `postgresCompareError=null`, and `mismatches=[]`.
- Target identity guard: `safe=true`, `configuredTargetName=AI_PDM_STAGING`, forbidden refs remain `knodlkxqpcqyrtgwpdst` and `fhisnnufoeulxqrchldf`.
- Target schema guard: `safe=true`, `mode=ai_pdm_shadow_schema`, `expectedTableCount=64`, `publicTableCount=64`, `missingExpectedTables=[]`, `unknownTables=[]`, and `issues=[]`.
- Evidence interpretation: live staging schema/RLS compare passes; full data parity compare remains intentionally separate because staging is empty while local SQLite has data.
- PM status: schema/data compare policy live gate is closed for staging schema/RLS readiness. Remaining gates are base migration history policy, runtime provider smoke, rollback proof, and production target/cost confirmation.
