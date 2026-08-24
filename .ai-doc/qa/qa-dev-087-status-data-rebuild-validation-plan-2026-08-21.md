# DEV-087 三工作臺狀態資料重建驗證計畫

Status: `Local QA-QC Restored by DEV-094 / Fresh Aggregate 16 of 16 PASS / CAPA Effective / Production Zero-Loss Rehearsal, Cutover & Release Gated`
Date: 2026-08-21; amended 2026-08-24
Owner: QA
Related DEV: `DEV-087`; CAPA children `DEV-092`, `DEV-094`
Authority:

- `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`
- `.ai-doc/decisions/ADR-PDM-STATUS-DATA-REBUILD-001-single-current-state-authority.md`
- UI-only execution child contract：`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`
- Relation current contract／QA authority：`.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`、`.ai-doc/qa/qa-dev-090-inline-relation-matrix-validation-plan-2026-08-23.md`

### DEV-090 supersession boundary

DEV-090 已完成本機 Relation retirement 與 inline matrix focused QA/QC；自此本計畫中所有 `Part/Relation single work`、Relation work／review／formalization、Relation list/detail、Relation query budget 與 Relation editor case 均為 `Historical / Superseded by DEV-090`，不得拿來阻擋或宣告現行 Relation 完成。現行 Relation 驗證只由 `.ai-doc/qa/qa-dev-090-inline-relation-matrix-validation-plan-2026-08-23.md` 定義：Drawing／Part drawer 讀寫同一 `drawing_part_links` 矩陣，單次儲存直接生效、不送審。DEV-087 本計畫仍負責 Drawing／Part lifecycle、正式資料零遺失、canonical file-read 與 legacy retirement；正式 Cloud SQL provider parity、兩次 restore rehearsal、zero-loss reconciliation 與 cutover 仍 gated。

### 2026-08-24 DEV-092 CAPA 重開註記

本機A0006-M01的3筆revision files、assets與physical bytes存在，但migrated current work的`drawing_revision_work_files=0`，使work API與workspace把corruption誤判成合法無檔；既有recognition session則屬`candidate_revision` context，不能直接替代current `drawing_revision` exact source set。2026-08-23的aggregate與QC結果保留為歷史基線，但當時fixture、migration、zero-loss與completion audit沒有驗證per-work file-set equality，因此目前結論改為`QA-QC Reopened`。

DEV-092不重設整份QA分母，而是新增`QA-087-179..186`作P0 CAPA completion gate。2026-08-24 focused closure 已完成179／180／181／182／183／184／185／186，全部 PASS、Blocked=0、Not Run=0。production資料修復、Cloud SQL rehearsal、cutover、deploy與release仍不在本輪授權。

## 1. 目的與完成門檻

驗證 DEV-087 不是只換 UI 文案，而是真的把 Drawing／Part current state 收斂成單一 read/write authority，並安全支援 Drawing 多 RD branch、Part single work、canonical file-read 與 destructive legacy retirement；Relation current mutation 改由 DEV-090 inline matrix contract 驗證。

完成門檻：

- P0/P1 defect=0。
- inventory unknown=0、migration unresolved=0、舊 current-state active read/write=0。
- `transition_mode=canonical_only`、`npm run qc:dev-087:retirement` PASS、retirement manifest complete；任一缺漏即`Retirement Pending`。
- SQLite 與 PostgreSQL 結果一致。
- 所有 concurrency/failure/rollback gate PASS。
- 四 viewport browser、a11y、banned text、exact artifact no-fallback PASS。
- production cutover 仍需獨立 deployment/release gate；local PASS 不構成正式資料操作授權。
- 每個case都有可重現的precondition／steps／expected／actual／provider／artifact／commit，不接受只有綠燈總數的證據。
- 本機 canonical product scope 以已重訂的48條三工作臺journey、11個UI／API／DB一致性hard gates及 QA-087-166～170 為完成門檻；business mutation只允許由AI操作真實UI觸發，API／DB只可唯讀取證。任一層不一致、缺證據、Blocked或 Not Run 都阻止本機完成結論。
- `QA-087-001..165`中屬 PostgreSQL rehearsal、SCALE-10K、soak、RTO、production cutover／restore 的 release-only case，仍須在正式遷移與 release gate 逐案產生證據；本機完成不得被誤解為這些 production case 已執行。所有重跑均不得覆蓋首次失敗。
- P0 stability invariant保留最小negative-control，確認測試會在錯誤結果出現時失敗；本期不建立重型mutation或反作弊體系。
- UI流程除功能斷言外，visible error、console error、failed response與資料合理性皆為hard gate；HTTP 200、頁面可開或有截圖不等於PASS。
- active review結束後，必須跨request、receipt、outbox、audit/log、error payload與backup驗證最小留存，不能只查`pdm_review_traces`一張表。
- `SCALE-10K`的API／browser latency、concurrent read/write、60分鐘soak、connection/worker backpressure與migration resource budget全數PASS；不得只用statement count宣稱效率合格。
- DEV-092的最終結案要求`QA-087-179..186`全部PASS：全量migrated work exact file-set equality、composite receipt、negative control與A0006 rendered UI均已具備；本機 focused closure 不代表 production migration、cutover或release已執行。

### 1.1 QA判定原則

1. **關鍵結果獨立計算**：revision、pagination、migration reconciliation與state transition不可直接拿SUT輸出當expected；只對這些P0穩定性規則使用小型reference model／fixture oracle，避免建立過重測試框架。
2. **最小可證偽**：每個P0 stability gate至少一個可控錯誤輸入／故障點，確認錯誤會被抓到；目的在避免驗證盲點，不處理刻意作弊或偽造證據的攻防。
3. **保留首敗**：case第一次FAIL的stdout/stderr、DB diff、network/console與screen evidence不可被retry覆寫；重跑另開attempt並說明原因。非決定性結果在根因關閉前仍為FAIL。
4. **獨立重現**：QA與後續QC使用不同run id、不同disposable database及fresh process；QC不得直接採信RD產生的aggregate verdict，只可重用fixture contract。
5. **零容忍聚合**：P0/P1=0只是必要條件；任一required case缺證據、manifest/hash不符、provider缺一、cleanup未完成或case不是PASS，aggregate都必須FAIL。

### 1.2 本期優先順序與刻意延後

本期優先級固定為：`資料正確與正式資料不污染 > 交易與故障恢復 > 併發穩定 > 查詢／畫面效率 > 一般權限與公司隔離 > 對抗惡意行為`。

仍需驗證的安全邊界是一般使用流程會碰到的登入、same-company、角色/action permission、exact reviewer及private no-store；它們屬資料正確性。下列紅隊／防作弊項目本期刻意延後，不得擴張DEV-087範圍：惡意token偽造、暴力猜測、timing side channel、CSRF penetration、oversized-payload DoS、刻意竄改QA manifest或偽造evidence。若系統改為外部公開、出現資安事件或使用者另行要求，再走獨立security re-entry；延後項目不列入active case count。

### 1.3 2026-08-22 本機執行快照

- `npm run qc:dev-087`：8/8 gate PASS；contract 25、repository 17、commands 39、migration 13、retirement 30、browser 46，另含`typecheck:app`與`build:isolated`，共170項focused assertions/checks。
- browser manifest：`output/qa/dev-087/DEV087-2026-08-21T18-55-53-404Z/manifest.json`；46/46 PASS，port 61363 cleanup PASS。
- 目前來源DB唯讀dry-run：`QUARANTINE`、`unresolved=44`；另辨識9筆exact未核准part-only draft與3筆exact legacy cancelled workspace可在未來取得正式授權後清理。本次未apply、未切authority、未DROP或刪physical file。
- 2026-08-22 preservation decision `A` 已被 2026-08-23 最終政策取代；該證據只保留為演進歷史，不再是現行驗收基準。
- 本快照只代表本機RD自驗與focused QA/QC，不代表`QA-087-001..165`逐案全部執行，也不取代獨立QA、PostgreSQL、SCALE-10K、60分鐘soak、RTO、production rehearsal與release gate。
- 詳細實作與差距：`.ai-doc/qc/qc-dev-087-local-implementation-2026-08-22.md`。

### 1.4 2026-08-23 canonical closure 快照

- UI-only canonical lifecycle：`D01–D24 / P01–P10 / R01–R14 = 48/48 PASS`、`Blocked=0`、`NotRun=0`、`C01–C11=11/11`；證據 `output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T16-03-21-109Z/`。
- QA-087-166～168：三工作臺實際拖曳抽屜、偏好隔離／reload、清單與抽屜鍵盤切換、URL／API／UI rowKey、drawer scroll reset 與 rapid switching 一致；最終 rendered UI 證據為 `109/109 PASS`（`output/qa/dev-087/DEV087-2026-08-23T10-10-07-854Z/manifest.json`），consoleErrors／failed responses=`0/0`，桌機／平板／手機均通過。首敗 manifests 原樣保留。
- QA-087-169～170：candidate／work／released／history／drawing attachment／part attachment／approval evidence 統一由 `/api/pdm/file-assets/{fileAssetId}` 讀取；舊 binary GET route 已刪除，source/runtime caller=`0`、orphan relation=`0`、兩輪 fresh-session、A0006 3D/2D rendered UI、原檔／衍生檔 hash 與權限負向矩陣共 `193/193 PASS`。最終證據 `output/qa/dev-087-file-read-retirement/DEV087-file-read-2026-08-23T10-09-45-972Z/manifest.json` 與同目錄 `reconciliation.json`。
- 最終 `npm run qc:dev-087` 為 `10/10 PASS`，包含 contract 31、repository 17、commands 39、migration 24、zero-loss 27、retirement 21、file-read 193、browser 109、typecheck 與 125-page isolated build；證據 `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-23T10-09-37-950Z/manifest.json`。獨立 retirement manifest 為 `output/qa/dev-087-retirement/DEV087-retirement-2026-08-23T10-09-45-379Z/manifest.json`。
- 本節關閉 local canonical scope、local destructive cleanup 與 candidate compatibility read retirement；PostgreSQL／production migration、production destructive cleanup、deploy、release 仍需另行授權與 release evidence。

### 1.5 2026-08-23 零遺失／本機清理新增 gate

- 本機 destructive rehearsal 與主 DB apply 必須使用 `scripts/cleanup-dev-087-local-legacy.mjs`；只接受 SQLite、主路徑 `data/ai-pdm.sqlite`（fixture另需明示且限QA目錄）。本次結果：60個舊 workspace、56筆 quarantine 清為0；canonical hash不變；兩筆舊核准紀錄先轉成只含cycle/entity/time的trace，因此 trace總數由5增至7。
- PostgreSQL 只使用 `scripts/migrate-dev-087-postgres.mjs`；converter拒絕 discard／retain flag，apply必須有exact source fingerprint mapping、所有 workspace/relation/candidate-file receipts、target rows與provider/commit/schema guard。`unresolved>0`必須BLOCKED。
- production 必須在兩個獨立restore rehearsal中逐表驗證count、PK、FK、生命週期、審核次數／時間、檔案引用、原檔／preview hash。兩輪都PASS後仍需另行取得cutover授權；本機結果不能代替。

