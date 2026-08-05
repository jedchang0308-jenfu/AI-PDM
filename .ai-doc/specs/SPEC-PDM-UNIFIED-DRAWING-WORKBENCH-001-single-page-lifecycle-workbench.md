# SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001：單一圖號工作台與生命週期導向操作

Status: `RD and AI QA Evidence Frozen / Independent QC Pending / Local Only / Production Release Gated`
Date: 2026-08-05
Owner: Dev PM
Related DEV: `DEV-053` / `DEV-PDM-UNIFIED-DRAWING-WORKBENCH-001`
Parent DEV: `DEV-052`、`DEV-050`、`DEV-051`
Related QA: `.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`
Related authority: `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`

Current execution boundary: DEV-053 Phase 1A read foundation、Phase 1C candidate routing與Phase 1E CAP-01～14能力恢復已完成，focused contracts 50/50、隔離真實Chromium 27/27；產品與AI QA證據已凍結，下一步只交獨立QC以範圍化Git SHA重驗。未授權production migration、activation、deploy、release、backfill、改號、審核重播或資料搬移。

---

## 0. 2026-08-05 Capability-preservation Amendment

本段是DEV-053現行權威修正；若後文的「四欄簡版」、「最小drawer」或「master唯讀」被解讀為可移除既有工作能力，以本段為準。

1. 使用者已確認維持單一`圖號工作台`，不恢復`圖號總表／保留號`雙分頁；但單頁化只消除導覽分流，不消除正式圖面管理能力。
2. 候選row保留生命週期唯一primary CTA；正式drawing row除唯一primary CTA外，必須保留可發現的secondary operations與治理資訊。`只有一個primary`不等於`只能有一個動作`。
3. 正式drawing drawer必須整合：圖面進版、上傳與送審、完整圖料關係、適用時的影響分析、申請作廢、發布不一致、Title block風險、送審檢查、同根料號、主資料編輯、標準成本、主要製造圖與附件authority導流。
4. 清單核心仍可維持`圖號／品名／工作狀態／下一步`，但關聯料號、資料狀態、待審、發布不一致與警告不可被藏到無法發現；用途、資料狀態與系列篩選必須保留。
5. candidate first revision與formal revision package仍是受控檔案唯一寫入authority。正式master可管理明確標示的`參考附件`，但參考附件不得成為送審、publication或Released下載證據。
6. `DEV-054`是受保護的必要並行任務。DEV-053不得恢復`development_phase`/DVT、修改023 migration或DEV-054 SPEC/ADR/QA/QC、還原其刪檔，或把其hunk混入DEV-053 commit。
7. Phase 1E不新增schema/migration；優先擴充既有workbench detail BFF與UI composition。需要新資料authority或無法與DEV-054安全分離時立即停止。

Phase 1E能力清冊是逐項驗收契約，不得以「route仍存在」代替UI可達：

| ID | 必須恢復/保留的使用者能力 |
|---|---|
| CAP-01 | 用途、資料狀態、系列與關鍵字查詢 |
| CAP-02 | 清單可見關聯料號 |
| CAP-03 | 清單可見待審、發布不一致與警告摘要 |
| CAP-04 | 圖面進版固定secondary入口 |
| CAP-05 | 上傳與送審固定secondary入口 |
| CAP-06 | 完整圖料關係固定secondary入口 |
| CAP-07 | 製造圖影響分析固定secondary入口 |
| CAP-08 | 受控檔案authority導流與參考附件管理邊界 |
| CAP-09 | 發布狀態不一致說明與修正入口 |
| CAP-10 | Title block變體風險 |
| CAP-11 | 送審完整性、標準成本與待審檢查 |
| CAP-12 | 同主根料號清單 |
| CAP-13 | 材質、顏色、表面處理與變體備註主資料編輯 |
| CAP-14 | 標準成本維護入口與主要製造圖資訊 |

## 1. Outcome

`/numbering/drawings` 改為單一「圖號工作台」，取消使用者可見的「圖號總表／保留號」雙分頁。使用者只需搜尋一筆圖號工作，判斷目前階段、使用效力與唯一下一步；正式圖號仍須在同一頁完成既有圖、料、版次、附件、送審、關係、影響與治理工作。

單頁化只合併資訊架構與唯讀投影，不合併底層 authority：

- 候選建立、保留、首版與整包審核仍由 DEV-052 workspace aggregate 負責；
- 正式圖號仍由 drawing master 負責；
- 正式版次、受控檔案、送審與發行仍由 revision/submission authority 負責；
- approval、audit、receipt、outbox、permission、idempotency 與 release gate 不改寫；
- production 既有保留號與正式圖號不搬移、不回填、不改號、不重播審核。

## 2. Problem and UX Intent

現行雙分頁把資料儲存型態暴露成導覽決策。同一位研發人員必須先猜「這筆資料現在算保留號還是正式圖號」，再到不同頁面找附件、送審、進版或追溯入口；主資料 drawer 又存在可與候選／版次附件混淆的寫入入口。

