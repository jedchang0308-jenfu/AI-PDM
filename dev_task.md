# AI PDM 開發任務清單

更新日期：2026-05-28

## 讀取規則

- 主檔只保留未完成與近期要執行的任務。
- 已完成歷史已封存到 [dev_task_archive_2026-05.md](C:/VIBE%20CODING/AI_PDM/dev_task_archive_2026-05.md)。
- 狀態：`[ ]` 待辦、`[/]` 進行中、`[x]` 已完成、`[!]` 阻塞。
- 每輪執行順序：RD 開發 -> QA 制定驗證計畫 -> QC 驗證 -> 通過後更新勾選。

## 已完成壓縮摘要

- [x] Web / Backend MVP：Next.js、SQLite、登入權限、送審、清單、明細、核准、駁回、設定、PDF preview/download。
- [x] 找圖主視覺：Dashboard 改為圖面資料庫、大型搜尋框、找圖導向表格、圖面明細優先於審核。
- [x] 版本生命週期：Released、Obsolete、Rejected、ReleaseFailed、新版發布後舊版自動廢止。
- [x] 檔案與發布：SHA256、檔案角色、Release package、Google Drive 基礎整合、製造交接頁。
- [x] BOM / Where-used / 設計重用：BOM schema、BOM diff、Where-used、reuse candidates、duplicate geometry。
- [x] 協作與品質：討論串、issue、PDF markup、AI 摘要、AI 風險提示、QC scripts。

## 本輪優先目標

目前系統操作頓挫感明顯，先處理效能與互動回饋。量測基準如下：

- 首頁初載到 network idle 約 `17.3s`。
- `/api/submissions` 一次回傳約 `1.49MB`。
- 首頁一次渲染約 `1927` 筆表格列，DOM 約 `35,223` 個節點。
- 初載自動選第一筆後，明細連續觸發 `18+` 個 API。
- 搜尋完整圖號過程約產生 `35` 個 API 請求。

## 圖面資產化導入計畫

產品方向：以圖面搜尋為入口，以組合圖 / BOM 作為資料結構骨架，以 AI/OCR 降低建檔成本；本階段不導入專案白板與手機 / 平板現場上傳。

設計原則：

- 優先減少工程師找圖、建檔、整理 BOM 的時間。
- ISO 標準品優先支援最新版、共用件、Where-used、BOM 版本差異。
- 專案客製品優先支援相似案搜尋、組合結構重用、報價 / 製造用 BOM 匯出。
- AI/OCR 只做自動填入、信心分數、來源提示與風險摘要，不做核准、刪除、覆蓋 Released。
- 已完成的 BOM schema、BOM diff、Where-used、BOM export 不重做；本計畫只補產品化、UI、欄位完整性與 QC 驗收缺口。

導入順序：

1. 自訂搜尋選項：讓使用者可依產品線、客戶、專案、製程、機台、材質、表處、圖面狀態、組合關係建立搜尋條件。
2. AI/OCR 圖面資訊擷取：從 PDF/DWG/影像與 CAD metadata 自動帶入圖號、料號、品名、版次、材質、表處、尺寸與備註，並要求人工確認。
3. 組合圖階層管理：以組合圖 / 組立件為 parent，零件圖 / 子組件為 child，支援展開、點選、狀態警示。
4. BOM 產出產品化：正式化 BOM 草稿、CSV / Excel 欄位、來源追溯、缺件 / 舊版 / 未 Released 提示。
5. BOM diff / Where-used / AI 風險摘要：讓變更影響可快速判讀，但不導入重型 ECO 流程。

## P0 待辦

