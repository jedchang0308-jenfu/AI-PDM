# AI PDM MVP

AI PDM 是一套以 SolidWorks 圖面送審、審核、發布與檔案追溯為核心的 PDM MVP。系統目前包含 Next.js Web Admin UI、SQLite 本地資料庫、檔案 repository、Google Drive 整合、AI 助手、備份還原工具，以及 SolidWorks C# Add-in 雛形。

## 目前已完成的主要能力

- Web 審核工作台：送審清單、明細、核准、駁回、狀態篩選。
- 檔案管理：PDF preview、檔案下載、SHA256、檔案大小、類型白名單、hash 重算檢查。
- 權限控管：本地 scrypt 帳號、Cookie session、Bearer token、Engineer / R&D Manager / Admin 角色。
- AI 助手：待審查詢、統計查詢、規則查詢、submission context、工具白名單與破壞性操作防護。
- Google Drive：Pending upload、Released move、本地補償處理、PDF viewer embed。
- Release 流程：`PDM_RELEASE_MODE` guard、local-dev stub、Cloud Function URL 預留、ReleaseFailed 狀態、retry、Released 同名檔案阻擋。
- SolidWorks Add-in：WPF 登入與送審 UI、DPAPI token、屬性擷取、PDF/DWG 背景匯出、Multipart upload。
- 備份還原：本地快照、checksum、restore drill、retention drill、每月還原演練 SOP。
- QC 自動化：`qc:full` 串接 lint、audit、build、integration、API regression、UI E2E 與 file hash verification。
- CI：GitHub Actions workflow 已建立，會在 GitHub runner 執行 `npm run qc:full`。

## 開發環境需求

- Windows PowerShell
- Node.js 24
- npm
- Playwright Chromium browser
- SolidWorks 與 .NET Framework 4.8 僅在測試 Add-in 時需要

PowerShell 可能會攔截 `npm.ps1`，本專案建議使用 `npm.cmd`。

## 快速啟動

```powershell
npm.cmd install
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

開啟：

```text
http://127.0.0.1:3000
```

## 帳號模式

本機開發預設使用 demo 模式：

預設 demo 密碼：

```text
pdm-demo
```

常用帳號由 `scripts/seed.mjs` 建立：

- `engineer@example.com`
- `manager@example.com`
- `admin@example.com`

正式或試營運環境請改用 managed 模式，並用 `PDM_BOOTSTRAP_USERS` 建立初始帳號：

```text
PDM_AUTH_MODE=managed
PDM_BOOTSTRAP_USERS=[{"id":"user-admin","displayName":"Admin","email":"admin@company.com","password":"change-me","role":"Admin"}]
```

`managed` 模式不會自動建立 demo users，也不接受沒有 password hash 的舊帳號 fallback。

## 常用指令

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd audit --audit-level=moderate
npm.cmd run smoke
npm.cmd run qc:api
npm.cmd run qc:defects-zero
npm.cmd run qc:ui
npm.cmd run qc:full
npm.cmd run qc:industrialization
npm.cmd run qc:file-hashes
```

完整 QC 建議使用：

```powershell
npm.cmd run qc:full
```

工業化整理任務完成前，使用：

```powershell
npm.cmd run qc:industrialization
```

`qc:industrialization` 聚焦 source/data boundary、asset manifest、AI/API cost gate、DB contract、Postgres shadow、Dashboard/CSS/document boundary、lint、build、API regression 與 UI E2E。詳細流程見 `docs/runbooks/industrialization-acceptance-gate.md`。

`qc:full` 會依序執行：

1. lint
2. audit
3. build
4. policy alignment
5. P0/P1 defects zero
6. SolidWorks Add-in source static QC
7. Google Drive integration
8. local Google Drive compensation
9. release failure integration
10. release config guard
11. release folder selection
12. managed auth integration
13. OpenAI provider integration
14. Next.js dev server smoke
15. API regression
16. UI E2E
17. file hash verification

## 主要資料路徑

```text
data/ai-pdm.sqlite
data/repository/
data/backups/
```

## 環境變數

可從 `.env.example` 複製成 `.env`：

```text
PDM_DATA_DIR=./data
PDM_REPOSITORY_DIR=./data/repository
PDM_MAX_UPLOAD_FILE_BYTES=52428800
PDM_BACKUP_DIR=./data/backups
PDM_BACKUP_EXTRA_PATHS=

PDM_AUTH_MODE=demo
PDM_BOOTSTRAP_USERS=

PDM_RELEASE_MODE=local_stub
RELEASE_FUNCTION_URL=
RELEASE_FUNCTION_TOKEN=

LLM_PROVIDER=local
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT_MS=30000

GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./secrets/sa-key.json
GOOGLE_DRIVE_PENDING_FOLDER_ID=
GOOGLE_DRIVE_RELEASED_FOLDER_ID=
```

