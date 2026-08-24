# SPEC-PDM-CANONICAL-NUMBER-CREATION-001：Canonical 統一建立編號

狀態：`Local RD Implemented / Corrective QA-QC Passed / Production Release Gated`

日期：2026-08-24

Owner：Dev PM

Related DEV：`DEV-093`

Parent：`DEV-087`

Related：`DEV-090`、`DEV-063`、`DEV-048`、`DEV-PDM-NUMBERING-004`

QA：`.ai-doc/qa/qa-dev-093-canonical-number-creation-validation-plan-2026-08-24.md`

## 0. 決策摘要

本規格建立一個人類可理解、後端單一權威的「建立編號」流程。它保留舊版完整建號能力，但不恢復舊版 workspace、候選號、舊狀態投影、舊送審發布鏈、fallback 或雙寫。

使用者只看到一個動作：`建立編號`。系統依入口是否已知圖料根號與使用者選擇，轉成下列 canonical command：

```text
                         建立編號
                             │
              ┌──────────────┴──────────────┐
              │                             │
         建立新圖料                    加到既有圖料
              │                             │
       先選料件類型                  ┌───────┼────────┐
       │                             │       │        │
       ├─依圖製作件→M圖＋料號        料號    圖號   圖號＋料號
       └─外購標準件→料號             │       │        │
          └─可加參考圖R─────────────┴───────┴────────┘
                             │
                  canonical numbering command
                             │
                  正式 Draft identity／relation
```

核心原則：

1. 一個使用者入口，多個 typed intent；不把後端 API 數量暴露成多個產品模式。
2. 號碼預覽只是假設當下狀態的`預估結果`，不是 reservation；正式號碼只在提交 transaction 內原子配置。
3. 新圖料與既有圖料追加共用表單、驗證與結果語意；後端仍由各自 canonical domain command 負責寫入。
4. 圖號與料號同時建立時，關聯由 server 依 M／R 與料件條件決定；使用者不選 technical relation type。
5. 料件類型只有`依圖製作件`與`外購標準件`：前者表示依公司圖面製作或加工，不以實際由廠內或委外執行區分；後者表示依型錄／標準規格採購。`共用件`是獨立的 `isUniversal` 勾選，不是第三種料件類型，也不需要填寫原因。`委外件`與`自訂`不得再作為新資料分類或 UI 選項。
6. 正式資料的分類整併必須先套用 provider-aware migrations `044_canonical_item_kind_two_values.sql`（正式料件）與 `045_part_number_draft_item_type_two_values.sql`（變更控制草稿）並完成零未映射核對；本機可在 disposable DB 驗證，不能在未授權下改正式資料庫。
7. 建立新圖料必須保留完整品名引導：使用者輸入`主要名詞`與依料件類型出現的命名段落，系統即時產生可套用的`建議品名`，使用者以可編輯的`確定品名`作為唯一名稱權威。系列代號是獨立持久化 metadata，同時必須自動加入適用情境的建議品名。
8. 新圖料不再讓使用者重複選`建立內容`：`依圖製作件`固定原子建立製造圖 M＋料號；`外購標準件`固定建立料號，僅在勾選`同時建立參考圖 R`時再建立 R 圖。`共用件`不影響此判斷。
9. `自訂規格`與命名用`特性／規格型號`收斂為單一可見輸入：依圖製作件顯示`規格／特性`，外購標準件顯示`規格／型號`。同一值同時參與建議品名並以既有`customSpecification`持久化；不得維護兩份可互相矛盾的前端狀態。
10. `共用件`只保留勾選語意；canonical create UI、typed intent、request與新寫入 command均不得顯示、要求或送出`universalReason`。既有資料庫`universal_reason`欄位為歷史相容欄位，本期不做破壞性刪除，不再由此建立流程寫入。
11. `existing_root` 建立料號或圖號與料號時，料件類型一律沿用 server 由圖料根號取得的 `itemKind`；UI 不再顯示可變更的料件類型選擇器。`共用件`仍是獨立勾選，可依本次料號需求設定；server 對 client 傳入的類型做一致性檢查，拒絕與根號類型不符的追加。

## 1. Spec Impact Preflight

結論：`Intentional replacement`。

### 1.1 取代

- 取代 `SPEC-PDM-NUMBERING-004` 中把`新增圖號`、`新增料號`與`同時新增`當成平行人類入口的 UX。
- 取代 `SPEC-PDM-NUMBER-STATE-FLOW-001` 中以 draft workspace、candidate reservation、候選號送審／發布作為新建號使用者流程的條款。
- 取代目前 `CanonicalNumberingCreateAction` 的簡化 modal 實作；該元件在本期只保留為導向共用建立頁的 entry action。
- 新增入口不得再產生 `?tab=reserved`、`?create=new_bundle` 或任何 draft-workspace URL。
- 取代本規格先前「品名建議器可以保留」的弱式條款；建議器改為建立新圖料的必要產品能力。
- 取代 `SPEC-PDM-NUMBER-STATE-FLOW-001` 先前「系列代號不得加入建議品名」的條款；最新 Human Decision 固定要求系列代號既要獨立保存，也要加入依圖製作件的建議品名。
- 取代本規格先前「新圖料可由使用者選料號／圖號＋料號」及「依圖製作件可先只建料號，發布前再補圖」的條款。新圖料的合法結果改由料件類型推導，依圖製作件建立時即配置製造圖 M。
- 取代本規格先前「`自訂規格`是獨立產品資料，不得拿來作為命名特性／規格型號」的條款。最新Human Decision要求人類層只有一個規格來源；既有後端欄位繼續作持久化載體，不新增第二欄或資料遷移。

