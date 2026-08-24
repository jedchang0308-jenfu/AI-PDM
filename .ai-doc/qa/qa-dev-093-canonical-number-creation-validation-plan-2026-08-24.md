# QA-DEV-093：Canonical 統一建立編號驗證計畫

狀態：`Phase 093-I Local QA-QC Passed / Production Release Gated`

日期：2026-08-24

Owner：QA

DEV：`DEV-093`

Authority：`.ai-doc/specs/SPEC-PDM-CANONICAL-NUMBER-CREATION-001-unified-contextual-create.md`

## 1. 品質目標

證明使用者只透過 rendered UI即可從 Drawing／Part header與 drawer完成所有合法建號路徑，且每次結果在 UI、API與 DB完全一致；同時證明新流程沒有恢復 draft workspace、candidate reservation或已退役 API。

本次分類整併追加驗收：料件類型只允許`依圖製作件`／`外購標準件`；共用件以獨立 checkbox 表達，不顯示、不要求也不送出原因，不得再以 item kind、委外件或自訂選項表達。內部 compatibility codes 仍為`manufactured|purchased`及change-control的`self_made|purchased`，不得把code直接顯示給使用者。正式資料分類必須由 `044_canonical_item_kind_two_values.sql` 與 `045_part_number_draft_item_type_two_values.sql` 零未映射遷移；本機演練不得改正式資料。既有 change-control draft 的 `standard` 只能作遷移來源。

本次 naming-guidance corrective 追加驗收：建立新圖料時必須將`主要名詞`與`確定品名`分開；依圖製作件的建議品名固定包含系列代號，且同一系列值另以 metadata 持久化；外購標準件使用品牌／規格型號。建議器、套用、人工覆寫、相似候選、條件式欄位與 payload allowlist皆為正式驗收，不得再以 component 存在或字串掃描代替 rendered behavior。

本次 new-root derivation corrective 追加驗收：新圖料不得顯示手動`建立內容`；依圖製作件固定建立 M 圖＋料號，外購標準件預設只建立料號，勾選`同時建立參考圖 R`才建立 R 圖＋料號。client intent與server必須共同阻擋所有不合法組合；既有 root追加選項不變。

本次 single-source specification corrective追加驗收：new-root UI不得同時出現`自訂規格`與`特性`。依圖製作件只顯示`規格／特性`，外購標準件只顯示`規格／型號`；同一輸入必須同時出現在建議品名、request `customSpecification`與DB `part_numbers.custom_specification`。existing-root與drawing-only均不顯示或傳送規格。

本次 existing-root quiet append corrective追加驗收：同一圖料根號下追加料號或圖號與料號時，`itemKind/structureType/isUniversal/seriesCode/customSpecification`不進UI、唯讀狀態列或canonical request。server以根號第一筆canonical Part為五項profile權威，缺少Part時採`root itemKind + single_part + false + null + null`，`unclassified`或相容payload明示不一致時fail closed。

首重：

1. numbering correctness與 transaction atomicity。
2. idempotency、錯誤恢復與資料不重複。
3. 權限、company boundary與 root lock。
4. 人類語意精簡與 progressive disclosure。
5. keyboard、focus、RWD與 fresh-session穩定性。

本期不做防作弊 red-team；正常安全邊界仍是 hard gate。

## 2. 驗證規則

- 最終 business journey的所有 mutation只能由 AI 操作 rendered UI產生。
- API與 DB在 journey中只能唯讀取證；不得用 direct POST、SQL seed/status edit或 script mutation製造 PASS。
- RD／QA可另以 disposable fixture做 API contract、concurrency與 fault injection；該證據不能取代 UI journey。
- 每個 stable checkpoint綁定同一 actual identity：UI文字、API response/read model、DB PK/FK/count/relation、audit/outbox/receipt。
- 任一層不一致即 FAIL，不能以 UI看起來正常代替後端證據。
- 使用新公司／新 root前綴或可完全追蹤 fixture，避免現有資料造成假陽性。
- 完成後執行兩輪 fresh browser session；不得依賴 service worker、local cache或前一輪 form state。