## 2. 測試環境與資料安全

1. 優先使用 disposable SQLite 與 isolated PostgreSQL；不得連 production。
2. 本機依2026-08-23政策先在副本演練，再清除主SQLite舊graph；不保留legacy備份。production destructive cleanup只可在兩次restore rehearsal、零unresolved與另行cutover授權後執行。
3. 每次 run 保存 manifest：commit/tree hash、schema hash、fixture hash、provider、connection fingerprint redaction、before/after counts、reconciliation hash、test result、cleanup result。
4. temporary runtime 必須登記 project/purpose/port/process tree/cleanup，完成後只停止 task-owned process並確認 port 釋放。
5. QA fixture與oracle必須唯讀且run-scoped；case不得依執行順序共享已變動資料。randomized/property case固定保存seed並可單獨重播。
6. PostgreSQL concurrency/failure case必須使用真實獨立connection/transaction；用單connection、Promise交錯或SQLite結果不得替代PostgreSQL鎖定證據。
7. 任何production或production clone的read-only檢查都必須在manifest標示資料分類與脫敏；不得把review snapshot、附件內容、token、姓名或連線秘密寫入QA artifact。

## 3. Required Fixtures

- `D-A0002`：production 1 + one open branch RD 1.1。
- `D-THREE`：production 1 + branch A RD 1.1 + branch B target major 2。
- `D-CAP3`：同一圖號恰有3個open branches，混合active、review與idle。
- `D-CAP-RACE`：同一圖號0個open branches，由4個concurrent creators競爭3個名額。
- `D-STALE`：production 1上有branch A/B；A推進production 2後，B的base仍為production 1。
- `D-NOPROD`：只有 unapproved 0.1，沒有 approved production。
- `D-IDLE`：approved idle RD branch，無 active work。
- `D-COLLIDE`：兩 branch 競爭同 target revision。
- `D-FIRST-CANCEL`：新branch只有第一份未核准work，沒有approved revision。
- `D-NEXT-CANCEL`：branch已有approved RD 1.1，下一份RD 1.2 work尚未核准。
- `D-VOID-IDLE`：open idle branch，latest approved RD可申請作廢。
- `D-VOID-RETURN`：作廢request被reviewer退回。
- `D-VOID-RACE`：同一branch兩個concurrent作廢申請。
- `P-FORMAL`：正式資料 + 修改中。
- `P-FIRST`：只有首次修改中，沒有正式資料。
- `P-ATTACH`：review 中仍可依DEV-087直接契約及現行附件authority獨立變更attachment；不需要後續DEV-088 schema/flag/lease。
- `R-FORMAL`：正式關聯 + 調整中。
- `R-FIRST`：只有首次調整中。
- `R-DRIFT`：review snapshot 後 relation reference drift。
- `LEGACY-CANCEL`：包含舊 canceled work/file bindings/review rows/shared file refs。
- `LEGACY-AMBIGUOUS`：predecessor/source 不能唯一證明。
- `LEGACY-MULTI-WORKSPACE`：同一legacy workspace同時含Part／Root／Drawing，包含可唯一拆分與不可安全拆分兩種。
- `FAIL-FORMALIZE`：可重試 known admin failure 與不可安全修復 failure 各一。
- `ROLE-CHANGE`：同公司owner、authorized non-owner、exact reviewer、被撤權actor、停用member與cross-company actor，可在讀取後、commit前切換正常授權狀態。
- `RACE-MATRIX`：edit／submit／cancel／return／approve／formalize／void／branch create／production promotion的同步barrier fixtures。
- `RETENTION-SURFACE`：在pending、applying、apply_failed、return-complete與formalize-complete五個時間點，盤點request、trace、receipt、outbox、audit、log、error與backup。
- `MIGRATION-FUZZ`：固定seed產生Unicode、NULL、重複target、多active、lineage不明、over-cap與company mismatch legacy rows。
- `SCALE-10K`：至少10,000個Drawing groups、0/1/3 branch混合，另含Part／Relation正式與work資料，用於query plan與pagination，不作production容量承諾。
- `UI-EXTREME`：A0002／A0005、三branch、長繁體中文品名、空白、受阻、system_admin、stale tab與200% zoom資料。

## 4. Schema 與 Constraint Matrix

本節中凡提到 Relation current row、Relation work、Relation review、Relation snapshot 或 Relation list/detail 的 case 均為 `Historical / Superseded by DEV-090`；現行矩陣直接編輯與 pair／primary／orphan guard 以 QA-DEV-090 為唯一 oracle。

| ID | 驗證 |
|---|---|
| QA-087-001 | canonical state enum、nullable/check constraint符合SPEC，非法domain/layer/branch/revision組合被DB拒絕 |
| QA-087-002 | 每drawing只有一列production；同branch只有一列RD current |
| QA-087-003 | 同drawing最多3個open RD branches；第四個新branch由DB/server共同原子拒絕且無orphan claim/work/state |
| QA-087-004 | Part只有一列formal與一列work；Relation work row已由DEV-090退役，現行只驗證正式矩陣唯一約束 |
| QA-087-005 | `company+drawing+target_major+target_minor`跨branch全域唯一claim；production minor固定0、RD minor>=1且NOT NULL，NULL/前導零/浮點/非canonical label不能穿透唯一鍵 |
| QA-087-006 | branch_id不可變；revision exact predecessor FK/reference可驗證，不依revision字串 |
| QA-087-007 | minimal review trace沒有reviewer/outcome/comment/revision/content欄位；immutable guard有效 |
| QA-087-008 | Part approved snapshot完整保存before/after；既有Relation snapshot僅作歷史唯讀資料，DEV-090不新增 |

## 5. Command、State Machine 與 Concurrency

| ID | 驗證 |
|---|---|
| QA-087-009 | production與RD來源確認target時，在導航前原子建立branch/work/claim/state |
| QA-087-010 | 同branch兩個create併發只有一個成功，另一個回既有work或明確conflict |
| QA-087-011 | 兩branch競爭同revision只一個取得claim，loser收到占用並刷新candidate |
| QA-087-012 | 不同branch可並行各一work，互不鎖死或覆寫 |
| QA-087-013 | owner或authorized non-owner editor submit後handling=review_owner，所有editor的edit/cancel皆被server拒絕 |
| QA-087-014 | reviewer return新增一筆trace、同work回handling=owner；owner或authorized non-owner editor可依permission續作，resubmit建立新cycle |
| QA-087-015 | reviewer approve新增一筆trace、凍結snapshot、handling=system；open/submit不增加計次 |
| QA-087-016 | return/approve double-click與retry idempotent，不重複decision trace或正式化 |
| QA-087-017 | approved snapshot後來源資料變動，formalization仍使用exact snapshot |
| QA-087-018 | system success原子更新正式；Drawing minor只回idle不改production，production target才推進正式並歷史化來源branch |
| QA-087-019 | known repair failure→system_admin，只能idempotent retry exact snapshot |
| QA-087-020 | unsafe failure→blocked，舊正式保持且無command可誤寫 |
| QA-087-021 | Historical only：Relation drift／review 行為由 DEV-090 direct matrix ETag／If-Match 與零partial-write case 取代 |

## 6. Drawing Branch、Revision 與 History

| ID | 驗證 |
|---|---|
| QA-087-022 | A0002同時顯示production 1與RD 1.1，production不被遮蔽 |
| QA-087-023 | D-THREE同時顯示production 1、RD 1.1、RD 2三列，且group不拆頁 |
| QA-087-024 | production第一、actionable RD其次、idle RD最後；區內revision排序穩定 |
| QA-087-025 | 每branch只顯示latest；branch內舊版只在Drawing history |
| QA-087-026 | idle approved RD仍顯示且handling留空，可進下一target |
| QA-087-027 | target major 2核准前label=`研發版 2`，成功後才=`量產版 2` |
| QA-087-028 | branch A升production後branch B仍current；B可續RD minor但production promotion被stale-base guard拒絕 |
| QA-087-029 | 未核准取消釋放revision claim，後續可重用；已核准revision永遠不可重用 |
| QA-087-030 | idle RD的`申請作廢`存在於drawer而不在list；return保持open，approve正式化後branch historical、row移除、count減一且不可reopen |
| QA-087-031 | Drawing approved history exact preview/file只讀，缺檔/錯token不得fallback其他版 |
| QA-087-032 | D-NOPROD只顯示`研發版 0.1`，不補production placeholder |

## 7. Part／Relation 與 Attachment

Part cases仍屬DEV-087 current scope；Relation cases `QA-087-037～040、066` 為歷史基線，現行矩陣編輯／一致性／concurrency／idempotency由QA-DEV-090驗證。

| ID | 驗證 |
|---|---|
| QA-087-033 | Part正式值在核准前持續供生產；修改中不污染正式 |
| QA-087-034 | P-FIRST只有修改中一列，沒有版本、歷史或假正式列 |
| QA-087-035 | Part cancel/return/failure不改正式；approve原子更新且保存before/after |
| QA-087-036 | Part attachment依DEV-087直接契約及現行附件authority即時變更，work cancel不rollback；reviewer看到live list與範圍提示，但附件不納入snapshot/active-review lock；Drawing file與Relation tree仍受鎖定；測試不得要求DEV-088 future tables、feature flag或whole-part lease |
| QA-087-037 | Historical only：Relation正式樹／調整中由DEV-090 inline matrix直接儲存契約取代 |
| QA-087-038 | Historical only：Relation不再產生current row，root identity只由編號搜尋辨識 |
| QA-087-039 | Historical only：Relation不送審、不產生approved snapshot；現行以矩陣save的formal hash／ETag驗證 |
| QA-087-040 | Part第二create併發導向既有work；Relation併發由DEV-090 root lock／If-Match／idempotency驗證 |
| QA-087-066 | Part首次work取消依DEV-087 authority；Relation work取消已退役，清理與正式link hash由DEV-090 migration gate驗證 |

## 8. Filter、Pagination 與 Query Budget

