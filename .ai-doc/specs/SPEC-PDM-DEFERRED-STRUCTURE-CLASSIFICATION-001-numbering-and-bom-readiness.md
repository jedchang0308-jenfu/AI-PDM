# SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001：結構型態延後分類與 BOM Readiness 解耦

> **Superseded 2026-08-28**：DEV-095 已退役 BOM readiness 與 Part 結構分類功能。本文只保留歷史追溯，不得作為現行實作或驗收 authority。

狀態：`Historical / Superseded by DEV-095 / Do Not Restore`

日期：2026-08-26

Owner：Dev PM

DEV：`DEV-099`

來源 ID：`DEV-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001`

關聯：`DEV-093`、`DEV-096`、`DEV-090`、`DEV-087`

Decision：`.ai-doc/decisions/ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001-deferred-exact-part-authority.md`

QA：`.ai-doc/qa/qa-dev-099-deferred-structure-classification-validation-plan-2026-08-26.md`

風險：High（跨建號 UI／API、Part 主資料分類、BOM 入口、權限、交易與 SQLite／PostgreSQL provider）

## 0. Human Decision 與結論

使用者已確認：

1. 結構型態不必在建立編號階段決定；建立編號不應因未分類而失敗。
2. 不新增組立件首頁、sidebar、wizard 或另一套圖料入口；組立件仍是既有 Drawing／Part identity。
3. 結構型態的 authority 是 exact Part Number，不是圖料根號、Drawing、3D 檔名或 BOM 是否存在。
4. 只有已分類為組立件的 Part 才出現 BOM 區；BOM 動作仍須再符合製造條件。
5. 同 root 的顏色或其他非結構差異 Part 可在分類時複選並一次套用，但不得自動套用整個 root。
6. 3D 檔以圖料根號命名時，只能解析出 root 候選；不能由檔名自動決定 exact Part、結構型態或 BOM。

本 DEV 採「身份建立、結構分類、BOM readiness」三層解耦：

```text
建立編號
   │ 只建立 canonical identity
   ▼
Part.structure_type = unclassified
   │
   ├─ 之後在既有 Part drawer 分類為 single_part
   │      └─ 不顯示 BOM 區
   │
   └─ 之後在既有 Part drawer 分類為 assembly
          └─ server 推導 BOM readiness
                 ├─ manufactured + primary M + active → 建立／開啟 BOM
                 ├─ manufactured + 缺 primary M          → 顯示阻擋原因，無 BOM 動作
                 └─ purchased                            → 顯示不適用製造 BOM，無 BOM 動作
```

## 1. Spec Impact Preflight

分類：`Intentional replacement + cross-spec convergence`。

### 1.1 取代 DEV-093

- 取代 new-root 建號表單必須選擇 `single_part／assembly` 的規則；canonical UI 不再顯示或送出結構型態。
- 取代 new-root request 將 `structureType` 視為 required field 的規則；省略時正式結果固定為 `unclassified`。
- 取代 existing-root 以「第一筆 Part」繼承結構型態及 `unclassified` 必須阻擋追加的規則。
- 保留單一 `/numbering/create` 入口、料件類型推導 M／R、命名器、正式號 transaction allocation、relation authority、權限、audit 與 idempotency。

### 1.2 取代 DEV-096

- 取代 `SPEC-PDM-ASSEMBLY-BOM-REBUILD-001` §5.1、§5.2、§17.1 中 required structure type、`purchased + assembly` 建號 422、root-first inheritance 及 `unclassified` append fail-closed 條款。
- 取代「結構型態只能經既有 Part change work／review 調整」的 Current Phase 限制；改由 exact Part drawer 的專用分類 command、ETag、idempotency、audit 與 BOM conflict gate 管控。
- 保留 stable BOM Definition、explicit Parent applicability、同 root 複選、logical line、Parent-to-Child exact mapping、immutable release snapshot 及「BOM 入口只在 Part drawer」。
- 保留 manufacturing BOM 的 eligibility：只有 `manufactured + assembly + primary manufacturing Drawing M` 可建立或續作。

### 1.3 歷史證據

DEV-093 的 111-case PASS 與 DEV-096 的 88-case PASS 仍是當時 revision 的有效歷史證據，但不能作為 DEV-099 新行為的 current PASS。DEV-099 啟用前 runtime 仍依舊契約運作；啟用後以本規格為準，必須重驗受影響路徑。

### 1.4 ADR 判定

`New ADR required`。本 DEV 改變結構分類的決策時點、authority 操作方式及舊 change-work 要求，屬長期跨模組架構決策。

## 2. Current Phase 範圍

### 2.1 In scope

