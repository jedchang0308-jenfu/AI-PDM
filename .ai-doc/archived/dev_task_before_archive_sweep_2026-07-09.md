# AI PDM dev_task PM Control Board

Updated: 2026-07-09
Owner: Dev PM
Purpose: This file is the active DEV control board. Unfinished work stays here; completed work is summarized here and indexed in `.ai-doc/archived/completed-dev-index-2026-06.md`.

Historical snapshots:

- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

## 總任務清單

這是目前 AI/PM 協作的標準快速掃描入口。`DEV-001` 這類短碼是溝通用別名；原本的語意來源 ID 仍是規格、QC 腳本、證據路徑與歷史引用的權威 ID。

狀態符號：

- `○` 待排
- `☐` 可執行
- `◐` 執行中
- `◇` 驗證中
- `✓` 目前已授權的本地範圍已完成
- `!` 阻塞 / 需明確授權或外部證據
- `↷` 延後
- `×` 跳過

- ✓ DEV-001 [交付點] [完成] [P0] [本地完成 / 未授權發版] 全系統審核平台化
  - 來源 ID：`DEV-PDM-APPROVAL-PLATFORM-001`
  - 父任務：編號、送審、BOM、成本與補件等審核流程
  - 下一步：歷史實體遷移與發版需另行授權
  - 計入交付：是

- ✓ DEV-002 [交付點] [完成] [P1] [本地完成 / 未授權切換] Supabase 核心檔案權威與 Google Drive 備份鏡像
  - 來源 ID：`DEV-PDM-FILE-STORAGE-001`
  - 父任務：`DEV-SUPABASE-DB-001`、`DEV-STORAGE-COST-001`
  - 下一步：正式儲存桶/RLS、一次性遷移、提供者指標切換與還原演練需另行授權
  - 計入交付：是

- ✓ DEV-003 [交付點] [完成] [P0] [本地完成] 使用者身分、組織範圍與權限架構
  - 來源 ID：`DEV-PDM-ACCESS-CONTROL-001`
  - 父任務：`DEV-PDM-SETTINGS-CENTER-001`
  - 下一步：觀察 APP 回饋；Google OAuth、邀請流程與路由權限盤點需另行授權
  - 計入交付：是

- ✓ DEV-004 [交付點] [完成] [P0] [本地完成 / 未授權發版] 情境式編號生命週期入口
  - 來源 ID：`DEV-PDM-NUMBERING-004`
  - 父任務：`DEV-PDM-NUMBERING-003`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-LIFECYCLE-ACTIONS-001`
  - 下一步：觀察 APP 回饋；正式環境、Supabase 與發版產物未授權
  - 計入交付：是

- ! DEV-005 [交付點] [阻塞] [P0] [需 RD 授權] 研發 / 技術移轉送審關卡
  - 來源 ID：`DEV-PDM-SUBMISSION-GATE-001`
  - 父任務：圖面送審、工作台與發行生命週期權威
  - 下一步：取得明確 RD 授權後才可產品實作
  - 計入交付：是

- ✓ DEV-006 [交付點] [完成] [P1] [本地完成] 圖料模組關係視圖
  - 來源 ID：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`、`DEV-PDM-NUMBERING-002`
  - 下一步：觀察 APP 回饋；正式環境與批次關係寫入仍需關卡
  - 計入交付：是

- ✓ DEV-007 [交付點] [完成] [P2] [本地完成] 全系統可行動狀態提示與下一步 UX
  - 來源 ID：`DEV-PDM-NEXT-STEP-UX-001`
  - 父任務：`DEV-PDM-STATUS-UX-001`
  - 下一步：觀察 APP 回饋；掃描器/檢查清單與正式環境需另行授權
  - 計入交付：是

- ✓ DEV-039 [交付點] [完成] [P1] [本地 Phase 1A 完成 / 未授權發版] 圖號 / 料號 / 主根號統一物件詳情抽屜
  - 來源 ID：`DEV-PDM-ENTITY-DETAIL-DRAWER-001`
  - 父任務：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBERING-004`、主資料工作台
  - 下一步：觀察 APP 回饋；完整 shared shell 抽取、正式環境與發版產物未授權
  - 計入交付：是

- ✓ DEV-008 [PM 證據] [完成] [P3] [不適用] 本地開發入口 CAPA 預防措施
  - 來源 ID：`PA-LOCAL-DEV-3000-001`
  - 父任務：無
  - 下一步：依規則使用 `npm run dev:local`、`dev:local:check`、`dev:local:restart`
  - 計入交付：否

- ✓ DEV-009 [交付點] [完成] [P2] [本地完成] 全系統狀態中文化與狀態欄說明
  - 來源 ID：`DEV-PDM-STATUS-UX-001`
  - 父任務：生命週期與發行狀態工作
  - 下一步：觀察 APP 回饋；DB enum/schema 改名仍需關卡
  - 計入交付：是

- ✓ DEV-010 [開發點] [完成] [P2] [本地完成] 狀態語意分層與狀態混用修正
  - 來源 ID：`DEV-PDM-STATUS-UX-002`
  - 父任務：`DEV-PDM-STATUS-UX-001`、`DEV-PDM-NEXT-STEP-UX-001`
  - 下一步：第 2 階段掃描器強化未授權
  - 計入交付：否

- ✓ DEV-011 [交付點] [完成] [P1] [本地完成] 緊湊編號核心 V2
  - 來源 ID：`DEV-PDM-NUMBERING-002`
  - 父任務：編號核心 / 圖料工作台
  - 下一步：正式環境、Supabase 切換與進一步資料修復仍需關卡
  - 計入交付：是

- ✓ DEV-012 [交付點] [完成] [P1] [本地完成] 英數主根號身分 V3
  - 來源 ID：`DEV-PDM-NUMBERING-003`
  - 父任務：`DEV-PDM-NUMBERING-002`
  - 下一步：正式環境、Supabase 遷移與直接資料修復仍需關卡
  - 計入交付：是

- ✓ DEV-013 [開發點] [完成] [P1] [本地完成] QC 隔離、流水號完整性與本機修復
  - 來源 ID：`DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`
  - 父任務：編號流水號完整性
  - 下一步：第 4 階段正式環境 / Supabase 未核准
  - 計入交付：否

- ✓ DEV-014 [交付點] [完成] [P1] [本地完成] 圖面送審工作台與發行未完成恢復流程
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
  - 父任務：圖面送審權威
  - 下一步：第 2+ 階段交接範圍仍需關卡
  - 計入交付：是

- ! DEV-015 [開發點] [阻塞] [P1] [未授權] 圖面送審工作台第 2+ 階段交接包
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`
  - 父任務：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
  - 下一步：先授權特定第 2+ 階段切片才可 RD
  - 計入交付：否

- ✓ DEV-016 [開發點] [完成] [P1] [本地完成] 發行未完成 UI 自救流程
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`
  - 父任務：圖面送審工作台
  - 下一步：觀察 APP 回饋；正式環境修復仍需關卡
  - 計入交付：否

- ✓ DEV-017 [交付點] [完成] [P1] [本地完成] 圖面進版受控送審包第 1 階段
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 父任務：圖面進版權威
  - 下一步：觀察 APP 回饋；正式環境與直接修復仍需關卡
  - 計入交付：是

- ✓ DEV-018 [交付點] [完成] [P1] [本地完成] 多檔版次包送審
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 下一步：觀察 APP 回饋
  - 計入交付：是

- ✓ DEV-019 [交付點] [完成] [P1] [本地完成] 非依序進版與最新 / 歷史行為
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 下一步：觀察 APP 回饋
  - 計入交付：是

- ✓ DEV-020 [交付點] [完成] [P1] [本地完成] 一級版次附件包模型
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 下一步：仍建議補瀏覽器補件證據；正式環境需關卡
  - 計入交付：是

- ✓ DEV-021 [交付點] [完成] [P1] [本地完成] 共用 3D 主檔與 MA 製造基準包
  - 來源 ID：`DEV-PDM-SHARED-3D-MA-BASELINE-001`
  - 父任務：進版包、圖料工作台與發行同步
  - 下一步：觀察 APP 回饋；正式環境、CAD/OCR 仍需關卡
  - 計入交付：是

- ✓ DEV-022 [交付點] [完成] [P2] [本地完成] 系統設定中心與 Secret 生命週期治理
  - 來源 ID：`DEV-PDM-SETTINGS-CENTER-001`
  - 父任務：CAD、Supabase 與設定權威
  - 下一步：正式 Vault smoke 驗證、真實 CAD 證據與正式環境仍需關卡
  - 計入交付：是

- ✓ DEV-023 [交付點] [完成] [P1] [本地完成 / 外部證據仍有缺口] Windows SolidWorks 原檔預覽衍生檔
  - 來源 ID：`DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`
  - 父任務：設定中心、CAD 讀取器與附件預覽
  - 下一步：真實 SLDDRW key、SLDASM 證據與正式環境仍需關卡
  - 計入交付：是

- ✓ DEV-024 [交付點] [完成] [P1] [本地完成] 送審發行後主檔生命週期同步
  - 來源 ID：`DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
  - 父任務：圖面送審工作台
  - 下一步：歷史修復與正式環境遷移仍未核准
  - 計入交付：是

- ✓ DEV-025 [開發點] [完成] [P2] [本地完成] 重複進行中送審衝突分類
  - 來源 ID：`DEV-PDM-SUBMISSION-CONFLICT-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 下一步：觀察 APP 回饋；歷史重複修復需關卡
  - 計入交付：否

- ✓ DEV-026 [交付點] [完成] [P1] [本地完成] 圖料模組資料流與送審安全架構
  - 來源 ID：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 父任務：圖面送審權威
  - 下一步：觀察 APP 回饋；正式環境與資料修復需關卡
  - 計入交付：是

- ✓ DEV-027 [交付點] [完成] [P2] [本地完成] 圖面來源只送審流程
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-001`
  - 父任務：圖面模組主資料流程
  - 下一步：觀察 APP 回饋；正式部署未核准
  - 計入交付：是

- ✓ DEV-028 [開發點] [完成] [P3] [本地完成] APP 人工驗證 UI 打磨包
  - 來源 ID：`DEV-PDM-UI-POLISH-001`
  - 父任務：無
  - 下一步：未來改善需拆成新的聚焦任務
  - 計入交付：否

- ✓ DEV-029 [開發點] [完成] [P3] [本地完成] 圖面進版工作台聚焦切片
  - 來源 ID：`DEV-PDM-UI-POLISH-001A`
  - 父任務：`DEV-PDM-UI-POLISH-001`
  - 下一步：剩餘改善需拆成新任務
  - 計入交付：否

- ↷ DEV-030 [關卡] [延後] [P0] [正式環境未授權] Supabase 執行期提供者與正式環境切換
  - 來源 ID：`DEV-SUPABASE-DB-001`
  - 父任務：無
  - 下一步：PM 決定正式目標、成本、資料庫建議分流、遷移與回復負責人
  - 計入交付：否

- ! DEV-031 [QA/QC] [阻塞] [P0] [需核准] Supabase 資料一致性政策執行
  - 來源 ID：`DEV-SUPABASE-DB-001-DATA-PARITY`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 下一步：核准一致性層級、來源快照、資料表範圍、目標與憑證邊界
  - 計入交付：否

- ↷ DEV-032 [關卡] [延後] [P0] [正式環境未授權] Supabase 正式環境關卡
  - 來源 ID：`DEV-SUPABASE-DB-001-PROD-GATE`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 下一步：需要正式環境發版關卡授權
  - 計入交付：否

- ○ DEV-033 [交付點] [待排] [P2] [需產品上線決策] 儲存治理與成本上線推廣
  - 來源 ID：`DEV-STORAGE-COST-001`
  - 父任務：儲存權威 / 成本控制
  - 下一步：確認真實儲存盤點、目標、成本、保留政策與正式時程
  - 計入交付：是

- ! DEV-034 [關卡] [阻塞] [P0] [需外部證據] SQLite 到 Postgres / Supabase 影子遷移
  - 來源 ID：`DEV-IND-007`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 下一步：一次性測試目標、正式 RLS 計畫與 `qc:postgres-shadow` 證據
  - 計入交付：否

- ! DEV-035 [關卡] [阻塞] [P0] [需外部證據] SolidWorks Document Manager 或等效讀取器
  - 來源 ID：`DEV-CAD-001`
  - 父任務：原檔預覽 / CAD 中繼資料
  - 下一步：取得授權讀取元件證據
  - 計入交付：否

- ! DEV-036 [關卡] [阻塞] [P0] [需外部證據] SolidWorks Add-in 實機驗證
  - 來源 ID：`DEV-SW-001`
  - 父任務：SolidWorks 整合
  - 下一步：取得實機驗證證據
  - 計入交付：否

- ! DEV-037 [關卡] [阻塞] [P0] [需外部證據] 離線單向備份與還原演練
  - 來源 ID：`DEV-BACKUP-001`
  - 父任務：儲存 / 發版準備
  - 下一步：取得還原演練證據
  - 計入交付：否

- ! DEV-038 [關卡] [阻塞] [P0] [需外部證據] 正式現場測試證據
  - 來源 ID：`DEV-FIELD-001`
  - 父任務：正式環境準備
  - 下一步：取得正式現場測試證據
  - 計入交付：否


## DEV-039：圖號 / 料號 / 主根號統一物件詳情抽屜

狀態：本地 Phase 1A 完成 / 未授權發版
節點類型：交付點
優先級：P1
父交付點：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBERING-004`、主資料工作台
是否計入產品交付完成：是
目前授權階段：使用者 2026-07-09 `完成DEV-039開發 /goal` 已授權 Phase 1A 本地產品實作；release/merge/deploy 未授權
文件狀態：Implemented locally / Release Not Authorized
原始需求邊界：使用者指出同一圖號從圖號模組與圖料模組打開時右側抽屜資訊不同，並確認同樣原則也應套用到料號。

### 任務目標

建立一套跨入口物件詳情契約：點圖號永遠顯示圖號詳情，點料號永遠顯示料號詳情，點主根號永遠顯示主根號詳情。`/numbering/search`、`/numbering/drawings`、`/parts` 保留不同入口任務，但右側抽屜共用一致的物件資訊架構。

### 開發範圍

- [x] `/numbering/search` 關係樹與矩陣 click target 依 root/drawing/part 傳入正確 entity type。
- [x] `/numbering/search` 依 target entity 顯示 root/drawing/part 專屬核心區塊，而不是永遠像主根詳情。
- [x] `/numbering/search` 非主根號 target 改用 owner-style 首屏；主根彙總 metrics、料號清單、圖號清單、關係維護、warnings/impact/audit 僅在點主根號時顯示。
- [x] Drawing target 顯示圖號生命週期、`圖號附件庫`、`送審檢查`、`同主根號料號` 與 drawing contextual actions。
- [x] Part target 顯示料號生命週期、`料號屬性`、`料號附件庫`、`圖號關聯`、`成本狀態` 與 part contextual actions。
- [x] `/numbering/drawings` 與 `/parts` owner drawers 暴露一致 `data-detail-*` / `data-entity-*` / `data-source-context` metadata。
- [x] `sourceContext` 只控制來源標記、預設資料聚焦或 highlight，不改變核心物件資訊。
- [ ] 完整 shared `EntityDetailDrawerShell` 與三個 canonical panel component 抽取：延後為 Phase 1B；目前 Phase 1A 使用既有 owner components/APIs 加 target-aware adapters，避免大範圍重構。

### Out of Scope

- 不合併 `/numbering/search`、`/numbering/drawings`、`/parts` 三個入口頁。
- 不改編號規則、schema、RLS、權限矩陣或 lifecycle 狀態機。
- 不做 production deploy、Supabase live cutover、merge、PR、rollback、production smoke 或 release report。
- 不新增成本流程、附件流程或批次關係編輯功能。

### 驗收標準

- [x] 同一圖號從 `/numbering/drawings` 與 `/numbering/search` 打開時，identity、狀態、附件、送審檢查、關聯料號與主要動作一致。
- [x] 同一料號從 `/parts` 與 `/numbering/search` 打開時，identity、狀態、屬性、關聯圖號、成本狀態與主要動作一致。
- [x] 點主根號只開主根號詳情；點圖號不顯示主根號-only 詳情；點料號不顯示主根號-only 詳情。
- [x] 點圖號/料號時不顯示主根號彙總 metrics、全主根料號清單、全主根圖號清單與治理/audit 區塊；首屏資訊密度與 owner 模組一致。
- [x] 來源頁只影響預設聚焦區塊，不影響資料真相、權限、cost redaction 或附件可見性。
- [x] Drawer 在 desktop/laptop/narrow viewport 無重疊、裁切、文字溢出或頁面層水平 overflow。

### RD 執行計畫

- [x] 讀 `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`。
- [x] 讀 `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`。
- [x] 不改資料模型；使用既有 root/drawing/part owner APIs 與 frontend adapters。
- [x] 保留 `src/components/numbering-contextual-entrypoints.tsx` 的既有行為。
- [x] 更新 focused QC：`npm.cmd run qc:pdm-entity-detail-drawer`。

### QA 驗證計畫

- [x] 驗證 root/drawing/part click target 正確。
- [x] 驗證同一圖號跨兩入口核心內容一致。
- [x] 驗證同一料號跨兩入口核心內容一致。
- [x] 驗證 part cost redaction 與 attachment permission parity 的程式契約；人工 restricted-role browser pass 可作後續 hardening。
- [x] 驗證 error/not-found/restricted 狀態不露 raw backend text 的 focused static contract。
- [x] 驗證 drawer close/resize/keyboard/RWD 既有 regression。

### Evidence Required

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
npm.cmd run qc:pdm-entity-detail-drawer
```

### Verification Executed 2026-07-09

- `npm.cmd run qc:pdm-entity-detail-drawer`：9/9 passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- `npm.cmd run lint -- --quiet`：passed；同時將 generated `output/**` 加入 ESLint flat config global ignore，避免 lint 掃描 Next/QC 產物。
- `npm.cmd run qc:pdm-numbering-search-ui`：30/30 passed，於隔離 copy server `http://127.0.0.1:3110` + disposable SQLite DB 執行。
- `npm.cmd run qc:pdm-drawing-part-relation-view`：62/62 passed，於隔離 copy server 執行；包含 root/drawing/part click opens matching drawer。
- `npm.cmd run qc:part-number-module`：83/83 passed；更新 QC 接受目前 approval platform legacy part-cost adapter，同時保留 `numbering.approval.batch.decide` 權限檢查。
- `npm.cmd run build`：passed in isolated workspace copy `output/qc-runtime/dev039-entity-drawer-copy-20260709-104336/workspace`，避免清理原本 3000 dev server 的 `.next`。
- `npm.cmd run qc:pdm-system-detail-drawer-ui`：72/72 passed after approval platform redirect contract alignment；`/numbering/approvals` is verified as a legacy redirect into canonical `/approvals`, not as a stale independent drawer host.
- `npm.cmd run qc:pdm-approval-platform`：106/106 passed，確認 canonical approval workbench 與 legacy reviewer redirect governance 仍有效。

### Verification Follow-up 2026-07-09 - Information Density Parity

- `npm.cmd run qc:pdm-entity-detail-drawer`：12/12 passed；新增 root aggregate section 僅限主根號 target、非主根號 owner-style action surface、圖號 target section order 檢查。
- `npx.cmd eslint src/app/numbering/search/page.tsx scripts/qc-pdm-entity-detail-drawer.mjs --quiet`：passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- Browser DOM smoke：新啟動 headless Chrome 可進入 `/numbering/search`，但目前未登入，只能看到登入牆；未使用使用者既有 Chrome profile，因此本輪未產出登入態截圖。

### Stop Conditions

- RD 發現必須變更 schema、RLS、權限或 lifecycle 狀態機。
- 同一物件跨入口的 cost visibility 或 attachment visibility 不一致。
- 為了統一抽屜必須刪掉圖號或料號 owner page 的關鍵資訊。
- 需要 production/Supabase live change、direct data repair/deletion、merge、PR、deploy、rollback 或 production smoke。

### 相關文件

- SPEC：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`
- QA：`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`
- 延伸：`.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
- 延伸：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
- 延伸：`.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`

### Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Phase 1 產品實作 | Same Spec Phase / Not Authorized | 文件已達 RD Implementation Ready；等待使用者明確授權 RD。 |
| Optional read-only detail facade | Same Spec Phase / Not Authorized | 只有 Phase 1 duplication 風險被證明時才執行。 |
| 合併三個入口頁 | No Tracking | 已拒絕；入口任務不同。 |
| schema/RLS/permission/lifecycle 變更 | Blocked Human Re-entry | 非本輪預期；若 RD 發現需要，回 PM/使用者決策。 |
| merge/PR/deploy/release/rollback/production smoke | Blocked Human Re-entry / Release Authorization Required | 未授權，不產出 release artifacts。 |

### All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC、QA、dev_task、documentation_map | product implementation | 使用者要求寫成開發文件 | 文件建立並索引 | git diff / file review |
| Phase 1A / target-aware parity | Authorized 2026-07-09 | Implemented locally | target entity metadata、search drawer drawing/part/root core sections、owner drawer metadata、focused QC | full shell extraction、schema/RLS、入口頁合併、release | 使用者 `完成DEV-039開發 /goal` | 同一圖號/料號跨入口資訊一致 | tsc、lint、isolated build、focused QC、browser QC |
| Phase 1B / shared drawer extraction | Not authorized | Deferred | shared shell、canonical extracted panels | schema/RLS、入口頁合併、release | Phase 1A duplication risk or APP feedback | same behavior with lower duplication | focused regression |
| Phase 2 / optional facade | Not authorized | RD Contract Ready / Not Authorized | read-only detail facade if needed | writes、ownership 變更 | Phase 1 duplication risk evidence + authorization | API parity and no-write side effect | API parity QC |
| Phase 3 / release | Not authorized | Release Authorization Required | merge/deploy/production smoke/rollback | 未授權 production work | explicit release authorization | deployment-release-gate pass | release gate evidence |

### 變更紀錄

- 2026-07-09：建立開發文件、QA plan、dev_task 索引與 documentation_map 索引。Phase 1 產品實作未授權；release artifacts 延後。
- 2026-07-09：依使用者 `完成DEV-039開發 /goal` 授權完成本地 Phase 1A。`/numbering/search` target-aware drawer 已補 drawing/part/root 核心區塊；owner drawers 補 entity metadata；新增 `qc:pdm-entity-detail-drawer`。Release/merge/deploy 與完整 shared shell extraction 未授權。
- 2026-07-09：依使用者要求解決 system drawer QC false blocker。`qc:pdm-system-detail-drawer-ui` 已改為驗證 `/numbering/approvals` legacy redirect 與 canonical `/approvals` workbench detail panel contract；focused QC 72/72 與 `qc:pdm-approval-platform` 106/106 通過。未改產品 UI、schema、資料或 release artifacts。
- 2026-07-09：依 APP 截圖回饋修正 `/numbering/search` 圖號/料號 detail drawer 資訊密度不一致。非主根號 target 不再顯示主根彙總 metrics、全主根清單、關係維護、warnings/impact/audit；改以 owner-style hero + target core sections 呈現。Focused QC 12/12、eslint、tsc 通過；登入態 browser 截圖未產出。

## 1. PM Snapshot

Current active objective: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` is the latest local delivery package. Phase 1 controlled revision package, Phase 2 multi-file package intake, Phase 3 out-of-order revision/latest-history behavior and Phase 4 first-class revision attachment package model are implemented and locally verified. Phase 4 implements stable `packageId`, package file membership, Released-core immutability, supplement request/approval child records, supplement approval by the current system reviewer/supervisor or Admin, approved supplement `補件` marking in the same main attachment list, and IDE/Codex dry-run reporting for ambiguous legacy migration records instead of a product pending area. The current product rule is: upload/attachment alone is not a formal revision; formal revision requires the controlled submission/review/release package; revisions can be entered and approved in any order; duplicate formal same drawing + same revision is blocked; the computed latest is shown first and older formal revisions belong in history. Production deploy, production migration/cutover, direct data repair, historical cleanup, FFF/part/BOM rule changes, strict chronological approval and dedicated mobile-phone UI remain excluded.

New implemented local package:

- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` Phase 1 is implemented / verification passed locally after the user's 2026-07-03 authorization to execute development, with 2026-07-05 APP feedback applied. `/numbering/revisions` now has a `新版圖面` step, drawing-owned attachment upload/selection for the intended revision, target-revision-only primary attachment selection, collapsed read-only previous/other-revision reference attachments, a dedicated controlled drawing-revision submission API, Pending submission creation, FFF assessment linkage through `drawing_revision_fff_assessments.submission_id`, and a safe compensation path that cancels the Pending submission if FFF creation fails. No-impact drawing revisions may keep part and BOM unchanged with reviewer BOM no-revision confirmation.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` is implemented / verification passed locally after the user's 2026-07-05 `執行開發` authorization. `/numbering/revisions` now treats one target revision as a multi-file `版次檔案包`, accepts multiple queued files, auto-classifies file roles by extension, lets the submitter correct each role, stores package roles/warnings in the submission snapshot, shows warning-only package completeness guidance to the submitter, and surfaces the same warning codes on the full submission detail page and dashboard drawer before approval/rejection. No schema migration, production deploy, direct data repair, CAD/OCR extraction, FFF rule change, forced part/BOM revision, or optional-warning hard block was performed.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` is implemented / verification passed locally after the user's 2026-07-05 `執行開發` authorization. The release flow now accepts out-of-order non-duplicate revisions, still blocks duplicate formal same drawing + revision records, recomputes latest/history by deterministic revision comparison, keeps lower backfilled revisions as formal history, promotes higher revisions to latest, and keeps first-level attachment/package views focused on the computed latest.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4` is implemented / verification passed locally from the user's 2026-07-06 guided decisions and later RD execution authorization. It adds a first-class revision attachment package model with stable `packageId`, package files, Released-core immutability, supplement reason menu, supplement request/approval records, supplement approval by current reviewer/supervisor or Admin, approved supplement `補件` tagging in the main attachment list, multi-file supplement intake and migration dry-run reporting for ambiguous legacy records. Local schema/runtime files and SQLite bootstrap were updated; production deploy, production migration/cutover and existing-data repair were not performed.

New implemented local settings package:

- `DEV-PDM-ACCESS-CONTROL-001` 本地上線切片已完成並通過驗證。依 2026-07-07 使用者授權，`/settings/workflow` 已改成「鉦富」唯讀工作區，管理員不需要也不能在這裡選公司；已加入製造、採購、外部專員角色，角色指派可設定適用範圍、指定範圍、內部負責人、90 天複核日與到期停用日；外部專員預設只能查詢、看圖、留言與提供建議，不預設建立、審核、發行、匯出或調整權限。審核矩陣已把「規則名稱」自由輸入改為唯讀「規則摘要」，並用「情境 / 處理」使用者語言由觸發動作、條件、控制與審核角色自動產生，畫面將情境與處理分行顯示；後端會覆寫 API 傳入的 `ruleName`，避免名稱與實際規則行為不一致。SQLite 啟動 schema 與 Postgres/Supabase migration planning 檔案已更新。驗證通過：`npx.cmd tsc --noEmit --pretty false`、`npm.cmd run qc:pdm-access-control-governance` 88/88、`npm.cmd run lint` 0 errors / 3 個既有無關 warnings。Google OAuth / 身分提供者、無 Google 帳號邀請流程、全路由旁路權限切換、未來久方工作區、正式環境部署/遷移與 live Supabase migration 仍未授權。
- `DEV-PDM-SETTINGS-CENTER-001` Phase 1 is implemented / verification passed locally after the user's 2026-07-06 authorization. `/settings` now has a settings center overview/work queue, five management-area routes, and a SolidWorks Document Manager secret lifecycle panel. Server-only APIs support redacted status, draft creation, test, activation and revoke. Additive metadata tables `secret_references`, `setting_test_runs` and `setting_activation_events` store lifecycle metadata only; local execution uses a `local_test_double` provider and keeps Supabase Vault live write/smoke as an explicit blocker before production. Existing Google Drive settings remain operational. Production deploy/cutover, Supabase Vault live writes, direct data repair/deletion, external-cost actions and real SolidWorks/CAD-reader proof remain not authorized.

New completed local native preview package:

- `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` Phase 1 local vertical slice is implemented / verification passed locally after the user's 2026-07-06 authorization, then amended with real Windows Shell worker evidence and a SolidWorks Document Manager SLDDRW PNG worker path. PDM now has additive `preview_jobs` and `file_derivatives` metadata, token-gated worker claim/complete routes, attachment preview enqueue/list APIs, derivative streaming under the source attachment permission path, a fake local PNG worker for deterministic local QC, a Windows `IShellItemImageFactory` worker for model thumbnails, a Document Manager sheet-preview exporter/worker for SLDDRW, blank/low-information PNG quality gating, no-store attachment list responses, and derivative-aware 3D/2D preview cards. Browser behavior is now: ready derivative tied to current source hash first, then PDF/image source, then Google Drive, then actionable placeholder. Verification passed with `tsc`, lint, focused native-preview QC, redaction QC, master-attachments QC, local dev health, API worker smoke on `D-0007-MA1` showing `.SLDPRT` succeeds with a real `windows_solidworks_preview_worker` derivative, and browser smoke showing `.SLDDRW` fails cleanly with a compact worker-key recovery message instead of remaining queued. Full `.SLDDRW` success still requires a worker-readable real Document Manager key via Supabase Vault live secret or worker environment variable; full `.SLDASM` readiness still requires equivalent worker evidence. Phase 2 `.SLDDRW -> PDF`, Phase 3 interactive 3D and Phase 4 production rollout remain not authorized.

New implemented local numbering package:

- `DEV-PDM-NUMBERING-002` Phase 1-4 local/runtime implementation is implemented / verification passed after the user's 2026-07-07 RD authorization and later explicit formal-cutover authorization. New records now use compact v2 `00001 / 00001-P01 / 00001-M01 / 00001-R01`; `00001` remains a reusable design-object root, not a project/order/equipment root; normal creation uses `M/R`; local/runtime master rows were converted from v1 to v2 through the scripted backup/apply/check path; `numbering-rule-v1` is retired and `numbering-rule-v2` is active. External production/Supabase live cutover, provider pointer change, direct/manual DB repair/deletion outside the scripted boundary, project/order/equipment numbering and extra visible category codes remain not authorized.
- `DEV-PDM-NUMBERING-003` Phase 1-3 local implementation is complete for the selected `A0001-Z9999` scheme. New normal rule/default creation uses alphanumeric root v3 (`A0001-P01`, `A0001-M01`, `A0001-R01`); root letters are capacity bands only; existing v1/v2 identities remain readable/searchable; v3 allocation reserves legacy numeric root ordinals and audit/control root evidence; UI/API wording separates `M` drawing category / manufacturing-basis relation from actual manufacturability. The authorized local runtime cutover converted `data/ai-pdm.sqlite` master identities from v2 numeric roots to v3 through dry-run, backup, apply and independent check reports. `I/O/Q` exclusion, production/Supabase migration, direct data repair/deletion outside the scripted cutover boundary and release artifacts remain not authorized.

New prepared local numbering/lifecycle package:

- `DEV-PDM-NUMBERING-004` Phase 1-3 local implementation is complete after the user's 2026-07-08 RD authorization, with APP feedback follow-up applied for draft cleanup, optional add UX and root-owned naming. Object-context root/drawing/part entries now support adding `M02/R01`, adding `P02`, formal part/drawing obsolete requests, root obsolete impact preview with whole-root batch intent, aggregate approval package creation, repository/API/audit support and `/numbering/request` existing-root fallback mode. Draft-only root bundles now expose `刪除草稿` instead of formal obsolete wording, add drawing/part dialogs can be cancelled before save, the root optional add section is labeled `新增相關資料` instead of `接續操作`, and part names are derived from the root core name instead of editable 料號/圖號 level 品名 fields. Evidence: `tsc`, lint, build, focused QC 44/44, isolated API smoke 10/10 and browser screenshots. Production/Supabase live cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.

New prepared approval platform package:

- `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1A-1B local implementation, Phase 1C-A reviewer entrypoint consolidation and Phase 1C-B legacy reviewer page convergence are complete after the user's RD authorizations. ADR 002 selected additive `approval_platform_*` v2 tables. Local work adds platform schema, immutable SQLite snapshot/decision/event triggers, repository/service, `/api/approvals/*`, `/approvals`, legacy read/decision adapters for numbering/submission/BOM/cost/supplement/drawing-revision-impact reviews, friendly-route decision delegation through platform adapters, focused QC and guarded migration dry-run/apply tooling. Phase 1C-A makes `/approvals` the single primary reviewer approval sidebar entry labeled `審核工作台`, removes specialized reviewer decision entries from primary navigation, adds a reviewer-role/company-scoped pending badge, and exposes status/domain/action filters with URL query deep links. Phase 1C-B redirects `/numbering/approvals`, `/bom/reviews` and `/numbering/change-reviews` into equivalent workbench filter states with bookmarked-route compatibility messages. Evidence: previous Phase 1A-1C-A evidence plus `npx.cmd tsc --noEmit --pretty false` passed, `npm.cmd run qc:pdm-approval-platform` 106/106 passed, source-scoped lint passed, `npm.cmd run dev:local:check` healthy, and route smoke confirmed 307 redirects for the three legacy reviewer pages. `npm.cmd run build` was blocked by the intentional local-dev guard because the healthy project-owned dev server was listening on port 3000; no bypass was used. Physical historical migration execution, production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.

Current completed local package state:

- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` is implemented / verification passed locally for Phase 1. It is based on the user's 2026-07-02 guided decisions and supersedes the broad `duplicate_active_submission` umbrella for same-revision conflicts with status-specific rules: `same_revision_in_progress`, `release_incomplete_conflict`, `released_revision_exists`, and `obsolete_revision_locked`. Local worktree changes cover submission schema/types/repositories, same-revision classification service, release workflow wrapper, approve route, Pending cancel route, canonical workbench page/API, retry-release API, return-for-correction API, module CTAs, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries used by return-for-correction. Verified gates include focused recovery QC, disposable mutation lifecycle QC, DB provider transaction QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke, and D-0014 submission-detail browser smoke. Phase 2+ is preserved as RD handoff contracts: master-data completion/writeback, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` is documented as `RD Implementation Ready` for Phase 1 after the D-0014-MA1 mismatch was confirmed: `submissions.status = Released` while `drawing_numbers`, linked `part_numbers`, and `part_roots` remain `Draft`. The spec requires release-time master lifecycle synchronization inside the same DB transaction that marks a submission `Released`, plus audit and visible inconsistency guard. RD implementation is not authorized by the documentation request. Historical D-0014 repair, production migration, direct DB mutation and data deletion remain unapproved.
- Local dev entrypoint CAPA PA is implemented / verification passed for recurring broken 3000 prevention: `dev:local` uses the managed launcher, `dev:local:check` performs non-browser health diagnosis, `dev:local:restart` is the explicit stale-project-process recovery path, launcher/status files distinguish launcher PID from real port-owner PID, multi-route health checks cover `/`, `/login`, and `/api/auth/me`, and `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set.
- `DEV-PDM-SUBMISSION-CONFLICT-001` is implemented / verification passed locally from the user's 2026-07-02 duplicate submission decision: `duplicate_active_submission` is a `submission_conflict`, not `master_data_missing`; duplicate drawing + revision submission is blocked, not warning-only; messages are human-readable Chinese; blocked duplicate attempts retain structured audit payload; reviewer approval is guarded against legacy duplicate active conflicts. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.
- `DEV-PDM-DRAWING-PART-WORKBENCH-001` is implemented / verification passed locally from the user's 2026-07-01 architecture decisions and RD authorization: 圖號模組 remains drawing-focused, 圖料模組 routes into a controlled drawing submission workbench, generic `/upload` and generic `POST /api/submissions` formal creation are retired, inline master-data edits use owner APIs, ambiguous root/drawing/part relationships block submission, submission uses canonical immutable snapshot/hash, idempotency/attempt audit is enforced, and duplicate attachment filenames are blocked with Chinese domain errors. Production deploy, production migration, direct DB cleanup and existing-data repair remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-001` is implemented / verification passed locally from the user's 2026-06-30 APP validation decision: drawing module completes master data; drawing-source submission is review-only and does not collect PDM master fields.
- `DEV-PDM-LIFECYCLE-ACTIONS-001` Phase 1-6 local/staging lifecycle package is implemented, QC-captured, and committed locally as `21bcf16` (`DEV-PDM-LIFECYCLE-ACTIONS-001 implement lifecycle actions`). Production and Supabase production cutover are excluded.
- `DEV-PDM-CHANGE-CONTROL-001` Phase 1-5 local implementation evidence is captured; production/Supabase cutover remains approval-gated.
- `DEV-PDM-REVISION-001` and `DEV-SW-LICENSE-PDM-001` are closed local implementation/evidence packages.
- `DEV-SUPABASE-DB-001` staging GATE-B remains passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred.

Completed local storage authority package:

- `DEV-PDM-FILE-STORAGE-001` local RD implementation is complete / local QC passed from the user's 2026-07-08 guided decisions `1B 2A 3A` plus RD supervisor follow-up `1C 2A 3B`: Supabase Postgres + Supabase Storage are the target single PDM core authority; existing local / legacy Drive files must be migrated and verified before runtime cutover; Google Drive is demoted to an async best-effort backup mirror using version/type folder isolation to avoid Windows/File Explorer same-folder filename conflicts. Implementation now adds provider/bucket/key storage pointers for submission files and release packages, provider-aware reads/downloads/release-package handling, Supabase fail-closed runtime config, local-provider fallback, local-only legacy Drive release movement, Drive backup plan/execution helpers, no-delete/no-overwrite behavior, manifest templates, `.metadata.json` sidecar snapshots, restore index and drift report templates. Supabase bucket creation, provider pointer switch, one-time migration execution, live Google Drive backup writes, retention cleanup, production deploy/cutover, direct data repair/deletion, merge, PR, rollback and release artifacts are not authorized.

High-risk constraints:

- Do not run production deployment, production runtime smoke, provider pointer changes, schema migration, data parity execution, direct DB mutation, data deletion, or cost-incurring external actions without explicit PM/user approval.
- Do not move protected evidence files referenced by QC scripts unless scripts and QC evidence are updated in the same scope.
- Do not stage or commit unrelated dirty worktree changes. This repository currently contains many unrelated local modifications.

## 1.1 Non-Production Completion Audit

Audit date: 2026-06-30

User objective: complete all tasks except switching to production.

PM interpretation:

- Completed means all local, non-production, non-cutover, executable DEV/RD/QA/QC tasks in the current control board are either implemented/verified or correctly excluded as blocked/deferred by explicit stop conditions.
- This does not authorize production deployment, Supabase production cutover, provider pointer switch, schema/data migration, direct data mutation, cost-incurring external actions, or external-service validation without required evidence.

Current audit result:

- No local or unclassified open task remains.
- `qc:dev-task-evidence-sync` passed 13/13 and reported no eligible actual dev_task changes while external evidence is open.
- `qc:dev-task-completion-audit` passed 8/8 after parser compatibility was updated for the current `External Blockers / Parked Scope` heading.
- `qc:production-readiness -- --allow-open` is parseable and intentionally reports `ready=false` with five external blockers: `DEV-IND-007`, `DEV-CAD-001`, `DEV-SW-001`, `DEV-BACKUP-001`, and `DEV-FIELD-001`.
- `DEV-STORAGE-COST-001` remains product rollout backlog / parked. It requires real storage inventory, target, cost, retention policy, and production timing approval, and is not a current executable local task.

External blockers that remain after this objective:

- `DEV-IND-007`: needs disposable Supabase/Postgres shadow target and `qc:postgres-shadow` evidence.
- `DEV-CAD-001`: needs SolidWorks Document Manager or equivalent reader/license evidence.
- `DEV-SW-001`: needs SolidWorks Add-in real-machine evidence.
- `DEV-BACKUP-001`: needs offline one-way backup and restore-drill evidence.
- `DEV-FIELD-001`: needs formal field-test evidence.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm run qc:dev-task-evidence-sync`: passed 13/13.
- `npm run qc:pdm-lifecycle-release-readiness`: passed 48/48.
- `npm run qc:sw-license-pdm-git-boundary`: passed.
- `npm run qc:supabase-runtime-local-readiness`: passed 10/10.
- `npm run qc:supabase-data-parity-policy`: passed 13/13.
- `npm run qc:supabase-current-change-impact`: passed 15/15.
- `npm run qc:production-readiness -- --allow-open`: passed with `ready=false` and all five external blockers visible.
- `npm run qc:dev-task-completion-audit`: passed 8/8.

## 2. Active / Backlog / Deferred / Blocked Work

| Lane | ID | Type | Parent | State | Next condition | Evidence |
|---|---|---|---|---|---|---|
| Phase 1A-1B local implementation complete; Phase 1C-A reviewer entrypoint consolidation complete; Phase 1C-B legacy reviewer page convergence complete; adapters/guarded migration tooling present; release/live migration not authorized | `DEV-PDM-APPROVAL-PLATFORM-001` | Pre-launch architecture / system-wide approval platform | `DEV-PDM-NUMBERING-004`; `DEV-PDM-SUBMISSION-GATE-001`; `DEV-PDM-LIFECYCLE-ACTIONS-001`; existing numbering/submission/BOM/cost/supplement/drawing-revision-impact approval-like flows | ADR 002 selected additive v2 platform tables. Local work adds platform schema, repository/service, `/api/approvals/*`, `/approvals`, legacy adapters, friendly-route decision delegation, focused QC and guarded migration dry-run/apply tooling. Platform core is locally implemented; numbering/submission/BOM/cost/supplement/drawing-revision-impact reviews are exposed through transitional adapters; Phase 1C-A makes `審核工作台` the single primary reviewer approval sidebar entry with pending badge and workbench filters; Phase 1C-B redirects legacy reviewer pages into workbench filter states. | Stop if work needs fragmented formal approval inboxes at launch, multiple primary reviewer approval sidebar entries, badge counts that ignore reviewer-role/company scope, a monolithic all-domain apply module, direct formal lifecycle mutation without platform audit, root obsolete without aggregate intent/impact preview, cost/supplement adapters as final launch state, production/Supabase live migration, direct data repair/deletion, merge, PR, deploy, rollback or production smoke. | `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`; `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`; `db/schema.sql`; `src/lib/repositories/approval-platform-async-repository.ts`; `src/lib/approval-platform.ts`; `src/app/api/approvals`; `src/app/approvals/page.tsx`; `scripts/qc-pdm-approval-platform.mjs`; `scripts/generate-pdm-approval-platform-migration-dry-run.mjs`; evidence: tsc, source-scoped lint, platform QC 106/106, migration dry-run/apply self-test, lifecycle QC, Playwright screenshots, role-boundary smoke, legacy route redirect smoke. |
| Implemented / local QC passed; production cutover not authorized | `DEV-PDM-FILE-STORAGE-001` | Delivery point / Supabase core file authority + Google Drive backup mirror | `DEV-SUPABASE-DB-001`; `DEV-STORAGE-COST-001`; existing Google Drive integration | Local implementation is complete for provider-aware storage pointers, Supabase fail-closed runtime contract, provider-aware submission/release/master attachment/preview reads, release-package storage, local-only legacy Drive release movement, Drive backup plan/execution helper, tiered coverage, version/hash folder isolation, no first-version delete/overwrite, manifest templates, metadata sidecars, restore index and drift report templates. | Next work requires explicit authorization for live Supabase bucket/RLS setup, one-time migration execution, runtime provider pointer switch/cutover, live Google Drive backup worker, real restore drill, retention cleanup/deletion, direct data repair/deletion, merge, PR, deploy, rollback or production smoke. Stop if work needs public PDM source bucket, service-role/S3 secret exposure, secret-bearing metadata snapshot, Drive reverse sync or backup-as-release-blocker. | `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`; `.ai-doc/decisions/ADR-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`; `.ai-doc/qa/qa-pdm-file-storage-supabase-core-drive-backup-validation-plan-2026-07-08.md`; `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`; code anchors: `src/lib/file-storage.ts`, `src/lib/file-storage-backup.ts`, `src/lib/file-store.ts`, `src/lib/gdrive.ts`, `src/lib/file-response.ts`, `src/lib/release-package.ts`, `src/lib/release-package-file.ts`, `scripts/generate-file-storage-drive-backup-plan.mjs`, `scripts/qc-pdm-file-storage-supabase-core-drive-backup.mjs`; evidence: `qc:pdm-file-storage-supabase-core-drive-backup` 37/37, `qc:file-storage-contract` 82/82, `qc:file-storage-local-provider-regression` 34/34, `qc:file-storage-migration-dry-run` 17/17, `tsc`, lint. |
| 已完成 / 本地驗證通過 | `DEV-PDM-ACCESS-CONTROL-001` | 上線前使用者與權限治理 | `DEV-PDM-SETTINGS-CENTER-001`; current auth/permission model | 使用者授權的本地上線切片已完成：`/settings/workflow` 顯示鉦富唯讀工作區且沒有公司選擇器；已建立製造、採購與`外部專員`角色；角色指派包含適用範圍、指定範圍、內部負責人、複核日與到期停用日；外部專員預設只允許查詢、看圖、留言與提供建議，預設禁止建立、發行、匯出與權限設定；畫面分成「角色管理、使用者權限、外部專員、異動紀錄」，並在儲存前提供權限預覽與必填欄位防呆；審核矩陣第一欄為唯讀「規則摘要」，用「情境 / 處理」使用者語言由觸發動作、條件、控制與審核角色自動產生，且畫面將情境與處理分行顯示，不再讓管理員自由輸入規則名稱。Google OAuth、無 Google 帳號邀請 UX、完整身分提供者表、完整路由切換、未來久方工作區與正式環境 rollout 尚未實作。 | 觀察 APP 使用回饋。後續若要做 Google OAuth / 身分提供者、邀請與首次密碼設定、完整路由盤點與旁路權限切換、久方工作區、正式環境遷移/部署或複核提醒排程，都需要另行授權。若需要 live Supabase migration、provider pointer change、直接修資料/刪資料、一般管理員跨公司切換、Google Workspace 直接決定角色、Google 自動註冊/網域授權、一次性完整權限切換、外部專員到期自動停權或人工規則備註參與權限判斷，必須停下來重新決策。 | `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`; `db/schema.sql`; `db/postgres/005_access_control_launch_governance.sql`; `supabase/migrations/20260707010000_access_control_launch_governance.sql`; `src/lib/approval-rule-summary.ts`; `src/lib/db.ts`; `src/lib/repositories/numbering-repository.ts`; `src/lib/repositories/numbering-async-repository.ts`; `src/lib/repositories/access-control-async-repository.ts`; `src/app/api/numbering/admin/matrix/route.ts`; `src/app/settings/page.tsx`; `scripts/qc-pdm-access-control-governance.mjs`; evidence: `npx.cmd tsc --noEmit --pretty false` passed, `npm.cmd run qc:pdm-access-control-governance` 88/88 passed, `npm.cmd run lint` 0 errors / 3 unrelated warnings. |
| Implemented / local verification passed for Phase 1-3; release not authorized | `DEV-PDM-NUMBERING-004` | Delivery point / contextual add and obsolete entrypoints | `DEV-PDM-NUMBERING-003`; `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`; `DEV-PDM-LIFECYCLE-ACTIONS-001` | Local vertical slice is complete: root, drawing and part drawers expose natural continuation actions; append APIs create `M02/R01/P02` under the existing root; drawing+part fallback append is atomic; part/drawing obsolete requests route through lifecycle approval; root obsolete opens impact preview and creates aggregate approval package preserving whole-root intent and child targets; `/numbering/request` has `新主根號 / 既有主根號追加` mode. APP feedback follow-up adds draft-only `刪除草稿`, cancellable add drawing/part dialogs, `新增相關資料` wording, and root-owned part naming with no editable part-level 品名 in add flows. | Monitor APP validation feedback. Stop if further work needs root obsolete without impact preview/approval, existing-root append that creates a new root, `R` as manufacturing basis, editable 料號/圖號 level 品名 in add flows, draft delete without explicit confirmation, add cancel that mutates data, direct runtime DB mutation, production deploy, Supabase live migration, provider pointer change, merge, PR, rollback or release artifacts. | `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`; `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`; `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`; code anchors: `src/components/numbering-contextual-entrypoints.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/request/page.tsx`, `src/app/api/numbering/records/[rootCode]/draft/route.ts`, `src/app/api/numbering/roots/[rootCode]/*`, `src/app/api/lifecycle/obsolete-requests/route.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/numbering-async.ts`, `db/schema.sql`, `scripts/qc-pdm-numbering-contextual-entrypoints.mjs`; evidence: `tsc`, lint, build, focused QC 44/44, isolated API smoke 10/10, browser screenshots under `output/playwright/pdm-numbering-contextual-entrypoints/`. |
| Prepared / RD Contract Ready / Not Authorized | `DEV-PDM-SUBMISSION-GATE-001` | Delivery point / research vs technical-transfer submission gate | `DEV-PDM-DRAWING-SUBMISSION-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Development documents are created for a two-mode submission redesign. `研發送審` stays item-centric and may allow controlled exception that must be approved during review; `技術移轉送審` is package-centric and must not be submitted as a direct single drawing or single part. Technical transfer uses a transfer package for a development case or design-change case, with versioned rule-matrix readiness, hard blockers, no missing-required transfer exception, one-item package scope declaration/confirmation, applicable Manufacturing/Procurement/QA/QC sign-offs, stale snapshot/sign-off invalidation, and release-work-item handoff to the existing release workflow. Product implementation is not authorized. | Execute only after explicit RD authorization. Stop if implementation needs direct single-item technical-transfer submission, missing-required transfer exception, research exception final approval without reviewer/supervisor decision, `ApprovedForTransfer` directly mutating master lifecycle to Released, stale sign-offs remaining valid after relevant changes, production deploy, live schema migration, direct DB mutation, owner-domain responsibility changes, full ERP sync, supplier portal, visual BOM/CAD graph, merge, PR, rollback or release artifacts. | `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`; `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`; `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`; existing authority: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`; `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`; release lifecycle authority: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`; likely surfaces: `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/submissions/`, `db/schema.sql`, new focused QC scripts. |
| Implemented / local verification passed | `DEV-PDM-DRAWING-PART-RELATION-VIEW-001` | Delivery point / 圖料關係視圖 UX | `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-NUMBERING-002` | Phase 1-3 are implemented locally after user authorization. 圖料模組 now defaults to a root-grouped relationship tree, adds matrix review, and provides controlled relationship maintenance through `/api/numbering/relations` with permission, company/root, locked-status and audit gates. | Production deploy, Supabase live cutover, direct data repair/deletion, generic bulk relationship write API, merge/PR/release/rollback artifacts and schema migration remain not authorized. | `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`; `.ai-doc/qa/qa-pdm-drawing-part-relation-view-validation-plan-2026-07-07.md`; implemented surfaces: `src/app/numbering/search/page.tsx`, `src/app/api/numbering/relations/route.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/numbering-async.ts`, `src/app/globals.css`, `scripts/qc-pdm-drawing-part-relation-view.mjs`, `scripts/qc-pdm-numbering-search-ui.mjs`, `scripts/qc-pdm-master-workbench-layout.mjs`. |
| Implemented / Verification passed | `DEV-PDM-NEXT-STEP-UX-001` | Delivery point / UX quality gate | `DEV-PDM-STATUS-UX-001`; `SPEC-UX-RD-LIFECYCLE-001`; `SPEC-UX-PLATFORM-001` | Phase 1 local UI implementation is complete: shared next-step display is visible by default, unknown status/errors fail closed to actionable Chinese, lifecycle next step is visible inline, dashboard action failures are mapped, and selected blocker/empty/error/disabled states now show what to do next. | Monitor APP validation feedback. Phase 2 scanner/checklist and Phase 3 production release require separate authorization. Stop and re-enter PM/ADR if implementation needs DB/API/permission/state-machine changes, production deploy or data repair. | `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`; `src/components/next-step-state.tsx`; `src/lib/status-display.ts`; `src/components/lifecycle-ux.tsx`; `src/components/dashboard.tsx`; `src/app/numbering/revisions/page.tsx`; `src/app/numbering/dvt/page.tsx`; `src/app/submissions/[id]/page.tsx`; `src/app/handoff/page.tsx`; `src/app/numbering/search/page.tsx`; `src/app/parts/page.tsx`; `src/components/master-attachment-panel.tsx`; `src/app/numbering/part-drafts/page.tsx`; `src/app/numbering/reports/page.tsx`; `src/app/globals.css`; focused QC script maintenance; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44; `npm.cmd run qc:pdm-numbering-search-ui` 28/28; `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24; `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22; `npm.cmd run qc:master-attachments` 93/93; `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14; `npm.cmd run dev:local:check`. |
| Implemented / Verification passed | `PA-LOCAL-DEV-3000-001` | CAPA / PA tooling control | None | Recurring broken local 3000 prevention is implemented: managed launcher, `dev:local:check`, stale project recovery via `dev:local:restart`, multi-route health checks, port-owner PID/status JSON/logs, and `.next` clean/build collision guard. | Use `npm run dev:local` for normal startup, `npm run dev:local:check` for diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. Build/clean while 3000 is running requires intentional bypass and should not be used as the normal workflow. | `package.json`; `scripts/start-localhost-3000.ps1`; `scripts/clean-next.mjs`; `scripts/qc-local-dev-entrypoint.mjs`; `tmp/local-dev/ai-pdm-3000.status.json`; `npm run qc:local-dev-entrypoint`; `npm run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-STATUS-UX-001` | Delivery point | `DEV-PDM-LIFECYCLE-ACTIONS-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Phase 1 local RD is implemented: central UI status dictionary, Chinese-only normal UI status display, status filter/badge/error mapping, development phase display mapping and unified `?` help popovers on user-visible status table columns. Focused scanner baseline and browser UI evidence passed. | Monitor APP validation feedback. Remaining Phase 2 hardening, production deploy, DB enum/schema rename, production migration, audit payload migration and historical data repair require explicit authorization. | `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`; `src/lib/status-display.ts`; `src/components/status-help-popover.tsx`; `scripts/qc-pdm-status-ui-vocabulary.mjs`; `npm run qc:pdm-status-ui-vocabulary` 44/44; `npx tsc --noEmit --pretty false`; `npm run lint`; `npm run build`; `output/playwright/status-ui/settings-status-help-open.png`; `output/playwright/status-ui/drawings-phase-label-fixed.png`; `npm run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-STATUS-UX-002` | Development objective / UX quality gate | `DEV-PDM-STATUS-UX-001`; `DEV-PDM-NEXT-STEP-UX-001` | Phase 1 local UI implementation is complete: task/import/settings/report/DVT/restore contexts are split from generic workflow/fileSync/masterRecord help, approval wording uses `待補資料`, mixed master-data columns are labeled `狀態 / 階段 / 提醒`, and focused QC covers status-context mismatch risks. | Monitor APP validation feedback. Phase 2 scanner hardening/checklist remains RD Contract Ready / Not Authorized. Stop if DB/API/schema migration, production deploy, historical repair, raw audit migration or workflow semantic changes are needed. | `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`; `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`; `src/lib/status-display.ts`; affected page surfaces; `scripts/qc-pdm-status-ui-vocabulary.mjs` 81/81; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; Playwright status-context browser checks 73/73 + DVT 11/11 + mobile sanity 4/4. |
| Implemented / Verification passed | `DEV-PDM-NUMBERING-002` | Delivery point / numbering core | `DEV-PDM-NUMBERING-001`; `SPEC-PDM-NUMBERING-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Phase 1-4 local/runtime implementation is complete: compact v2 rule/default creation, five-digit roots, `{root}-P01`, `{root}-M01`, `{root}-R01`, semantic `MA/M` manufacturing and `OT/R` reference compatibility, migration dry-run reporting, approved local runtime v1-to-v2 master identity cutover, operational reference update, v1 retirement for new normal creation, downstream submission/shared-3D/baseline/change-control compatibility, UI wording and focused QC updates. Runtime master rows now have no v1 identity residue. | Monitor APP validation feedback. External production/Supabase live cutover, physical attachment/release-package path renaming, project/order/equipment numbering, extra visible category codes, and further direct data repair/deletion require a separate release gate. | `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`; `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`; `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`; `.ai-doc/qc/qc-pdm-numbering-v2-compact-identity-report-2026-07-07.md`; `.ai-doc/qc/qc-pdm-numbering-v2-formal-cutover-report-2026-07-07.md`; `scripts/pdm-numbering-v2-cutover.mjs`; `scripts/qc-pdm-numbering-v2-formal-cutover.mjs`; cutover evidence `output/qc-pdm-numbering-v2-cutover/report.json`; backup `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`; evidence: `tsc`, lint, build, v2 compact QC 13/13, formal cutover QC 11/11, migration dry-run QC, numbering core 241/241, change-control 62/62, API regression 27/27, data consistency 16/16, concurrency 32/32, draft lifecycle 29/29, request UI 66/66, search UI 28/28, impact UI 24/24, DVT UI 24/24, master attachments 101/101, master workbench 224/224, Supabase runtime migrations 25/25. |
| Implemented / Verification passed locally | `DEV-PDM-NUMBERING-003` | Delivery point / numbering identity policy | `DEV-PDM-NUMBERING-002`; `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` | Phase 1-3 local v3 implementation is complete: normal roots use `A0001-Z9999`; full identities use `A0001-P01`, `A0001-M01`, `A0001-R01`; root letters carry no business meaning; legacy v1/v2 numeric roots reserve their v3 ordinal positions; audit/control root evidence blocks formal-root reuse; relation UI/API wording avoids treating `M` as approval/release/manufacturability and blocks `R` from manufacturing basis; local runtime master identities were converted to v3 through scripted dry-run/backup/apply/check. | Monitor APP validation feedback. Stop if work needs exclusion of `I/O/Q`, production/Supabase migration, provider pointer change, direct data repair/deletion outside the scripted cutover boundary, merge/PR/deploy/rollback/smoke, project/order/equipment numbering or extra visible category codes. | `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`; `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md`; `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`; `src/lib/numbering-identity.ts`; `src/lib/repositories/numbering-async-repository.ts`; `src/lib/repositories/numbering-repository.ts`; `src/app/api/numbering/relations/route.ts`; `scripts/pdm-numbering-v3-cutover.mjs`; `scripts/qc-pdm-numbering-v3-formal-cutover.mjs`; `scripts/qc-pdm-numbering-v3-alpha-root.mjs`; evidence: v3 dry-run `safe_map=24`, `collision=0`, `manual_review=0`; backup `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`; v3 formal cutover QC 8/8; focused v3 QC 14/14; `npx.cmd tsc --noEmit --pretty false`; lint; build; change-control 62/62; numbering core 241/241; gap reuse 8/8; local dev health passed. |
| Implemented / Verification passed | `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` | Development objective / CAPA PA tooling control | `DEV-PDM-NUMBERING-002` | Phase 1-3 local CAPA controls are implemented and verified: allocating numbering QC scripts are guarded from the protected runtime DB, sequence/master/audit drift is detected by an integrity gate, SQLite `createNumberingRecord` uses an atomic transaction boundary, and the authorized local repair kept the drawing-module visible formal roots while purging local test sequence pollution. Duplicate submit prevention now blocks same-form re-entry in UI and returns an existing same-payload create result inside a 60-second server replay window before allocating a new root. After critical review, V2 root allocation is now gap-aware: numbers not present in controlled master rows are reusable test gaps; existing master rows, including Obsolete/Released/Active/Draft, remain occupied. Phase 4 production/Supabase remains blocked human re-entry. | Monitor APP validation feedback and use the new QC gates for future numbering work. Current local lowest available root is `00001`; runtime currently has occupied roots `00007`, `00014`, `00056`, `00057`, `00058`, `00059`. Production/Supabase repair, migration, deploy, rollback, production smoke, visible formal-number renumbering and numbering identity policy changes remain separately gated. Stop if work touches production/Supabase, changes formal identity policy, or mutates `data/ai-pdm.sqlite` outside the documented local repair script and explicit human data-policy authorization. | `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`; `.ai-doc/qa/qa-pdm-numbering-sequence-capa-validation-plan-2026-07-07.md`; `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`; `.ai-doc/qc/qc-pdm-numbering-sequence-repair-report-2026-07-07.md`; `scripts/numbering-qc-runtime-guard.mjs`; `scripts/pdm-numbering-sequence-repair-runtime.mjs`; `scripts/qc-pdm-numbering-qc-isolation.mjs`; `scripts/qc-pdm-numbering-sequence-integrity.mjs`; `scripts/qc-pdm-numbering-sequence-transaction.mjs`; `scripts/qc-pdm-numbering-duplicate-submit-guard.mjs`; `scripts/qc-pdm-numbering-gap-reuse.mjs`; `src/app/numbering/request/page.tsx`; `src/lib/db-async-provider.ts`; `src/lib/repositories/numbering-async-repository.ts`; `src/lib/repositories/numbering-repository.ts`; evidence: repair backup `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`, integrity clean=true, duplicate-submit guard 10/10, gap reuse QC 8/8, isolation QC 46/46, transaction QC 4/4, `tsc`, lint, numbering core 241/241. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Delivery point | `DEV-PDM-DRAWING-PART-WORKBENCH-001`; amends `DEV-PDM-SUBMISSION-CONFLICT-001` | Phase 1 implementation surfaces are present and local verification passed: focused recovery QC, disposable mutation lifecycle QC, transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. A schema bootstrap ordering bug that caused old SQLite files to fail with `no such column: resolved_by_submission_id` was fixed by keeping new release-recovery indexes in runtime migration after lifecycle migration. The mutation gate used disposable records and did not touch existing D-0014/user workflow records. | Monitor APP validation feedback. Phase 2 requires explicit user/PM authorization before RD. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`; `scripts/qc-pdm-drawing-submission-workbench-recovery.mjs`; `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs`; `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`; `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`. |
| Prepared / RD Contract Ready | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` | Delivery point phase handoff | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Phase 2+ RD handoff contracts complete and rechecked under the latest `dev-pm` All-Phase Gate: master-data completion/writeback through owner APIs, drawing attachment upload before snapshot, collaboration toggle/permissions, operational edit history, dashboard/todo de-noising, and production cutover/historical repair gate. Not executable as RD yet. | Phase 2 requires explicit user/PM authorization. Phase 3 requires Phase 2 implemented/verified plus explicit authorization. Phase 4 requires release-gate approval. Continuation commands must not start Phase 2+ until this row is explicitly updated. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003` | Delivery point | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | UI-level release-incomplete self-recovery is implemented locally: human-readable diagnosis, attachment organizer, released-filename preflight, explicit selected-attachment correction submission, locked formal-record state, role-aware CTA, submission-detail recovery link, related ReleaseFailed resolution behavior, and UI-only operation validation covering QC-owned route identity (`D-QC-SUBMIT-MA1`), generic upload retirement, detail navigation, recovery, permission, blocker and RWD scenarios. D-0014 remains historical problem context only, not a required executable fixture. | Monitor APP validation feedback. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`; `src/app/upload/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/submissions/[id]/return-for-correction/route.ts`; `src/lib/repositories/submission-status-async-repository.ts`; `src/app/submissions/[id]/page.tsx`; `scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs`; `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`; `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`; screenshots `output/playwright/ui-operation-scenarios/REAL-001-qc-submit-drawing-entry.png`, `output/playwright/mock-release-incomplete-ui-self-recovery.png`, `output/playwright/ui-operation-scenarios/MOCK-RELFAIL-001-correction-flow.png`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Delivery point | `DEV-PDM-CHANGE-CONTROL-001`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Phase 1 local RD implemented on 2026-07-03, with 2026-07-05 APP feedback applied: a drawing attachment with revision `0.2` is source/staging evidence only until selected into a controlled Pending drawing-revision submission package; the `新版圖面` primary list now shows only target-revision attachments, while previous/other-revision attachments are collapsed read-only reference files with no checkbox. The package creates selected-file snapshot/source traceability and links the FFF assessment via `drawing_revision_fff_assessments.submission_id`. No-impact drawing revisions may keep part and BOM unchanged, but reviewer must confirm BOM no revision. | Monitor APP validation feedback. Production deploy, migration, direct data repair, historical cleanup, CAD/OCR dependency, forced part/BOM revision and later-phase work remain excluded; Phase 2 and Phase 3 are tracked by the P2/P3 rows below. Build remains guarded by `prebuild` when the project dev server is listening on 3000. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/app/numbering/revisions/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawing-revisions/submissions/route.ts`; `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`; `scripts/qc-pdm-change-control.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 56/56, `npm.cmd run dev:local:check`, Playwright mock 1440x900 plus 390x844 sanity check for target `0.2` with only prior `0.1` attachment, plus earlier `npm.cmd run qc:pdm-drawing-submission-review-only`, `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`, local page smoke and protected workbench API 401 unauthenticated. Phone UI is not a separate supported surface; phones use the desktop/default surface. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Multi-file revision package intake is implemented locally: one intended drawing revision is a `版次檔案包` with multiple files, extension-based role classification, inline correction, warning-only completeness checks, snapshot persistence and reviewer warning parity on full page plus dashboard drawer. | Monitor APP validation feedback. Stop if follow-up needs production deploy, migration, direct data repair, CAD/OCR extraction, FFF rule change, forced part/BOM revision, optional-file warnings turned into hard blockers, or a dedicated mobile-phone UI. Phones use the desktop/default surface by product setting. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 2; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/lib/revision-package.ts`; `src/app/numbering/revisions/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawing-revisions/submissions/route.ts`; `src/lib/repositories/submission-list-async-repository.ts`; `src/app/submissions/[id]/page.tsx`; `src/components/dashboard.tsx`; `scripts/qc-pdm-change-control.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-change-control` 57/57; `npm.cmd run dev:local:check`; Playwright screenshots `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`, `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`; `output/playwright/drawing-revision-package-p2/revision-package-submit-mobile.png` is retained only as optional viewport sanity, not mobile support evidence. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Out-of-order revision acceptance and latest/history view are implemented locally: all drawing revisions may be submitted and approved in any order, the system suggests the next revision first, duplicate formal same drawing + same revision remains blocked, approval/retry-release no longer fails solely because a newer different revision exists, latest/history is recomputed after approval, first-level attachment/package views use the computed latest and older approved revisions remain traceable in history. | Monitor APP validation feedback. Stop if follow-up needs production deploy, direct repair of existing bad data, schema migration without focused plan, duplicate formal records for the same revision, FFF/part/BOM rule changes, strict chronological approval, or dedicated mobile-phone UI. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 3; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/lib/revision-policy.ts`; `src/lib/repositories/submission-status-async-repository.ts`; `src/lib/repositories/submission-repository.ts`; `src/lib/submission-release-workflow.ts`; `src/app/api/submissions/[id]/approve/route.ts`; `src/app/api/submissions/[id]/retry-release/route.ts`; `src/lib/drawing-revision-workbench.ts`; `src/app/numbering/revisions/page.tsx`; `src/components/master-attachment-panel.tsx`; `scripts/qc-pdm-change-control.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | First-class revision attachment package model is implemented locally: stable `packageId`, package files, Released-core immutability, supplement request/approval, confirmed supplement reason menu, approved supplement `補件` tag in the main attachment list and migration dry-run reporting. | Monitor APP validation feedback. Stop if follow-up needs production deploy/migration, direct data repair/deletion, product `待確認附件` area, FFF/part/BOM rule changes, CAD/OCR dependency or dedicated mobile-phone UI. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-PACKAGE-001-first-class-package-and-supplement.md`; `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `src/lib/drawing-revision-package.ts`; `src/lib/repositories/drawing-revision-package-async-repository.ts`; `src/lib/drawing-revision-packages-async.ts`; supplement request/decision API routes; `src/components/master-attachment-panel.tsx`; `scripts/qc-pdm-drawing-revision-package-model.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run db:init`. |
| Implemented / Verification passed | `DEV-PDM-SHARED-3D-MA-BASELINE-001` | Delivery point | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Local non-production implementation is complete from the user's 2026-07-06 authorization: part/root-owned shared 3D model versions, hash/revision conflict controls, MA package model-basis API, reviewed `2D-only / no 3D impact` exception, MA package release workflow gate, manufacturing baseline draft/release services, required-MA resolver, immutable released baseline snapshot, part-detail UI slice and additive SQLite/Postgres schema are implemented. | Monitor APP validation feedback. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes, using one MA drawing as shared 3D owner and live production cutover remain not authorized. | `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`; `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`; `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `src/lib/shared-3d-baseline.ts`; `src/lib/repositories/shared-3d-baseline-async-repository.ts`; shared model / model-basis / manufacturing baseline API routes; `src/app/parts/page.tsx`; `src/lib/submission-release-workflow.ts`; `scripts/qc-pdm-shared-3d-ma-baseline.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20; `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run qc:db-provider-contract` 35/35; `npm.cmd run qc:db-provider-postgres` 9/9; `npm.cmd run qc:supabase-current-change-impact` 15/15; browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. |
| Implemented / Verification passed | `DEV-PDM-SETTINGS-CENTER-001` | Delivery point | `DEV-CAD-001`; `DEV-SUPABASE-DB-001`; current `/settings` | Phase 1 local implementation is complete: settings center overview/work queue; five management-area routes; server-only SolidWorks secret lifecycle APIs; additive secret metadata schema; redacted UI panel; `local_test_double` provider plus live Supabase Vault gate. Existing Google Drive settings remain operational. | Monitor APP validation feedback. Supabase Vault live write/smoke, production deploy/cutover, direct data repair/deletion, external-cost actions, Manager/Reviewer read views and real SolidWorks/CAD-reader proof require separate authorization/evidence. Stop if implementation needs plaintext secret persistence, frontend Vault access or Google Workspace direct role authority. | `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`; `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`; `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`; `src/app/settings/page.tsx`; `src/app/settings/integrations/page.tsx`; `src/app/settings/security/page.tsx`; `src/app/settings/workflow/page.tsx`; `src/app/settings/system/page.tsx`; `src/app/api/settings/secrets/*`; `src/lib/settings-secret-lifecycle.ts`; `src/lib/repositories/settings-secret-async-repository.ts`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `scripts/qc-pdm-settings-center-secret-lifecycle.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-settings-center-secret-lifecycle`; `npm.cmd run qc:supabase-secret-boundary`; `npm.cmd run qc:gdrive-folder-tree-settings`; `npm.cmd run qc:db-provider-contract`; `npm.cmd run qc:db-provider-postgres`; `npm.cmd run qc:supabase-current-change-impact`. |
| Implemented / Verification passed | `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` | Delivery point | `DEV-PDM-SETTINGS-CENTER-001`; `DEV-CAD-001`; `DEV-PDM-SHARED-3D-MA-BASELINE-001`; current master attachment preview board | Phase 1 local non-production vertical slice is implemented: additive preview queue/derivative schema, async service, fake local PNG worker, token-gated worker claim/complete contract, Windows Shell thumbnail worker, SolidWorks Document Manager SLDDRW PNG worker/exporter, blank/low-information PNG quality gate, attachment preview enqueue/list APIs, derivative stream under the source attachment route, no-store attachment list refresh, and derivative-aware first-level 3D/2D preview cards. Ready derivatives are displayed only when their source hash matches the current attachment. | Monitor APP validation feedback. Real Windows Shell evidence passed for `.SLDPRT`; local `.SLDDRW` Shell output was blank and is now failed cleanly. Document Manager SLDDRW worker compiles and claims drawing jobs, but local UI secret storage is `local_test_double` metadata and does not provide plaintext to the worker, so real SLDDRW success requires Supabase Vault live secret read or worker-local `PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY`. Full `.SLDASM` readiness, Phase 2 drawing PDF, Phase 3 interactive 3D, production deploy/migration, direct data repair/deletion, browser access to secrets/native CAD tooling, synchronous COM/eDrawings/SolidWorks in Next.js request handlers, and preview-as-release-blocker policy remain not authorized. | `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`; `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`; `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `src/lib/preview-derivatives.ts`; `src/lib/master-attachments-async.ts`; attachment routes under `src/app/api/numbering/drawings/[drawingNumber]/attachments/` and `src/app/api/parts/[partNumber]/attachments/`; `src/app/api/preview-jobs/*`; `src/components/master-attachment-panel.tsx`; `src/app/globals.css`; `scripts/run-windows-shell-preview-worker.mjs`; `scripts/windows-shell-thumbnail-extractor.ps1`; `scripts/run-solidworks-document-manager-preview-worker.mjs`; `scripts/solidworks-document-manager-preview-exporter.cs`; `scripts/qc-pdm-sw-native-preview-worker.mjs`; `scripts/qc-pdm-sw-native-preview-redaction.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-sw-native-preview-worker` 90/90; `npm.cmd run qc:pdm-sw-native-preview-redaction` 68/68; `npm.cmd run qc:master-attachments` 101/101; `npm.cmd run dev:local:check`; API worker smoke on `D-0007-MA1` created real `.SLDPRT` derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640`; Document Manager worker compile-only passed; SLDDRW API worker smoke failed cleanly with missing worker-readable key; browser smoke screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png`. |
| Implemented / Verification passed | `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Delivery point | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003` | Phase 1 local RD is implemented and verified: release success now syncs submission, source drawing, resolved part and root master lifecycle in one DB transaction, writes master-sync audit, and exposes a temporary visible inconsistency guard for historical released-as-Draft records. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are contract-ready but not authorized. | Monitor APP validation feedback. Historical D-0014 repair, production migration, direct DB mutation against existing user data and data deletion remain unapproved. | `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`; `src/lib/repositories/submission-status-async-repository.ts`; `src/lib/repositories/numbering-async-repository.ts`; `src/lib/repositories/numbering-repository.ts`; `src/app/numbering/drawings/page.tsx`; `scripts/qc-pdm-release-master-status-sync.mjs`; `npm run qc:pdm-release-master-status-sync` 23/23; `npx tsc --noEmit --pretty false`; `npm run lint`; `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27; `npm run qc:pdm-drawing-submission-ui-operation` 14/14; `output/playwright/pdm-release-master-status-sync-guard-d0014.png`. |
| Implemented / Verification passed | `DEV-PDM-SUBMISSION-CONFLICT-001` | Development objective | `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Duplicate drawing + revision submission is reclassified as `submission_conflict`, blocked at readiness/submit/reviewer guard, shown with human Chinese recovery, retained in structured blocked-attempt audit, and raw DB uniqueness errors are shielded from UI. | Monitor APP validation feedback. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved. | `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`; `src/app/upload/page.tsx`; `src/app/api/submissions/[id]/approve/route.ts`; `src/components/dashboard.tsx`; `scripts/qc-pdm-submission-conflict-duplicate-active.mjs`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`; `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Delivery point | Supersedes part of `DEV-PDM-DRAWING-SUBMISSION-001` | 圖料/圖號送審安全 package implemented locally: controlled drawing submission route, generic upload retirement, generic submission POST retirement, readiness APIs, ambiguity blockers, duplicate filename preflight, immutable snapshot/hash, idempotency attempt audit, owner-route master data edit path and updated QC. | Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup and data deletion remain unapproved. | `src/lib/drawing-submission-workbench.ts`; `src/lib/repositories/submission-write-async-repository.ts`; `src/lib/db.ts`; `db/schema.sql`; `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`; `src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`; `src/app/api/submissions/route.ts`; `scripts/qc-pdm-drawing-part-workbench-security.mjs`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`; `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-001` | Delivery point | None | Drawing-source `送審` opens a review-only submission workflow. Master data comes from drawing/part modules; missing data blocks and routes back to master data, not inline editing. | Monitor user APP validation feedback; production deploy remains unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`; `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `output/playwright/pdm-drawing-submission-review-only-desktop.png`; `output/playwright/pdm-drawing-submission-review-only-mobile.png`. |
| Implemented / Verification passed | `DEV-PDM-UI-POLISH-001` | Development objective | None | APP manual-verification UI polish package completed: upload form simplification, Chinese CAD warning copy, SolidWorks-primary multi-file metadata, visible conflict warnings, SolidWorks preview fallback, compact drawing governance actions, and drawing revision workbench focused slice. | Monitor user APP validation feedback; future enhancements should be split into new focused tasks. | User APP validation screenshots on 2026-06-30; `src/app/upload/page.tsx`; `src/lib/pdm-metadata.ts`; `src/components/master-attachment-panel.tsx`; `src/app/numbering/drawings/page.tsx`; `src/app/numbering/revisions/page.tsx`; screenshots in `C:\Users\user\AppData\Local\Temp\`. |
| Implemented / Verification passed | `DEV-PDM-UI-POLISH-001A` | Development objective | `DEV-PDM-UI-POLISH-001` | Drawing revision workbench focused slice implemented: official drawing resolver, user-facing workbench UI, server-side drawing/primary-part resolution, duplicate submit guard, and replacement draft reuse. | Monitor user APP validation feedback; remaining enhancements should be split into new tasks. | `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`; `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`; `src/lib/drawing-revision-workbench.ts`; `src/app/api/numbering/drawings/resolve/route.ts`; `src/app/numbering/revisions/page.tsx`. |
| Deferred | `DEV-SUPABASE-DB-001` | Development objective | None | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred. Production gate is not executable now. | PM decides data parity tier and production gate scope, or keeps production deferred. | Section 5; `.ai-doc/archived/completed-dev-index-2026-06.md`. |
| Prepared / Blocked | `DEV-SUPABASE-DB-001-DATA-PARITY` | QA / PM evidence | `DEV-SUPABASE-DB-001` | Data parity policy prepared; execution not approved. | PM approves parity tier, source snapshot, table scope, target, cleanup owner, and credential boundary. | `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`; `qc:supabase-data-parity-policy`. |
| Deferred | `DEV-SUPABASE-DB-001-PROD-GATE` | PM decision | `DEV-SUPABASE-DB-001` | Staging GATE-B passed; production/cutover remains unapproved and deferred. | Production target, cost confirmation, advisor triage, production migration plan, rollback owner, and release gate approval. | Not executable now. |
| Backlog / Parked | `DEV-STORAGE-COST-001` | Delivery / development objective | None | Evidence captured / product rollout backlog; not part of the current DB runtime gate. | Real storage inventory, target, cost, retention policy, and production timing must be approved. | `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`. |

### DEV-PDM-APPROVAL-PLATFORM-001 全系統審核平台化

Status: Phase 1A-1B local implementation complete; Phase 1C-A reviewer entrypoint consolidation complete; Phase 1C-B legacy redirect implemented and locally verified; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized
Priority: P0 - pre-launch architecture risk and approval governance consistency
Type: Pre-launch architecture / system-wide approval platform
Parent: `DEV-PDM-NUMBERING-004`; `DEV-PDM-SUBMISSION-GATE-001`; `DEV-PDM-LIFECYCLE-ACTIONS-001`; existing numbering/submission/BOM/cost/supplement approval-like flows
Authorized phase: Local RD implementation authorized by the user on 2026-07-08. Production deploy, Supabase live migration, direct data repair/deletion, merge, PR, rollback or release artifact is not authorized.

Human decisions:

- Launch timing is not urgent.
- Stability is preferred over short-term speed.
- Full-system approval platformization should be done before launch.
- The architecture must be shared approval core plus domain-specific handlers.
- The system must avoid both fragmented per-module approval islands and a monolithic all-domain approval apply module.
- RD supervisor `1C`: first executable slice must be a no-migration architecture spike. RD must choose generalized existing approval tables or v2 platform tables through ADR before schema/migration work.
- RD supervisor `2B`: platform core, numbering/root/drawing/part and submission/BOM formal lifecycle are pre-launch blockers; cost/supplement may start as adapters.
- RD supervisor `3C`: all known historical approval-like records must be physically migrated before launch readiness; read adapters are transitional only.
- Reviewer-entrypoint decisions: `1B` single approval workbench primary sidebar entry; `2A` first anti-missed-review slice is pending-count badge only; `3 phased A -> B` keeps legacy reviewer pages reachable short-term but converges them into workbench filters/details long-term.

Required docs:

- `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
- `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`
- `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`
- `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`
- Related numbering entrypoint docs: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
- Related submission gate docs: `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
- Related lifecycle authority: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`

Scope:

- Shared approval work item and package identity.
- No-migration Phase 1A architecture spike and ADR for table strategy.
- Generalized approval request type beyond numbering-only semantics or an explicit v2 platform table strategy.
- Approval action registry.
- Unified approval inbox.
- Common submit/read/decision/apply-retry APIs.
- Decision history, impact snapshots, delegation, permission and company/workspace scope checks.
- Fail-closed handler dispatch.
- Numbering approval compatibility.
- Root/drawing/part obsolete integration including root aggregate intent.
- Submission and BOM formal lifecycle integration.
- Cost change and drawing package supplement transitional unified inbox/history adapters.
- Full physical migration of known historical approval-like records before launch readiness.
- Legacy route bypass audit and guardrails.
- Phase 1C-A reviewer navigation convergence: make `/approvals` the single primary approval workbench sidebar entry, add a reviewer-role/company-scoped pending badge and expose filters replacing specialized reviewer sidebar entries.
- Phase 1C-B convergence: redirect or bridge legacy reviewer decision pages into workbench filters/details after parity and deep-link QC.

Out of scope:

- Additional production or live implementation without explicit authorization.
- Production deploy, Supabase live migration/cutover, provider pointer changes, merge, PR, rollback or release artifacts.
- Direct data repair/deletion or historical approval rewrite.
- Due date, SLA, overdue grouping, owner columns, supervisor escalation and external notification delivery in the first anti-missed-review slice.
- No-code approval rule builder.
- ERP/supplier/customer approval portal.
- Notification delivery engine unless separately scoped.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture decisions, architecture, ADR, QA and PM control entries | Authorized documentation only |
| Phase 1A - Architecture spike | Complete | No-migration spike comparing generalized existing tables vs v2 platform tables, with ADR/decision record | ADR 002 selected v2 platform tables |
| Phase 1B - Platform foundation | Local implementation complete | Core model, registry, handler contract, unified inbox read model and compatibility strategy | Local QC, build and browser evidence passed; launch still blocked by migration/release gates |
| Phase 1C-A - Reviewer entrypoint consolidation | Local implementation complete | Single approval workbench sidebar entry plus pending-review count badge and filters | Local QC/typecheck/lint/browser evidence passed |
| Phase 1C-B - Legacy reviewer page convergence | Local implementation complete | Redirect/bridge legacy reviewer decision pages into workbench filters/details | Local QC/typecheck/source-lint and route redirect smoke passed |
| Phase 2 - Numbering/root integration | Transitional adapter present | Migrate numbering approvals and `DEV-PDM-NUMBERING-004` obsolete requests to platform | Full root aggregate obsolete flow remains tied to `DEV-PDM-NUMBERING-004` |
| Phase 3 - Submission and BOM formal lifecycle | Transitional adapter present | Integrate submission release/obsolete and BOM review lifecycle into platform; launch blocker per `2B` | Route bypass hardening remains |
| Phase 4 - Cost and supplement adapters | Adapter implemented | Transitional unified inbox/history adapters for part cost changes and drawing package supplements | Adapter is not final launch readiness |
| Phase 5 - Historical migration and legacy hardening | Dry-run tooling present / live execution not authorized | Full physical migration of known historical approval-like records, bypass guardrails and governance QC | Physical migration/live target not authorized |
| Phase 6 - Release / cutover | Release Authorization Required | Production migration, deploy, smoke and rollback | Requires deployment-release gate |

Acceptance for current local implementation phase:

- Phase 1A ADR selects v2 platform tables.
- Platform schema, registry, repository/service, APIs and `/approvals` UI exist.
- Unknown action and missing handler fail closed.
- Fake handler submit/decision/apply path is locally QC-covered.
- Legacy numbering/submission/BOM/cost/supplement records are exposed through transitional adapters.
- Migration dry-run inventories legacy approval-like records without mutation.
- Production/live migration/release boundaries remain explicit.

Stop conditions:

- RD needs fragmented formal approval inboxes at launch.
- RD needs one monolithic all-domain apply module.
- RD needs direct root/drawing/part/submission/BOM formal mutation without platform audit.
- RD needs root obsolete without impact preview and aggregate root intent.
- RD needs an approval action without a deterministic domain handler.
- RD wants cost/supplement adapters to be the final launch-readiness state.
- RD cannot physically migrate known historical approval-like records without data loss or ambiguity.
- RD needs no-code rule builder before platform contract.
- RD needs production/Supabase live migration, provider pointer switch, direct DB mutation, direct data repair/deletion, merge, PR, rollback or release artifacts.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Additional production/live implementation | Same Spec Phase 5-6 / Not Authorized | Local implementation exists; release/live work remains gated |
| Production release/cutover | Phase 6 / Release Authorization Required | Requires deployment-release gate |
| Unplanned live/direct historical approval rewrite | Blocked Human Re-entry | Controlled Phase 5 migration is tracked; live/direct rewrite requires data policy and retention decision |
| No-migration architecture spike | Complete | ADR 002 selected additive v2 platform tables |
| Full physical migration of known historical approval-like records | Same Spec Phase 5 / Guarded tooling only | User selected `3C`; required before launch readiness; live/runtime execution remains gated |
| No-code approval rule builder | New DEV later | Not needed for first stable platform |
| ERP/supplier/customer approval portal | New DEV later | External integration scope |
| Notification engine and SLA analytics | New DEV later | Platform events can precede delivery UX |

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | spec, ADR, QA, dev_task, documentation_map | product implementation | user requested session content as development docs | files created and indexed | git diff |
| Phase 1A / architecture spike | Authorized / Complete | Complete | no-migration data-strategy spike and ADR | live migration | user authorized RD implementation | v2 platform tables selected | ADR 002 |
| Phase 1B / platform foundation | Authorized / Local complete | Implemented locally | core model, registry, handler dispatch, inbox, decision API | production migration, domain full migration | Phase 1A ADR plus authorization | fake handler, platform routes and unified inbox pass focused QC | tsc, platform QC |
| Phase 2 / numbering-root integration | Authorized / Transitional | Adapter present | numbering approvals, part/drawing/root obsolete, controlled history | direct obsolete mutation, root intent loss | Phase 1 evidence | numbering approval records can appear in unified inbox and be decided through platform adapter | platform QC; numbering entrypoint QC pending |
| Phase 3 / submission and BOM | Authorized / Transitional | Adapter present | submission release/exception, technical transfer, BOM lifecycle approvals; launch blocker | replacing domain release logic with generic effects | Phase 1 evidence | submission/BOM records can appear in unified inbox and delegate decision to domain logic | platform QC; friendly routes delegate through platform |
| Phase 4 / cost and supplement adapters | Authorized / Transitional | Adapter implemented | transitional cost and supplement inbox/history adapters | final launch state by adapter only | Phase 1 evidence | cost/supplement records can appear in unified inbox and delegate decision to domain logic | platform QC |
| Phase 5 / historical migration and hardening | Dry-run authorized / live execution not authorized | Guarded dry-run/apply tooling present | full physical historical approval migration, bypass audit, guardrails, governance scanner | production release/live rewrite | Phase 1-4 evidence | dry-run inventories records and parity hashes without mutation; guarded apply self-test passes on disposable DB | migration dry-run report |
| Phase 6 / release | Not authorized | Release Authorization Required | deploy, migration, smoke, rollback | unapproved live changes | release authorization | release gate pass | deployment-release-gate evidence |

### DEV-PDM-ACCESS-CONTROL-001 使用者身分、組織範圍與權限架構

狀態: 本地上線切片已完成並通過驗證；身分提供者、完整權限切換與正式環境階段需另行授權。
優先級: P0，因為上線前的使用者與權限會影響身分、審核責任、檔案可見性、外部專員與異動紀錄。
類型: 上線前使用者與權限治理。
上層任務: `DEV-PDM-SETTINGS-CENTER-001`；沿用目前 auth/permission model。
已授權範圍: 使用者已在 2026-07-07 授權本地使用者/權限功能開發。這次只包含鉦富先上線工作區、角色/範圍/外部專員治理、設定 UI、本地 migration planning。Google OAuth、正式部署、live Supabase migration、直接修資料/刪資料與完整權限切換仍未授權。

使用者決策:

- PDM 使用者身分不是 Google 信箱；Google 信箱只是登入方式。
- 有 Google 信箱與沒有 Google 信箱的使用者，都要對應到同一個穩定 `PDM User ID`。
- 工作區由部署、網域、邀請或登入脈絡自動判斷；一般管理員日常設定權限時不選公司。
- 鉦富/久方這類法律公司或資料所有者是工作區內的選用隱藏分類，不是第一版權限設定主軸。
- 部門只處理歸屬、預設主管、通知與待辦分派；部門不會自動給動作權限。
- 角色決定可以做什麼；範圍決定角色用在哪裡。
- 角色權限 UI 拆成「角色/動作定義」與「使用者/範圍指派」。
- 一般管理員看到唯讀目前工作區，不看到公司選擇器。
- 角色畫面用清單、表格與聚焦詳情，不做公司 x 部門 x 角色 x 權限的大矩陣。
- 使用者角色指派必須有範圍模板與儲存前權限預覽。
- 外部專員指派必須有內部負責人、指定範圍與第一次 90 天複核日。
- 第一版外部專員預設只能讀取、留言與提供建議；不預設建立、編輯、審核、發行、批次下載或不受控匯出。
- 外部專員複核預設 90 天；到期只提醒與留紀錄，不自動停權。
- 第一版角色範圍: 研發/研發主管用所屬部門；品保用預設品質視圖；製造/採購只看正式資料；外部專員用指定範圍。
- 無 Google 使用者由管理員邀請，第一次登入時設定密碼。
- 鉦富先上線，保留未來久方工作區擴充；現階段不做平台級 SaaS console 或一般管理員公司切換。
- Google SSO/本機登入只能連到管理員已建立或已邀請的 PDM 使用者；不允許自行註冊或 email domain 自動授權。
- 權限切換採模型先行: 先補身分/組織/角色/範圍基礎，再做旁路比對與受控切換；不接受無盤點、無證據、無旗標的一次性完整切換。
- 使用者面向一律稱「外部專員」。
- 一個人可以有多個角色與多個部門/專案/產品/客戶範圍。
- 外部專員是 PDM 使用者，但不放在內部組織樹下。
- PDM 仍是角色、審核與權限決策主體；Google Workspace 只提供帳號或 Drive 來源。
- 不接受共用人員帳號。

必讀文件:

- `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
- 相關基礎: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
- 相關 QA: `.ai-doc/qa/qa-pdm-numbering-permission-guard-validation-plan-2026-06-01.md`

實作摘要:

- SQLite 啟動 schema 與 Postgres migration planning 已加入角色指派欄位：適用範圍、指定範圍、內部負責人、起始日、複核日與到期停用日。
- 已建立上線初版角色：製造、採購、外部專員。
- 已加入「留言」與「提供建議」兩個外部專員可用權限。
- 外部專員預設只能讀取、留言與提供建議；預設不能建立、發行、匯出或調整權限設定。
- 角色指派 API 接收範圍資料，repository 會檢查指派原因、指定範圍、內部負責人，並替外部專員預設 90 天後複核。
- `/settings/workflow` 顯示唯讀「鉦富 Jenfu PDM」工作區，沒有公司選擇器。
- 權限設定畫面分成「角色管理、使用者權限、外部專員、異動紀錄」。
- 使用者指派表單包含適用範圍、指定範圍、內部負責人、下次複核、到期停用日、指派原因與儲存前權限預覽。
- 權限異動紀錄由管理矩陣 API 回傳，並顯示在「異動紀錄」分頁。
- 審核矩陣第一欄改為唯讀「規則摘要」；新增與更新規則時，摘要以「情境 / 處理」使用者語言由觸發動作、階段、狀態、料件、風險、控制方式與審核角色自動產生，`ruleName` 不再是管理員可自由輸入的行為來源。
- Supabase migration mirror 只做規劃檔；本機沒有 Supabase CLI，所以沒有執行 live migration history validation。

任務範圍:

- 定義上線可用的登入身分、PDM 使用者、組織歸屬、角色指派、範圍、權限與異動紀錄模型。
- 沿用既有角色權限引擎作為實作方向。
- 支援有 Google 信箱、無 Google 信箱與外部專員。
- 讓管理員先用基本身分、部門、角色與範圍模板完成常見設定；有效日/複核日主要用於外部、臨時或代理。
- `/settings/workflow` 權限 UI 契約為「角色管理、使用者權限、外部專員、異動紀錄」。
- 高風險角色或範圍變更必須有預覽、原因與異動紀錄。
- 第一版只露出可被目前後端執行的保守角色與範圍模板，不預設開放底層進階規則 builder。
- 記錄未來階段為 RD Contract Ready，但不當作已授權可執行。

不在本次範圍:

- 授權的本地上線切片以外的產品實作。
- Google OAuth 設定或 provider cutover。
- 正式部署、正式 migration、直接修資料/刪資料、live RLS/grant 變更。
- HR、ERP、薪資或 Google Workspace 組織圖同步。
- 供應商或客戶 portal 重設計。
- 讓 Google Workspace 群組直接控制 PDM 角色。
- 讓外部專員預設具備審核或發行權。

階段路線圖:

| 階段 | 狀態 | 目的 | 授權邊界 |
|---|---|---|---|
| Phase 0 架構整理 | 完成 | 記錄系統圖、使用者決策、規格與 DEV row | 只授權文件 |
| Phase 1 身分提供者邊界 | RD Contract Ready / 未授權 | 讓 Google 與無 Google 使用者都對應到穩定 PDM user | 需要 rollout 決策與 RD 授權 |
| Phase 2 工作區、部門與外部人員模型 | 本地已部分實作 | 鉦富唯讀工作區與外部專員 metadata | 完整部門模型、久方 provisioning、提醒排程需另行授權 |
| Phase 3 權限整合與範圍模板 | 本地已部分實作 | 上線角色、保守範圍模板與外部專員預設權限 | 完整路由盤點、旁路比對與權限切換需另行授權 |
| Phase 4 管理 UI 與治理 | 本地已部分實作 | `/settings/workflow` 分頁、指派資料、預覽、外部專員與異動紀錄 | 完整帳號生命週期與 access review 需另行授權 |
| Phase 5 正式上線與遷移 | RD Contract Ready / 需 release 授權 | backfill 使用者/角色/範圍並跑 release gate | 需要明確 deployment-release 授權 |

已完成上線切片驗收:

- 已接受架構寫入規格，且此 DEV 已出現在 active control board。
- 一般管理員可管理權限但看不到公司選擇器；鉦富工作區為唯讀脈絡。
- 角色/動作定義與使用者/範圍指派已拆開。
- 審核矩陣不再顯示可自由輸入的規則名稱；規則摘要由實際可執行欄位自動產生，且必須用管理者可讀的「情境 / 處理」句型呈現，畫面需將情境與處理分行顯示。
- 使用者指派必須填原因並在儲存前顯示權限預覽。
- 外部專員在指定範圍、內部負責人與複核日未完成前不能儲存。
- 外部專員預設允許讀取、留言、提供建議，預設拒絕建立、發行、匯出與權限設定。
- 設定流程頁已顯示權限異動紀錄。
- 未來身分提供者、久方工作區、完整路由切換與正式環境階段沒有被視為可直接執行。

驗證證據:

- `npx.cmd tsc --noEmit --pretty false`: 通過。
- `npm.cmd run qc:pdm-access-control-governance` with `PDM_BASE_URL=http://127.0.0.1:3000`: 通過 88/88。
- `npm.cmd run lint`: 0 errors；另有 3 個既有 warnings 在 `src/components/master-attachment-panel.tsx`。
- 本機 3000 server 曾透過 `scripts/start-localhost-3000.ps1 -RestartProjectProcess -CleanNext -NoBrowser` 重新啟動；health checks 通過 `/`、`/login`、`/api/auth/me`。

停止條件:

- RD 需要正式部署、migration、provider cutover 或 live OAuth setup。
- RD 需要直接修資料、刪資料或手動改 DB。
- 產品決策改成由 Google Workspace 群組主控 PDM 角色。
- 產品決策讓外部專員預設具備審核或發行權。
- 產品決策讓外部專員預設可建立、編輯、審核、發行、批次下載或不受控匯出。
- 產品決策或 RD 實作想把 90 天外部專員複核提醒改成自動停權或 hard expiry。
- 產品決策允許共用人員帳號。
- 產品決策要求一般管理員在同一設定畫面跨無關客戶工作區切換。
- 產品決策允許 Google 自行註冊或依網域自動授權。
- 產品決策允許高風險角色/範圍變更不需要預覽、原因與異動紀錄。
- 產品決策或 RD 計畫要求沒有路由盤點、旁路差異證據、feature flag、rollback/recovery gate 的一次性完整權限切換。

延後範圍稽核:

| 範圍 | 分類 | 原因 |
|---|---|---|
| Google OAuth implementation | Same Spec Phase 1 / 未授權 | 已決策邀請式身分連結；provider 啟用仍需 RD 授權 |
| 無 Google 憑證發放 | Same Spec Phase 1 / 未授權 | 已決策管理員邀請 + 第一次登入設定密碼 |
| 工作區模型 | 本地上線切片已實作；完整 Phase 2 未授權 | 目前只顯示鉦富唯讀工作區；未來久方 provisioning 需另行授權 |
| 法律公司/資料所有者分類 | Same Spec Phase 2 / 未授權 | 鉦富/久方隱藏分類需另行決策 |
| 組織/部門/專案模型 | Same Spec Phase 2 / 未授權 | 已記錄為分派與預設範圍，不是權限主體 |
| 外部專員負責人/複核提醒 | 本地上線切片已實作；提醒排程仍是未來工作 | 指派 metadata 已完成；提醒派送與 access review 需另行授權 |
| 外部專員 hard expiry / 自動停權 | Blocked Human Re-entry | 第一版明確不自動停權 |
| 範圍模板層 | 本地上線切片已實作；完整 scope engine 是 Phase 3 | 管理 UI/API 已有保守模板；完整 route-level scope 與旁路切換仍延後 |
| 編號以外權限整合 | Same Spec Phase 3 / 未授權 | 需要路由盤點、additive schema/adapters、旁路比對、差異報告與受控 route migration |
| 一次性完整權限切換 | No Tracking / rejected | 上線風險過高，與 RD 主管 guard 衝突 |
| 帳號/角色/範圍 UI | 本地上線切片已實作；完整生命週期仍是 Phase 4 | `/settings/workflow` 已有分頁、指派 metadata、預覽、外部專員與異動紀錄 |
| 權限矩陣 draft/test/Admin activation | Same Spec Phase 4 + `DEV-PDM-SETTINGS-CENTER-001` / 未授權 | 高風險權限變更正式使用前應接上設定中心生命週期 |
| 平台級多公司管理台 | Blocked Human Re-entry | 屬於平台營運範圍，不是一般管理員權限設定 |
| 底層進階規則 builder 預設 UI | No Tracking / first version rejected | 與 HCS `2A` 的簡單範圍模板流程衝突 |
| 正式 migration/cutover | Blocked Human Re-entry / 需 release 授權 | 需要 deployment-release gate |
| Google group direct role mapping | No Tracking / rejected | 違反已確認的 PDM 授權邊界 |
| 共用人員帳號 | No Tracking / rejected | 違反稽核與責任歸屬 |
| 一般管理員跨 tenant 公司切換 | No Tracking / first version rejected | 跨 tenant 控制屬於 platform admin，不是一般權限設定 |

下一步條件:

- 觀察 APP 對本地上線切片的使用回饋。若要繼續做 Google OAuth / 身分提供者、無 Google 邀請與首次密碼設定、完整路由盤點與旁路權限切換、久方工作區、正式遷移/部署、提醒排程或未來 hard-expiry policy，都需要另行授權。

### DEV-PDM-NUMBERING-004 Contextual Numbering / Lifecycle Entrypoints

Status: Implemented / local verification passed for Phase 1-3; release not authorized
Priority: P0 - current APP users cannot find the natural continuation entrances for existing roots, drawings and parts
Type: Delivery point / contextual add and obsolete entrypoints
Parent: `DEV-PDM-NUMBERING-003`; `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`; `DEV-PDM-LIFECYCLE-ACTIONS-001`
Authorized phase: Phase 1-3 local RD implementation was authorized by the user on 2026-07-08 and is complete. Production deploy, Supabase live migration/cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.

Human decisions:

- HCS `1B`: first delivery must be a usable local vertical slice. Adding `M02/R01`, adding `P02`, and formal obsolete request need UI/API/repository/audit/QA support, not labels only.
- HCS `2B+C`: root obsolete must be visible as a first-class entry and support whole-root batch intent, but it must open impact preview and approval package; no one-click root obsolete.
- HCS `3B`: primary entrances belong in object detail drawers where the user is already working: root drawer, drawing drawer and part drawer. `/numbering/request` is only a global fallback with `既有主根號追加` mode.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
- `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`
- `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`
- Existing identity authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
- Existing relation-view authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
- Existing lifecycle authority: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`

Scope:

- Add root drawer entries in `/numbering/search`: `新增圖號`, `新增料號`, `申請主根作廢`.
- Add drawing drawer entries in `/numbering/drawings` and relation-view drawing detail: `新增同根圖號`, `新增同圖料號`, `申請圖號作廢`.
- Add part drawer entries in `/parts` and relation-view part detail: `新增同根料號`, `新增同根圖號`, `申請料號作廢`.
- Add existing-root append APIs and async repository methods for drawing and part creation under the current root.
- Support linked part creation from a drawing with relation creation in the same transaction when selected.
- Surface formal part/drawing obsolete request through lifecycle approval.
- Add root obsolete impact preview and aggregate approval package preserving whole-root batch intent and child target list.
- Add `/numbering/request` fallback mode `新主根號 / 既有主根號追加`.

Out of scope:

- Production deploy, Supabase live migration/cutover, provider pointer change, merge, PR, rollback or release artifacts.
- Direct data repair/deletion or historical backfill.
- Mass spreadsheet append, mass obsolete, physical purge, ERP/procurement/BOM deep integration and platform-wide release rollout.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development document | Complete | Capture decisions, entry placement, API contract, QA and control-board entry | Authorized documentation only |
| Phase 1 - Contextual add entrypoints | Implemented / local verification passed | Drawer CTAs, append APIs, sequence/idempotency, audit and focused QC for `M02/R01/P02` | Completed after explicit RD authorization |
| Phase 2 - Obsolete entrypoints and root impact wizard | Implemented / local verification passed | Part/drawing obsolete CTAs, root impact preview, aggregate approval package | Completed after explicit RD authorization |
| Phase 3 - Global fallback append mode | Implemented / local verification passed | `/numbering/request` existing-root append mode | Completed in same local slice |
| Phase 4 - Production release | Release Authorization Required | Deploy/migration/smoke/rollback | Requires deployment-release gate |

Acceptance for current local implementation:

- Human decisions `1B / 2B+C / 3B` are captured.
- UI entry placement is specified for root, drawing, part and global fallback surfaces.
- Add flows for `M02/R01` and `P02` are specified as operational API/repository work.
- Root obsolete is specified as previewed aggregate approval, not direct mutation.
- QA plan covers permissions, relation semantics, idempotency, concurrency, lifecycle and viewport safety.
- Local Phase 1-3 implementation is verified; production/release work remains gated.

Evidence captured:

- `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-numbering-contextual-entrypoints` 31/31
- isolated API smoke 10/10: `A0001-M02`, `A0001-R01`, `A0001-P02`, combined `A0001-M03 + A0001-P03`
- browser screenshots under `output/playwright/pdm-numbering-contextual-entrypoints/`

Stop conditions:

- RD needs root obsolete without impact preview and approval.
- RD needs existing-root append to create a new root.
- RD needs an `R` drawing to become manufacturing basis.
- RD cannot keep drawing-linked part creation atomic with relation creation when selected.
- RD cannot preserve root-level reason and child targets in root obsolete approval.
- RD needs production/Supabase live changes, provider pointer switch, direct DB mutation, direct data repair/deletion, merge, PR, rollback or release artifacts.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Implemented locally for Phase 1-3 | Completed after explicit RD authorization |
| `/numbering/request` fallback mode | Implemented locally | Shipped with object drawers |
| Root aggregate approval backend | Implemented locally | Added root obsolete impact and aggregate approval request action |
| Bulk import append mode | New DEV later | Separate import workflow |
| Mass obsolete by spreadsheet | New DEV later | Higher risk batch governance |
| Historical data repair/backfill | Blocked Human Re-entry | Requires explicit data policy |
| Production deployment/cutover | Release Authorization Required | Requires deployment-release gate |

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | spec, QA, dev_task, documentation_map | product implementation | user answered HCS decisions | files created and indexed | git diff |
| Phase 1 / contextual add | Authorized and executed | Implemented / local verification passed | drawer CTAs, append APIs, sequence/idempotency, audit, highlight new record | production | explicit RD authorization received | M02/R01/P02 created under existing root without duplicate root | tsc, lint, build, focused QC, isolated API smoke, browser smoke |
| Phase 2 / obsolete entries | Authorized and executed | Implemented / local verification passed | part/drawing obsolete CTAs, root impact wizard, approval request package | one-click obsolete, direct mutation, production | explicit RD authorization received | requests route through lifecycle/approval with impact and reason guard | focused QC, browser smoke |
| Phase 3 / global fallback | Authorized and executed | Implemented / local verification passed | `/numbering/request` existing-root append mode | replacing object drawers | combined with Phase 1-2 implementation | global users can append after root search | focused QC, browser smoke |
| Phase 4 / release | Not authorized | Release Authorization Required | deployment and migration | unapproved data mutation | explicit release authorization | release gate pass | deployment-release-gate evidence |

### DEV-PDM-SUBMISSION-GATE-001 研發 / 技術移轉送審 Gate

Status: Spec Ready / Human Confirmed; RD Contract Ready / Not Authorized
Priority: P0 - controls whether incomplete engineering data can be handed to manufacturing, procurement and QC
Type: Delivery point / research vs technical-transfer submission gate
Parent: `DEV-PDM-DRAWING-SUBMISSION-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`
Authorized phase: Phase 0 documentation only, authorized by the user's 2026-07-07 request to write the guided decisions into a development document. No product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact is authorized.

Human decisions:

- HCS `1B`: submission page must let the user choose `研發送審` or `技術移轉送審`.
- User critical amendment: `技術移轉送審` must not be a direct single drawing or single part submission. It must be a case-scoped transfer package for a whole development case or design-change case.
- HCS `2B`: required-data rules use a versioned submission rule matrix.
- HCS `3B`: technical transfer hard-blocks missing required data; research submission may allow controlled manager exception with reason and audit.
- HCS follow-up `1B`: a technical transfer package needs package context and case/change reason. If the real case has only one affected item, the submitter must declare `no other affected items`, and the reviewer must confirm the scope.
- HCS follow-up `2B`: technical transfer does not allow missing-required-data exception. All required transfer data must be complete before review; Manufacturing/Procurement/QA/QC sign off after readiness passes as applicable.
- HCS follow-up `3C`: research submitter may submit with an exception reason, but reviewer or supervisor must approve the exception during review before final approval.
- RD supervisor review `1C`: `ApprovedForTransfer` creates a controlled transfer package; formal master release is a separate RD Manager/Admin action through the existing release workflow, item-by-item or package-batch.
- RD supervisor review `2B`: the rule matrix determines applicable sign-off roles; applicable roles must sign, and not-applicable requires rule source or RD Manager/Admin reason/audit.
- RD supervisor review `3B`: package item or readiness-driving data changes invalidate the current readiness snapshot and affected sign-offs; the package returns to correction/data-collection and must be re-resolved/re-signed.
- Critical judgment: the user's amendment is correct because single-item technical transfer creates false readiness and misses BOM, cost, manufacturing, procurement, QC and drawing/part relationship effects.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
- `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`
- `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`
- Existing drawing submission authority: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- Existing workbench authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing relation context: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
- Existing release lifecycle authority: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`

Scope:

- Define two submission modes: item-centric `研發送審` and package-centric `技術移轉送審`.
- Define the rule matrix dimensions and field states: `required`, `warning`, `optional`, `not_applicable`.
- Define transfer package as the required unit for technical transfer.
- Define one-item transfer package guard: package context, case/change reason, `no other affected items` declaration and reviewer scope confirmation.
- Define technical transfer as no missing-required exception.
- Define research exception as submitter reason plus reviewer/supervisor decision before final approval.
- Define package readiness aggregation across roots, drawings, parts, BOM, cost, attachments and owner roles.
- Define applicable Manufacturing/Procurement/QA/QC sign-offs after readiness passes.
- Define `ApprovedForTransfer` as a controlled handoff milestone that does not directly mutate drawing/part/root lifecycle.
- Define formal release work item creation from approved transfer package through the existing release workflow.
- Define item-set/readiness hashes, idempotency, unique constraints, transaction boundaries and stale snapshot/sign-off invalidation.
- Define UI behavior when users start from drawing/part and choose technical transfer.
- Define QA/QC gates for single-item transfer denial and package readiness.

Out of scope:

- Product implementation until explicitly authorized.
- Production deploy, Supabase live migration, direct data repair/deletion.
- ERP sync, supplier portal, visual BOM/CAD graph.
- Full no-code rule engine.
- Merge, PR, rollback or release artifacts.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development document | Complete | Capture human decisions, spec, QA and control-board entry | Authorized documentation only |
| Phase 1 - Rule resolver and mode entry | RD Implementation Ready / Not Authorized | Add submission-mode selector, active rule resolver, field-state output and technical-transfer item-origin redirect | Requires explicit RD authorization |
| Phase 2 - Research submission redesign | RD Contract Ready / Not Authorized | Apply conditional rules to research submission and exception workflow | Requires Phase 1 evidence and authorization |
| Phase 3 - Technical transfer package builder | RD Contract Ready / Not Authorized | Case-scoped transfer package guard, readiness dashboard, hard submit block, applicable sign-offs, stale invalidation and release-work-item handoff | Requires explicit authorization |
| Phase 4 - Rule matrix admin governance | RD Contract Ready / Not Authorized | Rule-set draft/preview/activate/retire UI with audit | Requires settings/admin authorization |
| Phase 5 - Production release | Release Authorization Required | Production deploy/migration/smoke/rollback | Requires explicit release authorization |

Acceptance for current documentation phase:

- Human decisions are captured.
- Critical judgment about case-scoped transfer package is captured.
- Follow-up decisions `1B / 2B / 3C` are captured in spec, ADR, QA, dev_task and documentation_map.
- RD supervisor decisions `1C / 2B / 3B` are captured in spec, ADR, QA, dev_task and documentation_map.
- Spec defines product rule, rule matrix, UI contract, data/API contract, permissions, state machine, phase roadmap and deferred scope audit.
- QA plan defines positive and negative tests.
- dev_task and documentation_map register the package as not authorized for implementation.

Stop conditions:

- RD needs to allow technical transfer from a single drawing or single part.
- RD needs missing-required transfer exception.
- RD needs research exception to pass final approval without reviewer/supervisor decision.
- RD cannot enforce one-item transfer package declaration and reviewer scope confirmation.
- RD needs `ApprovedForTransfer` to directly mutate drawing/part/root lifecycle to `Released / Release`.
- RD needs stale readiness snapshots or stale affected sign-offs to remain valid after package item or readiness-driving field changes.
- RD cannot use existing `QA/QC` role for quality sign-off.
- RD needs schema migration, production deploy, Supabase live cutover, provider pointer change, direct DB mutation, direct data repair/deletion or release artifacts.
- RD cannot preserve drawing/part owner-domain write responsibility.
- RD cannot capture rule-set version in transfer package readiness snapshot.
- RD needs ERP sync, supplier portal or visual BOM/CAD graph in the first implementation slice.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Not Authorized | Development document only |
| Research submission redesign | Same Spec Phase 2 / Not Authorized | UI behavior changes but is captured in the same spec |
| Transfer package builder | Same Spec Phase 3 / Not Authorized | Larger workflow and schema impact |
| Rule matrix admin UI | Same Spec Phase 4 / Not Authorized | Settings/admin governance scope |
| Production release | Blocked Human Re-entry / Release Authorization Required | Release artifacts deferred until explicit authorization |
| ERP sync / supplier portal | New DEV later | Separate external integration problem |
| Visual BOM/CAD graph | New DEV later | Separate visualization problem |
| Direct data repair / historical backfill | Blocked Human Re-entry | Requires explicit data policy decision |

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | spec, ADR, QA, dev_task, documentation_map | product implementation | user answered HCS decisions | files created and indexed | git diff |
| Phase 1 / resolver + mode entry | Not authorized | RD Implementation Ready | mode selector, resolver, field states, transfer redirect | full package builder, admin UI | explicit RD authorization | direct single-item tech transfer blocked; resolver works; no transfer required override | tsc, lint, focused QC, browser smoke |
| Phase 2 / research redesign | Not authorized | RD Contract Ready | conditional required UI, exception reason and reviewer/supervisor decision | transfer package UI | Phase 1 passed + authorization | warning exception requested and decision audited | UI QC |
| Phase 3 / transfer package | Not authorized | RD Contract Ready | case-scoped package guard, readiness dashboard, submit hard block, applicable sign-offs, stale invalidation, release-work-item handoff | automatic master release, production, ERP sync, graph | explicit authorization | full package readiness works; one-item scope confirmed; sign-offs captured; ApprovedForTransfer does not auto-release | package QC, browser smoke |
| Phase 4 / rule admin | Not authorized | RD Contract Ready | rule draft/preview/activate/retire | full no-code engine | settings authorization | versioned rules audited | admin QC |
| Phase 5 / release | Not authorized | Release Authorization Required | deployment and migration | unapproved data mutation | explicit release authorization | release gate pass | deployment-release-gate evidence |

### DEV-PDM-DRAWING-PART-RELATION-VIEW-001 圖料模組關係視圖

Status: Implemented / local verification passed for Phase 1-3
Priority: P1 - APP feedback shows current list cannot communicate root/drawing/part relationship, causing wrong mental model before send-review or manufacturing use
Type: Delivery point / 圖料關係視圖 UX
Parent: `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-NUMBERING-002`
Authorized phase: Phase 1-3 local implementation was authorized by the user's follow-up request. No schema migration, production deploy, Supabase live cutover, direct data repair/deletion, merge, PR, rollback or release artifact is authorized.

Human decisions:

- Current 圖料模組 flat result list is meaningless because it repeats root/drawing/part rows without showing their relationship.
- The UI must show `主根號 -> 圖號 -> 料號`.
- A root can map to many drawings.
- One drawing can map to many part numbers.
- One part can appear under multiple drawings when the relationship is legitimate.
- Default view should be a root-grouped relationship tree.
- Matrix view is useful as a review/gap-checking mode, not necessarily the default.
- The view must preserve existing owner-domain rules; relationship display does not make 圖料模組 the owner of drawing or part data.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
- `.ai-doc/qa/qa-pdm-drawing-part-relation-view-validation-plan-2026-07-07.md`
- Existing ownership authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing ownership ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
- Existing layout baseline: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
- Existing identity-list context: `.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md`

Scope:

- Replace the default flat 圖料模組 result presentation with one root group per root.
- Show all drawings under each root.
- Show all linked parts under each drawing.
- Show one drawing to many parts and one part to multiple drawings without hiding the relationship in a drawer only.
- Distinguish `製造依據` from `參考`.
- Show relationship health and next step at root/drawing/part levels.
- Preserve filters, status vocabulary, drawer detail behavior and existing owner-domain boundaries.

Out of scope:

- Generic product changes outside the relation-view scope.
- Generic relationship write/edit actions outside the controlled maintenance contract.
- DB schema migration.
- Numbering rule changes.
- Owner-domain responsibility changes.
- Production deploy, Supabase live cutover, direct data repair/deletion.
- Matrix export, BOM/CAD graph visualization or bulk maintenance.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture SPEC, QA, dev_task and documentation_map entries | Authorized documentation only |
| Phase 1 - Root-grouped relationship tree | Implemented / local verification passed | Relation aggregation and default relationship tree UI | Authorized by user Phase 1-3 execution request |
| Phase 2 - Relationship matrix | Implemented / local verification passed | One-root matrix for dense many-to-many review and gap checking | Authorized by user Phase 1-3 execution request |
| Phase 3 - Relationship maintenance | Implemented / local verification passed | Controlled edit/recovery actions through repository API and audit | Authorized by user Phase 1-3 execution request |

Phase 1 RD handoff:

- Add or extend read-only relation aggregation API for root/drawing/part relationships.
- Render one root group per root in the 圖料模組.
- Render all drawings and linked parts, not only primary drawing/part.
- Classify relationship cells as `manufacturing_basis`, `reference`, `none` or `blocked`.
- Use semantic helpers for `M/MA` manufacturing and `R/OT` reference.
- Show orphan part/drawing and ambiguous relationship blockers with Now What text.
- Add or update focused QC as `qc:pdm-drawing-part-relation-view`.

Acceptance:

- A root with multiple drawings appears once.
- A drawing with multiple linked parts displays all linked parts under that drawing.
- A part linked to multiple drawings is visible in each valid drawing relationship and in drawer detail.
- Reference drawings are never labeled as manufacturing basis.
- Missing manufacturing coverage is visible without opening a drawer.
- Existing search/filter behavior remains available.
- Desktop/laptop/mobile viewports have no page-level horizontal overflow.

Evidence required after implementation:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-numbering-search-ui`
- `npm.cmd run qc:pdm-master-workbench-layout`
- `npm.cmd run qc:pdm-drawing-part-relation-view`
- Browser evidence at `1440x900`, `1024x768` and `390x844`

Stop conditions:

- RD needs relationship write/edit actions in Phase 1.
- RD needs DB schema migration to represent legitimate relationships.
- RD cannot preserve owner-domain rules.
- User changes default view to matrix-first.
- Implementation requires production deploy, Supabase live cutover, direct data repair/deletion, merge, PR, rollback or release gate.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Completed locally | Phase 1-3 implemented and verified |
| Matrix review view | Completed locally | Matrix mode implemented and verified |
| Relationship maintenance/edit actions | Completed locally within controlled contract | Generic write API and bulk repair remain out of scope |
| DB schema migration | Deferred / not required | No schema migration was needed |
| Production deploy/Supabase live cutover | Blocked Human Re-entry / Release Authorization Required | Release artifacts are deferred until explicit release authorization |
| Matrix export/reporting | No Tracking | Not needed to solve current relationship comprehension problem |
| BOM/CAD graph visualization | New DEV later | Separate product problem from master relationship list readability |

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | Product implementation | User requested development documents | Files created and indexed | Git diff |
| Phase 1 / relation tree | Authorized | Implemented / verified | Relation aggregation, root tree UI, drawer integration, QC | schema migration, production | User authorized Phase 1-3 | root once, all relations visible, no overflow | tsc, lint, build, QC, screenshots |
| Phase 2 / matrix | Authorized | Implemented / verified | one-root matrix review | bulk edit, export, BOM/CAD graph | User authorized Phase 1-3 | dense many-to-many reviewable | relation QC, screenshots |
| Phase 3 / maintenance | Authorized | Implemented / verified | controlled relation edit/recovery actions | generic write API, released patching, data repair | User authorized Phase 1-3 | owner API/audit/permission gates pass | relation API and audit QC |

Local verification evidence on 2026-07-07:

- `npx.cmd tsc --noEmit --pretty false` - passed.
- `npm.cmd run lint -- --quiet` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run qc:pdm-numbering-search-ui` - 30/30 passed.
- `npm.cmd run qc:pdm-master-workbench-layout` - 205/205 passed.
- `npm.cmd run qc:pdm-drawing-part-relation-view` - 56/56 passed.
- Runtime used disposable SQLite data dir `output/qc-runtime/pdm-relation-20260707-001`.
- Screenshot evidence under `output/playwright/pdm-drawing-part-relation-view/`.

### DEV-PDM-NUMBERING-002 Compact Numbering Core V2

Status: Implemented / Verification passed locally, including approved runtime formal cutover
Priority: P0 - identity scheme affects root, drawing, part, release gate and future ERP/PLM compatibility
Type: Delivery point / numbering core
Parent: `DEV-PDM-NUMBERING-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; current PDM master-data direction
Authorized phase: Phase 1-3 local implementation and compatibility work were authorized by the user's 2026-07-07 RD execution request and are complete. The user then explicitly authorized Phase 4 local/runtime formal cutover; it was executed against `data/ai-pdm.sqlite` with backup and rollback evidence. External production deploy, Supabase live target migration/provider cutover, physical historical file/path renaming and any additional data repair/deletion remain not authorized.

Human decisions:

- Main root is a reusable PDM design-object root, not a project, order, equipment serial number or whole-machine project.
- PDM first manages only main root, drawing number and part number.
- New target identities are `00001`, `00001-P01`, `00001-M01` and `00001-R01`.
- Visible drawing number signal should only distinguish manufacturing-authorized drawing from reference-only drawing.
- Additional subtype such as installation, concept, inspection, customer review or fixture belongs in metadata, not visible number codes.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
- `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
- `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-v2-compact-identity-report-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-v2-formal-cutover-report-2026-07-07.md`
- Existing amended authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

Scope:

- Add `numbering-rule-v2` and generate five-digit root codes.
- Create new part numbers as `{root}-P{seq2}`.
- Create new drawing numbers as `{root}-M{seq2}` or `{root}-R{seq2}`.
- Keep v1 historical data readable/searchable.
- Replace hard-coded `MA/OT` gate logic with semantic manufacturing/reference helpers.
- Update API, UI labels, placeholders, imports, exports, regex validators and focused QC.
- Apply local/runtime v1-to-v2 master identity cutover through the approved script with backup, apply report and independent check report.
- Retire local/runtime `numbering-rule-v1`, activate `numbering-rule-v2`, update operational references and retain protected historical evidence strings.

Out of scope:

- External production deploy, production migration, Supabase live cutover or provider pointer changes.
- Physical rewrite/rename of historical attachment filenames, derivative paths, release packages or protected audit evidence.
- Project/order/equipment numbering.
- BOM/ERP/equipment history linkage.
- More visible number category codes.
- Retiring v1 read/search paths.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | SPEC, ADR, QA, dev_task and documentation_map | Authorized by user request |
| Phase 1 - Local v2 creation and compatibility | Implemented / Verification passed | New records use compact v2; v1 remains readable | Authorized and completed locally |
| Phase 2 - Migration dry-run | Implemented / Verification passed locally | Map v1 to v2 and identify collision/capacity blockers | Authorized and completed as dry-run only |
| Phase 3 - Downstream compatibility | Implemented / Verification passed locally | Submission, revision, baseline, preview and report semantics support v1/v2 | Authorized and completed locally |
| Phase 4 - Local runtime formal cutover | Implemented / Verification passed locally | Apply approved v1-to-v2 master identity rewrite to `data/ai-pdm.sqlite`, update operational references, retain historical evidence strings and validate rollback backup. | Authorized by user on 2026-07-07 and completed locally |
| Phase 5 - External production/Supabase live cutover | Deferred / Not Authorized | Apply target migration/deploy/smoke/rollback outside local runtime. | Requires deployment-release gate, live target identity and credentials |

Acceptance completed:

- Normal create can produce `00001-P01`, `00001-M01` and `00001-R01`.
- Normal create no longer emits new `D-...`, `P-...`, `MA` or `OT` values.
- v1 rows remain readable/searchable.
- Missing manufacturing drawing gates accept `MA/M` as manufacturing and reject `OT/R` as reference.
- UI labels use `製造圖` and `參考圖`, not `OT 其他圖` for new creation.

Verification evidence:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:pdm-numbering-v2-compact-identity`
- `npm.cmd run pdm:numbering-v2:cutover-dry-run`
- `npm.cmd run pdm:numbering-v2:cutover-apply`
- `npm.cmd run qc:pdm-numbering-v2-formal-cutover`
- `npm.cmd run qc:pdm-numbering-v2-migration-dry-run`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-change-control`
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-api-regression`
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-data-consistency`
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-concurrency-reuse`
- `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-draft-lifecycle`
- `npm.cmd run qc:pdm-numbering-request-ui`
- `npm.cmd run qc:pdm-numbering-search-ui`
- `npm.cmd run qc:pdm-numbering-impact-ui`
- `npm.cmd run qc:pdm-numbering-dvt-ui`
- `npm.cmd run qc:master-attachments`
- `npm.cmd run qc:pdm-master-workbench-layout`
- `npm.cmd run qc:supabase-runtime-migrations`
- `npm.cmd run build`
- Local runtime cutover backup: `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`

Stop conditions:

- Any implementation would invalidate existing v1 rows.
- A root needs more than 99 part, manufacturing drawing or reference drawing sequence values.
- Implementation needs external production/Supabase live migration, provider pointer change, direct/manual data rewrite, data deletion or project/order/equipment identity design.
- Reference drawings are requested to become manufacturing basis without becoming an `M` drawing.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Applying existing-data v1 to v2 rewrite in local/runtime DB | Same Spec Phase 4 / Completed locally | Completed through scripted cutover after dry-run evidence, backup and explicit approval |
| Downstream compatibility | Same Spec Phase 3 / Completed locally | Semantic compatibility implemented and verified; external production evidence belongs to Phase 5 if deployed |
| External production/Supabase live cutover | Same Spec Phase 5 / Not Authorized | Requires deployment-release gate and explicit target approval |
| Project/order/equipment numbering | Blocked Human Re-entry | Changes product scope and identity model |
| More visible category codes | Blocked Human Re-entry | User currently chose only `P/M/R` |
| Retiring v1 read paths | No Tracking now | Rejected for safety; historical records stay readable |

Next condition:

- Monitor APP validation feedback. Do not run external production/Supabase live cutover, provider pointer change, direct/manual data repair/deletion, project/order/equipment numbering or extra visible category-code work without explicit approval and the required release/data gate.

### DEV-PDM-NUMBERING-003 Alphanumeric Root Identity

Status: Implemented / Verification passed locally for Phase 1-3; production/Supabase release remains not authorized
Priority: P0 - root identity policy affects all future root, drawing, part, import/export and migration behavior
Type: Delivery point / numbering identity policy
Parent: `DEV-PDM-NUMBERING-002`; `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`
Authorized phase: Phase 1 local v3 creation/compatibility, Phase 2 migration dry-run/downstream compatibility and Phase 3 local/runtime formal cutover after user authorized completing `DEV-PDM-NUMBERING-003` development tasks. Production/Supabase migration, provider pointer change, direct data repair/deletion outside the scripted cutover boundary, merge/PR/deploy/rollback/production smoke and release artifacts are not authorized.

Human decisions:

- User selected the `A0001` to `Z9999` root scheme.
- Root should be alphanumeric so spreadsheet tools do not strip leading zeroes from a pure numeric root.
- The leading letter is only a capacity band; `A/B/C` must not mean project, customer, product line, drawing type or lifecycle state.
- Root remains a reusable PDM design-object root, not a whole project/order/equipment root.
- Keep compact suffix semantics: `P` for part, `M` for manufacturing drawing, `R` for reference drawing.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
- `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md`
- `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`
- Existing amended authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
- Existing amended ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`

Scope:

- Define v3 root format `A0001-Z9999`.
- Define full identities `A0001-P01`, `A0001-M01`, `A0001-R01`.
- Preserve `P/M/R` as the only visible identity/category codes.
- Preserve v1/v2 read/search compatibility.
- Define ordinal allocation order: `A0001 ... A9999, B0001 ... Z9999`.
- Preserve gap-aware allocation while reserving controlled master rows, legacy numeric root v3 ordinals and audit/control root evidence.
- Keep `M` as manufacturing drawing category only; actual manufacturability remains controlled by status, revision, release record and manufacturing-basis relation.
- Keep `R` as reference-only; it cannot become manufacturing basis under any status.
- Define v2-to-v3 dry-run mapping and migration gates.

Out of scope:

- Production data rewrite.
- Supabase live migration, production deploy, provider pointer change or release artifacts.
- Direct/manual data repair or deletion outside the scripted v3 cutover boundary.
- Project/order/equipment numbering.
- More visible category codes.
- Physical rename/rewrite of protected evidence files or historical paths.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | SPEC, ADR, QA, dev_task and documentation_map entries | Authorized by user request |
| Phase 1 - V3 creation and compatibility | Complete / Verification passed locally | Add v3 rule, helpers, create API/UI examples, legacy ordinal reservation, formal-root reuse guard and v1/v2/v3 read compatibility | Authorized by user `執行開發` |
| Phase 2 - Migration dry-run and downstream compatibility | Complete / Verification passed locally | Report v2-to-v3 mappings and verify downstream semantic compatibility | Authorized by user `完成DEV-PDM-NUMBERING-003所有開發任務` |
| Phase 3 - Local/runtime formal cutover | Complete / Verification passed locally | Backup/apply/check conversion of local runtime master identities | Authorized by user `完成DEV-PDM-NUMBERING-003所有開發任務`; limited to local runtime DB |
| Phase 4 - External production/Supabase live cutover | Blocked Human Re-entry / Release Authorization Required | Live migration/deploy/smoke/rollback | Requires release gate |

Acceptance for Phase 1 when authorized:

- Normal create can produce `A0001-P01`, `A0001-M01` and `A0001-R01`.
- Existing v2 `00001-*` and v1 `D-*/P-*` rows remain readable/searchable.
- Import/export treats identity values as text and never normalizes `A0001` to `A1`.
- Search and relation views sort v3 roots by allocation order.
- UI/help text says the letter is a capacity band only.
- `R/OT` remains blocked from manufacturing-basis gates.

Phase 1-3 evidence:

- `npm.cmd run qc:pdm-numbering-v3-alpha-root`: passed 14/14.
- `npm.cmd run pdm:numbering-v3:cutover-dry-run`: passed; report `output/qc-pdm-numbering-v3-cutover/report.json`, `safe_map=24`, `collision=0`, `manual_review=0`, `blockers=0`, `exactReferences=39`.
- `npm.cmd run pdm:numbering-v3:cutover-apply -- --allow-running-local-server`: passed; backup recorded at `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`.
- `npm.cmd run qc:pdm-numbering-v3-formal-cutover`: passed 8/8; independent check report `output/qc-pdm-numbering-v3-cutover-check/report.json`; runtime has v3 active, v1/v2 retired, no legacy master identities and no legacy operational references.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 62/62.
- `npm.cmd run qc:pdm-numbering-core`: passed 241/241.
- `npm.cmd run qc:pdm-numbering-gap-reuse`: passed 8/8.
- `npm.cmd run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm.cmd run build`: passed after stopping the project-owned local server PID 44520 and restarting it through the managed `dev:local` entrypoint.
- `npm.cmd run dev:local:check`: passed; local URL `http://127.0.0.1:3000/`, PID 47036.