### 1.2 保留

- `DEV-087` 的 canonical entity、single state authority、typed workbench與 legacy retirement 原則。
- `DEV-090` 的 `RelationFormalAuthorityRepository`、root-first lock、正式關聯唯一 writer 與 M／R 關聯規則。
- `DEV-063` 的圖號、料號、圖料根號與用途詞彙。
- 現行 canonical record/root append API 的資料、權限、audit、idempotency 與 transaction authority。
- Part Number 無版本；Drawing 才有 revision 的跨模組規則。
- 依圖製作件必須具備主要製造圖、外購標準件不強制主要製造圖的跨模組 hard rule；本期將相同限制提前到新圖料建號，既有圖料追加契約不變。

### 1.3 ADR 判定

`No new ADR required`。單一 canonical authority 已由 DEV-087 決定，正式關聯 writer 已由 DEV-090 決定；本規格只定義在既有決策上的產品流程與 typed adapter，不建立新資料權威。

## 2. 問題與目標

目前新工作臺已有簡化建號動作，但能力與入口不完整；舊版完整表單則依賴已退役的候選／workspace 心智模型。直接恢復舊頁會造成新 UI 再次依賴舊權威。

本期完成後：

- 圖號工作臺頁首、料號工作臺頁首、圖號抽屜、料號抽屜都可進入同一流程。
- 無根號入口可建立新圖料或搜尋既有圖料；已知根號入口不要求重複輸入。
- 六種合法業務結果都能由一份 form contract 表達：新圖料三種推導結果與既有圖料三種追加結果。
- duplicate、root lock、append reason、號碼預估與欄位錯誤都在相關欄位旁呈現。
- DB、API response與工作臺 UI 顯示同一批實際配置的 identity。
- runtime、navigation與 API caller 不重新引入任何 legacy draft-workspace 依賴。
- 建立新圖料時，`主要名詞`不再被誤當成完整品名；建議品名、確定品名、相似候選與系列代號語意可被使用者直接理解與驗證。

## 3. Scope

### 3.1 In scope

- 新獨立頁面 `/numbering/create`。
- 圖號／料號工作臺頁首及各自 drawer 的 `建立編號`入口。
- 編號搜尋頁的共用入口與既有 root 搜尋。
- 新圖料：依圖製作件建立製造圖 M＋料號；外購標準件建立料號；外購標準件可選擇同時建立參考圖 R。
- 既有圖料：新增料號、新增圖號、同時新增圖號＋料號。
- progressive disclosure、inline validation、duplicate check、append policy、root lock、append reason、號碼預估。
- canonical API adapter、idempotency、權限、company boundary與錯誤恢復。
- M／R、兩種料件類型、主要名詞／建議品名／確定品名、系列代號、獨立共用勾選／原因、單一規格來源與參考用途。
- UI-only lifecycle journey與 API／DB 唯讀回查。
- legacy caller retirement scan。

### 3.2 Out of scope

- 正式 Cloud SQL migration 的實際切換；本期只提供 `044` migration、演練與阻擋條件，不代表已取得 production 授權。
- draft workspace、candidate reservation、舊建號送審或發布功能。
- Drawing revision、Part change work、review或release流程重設。
- 關聯矩陣資料模型或 DEV-090 直接編輯契約修改。
- BOM、公開分享、export、recognition worker。
- production deploy／Cloud SQL migration／release。
- 防堵惡意作弊、流量濫用或刻意偽造；本期仍保留正常權限、公司邊界、輸入驗證與一致性保護。

## 4. Human UI Contract

### 4.1 入口與預設值

| 入口 | 已知 context | 預設 scope | 新圖料結果 | 既有圖料可改內容 |
|---|---|---|---|---|
| 圖號工作臺頁首 | 無 | `new_root` | 由料件類型推導 | `part`／`drawing`／`drawing_part` |
| 料號工作臺頁首 | 無 | `new_root` | 由料件類型推導 | `part`／`drawing`／`drawing_part` |
| 圖號 drawer | rootCode | `existing_root` | 不適用 | `part`／`drawing`／`drawing_part` |
| 料號 drawer | rootCode | `existing_root` | 不適用 | `part`／`drawing`／`drawing_part` |
| 編號搜尋頁首 | 無 | 未選 | 由料件類型推導 | `part`／`drawing`／`drawing_part` |

- Header action導向 `/numbering/create?from=drawing|part|search`。
- Drawer action導向 `/numbering/create?from=drawing|part&root=<rootCode>&returnTo=<safe-path>`。
- URL 的 root name、company、permission 或 append policy 一律不可信；server 必須以 rootCode 重新取得 context。
- Drawer 的 `建立編號`是關聯矩陣區的次要 context action，不得和該列目前生命週期唯一 primary action競爭。
- 若矩陣有未儲存修改，沿用既有離開保護後才可導向建立頁。

