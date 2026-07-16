# QC Fact Report: Active Goal Remaining External Blockers

日期：2026-06-01

## 驗證結論

本機可完成的 `DEV-GDRIVE-001` 與 `DEV-UX-005` 已完成並通過 QC。剩餘 active task 目前皆屬外部環境或正式證據阻塞，不能用本機 mock 或 fixture 宣告完成。

## 執行項目

| 項目 | 指令 / 方法 | 實際結果 |
| --- | --- | --- |
| Document Manager evidence report | `npm.cmd run qc:document-manager-report:report` | `ready=false`，report `20260527-145712`，15 cases / 0 pass |
| Field-test required evidence preflight | `npm.cmd run field-test:preflight -- --profile all --require-evidence` | `ready=false`，19 passed / 3 failed / 1 warning |
| Whitespace check | `git diff --check` | pass，僅 CRLF warning |
| DEV-IND-007 local guard / traceability | `npm.cmd run qc:postgres-shadow-target-guard` / `npm.cmd run qc:postgres-shadow` | target guard 10/10 pass；shadow QC 21/21 pass，PG-018 驗證 migrationTrace |
| Supabase connector read-only inspection | Supabase MCP `_list_projects` / `_list_tables` / `_get_cost` | connector 可用；既有 projects 非 disposable；new project cost 查詢為 `0/monthly`；branch cost `0.01344/hourly` |
| Local Postgres fallback inspection | `where.exe psql` / `where.exe postgres` / `docker ps` | 無本機 `psql/postgres`；Docker daemon 未啟動且 Docker config access denied |

## 剩餘阻塞

| Task | 阻塞證據 | 需要外部輸入 |
| --- | --- | --- |
| `DEV-CAD-001` | Document Manager report 缺 tester、component、license owner、extractor command、probe path、sample files；15 cases 皆 `not_run` | SolidWorks Document Manager 授權或等效讀取器、真實 `.sldprt/.sldasm/.slddrw` 測試檔、extractor probe 輸出 |
| `DEV-SW-001` | Field preflight `CAD-EVIDENCE-001` failed：real-machine report `ready=false issues=51`；另有 Admin PowerShell warning | 真實 SolidWorks 電腦、系統管理員權限、COM 註冊與 UI 實機測試證據 |
| `DEV-BACKUP-001` | Field preflight `RESTORE-EVIDENCE-001` failed：restore drill report `ready=false issues=24` | 獨立測試機或隔離還原環境完成 restore drill 與 checksum evidence |
| `DEV-FIELD-001` | Field preflight required-evidence failed，因 CAD / restore / Document Manager evidence 未 ready | 正式現場測試回填、未通過項目 issue closure |
| `DEV-IND-007` | 本地 target guard 與 compare traceability 已通過：`qc:postgres-shadow-target-guard` 10/10、`qc:postgres-shadow` 21/21；但 Supabase connector 續查顯示 `ProJED` 與 `ProJED_TEST` public schema 都含既有 `profiles/projects/wbs_items/...`，非乾淨 AI_PDM shadow target；本機沒有可用 PostgreSQL/Docker daemon | 使用者確認是否在 `JED` organization 建立新的 disposable AI_PDM shadow project，或提供其他乾淨 Postgres/Supabase target |

## 判定

- 不可將 active goal 標示 complete：仍有 P0 外部驗證 task 未完成。
- 本輪未呼叫 `update_goal blocked`：這次 goal turn 仍完成了本機可推進工作，不符合「同一 blocking condition 連續三個 goal turns」的整體 goal blocked 條件。
- 若使用者確認建立 Supabase disposable project：`JED` organization 查詢到 new project cost 為 `0/monthly`，仍需依 Supabase connector 流程確認成本與 region 後才能建立。
