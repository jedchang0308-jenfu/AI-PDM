# SPEC-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001：圖面版次與研發分支統一生命週期

Status：`RD Implementation Ready / Human Confirmed / RD Not Started / Production Release Gated`

DEV：`DEV-098`

Date：2026-08-25

## 0. Authority、成熟度與執行限制

本文件把DEV-098補成RD可直接下筆的Current Phase implementation contract。使用者已於2026-08-25
關閉三項產品決策；2026-08-25又明示「繼續升級開發文件」，因此本輪完成現況程式盤點、exact file map、
wire／validator／transaction contract、schema decision、分期、fixed QA cases與evidence gate。配對ADR為
`.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-bounded-manual-minor-and-stale-freeze.md`。
本輪仍未要求產品實作；狀態為`RD Implementation Ready / RD Not Started`，只授權後續本機implementation phase，
不等於已實作、已驗證或可release。

current authority關係如下：

- minor／major與release gate：`SPEC-PDM-REVISION-POLICY-002`（DEV-050），由本SPEC與ADR限縮canonical
  Drawing bounded manual minor的override適用範圍。
- canonical Drawing branch、claim與work state：`SPEC-PDM-STATUS-DATA-REBUILD-001`（DEV-087），由本SPEC與ADR
  有意取代auto-only minor與stale可續minor條款。
- Drawing owner/reviewer full-page placement：`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`（DEV-079）。
- FFF與圖面進版工作語意：`SPEC-PDM-CHANGE-CONTROL-002`及DEV-087 §15。

Spec Impact：`Intentional replacement + compatible preservation`。DEV-087仍擁有canonical state／branch／claim／work；
DEV-050仍擁有minor release gate；DEV-098新增同主版次manual minor並固定stale freeze與量產採用詞彙。

本輪同步本SPEC、配對ADR、fixed QA plan、DEV-050／DEV-087 amendment、dev_task與documentation map；不修改產品程式、
schema、migration、資料、runtime或release artifact。

## 1. Human Decision Record（Closed）

決策來源：使用者於2026-08-25回覆`1C（但必須在同個主版次／整數下）／2A／3A`。

| ID | Accepted rule | Rejected boundary |
|---|---|---|
| `HD-098-01 / 1C-bounded` | 一般RD可在exact non-stale source所屬整數主版次下，自訂未占用且沿lineage向前的minor suffix；major prefix由server固定 | 不允許輸入完整major／minor、跨major、回退、重用、stale輸入或minor Released |
| `HD-098-02 / 2A` | production前進後，舊base branch freeze；只能查看、申請作廢或從current production另開branch | 不續舊minor、不把舊suffix接到current major、不改寫branch base |
| `HD-098-03 / 3A` | Current Phase不做內容merge；major核准稱`採用為量產版` | 不以`merged`狀態冒充內容套用；真正merge不在本期 |

`1C-bounded`是使用者對原選項C的明確限縮，不等於「一般RD可自由輸入任何版次」。history backfill未由本決策開放到
canonical Drawing；既有歷史資料可讀，但任何新canonical backfill需另行re-entry。

## 2. 問題與成功結果

目前「版次」同時被用來表示建議值、研發里程碑、量產發布、歷史補登與sandbox synthetic revision；
而「研發分支」又曾分別綁submission與canonical Drawing。這讓使用者無法判斷：

- 版次在哪一步被承諾與取得唯一性。
- minor核准後是否會影響量產。
- 某一分支升production後，其他分支還能做什麼。
- 所謂merge是否真的套用內容。

成功結果：使用者從單一Drawing工作臺可看到目前量產基準、每條open branch最新受控里程碑、目前處理責任與
唯一下一步；正常進版不需理解internal ID，例外行為不混入日常路徑。

## 3. 現況差距與架構影響

### 3.1 已確認事實

| 世代 | Owner | 版次／分支行為 | 保留或退役 |
|---|---|---|---|
| 舊manual revision | submission／package flow | server suggestion可修改，偏離需reason，支援history backfill | 只保留可治理的產品能力，不保留舊owner |
| 第一代sandbox | `source_submission_id` | clone fields/files/references，synthetic `-SBX-`，status-only merge | 全面退役，不回復雙主檔或merge命名 |
| canonical branch | stable Drawing | tuple revision、predecessor、global claim、最多3 open branch、minor／major formalization | 作為唯一target architecture |

程式事實來源：

- 舊override／backfill：`src/app/numbering/revisions/page.tsx`、`src/lib/drawing-submission-workbench.ts`。
- 舊sandbox：`src/lib/repositories/sandbox-async-repository.ts`、`src/app/api/submissions/[id]/approve/route.ts`。
- canonical branch：`db/schema.sql`、`src/lib/drawing-revision-work.ts`、
  `src/lib/repositories/drawing-revision-work-async-repository.ts`。
- current UI：`src/components/canonical-pdm-workbench.tsx`、
  `src/components/canonical-drawing-change-workspace.tsx`。

### 3.2 Current Architecture Impact

- Stable Drawing ID繼續是revision、branch、work、files與history的唯一owner。
- `drawing_rd_branches`、`drawing_revision_claims`、`drawing_revision_works`與
  `canonical_workbench_states`維持正常進版authority。
- stale是由`branch.base_production_revision_id != current production revision id`推導的狀態，
  不新增第三種branch persisted status；branch仍只有`open／historical`。
- 正常進版不新增第二套workspace；沿用contract token、If-Match、idempotency key、exact predecessor與全Drawing
  tuple claim。server推薦target沿用candidate token；自訂minor由create transaction依§7.1重新驗證。
- bounded manual minor沿用existing claim與`drawing_revisions.policy_snapshot_json`。SQLite `TEXT + json_valid`與
  PostgreSQL `JSONB`皆已存在，且tuple唯一性仍由`drawing_revision_claims`實體constraint負責；本案以§15.4的typed、
  versioned snapshot寫入selection evidence，不新增DDL，也不得以JSON取代全Drawing tuple claim。

## 4. Domain Vocabulary 與不變量

| 名詞 | 定義 |
|---|---|
| `量產基準` | 目前唯一production-effective major revision `N` |
| `研發分支` | 從exact production revision或pre-production base開始的工作lineage |
| `工作版次` | 已claim、尚未核准的target revision與work snapshot |
| `研發里程碑` | 已核准minor `N.x`；受控但不改量產基準 |
| `量產採用` | current-base branch的major `N+1`核准後原子切換production |
| `stale branch` | branch base不再等於current production；是derived condition |
| `basis state` | server由current production、branch base與source tuple推導的`current／stale／preproduction`；只投影必要語意，不新增persisted branch status |
| `歷史補登` | legacy受控歷史能力；本Current Phase只讀，不開放canonical Drawing新增入口 |
| `自訂研發小版` | RD只輸入server固定主版次下的minor suffix；可偏離建議值但仍受lineage與claim約束 |

不可變規則：

