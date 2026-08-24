# QC-DEV-095 BOM 模組硬刪除驗證報告

狀態：Local RD/QA/QC and primary SQLite retirement passed / Production execution pending
日期：2026-08-24
Verdict：IN PROGRESS

## 已完成證據

- `qc:dev-095-bom-retirement`：20/20 PASS；fresh baseline、legacy fixture、backup、hard-delete、identity digest與FK invariants皆通過。
- `qc:pdm-change-control`：59/59 PASS。
- `qc:pdm-lifecycle-actions`：165/165 PASS。
- `qc:pdm-lifecycle-obsolete`：79/79 PASS。
- `qc:pdm-lifecycle-controlled-history`：58/58 PASS。
- `qc:db-provider-contract`：34/34 PASS。
- `qc:dev-032-cloudsql-migration-package`：11/11 PASS。
- `qc:production-deployment-pipeline`：20/20 PASS。
- app TypeScript：PASS；changed MJS syntax check：PASS。
- ESLint：PASS（0 errors；12個既有warnings）；production dependency audit：0 vulnerabilities。
- production workflow local-equivalent gates：Phase 2B 12/12、request-origin 7/7、DEV-070 privacy retirement 14/14、production IaC 23/23、deployment pipeline 20/20、Cloud SQL package 11/11，均PASS。DEV-070原本在`main`殘留的管理員隱私確認孤兒型別／畫面已依既有退役契約移除。
- isolated Next 16 webpack production build：PASS；114/114 static pages，build route inventory 無 BOM／Where-used route。Turbopack 因 worktree 外部 dependency junction 的 filesystem-root guard停止，依本版官方 CLI改用`--webpack`；這是bundler環境差異，不是產品編譯失敗。
- build 前後 primary SQLite invariant：schema digest `95877026...7e93`、canonical digest `9ab8f2b9...a43c`、migration-residue digest `faeaafb0...c677`完全不變；canonical counts root=3、part=3、drawing-number=3、drawing=52、drawing-revision=8，FK=0。
- primary SQLite hard-delete：PASS。13個retired table皆為空；移除相容欄位及4筆legacy confirmation後，canonical identity digest維持`8b9278f5...b713`、FK=0。完整備份：`data/backups/ai-pdm-pre-dev-095-bom-retirement-20260824T145200.sqlite`，integrity=`ok`。
- isolated PostgreSQL 18 retirement rehearsal：13/13 PASS。以目前整併後production-shaped baseline模擬既有`001–039` ledger狀態，只執行正式新增的`047`；12個既存BOM表加1個可能存在的migration-residue表皆於執行後不存在，`bom_usage_policy`與舊confirmation/action/audit資料歸零，非BOM approval matrix規則保留，canonical fixture 7類資料逐列digest維持`b279f419...c8557`，第二次執行`047`仍通過且unvalidated FK=0。隔離port `55439`與task temp均已清理。
- fresh sequential replay不是本專案正式migration runner路徑：目前`001`是已整併clean-room baseline，舊`004`不可在其後重播；正式runner依`pdm_schema_migrations`既有ledger跳過`001–039`，本次演練依該實際路徑驗證`047`。新增`047`後，舊staging manifest evidence不再可沿用，必須重新完成staging／Wave 0 gate。

## 待完成

- production candidate、Cloud SQL backup／PITR、047 migration、Level 4／Wave 0、promotion與 post-release smoke。

目前不得將本報告解讀為 production deletion completed。
