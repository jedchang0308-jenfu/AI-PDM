# DEV-087 新架構整併與零遺失遷移本機 QC 結案報告

Current Status: `LOCAL QA-QC RESTORED BY DEV-094 / FRESH AGGREGATE 16 OF 16 PASS / CAPA EFFECTIVE / PRODUCTION REHEARSAL, CUTOVER & RELEASE GATED`

Historical Result: `LOCAL PASS`（2026-08-23；原始結果與證據不改寫）

Date: 2026-08-23; reopening amendment 2026-08-24

## 2026-08-24 DEV-092 結案重開註記

2026-08-24唯讀調查確認：A0006-M01 revision `0.1`有PDF／SLDDRW／SLDPRT共3筆未移除`drawing_revision_files`，對應file assets與physical bytes存在；current migrated work `dcf65c1a-3ede-4fba-a473-f3cf5ef6d6c5`卻有`drawing_revision_work_files=0`。因此work API回空files，current workspace無preview source且recognition的`sourceAssetIds=[]`，最終錯顯示「尚無可辨識的檔案」。既有recognition資料屬`candidate_revision` context，即使有3 sources／27 candidates／29 observations，也不能直接替代current `drawing_revision` exact context。

本報告下方的10/10 aggregate、27/27 zero-loss、21/21 retirement、193/193 file-read與109/109 rendered UI均保留為真實的2026-08-23歷史結果；但當時converter fixture沒有Drawing files，migration／zero-loss／completion audit也未逐work驗證`drawing_revision_files`與`drawing_revision_work_files`的ordered tuple equality。故這批證據不足以支持目前`Final QA-QC PASS`，不是以後見之明改寫原始測試結果。

Reopening disposition before implementation：

- DEV-087=`Local Implementation Preserved / QA-QC Reopened by DEV-092 / P0 CAPA Pending`。
- DEV-092=`RD Contract Ready / RD Not Started`；以上為重開當下的狀態，後續 current evidence 見本報告末段 amendment。
- 恢復local PASS前，必須完成DEV-087 SPEC §0.3／§12第61～66項與主QA §23的`QA-087-179..186`，包含全量exact tuple reconciliation、SQLite／PostgreSQL composite receipts、A0006 fresh rendered UI與可讓completion audit失敗的negative injection。
- 本輪文件修訂未變更產品、SQLite、physical files、Cloud SQL、deployment或release。正式資料修復與production cutover仍須另行高風險授權。

## 結論

以下結論是2026-08-23的歷史結論：DEV-087 的本機新架構實作、舊架構清理與當時定義的最終聚合驗證已完成。三工作臺 current-state read/write、typed detail、抽屜 mechanics 與使用者檔案讀取均已收斂；本機 SQLite 舊 workspace graph 與 quarantine 已清為零，canonical 資料雜湊未改變。它不包含2026-08-24新增的per-work file snapshot完整性門檻。

本報告不代表正式 Cloud SQL 已連線、遷移、刪除、部署或開放流量。正式環境仍須兩次正式備份隔離還原演練、逐筆 100% reconciliation、`unresolved=0`，並取得一次明確 cutover／release 授權。

## 已完成範圍

- 所有 PDM 使用者檔案讀取統一為 `GET /api/pdm/file-assets/{fileAssetId}`，涵蓋 candidate、work、released/history、drawing/part attachment 與 approval evidence。
- Drawing／Part／Relation 詳細資料使用 discriminated typed projection；一般 UI 不接收 raw status、workflow、package、baseline、source 或 predecessor。
- 三工作臺共用一套唯讀抽屜 mechanics；圖號編輯頁保持獨立，review 使用相同 domain editor 但完全唯讀。
- 舊 workspace UI/controller、14 條 retired route、舊 binary GET、舊 detail projector 與 runtime caller 已退役；不保留永久 410 相容 API。
- provider-aware PostgreSQL converter、正式資料零捨棄 gate、source fingerprint、逐筆 row/file/preview hash receipt、FK 與 explicit authorization gate 已實作。
- 本機 cleanup 只允許 exact `data/ai-pdm.sqlite` + SQLite provider；未重置整個資料庫，也未建立 legacy 備份副本。