| 狀態 | ID | 任務 | RD 範圍 | QA / QC 驗收 |
|---|---|---|---|---|
| [x] | DEV-PERF-001 | 搜尋輸入 debounce 與短字元保護 | 搜尋框延遲 `250-300ms` 查詢；少於 2 字不重載完整清單 | 快速輸入完整圖號時不再每字打一個 `/api/search`；結果仍正確 |
| [x] | DEV-PERF-002 | 通知請求拆離搜尋與狀態切換 | `loadNotifications()` 不跟 `searchQuery/status` 每次變更執行 | 搜尋、狀態、漏斗篩選期間 `/api/notifications` 不重複觸發 |
| [x] | DEV-PERF-003 | 明細載入取消與競態保護 | `loadDetail()` 加 `AbortController` 或 request id guard | 快速連點不同圖面，右側最後只顯示最後選取圖面；無舊資料回寫 |
| [x] | DEV-PERF-004 | 明細載入分層 | 第一層只載 `/api/submissions/:id`；AI、風險、reuse、討論等次要資料平行或 lazy load | 點選圖面後主明細快速出現；次要區塊不阻塞主明細 |
| [x] | DEV-PERF-005 | 合併明細 state 更新 | 明細相關多個 `setXxx()` 改為 reducer 或集中更新 | 點選圖面時 render commit 次數下降；明細/BOM/Where-used/討論資料仍正確 |
| [ ] | DEV-CAD-001 | SolidWorks Document Manager 或等效讀取元件 | Web/Windows 上傳可直接讀 `.sldprt/.sldasm/.slddrw` 自訂屬性 | 不依賴 sidecar 或檔名推測即可帶入圖號、料號、版次等 metadata |
| [x] | DEV-FINDER-001 | 自訂搜尋選項 | 新增搜尋條件模型、API 參數與 Dashboard 搜尋 UI；至少支援產品線、客戶、專案、製程、機台、材質、表處、狀態、父組合圖、子件料號 | 使用者可組合多個條件搜尋；結果符合權限範圍；既有全文搜尋與快速 chip 不失效 |
| [x] | DEV-AIOCR-001 | AI/OCR 圖面資訊擷取 | 導入 AI/OCR adapter，從 PDF/DWG/影像與 CAD metadata 產生欄位候選、信心分數、來源片段；提交前必須人工確認 | 缺 sidecar 時仍可帶入候選欄位；低信心欄位不得自動送審；AI/OCR 不得修改 Released 或核准資料 |
| [x] | DEV-ASM-001 | 組合圖階層管理 | 將 CAD reference / BOM line 呈現為 parent-child 組合結構；支援子件點選、數量、版次、狀態、來源檔案 | 組合圖明細可展開子件；缺件、未 Released、舊版子件有明確標示；不破壞既有 BOM / Where-used API |
| [x] | DEV-BOM-001 | BOM 產出產品化 | 正式化 BOM 草稿與匯出欄位；補 parent/child 圖號、料號、版次、品名、材質、表處、數量、狀態、來源檔案、匯出時間 | CSV / Excel 可被製造與採購直接使用；BOM 來源可追溯；無 assembly reference 時不產生假 BOM |
| [/] | DEV-SW-001 | SolidWorks Add-in 實機驗證 | 在真實 CAD 電腦完成 COM 註冊、SolidWorks UI、真實檔案端到端送審 | 實機報告含安裝、登入、屬性讀取、PDF/DWG 匯出、送審結果 |
| [/] | DEV-BACKUP-001 | 離線單向備份與還原實測 | 在獨立測試機執行 restore drill 並回填報告 | 備份可還原、checksum 正確、交接包可被第三方復原 |

## P1 待辦

