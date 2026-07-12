# Completed DEV Index - 2026-07

Updated: 2026-07-09
Owner: Dev PM
Purpose: completed DEV evidence index for the 2026-07 archive sweep. Active execution and blockers remain in `.ai-doc/dev_task.md`.

Source snapshot:

- `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`

Archive policy:

- Active `dev_task.md` retains compact Chinese summaries, evidence, archive location, delivery count and batch release pointer.
- Detailed pre-sweep active-board content is preserved in the source snapshot.
- Shared release / production / Supabase / migration tails are centralized in active gates `DEV-030` to `DEV-034`, not repeated per completed DEV.
- Protected evidence files are not physically moved because QC scripts and package docs may reference exact paths.

## Archive Sweep Summary

- Completed DEV aliases archived in this pass: 28.
- Active items retained in `.ai-doc/dev_task.md`: `DEV-005`, `DEV-015`, `DEV-030` to `DEV-038`.
- Product/release action performed: none.

## Completed Task Summaries

### DEV-001 / `DEV-PDM-APPROVAL-PLATFORM-001`

- 標題：全系統審核平台化
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：建立共用審核平台核心、審核工作台、legacy reviewer redirect、跨模組審核 adapter 與圖號待審投影，讓 launch 前審核不再分散且不漏看受影響圖號。
- 證據：`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`、`.ai-doc/qc/qc-pdm-approval-platform-report-2026-07-08.md`、`npm.cmd run qc:pdm-approval-platform` 125/125、`npm.cmd run qc:pdm-entity-detail-drawer` 14/14。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；歷史實體遷移、Supabase live migration、production release 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-002 / `DEV-PDM-FILE-STORAGE-001`

- 標題：Supabase 核心檔案權威與 Google Drive 備份鏡像
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：把 PDM 檔案權威轉向 Supabase Storage/Postgres metadata，Google Drive 降為 best-effort 備份鏡像，並保留 local fallback。
- 證據：`.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`、`.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`、`qc:pdm-file-storage-supabase-core-drive-backup` 37/37。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；bucket/RLS、一次性遷移、provider pointer、live Drive backup 與 production release 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-003 / `DEV-PDM-ACCESS-CONTROL-001`

- 標題：使用者身分、組織範圍與權限架構
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成鉦富單公司權限切片、角色/審核矩陣管理語言中文化、外部專員權限邊界與規則摘要防呆。
- 證據：`.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`、`npm.cmd run qc:pdm-access-control-governance` 88/88、rule matrix screenshots。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；Google OAuth、邀請流程、完整路由權限盤點與 live Supabase migration 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-004 / `DEV-PDM-NUMBERING-004`

- 標題：情境式編號生命週期入口
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：在 root/drawing/part context 直接新增 M/R、P、obsolete request 與 aggregate approval package，並修正 APP 回饋的草稿與命名 UX。
- 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`、`.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`、focused QC 44/44。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase cutover、provider pointer、merge/PR/deploy 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-006 / `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`

- 標題：圖料模組關係視圖
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：將圖料模組從平面清單改為 root-grouped 關係樹與矩陣 review，並提供受控關係維護 API。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`、`qc:pdm-drawing-part-relation-view` 56/56、relation-view screenshots。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；正式環境、schema migration 與批次關係寫入未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-007 / `DEV-PDM-NEXT-STEP-UX-001`

- 標題：全系統可行動狀態提示與下一步 UX
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：讓錯誤、空狀態、生命週期、送審與附件狀態直接回答使用者現在要做什麼，減少只顯示 raw status。
- 證據：`.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`、status/search/DVT/report/master-attachment/drawing-submission QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；Phase 2 scanner/checklist 與 production release 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-039 / `DEV-PDM-ENTITY-DETAIL-DRAWER-001`