1. major `N`才可成為`Released`；minor `N.x`永遠不得成為production-effective release。
2. revision以`(major, minor)`tuple比較與唯一化；label只由server formatter產生。
3. 同company＋Drawing＋tuple全域唯一，server推薦與manual minor共用同一claim authority。
4. 每個approved revision保存exact predecessor；不得靠label排序推測lineage。
5. branch base一經建立不可改寫；轉新基準必須建立新branch。
6. 每Drawing最多3個open branches；active、review、system、blocked與approved-idle都計入。
7. approved identity、claim、受控artifact與必要policy snapshot不可刪除或重用。
8. 未核准work取消可移除work與claim；已有approved milestone的branch不得以cancel物理刪除歷史。
9. manual minor的major必須等於exact non-stale source的base major；minor為正整數且嚴格大於該lineage
   predecessor minor。可跳過未使用suffix，但不得回退、重用或從stale source建立。
10. 任何history backfill不得更新production pointer、open branch latest或current workbench row；DEV-098 Current Phase
    不新增canonical backfill mutation。
11. 沒有內容apply與conflict resolution時，UI／API／audit不得使用`merge`一詞。
12. stale freeze不只限制target建立；既有work的update、file、recognition user mutation、submit、approve與formalization retry
    都必須重新驗basis。只有查看、已受理extract evidence completion、review退回、owner取消、approved-idle作廢與從current
    production重開屬合法收斂動作。
13. 所有Drawing revision create／update／file／recognition user mutation／submit／approve／formalize／return／cancel／void
    transaction都先鎖同一Drawing aggregate，再依固定順序鎖current production、source state、exact branch、claim／work與
    recognition session（若有）；不得以nullable outer join鎖branch，也不得把basis guard放在transaction外。
14. pre-production只允許`currentProductionRevisionId=null`、branch base=`null`且source tuple major=`0`的`0.x`lineage；
    production candidate固定為`1`。其他null／major組合是basis invariant failure，不可猜測或補假production。

## 5. Current Phase State Contract

### 5.1 正常branch lifecycle

```text
production N 或 pre-production base
  → 建立branch（若來源為production）
  → 原子claim target＋建立work＋current row handling=owner
  → 送審 handling=review_owner
     ├─ 退回：同work回owner，保留新review cycle
     └─ 核准：handling=system，驗證exact snapshot
          ├─ minor N.x：revision=rd_controlled，branch.latest更新，branch=open idle
          └─ major N+1：revision=released，舊production=superseded，來源branch=historical
```

Current handling仍固定`none／owner／review_owner／system／system_admin／blocked`；DEV-098不新增另一套工作狀態。

### 5.2 Cancel、void與history

- branch第一個未核准work取消：刪work、未核准revision identity與claim；空branch移除並釋放cap。
- 已有approved milestone的next work取消：只刪本次work／claim，branch回approved latest idle。
- approved idle branch作廢：沿用exact latest snapshot與review；核准後branch historical、current row移除、cap釋放，
  artifact與approved identity永久保留。
- historical branch不可reopen；從current production續作必須建立新branch。

### 5.3 Stale branch freeze contract

- stale branch不可提出server推薦minor、manual minor或major candidate。
- target／create API不得把current production major與stale source minor suffix拼成新label，也不得沿舊lineage續minor。
- list／detail projection先推導`basisState`。已知stale的idle row不顯示`進版`，可見動作只保留row本身的查看、合法時
  `申請作廢`與`從目前量產版建立新工作`；target dialog中的stale recovery只處理清單載入後才前進的race，不是主要入口。
- 新工作從current production建立新branch與new predecessor；不自動複製舊branch payload、不改寫base，
  也不宣稱rebase／merge。
- UI只顯示`量產基準已更新`與一項可行恢復動作，不顯示base revision ID、branch ID或predecessor ID。

production由其他branch前進時，不自動刪除或改寫既有work、review、claim、file snapshot或audit；依當時handling固定收斂：

| Stale時handling | 可見／允許 | 必須拒絕 | 收斂結果 |
|---|---|---|---|
| `none`且有approved milestone | 查看、申請作廢、從current production重開 | recommended／manual／major target | 作廢核准後historical，或保留唯讀歷史 |
| `owner` | 唯讀開啟exact workspace、`取消本次工作` | PATCH、upload/remove、recognition create／decision／rerun／formalize、submit | 取消依§5.2移除未核准work／claim；approved history與已受理extract evidence保留 |
| `review_owner` | reviewer唯讀查看、`退回修改` | `核准`與任何formalize | 退回後work回owner但仍唯讀，只能取消 |
| `system／system_admin／blocked` | 保持既有處理／管理員恢復面 | 另一branch的major adoption | 先完成或安全收斂該formalization，再允許production前進 |

major adoption transaction必須在切換production前檢查其他open branch；若存在`system／system_admin／blocked`，回
`DRAWING_FORMALIZATION_PENDING` 409且舊production不變。兩個approve併發由aggregate-first鎖序序列化；後取得鎖者若已stale，
必須在`begin approval／handling=system`之前回`DRAWING_PRODUCTION_BASE_STALE`。review退回與owner取消是cleanup exception，
不代表stale branch可續作。

### 5.4 Pre-production basis contract

- 沒有current production row時，只允許既有open RD branch以`base_production_revision_id=null`持有`0.x`source；
  `basisState=preproduction`且不是stale。
- `0.x`可建立更大的未占用`0.y`minor，或使用server候選`1`送審採用為第一個production；minor仍不得Released。
- `1`核准時重驗current production仍為null、branch base仍為null且source predecessor仍exact；若期間出現production，
  該branch依一般stale contract處理。
- 無current production時沒有restart recovery URL；若source不是canonical `0.x`或base非null，回
  `DRAWING_REVISION_BASIS_INVALID`且zero write，不建立假production `0`。

## 6. UI Entry Contract

### 6.1 Target actor與正常入口

| Actor | 正常入口 | 可見能力 |
|---|---|---|
| 具Drawing view的同公司使用者 | `/numbering/drawings` | 量產／研發列、唯讀drawer與歷史 |
| 具workspace create/update的RD／owner | 同上，選取Drawing列 | non-stale時`進版`、選server建議或自訂同主版次minor、編輯／送審／取消；stale既有work只讀＋取消 |
| exact reviewer | `/approvals` → request | 唯讀相同Drawing workspace；non-stale可核准／退回，stale只可退回 |

### 6.2 正常進版操作

1. 使用者從`圖號工作臺`選取量產或研發列，開啟唯讀drawer。
2. 合法且idle時，drawer action顯示`進版`；點擊後開啟單一`選擇進版方式`dialog。
3. dialog預設選取server建議，例如`建立研發版 1.3`；同一dialog提供`自訂研發小版`，只顯示read-only
   major prefix與單一minor suffix輸入，例如`1 . [ 5 ]`。production target仍只顯示server候選
   `採用為量產版 2`。
4. 使用者按唯一primary action後，系統原子驗證並建立work，再前往
   `/numbering/drawings/{drawingId}/workspace?workId={workId}`。