UX Intent：

- 使用者：研發工程師、研發主管、PDM Admin及有權查閱圖號的人員；
- 主要任務：建立或找到圖號工作，理解目前在哪一步、能否正式使用、下一步按哪裡；
- 5 秒成功標準：單列可回答「這是什麼、目前階段、使用效力、唯一下一步」；
- H1：`圖號工作台`；首屏只保留一句用途說明；
- 主畫面：搜尋、範圍、生命週期、用途、資料狀態與系列篩選、`建立圖號`及單一清單；
- 主清單核心欄位為`圖號`、`品名`、`工作狀態`、`下一步`；關聯料號與治理警示以欄位或列內次資訊呈現，不得消失；工作狀態只描述圖號工作生命週期，不代表專案階段；
- 關係、版次、檔案、審核、發行、影響、來源申請與 audit 降層至統一 drawer；
- 每個正常狀態最多一個 primary CTA。禁止同時顯示 `進版`、`送審`、`查看審核` 或人工 `正式發布` 等競爭入口。

## 3. Current and Target UI Comparison

| 項目 | 現行／DEV-052 本機 UI | DEV-053 目標 UI |
|---|---|---|
| 頁面結構 | `圖號總表`、`保留號`兩個頁籤 | 單一`圖號工作台`，無頁籤 |
| 保留號定位 | 獨立頁面與工作區名稱 | 一個生命週期狀態，不是頁面 |
| 清單來源 | 正式圖號與 workspace 各自載入 | server-side 統一唯讀投影 |
| 預設範圍 | 正式總表或我的保留號 | `我的待處理` |
| 建立入口 | `建立保留號`與主資料追加入口並存 | `建立圖號`，一律先建立候選 workspace |
| 下一步 | 分散於清單、drawer、Now What、進版與審核區 | 每列與drawer共用一個server-derived primary action；正式drawing另保留固定secondary operations |
| 正式化後 | 從保留號頁切到正式圖號頁 | 同一搜尋入口中由整包列切換為正式圖號列 |
| 正式圖面管理 | 正式drawer具版次、送審、關係、影響、治理、料號與成本能力 | 同一工作台完整保留，改為生命週期摘要＋分區secondary operations，不得以最小drawer取代 |
| 檔案 | 候選、版次與 master attachment 容易形成平行寫入 | 候選首版或正式版次是唯一受控檔案寫入 authority；master顯示受控摘要並可管理明確標示的參考附件 |
| 舊網址 | `/numbering/drawings?tab=reserved` 開保留號頁 | 零寫入相容到單一工作台的`工作中`範圍 |
| 系統說明 | 依頁籤分別說明，仍含舊 number-only／人工發布語言 | 一份生命週期與下一步說明 |

新版不再有使用者可見的「保留號」頁面或頁籤；`保留號`仍可作為資料狀態、搜尋字詞與歷史事實。

## 4. Canonical Row Identity and De-duplication

候選 workspace 可以同時包含多張圖，因此 canonical row unit 不能定義成「一個 workspace 永遠等於一張圖」。本契約採下列可驗收規則：

| 時點 | Top-level row unit | Row key | 顯示規則 |
|---|---|---|---|
| 建立中、已保留、首版準備、整包審核、正式化、recovery | 一個 workspace／bundle 一列 | `candidate:{workspaceId}` | `圖號`顯示主要候選圖號；多圖時顯示`主要號碼 + N`，drawer列出完整集合 |
| 正式化成功後 | 每個正式 drawing master 一列 | `drawing:{drawingNumberId}` | 每張正式圖號獨立可搜尋、進版與追溯 |
| 已取消／回收且未正式化 | 一個 workspace 一列，只在歷史範圍 | `candidate:{workspaceId}` | 顯示終結原因，不提供復活或發布捷徑 |
| 已完成且已正式化的 workspace | 不再是 top-level row | 沿用來源 workspace ID 作 audit 關聯 | 只由正式圖號 drawer 的`來源申請／追溯`查閱 |

因此「不重複」的精確定義是：

1. 同一進行中 workspace 只顯示一列，不因其中有多個 drawing drafts 而重複；
2. 正式化成功後，已完成 workspace 不與其正式 drawing masters 同時出現在 top-level 清單；
3. 每個正式 drawing master 只顯示一列；
4. 搜尋候選號、正式號或來源 workspace ID 都應定位 canonical top-level row，來源歷史由 drawer 查閱；
5. `rowKey`使用 namespaced stable ID，不得以可變 display code、陣列索引或 client-side 猜測當 identity。

若正式圖號無法可靠追溯其來源 workspace/candidate revision，RD 必須停止；不得以名稱或號碼模糊比對來消除重複。

## 5. Unified Read Model Contract

### 5.1 Endpoint

新增唯讀 BFF：