### 4.2 表單順序

只呈現目前需要的欄位，順序固定：

1. `建立方式`：建立新圖料／加到既有圖料；已知 root 時隱藏此選擇。
2. `圖料根號`：選擇加到既有圖料時先搜尋並鎖定 root；drawer 情境顯示 readonly root code與確定品名。
3. 新圖料先完成料件條件：`料件類型`、共用勾選／原因與系列代號；不顯示`建立內容`。依圖製作件直接推導`drawing_part + M`；外購標準件推導`part`，勾選`同時建立參考圖 R`時推導`drawing_part + R`。
4. 既有 root 在 root 選定後才顯示`建立內容`：料號／圖號／圖號與料號；既有追加仍可獨立選 M／R。
5. 再進入新圖料的品名引導：主要名詞、類型專屬命名段落、建議品名與確定品名；既有 root 只顯示 readonly 確定品名，不重跑建議器或品名查重。
6. `圖面用途`：只在既有 root 追加時顯示 M／R；新圖料依圖製作件的 M 不重複顯示，外購標準件勾選參考圖後只顯示必填的參考用途。
7. 就地顯示 duplicate、追加限制、追加原因與`預估號碼`。
8. Footer固定一個主要動作`建立編號`與次要動作`取消`。

### 4.2.1 品名引導與單一名稱權威

建立新圖料時固定使用下列 view state；這些組合段落只存在前端，不新增資料表、API 欄位或第二個名稱權威：

```ts
type NameSuggestionDraft = {
  primaryNoun: string;
  brand?: string;
  specificationModel?: string;
  seriesCode?: string;
  feature?: string;
  serialIdentifier?: string;
  suggestedName: string;
  confirmedName: string;
};
```

人類語意與規則：

- UI 使用`主要名詞`，不得把該輸入框標成完整`品名`；例如馬達、外殼、腳架。
- 料件條件區在 DOM、視覺與鍵盤焦點順序都必須位於品名區之前；系列代號或其他選填值已輸入但主要名詞仍空白時，`建議品名`保持空白，不顯示缺少主體的半成品名稱。
- `依圖製作件`建議公式固定為`[主要名詞]_[系列代號]_[特性]_[流水識別]`。
- `外購標準件`建議公式固定為`[主要名詞]_[品牌]_[規格/型號]`。
- 各段先 trim，連續空白與底線正規化成單一半形底線`_`，空白選填段落直接略過，不得產生前後或重複底線。
- 主要名詞必填；品牌、規格／型號、系列代號、特性與流水識別皆為建議用選填段落，不得成為阻擋性欄位。
- 系列代號只在`依圖製作件 && !共用件`顯示；可從現有公司系列代號選取或輸入新代號。它以`seriesCode`獨立持久化，且同一值必須自動加入建議品名。切換為外購標準件或共用件時必須隱藏並從 payload 清除，不得讓 UI 輸入值被 server 靜默捨棄。
- `建議品名`唯讀即時更新，提供一個就地次要動作`套用建議品名`；套用只覆寫`確定品名`。
- `確定品名`可由使用者再微調，最大 300 字；提交時映射為唯一 `coreName`，並由既有 domain 同步為同根料號預設品名。
- 規格只有一個可見來源。依圖製作件標示`規格／特性（選填）`，外購標準件標示`規格／型號（選填）`；該值在建議品名中分別映射為`feature`或`specificationModel`，提交時同時映射為既有`customSpecification`。不得另顯示`自訂規格`、另維護`nameFeature`／`nameSpecificationModel`狀態，或讓品名與主資料規格互相矛盾。
- existing-root追加料號／圖號與料號時沒有品名建議器；根號既有四項料件profile唯讀沿用，只顯示`料件設定（沿用根號）`狀態，不再要求使用者重選或輸入；drawing-only不顯示也不得送出Part欄位。
- 相似品名查重只在 `new_root` 執行。組合中先檢查最新建議品名；確定品名被套用或手動修改後改查最終確定品名。命中只警示並列出最多五筆候選的編號、品名與相似度，不阻擋建立；service 失敗顯示`暫時無法查重`與`重新查重`。
- `existing_root` 是使用者明確沿用既有圖料，不顯示建議器、不執行品名查重，也不把 root 自身判為重複。

禁止：

- 四模式卡片或三個 API 對應的平行入口。
- 大型提示卡、教學區、重複摘要與 backend relation type。
- 把技術欄位、raw status、workspace、candidate、reservation、package或workflow顯示給一般使用者。
- 以 preview 成功暗示號碼已保留。

### 4.3 頁面與 modal

- 完整流程一律使用 `/numbering/create`，避免窄版與條件欄位形成長 modal。
- `CanonicalNumberingCreateAction`只負責建立 safe URL、保留 returnTo及導向，不擁有表單 state 或 mutation。
- 未來只有不超過一個決策且無長表單的快速流程可以使用 modal；本期不保留建立 modal。
- desktop採單欄主表單；寬版可讓預估號碼與相關欄位同列，但不得新增第二個摘要 panel。
- mobile 320px起不可水平捲動；footer action保持可達但不能遮蔽欄位錯誤。

### 4.4 欄位與錯誤語意