| ID | 驗證 |
|---|---|
| QA-087-041 | Drawing版本filter exact row match；RD filter不帶production companion |
| QA-087-042 | Part資料與Relation關聯filter使用domain可見語意且exact row match |
| QA-087-043 | handling filter六選項（含全部）與row label一對一，normal blank不被誤列 |
| QA-087-044 | search/filter/sort在group pagination前；無client假空頁、漏列、重複 |
| QA-087-045 | group cursor hash含所有filter/sort；reload/back/forward/concurrent response穩定 |
| QA-087-046 | 依SPEC §9.4 instrument domain repository：Drawing list/detail=`<=12/14`、Part=`<=10/12`、Relation=`<=12/14`、approval adapter固定增量`<=2`；0/1/3 RD branch statement delta=0、DOM最多1 production+3 RD且無N+1 |
| QA-087-047 | 舊query vocabulary顯示`此篩選網址已失效`，不silent translate、不fallback舊projector |

## 9. UI、Review Parity、A11y 與 Banned Text

| ID | 驗證 |
|---|---|
| QA-087-048 | list每列只有編號、單行品名、資料層/revision、handling；normal handling留空 |
| QA-087-049 | 不同viewer看到相同固定角色文字，沒有你／我／他與姓名 |
| QA-087-050 | drawer固定章節；受阻只一項原因；system_admin只顯示請系統管理員處理，兩者無假CTA |
| QA-087-051 | Drawing/Part/Relation reviewer經canonical request route看到與owner相同editor components/data/layout且全唯讀；DEV-087 descriptor只有核准/退回修改，其他approval domain不受影響 |
| QA-087-052 | Drawing editor/2D/3D/file/recognition/layout沒有因DEV-087重構或換成共用表單 |
| QA-087-053 | branch/source/predecessor/package/baseline/workflow/approval/raw status/人名/日期不出現在UI、DOM、a11y、tooltip/popover/filter |
| QA-087-054 | 1440×900、1024×768、768×1024、390×844無裁切、重疊、水平overflow；keyboard/touch/focus/scroll owner正確 |

## 10. Cancellation、Migration 與 Retirement

| ID | 驗證 |
|---|---|
| QA-087-055 | 新未核准cancel刪work data/bindings/predecessor/unapproved identity/claim；既有minimal trace保留 |
| QA-087-056 | shared physical object僅零引用時永久刪除；正式檔與Part live attachment不受影響，UI/API不宣稱可restore |
| QA-087-057 | 本機 legacy cancelled／active workspace graph清除後為0；old review只保留cycle/entity/time minimal trace，canonical count／PK／FK／內容hash完全不變。正式環境同類來源逐筆有唯一target/mapping receipt，禁止捨棄或長期quarantine。 |
| QA-087-058 | uniquely provable predecessor正確backfill；ambiguous不猜測，標source_unknown/quarantine |
| QA-087-059 | cutover前所有quarantine已repair/confirmed source_unknown/explicit delete，unresolved=0 |
| QA-087-060 | source/target count、identity/hash、branch/claim/snapshot/review與protected evidence reconciliation可重現 |
| QA-087-061 | full DB/schema/binding backup restore drill成功；備份完整性與application rollback version匹配，manifest明示不涵蓋已刪physical bytes |
| QA-087-062 | single read/write switch後command/browser/exact artifact smoke通過，舊authority read/write=0 |
| QA-087-063 | same-window allowlisted old current-state DROP rehearsal通過；domain evidence與approved data未被刪除 |
| QA-087-064 | 對外流量開放前任一gate失敗能以RPO=0由DB backup+app/control rollback relational state；若偵測未核准寫入則禁止自動restore並停在maintenance，不把physical-byte recovery列為PASS證據 |
| QA-087-065 | 90-day low-cost DB backup retention metadata正確；到期刪除需要approval，不可無條件執行 |

## 11. Transition Exit／Anti-Forgetting Gate

| ID | 驗證 |
|---|---|
| QA-087-067 | runtime只接受`legacy_only／shadow_compare／cutover_window／canonical_only`；shadow只能offline，isolated canonical_only可測完整command但不代表release，production dual authority／dual write被gate拒絕 |
| QA-087-068 | 固定路徑inventory schema/canonical inventory涵蓋每個舊table／column／enum／projector／resolver／filter／URL／API／UI consumer，且owner、disposition、retirement phase、verification完整，unknown=0、unowned=0 |
| QA-087-069 | 對fixture暫時注入一個舊projector import、legacy fallback或old schema read時，`npm run qc:dev-087:retirement`必須FAIL；移除後才PASS，證明gate不是只產生靜態報告 |
| QA-087-070 | active source與runtime registration掃描對`human-status-projection`、`work-status-presentation`、`responsibility-status-projection`、`availability-scope`及inventory所列舊authority命中為0 |
| QA-087-071 | API schema／DTO／serialized payload不再含`humanStatus`、`responsibilityStatus`、`viewerStatus`、`viewerActionability`、`availabilityScope`、舊`laneLabel`或terminal fallback欄位 |
| QA-087-072 | 舊query parser、compatibility URL、feature flag、legacy resolver與canonical→legacy fallback均不存在；retired URL只回明確失效錯誤，不silent translate |
| QA-087-073 | retired schema receipt可證舊current-state read/write為0且allowlisted DROP／disable完成；protected domain evidence count/hash與approved artifact reference均未改變 |
| QA-087-074 | 缺固定路徑QC summary/retirement manifest、hash/commit/schema/provider不符、gate非PASS、mode非`canonical_only`或任一inventory item未closed時，completion audit拒絕complete／handoff ready／release ready並回`Retirement Pending` |
| QA-087-075 | 全新AI session不帶先前聊天，只讀`cold-start → DEV-087 index → SPEC／ADR／QA → retirement manifest`，能正確指出mode、未清項、owner與下一gate；缺證據時必須fail closed |

## 12. 補強案例：版次、權限、切換與可操作性

| ID | 驗證 |
|---|---|
| QA-087-076 | production 1的server candidate同時提供production 2與RD 1.1；UI不自行計算 |
| QA-087-077 | revision以tuple計算next free minor；production 2被claim時不得跳到3，回固定claim error |
| QA-087-078 | D-CAP3仍完整顯示3個RD latest；第四個新branch拒絕，但既有branch可繼續編輯／同branch進版 |
| QA-087-079 | D-CAP-RACE四個併發creator最多三個commit成功；敗者=`DRAWING_RD_BRANCH_LIMIT_REACHED`，DB無partial write |
| QA-087-080 | D-STALE在production推進後仍顯示；可續RD minor，直接升production以固定人類原因與server error拒絕 |
| QA-087-081 | 核准minor只更新受控RD並回idle；核准major只在current-base guard通過時推進production |
| QA-087-082 | Manufacturing同時看見A0002 production 1與RD 1.1但無mutation；owner與現行authorized non-owner editor可依action permission維護同公司work，exact reviewer/non-scoped non-owner矩陣符合SPEC |
| QA-087-083 | cross-company與缺view permission不hydrate list/drawer/artifact/request；所有mutation fail closed |
| QA-087-084 | DEV-087 request只允許approve/return；BOM等其他approval domain既有reject/needs_info契約與回歸不變 |
| QA-087-085 | Part live attachment exception與提示正確；Drawing controlled file、Relation exact tree仍在snapshot/lock內 |
| QA-087-086 | cutover先freeze/drain所有web/worker/scheduler並驗證old instance=0；舊build/client token被fence |
| QA-087-087 | 開放流量前失敗RPO=0 rollback；注入一筆未核准外部寫入時automatic restore必須停下等待人類對帳 |
| QA-087-088 | DB authority control與runtime expected mode/commit/schema任一不符時readiness FAIL且current-state command拒絕 |
| QA-087-089 | disposable/isolated canonical_only完整command/UI通過，但manifest明確標示非production／非release evidence |
| QA-087-090 | inventory schema、canonical inventory、immutable manifest、QC summary固定路徑與hash互相指向；completion audit可消費並負向拒絕缺件 |
| QA-087-091 | async timeout/retry/worker restart/manual retry都不重複trace/effect；可恢復→system_admin，不可恢復→blocked且舊正式有效 |
| QA-087-092 | 0/1/3 branches的query數相同且DOM row有界；第四branch拒絕後不增加query/row |
| QA-087-093 | list→drawer→target modal→editor只有一個action owner；RD idle僅drawer增加一個低權重`申請作廢`風險例外；超過5秒、成功、取消、失敗的focus/scroll return均正確 |
| QA-087-094 | 可見錯誤為人類語意、technical/internal欄位不洩漏；鍵盤、touch、screen reader與非只靠顏色均通過 |
| QA-087-095 | cancel/revision reuse後minimal review trace仍以stable review cycle/entity reference追到審核次數與時間，不依revision text |
| QA-087-096 | 所有create/submit/return/approve/formalize/cancel command驗證idempotency key與標準錯誤；response loss重送相同結果，payload衝突拒絕且無partial write |
| QA-087-097 | `drawing_revision_works／part_change_works／relation_change_works`各自unique/FK/check成立；legacy workspace不能成為新current-work authority |
| QA-087-098 | 無production／無canonical row時，aggregate lock row仍序列化create；DB `open_branch_count`只允許0..3且四creator最多三個成功 |
| QA-087-099 | D-FIRST-CANCEL取消後branch/work/claim/state全無且open count減一；不得殘留空open branch |
| QA-087-100 | D-NEXT-CANCEL取消1.2 work後保留branch與approved 1.1 idle row，claim 1.2釋放且count不變 |
| QA-087-101 | 現行`hasPdmNonOwnerEditScope`＋SPEC §6.2既有permission code在三domain延續；逐一驗證workspace create/update/cancel、draft update、review submit/decide、draft obsolete；同公司authorized non-owner正向，未授權non-owner／Manufacturing／cross-company fail closed，且沒有新role/code/grant |
| QA-087-102 | 只有open idle＋latest approved RD＋無active work可申請作廢；active/review/system/blocked/historical均回`DRAWING_RD_VOID_NOT_ALLOWED`且零partial write |
| QA-087-103 | 作廢approve以exact snapshot正式化，CAS branch→historical、closed_reason正確、current row移除、count減一；approved identity/claim/artifact保留不可重用 |
| QA-087-104 | 作廢return只新增一次minimal trace並恢復open idle；不關閉branch、不減count，可重新申請且使用新review cycle |
| QA-087-105 | D-VOID-RACE與double-click/response-loss只建立一個active request；其他請求回stable replay或`DRAWING_RD_VOID_ALREADY_PENDING` |
| QA-087-106 | Manufacturing可看RD row但看不到作廢action；exact reviewer可核准／退回；authorized non-owner可提出，未授權與cross-company不hydrate request |
| QA-087-107 | 作廢確認modal顯示版次、current移除與不可復原效果，不顯示branch/source/predecessor；四viewport、Escape、focus return與screen reader均通過 |
| QA-087-108 | canonical-only gate前不執行legacy physical-byte GC；gate後零引用GC為不可逆，刪除後沒有restore endpoint/CTA，manifest不得宣稱object restore PASS |
| QA-087-109 | LEGACY-MULTI-WORKSPACE只有company/owner/單一entity可唯一證明者可轉專用work；不可安全拆分者進quarantine且unresolved必須為0 |
| QA-087-110 | branch作廢不刪approved Drawing file/preview；exact history仍可唯讀開啟且revision claim永久不可重用 |