5. owner完成檔案／辨識／必要工程資料後送審；reviewer從`/approvals`進入唯讀同骨架頁。

介面規則：

- dialog只有「選擇目標版次」一個主焦點與「建立進版工作」一個primary action；自訂模式只新增minor suffix
  input，不另開巢狀modal或full-page exception manager。
- major prefix、完整revision label與predecessor都由server決定；client不得提供可編輯完整revision字串。
- minor suffix接受無前導零正整數；submit前可做即時格式提示，但server validation才是authority。
- dialog不顯示branch、claim、basis hash、source row或policy version。
- production target核准前仍屬研發工作，workspace不得提前顯示成已量產。
- list／drawer由server-derived `basisState`決定動作。已知stale的idle row直接顯示`從目前量產版建立新工作`，不先顯示
  `進版`；若production在drawer開啟後才前進，原dialog就地切成stale recovery。
- stale owner workspace沿用同一Drawing骨架但所有欄位、檔案與辨識mutation唯讀，只保留`取消本次工作`；stale reviewer
  workspace停用／隱藏`核准`並保留`退回修改`。不得另建大型說明頁或第二套workspace。
- stale row不顯示minor輸入；branch cap、target claimed、row version stale、formalization pending與permission denial各只顯示
  一項最短原因及可行恢復動作。
- 一般畫面不得出現`merge`；Current Phase採`採用為量產版／申請作廢／另開研發工作`。

action projection固定：

| Basis／handling | Action key | Label／destination |
|---|---|---|
| current／preproduction＋`none` | existing `advance` | `進版` → selected row targets GET |
| stale＋`none` | `restart_from_current_production` | `從目前量產版建立新工作` → current production row targets GET |
| stale＋`none`且有approved milestone／void權限 | existing `void_rd` secondary | `申請作廢` → exact stale branch void request；不得取代restart primary |
| stale＋`owner` | existing `edit` | `查看工作` → exact workspace，以server interaction capability轉唯讀 |
| stale＋`review_owner` exact reviewer | existing `review` | `前往審核` → exact review workspace，只允許return |

`CanonicalWorkbenchStateRecord`可保留internal `currentProductionRowId`供server產生opaque restart href，但
`CanonicalWorkbenchRowDto`只輸出`basisState`與完整actions，不輸出raw row／revision／branch IDs。current production不存在時
不得產生restart action。

### 6.3 可觀察狀態與fail condition

- Loading：dialog／workspace有就地進度，不清空既有主預覽或整頁閃白。
- Empty：真正無候選時顯示原因與恢復路徑；不得顯示空dialog或假成功。
- Error：任何4xx／5xx、claim collision或stale contract顯示繁體中文訊息，保留原頁與重試／刷新路徑。
- Stale-in-flight：PATCH／submit／approve收到`DRAWING_PRODUCTION_BASE_STALE`時，保留exact preview、files與scroll，
  就地轉唯讀；owner可取消，reviewer可退回，不得reload後仍顯示可編輯／可核准。
- Permission：沒有workspace create權限不得靠direct request使用manual minor；server回403且DB delta=0。
- Narrow：1024與390px保留Drawing識別、目前版次、主要動作與錯誤恢復；無水平溢出、重疊或按鈕截斷。
- 任一正常入口不存在、只能direct URL到達、點擊無反應、visible error、錯誤版次label或底層成功但UI未導向work，均為QC FAIL。

## 7. API、Data 與 Permission Impact

### 7.1 正常進版API保持單一authority

現行route保留：

| Route | Contract |
|---|---|
| `GET /api/pdm/drawings/{drawingId}/revision-targets?sourceRowKey=...` | 由source row與current DB state產生推薦候選、manual minor rule、signed candidate token與contract token |
| `POST /api/pdm/drawings/{drawingId}/revision-works` | 依selection mode驗candidate token或requested minor，再驗contract token、If-Match、actor與claim後原子建work |
| `GET/PATCH /api/pdm/drawing-revision-works/{workId}` | exact work read；PATCH另重驗basis，stale只讀 |
| `POST/DELETE .../{workId}/files[/fileBindingId]` | upload／remove在寫入storage或DB前重驗basis；stale不得產生新object、binding或soft-delete |
| `POST .../{workId}/submit` | 重驗basis後freeze exact snapshot並建立review request；stale zero write |
| `POST .../{workId}/cancel` | 依是否有approved milestone執行兩種cancel |
| `POST /api/pdm/drawing-rd-branches/{branchId}/void-requests` | approved idle branch受控作廢 |
| `GET /api/pdm/review-requests/{requestId}` | drawing revision review由service投影exact interaction capability；route不得硬編approve action |
| `POST /api/pdm/review-requests/{requestId}/decisions` | approve在begin system前重驗aggregate／basis；stale只允許return cleanup |
| drawing-revision scoped recognition user commands | create／decision／rerun／formalize先重驗basis；stale 409。已受理session的worker／client-adapter extract completion可保存evidence，但不得formalize或回寫work payload |

candidate response固定為下列additive replacement；`source`是create所需的opaque row context，`recovery`只負責
把stale使用者帶回current production的正常target GET，不直接建立work：

```ts
type DrawingRevisionTarget = {
  kind: "rd" | "production";
  revision: string;
  label: string;
  enabled: boolean;
  reasonCode:
    | "DRAWING_TARGET_REVISION_CLAIMED"
    | "DRAWING_RD_BRANCH_LIMIT_REACHED"
    | null;
  reason: string | null;
  candidateToken: string | null;
};

type DrawingManualMinorRule = {
  enabled: boolean;
  major: number | null; // server-derived, read-only
  predecessorMinor: number | null;
  minimumExclusive: number | null;
  maximumInclusive: 2147483647;
  reasonCode:
    | "DRAWING_PRODUCTION_BASE_STALE"
    | "DRAWING_RD_BRANCH_LIMIT_REACHED"
    | null;
  reason: string | null;
};

type DrawingRevisionTargetResponse = {
  data: {
    source: {
      rowKey: string;
      rowVersion: number;
      revision: string;
      layer: "production" | "rd";
      basisState: "current" | "stale" | "preproduction";
      stale: boolean; // compatibility alias，等於basisState === "stale"
    };
    candidates: DrawingRevisionTarget[];
    manualMinorRule: DrawingManualMinorRule;
    recovery: null | {
      kind: "restart_from_current_production";
      label: "從目前量產版建立新工作";
      enabled: boolean;
      reasonCode: "DRAWING_RD_BRANCH_LIMIT_REACHED" | null;
      reason: string | null;
      targetsHref: string | null;
    };
  };
  meta: { contractToken: string; correlationId: string };
};

type DrawingRevisionWorkTargetRequest =
  | { sourceRowKey: string; selectionMode: "recommended"; candidateToken: string }
  | { sourceRowKey: string; selectionMode: "manual_minor"; requestedMinor: number };
```