## 3. Test Oracles

### 3.1 Data delta

| Flow | Root | Part | Drawing | Relation |
|---|---:|---:|---:|---:|
| new root + purchased part | +1 | +1 | 0 | 0 |
| new root + manufactured M drawing_part | +1 | +1 | +1 | +1 manufacturing |
| new root + purchased R drawing_part | +1 | +1 | +1 | +1 reference |
| existing root + part | 0 | +1 | 0 | 0 |
| existing root + drawing | 0 | 0 | +1 | 0 或符合 canonical auto-link rule的 +1 |
| existing root + drawing_part | 0 | +1 | +1 | +1 |

### 3.2 Common invariant

- response actual number = DB identity = destination workbench row。
- root、child與 required relation同 transaction；fault後 delta全為0。
- same idempotency key + same payload只有一份結果與一組 side effects。
- same idempotency key + different payload fail closed。
- M只產生 manufacturing basis，R只產生 reference；R不可成為 primary manufacturing。
- 每個 part最多一張 primary manufacturing drawing。
- preview前後 DB count、sequence、reservation、audit與outbox都不變。
- UI不出現 workspace、candidate、reservation、relation type、raw status或 technical key。

## 4. Entry and Progressive Disclosure Matrix

| ID | 情境 | 預期 |
|---|---|---|
| QA-093-001 | Drawing header | 開啟 `/numbering/create`；新圖料結果由料件類型推導 |
| QA-093-002 | Part header | 開啟同一頁；不以入口暗藏 part-only 規則 |
| QA-093-003 | Drawing drawer | root code/name readonly，預設 existing_root + drawing |
| QA-093-004 | Part drawer | root code/name readonly，預設 existing_root + part |
| QA-093-005 | Search header | 先選建立新圖料／加到既有圖料，無暗藏預設 mutation |
| QA-093-006 | existing root search | 選 root後才顯示建立內容與後續欄位 |
| QA-093-007 | new root | 整個`建立內容`選擇不存在；結果由料件類型與參考圖 checkbox推導 |
| QA-093-008 | existing-root content切換 | 隱藏欄位從 payload移除，既有合法輸入合理保留 |
| QA-093-009 | itemKind／shared切換 | select只有依圖製作件／外購標準件；共用件為獨立勾選，不顯示或要求共用原因；舊分類與 compatibility code 不得出現在 UI |
| QA-093-010 | M/R呈現 | existing-root可切換；new-root manufactured不重複顯示 M，purchased勾選R後只揭露reference purpose |
| QA-093-011 | footer | 只有一個 primary `建立編號`，取消為 secondary |
| QA-093-012 | dirty drawer matrix | 導向前先觸發既有未儲存離開保護 |

## 4A. Naming Guidance Corrective Matrix