## 12.1 RD Implementation Readiness補強案例

| ID | 驗證 |
|---|---|
| QA-087-111 | fresh/legacy SQLite透過`ensureDev087CanonicalWorkbenchSchema`與PostgreSQL `042_status_data_rebuild.sql`建立SPEC §3.1.2 exact tables/constraints/indexes；重跑idempotent；040→042缺號路徑可獨立apply，042不引用041 schema，未來041→042正常排序及042已套用後補041均無checksum/schema衝突；provider parity PASS |
| QA-087-112 | DEV-087 submit只建立`pdm_work_review_requests` transient row；不寫`approval_platform_requests/decisions`；既有BOM/其他approval domain create/decide/history regression零變化 |
| QA-087-113 | return同transaction新增一筆minimal trace、handling回owner並清除request/snapshot；approve後只在applying/apply_failed暫存，formalize success後清除；retry/double-click不重複trace |
| QA-087-114 | `pdm_review_traces` schema與serialized backend query只有cycle/company/entity/time，DB trigger禁止update/delete；UI/API/DOM/a11y完全不呈現trace |
| QA-087-115 | 本機cleanup只接受verified SQLite exact path/header；副本演練與主DB apply均證明60個workspace、56筆quarantine清為0、canonical hash不變。production converter拒絕retain/discard flag，`unresolved>0`或mapping／receipt／fingerprint不完整即BLOCKED。 |
| QA-087-115 | list/detail response符合SPEC §9.1 allowlist，禁止欄位零命中；opaque row/cursor不含branch/source/predecessor語意；`view/history/workStatus/recordStatus/dataStatus/humanStatus/responsibilityStatus/viewerStatus/availabilityScope/lane/versionLane`回`410 WORKBENCH_FILTER_CONTRACT_RETIRED`，既有series/type/purpose business filter仍正確且進cursor hash |
| QA-087-116 | §9.2所有command route強制auth/company/action/idempotency/If-Match/contract token，decision只接受approve/return；retired draft-workspace command在canonical_only回`410 WORKBENCH_COMMAND_CONTRACT_RETIRED`且無write |
| QA-087-117 | create/edit/submit/cancel/void/decision route只呼叫domain service；constraint、permission、stale token與response-loss注入沒有partial multi-table write或client-side candidate authority |
| QA-087-118 | converter dry-run/apply/re-run依§10.2產生相同source/target counts與hash；multi-target、多active、lineage不明、over-cap、company mismatch全部quarantine，不截斷、不猜測 |
| QA-087-119 | retirement negative scan對每個舊status projector、legacy workspace current read、舊filter/query、command compatibility與feature flag可注入FAIL；移除後PASS，保留domain evidence hash不變 |
| QA-087-120 | exact implementation map逐path有touched-path ledger；Drawing owner editor/recognition維持原component ownership，reviewer同component readonly，Part/Relation各自domain service且無第二套current-state resolver |

## 12.2 QA主管批判補強案例

### A. QA harness、證據可信度與跨provider一致性

| ID | 驗證 |
|---|---|
| QA-087-121 | 每個case只允許`PASS／FAIL／BLOCKED／NOT_RUN`；required case的BLOCKED、NOT_RUN、skip、quarantine或flaky都讓aggregate FAIL，runner保存首次失敗與每次retry，不得retry-to-green覆蓋 |
| QA-087-122 | revision、pagination、migration reconciliation與state transition使用小型獨立oracle；以預先準備的known-wrong result vectors確認oracle會拒絕，expected不得直接取自SUT actual |
| QA-087-123 | 最小negative-control只注入三個高風險穩定性錯誤：第四branch穿透、transaction中途故障、visible error伴隨錯誤資料；對應gate都必須FAIL。不得擴張成防作弊mutation平台 |
| QA-087-124 | manifest缺case definition hash、oracle version、fixture seed、commit/schema/provider、首敗pointer、cleanup receipt或固定path hash chain任一項時，completion audit與aggregate均FAIL；不同commit的舊run不可誤用為本次證據 |
| QA-087-125 | case可隨機排序、單獨執行與重跑，結果相同；每案使用run-scoped資料並清理，前案殘留、共用cache或未釋放runtime/port會使run FAIL |
| QA-087-126 | 同一fixture/oracle在SQLite與PostgreSQL輸出經明示normalization後逐欄一致；時間、JSON、boolean差異只可由provider adapter處理，不能以provider-specific expected掩蓋行為差異 |

### B. Review最小留存、故障邊界與追溯正確性

| ID | 驗證 |
|---|---|
| QA-087-127 | pending／applying／apply_failed時只有完成工作所需的transient request/snapshot；return或formalize success後request與snapshot為0，永久business trace只能由cycle/company/entity/time回答次數與時間 |
| QA-087-128 | DEV-087 decision的command receipt、published outbox、audit detail與stable result不得永久保存或可反推出reviewer、decision、comment、revision text、snapshot或work content；active retry所需資料在terminal cleanup後刪除／安全縮減 |
| QA-087-129 | outbox `payload_json／last_error`、command `response_json`及ops retry evidence只含allowlisted technical key/hash/result，不含完整snapshot、檔名、品名、關聯樹、人名或decision；序列化前後及錯誤路徑都掃描 |
| QA-087-130 | server/app/worker log、telemetry、URL/referrer、error envelope、browser storage、DOM/a11y與QA artifact做forbidden-data sweep；correlation id可保留，但不得成為review內容的側通道 |
| QA-087-131 | terminal後建立DB/schema/binding backup再restore，跨所有DEV-087與共用transport tables重跑留存掃描；不得因live table已清而讓backup永久保留reviewer/decision/content |
| QA-087-132 | return transaction在驗證後、trace insert後、handling update後、request delete前逐點注入crash；每次只允許全部rollback或完整return，不能有雙trace、owner狀態配pending request或孤兒snapshot |
| QA-087-133 | approve／formalize在trace、snapshot freeze、request applying、outbox enqueue、official write、canonical switch與terminal cleanup各點注入crash；重啟後只可落在SPEC允許狀態並可exact retry，舊正式始終有效 |
| QA-087-134 | orphan sweeper／retry worker只處理可證明的pending/applying/apply_failed request；對已return、已formalize、stale rowVersion或無canonical link資料fail closed，不得重建決策、第二次正式化或誤刪trace |
| QA-087-135 | 多次return/approve、cancel後revision重用、branch作廢重送與跨時區顯示下，trace count精確、`decision_at`為UTC且排序穩定；同一cycle不可重複，不靠revision label識別 |

### C. 一般權限一致性、stale UI、idempotency與錯誤恢復

| ID | 驗證 |
|---|---|
| QA-087-136 | 在list/detail已讀取後、mutation commit前正常撤銷membership、action permission、non-owner scope或改派reviewer；server於transaction內重驗並403/409，無partial write，UI隨reload移除action |
| QA-087-137 | 依正式UI與server產生的row/work/request/artifact identity跑owner、authorized non-owner、Manufacturing、reviewer、停用member與cross-company矩陣；一般未授權角色不hydrate資料。惡意token偽造、暴力猜測與timing side channel本期不測 |
| QA-087-138 | 同一使用者的double-click、網路重送與response loss使用相同idempotency key只產生一次effect；相同key搭配不同正常payload回固定conflict。不同actor刻意竊用key的攻防本期不測，但server仍不得移除既有company/permission檢查 |
| QA-087-139 | 正常操作產生的stale `If-Match`、過期contract/candidate/removal token、reviewer被改派、返回後兩tab舊token都fail closed；重新整理取得目前server action，不測人工偽造token或外部redirect攻擊 |
| QA-087-140 | list/detail/review/artifact與error response維持private no-store；正常logout、登入另一角色或切company後，browser/app cache不回放前一viewer的row、snapshot或action。CDN滲透與cache poisoning不在本期 |
| QA-087-141 | mutation routes對正常可能出現的缺header、stale header、unknown field、attachment誤帶與不合法decision拒絕，DB hash、receipt與outbox count不變；CSRF、oversized-body DoS與惡意content-type攻防延後 |
| QA-087-142 | 403/404/409/410/422/5xx回固定、可操作的人類訊息與correlation id，UI保留上下文且可重試／重新整理；不顯示SQL/table/token/snapshot。timing／enumeration攻防不列入本期 |

### D. Linearizability與跨狀態競態

| ID | 驗證 |
|---|---|
| QA-087-143 | `edit↔submit`、`edit↔cancel`、`submit↔cancel`以同步barrier競態；結果可映射到單一合法先後順序，loser固定錯誤，work/canonical/request/receipt/outbox無partial或雙effect |
| QA-087-144 | exact reviewer的`return↔approve`、雙reviewer舊tab及permission revoke競態只有一個decision commit；另一方不得新增trace、改handling或正式化，response loss重送仍同一結果 |
| QA-087-145 | open idle branch的`void request↔advance/create work`、`void approve↔edit/submit`競態只允許一個合法路徑；branch count、current row、approved history與claim保持一致 |
| QA-087-146 | 兩個以同production base建立的branch同時promotion，最多一個推進production；loser變stale且只可續minor，production/history/artifact不被最後寫入者覆蓋 |
| QA-087-147 | `new branch create↔first-work cancel↔void close`及四creator交錯時，aggregate count永遠0..3且等於實際open branch數；無double decrement、負數、幽靈branch或名額洩漏 |
| QA-087-148 | authority mode CAS與新／舊build command同時發生時，每個command只落在一個authority；freeze/drain/fence前後有明確linearization point，mode/commit/schema不符立即拒絕且無dual write |
| QA-087-149 | outbox duplicate delivery、worker crash、lease timeout、manual retry與兩worker競爭同effect key時，domain effect exactly once、review trace at most once、terminal cleanup eventually once；poison message不得阻塞其他entity |

### E. Property、規模、遷移與不可逆刪除

