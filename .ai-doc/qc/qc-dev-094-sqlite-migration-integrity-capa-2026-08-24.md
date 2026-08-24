# DEV-094 SQLite 圖料主檔遷移完整性 CAPA QC 結案報告

Current Status: `LOCAL CAPA COMPLETE / FRESH QA-QC PASS / CAPA EFFECTIVE / PRODUCTION RELEASE GATED`

Date: 2026-08-24
DEV: `DEV-094` / `DEV-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001`
CAPA: `CAPA-PDM-2026-08-24-001`
Parents: `DEV-087`, `DEV-092`

## 1. 結論

本機 SQLite 圖料主檔已依一致性備份與 expected fingerprint 完成 exact recovery：`part_roots 0→3`、`part_numbers 0→3`、全域 FK violations `15→0`、兩張 company-scope staging table `2→0`。第二次執行為 `NO_OP`，final row identity/hash 與主資料邏輯 fingerprint 不再變動。

四條因果鏈均已被切斷：startup migration 改為跨 process 互斥與原子 reconciliation；isolated build 強制使用 task-owned data/repository；browser runner 在任何 fixture mutation 前驗證未修改來源；relation scope anomaly 只局部降級，不再吞掉基本明細。最新 DEV-094 focused、rendered browser、DEV-087 fresh aggregate、typecheck 與 isolated build 全部 PASS。

本報告只結案本機 CAPA。`productionConnected=false`、`productionMigrationExecuted=false`；正式 PostgreSQL／Cloud SQL migration、cutover、deploy、release 與 production smoke 未執行，仍受 release gate 管制。

## 2. 多層次根因

| 層次 | 根因／控制失效 | 為何會造成「清單存在但明細開不了」 |
|---|---|---|
| 資料直接層 | company-scope rebuild 在 `foreign_keys=OFF` 下使用固定 staging、drop/rename 與 `INSERT OR IGNORE`，沒有完整 transaction、identity/count reconciliation 與 final FK gate。 | Drawing/current-state rows仍引用原 root，但正式 `part_roots`／`part_numbers` 已成空表，detail relation scope 因此找不到 root。 |
| 併行／runtime 層 | SQLite initializer 沒有跨 process lock；Next build workers 可同時跑 startup schema initialization。 | 多 worker 可交錯操作同一組正式／staging table，使一個 process 看到或留下半完成狀態。 |
| 環境隔離層 | 舊 `build:isolated` 只隔離 dist/tsconfig，未隔離 `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`。 | 名稱為 isolated 的建置仍可能開啟主 DB，讓純建置動作具有資料 mutation 風險。 |
| 服務降級層 | 基本明細與 relation matrix 共用同一個 `Promise.all`。 | relation 404 使 fields/files/previews/history 一併失敗，UI只剩「圖料根號不存在」。 |
| 驗證治理層 | 舊 DEV-087 browser runner 在 source assertion 前 seed A0002 root/parts 並清 orphan links。 | fixture 自動修補損壞後才驗證，會把資料完整性問題遮蔽成 aggregate PASS。 |

問題不是「圖片辨識模型不認得圖片」。原始圖檔、附件與 Drawing state 仍在；失敗點是 Drawing state 到圖料根號／料號主檔的關聯完整性先被破壞，明細投影又未做局部降級。

## 3. CA／PA 與有效性

| 類型 | 措施 | 完成證據／有效性判準 | 結果 |
|---|---|---|---:|
| CA | 一致性備份、dry-run fingerprint、exact 3 roots/3 parts recovery、FK/staging reconciliation | apply manifest before/after、backup hash、第二次 NO_OP | PASS |
| CA | initializer exclusive lock、owner token、live/stale lock判定、atomic master migration | 2／5／11 process、live lock不被偷取、stale lock恢復、中斷 rollback | PASS |
| CA | build data/repository isolation與主DB invariant | 四次 isolated build均成功，主DB fingerprint固定 `062f0af2b96595821beefc13d0d75f65eda6d51e9ac1884c85c0c95ff59a86c2` | PASS |
| CA | relation anomaly局部降級、root-dependent action停用 | orphan negative API/UI仍顯示fields/files/previews與stable issue，mutation action=0 | PASS |
| PA | source invariant必須早於任何seed/cleanup，fixture mutation ledger明示disposable scope | DEV-087 browser manifest `sourceInvariantCheckedBeforeMutation=true` | PASS |
| PA | AGENTS資料／runtime隔離規範、build trace排除資料與QA產物 | fresh aggregate build成功、task-owned temp清除 | PASS |
| PA | focused CAPA固定fault、missing candidate、2／5／11 concurrency、live/stale lock與cleanup測試 | DEV-094 CAPA manifest | PASS |
| PA | DEV-094納入DEV-087 aggregate與completion evidence | fresh aggregate 16/16，不再引用舊seeded aggregate作closure | PASS |