| ID | 情境 | 通過標準 |
|---|---|---|
| QA-093-073 | new root初始命名區 | 可見`主要名詞`、建議品名與可編輯`確定品名`；不得以單一`品名`欄直接把主要名詞送成 coreName |
| QA-093-074 | 依圖製作件完整段落 | `馬達 + JF + 伺服 400W + A`即時產生`馬達_JF_伺服_400W_A` |
| QA-093-075 | 外購標準件完整段落 | `馬達 + 東元 + 1HP 4P 220VAC`產生`馬達_東元_1HP_4P_220VAC`，不顯示／送出系列代號 |
| QA-093-076 | 空白與底線正規化 | 前後空白、連續空白／底線正規化為單一`_`，無前後／重複底線 |
| QA-093-077 | 選填段落留白 | 空白段落略過；只有主要名詞與確定品名為必填，建議欄位不阻擋建立 |
| QA-093-078 | 套用建議品名 | `套用建議品名`只覆寫確定品名，不產生資料寫入或號碼 reservation |
| QA-093-079 | 人工覆寫確定品名 | 使用者微調後，最終 request、DB root core_name、同根新料號 part_name與工作臺 UI一致 |
| QA-093-080 | 系列雙重用途 | 系列代號同時出現在建議／套用後確定品名，並以相同值持久化在 part series_code；不得反向從名稱解析 metadata |
| QA-093-081 | 系列代號選取／自創 | 可選公司既有系列代號，也可輸入合法新代號；鍵盤可操作且不得恢復 legacy workspace來源 |
| QA-093-082 | 類型切換 | 依圖→外購時隱藏並清除 series/feature/serial payload，改顯示 brand/specification；切回時只恢復仍合法的使用者輸入 |
| QA-093-083 | 共用件切換 | 勾選共用時系列代號隱藏且 payload為 null／absent，且不顯示或送出共用原因；取消後依規則恢復合法欄位 |
| QA-093-084 | 名稱長度邊界 | 確定品名 300字可提交，301字在欄位就地阻擋；前後端限制一致 |
| QA-093-085 | 新圖料查重目標 | 組合時查建議品名；套用／人工覆寫後查最新確定品名；列最多五筆候選編號、品名、相似度且不阻擋建立 |
| QA-093-086 | 既有root建立 | 顯示 readonly root code／確定品名，不顯示建議器、不發品名 duplicate request、不把自身判為重複 |
| QA-093-087 | existing-root disclosure | 無root入口先選並鎖定 root後才顯示建立內容；drawer已知root不要求重複輸入 |
| QA-093-088 | drawing-only allowlist | 只顯示Drawing欄位；request不得包含 itemKind、isUniversal、seriesCode、universalReason、customSpecification或client coreName |
| QA-093-089 | part／drawing_part allowlist | 只送該 discriminated intent合法欄位；隱藏 stale值不得出現在 network payload |
| QA-093-090 | 欄位錯誤 | required／格式／長度錯誤就地顯示並與欄位關聯，focus移到第一錯誤，其餘輸入保留 |
| QA-093-091 | preview失敗 | 顯示`預估暫時無法取得`與重試，不得冒充未填欄位、舊值或已保留號 |
| QA-093-092 | append-policy失敗 | 顯示讀取失敗與重試，不得永久顯示載入中或允許未知policy提交 |
| QA-093-093 | async stale response | 快速變更root query／類型／內容時，舊搜尋、查重或preview回應不得覆蓋最新輸入 |
| QA-093-094 | 共用件控制視覺／a11y | checkbox／switch使用正常控制尺寸、可感知label與focus；320／768／1024／1440px均無放大成文字輸入框 |
| QA-093-095 | false-positive negative control | 移除建議器、系列段落、候選明細、field allowlist或錯誤重試任一能力時，focused contract/browser gate必須 FAIL |
| QA-093-096 | Part初始工作臺狀態 | 每個UI建立的Part與唯一`part_formal / handling=none`state、aggregate在同交易提交；API成功後立即可由Part工作臺actual number查到，沒有孤兒identity/state |
| QA-093-097 | Drawing初始工作臺狀態 | 每個UI建立的Drawing與唯一canonical`0.1 drawing_rd / handling=owner`work、branch、claim、revision、aggregate/state在同交易提交；工作臺立即顯示actual number與`研發版 0.1`，重送不新增第二套工作資料 |
| QA-093-098 | 料件條件先於品名 | 料件類型、共用件、系列代號與自訂規格在DOM／視覺／鍵盤焦點順序均先於主要名詞與建議品名；只有系列等選填值、尚無主要名詞時不得產生半成品建議 |
| QA-093-099 | 查重鄰近命名決策 | `查重中`、錯誤重試、相似候選與`未找到相似品名`均位於建議品名同一區塊，且在確定品名之前；使用者可立即決定是否加入流水識別 |
| QA-093-100 | new-root manufactured推導 | 無`建立內容`控制；選依圖製作件後preview、request、DB與UI均為M圖＋料號，Drawing初始為0.1 |
| QA-093-101 | new-root purchased預設 | 選外購標準件且不勾參考圖時，preview、request與DB只有root＋part，Drawing delta=0 |
| QA-093-102 | new-root purchased參考圖 | 勾`同時建立參考圖 R`後才顯示參考用途；request與DB建立R圖＋料號且relation=reference |
| QA-093-103 | 前後端負向矩陣 | manufactured part-only、manufactured R、purchased M在client validation與server route均422／fail closed且DB delta=0 |
| QA-093-104 | existing-root回歸 | 既有root仍可選part／drawing／drawing_part與M／R，不受new-root推導規則誤傷 |
| QA-093-105 | 單一規格來源 | new-root manufactured／purchased每個畫面只有一個規格輸入，建議品名、request與DB值相同；existing-root不顯示或傳送規格，DB值由server繼承root profile |
| QA-093-106 | 共用件無原因 | 共用件只勾選即可建立；UI、typed request與canonical新寫入不得出現或要求`universalReason` |
| QA-093-107 | 全 canonical surface 無原因 | Part 編輯／審核、Part detail projection與圖號關聯追加路徑均不再顯示、要求或寫入共用原因 |
| QA-093-108 | existing-root quiet append UI | 只顯示root code/name、三種建立內容、必要M/R欄、必要追加原因、單行「將建立」與一個主要動作；不得顯示五項profile控制或「沿用設定」狀態列 |
| QA-093-109 | existing-root 五項 profile 繼承 | Part／Drawing＋Part request不帶`itemKind/structureType/isUniversal/seriesCode/customSpecification`；DB五項均等於root第一筆canonical Part，server仍拒絕明示不一致的相容payload |
| QA-093-110 | 異常 profile fail closed | `structureType=unclassified`時append-policy回`profileBlocked=true`；UI只提示請系統管理員處理且停用提交，repository拒絕寫入，DB delta=0 |