```http
GET /api/numbering/drawings/workbench
```

Query contract：

| Parameter | Values / default | Contract |
|---|---|---|
| `query` | string / empty | 比對候選圖號、正式圖號、品名、關聯料號、workspace ID；server normalization |
| `view` | `mine`、`work`、`all` / `mine` | `mine`為目前 actor 待處理；`work`為可見非終結工作；`all`含正式與歷史 |
| `stage` | visible stage / empty | 以本規格 stage vocabulary 篩選，不接受 raw repository status |
| `seriesCode` | string / empty | company-scoped 系列篩選 |
| `cursor` | opaque / empty | server opaque cursor，client 不解碼 |
| `limit` | 1..100 / 50 | 超界值拒絕或正規化，不得無上限載入 |

Response contract：

```ts
type DrawingWorkbenchRow = {
  rowKey: string;
  rowKind: "candidate_bundle" | "drawing_master"; // internal discriminator, not visible text
  workspaceId: string | null;
  drawingNumberId: string | null;
  displayCode: string;
  additionalDrawingCount: number;
  displayName: string;
  relatedPartSummary: string | null;
  stage: DrawingWorkbenchStage;
  stageLabel: string;
  usage: "not_for_formal_use" | "rd_controlled" | "released" | "historical_only";
  primaryAction: DrawingWorkbenchPrimaryAction | null;
  warning: { code: string; message: string } | null;
  updatedAt: string;
};

type DrawingWorkbenchPrimaryAction = {
  kind:
    | "continue_building"
    | "complete_first_drawing"
    | "submit_bundle_review"
    | "view_review"
    | "view_processing"
    | "retry_formalization"
    | "view_drawing"
    | "create_revision"
    | "view_history";
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
};

type DrawingWorkbenchListResponse = {
  rows: DrawingWorkbenchRow[];
  nextCursor: string | null;
  generatedAt: string;
  filters: { seriesCodeOptions: string[] };
};
```

`DrawingWorkbenchStage`固定支援：`building`、`drawing_preparation`、`bundle_ready`、`in_review`、`auto_finalizing`、`recovery_required`、`official_controlled`、`revision_in_review`、`released`、`history_only`。正式版次編輯器目前沒有 server-persisted draft identity，因此 `revision_drafting`、`revision_ready` 不得由統一清單虛構；使用者進入既有版次工作台後，才由該工作台的 local state 顯示 `繼續編輯`或`送交審核`。

### 5.2 Server-side composition

- 瀏覽器不得分別呼叫 `/api/numbering/draft-workspaces` 與 `/api/numbering/drawings` 後自行 concatenation、去重或決定 CTA；
- BFF 在 server 內讀取現有 workspace、candidate lifecycle、drawing master、revision/submission與approval projection；
- 同一次 response 必須在同一 company、permission context與唯讀一致性邊界完成；Postgres 使用單一 `REPEATABLE READ READ ONLY` transaction，SQLite 使用現有單連線 transaction且只呼叫read repository；任何來源失敗則整個 request fail，不回傳誤導性的 partial list；
- list/open/filter/search/deep-link normalization 全部 zero-write；不得 lazy create projection rows、candidate revisions、audit、receipt或 outbox；
- 預設排序：需人工處理者優先，其次 `updatedAt DESC`、`rowKey ASC`；opaque keyset cursor固定包含 `version`、`filterHash`、`updatedAt`、`rowKey`，signature／filter不符、tampered或版本不支援一律拒絕；
- 相同未變資料翻頁不得漏列或重列。資料在翻頁中途變動時，client 顯示可重新整理狀態，不得靜默提交舊 CTA；
- `primaryAction`、`usage`、`warning`由 server authoritative facts與 capabilities產生，client只渲染，不自行推導權限或生命週期。

### 5.3 Detail contract

新增唯讀 detail surface：

```http
GET /api/numbering/drawings/workbench/{rowKey}
```

- `candidate:*`回傳完整 workspace bundle摘要、候選圖料號、缺項、candidate revision files、approval與來源事實；
- `drawing:*`回傳 drawing master、現行／進行中版次、受控檔案摘要、release狀態、關聯料號、來源 workspace與audit連結；
- detail與list使用相同 action resolver。drawer不得出現與該列不同的第二個 primary CTA；
- `rowKey`不是授權憑證。不存在、跨公司或不可見的 row一律 404/403 且不洩漏另一公司事實；
- detail read同樣 zero-write。

## 6. State-to-Primary-Action Contract

