# DEV-087 三工作臺狀態資料重建驗證計畫

Status: `QA Plan Strengthened / Local Focused QA-QC PASS / Independent Full QA & Production Migration Pending / Stability & Efficiency First`
Date: 2026-08-21; amended 2026-08-22
Owner: QA
Related DEV: `DEV-087`
Authority:

- `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`
- `.ai-doc/decisions/ADR-PDM-STATUS-DATA-REBUILD-001-single-current-state-authority.md`

## 1. 目的與完成門檻

驗證 DEV-087 不是只換 UI 文案，而是真的把三工作臺 current state 收斂成單一 read/write authority，並安全支援 Drawing 多 RD branch、Part/Relation single work、review/formalization/cancel retention 與 destructive legacy retirement。

完成門檻：

- P0/P1 defect=0。
- inventory unknown=0、migration unresolved=0、舊 current-state active read/write=0。
- `transition_mode=canonical_only`、`npm run qc:dev-087:retirement` PASS、retirement manifest complete；任一缺漏即`Retirement Pending`。
- SQLite 與 PostgreSQL 結果一致。
- 所有 concurrency/failure/rollback gate PASS。
- 四 viewport browser、a11y、banned text、exact artifact no-fallback PASS。
- production cutover 仍需獨立 deployment/release gate；local PASS 不構成正式資料操作授權。
- 每個case都有可重現的precondition／steps／expected／actual／provider／artifact／commit，不接受只有綠燈總數的證據。
- `QA-087-001..165`逐案有結果；`BLOCKED／NOT RUN／SKIPPED／FLAKY`一律不算PASS，重跑不得覆蓋首次失敗。
- P0 stability invariant保留最小negative-control，確認測試會在錯誤結果出現時失敗；本期不建立重型mutation或反作弊體系。
- UI流程除功能斷言外，visible error、console error、failed response與資料合理性皆為hard gate；HTTP 200、頁面可開或有截圖不等於PASS。
- active review結束後，必須跨request、receipt、outbox、audit/log、error payload與backup驗證最小留存，不能只查`pdm_review_traces`一張表。
- `SCALE-10K`的API／browser latency、concurrent read/write、60分鐘soak、connection/worker backpressure與migration resource budget全數PASS；不得只用statement count宣稱效率合格。

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
- 本快照只代表本機RD自驗與focused QA/QC，不代表`QA-087-001..165`逐案全部執行，也不取代獨立QA、PostgreSQL、SCALE-10K、60分鐘soak、RTO、production rehearsal與release gate。
- 詳細實作與差距：`.ai-doc/qc/qc-dev-087-local-implementation-2026-08-22.md`。

## 2. 測試環境與資料安全

1. 優先使用 disposable SQLite 與 isolated PostgreSQL；不得連 production。
2. destructive migration、legacy canceled deletion與 DROP 只可在 disposable clone／restore rehearsal 執行，直到使用者另行授權 production gate。
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

| ID | 驗證 |
|---|---|
| QA-087-001 | canonical state enum、nullable/check constraint符合SPEC，非法domain/layer/branch/revision組合被DB拒絕 |
| QA-087-002 | 每drawing只有一列production；同branch只有一列RD current |
| QA-087-003 | 同drawing最多3個open RD branches；第四個新branch由DB/server共同原子拒絕且無orphan claim/work/state |
| QA-087-004 | Part/Relation各只有一列formal與一列work；第二work由constraint阻擋 |
| QA-087-005 | `company+drawing+target_major+target_minor`跨branch全域唯一claim；production minor固定0、RD minor>=1且NOT NULL，NULL/前導零/浮點/非canonical label不能穿透唯一鍵 |
| QA-087-006 | branch_id不可變；revision exact predecessor FK/reference可驗證，不依revision字串 |
| QA-087-007 | minimal review trace沒有reviewer/outcome/comment/revision/content欄位；immutable guard有效 |
| QA-087-008 | Part/Relation approved snapshot完整保存before/after，且不被current state更新覆寫 |

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
| QA-087-021 | Relation drift拒絕approve command但review維持pending，不自動return/merge |

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