| 狀況 | 呈現 |
|---|---|
| duplicate check命中 | 在品名／root搜尋附近顯示候選 identity；屬警示，不虛構禁止 |
| duplicate service失敗 | 顯示`暫時無法查重`；不得當作零結果 |
| root被鎖定 | 在 root context旁顯示原因；禁止提交 |
| 需要追加原因 | 在提交區前顯示必填欄位與原因 |
| 預估成功 | 顯示`預估：A000x-P0x`；同時建立則顯示兩個預估值 |
| 預估過期／衝突 | 重新取得預估；提交仍以 server實際配置為準 |
| 權限／公司不符 | 不顯示可提交狀態；回傳穩定錯誤並保留非敏感輸入 |
| 409 concurrency | 保留輸入，刷新 policy／preview，要求使用者再次確認提交 |
| 未知網路結果 | 保留相同 idempotency key重試相同 payload，先查 command結果；不得直接產生新 key重建 |
| 確定失敗且 payload已改 | 產生新 idempotency key後可重送 |
| root搜尋／append-policy／preview失敗 | 顯示可區分的失敗狀態與就地重試；不得冒充零結果、必要欄位未完成或永久顯示載入中 |

## 5. Typed Intent Contract

新增 `src/lib/canonical-numbering-create-contract.ts`。提交 intent 依 content 真正 discriminated；只有會建立 Part 的 intent 才能包含 Part 欄位：

```ts
type PartCreateFields = {
  itemKind: "manufactured" | "purchased";
  isUniversal: boolean;
  seriesCode?: string | null;
  customSpecification?: string | null;
};

type DrawingCreateFields = {
  purposeCode: "M" | "R";
  referencePurpose?: string | null;
};

export type CanonicalNumberingCreateIntent =
  | ({ scope: "new_root"; content: "part"; coreName: string; itemKind: "purchased" } & Omit<PartCreateFields, "itemKind">)
  | ({ scope: "new_root"; content: "drawing_part"; coreName: string; itemKind: "manufactured"; purposeCode: "M" } & Omit<PartCreateFields, "itemKind">)
  | ({ scope: "new_root"; content: "drawing_part"; coreName: string; itemKind: "purchased"; purposeCode: "R"; referencePurpose: string } & Omit<PartCreateFields, "itemKind">)
  | ({ scope: "existing_root"; content: "part"; rootCode: string; appendReason?: string | null } & PartCreateFields)
  | ({ scope: "existing_root"; content: "drawing"; rootCode: string; appendReason?: string | null } & DrawingCreateFields)
  | ({ scope: "existing_root"; content: "drawing_part"; rootCode: string; appendReason?: string | null } & PartCreateFields & DrawingCreateFields);
```

規則：

- `new_root + drawing`為 schema validation error。
- `new_root + manufactured + part`、`manufactured + R`及`purchased + M`均為 schema validation error；client typed union與`POST /api/numbering/records`必須各自 fail closed。
- `rootCode`只在 existing_root 出現，且以 server查得資料為準；Part append 的 `itemKind` 也以 server 查得根號設定為準，client 不得改寫。
- field allowlist依 scope/content/itemKind/purposeCode收斂；隱藏欄位不得殘留送出。
- `NameSuggestionDraft`是前端暫存 view state；`coreName`仍是唯一產品品名。建議器是必要能力，但只能由`套用建議品名`或使用者編輯後回填 `coreName`，不建立第二個 name authority。
- existing-root mutation不接收 client `coreName`；server以 rootCode重新 hydrate 確定品名，防止不可信 URL／表單名稱改寫 root。
- client DTO不可包含 relation type、sequence number、status、companyId、owner、reservation或workspace ID。

## 6. API Mapping

| Intent | Canonical endpoint | 權限 | 預期原子結果 |
|---|---|---|---|
| new_root + purchased part | `POST /api/numbering/records` | `numbering.create` | root + part |
| new_root + manufactured M drawing_part | `POST /api/numbering/records` | `numbering.create` + relation guard | root + M drawing + part + manufacturing link |
| new_root + purchased R drawing_part | `POST /api/numbering/records` | `numbering.create` + relation guard | root + R drawing + part + reference link |
| existing_root + part | `POST /api/numbering/roots/{rootCode}/parts` | `numbering.create`；需要連結時另驗`numbering.link_variant` | part |
| existing_root + drawing | `POST /api/numbering/roots/{rootCode}/drawings` | `numbering.create`；需要連結時另驗`numbering.link_variant` | drawing，及合法時的 link |
| existing_root + drawing_part | `POST /api/numbering/roots/{rootCode}/drawing-part` | `numbering.create` + `numbering.link_variant` | drawing + part + formal link |

UI不得直接根據 endpoint組 payload。新增一個 adapter將 typed intent映射到既有 endpoint，統一：

- `Idempotency-Key`。
- response normalization。
- stable error code與 field mapping。
- safe retry與 result navigation。
- M／R關聯語意。M建立 `manufacturing_basis`，R建立 `reference`；轉成 storage enum只能在 DEV-090 authority內發生。

所有 mutation 必須由 server：