candidate token升為payload version 2，綁`selectionMode="recommended"`、company、actor、Drawing、source row、
source row version、target tuple與expiry；舊version 1 token一律409重新取候選。POST body採exact-key parser：manual mode若夾帶
`candidateToken`、`major`、`revision`或完整`target`，recommended mode若缺token或夾帶`requestedMinor`，皆422且zero write。
create transaction必須重新讀current production、branch base、open count與已claim tuples，不得只信token。
token secret解析順序必須與canonical workbench一致：`PDM_WORKBENCH_CONTRACT_SECRET → PDM_AUTH_SECRET → AUTH_SECRET`；
production三者皆缺時丟`PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED`且不簽token，固定local fallback只允許non-production。

`CanonicalWorkbenchRowDto`同步加入非敏感`basisState`，只供action projection與workspace recovery；不得包含base／current revision ID。
list／detail在同一bounded query projection推導，不可為每列追加N+1 basis query。`basisState`只是read model，不新增DB欄位或branch status。

work／review GET additive回傳server capability，不以既有`readonly`布林同時承擔actor與stale語意：

```ts
type DrawingRevisionInteraction = {
  mode: "owner_edit" | "owner_stale_cleanup" | "review_decide" | "review_stale_cleanup";
  basisState: "current" | "stale" | "preproduction";
  canMutateContent: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canReturn: boolean;
  reasonCode: "DRAWING_PRODUCTION_BASE_STALE" | null;
};
```

owner-stale固定`canCancel=true`且其他mutation false；review-stale固定`canReturn=true`且approve false。client只依此capability
顯示控制，但PATCH／submit／cancel／decision route仍各自server-side重驗，不信任GET結果。既有`readonly`保留為
`!interaction.canMutateContent`相容alias，不得再用它判斷footer是owner或reviewer；review response的`actions`也必須由interaction導出。

### 7.2 Bounded manual minor contract

manual minor只在source row為idle、non-stale且使用者具normal create permission時enabled。server從source state取得major，
client只送`requestedMinor`；create transaction依序驗證：

1. `requestedMinor`是`1..2147483647`的整數，wire不得帶完整revision string、major或前導零語意。
2. source是current production row、base仍等於current production的open RD branch，或符合§5.4的pre-production `0.x`branch。
3. requested minor嚴格大於source predecessor minor；從production建立新branch時predecessor minor視為0。
4. `(company, drawing, major, requestedMinor)`不存在且未claim；允許跳過未使用suffix，不要求等於推薦值。
5. 新branch仍遵守open branch `< 3`；既有branch仍遵守每branch最多一個active work。
6. claim、revision、work、work-file snapshot、canonical row與policy evidence同transaction建立。

revision policy evidence至少可查驗`selection_mode`、server-derived major、requested minor、policy version與source row version；
不要求使用者填override reason。history backfill、manual major、跨major minor與stale manual minor不屬此mode。

### 7.3 Permission boundary

| Capability | Required server authority |
|---|---|
| View list／drawer／history | `numbering.drawings.view`＋same company |
| Create normal work | `numbering.workspace.create`＋目前Drawing頁需要的draft update gate |
| Update／cancel owner work | existing workspace update／cancel＋owner或approved non-owner edit scope；stale只允許cancel cleanup |
| Submit | `numbering.candidate.review.submit`＋non-stale basis |
| Decide exact review | `numbering.candidate.review.decide`＋exact reviewer；stale只允許return cleanup |
| Void approved RD branch | `numbering.draft.obsolete` |
| Manual minor | 與normal work相同，不新增角色；server另驗§7.2全部invariants |

所有route都必須server-side重驗same company、permission、actor、row version與exact target；UI隱藏不構成授權。

## 8. Transaction、Concurrency 與 Failure Recovery

### 8.1 Transaction invariants

- recommended／manual create、owner PATCH、file upload／remove、drawing-revision scoped recognition user mutation、submit、
  approve／formalize、return／cancel與void共用固定鎖序：Drawing aggregate → current production state → source state →
  exact branch（若有）→ claim／work → recognition session／candidate（若有）。basis判定與business write必須同transaction，
  不得在transaction外先判定後再寫；open count、branch、claim、work、revision與current row必須原子一致。
- PostgreSQL branch lock使用獨立`SELECT ... FOR UPDATE`；不得對`LEFT JOIN drawing_rd_branches`的nullable side使用
  `FOR UPDATE OF branch`。SQLite沿用serializable write transaction與aggregate CAS，但語意、錯誤與winner必須同構。
- 同target併發只有一個winner；loser回stable collision，無orphan branch／claim／revision／work。
- 第四條open branch原子拒絕；既有non-stale branch可續作，stale branch一律freeze。
- minor與major formalization都重驗branch base；stale review不得進入system。major另檢查其他branch沒有
  `system／system_admin／blocked`，失敗時維持舊production有效且work／review可收斂。
- manual minor的server-derived major、requested minor、selection mode、policy basis與tuple reservation寫入同transaction。
- API retry以idempotency key＋effect key readback回同一結果；不得建立第二work或第二history revision。

### 8.2 Stable failure classes

| Failure | HTTP／行為 | 可見恢復 |
|---|---|---|
| contract／candidate過期 | 409、zero write | 重新取得可用版次 |
| row version stale | 409、zero write | 重新載入目前資料 |
| target claimed | 409、zero write | 刷新候選 |
| branch cap reached | 409、zero write | 完成或作廢既有branch |
| manual minor格式／範圍錯誤 | `DRAWING_MANUAL_MINOR_INVALID`、422、zero write | 就地修正小版尾碼 |
| manual minor非向前 | `DRAWING_MANUAL_MINOR_NOT_FORWARD`、409、zero write | 顯示目前主版與最小可輸入值 |
| stale branch target forbidden | `DRAWING_PRODUCTION_BASE_STALE`、409、zero write | 查看、作廢或從目前量產版另開 |
| stale active work content／file／recognition／submit | `DRAWING_PRODUCTION_BASE_STALE`、409、zero business write | 保留內容與既有extract evidence並取消本次工作 |
| stale review approve | `DRAWING_PRODUCTION_BASE_STALE`、409、不得begin system／formalize | reviewer退回，owner取消 |
| other branch formalization unresolved | `DRAWING_FORMALIZATION_PENDING`、409、production不變 | 先完成或安全收斂系統處理 |
| invalid pre-production basis | `DRAWING_REVISION_BASIS_INVALID`、409、zero write | 管理員修復basis；不得建立假production |
| create permission denied | 403、zero write | 返回唯讀drawer；不洩漏claim資料 |
| snapshot drift at review | 409、不得formalize | 退回修改後重新送審 |
| retry-safe apply failure | 保持system後bounded retry | 顯示處理中，不提前宣稱完成 |
| unsafe invariant failure | handling=blocked | 顯示一項管理員原因；舊production持續有效 |

## 9. Verification Integrity Matrix