- new-root 建號 UI／preview／create 省略結構型態，建立 Part 時明確寫入 `unclassified`。
- existing-root 新增 Part 時由 server 依同 root 共識決定初始值；無共識時寫入 `unclassified`，不得阻擋。
- existing-root append policy 不再以 `unclassified` 阻擋 Part 建立。
- 既有 Part drawer 顯示目前結構型態及唯一 `設定結構型態` 動作。
- 同 root、同 company、可用 Part 的明確複選與 all-or-nothing 批次分類。
- exact Part classification GET／PATCH contract、strong ETag、idempotency、permission、audit、transaction 與 stable error。
- BOM 區改由 `structureType === assembly` 才顯示，再由 server 決定 action／blocker。
- purchased Part 可分類為 assembly；Current Phase 不提供製造 BOM 動作。
- SQLite／PostgreSQL repository parity、rendered UI、四 viewport、keyboard／focus、visible-error 與 primary invariant 驗證。

### 2.2 Out of scope

- 新增 sidebar、組立件工作臺、組立件建立頁或 `/bom/new`。
- 新 table、column、enum value、資料回填或正式資料庫 migration。
- 自動把整個 root 全部 Part 改成相同分類。
- 從 `.SLDASM`、檔名、Drawing、BOM existence 或 AI suggestion 自動寫入分類。
- purchased assembly 的供應商 BOM、採購 BOM 或 Reference Drawing R 語意。
- cross-root 批次分類、Released Parent detach／fork、BOM 結構分歧治理。
- production migration、feature activation、deploy、release 或 production smoke。

## 3. Domain Model

### 3.1 型別

```ts
type StoredPartStructureType =
  | "unclassified"
  | "single_part"
  | "assembly";

type DecidedPartStructureType =
  | "single_part"
  | "assembly";

type StructureInitializationSource =
  | "deferred_default"
  | "root_consensus"
  | "explicit_compatibility";
```

`unclassified` 是合法、可查詢、可持久化的 Current Phase 狀態，不是錯誤、migration residue 或 UI warning。只有需要 BOM、變更成另一個 decided type 或進入依賴結構語意的功能時，才要求完成分類。

### 3.2 三個獨立判斷

| 判斷 | Authority | 說明 |
|---|---|---|
| 編號身份 | canonical numbering command | 決定 root／Part／Drawing／relation，不決定未來一定是單件或組立件。 |
| 結構分類 | exact `part_numbers.structure_type` | 每個 Part 可獨立分類；root 只協助候選與初始共識，不是 authority。 |
| BOM readiness | server-derived Part＋Drawing＋BOM projection | 由結構分類、item kind、primary M、record availability 與既有 Definition 推導。 |

### 3.3 Invariants

1. canonical writer 不得依賴資料庫 `DEFAULT 'single_part'`；所有 Part INSERT 必須明確寫入有效 structure type。
2. new-root canonical UI 省略時必須明確寫 `unclassified`。
3. existing-root 共識只決定新 Part 的初始值，不會回寫任何既有 Part。
4. mixed／empty／含 unclassified 的 root 都視為無 decided consensus，新 Part 寫 `unclassified`。
5. exact Part 是分類 authority；同 root 批次更新仍是多個明確 target IDs，不是 root-level 欄位。
6. 分類 command 必須把 current context Part 包含在 targets，server 不信任 client 的候選範圍、排序或現況值。
7. 任一 target 不合法時整批 zero write；不得只更新合法子集合。
8. 改成 `single_part` 前，該 Part 不得有 current/open/released BOM applicability；obsolete-only history 可保留且不被改寫。
9. 分類不建立、修改、複製或刪除 BOM Definition、Drawing、relation 或檔案。
10. BOM section 只在 exact Part 的 effective type 為 `assembly` 時出現；client 不自行重算 eligibility。

## 4. Numbering Contract

### 4.1 New-root input／output

canonical UI 與正常 request 不含 `structureType`：

```ts
type CanonicalNewRootIntent = {
  scope: "new_root";
  itemKind: "manufactured" | "purchased";
  // existing naming / M-R fields
  structureType?: "single_part" | "assembly"; // compatibility only
};
```

| Input | Effective structure type | Result |
|---|---|---|
| canonical UI 省略 | `unclassified` | 依 DEV-093 建立 Part／必要 M 或 R；不阻擋。 |
| 相容 client 明示 `single_part` | `single_part` | 接受並記錄 `explicit_compatibility`。 |
| 相容 client 明示 `assembly` | `assembly` | 接受；purchased 亦可建立，但沒有製造 BOM action。 |
| 未知值 | 無 | 422、zero sequence／root／Part／Drawing／relation write。 |

preview 回傳：