Stop conditions:

- Any step gives the root letter business meaning.
- Any step changes the selected allowed-letter set, such as excluding `I/O/Q`, without a new human decision.
- Any step needs direct/manual data mutation outside the scripted v3 cutover boundary, production/Supabase target access, provider pointer change, merge, PR, deploy, rollback or production smoke.
- Any step introduces project/order/equipment numbering or extra visible category codes into this DEV.
- Any step breaks v1/v2 compatibility.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation of v3 create paths | Same Spec Phase 1 / Complete locally | Implemented and verified under user authorization |
| V2-to-v3 dry-run and downstream compatibility | Same Spec Phase 2 / Complete locally | Dry-run report, downstream regressions and retained-evidence classification completed |
| Local/runtime formal cutover | Same Spec Phase 3 / Complete locally | Backup/apply/check conversion completed for local runtime DB |
| Production/Supabase live cutover | Blocked Human Re-entry / Release Authorization Required | Release gate required |
| Excluding `I/O/Q` | Blocked Human Re-entry | Current selected scheme is full `A-Z`; exclusion changes validation and capacity |
| Project/order/equipment numbering | No Tracking / rejected for this DEV | Separate product scope |
| More visible category codes | No Tracking / rejected for this DEV | Keep identifier compact and metadata-driven |
| Retiring v1/v2 read paths | No Tracking now | Historical records remain readable |

