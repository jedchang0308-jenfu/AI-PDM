# DEV-079／DEV-101 智慧辨識料號歸屬與審核快照一致性 CAPA

Status：`Corrective Actions Implemented / Local Effectiveness Verified / Primary Reconciliation Verified / Production Effectiveness Pending / Release Integration Gated`

Date：2026-08-27

DEV：`DEV-079`、`DEV-101`（重開／修訂既有 DEV，不新增平行 DEV）

Severity：`P1 / decision-basis integrity and editor-review parity / no confirmed incorrect formalization or data loss`

## 0. CAPA 判定

這不是「畫面多顯示一個紅色警告」的單點 UI defect，而是同一辨識事實在不同 adapter、候選生命週期、編輯工作臺與審核快照之間沒有共用一個可強制的不變量。先前 DEV-079 對 A0044 的 focused owner-resolution 證據只能支持「特定 non-terminal session 經讀取後可收斂」，不能證明已接受的歷史候選、A0002-M01 既有審核案或正式環境不再復發。

本 CAPA 的根本目標固定為：

> 同一 Drawing work 的非空 Part-domain 辨識值，只有在唯一且有效的 Part owner 已解析時才能進入 accepted／formal intent；送審後，審核者必須讀取與編輯者送審當下完全相同、可驗 hash 的 immutable recognition projection。

CAPA 文件是 PM／品質追溯證據，不是產品完成、QA PASS、QC PASS 或 production release 證據。

## 1. 已確認事實與證據

1. A0002-M01 與 active Part `A0002-P01` 的 Drawing relation 存在且正確；症狀不是「沒有關聯料號」。
2. recognition session `recognition-b54eb913-6a09-431f-aa07-623af6d4a897` 中，CAD native metadata 產生的品名／材質／表面處理／熱處理候選已正確帶入 `part_number` owner `part-number-593efe73-6225-42a7-9507-c63602b73169`。
3. 同一 session 的 browser PDF OCR adapter 於 `2026-08-25T08:54:02.381Z` 另產生同類候選；其 `proposed_owner_type=part_number`，但 `proposed_owner_id=NULL`，且 scope 為 overall。
4. 舊批次儲存於 `2026-08-25T09:16:34.164Z` 接受了 ownerless 的材質／表面處理／熱處理候選。這證明錯誤狀態曾穿過 write boundary，不只是 projection 顯示問題。
5. review request `234ebcc8-9ed4-4b78-a004-42212729d76b` 於 `2026-08-25T09:18:35` 建立；其 `snapshot_payload` 是 legacy v1 narrow payload，沒有 recognition candidate／decision projection。Primary reconciliation後，該request於2026-08-27 15:32經正常業務流程terminalize並留下terminal receipt／review trace；reconciliation未修改其snapshot/hash。
6. 編輯工作臺會依目前 coalesced group 計算警告；審核工作臺在 legacy compatibility path 仍可能讀取 live／latest recognition state，因此兩個畫面可對同一案件得到不同的「需指定料號」結論。
7. 現行 projection self-heal 只修復 `proposed／conflict／blocked`，不修復已為 `accepted` 的 ownerless 歷史列；重複 GET 因此不能使 A0002 這類資料自然收斂。
8. 現行 backend 已對新的 ownerless `accept／correct／map／create` 正式意圖回 422；這能阻止部分新錯誤，但不能證明既有 accepted rows、舊 request 或其他 ingestion adapter 已安全。
9. DEV-079 既有 A0044 focused evidence 覆蓋唯一 owner、non-terminal self-heal、SQLite／PostgreSQL concurrency 與欄位提示，但未覆蓋「accepted legacy row + editor submit + immutable review read」完整因果鏈。
10. CAPA確認時，DEV-101 active SPEC已要求submitted snapshot保存完整recognized read model，但當時`src/lib/pdm-review-package.ts`只保存`sessionId／status／conflictCount／capturedAt`等recognition meta。現行local correction已改為exact versioned full projection與inner hash，且固定QA 48案與Independent QC已驗證；既有v1仍未被回寫。
11. deployment 設定已有 `PDM_DRAWING_RECOGNITION_V1=true` 的 release readback，但目前沒有證據證明正式 runtime 已實際啟用 `PDM_REVIEW_PACKAGE_V2_WRITE=true`；QC script 內設定不能代替部署環境 readback。

### 尚未確認，禁止推定