```json
{
  "effectiveStructureType": "unclassified",
  "structureInitializationSource": "deferred_default",
  "outputs": ["part", "drawing_m"]
}
```

正式 create 的 receipt、audit 與 idempotency fingerprint 必須包含 effective value 及 initialization source；preview 仍為 read-only，不配置號碼。

### 4.2 Existing-root Part 初始化

canonical `parts` 與 `drawing-part` request 省略 `structureType`。server 在 root-scoped transaction 中讀取同 company／root、仍在 canonical current Part projection 的所有 Parts：

| 現況 | 新 Part 初始值 | Source |
|---|---|---|
| 全部既有 Parts 都是 `single_part` | `single_part` | `root_consensus` |
| 全部既有 Parts 都是 `assembly` | `assembly` | `root_consensus` |
| 沒有既有 Part | `unclassified` | `deferred_default` |
| 存在 `unclassified` | `unclassified` | `deferred_default` |
| `single_part`／`assembly` 混合 | `unclassified` | `deferred_default` |

root consensus 是安全的初始化便利，不是 root authority。相容 client 若明示結構型態，只能作 assertion；只有與 decided consensus 相同時接受，否則回 `PART_ROOT_STRUCTURE_TYPE_MISMATCH`／409、zero write。無 decided consensus 時不得用 client assertion 越過 deferred classification。

`GET /api/numbering/roots/[rootCode]/append-policy` 不再因 `unclassified` 回 `profileBlocked=true`。可以回傳 read-only `structureInitialization` 供 preview 使用，但 canonical UI 不顯示「沿用設定」或新增分類欄。

### 4.3 Active writer convergence

RD 必須盤點所有會 INSERT `part_numbers` 的 runtime／migration／recovery writer：

- canonical new-root；
- existing-root Part；
- existing-root Drawing＋Part；
- Drawing-context compatibility Part writer；
- replacement／formalization／migration 中仍屬 active 的 Part writer。

每一個 active runtime writer都必須明示 structure type；禁止由 physical default 產生新 `single_part`。historical converter 若有自己的已核准規則可保留，但不得被 normal UI 呼叫。

## 5. Exact Part Classification Contract

### 5.1 UI Entry Contract

| 欄位 | 契約 |
|---|---|
| Target actor | 具有 `numbering.workspace.update` 且可讀 exact Part 的工程／管理使用者。 |
| 正常起點 | 既有 `/parts` 料號工作臺，開啟 exact Part drawer。 |
| 唯一入口 | Part 基本資料中的目前結構型態旁顯示 `設定結構型態`；不新增 sidebar、頁面或全域 CTA。 |
| 可見條件 | exact Part 可用、同 company、使用者有 update permission；無權限只顯示目前值，不顯示動作。 |
| 正常路徑 | 開啟分類 dialog → 選單一零件／組立件 → 可複選同 root Parts → 必要時填原因 → 儲存 → drawer 原位刷新。 |
| Destination | 不導航離開工作臺；成功後 dialog 關閉、分類與 server-derived BOM section 同一 readback 更新。 |
| Fail hard | 入口不存在、從非 Part surface 出現、無權限仍可操作、direct URL 才能找到、點擊無反應、visible 4xx/5xx 或成功後 readback 不一致。 |

### 5.2 Read endpoint

```http
GET /api/pdm/parts/{partId}/structure-type
```

回應必須 bounded；Current Phase hard cap 100 candidates，超過時回 stable blocker，不做截斷後誤導性的「全部」：

```json
{
  "contextPart": {
    "partNumberId": "part-1",
    "partNumber": "A0001-P01",
    "name": "外殼_黑",
    "structureType": "unclassified"
  },
  "candidates": [
    {
      "partNumberId": "part-1",
      "partNumber": "A0001-P01",
      "name": "外殼_黑",
      "structureType": "unclassified",
      "distinguishingAttributes": {
        "materialCode": null,
        "materialLabel": null,
        "colorCode": "BK",
        "colorLabel": "黑色",
        "surfaceTreatment": null
      },
      "selected": true,
      "locked": true,
      "eligible": true,
      "blocker": null
    }
  ],
  "allowedTargets": ["single_part", "assembly"],
  "requiresReason": false
}
```

Response headers：

- `ETag: "<strong-classification-etag>"`
- `Cache-Control: no-store`
- `x-pdm-workbench-contract: <server contract token>` 或 response body 等價 token。

ETag 必須涵蓋 company、root、context Part、候選 target IDs、各 target 的 current structure type／availability／BOM applicability fingerprint；不得只用時間戳。

