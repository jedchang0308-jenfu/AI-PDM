# QA-DEV-084：替代料號附件沿用、獨立版本與整料號鎖驗證計畫

Status: `Dormant Historical QA Plan / Superseded by DEV-088 Planning / Not Executable`
Date: 2026-08-20
Owner: QA
Historical DEV: `DEV-084` / `DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-001`; successor: `DEV-088` / `DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-002`
Authority: `.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-001-replacement-snapshot-and-part-lock.md`
ADR: `.ai-doc/decisions/ADR-PDM-PART-ATTACHMENT-REUSE-001-snapshot-reference-and-whole-part-lock.md`

> 2026-08-22 Execution Supersession：DEV-084已成為歷史ID，後續由DEV-088在DEV-087本機RD／QA／QC完成後重新縮編。本QA-084-01～40只保留為歷史風險與案例庫，不是DEV-087前置、不得建立runner或執行migration／fixture／browser gate。DEV-088新scope核准後只能挑選仍適用案例並重建當期QA計畫；未被新契約採用的舊case不得阻塞交付。

## 1. QA Objective

證明替代料號附件選擇在source stale、內容去重、版本獨立、權限放寬與whole-owner lease下仍維持same-company隔離、atomic business result與Drawing authority不變。QA不能只驗證畫面；schema/backfill、storage identity、API、transaction、controlled writer、audit與真實browser journey都要有獨立證據。

本計畫不授權production migration、feature enable、deploy、release或physical content deletion。PostgreSQL只可使用已核准的disposable shadow target，且須先通過`db/postgres/README.md`的identity/schema guard。

## 2. Risk Model

| Risk | Severity | Required evidence |
|---|---:|---|
| 新料號附件操作改壞來源舊料號或其他共用owner | P0 | source/target/third-owner row＋bytes readback before/after。 |
| Cross-company hash、料號、attachment或holder資訊洩漏 | P0 | same code/hash fixture跨兩company的404/403與response-body negative assertion。 |
| 同時兩位編輯者或stale token覆寫 | P0 | SQLite與PostgreSQL double-acquire、field-vs-attachment、expiry/fencing concurrency。 |
| Replacement source stale仍建立部分draft／binding | P0 | forced race＋transaction rollback＋idempotent retry。 |
| Backfill遺失legacy ID、deleted state、download或Drawing資料 | P0 | migration counts/checksum、legacy URLs、Drawing zero-diff。 |
| Permission放寬誤延伸到料號欄位、Drawing/BOM/release | P0 | actor matrix：attachment allow、field/lifecycle existing deny。 |
| Storage compensation刪除已共用bytes | P0 | deterministic create-if-absent disposition、failed commit後shared download readback。 |
| UI增加件數摘要、badge、重複容器或drawer write | P1 | rendered three-viewport＋text/container negative assertions。 |

## 3. Test Environments And Fixtures

### 3.1 Providers

- SQLite：每個runner使用獨立temporary database與獨立storage repository；禁止使用共享`data/ai-pdm.sqlite`做mutation evidence。
- PostgreSQL：approved disposable Cloud SQL-compatible shadow；`db:postgres:guard -- --phase pre-migration`先PASS，migration後另做schema compare。Supabase明確禁止。
- Browser：由task-owned temporary runtime啟動，記錄project/purpose/port/process tree/cleanup condition；結束後只停止該process tree並證明port釋放。

### 3.2 Deterministic Fixture

- Company A：creator、visible peer、same-user second browser context、field-denied but part-visible actor、manager/admin；source old part、released/obsolete formal parts、replacement draft。
- Company B：與Company A相同part number、檔名與SHA-256內容，另有不同holder display name。
- Source attachments：active unique content A、active unique content B、same filename/different content、same content/different metadata、deleted attachment、legacy no-hash attachment、Drawing/Revision file各一。
- Content states：verified、legacy_unverified、missing、hash_mismatch；每個storage object記錄pre/post SHA-256與byte count。
- Concurrency使用兩個獨立DB clients與兩個browser contexts，不得以同一transaction client模擬。

## 4. Required Case Matrix

### A. Schema／Migration／Compatibility

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-01 | Fresh SQLite schema | 5個tables、FK/check/partial unique/composite deferred FK及indexes存在；foreign key check=0。 |
| QA-084-02 | PostgreSQL 041 apply/idempotency | 041可套用且重跑不產生重複row/index；schema compare無未解釋差異。 |
| QA-084-03 | Legacy active/deleted backfill | 每個part `file_assets`形成binding/version；binding ID等於legacy asset ID；active/deleted state與metadata一致。 |
| QA-084-04 | Legacy duplicate／no-hash | dry-run不寫資料；apply透過storage readback補hash/size後same-company duplicate共用content；無法驗證者留exception且flag不可enable，無猜測cross-company dedupe。 |
| QA-084-05 | Drawing zero-change | Drawing file_assets counts、IDs、owner、hash、download與`MasterAttachmentPanel` contract均不變。 |
| QA-084-06 | Migration exception fail-closed | orphan company owner、missing pointer或hash/size矛盾產生exception manifest且feature不可enable。 |