## 5. Core UI Journeys

### 5.1 New root

| ID | Journey | UI mutation | Readback |
|---|---|---|---|
| QA-093-013 | Part header → new root + manufactured | 建立 | 自動root/M drawing/part/link +1，無content選擇 |
| QA-093-014 | Drawing header → new root + manufactured | 建立 | root/drawing/part/link +1，link=M |
| QA-093-015 | Part／Drawing header → new root + purchased +參考圖 | 建立 | root/R drawing/part/link +1，link=reference |
| QA-093-016 | new root + manufactured／purchased兩種料件 | 建立 | select只有兩項；規格是單一選填欄位，不形成第三種 item kind或第二份命名資料 |
| QA-093-017 | manufactured part-only嘗試 | 不可由UI形成；client/server皆拒絕 | DB delta=0 |

### 5.2 Existing root

| ID | Journey | UI mutation | Readback |
|---|---|---|---|
| QA-093-018 | Drawing drawer → add drawing | 建立 | drawing +1，root不變 |
| QA-093-019 | Drawing drawer → add part | 建立 | part +1，root不變 |
| QA-093-020 | Drawing drawer → add drawing_part | 建立 | drawing/part/link +1 |
| QA-093-021 | Part drawer → add part | 建立 | part +1，root不變 |
| QA-093-022 | Part drawer → add drawing | 建立 | drawing +1，M/R正確 |
| QA-093-023 | Part drawer → add drawing_part | 建立 | drawing/part/link +1 |
| QA-093-024 | Search → existing root → add part | 建立 | 選定root的exact delta |

共同UI gate：每條existing-root journey都不得出現料件類型、結構型態、共用件、系列代號、規格／特性或命名／查重區；Part-producing request不得帶入五項profile，建立後以DB readback證明server繼承。
| QA-093-025 | Search → existing root → add M drawing_part | 建立 | formal matrix立即可見新cell |
| QA-093-026 | R drawing append | 建立 | relation=reference，不是primary |
| QA-093-027 | 需要 append reason | 輸入原因後建立 | receipt/audit含原因，UI不顯示技術摘要 |

## 6. Duplicate, Lock and Preview