- 標題：圖號 / 料號 / 主根號統一物件詳情抽屜
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：統一 root/drawing/part detail drawer 契約，確保同一物件從不同入口打開時核心資訊與首屏密度一致。
- 證據：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`、`qc:pdm-entity-detail-drawer` 12/12。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；完整 shared shell 抽取、merge/PR/deploy/release 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-008 / `PA-LOCAL-DEV-3000-001`

- 標題：本地開發入口 CAPA 預防措施
- 類型：PM 證據
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：用 managed local dev launcher、health check、restart 與 clean guard 防止 port 3000 / .next 被反覆破壞。
- 證據：`npm run qc:local-dev-entrypoint`、`npm run dev:local:check`、`scripts/start-localhost-3000.ps1`、`scripts/clean-next.mjs`。
- 計入交付：否
- 批次發版：無；這是 PM/CAPA 證據，不進 release batch。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-009 / `DEV-PDM-STATUS-UX-001`

- 標題：全系統狀態中文化與狀態欄說明
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：建立中央 UI status dictionary、中文 status badge/filter/error 與狀態說明 popover，降低 raw code 外露。
- 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`、`npm run qc:pdm-status-ui-vocabulary` 44/44、browser status evidence。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；DB enum/schema 改名、historical repair 與 production migration 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-010 / `DEV-PDM-STATUS-UX-002`

- 標題：狀態語意分層與狀態混用修正
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：修正狀態/階段/提醒混用，讓不同任務、匯入、設定、報告、DVT 與恢復情境使用正確狀態語意。
- 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`、`.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`、status context QC。
- 計入交付：否
- 批次發版：無獨立 release；Phase 2 scanner hardening 需另行授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-011 / `DEV-PDM-NUMBERING-002`

- 標題：緊湊編號核心 V2
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：將編號核心改為 compact v2 root/part/drawing identity，完成本地 runtime cutover 並保留歷史 evidence string。
- 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`、`.ai-doc/qc/qc-pdm-numbering-v2-formal-cutover-report-2026-07-07.md`、v2 cutover QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase live cutover、provider pointer 與直接資料修復未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-012 / `DEV-PDM-NUMBERING-003`

- 標題：英數主根號身分 V3
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成 A0001-Z9999 英數 root identity、v1/v2/v3 read compatibility、legacy numeric ordinal reservation 與本地 runtime v3 cutover。
- 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`、`.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`、v3 formal cutover QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase migration 與直接資料修復未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-013 / `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`

- 標題：QC 隔離、流水號完整性與本機修復
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：阻止 QC 消耗正式 local runtime 流水號，補完整性偵測、transaction guard、duplicate submit guard 與本機測試資料修復。
- 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`、`.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`、repair report。
- 計入交付：否
- 批次發版：見 `DEV-030`、`DEV-032`；Phase 4 production/Supabase rollout 或任何新資料修復未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-014 / `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`

- 標題：圖面送審工作台與發行未完成恢復流程
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成 same-revision conflict 分類、release recovery、workbench API/page、retry/return-for-correction 與 disposable mutation QC。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`、`.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`、mutation/recovery QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；Phase 2+ 已另列 `DEV-015`，production/historical repair 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-016 / `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`

- 標題：發行未完成 UI 自救流程
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：補上 release-incomplete 的人可讀診斷、附件修正入口、submission detail recovery link 與 UI operation QC。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`、drawing submission UI/recovery QC。
- 計入交付：否
- 批次發版：見 `DEV-030`、`DEV-032`；正式環境修復、historical repair 與 data deletion 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-017 / `DEV-PDM-DRAWING-REVISION-SUBMISSION-001`

- 標題：圖面進版受控送審包第 1 階段
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：讓圖面進版必須先選/上傳新版圖面並建立受控 Pending submission package，保留 FFF linkage 與失敗補償。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`、`.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`、change-control QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production deploy、migration、direct repair 與 historical cleanup 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-018 / `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`

- 標題：多檔版次包送審
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：將單一版次送審擴充為多檔版次檔案包，支援 extension role auto-classification、role correction 與 warning-only completeness。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 2、revision submission QA、change-control QC 57/57。
- 計入交付：是
- 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-030`、`DEV-032`。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-019 / `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`

- 標題：非依序進版與最新 / 歷史行為
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：允許非依序但不重複的正式進版，重新計算 latest/history，讓低版次補登保留歷史、高版次升為最新。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 3、`npm.cmd run qc:pdm-change-control` 61/61。
- 計入交付：是
- 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-030`、`DEV-032`。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-020 / `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`

- 標題：一級版次附件包模型
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：建立 stable packageId、package file membership、Released-core immutability 與補件 request/approval/補件標記。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`、`.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`、package QC 59/59。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；若要補 browser 補件證據，應另開 QC/follow-up，不阻擋本 DEV 完成。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-021 / `DEV-PDM-SHARED-3D-MA-BASELINE-001`