| Visible stage | Usage conclusion | 唯一 primary CTA | Secondary / forbidden |
|---|---|---|---|
| `building` | 尚未產生／尚不可正式使用 | `繼續建立` | 可取消；不可送審、發布、進版 |
| `drawing_preparation` | 已保留、尚不可正式使用 | `完成首版` | 可編輯／取消；不可走正式版次 workbench |
| `bundle_ready` | 候選內容齊全、尚不可正式使用 | `送交審核` | 可編輯；不得另送 number-only review |
| `in_review` | 內容鎖定、尚不可正式使用 | `查看審核` | owner符合規則可撤回；不得人工發布 |
| `auto_finalizing` | 核准完成、系統處理中 | 無 primary CTA | `查看處理狀態`為secondary；禁止重複送審／發布 |
| `recovery_required` | 不可正式使用或狀態未確認 | 有retry permission者`重試正式化`，其他人`查看處理狀態` | 只重試原 approved snapshot；不得重建或改號 |
| `official_controlled` | 圖號正式、研發版受控但未Released | `查看圖面` | 不顯示候選首版／人工正式發布；建立新版入口由既有版次工作台決定 |
| `revision_in_review` | 審核中的版次不取代現行Released | `查看審核` | 依既有規則撤回；不得建立競爭進版 |
| `released` | 可依DEV-050規則正式使用 | `建立新版` | `追溯`、`影響`、`申請作廢`為secondary |
| `history_only` | 僅供歷史查閱 | `查看紀錄` | 不提供復活、占號、送審或發布捷徑 |

補充規則：

- `primaryAction=null`只允許自動正式化等明確不需人工操作的狀態；UI仍須說明「系統處理中，不需再操作」；
- 能看見資料不等於能執行動作。動作無權限時可顯示 disabled primary與具體原因，但不得以 Admin 名稱或 client state推測放行；
- stale action command沿用原 authority 的 optimistic concurrency/idempotency；409後重新讀取 row並要求使用者確認，不做 optimistic stage promotion；
- DEV-052 核准後 atomic auto-finalization 保留，統一工作台不得重新引入人工 `正式發布`。

## 7. Mutation Routing and Parallel-path Closure

統一 API 是 read-only；所有 mutation仍呼叫原 authoritative command handler：

| User intent | Command authority |
|---|---|
| `建立圖號` | DEV-052 workspace create + explicit candidate acquisition |
| `新增同根圖號／新增同圖料號` | 帶入 source root/drawing context建立 append-mode candidate workspace |
| 候選首版內容／受控檔案 | candidate revision commands |
| 整包送審／撤回 | candidate bundle review commands |
| 核准／正式化／recovery | approval apply + DEV-052 atomic/idempotent formalization |
| 正式圖面進版、送審、發行 | drawing revision/submission commands + DEV-050 release gate |
| 作廢 | 既有 change-control request，不由 list直接改 master status |

必須移除或改道目前 drawer 中直接 POST `/api/numbering/roots/{root}/drawings`、`/parts` 建立正式 master 的使用者入口。DEV-053 開啟時，所有新增或追加圖料號都先進 candidate workspace；舊 direct-master endpoints若仍供其他受控 internal flow使用，必須在 DEV-053 UI不可達，且不得藉 unified BFF proxy繞過審核。

追加情境的 authoritative context 固定如下：

- `新增同根圖號`：workspace `mode=append_drawing`，保存 `sourceRootId`；若由既有料號發起，同時保存 `sourcePartNumberId`及`sourceLinkType`。製造圖 `M` 必須有來源料號或workspace內候選關係；參考圖 `R`可明確不關聯。
- `新增同圖料號`：workspace `mode=append_part`，保存 `sourceRootId`、`sourceDrawingNumberId`與`sourceLinkType`。該整包可只含候選料號與「將連到既有圖號」的關係事實，不得為此複製或重新審核既有drawing revision。
- 三個source欄位由server依同company、同root、允許狀態、互斥規則驗證；client不得指定company或把不存在的source當有效關聯。
- source context納入candidate facts hash與approved snapshot；atomic formalization必須在原transaction中建立新正式物件及跨邊界關係，失敗時不得留下半套master或關係。

## 8. Controlled File Authority

- 候選首版受控檔案只寫入 candidate revision authority；
- 正式進版受控檔案只寫入 drawing revision package authority；
- drawing master drawer只顯示目前受控檔案摘要與來源，不得上傳／替換 CAD、2D、PDF、DWG/DXF等受控角色；
- 受控摘要旁必須提供前往candidate first-revision或formal revision工作台的可見入口；不得只顯示無法處理的唯讀結果；
- 若保留一般附件功能，UI與API必須明確命名為`參考附件`，沿用既有權限與production-slice guard，且不得成為 publication evidence、送審 completeness或 released download來源；
- 同一檔案不得同時由 master attachment與candidate/revision package宣稱為 primary controlled file；
- production GCS authority、signed URL與檔案搬移不在 DEV-053 範圍，沿用 DEV-052 release gate。

## 9. Permission and Scope Contract