- staging／production 是否存在其他 ownerless accepted Part candidates、terminal sessions 或已 formalized 影響。
- 是否已有審核者依不一致的 live projection 做出正式決策。
- production v2 writer 的實際 runtime 值與以正常使用者流程建立的新 request 比例。

以上未知項必須先做 read-only inventory；沒有證據不得寫成「0」或「未受影響」。

## 2. 影響與問題分類

- 直接使用者影響：編輯時看似可儲存，審核時卻顯示「需指定料號」，造成同一案件前後矛盾、退件與人工查核成本。
- 資料品質影響：`accepted + nonempty Part-domain value + owner=NULL` 是不應存在的非法狀態；它會污染 group coalescing、正式化判定與審核說明。
- 決策完整性影響：legacy review 讀 live/latest state，而非送審時的 exact projection，審核依據可能隨後續辨識或修復而漂移。
- 發版影響：局部 UI PASS 或單一 A0044 readback 不能支持「正式部署後不復發」。production activation 必須新增 inventory、migration/reconciliation、immutable snapshot 與 runtime flag gates。
- 分類：`systemic invariant gap + cross-adapter normalization gap + immutable evidence gap + verification completeness gap`；不是使用者操作錯誤，也不是單一 A0002 資料特例。

## 3. 立即圍堵措施

1. DEV-079 原「Production Recurrence Gate Wired」完成宣告撤回為 supporting evidence；DEV-079 重開 owner invariant corrective slice。
2. DEV-101保持CAPA trace；full recognition snapshot、正常submit→review parity、既有inbox correction與固定QA 48案independent completion candidate均已完成。DEV-079 resolver／command guard／SQLite與PostgreSQL invariant／explicit reconciliation／GET zero-write也已完成隔離驗證；primary schema guard與21筆exactly-one reconciliation已於2026-08-27依人類授權執行並通過，production effectiveness仍是獨立release gate。
3. 對含 ownerless accepted Part candidate 的 pending review request，先標記為 decision-basis invalid 並停止核准；正常處置優先為退回／重新送審，不得在審核中靜默換掉 snapshot。
4. primary已依2026-08-27人類明確授權完成fingerprint-gated schema guard與21筆reconciliation；staging／production仍只准read-only inventory、backup、fingerprint與dry-run，未另行授權不得apply、改request hash、刪除candidate、重建送審事實或偽造v2 package。
5. A0002-M01既有v1 request的snapshot/hash未被修改；若要繼續流程，仍須採正常「退回修改 → 重新送審」，讓新的immutable v2 package成為審核依據。
6. production deploy／migration／writer activation／traffic 維持 gated；CAPA 文件建立不構成授權。

## 4. 多層次根因分析

### RC-1：Adapter 層沒有共用 owner-resolution contract

- 因果機制：CAD native adapter 能由 exact relation 解析 Part owner，但 browser PDF OCR adapter 只標記 owner type，未產生 owner ID；兩者進入同一 candidate aggregate 後形成「值相同、歸屬不同」的重複候選。
- 證據：同 session 的 native candidates 有 A0002-P01 owner，PDF candidates 的 `proposed_owner_id=NULL`。
- 反事實：若所有 ingestion adapter 在落 candidate 前都呼叫同一 resolver，唯一 A0002-P01 應產生相同 owner key；0 或多個 owner 應 fail closed，而非寫入可接受的 ownerless 候選。
- 可控點：adapter ingestion command boundary 與 canonical candidate key。
- 再發原因：既有修正放在特定 adapter 後處理與 projection read，新增來源或舊來源可繞過。

### RC-2：Accepted state 沒有被 command／database invariant 保護

- 因果機制：舊 batch save 能把非空 Part-domain candidate 從 proposed 推進 accepted，而沒有驗證有效 owner；一旦進入 accepted，現行 self-heal 又刻意跳過。
- 證據：A0002 材質／表面處理／熱處理 ownerless candidates 已在 09:16 被接受；現行 backend 422 是事後新增，歷史非法列仍存在。
- 反事實：若 `accepted ∧ part-domain ∧ nonempty value ⇒ valid owner` 在 command 與 provider-safe DB guard 同時成立，該 transition 不可能 commit。
- 可控點：candidate transition repository、transaction validation、SQLite／PostgreSQL schema guard。
- 再發原因：目前只有應用層局部 422，缺少所有 write path 與資料層的最後防線。

### RC-3：以 GET self-heal 代替一次性資料收斂與寫入不變量