| ID | 驗證 |
|---|---|
| QA-087-150 | 固定seed model-based sequence隨機執行create/advance/submit/return/approve/cancel/void/promotion，逐步比對reference model：revision tuple、claim reuse、approved不可重用、branch cap與正式資料不污染永遠成立 |
| QA-087-151 | group pagination以隨機sort tie、filter、空group、insert/delete branch、cursor replay與stale cursor測試；同一snapshot無漏列／重複／拆group，snapshot改變時回明確stale而非混頁 |
| QA-087-152 | `SCALE-10K`同時驗證statement hard cap與`EXPLAIN` index usage；0/1/3 branch不增加statement，critical query不得因常數query數卻full scan，payload/DOM仍符合row上限 |
| QA-087-153 | converter對固定seed legacy fuzz做dry-run/apply/re-run；所有非法資料只能deterministic quarantine，Unicode/NULL/重複順序不改hash，禁止silent coercion、截斷、猜測或部分寫入 |
| QA-087-154 | PostgreSQL 040→042、041→042、042後補041、SQLite fresh/legacy、partial DDL failure、re-run與forward-fix逐路徑演練；migration checksum、schema hash、data hash與rollback receipt一致 |
| QA-087-155 | zero-reference physical GC與新增reference／approved binding併發時，刪除前在同一guard邊界重驗；有任何有效或approved reference即不刪，wrong-object／double-delete／restore宣稱皆FAIL |

### F. 真實UI、資料合理性與quietness hard gate

| ID | 驗證 |
|---|---|
| QA-087-156 | 每條critical UI journey在初載、操作後、hard reload後掃描可見alert/error overlay、4xx/5xx文字、console error、unhandled rejection與failed network；任一命中即FAIL，不得以最後畫面正常抵銷 |
| QA-087-157 | 畫面逐fixture驗證預期group/row/編號/品名/layer/revision/handling與DB/API一致；HTTP 200、非空DOM或零筆結果不算資料正確，合法空白與載入失敗必須可區分 |
| QA-087-158 | submit/return/approve/void/promotion後做hard reload、back/forward、duplicate tab與stale tab操作；舊action不復活、production不消失、drawer selection/URL/focus不指向錯row |
| QA-087-159 | 四viewport加200% zoom、長繁中、三branch、空白/blocked/system_admin與touch/keyboard；無裁切、雙重捲動、遮擋或色彩唯一語意，danger action與safe primary不等權重 |
| QA-087-160 | owner與reviewer用同一fixture逐欄、component tree與accessibility tree比對；reviewer只有readonly與decision affordance差異，Part live attachment在審核期間變更可立即看到但不改snapshot，quietness/a11y/焦點流程PASS |

### G. 穩定性與效率優先門檻

| ID | 驗證 |
|---|---|
| QA-087-161 | 在固定reference environment與`SCALE-10K`量測三工作臺list/detail/filter：0/1 branch同fixture的warm p95不得比DEV-086/current baseline慢超過20%；3 branch相對DEV-087自身1 branch p95增幅不得超過25%；p99不得出現>2倍對應baseline尖峰。statement hard cap維持，另記absolute latency但不跨機器混比 |
| QA-087-162 | 20個concurrent readers＋5個合法writers執行60分鐘soak，HTTP 5xx/unhandled error/資料不一致=0；暖機後process memory不得持續單調成長，DB connections、pending receipts/outbox與worker queue在停止負載後回到baseline |
| QA-087-163 | connection pool接近上限、worker暫停/恢復、DB短暫busy/timeout與client retry時提供backpressure，不形成retry storm、連線洩漏或重複正式化；恢復後新entity不被poison request阻塞 |
| QA-087-164 | 0/1/3 branch、長品名與最大page group下量測API payload、DOM nodes、首次可見資料及filter interaction；相較baseline增幅有來源解釋且不隨branch以外維度N倍成長，client不載入未命中companion/history/artifact bytes |
| QA-087-165 | converter/cutover rehearsal記錄每批rows/sec、peak memory、temporary disk、lock duration、freeze duration與restore elapsed；兩次相同fixture偏差超過20%需分析，且全部在release plan的maintenance/RTO預算內才可進production gate |

## 12.3 Acceptance Criteria追溯矩陣

此矩陣是coverage gate，不代表案例已執行。每一項SPEC Acceptance Criteria至少有一個正向case及一個可拒絕錯誤的case；runner必須輸出AC→case→evidence反向索引。

| SPEC AC | 主要QA cases |
|---:|---|
| 1 | 068、090、118、119、124 |
| 2 | 062、067、070..074、088、119、120、123 |
| 3 | 022、023、082、157 |
| 4 | 003、025、078、079、098、150 |
| 5 | 024、044、151 |
| 6 | 041..045、115、151、158 |
| 7 | 005、011、029、076、077、095、150 |
| 8 | 009、117、143 |
| 9 | 018、027、081、146 |
| 10 | 028、080、146 |
| 11 | 029、055、099、100、143 |
| 12 | 007、014..016、095、113、114、127..135 |
| 13 | 004、034、038、040、066、097 |
| 14 | 036、085、133、160 |
| 15 | 051、084、112、120、160 |
| 16 | 013..016、101、113、143、144 |
| 17 | 015..020、091、113、133、149 |
| 18 | 019、020、050、091、094、156 |
| 19 | 021、039、133、144 |
| 20 | 008、031、035、039、110、155 |
| 21 | 048..054、094、115、156..160 |
| 22 | 032、157 |
| 23 | 055..057、108、155 |
| 24 | 058..060、109、118、153 |
| 25 | 061..064、086..089、131、148、154、155、165 |
| 26 | 047、072、115、142 |
| 27 | 030、102..107、110、145、147、159 |
| 28 | 046、054、060、076..094、111、118、121..126、150..165 |
| 29 | 067、086..089、148 |
| 30 | 068、090、119 |
| 31 | 069..074、088..090、119、124 |
| 32 | 070..073、115、119、130 |
| 33 | 060、073、090、124 |
| 34 | 074、124 |
| 35 | 075、124 |
| 36 | 068..075、119、120、124 |
| 37 | 082、083、101、106、136..142 |
| 38 | 093、107、156、158、159 |
| 39 | 016..020、091、096、127..149、162、163 |
| 40 | 067、086、088、089、124、148 |
| 41 | 074、090、124 |
| 42 | 097、109、112、118..120 |
| 43 | 003、030、079、098..105、145..151 |
| 44 | 099、100、143、147 |
| 45 | 102、105、106、136、139、145 |
| 46 | 103、108、110、155 |
| 47 | 107、156、159、160 |
| 48 | 111、126、154 |
| 49 | 112..114、127..135 |
| 50 | 051、084、112、120、160 |
| 51 | 047、071、072、115、130、137、140、142 |
| 52 | 083、096、101、116、117、136..142 |
| 53 | 046、092、152、161..164 |
| 54 | 058..060、109、118、153、154、165 |
| 55 | 052、097、101、117、120、123 |

## 13. Risk-based FMEA

評分1..5；RPN=`S×O×D`。RPN≥40或Severity=5一律列P0 gate，未有自動偵測證據不得降級。

| Failure mode | Effect | Cause | S | O | D | RPN | Prevention | Detection／case | Owner |
|---|---|---|---:|---:|---:|---:|---|---|---|
| production列被RD遮蔽 | 生產使用錯資料 | 多projector裁決latest | 5 | 3 | 3 | 45 | canonical row＋group contract | QA-087-022/082 | RD+QA |
| 第四branch穿透 | 無界清單、工作遺漏 | 非原子count/create | 4 | 3 | 4 | 48 | aggregate lock＋cap transaction | QA-087-003/078/079 | RD |
| stale branch推進production | 舊基準覆蓋正式 | 缺current-base guard | 5 | 3 | 4 | 60 | immutable base＋approve guard | QA-087-080/081 | RD+QA |
| revision重複／跳號 | trace與artifact錯配 | decimal/client計算 | 5 | 3 | 3 | 45 | tuple server algorithm＋global claim | QA-087-005/076/077 | RD |
| stale／放棄branch無法釋放名額 | 永久只剩一個可用新branch名額 | 缺真實close transition | 4 | 3 | 4 | 48 | reviewed RD void＋atomic count decrement | QA-087-030/102..105 | RD+QA |
| first-work cancel殘留空branch | 無效row占名額 | branch cleanup未與cancel同transaction | 4 | 3 | 4 | 48 | aggregate CAS cleanup | QA-087-099/100 | RD |
| legacy aggregate錯拆current work | Part／Relation互相污染 | 重用多實體workspace | 5 | 3 | 4 | 60 | dedicated work tables＋quarantine | QA-087-097/109 | RD+QA |
| non-owner權限被意外縮限或放大 | 工作中斷或越權 | 新模型未沿用既有scope＋permission | 5 | 3 | 4 | 60 | exact server matrix | QA-087-082/101/106 | Security+QA |
| physical bytes被誤宣稱可復原 | 刪檔後產生錯誤安全期待 | DB backup與object recovery混為一談 | 5 | 2 | 4 | 40 | irreversible boundary＋no fake restore | QA-087-056/061/108/110 | Release owner+QA |
| Part附件被錯誤鎖定／核准 | 即時附件政策破壞 | review scope不清 | 4 | 3 | 3 | 36 | descriptor exclude＋回歸 | QA-087-036/085 | RD+QA |
| DEV-087決策誤寫舊approval永久表 | 違反最小留存且無法清除 | 為共用inbox誤共用storage | 5 | 3 | 4 | 60 | transient adapter＋schema ban | QA-087-112..114 | RD+QA |
| cross-company資料洩漏 | 機密性事件 | list先hydrate再隱藏 | 5 | 2 | 4 | 40 | server company boundary | QA-087-083 | Security+QA |
| old/new authority並存 | 狀態分歧與寫入遺失 | 切換未fence舊instance | 5 | 3 | 4 | 60 | singleton control＋build fence | QA-087-086/088 | Release owner |
| rollback遺失cutover寫入 | 不可接受資料損失 | freeze未生效 | 5 | 2 | 5 | 50 | external write freeze＋RPO0 stop | QA-087-087 | Release owner |
| async重複正式化 | 重複production/effect | at-least-once無去重 | 5 | 3 | 3 | 45 | snapshot/effect idempotency | QA-087-016/091/096 | RD |
| 舊架構未清卻宣告完成 | 長期雙權威 | evidence路徑/完成gate缺失 | 5 | 4 | 4 | 80 | fixed artifacts＋completion audit | QA-087-069..075/090 | PM+QA |
| 關鍵穩定性驗證存在盲點 | revision／transaction／畫面錯誤未被測試抓到 | expected直接重用SUT結果 | 5 | 3 | 5 | 75 | 小型獨立oracle＋3項negative control | QA-087-121..124 | QA主管 |
| review資料從旁路永久殘留 | 違反只追溯次數與時間的決策 | 只清request，receipt/outbox/log/backup仍有reviewer/decision/content | 5 | 3 | 5 | 75 | 全surface allowlist＋terminal purge | QA-087-127..131 | RD+Security+QA |
| 權限撤銷後舊頁仍可寫 | 越權修改或核准 | 只在read/UI檢查，commit未重驗 | 5 | 3 | 4 | 60 | transaction內permission/reviewer recheck | QA-087-136/139/144 | Security+QA |
| 競態結果無法線性化 | duplicate trace/effect、branch count錯誤、正式資料覆寫 | 只測double-click，未測跨command race | 5 | 3 | 4 | 60 | barrier race matrix＋model oracle | QA-087-143..150 | RD+QA |
| HTTP 200／有截圖被誤判PASS | 生產或研發資料其實空白、錯列或有可見錯誤 | 只看navigation/selector存在 | 5 | 4 | 4 | 80 | visible-error＋data-sanity hard gate | QA-087-156..158 | QA+QC |
| query數固定但全表掃描 | 資料量上升後工作臺逾時 | 只計statement不看plan/index | 4 | 3 | 4 | 48 | SCALE-10K＋EXPLAIN | QA-087-152 | RD+QA |
| retry-to-green掩蓋flake | production競態問題未被阻擋 | runner覆寫首敗／接受偶發通過 | 4 | 3 | 5 | 60 | immutable first-failure evidence | QA-087-121/124/125 | QA主管 |
| zero-ref檢查後又新增引用 | approved或有效檔案被永久刪除 | GC check/delete有TOCTOU | 5 | 2 | 5 | 50 | deletion guard linearization | QA-087-155 | RD+QA |
| 功能正確但清單持續變慢 | 使用者等待、timeout、誤以為無資料 | 只看query count、不比baseline latency/payload | 4 | 4 | 4 | 64 | SCALE-10K＋relative p95/p99 budget | QA-087-152/161/164 | RD+QA |
| 長時間運作資源洩漏 | 連線池耗盡、worker停擺、間歇5xx | 未做soak/backpressure | 5 | 3 | 4 | 60 | 60分鐘混合負載＋恢復觀察 | QA-087-162/163 | RD+QA |
| migration耗時或資源超出窗口 | cutover超時、rollback風險上升 | 只驗證資料正確，未量rows/sec/memory/disk/lock | 5 | 3 | 4 | 60 | 兩次rehearsal效率與RTO預算 | QA-087-165 | Release owner+QA |

