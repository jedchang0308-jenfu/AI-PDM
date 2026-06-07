# AI PDM Dev Task Backlog

更新日期：2026-06-05
維護規則：主檔只保留未完成、進行中、阻塞與近期規格導向任務；完成任務以索引方式保留，詳細證據回到 RD/QA/QC 文件與 archive。
狀態圖例：`[ ]` 待辦、`[/]` 進行中、`[x]` 已完成、`[!]` 阻塞或外部等待。

## 整理原則

- 未完成任務不得從主檔消失。
- 未完成 spec 不得刪除；本次保留 `.ai-doc/specs/` 與既有 `docs/` 內規格文件。
- 主檔不再混入大量已完成任務細節、舊報告全文或亂碼內容。
- 每個 active task 必須有 RD 範圍、QA 驗證計畫、QC 驗收標準。
- 新的大型功能必須連到 spec。

## Active Task Overview

### P0 外部阻塞 / 正式驗證

| 狀態 | ID | 任務 | 目標 | 通過標準 |
|---|---|---|---|---|
| [!] | DEV-CAD-001 | SolidWorks Document Manager 或等效讀取元件 | Web / Windows 上傳可直接讀 `.sldprt`、`.sldasm`、`.slddrw` 自訂屬性與 CAD references | 不依賴 sidecar 或檔名推測即可帶入圖號、料號、版次與組合關係 |
| [!] | DEV-SW-001 | SolidWorks Add-in 實機驗證 | 在真實 CAD 電腦完成 COM 註冊、SolidWorks UI、真實檔案端到端送審 | 實機報告含安裝、登入、屬性讀取、PDF/DWG 匯出、送審結果 |
| [!] | DEV-BACKUP-001 | 離線單向備份與還原實測 | 在獨立測試機執行 restore drill 並回填報告 | 備份可還原、checksum 正確、交接包可被第三方復原 |
| [!] | DEV-FIELD-001 | 正式現場測試閉環 | 執行現場測試 preflight、handoff 與問題回收 | 現場測試報告完成，未通過項目轉為新 task |
| [!] | DEV-IND-007 | SQLite 到 Postgres / Supabase shadow migration | 以 disposable shadow target 驗證 migration / compare / RLS 路徑 | 不誤跑既有專案；shadow migration 證據完整 |

### P1 產品能力

| 狀態 | ID | 任務 | 目標 | 通過標準 |
|---|---|---|---|---|
| [x] | DEV-BOM-VISUAL-EDITOR-001 | BOM XMind 式圖像化編輯器 | 將 BOM 工作台主編輯區升級為 React Flow 混合畫布，支援父子件與同層排序拖拉，右側屬性改用圖號模組同款 drawer | 已完成；工程師可用圖像化樹狀畫布編輯 BOM 關係；資料仍以 parentLineId + sequenceNo 為準；UI/QC 驗證無 overflow、無 console error |
| [x] | DEV-UX-PLATFORM-001 | 多角色 AI PDM 平台 UX 架構優化 | 將首頁、導覽與物件頁從 RD 功能清單升級為多角色、物件中心、任務路由的平台 UX | Phase 1A/1B 已完成首頁工作台、sidebar 分群、主要流程 CTA、空狀態/完成狀態與 UI 驗證；自適應任務引擎另列 DEV-UX-PLATFORM-002 |
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

## Spec Index