- 因果機制：projection read 會對 non-terminal session 進行資料 mutation，但只覆蓋部分狀態；是否修好取決於有人讀取哪個 session、何時讀取，且 read semantics 與 write semantics 混在一起。
- 證據：A0044 可因 GET 收斂，A0002 accepted rows 不會；同類資料因 lifecycle state 不同產生不同結果。
- 反事實：若歷史資料透過一次性、可審計、冪等 reconciliation 收斂，且所有新資料在 write boundary 被阻擋，正常 GET 應為 zero-write。
- 可控點：migration/reconciliation runner、read repository purity、sunset gate。
- 再發原因：self-heal 被當成永久 prevention，而不是具退出條件的 containment。

### RC-4：UI 從 raw candidate members 重算 domain validity

- 因果機制：不同頁面依各自取得的 candidate set／latest session／group members 判斷「需指定料號」，沒有單一 repository-projected `ownerResolution` truth。
- 證據：編輯與審核對 A0002-M01 呈現不一致；warning 由 group 中任一 ownerless member觸發。
- 反事實：若 UI 只消費 canonical aggregate 的 `effectiveOwnerId／ownerResolution／blockingReason`，兩個 surface 對同一 immutable projection 應同結論。
- 可控點：repository DTO／view model composer；禁止 client 重新推導資料不變量。
- 再發原因：每新增頁面或 adapter 都可能複製一套局部判定。

### RC-5：Review package 沒有凍結完整 recognition decision basis

- 因果機制：legacy v1 沒有 recognition projection；current v2 builder 也只存 meta。reviewer 為補齊畫面而讀 live/latest recognition，導致送審後的修復、重跑或新 session 改變審核內容。
- 證據：A0002 request 是 v1 narrow payload；現行 builder 的 recognition payload 不含 exact candidates、accepted decisions、owner resolution 與 projection hash。
- 反事實：若 submit transaction 保存 versioned full recognition projection 並納入 package hash，reviewer 不需 live fill，也不會因後續資料變動而改變主判斷依據。
- 可控點：DEV-101 package contract、builder、reader、hash verification 與 compatibility policy。
- 再發原因：UI shell 共用完成了，但資料契約只保存摘要，外觀相同卻不是同一時點事實。

### RC-6：驗證分母沒有覆蓋完整使用者與發版因果鏈

- 因果機制：focused tests 各自證明 A0044 owner self-heal或 direct approval detail，卻沒有覆蓋跨 adapter duplicate、accepted legacy、正常 submit、list entry、review snapshot、runtime flag 與 production inventory。
- 證據：DEV-079 focused evidence與 DEV-101 22/22 smoke 均未執行 A0002 類 editor→submit→review parity；direct URL 還繞過 normal inbox。
- 反事實：若 release gate 以相同 fixture 驗證 ingestion→accept→submit→review hash parity，任一 live/latest leak 或 accepted ownerless row 都會使 aggregate FAIL。
- 可控點：QA master matrix、mutation-sensitive tests、release manifest 與 PM completion receipt。
- 再發原因：局部綠燈被誤升格成系統性 recurrence closure。

## 5. 第一性原理目標架構

唯一可長期成立的資料流為：

`immutable observations → centralized owner resolver → canonical candidate aggregate → accepted-state invariant → submitted projection(version + hash) → immutable reviewer read`

責任分界：

- ingestion adapter 只提交 observation，不自行發明 owner 判定規則。
- domain resolver 以 company、exact Drawing work、active relation與 Part lifecycle 求得 `exactly-one／none／ambiguous`。
- candidate repository 保存 canonical owner resolution 與 transition，不允許非法 accepted state。
- submit builder 在同一 transaction 凍結完整 recognition projection、版本與 hash。
- reviewer 以 snapshot 為 decision basis；live data只能作明確標示的 drift comparison，不能回填主畫面。
- UI 呈現 repository truth，不再從 raw members 重算 owner validity。

## 6. Corrective Actions（CA）

### CA-1：A0002 與既有資料的受控 reconciliation

1. 建立 provider-neutral read-only inventory，依 company／session／field／status／owner resolution 分類所有 Part-domain candidates。
2. dry-run 對每筆計算 0／1／>1 個有效 owner；只有 exactly-one 可提出修復計畫。
3. apply 採 append-only audit、冪等 idempotency key、pre/post fingerprint、exact delta、FK check 與 rollback artifact；terminal／formalized 影響另列，不自動改。
4. A0002 既有 v1 request 不改 snapshot/hash。若其 decision basis invalid，走正常退回與重新送審；不得把歷史 v1 偽裝成 v2。
5. primary／staging／production apply 前都要獨立人類授權；0 或 >1 owner 一律 fail closed。