| ID | 狀況 | 通過標準 |
|---|---|---|
| QA-093-028 | duplicate命中 | 就地列候選編號、品名與相似度；不清空表單、不阻擋建立、不誤稱無結果 |
| QA-093-029 | duplicate service失敗 | 顯示暫時無法查重與重新查重；不假造 zero result |
| QA-093-030 | root locked | 就地原因、submit disabled、DB零變更 |
| QA-093-031 | append policy deny | 穩定原因、DB零變更 |
| QA-093-032 | existing preview | 來自 append-policy `nextNumbers`且標為預估 |
| QA-093-033 | new preview | read-only preview API；前後 DB hash/count完全不變 |
| QA-093-034 | preview與submit間被搶號 | submit配置下一實際號並以 actual result導覽，不重複 |
| QA-093-035 | preview unavailable | 仍可依契約處理，不能冒充已保留或顯示舊值 |

## 7. Atomicity and Idempotency

| ID | Fault／action | 通過標準 |
|---|---|---|
| QA-093-036 | double click primary | 只送一個 logical command，只建立一次 |
| QA-093-037 | same key/same payload replay | 相同 result，所有 data/audit/outbox/receipt exactly once |
| QA-093-038 | same key/different payload | conflict，第二份資料零建立 |
| QA-093-039 | response lost after commit | 原表單與key保留；恢復後顯示第一次 actual result |
| QA-093-040 | fail before commit | 所有domain delta為0，可修改後新key重送 |
| QA-093-041 | fail during relation write | root/drawing/part/link全部 rollback |
| QA-093-042 | concurrent same-root append | sequence唯一、無duplicate、root-first lock成立 |
| QA-093-043 | concurrent primary M conflict | 一個成功、一個穩定 conflict，無multiple primary |

## 8. Permission and Company Boundary

| ID | 情境 | 通過標準 |
|---|---|---|
| QA-093-044 | 無 `numbering.create` | 入口不可操作或 server 403；DB零變更 |
| QA-093-045 | drawing_part缺 `numbering.link_variant` | server fail closed；無partial identity |
| QA-093-046 | cross-company rootCode | 不洩漏 root detail，不可建立 |
| QA-093-047 | tampered root/name/company query | server重新hydrate exact root，忽略不可信display值 |
| QA-093-048 | stale/obsolete/blocked root | 依 append policy禁止，DB零變更 |
| QA-093-049 | field/payload injection | allowlist移除或 server reject，不可寫raw relation/status/sequence |

## 9. Error Recovery and Navigation

| ID | 情境 | 通過標準 |
|---|---|---|
| QA-093-050 | validation error | focus第一錯誤、相關欄位訊息、其餘輸入保留 |
| QA-093-051 | 409 concurrency | 刷新policy/preview，保留輸入並要求再確認 |
| QA-093-052 | 500/service unavailable | 無`系統切換中`籠統誤導；可安全重試 |
| QA-093-053 | cancel from header | 回安全來源工作臺，不產生資料 |
| QA-093-054 | cancel from drawer | 回 exact row/drawer returnTo，不產生資料 |
| QA-093-055 | malicious external returnTo | 拒絕外站，回 canonical fallback |
| QA-093-056 | successful drawing result | 用 actual drawing number定位Drawing workbench row |
| QA-093-057 | successful part result | 用 actual part number定位Part workbench row |
| QA-093-058 | reload after success | 不重送 command，不重複建號 |

## 10. Accessibility and Viewport

| ID | 驗證 | 通過標準 |
|---|---|---|
| QA-093-059 | keyboard-only | 全流程可操作，無keyboard trap |
| QA-093-060 | focus order | progressive fields與footer順序合理 |
| QA-093-061 | async live feedback | duplicate/preview更新可感知且不搶焦點 |
| QA-093-062 | screen labels/errors | label、required、describedby、error semantics完整 |
| QA-093-063 | 320px | 無水平捲動、footer不遮欄位／錯誤 |
| QA-093-064 | 768px | 欄位與combobox可完整使用 |
| QA-093-065 | 1024px | 無大型空白卡或重複摘要 |
| QA-093-066 | 1440px | 內容寬度可讀，單一primary清楚 |