- 驗證 actor permission與company boundary。
- 重新驗證 root、append policy、duplicate constraints與欄位條件。
- 在 transaction內取得 sequence並建立正式 Draft identity。
- 同時建號時經 `RelationFormalAuthorityRepository`寫入關聯。
- 寫入 audit／outbox／command receipt且 exactly once。
- 對同一 idempotency key + same payload回傳同一結果；same key + different payload fail closed。

## 7. Preview Contract

### 7.1 Existing root

沿用：

```text
GET /api/numbering/roots/{rootCode}/append-policy
```

response提供 root context、allow/deny、required reason與 `nextNumbers`。它是 read-only policy projection，不得建立 reservation。

### 7.2 New root

新增：

```text
GET /api/numbering/records/preview?content=part|drawing_part&purposeCode=M|R
```

契約：

- 只讀；不得寫 audit、outbox、sequence、reservation或其他 row。
- 使用與正式 allocation相同的 canonical numbering rule及已存在 identity保護。
- 回傳 `estimated=true`、預估 root/part/drawing及 `observedAt`。
- 不回傳 reservation ID、expiry、workspace或可被 mutation使用的 token。
- 權限與 company boundary和 create相同；preview成功不代表 create一定成功。

### 7.3 Legacy preview retirement

目前 `src/lib/number-candidate-preview.ts`會讀取 `number_candidate_reservations`。本期新增 `src/lib/numbering-preview.ts`後，append-policy與active QA runner改用新 helper；確認 runtime／worker／script caller=0後刪除舊 helper。禁止為了預覽恢復 draft workspace或 candidate reservation writer。

## 8. Result and Navigation

建立成功只顯示一次精簡結果，並依使用者來源前往可驗證的新資料：

| 結果／來源 | 目的地 |
|---|---|
| 建立 drawing，來自 drawing surface | 圖號工作臺，以實際 drawing number查詢並開啟該列 |
| 建立 part，來自 part surface | 料號工作臺，以實際 part number查詢並開啟該列 |
| 建立 cross-type identity | 對應新 identity的工作臺 |
| 來自 search或只建立 root context | 編號搜尋，以實際 rootCode查詢 |

- 目的地只能使用 API actual result，不使用 preview。
- Back／取消回到驗證過的 same-origin `returnTo`；無合法 returnTo時回原工作臺。
- 成功後 browser form state與 idempotency key清除；reload不得重送。

## 9. Data Invariants

| Flow | Root Δ | Part Δ | Drawing Δ | Formal relation Δ |
|---|---:|---:|---:|---:|
| new root + purchased part | +1 | +1 | 0 | 0 |
| new root + manufactured M drawing_part | +1 | +1 | +1 | +1 manufacturing |
| new root + purchased R drawing_part | +1 | +1 | +1 | +1 reference |
| existing root + part | 0 | +1 | 0 | 0 |
| existing root + drawing | 0 | 0 | +1 | 0 或依 canonical rule +1 |
| existing root + drawing_part | 0 | +1 | +1 | +1 |

共同 invariant：

- sequence不重複、不回收已正式存在 identity。
- new_root root/child、drawing_part與formal link為同一 transaction；失敗全部 rollback。
- existing root在 root-first lock後重新計算 sequence與 policy。
- 每個 part最多一張 primary manufacturing drawing；R不得成為 manufacturing basis。
- UI不自行推測 delta；QA以 API response與 DB readback核對 exact IDs。
- manufactured new root不得 part-only；建立時即具備 M 圖。purchased預設不需圖，只有使用者明確勾選時建立 R 圖。

### 9.1 Canonical workbench initial state

Identity與新工作臺列必須在同一個domain transaction內建立，不允許「API已成功但工作臺找不到」的中間狀態：

- 每個新Part同交易建立一個`pdm_workbench_aggregates(part)`及唯一`canonical_workbench_states(part_formal)`；`handling=none`，不建立Part revision或change work。
- 每個新Drawing同交易使用既有DEV-087模型建立第一個canonical研發工作版`0.1`：一個Drawing aggregate、一個open branch、一個`0.1` work claim、一個`preparing` revision、一個owner work及一個`drawing_rd / handling=owner`state。`predecessor_revision_id`與production baseline均為null，`open_branch_count=1`。
- 初始`0.1`由實際建號actor持有；actor、company、Drawing identity任一不一致時整筆建號rollback，不得只留下孤兒identity或state。
- idempotency replay若讀到既有identity，必須回傳同一結果且不得新增第二個aggregate、state、branch、claim、revision或work。
- 本節只定義「新identity如何進入既有canonical lifecycle」，不新增table／column、第二套state authority或legacy workspace projection。

## 10. Error and Concurrency Contract

後端至少保留／正規化下列錯誤類別：

- `validation_error`：欄位就地顯示。
- `numbering_duplicate`：指出衝突 identity，不清空輸入。
- `root_not_found`／`root_locked`／`append_not_allowed`。
- `permission_denied`／`company_scope_mismatch`。
- `idempotency_conflict`。
- `concurrency_conflict`：重新取得 append policy與 preview。
- `relation_conflict`：M/R或primary規則失敗，零partial write。
- `service_unavailable`：保留輸入與安全重試。

client不得把非 2xx一律顯示成「系統切換中」。錯誤訊息必須指出使用者下一步，但不洩漏 SQL、stack、internal ID或 raw authority狀態。

## 11. Accessibility and Interaction