Next condition:

- Monitor APP validation feedback. Do not execute production/Supabase action, provider pointer change, direct data repair/deletion outside the scripted local cutover boundary, allowed-letter-set change such as excluding `I/O/Q`, release artifacts or project/order/equipment numbering without explicit authorization.

### DEV-PDM-NUMBERING-SEQUENCE-CAPA-001 QC 隔離、流水號完整性與本機修復

Status: Implemented / Verification passed locally for Phase 1-3; Phase 4 production/Supabase remains blocked human re-entry
Priority: P0 - controlled numbering sequences affect master-data trust, audit evidence and user confidence
Type: Development objective / CAPA PA tooling control
Parent: `DEV-PDM-NUMBERING-002`
Authorized phase: Phase 1-2 local implementation and verification completed after the user's 2026-07-07 `完成此開發任務` instruction. Phase 3 local data repair was later authorized by the user's decision that only records currently visible in the drawing-number module UI are formal data and all other local numbering pollution is test data. Production/Supabase action, visible formal-number renumbering, release artifacts and any further direct repair/deletion remain not authorized.

Human decisions and assumptions:

- User identified that new numbering no longer appears to receive serials in expected order.
- User requested CAPA, then `#效用理論` optimization, then a development document.
- User later confirmed the current drawing-number module UI records are the formal local evidence set; retained formal roots are `00007`, `00014`, `00056`, `00057`, `00058`.
- User later challenged the `max + 1` assumption: earlier empty roots should be reused unless they have entered formal control and were voided/obsoleted. This corrected the policy from monotonic high-water allocation to lowest-available controlled-master allocation.
- Existing compact v2 identity remains unchanged: root `00001`, part `00001-P01`, drawing `00001-M01` or `00001-R01`.
- `00056-M01` is valid as the first manufacturing drawing under root `00056`; the CAPA target is the root sequence jump to `00056`.
- `00057-M01` and `00058-M01` are treated as formal because they are visible in the drawing-number module UI.
- AI assumption after repair: future direct mutation of `data/ai-pdm.sqlite` still requires explicit authorization and a backup.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`
- `.ai-doc/qa/qa-pdm-numbering-sequence-capa-validation-plan-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`
- `.ai-doc/qc/qc-pdm-numbering-sequence-repair-report-2026-07-07.md`
- Existing authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
- Existing ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`

Scope:

- Prevent allocating numbering QC from using shared runtime `data/ai-pdm.sqlite`.
- Add read-only sequence integrity detection for `numbering_sequences`, root/part/drawing master rows and audit evidence.
- Harden SQLite numbering create transaction boundary so root, part, optional drawing and sequence cursor commit or roll back together.
- Provide local data repair dry-run/apply with required backup and explicit apply phrase.
- Apply the authorized local repair: keep the drawing-module visible formal records, purge test sequence/audit pollution, and reset the root sequence cursor to the next formal value.
- Add duplicate-submit prevention so repeated same-form create attempts do not consume another root number.
- Correct V2 root allocation to reuse the lowest number not present in controlled master rows. Existing master rows, including `Draft`, `Active`, `Released` and `Obsolete`, remain occupied and cannot be reused without a separate void/reuse policy.

Out of scope:

- Further direct reset, reuse, backfill, voiding, deletion or mutation of `data/ai-pdm.sqlite` outside the documented Phase 3 repair.
- Production/Supabase live cutover, migration, provider pointer switch, merge, PR, deploy, rollback or production smoke artifacts.
- Renumbering or rewriting existing visible formal roots/drawings.
- Project/order/equipment numbering, extra visible category codes or v2 identity policy changes.
- Retiring v1 read/search compatibility.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - CAPA development document | Complete | Capture root cause, utility-ranked CAPA, spec, QA plan and PM entries | Authorized documentation only |
| Phase 1 - QC isolation and sequence integrity gate | Implemented / Verification passed locally | Block allocating QC against runtime DB and add read-only integrity verifier | Authorized by `完成此開發任務`; no runtime DB mutation |
| Phase 2 - SQLite transaction hardening | Implemented / Verification passed locally | Make create root/part/drawing allocation atomic in SQLite | Authorized by `完成此開發任務`; no sequence reset or data repair |
| Phase 3 - Local data repair, duplicate-submit PA and gap-aware reuse | Implemented / Verification passed locally | Backup, keep visible formal roots, purge local test sequence pollution, prevent same-form duplicate create, and allocate the lowest non-controlled root gap instead of `max + 1` | Authorized by user `只有目前在圖號模組UI上看到的是正式資料, 其他都是測試資料, 請執行`; gap policy corrected after user critical review |
| Phase 4 - Production/Supabase rollout | RD Contract Ready / Release Authorization Required | Evaluate equivalent controls on live target | Requires deployment-release gate |

Acceptance completed for Phase 1-3:

- Allocating numbering QC cannot consume the shared runtime sequence without passing the protected-runtime guard.
- Sequence integrity drift is detectable by a read-only gate with contaminated-fixture, clean-fixture and runtime report-only modes.
- SQLite numbering create uses the async provider transaction boundary, and failure-injection QC proves rollback prevents silent sequence/master drift.
- Local repair backed up `data/ai-pdm.sqlite`, retained formal roots `00007`, `00014`, `00056`, `00057`, `00058`, purged 53 test root create-audit rows, deleted 125 obsolete/test sequence keys, and set `company-jenfu:part_root:v2.next_value` to `59`.
- Post-repair integrity is clean: retained roots 5, audit-created roots 5, purged test roots 53, missing audit roots from master 0, retained roots missing audit 0, expected codes missing master/audit 0.
- UI duplicate submit is blocked while create is in flight and after success until `新申請`.
- Server duplicate submit guard returns the existing same company/user/payload bundle within a 60-second replay window before allocating a new root.
- Gap-aware root allocation is now the controlling create policy: current runtime occupied roots are `00007`, `00014`, `00056`, `00057`, `00058`, `00059`, and the computed lowest available root is `00001`.
- Existing compact v2 numbering core regression remains green.

Verification evidence:

- `npm run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm run qc:pdm-numbering-sequence-integrity`: passed 3/3.
- `npm run qc:pdm-numbering-sequence-transaction`: passed 4/4.
- `npm run qc:pdm-numbering-duplicate-submit-guard`: passed 10/10.
- `npm run qc:pdm-numbering-gap-reuse`: passed 8/8; runtime evidence reports lowest available root `00001` while cursor evidence still shows earlier `60`.
- `node scripts/pdm-numbering-sequence-repair-runtime.mjs --apply --i-understand-local-runtime-data-repair`: applied; backup `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm run qc:pdm-numbering-core`: passed 241/241.
- `git diff --check`: passed with line-ending warnings only.
- `npm run build`: blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000 with PID 35812; no bypass was used.
- Runtime post-repair result: `clean=true`, `nextValue=59`, `retainedRoots=5`, `auditCreatedRoots=5`, `purgedTestRoots=53`, `missingAuditRootsFromMaster=0`.

Stop conditions:

- Any further step would mutate `data/ai-pdm.sqlite` outside the authorized repair script, a fresh backup and explicit human authorization.
- Any step requires visible formal-root renumbering, reuse, backfill, void marker creation, deletion or audit rewrite beyond the captured repair audit.
- Any step requires production/Supabase live target, schema migration, provider pointer switch or release action.
- Any step changes formal numbering identity policy.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Allocating QC isolation | Same Spec Phase 1 / Implemented locally | Required PA completed by guarded allocating QC scripts |
| Sequence integrity verifier | Same Spec Phase 1 / Implemented locally | Required gate implemented as read-only detector with runtime report-only mode |
| SQLite transaction hardening | Same Spec Phase 2 / Implemented locally | Required CA completed for SQLite `createNumberingRecord` transaction boundary |
| Local sequence/data repair | Same Spec Phase 3 / Implemented locally | User classified visible drawing-module records as formal and all others as test data; repair applied with backup |
| Duplicate submit prevention | Same Spec Phase 3 / Implemented locally | Prevents same-form repeated create from consuming extra root values |
| Gap-aware root reuse | Same Spec Phase 3 / Implemented locally | User corrected policy: untracked/test gaps should be reused before higher numbers; controlled/voided master rows remain occupied |
| Production/Supabase equivalent control | Blocked Human Re-entry / Release Authorization Required | Requires release gate |
| UI suffix wording polish | Same Spec Phase 1 or later P2 polish | Lower utility than allocator containment; may be included if touched |
| Project/order/equipment numbering | No Tracking / rejected for this CAPA | Separate product scope |
| Extra visible category codes | No Tracking / rejected for this CAPA | Existing identity decision remains `P/M/R` |

Next condition:

- Monitor APP validation feedback and keep the new QC gates in future numbering regressions. Next normal local root should be the lowest root absent from controlled master rows; current runtime evidence says `00001`. Continuation commands must not treat Phase 3 local repair as Phase 4 production/Supabase release approval, and must not renumber or delete visible formal records such as `00059` without a separate explicit decision.

### DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001 Windows SolidWorks 原檔預覽衍生檔

Status: Implemented / Verification passed locally for Phase 1
Priority: P1 - removes the current `預覽待產生` gap for native SolidWorks attachments after secret setup
Type: Delivery point
Parent: `DEV-PDM-SETTINGS-CENTER-001`; `DEV-CAD-001`; `DEV-PDM-SHARED-3D-MA-BASELINE-001`; current master attachment preview board
Authorized phase: local non-production Phase 1 implementation is complete and verified. Real Windows Shell worker evidence is captured for `.SLDPRT`; a SolidWorks Document Manager SLDDRW PNG worker/exporter is implemented and compile-verified, but real SLDDRW success still requires a worker-readable active key. Full native preview readiness still requires Document Manager/eDrawings/equivalent success evidence for `.SLDDRW` and `.SLDASM`.

Human decisions:

- User wants SolidWorks native files to show previews similar to Windows File Explorer.
- First value slice is `.SLDPRT / .SLDASM / .SLDDRW -> PNG`.
- Second value slice is `.SLDDRW -> PDF`.
- API key input in `/settings` is a prerequisite only; it does not generate previews by itself.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
- `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`
- `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`

Scope:

- Add preview job and file derivative metadata for native CAD preview generation.
- Add worker claim/complete contract for a trusted Windows preview worker.
- Generate PNG/PDF derivatives as browser-readable artifacts tied to source file hash.
- Update current 3D/2D preview cards to prefer ready derivatives before raw source fallback.
- Show queued/running/ready/failed/stale/skipped states with Traditional Chinese next-action copy.
- Use existing settings secret lifecycle for SolidWorks Document Manager/equivalent credentials without exposing plaintext.
- Validate local PDM pipeline with a fake worker and a real Windows worker smoke before claiming any native preview readiness.

Out of scope:

- Full Windows Document Manager/eDrawings/equivalent worker readiness proof for `.SLDASM`, successful `.SLDDRW` output with a real worker-readable key, and drawing PDF.
- Production deploy, production migration/cutover, direct data repair or data deletion.
- Browser-side parsing of `.SLDPRT`, `.SLDASM` or `.SLDDRW`.
- Calling Windows Explorer shell thumbnail handlers from browser or Next.js request handlers; Shell use is allowed only inside the isolated worker.
- Running SolidWorks/eDrawings/COM/Document Manager synchronously inside Next.js request handlers.
- Interactive 3D viewer, STEP/glTF conversion or measurement features.
- Making preview generation failure a release blocker in Phase 1.
- Replacing source CAD, drawing package source, shared 3D source or manufacturing baseline evidence with preview derivatives.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture SPEC, ADR, QA, dev_task and documentation_map entry | Authorized by user request to write development documents |
| Phase 1 - Native PNG preview vertical slice | Implemented locally / Partial real worker evidence | Queue, derivative metadata, fake worker QC, UI integration, real Windows worker smoke for `.SLDPRT`, and Document Manager SLDDRW PNG worker path; `.SLDDRW` blank Shell output and missing worker-readable key both fail cleanly | Local PDM pipeline implemented; full native readiness requires worker-readable key plus Document Manager/eDrawings/equivalent sample-file success evidence |
| Phase 2 - Drawing PDF preview | RD Contract Ready / Not Authorized | `.SLDDRW -> PDF` through eDrawings/SOLIDWORKS/equivalent controlled worker | Requires renderer/licensing/timeout approval |
| Phase 3 - Interactive 3D derivative | RD Contract Ready / Not Authorized | Evaluate STEP/glTF/web viewer derivative | Requires architecture/security/performance decision |
| Phase 4 - Production rollout | Release Gate Contract Ready / Not Authorized | Worker deployment, storage retention, backfill, production smoke and rollback | Requires deployment-release gate |

Phase 1 acceptance:

- Native SW attachment can enqueue or auto-create an idempotent preview job.
- Fake local worker can generate deterministic PNG derivatives for automated local QC.
- Real Windows worker can generate PNG previews for supported sample files and must fail/skip blank or unsupported outputs without displaying misleading images.
- Preview card displays generated PNG instead of `預覽待產生` when a current-hash derivative exists.
- Failed/skipped preview states show reason and retry/settings recovery path without raw stack traces or command lines.
- Source hash mismatch prevents stale derivative display.
- Existing PDF/image/Drive preview behavior keeps working.
- No SolidWorks API/license key material appears in jobs, logs, API responses, screenshots or report JSON.

Stop conditions:

- RD needs production deploy, migration, direct data repair or data deletion.
- RD needs browser/frontend access to SolidWorks API/license key material.
- RD needs to store plaintext keys in preview jobs, worker output, logs or reports.
- RD needs to call native CAD tooling synchronously from a Next.js API route.
- Worker cannot authenticate as a trusted service identity or cannot tie output to source hash.
- Real native preview proof is required but no Windows host/sample files/component are available.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:master-attachments`
- new focused `qc:pdm-sw-native-preview-worker`
- new focused `qc:pdm-sw-native-preview-redaction`
- settings secret boundary regression
- browser smoke for ready PNG derivative and failed/skipped state
- real Windows worker smoke before claiming real native preview readiness

Evidence captured on 2026-07-06:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-sw-native-preview-worker`: passed 90/90.
- `npm.cmd run qc:pdm-sw-native-preview-redaction`: passed 68/68.
- `npm.cmd run qc:master-attachments`: passed 101/101.
- `npm.cmd run qc:pdm-settings-center-secret-lifecycle`: passed 22/22.
- `npm.cmd run qc:supabase-secret-boundary`: passed 15/15.
- `npm.cmd run qc:db-provider-contract`: passed 35/35.
- `npm.cmd run qc:db-provider-postgres`: passed 9/9.
- `npm.cmd run qc:pdm-shared-3d-ma-baseline`: passed 20/20.
- `npm.cmd run dev:local:check`: passed.
- API worker smoke: `D-0007-MA1.SLDPRT` job `53749eb7-9aa1-4902-b6cc-a4fc2035f814` succeeded through `qc-windows-shell-worker`; derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640` is `image/png`, `768x576`, generator `windows-shell-ishellitemimagefactory-v1`.
- API worker smoke: `D-0007-MA1.SLDDRW` job `f921e930-2cec-441c-a8dd-4a06a6f71c6d` first failed cleanly because this workstation's Shell provider returned blank/low-information output, then was claimed by the Document Manager worker and failed cleanly with `solidworks_document_manager_preview_failed` because the active UI secret is `local_test_double` metadata and no worker-readable key is available.
- Worker compile smoke: `node scripts/run-solidworks-document-manager-preview-worker.mjs --compile-only` produced `.tmp/solidworks-document-manager-preview/SolidWorksDocumentManagerPreviewExporter.exe`.
- Browser smoke: demo Admin opened `D-0007-MA1`; screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png` shows the real 3D preview and the compact 2D failed/retry state without fake preview display or clipped long error text.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented locally | Local PDM pipeline implemented with fake-worker proof and Windows Shell `.SLDPRT` proof |
| Full Windows Document Manager/eDrawings/equivalent evidence | Blocked Human Re-entry / external evidence | Requires worker-readable active credential and successful `.SLDASM` / `.SLDDRW` sample-file evidence |
| Drawing PDF generation | Same Spec Phase 2 / Not Authorized | Requires renderer/tooling approval |
| Interactive 3D viewer | Same Spec Phase 3 / Not Authorized | Requires separate architecture/security/performance review |
| Production rollout/backfill | Same Spec Phase 4 / Not Authorized | Requires release gate, storage policy and rollback |
| Release blocking on preview failure | Blocked Human Re-entry | Current product assumption keeps preview non-blocking |
| Windows Explorer shell handler direct integration | No Tracking / rejected | Rejected for web/PDM backend safety |

Next condition:

- Continue only after worker-readable Document Manager key is available through Supabase Vault live secret read or worker-local environment variable, or after explicit user/PM authorization for eDrawings drawing worker, Phase 2 `.SLDDRW -> PDF`, production rollout, or historical preview backfill.
- Do not treat this Phase 1 implementation as permission for production migration, production deployment, direct data repair/deletion, or using preview failure as a release blocker.

### DEV-PDM-SETTINGS-CENTER-001 系統設定中心與 Secret 生命週期治理

Status: Implemented / Verification passed locally
Priority: P0 - secret governance and settings activation must be safe before SolidWorks/API keys are managed from UI
Type: Delivery point
Parent: `DEV-CAD-001`; `DEV-SUPABASE-DB-001`; current `/settings`
Authorized phase: local non-production Phase 1 implementation authorized by the user on 2026-07-06. Supabase Vault live writes, production deploy/cutover, direct data repair/deletion and external-cost actions remain not authorized. Local evidence uses an approved test-double/live-gate boundary.

Human decisions:

- `1C`: `/settings` becomes a settings center, not one growing page.
- `2C`: API/license keys can be entered through UI, but backend stores them securely and UI returns only masked status.
- `3B`: low-risk settings can apply immediately; high-risk settings require test before Admin activation.
- `1B`: first version has five settings areas.
- `2B`: secret management is generic, not SolidWorks-only.
- `3B`: high-risk activation is done by Admin after test success.
- `1C amended`: Supabase Vault stores secret material; Supabase DB stores metadata only; Google Workspace handles Drive/account source only.
- `2B`: Admin can change settings; Manager/Reviewer may see selected redacted status only.
- `3B`: non-secret settings can version/rollback; secrets can rotate/revoke but not restore old plaintext.
- `1A`: PDM Next.js backend APIs operate Supabase Vault.
- `2B`: secret metadata lifecycle is `draft -> tested -> active -> retired / revoked`.
- `3B`: Google Workspace is account source, while PDM owns PDM roles/approval.
- `1A`: settings subpages are organized by management task.
- `2B`: use dedicated metadata tables instead of extending `system_settings`.
- `3B`: high-risk UI flow is `save draft -> test -> Admin activate`.
- `1C`: `/settings` overview is a work queue for current settings tasks.
- `2B`: first integration scope is SolidWorks, Google Workspace/Drive, Supabase, LLM/OpenAI and release/backup.
- `3B`: test evidence stores summary/error/actor/time/version/artifact path, not sensitive request/response payloads.
- `1B`: settings visibility is classified by setting type.
- `2B`: high-risk settings are secrets, Google Drive directories, Supabase connection, release/backup and permission matrix.
- `3C`: first implementation order is a SolidWorks secret vertical slice.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
- `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`
- `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`

Scope:

- Convert `/settings` into a settings center with overview/work queue and five management areas:
  `/settings`, `/settings/integrations`, `/settings/security`, `/settings/workflow`, `/settings/system`.
- Add generic secret metadata lifecycle backed by Supabase Vault for secret material and Supabase DB metadata only.
- Add server-only APIs for secret draft, test, activation, revoke and redacted status.
- Add high-risk setting draft/test/Admin activation flow.
- Add role-based redacted visibility for Admin, Manager and Reviewer.
- Add SolidWorks secret lifecycle as the first vertical slice.
- Preserve current Google Drive settings until deliberately migrated.

Out of scope:

- Production deploy, production migration/cutover or direct production data repair.
- Direct data deletion.
- Supabase Vault live write/smoke until a disposable/staging target is approved.
- Real SolidWorks Document Manager / CAD-reader proof; that remains under `DEV-CAD-001`.
- Plaintext secret storage in DB, log, audit, report, screenshot or browser response.
- Frontend/browser/Data API access to Supabase Vault.
- Google Workspace direct authority over PDM roles/approval.
- Two-person activation approval in first version.
- ERP/procurement connector settings.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Architecture and long task | Complete | Capture HCS decisions, spec, ADR, QA and dev_task entry | Authorized by `要寫成長任務` |
| Phase 1 - SolidWorks secret vertical slice | Implemented / Verification passed locally | Prove UI input -> test-double Vault boundary -> metadata -> probe/test -> Admin activation -> audit -> work queue | Supabase Vault live evidence remains gated |
| Phase 2 - Settings center IA shell | Implemented / Compatibility shell passed locally | Add five management-area routes while preserving current Google Drive flow | Dedicated per-area pages may be deepened later |
| Phase 3 - Google Workspace/Drive migration | RD Contract Ready / Not Authorized | Move Drive folders/account-source status into lifecycle model | Requires Google credential boundary confirmation |
| Phase 4 - Supabase/LLM/release/backup settings | RD Contract Ready / Not Authorized | Generalize provider lifecycle and redacted evidence | Requires provider/cost/credential approval |
| Phase 5 - Workflow/permission matrix lifecycle | RD Contract Ready / Not Authorized | Apply draft/test/Admin activation to workflow settings | Requires workflow activation authorization |
| Phase 6 - Production release/cutover | RD Contract Ready / Not Authorized | Migrations, advisors, release gate and rollback | Requires deployment-release approval |

Phase 1 acceptance:

- Admin can create a draft SolidWorks secret and cannot read it back as plaintext.
- Backend stores no secret plaintext in PDM DB/log/audit/browser response. Local test-double evidence stores metadata only; Supabase Vault live write remains a production-readiness blocker.
- Test run stores result summary, redacted error, actor, time, version and artifact path only.
- Only `tested` versions can be activated.
- Activating a version retires prior active version.
- Revoked/retired versions cannot be used by runtime/probe.
- `/settings` overview shows missing/draft/test-failed/tested/active states with the correct next action.
- Non-Admin mutation routes are rejected.

Stop conditions:

- RD needs production deploy, production migration/cutover, direct data repair or data deletion.
- RD needs plaintext secret storage outside Supabase Vault.
- RD needs browser, publishable key, anon key or Supabase Data API role to access Vault.
- Supabase Vault live target is required but unavailable and no test double boundary is authorized.
- Probe evidence cannot be redacted without losing QA signal.
- Implementation would let Google Workspace group membership directly control PDM roles or approval authority.

Evidence required:

- Passed locally: `npx.cmd tsc --noEmit --pretty false`
- Passed locally: `npm.cmd run lint -- --quiet`
- Passed locally: `npm.cmd run qc:pdm-settings-center-secret-lifecycle`
- Passed locally: `npm.cmd run qc:supabase-secret-boundary`
- Passed locally: `npm.cmd run qc:gdrive-folder-tree-settings`
- Passed locally for added metadata schema: `npm.cmd run qc:db-provider-contract`, `npm.cmd run qc:db-provider-postgres`, `npm.cmd run qc:supabase-current-change-impact`
- Supabase Vault live evidence remains an explicit test-double/live-gate blocker.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Same Spec Phase 1-5 / Not Authorized | Captured in phase roadmap |
| Production release/cutover | Same Spec Phase 6 / Not Authorized | Requires deployment-release gate |
| Supabase Vault live target | Blocked Human Re-entry before production | Local test-double is implemented; live Vault target/smoke is still required before production readiness |
| Two-person activation approval | No Tracking in first version | User selected Admin activation |
| ERP/procurement settings | No Tracking in first version | Excluded from first integration scope |
| Google group direct role mapping | No Tracking / rejected | User selected PDM as role authority |
| Existing settings migration | Same Spec Phase 2-3 | Current flow remains compatible until migrated |
| Secret rollback to old plaintext | No Tracking / rejected | Secrets are rotate/revoke only |

### DEV-PDM-SHARED-3D-MA-BASELINE-001 共用 3D 主檔與 MA 製造基準包

Status: Implemented / Verification passed locally
Priority: P0 - formal manufacturing traceability across shared 3D and multiple MA drawings
Type: Delivery point
Parent: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
Authorized phase: local non-production implementation authorized by the user on 2026-07-06. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes and production cutover remain not authorized.

Human decisions:

- `1B`: shared 3D master data belongs at the part/root level.
- `2B`: part/root manufacturing baseline freezes the effective manufacturing set; it does not replace dynamic part-number/root search.
- `3B`: MA drawing release normally requires shared 3D link; pure 2D marking/annotation changes may use a reviewed `2D-only / no 3D impact` exception.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`
- `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`
- `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`

Scope:

- Implemented part/root-level shared 3D model ownership and hash reuse guidance.
- Implemented MA drawing revision package model-basis API for shared model version or reviewed 2D-only exception.
- Implemented manufacturing baseline object that freezes shared 3D model hash/version and selected MA drawing revision packages.
- Implemented baseline required-MA resolver so users cannot silently omit required MA drawings at release.
- Implemented model hash/revision conflict policy, approval action codes and additive schema.
- Implemented part detail UI slice for shared 3D creation, MA package binding / 2D-only exception and baseline draft/release.
- Implemented impact service for released baselines that reference a shared model.

Out of scope:

- Production deploy/migration, direct data repair/deletion, CAD/OCR extraction dependency, forced part/BOM revision, replacing drawing revision packages, replacing part/root search, or using one MA drawing as the shared 3D owner.

Acceptance:

- Part/root can own a shared 3D model version with stable id and content hash.
- MA package release blocks missing model link unless reviewed 2D-only exception exists.
- Manufacturing baseline release freezes exact shared 3D and MA package ids.
- Released baseline cannot be edited in place.
- Dynamic part/root search and frozen baseline evidence are clearly distinct.

Stop conditions:

- RD needs production deploy, production migration, direct DB mutation, historical repair or data deletion.
- RD must change FFF, BOM, part-number identity or drawing-number identity rules.
- RD cannot model shared 3D at part/root level without making one MA drawing the owner.
- Baseline release would mutate existing released MA packages.

Evidence:

- Passed locally: `npx.cmd tsc --noEmit --pretty false`
- Passed locally: `npm.cmd run lint -- --quiet`
- Passed locally: `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20, including schema/service/API/UI/release-workflow static gates and SQLite immutable baseline semantics.
- Passed locally: `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59.
- Passed locally: `npm.cmd run qc:pdm-change-control` 61/61.
- Passed locally for added schema/runtime boundary: `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9, `npm.cmd run qc:supabase-current-change-impact` 15/15.
- Browser smoke passed on `http://localhost:3000/parts`: first part drawer shows `共用 3D / MA 製造基準`, no console/http error, no horizontal overflow; screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`.

### DEV-PDM-NEXT-STEP-UX-001 全系統可行動狀態提示與下一步 UX

Status: Implemented / verification passed locally for Phase 1
Priority: P0 - user-facing blockers and empty/error states must answer the operational question, not only report system state
Type: Delivery point / UX quality gate
Parent: `DEV-PDM-STATUS-UX-001`; `SPEC-UX-RD-LIFECYCLE-001`; `SPEC-UX-PLATFORM-001`
Authorized phase: Phase 1 local UI implementation was authorized by the user's `執行開發` instruction and is complete. Phase 2 scanner/checklist hardening and Phase 3 production release are not authorized.

Human Decision Brief:

- User-facing states must answer `那我現在要幹嘛`.
- The correct answer may be `不用處理`, but it must be explicit.
- Main UI prompts must not lead with raw backend code, SQL, HTTP status, enum names, internal IDs or audit payloads.
- High-risk states must show the responsible role and a recovery path.
- Technical detail belongs in secondary details/debug/audit, not the primary user-facing answer.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
- Existing status vocabulary authority: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
- Existing lifecycle UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`
- Existing platform routing context: `.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md`

Current QA inventory:

- Good pattern: `src/app/upload/page.tsx` formal same-revision blocker now answers `這版已完成，不用再送審`, with `回圖號模組`, `建立新版次`, `查看正式紀錄`.
- Good pattern: `src/app/bom/reviews/page.tsx`, `src/app/handoff/page.tsx`, and `src/app/numbering/tasks/page.tsx` already use `NextStepState` for some empty states.
- Gap: `src/components/dashboard.tsx` repeats raw/generic `alert(body.error ?? "...失敗")` patterns across many action handlers.
- Gap: `src/lib/status-display.ts`, `src/components/next-step-state.tsx`, and `src/components/lifecycle-ux.tsx` can still hide or omit the direct next step.
- Gap: `src/app/numbering/revisions/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/handoff/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/components/master-attachment-panel.tsx`, `src/app/numbering/part-drafts/page.tsx`, and `src/app/numbering/reports/page.tsx` have blocker/empty/error/disabled states that need action-first wording.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Documentation | Complete | Capture QA inventory, spec, phase plan and deferred scope | Authorized by `寫成開發文件` |
| Phase 1 - Product UI implementation | Implemented / Verification passed locally | Fix selected blockers, empty states, disabled states and failure states so they answer `現在要做什麼` | Authorized by `執行開發`; local implementation complete |
| Phase 2 - Regression scanner and new-module checklist | RD Contract Ready / Not Authorized | Add QC guard and checklist so new UI states do not regress | Requires separate authorization |
| Phase 3 - Production release gate | RD Contract Ready / Not Authorized | Deploy only after implementation and scanner evidence pass | Requires release/deploy approval |

Phase 1 acceptance:

- Every changed blocker/empty/error/disabled state answers `現在要做什麼`.
- Terminal states explicitly say `不用處理` when no user action is required.
- Recoverable states show a CTA or responsible-role instruction in the main visible area.
- Normal UI main copy does not expose raw backend code, SQL/constraint text, HTTP status or internal enum.
- Desktop and mobile evidence shows no hidden CTA, overlap, clipping or unreadable text.

Stop conditions:

- RD needs DB/API/permission/state-machine changes.
- RD needs production deploy, migration, direct data repair or historical cleanup.
- A state cannot be mapped safely without a human product decision.
- A required UI fix expands into full platform navigation redesign.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product RD implementation | Same Spec Phase 1 / Completed locally | Authorized by `執行開發` and implemented locally on 2026-07-04 |
| Regression scanner hardening | Same Spec Phase 2 / Not Authorized | Should follow or accompany implementation once authorized |
| Production deploy/release | New DEV or release gate / Not Authorized | Requires deployment approval and release evidence |
| DB/API/permission/state-machine changes | Blocked Human Re-entry | Higher-risk product decision outside UI copy contract |
| Admin/debug/audit raw payload full localization | No Tracking in this DEV | Normal user UI is the target; debug/admin payload localization is separate |
| Full platform navigation redesign | No Tracking in this DEV | Covered by `SPEC-UX-PLATFORM-001`; this DEV is state guidance only |

RD / QA / QC result:

- Phase 1 local UI implementation is complete.
- Product code changes stayed in UI presentation, wording, shared UI helpers and focused QC script maintenance.
- No DB/API/permission/state-machine, production deploy, direct data repair or historical cleanup was performed.
- Verification passed: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44; `npm.cmd run qc:pdm-numbering-search-ui` 28/28; `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24; `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22; `npm.cmd run qc:master-attachments` 93/93; `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14; `npm.cmd run dev:local:check`.
- `npm.cmd run build` was blocked by the intentional local dev guard because AI_PDM was listening on port 3000; no bypass was used.
- Do not start Phase 2 scanner/checklist or Phase 3 production release without explicit authorization.

### DEV-PDM-STATUS-UX-001 全系統狀態中文化與狀態欄說明

Status: Implemented / Verification passed locally
Priority: P0 - status wording is a cross-system usability and workflow-safety defect
Type: Delivery point
Parent: `DEV-PDM-LIFECYCLE-ACTIONS-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
Authorized phase: Phase 1 local RD implementation and verification are complete. Remaining Phase 2 hardening is RD Contract Ready / Not Authorized. Production deploy, DB enum/schema rename, production migration, historical data repair and audit payload migration are not authorized.

Human Decision Brief:

- UI layer must show status in user-understandable Traditional Chinese only.
- Backend raw status codes may remain in DB/API/audit/debug, but normal UI must not expose them.
- `Released` object status is displayed as `已發布` in normal UI.
- Every user-visible table with a status column must place a unified `?` help button in the status column header.
- The `?` opens a status explanation popover; `ESC` and outside click close it.
- The `?` button must not trigger sorting, filtering, row selection or navigation.

Required docs:

- `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
- Existing vocabulary authority: `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
- Existing object status UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`

Scope:

- Add a central UI status dictionary for raw-status-to-Chinese mapping, help text, severity, terminal/actionability metadata and context separation.
- Replace visible status badges, table cells, filters and error messages in normal user UI with dictionary-backed Chinese labels.
- Add a reusable `StatusHelpPopover` / `StatusColumnHeader` or equivalent component.
- Add a status help button to every user-visible table status column.
- Provide focused QC coverage for raw enum exposure, status-column help coverage and popover behavior.

Out of scope:

- DB enum/schema rename.
- Production deploy or production migration.
- Historical data repair.
- Audit payload migration.
- Rewriting the backend lifecycle state machine.
- Full admin/debug raw payload localization.

Implementation contract:

- Suggested new files: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`.
- UI components must call the central status dictionary instead of local `statusLabels` maps or raw `{status}` rendering.
- Select option values may remain raw status codes for API compatibility, but option labels must be Chinese.
- Unknown raw statuses must show `未分類狀態` or `異常`, not the raw enum.
- Status help content must come from the same dictionary as visible labels.
- Popover behavior must support click open, `ESC` close, outside click close, focus return and mobile viewport safety.

Phase 1 acceptance:

- Normal UI no longer shows raw `Draft`, `PendingReview`, `Released`, `Obsolete`, `MainDrawingInvalid`, `ReleaseFailed`, `duplicate_active_submission`, `drawing_number_not_found` or SQL constraint messages.
- Status filters show Chinese labels.
- Every user-visible table with a `狀態` column has a `?` help button in the header.
- The help popover opens, shows Chinese status explanations, closes by `ESC`, closes by outside click, returns focus and does not trigger table actions.
- Desktop and mobile routes remain readable without overlap, clipping or horizontal overflow.

Phase 1 likely implementation surfaces:

- `src/components/lifecycle-ux.tsx`
- `src/components/dashboard.tsx`
- `src/app/numbering/drawings/page.tsx`
- `src/app/numbering/search/page.tsx`
- `src/app/parts/page.tsx`
- `src/app/submissions/[id]/page.tsx`
- `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`
- `src/app/upload/page.tsx`
- `src/app/bom/workbench/page.tsx`
- `src/app/numbering/tasks/page.tsx`
- `src/app/numbering/revisions/page.tsx`

Stop conditions:

- RD needs DB enum/schema migration.
- RD needs production deploy or production data repair.
- A raw status cannot be safely assigned to a user-facing context without changing workflow semantics.
- Existing table component architecture cannot safely accept a header button without a broader UI refactor.

Verification evidence:

- `npm run qc:pdm-status-ui-vocabulary` passed 44/44.
- `npx tsc --noEmit --pretty false` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Browser UI evidence on `/settings` passed: status help opens, Chinese status copy renders, `ESC` closes, outside click closes.
- Screenshot: `output/playwright/status-ui/settings-status-help-open.png`.
- Local server health after build/restart: `npm run dev:local:check` passed and reports `http://127.0.0.1:3000/`.

Phase 2 / hardening:

- Status: RD Contract Ready / Not Authorized.
- Scope: static scanner or QC rule for raw status exposure and missing status help buttons; new-module checklist; optional admin/report/debug context mapping.
- Entry condition: Phase 1 implemented and verified, then explicit authorization.
- Acceptance: new status tables and raw status labels fail focused QC unless they use the central dictionary and status help header.

Deferred Scope Audit:

- DB enum/schema rename: No Tracking; not needed for UI clarity and would create compatibility risk.
- production deploy/migration: New DEV behind release gate if later requested.
- admin/debug/audit raw payload localization: Same Spec Phase 2 if user wants it.
- future module regression prevention: Same Spec Phase 2 through scanner/checklist.

Next condition:

- Monitor APP validation feedback for status wording and status-help coverage.
- Do not start remaining Phase 2 hardening, production work, DB enum/schema rename, audit payload migration or historical data repair without explicit authorization.

### DEV-PDM-STATUS-UX-002 狀態語意分層與狀態混用修正

Status: Implemented / Verification passed locally for Phase 1
Priority: P0 - status help can mislead users when one generic context explains different operational tasks
Type: Development objective / UX quality gate
Parent: `DEV-PDM-STATUS-UX-001`; `DEV-PDM-NEXT-STEP-UX-001`
Authorized phase: Phase 1 local UI implementation was authorized by the user's 2026-07-07 `執行開發` instruction and is complete. Phase 2 regression hardening is RD Contract Ready / Not Authorized.

Human Decision Brief:

- UI first-layer status help must answer the user's current task, not expose all internal enum values.
- `?` status help must explain only the statuses that can appear in that column.
- Backend raw status, DB enum, API payload and audit trail remain unchanged.
- Status contexts should be split by user task: task, import row, import batch, settings lifecycle, job status, restore policy and DVT readiness.
- Columns that mix master status, phase, cost and warning chips must be renamed or visually grouped; they must not imply all chips share one status meaning.

Required docs:

- `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`
- `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`
- Parent status vocabulary spec: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`

Scope:

- Add or adjust presentation contexts for `task`, `importRow`, `importBatch`, `settingsLifecycle`, `jobStatus`, `restorePolicy` and `dvtReadiness`.
- Fix high-risk status help misuse in `/numbering/tasks`, `/numbering/imports`, `/settings`, `/numbering/reports`, `/numbering/approvals`, `/numbering/dvt`, BOM deleted drafts and part drafts.
- Fix mixed-column labels in parts/drawings/search surfaces where a column currently mixes status, phase and warning chips.
- Update focused QC so context mismatch and irrelevant status help can be detected.

Out of scope:

- DB enum/schema rename.
- API raw status rename.
- production deploy or production migration.
- historical data repair.
- audit/debug raw payload full localization.
- backend lifecycle state machine changes.

Implementation contract:

- `task` must not alias the full `workflowStatuses` list.
- Report/export jobs must use `jobStatus`, not `fileSync`.
- Import staging row status must use `importRow`; import batch status must use `importBatch`.
- DVT readiness must be explained separately from master-record status.
- `StatusColumnHeader context="X"` and the primary status badge in the same column must use matching context unless the column label declares mixed content.
- `待補件` in approval status wording must be normalized to `待補資料`, except where the subject is an attachment supplement.

Acceptance:

- A user opening a status `?` on each affected page sees only task-relevant statuses.
- 發行審核 keeps the 5-item first-layer help: `審核中 / 待補資料 / 阻擋 / 已核准 / 已退回`.
- 報表 job help shows `等待中 / 執行中 / 已完成 / 失敗` and does not include import/file-sync-only language.
- 匯入列 help does not include approval workflow states.
- 設定版本 help does not include release approval wording.
- DVT page clearly distinguishes DVT readiness from master-record status.
- Mixed columns are labeled as `狀態 / 階段 / 提醒` or equivalent.

Stop conditions:

- RD needs DB/API/schema migration.
- RD needs to change workflow semantics for approval/release/master lifecycle.
- RD needs production deploy, production migration, historical repair or direct DB mutation.
- A page's column structure cannot be adjusted without broader redesign.

Verification evidence:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-status-ui-vocabulary`: passed 81/81, including context-specific status checks.
- Browser status-context check on local `http://127.0.0.1:3000`: passed 73/73 for `/numbering/tasks`, `/numbering/imports`, `/settings`, `/numbering/reports` and `/numbering/approvals`.
- Browser DVT status-context check with QC-owned temporary fixture: passed 11/11 for `/numbering/dvt`.
- Browser 390px task status popover sanity: passed 4/4.
- Screenshots written under `output/playwright/status-context-disambiguation/`.
- `npm.cmd run dev:local:check`: passed; local URL `http://127.0.0.1:3000/`.

Deferred Scope Audit:

- DB enum/schema rename: No Tracking; UI clarity does not require data-layer rename.
- production deploy/migration: New DEV behind release gate if requested.
- audit/debug raw payload localization: Same Spec Phase 2 or New DEV if user expands scope.
- historical data repair: Blocked Human Re-entry; requires explicit repair scope and authorization.
- regression scanner hardening: Same Spec Phase 2; not authorized.

Next condition:

- Monitor APP validation feedback.
- Do not start Phase 2 scanner hardening/checklist, DB/API/schema changes, production deploy, audit raw-payload localization or historical repair unless separately authorized.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002 圖面送審工作台與發行未完成恢復流程

Status: Implemented / Verification passed locally for Phase 1; Phase 2+ RD Contract Ready
Priority: P0 - same-revision dead-end and release-incomplete recovery blocks the drawing submission workflow
Type: Delivery point
Parent: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Amends: `DEV-PDM-SUBMISSION-CONFLICT-001`
Authorized phase: Phase 1 local RD implementation and verification are complete. Phase 2+ is documented for continuity but is not authorized for RD implementation. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion are not authorized.

Human decisions:

- 送審入口保留在圖號模組 / 圖料模組；送審工作台可獨立成頁。
- Phase 1 route target is `/drawings/[drawingNumber]/submission-workbench`; legacy `/upload?source=drawing...` may remain only for compatibility.
- Workbench uses drawing number as the primary object and carries root / primary part context.
- Phase 1 workbench shows `送審條件`, `既有紀錄 / 阻擋`, and `送審動作`.
- Same drawing + revision history is shown only when relevant; full history is deferred.
- Pending can be cancelled by submitter, R&D Manager or Admin and becomes `Cancelled`.
- ReleaseFailed means user-facing `發行未完成`, not a generic duplicate; unresolved ReleaseFailed blocks until manager/admin retry or return-for-correction.
- Resolved ReleaseFailed remains historically visible but no longer blocks and must not appear in main todo.
- All UI layer copy must be human-readable Traditional Chinese and must not expose internal codes.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
- Background: `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
- Background: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing ADR authority with this spec's amendment: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

Current local implementation and verification status:

- Implemented and covered by local verification gates:
  - `db/schema.sql`, `src/lib/db.ts`, `src/lib/types.ts` include `Cancelled` and release-recovery fields / indexes.
  - `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts` include Pending cancellation and release-resolution support.
  - `src/lib/repositories/submission-write-async-repository.ts` narrows same-revision duplicate checks to blocking statuses.
  - `src/lib/drawing-submission-workbench.ts` implements same-revision classification, same-revision history response fields and return-for-correction service logic.
  - `src/lib/submission-release-workflow.ts` exists as a shared release workflow wrapper.
  - `src/app/api/submissions/[id]/approve/route.ts` is partially refactored toward the shared release workflow.
  - `src/app/api/submissions/[id]/cancel/route.ts` exists for Pending cancellation.
  - `src/app/drawings/[drawingNumber]/submission-workbench/page.tsx` exists as the canonical drawing submission workbench page.
  - `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts` exists for the canonical workbench API.
  - `src/app/api/submissions/[id]/retry-release/route.ts` exists for R&D Manager/Admin release retry.
  - `src/app/api/submissions/[id]/return-for-correction/route.ts` exists for R&D Manager/Admin correction handoff.
  - `src/app/numbering/drawings/page.tsx` and `src/app/numbering/search/page.tsx` route submission CTAs to the canonical workbench.
  - `src/app/upload/page.tsx` is aligned to fetch the workbench API and show same-revision records/history.
  - `src/app/submissions/[id]/page.tsx` includes user-facing Chinese labels and actions for `發行未完成`, `取消送審`, `重新發行`, and `退回修正`.
  - dashboard, notification and adaptive-task feed query paths include resolved ReleaseFailed de-noising.
  - `src/lib/db-async-provider.ts`, `scripts/qc-db-provider-contract-test.mjs`, `scripts/qc-db-provider-postgres.mjs` and `src/lib/drawing-submission-workbench.ts` include a local transaction-boundary candidate so return-for-correction can create the linked Pending submission and mark the old ReleaseFailed returned-for-correction in one transaction.
  - `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs` and package script `qc:pdm-drawing-submission-workbench-mutation` are the disposable-fixture mutation lifecycle gate.
- Verified in this pass:
  - `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
  - `npm run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33 using temporary local fixture records; no existing D-0014/user records were mutated.
  - `npm run qc:db-provider-contract`: passed 35/35.
  - `npm run qc:db-provider-postgres`: passed 9/9, live Postgres probe skipped because `PDM_POSTGRES_URL` is not configured.
  - `npm run qc:pdm-submission-conflict-duplicate-active`: passed 14/14.
  - `npm run qc:pdm-drawing-part-workbench-security`: passed.
  - `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
  - `npx tsc --noEmit --pretty false`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - API smoke on local 3200: `GET /api/numbering/drawings/D-0014-MA1/submission-workbench` returned drawing `D-0014-MA1`, root `0014`, one `release_incomplete_conflict` blocker and recovery link `/submissions/SUB-20260701-2AEBA0CD`.
  - Browser smoke on local 3200 captured `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`: UI shows `D-0014-MA1` and `發行未完成`, not `D-0009-MA1`, `ReleaseFailed`, `duplicate_active_submission`, raw SQL or `Internal Server Error`.
  - Browser smoke on local 3200 captured `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`: submission detail `SUB-20260701-2AEBA0CD` loads, shows `D-0014-MA1` and `發行未完成`, and does not show `送審明細讀取失敗`.
- Remaining Phase 1 local gates:
  - None. Future work requires APP validation feedback or explicit Phase 2 authorization.

Scope:

- Add `/drawings/[drawingNumber]/submission-workbench`.
- Prefer the new workbench route from 圖號 / 圖料 module submission CTAs.
- Reclassify same-revision records into `same_revision_in_progress`, `release_incomplete_conflict`, `released_revision_exists`, `obsolete_revision_locked`, and non-blocking history.
- Add or support `Cancelled` status for pre-release cancellation.
- Add Pending cancel endpoint/action for submitter, R&D Manager and Admin.
- Add ReleaseFailed retry-release endpoint/action for R&D Manager and Admin.
- Add ReleaseFailed return-for-correction endpoint/action that creates a linked new working submission.
- Add resolution relation so a successful linked release resolves the old ReleaseFailed and removes it from blockers/todo.
- Add focused QC commands for Phase 1 non-mutating behavior and disposable mutation lifecycle behavior.

Out of scope:

- Master-data completion/writeback in the workbench.
- Attachment upload/writeback in the workbench.
- Collaborative editing.
- Full dashboard/todo refactor beyond excluding resolved ReleaseFailed where touched by Phase 1.
- Full drawing submission history page.
- Production deploy or production migration.
- Direct DB cleanup, historical data repair or data deletion.

Phase 2+ RD handoff contract:

- Phase 2 purpose: allow users to finish submission-required master data and drawing attachments in the workbench while preserving owner-domain APIs and immutable submission snapshots.
- Phase 2 scope: primary part relation, part name, material, surface finish, optional existing owner-supported process/product/variant fields, drawing attachment upload, writeback summary, save-and-submit ordering, stale-version protection and Chinese visible errors.
- Phase 2 boundary: not executable until Phase 1 is implemented/verified and user or PM authorizes Phase 2. It must not create a second master-data source, must not patch Released/Obsolete records inline, and must not require production storage migration.
- Phase 3 purpose: support多人協作完成圖料送審準備 and reduce dashboard/todo noise.
- Phase 3 scope: collaboration toggle, invited same-company collaborators, owner-domain permission checks per field, operational edit history, automatic collaboration close on submission/cancel/manager close, resolved ReleaseFailed hidden from main todo but visible in low-weight history.
- Phase 3 boundary: not executable until Phase 2 is implemented/verified and user or PM authorizes Phase 3. It must not allow unrestricted cross-company visibility, unrestricted editing, or hiding unresolved actionable work.
- Phase 4 purpose: production cutover, compatibility cleanup and historical repair. It is parked behind a release gate and cannot be executed from this DEV without separate approval.
- Phase 2/3/4 handoff coverage: each phase has purpose, outputs, scope, out of scope, implementation/data/API/permission/state-machine impact, dependencies, entry conditions, acceptance, QA/QC gate, stop conditions, evidence required, deferred decisions and recovery conditions in `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5.
- Latest All-Phase Gate closure: Section 4.5 records that Phase 1 is the only authorized implementation scope; Phase 2 and Phase 3 are RD Contract Ready only; Phase 4 is Release Gate Contract Ready / parked; continuation commands must not start Phase 2+ unless this task board is explicitly updated.

Acceptance:

- 圖號 module `送審` opens `/drawings/[drawingNumber]/submission-workbench`.
- 圖料 module resolves/selects a drawing before opening the same workbench.
- Pending/Releasing same-revision blocks with Chinese `此圖號版次正在送審或發行中...`.
- Unresolved ReleaseFailed blocks with Chinese `發行未完成...需要主管或 Admin 處理`.
- Released/Obsolete same-revision blocks with Chinese `此圖號版次已進入正式紀錄...`.
- Rejected/Cancelled/pre-approval unfinished records show non-blocking history.
- Resolved ReleaseFailed shows low-weight history and does not block.
- Submitter/R&D Manager/Admin can cancel Pending; other Engineer cannot.
- R&D Manager/Admin can retry ReleaseFailed.
- R&D Manager/Admin can return ReleaseFailed for correction and create linked Pending submission.
- Linked successful release resolves old ReleaseFailed and removes it from blockers/todo.
- UI does not expose internal codes or raw DB errors in normal flow.

Stop conditions:

- RD needs production DB mutation, cleanup, migration or deployment.
- Current schema cannot add required state/fields without destructive migration.
- Current release service cannot safely retry release without changing production/integration configuration.
- Permission model cannot determine submitter, R&D Manager or Admin authority.
- Same-revision classification would require allowing duplicate active Pending submissions.

Evidence captured:

- QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Focused QC: `npm run qc:pdm-drawing-submission-workbench-recovery`
- Disposable mutation lifecycle QC: `npm run qc:pdm-drawing-submission-workbench-mutation`
- DB provider transaction validation: `npm run qc:db-provider-contract`, `npm run qc:db-provider-postgres`
- Regression: `npm run qc:pdm-submission-conflict-duplicate-active`
- Regression: `npm run qc:pdm-drawing-part-workbench-security`
- Browser evidence captured for D-0014 release-incomplete blocker and submission detail recovery.
- Disposable mutation lifecycle evidence captured for ready/in-progress/terminal/non-blocking states plus cancel Pending, retry ReleaseFailed, return-for-correction and resolved ReleaseFailed history.

Next condition:

- Monitor APP validation feedback for Phase 1.
- Phase 2 can be opened only after Phase 1 is implemented/verified and explicitly authorized.
- Phase 3 can be opened only after Phase 2 is implemented/verified and explicitly authorized.
- Phase 4 production/cutover/historical repair requires separate release-gate approval.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003 發行未完成 UI 自救流程

Status: Implemented / verification passed locally
Priority: P0 - release-incomplete still requires UI-level user recovery; D-0014-like failures should not require RD/API/manual repair
Type: Delivery point
Parent: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorized phase: User/PM authorized RD implementation on 2026-07-02 through `執行開發`. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.

Human Decision Brief:

- Confirmed gap: the D-0014-MA1 failure could not be fully resolved through front-end UI before the backend/service correction.
- Confirmed target: users must be able to diagnose release-incomplete, fix drawing attachments, preview corrected package and create corrected submission through UI.
- Confirmed boundary: UI may organize and submit drawing-owned attachments; it must not overwrite released evidence, weaken release conflict guard, or become a second master-data source.
- Confirmed language: all normal UI copy must be user-understandable Traditional Chinese; raw internal codes and SQL/constraint messages are forbidden in normal UI.
- Rejected: ask users to rely on RD/API/database repair for normal release-incomplete recovery.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`
- Parent: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- Parent QA: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`

Scope:

- Release-incomplete recovery panel with conflict filename and conflicting formal record.
- Attachment organizer in the drawing submission workbench.
- Upload and soft-delete actions through drawing attachment owner APIs.
- Release preflight for selected attachment IDs.
- Correction preview showing included new attachments and excluded failed-package attachments.
- Return-for-correction with explicit selected attachment IDs.
- Same-revision workflow map and role-aware primary CTA / disabled reason.

Out of scope:

- Production deploy or production migration.
- Direct DB cleanup, historical repair or data deletion.
- Overwriting released packages or another item's released file.
- Full collaboration implementation.
- Full dashboard redesign.
- Google Drive production file movement outside the existing release integration.

Implementation contract summary:

- Workbench API must expose release-incomplete recovery summary in human-usable form.
- Preflight must re-check selected drawing attachments for eligibility, source ownership, duplicate selected filenames and released filename conflicts.
- `return-for-correction` must accept selected current drawing attachment IDs or equivalent explicit selection; service must not blindly copy failed submission files.
- Corrected submission files must retain `source_master_attachment_id`.
- Successful corrected release must resolve related unresolved same drawing + revision ReleaseFailed records.
- UI must show who can act when the current user lacks permission.

Implementation result:

- Drawing submission workbench now contains a drawing-owned attachment organizer for allowed states and locks attachment edit/select/note controls when the same revision is already formal or otherwise blocked by controlled same-revision conflict.
- Release-incomplete recovery mode remains editable: users can remove wrong drawing attachments, upload corrected drawing-owned attachments, select the corrected set and create a linked correction submission.
- Released filename conflict is exposed per attachment and re-checked server-side at submit/correction time.
- `return-for-correction` accepts explicit `selectedAttachmentIds`; correction packages are rebuilt from current drawing attachments instead of blindly copying failed release files.
- Successful corrected release resolves other unresolved same drawing + revision ReleaseFailed rows and keeps resolution audit.
- Submission detail now directs attachment/filename failures to the workbench instead of offering a blind one-click correction path.

Acceptance:

- D-0014-like stuck flow can be resolved with UI steps only: fix attachments, preview corrected package, create correction submission, approve/release.
- Conflict diagnosis shows human Chinese message, conflict filename and conflicting formal record.
- Submit/correction CTAs are disabled with clear reasons when selected attachments still conflict or permissions are insufficient.
- Resolved release-incomplete records appear as low-weight handled history and do not block.
- Normal UI does not show `DUPLICATE_RELEASE_FILENAME`, `ReleaseFailed`, `UNIQUE constraint failed`, stack traces, SQL, `Internal Server Error`, or raw `/api/...` errors.

Stop conditions:

- RD needs production migration/deploy, direct DB mutation, data deletion or historical repair.
- UI cannot identify source drawing attachment ownership.
- Permission model cannot decide attachment manage / correction / release authority.
- Implementation would allow overwriting or ignoring released filename conflicts.

Verification evidence captured:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run qc:pdm-drawing-submission-workbench-recovery`
- `npm run qc:pdm-drawing-submission-review-only`
- `npm run qc:pdm-drawing-submission-ui-self-recovery`
- `npm run qc:pdm-drawing-submission-ui-operation`: passed 14/14. Covers UI login, QC-owned drawing entry, legacy route compatibility, retired generic upload, fixture detail identity, ready/no-attachment/blocker states, Pending/Releasing/Released/history UI, release-incomplete correction flow, permission denial, detail-page states and RWD overflow checks. Route-mocked scenarios are labeled as UI contract simulation and do not claim backend persistence proof.
- 2026-07-02 validation-plan correction after clean local data reset: first run failed 10/14 because the plan incorrectly required legacy `D-0014-MA1` data. RD root cause used HCS `#多層次分析`: case layer = D-0014 locator timeout, data layer = blank master/submission tables, process layer = QA confused historical incident data with executable fixture data, governance layer = QC runner normalized recreating old data instead of challenging the plan. Correction: the QA plan and `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs` now use QC-owned `D-QC-SUBMIT-MA1`; D-0014 is documented only as historical context and must not be a required fixture. The runner removes QC-owned fixture rows and local files after browser evidence is captured, whether the fixture was created in the current run or found from an interrupted previous run. Re-run passed `npm run qc:pdm-drawing-submission-ui-operation` 14/14; `npm run dev:local:check`, `node --check scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`, and `npm run lint -- --quiet` also passed.
- `npm run dev:local:check`
- Authenticated Playwright smoke: QC-owned released state hides upload/remove controls, locks selection/note, and shows Chinese formal-record blocker.
- Mocked Playwright smoke: release-incomplete state shows attachment organizer, keeps corrected attachment selectable, blocks conflicting attachment, keeps note editable, shows `建立修正送審`, and hides raw `DUPLICATE_RELEASE_FILENAME` / `rev`.
- UI-only operation report:
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.json`
- Browser screenshots:
  - `output/playwright/d0014-workbench-ui-self-recovery-after-release.png`
  - `output/playwright/mock-release-incomplete-ui-self-recovery.png`
  - `output/playwright/d0014-released-detail-ui-self-recovery.png`
  - `output/playwright/ui-operation-scenarios/REAL-001-qc-submit-drawing-entry.png`
  - `output/playwright/ui-operation-scenarios/REAL-004-qc-submit-submission-detail.png`
  - `output/playwright/ui-operation-scenarios/MOCK-RELFAIL-001-correction-flow.png`

Next condition:

- Monitor APP validation feedback.
- Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement require separate authorization.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P Phase 2+ RD Handoff Package

Status: Prepared / RD Contract Ready
Priority: P1 - preserves the long-term drawing submission architecture but is not executable until Phase 1 is complete and explicitly authorized.
Type: Delivery point phase handoff
Parent: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorized phase: Documentation and future handoff only. No Phase 2, Phase 3 or Phase 4 implementation is authorized from this row. Continuation commands must not start Phase 2+ unless the user or PM explicitly changes this authorization boundary.

Human Decision Brief:

- Confirmed: 送審入口保留在圖號 / 圖料模組；送審工作台可以是獨立頁面。
- Confirmed: workbench may later support completing required submission data in the same user flow, but owner domains remain authoritative.
- Confirmed: some drawing/part preparation needs多人協作; collaboration must be intentionally opened, not always public.
- Confirmed: normal UI language must be user-understandable Traditional Chinese.
- Rejected: make generic `/upload` the primary formal submission page.
- Rejected: make the workbench a second master-data source.
- Rejected: delete failed or stuck submissions to clean the workflow.
- AI assumption: exact table/route names are RD-owned as long as owner-domain, permission, transaction, idempotency and snapshot contracts are preserved.
- Re-entry triggers: changing data ownership, broadening collaboration visibility, requiring production migration/deploy, direct DB repair, data deletion, cost-incurring external storage/CAD/OCR service, or altering when records become controlled evidence.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5.
- `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md` Section 5.
- Background authority: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`.

Scope:

- Phase 2 contract: workbench master-data completion, owner-domain writeback, drawing attachment-library upload, writeback summary, stale-version protection and immutable snapshot after writeback.
- Phase 3 contract: collaboration toggle, invited same-company collaborators, per-field owner-domain permissions, operational edit history, collaboration close rules, and dashboard/todo de-noising.
- Phase 4 contract: compatibility cleanup, production migration/cutover planning, historical stuck-record classification, backup/rollback and release-gate evidence.

Out of scope:

- Implementing Phase 2+ now.
- Allowing inline edits to Released/Obsolete data to bypass controlled change flow.
- Cross-company unrestricted collaboration.
- Full real-time co-editing, chat, notifications or audit-report UI.
- Production deploy, production migration, direct DB cleanup, historical repair or data deletion.

Implementation contract summary:

- Phase 2 must write through owner APIs, then re-read/revalidate before creating a submission snapshot.
- Phase 2 attachment upload must land in the drawing attachment library before submission creation.
- Phase 2 save-and-submit must be idempotent and must not create a Pending submission if writeback or blocker validation fails.
- Phase 3 collaboration access controls who may enter the shared workbench; owner-domain permission still controls which fields can be edited.
- Phase 3 operational edit history is preparation accountability, not formal controlled release evidence.
- Phase 4 must use deployment/release gate, additive migration, dry-run classification, backup, rollback and smoke evidence before any production change.

Data / API / permission / state-machine impact:

- Data impact is additive: owner data stays in drawing/part/root-link domains; submission snapshot remains immutable; collaboration tables are optional operational records only.
- API impact is additive: workbench writeback, attachment, submit and collaboration endpoints may be added, but must not replace owner-domain APIs.
- Permission impact is layered: company scope, workbench access, owner-domain field permission, submit permission and manager/admin recovery authority are checked independently.
- State impact: Phase 2 adds preparation/writeback flow but no new formal submission status; Phase 3 may add operational draft states; Phase 4 may add migration classifications but cannot reinterpret Released/Obsolete as reusable.

Acceptance:

- Phase 2 is ready for RD only when Phase 1 is implemented/verified, owner APIs exist for required fields, stale-version protection is possible, and no production storage/migration dependency is needed.
- Phase 3 is ready for RD only when Phase 2 is implemented/verified, collaborator field permissions can be evaluated server-side, and dashboard/todo queries can safely separate actionable work from history.
- Phase 4 is ready for release planning only when target identity, backup/rollback, dry-run classification and release-gate approval exist.
- Future RD can read this row plus the spec and identify scope, out-of-scope, implementation contract, data/API/permission/state impact, dependencies, acceptance, QA/QC gate, stop conditions, evidence and recovery conditions without returning to chat history.

Stop conditions:

- Any future phase needs production deploy, production migration, direct DB mutation, data deletion or destructive repair.
- Owner-domain APIs cannot preserve source-of-truth boundaries.
- Stale overwrite protection cannot be enforced.
- Collaboration would broaden company visibility or bypass field permissions.
- Dashboard/todo de-noising would hide unresolved actionable work.
- Historical records cannot be classified deterministically.

Evidence required when a future phase is authorized:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Existing Phase 1 focused QC and regression gates.
- Phase-specific focused QC:
  - Phase 2 suggested: `npm run qc:pdm-drawing-submission-workbench-writeback`
  - Phase 3 suggested: `npm run qc:pdm-drawing-submission-workbench-collaboration`
  - Phase 4: migration dry-run report, backup/rollback plan, local/staging smoke and release-gate evidence.
- Browser/API evidence for the phase-specific happy path, permission-denied path, stale/conflict path and forbidden internal-string negative check.

Next condition:

- Do not start this package automatically. Open Phase 2 only after the user or PM explicitly authorizes Phase 2.

### DEV-PDM-SUBMISSION-CONFLICT-001 Duplicate active submission conflict classification

Status: Implemented / Verification passed locally
Type: Development objective
Parent: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Authorized phase: Local RD implementation and verification are complete. Production deploy, production migration, direct DB cleanup, historical duplicate repair and data deletion are not authorized.

Human decisions:

- `duplicate_active_submission` must not be classified as `主資料未完成`.
- Duplicate active drawing + revision submission is blocked, not warning-only.
- Error messages must be human-readable Traditional Chinese.
- Blocked and failed attempts retain audit trail.
- Reviewer approval must be guarded if legacy/race duplicate active submissions exist.
- Old generic upload submission flow remains retired from formal submission.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
- `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`
- Amended parent spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing ADR authority: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

RD implementation plan:

- Follow `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md` Section 12.
- Implement in this order: blocker grouping contract, existing-submission query, readiness classification, submit-time duplicate guard, DB uniqueness fallback shielding, UI grouped blocker state, reviewer approval/release guard, focused QC command.
- The idempotency branch must run before duplicate-conflict classification so same-key retries do not become false duplicate errors.
- The duplicate active guard must run before file storage and submission creation so a blocked duplicate cannot leave orphaned submission files.
- Reviewer-side blocking is defensive for legacy/race data only; normal duplicate prevention belongs at readiness and submit-time.

Implementation summary:

- `src/lib/drawing-submission-workbench.ts` adds blocker groups, existing-submission summary, structured workbench error options, duplicate conflict audit payload, submit-time duplicate guard before file storage/submission creation, DB uniqueness fallback mapping, and reviewer duplicate active guard helper.
- `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts` returns grouped Chinese domain errors with `code`, `group`, `existingSubmission`, recovery data and no raw generic 500 message.
- `src/app/upload/page.tsx` groups blockers by `submission_conflict`, `master_data_missing`, `attachment_conflict`, `state_or_permission_blocked` and `system_recoverable`; duplicate conflicts no longer render under `主資料尚未完成`.
- `src/app/api/submissions/[id]/approve/route.ts` blocks reviewer approve/release when duplicate active submissions exist and records `submission.review.blocked_duplicate_active`.
- `src/components/dashboard.tsx` prefers API `message` over internal `error` code for reviewer action failures.
- `scripts/qc-pdm-submission-conflict-duplicate-active.mjs` and package script `qc:pdm-submission-conflict-duplicate-active` provide focused contract QC.

Scope:

- Add readiness blocker group classification.
- Classify `duplicate_active_submission` as `submission_conflict`.
- Keep duplicate active drawing + revision blocking at readiness and submit-time.
- Map legacy `DRAWING_SUBMISSION_DUPLICATE_REVISION` and DB uniqueness failures to human Chinese `submission_conflict`.
- Show existing submission summary and recovery CTA when resolvable.
- Ensure idempotency replay is not misclassified as duplicate conflict.
- Add reviewer-side guard so legacy duplicate active records cannot be approved/released.
- Preserve blocked-attempt audit evidence.

Out of scope:

- Production deploy.
- Production schema migration.
- Direct DB cleanup or historical duplicate repair.
- Warning-only duplicate active submission.
- Reopening generic `/upload` as formal submission.
- Full approval workflow redesign.
- New terminal-status same-revision reuse policy.

Acceptance:

- `duplicate_active_submission` never appears under `主資料未完成`.
- Readiness API returns `group: "submission_conflict"` for duplicate active submission.
- Submit API returns 409 with Chinese message, no raw DB error, and no second Pending submission.
- Same-key idempotent replay returns the existing created submission behavior.
- Different-key parallel duplicate creates at most one active submission and audits the blocked attempt.
- UI provides recovery CTA to existing submission or source workflow.
- Reviewer approval/release is disabled when duplicate active submissions already exist.
- Master-data blockers and duplicate attachment blockers keep their own classifications.

Stop conditions:

- Implementation would allow duplicate active submissions and rely on reviewer judgment.
- Active vs terminal submission statuses cannot be determined without changing lifecycle policy.
- Reviewer guard requires a product decision because no safe reject/return/cancel path exists.
- RD needs production deploy, production migration, direct DB mutation, historical cleanup or data deletion.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14 after updating the duplicate-prevention expectation from legacy `DRAWING_SUBMISSION_DUPLICATE_REVISION` to `duplicate_active_submission`.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-submission-conflict-duplicate-active`: passed 10/10.
- Browser smoke evidence captured for duplicate conflict state:
  - `output/playwright/pdm-submission-conflict-duplicate-desktop.png`: D-0014-MA1 shows `已有進行中的送審`, existing submission summary, disabled submit reason, and no `主資料尚未完成` duplicate misclassification.
  - `output/playwright/pdm-submission-conflict-mobile.png`: same duplicate conflict state on 390px mobile viewport, with no duplicate-as-master-data wording.
- Browser UI contract evidence captured with Playwright route mock:
  - `output/playwright/pdm-submission-conflict-ready-desktop.png`: ready state shows enabled-ready copy after note and attachment conditions pass.
  - `output/playwright/pdm-submission-conflict-note-required.png`: note-missing state shows note-specific disabled reason.
  - `output/playwright/pdm-submission-conflict-mixed-blockers.png`: mixed blocker state separates `已有進行中的送審` from `主資料尚未完成`.
- Reviewer legacy duplicate browser fixture remains recommended for APP validation when disposable duplicate-active data can be created safely; local reviewer guard is covered by API implementation and focused QC.

Next condition:

- Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.

### DEV-PDM-DRAWING-PART-WORKBENCH-001 圖料模組資料流與送審安全架構

Status: Implemented / Verification passed locally
Type: Delivery point
Authorized phase: Local RD implementation and verification completed. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair are not authorized.

Human decisions:

- 圖號模組維持「以圖為主」。
- 圖料模組升級為主根號 / 圖料關聯 / 送審準備工作台。
- 圖料模組可 inline 編輯圖號與料號欄位，但寫入必須走 owner domain API、validation and audit。
- 送審時保存 immutable submission snapshot。
- 送審 gate 採前端顯示、後端強制、DB constraint 三層防線。
- 同一送審包不允許相同 `file_role + original_filename` 附件；必須用人類中文阻擋。
- 失敗送審保留 audit trail。
- 舊 `/upload` 上傳送審頁完全退役，不再作為正式送審入口。

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
- `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`
- Superseded context: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- Layout baseline: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`

Scope:

- Upgrade 圖料模組 to show root, primary drawing, primary part, owner-labeled master fields, attachments and submission readiness.
- Allow inline edit in 圖料模組 while routing writes to drawing/part/root/link owner APIs.
- Add server-side submission readiness contract and blocker codes.
- Add duplicate attachment filename blocker before DB insert.
- Retire the old generic `/upload` UI from formal submission flow.
- Retire normal web/session formal creation through generic `POST /api/submissions`.
- Route drawing/part shortcuts into 圖料模組 readiness instead of generic upload.
- Create immutable submission snapshot on successful submission.
- Persist canonical snapshot version/hash/rules/source evidence.
- Add submission attempt idempotency and blocked/failed/created audit behavior.
- Block ambiguous root/drawing/part relationships instead of guessing.
- Separate storage identity from display filename to prevent overwrite/collision.
- Preserve source drawing/source part/source attachment traceability.
- Audit owner edits, blocked submit attempts, failed submit attempts and snapshot creation.

Out of scope:

- Production deploy.
- Supabase production cutover or remote schema migration.
- Direct DB cleanup, data deletion, or repair of existing failed submissions.
- CAD file mutation or automatic filename rewrite.
- SolidWorks Document Manager integration.
- Approval workflow redesign.
- Allowing duplicate attachment filenames.

Acceptance:

- 圖號模組 remains drawing-focused.
- 圖料模組 is the formal root/drawing/part submission-preparation entry.
- Inline edits are persisted through owner APIs and leave audit evidence.
- Backend readiness returns Chinese blockers and controls the actual submit state.
- Same `file_role + original_filename` selection is blocked with a Chinese message before DB failure.
- `/upload` no longer renders the generic upload/send-review form.
- Generic `POST /api/submissions` cannot create formal submissions for the retired workflow.
- Drawing detail `送審` shortcut opens 圖料 readiness for the selected drawing/root.
- Ambiguous root, multiple primary drawings, and multiple primary parts block submission with Chinese recovery messages.
- Successful submit creates Pending submission plus canonical immutable snapshot/hash.
- Same idempotency key returns existing created submission; parallel/different-key duplicate active submission is blocked.
- Attachment storage keys include immutable ids and cannot overwrite existing files.
- Released master data cannot be patched inline to make submission pass.
- Failed/blocked submit attempts leave audit trail.
- No raw DB constraint, SQL table/column, stack trace or `Internal Server Error` appears in user-facing flow.

Stop conditions:

- RD would need to patch master data on a generic upload page.
- RD would need to allow or auto-rename duplicate attachment filenames.
- RD would need production deploy, production migration, direct DB mutation, data cleanup or data deletion.
- Owner APIs cannot enforce validation/audit and implementation would directly write owner tables from 圖料 UI.
- Snapshot cannot be created without destructive migration.

Evidence required:

- `npx tsc --noEmit`
- `npm run lint -- --quiet`
- `npm run build`
- `npm run qc:pdm-numbering-api-regression`
- `npm run qc:pdm-drawing-submission-review-only`
- Focused QC to add/update: `npm run qc:pdm-drawing-part-workbench-security`
- Browser screenshots for readiness ready/blocker, duplicate attachment blocker, retired `/upload`, successful submission and mobile viewport.
- Focused negative evidence for direct generic API bypass, owner API rejection, stale version conflict, ambiguous relationships, parallel submit, storage-key collision and released-record edit blocking.

Evidence captured 2026-07-01:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14 after updating the route expectation from retired `/upload?source=drawing` to controlled `/numbering/submissions/drawings/[drawingNumber]`.
- `npm run qc:pdm-numbering-api-regression` with temporary `PDM_BASE_URL=http://127.0.0.1:3100`: passed; temporary server was stopped after QC.
- Retired `/upload` browser screenshot: `output/playwright/pdm-upload-retired-desktop.png`.
- Existing same-day drawing submission APP evidence retained: `output/playwright/pdm-drawing-master-data-edit-desktop.png`, `output/playwright/pdm-drawing-submission-note-required.png`, `output/playwright/pdm-drawing-submission-ready.png`, `output/playwright/pdm-drawing-submission-duplicate-blocker.png`.

Next condition:

- Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.

### DEV-PDM-DRAWING-SUBMISSION-001 Drawing-source Review-only Submission

Status: Implemented / Verification passed
Type: Delivery point
Authorized phase: Local implementation and local/browser QC completed. Production deployment remains out of scope.

Human decision:

- `送審階段不應該再補資料，這些應該都在圖號模組完成`.
- Drawing module owns drawing/part master data.
- Submission page only confirms review package, selected source attachments and review note.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`
- Existing auxiliary upload QA for regression only: `.ai-doc/qa/qa-windows-upload-validation-plan-2026-05-26.md`

Scope:

- Change drawing detail `送審` from generic blank upload to drawing-source review-only submission workflow.
- Resolve drawing, primary linked part, material, surface treatment, source attachment candidates and suggested revision from server-side master data.
- Hide/forbid editable PDM master fields in drawing-source submission mode.
- Block submission when required master data or attachments are missing, with recovery links back to drawing/part master surfaces.
- Create Pending submission from selected drawing master attachments and server-derived master data.
- Preserve traceability to source drawing and source master attachment(s).
- Preserve generic `/upload` as auxiliary/manual intake unless a separate task retires it.

Out of scope:

- Removing generic `/upload`.
- Editing drawing/part master data inside the submission page.
- Production deploy or production schema migration.
- Supabase production cutover.
- SolidWorks Document Manager integration.
- CAD file mutation.
- Approval workflow redesign beyond existing one-reviewer/default matrix behavior.

Acceptance:

- From drawing detail `D-0014-MA1`, clicking `送審` opens a drawing-source review-only submission screen, not a blank generic upload form.
- Page clearly displays `送審來源：D-0014-MA1`.
- No editable inputs for `圖號`, `料號`, `品名`, `版次`, `材質`, `表面處理`, or `文件類型` appear in drawing-source mode.
- Missing linked part/material/surface/attachment disables `送出審核` and links to the correct master-data recovery surface.
- Successful submit creates exactly one Pending submission derived from master data and selected attachment(s).
- Duplicate active same drawing/revision submission is blocked.
- Generic `/upload` remains available outside `source=drawing`.

Stop conditions:

- RD would need to let users patch master data inside submission page.
- Existing master data cannot supply required material/surface without a separate schema task.
- File handling would require destructive moves rather than safe copy/reference.
- Production migration/deploy becomes required.

Evidence required:

- `npx tsc --noEmit` passed on 2026-06-30.
- `npm run lint -- --quiet` passed on 2026-06-30.
- `npm run build` passed on 2026-06-30.
- `npm run qc:pdm-drawing-submission-review-only` passed 12/12 checks on 2026-06-30.
- `npm run qc:pdm-change-control` passed 56/56 checks on 2026-06-30.
- `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:pdm-numbering-api-regression` passed 27/27 checks on 2026-06-30. The first run without `PDM_BASE_URL` failed because the script defaults to port 3100, not due to product behavior.
- Continuation audit on 2026-06-30 reran the required local gates: `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, `npm run qc:pdm-drawing-submission-review-only`, `npm run qc:pdm-change-control`, and `PDM_BASE_URL=http://127.0.0.1:3000 npm run qc:pdm-numbering-api-regression`; all passed.
- Browser smoke against `http://127.0.0.1:3001`: `/upload?source=drawing&drawingNumber=D-0014-MA1` showed `圖面送審`, `送審來源：D-0014-MA1`, no generic `Windows 檔案送審`, no `2. PDM 屬性`, no editable text/select master-data inputs, one review-note textarea, no visible runtime/API error text, and no mobile horizontal overflow.
- Final local smoke against `http://127.0.0.1:3000`: `/upload?source=drawing&drawingNumber=D-0014-MA1` showed `圖面送審`, `送審來源：D-0014-MA1`, no generic `Windows 檔案送審`, zero editable text/select master-data inputs, and disabled `送出審核` while blockers exist.
- Continuation browser/API smoke on `http://127.0.0.1:3000` confirmed source route title/banner, zero editable text/select master-data inputs, one review-note textarea, missing-material and missing-surface blockers, three eligible/source attachments in context API, no visible runtime/API error text, generic `/upload` still rendering `Windows 檔案送審`, mobile no horizontal overflow, and duplicate POST for existing `D-QCDRS-MR0FC6P3-MA1` returned 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.
- API smoke with disposable local `QC-DRS-*` fixture: context blockers = 0; POST created `SUB-20260630-5FE2CE3E` revision `0.1`; trace recorded `source_entity_type=drawing_number`, `source_entity_id=qc-drs-drawing-MR0FC6P3`, `source_master_attachment_id=qc-drs-attachment-MR0FC6P3`; server-derived `material=SUS304`, `surface_finish=拋光`; duplicate POST returned 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.

### DEV-PDM-UI-POLISH-001 Completed Scope

Status: Implemented / Verification passed.
Keep UI simple and PDM-minimum; backend may stay rigorous.

- Upload/PDM attributes warning: missing company-specific SolidWorks Document Manager or equivalent CAD metadata/reference adapter warnings are shown as concise Traditional Chinese user guidance. CAD adapter integration remains parked under `DEV-CAD-001`.
- Upload PDM attributes form: `版次` defaults to `0.1`; `產品線` is renamed to optional `產品系列`; `客戶`, `專案`, `機台`, `文件類型`, and `簽審層級` are removed from the visible form; `備註` is added; uploads default to one reviewer while backend validation still receives safe defaults.
- File selection: multiple selected files are supported; when SolidWorks files are present, `.slddrw`, `.sldasm`, and `.sldprt` are prioritized as primary metadata sources; conflicts between selected files or detected hints show visible warnings instead of silently choosing one value.
- Attachment surfaces: when attachments include SolidWorks files, the panel shows a 3D preview area. The current preview source contract is server-generated 3D derivative/thumbnail; when no derivative exists, a non-blocking fallback is shown instead of a blank area.
- Drawing governance actions: the drawing detail `圖號治理` area no longer uses `申請新圖號 / 進版`, no longer shows `申請新圖號`, and uses compact icon-free actions:
  - `開啟圖料追溯` -> `/numbering/search?query={drawing.drawingNumber}&entityType=drawing_number`
  - `檢查 MA 影響文件` -> `/numbering/impact?drawingNumber={drawing.drawingNumber}` for MA drawings only
  - `進版` -> `/numbering/revisions?drawingNumber={drawing.drawingNumber}`
  - `送審` was originally routed to `/upload`; this is now intentionally superseded by `DEV-PDM-DRAWING-SUBMISSION-001`, which requires drawing-source `送審` to be review-only rather than a generic upload form.
- `/numbering/revisions` accepts optional `drawingNumberId` and optional `drawingNumber` query parameters. If provided, the page must prefill `drawingNumberId` and show the current drawing number as context; the sidebar route without query remains valid.
- Acceptance notes: from drawing detail, `進版` directly shows the revision assessment form with the current drawing loaded; the previous generic `送審 -> /upload` behavior is not the final target and is superseded by `DEV-PDM-DRAWING-SUBMISSION-001`; governance actions remain clear on desktop without wrapping confusion, overlap, or overflow.
- Drawing revision workbench focused spec implemented: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`. `/numbering/revisions` now resolves official drawing numbers, hides editable internal IDs from users, shows drawing/part context, previews FFF outcome consequences, guides confirmed-impact replacement draft creation, and translates raw domain errors into Traditional Chinese user guidance. State: `Implemented / verification passed`.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- Browser smoke `/upload`: removed `客戶`, `專案`, `機台`, `文件類型`, and `簽審層級`; shows `產品系列`, `備註`, and revision default `0.1`.
- Browser smoke multi-file upload: SolidWorks primary badge shown; conflicting drawing/part/revision hints shown in Traditional Chinese; technical English CAD-adapter warnings hidden; screenshot `C:\Users\user\AppData\Local\Temp\upload-ui-polish-001-conflict-auth-after-revision-fix.png`.
- Browser smoke drawing attachments: `D-0014-MA1` SolidWorks attachments show non-blocking 3D preview fallback with no post-selection console errors; screenshot `C:\Users\user\AppData\Local\Temp\drawing-solidworks-preview-fallback.png`.
- Browser smoke drawing governance compact actions: screenshot `C:\Users\user\AppData\Local\Temp\drawing-governance-actions-compact.png`.

### DEV-PDM-UI-POLISH-001A Drawing Revision Workbench Focused Slice

Status: Implemented / Verification passed
Type: Development objective
Parent: `DEV-PDM-UI-POLISH-001`
Authorized phase: RD implementation executed by explicit user request on 2026-06-30.

Required docs:

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`
- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
- `src/app/numbering/revisions/page.tsx`
- `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- `src/lib/pdm-change-control-domain.ts`
- `src/lib/repositories/numbering-async-repository.ts`

Scope when authorized:

- Implement `GET /api/numbering/drawings/resolve` or equivalent same-contract resolver.
- Replace editable internal ID fields in `/numbering/revisions` with official drawing/part context.
- Support query-param preload for `drawingNumberId`, `drawingNumber`, and optional `partNumber`.
- Show drawing, current part, revision suggestion, status, BOM/where-used and eligibility context.
- Convert FFF assessment into a stepper/workbench with outcome preview.
- Implement confirmed-impact branch with system-created/reused replacement draft behavior.
- Implement primary manufacturing part fallback and server-side relationship re-check.
- Translate raw domain errors into Traditional Chinese user guidance.
- Add duplicate submit guard using UI pending lock plus server equivalent-active-record guard.
- Add focused QC evidence for resolver, FFF outcomes, confirmed-impact, duplicate submit and RWD.

Implemented files:

- `src/lib/drawing-revision-workbench.ts`
- `src/app/api/numbering/drawings/resolve/route.ts`
- `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- `src/lib/pdm-change-control-domain.ts`
- `src/app/numbering/revisions/page.tsx`

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-change-control`: passed, 56/56.
- Browser smoke on `http://127.0.0.1:3001/numbering/revisions`: core field visible, resolver button visible, submit disabled before drawing resolution, old editable `圖號 ID` label count 0, runtime errors 0.
- Screenshot evidence: `C:\Users\user\AppData\Local\Temp\drawing-revisions-workbench.png`.

Out of scope:

- Production deploy.
- Supabase production cutover.
- Schema migration unless PM creates a separate migration task.
- CAD/OCR/SolidWorks metadata reader integration.
- Automatic CAD file mutation.
- Automatic released BOM mutation.
- Rewriting `DEV-PDM-CHANGE-CONTROL-001` domain rules.
- Creating a new drawing number from the original drawing revision flow.

Acceptance:

- `/numbering/revisions` can resolve an official drawing number such as `D-0014-MA1` without requiring UUID entry.
- Query params preload valid drawing context and reject mismatched ID/code pairs.
- UI does not expose editable `圖號 ID` or `現行料號 ID` fields in normal operation.
- No-impact, suspected-impact and confirmed-impact previews match the existing change-control rules.
- Confirmed impact cannot submit without a safe current part and replacement draft path.
- Equivalent duplicate submit does not create duplicate active replacement drafts or assessments.
- Error messages are visible, Traditional Chinese and actionable.
- Desktop and mobile screenshots show current drawing context and primary action without overlap, clipping or horizontal overflow.
- Existing `qc:pdm-change-control` and numbering API regression remain passing.

Stop conditions:

- RD needs schema migration to persist new fields.
- RD needs production, Supabase production, direct DB mutation or data migration.
- Existing domain service cannot support confirmed-impact replacement draft reuse/create behavior without changing `DEV-PDM-CHANGE-CONTROL-001` business rules.
- Resolver cannot prove company scope or safe drawing/part relationship.
- Implementation would allow confirmed impact to bypass replacement part requirements.
- CAD/OCR/SolidWorks reader dependency becomes required for v1.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run qc:pdm-change-control`
- `npm.cmd run qc:pdm-numbering-api-regression`
- Focused command if added: `npm.cmd run qc:pdm-drawing-revision-workbench`
- Resolver API evidence.
- Duplicate submit DB/API evidence.
- Desktop and mobile screenshots for `/numbering/revisions`.
- Negative screenshot for not-found or mismatch error.
- `git diff --check` for changed source/docs.

Next condition:

- If user authorizes this focused slice, move state to `Ready / In RD` and execute through RD-QA-QC.
- If user keeps `DEV-PDM-UI-POLISH-001` intake open, retain this as prepared non-executable scope.

### DEV-PDM-DRAWING-REVISION-SUBMISSION-001 圖面進版受控送審包

Status: Implemented / verification passed locally for Phase 1, Phase 2 multi-file revision package intake, Phase 3 out-of-order revision acceptance/latest-history view and Phase 4 first-class revision attachment package model
Priority: P0 - without this, a new drawing file revision can exist in the attachment library without becoming a controlled drawing revision package
Type: Delivery point
Parent: `DEV-PDM-CHANGE-CONTROL-001`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorization boundary:

- Phase 1 RD implementation was authorized by the user's 2026-07-03 `執行開發` instruction and is implemented locally.
- Phase 2 multi-file revision package intake was authorized by the user's 2026-07-05 `執行開發` instruction and is implemented locally.
- Phase 3 out-of-order revision acceptance and latest/history view was authorized by the user's 2026-07-05 `執行開發` instruction and is implemented locally.
- Phase 4 first-class revision attachment package model was locally implemented after the user's 2026-07-06 guided decisions and later RD execution authorization. Local schema/runtime files and SQLite bootstrap were updated; production deploy, production migration/cutover and existing-data repair were not performed.
- Phase 5 extraction assistance and Phase 6 production/historical classification are not authorized.
- Mobile-specific UX is not a delivery target; phones use the desktop/default surface, and official UI acceptance is desktop/tablet/current browser only unless the user changes this system setting.

Human Decision Brief:

- A drawing revision such as `D-0007-MA1` from `0.1` to `0.2` may be valid while the linked part number and BOM remain unchanged.
- Uploading a file to `圖號附件庫` with revision `0.2` is not enough to prove formal drawing revision.
- Formal drawing revision requires selected new drawing files, FFF judgement, revision value, reason category, Pending submission package, reviewer confirmation and release/audit evidence.
- No-impact changes such as `標註 / 文字修正` should keep part/BOM unchanged, but reviewer must confirm BOM no revision.
- Confirmed-impact changes still require replacement part draft and drawing part-number match under the existing change-control rule.
- 2026-07-05 Phase 2 decisions: upload unit is a `版次檔案包`; one revision package may contain multiple files; category is auto-classified by extension and user-correctable; completeness checks are warning-only after at least one valid package file exists; the review page/drawer must show the same warnings before approval/rejection.
- 2026-07-05 Phase 3 decision: all revisions may be entered and approved in any order; the system suggests the next likely revision, blocks duplicate formal records for the same drawing + revision, computes the latest approved revision by version comparison and moves non-latest approved revisions to history.
- 2026-07-06 Phase 4 decision: `版次檔案包` must become a first-class model with stable `packageId`; Released core package evidence is immutable; post-release supplements are child records requiring reason and approval; approved supplements display in the same attachment list with `補件` tag; ambiguous migration records are confirmed in IDE/Codex dry-run output, not a product `待確認附件` area.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-PACKAGE-001-first-class-package-and-supplement.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`
- Parent change-control spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- Parent drawing revision UX spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
- Parent drawing submission workbench spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`

Scope:

- Add `新版圖面` step to `/numbering/revisions`.
- Reuse drawing attachment library upload/select behavior for the intended new revision.
- Require at least one eligible new-revision drawing file before formal revision package submit.
- Create one Pending drawing submission package from selected attachment IDs.
- Link the FFF assessment with `drawing_revision_fff_assessments.submission_id`.
- Show preview distinguishing drawing revision, part unchanged/replacement state, BOM unchanged/reconfirmation state, selected files and reviewer action.
- Preserve same-revision blockers and release-incomplete recovery behavior.
- Phase 2: support multi-file upload/dropzone for one intended revision package.
- Phase 2: auto-classify SLDDRW/PDF/DWG/DXF/STEP/SLDPRT or equivalent files by extension and allow inline correction.
- Phase 2: show warning-only package completeness guidance on submitter preview.
- Phase 2: show the same warning codes on the review page/drawer with reviewer wording.
- Phase 3: allow lower or skipped revisions to be submitted, reviewed and approved after newer revisions exist.
- Phase 3: remove chronological order blockers from normal approval/retry-release while preserving same-revision duplicate blockers.
- Phase 3: recompute latest/history after approval and show only latest in first-level operational views.
- Phase 3: keep older approved revisions traceable in history, not in the primary current-file list.
- Phase 4: create a first-class package model with `packageId`, package file memberships and supplement request/approval records.
- Phase 4: keep Released package core immutable and model late files as approved supplements.
- Phase 4: show approved supplement files in the same main attachment list with `補件` tag/icon.
- Phase 4: implement migration dry-run from existing submissions/file assets and report ambiguous records in IDE/Codex output only.

Out of scope:

- Production deploy or production migration.
- Direct DB cleanup, historical repair or data deletion.
- CAD/OCR/SolidWorks automatic extraction as a Phase 1 or Phase 2 dependency.
- Automatic BOM version creation.
- Automatic part-number revision for no-impact changes.
- Dedicated mobile-phone UI, mobile-specific navigation or phone-first layout. Phones use the desktop/default surface.
- Rewriting `DEV-PDM-CHANGE-CONTROL-001` business rules.
- Turning optional package completeness warnings into hard blockers without explicit PM approval.
- Requiring chronological approval order.
- Allowing duplicate formal records for the same drawing + same revision.
- Direct repair of existing wrong latest/history records.
- Product UI `待確認附件` area for ambiguous migration records.
- Editing Released package core files or roles in place.

Implementation contract summary:

- Attachment upload creates drawing-owned source/staging files only; it must not mark a drawing revision as formal.
- Formal action is `建立圖面進版送審`.
- Package creation must re-check drawing, selected attachments, same-revision blockers and FFF branch guards.
- Package creation must create or reuse the drawing submission snapshot/source-attachment traceability.
- FFF assessment and Pending submission must be linked before success returns.
- If FFF assessment creation fails after Pending submission creation, the incomplete Pending submission must be cancelled with audit evidence before returning failure.
- If no-impact: original part is allowed, BOM stays unchanged, and reviewer action is `confirm_bom_no_revision`.
- If suspected-impact: reviewer must choose `confirm_original_part_reuse` or `return_for_replacement_part`.
- If confirmed-impact: replacement draft and matching drawing part-number value remain mandatory.
- Phase 2 package files are treated as one revision package, not separate formal submissions.
- Phase 2 warning logic must be shared between submitter and reviewer surfaces; only wording changes by audience.
- Phase 2 missing PDF/DWG/DXF/3D/intermediate evidence is warning-only unless no valid package file exists or an existing hard blocker applies.
- Phase 3 approval/retry-release must not fail solely because a newer different revision already exists.
- Phase 3 must keep same drawing + same revision uniqueness as a hard blocker.
- Phase 3 must use one deterministic revision comparator for next-revision suggestion, release recomputation and UI grouping.
- Phase 3 latest/history recomputation must keep a lower backfilled revision as formal history when a higher approved revision exists.
- Phase 3 first-level drawing/package/handoff/download defaults must use the computed latest unless the user explicitly opens history.
- Phase 4 package identity must be `packageId`; submission snapshot is evidence and migration seed, not the long-term package model.
- Phase 4 must enforce one effective Released package per company + drawing + revision.
- Phase 4 Released package core files/roles must be immutable.
- Phase 4 supplements must store reason, optional/required note, applicant, reviewer/Admin decision and timestamps.
- Phase 4 `內容有變更，建立新版次` supplement reason must show `應建立新版次` but not hard-block.
- Phase 4 migration must run dry-run before mutation and report ambiguous records in IDE/Codex only.

Acceptance:

- `D-0007-MA1` or QC-owned equivalent can be prepared for `0.2` as a controlled revision package without revising the linked part or BOM when FFF is no-impact.
- Uploading/selecting attachment alone does not create Pending submission, assessment or released drawing revision.
- `建立圖面進版送審` creates one Pending submission and one linked FFF assessment.
- Submission snapshot includes selected source attachment IDs and intended revision.
- Reviewer BOM no-revision confirmation is required before no-impact release.
- Confirmed-impact path remains blocked without replacement draft and drawing part-number match.
- UI copy is Traditional Chinese and does not expose raw internal codes, SQL or stack traces.
- Phase 2: one revision package can contain multiple files under the same target revision.
- Phase 2: extension-based role classification works and user correction is persisted in package evidence.
- Phase 2: missing recommended file roles do not disable submit after at least one valid package file exists.
- Phase 2: reviewer page/drawer shows the same package warning codes before approve/reject actions.
- UI acceptance targets desktop/tablet/current browser surfaces; mobile screenshots are optional sanity evidence only, not a separate supported phone UI.
- Phase 3: approving revision `0.5` after `0.6` exists succeeds as formal history and does not replace `0.6` as latest.
- Phase 3: approving revision `0.7` after `0.6` exists makes `0.7` latest and moves `0.6` into history.
- Phase 3: duplicate formal same drawing + same revision remains blocked with actionable Chinese recovery.
- Phase 3: first-level drawing/package surfaces show only the computed latest revision; older approved revisions are under history.
- Phase 3: manufacturing handoff and default download/package consumers select latest by default.
- Phase 4: package operations use `packageId`.
- Phase 4: same drawing + same revision duplicate Released package is blocked.
- Phase 4: approved supplements appear in the same package attachment list with `補件` tag/icon and audit link.
- Phase 4: `其他` supplement reason requires note; other reasons allow optional note.
- Phase 4: migration dry-run reports ambiguous records without creating product UI clutter.

QA/QC gate:

- Required QA plan: `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`
- Verification passed locally:
  - `npx.cmd tsc --noEmit --pretty false`
  - `npm.cmd run lint -- --quiet`
  - `npm.cmd run qc:pdm-change-control` 61/61, including Phase 2 package guards and Phase 3 revision-order/latest-history guards
  - `npm.cmd run qc:pdm-drawing-submission-review-only`
  - `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`
  - Existing local dev server page smoke: `/numbering/revisions` returned HTTP 200.
  - Protected workbench API smoke: unauthenticated `/api/numbering/drawings/D-0007-MA1/submission-workbench?revision=0.2` returned HTTP 401 `需要登入`.
  - Phase 2 Playwright smoke: `/numbering/revisions?drawingNumber=D-0007-MA1` shows multi-file package dropzone, selected package role, warning-only submitter guidance and no visible runtime error; `/submissions/SUB-QC-REVPKG-001` shows reviewer warnings before approve/cancel actions.
  - Screenshot evidence: `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`; `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`. The 390px screenshot is retained as optional sanity only, not mobile support evidence.
  - Phase 3 lifecycle QC: lower revision after newer latest approves into history without replacing latest; higher revision becomes latest and moves older approved revisions to history; duplicate same drawing + same revision remains blocked.
  - Phase 3 static guard: approve/retry-release/workflow paths no longer contain the old chronological `revision_release_order_conflict` blocker; duplicate formal same-revision guard remains.
  - Phase 3 UI/static guard: revision intent copy warns when the target revision is lower/higher than current latest, and `master-attachment-panel` uses the shared revision comparator for latest/history grouping.
  - Phase 4 local package model QC: `npm.cmd run qc:pdm-drawing-revision-package-model` passed 59/59, covering schema files, package repository guards, package creation/release/cancel integration, supplement APIs, approved supplement tagging, multi-file supplement UI support and migration dry-run reporting.
  - Phase 4 local regression QC: `npm.cmd run qc:pdm-change-control` passed 61/61 after the package-model implementation.
- Not run:
  - `npm.cmd run build` was blocked by the local dev-entrypoint guard because AI_PDM was already listening on `http://127.0.0.1:3000/` and `prebuild` refused to clean `.next`.
- Recommended focused command: `npm.cmd run qc:pdm-drawing-revision-submission`
- Required UI evidence: preview, missing-file blocker, no-impact package submit, linked assessment/submission, reviewer BOM no-revision confirmation and desktop/tablet/current-browser visible-error checks. Dedicated phone/mobile evidence is not required by current system setting.
- Required Phase 2 evidence: multi-file package upload, category auto-classification, inline correction persistence, warning-only submit behavior, reviewer warning parity and shared warning-code evidence.
- Phase 3 evidence covered in this local pass: lower-after-newer approval into history, higher-after-current approval becoming latest, duplicate same-revision blocker, latest/history static UI grouping, and static/API guard that chronological revision-order conflict is no longer a hard approval blocker. Manual browser evidence for every operational consumer remains recommended for APP validation but is not a separate authorization gate.
- Phase 4 local evidence now includes packageId repository/API integration, duplicate Released package negative guard, Released-core immutability guard, supplement reason/approval implementation, `補件` tag display implementation and migration dry-run reporting via `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59. Remaining recommended APP evidence: browser screenshot with real or seeded data for supplement request, approval/rejection and `補件` tag display. Focused QA plan: `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`.

Deferred Scope Audit:

- Production deploy / Supabase production cutover: New DEV / release gate; Phase 6 parked.
- Schema migration: Same Spec Phase for local Phase 4 package model; production migration remains Blocked Human Re-entry / release gate.
- CAD/OCR/SolidWorks automatic extraction: Same Spec Phase 5, not authorized.
- Historical attachment-only records: Same Spec Phase 4 dry-run and Phase 6 production cutover; no direct repair/deletion authorized.
- Existing wrong latest/history records: New DEV / Blocked Human Re-entry; no direct repair, deletion or silent cleanup authorized by this documentation request.
- Ambiguous legacy migration records: Same Spec Phase 4; report in IDE/Codex dry-run, no product `待確認附件` UI.
- Strict chronological approval order: No Tracking, explicitly rejected by the Phase 3 product decision.
- Duplicate formal same drawing + same revision: No Tracking, explicitly rejected; same-revision changes must correct the existing package.
- Optional package completeness warnings as hard blockers: Blocked Human Re-entry; rejected for Phase 2 unless product rule changes.
- Automatic BOM revision for no-impact: No Tracking, explicitly rejected by product rule.
- Automatic part-number revision for no-impact: No Tracking, explicitly rejected by product rule.

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 1 - Controlled Revision Package Integration | Authorized and implemented locally on 2026-07-03 | Implemented / verification passed locally | Integrate FFF, selected/uploaded files, Pending submission and `submission_id` link | Production, migration unless stop condition, CAD/OCR dependency, forced part/BOM revision | User `執行開發` authorization | Pending package and FFF assessment linked; no-impact keeps part/BOM unchanged with reviewer confirmation | tsc, change-control QC, drawing-submission QC, mutation QC, local page/API smoke |
| Phase 2 - Multi-File Revision Package Intake (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`) | Authorized and implemented locally on 2026-07-05 | Implemented / verification passed locally | Multi-file package upload, role auto-classification, inline correction, warning-only completeness, snapshot evidence and reviewer warning parity | Production, CAD/OCR extraction, optional-role hard blocking, FFF/part/BOM rule changes, dedicated mobile UI | User `執行開發` authorization | Multi-file same-revision package can submit; warnings show on submitter and reviewer pages without blocking | tsc, lint, `qc:pdm-change-control` 57/57, desktop Playwright smoke, snapshot/API/static evidence |
| Phase 3 - Out-of-Order Revision Acceptance And Latest/History View (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`) | Authorized and implemented locally on 2026-07-05 | Implemented / verification passed locally | Suggested next revision, out-of-order submit/approve, duplicate same-revision guard, latest/history recompute and latest-only first-level display | Production repair, duplicate formal same-revision records, strict chronological approval, FFF/part/BOM rule changes, dedicated mobile UI | User `執行開發` authorization | Lower backfilled revision approves into history; higher revision becomes latest; first-level views show latest only | tsc, lint, `qc:pdm-change-control` 61/61, approve/retry-release static guard, in-memory release lifecycle tests, latest/history UI static guard |
| Phase 4 - First-Class Revision Attachment Package Model (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`) | Authorized and implemented locally on 2026-07-06 | Implemented / verification passed locally | First-class packageId model, package files, supplement request/approval, migration dry-run | Production, direct repair, CAD/OCR, product pending-area for ambiguous migration | User `執行開發` authorization after guided Phase 4 decisions | PackageId governs formal package; Released core immutable; supplements approved and tagged | tsc, lint, `qc:pdm-drawing-revision-package-model` 59/59, `qc:pdm-change-control` 61/61, local SQLite `db:init`; browser supplement evidence still recommended |
| Phase 5 - Extraction Assistance | Not authorized | RD Contract Ready / Not Authorized | Optional title-block extraction and richer file role validation | External license/cost and production CAD processing | Phase 4 implemented/verified plus authorization | Extraction assists but does not override RD correction | Adapter tests, mismatch negative cases |
| Phase 6 - Production Cutover / Historical Classification | Not authorized | Release Gate Contract Ready / Parked | Production rollout and historical attachment-only classification | Deletion, silent repair, unapproved migration | Implemented applicable phases plus release gate | Production smoke passes and historical risk classified | Release gate package, migration dry-run, rollback evidence |

Stop conditions:

- RD needs production deploy, production migration, direct DB mutation, historical repair or data deletion.
- Existing submission snapshot cannot preserve selected attachment IDs and FFF assessment link without migration.
- Package creation cannot be transactional or safely compensated.
- Implementation would treat attachment upload alone as formal released revision.
- Implementation would force part/BOM revision for no-impact drawing changes.
- Implementation keeps one-file upload as the only practical primary flow for a revision package.
- Implementation hides submitter package warnings from reviewer page/drawer.
- Implementation blocks submit solely because optional recommended package roles are missing.
- Implementation blocks approval solely because a newer different revision already exists.
- Implementation lets an older backfilled revision replace a newer latest revision.
- Implementation creates duplicate formal records for the same drawing + revision.
- Implementation edits Released package core in place instead of using supplement/new revision path.
- Implementation creates product `待確認附件` UI for migration ambiguity.
- Existing change-control or drawing submission regression QC fails outside this scope.

Next condition:

- Continue only for APP validation feedback or explicitly authorized later-phase work.
- Do not run product implementation, production deploy, migration, direct historical repair, data deletion, CAD/OCR extraction Phase 5 or forced part/BOM revision from this documentation entry.

## 3. External Blockers / Parked Scope

These are not executable by RD without external evidence or explicit PM approval. Keep the task lines in this table so `qc:dev-task-evidence-sync` can continue to audit blocker state.

| Status | ID | Scope | Reason / recovery condition |
|---|---|---|---|
| [!] | DEV-IND-007 | SQLite to Postgres / Supabase shadow migration | Supabase runtime work is controlled by `DEV-SUPABASE-DB-001`. Recovery requires disposable Supabase / Postgres shadow target, live RLS plan, disposable target live compare, and `npm.cmd run qc:postgres-shadow` evidence. |
| [!] | DEV-CAD-001 | SolidWorks Document Manager or equivalent reader | Needs SolidWorks Document Manager API 或等效授權元件 / SolidWorks Document Manager 或等效讀取元件 evidence. |
| [!] | DEV-SW-001 | SolidWorks Add-in real-machine validation | Needs SolidWorks Add-in 實機驗證 evidence. |
| [!] | DEV-BACKUP-001 | Offline one-way backup and restore drill | Needs 離線單向備份與還原 / restore-drill evidence. |
| [!] | DEV-FIELD-001 | Formal field-test evidence | Needs 正式現場測試 evidence. |
| [!] | DEV-STORAGE-COST-001 | Storage governance and cost rollout | Parked until real storage target, inventory, lifecycle policy, cost, and production timing are approved. |

External evidence checklist retained for `qc:dev-task-evidence-sync`:

- [ ] 取得 disposable Supabase / Postgres shadow target。
- [ ] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。
- [ ] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。
- [ ] `P0` 確認 SolidWorks Document Manager 授權與可部署方式。
- [ ] `P0` SolidWorks Document Manager API 或等效授權元件。

## 4. Completed / Evidence Summary

Full completed-task index: `.ai-doc/archived/completed-dev-index-2026-06.md`.

| ID | Completed state | Current treatment | Evidence summary |
|---|---|---|---|
| `DEV-PDM-LIFECYCLE-ACTIONS-001` | Phase 1-6 local/staging implementation and QC evidence are captured; local commit `21bcf16`. | Logical Archive / Protected Evidence. Production/Supabase production cutover remains excluded and unapproved. | Phase 5 unified controlled-history UI/API slice is implemented/QC-checked. Phase 6 local/staging release readiness records production/Supabase production exclusion and User has authorized scoped Git/index cleanup. Unified controlled history covers released submissions, formal part numbers, formal drawing numbers, and released BOM. Evidence includes `npm.cmd run qc:pdm-lifecycle-controlled-history` 56/56, `npm.cmd run qc:pdm-lifecycle-controlled-history-ui` 30/30, `npm.cmd run qc:pdm-lifecycle-submission-obsolete` 20/20, `npm.cmd run qc:pdm-lifecycle-release-readiness` 47/47, and screenshots `output/playwright/pdm-lifecycle-controlled-history-desktop.png`, `output/playwright/pdm-lifecycle-controlled-history-mobile.png`. |
| `DEV-PDM-CHANGE-CONTROL-001` | Phase 1-5 local implementation completed and QC-captured. | Logical Archive / Protected Evidence; optional follow-up only if PM expands scope. | ADR/SPEC/implementation contract/QA and `scripts/qc-pdm-change-control.mjs`; QC reports for Phase 1, 2, 3, and 4-5; `npm.cmd run qc:pdm-change-control` 50/50; `npx.cmd tsc --noEmit --pretty false`. |
| `DEV-PDM-REVISION-001` | Numeric no-`V` revision policy implemented; manual QA plan prepared. | Closed local package. | Branch `codex/pdm-revision-policy`; commits `8f472d0`, `af08d81`; `qc:master-attachments`, `qc:revision-lifecycle`, `qc:policy-alignment`; QA plan `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`. |
| `DEV-SW-LICENSE-PDM-001` | Company-scoped PDM boundary implemented and committed. | Logical Archive / Protected Evidence because QC scripts reference original package paths. | Supabase staged evidence commit `be333eb` (`DEV-SUPABASE-DB-001 record staging gate B evidence`), scoped SW/PDM commit `6f4dbab` (`DEV-SW-LICENSE-PDM-001 add company-scoped PDM boundary`), PM handoff `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`, and `qc:sw-license-pdm-git-boundary`. |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging gate passed for `AI_PDM_STAGING`; smoke write/readback/cleanup and rollback proof captured. | Protected Evidence; parent production/cutover remains deferred. | Approval package, runbook, smoke API matrix, target identity receipt, execution report, QA/QC staging validation, permission seed repair, rule seed repair, migration history policy, rollback readiness, data parity policy. |
| `DEV-SUPABASE-DB-001-GATE-B-STAGING-QA-QC` | QA/QC staging validation passed for `AI_PDM_STAGING`. | Protected Evidence. | QA plan and QC read-only report; zero active smoke residue; production and cutover remain explicitly unapproved. |
| `DEV-SUPABASE-DB-001-GATE-B-PERMISSION-SEED` | Permission repair passed. | Protected Evidence. | `roles=6`, `role_permissions=86`, active priority=1; admin matrix, rule simulator, duplicate check returned HTTP 200. |
| `DEV-SUPABASE-DB-001-GATE-B-RULE-SEED` | Minimal `numbering-rule-v1` seed repair passed. | Protected Evidence. | `numbering_rule_versions=1`; `numbering-rule-v1` exists and is active; write path no longer fails FK. |
| `DEV-SUPABASE-DB-001-MIGRATION-HISTORY` | Migration history policy accepted for staging exception; Supabase CLI is absent locally. | Protected Evidence. | Migration history policy; `qc:supabase-migration-history-policy`; `qc:supabase-runtime-migrations`; `supabase/migrations/manifest.json`. |
| `DEV-SUPABASE-DB-001-ROLLBACK-PROOF` | Rollback readiness prepared and passed after stopping Postgres-mode local process. | Protected Evidence. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness`; `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>`. |

## 5. Supabase Protected Evidence Contract

This section intentionally keeps exact evidence names because several QC scripts read `dev_task.md` directly.

| Evidence / gate | Current state | QC token or path |
|---|---|---|
| `DEV-SUPABASE-DB-001-GATE-A` | Done for preparation; runtime execution evidence belongs to GATE-B. | `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`; `qc:supabase-runtime-gate-plan` |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred. | `.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md`; GATE-B approval package; `qc:supabase-runtime-approval-package` |
| GATE-B execution runbook | GATE-B execution runbook prepared. | `.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md`; `qc:supabase-runtime-gate-b-runbook` |
| Runtime smoke API matrix | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md`; `qc:supabase-runtime-smoke-api-matrix` |
| Runtime smoke auth/session boundary | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md`; `qc:supabase-runtime-smoke-auth-session-boundary` |
| Runtime smoke report template | Prepared controlled evidence. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md`; `qc:supabase-runtime-smoke-report-template` |
| Runtime smoke execution report | Passed; app API write/readback/cleanup and current state captured. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `qc:supabase-runtime-smoke-report` |
| GATE-B local pre-approval suite report | Prepared. | `qc:supabase-runtime-gate-b-local-suite-report` |
| GATE-B staging QA/QC validation | QA/QC staging validation passed for `AI_PDM_STAGING`; No production access. No production cutover. | `.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`; `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md` |
| Target identity receipt template and user-provided receipt | Recorded; target is `AI_PDM_STAGING`; no production/cutover approval. | `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`; `qc:supabase-target-identity-receipt` |
| Runtime rollback readiness | Rollback readiness prepared and passed. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness` |
| Data parity policy | `DEV-SUPABASE-DB-001-DATA-PARITY` policy prepared; execution not approved. | `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`; `qc:supabase-data-parity-policy` |
| Current Supabase change impact audit | Current Supabase change impact audit is prepared as local evidence. | `.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md`; `qc:supabase-current-change-impact` |

Supabase stop wording required by QC:

- Production target setup or production cutover is not approved.
- Cost-incurring actions are not approved.
- No repository file contains runtime secrets.
- Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`.

## 6. Verification Contract

Static checks for this control board:

- `git diff --check -- .ai-doc/dev_task.md .ai-doc/documentation_map.md .ai-doc/archived`
- Search all `DEV-` IDs and confirm unfinished IDs remain in this file.
- Confirm moved or logically archived evidence has no broken active link.

Primary QC commands:

- `npm.cmd run qc:dev-task-evidence-sync`
- `npm.cmd run qc:pdm-lifecycle-actions-git-boundary`
- `npm.cmd run qc:pdm-lifecycle-release-readiness`
- `npm.cmd run qc:sw-license-pdm-git-boundary`
- `npm.cmd run qc:supabase-runtime-local-readiness` only when Supabase runtime docs are touched or as regression evidence.

Known limitation:

- `qc:pdm-lifecycle-actions-git-boundary` is a historical pre-commit boundary script. After the lifecycle package was closed in commit `21bcf16`, it can fail because it still expects lifecycle candidate files to be present in staged, unstaged, or untracked changes. Treat `qc:pdm-lifecycle-release-readiness` plus commit `21bcf16` as the current closed-package evidence unless the boundary script is explicitly updated.

## 7. Stop Conditions

- Do not mark documentation restructuring as product Done.
- Do not delete unfinished tasks or move them only to archive.
- Do not physically move protected evidence while QC scripts still reference hardcoded paths.
- Do not execute blocked, deferred, parked, production, cutover, migration, data parity, or external-service scopes without explicit authorization.
- Do not stage unrelated dirty files.

## 8. Latest Update