## 14. Phase Gate、Runner 與 Case Evidence Contract

每個case runner manifest必須逐ID保存：`caseDefinitionHash`、`acceptanceCriteria`、`riskIds`、`oracleName/version/hash`、`preconditions`、`steps`、`expected`、`actual`、`provider`、`artifact/build commit`、`schema hash`、`fixture hash/seed`、`startedAt/finishedAt`、`attempt`、`result`、`firstFailurePointer`、`stdout/stderr`、`evidence pointers`及`cleanup`。只有aggregate PASS、截圖或口頭敘述均不算完成。

結果規則：

- `PASS`：本次attempt所有required assertion有直接證據，且negative control已證明gate會拒絕錯誤。
- `FAIL`：任一expected不成立、visible error、資料不合理、證據不可信、cleanup失敗或發現P0/P1。
- `BLOCKED`：前置實作／環境／fixture缺失；不得計入通過率，且aggregate必須FAIL closed。
- `NOT_RUN`：未執行；不得以not applicable、parent PASS或舊evidence代替。真正不適用須先從active case contract移除並留下spec amendment。
- `FLAKY`不是合法完成狀態；任一attempt出現不一致即以FAIL處理，直到根因與repeatability evidence關閉。

| Gate | 允許進入條件 | 必跑／預期command | Exit |
|---|---|---|---|
| Phase 0 QA harness trust | RD建立runner後、尚未採信任何功能綠燈 | `npm run qc:dev-087:harness` | 關鍵oracle獨立、3項stability negative control被抓到、首敗與result taxonomy有效；不建立反作弊mutation平台 |
| Phase 1A schema/inventory | Phase 0 PASS、文件已達RD Implementation Ready、RD獲實作授權 | `npm run qc:dev-087:schema`、`npm run qc:dev-087:migration`、`npm run qc:dev-087:retention` | schema／inventory／converter dry-run、留存surface inventory、unknown=0 |
| Phase 1B command/read | 1A PASS | `npm run qc:dev-087:contract`、`:repository`、`:commands`、`:concurrency`、`:fault-injection`、`:query-budget`、`:performance`、`:soak` | SQLite/PostgreSQL、race/role-change/retention/idempotency/API DTO、SCALE-10K latency、load/soak/backpressure PASS |
| Phase 1C UI/browser | 1B PASS | 依`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`由AI執行67條真實UI journey；輔以`npm run qc:dev-087:browser`、`:visible-error`、`:a11y` | 67/67 journey＋11/11 triad gates；所有mutation具UI provenance；四viewport＋200% zoom、data sanity、role/action/review、focus/a11y/banned text、visible/console/network error=0 |
| Phase 1D rehearsal/retirement | 1A..1C PASS | `npm run qc:dev-087:migration`、`npm run qc:dev-087:retirement`、`npm run qc:dev-087` | fuzz/partial failure/backup retention sweep、migration throughput/resource/RTO、cutover/drop/rollback、GC race與fixed manifest PASS |
| Phase 1E production release | 1D PASS＋另行使用者授權 | deployment/release gate指定production commands | same-window canonical_only＋retirement PASS；否則rollback |

2026-08-22 已實作 `qc:dev-087:contract／repository／commands／migration／retirement／browser` 與 aggregate `qc:dev-087`；aggregate另執行`typecheck:app`與`build:isolated`。這些 focused runners 已支援本機 implementation gate，但尚未補齊表列 harness／retention／concurrency／fault-injection／query-budget／performance／soak／visible-error／a11y 的獨立 release-case runner，也未產生165案逐ID evidence，因此不得把本機aggregate PASS等同完整QA或production readiness。production command名稱與credential只可在release plan補齊，不寫入本文件。

## 15. Spec Impact / Regression

必跑回歸：

- Drawing/Part/Relation workbench security、company scope、private no-store。
- Drawing exact preview/download/detail、recognition、submit/review。
- Part現行attachment immediate mutation與DEV-087 review隔離；後續DEV-088的reuse／新attachment platform／whole-part lock明確排除，不作本期回歸前置。
- approval inbox與review route permission。
- numbering identity/recycling rule（只驗證DEV-087不越權改寫）。
- BOM/where-used/relationship read，確保 old `record_status` 若保留為domain evidence不再驅動 workbench current label。

## 16. Evidence Package

每個 provider/run 至少保存：

- inventory disposition CSV/JSON與old-authority usage scan。
- migration dry-run/reconciliation/retirement allowlist manifest。
- `qc:dev-087:retirement`結果、負向注入證據、retirement manifest與fresh-session continuation結果。
- concurrency與failure injection log。
- QA harness三項stability negative-control、關鍵獨立oracle、case/AC反向索引、固定seed及immutable first-failure log；不要求反作弊／紅隊evidence。
- schema/index/constraint assertions。
- API/browser result、四viewport＋200% zoom screenshots、DOM/accessibility tree及expected row/value對帳。
- UI-only lifecycle evidence：`output/qa/dev-087-ui-only-lifecycle/<runId>/`中的67條action provenance、API readback、read-only DB readback與逐checkpoint triad diff；direct API／DB mutation audit必須為0。
- banned-text/a11y/overflow/visible alert/error overlay/console/unhandled rejection/network/4xx/5xx與unexpected empty/zero-data sweep。
- review retention surface inventory及pending/applying/apply_failed/terminal/backup-restore各時間點的allowlist scan；evidence本身也必須脫敏。
- normal role/company permission、role-change、double-click/idempotency與linearizability timeline；不含紅隊IDOR／CSRF／DoS／timing攻防。
- `SCALE-10K` statement count、EXPLAIN/index plan與payload/DOM row-bound evidence。
- baseline與candidate p50/p95/p99、60分鐘load/soak、memory/connection/queue回復、backpressure及migration rows/sec/peak resource/RTO evidence。
- DB/schema/binding backup/restore/drop/rollback rehearsal receipt，以及physical-byte不可復原邊界／GC receipt。
- cleanup receipt，證明temporary runtime與disposable database已移除。
- `.ai-doc/qa/dev-087-old-authority-inventory.schema.json`、`.ai-doc/qa/dev-087-old-authority-inventory.json`、`output/qa/dev-087-retirement/<run-id>/manifest.json`與`.ai-doc/qc/qc-dev-087-retirement-<date>.md`的exact path/hash chain。

## 17. Release Gate

即使 QA-087-001..178 全數本機／隔離 PASS，仍不得自動執行 production migration。正式切換另須：

1. 使用者明確授權高風險資料遷移與 release。
2. deployment/release gate確認環境、DB備份目的地、maintenance window最大時長/RTO、old runtime/worker drain、owner與relational rollback責任；不得宣稱已刪physical bytes可restore。
3. production read-only inventory/reconciliation預檢 PASS。
4. 即時stop condition、same-window drop allowlist、90-day DB backup receipt及canonical-only後irreversible physical-GC allowlist就緒。
5. cutover完成後authority control=`canonical_only`且綁定exact commit/schema/provider、production `npm run qc:dev-087:retirement` PASS、fixed-path summary/manifest complete；否則在流量開放前rollback至`legacy_only`並維持`Retirement Pending`，不得release或結案。
## 18. 3D／2D 預覽恢復驗證（2026-08-23）

本次為既有能力恢復，不新增檔案權威，也不改圖號獨立編輯器。三個工作臺的 full detail drawer 必須共用同一個 3D／2D preview slot contract：圖號維持既有行為；料號與圖料根號由代表圖的既有受控附件產生 preview slots。驗收採三方一致門檻：

- 後端 detail response：`drawing.previews`、`part.previews`、`relation.previews` 各自都必須有固定 3D／2D 兩槽位，且 `mediaHref`／`downloadHref` 只能指向既有受保護附件或衍生預覽路徑。
- 資料：代表圖附件的檔名、內容雜湊與 preview job／derivative 狀態一致；沒有附件時只能回傳 `missing`，不可產生虛假媒體連結。
- UI：三個抽屜都必須呈現共用預覽元件；`ready` 顯示媒體，`queued`／`running`／`delayed`／`failed`／`unavailable`／`missing` 顯示對應人類可理解狀態，且不得出現 console error、4xx/5xx 或可見錯誤遮罩。

固定驗證：`npm.cmd run typecheck:app`、`npm.cmd run qc:pdm-entity-detail-drawer`。drawer QC 已依 DEV-087 current canonical shell 重寫，舊 DEV-039 搜尋頁／owner drawer 斷言不再作為現行契約；最新 canonical drawer 18/18 與 search-target runtime PASS。瀏覽器驗證須分別開啟圖號、料號、圖料根號抽屜，核對前後端 payload 與畫面三方一致。