| ID | 驗證 |
|---|---|
| QA-087-033 | Part正式值在核准前持續供生產；修改中不污染正式 |
| QA-087-034 | P-FIRST只有修改中一列，沒有版本、歷史或假正式列 |
| QA-087-035 | Part cancel/return/failure不改正式；approve原子更新且保存before/after |
| QA-087-036 | Part attachment依DEV-087直接契約及現行附件authority即時變更，work cancel不rollback；reviewer看到live list與範圍提示，但附件不納入snapshot/active-review lock；Drawing file與Relation tree仍受鎖定；測試不得要求DEV-088 future tables、feature flag或whole-part lease |
| QA-087-037 | Relation正式樹在核准前持續有效；調整中不污染正式 |
| QA-087-038 | R-FIRST只有調整中一列，沒有root版本/歷史/共同檔案 |
| QA-087-039 | Relation submit confirmation列出exact removal nodes；approve保存before/after |
| QA-087-040 | Part/Relation第二create併發導向既有work，不產生duplicate work row |
| QA-087-066 | 首次Part／Relation work取消後row移除，編號回收結果完全符合既有numbering authority且DEV-087不另改規則 |

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
| QA-087-057 | legacy canceled data含old review全部從target刪除且manifest可對帳，不轉minimal trace |
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
| Phase 1C UI/browser | 1B PASS | `npm run qc:dev-087:browser`、`npm run qc:dev-087:visible-error`、`npm run qc:dev-087:a11y` | 四viewport＋200% zoom、data sanity、role/action/review、focus/a11y/banned text、visible/console/network error=0 |
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
- banned-text/a11y/overflow/visible alert/error overlay/console/unhandled rejection/network/4xx/5xx與unexpected empty/zero-data sweep。
- review retention surface inventory及pending/applying/apply_failed/terminal/backup-restore各時間點的allowlist scan；evidence本身也必須脫敏。
- normal role/company permission、role-change、double-click/idempotency與linearizability timeline；不含紅隊IDOR／CSRF／DoS／timing攻防。
- `SCALE-10K` statement count、EXPLAIN/index plan與payload/DOM row-bound evidence。
- baseline與candidate p50/p95/p99、60分鐘load/soak、memory/connection/queue回復、backpressure及migration rows/sec/peak resource/RTO evidence。
- DB/schema/binding backup/restore/drop/rollback rehearsal receipt，以及physical-byte不可復原邊界／GC receipt。
- cleanup receipt，證明temporary runtime與disposable database已移除。
- `.ai-doc/qa/dev-087-old-authority-inventory.schema.json`、`.ai-doc/qa/dev-087-old-authority-inventory.json`、`output/qa/dev-087-retirement/<run-id>/manifest.json`與`.ai-doc/qc/qc-dev-087-retirement-<date>.md`的exact path/hash chain。

## 17. Release Gate

即使 QA-087-001..165 全數本機／隔離 PASS，仍不得自動執行 production migration。正式切換另須：

1. 使用者明確授權高風險資料遷移與 release。
2. deployment/release gate確認環境、DB備份目的地、maintenance window最大時長/RTO、old runtime/worker drain、owner與relational rollback責任；不得宣稱已刪physical bytes可restore。
3. production read-only inventory/reconciliation預檢 PASS。
4. 即時stop condition、same-window drop allowlist、90-day DB backup receipt及canonical-only後irreversible physical-GC allowlist就緒。
5. cutover完成後authority control=`canonical_only`且綁定exact commit/schema/provider、production `npm run qc:dev-087:retirement` PASS、fixed-path summary/manifest complete；否則在流量開放前rollback至`legacy_only`並維持`Retirement Pending`，不得release或結案。