- 2026-07-09: Resolved the system drawer QC false blocker for the approval platform legacy redirect and aligned adjacent active QC contracts. `scripts/qc-pdm-system-detail-drawer-ui.mjs` now treats `/numbering/approvals` as the intended legacy redirect into canonical `/approvals` and verifies the approval workbench detail-panel contract, compatibility message and supporting CSS instead of requiring `PdmDetailDrawer` in the redirected legacy page. Related lifecycle/numbering QC now also validates `/numbering/approvals` and `/bom/reviews` as legacy workbench redirects rather than stale independent reviewer pages. Evidence: `npm.cmd run qc:pdm-system-detail-drawer-ui` 72/72, `npm.cmd run qc:pdm-approval-platform` 106/106, `npm.cmd run qc:pdm-numbering-approval-review-ui` 10/10, `npm.cmd run qc:pdm-lifecycle-actions` 272/272, `npm.cmd run qc:pdm-lifecycle-obsolete` 115/115 and `npm.cmd run qc:pdm-numbering-core` 241/241 passed. `npm.cmd run qc:pdm-status-ui-vocabulary` still has an unrelated existing blocker at `src/app/settings/page.tsx` plain `<th>狀態</th>`; the approvals redirect portion was aligned but that broader status vocabulary issue is not part of this fix. No product UI, schema, data repair, merge, PR, deployment, rollback or release artifact was changed.
- 2026-07-09: Implemented `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1C-B after user RD authorization. Added a drawing revision FFF impact review adapter to the unified approval inbox, mapped workbench decisions back through the platform facade to the existing change-control domain action, hid unsupported decision buttons from legacy detail payloads, and changed `/numbering/approvals`, `/bom/reviews`, and `/numbering/change-reviews` into server redirects to equivalent `/approvals` filter states with `legacyRedirect` compatibility messages. Direct drawing revision review API actions now delegate through the approval platform facade. Evidence: `npx.cmd tsc --noEmit --pretty false` passed, `npm.cmd run qc:pdm-approval-platform` passed 106/106, source-scoped lint for touched approval files passed, `npm.cmd run dev:local:check` healthy, and legacy route smoke returned 307 redirects to the expected workbench URLs. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. No physical historical migration, production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-09: 依新的 Dev PM canonical format 重構開頭總任務清單，並依使用者要求強制中文化。總任務清單現在位於文件開頭附近，使用狀態符號放在 `DEV-001` 到 `DEV-038` 短碼前方，且每個短碼都映射回既有語意來源 ID，例如 `DEV-PDM-APPROVAL-PLATFORM-001`。總表標題、狀態、授權、來源、父任務、下一步與交付判定皆改為中文；既有 semantic DEV ID、詳細任務章節、證據路徑與 QC 腳本會讀取的 protected references 保持不變。未執行產品實作、schema migration、production deploy、直接資料修復/刪除、merge、PR、rollback 或 release artifact。
- 2026-07-08: Implemented `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1C-A after user RD authorization. `/approvals` is now the single primary reviewer approval sidebar entry labeled `審核工作台`; specialized reviewer decision entries `BOM 審核`, `發行審核` and `圖面進版影響審核` were removed from primary navigation while non-review creation/preparation entries remain. Sidebar pending badge reads the reviewer-role-gated, company-scoped inbox API; `/approvals` now has status/domain/action filters with URL query deep links. Inbox API accepts explicit status/domain/action filters and requires `R&D Manager` or `Admin`. QC updated to prevent regression. Evidence: `npx tsc --noEmit` passed, `npm run qc:pdm-approval-platform` passed 88/88, `npm run lint` passed with 0 errors / 3 unrelated warnings, `npm run dev:local:check` healthy, Playwright desktop/mobile no-overflow screenshots captured at `output/playwright/approval-workbench-desktop.png` and `output/playwright/approval-workbench-mobile.png`, and role-boundary smoke confirmed manager access plus engineer badge hidden/forbidden. `npm run build` was not rerun because the local-dev guard refused to clean `.next` while the healthy project-owned dev server was listening on port 3000; no bypass was used. Phase 1C-B legacy redirect, physical historical migration, production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.
- 2026-07-08: Implemented and verified `DEV-PDM-NUMBERING-004` Phase 1-3 after user RD authorization. Added contextual entrypoint component, root/drawing/part drawer CTAs, existing-root append APIs for drawings/parts/combined drawing+part relation, root obsolete impact and aggregate approval request support, `/numbering/request` `既有主根號追加` fallback, schema/permission/action-code seeds, focused QC and evidence report. Evidence: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`, `npm.cmd run qc:pdm-numbering-contextual-entrypoints` 31/31, isolated API smoke 10/10 creating `A0001-M02`, `A0001-R01`, `A0001-P02`, combined `A0001-M03 + A0001-P03`, and browser screenshots under `output/playwright/pdm-numbering-contextual-entrypoints/`. Production deploy, Supabase live migration/cutover, provider pointer change, direct runtime data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.
- 2026-07-08: Implemented and locally verified `DEV-PDM-FILE-STORAGE-001` after the user's Supabase-core / Drive-backup decisions. Added provider/bucket/key metadata pointers for submission files and release packages, provider-aware file/download/release-package/master attachment/preview reads, Supabase fail-closed runtime config with local fallback, local-provider-only legacy Drive release movement, Drive backup plan/execution helpers, tiered required/selective/excluded coverage, version/hash folder isolation for repeated filenames, no first-version delete/overwrite behavior, manifest templates, `.metadata.json` non-secret sidecars, restore index and drift report templates. Added QC report `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`. Verification passed: `npm run qc:pdm-file-storage-supabase-core-drive-backup` 37/37, `npm run qc:file-storage-contract` 82/82, `npm run qc:file-storage-local-provider-regression` 34/34, `npm run qc:file-storage-migration-dry-run` 17/17, `npx tsc --noEmit --pretty false`, and `npm run lint -- --quiet`. `npm run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000 with PID 47036; no bypass was used. No Supabase bucket creation, live Supabase write, migration execution, provider pointer switch, live Google Drive write, production deploy/cutover, merge, PR, rollback or production smoke was performed.
- 2026-07-08: Updated `DEV-PDM-APPROVAL-PLATFORM-001` with reviewer-entrypoint governance from user guided decisions `1B / 2A / 3 phased A -> B`. Phase 1C-A is now documented as `RD Implementation Ready / Not Authorized`: single `審核工作台` primary sidebar entry, permission-scoped pending-review badge and workbench filters replacing specialized reviewer sidebar entries. Phase 1C-B is `RD Contract Ready / Not Authorized`: long-term legacy reviewer route redirect/bridge into workbench filters/details after parity and deep-link QC. First slice explicitly excludes due date, owner, overdue, SLA escalation and external notifications. Updated approval platform spec, QA plan, dev_task and documentation_map. No product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-08: Completed `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1A-1B local platform foundation after user RD authorization. Added ADR `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`, additive `approval_platform_*` schema with immutable SQLite impact snapshots and append-only decisions/events, generated Postgres initial/RLS planning updates, platform repository/service, `/api/approvals/*`, `/approvals` UI, sidebar entry, legacy read/decision adapters for numbering/submission/BOM/part-cost/drawing-package supplement records, friendly-route decision delegation through platform adapters, focused QC `scripts/qc-pdm-approval-platform.mjs`, and guarded migration dry-run/apply tooling in `scripts/generate-pdm-approval-platform-migration-dry-run.mjs`. Evidence: `npx.cmd tsc --noEmit --pretty false` passed, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed, `npm.cmd run qc:pdm-approval-platform` passed 69/69, `npm.cmd run qc:pdm-approval-platform-migration-dry-run` passed with zero current legacy records in `data/ai-pdm.sqlite` and an in-memory guarded apply/parity self-test, `npm.cmd run qc:pdm-lifecycle-actions` passed 270/270, `npm.cmd run qc:pdm-lifecycle-obsolete` passed 111/111, and browser screenshots were captured under `output/playwright/pdm-approval-platform/`. Physical historical migration execution, production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.
- 2026-07-08: Updated `DEV-PDM-APPROVAL-PLATFORM-001` after RD supervisor completeness review and user decisions `1C / 2B / 3C`. Phase 1A is now `RD Implementation Ready / Not Authorized` for a no-migration architecture spike and ADR before schema/migration work; Phase 1B-6 remain `RD Contract Ready / Not Authorized`. Pre-launch blockers are platform core, numbering/root/drawing/part and submission/BOM; cost/supplement may start as adapters; all known historical approval-like records must be physically migrated before launch readiness. Updated spec, ADR, QA plan, dev_task and documentation_map. No product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-08: Added `DEV-PDM-APPROVAL-PLATFORM-001` development documents from the user's stability-first architecture decision that full-system approval platformization should be completed before launch. Added spec `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`, ADR `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md` and QA plan `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`, plus dev_task and documentation_map entries. State is `Spec Ready / Human Confirmed; RD Contract Ready / Not Authorized`; no product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-08: Added `DEV-PDM-NUMBERING-004` development documents from guided decisions `1B / 2B+C / 3B` after the user could not find UI entrances for adding `M02/R01`, adding `P02`, and applying obsolete to root/drawing/part. Added spec `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md` and QA plan `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`, plus dev_task and documentation_map entries. State is `Prepared / RD Implementation Ready / Not Authorized`; no product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07: Completed `DEV-PDM-NUMBERING-003` Phase 2-3 local runtime cutover after user authorized completing all development tasks. Added `scripts/pdm-numbering-v3-cutover.mjs`, package commands `pdm:numbering-v3:cutover-dry-run` / `pdm:numbering-v3:cutover-apply`, and `scripts/qc-pdm-numbering-v3-formal-cutover.mjs`. Dry-run report passed with 24 `safe_map`, 0 `collision`, 0 `manual_review`, 0 blockers and 39 exact operational references to rewrite. Local runtime apply backed up `data/ai-pdm.sqlite` to `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`, converted 8 roots, 8 part numbers and 8 drawing numbers to v3, retained audit/file/release historical evidence strings, and left no legacy master identities or legacy operational references. Verification passed: `npm.cmd run qc:pdm-numbering-v3-formal-cutover` 8/8, `npm.cmd run qc:pdm-numbering-v3-alpha-root` 14/14, `npm.cmd run qc:pdm-numbering-core` 241/241, `npm.cmd run qc:pdm-change-control` 62/62, `npm.cmd run qc:pdm-numbering-gap-reuse` 8/8, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run build` and `npm.cmd run dev:local:check`. Production/Supabase action, provider pointer change, direct data repair/deletion outside the scripted local cutover boundary, merge, PR, rollback, production smoke and release artifact were not performed.
- 2026-07-07: Implemented and verified `DEV-PDM-NUMBERING-003` Phase 1 local v3 creation/compatibility after user development authorization. Added/confirmed v3 `A0001-Z9999` rule/default creation, v3 parser/formatter helpers, v1/v2/v3 read compatibility, legacy numeric root ordinal reservation, formal-root reuse guard using audit/control root evidence, and neutral governance wording so root letters remain capacity bands only. `M` remains drawing category only; relation UI/API now uses manufacturing-basis relation wording instead of `可製造` wording, and `R` remains blocked from manufacturing basis. `I/O/Q` exclusion was evaluated/documented but not adopted. Verification passed: `npm.cmd run qc:pdm-numbering-v3-alpha-root` 14/14, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 62/62, `npm.cmd run qc:pdm-numbering-core` 241/241, `npm.cmd run qc:pdm-numbering-gap-reuse` 8/8 and `npm.cmd run qc:pdm-numbering-qc-isolation` 46/46. No production/Supabase action, provider pointer change, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07/08: Amended `DEV-PDM-ACCESS-CONTROL-001` after user reported that the role/rule settings UI still exposed English, developer language, and then unreadable rule summaries. `/settings/workflow` role management now renders approval rule summaries, action selectors, phase/status/item-kind selectors, risk flags, hard-rule labels/messages, rule version labels, delegation action selectors and role-priority/version summaries in Chinese management language while keeping internal codes in value/API layers. The approval matrix first column is now a readonly `規則摘要`; new and existing rules derive that summary from trigger action, condition, control and approver role, and the admin matrix API/repository ignore free-form `ruleName` input by regenerating the stored `rule_name`. Rule summaries use a management-readable `情境 / 處理` sentence pattern instead of slash-joined field values or raw control terms, and the UI displays situation and handling on separate lines. Added focused browser QC assertions and screenshots for desktop/mobile rule-matrix Chinese visibility, readable summary sentence shape, situation/handling line break, no editable rule-name input and no visible `actionCode`/`riskFlag`/status/hard-rule code leakage. Also fixed admin matrix API resilience by ensuring v1/v2/v3 numbering rule version seeds exist before copying default approval rules, preventing old local SQLite files from failing FK checks when `numbering-rule-v3-alpha-root` is the default. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run qc:pdm-access-control-governance` 88/88, `npm.cmd run lint` with 0 errors and 3 existing warnings in `src/components/master-attachment-panel.tsx`. Screenshots: `output/playwright/access-control-rule-matrix-desktop.png`, `output/playwright/access-control-rule-matrix-mobile.png`. No production deploy, live Supabase migration, direct deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07: Completed RD supervisor document-completeness review for `DEV-PDM-SUBMISSION-GATE-001` after user decisions `1C / 2B / 3B`. Updated the spec, ADR, QA plan, dev_task and documentation_map to define that `ApprovedForTransfer` is a controlled handoff package approval and must not directly mutate drawing/part/root master lifecycle; formal release work items are created by RD Manager/Admin and routed through the existing release workflow. Rule matrix controls Manufacturing/Procurement/QA/QC sign-off applicability; not-applicable requires rule source or RD Manager/Admin reason/audit. Package item or readiness-driving data changes invalidate the readiness snapshot and affected sign-offs. Also documented QA/QC role naming, idempotency, unique constraints/indexes, transaction boundaries, stale snapshot/sign-off gates and visible-error QC gates. This remains documentation-only; product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback and release artifacts remain unauthorized.
- 2026-07-07: Amended `DEV-PDM-SUBMISSION-GATE-001` after HCS completeness review and user decisions `1B / 2B / 3C`. Added ADR `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md` and updated the spec, QA plan, dev_task and documentation_map. Fixed the earlier ambiguity by defining that technical transfer requires package context and case/change reason, one-item transfer packages require `no other affected items` declaration plus reviewer scope confirmation, technical transfer has no missing-required-data exception, applicable Manufacturing/Procurement/QA/QC sign-offs occur after readiness passes, and research exceptions require reviewer/supervisor decision before final approval. This remains documentation-only and not authorized for product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifacts.
- 2026-07-07: Added `DEV-PDM-SUBMISSION-GATE-001` development documents from HCS guided decisions. User selected 1B with the critical amendment that technical transfer cannot be a direct single drawing/part submission and must use a case-scoped transfer package for a whole development case or design-change case; selected 2B versioned rule matrix and 3B transfer hard-block / research controlled exception. Added spec `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md` and QA plan `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`, plus dev_task and documentation_map entries. Status is RD Contract Ready / Not Authorized; Phase 1 mode/rule resolver is RD Implementation Ready / Not Authorized; Phase 2 research redesign, Phase 3 transfer package builder, Phase 4 rule admin and Phase 5 release remain unapproved. No product implementation, schema migration, production deploy, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07: Implemented and verified `DEV-PDM-DRAWING-PART-RELATION-VIEW-001` Phase 1-3 locally after user authorization. `/numbering/search` now defaults to a root-grouped 圖料關係樹, includes a matrix review mode, and uses new `/api/numbering/relations` GET/POST contracts. The relation API is permission/company scoped, classifies manufacturing/reference/ambiguous states server-side, and controlled maintenance operations write `numbering.drawing_part.relation_maintain` audit while protecting locked statuses. Updated search UI QC, master workbench QC and added focused relation QC. Also fixed `/parts` drawer switching so stale detail is cleared and the drawer stays open while the new detail loads. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`, `npm.cmd run qc:pdm-numbering-search-ui` 30/30, `npm.cmd run qc:pdm-master-workbench-layout` 205/205, and `npm.cmd run qc:pdm-drawing-part-relation-view` 56/56 against disposable runtime `output/qc-runtime/pdm-relation-20260707-001`. Screenshots are under `output/playwright/pdm-drawing-part-relation-view/`. No schema migration, production deploy, Supabase live cutover, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07: Added `DEV-PDM-DRAWING-PART-RELATION-VIEW-001` development documents from APP feedback that the 圖料模組 flat list is meaningless and does not show root/drawing/part relationships. Added spec `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md` and QA plan `.ai-doc/qa/qa-pdm-drawing-part-relation-view-validation-plan-2026-07-07.md`, plus dev_task and documentation_map entries. Phase 1 is RD Implementation Ready for a root-grouped relationship tree that supports one root to many drawings, one drawing to many parts and one part under multiple drawings. Phase 2 matrix review and Phase 3 relationship maintenance are captured as not authorized. No product implementation, schema migration, production deploy, Supabase live cutover, relationship write/edit action, direct data repair/deletion, merge, PR, rollback or release artifact was performed.
- 2026-07-07: Corrected `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 3 allocation policy after the user's critical review that earlier empty roots should be reused unless they have entered formal control and were voided/obsoleted. Changed V2 root allocation in both async and sync numbering repositories from cursor/high-water allocation to gap-aware lowest-available allocation based on controlled `part_roots` rows. Existing master rows remain occupied regardless of status; purged test roots absent from master rows are reusable. Added `scripts/qc-pdm-numbering-gap-reuse.mjs` and package script `qc:pdm-numbering-gap-reuse`. Runtime evidence now shows occupied roots `00007`, `00014`, `00056`, `00057`, `00058`, `00059`, root sequence cursor `60`, and computed lowest available root `00001`; `00059` was not deleted or reclassified. Verification passed: `npm run qc:pdm-numbering-gap-reuse` 8/8, `npx.cmd tsc --noEmit --pretty false`, lint, numbering core 241/241, sequence integrity 3/3, duplicate-submit guard 10/10, transaction QC 4/4, and `git diff --check` with line-ending warnings only.
- 2026-07-07: Executed `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 3 local runtime repair and duplicate-submit PA after the user's decision that only records currently visible in the drawing-number module UI are formal data and other local numbering pollution is test data. Backed up `data/ai-pdm.sqlite` to `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`, retained formal roots `00007`, `00014`, `00056`, `00057`, `00058`, purged 53 test root create-audit rows, deleted 125 obsolete/test sequence keys, cleared numbering workflow/test rows, inserted a `numbering.sequence_repair` audit entry, and set `company-jenfu:part_root:v2.next_value` to `59`. Added UI in-flight/success submit lock and server-side same company/user/payload 60-second replay guard before root allocation. Verification passed: repair/integrity runtime `clean=true`, retained roots 5, audit-created roots 5, purged test roots 53, missing audit roots from master 0, `npm run qc:pdm-numbering-duplicate-submit-guard` 10/10 and `npx.cmd tsc --noEmit --pretty false`. Production/Supabase action, visible formal-number renumbering, release artifact and Git action were not performed.
- 2026-07-07: Implemented and verified `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 1/2 after the user's `完成此開發任務` instruction. Added `scripts/numbering-qc-runtime-guard.mjs`, guarded allocating numbering QC scripts from using protected `data/ai-pdm.sqlite`, added `qc:pdm-numbering-qc-isolation`, added read-only/report-only `qc:pdm-numbering-sequence-integrity`, hardened SQLite async transactions with `BEGIN IMMEDIATE`, and wrapped `createNumberingRecord` in the async repository transaction boundary for SQLite and Postgres parity. Added failure-injection transaction QC and QC report `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`. Verification passed: isolation QC 46/46, integrity QC 3/3, transaction QC 4/4, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm run qc:pdm-numbering-core` 241/241 and `git diff --check` with line-ending warnings only. `npm run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000 with PID 35812; no bypass was used. Runtime report-only evidence still shows `clean=false`, `nextValue=57`, `retainedRoots=3`, `auditCreatedRoots=56` and `missingAuditRootsFromMaster=53`; no reset, reuse, backfill, voiding, deletion, local DB repair, production/Supabase action, release artifact or Git action was performed.
- 2026-07-07: Added `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` development documents from the numbering serial-order CAPA. Root cause is captured as QC/regression scripts consuming shared runtime v2 root sequence values, then deleting master rows while `numbering_sequences` and audit evidence remained advanced. Added spec `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`, QA plan `.ai-doc/qa/qa-pdm-numbering-sequence-capa-validation-plan-2026-07-07.md`, a `dev_task` row/section and `documentation_map.md` cold-start guidance. This initial documentation-only state was later superseded the same day by the Phase 1/2 implementation record above. Phase 3 local data repair and Phase 4 production/Supabase remain blocked human re-entry. No sequence reset, data repair, production deploy, release artifact or Git action was performed in this documentation step.
- 2026-07-07: Completed approved `DEV-PDM-NUMBERING-002` Phase 4 local/runtime formal cutover after explicit user authorization. Added `scripts/pdm-numbering-v2-cutover.mjs`, `pdm:numbering-v2:cutover-dry-run`, `pdm:numbering-v2:cutover-apply` and `qc:pdm-numbering-v2-formal-cutover`; stopped the project-owned local server before apply; backed up `data/ai-pdm.sqlite` to `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`; rewrote runtime master identities from `0007/0014`, `P-0007-001/P-0014-001`, `D-0007-MA1/D-0014-MA1` to `00007/00014`, `00007-P01/00014-P01`, `00007-M01/00014-M01`; updated operational references in submissions, snapshots, approval/task/notification/warning JSON and related lookup fields; retired `numbering-rule-v1` and kept `numbering-rule-v2` active for normal creation; intentionally retained historical audit/file/release-package path strings as protected evidence. Also fixed change-control replacement release to require compact v2 part numbers and fixed `/parts` drawer keyboard/detail race discovered by QC. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`, `npm.cmd run qc:pdm-numbering-v2-formal-cutover` 11/11, `npm.cmd run qc:pdm-numbering-v2-compact-identity` 13/13, `npm.cmd run qc:pdm-numbering-core` 241/241, `npm.cmd run qc:pdm-change-control` 62/62, API regression 27/27, data consistency 16/16, concurrency reuse 32/32, draft lifecycle 29/29, request UI 66/66, search UI 28/28, impact UI 24/24, DVT UI 24/24, `qc:master-attachments` 101/101, `qc:pdm-master-workbench-layout` 224/224 and `qc:supabase-runtime-migrations` 25/25. External production/Supabase live deploy, provider pointer cutover, physical historical file/path rewrite, project/order/equipment numbering and extra visible category codes remain separately gated and not executed.
- 2026-07-07: Earlier same-day `DEV-PDM-NUMBERING-002` Phase 1-3 work was implemented and verified locally before the later approved Phase 4 cutover. New normal numbering created compact v2 roots/parts/drawings (`00001`, `00001-P01`, `00001-M01`, `00001-R01`), normal drawing purpose creation became `M/R`, v1 `MA/OT` remained readable through semantic helpers, approval-rule defaults were available for v2, downstream manufacturing checks used `MA/M` semantics, import examples and migration dry-run reporting were updated, Supabase runtime migration 004 was added and registered, and master identity tables kept mobile card stacking for the updated status/context column. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-numbering-v2-compact-identity` 13/13, `npm.cmd run qc:pdm-numbering-v2-migration-dry-run`, `npm.cmd run qc:pdm-numbering-core` 241/241, API regression 27/27, data consistency 16/16, concurrency reuse 32/32, draft lifecycle 29/29, request UI 66/66, search UI 28/28, impact UI 24/24, DVT UI 24/24, `qc:master-attachments` 101/101, `qc:pdm-master-workbench-layout` 224/224 and `qc:supabase-runtime-migrations` 25/25. At that earlier phase, `npm.cmd run build` was blocked by the intentional local-dev guard because an existing Next server owned `http://127.0.0.1:3000` with PID 30948; no bypass, production deploy, production migration, v1-to-v2 data rewrite, direct DB repair/deletion, project/order/equipment numbering or extra visible category code work was performed then.
- 2026-07-07: Implemented and verified `DEV-PDM-STATUS-UX-002` Phase 1 after user `執行開發` authorization. Added task/import row/import batch/settings lifecycle/job/restore policy/DVT readiness presentation contexts in `src/lib/status-display.ts`, moved affected pages away from generic workflow/fileSync/masterRecord help where misleading, changed approval wording from `待補件` to `待補資料`, clarified mixed `其他` columns as `狀態 / 階段 / 提醒`, and expanded focused status vocabulary QC. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-status-ui-vocabulary` 81/81, browser status-context checks 73/73, DVT fixture browser check 11/11, mobile 390px task popover sanity 4/4, and `npm.cmd run dev:local:check`. Screenshots are under `output/playwright/status-context-disambiguation/`. No DB/API/schema migration, production deploy, historical repair, audit raw-payload migration, workflow semantic change or Phase 2 scanner hardening was performed.
- 2026-07-07: Added `DEV-PDM-STATUS-UX-002` development documents for APP feedback that status help still mixes workflow, task, import, settings, job, restore and DVT readiness semantics. Added spec `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`, QA plan `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`, a `dev_task` row/section and `documentation_map.md` cold-start guidance. Status is `Prepared / RD Implementation Ready / Not Authorized`; no product implementation, DB/API/schema migration, production deploy, historical repair, audit raw-payload migration or workflow semantic change was performed.
- 2026-07-06: Amended and verified `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` with a real Windows Shell worker after fake preview images were rejected by APP validation, then added a SolidWorks Document Manager SLDDRW PNG worker/exporter path after APP validation showed 3D success but 2D still queued. Added `scripts/run-windows-shell-preview-worker.mjs`, `scripts/windows-shell-thumbnail-extractor.ps1`, `scripts/run-solidworks-document-manager-preview-worker.mjs`, `scripts/solidworks-document-manager-preview-exporter.cs`, default real worker enqueue, fake-derivative display suppression, blank/low-information PNG quality gating, clean failed-job user messages, and a `dev:local:restart` fix so tokenized local worker routes can be exercised. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-sw-native-preview-worker` 90/90, `npm.cmd run qc:pdm-sw-native-preview-redaction` 68/68, `npm.cmd run qc:master-attachments` 101/101, `npm.cmd run dev:local:check`, direct SLDPRT worker extraction, API claim/complete smoke for `D-0007-MA1.SLDPRT`, Document Manager compile-only smoke, SLDDRW API worker fail-safe smoke for missing worker-readable key, and browser smoke screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png`. `.SLDDRW` Shell output on this workstation was blank and is now failed cleanly; Document Manager worker is implemented but still needs Supabase Vault live secret read or worker-local key for successful drawing preview. No production deploy/migration, historical backfill, direct data repair/deletion, Phase 2 drawing PDF, Phase 3 interactive 3D or Phase 4 rollout was performed.
- 2026-07-06: Added `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` development documents from the user's request to make SolidWorks native previews work like Windows File Explorer. Added spec `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`, ADR `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`, and QA plan `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`. Status was `RD Contract Ready / Not Authorized`; no product implementation, schema migration, worker deployment, real Document Manager/equivalent run, production deploy/cutover, direct data repair/deletion or historical preview backfill was performed in that documentation-only step.
- 2026-07-06: Implemented and verified `DEV-PDM-SHARED-3D-MA-BASELINE-001` after the user's `授權給你, 完成這些開發任務` instruction. Added additive shared 3D / MA baseline schema for SQLite and Postgres, async repository/service, part/root shared model version APIs, MA package model-basis API, required-MA resolver, manufacturing baseline draft/release APIs, immutable released baseline snapshot behavior, submission release workflow model-basis gate for MA packages, approval action codes, part-level 3D/intermediate attachment categories, and a part-detail UI slice for shared 3D creation, MA model link / reviewed 2D-only exception and baseline draft/release. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20, `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59, `npm.cmd run qc:pdm-change-control` 61/61, `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9, `npm.cmd run qc:supabase-current-change-impact` 15/15 and browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule change and production cutover remain excluded.
- 2026-07-06: Implemented and verified `DEV-PDM-SETTINGS-CENTER-001` Phase 1 after the user's authorization. `/settings` now has a settings center overview/work queue, five management-area routes, SolidWorks secret lifecycle UI, server-only draft/test/activate/revoke APIs, dedicated secret metadata tables, RLS plan entries, redacted local test-double evidence and legacy Google Drive settings compatibility. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-settings-center-secret-lifecycle` 22/22, `npm.cmd run qc:supabase-secret-boundary` 15/15, `npm.cmd run qc:gdrive-folder-tree-settings` 35/35, `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9 and `npm.cmd run qc:supabase-current-change-impact` 15/15. Supabase Vault live write/smoke, production deploy/cutover, direct data repair/deletion, external-cost actions and real SolidWorks/CAD-reader proof remain separately gated.
- 2026-07-06: Added `DEV-PDM-SETTINGS-CENTER-001` long-task development package from the user's HCS settings-center decisions. The selected architecture is: `/settings` becomes a work-queue settings center with five management areas; Supabase Vault stores secrets; Supabase DB stores metadata only; PDM backend APIs operate Vault; Google Workspace is account/Drive source while PDM owns roles/approval; high-risk settings use draft/test/Admin activation; the first implementation slice is SolidWorks secret lifecycle. Added spec `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`, ADR `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`, and QA plan `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`. Status is `RD Contract Ready / Not Authorized`; no product implementation, schema migration, Supabase Vault live write, production deploy/cutover, direct data repair/deletion or secret value handling was performed.
- 2026-07-06: Completed RD-supervisor readiness closure for `DEV-PDM-SHARED-3D-MA-BASELINE-001` documentation. Added ADR `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`, required-MA baseline resolver rules, shared model hash/revision identity rules, approval action codes and QA visible-error/viewport gates. Status remains `RD Implementation Ready / Not Authorized`; no product implementation, schema migration, production deploy, direct data repair/deletion, CAD/OCR extraction, forced part/BOM revision or Git action was performed.
- 2026-07-06: Added `DEV-PDM-SHARED-3D-MA-BASELINE-001` development documents from the user's guided decisions. The confirmed product rule is: shared 3D belongs at the part/root level; part/root search remains dynamic navigation; manufacturing baseline freezes the exact shared 3D hash/model version and MA drawing package revisions used for formal manufacturing; MA drawing release requires a shared model link or reviewed `2D-only / no 3D impact` exception. Added spec `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md` and QA plan `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`. Initial RD-supervisor review later required ADR and readiness hardening before keeping RD Implementation Ready status.
- 2026-07-05: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` after the user's simplified PDM revision policy and `執行開發` authorization. Product behavior now allows revisions to be entered and approved in any order, suggests the next likely revision without making it a blocker, blocks duplicate formal same drawing + same revision records, recomputes latest/history after release, keeps lower backfilled revisions as formal history and promotes higher revisions to latest. Updated release lifecycle repositories, approve/retry-release/workflow paths, revision comparator, revision workbench intent guidance, first-level latest/history attachment grouping guard, QC script, controlled revision package spec, QA plan, PM control board and documentation map. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 61/61, `npm.cmd run dev:local:check`, plus static search confirming product approve/retry-release paths no longer use the chronological `revision_release_order_conflict` blocker. No schema migration, production deploy, direct data repair, historical cleanup, FFF/part/BOM rule change, strict chronological approval or dedicated mobile-phone UI work was performed.
- 2026-07-05: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` after user `執行開發` authorization. The drawing revision workflow now treats one revision as a multi-file `版次檔案包`, supports extension-based role auto-classification with inline correction, persists package role/warning evidence in the submission snapshot, keeps completeness checks warning-only after at least one valid file exists, and shows the same reviewer warnings on the submission page plus dashboard drawer. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 57/57, `npm.cmd run dev:local:check`, and Playwright desktop submit/reviewer warning smoke. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. Current system setting: no dedicated mobile-phone UI; phones use the desktop/default surface, so 390px screenshots are optional sanity only. No schema migration, production deploy, direct data repair, CAD/OCR extraction, FFF rule change or forced part/BOM revision was performed.
- 2026-07-05: Applied APP feedback to `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` after the user reported that old drawings stayed in the `圖面進版` workbench and interfered with preparing a new revision. `/numbering/revisions` now filters the primary `新版圖面` selectable list to the intended revision only, clears preserved selections that no longer match the target revision, moves prior/other-revision attachments to a default-collapsed read-only `上一版 / 其他版次參考檔` area with no checkbox, shows `還沒有版次 X 的新版圖面` as the next-step answer when only old files exist, and makes the disabled submit CTA visually secondary. Updated the drawing revision submission spec, QA plan and change-control QC static guard. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 56/56, `npm.cmd run dev:local:check`, and Playwright mock browser checks at 1440x900 and 390x844 with screenshots under `output/playwright/drawing-revision-reference-filter/`. No DB/API/schema/permission/state-machine change, production deploy, direct data repair or historical cleanup was performed.
- 2026-07-04: Implemented and verified `DEV-PDM-NEXT-STEP-UX-001` Phase 1 local UI package after user `執行開發` authorization. Changed shared state guidance so `NextStepState` shows body inline by default, unknown status/error fallback fails closed to actionable Chinese, lifecycle panels show `現在要做`, dashboard action failures no longer directly alert raw `body.error`, drawing revision same-version blockers use action-first wording, DVT missing items show visible recovery guidance, submission-detail not-found/error/restricted states include CTAs, manufacturing handoff missing packages tell manufacturing not to use the record and route back to submission, search/parts/part-drafts/reports empty states include next action, and master attachment error/empty states are mapped to actionable copy. Focused QC scripts were updated to validate the new status-help and action-first wording. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44, `npm.cmd run qc:pdm-numbering-search-ui` 28/28, `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24, `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22, `npm.cmd run qc:master-attachments` 93/93, `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14, and `npm.cmd run dev:local:check`. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. No DB/API/permission/state-machine change, production deploy, direct data repair, historical cleanup, Phase 2 scanner/checklist or Phase 3 release work was performed.
- 2026-07-04: Prepared `DEV-PDM-NEXT-STEP-UX-001` Phase 0 documentation package after QA review of UI states that do not answer the user's real question: `那我現在要幹嘛`. Added `SPEC-PDM-NEXT-STEP-UX-001` with Human Decision Brief, action-first copy/component contract, QA inventory, phase roadmap, QA/QC gate, spec governance result, Deferred Scope Audit, All-Phase Coverage Matrix and RD Readiness Review. Phase 1 product UI implementation is RD Implementation Ready but not authorized. Phase 2 regression scanner/checklist and Phase 3 production release are not authorized. DB/API/permission/state-machine changes, production deploy, direct data repair, historical cleanup, admin/debug raw payload full localization and full platform navigation redesign remain excluded unless separately approved.
- 2026-07-03: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` Phase 1 locally after user authorization. `/numbering/revisions` now requires a `新版圖面` attachment step before formal submit, uploads selected files to the drawing attachment library as source/staging evidence, validates selected attachment revision against the intended drawing revision, creates a controlled Pending submission package through a dedicated drawing-revision API, links the FFF assessment via `drawing_revision_fff_assessments.submission_id`, and cancels an incomplete Pending submission with audit if FFF creation fails after package creation. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run qc:pdm-change-control`, `npm.cmd run qc:pdm-drawing-submission-review-only`, `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`, local `/numbering/revisions` HTTP 200 smoke, and unauthenticated workbench API 401 guard smoke. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. No production deploy, migration, direct historical repair, data deletion, CAD/OCR Phase 2 or forced part/BOM revision was performed.
- 2026-07-03: Implemented and verified `DEV-PDM-STATUS-UX-001` Phase 1 locally. Added central UI status dictionary, shared status help/header/badge components, Chinese status filters/badges/errors, development phase display mapping (`Release` -> `正式階段`), and focused QC scanner baseline for user-visible status columns and raw status wording. Verification passed: `npm run qc:pdm-status-ui-vocabulary` 44/44, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, browser UI evidence on `/settings` for status help open/Chinese copy/ESC close/outside click close, browser UI evidence on `/numbering/drawings` for `已發布 / 正式階段`, and `npm run dev:local:check` after restarting local 3000. No production deploy, DB enum/schema rename, production migration, direct historical data repair or audit payload migration was performed.
- 2026-07-02: Implemented and verified `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` Phase 1 locally after user authorization. The release lifecycle now synchronizes source drawing, resolved part and root master statuses to `Released` / `Release` in the same transaction as submission release, writes `ReleaseMasterStatusSynced` audit, blocks missing/ambiguous source context with Chinese recovery language, and shows a drawing-module guard for historical released-as-Draft mismatches. Verification passed: `npm run qc:pdm-release-master-status-sync` 23/23, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27, `npm run qc:pdm-drawing-submission-ui-operation` 14/14, and browser smoke screenshot `output/playwright/pdm-release-master-status-sync-guard-d0014.png`. No historical D-0014 repair, production deploy, production migration, direct mutation against existing user data, data deletion or Phase 2/3 implementation was performed.
- 2026-07-02: Completed `PA-LOCAL-DEV-3000-001` second PA hardening for recurring broken local port 3000. Added `dev:local:check`, upgraded `scripts/start-localhost-3000.ps1` from single `/login` health to multi-route `/`, `/login`, `/api/auth/me` checks, wrote real port-owner PID/status JSON/logs under `tmp/local-dev/`, and added `scripts/clean-next.mjs` guard so `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set. Verification passed: `npm run qc:local-dev-entrypoint`; `npm run dev:local:check`; expected-block test for `node scripts/clean-next.mjs` returned exit code 1 while PID 52928 owned the healthy project server; status JSON ended in `healthy_existing` with all three routes healthy. No production deploy, production migration, direct DB cleanup, data deletion, provider switch, or foreign-process stop was performed.
- 2026-07-02: Completed `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 1 local verification. Fixed the mutation QC runner to use the real `/api/submissions` dashboard source instead of a nonexistent `/api/dashboard`, then passed `npm run qc:pdm-drawing-submission-workbench-mutation` 33/33 on disposable local fixture records. Required gates passed in this run: `npm run build`, `npm run qc:pdm-drawing-submission-workbench-mutation` 33/33, `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27, `npm run qc:db-provider-contract` 35/35, `npm run qc:db-provider-postgres` 9/9, `npm run qc:pdm-submission-conflict-duplicate-active` 14/14, `npm run qc:pdm-drawing-part-workbench-security`, `npm run qc:pdm-drawing-submission-review-only` 14/14, `npx tsc --noEmit --pretty false`, and `npm run lint`. No production deploy, production migration, direct DB cleanup, historical repair, data deletion, provider switch or Phase 2+ implementation was performed.
- 2026-07-02: Re-synced the `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` development package against the latest `dev-pm` development-document-to-RD-ready rules. The disposable mutation lifecycle gate was explicitly indexed as `npm run qc:pdm-drawing-submission-workbench-mutation` in `dev_task`, `documentation_map`, the Phase 1 QA plan and the main spec. This intermediate documentation state was later superseded by the successful 33/33 mutation QC pass recorded above.
- 2026-07-02: Rechecked `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` development documents against the latest `dev-pm` development-document-to-RD-ready rules. Added a standalone `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` section with Human Decision Brief, scope/out-of-scope, implementation contract summary, data/API/permission/state-machine impact, acceptance, stop conditions, evidence required and re-entry triggers. Added spec Section 4.5 compliance mapping and refreshed `documentation_map.md` cold-start guidance. This is documentation-only; Phase 2+ remains RD Contract Ready and not authorized for implementation.
- 2026-07-02: Advanced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` from partial/unverified RD to an intermediate non-mutating verification state. Added focused QC package entry, validated async SQLite/Postgres transaction-boundary candidate, fixed local SQLite bootstrap ordering for release-recovery indexes so old DB files no longer fail with `no such column: resolved_by_submission_id`, and captured local 3200 API/browser evidence for `D-0014-MA1` release-incomplete blocker and `SUB-20260701-2AEBA0CD` detail page. This intermediate state was later superseded by the successful disposable mutation QC and final local verification pass recorded above.
- 2026-07-02: Re-synced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` with the latest `dev-pm` development-document-to-RD-ready rules after reviewing the current local code state. Updated spec/dev_task/documentation_map/QA wording for return-for-correction transaction-boundary work. This intermediate documentation state was later superseded by the completed local verification recorded above; Phase 2+ remains RD Contract Ready only, and no production deploy, migration, direct DB cleanup, historical repair or data deletion was authorized.
- 2026-07-02: Synced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` documentation with the latest `dev-pm` development-document rules and current local file state. The canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, detail recovery UI and resolved ReleaseFailed de-noising were documented for later verification. This intermediate state was later superseded by the completed local verification recorded above.
- 2026-07-02: Rechecked `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 2+ documentation against the latest `dev-pm` All-Phase RD Contract Gate. Added spec Section 4.5 with explicit authorization boundary, phase entry/stop conditions, spec-governance result and continuation rule. Updated the P2P task row so future continuation cannot treat Phase 2+ contract readiness as implementation authorization. No product implementation, production deploy, migration, direct DB cleanup, historical repair or data deletion was performed.
- 2026-07-02: Reconciled `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` with the latest `dev-pm` development-document rules. Corrected PM state from "not started" to "In Progress / partial local RD" because the worktree already contains unverified Phase 1 implementation changes. Added explicit Priority, authorization boundary, current implementation status, remaining RD gaps, validation gates and Phase 2+ non-authorization boundary.
- 2026-07-02: Updated `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` documentation under the latest dev-pm All-Phase RD Contract Gate. Added Phase 1 QA plan `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`, linked it from spec/dev_task/documentation map, and preserved Phase 2+ as RD Contract Ready only. No product implementation, production deploy, migration, direct DB cleanup, historical repair or data deletion was performed.
- 2026-07-01: Executed CAPA PA for recurring broken local port 3000. Replaced raw `dev:local` with managed `scripts/start-localhost-3000.ps1`, preserved raw Next command as `dev:server`, added `dev:local:restart` for authorized stale-project-process recovery with `.next` cleanup, PID/log files under `tmp/local-dev/`, HTTP `/login` health checking, and static QC `npm run qc:local-dev-entrypoint`. Verification passed: `npm run qc:local-dev-entrypoint`, managed `-CheckOnly`, and `http://127.0.0.1:3000/` returned HTTP 200.
- 2026-07-01: Implemented `DEV-PDM-DRAWING-PART-WORKBENCH-001` locally after user RD authorization. Added controlled drawing submission route, root/drawing readiness APIs, generic `/upload` retired UX, generic `POST /api/submissions` 410 retirement, idempotency attempt audit, duplicate attachment filename preflight, canonical immutable submission snapshot/hash, owner-route master-data edit path and focused QC. Verification passed: `tsc`, `lint`, `build`, `qc:pdm-drawing-part-workbench-security`, `qc:pdm-drawing-submission-review-only`, and `qc:pdm-numbering-api-regression` on temporary local 3100. Production deploy/migration and direct DB cleanup remain unapproved.
- 2026-07-01: Completed RD readiness closure for `DEV-PDM-DRAWING-PART-WORKBENCH-001` documentation. Added explicit generic `/upload` and `POST /api/submissions` retirement, owner API contracts, ambiguity blockers, permission/state matrix, canonical snapshot schema/hash, idempotency attempt state machine, storage-key collision rules and mandatory negative QA cases. State remains RD Implementation Ready; product implementation is still not executed.
- 2026-07-01: Added `DEV-PDM-DRAWING-PART-WORKBENCH-001` development package from user architecture decisions. Added RD-ready spec `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`, ADR `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`, and QA plan `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`. State is documentation ready / RD Implementation Ready; product implementation is not executed by this documentation request.
- 2026-06-30: Implemented `DEV-PDM-DRAWING-SUBMISSION-001`. Added drawing-source context resolver, review-only create API, source drawing/source attachment traceability columns, safe master-attachment copy into submission repository, drawing detail source-aware `送審` route, `/upload?source=drawing` review-only workbench, focused QC script, desktop/mobile browser smoke evidence, and successful local POST/duplicate-prevention evidence. Production deploy/cutover remains out of scope.
- 2026-06-30: Completed non-production executable-work audit for "all tasks except switching to production". Fixed completion/readiness QC parser compatibility with the current `External Blockers / Parked Scope` heading. Evidence passed: `tsc`, `lint`, `build`, `qc:dev-task-evidence-sync`, `qc:dev-task-completion-audit`, lifecycle release readiness, SW/PDM boundary, Supabase local readiness, data parity policy, current-change audit, and production readiness allow-open with five external blockers visible.
- 2026-06-30: Final local 3000 smoke for `DEV-PDM-DRAWING-SUBMISSION-001` passed after documentation sync: drawing-source route renders `圖面送審`, preserves source `D-0014-MA1`, does not show the generic upload flow, has zero editable master-data inputs, and blocks submission while master-data blockers exist.
- 2026-06-30: Continuation audit revalidated `DEV-PDM-DRAWING-SUBMISSION-001` against the current worktree and local 3000 server. Required static/build/QC gates passed; browser/API smoke confirmed review-only UI, blocker behavior, generic upload regression, mobile layout, source traceability evidence, and duplicate 409 behavior.
- 2026-06-30: Added `DEV-PDM-DRAWING-SUBMISSION-001` development documents from user APP validation. Decision: drawing module completes master data; drawing-source submission is review-only and must not collect PDM master fields. Added spec `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md` and QA plan `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`. This documentation entry was later superseded by the implemented / verification-passed package above.
- 2026-06-30: PM documentation governance restructured. `dev_task.md` now acts as the active control board; completed evidence is summarized and indexed in `.ai-doc/archived/completed-dev-index-2026-06.md`; original full files were snapshotted before restructure.
- 2026-06-30: Completed development-document readiness pass for `DEV-PDM-UI-POLISH-001A`. Added executable-scope entry, primary part fallback contract, replacement draft service contract, duplicate-submit strategy, and focused QA plan.
- 2026-06-30: Implemented `DEV-PDM-UI-POLISH-001A`. Added official drawing resolver API, shared resolver helper, server-side drawing and primary-part resolution for FFF submit, duplicate active assessment guard, drawing-revision replacement draft reuse, and redesigned `/numbering/revisions` workbench. Verification passed: `tsc`, `lint`, `build`, `qc:pdm-change-control`, browser smoke.
- 2026-06-30: Added focused development spec `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md` for the human-centered `/numbering/revisions` workbench redesign. The slice was later implemented under `DEV-PDM-UI-POLISH-001A`.
- 2026-06-30: Completed `DEV-PDM-UI-POLISH-001`. Implemented CAD-adapter warning copy simplification, upload PDM attribute simplification, multi-file upload with SolidWorks-primary metadata and conflict warning, SolidWorks attachment 3D preview fallback, compact icon-free drawing-governance actions, and retained `DEV-PDM-UI-POLISH-001A` drawing revision workbench evidence. Verification passed: `tsc`, `lint`, `build`, and focused browser smoke.
- 2026-06-30: `DEV-PDM-LIFECYCLE-ACTIONS-001` local/staging package is closed in local commit `21bcf16`; production/Supabase production cutover remains unapproved.
- 2026-06-30: User authorized lifecycle scoped Git/index cleanup and unified controlled-history aggregation; the completed evidence is now treated as Logical Archive / Protected Evidence.
- 2026-06-30: Supabase `DEV-SUPABASE-DB-001` staging GATE-B remains passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred.
- 2026-06-19: `DEV-SW-LICENSE-PDM-001` closed after separate Supabase evidence commit `be333eb` and SW/PDM company boundary commit `6f4dbab`.
- 2026-06-24: `DEV-PDM-CHANGE-CONTROL-001` Phase 1-5 local implementation evidence captured; production/Supabase migration remains approval-gated.
- 2026-06-22: `DEV-PDM-REVISION-001` committed on scoped branch `codex/pdm-revision-policy` with commits `8f472d0` and `af08d81`.
