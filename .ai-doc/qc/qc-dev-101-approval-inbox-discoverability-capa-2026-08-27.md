# DEV-101 審核清單可發現性與完成誤判 CAPA

Status：`CAPA Local Effectiveness Verified / Independent QA-QC 48 of 48 PASS / 0 Open P0-P1 / Production Release Gated`

Date：2026-08-27

DEV：`DEV-101`

Severity：`P1 / reviewer workflow blocked / no data loss observed`

## 1. 發生什麼事

登入 `R&D Manager` 後，`/approvals` 的「待處理」清單顯示 0 筆，但主要 SQLite 已存在 A0002-M01 的有效待審資料：

- `pdm_work_review_requests.id=234ebcc8-9ed4-4b78-a004-42212729d76b`
- `request_status=pending`
- `reviewer_user_id=user-manager-demo`
- canonical Drawing=`A0002-M01`，revision=`0.1`，state=`in_review`
- `canonical_workbench_states.handling=review_owner`

port 3000 是 2026-08-27 啟動的本專案 `next dev`，runtime 使用 `.env` 的 SQLite `./data/ai-pdm.sqlite`；因此本次空清單不是舊 build、瀏覽器快取或資料未送審。

程式事實顯示：

1. `AsyncApprovalPlatformRepository.listInbox()`只合併 native approval platform 與五種 legacy來源，沒有讀取`pdm_work_review_requests`。
2. DEV-101 新增的 canonical review package UI 只在 `/approvals/[requestId]` 且 direct GET 成功後載入；`/approvals`清單與既有PDM drawer沒有建立 canonical request feed。
3. A0002-M01 request建立於v2實作前，`snapshot_payload`是legacy v1；環境未設定`PDM_REVIEW_PACKAGE_V2_WRITE=true`。它即使由direct URL開啟，也只應使用v1 compatibility reader，不得被回填成v2。
4. `qc-dev-101-browser.mjs`直接前往`/approvals/{fixtureRequestId}`，繞過正常清單入口；因此direct page PASS沒有偵測「資料存在但使用者找不到入口」。

## 2. 影響與問題分類

- 審核者無法從正常入口找到已指派案件，審核流程被阻斷。
- 清單總數與canonical responsibility state矛盾，0筆是錯誤的使用者可見事實。
- 使用者要求的「清單 → 完整工作頁」一致體驗沒有交付；direct URL不能替代可發現入口。
- `RD Implementation Complete / Focused Smoke 22/22 PASS`被讀成較實際證據更高的完成程度，形成完成狀態失真。
- 問題類型：`跨層整合缺口 + 驗證完整性缺口 + PM完成判定失真`；不是單純視覺缺陷，也不歸因於個人疏忽。

## 3. 立即圍堵

1. DEV-101撤回舊`RD Implementation Complete`，重開並完成本CAPA的local corrective slice；固定48案與Independent QC前只可宣稱`RD Implementation Ready`，不得宣稱正式QA／QC完成。
2. 既有22項focused smoke重新分類為`Supporting Evidence`；它只證明direct detail shell的局部能力。
3. 不啟用production、不deploy、不stage／commit／merge／PR，不修改primary schema或資料。
4. A0002-M01既有v1 request保持原狀；禁止backfill、改hash、direct cancel／delete或為展示新UI而重建送審事實。
5. direct URL只可作診斷與v1 compatibility確認，不得作正常入口或CAPA有效性證據。

## 4. 根因分析

### RC-1：需求／架構基線判定錯誤

DEV-101 SPEC把「`/approvals`已有covered PDM row」當成既有DEV-070能力，卻沒有先以程式與真實資料證明`pdm_work_review_requests`已進統一inbox。SPEC又把generic `approval_platform_*` repository列為no-touch，等於在錯誤基線上封鎖必要adapter。

因果鏈：`錯誤既有能力假設 → inbox repository no-touch → 無canonical feed → pending request不進清單 → 使用者看到0筆`。

反事實：若SPEC preflight曾用一筆真實pending canonical request從`/approvals`驗證可發現性，no-touch判定會立即失敗，必要adapter會在RD file plan內。

### RC-2：實作交付切在detail route，沒有閉合user journey

RD完成v2 package builder、target API與full-page shell，但沒有從`pdm_work_review_requests`投影統一inbox row，也沒有補action mapping與server-owned review href。系統形成兩個資料世界：canonical responsibility state知道「審核負責人處理」，approval workbench卻不知道這筆案件。

反事實：若交付單位是`送審 → 清單出現 → 點列 → full-page review → 返回清單`，detail page單獨完成不可能被判定為RD implementation complete。

### RC-3：QA fixture與證據繞過正在驗證的入口

focused browser runner直接seed／替換pending request，再用direct URL打開detail page。這種fixture可驗detail renderer，但不能驗證list adapter、count、actor filter、row navigation與return。QA-101-033只寫「list/return無退化」，缺少canonical pending row、summary count與anti-false-pass mutant的可證偽條件。