| Acceptance／risk | Normal delivery path | Fixture boundary | Forbidden shortcut | Fail condition | Required evidence |
|---|---|---|---|---|---|
| 入口可發現 | 圖號工作臺→row→drawer→進版 | 可seed合法Drawing與idle rows | direct URL開workspace | drawer無進版、權限錯或點擊無反應 | 起始頁到dialog的錄屏／截圖、role、route |
| 正常候選正確 | 進版dialog載入server targets | 可seedproduction／RD／claims | 直接呼叫API後宣稱UI完成 | label、enabled或原因與DB basis不符 | UI＋API payload＋read-only tuple reconciliation |
| bounded manual minor | 進版dialog→自訂研發小版→只輸入suffix→建立work | 可seednon-stale production／RD source與已占用tuple | client直接組完整label或DB insert | major可編輯、回退／重用／stale仍成功、推薦值被誤當唯一值 | dialog互動、request body、policy snapshot、tuple／predecessor readback |
| 原子claim | UI選candidate→建立work→workspace | 可seed競爭前置資料 | DB直接insert成功work | 兩winner或orphan row | UI network、兩actor結果、DB delta／FK |
| minor／major語意 | owner送審→reviewer核准→返回工作臺 | 可seed起始work，不可seed核准後狀態 | repository直接formalize | minor改production或major非current-base仍發布 | owner／reviewer UI、API correlation、DB readback |
| stale branch安全 | 其他branch先推production，再從舊row操作 | 可seed兩branch前置並用UI完成promotion | 只unit test candidate function | 出現混合`2.3`、可升major或無恢復路徑 | before／after UI、candidate payload、lineage tuples |
| stale in-flight收斂 | owner編輯或review pending時由其他branch推production | 可seedpromotion前的active work／review，不可seed收斂結果 | 只測target GET或把work直接刪掉 | stale仍可PATCH／submit／approve、證據遺失或branch cap無合法釋放路徑 | owner／reviewer UI、API correlation、work／claim／review before-after |
| pre-production `0.x → 1` | 無production的`0.x`branch建立minor並採用第一個major | 可seedbase=null的approved `0.1`與canonical row | seed假production 0或直接改pointer | major不是0／1、null basis被猜測或minor Released | tuple oracle、basis projection、approval與production readback |
| provider lock parity | disposable PostgreSQL執行create／approve併發與lock query | 可用task-owned provider fixture | 只以SQLite或SQL字串掃描宣稱交易通過 | nullable outer-join lock error、deadlock、雙winner或不同stable error | provider manifest、timing／lock ledger、DB readback |
| unauthorized／invalid manual fail closed | 無create權限或輸入非法suffix後提交 | 可seed合法source，不seed完成結果 | 只測UI disabled | direct request成功或留下claim／revision／work | 角色成對UI、403／409／422、DB zero delta |
| merge詞彙真實 | 一般進版、核准、歷史與audit畫面 | 一般branch fixture | 只掃一個component字串 | status-only行為仍顯示merge | rendered UI＋API action inventory＋audit projection |
| visible／RWD | 1440／1024／390從正常入口完整操作 | 代表性1 production＋3 branch資料 | build／lint代替畫面 | alert、4xx／5xx、空白閃爍、溢出、重疊、截斷 | viewport screenshot、console／network sweep、keyboard |

QA至少包含一個fail-seeking案例：故意讓current production在candidate取得後、create前前進；舊token必須409且zero write，
不得自動換號或導向別人的work。

## 10. Acceptance Criteria

1. 從正常圖號工作臺可發現並完成進版，沒有第二套submission／sandbox mutation入口。
2. 同一Drawing同時正確投影0／1 production與0～3 open branch latest；舊revision只在history。
3. server推薦由exact source與current state產生；manual mode只允許輸入server固定major下、嚴格向前且未占用的
   minor suffix。client不可提交完整revision或major。
4. `1.2` stale branch在production 2時不會得到`1.3`或`2.3`，manual mode也不可用；idle時只能查看、作廢或從2另開。
5. minor核准只建立受控研發里程碑；major核准只有current-base branch可原子成為新production。
6. cancel、void、production promotion各自正確釋放或保留branch cap、claim、identity與artifact。
7. 同target併發與第四branch都只有合法winner，所有loser zero write且訊息可恢復。
8. `recommended`與`manual_minor`共用claim／transaction／permission authority；manual可跳未使用suffix但不能回退、
   重用、跨major、手動major或要求override reason。
9. stale freeze有成對UI／API／DB evidence；owner active時PATCH／file／user recognition mutation／submit拒絕但可取消，review pending時approve拒絕但可退回，
   不得保留沿舊lineage續minor或current-major＋舊suffix write path。
10. Current Phase所有使用者／API文字不把status-only promotion稱為merge。
11. 正常、loading、empty、error、permission、review、system、blocked與窄版皆無visible error、無不合理空資料、
    無水平溢出或不可達primary action。
12. pre-production只接受base=null的canonical `0.x`，可續合法`0.y`並由server採用為第一個production `1`；不得seed或顯示假production 0。
13. SQLite與PostgreSQL provider contract同構；aggregate-first鎖序在disposable PostgreSQL實際通過，DEV-098 schema／migration為none，
    schema／migration history不得出現本案delta。

## 11. QA／QC Gate 與 Evidence Required

Risk：`High / P0`，因為本案修改numbering、lifecycle、permissions、state transition與跨UI/API/DB路徑。

Fixed QA plan已建立於
`.ai-doc/qa/qa-dev-098-drawing-revision-branch-lifecycle-validation-plan-2026-08-25.md`，案例固定為
`QA-098-001..031`，至少分為：

- Contract：tuple、recommended／manual_minor、stale、permission、error envelope與retired legacy surface。
- Repository：0／1／3／4 branch、同target concurrency、cancel／void／promotion、stale owner／review收斂、pre-production、fault injection。
- Browser：recommended與manual owner journey、exact reviewer journey、stale projection與race recovery、權限角色成對、history、
  四viewport與keyboard。
- PostgreSQL：aggregate-first lock、nullable outer-join negative guard與create／approve concurrency；不可由SQLite替代。
- Schema／reconciliation：本案固定no migration／no backfill；驗existing provider constraints、legacy `{}`相容與primary前後invariant。
- Independent QC：不得import產品candidate／oracle實作計算expected；從primitive tuples與raw ledgers重算。

Required evidence provenance：source commit或明確dirty boundary、build artifact、DB provider/schema hash、base URL、route、
target role、fixture來源、viewport、操作步驟、network correlation、DB readback、first failure與cleanup receipt。

禁止用build、lint、direct URL、API success、DB seed後結果或RD自述取代正常UI delivery path。

## 12. Stop Conditions

以下任一成立即停止RD readiness／實作並回Dev PM或使用者：