| 狀態 | Spec | 關聯任務 | 位置 | 備註 |
|---|---|---|---|---|
| [x] | SPEC-BOM-VISUAL-EDITOR-001 | DEV-BOM-VISUAL-EDITOR-001 | [.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md) | Implemented；BOM 工作台升級為 XMind 式混合畫布與圖號模組同款 drawer，QC 通過 |
| [x] | SPEC-UX-PLATFORM-001 | DEV-UX-PLATFORM-001 | [.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md) | Phase 1A/1B Implemented；首頁工作台、平台導覽、流程定位、空狀態/完成狀態 CTA 已落地 |
| [x] | SPEC-BOM-WORKBENCH-001 | DEV-BOM-WORKBENCH-001 | [.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md) | Implemented；BOM 工作台第一版 QC 通過 |
| [x] | SPEC-PDM-NUMBERING-001 | DEV-PDM-NUMBERING-001 | [.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md) | Implemented；圖號料號自動化第一版 QC 通過 |
| [x] | SPEC-PDM-PART-COST-001 | DEV-PDM-PART-COST-001 | [.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-PART-COST-001-root-linked-drawing-part-cost.md) | Spec document created；第一版料號模組開發中；已落地料號變體、成本 profile/tier/standard/change request schema、`/parts` 工作台與 QC |
| [x] | SPEC-PDM-MASTER-WORKBENCH-001 | DEV-PDM-MASTER-WORKBENCH-001 | [.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md) | Implemented；三頁一致化主資料工作台與 QC script 已落地 |
| [x] | SPEC-PDM-IDENTITY-LIST-001 | DEV-PDM-IDENTITY-LIST-001 | [.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md) | Spec document created；延伸三頁主資料工作台，定義圖號 / 品名 / 料號主識別清單與欄寬驗收 |
| [x] | SPEC-PDM-DETAIL-DRAWER-001 | DEV-PDM-DETAIL-DRAWER-001 | [.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md) | Implemented；全系統資料明細 drawer 模板、排除範圍與 QC 檢查已落地 |
| [x] | SPEC-UX-FILE-DROPZONE-001 | DEV-UX-FILE-DROPZONE-001 | [.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md) | Implemented；全系統上傳入口統一拖曳 UX |
| [x] | Google Drive Folder Tree Settings Spec | DEV-GDRIVE-001 | [docs/google-drive-folder-tree-settings-spec-2026-05-30.md](C:/VIBE%20CODING/AI_PDM/docs/google-drive-folder-tree-settings-spec-2026-05-30.md) | Implemented；保留於既有 docs 位置 |

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
- RD 證據：BOM 工作台 React Flow 畫布與 drawer 實作 diff；[docs/rd-qc-bom-visual-editor-report-2026-06-07.md](C:/VIBE%20CODING/AI_PDM/docs/rd-qc-bom-visual-editor-report-2026-06-07.md)
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

## DEV-UX-PLATFORM-002：自適應任務路由與角色視角模型

狀態：[x]
優先級：P2
關聯 spec：[.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md)

## 任務目標

在 Phase 1 平台 UX 已穩定後，定義自適應任務摘要模型、角色視角、排序權重與資料來源，讓首頁工作台能依 RD、QA/QC、PM、製造、採購/供應商、管理者與系統管理者顯示不同優先任務與下一步。

## RD 執行項目

- [ ] 定義 task summary domain model，不直接綁死單一頁面或單一角色。
- [ ] 定義角色視角與排序權重，至少涵蓋逾期、阻塞、風險、待審、即將交接與系統異常。
- [ ] 定義資料來源 adapter，串接 numbering task、notification、BOM review、handoff readiness 與未來 QA/QC evidence。
- [ ] 建立首頁自適應 task feed MVP，保留現有工作台卡片作 fallback。

## QA 驗證計畫

- [ ] 以 RD、QA/QC、PM、製造、採購/供應商、管理者、系統管理者驗證 task feed 排序是否符合主要工作流。
- [ ] 驗證資料缺漏、權限不足、無待辦、跨部門阻塞時仍提供可行下一步。
- [ ] 驗證排序不會掩蓋 critical / overdue / release-blocking 任務。

## QC 驗收標準

- [ ] `npm.cmd run lint` 通過。
- [ ] `npm.cmd run build` 通過。
- [ ] 新增或更新對應 QC script，覆蓋主要角色與桌機/手機 viewport。
- [ ] QC 報告記錄角色輸入、排序結果、證據與殘留風險。

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