| 狀態 | ID | 任務 | RD 範圍 | QA / QC 驗收 |
|---|---|---|---|---|
| [x] | DEV-PERF-006 | 圖面清單分頁或 cursor 載入 | `/api/submissions` 預設 `limit=100`，支援下一頁或 infinite scroll | 首頁不再一次回傳 1900+ 筆；status/search/權限範圍正確 |
| [x] | DEV-PERF-007 | 表格列虛擬化 | 清單只渲染可視範圍列 | DOM 節點大幅下降；滾動、選取、收藏、最近瀏覽正常 |
| [x] | DEV-PERF-008 | 搜尋與清單查詢索引化 | 補常用索引，評估 SQLite FTS 或搜尋專用表 | 同一關鍵字結果一致，查詢耗時下降 |
| [x] | DEV-PERF-009 | 清單 API 只回傳摘要欄位 | 找圖清單只回表格必要欄位，詳細資料留給明細 API | `/api/submissions` response size 降低，UI 無缺欄 |
| [x] | DEV-FINDER-002 | 儲存自訂搜尋與常用條件 | 允許使用者儲存常用搜尋條件，支援命名、套用、刪除；先以個人 localStorage 或輕量 DB 儲存 | 重新開啟 Dashboard 後仍可套用常用搜尋；刪除條件不影響其他使用者或全域資料 |
| [x] | DEV-ASM-002 | 組合圖搜尋與 Where-used 強化 | 搜尋支援上層組合圖、子件圖號、子件料號、是否含未 Released / 舊版子件；Where-used 顯示受影響組合 | 使用子件料號可找到使用它的組合圖；子件新版發布時可列出受影響 parent |
| [x] | DEV-BOM-002 | BOM diff 產品化 | 將既有 BOM diff 轉成明細 UI 與匯出；清楚列出新增、刪除、數量變更、版次變更 | 比較兩個 revision 時結果可驗證；差異匯出可被 Excel 開啟；無 BOM 時顯示明確原因 |
| [x] | DEV-AIRISK-001 | AI BOM / 組合圖風險摘要 | AI 讀取 BOM、Where-used、組合狀態後產出只讀風險摘要；包含舊版、未 Released、缺圖、料號重複、欄位缺漏 | AI 摘要必須附資料來源；不得建立或修改 PDM 紀錄；無資料時不得編造風險 |
| [ ] | DEV-FIELD-001 | 正式現場測試閉環 | 執行 `field-test:preflight -- --profile all`、`field-test:handoff` 並整理實測問題 | 現場測試報告完成，未通過項目轉為新 task |

## P2 待辦

| 狀態 | ID | 任務 | RD 範圍 | QA / QC 驗收 |
|---|---|---|---|---|
| [x] | DEV-PERF-010 | 點選圖面立即回饋與 skeleton | Row 點選立即 active，右側保留前筆或顯示 skeleton | 慢速網路下不空白閃爍，使用者知道目前選取與載入狀態 |
| [x] | DEV-PERF-011 | 搜尋/篩選導入 `useTransition` | 大量清單更新使用 transition，保持輸入與按鈕優先 | 快速打字、刪字、狀態切換、漏斗 checkbox 不卡住 |
| [x] | DEV-PERF-012 | 拆分 Dashboard 巨型元件 | 拆成 `FinderToolbar`、`SubmissionTable`、`SubmissionDetailPanel`、`NotificationDropdown`、`AssistantPanel` | lint、tsc、dashboard QC scripts 通過；主要路徑行為不變 |
| [x] | DEV-PERF-013 | 表格列 memo 化 | 抽出 `SubmissionRow` 並使用 `React.memo` | 通知、右側明細、聊天更新時不重畫整張表 |

## 阻塞 / 待確認

- [!] `DEV-CAD-001` 需要確認 SolidWorks Document Manager 授權、部署方式與測試檔來源。
- [x] `DEV-AIOCR-001` 已以本地 AI/OCR adapter contract 完成候選欄位、信心分數、來源片段與人工套用驗證；正式模型供應與資料外傳政策可作為後續營運設定。
- [!] `DEV-ASM-001` / `DEV-BOM-001` 若要直接讀 native SolidWorks reference，需要依賴 `DEV-CAD-001` 或 Add-in 端匯出 reference / BOM sidecar。
- [!] `DEV-SW-001` 需要真實 SolidWorks 電腦與管理員權限。
- [!] `DEV-BACKUP-001` 需要獨立測試機。

## 暫緩 / 不做範圍