## 11. Legacy Retirement Gate

掃描 runtime、navigation、API、worker、script、static import與generated route caller；下列 current caller必須為0：

- `/api/numbering/draft-workspaces/**`
- `number_candidate_reservations`作為建號或preview authority
- `number-candidate-preview.ts`
- `?create=new_bundle`
- `?tab=reserved`作為建號入口
- legacy workspace create modal/controller
- fallback／dual-write／candidate publication create chain

| ID | Gate | 通過標準 |
|---|---|---|
| QA-093-067 | runtime/navigation scan | caller=0 |
| QA-093-068 | API/worker/script scan | caller=0；active script不import legacy helper |
| QA-093-069 | route manifest | 沒有新建或恢復 draft-workspace route |
| QA-093-070 | negative injection | 注入任一 forbidden caller後 gate必須 FAIL |
| QA-093-071 | preview write detector | 任一 preview造成 DB write後 gate必須 FAIL |
| QA-093-072 | schema/migration diff | 只允許本次 `044` item_kind 與 `045` draft item_type 整併 migration；不得新增 table、column、legacy fallback 或雙寫 |

注意：repo中不屬於 DEV-093 scope但仍有 `tab=reserved` 的歷史／blocked navigation，必須先由 inventory分類。若其產品語意就是建號入口，改到 `/numbering/create`；若屬另一 owner flow，不能用忽略清單掩蓋，需在 manifest記錄 owner與合法目的地。

## 12. Regression

- canonical Drawing／Part工作臺 list、drawer、鍵盤上下切列、drawer width偏好。
- Drawing／Part drawer relation matrix讀取與 DEV-090 direct edit。
- Drawing 2D/3D preview與 Part附件。
- Drawing work/revision、Part change work與 reviewer readonly owner page。
- Numbering search可搜尋 root／Drawing／Part。
- existing hard approval rule：只有 manufactured 在 transfer/release缺 primary M時被阻擋；purchased 不因分類而阻擋。
- item-kind consolidation migration：`outsourced→manufactured`、`custom→manufactured`；舊`shared`必須先有逐筆明確的`manufactured|purchased`基礎分類並保留`is_universal=1`，不得自動猜測。未完成時 migration 必須 FAIL；完成後 source/target count、PK/FK、關聯、附件與時間戳須 100% reconciliation。
- `typecheck:app`、focused lint、isolated build；migration dry-run 必須在 unresolved=0 時才可 PASS。
- console error、unhandled rejection、unexpected 4xx/5xx與network abort sweep。

## 13. Evidence Package

固定輸出：

```text
output/qa/dev-093/<run-id>/
  manifest.json
  environment.json
  contract.json
  data-reconciliation.json
  idempotency.json
  preview-no-write.json
  retirement.json
  browser/
  screenshots/
  network.json
```

`manifest.json`至少包含：commit／dirty-tree hash、provider、DB absolute path與hash、app URL、runtime owner、case total/pass/fail/blocked/notRun、每個 child artifact hash、legacy caller count、schema diff與 cleanup receipt。

## 14. Pass / Fail Gate

PASS必須同時滿足：

- `QA-093-001..109`全部 PASS。
- 六種合法業務flow至少各有一條真實 UI mutation journey；三種非法new-root組合必須由server fail closed且DB delta=0。
- UI/API/DB reconciliation 100%。
- duplicate identity=0、partial transaction=0、orphan relation=0。
- audit/outbox/receipt exactly-once不一致=0。
- legacy caller=0、preview write=0、除既定 `044`／`045` 外 schema delta=0；兩個 migration dry-run unresolved=0 且 reconciliation=100%。
- fresh session兩輪 PASS。
- 每輪新建與existing-root append後，Part state delta必須等於Part identity delta，canonical初始Drawing work delta必須等於Drawing identity delta。
- Blocked=0、Not Run=0、P0/P1=0。