- 所有欄位有可感知 label、required與錯誤關聯。
- radio／segmented control可用方向鍵，root combobox可鍵盤搜尋、選取與清除。
- 錯誤送出後 focus移到第一個錯誤；async duplicate/preview使用非干擾 live region。
- loading不移除已輸入內容；主要按鈕只在 mutation進行中 disabled。
- Escape不直接丟棄有輸入的完整頁面；Back與取消遵守 dirty confirm。
- 320、768、1024、1440px驗證無遮蔽、無水平捲動與合理 tab order。

## 12. Repository Implementation Inventory

### 12.1 Add

- `src/app/numbering/create/page.tsx`：route、server-safe query normalization與 page shell。
- `src/components/canonical-numbering-create-form.tsx`：單一 progressive form與 UI state。
- `src/lib/canonical-numbering-create-contract.ts`：typed union、normalizer、field/error mapping。
- `src/lib/numbering-preview.ts`：canonical read-only preview helper。
- `src/app/api/numbering/records/preview/route.ts`：new-root預估 API。
- `scripts/qc-dev-093-*.mjs`：contract、API/data、browser與retirement focused gates。

### 12.2 Modify

- `src/components/canonical-numbering-create-action.tsx`：縮成 entry link/action，不再擁有 modal form或 mutation。
- `src/components/canonical-pdm-workbench.tsx`：頁首及 Drawing／Part drawer context入口；沿用 dirty-navigation guard。
- `src/app/numbering/search/page.tsx`：共用入口，不再 auto-open legacy create mode。
- `src/app/api/numbering/roots/[rootCode]/append-policy/route.ts`：切到 canonical preview helper。
- `src/app/api/numbering/records/route.ts`與三條 root append route：只在需要時補 typed validation/error normalization；不改 domain authority。
- `src/lib/repositories/numbering-async-repository.ts`：identity、Part formal state與Drawing初始`0.1` RD work同交易提交；所有provider共用同一SQL contract。
- `src/app/globals.css`：建立頁的最小 responsive/form樣式，不建立獨立卡片設計系統。
- `package.json`：focused QA scripts。
- active navigation callers：把仍指向 `?tab=reserved` 的真正建號入口改到 `/numbering/create`；非本期的 upload／blocked flow若語意不明，先列 inventory後由既有 owner contract決定，不可盲改。

### 12.3 Delete after caller=0

- `src/lib/number-candidate-preview.ts`。
- `CanonicalNumberingCreateAction`內現有 full modal、local mutation與 old query auto-open branch。
- DEV-093 scope內所有 `draft-workspaces/**`、`tab=reserved`、`create=new_bundle` caller。

### 12.4 No change

- 除既定 `044_canonical_item_kind_two_values.sql` 與 `045_part_number_draft_item_type_two_values.sql` 外的 DB schema與 migration。
- Drawing／Part work、review、revision、release資料模型（本期只使用既有Drawing模型建立初始`0.1`，不改模型）。
- `drawing_part_links` schema與 DEV-090 formal authority。
- production provider與正式資料。

## 13. Phases and Handoff

### Phase 093-A：Contract and inventory

- 建立 typed intent、API/error/result mapping。
- 列出五個 entry／六種合法業務結果與 legacy caller inventory；Phase G以前的五種基線由new-root推導規則取代。
- 建立 preview no-write與 retirement negative gate。

### Phase 093-B：Server adapter and preview

- canonical new-root preview。
- append policy切換 preview helper。
- server validation／permission／company／idempotency回歸。
- M／R relation authority與 atomic result驗證。

### Phase 093-C：Unified page and entries

- `/numbering/create` progressive form。
- Drawing／Part header、Drawing／Part drawer、search入口。
- safe return、success navigation、error state retention與 RWD/a11y。

### Phase 093-D：QA/QC and retirement

- 六種合法業務flow的 UI-only journey。
- DB/API/UI三方一致、double-submit與fault recovery。
- fresh-session兩輪、legacy injection、caller=0。
- typecheck、focused lint、isolated build、console/network/5xx sweep。

### Phase 093-E：Corrective naming guidance and progressive disclosure

- 恢復主要名詞、兩類型命名段落、系列代號建議清單、即時建議品名、套用與確定品名。
- 依 scope/content/itemKind/isUniversal 收斂畫面與 payload；drawing-only 不顯示／送出 Part 欄位，existing-root 不執行品名查重。
- 補 typed duplicate candidate、preview／append-policy 可區分錯誤與重試、欄位就地錯誤、300 字名稱與正常尺寸的共用件控制。

### Phase 093-F：Corrective QA and false-positive prevention

- 將 focused contract gate從字串存在檢查改為可失敗的行為／DOM／payload assertion。
- 新增 QA-093-073..099，並重跑受影響的 QA-093-006／008／028／029／035／050／059..066。
- 兩輪 fresh session驗證建議品名、系列 metadata、最終 coreName、API response、DB與工作臺 UI一致。

### Phase 093-G：New-root content derivation

- 移除新圖料的`建立內容`選擇，改由料件類型與外購參考圖 checkbox推導 typed intent。
- client contract與server route共同阻擋 manufactured part-only、manufactured R及purchased M。
- 以 rendered UI驗證 manufactured M bundle、purchased part-only與purchased R bundle三條新圖料路徑。

