# DEV-087 單人可信本機 RD／QA-QC 完成收據

Current Status: `LOCAL RD/QA-QC COMPLETE / HUMAN CONFIRMED / 94 OF 94 PRODUCT CASES + 3 OF 3 QUALITY GATES PASS / PRODUCTION RELEASE GATED`

Date: 2026-08-28（Asia/Taipei；current evidence run ID 使用 UTC 2026-08-28）

## 結論

DEV-087 已完成本機產品實作與使用者核定的單人可信 QA-QC。唯一有效的 current completion parent 為：

`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-28T06-51-46-406Z/manifest.json`

- Parent SHA-256：`3ff02f5b87c63adc0ed79dd381f59922ebc1cfde83a3c87e8ab82eb2bd6c5687`
- Source fingerprint：`git-content-v4-dev087-execution-scope / d227b76f2f6b7e85f92caa79b277c36db3dafc4ac4db528b349e57c51b654b26`
- Commands：`21/21 PASS`
- Current product denominator：`94/94 PASS`；blocked／not run／fail=`0/0/0`
- Quality Gates：`3/3 PASS`
- Aggregate disposition：`status=PASS / completionCandidate=true`
- Production：`productionConnected=false / productionMigrationExecuted=false`

DEV-097 的 current disposition 是`Skipped / Historical Supporting / Superseded by Trusted-Solo QA Decision`。它保留歷史反作弊資產，但不再阻擋 DEV-087 的本機完成。

## FFF 適用性矯正

另一個 AI 完成並由使用者提交的 FFF 文件修正被視為正式 Human Confirmed 契約；本輪沒有改回舊語意。fresh `QA-087-187..192` 全數 PASS，確認：

- server只以`predecessor_revision_id`判定，UI不得用版號、layer或畫面來源猜測。
- 首版不顯示、不寫入、不送審 FFF；同一區域只顯示中性的`relatedParts`／「關聯料號」。
- 進版才投影`changeImpactRequired=true`，顯示判定範圍與 FFF；Form／Fit／Function三軸均須人工明確判定，不得把缺值預設為相容或`no_impact`。
- `relatedParts`與`affectedParts`分離，不把關聯料號誤當已確認受影響料號。
- 沒有新增 ADR、schema、migration或backfill。

## 八項漏接功能 closure

| 功能群 | Current disposition |
|---|---|
| Drawing進版 FFF／affected Parts／replacement與舊revision流程退役 | PASS；首版／進版契約依上述規則 |
| `/numbering/tasks`獨立UI退役、task／notification後端能力保留 | PASS；direct UI URL 404、不轉址 |
| Drawing／Part正式作廢申請、審核與依賴快照 | PASS；root作廢不在本期 |
| Part material／color／surfaceTreatment／variantNote current work、review與formalize | PASS；legacy direct PUT 410 zero-write |
| Drawing歷史 exact revision artifact與受控檔案 | PASS；錯binding／缺檔fail closed，不回退latest |
| Drawing work file下載、移除、metadata與進度／錯誤 | PASS；exact work/file-set與readback |
| Drawing／Part關聯矩陣identity導覽與dirty guard | PASS；鍵盤／滑鼠與未儲存保護均驗證 |
| Drawing／Part探索filter、search、sort與雙向cursor | PASS；server-side條件先於pagination，無stale覆蓋 |

## Current evidence chain

| Gate | 結果 | 證據 |
|---|---:|---|
| Parent aggregate | 21/21 commands；94/94 cases；3/3 QG | `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-28T06-51-46-406Z/manifest.json` |
| Capability contract | PASS | `output/qa/dev-087-capability/DEV087-product-contract-2026-08-28T06-55-48-535Z/manifest.json` |
| Capability repository | 25/25 PASS | `output/qa/dev-087-capability/DEV087-product-repository-2026-08-28T06-55-59-908Z/manifest.json` |
| Capability browser | PASS；child evidence 442 files | `output/qa/dev-087-capability/DEV087-product-browser-2026-08-28T06-56-16-826Z/manifest.json` |
| UI-only | 34/34 cases；11/11 C gates；42/42 infrastructure；單次fresh attempt | `output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-28T06-56-28-792Z/run-manifest.json` |
| Part attachments | PASS | `output/qa/dev-087/DEV087-PART-ATTACHMENTS-2026-08-28T07-09-35-187Z/manifest.json` |
| Raw browser／FFF／inline matrix | PASS | `output/qa/dev-087/DEV087-2026-08-28T07-10-14-574Z/manifest.json` |
| Capability negative | 6/6 PASS | `output/qa/dev-087-capability/DEV087-product-negative-2026-08-28T07-12-43-061Z/manifest.json` |
| PostgreSQL G4 | 91 assertions PASS | `output/qa/dev-087-capability/DEV087-product-g4-postgres-2026-08-28T07-12-58-416Z/manifest.json` |
| DEV-100 dependency | 18/18 PASS；13/13 commands | `output/qa/dev-100/DEV100-2026-08-28T06-52-17-501Z/manifest.json` |
| DEV-092 browser dependency | 21/21 PASS；A0006-M01 exact 3 assets | `output/qa/dev-092-browser/DEV092-browser-2026-08-28T07-17-09-452Z/manifest.json` |
| Zero-loss／retirement／file-read／typecheck／isolated build | PASS | parent aggregate child command results |

## 三個 Quality Gates

1. `QG-087-PROVIDER`：PASS；primary protected invariant unchanged、12筆成功mutation receipt、disposable PostgreSQL 6/6。
2. `QG-087-SECURITY`：PASS；8/8拒絕案例zero-write。
3. `QG-087-UI`：PASS；8個UI family在1440×900、1024×768、768×1024、390×844共32/32；1440×900與390×844為headed。實際NVDA／JAWS／Narrator依使用者決策為選配，未作完成阻擋，也未宣稱已執行。

UI-only attempt ledger只有一次PASS，沒有藉由重試排除首敗。browser、G4與DEV-092的task-owned runtimes均有owner／port／isolated data declaration與cleanup receipt。

`npm run qc:dev-task-completion-audit`為全專案而非DEV-087專屬稽核；其最終分母以本次全分支文件收斂後的fresh gate為準，不得用歷史全專案結果推翻DEV-087專屬fresh aggregate的21/21、94/94與3/3結果。`qc:doc-paths`與`qc:dev-task-evidence-sync`亦須於提交前重跑。

## 資料與執行環境安全

- 主SQLite protected schema hash、canonical identity、master counts、migration residue、root references與global foreign key check在aggregate前後一致。
- 主SQLite raw byte hash有變化，但manifest明確標為`observed_only_external_runtime_may_write`；另一個既有port 3000 runtime可能寫入非保護列。raw hash不取代protected invariant，也未被隱藏為PASS條件。
- 本任務的browser、PostgreSQL、Next、DEV-092與isolated-build process tree、ports及暫存資料／repository均已釋放或移除；未停止、清除或接管port 3000的其他任務runtime。
- 本輪沒有操作production、套用production migration、seed／clean primary database、stage、commit、merge、建立PR、deploy或release。

## 明確排除與release gate

本期明確不處理`part_root`搜尋結果自己的明細／動作、root狀態／阻擋原因，以及root整體新增／作廢影響。此排除不影響上述94案分母，也不得在本收據中被誤宣稱完成。

本收據只支持`Local RD/QA-QC Complete`。正式Cloud SQL restore rehearsal、production migration／cutover、deployment、production smoke、監測與release仍須使用者另行明確授權。