- list/detail先通過 `numbering.drawings.view`，候選資料再與 `numbering.workspace.view` 可見範圍取交集；不得因統一清單擴張既有 visibility；
- 每列 capabilities從原 command permission、company scope、workspace owner、approval responsibility與record state計算；
- `view=mine`只包含 server能證明目前 actor負責的工作：workspace owner待辦、目前審核責任、或有指定 recovery responsibility的案件；無法證明歸屬時不猜測，改由`work`查閱；
- `view=work`包含同公司且有權看見的非終結工作；`view=all`仍受相同公司與角色權限限制；
- Admin角色名稱本身不隱含建立、送審、核准、重試、進版或發行權限；
- actor/company/state/rowKind/action由server決定。client傳入的對應欄位一律忽略或拒絕；
- cross-company twin codes、opaque rowKey探測與舊deep link皆不得洩漏存在性或資料。

## 10. Route, Bookmark and Backward Compatibility

Canonical route為 `/numbering/drawings`。

- `/numbering/drawings?tab=reserved`、hard reload與舊書籤以 zero-write方式對應 `view=work`；載入成功後可用 history replacement移除 obsolete `tab`，不得產生 navigation loop；
- 保留 `query`、`detail`與可安全映射的filter參數。候選 detail ID映射 `candidate:*`，正式 drawing detail映射 `drawing:*`；
- 找不到或無權看舊 detail時，顯示安全返回與保留的搜尋／篩選，不自動建立缺少資料；
- `tab=official`或無tab都進 canonical workbench；其他未知tab忽略並保持 zero-write；
- feature flag未開啟時，現行雙分頁行為保持；DEV-053 flag只可在 DEV-052 lifecycle V2相依能力可用時開啟。錯誤組態必須 fail closed或回退完整舊UI，不得顯示半套單頁加舊mutation入口。

## 11. Failure and Recovery Contract

| Failure | Required behavior |
|---|---|
| workspace/master/revision其中一個 read source失敗 | 整體 list/detail error + retry；不顯示 partial truth |
| projection identity conflict | row標記 `recovery_required`或 request fail；記診斷，不靜默選一筆或顯示兩個可操作列 |
| action state stale | command 409；重新整理該列，保留使用者上下文，不自動重送 |
| approval apply failed | 顯示沒有部分正式資料；只有具權限者可重試原 approved snapshot |
| old deep link target missing | safe empty state/return；零寫入、零補 row |
| permission changed while page open | command fail closed並刷新 capabilities；不保留過期 enabled CTA |
| cursor dataset changed | 提示重新整理；不以client merge消除或創造列 |

錯誤訊息首句需說明使用者下一步；raw status、stack、SQL、credential、signed URL、snapshot hash與storage path不得出現在可見UI。

## 12. Implementation Architecture Contract

### 12.1 Server read model

RD 必須建立單一 application service，不得在 route 或 browser 內拼資料：

| Exact file | Responsibility |
|---|---|
| `src/lib/drawing-workbench.ts` | public types、query normalization、stage/usage/primary-action resolver、list/detail service |
| `src/lib/repositories/drawing-workbench-async-repository.ts` | candidate/master identity union、stable keyset、batch hydration、來源追溯 |
| `src/lib/repositories/numbering-async-repository.ts` | 僅補必要的batch read，不改既有write authority |
| `src/lib/repositories/numbering-repository.ts` | 對齊同步型別／fixture contract；不得另建平行business rule |
| `src/app/api/numbering/drawings/workbench/route.ts` | GET list；company、permission、validation、error mapping |
| `src/app/api/numbering/drawings/workbench/[rowKey]/route.ts` | GET detail；namespaced row identity與scope防護 |

Service 順序固定為：取得actor/company → 檢查page與candidate visibility permissions → normalize query/filter/cursor → 開啟單一唯讀一致性transaction → identity list → batch hydrate → authoritative resolver → response。任何source error rollback並回整體錯誤。

### 12.2 Candidate source context and lifecycle

| Exact file | Allowed change |
|---|---|
| `src/lib/number-state-flow.ts` | create input normalization、source validation、facts hash欄位 |
| `src/lib/repositories/number-state-flow-async-repository.ts` | 三個nullable source欄位讀寫、approved snapshot、atomic cross-boundary relation |
| `src/lib/number-lifecycle-simplification.ts` | relationship-only append readiness／stage projection |
| `src/lib/repositories/number-lifecycle-simplification-async-repository.ts` | 保留DEV-052 transaction/idempotency；允許合法append-part無candidate drawing |
| `src/app/api/numbering/draft-workspaces/route.ts` | create payload接受source IDs/link type；server驗證且沿用Idempotency-Key |

不得改 approval action 語意、candidate/master ID 生成規則、released pointer、DEV-050 minor release gate或既有正式號碼。

### 12.3 UI composition