candidate的distinguishing attributes只讀現有`part_variant_attributes`，不得建立第二份顏色／材質authority。
repository使用bounded set query／join讀取context、candidates、attributes與BOM fingerprint；1筆與100筆target都不得
出現per-Part query，QA以statement instrumentation驗證無N+1。

### 5.3 Mutation endpoint

```http
PATCH /api/pdm/parts/{partId}/structure-type
If-Match: "<strong-classification-etag>"
Idempotency-Key: <uuid>
x-pdm-workbench-contract: <token>
Content-Type: application/json
```

```json
{
  "targetStructureType": "assembly",
  "targetPartNumberIds": ["part-1", "part-2"],
  "reason": "兩個料號僅顏色不同，共用相同結構"
}
```

Rules：

1. `partId` 必須存在於 `targetPartNumberIds` 且 server 固定保留 current context Part。
2. targets 去重、hard cap 100、全部同 company／root，並在 canonical current Part projection 可用。
3. `targetStructureType` 只允許 `single_part／assembly`；mutation 不接受寫回 `unclassified`。
4. `unclassified → decided` 不強制原因；`single_part ↔ assembly` 或 targets 超過一筆時要求 trim 後 1..500 字原因。
5. target 已是相同值時為 idempotent no-op；仍回傳完整 readback，不製造重複 audit。
6. `assembly → single_part` 遇 current/open/released applicability 時整批回 409，指出阻擋 Part，但不洩漏跨 company identity。
7. `purchased → assembly` 合法；只改分類，不建立 M 圖或 BOM。
8. server 在 transaction 內重算 ETag、eligibility 及 BOM conflict；不得信任 GET 後的 client snapshot。

成功：

```json
{
  "targetStructureType": "assembly",
  "updatedPartNumberIds": ["part-1", "part-2"],
  "unchangedPartNumberIds": [],
  "bomReadiness": {
    "part-1": "eligible",
    "part-2": "blocked_missing_primary_m"
  }
}
```

### 5.4 State transition matrix

| Before | Target | 條件 | Result |
|---|---|---|---|
| unclassified | single_part | Part 可用 | allowed |
| unclassified | assembly | Part 可用 | allowed；BOM readiness另算 |
| single_part | single_part | 任意 | no-op success |
| assembly | assembly | 任意 | no-op success |
| single_part | assembly | 無資料狀態阻擋 | allowed |
| assembly | single_part | 無 current/open/released BOM applicability | allowed |
| assembly | single_part | 有 current/open/released applicability | 409、zero write |
| 任意 | unclassified | 不支援 | 422、zero write |
| 任意 | 任意 | target inactive／cross-company／cross-root／stale ETag | 404／409、zero write |

### 5.5 Transaction／locking／audit

鎖序固定：

1. company／root logical lock；
2. target Part IDs 依 lexical order；
3. 涉及的 BOM Definition／binding IDs 依 lexical order；
4. platform command receipt。

command name 固定為 `part.structure_type.classify`。使用既有 `platform_command_receipts` 保存 fingerprint、結果與 replay；同 key＋同 fingerprint 回原結果，同 key＋不同 fingerprint 回 409。audit 必須保存 actor、company、context Part、每個 target before／after、reason、request correlation、timestamp；無外部 side effect，不新增 outbox。任一 fault point rollback Part、receipt provisional state及 audit partial rows。

## 6. BOM Readiness 與 UI Contract

### 6.1 Server projection

`CanonicalPartBomContext` 保留 structure type，並將 eligibility／blocker 視為唯一 server authority：

| Exact Part | BOM section | Action |
|---|---|---|
| unclassified | 不顯示 | none |
| single_part | 不顯示 | none |
| assembly＋manufactured＋primary M＋無 Definition | 顯示最小 BOM 區 | `create_bom` |
| assembly＋manufactured＋primary M＋既有 Definition | 顯示 Revision／狀態／適用數 | `open_bom` |
| assembly＋manufactured＋缺 primary M | 顯示最短阻擋原因 | none |
| assembly＋purchased | 顯示「不適用製造 BOM」 | none |
| assembly＋inactive／authority conflict | 顯示 stable blocker 或歷史入口 | none／existing history only |

BOM action 不得出現在 Drawing drawer、new-root form、sidebar 或分類 dialog。`part-bom-context.tsx` 只能渲染 server result，不能從 client item kind／Drawing list自行組合 eligibility。

### 6.2 Minimal classification dialog

保留：

- exact current Part 唯讀且預選、不可取消；
- `單一零件／組立件` 二選一；
- 同 root candidate checkbox，顯示料號、品名及必要的顏色／規格差異；
- 只有規則要求時才顯示原因；
- 一個 primary `儲存`、一個 secondary `取消`。

刪除：