狀態：[ ]
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
- [ ] 實作同主根號自動關聯規則：相同 `part_root_id` 才可自動關聯，MA 圖可作 primary manufacturing link，OT 圖只能作 reference link。
- [ ] 實作一圖多料號的變體完整性檢查，DVT / Release 起材質、顏色或差異說明不得缺漏。
- [x] 實作成本 profile CRUD，採購可建立 draft / pending review，但不可直接改變 approved standard cost。
- [ ] 實作成本級距驗證，避免數量區間重疊，查詢時可明確回報無級距或級距衝突。
- [ ] 實作標準成本解析演算法：輸入料號、數量與日期，解析有效標準成本 profile 與對應級距。
- [ ] 實作指定成本情境解析演算法：可查委外、自製、採購等 approved profile 的有效成本。
- [ ] 實作成本變更審核流程，主管核准後才讓 profile approved 或 set standard 生效。
- [ ] 圖面 revision event 不得自動建立成本審核單；若材質、顏色或製程條件變更，需由料號 / 成本流程另行處理。
- [ ] 成本異動、標準成本指定與審核結果需寫入 append-only audit log。

### UI / UX
- [ ] 圖號明細頁顯示同主根號料號清單、材質、顏色、料號狀態、標準成本狀態與 primary MA link。
- [x] 料號明細頁顯示同主根號圖號、材質、顏色、差異說明、BOM 使用狀態、成本 profile、數量級距與標準成本。
- [ ] 成本審核中心顯示採購送審、異動前後、影響料號、核准 / 退回與審核意見。
- [x] 一圖多料號清單需讓使用者能比較同主根號下不同材質、顏色與成本差異。
- [ ] 若圖面 title block 寫死材質或顏色，UI 需提醒同圖多料號可能不成立，需改用「依料號規格」或建立變體表。

## QA 驗證計畫

- [ ] 驗證圖號模組可從 MA 圖看到同主根號下多個料號。
- [x] 驗證料號模組可從料號看到同主根號下可關聯 MA / OT 圖。
- [ ] 驗證同一 MA 圖可對應不同材質 / 顏色料號，且 DVT / Release 起缺少差異欄位會被阻擋。
- [x] 驗證成本只能掛料號，不會因同圖多料號而共用錯誤成本。
- [ ] 驗證採購建立成本 profile 後，在主管核准前不會影響標準成本。
- [ ] 驗證主管核准後，標準成本依指定基準數量與數量級距解析。
- [x] 驗證同一料號可同時保留委外、自製、採購等成本情境。
- [ ] 驗證圖面改版不會自動觸發成本重審或改變標準成本。
- [ ] 驗證 audit log 可追溯成本異動前後、申請人、審核人與理由。

## QC 驗收標準

- [ ] `npm.cmd run lint` 通過。
- [ ] `npm.cmd run build` 通過。
- [x] 新增或更新資料模型 / repository 單元測試，覆蓋主根號自動關聯與一圖多料號變體。
- [x] 新增或更新成本 profile / tier / standard cost API 測試。
- [ ] 新增或更新採購送審與主管審核 E2E 測試。
- [ ] 新增或更新 UI QC，覆蓋圖號明細、料號明細與成本審核中心。
- [ ] QC 報告需記錄測試資料中的圖號、料號、材質、顏色、成本級距、審核結果與 audit evidence。

## 阻塞 / 待確認