## 19. 抽屜寬度偏好與清單鍵盤切換驗證（2026-08-23）

本次恢復既有互動能力，不新增資料模型或工作流狀態。canonical 圖號、料號、圖料工作台沿用既有 `useRememberedDrawerWidth` 與 `useListKeyboardShortcuts`，各工作台使用原有的 localStorage key，避免偏好互相覆蓋。

| Case | 驗收 |
|---|---|
| QA-087-166 | 開啟任一工作台明細，拖曳「調整明細欄寬度」控制點；抽屜寬度隨指標變化，且限制在既有最小寬度與 viewport 安全上限。重新整理後仍使用同一工作台、同一使用者偏好的寬度；換到其他工作台不得讀錯 key。 |
| QA-087-167 | 清單取得焦點後，`ArrowUp`／`ArrowDown` 選取上一列／下一列，選取列有清楚視覺狀態；`Enter` 開啟選取列，`Escape` 關閉抽屜並將焦點回到清單。輸入框、下拉選單及可編輯元素內按鍵不得被攔截。 |
| QA-087-168 | 抽屜開啟且焦點在抽屜控制項時，`ArrowUp`／`ArrowDown` 仍可切換上一筆／下一筆明細，且 URL、detail API、抽屜標題／內容三者指向同一 `rowKey`；快速連續切換不得留下可見錯誤或錯列資料。 |

通過標準：三個工作台各完成 QA-087-166～168；前端 typecheck PASS；瀏覽器 console、可見錯誤、detail/list API 4xx/5xx 均為 0；不得以僅有 DOM 控制項或僅有 localStorage 值代替實際拖曳、鍵盤與前後端一致性證據。`qc:pdm-entity-detail-drawer` 必須驗證 current canonical shell 並 PASS，禁止用已被 DEV-087 取代的舊 UI 斷言製造永久基線紅燈。

## 20. Canonical 附件預覽讀取回歸（2026-08-23）

A0006-M01 暴露的問題不是附件遺失或預覽 worker 未產生，而是 canonical detail 已產生候選附件的受控 `readHref`，其候選檔案 GET route 卻被整併時誤標為 retired。修正不永久恢復舊路徑，而是讓 candidate／released／history／review 共用 `/api/pdm/file-assets/{fileAssetId}`，由 relation context 決定生命週期與審核範圍：

| Case | 驗收 |
|---|---|
| QA-087-169 | 以 UI 登入後開啟 A0006-M01 研發版抽屜；detail response 的 3D／2D `mediaHref` 必須分別帶 `previewDerivative`／`preview=1` 並使用 canonical file-asset route，回應必須為 200，且 content type 分別為 `image/png`、`application/pdf`；UI 必須實際呈現 3D 圖像與 2D PDF iframe，不得出現「預覽尚未就緒」或可見錯誤。原始檔下載仍使用同一受保護 route；未登入、跨公司、錯誤 context／binding／asset 組合必須拒絕。 |

實作邊界：只建立單一 canonical file-read GET（原檔與衍生預覽 bytes）；舊 candidate POST／PATCH／remove command 不得恢復。route 驗證登入、公司、context relation、binding、asset 未刪除與 review scope。通過標準為後端 HTTP status／content type、資料庫 source asset／derivative content hash、UI 媒體三方一致；若任何一方失敗，case FAIL，不得以只看到附件檔名視為通過。

## 21. 檔案讀取權威收斂與 retirement 完成（2026-08-23）

candidate 與 released 保留不同的業務關聯表（生命週期與審核範圍不同），但檔案本體、preview derivative、storage pointer 與權限判定已收斂到同一個 canonical file-read service／route。舊 `draft-workspaces/{workspace}/candidate-revisions/{revision}/files/{file}` GET 與 adapter 已刪除；同路徑的 command retirement 不受影響。

retirement exit criteria 與結果：

1. PASS：canonical detail／preview／download caller 全部由 canonical file-read contract 產生網址；source asset 只有一套 authority，candidate／released 只保留 relation context。
2. PASS：candidate、released、review、history 四種 context 均完成 company／resource／review scope／original／derivative content-hash 正負矩陣；未恢復任何舊 command。
3. PASS：兩輪獨立 fresh-session UI 與 API evidence 顯示 source caller=`0`、runtime old-route request=`0`、orphan file relation=`0`、console／request failure=`0`；reconciliation manifest 已完成，舊相容 route 與 adapter 已移除。

| Case | 驗收 | 結果 |
|---|---|---|
| QA-087-170 | 執行 `npm.cmd run qc:dev-087:file-read-retirement`；舊 route source/runtime caller=0、route file 不存在、candidate/released relation orphan=0；兩輪 fresh-session 對 candidate／released／history／review 執行原檔、衍生檔、未登入、跨公司、錯 context／binding／asset／derivative矩陣，並由 rendered UI 驗證 A0006 3D/2D。任一不符即 FAIL，且 temporary runtime 必須關閉並確認 port 釋放。 | `PASS 100/100`；`output/qa/dev-087-file-read-retirement/DEV087-file-read-2026-08-23T06-50-26-534Z/manifest.json`；`reconciliation.json`；port `56585` released。 |

已保留 retirement runner 的首輪失敗 manifests，不以重跑覆蓋。完成範圍是 candidate compatibility read path；系統內其他尚有合法 owner 的歷史 API 不因本案被誤稱全部退役。

## 22. 新架構整併與零遺失遷移驗證（2026-08-23）

| Case | 驗收 |
|---|---|
| QA-087-171 | 本機 cleanup 只接受 SQLite、exact `data/ai-pdm.sqlite` 或明示QA fixture；before/after canonical count、PK、FK與內容hash完全相同，60個legacy workspace與56筆quarantine清為0，清理不建立legacy備份。 |
| QA-087-172 | PostgreSQL converter只接受`cloud_sql_postgres`，inventory／rehearsal／cutover模式分離；production discard／retain flag、provider／commit／schema／source fingerprint drift、缺mapping或缺receipt皆fail closed。 |
| QA-087-173 | 兩個正式備份的獨立restore rehearsal逐表驗證source/target count、PK、FK、lifecycle、review count/time、file binding、source與preview hash；任一差異使release BLOCKED。 |
| QA-087-174 | `PdmFileReadContext`所有candidate/work/released/history/drawing/part/review context共用單一路由、授權、storage pointer、derivative與byte pipeline；舊binary GET route檔案及runtime caller皆為0。 |
| QA-087-175 | Drawing／Part／Relation detail為discriminated union且只接受`drawer_minimal／editor_full／review_readonly`；一般UI response、DOM與a11y不含raw status、workflow、package、baseline、source、predecessor或動態unknown欄位。 |
| QA-087-176 | 三工作臺清單使用同一drawer mechanics及三個typed projection；圖號editor保持獨立，review使用同畫面唯讀。圖號／料號抽屜的直接關聯、圖料抽屜的關聯矩陣、預覽、歷史、鍵盤切換與寬度偏好完成UI/API/DB三方一致。 |
| QA-087-177 | retirement gate掃描全部runtime/navigation/API/worker/script caller；負向注入任何舊route、workspace navigation、legacy import、old schema read或fallback時必須FAIL，移除後兩輪fresh-session PASS，caller=0、orphan=0。 |
| QA-087-178 | 正式開放流量前固定要求`unresolved=0`、mapping清單為空、reconciliation=100%、UI/API/DB一致、caller=0、orphan=0、retirement PASS；任一失敗在開放流量前回復DB、app與authority control。 |

## 23. DEV-092 遷移 Drawing work 檔案快照 CAPA（2026-08-24）

目的：驗證converter不只建立Drawing work/state，也完整建立work-owned file snapshot；修復工具能安全處理既有migrated work；runtime能區分「合法零檔」與「snapshot損壞」；completion audit確實可阻止同類漏項再被標成完成。

### 23.1 風險分層與驗證策略

| 層次 | 失效模式 | 影響 | 主要控制／oracle |
|---|---|---|---|
| L1 資料事實 | revision files／assets存在，但work-file child rows為0或partial | work API回空，preview與recognition失去來源 | QA獨立從exact source revision計算ordered tuple set，不使用SUT target summary當expected |
| L2 遷移機制 | converter漏建child rows；re-run以`ON CONFLICT DO NOTHING`掩蓋缺項 | 新舊資料不等價，completion false positive | dry-run／apply共用classifier、per-work composite receipt、第二次apply mutation=0 |
| L3 runtime語意 | mismatch被當作正常empty，或UI直接fallback revision files | corruption不可見、雙authority再生 | work API stable anomaly；真空與異常雙fixture；禁止UI fallback |
| L4 recognition lineage | 同圖號的`candidate_revision` session被誤當current work session | 使用錯來源或舊證據 | exact `context type + revision id + sorted source asset set`比對 |
| L5 治理／防再發 | fixture沒有files，aggregate只看table count／FK | 已知缺陷仍被標PASS | negative injection同時擊穿migration、zero-loss、completion audit |

風險等級：本機程式與disposable data=`Medium / P0`；主SQLite repair須dry-run後再apply；正式PostgreSQL資料修復／cutover=`High / Release Gated`。QA與QC使用不同run id、不同disposable DB與fresh process；不得改寫第一次FAIL artifacts。

### 23.2 Cases