- implementation planning把`1C-bounded`解讀成可自由輸入完整revision或跨主版次。
- 任何方案允許minor成為Released、manual major、major跳號、manual minor回退／重用或branch base被原地改寫。
- manual minor無法與server推薦共用全Drawing tuple claim與transaction authority。
- canonical backfill會建立current row、改production／branch latest，或必須猜測legacy lineage。
- stale branch仍可取得recommended／manual target，或保留`續舊lineage`／`current major＋舊suffix`write path。
- stale owner仍可PATCH／submit、stale reviewer仍可approve，或major adoption可跨越其他branch的unresolved system／blocked處理。
- transaction未固定aggregate-first鎖序、仍對nullable outer join branch加鎖，或pre-production null basis靠猜測生成target。
- 操作稱merge但沒有exact source/target、diff、conflict resolution、atomic apply與recovery。
- 需要production資料修改、正式migration、deploy、release、實體刪檔或破壞性Git操作。
- 直接相關dirty hunk無法與其他任務安全分離。

## 13. Phase、Deferred Scope 與 Re-entry

| Phase | Execution boundary | Document status | Scope | Entry／exit |
|---|---|---|---|---|
| 098-A | 文件與決策 | Complete／Human Confirmed | HD-098-01～03、ADR與authority convergence | 本SPEC達RD Contract Ready |
| 098-A2 | Implementation readiness | Complete／RD Implementation Ready | exact file／wire／validator／schema／transaction／fixed QA | 本文件§15與QA-098-001..031完成；尚未改產品 |
| 098-B | 本機生命週期實作 | RD Not Started／Local Eligible | recommended／manual minor、stale freeze、branch／production adoption、UI vocabulary | 使用者要求實作後進入；RD self-test與targeted QA PASS |
| 098-C | 本機整合驗證 | Future Phase Captured | SQLite／disposable PostgreSQL、owner/reviewer UI、independent QC | 098-B PASS；31/31、P0/P1=0；缺PostgreSQL即Blocked而非PASS |
| Release | 正式環境 | Release Gate Required | migration rehearsal、activation、deploy、smoke | 使用者另行提出release型指令 |

真正three-way／CAD／BOM merge是`Future Phase Captured / Not Requested`。只有使用者另行要求改變`HD-098-03 / 3A`
時重新進入，並先補source/target ownership、diff grammar、conflict owner、atomic apply、idempotency、compensation與
獨立驗收；不得塞入098-B。canonical history backfill同樣不在098-B，需另行人類決策與data-repair gate。

## 14. Spec Governance Result

- Cross-spec classification：`Intentional replacement + compatible preservation`。DEV-087 auto-only minor／stale續minor被取代；
  canonical state、claim、branch cap及DEV-050 minor release gate保留。
- ADR：`Accepted`，見
  `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-bounded-manual-minor-and-stale-freeze.md`。
- dev_task／map：DEV-098同步為`RD Implementation Ready / Human Confirmed / RD Not Started`。
- QA plan：已建立`QA-098-001..031`與FMEA，只覆蓋DEV-098 delta並以必要DEV-087 regression守住parent contract，
  不複製DEV-087全部歷史分母，也不虛構任何PASS。
- Deferred Scope Audit：真正merge與canonical history backfill為Future／re-entry；production為Release Gate。
- RD status：implementation packet完整、P0/P1 readiness gap=0；本輪未要求實作，產品程式尚未修改。

## 15. RD Implementation Ready Contract

### 15.1 Repository fact baseline與必修缺口

2026-08-25 read-only盤點固定以下事實，RD不得以training-time Next.js／舊架構假設取代：

1. `src/lib/repositories/drawing-revision-work-async-repository.ts#listCandidates`目前以current production major加上
   source minor + 1；stale `1.2`在production `2`時可落入`2.3`，與HD-098-02衝突。
2. `DrawingRevisionWorkService.create`只接受candidate token；route會把body縮成`sourceRowKey/candidateToken`，尚無
   discriminated manual request parser。
3. `canonical-pdm-workbench.tsx`目前把每個candidate button直接當mutation action，尚無mode selection、minor input、
   一個primary action、stale recovery或modal-local busy state。
4. tuple唯一性已由SQLite／PostgreSQL的
   `UNIQUE(company_id, drawing_id, target_major, target_minor)`保護；approved claim immutable與branch cap既有。
5. `drawing_revisions.policy_snapshot_json`兩provider皆已存在；但create目前寫`{}`，formalize又以
   `{changeImpact}`整包覆寫。DEV-098必須在create寫入target policy，formalize採read-merge-write保留它。
6. `canonical_workbench_states`的current production row已含opaque row ID／row version，可供stale recovery重新取得
   正常targets；不需建立第二條create route或直接複製舊branch內容。

### 15.2 Exact add／modify／no-touch map

| Disposition | File | Exact responsibility |
|---|---|---|
| Add | `src/lib/drawing-revision-target-contract.ts` | shared DTO、exact-key request parser與wire normalization；不得讀DB、secret或UI state |
| Add | `src/lib/drawing-revision-target-token.server.ts` | `import "server-only"`；只負責v2 HMAC sign／verify、expiry與actor／company／Drawing／source／tuple binding；secret chain與canonical workbench相同，production缺secret fail closed |
| Add | `src/lib/drawing-revision-lifecycle-policy.ts` | pure basis／target resolver、manual validator、interaction capability projector與typed policy snapshot build／merge；不得讀env、DB或UI state |
| Modify | `src/lib/drawing-revision-work.ts` | target response、manual request normalization、mode-specific idempotency request／effect key、work／review interaction capability projection、update／remove file／submit／review basis guards與service error mapping |
| Modify | `src/lib/drawing-revision-work-file.ts` | upload transaction先鎖aggregate並在任何storage put／DB write前執行locked basis guard；stale zero object／zero row，保留既有補償清理 |
| Modify | `src/lib/repositories/drawing-revision-work-async-repository.ts` | aggregate-first locked resolver、separate branch lock、pre-production／stale authority、recommended/manual target、policy snapshot create／formalize merge與in-flight cleanup guards |
| Modify | `src/lib/drawing-recognition.ts` | drawing_revision scoped使用者mutation在自身transaction先取得aggregate並共用locked basis guard；stale禁止create／decision／rerun／formalize；已受理session的worker／client-adapter只可完成extract evidence且不可正式化或回寫work payload |
| Modify | `src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts` | 將raw JSON交給strict parser／service；不得`String()`吞掉型別或忽略forbidden target keys |
| No behavior change | `src/app/api/pdm/drawings/[drawingId]/revision-targets/route.ts` | route與no-store保持；response由service additive升級 |
| Modify | `src/app/api/pdm/review-requests/[requestId]/route.ts` | drawing_revision action改取service interaction capability；不得在route固定輸出approve／return，Part／其他request kind行為不變 |
| Modify | `src/lib/pdm-canonical-workbench-contract.ts` | 加入`basisState`、`DrawingRevisionInteraction` DTO、restart action及manual／stale／formalization／basis stable codes |
| Modify | `src/lib/repositories/pdm-canonical-workbench-async-repository.ts` | list／detail同一bounded query推導basis state；不得N+1或投影internal revision IDs |
| Modify | `src/lib/pdm-canonical-workbench-state.ts` | 依basis＋handling輸出non-stale進版、stale restart／void、stale owner view／cancel與review cleanup action |
| Modify | `src/components/canonical-pdm-workbench.tsx` | proactive stale actions、modal-local context/loading/submitting、radio modes、read-only major＋minor input、single primary、race recovery、focus／error preservation |
| Modify | `src/components/canonical-drawing-change-workspace.tsx` | stale owner/reviewer共用原workspace；就地轉唯讀，owner只可cancel、reviewer只可return，preview／scroll不remount |
| Modify | `src/app/globals.css` | 只增加target form／prefix／error／narrow styles；不得建立第二種modal外殼或固定大面板 |
| Modify | `scripts/qc-dev-087-commands.mjs` | 現有create calls明示`selectionMode="recommended"`並保留parent regression |
| Modify | `scripts/qc-dev-087-ui-only.mjs` | 現有candidate direct-click selector改為選mode＋唯一primary；保留原case IDs與分母 |
| Add | `scripts/qc-dev-098-contract.mjs` | `QA-098-001..005` static／service contract與forbidden-field negatives |
| Add | `scripts/qc-dev-098-repository.mjs` | `QA-098-006..016／027／028／030` isolated tuple／transaction／snapshot／stale in-flight／pre-production cases |
| Add | `scripts/qc-dev-098-browser.mjs` | `QA-098-017..024／029`正常入口、role、proactive stale action＋race recovery、no-flash、RWD／keyboard evidence |
| Add | `scripts/qc-dev-098-postgres.mjs` | `QA-098-031` disposable PostgreSQL aggregate-first lock、outer-join negative guard與併發evidence |
| Add | `scripts/qc-dev-098-aggregate.mjs` | fixed denominator、child manifest hash、first-failure、cleanup與P0/P1 gate；不執行production mutation |
| Modify | `package.json` | 增加`qc:dev-098:{contract,repository,browser,postgres}`與aggregate入口`qc:dev-098`，不得改既有command語意 |