Gate：QA-093-100..104與兩輪 fresh-session UI／DB／API reconciliation全部通過。

### Phase 093-H：Single-source specification

- 移除新圖料重複的`自訂規格`與獨立`nameFeature`／`nameSpecificationModel`前端狀態。
- 依圖製作件的`規格／特性`及外購標準件的`規格／型號`直接共用`customSpecification`，同時驅動建議品名與持久化payload。
- `規格／特性`只屬於建立新圖料的命名與料件設定；existing-root不得再次輸入或改寫，drawing-only維持field allowlist。

Gate：QA-093-105、兩輪fresh-session manufactured／purchased UI→request→DB equality；existing-root request不含規格欄且DB繼承root profile；桌面與320px畫面均通過。

### Phase 093-I：Reason-free universal item

- 共用件只保留獨立勾選；移除`共用原因`欄位、前端狀態、typed intent欄位與 canonical request mapping。
- new-root與existing-root的 canonical Part建立均可在只勾選共用件後提交；後端不再以`universalReason`阻擋或寫入新資料。
- 既有資料庫`universal_reason`欄位與歷史資料暫保，避免本期為了 UI 精簡引入破壞性 migration；新流程不讀取、不顯示、不新增值。

Gate：QA-093-106／107／108／109、兩輪fresh-session共用件建立與existing-root根號料件設定沿用的 UI／request／DB reconciliation通過，且`universalReason` caller與欄位掃描為0。

### Phase 093-J～L：Existing-root quiet append（最新決策，取代舊唯讀設定列）

- 本期只精簡「加到既有圖料」；「建立新圖料」既有流程與欄位不變。
- UI只顯示：已鎖定的圖料根號與品名、`料號／圖號／圖號與料號`三選一、選到圖號時的M／R與R用途、政策實際要求時的追加原因、單行「將建立」結果，以及取消／建立編號。
- UI不得顯示`料件類型`、`結構型態`、`共用件`、`系列代號`、`規格／特性`，也不顯示「沿用根號設定」狀態列、命名器、相似品名、獨立教學或大型預覽卡。
- existing-root的Part-producing request只傳root、內容、圖面用途、參考用途、追加原因與idempotency資料；不得傳送上述料件profile欄位。
- `GET /append-policy`仍回傳internal `inheritedPart`供政策判定，但一般UI不渲染。server repository在交易內重新讀取第一筆canonical Part的`itemKind`、`structureType`、`isUniversal`、`seriesCode`、`customSpecification`並完整繼承；根號尚無Part時採`root.itemKind + single_part + false + null + null`安全預設。
- 若舊資料的`structureType=unclassified`，policy回傳`profileBlocked=true`，UI停用提交且只顯示「此圖料根號的料件資料不完整，請系統管理員處理。」；repository同時以`PART_ROOT_STRUCTURE_TYPE_UNCLASSIFIED` fail closed。
- 相容client若明示profile欄位，server只把它們當作一致性assertion；與root profile不一致時以`PART_ROOT_ITEM_KIND_MISMATCH`或`PART_ROOT_STRUCTURE_TYPE_MISMATCH`拒絕，不得用client值改寫根號profile。
- 桌面與窄版均使用一套扁平、短流程版面；每個畫面只有一個主要動作「建立編號」。

Gate：QA-093-108～110、兩輪fresh-session existing-root UI無五項重複設定、request allowlist正確、DB五項profile與來源Part一致、異常profile fail closed、API／DB／UI reconciliation與legacy caller=0全部通過。

## 14. Definition of Done

全部成立才可重新宣告 DEV-093 本機交付完成並進入後續 release gate：

1. 四個必要入口與 search入口都導向同一 canonical頁。
2. 六種業務 flow全部成功，資料 delta、relation、audit／outbox／receipt exactly once。
3. 建立新圖料完整呈現主要名詞、類型條件段落、建議品名、套用與確定品名；依圖製作件建議品名自動包含系列代號，且同值正確持久化為獨立 metadata。
4. M／R、兩種料件類型、無原因的獨立共用勾選、條件式系列、單一規格來源、append reason、root lock與 duplicate語意符合本規格。
5. 預估 API無任何 write；提交使用實際原子配置號碼。
6. 重複提交不重複建號；未知結果可以同 key安全恢復。
7. 錯誤保留輸入且 focus／keyboard／窄版可完整操作。
8. rendered UI、API response、DB readback identity、確定品名、系列 metadata與數量一致。
9. runtime／navigation／API／worker／script scan的 DEV-093 legacy caller=0；負向注入能使 gate失敗。
10. 不新增 table／column、workspace、reservation、fallback或雙寫；分類整併只允許既定 `044`／`045` forward migrations。
11. QA-093-001..110兩輪 fresh session全部通過，P0/P1=0、Blocked=0、Not Run=0；focused gate注入移除建議器、系列段落、單一規格來源、無原因共用勾選、Part change／detail projection／linked append任一原因語意、條件先行順序、查重鄰近呈現、新圖料推導、existing-root quiet append五項profile繼承、異常profile阻擋、候選明細或 field allowlist任一缺口時必須 FAIL。
12. 每個UI新建Part都有且只有一個`part_formal`state；每個UI新建Drawing都有且只有一個`0.1 drawing_rd owner work`，actual number、DB state、API result及工作臺列100%一致。