CAPA effectiveness=`PASS`：原始失敗可由未修改資料 inventory 客觀重現；修復後同一主 SQLite healthy、affected drawer可開、negative orphan仍能被識別，且並行、重入、故障注入、建置與來源誠實性控制全部能獨立證偽。

## 4. 主 SQLite 修復證據

| 項目 | 修復前 | 修復後 |
|---|---:|---:|
| `part_roots` | 0 | 3 |
| `part_numbers` | 0 | 3 |
| company-scope candidate rows | roots=3、parts=3 | 0、0 |
| `PRAGMA foreign_key_check` | 15 | 0 |
| 邏輯 fingerprint | `9dd8dc5b3cb4335676494a1d923352f8082ac761c3778156d46c64abfb56869b` | `05faba0df6760566440aca6945aa565137d880a18148bb72b7fc442195964b81` |

- Apply manifest：`output/qa/dev-094-main-recovery/apply/manifest.json`；SHA-256 `8D42B5D628C2548BCAEEDCA3D3DF39E75C76A16C8F684308319206ACA885D4F5`。
- Consistent backup：`output/qa/dev-094-main-recovery/apply/backup/ai-pdm.sqlite`；6,860,800 bytes；SHA-256 `AB43803C30A6A89E9D7810699511409FA6EEDEF8D1DFFFE9EC50B88086276698`。
- Post-apply NO_OP：`output/qa/dev-094-main-recovery/post-apply-noop/manifest.json`；SHA-256 `6D96EBC51C7712B6C150C785CC8F379D6A1BD3FA9B81B172C8D7EA7F65E8C72A`。
- Recovery只重建缺失的root/part主檔並移除exact staging；沒有改 canonical identity、Drawing identity 或 physical repository bytes。

## 5. Fresh QA／QC evidence

| Gate | 結果 | Evidence |
|---|---:|---|
| DEV-094 recovery／fault／lock／2-5-11 process CAPA | PASS | `output/qa/dev-094/DEV094-2026-08-24T05-53-07-356Z/manifest.json`；SHA-256 `B906C84948C0DFB0D6108B6E61619EACDDE046ACC41E0A8C26C383671FF47B7A` |
| DEV-094 rendered browser | PASS 31/31 | `output/qa/dev-094-browser/DEV094-browser-2026-08-24T05-53-25-049Z/manifest.json`；SHA-256 `94223A54909E757DAAAF61D4F5C218627DBBA27B267A4E1C0C3476E43542A0C3` |
| DEV-087 affected browser | PASS 91/91 | `output/qa/dev-087/DEV087-2026-08-24T05-55-12-088Z/manifest.json`；SHA-256 `A656C40DCC5C3930A09D3FEB416EC466A41F603EA17B5E57D234B54E4BBD8D07` |
| Fresh DEV-087 aggregate | PASS 16/16 | `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json`；SHA-256 `AC3C5BCE6D6F0C4397E4333F79216B4E956E9745A7C9D925415B6EA2D9111CC2` |
| TypeScript | PASS | aggregate child `typecheck:app` |
| Isolated production build | PASS | aggregate child `build:isolated`；126/126 static pages；主DB invariant unchanged |

Browser evidence包含 A0002 production/RD、A0005 RD、A0003、A0006與orphan negative fixture；預期外的console error、network error、visible fatal error均為0。DEV-087 source invariant先於任何 mutation，ledger只有disposable migration與authority-control操作。所有 task-owned browser ports與temp roots已清除；既有非本任務 port 3000 runtime未停止。

## 6. 首敗與修正紀錄

下列首敗均保留為CAPA發現證據，不改寫成PASS：

1. 初期 build 遇到 concurrent source route drift；停止把不同來源快照混為單一驗證結果，重跑使用穩定來源。
2. isolated build 曾在完成compile/typecheck/static pages後因 Next standalone tracing納入既有`output/qa`、`tmp`、`.tmp`而 `ENOSPC`；新增 `outputFileTracingExcludes`，排除資料、證據與temp目錄後四次建置成功。未刪除QA證據。
3. direct Node QC 載入產品server-only module失敗；QC path loader只把`server-only`視為empty marker，產品的server-only邊界不變。
4. handoff前runtime audit發現browser runner雖刪除系統temp DB，卻留下workspace `.tmp` Next dist cache；新增safe exact-path cleanup helper並把dist removed設為manifest gate。重新執行後DEV-094、DEV-092、file-read與DEV-087 browser的runtime dist及ports全部removed；只清除本輪8個disposable cache，QA manifests／screenshots／backup均保留。

這些修正沒有降低產品 assertion、沒有忽略 failed response，也沒有以刪除正式或QA資料換取綠燈。

## 7. Release disposition

本機 CAPA 可標記完成，DEV-087／DEV-092的本機QA-QC狀態可恢復；但不得由此推論 production ready。正式環境仍須依DEV-087／DEV-032 release gate完成正式備份隔離還原演練、provider parity、zero-loss reconciliation、明確cutover授權、部署與production smoke。任一正式gate未完成時狀態維持 `Production Release Gated`。
