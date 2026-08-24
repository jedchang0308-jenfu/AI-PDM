# SPEC-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001 — 圖料主檔復原與 Runtime 隔離 CAPA

Status: `Local RD Implemented / QA-QC PASS / CAPA Effective / Production Release Gated`

Date: 2026-08-24
DEV: `DEV-094` / `DEV-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001`
Parent: `DEV-087`, `DEV-092`
CAPA: `CAPA-PDM-2026-08-24-001`

## 1. 問題與 Spec Impact Preflight

本機主 SQLite 的 `drawing_numbers`、`drawings` 與其他正式資料仍引用三個圖料根號，但 `part_roots=0`、`part_numbers=0`；同時 `part_roots_company_scope_migration=3`、`part_numbers_company_scope_migration=3` 保留完整候選資料，`PRAGMA foreign_key_check=15`。A0002／A0005 因 detail service 將關聯矩陣與基本明細放在同一個 `Promise.all`，關聯根不存在的 404 會吞掉整份明細。A0003／A0006 未綁 root，故仍可開啟。

Spec Impact=`Compatible CAPA amendment`。本案不改圖料根號、料號、圖號、檔案或正式關聯權威；只補強既有遷移零遺失、runtime isolation、read degradation 與 completion evidence。ADR=`No new ADR required`。

## 2. 根因與品質門檻

直接根因是 company-scope rebuild 使用 `foreign_keys=OFF`、固定 staging table、`DROP TABLE`／`ALTER TABLE` 及 `INSERT OR IGNORE`，卻沒有跨 process 互斥、完整 transaction、source/target identity reconciliation 或最終 FK gate。`next build` 會啟動多個 worker，而 `build:isolated` 只隔離 dist/tsconfig，沒有隔離 `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`；每個 process 都可能對主 SQLite 執行 startup schema initialization。既有 browser fixture 又在驗證前 seed A0002 root/parts 並刪除 orphan links，使主資料損壞無法擊穿 aggregate。

根因品質門檻：矯正措施必須同時切斷 `並行 startup migration → 主檔遺失`、`建置 worker → 主資料 mutation`、`fixture 自動修復 → 假 PASS` 與 `關聯子投影失敗 → 整份明細失敗` 四條因果鏈；只回填資料或只改 UI 均不構成 CAPA 完成。

## 3. RD Contract

### 3.1 資料復原工具

新增 `scripts/migrate-dev-094-root-recovery.mjs`，預設 dry-run。只接受 explicit `--db`，apply 必須同時提供 `--apply`、dry-run 產生的 expected database fingerprint 與 explicit confirmation。工具必須：

1. 以 SQLite 一致性備份保存 DB、候選 rows、schema、全域 FK violations 與 SHA-256 manifest；apply 前備份成功是 hard gate。
2. 只在 final root/part 缺失、staging rows 可唯一覆蓋所有 dangling root/part references、ID/company/unique constraints 完整且無 extra/ambiguous target 時允許 apply。
3. 單一 `BEGIN IMMEDIATE` 先插入 exact 3 roots，再插入 exact 3 parts；禁止 `INSERT OR IGNORE`、猜測、改 ID、null root、刪除引用或修改 physical files。
4. after 必須 `roots=3`、`parts=3`、ID/row hash exact、`foreign_key_check=0`；失敗全部 rollback。
5. 成功後才在同一受控 transaction 移除兩張 exact staging tables。備份與 manifest 是可恢復證據。
6. 第二次 dry-run/apply 必須為 no-op；候選缺列、重複、額外 final row、hash drift 或新 FK violation 一律 fail closed。

### 3.2 Startup schema migration

修改 `src/lib/db-provider.ts` 與 `src/lib/db.ts`：

- 每個 SQLite database path 以 exclusive lock file 序列化整個 initializer；lock metadata 記錄 pid/database/start time，timeout/stale 判斷可診斷，finally 只移除自己持有的 exact lock。
- 三張 master rebuild 使用 `foreign_keys=OFF → BEGIN IMMEDIATE → staging create → exact INSERT → source/target count+ID equality → DROP/RENAME → COMMIT → foreign_keys=ON`；任一錯誤 rollback，禁止 `INSERT OR IGNORE`。
- initializer 結束前 `PRAGMA foreign_key_check` 必須為 0，且不得留下 `*_company_scope_migration` staging table。
- 2／5／11 個 fresh process 同時開啟同一 disposable legacy DB，最終 counts/IDs/hash/FK 必須一致；中斷與重入不得產生空主檔或殘留 staging。

### 3.3 Build isolation

