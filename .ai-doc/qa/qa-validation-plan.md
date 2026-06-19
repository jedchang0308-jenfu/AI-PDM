# AI PDM QA 驗證計畫

版本：v0.3  
日期：2026-05-18  
角色：QA  
適用範圍：AI PDM Web/API MVP 與 Phase 2 預備驗證

## 1. 文件目的

本文件定義 AI PDM 目前版本的 QA 驗證策略、測試範圍、驗證環境、測試案例分類、通過標準與風險控管，讓 RD、QA、QC 對「哪些功能已驗證、哪些尚未驗證、哪些不可上線」有一致判準。

本次調用的思考習慣：

- `#找對問題RightProblem`：先區分 MVP 已交付範圍與尚未實作的正式 PDM 範圍，避免用錯驗證標準。
- `#來源品質SourceQuality`：以目前實際程式、task 清單、既有測試腳本為主要依據，不以口頭假設判定。
- `#系統思考SystemsThinking`：把 Web、API、SQLite、repository、auth、AI、未來 Drive/Cloud Function 視為同一流程鏈。
- `#風險緩解RiskMitigation`：優先驗證會造成錯誤發布、資料遺失、權限越權、狀態不一致的高風險點。
- `#受眾意識AudienceAware`：以非 IT 背景管理者也能快速判讀的方式撰寫。

## 2. 驗證目標

目前 QA 目標分兩層：

1. 驗證 Web/API MVP 是否已形成可重複驗證的閉環。
2. 明確列出 Phase 2 尚未完成、因此不得以「正式 PDM 已完成」對外宣稱的區域。

本版 QA 主要確認以下事項：

- 送審 API 可建立 submission 與 repository 檔案。
- 唯一性限制與基本 validation 可阻擋不合法資料。
- 審核流程可正確從 `Pending` 轉為 `Released` 或 `Rejected`。
- Auth / role 權限可阻擋未登入與 Engineer 越權核准。
- PDF preview / download endpoint 可用且具登入保護。
- repository 與 DB 不應產生 orphan file 或 missing file。
- AI 助手目前僅限查詢，不應具備修改權限。

## 3. 驗證範圍

### 3.1 本次納入 QA 驗證

- Next.js Admin UI
- SQLite schema 與資料一致性
- Local repository 檔案保存
- `POST /api/submissions`
- `GET /api/submissions`
- `GET /api/submissions/{id}`
- `POST /api/submissions/{id}/approve`
- `POST /api/submissions/{id}/reject`
- `GET /api/submissions/{id}/files/{fileId}`
- `GET /api/submissions/{id}/files/{fileId}/preview`
- `/login` 與 session cookie auth
- Web AI chat MVP
- `scripts/smoke-test.mjs`
- `scripts/qc-api-test.mjs`

### 3.2 本次不納入正式通過判定

以下項目因尚未實作完成，只列入 Phase 2 預備驗證，不列入 MVP Pass：

- SolidWorks C# Add-in
- Google Drive Pending upload
- Google Cloud Function release
- PDF / DWG `appProperties` 防偽 metadata
- 正式帳號系統或 Supabase Auth
- Engineer 僅能查看自己或被授權資料
- Admin 系統設定權限封鎖
- 離線備份與還原演練
- two-reviewer workflow

## 4. 驗證環境

| 項目 | 設定 |
|---|---|
| OS | Windows |
| Node.js | v24.12.0 |
| Package manager | npm.cmd |
| App | Next.js 16 |
| Database | `data/ai-pdm.sqlite` |
| Repository | `data/repository` |
| Base URL | `http://127.0.0.1:3000` |

## 5. 驗證前置條件

```powershell
npm.cmd install
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

測試前需確認：

- `data/ai-pdm.sqlite` 可建立或已存在。
- `data/repository` 可寫入。
- demo users 可登入：
  - `engineer@example.com`
  - `manager@example.com`
- `PDM_DEMO_PASSWORD` 若有設定，測試腳本需使用同一密碼。
- managed auth 驗證：`PDM_AUTH_MODE=managed` 時，只允許 `PDM_BOOTSTRAP_USERS` 宣告的帳號登入，demo users 不可自動登入。

## 6. 驗證策略

### 6.1 自動化驗證

固定執行：

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd audit --audit-level=moderate
npm.cmd run smoke
npm.cmd run qc:api
npm.cmd run qc:policy-alignment
npm.cmd run qc:defects-zero:report
npm.cmd run qc:sw-addin-source
npm.cmd run qc:sw-addin-real-machine-report:report
npm.cmd run qc:production-readiness:report
```