任何一項缺證據，不得標為 RD Complete、QA PASS、QC PASS或 release ready。

## 15. Execution Boundary

本計畫授權本機／disposable QA資料、真實瀏覽器操作與 `044` provider-aware migration 的隔離還原演練；不授權正式資料庫 mutation、正式 migration、production deploy或release。若需要新 schema、恢復 retired route或直接 API/SQL mutation才能完成產品 journey，判定為 contract gap並退回 DEV-093，不可調低驗收標準。

## 16. Execution Evidence（2026-08-24）

> **CAPA結案判定**：舊16/16 contract只保留為假陽性歷史基線；目前完成判定採新版行為／payload gate、retirement gate及兩輪fresh-session rendered-browser evidence；QA-093-096／097鎖住identity與canonical初始state必須同交易可見，QA-093-098鎖住料件條件必須先於品名且不得產生半成品建議，QA-093-099鎖住查重結果必須鄰近建議品名，QA-093-100..104鎖住new-root推導、非法組合fail closed及existing-root回歸，QA-093-105鎖住new-root單一規格來源與existing-root零規格輸入，QA-093-106／107鎖住所有canonical surface不再需要、顯示或寫入共用原因，QA-093-108～110鎖住existing-root quiet append、五項profile後端繼承與異常資料fail closed。

| Evidence | 結果 | 範圍 |
|---|---|---|
| `npm run typecheck:app` | PASS | app type contract |
| `npm run qc:dev-093:contract` | PASS | QA-093-001..016、073..110；typed behavior、new-root推導、非法組合、existing-root quiet append、條件先行、查重鄰近呈現、命名公式、payload allowlist、五項profile繼承與異常profile fail closed |
| `npm run qc:dev-093:retirement` | PASS | legacy helper已移除、active `src` caller scan=0 |
| `npm run qc:dev-093:browser` | PASS | disposable SQLite + 真實 Chromium；兩輪 fresh session、六種合法業務UI mutation、existing-root三種追加、五項root profile後端繼承、request零重複欄、單一主要動作、桌面與320px零水平溢位、三種非法組合422且DB delta=0、DB/API/UI/state reconciliation、double-submit exactly-once、legacy network caller=0；latest run `DEV093-2026-08-24T16-38-47-636Z` |
| `npm run qc:dev-093` | PASS | behavior contract、retirement、兩輪browser aggregate；116 browser checks、response 601、legacy caller 0、console/page/failed request 0 |
| `npx eslint <DEV-093 affected files>` | PASS | DEV-093 受影響 source／runner |
| `npm run build:isolated` | PASS | 最新 Next.js production build 123/123；主資料庫雜湊 `d78214d8b91871ab4fafb7cc8418addb03b8af61ae552e180e9c8d20564e4e7a` 不變，task-owned暫存runtime已清除 |

最新 runner 證據位於 `output/qa/dev-093/DEV093-2026-08-24T16-38-47-636Z/`（`manifest.json`、`data-reconciliation.json`、`network.json`、desktop及320px screenshots）。兩輪fresh session共116項check全數通過、response 601、failed request／console error／page error／legacy caller皆為0；existing-root不提供`itemKind/structureType/isUniversal/seriesCode/customSpecification`控制，request也不傳五項欄位，DB逐項等於來源canonical Part。資料由roots `4→14`、parts `4→18`、drawings `4→16`、links `3→13`、part formal states `4→18`、initial Drawing works `3→15`，candidate／recovery維持0。本機corrective scope可標示 RD Complete與focused QA-QC PASS；這不授權正式PostgreSQL migration、production資料寫入、deploy或release。

本次修正的缺陷：root allocation 與 read-only preview 現在同時排除既有正式根號及非 cancelled 的 canonical `drawings` 投影；drawing allocation 亦會避開既有 `drawing_numbers`／canonical projection collision，避免舊投影造成新建號在同步階段撞唯一鍵。
