# DEV-115 QA Gate Convergence QC Closure

狀態：`PASS / Local QA Infrastructure Complete / Parent Tasks Dispositioned`

日期：2026-09-03  
範圍：DEV-115、DEV-079、DEV-080；production release不在本文件內，由DEV-032單獨管控。

## 結論

DEV-115已完成current case registry、隔離fixture／runtime、非fail-fast Node aggregate與primary invariant gate。DEV-079固定42案全數PASS；DEV-080固定12案全數PASS。沒有刪除歷史case、恢復退役產品DOM或以successor整包PASS取代精確案例。

## 執行證據

| Gate | 結果 | Final evidence |
|---|---:|---|
| DEV-079 current aggregate | 42/42 PASS | `output/qa/dev-115-qa-gate-convergence/DEV115-DEV-079-2026-09-03T05-24-45-777Z/aggregate-manifest.json` |
| DEV-080 current aggregate | 12/12 PASS | `output/qa/dev-115-qa-gate-convergence/DEV115-DEV-080-2026-09-03T05-26-24-642Z/aggregate-manifest.json` |
| DEV-079 registry | 40 current-runner + 2 successor-replaced；missing/duplicate=0 | `.ai-doc/qa/dev-079-current-case-registry.json` |
| DEV-080 registry | 11 current-runner + 1 retired；missing/duplicate=0 | `.ai-doc/qa/dev-080-current-case-registry.json` |
| Primary protected invariant | PASS | schema、canonical identity、migration residue、foreign keys before=after |
| Runtime cleanup | PASS | task-owned process／port／temporary data and repository cleanup complete |

DEV-079 child coverage包含current contract、1440×900／1024×768／390×844 layout與recognition browser、SQLite owner invariant、disposable PostgreSQL owner invariant及DEV-087 capability negative。DEV-080 child coverage包含projection、current contract與同三viewport rendered browser；退役BOM／task route與API以404／410及business-table zero-write驗證。

## 首輪失敗與矯正

DEV-079首輪aggregate為39/42，三案共同指向DEV-087 negative child。根因不是產品權限回歸，而是runner在Git worktree內誤找不存在的`worktree/data/ai-pdm.sqlite`，導致六個negative probe為NOT_RUN；修正為透過Git common root只讀取得canonical primary並複製到task-owned fixture。其後另發現QA-087-206把runtime初始化寫入納入API零寫入區間；修正量測邊界為先完成provider初始化，再擷取before fingerprint。未放寬410、permission、cursor、history或zero-write expected。

Focused `qc:dev-087:capability-negative`修正後6/6 PASS，完整DEV-079 aggregate再跑42/42 PASS。此失敗、根因與重跑結果均保留，不以刪case或改判掩蓋。

## Parent task disposition

- `DEV-115`：`✓ Local RD/QA-QC Complete`。
- `DEV-079`：`✓ Local RD/QA-QC Complete / Current Matrix 42 of 42 PASS / Production Release Gated`。
- `DEV-080`：`× Merged into DEV-087 and DEV-112`；12案已封口，不重複計入successor完成率。
- production：只由`DEV-032`承接exact artifact、migration、candidate、authenticated smoke、promotion與rollback。

## QC判定

P0=0、P1=0。DEV-115 local closure為PASS；DEV-079／080不再構成DEV-032之前置阻塞。若未來current產品route、authority或case denominator再變更，必須建立新registry revision並重跑aggregate，不得沿用本次point-in-time manifest。