### B. Canonical Content／Version／Lifecycle

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-07 | Deterministic content ingest | same company/hash/size只一content與一physical key；create/reuse disposition正確且existing object必驗hash。 |
| QA-084-08 | Same hash cross-company | 兩company identity分離；任何response不提示另一company已有相同內容。 |
| QA-084-09 | Metadata edit | insert version N+1、bytes/content不變、other owner/current old version不變、expectedVersion stale=409。 |
| QA-084-10 | Content replace | insert新content/version，只切target binding；source與third owner bytes仍可下載且hash不變。 |
| QA-084-11 | Delete without confirmation | UI無confirm dialog；binding立即deleted、content/versions/other owners不變、audit actor/time/object完整。 |
| QA-084-12 | Exact restore | 恢復delete時current content＋metadata；不新增版本、不需approval；duplicate active content不形成第二relation。 |
| QA-084-13 | Integrity fail | missing/hash_mismatch download/restore/replace fail closed，不改指向近似或同檔名版本。 |

### C. Replacement Snapshot／Formalization

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-14 | Prepare candidate boundary | 所有且只有source active direct part bindings；deleted、Drawing、Revision為0；source token可重算。 |
| QA-084-15 | Quiet default selection | rendered list全部預設勾選；可取消任一／全部與新增；無沿用/排除/新增count、source badge、風險卡或第二submit。 |
| QA-084-16 | Source stale variants | add/delete/metadata edit/content replace任一發生於prepare後，commit均409且draft/binding/origin/audit business event為0。 |
| QA-084-17 | Preserve/reconfirm | stale後未變動selection與browser File objects仍在；reload candidates後由使用者重新確認，不自動提交。 |
| QA-084-18 | Duplicate precedence | new upload優先於inherited；同層ordinal最小；target一binding，所有selected source origins與merged audit皆在。 |
| QA-084-19 | Idempotency/response loss | same key/same fingerprint回同draft/bindings；same key/different payload=409；無第二reserved number。 |
| QA-084-20 | Partial failure | content ingest或DB fault injection不留下可見draft/binding；已verified unbound content可於重試reuse且不被錯刪。 |
| QA-084-21 | Snapshot independence | commit後修改source不改draft；formalization不重讀source，binding/version/origin IDs不變，只promotion owner。 |
| QA-084-22 | Release atomicity | malformed/integrity-failed draft binding使replacement release完整rollback；不得出現formal part已發行但附件未promotion。 |

### D. Permission／Visibility

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-23 | Visible same-company attachment matrix | creator/peer/field-denied actor均可add/edit/replace/delete/restore，且沒有`numbering.attachments.manage`或attachment approval阻擋。 |
| QA-084-24 | Existing authority preserved | field-denied actor仍不能改variant/draft field/release/obsolete/Drawing/BOM；lease不授權。 |
| QA-084-25 | Anonymous/cross-company | anonymous 401；cross-company 404/403 fail closed；不洩漏attachment、hash、holder或duplicate資訊。 |
| QA-084-26 | Lifecycle independence | Released/Obsolete formal part attachments結果相同；Drawing controlled file mutation仍依原authority拒絕。 |

### E. Whole-owner Lease／Concurrency

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-27 | Atomic acquire | 兩clients同時acquire只有一個成功；DB一owner一row，loser拿holder display但無token。 |
| QA-084-28 | Same user/tabs | 第二tab無有效token仍409；同tab session token可renew；token不在URL/log/localStorage/audit。 |
| QA-084-29 | TTL/heartbeat/inactivity | TTL=5m、renew=60s、idle=15m；save/complete/cancel release；best-effort close失敗仍在expiry後可acquire。 |
| QA-084-30 | Fencing | old token於expiry及new acquisition後對variant/add/edit/replace/delete/restore全為409且zero write。 |
| QA-084-31 | Cross-surface exclusion | User A field edit時User B attachment write被拒；反向亦同；B仍可list/download。 |
| QA-084-32 | Controlled writer guard | release/obsolete/restore/status projection在active human lease時conflict；lease釋放後依原permission/lifecycle成功。 |
| QA-084-33 | Deadlock/order/retry | multi-part controlled command按stable ID排序；PostgreSQL故意競態不出現雙成功，40001/40P01最多3次後有明確結果。 |
| QA-084-34 | Writer inventory | 所有part/draft/variant/attachment SQL writers均分類；unclassified count=0；legacy sync runtime consumer有guard或證明不可達。 |

### F. API／Audit／Rendered UX