No-touch：`db/schema.sql`、`db/postgres/*.sql`、`src/lib/db.ts`、舊submission backfill route、sandbox repository、
Part／BOM revision、production data、Cloud SQL migration history、file bytes與release scripts。本輪schema classification為`none`；
若RD發現必須碰no-touch項，立即依§12停止並回Dev PM重做impact。

### 15.3 Exact wire、parser與idempotency contract

`GET revision-targets`：

- current／preproduction回exact `source`、server候選、manual rule及`recovery=null`；可用RD推薦為dialog預設，若RD不可用則
  依序選第一個enabled production候選，完全無enabled target才進empty。production候選文案為
  `採用為量產版 N+1`。
- stale回`source.stale=true`、`candidates=[]`、manual disabled及一個recovery；不得簽candidate token。
- recovery `targetsHref`只指向same Drawing current production row的既有GET route；點擊後client以第二次GET response替換
  source context，不直接POST、不複製payload。
- branch cap已滿時recovery disabled並顯示`請先完成或作廢既有研發分支`；internal IDs不渲染。
- pre-production回`basisState=preproduction`、major=0、RD `0.x`與production `1`候選；current production不存在時
  `recovery=null`。非法null basis直接409，不回猜測候選。

`POST revision-works`：

- parser只接受§7.1兩種exact shape；`sourceRowKey`非空，`selectionMode`必填。
- recommended只接受v2 candidate token；任何v1、錯actor／company／Drawing／row／row version／expiry／signature皆409。
- manual只接受JSON number，且`Number.isSafeInteger`、`1..2147483647`；JSON string、0、負數、小數、NaN語意、
  `major/revision/target/candidateToken`皆`DRAWING_MANUAL_MINOR_INVALID` 422。
- request hash包含drawing、source row、selection mode、token target或requested minor、expected row version；manual effect key固定為
  `drawing:{drawingId}:source:{sourceRowId}:v{expectedRowVersion}:manual:{requestedMinor}`，recommended沿用resolved tuple key。
- 同idempotency key＋同request回原result；同key不同mode／minor回`IDEMPOTENCY_KEY_REUSED`；任何失敗transaction不留下receipt以外
  的partial business row，且失敗receipt不得冒充完成。

### 15.4 Repository algorithm與durable policy evidence

Repository create在同一serializable transaction依序執行：

1. 先以`company＋drawing`獨立查詢鎖Drawing aggregate；再鎖current production state、source state、exact source branch，最後
   鎖work／claim與recognition session／candidate（若有）。PostgreSQL不得用`FOR UPDATE OF branch`鎖`LEFT JOIN`nullable side；
   所有Drawing content／lifecycle mutation沿同一順序，basis guard不得放在transaction外。
2. 重驗company、Drawing、handling、active work、row version、branch status與open count，再由primitive rows建立
   `basisState=current／stale／preproduction`。RD base與current production revision ID不相等立即
   `DRAWING_PRODUCTION_BASE_STALE`；null basis只依§5.4判定，不計算猜測target。
3. current production由production revision解析major；current RD由exact base／current production解析major；pre-production只由
   canonical source `0.x`解析major=0。predecessor固定為source revision ID；manual minor必須大於source tuple minor，production
   source的minimum exclusive為0。
4. recommended target必須仍存在且enabled；manual target由server組成`{major, requestedMinor, label}`。兩者共用branch cap、
   branch建立、tuple claim與unique-collision mapping。
5. 同transaction建立branch（必要時）、claim、preparing revision、work、work-file snapshot、canonical state與policy snapshot；
   任一步失敗全數rollback。不得先建立revision再補claim。

Update／file／drawing-revision scoped recognition user mutation／submit／review approve／formalize不得只信work建立時policy snapshot；
皆以aggregate-first鎖序在同一transaction重讀current basis。stale時PATCH／file／recognition create／decision／rerun／formalize／
submit／approve與system retry回`DRAWING_PRODUCTION_BASE_STALE`且zero business write；return與cancel走同鎖序cleanup transaction。
major formalize另鎖定／檢查同Drawing其他open branch handling，存在`system／system_admin／blocked`即
`DRAWING_FORMALIZATION_PENDING`，不得先把review改為system或切production。

`drawing_revisions.policy_snapshot_json`固定寫入：

```ts
type DrawingRevisionPolicySnapshotV1 = {
  schemaVersion: 1;
  revisionTargetPolicy: {
    policyId: "PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001";
    policyVersion: 1;
    selectionMode: "recommended" | "manual_minor";
    sourceRowId: string;
    sourceRowVersion: number;
    sourceRevisionId: string;
    sourceBaseProductionRevisionId: string | null;
    currentProductionRevisionId: string | null;
    predecessorRevisionId: string;
    resolvedMajor: number;
    requestedMinor: number | null;
    resolvedMinor: number;
    resolvedLabel: string;
  };
  changeImpact?: unknown;
  [compatibleKey: string]: unknown;
};
```