- 標題：共用 3D 主檔與 MA 製造基準包
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成 part/root 共享 3D 模型版本、MA model-basis API、required-MA resolver、manufacturing baseline draft/release 與 part-detail UI slice。
- 證據：`.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`、`qc:pdm-shared-3d-ma-baseline` 20/20、browser screenshot。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production deploy/migration、CAD/OCR extraction 與 forced part/BOM/FFF changes 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-022 / `DEV-PDM-SETTINGS-CENTER-001`

- 標題：系統設定中心與 Secret 生命週期治理
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：建立 settings center、五個管理區、server-only secret lifecycle API、secret metadata tables、redacted UI 與 local test double。
- 證據：`.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`、`.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`、settings secret QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；Supabase Vault live write/smoke、真實 CAD 證據與 production cutover 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-023 / `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`

- 標題：Windows SolidWorks 原檔預覽衍生檔
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：建立 preview job/derivative schema、fake PNG worker、Windows Shell worker、Document Manager SLDDRW worker path 與 derivative-aware preview cards。
- 證據：`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`、native-preview QC 90/90、redaction QC、master-attachments QC、API worker smoke。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；真實 SLDDRW key、SLDASM evidence、Phase 2/3 與 production rollout 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-024 / `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`

- 標題：送審發行後主檔生命週期同步
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：在 submission release 成功時同步 source drawing、part、root master lifecycle，寫入 audit，並提供歷史 mismatch 可見 guard。
- 證據：`.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`、`npm run qc:pdm-release-master-status-sync` 23/23、browser guard screenshot。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；historical D-0014 repair、production migration 與 direct DB mutation 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-025 / `DEV-PDM-SUBMISSION-CONFLICT-001`

- 標題：重複進行中送審衝突分類
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：將 duplicate active submission 改為 submission_conflict，於 readiness/submit/reviewer guard 阻擋並用中文 recovery 與 audit payload 留證。
- 證據：`.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`、`.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`、duplicate conflict QC。
- 計入交付：否
- 批次發版：見 `DEV-030`、`DEV-032`；historical duplicate repair、production migration 與 direct cleanup 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-026 / `DEV-PDM-DRAWING-PART-WORKBENCH-001`

- 標題：圖料模組資料流與送審安全架構
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：確立圖號/圖料 controlled drawing submission workbench、owner API edit path、immutable snapshot/hash、idempotency audit 與 generic upload retirement。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`、`.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`、workbench security QC。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production deploy/migration、direct DB cleanup 與 existing-data repair 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-027 / `DEV-PDM-DRAWING-SUBMISSION-001`

- 標題：圖面來源只送審流程
- 類型：交付點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：讓圖面來源送審只負責 review-only submission，主資料必須在圖面/圖料模組先完成，不在送審中收 PDM master fields。
- 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`、`.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`、review-only QC/screenshots。
- 計入交付：是
- 批次發版：見 `DEV-030`、`DEV-032`；production deploy 未授權。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-028 / `DEV-PDM-UI-POLISH-001`

- 標題：APP 人工驗證 UI 打磨包
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成 upload UI 簡化、多檔 SolidWorks-primary metadata、conflict warning、preview fallback 與 drawing governance CTA polish。
- 證據：APP validation screenshots、`src/app/upload/page.tsx`、`src/components/master-attachment-panel.tsx`、focused browser smoke。
- 計入交付：否
- 批次發版：無；未來 UI 改善需拆成新的聚焦任務。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

### DEV-029 / `DEV-PDM-UI-POLISH-001A`

- 標題：圖面進版工作台聚焦切片
- 類型：開發點
- 狀態：完成；active board 已歸檔為摘要。
- 摘要：完成 drawing revision workbench focused slice：official drawing resolver、server-side primary-part resolution、duplicate submit guard 與 replacement draft reuse。
- 證據：`.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`、`.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`、change-control QC/browser smoke。
- 計入交付：否
- 批次發版：無；剩餘改善需拆成新的聚焦任務。
- 詳細歷史：`.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`；相關 spec / QA / QC 文件維持原路徑。

## Physical Archive Actions In This Pass

- Created snapshot `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md` before compacting active `dev_task.md`.
- Created `.ai-doc/archived/completed-dev-index-2026-07.md` for completed DEV lookup.
- Rewrote active `.ai-doc/dev_task.md` so completed work appears only as compact summaries near the top.
- No protected evidence file was physically moved.