| Exact file | Responsibility |
|---|---|
| `src/app/numbering/drawings/page.tsx` | flag-on單頁shell；flag-off完整保留現行雙頁；舊URL zero-write normalization |
| `src/components/drawing-workbench.tsx` | 單一清單、filter、pagination、candidate drawer與完整formal drawer、server action rendering、治理與secondary operations |
| `src/components/number-state-workspace.tsx` | 抽出／重用candidate detail；不保留第二個top-level頁籤 |
| `src/components/master-attachment-panel.tsx` | 受控摘要/read-only mode與明確authority導流；參考附件模式須清楚命名並沿用既有權限/production-slice guard |
| `src/components/numbering-contextual-entrypoints.tsx` | direct-master create改送candidate workspace + Idempotency-Key |
| `src/lib/status-scope-display.ts`、`src/components/status-help-popover.tsx` | 統一可見狀態與說明，不暴露raw repository status |
| `src/app/globals.css` | 1440/1280/1024/390 viewport與drawer安全樣式 |

`src/components/master-attachment-panel.tsx`在既有正式版次工作台的寫入用途不得被全域關閉。每列及drawer只渲染server給定的一個primary action，但正式drawing drawer必須另外呈現不競爭primary的版次、送審、關係、影響、作廢與治理secondary operations。

### 12.4 Feature flag

- flag：`PDM_UNIFIED_DRAWING_WORKBENCH_V1`；default `false`；
- `src/lib/number-state-flow-feature.ts`增加解析，`src/app/api/numbering/state-flow/status/route.ts`以`drawingWorkbench`回傳；
- 只有 `PDM_NUMBER_LIFECYCLE_V2=true` 且新flag=true時可啟用；相依能力缺少時fail closed到完整舊UI；
- 關閉flag即為本機UI rollback；additive nullable columns可留存，不需刪欄位或資料回復。

## 13. Schema and Migration Contract

Implementation Readiness Review確認既有workspace只有`source_root_id`，無法無損表達「把新料號連到指定既有圖號」或「把新圖號連到指定既有料號」。依ADR允許以下最小additive變更：

```sql
source_drawing_number_id TEXT NULL
source_part_number_id TEXT NULL
source_link_type TEXT NULL
```

- canonical schema：`db/schema.sql`；
- PostgreSQL migration：`db/postgres/022_unified_drawing_workbench.sql`；
- Supabase mirror：`supabase/migrations/20260804020000_unified_drawing_workbench.sql`；
- migration manifest：依repo現行manifest格式補登；
- SQLite repair：`src/lib/db.ts`只用既有`ensureColumn`加nullable欄位。SQLite既有表不為FK重建，跨欄位與scope由server驗證；canonical/Postgres可加FK、CHECK與必要index；
- 既有rows三欄保持`NULL`，不backfill、不推測source、不改號；legacy與DEV-052 workspace照常推進；
- production不在本DEV目前授權。不得在本機文件推進時執行production migration。

Rollback：flag off → 停止建立含新source context的workspace → 保留nullable欄位與既有值供追溯。禁止down migration刪欄或清資料；若需production rollback，須另走deployment release gate。

## 14. Delivery Slices and Exact Exit Gates

| Phase | Status | Scope | Exact exit evidence |
|---|---|---|---|
| Contract | Complete | SPEC、QA plan、spec impact、DEV索引 | doc checks |
| Implementation readiness | Complete | ADR、exact files、schema/API/flag、分期、測試與rollback | 本版文件，無P0/P1 open question |
| 1A：read foundation | Complete / retained | additive schema、source context、lifecycle snapshot/formalization、read repository/service、list/detail API、flag | 既有schema/read-model/HTTP tests與DEV-052 regression |
| 1B：single-page UI | Rejected / superseded | single list/drawer、old URL與RWD shell保留；最小formal drawer驗收撤銷 | 由1E取代，不得沿用PASS |
| 1C：contextual append | Complete / retained | direct-master UI改道、relationship-only bundle、atomic cross-boundary relation、action routing | 既有flow/idempotency/permission/atomic rollback tests |
| 1D：QA/QC | Reopened | 舊QA未覆蓋既有能力清冊，結果只保留為歷史紀錄 | 不得作為產品完成證據 |
| 1E：capability restoration | Next / RD Implementation Ready / local only | 正式row parity、完整formal drawer、14組能力恢復、reference attachment boundary、DEV-054保護與regression automation | capability inventory assertions、AI真實操作、RWD/console/network、DEV-054 protected diff、獨立QC |
| Production release | Explicitly gated | migration/flag rollout/backup/rollback/smoke | deployment-release-gate evidence |

Phase 1E可在本機開始；不得提前打開production flag，也不得把能力未恢復的半套UI設為default-on。每一phase可獨立停在flag-off狀態。

## 15. Test Command Contract

RD 應新增：