- 建號階段的結構型態欄；
- root 全選預設、BOM 建立選項、Drawing／CAD 來源、教學卡、步驟列、成功頁；
- 每個 candidate 的重複狀態 badge／說明。不可選者只保留 disabled state 與最短原因。

### 6.3 Loading／empty／error／recovery

- GET loading：dialog skeleton／status，不顯示可提交的舊候選。
- 同 root 無其他候選：只顯示 current Part，流程仍可完成。
- candidate 超過 100：阻擋批次 dialog並提示改為單筆或管理性處理；不得 silent truncate。
- 412 stale：保留人類選擇與 reason，重新 GET 後要求使用者再確認，不自動重送 mutation。
- 409 BOM conflict：保留 dialog，將錯誤放在受影響 targets 附近；不得出現假成功。
- 5xx／network：顯示就地 error、保留輸入，可重試；drawer 不先樂觀改值。
- success：關閉 dialog、focus 回 trigger、fresh detail GET readback；不顯示額外成功 modal。

### 6.4 RWD／accessibility

必驗 viewport：`1440×900`、`1024×768`、`768×1024`、`390×844`。dialog 不得水平 overflow、雙重捲動、截斷候選或擠壓主要動作。radio、checkbox、disabled reason、error 使用正確語意；Tab順序為 target type → candidate list → conditional reason → primary → cancel；Escape只在非 saving 時關閉，關閉後 focus 回入口。

## 7. Stable Error Contract

| Code | HTTP | 人類語意 |
|---|---:|---|
| `PART_STRUCTURE_TARGET_INVALID` | 422 | 請選擇單一零件或組立件 |
| `PART_STRUCTURE_TARGETS_REQUIRED` | 422 | 至少保留目前料號 |
| `PART_STRUCTURE_BATCH_LIMIT_EXCEEDED` | 422 | 同次最多處理 100 個料號 |
| `PART_STRUCTURE_REASON_REQUIRED` | 422 | 此變更需要填寫原因 |
| `PART_STRUCTURE_CROSS_ROOT` | 409 | 所選料號不屬於同一圖料 |
| `PART_STRUCTURE_TARGET_UNAVAILABLE` | 409 | 部分料號目前不可變更 |
| `PART_STRUCTURE_BOM_CONFLICT` | 409 | 部分組立件仍有使用中的 BOM，不能改為單一零件 |
| `PART_STRUCTURE_STALE` | 412 | 料號狀態已更新，請重新確認 |
| `PART_STRUCTURE_IDEMPOTENCY_CONFLICT` | 409 | 相同操作識別對應到不同內容 |
| `PART_ROOT_STRUCTURE_TYPE_MISMATCH` | 409 | 相容要求與目前圖料共識不一致 |
| `PART_STRUCTURE_NOT_FOUND` | 404 | 找不到可存取的料號 |
| `PART_STRUCTURE_FORBIDDEN` | 403 | 沒有變更此料號的權限 |

一般 UI 不得顯示 SQL、table、column、constraint、provider、stack 或 raw internal ID。

## 8. Schema／Migration／Compatibility

### 8.1 Current Phase

- 新 table：0。
- 新 column：0。
- 新 enum value：0；沿用 `unclassified／single_part／assembly`。
- 資料 backfill：0。
- SQLite／PostgreSQL migration：0。
- production data mutation：未授權。

physical schema 目前仍可能有 `DEFAULT 'single_part'`；本 DEV 不以變更 default 作為正確性前提。所有 active canonical writer 必須明示值，QC 以 writer inventory與DB readback阻止 silent default。修改 physical default 列為 writer convergence 完成後的 Future Phase hygiene，不得在本期順手改 migration history。

### 8.2 Existing data

- 既有 `single_part／assembly／unclassified` 不批次改寫。
- DEV-096 BOM binding仍能證明相關 Part 是 assembly，但本 DEV 不以「BOM存在」反向自動修正欄位。
- 發現 assembly binding 對應非 assembly、cross-company 或 orphan 時停止，不以本 DEV 分類 command掩蓋資料問題。

### 8.3 Rollback

產品 activation 必須 coherent：canonical numbering UI、server create、existing-root initializer、classification API／UI與BOM projection同一 release artifact啟用。不得只移除欄位但仍讓 API required，也不得先放寬 API 而沒有 Part 分類入口。rollback 回到前一完整 artifact；不回寫 DEV-099 已分類資料，因 `single_part／assembly／unclassified` 均為舊 schema合法值。

Current Phase不新增DEV-099 feature flag，因建號payload與資料初始化語意不能安全地由client/server分段切換。既有
`PDM_ASSEMBLY_SHARED_BOM_V1`只繼續控制DEV-096 BOM capability，不控制Part分類或numbering semantics。

