# ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001：統一唯讀投影與追加來源關係

Status: `Accepted / RD Implementation Ready / Local Only / Production Migration Gated`
Date: 2026-08-04
Owner: Dev PM
Related DEV: `DEV-053`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`
Related QA: `.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`
Amends: `.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`

## 1. Context

DEV-053 要把候選 workspace 與正式 drawing master 顯示在同一個圖號工作台，並將現行 drawer 的`新增同根圖號／新增同圖料號`改走候選流程，避免直接建立正式 master。

Implementation Readiness Review 發現兩個不可用純前端解決的資料一致性問題：

1. 候選與正式資料若由browser分別載入，atomic formalization前後可能被讀成candidate＋formal重複列或partial list；
2. 現有append workspace只保存`source_root_id`。從特定正式圖號新增料號，或從特定正式料號新增圖號時，系統無法在bundle snapshot與核准正式化中保存、驗證並建立那一條跨candidate/formal關係。以root、名稱、candidate code或「目前主圖」推測都可能連錯資料。

這會影響numbering identity、approval snapshot、atomic formalization與cross-module relationship，因此重新進ADR gate。

## 2. Decision

採用「server-side一致性投影 + workspace additive source context」：

1. 新增read-only drawing workbench BFF；在同一company、permission與資料庫transaction邊界中讀取candidate/master identity，server projection、去重、排序與keyset pagination，browser不得自行拼接。
2. `numbering_draft_workspaces` additive新增三個nullable欄位：
   - `source_drawing_number_id`：從既有正式圖號追加料號時保存來源drawing master ID；
   - `source_part_number_id`：從既有正式料號追加圖號時保存來源part master ID；
   - `source_link_type`：`primary_manufacturing`或`reference`，只在上述任一source endpoint存在時使用。
3. 所有既有rows保持三欄`NULL`；不回填、不由root推測、不改號、不重播approval。
4. create command在server驗證source drawing/part與`source_root_id`屬於同company、同root且狀態允許；client送入的company、owner、master state不作authority。
5. source endpoint與link type進入workspace read model、candidate facts hash、bundle snapshot與approval impact；送審後不可被client替換。
6. atomic formalization在同一DEV-052 savepoint內建立cross-boundary link：
   - `source_drawing_number_id` + 新formal part；或
   - 新formal drawing + `source_part_number_id`。
   任一source stale、跨公司、已作廢、link conflict或寫入失敗，整包rollback並保留原approved snapshot的recovery語意。
7. `append_part` relationship-only bundle可以沒有candidate drawing revision；其核准範圍只包含新candidate part與對既有drawing的關係，不冒充重新核准既有圖面。`append_drawing`仍須candidate first revision；製造圖必須有draft relation或`source_part_number_id`，參考圖可明示無製造關係。
8. 正式化後canonical top-level row遵守DEV-053：new drawing顯示為其formal drawing row；relationship-only append不建立新drawing row，來源正式drawing row保留，來源workspace只在drawer/audit追溯。

## 3. Options Considered

### A. 保留direct master create

Rejected。會保留第二條繞過candidate review與atomic formalization的command path，與使用者已確認的單一流程衝突。

### B. 只保存source root，正式化時推測drawing/part

Rejected。同root可能有多張drawing與多個part；「目前主圖」、顯示碼或名稱都不是不可變identity，會造成錯誤關係與不可稽核snapshot。

### C. Additive nullable source context on workspace

Chosen。stable master IDs進既有workspace aggregate與snapshot；只對新command寫入，舊資料零回填，且cross-boundary link仍在DEV-052原子交易內完成。

### D. 新建獨立lineage/relationship-intent aggregate

Deferred。若未來一個workspace需同時引用多個existing drawings/parts、支援多對多變更或複雜ECR，才重新評估；DEV-053目前每個contextual append只需一個existing endpoint，不值得新增第二aggregate。

## 4. Schema and Validation Contract

Canonical columns：

```sql
source_drawing_number_id TEXT NULL
source_part_number_id TEXT NULL
source_link_type TEXT NULL -- primary_manufacturing | reference
```

有效組合：

| Draft mode | source drawing | source part | source link | Meaning |
|---|---:|---:|---:|---|
| `new_bundle` | NULL | NULL | NULL | 全新圖料bundle |
| `append_drawing` | NULL | optional | required when source part exists | 新drawing連既有part；製造圖若無draft part relation則source part必填 |
| `append_part` | required for`新增同圖料號`；其他root-only append可NULL | NULL | required when source drawing exists | 新part連既有drawing；有source drawing時為relationship-only bundle |
| `append_drawing_part` | NULL | NULL | NULL | 新drawing與新part以draft relation連接 |

Server validation：

- source drawing/part必須存在於actor company與workspace source root；
- `source_drawing_number_id`與`source_part_number_id`不可同時存在；
- source endpoint存在時`source_link_type`必填，否則必須NULL；
- blocked/obsolete/merged/disabled source不可建立新的正式關係；
- `primary_manufacturing`必須符合drawing purpose與既有關係規則；reference drawing預設`reference`；
- update command不得在candidate acquisition後更換source endpoint或link type；submit snapshot後完全鎖定。

PostgreSQL/Supabase以FK、CHECK與index補強；既有SQLite檔案採additive nullable columns與server validation，不重建business table。新建SQLite schema包含完整FK/CHECK。production migration另走release gate。

## 5. Read Consistency and Identity

- Workbench repository先取得server action permissions，再於一個bounded database transaction中讀取identity page與hydrate details；PostgreSQL transaction設為`REPEATABLE READ READ ONLY`，SQLite沿用單connection transaction且不得呼叫任何write repository method；
- identity query以`updated_at DESC, row_key ASC`排序，opaque cursor包含version、filter hash、updatedAt與rowKey；filter不符或cursor tampered回400，不以offset/client merge補救；
- candidate row key固定`candidate:{workspaceId}`，formal row key固定`drawing:{drawingNumberId}`；
- published workspace不進candidate top-level source。formal drawing透過candidate revision `formal_drawing_number_id`或workspace source context提供來源追溯；不得以display code猜測；
- 任一read source/hydration失敗，整個response失敗且不回partial rows。

## 6. Transaction and Recovery Consequences

新增source link是DEV-052 existing outer transaction/savepoint的一部分：

1. validate source master lock與approved snapshot；
2. 建立new part/drawing masters；
3. 建立draft relations與cross-boundary source link；
4. promote reservations、mark workspace published；
5. 若有candidate drawing，建立first revision package/evidence companion；relationship-only append不建立假revision package；
6. audit/receipt/outbox沿用原exactly-once contract。

若步驟1-5任一失敗，所有new master/link/promotion/package回滾。Retry只重試同一approved snapshot，不可換source endpoint、link type或candidate number。

## 7. Compatibility and Migration

- Canonical schema：`db/schema.sql`；
- PostgreSQL migration：`db/postgres/022_unified_drawing_workbench.sql`；
- Supabase mirror：`supabase/migrations/20260804020000_unified_drawing_workbench.sql`與manifest；
- SQLite runtime repair：`src/lib/db.ts`只add nullable columns/index，不做row DML；
- old app忽略新nullable columns，既有workspace讀寫相容；
- migration up與立即重跑必須冪等；production migration未授權；
- feature flag off時保持現行雙頁UI，但新source context rows仍必須能由舊reader安全讀取，不得被舊UI誤當成direct master permission。

## 8. Consequences

Positive：

- 統一清單不靠client race或display code去重；
- contextual append保留使用者選定的正式drawing/part identity；
- relationship-only append不必偽造一張未變更圖面的candidate revision；
- existing production rows零回填，migration為additive。

Costs：

- DEV-053不再是純UI變更；需三個nullable columns、migration parity與DEV-052 formalization focused regression；
- read projection需要專用repository、keyset cursor與一致性transaction；
- master drawer、candidate detail與contextual create需共用較明確的server action resolver。

## 9. Re-entry Triggers

重新進ADR：

- 一個workspace需要多個existing source drawings/parts；
- 要把source context拆成獨立aggregate或合併workspace/master tables；
- 要允許existing drawing內容變更但不建立candidate/formal revision；
- 要改變DEV-052 approval action、atomic boundary或DEV-050 release gate；
- 要對existing production rows做backfill、repair或identity rewrite。

## 10. Release Boundary

本ADR只授權本機實作契約。staging/production migration、flag activation、production smoke、rollback與existing reservations preservation evidence仍需獨立deployment-release gate。