修改 `scripts/qc-next-isolated-build.mjs`：每次 build 建立 task-owned `.tmp` data/repository root，child env 強制 `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR` 指向該 root，並記錄 project、purpose、port=`none`、owner child PID、cleanup condition。build 前後主 DB 使用 SQLite consistent snapshot fingerprint（schema、counts、FK、canonical identity），必須完全不變；finally 只刪除該 run 的 exact temp root。

### 3.4 Detail 局部降級

修改 canonical workbench contract/service/component：基本 fields/files/previews/history 與 relation matrix 分開取值。只有 `WORKBENCH_RELATION_SCOPE_INVALID` 類 anomaly 可降級為 empty matrix＋stable issue；drawer 仍顯示基本資料與檔案，但關聯編輯、建立子號與正式 mutation 全部停用，並顯示一項可行動錯誤「圖料關聯資料不完整，請聯絡系統管理員」。不得把 corruption 說成「尚未建立圖料根號」，不得 fallback 到其他 root/relation authority。

### 3.5 QA honesty 與 completion gate

`scripts/qc-dev-087-browser.mjs` 在任何 seed／cleanup 前先對未修改 source snapshot 執行 root/part/FK/staging invariant；來源失敗必須保留首敗 manifest 並停止。focused fixture mutation需有 ledger，不能刪除或修補來源異常後把它計為 source PASS。`qc:dev-087` 加入 DEV-094 focused gate；舊 aggregate 降為 historical evidence。

## 4. Exact implementation boundary

Add：`scripts/migrate-dev-094-root-recovery.mjs`、`scripts/qc-dev-094-capa.mjs`、`scripts/qc-dev-094-browser.mjs`。
Modify：`src/lib/db-provider.ts`、`src/lib/db.ts`、`scripts/qc-next-isolated-build.mjs`、`scripts/qc-next-app-runner.mjs`、`scripts/qc-ts-path-loader.mjs`、`scripts/qc-dev-087-browser.mjs`、`scripts/qc-dev-087-file-read-retirement.mjs`、`scripts/qc-dev-092-browser.mjs`、`scripts/qc-dev-087-aggregate.mjs`、`src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/repositories/relation-formal-authority-async-repository.ts`、`src/lib/pdm-canonical-workbench.ts`、`src/components/canonical-pdm-workbench.tsx`、`next.config.mjs`、`package.json`、本 SPEC／QA／QC／DEV index／documentation map／`AGENTS.md`。
No-touch：正式 PostgreSQL、Cloud SQL、production migration/cutover/deploy/release、canonical identity、physical repository bytes、existing unrelated dirty hunks。

## 5. Acceptance / Exit

1. 主 SQLite consistent backup 可開啟；repair manifest 顯示 `roots 0→3`、`parts 0→3`、`FK 15→0`、candidate/final row hash exact、physical files unchanged、staging `2→0`。
2. A0002 production、A0002 RD、A0005 RD 五個已知 state drawer 可開啟；A0003/A0006 regression 可開啟；visible error、unexpected HTTP、console error=0。
3. orphan negative fixture仍開基本明細，顯示 stable anomaly，root-dependent actions=0；不得顯示正常 empty wording。
4. 2／5／11 process concurrent initialization、re-entry與injected interruption全部 PASS；counts/IDs/hash/FK/staging一致。
5. 三次 isolated build 均 PASS，且每次主 DB fingerprint/count/FK 完全不變；task-owned temp data/dist/tsconfig/runtime清理完成。
6. fresh `qc:dev-094`、affected DEV-087 gates、typecheck、isolated build、completion audit全部 PASS；Blocked/Not Run/P0/P1=0。正式 release 仍 gated。

## 6. Implementation／QA-QC Closure（2026-08-24）

上述contract已完成。本機主SQLite以一致性備份及expected fingerprint執行exact recovery，apply manifest顯示`roots 0→3`、`parts 0→3`、`FK 15→0`、staging `2→0`；第二次檢查為`NO_OP`。initializer lock、atomic migration、build data/repository isolation、detail局部降級與browser pre-seed source guard均已實作。

Fresh evidence：

- DEV-094 CAPA：`output/qa/dev-094/DEV094-2026-08-24T05-53-07-356Z/manifest.json`，PASS。
- Rendered browser：`output/qa/dev-094-browser/DEV094-browser-2026-08-24T05-53-25-049Z/manifest.json`，31/31 PASS，含runtime dist removed gate。
- Affected DEV-087 aggregate：`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json`，16/16 PASS，含91/91 browser、typecheck與isolated build。
- 主DB apply／NO_OP：`output/qa/dev-094-main-recovery/apply/manifest.json`、`output/qa/dev-094-main-recovery/post-apply-noop/manifest.json`。
- QC authority：`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`。

`productionConnected=false`、`productionMigrationExecuted=false`；本closure不授權production migration、cutover、deploy或release。
