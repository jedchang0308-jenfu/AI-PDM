# RD-DEV-048-PHASE1D：技術移轉整包審核與發布實作報告

日期：2026-07-13  
狀態：`RD Implemented / Independent QC Passed`  
範圍：DEV-048 Phase 1D local product integration；不含 live provider、正式資料、部署或 release。

## 1. 完成內容

- 新增 `transfer_package_draft_items`，擴充技轉包 review/publish/failure lifecycle、事件、權限、索引、RLS 與 SQLite/PostgreSQL/Supabase migration mirror。
- SQLite upgrade 以單一 transaction rebuild 舊 status/event constraints，保留既有 `Draft/Cancelled` rows、events 與 FK integrity。
- 技轉包可用 stable workspace ID 加入/移除候選草稿；candidate 文字不作 authority lookup。
- readiness 聚合 official status、workspace owner/version、candidate、BOM/relation、rule 與 controlled-file evidence，輸出 first blocker owner/action 及 immutable authority hash。
- `transfer.package_review` 重用既有 approval platform；submit 凍結 aggregate snapshot 並鎖定 candidates，approval 只到 `ApprovedPendingPublish`，不寫正式 master。
- explicit batch publish 由外層 PdmCommand transaction 統一鎖定、promotion、audit、receipt 與 outbox；任一 workspace 失敗整批 rollback，失敗狀態由獨立 command 記錄。
- published handoff 的 API/UI/export 共用 server predicate；只有 `Published` 且所有目前物件仍為 `Active/Released`、workspace 已 published、reservations 已 promoted 的完整 package 可見。
- 新增 `/technical-transfer` 的 `準備中 / 審核中 / 已發布交接` 三頁籤；Manufacturing/Procurement 只能進入已發布交接。
- `/handoff` 導向 published 技轉交接並保留 query/`returnTo`；無 context 的 `/upload` 只保留 guidance，不掛載 generic mutation。

## 2. 主要安全修正

1. Batch publish 先以 `id + company_id` 做 non-disclosing lookup；跨公司回 404，只有同公司才回狀態/版本 409，避免存在性洩漏。
2. Handoff 不只檢查 package status，也重新驗證每個正式物件目前可正式使用；任一物件變成 `Obsolete` 時整包 fail closed。
3. Phase 1D browser QC 保存並還原 `next-env.d.ts` / `tsconfig.json`，避免 Next dev 產生的暫存 route references 污染工作樹。
4. Manufacturing/Procurement 的 published fallback 改為單一 callback 內的有限流程，不使用 React callback 自我遞迴。
5. 舊 transfer workbench API 統一走 number-state explicit permission、same-origin JSON 與 private/no-store response boundary。
6. Draft scope add/remove 改由 PdmCommand receipt 提供同 key replay；browser 使用 package/version/item stable key。
7. `ReleaseFailed` 可安全重建審核快照；直接重送審、修改內容或取消都會在同一 transaction 解鎖舊 `approved_locked` 並留下事件。
8. Workbench 的 create/update/submit/withdraw/publish 全部由 server permission projection fail closed；角色名稱不再自行推導 publish 能力。
9. PostgreSQL 與 Supabase mirror 對 `transfer_package_events` 加入 UPDATE/DELETE append-only trigger，與 SQLite authority 對齊。

## 3. 本機驗證

| 驗證 | 結果 |
|---|---|
| Phase 1D transfer domain/migration/fault suite | 23/23；含 upgrade/fresh、scope replay、snapshot stale、ReleaseFailed resubmit/edit/cancel recovery、兩 workspace rollback/retry、1+N events、published-only 與 cross-company |
| Phase 1D compatibility | 14/14；內含既有 transfer Phase 3A-0 18/18 |
| Phase 1D disposable HTTP | 15/15；含 permission projection、legacy guards、401/403/404、same-origin、scope/submit/publish replay、approve-zero-master 與 published export |
| Phase 1D browser/RWD | 8/8；1440/1024/768/390/320、Manufacturing、old bookmark、console/5xx sweep |
| Phase 1A regression | 48/48 |
| Phase 1B regression | 14/14 |
| Phase 1C regression | 43/43 |
| Supabase migration mirror | 59/59 |
| Postgres shadow static/target guard | 26/26；未配置 live shadow target |
| Access-control async repository | 253/253 |
| TypeScript | 通過 |
| ESLint | 0 errors；3 個既有 attachment warning |
| Isolated production build | 通過；120 routes/pages 產生完成 |

Screenshots：`output/playwright/dev048-phase1d-qc/`。

## 4. 未計入完成

- 未連 live Cloud SQL、Supabase、Firebase 或 GCS；provider/staging gate 仍屬 DEV-046。
- 未執行正式 migration、歷史資料修復、deployment、production smoke、rollback 或 release；需後續 release 型指令。
- 未實作 Pack-and-Go parser、ZIP intake 或 manufacturing baseline；維持 DEV-041 後續邊界。
- 本輪未 stage、commit、merge 或建立 PR。

## 5. RD 判定

`DEV-048-1D-01..10` 已完成本機 RD 實作、自我驗證與獨立 QC。首輪 QC 提出的 3 個 P1、2 個 P2 均修正後重驗通過，未留 P0/P1/P2 finding；因此 DEV-048 local product integration 可標示完成。此判定不授予 live provider、staging、deploy、production 或 release credit。