## Release 模式

`PDM_RELEASE_MODE` 控制沒有正式發布管道時的行為：

- `local_stub`：只適合本機開發驗證；未設定 `RELEASE_FUNCTION_URL` 與 Released folder ID 時，approve 會走 local-dev stub。
- `auto`：非 production 可走 local-dev stub；`NODE_ENV=production` 時若未設定發布管道會失敗。
- `strict`：正式安全模式；未設定 `RELEASE_FUNCTION_URL` 或 Released folder ID 時，approve 會回 `ReleaseFailed`。

若已設定 Google Drive Released folder，系統會執行本地 Google Drive move，並在失敗時做補償處理。

## LLM 模式

未設定 API key 時：

```text
LLM_PROVIDER=local
```

系統會使用 deterministic helper 回答 PDM 相關查詢。

要使用 OpenAI：

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

## SolidWorks Add-in

Add-in 專案位於：

```text
sw-addin/AiPdmAddin.sln
```

實機手動驗證清單：

```text
docs/solidworks-addin-manual-test-checklist.md
```

源碼級自動檢查：

```powershell
npm.cmd run qc:sw-addin-source
npm.cmd run qc:sw-addin-build
```

實機測試報告模板：

```powershell
npm.cmd run sw-addin:report:new
npm.cmd run qc:sw-addin-real-machine-report:report
```

現場測試完成後，回填 `data/sw-addin-test-reports/<reportId>/report.json`，再執行：

```powershell
npm.cmd run qc:sw-addin-real-machine-report
```

CAD 機註冊 Add-in 時，請用系統管理員 PowerShell 執行：

```powershell
.\scripts\register-sw-addin.ps1
```

測試後需要移除註冊時：

```powershell
.\scripts\unregister-sw-addin.ps1
```

注意：CAD 電腦不得保存 Google Service Account key 或任何雲端高權限憑證。Add-in 只應持有個人 token。

## P0/P1 缺陷清零

缺陷登記冊位於：

```text
data/quality/defect-register.json
```

QC 發現缺陷時，將缺陷寫入 `defects` 陣列。正式上線要求所有 `P0` / `P1` 缺陷狀態都必須是 `closed` 或 `verified`。

```powershell
npm.cmd run qc:defects-zero:report
npm.cmd run qc:defects-zero
```

## 備份與還原

```powershell
npm.cmd run backup
npm.cmd run backup:verify
npm.cmd run backup:drill
npm.cmd run backup:retention-drill
npm.cmd run backup:handoff
```

還原演練 SOP：

```text
docs/restore-drill-sop.md
```

`backup:handoff` 會產生 `data/restore-handoffs/<snapshotId>`，內含測試機還原用的 JSON 摘要、README 與 PowerShell 指令。

## 現場驗證交接

```powershell
npm.cmd run field-test:preflight -- --profile all
npm.cmd run field-test:preflight -- --profile cad
npm.cmd run field-test:preflight -- --profile restore
npm.cmd run field-test:handoff
```

`field-test:preflight` 用來在正式現場測試前檢查 CAD 或還原測試機環境。CAD profile 會檢查 .NET Framework 4.8 targeting pack、MSBuild、SolidWorks interop、Add-in 註冊腳本與實機報告；restore profile 會檢查還原腳本、還原交接包與還原演練報告。若 CAD profile 顯示 Administrator warning，代表需改用系統管理員 PowerShell 執行 COM 註冊。

`field-test:handoff` 會產生 `data/field-test-handoffs/<handoffId>`，內含 restore/CAD preflight 指令、報告回填範本與最終 QC checklist。

## CI

GitHub Actions workflow：

```text
.github/workflows/ci.yml
```

CI 使用 Windows runner，安裝依賴與 Playwright Chromium 後執行：

```powershell
npm run qc:full
```

## 正式上線前仍需確認

查看正式上線阻擋項：

```powershell
npm.cmd run qc:production-readiness:report
```

正式上線 gate：

```powershell
npm.cmd run qc:production-readiness
```

- 正式 PDM 管理辦法基準草案已建立，但仍需管理層正式核准。
- 兩位審核基準規則已定義：`approval_required=2` 時兩位不同審核者都要核准。
- Released 同名檔案 MVP 基準策略已定義：禁止發布並回錯誤。
- SolidWorks Add-in 已可產出 Release x64 DLL；正式上線前仍需在真實 CAD 電腦以系統管理員完成 COM 註冊與 SolidWorks UI 實機測試。
- 離線備份與還原演練需要在獨立測試機實測。
- P0/P1 缺陷清零由 `data/quality/defect-register.json` 與 `qc:defects-zero` 追蹤。
- GitHub Actions 需要推送到 GitHub 後由 runner 實際執行。