### CA-2：建立單一 owner-resolution domain service

- 所有 CAD native、browser PDF OCR、retry、import與未來 adapter 在 candidate commit 前呼叫相同 resolver。
- resolver 只接受 same-company、same exact Drawing work、有效 relation 與非 `Obsolete／Merged／MainDrawingInvalid` Part。
- 回傳明確 union：`resolved(ownerId, evidence)`、`unresolved(reason)`、`ambiguous(candidateOwnerIds)`；不得以 nullable owner 代表三種狀態。
- canonical candidate key納入 field、normalized value、source scope與resolved owner，避免同義 duplicate 以不同 ownership 進入 aggregate。

### CA-3：在 transition 與資料層強制 accepted-state invariant

- command layer：`accept／correct／map／create／formalize` 在 transaction 內重驗 owner、company、relation與 rowVersion。
- data layer：以 SQLite／PostgreSQL 可驗證的 schema/trigger/guard，禁止非空 Part-domain accepted row 的 owner 為空或無效；具體 DDL 由 DEV-079 SPEC amendment 固定後實作。
- 任何 migration／schema 需求推翻 DEV-079 §32 原 `no schema／no backfill` 假設，必須顯式改規格與走 release gate，不得藏在 read path。

### CA-4：移除永久 GET mutation

- reconciliation 完成且 inventory=0 後，`getProjection` 必須 zero-write；self-heal 僅可在明確 migration window 作 feature-gated containment。
- 設定 sunset 條件、計數器與截止版；退出後保留偵測與 fail-closed，不保留靜默修復。
- 重複 GET 前後 DB fingerprint、audit count與candidate rowVersion必須完全相同。

### CA-5：完成 immutable recognition review package（DEV-101 local RD implemented）

- DEV-101 v2 package新增 versioned recognition projection：exact session/source identities、canonical field aggregates、accepted/corrected values、owner resolution、evidence references、blocking reasons與projection hash。
- package hash涵蓋 recognition projection；reader 驗 hash後直接渲染，不能呼叫 latest session補主資料。
- legacy v1保持明確 compatibility 標記；需要 exact recognition decision basis 的未決 v1 案走退回／重送，不做 silent backfill。
- `PDM_REVIEW_PACKAGE_V2_WRITE` 在 production須由 actual runtime readback與正常 submit產生的新 v2 package證明，script-local env不算。

### CA-6：統一 UI projection（DEV-101 local RD implemented）

- editor／reviewer 共用 repository-projected `ownerResolution／effectiveOwnerId／blockingReason`。
- raw candidate members只供稽核或展開，不得直接決定第一層警告。
- snapshot invalid／unavailable時顯示明確不可審核狀態，不以 live master 靜默補值。

