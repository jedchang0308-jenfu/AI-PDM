# QC-PDM-NUMBER-STATE-FLOW-PHASE1D：DEV-048 技轉整合獨立驗證報告

日期：2026-07-13  
狀態：`QC Passed / Local Product Integration Complete / Release Gate Required`  
範圍：DEV-048 Phase 1D local transfer authority、aggregate review、batch publication、published handoff、UI 與 compatibility；不含 live provider、正式資料、部署或 release。

## 1. 首輪判定與追溯

首輪獨立 QC 判定為 `QC Failed / Reopen`，共 3 個 P1、2 個 P2：

1. P1：舊 transfer APIs 未全面共用 explicit permission、same-origin 與 no-store boundary。
2. P1：draft scope add/remove 缺 command receipt idempotency，既有靜態測試會誤判通過。
3. P1：`ReleaseFailed` 修改內容會清 package review 欄位，但候選號仍留在 `approved_locked`，重新審核可能死鎖。
4. P2：workbench publish button 未消費明示 publish permission。
5. P2：PostgreSQL `transfer_package_events` 缺與 SQLite 對等的 UPDATE/DELETE append-only trigger。

## 2. 修正結果

- Legacy create/read/update/items/cancel routes 共用 number-state permission guard；mutation 先驗證 JSON/same-origin，response 統一 private/no-store。
- Draft scope add/remove 使用 `pdm.transfer.add_draft_workspace` / `pdm.transfer.remove_draft_workspace` command receipts；HTTP 同 key replay 不重複異動。
- `ReleaseFailed` 直接重送審會先解除舊 approval locks 再重建 snapshot；header/scope 修改與取消亦共用解鎖流程，並寫入 `review_unlocked` / `SnapshotInvalidated` evidence。
- UI create/update/submit/withdraw/publish 僅在 permission projection 明確為 `true` 時啟用；permission API 失敗預設全關閉。
- PostgreSQL migration 017 與 Supabase runtime mirror 均拒絕 transfer event UPDATE/DELETE。

## 3. 獨立重驗

獨立 QC 未修改檔案，逐項核銷上述 finding，最終未發現 P0、P1 或 P2：

| 驗證 | 結果 |
|---|---|
| `npx tsc --noEmit` | Passed |
| `qc:pdm-number-state-flow-transfer` | 23/23 |
| `qc:pdm-number-state-flow-compatibility` | 14/14；含 Phase 3A-0 18/18 |
| `qc:pdm-number-state-flow-phase1d-http` | 15/15 |
| `git diff --check` | Passed；僅 line-ending 提示，無 whitespace error |

主流程補充證據：

| 驗證 | 結果 |
|---|---|
| Phase 1D browser/RWD | 8/8；1440/1024/768/390/320，無 overflow、console 或 HTTP 5xx |
| Phase 1A / 1B / 1C regression | 48/48、14/14、43/43 |
| Supabase runtime migration mirror | 59/59 |
| Postgres shadow static/target guard | 26/26；未設定 live disposable target |
| Access-control async repository | 253/253 |
| ESLint | 0 errors；3 個既有 attachment warnings |
| Isolated production build | Passed；120 routes/pages |

Browser evidence：`output/playwright/dev048-phase1d-qc/`。

## 4. QC 判定

`QC Passed`。DEV-048 Phase 1A-1D 本機產品整合完成；candidate、approval 與 official publication 邊界、batch all-or-none、tenant non-disclosure、published-only handoff、權限與 compatibility 均有自動化證據。

以下仍未執行，不能由本報告推定完成：live Cloud SQL/Supabase/Firebase/GCS、provider migration、正式資料修復、staging、deploy、production smoke、rollback、release，以及 Pack-and-Go parser/baseline。任何正式上線必須另走 DEV-046 / DEV-032 與 release gate。