- 專案白板式進度管理：本階段不做，避免把 AI-PDM 變成專案管理工具。
- 手機 / 平板現場上傳：本階段不做，先完成圖面搜尋、AI/OCR、組合圖與 BOM 主流程。

## 驗收原則

- 新功能必須減少工程師找圖、送審、交接或追溯的時間。
- 不新增工程師每天都不想填的欄位。
- AI 或自動化流程不得擁有核准、刪除、覆蓋 Released 的權限。
- AI/OCR 產生的欄位必須有來源與信心分數，且正式送審前需人工確認。
- 組合圖與 BOM 功能不得要求工程師每天手填大量子件資料；優先使用 CAD reference、BOM 匯出或 sidecar。
- Released 與 Obsolete 都必須可追溯：誰送審、誰核准、哪些檔案、hash、package、取代關係。
- 每個 P0/P1 任務都要有最低限度 regression test 或實機驗證紀錄。

## 變更紀錄

- 2026-05-28：依 ZUMEN 功能評估、設計思考與效用理論分析，新增圖面資產化導入計畫與自訂搜尋、AI/OCR、組合圖、BOM 產品化任務。
- 2026-05-28：主檔重寫為 active backlog；舊版完整內容封存至 `dev_task_archive_2026-05.md`。

---

# Industrialization Optimization Backlog

Update date: 2026-05-28

Status legend: `[ ]` todo, `[/]` in progress, `[x]` done, `[!]` blocked or deferred.

## Task Overview

- [x] DEV-IND-001: Establish repo baseline and current-state inventory
- [x] DEV-IND-002: Create external large-asset manifest and relocation rules
- [x] DEV-IND-003: Clean generated/dependency output boundaries
- [!] DEV-IND-004: Split `data/` runtime, fixture, and evidence management policy
- [x] DEV-IND-005: Add AI/API cost gates and usage logging
- [x] DEV-IND-006: Extract DB provider and repository contracts
- [!] DEV-IND-007: Prepare SQLite to Postgres/Supabase shadow migration
- [ ] DEV-IND-008: Split `src/lib/db.ts` by feature repository
- [ ] DEV-IND-009: Split Dashboard UI giant component
- [ ] DEV-IND-010: Split global CSS and design tokens
- [ ] DEV-IND-011: Reorganize RD/QA/QC documents and report paths
- [ ] DEV-IND-012: Add industrialization acceptance gate

## DEV-IND-001: Establish repo baseline and current-state inventory

Status: [x]

### Goal
Create a recoverable baseline and authoritative current-state inventory before any large move, delete, or refactor.

### RD Tasks
- [x] Confirm the real Git repo root; if no Git repo exists, initialize one without committing generated output or large external installer media.
- [x] Generate current-state inventory for root items, file counts, file sizes, file extensions, and top-level ownership.
- [x] Scan package scripts, README, env examples, csproj files, Cloud Function config, and scripts for path dependencies.
- [x] Save the inventory as a reviewable artifact under `docs/industrialization/`.

### QA Validation Plan
- [x] Scope: verify baseline creation, inventory coverage, and no product behavior changes.
- [x] Check no runtime data, dependency output, or large external installer media is accidentally staged for source control.
- [x] Check inventory includes root item summary, extension summary, top-level directory size summary, and dependency references.
- [x] Pass criteria: inventory exists, Git status is inspectable, and `npm.cmd run lint` passes.

### QC Fact Report
- [x] Evidence command: `git status --short --ignored` showed only ignored external/generated/runtime paths after baseline commit.
- [x] Evidence command: inventory spot check confirmed root item summary, extension summary, top-level directory size summary, and dependency scan sections in `docs/industrialization/current-state-inventory-2026-05-28.md`.
- [x] Evidence command: `npm.cmd run lint` passed.
- [x] Result: PASS. Baseline commit `40a79cc` created without staging large external installer media, runtime data, dependency directories, or generated outputs.

