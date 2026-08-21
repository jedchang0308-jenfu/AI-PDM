# DEV-087 本機實作與專項 QA/QC 報告

Status: `Local RD Complete / Focused QA-QC PASS / Source Conversion Quarantined / Production Cutover Not Authorized`
Date: 2026-08-22
Scope: local product implementation, disposable SQLite migration/reconciliation, browser flow, typecheck and isolated build

## 結論

DEV-087 的新 canonical workbench state、三工作臺讀寫路徑、Drawing 多研發分支、Part／Relation 單一工作副本、審核／核准／退回／取消、舊 draft-workspace API 退役及極簡 UI 已完成本機實作。`npm run qc:dev-087` 的 8 個 gate 全數通過；本機開發範圍可標示為完成。

這不等於 production migration 或 release 完成。對目前來源 SQLite 執行唯讀 dry-run 時，44 筆 active legacy `new_bundle` workspace 缺少可唯一證明 predecessor／revision／來源 identity 的資料，converter 正確回報 `QUARANTINE`，沒有猜測、刪除或切換 authority。正式切換前必須逐筆取得 disposition 並使 `unresolved=0`。

## 實作結果

- 新增 Drawing／Part／Relation 專用 current-work authority、Drawing branch／revision claim、canonical state、minimal review trace 與 transient review request 等 14 張 canonical table；SQLite ensure path 與 PostgreSQL migration `042_status_data_rebuild.sql` 同步。
- 三工作臺清單固定為四欄 `編號／品名／資料／處理`，篩選器只保留 `搜尋／資料／處理`。Drawing 同時顯示量產最新版與每個 open 研發分支最新版；Part／Relation 不顯示假版次。
- Drawing 沿用獨立 full-page editor 與智慧辨識；Part／Relation 使用各自 domain editor。審核頁重用對應 editor 的唯讀模式。
- Drawing work 的檔案與智慧辨識綁定 exact revision。未核准 work 取消時刪除其 revision／claim／未核准 recognition graph；核准後受控檔案複製至正式 revision，不會因 work cleanup 遺失。
- 舊 `/api/numbering/draft-workspaces/**` 共 15 條 mutation/read route hard-retire 為 HTTP 410；新產品路徑不再把 legacy mixed workspace 當 current-state authority。
- A0005 舊資料中「審核已終結、revision lifecycle 仍為 in_review」的矛盾由 terminal approval evidence deterministic repair，轉為可追溯的 approved RD history；不再把 stale lifecycle 當取消或 active work。

## 驗證證據

執行命令：`npm run qc:dev-087`

| Gate | 結果 | 專項檢查數 |
|---|---:|---:|
| contract | PASS | 25 |
| repository | PASS | 17 |
| commands | PASS | 39 |
| migration | PASS | 13 |
| retirement | PASS | 30 |
| browser | PASS | 46 |
| `typecheck:app` | PASS | 1 gate |
| `build:isolated` | PASS | 1 gate |

前六個專項 runner 共 170 項檢查通過，aggregate 為 8/8 PASS。瀏覽器證據：`output/qa/dev-087/DEV087-2026-08-21T18-55-53-404Z/manifest.json`，涵蓋桌面／平板／手機、量產與研發同列、三工作臺極簡欄位與篩選、Drawing 編輯／智慧辨識／取消、console／network quietness；temporary runtime port `61363` 已確認釋放。

## 來源資料 dry-run

命令：`node scripts/migrate-dev-087-canonical-workbench.mjs --discard-unapproved-part-only-drafts --output-dir=.artifacts/dev087-source-dry-run-final`

- mode：`dry-run`
- source：48 drawings、8 revisions、3 parts、3 roots、55 active workspaces、3 cancelled workspaces
- deterministic target projection：54 aggregates、11 states、4 branches、4 claims、2 drawing works、5 minimal review traces
- 明確 cleanup classifier：9 筆 exact 未核准 part-only drafts；3 筆 exact legacy cancelled workspaces
- quarantine：44 筆 active legacy bundle drafts
- identity hash：`f6bc71b4e7a04e56b9b55556167614f15c1db84ba6ebff5ba5ed3d01955cb7a8`

本次沒有對來源 DB 套用 migration、cleanup、authority switch、DROP 或 physical file deletion。

## QA 邊界與未完成 gate

- 本次是 RD 自驗與本機 focused QA/QC，不冒充獨立 QA／QC provider、PostgreSQL production rehearsal、SCALE-10K、60 分鐘 soak、load/backpressure、RTO 或 production rollback 證據。
- `QA-087-001..165` 是正式 release 的完整驗證契約；本次 runner 只證明已覆蓋的本機核心範圍，不得以 170 項 focused checks 宣稱 165 個 release cases 全數逐案通過。
- production release 的 stop condition 仍為：`unresolved != 0`、缺 production read-only inventory、未取得高風險資料操作授權、未完成 PostgreSQL/release rehearsal、或 authority control 尚非 exact `canonical_only`。
- 依使用者決策，本期首重穩定性與效率；惡意 token、CSRF／DoS、側通道、QA evidence 防偽等重型反作弊／紅隊項目延後。一般登入、same-company、角色、exact reviewer、idempotency 與 stale-tab 正確性仍保留。

## 後續

1. DEV-087 本機產品範圍完成後可建立獨立 commit，與 DEV-088 分離。
2. production migration/release 另行重開 gate：先決定 44 筆 quarantine 的 repair／保留／明確刪除 disposition，使 dry-run `unresolved=0`，再做 PostgreSQL rehearsal 與正式授權。
3. Next.js build 的 middleware deprecation warning 為既有技術債；本次 build 成功，不構成 DEV-087 阻塞，後續可獨立轉為 proxy convention。