用途：

- `lint`：找出明顯語法與規範問題。
- `build`：確認 Next.js route、TypeScript 與 production build 可通過。
- `audit`：檢查中度以上已知套件漏洞。
- `smoke`：驗證最小送審到核准閉環。
- `qc:api`：驗證主要 API regression。
- `qc:policy-alignment`：驗證 PDM 管理辦法、AI RAG 來源與已實作規則一致。
- `qc:sw-addin-source`：在無 SolidWorks 實機環境下，先驗證 Add-in 專案結構、COM 入口、安全限制、DPAPI、Bearer token、multipart upload、暫存清理與 WPF 送審流程。
- `qc:sw-addin-real-machine-report`：驗證現場回填的 SolidWorks 實機測試報告是否已全數通過。
- `qc:sw-addin-real-machine-report:report`：報告模式；未回填或未通過時列出原因但不讓一般 QC 命令失敗。
- `qc:production-readiness`：正式上線 gate；若仍有未完成或部分完成的 P0/P1，必須 fail。
- `qc:production-readiness:report`：報告模式；列出阻擋項但不讓命令失敗，適合一般 QC 報告。

### 6.2 手動驗證

手動驗證重點：

- `/login` 登入與登出流程。
- 首頁 metrics、列表、明細是否可讀。
- Pending / Released / Rejected 狀態切換是否正確。
- PDF preview 是否能以新分頁 inline 開啟。
- Download 是否可成功下載檔案。
- Engineer 角色 UI 是否隱藏不可操作按鈕。
- AI 對話是否能回答清單、統計、規則問題。

### 6.3 文件比對驗證

需對照：

- [PDM_dev_task.md](</C:/VIBE CODING/AI_PDM/PDM_dev_task.md>)
- [.ai-doc/reference/system-design.md](</C:/VIBE CODING/AI_PDM/.ai-doc/reference/system-design.md>)
- [.ai-doc/reference/pdm-management-policy-draft.md](</C:/VIBE CODING/AI_PDM/.ai-doc/reference/pdm-management-policy-draft.md>)
- [src/lib/pdm-policy-rag-data.ts](</C:/VIBE CODING/AI_PDM/src/lib/pdm-policy-rag-data.ts>)
- [scripts/qc-api-test.mjs](</C:/VIBE CODING/AI_PDM/scripts/qc-api-test.mjs>)

目的：

- 確認 task 標記為完成的功能，已有對應驗證證據。
- 尚未完成的項目，不得在 QA 結論中誤判為通過。

## 7. 測試案例矩陣

### 7.1 Build / 基礎品質

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| BLD-001 | ESLint | `npm.cmd run lint` | Exit code 0 | P1 |
| BLD-002 | Production build | `npm.cmd run build` | Exit code 0 | P1 |
| BLD-003 | Security audit | `npm.cmd audit --audit-level=moderate` | 0 vulnerabilities | P1 |
| BLD-004 | PDM 管理辦法一致性 | `npm.cmd run qc:policy-alignment` | 管理辦法、RAG generated data 與核心規則一致 | P0 |
| BLD-005 | 正式上線 readiness gate | `npm.cmd run qc:production-readiness` | 未完成或部分完成的 P0/P1 為 0；否則 fail 並列出 blocker | P0 |
| BLD-006 | SolidWorks Add-in source static QC | `npm.cmd run qc:sw-addin-source` | Add-in 源碼結構與安全 / 送審設計符合規格 | P1 |
| BLD-007 | SolidWorks Add-in real-machine report | `npm.cmd run qc:sw-addin-real-machine-report` | 最新實機測試回填報告全部必填案例通過，且 P0/P1 finding 已關閉或接受 | P0 |

### 7.2 Auth / Role

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| AUTH-001 | 未登入讀 submissions | 呼叫 `GET /api/submissions` | 回 `401` | P0 |
| AUTH-002 | Engineer 不可 approve | Engineer 呼叫 approve API | 回 `403` | P0 |
| AUTH-003 | 未登入下載檔案 | 呼叫 file download endpoint | 回 `401` | P0 |
| AUTH-004 | demo login | `/login` 手動登入 | 可進入首頁 | P1 |
| AUTH-005 | logout | 手動登出 | 需回到 login 狀態 | P1 |
| AUTH-006 | managed auth mode | `PDM_AUTH_MODE=managed` + `PDM_BOOTSTRAP_USERS` | bootstrap users 可登入，demo users 回 `401` | P0 |