反事實：若runner從正常`/approvals`起始，或移除canonical feed的mutant必須使aggregate FAIL，本缺陷無法通過。

### RC-4：完成狀態與證據分類沒有同一出口

dev_task前段宣稱`RD Implementation Complete`，詳細索引仍是`RD Implementation Ready / RD Not Started`；同一DEV已有互相矛盾的狀態。PM completion gate沒有要求「正常UI入口可發現」的receipt，就把direct-route smoke當成實作完成訊號。

反事實：若完成狀態只由同一registry receipt產生，且UI entry失敗強制`Implementation incomplete`，不會出現部分實作被高估的狀況。

### RC-5：v1／v2啟用與可發現性被混在一起

writer flag預設關閉、A0002-M01又是既有v1 request；這能解釋「為何沒有新矩陣UI」，但不能解釋「為何清單是0」。若把兩者混為一談，可能用開flag掩蓋inbox adapter缺口，或違反immutable snapshot去回填舊request。

控制原則：`discoverability`對v1／v2都必須成立；`v2 visual workspace`只由正常流程新建的v2 request驗證。

## 5. 矯正措施（CA）

### CA-1：修正DEV-101實作邊界

- 在統一inbox repository新增`pdm_work_review` read adapter，來源為`pdm_work_review_requests`。
- query必須在source內先套用`company_id + exact reviewer_user_id + actionable status + query`，再limit與merge；不得先limit後過濾。
- v1／v2使用同一row projection；row identity固定使用request id，code／revision／request kind由canonical entity與snapshot／work的受控join取得，不從client拼接。
- request kind映射成明確PDM review action code與`numbering` domain；PDM action由server產生`/approvals/[requestId]` href。
- `pending`是reviewer actionable；`applying`不得假裝仍需審核。若發現`apply_failed`需要reviewer recovery，先回SPEC定義，不自行映射成可決策列。

### CA-2：閉合清單到工作頁的正常路徑

- `/approvals`顯示assigned canonical pending row，summary count與rendered rows一致。
- covered PDM row點擊後直接進full-page review workspace，不先以approval drawer承載另一套decision body。
- 返回必須還原filter／query／cursor／selection並刷新受影響row與pending count。
- generic approval與既有legacy來源維持原路徑；不得為修PDM feed破壞其他source。

### CA-3：分離legacy可發現性與v2啟用驗證

- A0002-M01既有v1 request修正後必須可由清單找到並使用legacy compatibility reader完成正常審核。
- 新矩陣／圖料完整workspace只用task-owned isolated runtime、`PDM_REVIEW_PACKAGE_V2_WRITE=true`及正常UI送審產生的新v2 request驗證。
- flag off／on與writer schema必須保存runtime readback；不可只看env檔或source字串。
- 不backfill v1；production convergence仍須`pending_v1=0`或人類核准的normal-flow收斂計畫。

### CA-4：修正QA分母與aggregate

固定QA先由36案擴為42案，新增`QA-101-037..042`：canonical list projection、actor／filter／cursor、正常submit-to-list-to-page、legacy v1 discoverability、flag activation readback與direct-URL false-pass mutant；辨識parity CAPA再擴為48案。原22項smoke與後續RD aggregate均不得映射成固定case PASS。

### CA-5：重建完成判定

只有同一source state下48/48、Blocked／Not Run／FAIL／P0／P1=0、SQLite／disposable PostgreSQL、headed browser、primary invariants、cleanup與Independent QC全部通過，才能形成`Local QA-QC PASS`候選；production仍走release gate。RD aggregate PASS只證明矯正實作可交QA。

## 6. 預防措施（PA）

1. **UI Entry Gate**：所有含正常入口、導航或可見清單的DEV，SPEC exact file plan與QA都必須列出起始頁、可辨識入口、row/count invariant與direct URL禁止替代規則。
2. **Source-to-Inbox Coverage Matrix**：approval workbench每一個active request authority都要有`source table → actor filter → row projection → href → detail reader → terminal refresh`對照；新增request authority時matrix缺一欄即阻擋ready。
3. **Anti-false-PASS mutant**：刻意移除目標source的list adapter，但保留detail direct URL可用；browser／aggregate必須FAIL。
4. **Evidence taxonomy**：direct route、source contract、DB row、API、normal rendered journey分級保存；低層PASS不得提升高層completion。
5. **Single status receipt**：dev_task索引、派工入口、documentation map只能由同一aggregate receipt更新；沒有receipt不得出現互相矛盾的ready／complete狀態。
6. **Activation provenance**：feature flag任務必須保存實際runtime readback及由正常流程新建的資料schema；env檔存在不等於已啟用，舊資料不等於新writer證據。

## 7. CA／PA追溯矩陣