- [ ] 決定料號流水號是否要把材質 / 顏色編碼進號碼，或只保存於屬性欄位。
- [ ] 決定標準成本的預設基準數量，例如 1 pcs、100 pcs 或依料號類型設定。
- [ ] 決定哪些角色可看到成本金額，避免製造、品保或供應商視角洩漏敏感資訊。
- [ ] 決定材質 / 顏色第一版是否建立標準字典，或先以自由欄位收斂實際用語。

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
關聯 spec：[docs/google-drive-folder-tree-settings-spec-2026-05-30.md](C:/VIBE%20CODING/AI_PDM/docs/google-drive-folder-tree-settings-spec-2026-05-30.md)

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
- [ ] 取得 disposable Supabase / Postgres shadow target。
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
- [!] 需要可用 disposable Supabase / Postgres target。
- [!] 2026-06-02 RD/QA/QC：已產生 Postgres shadow handoff package `data/postgres-shadow-handoffs/20260602-091309`；package 內含 `postgres-shadow-handoff.json`、SQL copy/hash、`01-pre-migration-guard.ps1`、`02-apply-migration.ps1`、`03-compare-shadow.ps1`、`supabase-advisor-checklist.md` 與 `qc-checklist.ps1`。`qc:postgres-shadow-handoff-package` 驗證 package 檔案、hash、禁用既有 `ProJED` / `ProJED_TEST`、不硬編 Postgres URL、外部文件引用最新 package，QC 通過。實際 disposable target 建立、migration apply、live compare、Supabase advisor 證據與 production readiness closure 仍維持外部阻塞。
- [!] 2026-06-01 本地防呆與 traceability 已完成：`qc:postgres-shadow-target-guard` 10/10 通過，`qc:postgres-shadow` 21/21 通過；compare report 已包含 `db/schema.sql`、`db/postgres/001_initial_schema.sql`、`db/postgres/002_supabase_rls_plan.sql` 的 SHA-256，可追溯 migration 輸入。
- [!] 2026-06-01 續查：Supabase connector 已可用，organization `JED` 下有 `ProJED` 與 `ProJED_TEST`；兩者 public schema 都有既有 `profiles/projects/wbs_items/...`，不是乾淨 disposable shadow target。`_get_cost` 顯示 new project `0/monthly`、branch `0.01344/hourly`，但建立新 project/branch 仍需使用者先確認成本與 organization/region。
- [!] 本機 fallback 不可用：未找到 `psql` / `postgres`，Docker daemon 未啟動且 Docker config access denied。

## Completed / Archived Index

以下項目已完成，主檔只保留索引；詳細證據見 `docs/rd-*`、`docs/qa-*`、`docs/qc-*`、`docs/industrialization/*` 或 [.ai-doc/dev_task_archive_2026-05.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/dev_task_archive_2026-05.md)。

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
- 2026-06-02：`DEV-UX-PLATFORM-001` 完成 Phase 1A RD 實作。新增 sidebar 平台分群、首頁多角色工作台、共用 `WorkflowStrip`，並接入 `/upload`、`/numbering/request`、`/numbering/tasks`、`/numbering/imports`、`/numbering/impact`、`/bom/workbench`、`/bom/reviews`、`/handoff`；修正首頁搜尋 placeholder 與最近圖號同步。新增 RD/QC 文件：`docs/rd-ux-platform-report-2026-06-02.md`、`docs/qc-ux-platform-validation-report-2026-06-02.md`。驗證：`lint`、`build`、`qc:dashboard-quick-access` 16/16、`qc:dashboard-find-first` 16/16、`qc:pdm-numbering-task-center-ui` 22/22、`qc:pdm-numbering-import-center-ui` 22/22、`qc:pdm-numbering-impact-ui` 24/24、`qc:bom-workbench-ui` 35/35、Playwright smoke check 首頁 5 cards / 6 nav sections / overflow 0。任務維持 `[/]`，剩餘逐頁空狀態/完成狀態文案與完整自適應任務引擎另切。
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
- 2026-06-02：同步外部驗證交接文件到目前 `.ai-doc/dev_task.md` 權威路徑。更新 `docs/external-evidence-handoff-checklist-2026-05-27.md` 與 `docs/industrialization/external-validation-handoff-2026-05-28.md`，補上 2026-06-02 local gate 狀態、`DEV-IND-007` disposable Supabase/Postgres target 決策條件、現有 Supabase projects 不可作 shadow target 的限制，以及外部證據 ready 後應重跑的 completion/readiness/evidence sync 指令。
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