recommended mode的`requestedMinor=null`；manual mode保存使用者提出值。create先寫target policy；formalize讀現有object後只merge
normalized `changeImpact`，不得刪`revisionTargetPolicy`或其他compatible keys。部署前已存在`{}`的preparing work仍可核准：
formalize把它視為legacy snapshot並只加`changeImpact`，不猜造target policy、不backfill歷史。新DEV-098 create只有在
target policy與全部business rows同transaction成功時才可回success；named fault injection必須證明policy write失敗會整筆rollback，
不得留下可送審的無證據新work。formalize必須在同transaction、revision仍非controlled時先完成snapshot merge，再切換
`rd_controlled/released`；controlled-content trigger生效後不得再補改policy evidence。

### 15.5 UI state machine與no-flash contract

`canonical-pdm-workbench.tsx`新增獨立`revisionTargetDialog`state，不共用全頁`busy/loading`：

```text
closed
  → loading-targets（保留drawer、2D/3D preview與scroll）
  → choosing（預設recommended RD；可切production或manual）
  → submitting
     ├─ success：關閉drawer並導向exact work
     └─ 4xx/5xx：回choosing，保留mode、minor、preview與焦點

loading-targets(stale)
  → stale-recovery（無target radio／minor input）
  → 點「從目前量產版建立新工作」
  → loading-targets(current production) → choosing
```

正常清單已知`basisState=stale`時不經`loading-targets(stale)`，drawer直接提供restart／void；上列stale dialog路徑只涵蓋
production在清單或drawer載入後才前進的race。stale active owner／review workspace另固定：

```text
owner editing／review pending
  → other branch production adopted
  → next mutation／detail refresh derives stale
     ├─ owner：same workspace readonly → cancel only
     └─ reviewer：same workspace readonly → return only；approve 409
```

- dialog固定同一520px以下外殼；一組radio、一個manual suffix input與一個`建立進版工作`primary。candidate radio本身不mutation。
- manual顯示`{major} . [suffix]`；major為read-only text而非disabled input，suffix用`inputMode="numeric"`且先驗
  `/^[1-9]\d*$/`與上限。server error仍是authority。
- 初始focus落在選取模式；切manual才把focus移到suffix；Escape關閉並還焦到原`進版`trigger，Tab不離開dialog。
- target GET、validation error、stale recovery與in-flight stale transition不得呼叫workbench `load()`、`router.refresh()`、清空detail或改preview key；
  因此2D／3D DOM、canvas／iframe與scroll position保持，不能閃白。只有create成功才導向workspace。
- 390px採單欄、primary全寬且無水平捲動；1024／1440保持短dialog，不回復使用者先前拒絕的大型提示面板。

### 15.6 Schema、migration、rollout與rollback decision

- Schema Classification：`None`。
- Migration：`Not Required`；SQLite與PostgreSQL既有claim unique constraint、branch lineage與policy JSON欄位足夠。
- Data backfill：`Not Authorized / Not Required`；既有approved／preparing snapshots保持原值，可讀兼容，不猜造selection mode。
- Feature flag：`None`；client與server同一change set，v2 token與strict body是contract fence。不得保留hidden dual-write或舊stale
  candidate fallback。
- Local rollback：回退同一產品change set即可；因無DDL／backfill，rollback不需down migration。回退前若已建立DEV-098 work，
  舊code會忽略extra snapshot keys但仍受tuple claim保護；不得刪除已核准identity／claim。
- Production rollout：本文件不授權。release時仍需deployment/release gate、fresh PostgreSQL provider evidence、primary schema／
  canonical identity／migration residue／global FK before-after invariant及smoke。

### 15.7 Delivery slices、估工與handoff

| Slice | Owner | Scope | Estimate | Exit gate |
|---|---|---|---:|---|
| 098-B1 | RD | contract／server token／pure lifecycle policy、aggregate-first repository resolver、pre-production、snapshot merge與stale mutation guards | 3.0～4.0 RD days | `QA-098-001..016／027／028／030`、typecheck PASS |
| 098-B2 | RD + UI owner | basis projection、stale action/workspace收斂、single-dialog race recovery、no-flash、RWD／focus | 2.0～2.5 RD days | `QA-098-017..024／029` PASS |
| 098-B3 | RD | DEV-087 selector／command regression、PostgreSQL runner、aggregate與isolated build | 0.75～1.25 RD days | `QA-098-025／026／031`、DEV-087 affected regression PASS |
| 098-C | QA／Independent QC | fresh SQLite＋disposable PostgreSQL fixture、raw-ledger reconciliation、FMEA mutants與severity gate | 1.25～1.75 QA days | `31/31`、P0/P1=0；manifest／cleanup完整 |

Total planning range：`7.0～9.5 person-days`，不含production release、真正merge或canonical history backfill。RD開始前先記錄
current dirty boundary與target file hashes；不得清理、回復或混入其他DEV hunks。每一slice只在上一slice fixed cases通過後前進。

### 15.8 Fixed commands與evidence topology

實作後最小命令順序：

```text
npm run qc:dev-098:contract
npm run qc:dev-098:repository
npm run typecheck:app
npm run qc:dev-098:browser
npm run qc:dev-098:postgres
npm run qc:dev-087:commands
npm run qc:dev-087:contract
npm run build:isolated
npm run qc:dev-098
npm run qc:doc-paths
npm run qc:dev-task-evidence-sync
git diff --check -- <DEV-098 exact touched files>
```

`qc:dev-098` aggregate固定分母31，不以blocked／skip算PASS；`QA-098-031`缺explicit disposable PostgreSQL時固定
`BLOCKED_FOR_PROVIDER`且aggregate不得PASS。evidence root為`output/qa/dev-098/<run-id>/`，至少保存
`manifest.json`、case results、request／response redacted ledger、raw tuple／claim／policy readback、screenshots、viewport geometry、
console／network、source／fixture／provider fingerprints、primary before-after invariant、first failure、process tree與port cleanup receipt。

Browser runner啟動前必須宣告project=`AI_PDM`、purpose=`DEV-098 browser QA`、dynamic port、owning process tree、
cleanup condition、task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`；只在source snapshot通過master count、root reference、
migration residue與global FK invariant後seed fixture。finally只停止該process tree、刪該temp root並確認port released。

### 15.9 Readiness audit result

- Product decisions：0 open（HD-098-01～03皆Human Confirmed）；in-flight收斂是2A的工程化closure，不新增stale續作語意。
- Architecture／authority conflict：0 unresolved；DEV-050為bounded exception amendment、DEV-087為intentional replacement amendment，
  DEV-053／079 compatible。
- Schema／migration gap：0；classification=`none`，legacy JSON相容與release gate已定。
- API／permission／concurrency gap：0；strict body、server-only token、pure lifecycle policy、aggregate-first lock、in-flight basis revalidation、
  pre-production、claim authority與stable codes已定。
- UI／recovery／accessibility gap：0；proactive basis action、same-workspace cleanup、single primary、race recovery、no-flash與
  390／1024／1440已定。
- QA P0／P1 planning gap：0；FMEA、`QA-098-001..031`、SQLite／PostgreSQL runner、fixture、oracle、evidence與cleanup均固定。
- Execution status：`RD Not Started / QA Not Executed / QC Not Executed`；任何人不得把readiness當作產品PASS。