### Risks / Notes
- [x] The current workspace was not a Git repository at task start.
- [x] Root contains large installer/runtime files that must not be blindly committed as source.

## DEV-IND-002: Create external large-asset manifest and relocation rules

Status: [x]

### Goal
Move CAB/MSI/MSP/MZZ/DLL/language runtime assets out of the source boundary while keeping checksum traceability.

### RD Tasks
- [x] Define `docs/assets/external-assets-manifest.json` schema.
- [x] Compute SHA256, original path, target path, purpose, and dependency references for each large asset.
- [x] Plan and apply external target root as `C:\VIBE CODING\AI_PDM_external_assets\`.

### QA Validation Plan
- [x] Scope: verify traceability, checksum stability, and dependency-safe relocation.
- [x] Check every moved asset has manifest metadata and SHA256.
- [x] Pass criteria: manifest verifier proves hashes match after relocation and source copies no longer remain in the workspace.

### QC Fact Report
- [x] Evidence command: `npm.cmd run assets:verify -- --manifest docs/assets/external-assets-manifest.json` passed with `146 ok`, `0` missing, `0` hash mismatches, and `0` original files remaining in the workspace.
- [x] Evidence command: dependency scan for moved paths returned no matches in product source/config/script paths.
- [x] Evidence artifact: `docs/assets/external-assets-verification-2026-05-28.md`.
- [x] Result: PASS. Moved 69 top-level installer/runtime asset items containing 146 files and 2,532,241,225 bytes to `C:\VIBE CODING\AI_PDM_external_assets\`.

## DEV-IND-003: Clean generated/dependency output boundaries

Status: [x]

### Goal
Exclude build outputs and dependency products from the source boundary.

### RD Tasks
- [x] Ensure `.next`, `node_modules`, `cloud-functions/release-handler/node_modules`, `sw-addin/bin`, `sw-addin/obj`, and `tsconfig.tsbuildinfo` are ignored.
- [x] Update related documentation in `docs/industrialization/source-boundary-policy-2026-05-28.md`.
- [x] Confirm Cloud Function and Add-in outputs can be rebuilt from source-level inputs.

### QA Validation Plan
- [x] Scope: verify clean source boundary without breaking build/test flows.
- [x] Pass criteria: ignored output is not staged, lint passes, Cloud Function dependency dry-run passes, and source-level Add-in QC can run.

### QC Fact Report
- [x] Evidence command: `git status --short --ignored`.
- [x] Evidence command: `npm.cmd run qc:source-boundary` passed with 18 checks.
- [x] Evidence command: `npm.cmd run lint` passed.
- [x] Evidence command: `npm.cmd run qc:sw-addin-source` passed with 63 checks.
- [x] Evidence command: `npm.cmd --prefix cloud-functions/release-handler ci --dry-run --ignore-scripts` passed with a local Node engine warning.
- [x] Evidence artifact: `docs/industrialization/source-boundary-verification-2026-05-28.md`.
- [x] Result: PASS.

## DEV-IND-004: Split `data/` runtime, fixture, and evidence management policy

Status: [!]

### Goal
Separate runtime DB/repository, fixtures, quality evidence, and generated reports.

### RD Tasks
- [x] Define ownership for runtime data, QC fixtures, quality records, evidence, and reports.
- [x] Update path-sensitive scripts to use centralized `scripts/pdm-paths.mjs` while preserving current defaults.
- [x] Keep formal DB/repository ignored from source control.

### QA Validation Plan
- [x] Scope: verify backup, restore, field-test, QC, and evidence paths.
- [!] Pass criteria: path-sensitive scripts resolve required files, but current runtime file-hash integrity is blocked by existing ignored data.

### QC Fact Report
- [x] Evidence command: `npm.cmd run qc:data-boundary` passed with 36 checks.
- [x] Evidence command: `npm.cmd run backup:verify` passed against latest backup snapshot.
- [x] Evidence command: `npm.cmd run field-test:preflight -- --profile restore` passed.
- [!] Evidence command: `npm.cmd run qc:file-hashes` failed because DB row `file-idx-473870` references missing `data/repository/IDX-473870.pdf` and stores invalid hash `idx-hash`.
- [x] Evidence artifact: `docs/industrialization/data-boundary-verification-2026-05-28.md`.
- [!] Result: PARTIAL PASS / BLOCKED by pre-existing runtime data integrity issue. Source-path boundary changes are complete; runtime data repair is deferred.

## DEV-IND-005: Add AI/API cost gates and usage logging

Status: [x]

### Goal
Prevent unnecessary LLM/API calls and make compute cost measurable.

### RD Tasks
- [x] Prefer deterministic local tools whenever they can answer.
- [x] Add context budget, query cache, timeout, and rate limit.
- [x] Log provider, model, estimated usage, cache hit, tool hit, API call, and error reason without secrets or raw prompts.

### QA Validation Plan
- [x] Scope: verify local/tool-first behavior, cache behavior, and no secret leakage.
- [x] Pass criteria: mock OpenAI receives zero calls for locally answerable prompts and repeated fallback prompts use cache.

### QC Fact Report
- [x] Evidence command: `npm.cmd run qc:openai-provider` passed with 18 checks.
- [x] Evidence command: `npm.cmd run lint` passed.
- [x] Evidence artifact: `docs/industrialization/ai-cost-gates-verification-2026-05-28.md`.
- [x] Result: PASS.

## DEV-IND-006: Extract DB provider and repository contracts

Status: [x]

### Goal
Prepare for SQLite/Postgres dual support without changing CAD Add-in API contracts.

### RD Tasks
- [x] Add `DatabaseProvider` and feature repository interfaces.
- [x] Keep route handlers focused on auth, validation, and response mapping.
- [x] Keep SQLite adapter as local fallback.

### QA Validation Plan
- [x] Scope: verify HTTP API compatibility and repository contract behavior.
- [x] Pass criteria: API response shape remains compatible.

### QC Fact Report
- [x] Evidence command: `npm.cmd run qc:db-provider-contract` passed with 20 checks.
- [x] Evidence command: `npm.cmd run lint` passed.
- [x] Evidence command: `npm.cmd run build` passed; observed existing Next tracing warning from dynamic path resolution in `src/lib/llm-usage.ts`.
- [x] Evidence command: `npm.cmd run qc:api` passed with 391 checks.
- [x] Evidence artifact: `docs/industrialization/db-provider-contract-verification-2026-05-28.md`.
- [x] Result: PASS.

## DEV-IND-007: Prepare SQLite to Postgres/Supabase shadow migration

Status: [!]

### Goal
Validate schema, data consistency, RLS, and rollback before production provider switch.

### RD Tasks
- [x] Draft Postgres migration.
- [x] Add row count and key hash comparison tooling.
- [x] Plan Supabase RLS without `user_metadata` authorization decisions.

### QA Validation Plan
- [x] Scope: verify repeatable migration and security posture.
- [!] Pass criteria: local migration generation, static RLS, and SQLite row count/key hashes pass; live Supabase advisor requires a disposable Supabase project or branch.

### QC Fact Report
- [x] Evidence command: `npm.cmd run db:postgres:migration` generated 24-table Postgres migration and RLS plan.
- [x] Evidence command: `npm.cmd run db:postgres:compare` passed local static/table coverage and SQLite row count/key hash capture.
- [x] Evidence command: `npm.cmd run qc:postgres-shadow` passed with 16 checks.
- [x] Evidence command: `npm.cmd run lint` passed.
- [!] Evidence command: live Supabase advisor/RLS check not executed because no disposable Supabase project or branch is configured.
- [x] Evidence artifact: `docs/industrialization/postgres-shadow-migration-plan-2026-05-28.md`.
- [!] Result: PARTIAL PASS / BLOCKED for live Supabase advisor only.

## DEV-IND-008: Split `src/lib/db.ts` by feature repository

Status: [ ]

### Goal
Reduce risk in the 3000+ line data layer by moving one feature at a time.

### RD Tasks
- [ ] Split submissions, items, release, bom, shares, notifications, and ai repositories incrementally.
- [ ] Move queries and mappers without behavior changes.
- [ ] Run validation after each feature move.

### QA Validation Plan
- [ ] Scope: verify behavior-preserving extraction.
- [ ] Pass criteria: lint/build/API regression pass after extraction.

### QC Fact Report
- [ ] Evidence command: `npm.cmd run lint`.
- [ ] Evidence command: `npm.cmd run build`.
- [ ] Evidence command: `npm.cmd run qc:api`.
- [ ] Result:

## DEV-IND-009: Split Dashboard UI giant component

Status: [ ]

### Goal
Split Dashboard UI into maintainable components while preserving behavior.

### RD Tasks
- [ ] Extract FinderToolbar, SubmissionTable, SubmissionDetailPanel, NotificationDropdown, and AssistantPanel.
- [ ] Preserve current API calls and user interactions.
- [ ] Avoid broad state-management rewrites in the first pass.

### QA Validation Plan
- [ ] Scope: verify UI behavior and no layout regression.
- [ ] Pass criteria: dashboard QC scripts pass and UI remains usable.

### QC Fact Report
- [ ] Evidence command: dashboard QC scripts.
- [ ] Evidence command: desktop/mobile UI spot checks.
- [ ] Result:

## DEV-IND-010: Split global CSS and design tokens

Status: [ ]

### Goal
Turn the 2000+ line global CSS into controlled style layers.

### RD Tasks
- [ ] Extract color, spacing, typography, and z-index tokens.
- [ ] Move feature styles to scoped modules or clear sections.
- [ ] Preserve current visual design.

### QA Validation Plan
- [ ] Scope: verify visual stability across main pages.
- [ ] Pass criteria: no major visual regressions and UI QC passes.

### QC Fact Report
- [ ] Evidence command: `npm.cmd run qc:ui`.
- [ ] Evidence: screenshots or visual spot-check notes.
- [ ] Result:

## DEV-IND-011: Reorganize RD/QA/QC documents and report paths

Status: [ ]

### Goal
Make documents, validation plans, reports, and runbooks traceable.

### RD Tasks
- [ ] Plan `docs/reports/{rd,qa,qc}`, `docs/validation-plans`, and `docs/runbooks`.
- [ ] Update report generation and evidence sync scripts.
- [ ] Keep old path index or redirect documentation.

### QA Validation Plan
- [ ] Scope: verify report generation and evidence links.
- [ ] Pass criteria: scripts find the new paths and do not lose evidence references.

### QC Fact Report
- [ ] Evidence command: report generation scripts.
- [ ] Evidence command: `npm.cmd run qa:dev-task:sync`.
- [ ] Result:

## DEV-IND-012: Add industrialization acceptance gate

Status: [ ]

### Goal
Create one final gate for this industrialization round.

### RD Tasks
- [ ] Add `qc:industrialization` or equivalent gate.
- [ ] Include lint, build, API, UI, asset manifest, AI cost mock, and Postgres shadow checks where available.
- [ ] Document the gate in README/runbook.

### QA Validation Plan
- [ ] Scope: verify that one command proves the round is complete.
- [ ] Pass criteria: gate is runnable in a clean environment and failures identify a concrete task.

### QC Fact Report
- [ ] Evidence command: industrialization gate.
- [ ] Result:

## Dependencies

- DEV-IND-001 must complete first.
- DEV-IND-002, DEV-IND-003, and DEV-IND-004 must complete before large refactors.
- DEV-IND-006 must complete before DEV-IND-007 and DEV-IND-008.
- DEV-IND-005 can run in parallel with folder cleanup but must complete before AI cost acceptance.
- DEV-IND-012 is the final gate for this optimization round.
