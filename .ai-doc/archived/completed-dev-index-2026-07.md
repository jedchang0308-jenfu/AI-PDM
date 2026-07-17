# Completed DEV Index - 2026-07

Updated: 2026-07-17
Owner: Dev PM
Purpose: completed DEV evidence index for the 2026-07 archive sweep. Active execution and blockers remain in `.ai-doc/dev_task.md`.

Source snapshot:

- `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`
- `C:\VIBE CODING\.artifacts\AI_PDM\doc-refactor-20260716\` 保存重構前核心文件、
  scoped diff、DEV 狀態基線與 DEV-046 原文。

Archive policy:

- Active `dev_task.md` retains compact Chinese summaries, archive location and delivery count；
  直接證據由 `documentation_map.md` 與本索引定位。
- Detailed pre-sweep active-board content is preserved in the source snapshot.
- Shared production/release tails are centralized in `DEV-032`, not repeated per completed DEV.
- Protected evidence files are not physically moved because QC scripts and package docs may reference exact paths.

## Archive Sweep Summary

- Completed DEV aliases indexed after the 2026-07-16 refactor: 39.
- Non-completed items retained in `.ai-doc/dev_task.md`: `DEV-047`, `DEV-041`,
  `DEV-015`, `DEV-030`, `DEV-031`, `DEV-033`, and `DEV-035` to `DEV-038`.
- `DEV-046` remains a protected verbatim task block；本索引只提供外部指標，不改寫其內容。
- Product/release action：`DEV-032` 正式領號／草稿 production slice 已完成 release closure；
  GCS、CAD、BOM 與完整 PDM 仍未開放。

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

### DEV-005 / `DEV-PDM-SUBMISSION-GATE-001`

- 標題：研發／技術移轉送審關卡
- 類型：交付點
- 狀態：Phase 1 本地完成；技轉包後續交由 `DEV-041`。
- 摘要：完成送審模式選擇、rule resolver、API fail-closed guard 與 transfer package context 入口。
- 證據：`.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`、
  `.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`。
- 計入交付：是
- Release 邊界：live migration、production 與 release 未由本 DEV 授權。

### DEV-034 / `DEV-IND-007`

- 標題：SQLite 到 PostgreSQL 影子遷移
- 類型：關卡
- 狀態：本機 disposable PostgreSQL shadow gate 通過。
- 摘要：完成 shadow migration、RLS 與 schema compare，未碰 staging/production target。
- 證據：`data/quality/postgres-shadow/shadow-compare-1783676196559.json`。
- 計入交付：否
- Release 邊界：正式 Cloud SQL target、migration 與 smoke 只由 `DEV-032` 管控。

### DEV-032 / `DEV-CLOUDSQL-DB-001-PROD-GATE`

- 標題：ERP 平台 production release work package
- 類型：關卡
- 狀態：完成；Product Owner 於 2026-07-17 決策 `GO`。
- 摘要：完成 A0-A9、Gate E machine/human closure、current release 100% traffic 與正式領號／草稿 production slice release closure。
- 證據：`output/dev-032-production-activation-readiness/report.json`、
  `output/dev-032-gate-e-closure/report.json`、
  `output/dev-032-gate-e-automation/gate-e-automation-readback.json`。
- 計入交付：否
- Release 邊界：Firebase Hosting 預設網址為 canonical；GCS、CAD、BOM、完整 PDM 與自訂 DNS 不在本次範圍。

### DEV-040 / `DEV-PDM-PRODUCTION-SLICE-001`

- 標題：正式領號／草稿 production slice
- 類型：交付點
- 狀態：本地產品範圍完成；production 使用需 release gate。
- 摘要：完成正式領號與草稿 local slice、capability allowlist、blocked UI 與 API fail-closed guard。
- 證據：`.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`、
  `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`。
- 計入交付：是
- Release 邊界：production deployment、rollback 與 smoke 由 `DEV-032` 管控。

### DEV-042 / `DEV-PDM-ACCOUNT-INVITATION-001`

- 標題：內部帳號邀請與首次密碼設定
- 類型：交付點
- 狀態：本地完成。
- 摘要：完成一次性邀請、首次設密碼、Admin 管理與安全負向路徑。
- 證據：`.ai-doc/qa/qa-pdm-account-invitation-validation-plan-2026-07-10.md`、
  `.ai-doc/qc/qc-pdm-account-invitation-report-2026-07-10.md`。
- 計入交付：是
- Release 邊界：live provider、migration 與 production 未由本 DEV 授權。

### DEV-043 / `DEV-PDM-GOOGLE-IDENTITY-001`

- 標題：Google 身分與 provider-neutral identity
- 類型：交付點
- 狀態：本地完成。
- 摘要：完成 OIDC 綁定、穩定 PDM user identity、停用身分 fail closed 與 mocked provider QC。
- 證據：`.ai-doc/qa/qa-pdm-google-identity-validation-plan-2026-07-10.md`、
  `.ai-doc/qc/qc-pdm-google-identity-report-2026-07-10.md`。
- 計入交付：是
- Release 邊界：live credential、provider rollout 與 production 由 `DEV-032` 管控。

### DEV-044 / `DEV-PDM-ERP-MODULE-FOUNDATION-001`

- 標題：ERP-ready AI_PDM 模組基礎
- 類型：開發點
- 狀態：Phase 1-3 本機完成。
- 摘要：完成 actor/company/command、audit/outbox 與 shared IAM adapter 的本地基礎。
- 證據：`.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`、
  `.ai-doc/qc/qc-pdm-erp-module-foundation-report-2026-07-12.md`。
- 計入交付：否
- Release 邊界：ERP shell、live migration 與 production/release 尚未執行。

### DEV-045 / `DEV-PDM-ACCOUNT-LIFECYCLE-001`

- 標題：帳號生命週期與安全管理台
- 類型：交付點
- 狀態：Phase 1、2 與 3A local slices 完成；provider rollout gated。
- 摘要：完成帳號管理、停權/復權、session revoke、reset recovery 與本地 provider handoff。
- 證據：`.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`、
  `.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md`。
- 計入交付：是
- Release 邊界：live provider、MFA、migration 與 production 需對應 release gate。

### DEV-046 / `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001`

- 標題：Google Cloud SQL 五年 ERP 平台與本體論基礎
- 類型：開發點
- 狀態：Phase 2B staging activation complete；future phases gated。
- 摘要：本索引只指向既有完成範圍；active `dev_task.md` 的 DEV-046 原區塊保持逐字保護。
- 證據：`.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`、
  `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`。
- 計入交付：否
- Release 邊界：Phase 3A 由 `DEV-032` 承接；Phase 3B+ 必須明確 re-entry。

### DEV-048 / `DEV-PDM-NUMBER-STATE-FLOW-001`

- 標題：圖料號、草稿、狀態與技術移轉入口整合
- 類型：開發點
- 狀態：Phase 1A-1E P0 本地整合完成。
- 摘要：完成草稿、候選號、發布邊界、技轉入口與原始建立圖料號等價修復。
- 證據：`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`、
  `.ai-doc/decisions/ADR-PDM-NUMBER-STATE-FLOW-001-publish-boundary-and-candidate-reservation.md`。
- 計入交付：否
- Release 邊界：live provider、正式資料、staging 與 production 需另行 gate。

### DEV-049 / `DEV-PDM-STATUS-UX-003`

- 標題：全系統狀態軸命名與資料頂部說明
- 類型：交付點
- 狀態：本地完成。
- 摘要：完成中央 status scope registry、跨頁資料頂部「狀態說明」、狀態軸命名與號碼效力 3+1 詞彙；未改 state machine、DB/API raw value、正式資料或權限。
- 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-003-state-axis-vocabulary-and-header-help.md`、`output/playwright/dev-049-status-scope/status-scope-browser-metrics.json`、`qc:pdm-status-scope-coverage` 86/86、browser 40/40、`qc:pdm-master-workbench-layout` 207/207。
- 計入交付：是
- Release 邊界：merge、PR、deploy、staging 與 production 另走 release/deployment gate。

## Physical Archive Actions In This Pass

- Created snapshot `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md` before compacting active `dev_task.md`.
- Created `.ai-doc/archived/completed-dev-index-2026-07.md` for completed DEV lookup.
- Rewrote active `.ai-doc/dev_task.md` so completed work appears only as compact summaries near the top.
- No protected evidence file was physically moved.
- 2026-07-16：重構前基線改存固定外部 artifact root，未再新增 repo 內巨型 snapshot。
- 2026-07-16：補入 9 個較新的 completed/protected 索引；DEV-046 原區塊未改寫或搬移。
- 2026-07-17：`DEV-049` local QC 與 browser evidence 收斂後納入完成索引。