| 根因 | CA | PA／控制點 | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| RC-1錯誤基線＋no-touch | CA-1修正adapter與SPEC file boundary | UI Entry Gate、Source-to-Inbox Matrix | 高效用；無schema，局部read adapter，能直接消除0筆假象 | repository query ledger、SPEC diff、list row/count | DEV-101／SPEC／project checklist |
| RC-2 journey未閉合 | CA-2正常清單→頁面→返回 | 正常delivery path gate | 高效用；沿用既有list/page，不新增第二套UI | headed journey、URL／return、DOM／network | DEV-101／QA plan |
| RC-3 direct URL假PASS | CA-4新增037..042 | anti-false-PASS mutant、evidence taxonomy | 高效用；成本低，能直接攔截同類漏接 | mutant first failure、aggregate FAIL/PASS pair | QA plan／QC report |
| RC-4狀態失真 | CA-5單一完成出口 | single status receipt | 高效用；降低誤報，文件成本可控 | registry hash、同run manifests、三處狀態一致 | dev_task／documentation_map／PM checklist |
| RC-5 v1／v2混淆 | CA-3分開驗證 | activation provenance | 高效用；避免破壞immutable evidence或用flag掩蓋feed缺口 | v1 list journey、v2 normal submit、runtime flag readback | DEV-101／QA／release gate |

## 8. 驗證與CAPA有效性門檻

本CAPA的local code correction與獨立有效性驗證已完成；以下六項已由同parent/source的data、rendered browser、PostgreSQL與gate manifests共同證明：

1. task-owned fixture中至少一筆v1與一筆v2 canonical pending request，都由exact reviewer在`/approvals`看到，summary count正確。
2. 未指派、跨公司、terminal／applying request不可被列出，且無facts leak。
3. v2 request必須由正常UI送審形成；從清單點入後看到package workspace，不能由direct URL預先完成成功條件。
4. 移除canonical inbox adapter的mutant使037／039／042與aggregate確定FAIL；恢復後同一run PASS。
5. A0002-M01主資料只讀驗證request仍存在且未被CAPA文件工作修改；任何實際資料處置需另行人類授權。
6. 固定48/48與Independent QC均已完成；本結論只適用local source state。CAPA文件與RD supporting runner本身仍不計固定case PASS，production effectiveness仍需release後監測。

## 9. Routing recommendation

- Suggested route：`same DEV-101 reopen + SPEC amendment + QA plan rebaseline + Independent QC`
- Reason：矯正是原已確認交付路徑的一部分，不是新產品需求；另開DEV會切斷根因追溯並膨脹完成率。
- Required owner：PM維護contract／status；RD實作adapter與normal path；QA維護42案與mutants；QC獨立執行及判定有效性。
- Required evidence：normal rendered journey、repository／actor／query ledger、SQLite／PostgreSQL parity、runtime activation readback、mutant pair、aggregate manifest與cleanup receipt。
- Human decision needed：`no` for local documentation and corrective implementation；`yes` for primary data handling、shared runtime activation、production migration／deploy／release。

### 9.1 Local corrective implementation receipt

- Aggregate：`output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`，`RD_IMPLEMENTATION_READY`、11/11 lanes PASS。
- Normal path：v2 owner→submit→assigned reviewer `/approvals` list→full-page review→return／approve為28/28 PASS；legacy v1 normal-entry為16/16 PASS；inbox actor/filter/cursor／adapter-removal mutant為7/7 PASS。
- Provider／integrity：disposable PostgreSQL 10/10、repository 5/5、typecheck、affected lint、isolated build 122 pages、primary/source fingerprint與FK／cleanup全PASS。
- Evidence classification：`RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC`。在該RD receipt形成時，固定`QA-101-001..048`為0 PASS／48 NOT_RUN；本節只證明CA已實作，CAPA local effectiveness由下節的獨立證據判定。

### 9.2 Independent local effectiveness receipt

- Evidence classification：`INDEPENDENT_COMPLETION_GATE`；固定`QA-101-001..048`為48 PASS／0 FAIL／0 BLOCKED／0 NOT_RUN。
- Normal entry：owner UI建立v1／v2 request，exact reviewer由`/approvals`看見並點入；missing-adapter mutant讓正常入口與aggregate失敗，恢復後同source PASS。
- Provider／integrity：SQLite與真實task-owned PostgreSQL 18、projection inner hash、concurrent exactly-one effect、typecheck、affected lint、120頁isolated build與16/16 anti-false-PASS mutants全PASS。
- Runtime／data：兩個Next ports與PostgreSQL port均釋放，task temp移除；primary SQLite schema、canonical identities、migration residue及foreign keys前後一致。
- 最終manifest與child hash索引：`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。

## 10. DEV registration draft

- DEV ID：`DEV-101`（重開，不新增平行DEV）
- Type：`交付點 / CAPA corrective implementation`
- Parent：沿用DEV-070／079／087 authority；CAPA為DEV-101 PM evidence，不計完成率。
- Scope：canonical PDM inbox adapter、direct full-page navigation、v1／v2 discoverability、normal-path QA與completion gate。
- Acceptance：本文件§8與QA-101-001..048全部滿足。
- Stop conditions：需要schema／backfill／primary data mutation、改decision semantics、讓applying可重決策、或改production runtime時停止回PM／人類決策。
- Evidence required：§9列示證據。
- Owner：PM → RD → QA → Independent QC。