| Case | Precondition／操作 | 獨立 Expected／Hard Gate | 狀態 |
|---|---|---|---|
| QA-087-179 | 對全量`proposed_payload.migrated=true`且由current canonical state指向的Drawing works做唯讀inventory；另固定重現A0006 current work。 | exact source revision只能由work payload／state唯一證明；逐work輸出source/target ordered tuples、hash與異常。修復前A0006 oracle必須能抓到`expected=3, actual=0`；任何ambiguous source、orphan、extra、partial或hash drift均列unresolved，不能被summary隱藏。 | Focused PASS；主SQLite dry-run `output/qa/dev-092-main-dry-run/manifest.json`，`unresolved=0`、identity hash stable；原始0-row事實保留於DEV-092 reopening evidence |
| QA-087-180 | 以0／1／3個未移除revision files的SQLite fixture執行new conversion dry-run→apply→re-run。 | 每筆target tuple=`(source file id, source sort_order, asset content_hash)`；apply後expected=actual，第二次apply insert/update/delete=0，source rows/assets/bytes hash不變。合法0檔仍是0，不被誤判異常。 | PASS；`npm.cmd run qc:dev-092:work-file-snapshot`，21 checks，`output/qa/dev-092-work-file-snapshot/dev-092-work-files-Ae1bZJ/manifest.json` |
| QA-087-181 | 對既有migrated work建立target empty、partial、complete三種狀態；注入source mutation、missing/deleted asset、duplicate、extra target、hash drift與cross-company/drawing。 | repair按work整組原子；可確定且完整才寫入。任一歧義／不一致須fail closed、unresolved>0、target before/after不變；移除異常後dry-run與apply才PASS。 | PASS；`qc:dev-092:work-file-snapshot` 已以獨立fixture覆蓋 missing/deleted source、source hash、extra target、target hash、duplicate ordinal與cross-company scope drift；各案均 exit 2 並保留 quarantine evidence。 |
| QA-087-182 | 在PostgreSQL mirror／disposable provider執行0／1／3檔conversion、repair與re-run，檢視receipts。 | receipt逐work保存可重算的複合tuple／source fingerprint／before-after，不接受只看table count、通用single-key receipt或`ON CONFLICT DO NOTHING`。SQLite/PostgreSQL ordered set與manifest schema同構。 | PASS；disposable PostgreSQL 18 mirror 0／1／3-file、4 composite receipts、source fingerprint stable、target hash stable與target-drift fail-closed，`output/qa/dev-092-postgres/DEV092-postgres-2026-08-24T04-09-44-264Z/manifest.json`。正式 production仍為 Release Gate。 |
| QA-087-183 | 對合法零檔、完整3檔與migrated mismatch work呼叫work service/API，並核對DB。 | 完整work只回work-owned exact files；合法零檔回正常empty；mismatch回stable anomaly code與safe message，不回空成功、不讀revision fallback、不洩漏internal source／SQL。 | PASS；`qc:dev-092:runtime-invariant` 2 checks，A0006 read exact 3、刪除一筆後 stable `DRAWING_WORK_FILE_SNAPSHOT_INVALID`／409 |
| QA-087-184 | 建立相同drawing但不同`candidate_revision`／`drawing_revision` context或不同source set的recognition sessions，再開current work。 | 只有`drawing_revision + current revision id + exact sorted source asset set`全等才可載入；同圖號或revision文字相同不足以重用。修復後current 3 assets可建立／載入正確session，跨context lineage不自動合併。 | PASS；`qc:dev-092:recognition-context` 6 checks，exact revision context與3 assets source set；candidate context未被重用 |
| QA-087-185 | 在fresh authenticated browser hard reload A0006 current workspace，查UI、work API、canonical file read、recognition request與DB；另開合法零檔及故意mismatch fixture。 | A0006 work API與UI顯示exact 3 files，2D／3D preview/download content type與hash正確，recognition source count=3，不再顯示假「尚無可辨識的檔案」；合法零檔維持empty，mismatch只顯示一項可行動錯誤。console、visible error、unexpected 4xx/5xx=0。 | PASS；isolated fresh-auth Playwright 17/17，A0006 revision files=3、PDF preview 200/application/pdf、recognition GET/POST、POST body exact revision context + 3 source assets、DB session exact context，`output/qa/dev-092-browser/DEV092-browser-2026-08-24T04-20-51-832Z/manifest.json`。 |
| QA-087-186 | 在已PASS fixture刪除任一`drawing_revision_work_files` binding，再跑migration、zero-loss、DEV-087 aggregate與`qc:dev-task-completion-audit`；恢復後以fresh run重跑。 | 四個gate在注入後都必須FAIL並指出同一work/file-set mismatch，completion不得標PASS；恢復後才可PASS。manifest綁exact commit/schema/provider/source fingerprint，保留首敗與第二次PASS，不允許測試自動修正fixture。 | PASS（targeted）；negative missing-file exit 2／`work_file_snapshot_incomplete`、repair後re-run 0 mutation，`qc:dev-087:zero-loss` 29/29，manifest `output/qa/dev-087-zero-loss/DEV087-zero-loss-2026-08-24T02-55-14-796Z/manifest.json` |

### 23.3 通過與結案條件

1. 最終結案要求`QA-087-179..186 = 8/8 PASS`、Blocked=0、Not Run=0、P0/P1=0；2026-08-24 closure evidence 已滿足，DEV-087 可恢復 local PASS；production zero-loss rehearsal、cutover與release 仍獨立 gated。
2. 全量active migrated Drawing works的exact tuple equality與hash reconciliation=100%，unresolved／ambiguous／orphan／extra／partial=0；A0006固定為3=3。
3. 本機主SQLite若要apply，必須先保存唯讀inventory與dry-run，人工核對exact target後才執行；QA計畫本身不授權資料修改。physical bytes與source revision rows不得改變。
4. 瀏覽器證據必須來自current work URL與fresh reload，且UI／API／DB／file bytes／recognition context五方一致；截圖、HTTP 200或附件檔名單獨都不是PASS。
5. QC已用獨立oracle重算tuple集合並親自執行negative injection；不得直接採信RD aggregate或2026-08-23歷史PASS。DEV-092 implementation amendment與QA-087-181／182／185 closure evidence 均已補入本節與對應manifest。

## 23. Part 附件 UI 入口回歸與 CAPA（2026-08-24）

Spec Impact：`Compatible restoration`。本案恢復 DEV-087 已明定的 Part 附件獨立即時管理 UI，不新增 schema／migration／permission code／附件 authority，也不提前實作 DEV-088 的替代料號 attachment binding／snapshot／lease。

### 23.1 根因

依第一性原理，既有附件能力「可用」至少要同時具備 `authority + 可發現入口 + 可寫入表面 + 結果回饋 + 可回復操作`。修復前只有 API／storage authority 與 drawer read projection，故不能因後端存在就判定功能可用。

| 層級 | 根因 |
|---|---|
| 直接層 | canonical Part drawer 取代舊畫面時只保留附件讀取清單，未掛回 mutation entry；`files.length=0` 時又把整個附件區隱藏。 |
| 流程層 | DEV-087 completion/QC 驗證了 attachment live-list 語意與 API authority，卻沒有把「具權限者可從正式產品 UI 進入上傳」設為不可省略的 release assertion。 |
| 治理層 | UI-only scope 依連續編號把 `P11–P17` 整段移到 DEV-088，忽略 `P11–P13` 是 DEV-087 immediate attachment，`P14–P17` 才是 DEV-088 replacement attachment。 |

### 23.2 CA／PA 與責任追溯

| 類型 | 措施 | Owner | 驗證 |
|---|---|---|---|
| CA | Part drawer 的附件區永遠顯示；有 `numbering.attachments.manage` 時顯示「管理附件」，進入 `/parts/{partNumber}/attachments?returnTo=...`。 | RD | `QA-087-036A` 空／非空附件皆有 section；權限入口正確 |
| CA | 獨立管理頁移除人工分類欄位，提供多檔選取與逐檔進度，沿用既有 POST API；未帶分類時沿用 server fallback。 | RD | `QA-087-036B` 真實 UI 上傳 201，檔案 readback 一致 |
| CA | 目前附件提供 canonical protected download、soft-delete 與 deleted-data restore。 | RD | `QA-087-036C` download href、DELETE、restore 與 active/deleted list 一致 |
| CA | owner 料號編輯頁連到同一管理頁；有未儲存欄位時先警示。reviewer 只看 live list 與固定排除提示。 | RD+QA | `QA-087-036D/E` owner/reviewer 權限與 snapshot 邊界 |
| PA | scope 固定拆成 `P11–P13 = DEV-087`、`P14–P17 = DEV-088`；禁止按 case range 整段移列。 | PM+QA | UI-only 計畫 §0 與 fresh-session 文件檢查 |
| PA | completion audit 對任何 preserved mutation authority 加入「discoverable writable surface」斷言；空清單不得移除主要入口。 | PM+QC | focused browser + source contract + multi-viewport UI QC |

### 23.3 UI/UX acceptance 與 evidence

固定主入口：`左側料號工作台 → 點選料號 → 右側明細「附件」→ 管理附件`。不在每列放 upload icon、不新增全域 sidebar 附件模組、不使用巢狀 modal/drawer。獨立頁直接提供完整寬度 dropzone，不顯示人工分類欄位；上傳按鈕放在上傳卡片內，避免固定 footer 遮住 deleted-data 區。

聚焦 runner：`npm run qc:dev-087:part-attachments`。最終 evidence `output/qa/dev-087/DEV087-PART-ATTACHMENTS-2026-08-24T02-16-49-777Z/manifest.json` 為 `27/27 PASS`，涵蓋入口、權限、無分類控制項、多檔、upload、download、delete、restore、returnTo、owner editor secondary-entry source contract、desktop/tablet/mobile overflow、console/network 與 runtime cleanup。分類移除後分母同步減少一項；先前 `28/28` evidence 仍原樣保留作為歷史實作證據。首次等待條件失敗 evidence `DEV087-PART-ATTACHMENTS-2026-08-24T01-52-27-952Z`、`DEV087-PART-ATTACHMENTS-2026-08-24T01-53-12-979Z` 原樣保留；其根因是測試在資料載入完成前檢查表單，修正等待條件後重跑 PASS，未放寬產品斷言。

CAPA effectiveness：`PASS`。同一 fresh disposable fixture 已由 rendered UI 完成「drawer 入口 → 上傳 → 受控下載 → 軟刪除 → 還原 → 返回原 drawer」，且手機畫面沒有固定 action dock 遮蔽內容。Production migration／deploy／release 仍維持 DEV-087 原 gate，未因本案自動執行。

## 24. DEV-094 SQLite Migration Integrity CAPA Closure（2026-08-24）

### 24.1 Reopening cause

DEV-092 focused closure後，主SQLite唯讀inventory另確認正式`part_roots`／`part_numbers`為0，兩張company-scope migration table各保留3筆候選，global FK violations=15。A0002／A0005因此出現「清單state存在、detail root不存在」；舊DEV-087 browser在source assertion前seed A0002並清orphan links，不能作目前資料完整性證據。

### 24.2 Added gates and result

新增DEV-094 `QA-094-001..012`作為DEV-087 completion amendment，固定驗證主DB exact recovery/no-op、failure rollback、candidate fail-close、2／5／11 process初始化、live/stale lock、isolated build main invariant、orphan detail局部降級、affected rendered UI及pre-seed source guard。執行結果PASS=12、FAIL=0、Blocked=0、Not Run=0、P0/P1 open=0。

Fresh aggregate `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json`為16/16 PASS，包含DEV-094 focused/browser、DEV-087 contract/repository/commands/migration/browser、DEV-092 gates、zero-loss、retirement、file-read retirement、typecheck與isolated build。affected browser `output/qa/dev-087/DEV087-2026-08-24T05-55-12-088Z/manifest.json`為91/91 PASS，且`sourceInvariantCheckedBeforeMutation=true`、runtime dist removed=true。

Current QA disposition=`Local QA-QC Restored / CAPA Effective`。主DB recovery manifests與獨立QC見`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`；production仍未連線、遷移、部署或release。