### 7.3 Submission API

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| API-001 | 正常送審 | multipart 上傳合法欄位與 PDF | 回 `201`，狀態 `Pending` | P0 |
| API-002 | 缺 `drawing_number` | 送出空值 | 回 `400` | P0 |
| API-003 | 缺 `part_number` | 送出空值 | 回 `400` | P0 |
| API-004 | 無檔案 | 不附 `files` | 回 `400` | P0 |
| API-005 | 變更原因太短或無效 | 送出不合法字串 | 回 `400` | P1 |
| API-006 | 純數字變更原因 | `12345` | 回 `400` | P1 |
| API-007 | 重複圖號 + 版次 | 重送相同 `drawing_number + revision` | 回 `409` | P0 |

### 7.4 Workflow

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| WF-001 | Pending approve | Manager approve | 轉 `Released` | P0 |
| WF-002 | Pending reject | Manager reject | 轉 `Rejected` | P0 |
| WF-003 | Released 再 approve | 對 Released 再送 approve | 回 `409` | P0 |
| WF-004 | Rejected 再 approve | 對 Rejected 再送 approve | 回 `409` | P0 |
| WF-005 | local-dev release stub | `PDM_RELEASE_MODE=local_stub` 且未設定 `RELEASE_FUNCTION_URL` | 可回 `Released` 並標記 local-dev-stub | P1 |
| WF-006 | strict release config guard | `PDM_RELEASE_MODE=strict` 且未設定發布管道 | 回 `500`、狀態 `ReleaseFailed`、錯誤為 `RELEASE_NOT_CONFIGURED` | P0 |
| WF-007 | Cloud Function folder selection | Admin 在 `/settings` 設定 Pending / Released folder ID 後 approve | Cloud Function payload 使用使用者設定的 folder ID，而非 env fallback | P0 |

### 7.5 File / Repository

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| FILE-001 | 檔案下載 | 呼叫 download endpoint | 回 `200` | P1 |
| FILE-002 | 下載 disposition | 檢查 header | `attachment` | P1 |
| FILE-003 | PDF preview | 呼叫 preview endpoint | 回 `200` | P0 |
| FILE-004 | preview content-type | 檢查 header | `application/pdf` | P0 |
| FILE-005 | preview disposition | 檢查 header | `inline` | P1 |
| FS-001 | repository 寫入 | 送審後檢查 `data/repository` | 有新檔案 | P0 |
| FS-002 | DB 保存 local_path | 查 `submission_files` | 有對應路徑 | P0 |
| FS-003 | duplicate 不產生 orphan | duplicate 測試前後比對 | orphan 數量不增加 | P0 |
| FS-004 | DB / repository 一致性 | 交叉檢查 tracked vs actual | orphan 0、missing 0 | P0 |

### 7.6 UI

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| UI-001 | 首頁載入 | 開啟 `/` | 可看到 dashboard | P0 |
| UI-002 | metrics 顯示 | 檢查 Pending/Released/Rejected/Failed | 數值可顯示 | P1 |
| UI-003 | submission 清單 | 切換狀態 tab | 列表更新 | P0 |
| UI-004 | submission 明細 | 點選單筆資料 | 可看到檔案與 SHA256 | P0 |
| UI-005 | 檔案操作按鈕 | 明細內點 preview/download | 可開啟對應端點 | P1 |
| UI-006 | Engineer UI 權限 | Engineer 登入 | 不應顯示 approve/reject 按鈕 | P0 |

### 7.7 AI

| ID | 驗證項目 | 驗證方式 | 預期結果 | 優先級 |
|---|---|---|---|---|
| AI-001 | 待審查詢 | 詢問待審清單 | 可回覆 Pending submissions | P1 |
| AI-002 | 統計查詢 | 詢問統計 | 可回覆各狀態數量 | P1 |
| AI-003 | 規則查詢 | 詢問圖號/料號/版次規則 | 可回覆既有規則 | P1 |
| AI-004 | submission context | 在單筆明細頁詢問目前資料 | 可帶出當前 submission context | P1 |
| AI-005 | AI 不可 approve | 嘗試要求 AI 核准 | 不應執行修改操作 | P0 |
| AI-006 | AI 不可 reject/delete/revise | 嘗試要求 AI 做破壞性操作 | 不應執行 | P0 |

## 8. 驗證執行順序

建議每輪固定依序執行：