## 9. Exact Repository Impact

### 9.1 Add

| File | Responsibility |
|---|---|
| `src/lib/part-structure-classification.ts` | typed input/output、state rule、ETag canonicalization、stable errors；不得含 DB access。 |
| `src/lib/repositories/part-structure-classification-async-repository.ts` | provider-neutral candidate read、lock、revalidate、receipt、audit與atomic mutation。 |
| `src/app/api/pdm/parts/[partId]/structure-type/route.ts` | GET／PATCH auth、permission、headers、payload allowlist、stable response。 |
| `src/components/part-structure-classification.tsx` | Part-only trigger＋minimal dialog＋batch selection／stale recovery。 |
| `scripts/qc-dev-099-contract.mjs` | UI/API/type/retirement與active writer contract。 |
| `scripts/qc-dev-099-repository.mjs` | consensus、state、ETag、permission、idempotency、fault與provider-neutral repository checks。 |
| `scripts/qc-dev-099-browser.mjs` | normal entry、rendered mutation、visible error、four viewport與accessibility。 |
| `scripts/qc-dev-099-postgres.mjs` | task-owned disposable PostgreSQL transaction／lock／receipt parity。 |
| `scripts/qc-dev-099-aggregate.mjs` | fixed 48-case denominator、provenance、primary invariant與cleanup。 |

### 9.2 Modify

| Area | Exact files |
|---|---|
| numbering contract/UI | `src/lib/canonical-numbering-create-contract.ts`、`src/components/canonical-numbering-create-form.tsx` |
| numbering routes | `src/app/api/numbering/records/route.ts`、`records/preview/route.ts`、`roots/[rootCode]/parts/route.ts`、`roots/[rootCode]/drawing-part/route.ts`、`drawings/[drawingNumber]/parts/route.ts`、`roots/[rootCode]/append-policy/route.ts` |
| numbering repositories | `src/lib/repositories/numbering-repository.ts`、`src/lib/repositories/numbering-async-repository.ts`、`src/lib/numbering-async.ts` |
| Part projection/UI | `src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/pdm-canonical-workbench.ts`、`src/lib/repositories/pdm-canonical-workbench-async-repository.ts`、`src/components/canonical-pdm-workbench.tsx` |
| BOM context | `src/components/part-bom-context.tsx`及必要的DEV-096 projection tests；只收斂server-derived visibility，不改shared BOM authority。 |
| validation wiring | `package.json`及DEV-093／096 affected runner assertions。 |

### 9.3 No-touch

- `db/schema.sql`、`db/postgres/048_shared_assembly_bom.sql`與全部既有 migration history。
- BOM Definition／binding／component／review／release schema。
- Drawing／Part lifecycle state、Relation authority、CAD attachment ownership。
- `/bom/new`、sidebar assembly entry與DEV-095 retired code；不得恢復。
- production config、credential、Cloud SQL、deploy與release artifacts。

### 9.4 Dirty worktree boundary

開始 RD 前保存 `git status --short`、target hashes及DEV-099 touched ledger。現有 `.ai-doc/dev_task.md`、`.ai-doc/documentation_map.md`、DEV-093文件、numbering repository／contract、PostgreSQL 048、`package.json`等已有其他工作修改；禁止 clean、reset、checkout覆蓋、全域format或把unrelated changes納入本 DEV。重疊檔只能最小 patch並在 evidence manifest列出 before／after hash與責任歸屬。

## 10. Implementation Slices

| Slice | 交付 | Exit gate |
|---|---|---|
| 099-A Contract／numbering | optional compatibility type、new-root unclassified、existing-root consensus、append不阻擋、active writer inventory | QA-099-001..016 PASS；unknown value zero write；writer omissions=0 |
| 099-B Repository／API | candidate GET、strong ETag、batch PATCH、permission、receipt、audit、fault rollback | QA-099-017..028 PASS；SQLite repository/fault PASS |
| 099-C Part UI／BOM readiness | drawer entry、minimal dialog、multi-select、fresh readback、assembly-only BOM section | QA-099-029..040 PASS；four viewport headed browser PASS |
| 099-D Provider／regression | disposable PostgreSQL、DEV-093／096 regression、primary invariant、retired entry scan | QA-099-041..047 PASS |
| 099-E Aggregate／handoff | fixed manifest、case provenance、cleanup、docs status update | QA-099-001..048全部 PASS，Blocked／Not Run／P0/P1=0 |

同一 implementation branch 可依序完成；不得把099-A的server放寬單獨視為可release。Current Phase估工為 `7.0～10.0 person-days`，不含 production release。