## 15. Execution Boundary

本文件授權 RD 在本機執行 Phase 093-E～093-L corrective slice，並以 disposable/local資料驗證；既有 Phase 093-A～093-D僅作架構基線。不得因此執行 production資料寫入、Cloud SQL migration、deploy、release、merge或正式流量切換。若實作需要額外 schema、恢復 retired API或改變 production authority，立即停止並回 Dev PM重新做 Spec Impact Preflight。

## 16. Implementation Evidence（2026-08-24）

> **Corrective slice completed locally**：歷史16/16 contract evidence只保留為假陽性CAPA基線；目前完成判定只接受新版行為gate、兩輪fresh-session UI journey、DB/API/UI reconciliation與canonical初始state證據。正式migration、deploy及release仍未授權。

- 已完成 Phase 093-A～093-C 的本機實作：typed intent、canonical preview helper／route、`/numbering/create` progressive form、header／search／drawer安全導向入口、既有 root append adapter與 M/R relation guard。
- `CanonicalNumberingCreateAction` 已不再持有 modal、local mutation或 legacy query auto-open；drawer context action沿用關聯矩陣 dirty-navigation guard。
- `append-policy` 已切換至 `src/lib/numbering-preview.ts`；舊 `src/lib/number-candidate-preview.ts` 已在 caller=0後移除。canonical preview不讀取 `number_candidate_reservations`，不寫 sequence、reservation、audit或outbox。
- focused evidence：`npm run typecheck:app` PASS；`npm run qc:dev-093:contract`行為gate PASS（含QA-093-100..109）；`npm run qc:dev-093:retirement` PASS（active src caller=0）；affected ESLint PASS；`npm run build:isolated` 122/122 PASS且主資料庫雜湊不變；`npm run qc:dev-093` aggregate PASS（disposable SQLite + 真實 Chromium，兩輪 fresh session、六種合法業務mutation、共用件只勾選建立、existing-root四項料件profile唯讀沿用、三種非法組合400且DB delta=0、DB/API/UI/workbench-state reconciliation、single-source specification UI→request→DB equality、double-submit exactly-once、M primary／R reference relation、preview/reservation stability、legacy caller=0、network/console/page error sweep）。最新 evidence 位於 `output/qa/dev-093/DEV093-2026-08-24T11-51-41-869Z/`；115項check全數通過、response 577，且共用件DB為`is_universal=1`、`universal_reason=null`、request不含`universalReason`。資料由roots `4→14`、parts `4→18`、drawings `4→16`、links `3→13`、part formal states `4→18`、initial Drawing works `3→15`，candidate／recovery維持0。
- allocator repair：root allocation與new-root preview會排除正式根號及非`cancelled`的canonical `drawings` projection；drawing allocation會避開既有`drawing_numbers`與active canonical projection collision，避免舊投影在正式同步階段造成唯一鍵衝突。
- item-kind consolidation：canonical form／change work／numbering APIs 現在只接受 `manufactured|purchased` compatibility codes，人類標籤固定為`依圖製作件|外購標準件`；`outsourced|custom`確定映射至`manufactured`，舊`shared`因缺少基礎分類語意不得猜測，須先由 provider-aware converter 明確分類並保留`isUniversal=true`。fresh schema、`044`正式料件 migration與`045`change-control draft migration已補上，正式套用仍須通過 unresolved=0、100% reconciliation與release gate。
- Phase 093-E已完成：typed discriminated union、兩類命名公式、系列清單／自創、條件先行再命名、無主要名詞不產生半成品建議、建議套用、確定品名、5筆相似候選、field allowlist、AbortController stale-response防護、fail-closed policy與正常尺寸共用件checkbox均落地。
- Phase 093-F已完成：新建Part同交易建立`part_formal`；新建Drawing同交易建立canonical`0.1` RD owner work。2026-08-24兩輪fresh-session browser run已證明UI建號後可立即在對應工作臺看到actual identity與`研發版 0.1`，且沒有legacy caller、reservation mutation、console/page/network error。
- Phase 093-G已完成：新圖料UI不再顯示冗餘`建立內容`；manufactured固定送出M圖＋料號，purchased預設料號且只有勾選參考圖後才送出R圖＋用途。typed contract與server route共同fail closed，existing-root三種追加選項回歸通過。
- Phase 093-H已完成：新圖料與existing-root新增Part均只有一個規格輸入；依圖製作件顯示`規格／特性`、外購標準件顯示`規格／型號`。同一值已在兩輪fresh session中證明同步驅動建議品名、request `customSpecification`與DB `part_numbers.custom_specification`；drawing-only payload仍不帶入。
- Phase 093-I已完成：共用件改為純勾選，不再顯示或要求`共用原因`；canonical create 的 UI、typed intent、request與新增資料均不含`universalReason`。既有`universal_reason`欄位暫保為歷史資料相容，未執行破壞性schema刪除。
- 本機corrective scope已完成並通過focused QA/QC；父canonical command既有permission／company／idempotency／concurrency guard維持不變。正式PostgreSQL migration rehearsal、production data reconciliation、deploy與release不包含在本完成判定，仍須獨立授權。