DEV-101 CA-5／CA-6 local receipt：RD aggregate仍只屬supporting evidence；其後Independent aggregate已完成48/48，涵蓋full projection、inner-hash mutant、owner fail-closed、latest-lineage isolation、shared immutable panel、zero live/latest recognition request、SQLite／PostgreSQL canonical parity與concurrent exactly-one effect。DEV-079的單一resolver、accepted-state command／DB invariant、一次性reconciliation與GET zero-write亦已在隔離SQLite及disposable PostgreSQL通過；最終run索引見`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。Primary SQLite已依授權套用schema guard與21筆exactly-one repair，零差異重跑為0筆、最終40筆全為valid；跨環境CAPA仍為`Production Effectiveness Pending`，不得把primary結果外推為production結果。

### 7.1 Independent QA期間發現並關閉的次級缺陷

1. `P0 owner validity`：帶非空`proposed_owner_id`但不屬同公司、同root active Part target時，舊projection可被誤判為resolved。RD改為把受控Part owner targets傳入同一projector，未知ID輸出`ownerResolution=invalid`／`part_owner_invalid`，approve由`WORKBENCH_RECOGNITION_OWNER_UNRESOLVED` fail closed；data與PostgreSQL lane重驗通過。
2. `P1 marker hit target`：risk marker原視覺存在但button幾何為0×0，鍵盤／觸控不可用。RD將16×20互動框保留在button，純視覺形狀移至pseudo-element，文字只留在tooltip／accessible description；五種viewport、focus、AT、forced-color evidence通過。
3. `P1 target determinism`：重點目前active identity會先清空target，再push相同URL，effect不會重新hydrate。RD將active identity重點定義為idempotent no-op，rapid switch、reload、Back／Forward與invalid target案例重驗通過。
4. `P1 risk source`：完整recognition projection的conflict count位於`recognition.session.conflictCount`；marker改以projection type guard讀取，不再誤讀legacy meta欄位。此修正未改snapshot，僅修正immutable DTO的UI投影。

## 7. Preventive Actions（PA）與效用評估

| 選項 | 效益 | 成本／風險 | 決策 |
|---|---|---|---|
| 永久保留 GET self-heal | 可快速修部分舊列 | read/write混合、跳過accepted、結果依流量、難稽核 | 拒絕作根治；只准短期feature-gated containment |
| 只修警告判斷或隱藏ownerless duplicate | 畫面立即一致 | 非法資料仍在，正式化與審核證據仍可能錯 | 拒絕 |
| 只加應用層422 | 阻止已知新command | 其他adapter、migration或direct repository仍可繞過 | 保留但不足 |
| 單一resolver＋command/DB invariant＋一次性reconciliation＋immutable review snapshot | 同時阻止新錯誤、收斂舊錯誤並固定審核依據 | 需SPEC、migration rehearsal、跨provider QA與release gate | 採用；總淨效用最高 |
| 立即全面重構 polymorphic owner schema | 可長期正規化owner模型 | 本CAPA範圍與遷移風險過大 | Future capsule；只有現行provider-safe invariant無法成立時再提ADR |

固定 PA：

1. `Cross-Adapter Owner Contract Gate`：native／PDF／retry／import 對同一 observation 必須得到相同 owner resolution。
2. `Accepted-State Mutation Gate`：0／1／>1 owner、失效 relation、cross-company、terminal、concurrent retry 全覆蓋；移除 command guard或DB guard的 mutant 必須 FAIL。
3. `Editor→Review Projection Parity Gate`：送審前 projection hash = package內 hash = reviewer render輸入 hash。
4. `Immutable Review Mutant`：移除 live/latest recognition access 後案例仍PASS；刻意重新引入 latest-session read 時aggregate必須FAIL。
5. `GET Zero-Write Gate`：重複projection read前後schema、master identity、candidate rows、audit與FK fingerprint不變。
6. `Environment Inventory Gate`：每個release target都保存 ownerless accepted／terminal／formalized inventory；未解釋數量必須為0。
7. `Runtime Activation Gate`：實際部署runtime回讀 recognition與v2 writer flags，並以正常登入流程建立、列出、開啟一筆新v2 request。
8. `Completion Receipt Gate`：DEV-079、DEV-101、QA、QC、documentation map與release manifest引用同一批run IDs；focused證據不得升格成full PASS。

## 8. 根因—措施—證據追溯矩陣

| 根因 | CA | PA／控制點 | 預期證據 | Routing |
|---|---|---|---|---|
| RC-1 adapter不對稱 | CA-2單一resolver | Cross-Adapter Owner Contract Gate | 同fixture跨adapter resolution、canonical key與duplicate matrix | DEV-079／SPEC／QA |
| RC-2 accepted invariant缺失 | CA-3 transition＋DB guard | Accepted-State Mutation Gate | SQLite／PostgreSQL transition、constraint/trigger、mutant、concurrency manifests | DEV-079／migration／QA／QC |
| RC-3 GET代替migration | CA-1 reconciliation＋CA-4 zero-write | GET Zero-Write＋sunset gate | dry-run/apply ledger、pre/post fingerprint、repeated GET zero delta | DEV-079／data repair／release gate |
| RC-4 UI自行判定 | CA-6 canonical projection | shared DTO contract | editor/reviewer DOM與DTO parity、raw member mutant | DEV-079／DEV-101／QA |
| RC-5 snapshot不完整 | CA-5 full recognition package | Projection Parity＋Immutable Review Mutant | package version/hash、submit/read manifests、latest leak mutant | DEV-101／SPEC／QA／QC |
| RC-6驗證分母不足 | CA-1～6 | Environment Inventory＋Runtime Activation＋Completion Receipt | full aggregate、actual runtime readback、normal-path browser、single receipt | QA／QC／Dev PM／release gate |

## 9. CAPA 有效性與關閉門檻

CAPA 現況為 `Local Effectiveness Verified / Environment Effectiveness Pending`。下列第3～9項已由隔離SQLite／PostgreSQL與固定48案證據滿足；第1、2、10、11仍需primary／staging／production授權與實際環境證據後，才能判定整體`Effective`：

1. 所有目標環境完成 read-only inventory；ownerless accepted Part-domain candidates為0，或每筆皆有明確、經核准且尚未apply的處置，不得以unknown當0。
2. A0002-M01 有可追溯處置：要嘛受控reconciliation後重新送審，要嘛既有v1 request正常退回／重送；原snapshot/hash未被靜默改寫。
3. exactly-one owner可冪等收斂；0／>1、invalid、cross-company、terminal/formalized案例fail closed且不產生business write。
4. SQLite與disposable PostgreSQL的schema／transition／concurrency／reconciliation parity通過；全域foreign-key check為0。
5. 重複 GET 的business write、audit delta與rowVersion delta全為0。
6. exact native＋browser PDF duplicate fixture通過；accepted ownerless seed會先使gate FAIL，修正後同一分母PASS。
7. editor送審前 recognition projection hash、v2 package hash coverage與review renderer輸入一致；送審後重跑辨識不改變decision basis。
8. legacy v1不可被顯示成與v2相同的immutable完整快照；缺少recognition basis時明確阻擋／退回，不讀latest補洞。
9. 正常 `submit → /approvals list → detail → return` 在 desktop／tablet／mobile通過，visible／console／network unexpected error=0。
10. production candidate 實際回讀 `PDM_DRAWING_RECOGNITION_V1` 與 `PDM_REVIEW_PACKAGE_V2_WRITE`，正常流程新request確為v2；zero-traffic candidate smoke、Level 4與既有go/no-go gate全部PASS。
11. QA master matrix全PASS、P0/P1=0、Independent QC簽署有效；之後才能把本CAPA標記`Effective`。

## 10. Spec Impact 與執行流向

- DEV-079 recognition SPEC：`Intentional replacement required`。§32 將 GET self-heal作永久控制、且聲稱`no schema migration／no backfill`的假設必須被一次性reconciliation、accepted-state invariant與zero-write read sunset契約取代。
- DEV-101 review workspace SPEC：原判定`Implementation needs correction`；現已補齊builder／contract／exact batch reader／inner hash、shared projector與immutable reviewer panel，產品決策不變，且local fixed QA／Independent QC已48/48完成。Production activation／release仍未授權。
- ADR：目前 `No new ADR`。沿用既有 domain owner與immutable review authority；若RD證明必須全面改造polymorphic owner schema，才停止並回PM做ADR preflight。
- QA：修訂 DEV-079與DEV-101 master plans，新增本文件§7～§9 cases；不得刪除既有分母換綠燈。
- QC：另產fresh effectiveness report；本文件不可自行宣告有效。
- Release：schema/migration、primary data reconciliation、production writer activation、deploy、traffic與release皆走 `deployment-release-gate`，需要人類明確授權。

## 11. DEV 登錄與當責

- DEV ID：`DEV-079` reopen + `DEV-101` amendment；不新增 DEV-102，避免把同一根因拆散並膨脹完成率。
- Type：`CAPA corrective implementation / cross-DEV invariant and immutable evidence correction`。
- PM：維護SPEC impact、固定驗證分母、狀態與單一completion receipt。
- RD：實作resolver、transition/DB invariant、reconciliation、zero-write read、full recognition package與shared projection。
- QA：以task-owned isolated data執行跨adapter、provider、mutation、parity與browser matrix。
- QC：獨立核對inventory、evidence provenance、mutants、cleanup與production-readiness結論。
- Human gate：primary/staging/production data apply、schema migration、writer activation、deploy／traffic／release；本機文件修正與隔離實作不自動取得以上授權。

## 12. Do Not Complete Until

- 不得再以「畫面上需指定料號=0」當作根治證據。
- 不得以A0044 focused report代表A0002 accepted legacy或editor→review parity。
- 不得讓GET承擔永久資料修復責任。
- 不得修改既有review snapshot/hash以讓畫面看似一致。
- 不得用QC script內env冒充production runtime activation。
- 不得在primary／staging／production inventory、授權apply、migration rehearsal、actual runtime readback、production smoke與release gate未完成前宣稱「正式環境已不會再發生」。

使用思考習慣：#多層次分析、#第一性原理、#效用理論、#當責