## 11. Planned Commands 與 Evidence

```json
{
  "qc:dev-099:contract": "node scripts/qc-dev-099-contract.mjs",
  "qc:dev-099:repository": "node scripts/qc-dev-099-repository.mjs",
  "qc:dev-099:browser": "node scripts/qc-dev-099-browser.mjs",
  "qc:dev-099:postgres": "node scripts/qc-dev-099-postgres.mjs",
  "qc:dev-099": "node scripts/qc-dev-099-aggregate.mjs"
}
```

Evidence root：`output/qa/dev-099/<runId>/`。

每個 child manifest 至少保存 source revision／dirty boundary、target file hashes、provider、task-owned data／repository path、runtime port／PID tree、fixture ledger、case results、network／console／visible-error sweep、screenshots、DB before／after invariants、first failure與cleanup receipt。只看 aggregate exit code、direct API成功、DB有值或component字串存在都不構成UI PASS。

## 12. Verification Integrity Matrix

| Acceptance / risk | Normal delivery path | Fixture boundary | Forbidden shortcut | Fail condition | Required evidence |
|---|---|---|---|---|---|
| new-root 不再要求結構型態 | `/numbering/create` rendered form → preview → create | 可seed公司／系列等前置資料；Part結果必須由UI建立 | direct POST省略欄位 | UI仍有欄、API 422、DB不是unclassified | form screenshot、network payload、API result、DB readback |
| unclassified 不阻擋existing-root | Part drawer／header正常入口 → 加到既有圖料 | 可seed root與來源Parts；新Part由UI建立 | repository直接INSERT新Part | UI阻擋、client傳type、server猜第一筆 | UI journey、payload、consensus oracle、DB delta |
| exact Part可延後分類 | `/parts` → exact drawer → 設定結構型態 | 可seed待分類Part；分類postcondition不得seed | direct PATCH或SQL作最終成功證據 | 正常入口不存在、readback不同、刷新回舊值 | entry navigation、headed interaction、network correlation、DB/audit |
| 同root複選all-or-nothing | exact drawer分類dialog | 可seed同root candidates與一個invalid target | 只測repository batch成功 | partial update、root自動全選、invalid被略過 | selection screenshot、fault response、before/after rows |
| BOM只對assembly顯示 | classification success後同一drawer fresh readback | 可seedM圖／Definition作前置 | 直接開BOM workbench URL | single/unclassified出現BOM、assembly狀態/action錯 | same-session readback、four-state screenshots、API projection |
| provider transaction一致 | 相同command經SQLite／PostgreSQL repository | task-owned disposable DB | 只跑SQLite或mock transaction | provider結果／lock／rollback不同 | child manifests、fault ledger、FK/invariant、cleanup |
| visible errors為0 | 正常與恢復journey | 可做可控stale／network fault | build／unit test替代畫面 | 非測試錯誤狀態出現任何alert/4xx/5xx/route error | headed screenshots、console/network log、error sweep |

## 13. Acceptance Criteria

1. new-root畫面沒有結構型態欄，canonical request省略，正式 Part 明確寫 `unclassified`。
2. new-root purchased assembly相容request可建立；unknown structure value仍422且zero write。
3. existing-root initializer依全體current Part共識，不再採第一筆，不因unclassified阻擋。
4. canonical existing-root UI與request仍不顯示／傳送五項Part profile。
5. exact Part drawer是唯一分類入口；Drawing、root、sidebar、new-root表單與BOM list都沒有平行入口。
6. 無權限不可見或不可操作，cross-company為404，同company缺權限為403。
7. 同root候選可複選，current Part鎖定；跨root、inactive、超量、stale或BOM conflict整批zero write。
8. no-op、idempotent replay、same-key different-payload、concurrent classification及named fault checkpoints符合契約。
9. audit before／after／reason／targets完整，沒有partial receipt或未授權outbox。
10. unclassified／single_part不顯示BOM section；assembly才顯示，動作依manufactured＋primary M＋Definition推導。
11. purchased assembly可保存但沒有製造BOM action；缺M assembly有可恢復阻擋訊息。
12. DEV-096 shared Definition／multi-Parent／mapping／review／release authority與88-case受影響回歸不退化。
13. active Part writer omission=0，未新增schema／migration／入口／fallback／dual-write。
14. 1440／1024／768／390 headed UI無overflow、重疊、截斷、focus loss、unexpected alert、console/page/network error。
15. fixed QA-099-001..048同一 source state 全部PASS，Blocked=0、Not Run=0、P0/P1=0；primary schema、canonical identities、master counts、migration residue及FK invariants前後相同。

## 14. Stop Conditions

遇到下列任一條件，RD停止該 slice並回送Dev PM：