| Script | Required coverage |
|---|---|
| `scripts/qc-dev-053-drawing-workbench-schema.mjs` | migration parity、nullable default、existing row unchanged、source validation |
| `scripts/qc-dev-053-drawing-workbench-read-model.mjs` | identity、de-dup、多圖transition、resolver、cursor、source failure、consistent snapshot |
| `scripts/qc-dev-053-drawing-workbench-http.mjs` | auth/company/permissions/query/cursor/list/detail/error/zero-write |
| `scripts/qc-dev-053-drawing-workbench-ui.mjs` | one page、one primary CTA、formal secondary operations、舊能力清冊、old URL、附件authority、viewport/accessibility |
| `scripts/qc-dev-053-drawing-workbench-flow.mjs` | contextual append、relationship-only review、snapshot、atomic formalization、idempotency |
| `scripts/qc-dev-053-drawing-workbench-real-operation.mjs` | AI登入後實際點擊／輸入／上傳／送審／核准／reload／cleanup manifest |

`package.json`增加phase scripts及`qc:dev-053`aggregate。最小執行順序：

```powershell
npm run qc:dev-053:schema
npm run qc:dev-053:read-model
npm run qc:dev-053:http
npm run qc:dev-053:ui
npm run qc:dev-053:flow
npm run qc:dev-052
npm run qc:pdm-numbering-contextual-entrypoints
npm run qc:master-attachments
npm run qc:pdm-revision-policy-release-gate
npm run qc:pdm-numbering-core
npm run qc:pdm-production-slice-numbering-draft
npm run typecheck
npm run lint
npm run build:isolated
```

Phase 1E先執行UI/detail projection與既有能力focused tests，再執行完整矩陣與真實操作。測試不得以API/DB mutation代替標為UI的真實操作，且必須提供DEV-054受保護檔案/語意未被改動的diff證據。

## 16. Acceptance Criteria

1. `/numbering/drawings`只有一個`圖號工作台`，無`圖號總表／保留號`頁籤；新版無獨立保留號頁。
2. 舊 `?tab=reserved` zero-write到達`工作中`等效範圍，保留query/detail，無loop、lazy write、回填或改號。
3. 進行中 workspace一整包一列；正式化後切為每張 drawing master一列，完成workspace只在來源追溯中，無重複top-level row。
4. 多圖bundle正式化前後數量切換正確：1個candidate bundle row轉成N個formal drawing rows；每個正式圖號都能以候選號、正式號或來源ID找到。
5. list/detail由server-side unified read model產生，client不拼接兩支清單；任何來源失敗不回partial list。
6. 每個正常狀態最多一個primary CTA，與第6節矩陣一致；disabled/recovery同時說明原因與可行下一步。
7. `建立圖號`、新增同根圖號與新增同圖料號全走candidate workspace；DEV-053 UI無直接建立master的平行路徑。
8. `append_part`可保存指定既有圖號的relationship-only intent；`append_drawing`可保存指定既有料號，核准正式化時在同transaction建立跨邊界關係。
9. candidate與formal revision受控檔案各有單一權威；master drawer提供受控摘要與權威工作台入口，參考附件可依原權限維護但不成為受控證據。
10. list、search、filter、pagination、drawer、old URL與feature bootstrap在既有workspace/reservation/approval/master/revision/audit/outbox上zero-write。
11. `mine/work/all`、company、role、owner、reviewer與recovery權限均fail closed；跨公司與client spoof無資料洩漏或動作放寬。
12. DEV-052 atomic/idempotent formalization、legacy continuation與DEV-050 minor Released禁令回歸通過；不再出現人工正式發布CTA。
13. 正式版次尚未server提交前，不得在統一列表產生`revision_drafting`／`revision_ready`幽靈狀態；提交後才顯示`revision_in_review`。
14. 1440×900、1280×720、1024×768、390×844可搜尋、篩選、開drawer與執行主要下一步，無非預期水平overflow、CTA裁切、焦點遺失或可見錯誤。
15. AI真實操作必須用實際登入、點擊、輸入、上傳、送審、審核與重新載入完成關鍵流程；不得用API/DB mutation代替UI步驟，API/DB只作前後證據與負向驗證。
16. productionConnected=false、productionWrites=false；任何production啟用仍需獨立release gate。
17. 正式drawing列可依用途、資料狀態、系列與關鍵字查詢，且關聯料號、待審、發布不一致與警告可發現；不得恢復DEV-054移除的開發階段filter/display。
18. 每張正式drawing都能發現圖面進版、上傳與送審、完整圖料關係、適用時的影響分析及作廢入口；權限或production slice封鎖時顯示原因，不可靜默隱藏。
19. 發布狀態不一致、Title block變體風險、送審檢查、同根料號、料號主資料編輯、標準成本與主要製造圖均在formal drawer可達且遵守原權限/lock guard。
20. DEV-053修復前後，DEV-054的刪檔、023 migration、專案狀態移除、規則/權限與文件語意保持不變；DEV-053 commit不得包含其hunk。

## 17. Spec Governance

Classification: `Intentional replacement + additive source-context extension + capability-preservation amendment`。