## 本機資料核對

主資料庫 cleanup 證據：`output/qa/dev-087-local-cleanup/main-apply/manifest.json`

- legacy workspace：`60 → 0`
- quarantine：`56 → 0`
- canonical content hash：完全不變
- minimal review trace：`5 → 7`
- 已刪 physical file：`0`
- 目前只讀複核：canonical states=`11`、review traces=`7`、FK violations=`0`

副本 destructive rehearsal：`output/qa/dev-087-local-cleanup/fixture-20260823091728/cleanup/manifest.json`

## 最終驗證證據

| Gate | 結果 | 證據 |
|---|---:|---|
| 完整聚合 | 10/10 PASS | `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-23T10-09-37-950Z/manifest.json` |
| Contract | 31 PASS | 聚合 manifest |
| Repository | 17 PASS | 聚合 manifest |
| Commands | 39 PASS | 聚合 manifest |
| Migration | 24 PASS | 聚合 manifest |
| Zero-loss | 27/27 PASS | `output/qa/dev-087-zero-loss/DEV087-zero-loss-2026-08-23T10-09-44-425Z/manifest.json` |
| Retirement | 21/21 PASS；caller=0；657 files | `output/qa/dev-087-retirement/DEV087-retirement-2026-08-23T10-09-45-379Z/manifest.json` |
| File read | 193/193 PASS；2 fresh sessions | `output/qa/dev-087-file-read-retirement/DEV087-file-read-2026-08-23T10-09-45-972Z/manifest.json` |
| Rendered UI | 109/109 PASS | `output/qa/dev-087/DEV087-2026-08-23T10-10-07-854Z/manifest.json` |
| TypeScript | PASS | 聚合 manifest |
| Isolated production build | PASS；125 static pages generated | 聚合 manifest |

Aggregate manifest SHA-256：`0ACEFC21E87C4D121D495CC8B9B39350445090F3788CDC888D3E61A3706EC517`。Retirement manifest SHA-256：`2CC749019EE0DAF1FBFDC23B5B9525CCD7EF3D12CC7DDADC5F8360D8DAA84ACC`。

UI 驗證包含三工作臺清單／抽屜、量產與研發 latest 同列群組、歷史版次、圖號／料號直接關聯、圖料關聯矩陣、2D／3D 預覽、圖號獨立 editor、review readonly、鍵盤上下切換、抽屜寬度偏好、scroll reset、桌機／平板／手機，以及 console/network failure=`0`。所有 QA runtime 已停止且連接埠已釋放。

## 正式環境阻擋條件

聚合 manifest 明確記錄：

- `productionConnected=false`
- `productionMigrationExecuted=false`

正式上線前仍必須完成：

1. 對正式備份的兩個隔離 restore 各執行一次完整 PostgreSQL rehearsal。
2. 每筆來源具有唯一 target 或人工確認 mapping receipt；人工 mapping 清單為空。
3. count／PK／FK／lifecycle／review count+time／file reference／original+preview hash reconciliation=`100%`，`unresolved=0`、`orphan=0`。
4. 取得明確 cutover 授權後，才可 freeze writes、RPO=0 backup、套用 schema／converter、canonical-only smoke、retirement re-gate 與開放流量。
5. 任一 gate 失敗須在開放流量前回復 DB、app 與 authority control；不得以 production discard、retained legacy source 或 fallback 通過。

## 明確 backlog／非本期整併

- 公開分享下載
- BOM／套件匯出
- 辨識 worker 內部來源讀取

這三者使用不同安全或輸出契約；它們不構成三工作臺 canonical runtime 的 legacy caller，也不得在未來藉此恢復雙檔案讀取權威。

## 2026-08-24 DEV-092 implementation amendment（current evidence）

本 amendment 不改寫上方 2026-08-23 歷史結果；它記錄 P0 CAPA 的本機修復與已關閉的 browser／provider gate，正式環境仍另受 release gate 約束。