| ID | Case | Pass criteria |
|---|---|---|
| QA-084-35 | API compatibility | existing list/download/preview/Drive/restore URLs可用；binding ID adapter保留legacy IDs；stable error/status符合SPEC。 |
| QA-084-36 | Audit reconstruction | replacement selected/excluded/new、origins、add/edit/replace/delete/restore、lease acquire/renew/release/expired/stale writer可還原actor/time/company/owner/version/idempotency。 |
| QA-084-37 | Formal workspace | `intent=edit/manage_files`由workspace一次acquire；drawer/search不acquire且無write；save/finish/cancel統一release。 |
| QA-084-38 | Quiet visual contract | 1440×900、1024×768、390×844無水平overflow、雙scroll、card-in-card、件數summary、來源badge、raw error/token/hash。 |
| QA-084-39 | Keyboard/focus | checkbox、add、row actions、history/restore全鍵盤可用；stale/lock/error recovery後focus回受影響control。 |
| QA-084-40 | Drawing/regression | Drawing attachment、DEV-061 file ownership、change-control、lifecycle、entity drawer與review lock regressions無DEV-084未歸因P0/P1。 |

## 5. Exact Runners／Commands

| Command | Coverage |
|---|---|
| `npm run qc:dev-084:contract` | Authority、route/file markers、quiet UI negative markers、Drawing non-consumers。 |
| `npm run pdm:dev-084:legacy-backfill:dry-run` | Legacy pointer/hash/owner盤點，只輸出manifest、零DB/storage mutation。 |
| `npm run pdm:dev-084:legacy-backfill:apply -- --apply --confirm-dev-084-legacy-part-attachment-backfill` | 只限disposable local fixture或另行授權migration window；補算hash並idempotent backfill。 |
| `npm run qc:dev-084:schema` | QA-084-01～06；fresh/backfill/idempotency及optional approved PostgreSQL lane。 |
| `npm run qc:dev-084:inventory` | QA-084-34；part-write consumer ledger。 |
| `npm run qc:dev-084:content-version` | QA-084-07～13。 |
| `npm run qc:dev-084:replacement` | QA-084-14～22。 |
| `npm run qc:dev-084:concurrency` | QA-084-27～33；SQLite必跑，final evidence另要求PostgreSQL。 |
| `npm run qc:dev-084:http` | QA-084-23～26、35、36與stable errors。 |
| `npm run qc:dev-084:browser` | QA-084-15、17、28、29、31、37～39；三viewport及兩browser contexts。 |
| `npm run qc:dev-084:focused` | 上述八項＋`typecheck:app`。 |
| `npm run qc:dev-084` | Focused＋既有regressions＋`build:isolated`，由aggregate輸出所有child disposition。 |

Required regression children：`qc:master-attachments`、`qc:dev-061:file-ownership`、`qc:dev-061:ui`、`qc:pdm-change-control`、`qc:pdm-lifecycle-actions`、`qc:pdm-entity-detail-drawer`、`qc:dev-067:lock`、`typecheck:app`、affected lint及`build:isolated`。不得刪除既有assertion、改expected或把parent baseline failure重標為PASS。

## 6. Evidence Contract

每次run寫入`output/qa/dev-084-part-attachment-reuse/{runId}/manifest.json`：

- branch、HEAD、dirty paths及DEV-084 touched-path ledger；
- OS/runtime、DB provider、database identity、feature flag、storage root/bucket；
- case ID、command、start/end、PASS/FAIL/BLOCKED、fixture IDs與failure attribution；
- before/after row counts、foreign key check、hash/size/readback、audit IDs、lease fencing values（不可含raw token）；
- browser viewport、screenshots、console/page/request failures與accessibility/focus assertions；
- temporary runtime owner/process tree/port及cleanup／port released evidence；
- every regression child status與baseline disposition。

Evidence不得包含raw lease token、credential、signed URL、private storage path內容或另一company的敏感資料。Hash只存在machine-readable integrity evidence，不顯示在產品畫面截圖。

## 7. Entry／Exit／Stop Conditions

Entry：目前關閉。只有DEV-088在DEV-087本機RD／QA／QC完成後重新縮編、文件重新達到相應成熟度且RD已交付新scope實作，QA才能重新定義entry；不得以歷史Phase 1A schema/feature flag作為自動啟動條件。

Exit：未定義。QA-084-01～40不得直接作為未來必跑清單；新scope核准時重建與風險相稱的exit criteria。

立即停止並回Dev PM：

- 需要改寫或刪除legacy`file_assets`、Drawing/Revision rows或physical shared content；
- 任一cross-company existence leak、雙active editor、stale writer成功、source stale partial draft或formalization partial release；
- 只能靠UI disabled而server route可旁路lease；
- migration不能保留legacy attachment ID/deleted state/download，或PostgreSQL與SQLite語意不一致；
- lifecycle/system writer必須繞過active human lease才可運作；
- 需要縮小使用者已確認的「所有生命週期可維護」或重新加入attachment-specific permission/approval/confirmation。