- 本規格在 DEV-053產品實作與QA/QC通過後，取代 DEV-052 `HD-052-04`「保留`圖號總表／保留號`雙分頁」的UI、導覽與read projection契約；
- DEV-052候選aggregate、legacy compatibility、single bundle review、atomic auto-finalization、permission、idempotency、audit與release gate維持authoritative；
- DEV-050、DEV-051與正式revision/submission authority不被單頁化取代；
- source-context schema與跨邊界關係採 `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`；任何超出三個nullable欄位、需要backfill或改authority的方案必須另開ADR。
- 2026-08-05使用者確認DEV-054為另一AI的必要並行任務；DEV-053不得修改、還原或提交其範圍。Phase 1E只修正單頁UI能力退化，既有ADR仍充分，無需新ADR。

## 18. RD Stop Conditions

遇到任一情況，RD必須停止並回報Dev PM：

- 無法用既有stable IDs可靠建立candidate到formal drawing的來源關聯；
- 必須client-side concatenation、以名稱／號碼猜測去重，或接受partial list；
- 統一清單會放寬company、owner、reviewer或command permission；
- 無法區分master附件與candidate/revision controlled file authority；
- 需要直接建立master、重播approval、改atomic formalization語意、放寬minor Released gate；
- schema超出本規格三個nullable source欄位，或需要新business table、table rebuild、backfill、搬移、改號或刪除既有資料；
- 需要production target、credential、live data repair、deploy、release、merge或PR；
- feature flag無法完整回退現行雙頁行為，或會形成半套UI／雙mutation path；
- 正式版次草稿仍無server identity但需求要求跨reload出現在統一清單。
- 需要恢復`development_phase`/DVT、修改023 migration、DEV-054文件或其已刪除頁面/API/測試；
- DEV-053與DEV-054位於同一共用hunk且無法安全分離，或必須整檔stage才可提交；
- 14組既有能力中任一項只能靠靜默隱藏、假按鈕或繞過authoritative route完成。

## 19. Evidence Required Before Product Done

- focused unified read-model contract tests與source-failure tests；
- row identity、多圖bundle transition、de-dup、keyset pagination與permission API evidence；
- migration parity、既有row三欄NULL、zero-write baseline/diff evidence；
- contextual create、relationship-only append、atomic cross-boundary relation與controlled-file authority negative tests；
- Chromium 1440/1280/1024/390 screenshots、keyboard/focus、visible-error、console與network evidence；
- DEV-052、DEV-050、DEV-051 focused regression；
- AI real-operation manifest與cleanup結果；
- independent QC report；
- 既有功能清冊逐項UI可達證據、production-slice visible-disabled證據與DEV-054 protected-diff證據；
- lint、TypeScript與isolated production build（於實作階段）；
- production release另需target、backup/rollback、migration rehearsal、flag與post-deploy smoke evidence。

## 20. Release Feasibility Note

本設計可release，但目前未獲production授權。production rollout至少需要：

1. 確認DEV-052 V2已完成既有資料相容與獨立QC；
2. 備份並在non-production rehearsal執行PostgreSQL `022` migration，證明既有rows不變且新欄位可NULL；
3. 先部署flag-off版本並跑read-only smoke；
4. 逐步開啟`PDM_UNIFIED_DRAWING_WORKBENCH_V1`，監看list error、cursor conflict、formalization recovery與direct-master endpoint使用；
5. rollback時關flag，不刪欄、不回寫、不改號；若schema rollback不可避免，另開release/CAPA決策。

## 21. Local Implementation Result and Reopening

- Phase 1A retained：三個nullable source-context欄位、PostgreSQL/Supabase mirror、SQLite compatibility、default-off flag、server-side unified read model、GET-only list/detail API與zero-write evidence仍有效。
- Phase 1B rejected：單一page shell、舊`?tab=reserved`正規化與responsive基礎可重用，但四欄簡版搭配最小formal drawer造成14組既有能力退化，不得視為完成。
- Phase 1C retained：建立／追加圖料號改走candidate workspace、relationship-only `append_part`、source-context驗證、跨邊界關係與正式化transaction仍有效；統一BFF未新增mutation proxy。
- Phase 1D invalidated for acceptance：歷史run `DEV053-20260804-090838-local-isolated`證明生命週期主線曾完成19/19，但沒有逐項驗證正式圖面能力清冊，因此QA PASS與後續QC入口均重新開啟。
- Phase 1E next：在不新增schema/migration、不碰DEV-054的前提下恢復正式row parity與完整formal drawer，重建UI regression assertions，完成AI真實操作後再交獨立QC。
- Production boundary：`PDM_UNIFIED_DRAWING_WORKBENCH_V1`仍預設off，migration只有artifact、production mutation allowlist未開放；既有reservation rows未backfill，productionConnected=false、productionWrites=false。
- Next executable gate：RD執行Phase 1E local-only修復；不得直接commit、deploy或沿用舊PASS。產品凍結後依更新後QA plan重跑，獨立QC PASS後才可標記DEV-053本機完成。