- 需要新增 table／column、修改既有 migration 或批次改正式資料。
- 現行 Part writer無法在不恢復legacy authority下明示structure type。
- exact Part authority與既有Part change/review法規或公司核准要求衝突，且無Human Decision。
- 分類為single_part需要detach／fork current或Released BOM。
- purchased assembly必須同時定義供應商BOM／R圖業務語意。
- candidate超過100是實際常態，需重新設計pagination／bulk governance。
- 需要從Drawing、CAD、root或BOM反向自動寫分類。
- 任一測試要寫 primary SQLite／Cloud SQL、停止未知runtime或越過正常UI入口才可PASS。
- 發現 DEV-093／096 authority文件仍存在未標示的同層衝突。

## 15. Future Phase Capsules

### 15.1 CAD／3D structure suggestion

`.SLDASM`或3D檔以圖料根號命名時，parser只輸出 root candidate、configuration與component reference suggestion。若同root有多個Part，UI必須讓人類複選exact Parents；parser不能因顏色差異自動建立多份BOM，也不能直接寫structure type或Draft。

### 15.2 Purchased assembly BOM

另行決定供應商BOM、採購包裝組、Reference Drawing R、替代料與收料／庫存語意；在該決策前，purchased assembly只是合法分類，沒有Current Phase製造BOM action。

### 15.3 Physical default hygiene

active writer convergence與provider rehearsal完成後，再評估把SQLite／PostgreSQL physical default由`single_part`改為`unclassified`。此變更需獨立migration、fresh／apply／rerun與production release gate，不能併入DEV-099 Current Phase。

## 16. Documentation-turn Boundary

本輪已依本SPEC完成DEV-099產品與驗證實作，並更新dev_task、documentation map與DEV-093／096 supersession notes。產品、測試程式與文件變更已由同一 aggregate gate 驗證；未修改schema、migration或正式資料，未執行production deploy／release或Git stage／commit。QA-099固定48案已全數PASS，權威證據為`output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json`。

## 17. DEV-106 Purpose-aware BOM Amendment (2026-08-31)

1. `structure_type=assembly` 的語意是「此料號有受控下階結構」，不再等同「一定有製造BOM」。
2. DEV-099的 `manufactured + assembly + primary M` 動作推導仍是 `purpose=manufacturing` 的唯一Current Phase建立資格。
3. `purchased + assembly` 或沒有primary M的assembly仍沒有manufacturing BOM action；在DEV-106 feature flag開啟且資格成立時，可顯示sales-kit action並建立 `purpose=sales_kit`。
4. exact Part drawer仍是分類與BOM action的canonical owner；`part_numbers.structure_type` enum、分類writer、batch語意與audit不變。
5. BOM readiness必須同時輸出structure classification與purpose-aware action，不得把Released sales kit誤判為manufacturing ready。
6. DEV-099既有48-case evidence保留為historical baseline，不自動支持DEV-106的產品完成或驗證結論。

DEV-106的purpose、入口、data、API與驗收細節以 `SPEC-PDM-SALES-KIT-BOM-001-commercial-bundle-structure.md` 為authority。

## 18. CAD Evidence and Unified BOM Amendment（2026-08-31 Human Confirmed）

本節取代本SPEC中下列 current assumptions：`.SLDASM` 只能建議不能寫分類、`.SLDPRT` 可產生 Part 單件事實、BOM 動作必須 manufactured＋primary M，以及 purpose-aware BOM readiness。

- `.SLDASM`：active primary upload 成功且 formal `primary_manufacturing` relation 唯一解析 exact Part 時，系統可 idempotent 自動晉級該 Part 為 `assembly`；不建 BOM、不預填 Child、不對 same-root 擴散。
- `.SLDPRT`：不寫 `structure_type`；它只表示 CAD file kind。人工分類 UI 可預選 single，但必須明確送出。
- downgrade：移除／替換 `.SLDASM` 不自動降級；assembly -> single 仍由 exact Part human command 與 BOM conflict gate 管理。
- BOM readiness：合法 `assembly` 即可建立統一 BOM，不要求 `item_kind`、M 圖或 CAD；Child 也不要求 Drawing。
- quantity／UOM：Child 基本單位帶入 BOM line，允許正小數並鎖定在 Revision；不做任意單位換算。

更完整的target authority為`ADR-PDM-BOM-DOMAIN-002`、`SPEC-PDM-BOM-CREATE-PAGE-001` §29～§33與`ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001`的2026-08-31 amendment。Current design已完成task-owned本機實作與54案驗證；DEV-099歷史48-case evidence不能取代新上傳side effect evidence，production migration／release仍受獨立gate管制。