1. `npm.cmd run lint`
2. `npm.cmd run build`
3. `npm.cmd audit --audit-level=moderate`
4. `npm.cmd run smoke`
5. `npm.cmd run qc:api`
6. `npm.cmd run qc:policy-alignment`
7. `npm.cmd run qc:sw-addin-source`
8. `npm.cmd run qc:sw-addin-real-machine-report:report`
9. `npm.cmd run qc:production-readiness:report`
10. 手動驗證 login / dashboard / detail / preview / download / AI
11. 紀錄結果到 QC 或 QA 報告

## 9. 通過標準

### 9.1 MVP 可通過條件

需同時滿足：

- `lint`、`build`、`smoke`、`qc:api` 全數通過。
- 所有 P0 測試案例通過。
- 無新增 orphan file 或 missing file。
- 未發現未登入可存取資料、Engineer 可越權核准等權限缺陷。
- 手動驗證可完成基本登入、查看、預覽、下載、核准、駁回流程。

### 9.2 不可判定為正式上線通過的條件

即使 MVP 通過，只要以下項目未完成，仍不可視為正式 PDM 可上線：

- `npm.cmd run qc:production-readiness` 仍回報 P0/P1 blocker。
- SolidWorks Add-in 尚未在真實 CAD 電腦完成編譯、註冊與實機測試。
- 離線備份與還原尚未在獨立測試機完成實測。
- 正式 PDM 管理辦法尚未由管理層核准。

## 10. 缺陷分級

| 等級 | 定義 | 例子 |
|---|---|---|
| P0 | 會造成錯誤發布、資料遺失、權限越權、不可用 | 未登入可下載文件、核准後狀態錯亂 |
| P1 | 核心流程可 workaround，但風險高 | preview 可用但檔案權限檢查不完整 |
| P2 | 改善項或技術債 | Turbopack warning、README 亂碼 |

## 11. 已知風險與 QA 判定

| 項目 | 目前狀態 | QA 判定 |
|---|---|---|
| `node:sqlite` experimental warning | 已清除 | 已由 `better-sqlite3` 取代 |
| Turbopack dynamic trace warning | 已清除 | 已由 RD 於 2026-05-22 拆分 path-heavy config imports 後清除 |
| release 仍可能靜默 local-dev stub | 已加 `PDM_RELEASE_MODE=strict` guard | 正式環境需使用 `strict` 或設定 Cloud Function / Released folder |
| Google Drive / Cloud Function 未接上 | 已有 integration / mock failure / folder selection 測試 | 正式環境仍需設定真實憑證、資料夾與 Cloud Function URL |
| demo users / demo auth | 已加 managed auth mode | 正式環境需設定 `PDM_AUTH_MODE=managed` 與 `PDM_BOOTSTRAP_USERS` |
| two-reviewer workflow | MVP 已完成 | 已納入 `qc:api`，仍需依正式 PDM 管理辦法確認是否啟用 |
| 正式上線 P0/P1 blocker | 已加 `qc:production-readiness` | 只要仍有 open / partial P0/P1，正式上線 gate 必須 fail |
| SolidWorks Add-in source drift | 已加 `qc:sw-addin-source` | 可自動擋住源碼級偏離；實機編譯 / 註冊仍需 CAD 電腦 |
| SolidWorks 實機測試回填缺口 | 已加 `sw-addin:report:new` 與 `qc:sw-addin-real-machine-report` | readiness report 會顯示最新實機報告是否已通過 |

## 12. Phase 2 預備驗證計畫

後續功能完成後，需新增以下正式驗證：

- Google Drive integration tests
- Cloud Function mock failure tests
- AI 權限防護回歸測試
- UI e2e test suite
- SolidWorks Add-in manual checklist
- 備份與還原演練報告
- 正式帳號系統與資料授權測試
- Released 同名檔案策略驗證
- two-reviewer workflow 驗證

## 13. QA 交付物

每次 QA / QC 執行後，應至少產出：

- 測試日期
- 測試角色
- 驗證版本或程式狀態
- 執行命令
- 通過 / 失敗案例
- P0 / P1 缺陷列表
- 最終判定：`Pass`、`Conditional Pass`、`Fail`

## 14. QA 結論

目前 AI PDM 可依本計畫驗證為「Web/API MVP」。  
但不得依此文件直接宣告「正式 PDM 上線完成」。

正式上線前，至少還需補齊：

1. SolidWorks C# Add-in 真實 CAD 電腦編譯、註冊與實機測試。
2. 離線備份與還原在獨立測試機完成實測。
3. 正式 PDM 管理辦法由管理層核准。
4. `npm.cmd run qc:production-readiness` 回報 0 blocker。