| 控制 | 結果 | 證據 |
|---|---:|---|
| SQLite work-file fixture：0／1／3、negative source／target drift、repair、idempotent re-run | PASS 21 checks | `npm.cmd run qc:dev-092:work-file-snapshot`；`output/qa/dev-092-work-file-snapshot/dev-092-work-files-Ae1bZJ/manifest.json` |
| Runtime read invariant：完整 work 可讀、移除一筆 binding 回 stable anomaly／409 | PASS 2 checks | `npm.cmd run qc:dev-092:runtime-invariant` |
| Recognition exact context：`drawing_revision`＋current revision＋3 assets，candidate context 不重用 | PASS 6 checks | `npm.cmd run qc:dev-092:recognition-context` |
| Zero-loss negative control、PostgreSQL composite receipt contract | PASS 29/29 | `output/qa/dev-087-zero-loss/DEV087-zero-loss-2026-08-24T03-02-01-863Z/manifest.json` |
| 主 SQLite dry-run／apply | PASS；A0006 work-file count=3、FK=0 | `output/qa/dev-092-main-dry-run/manifest.json`、`output/qa/dev-092-main-apply/manifest.json`；identity hash=`d3457b48fe171f9a13357927ecb2ea99ee9d378b977a4ae5b47123c8d5641623` |
| TypeScript／文件路徑／dev-task evidence sync | PASS | `npm.cmd run typecheck:app`、`npm.cmd run qc:doc-paths`、`npm.cmd run qc:dev-task-evidence-sync` |
| A0006 fresh browser recognition request | PASS 17/17 | `output/qa/dev-092-browser/DEV092-browser-2026-08-24T04-20-51-832Z/manifest.json`；fresh-auth Playwright 驗證 exact 3 files、PDF preview、recognition GET／POST、`drawing_revision` context、3 source assets與DB readback |

Current disposition：`DEV-092 RD Implemented / QA-087-179..186 PASS / Browser PASS / Disposable PostgreSQL PASS`；`DEV-087 Local QA-QC Restored / Production Release Gated`。本 amendment 不代表 Cloud SQL production migration、cutover、deploy 或 release 已執行。

## 2026-08-24 DEV-094 SQLite migration integrity CAPA amendment

DEV-092結案後另由主SQLite inventory確認正式root/part主檔為空、company-scope candidate仍為3/3且global FK violations=15；A0002／A0005 drawer因此失敗，舊browser runner又因pre-seed修補而沒有揭露來源損壞。原2026-08-23及DEV-092 evidence均原樣保留，但只有完成DEV-094 fresh gates後才重新支持current local PASS。

| 控制 | 結果 | 證據 |
|---|---:|---|
| 主SQLite一致性備份、exact recovery與第二次NO_OP | PASS；roots/parts 0→3/3、FK 15→0、staging 2→0 | `output/qa/dev-094-main-recovery/apply/manifest.json`、`output/qa/dev-094-main-recovery/post-apply-noop/manifest.json` |
| Fault、candidate fail-close、2／5／11 process、live/stale lock、cleanup | PASS | `output/qa/dev-094/DEV094-2026-08-24T05-53-07-356Z/manifest.json` |
| A0002／A0005及regression／orphan rendered UI | PASS 31/31；runtime dist removed | `output/qa/dev-094-browser/DEV094-browser-2026-08-24T05-53-25-049Z/manifest.json` |
| DEV-087 source guard與affected browser | PASS 91/91；source guard before mutation；runtime dist removed | `output/qa/dev-087/DEV087-2026-08-24T05-55-12-088Z/manifest.json` |
| Fresh parent aggregate | PASS 16/16；含typecheck與isolated build | `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json` |

Current disposition：`DEV-094 Local CAPA Complete / QA-QC PASS / CAPA Effective`；`DEV-087 Local QA-QC Restored / Production Release Gated`。完整根因、SHA-256、CA/PA與首敗紀錄見`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`。production connection/migration/deploy/release仍未執行。
