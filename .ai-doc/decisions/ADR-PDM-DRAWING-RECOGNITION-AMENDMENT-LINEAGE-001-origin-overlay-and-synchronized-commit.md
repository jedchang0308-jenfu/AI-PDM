# ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001 — Evidence-origin Overlay And Synchronized Commit

- Status：`Accepted / DEV-107 RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated`
- Date：2026-08-31
- Owners：Dev PM、Drawing Recognition、Drawing Revision Work、PDM Part Master
- Related DEV：`DEV-107`
- Related SPEC：`.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md` §34
- Related QA：`.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §10
- Amended by successor：`.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`（DEV-110；RD Implemented Locally／Full QC Passed 60/60／Production Release Gated）

## Context

DEV-107把辨識核對、正式寫入與送審前再編輯收斂到canonical Drawing workspace。既有session只有`supersedes_session_id`，無法可靠區分重新辨識與人工amendment；若每次編輯都深複製source、adapter result及observation，會造成證據重複、儲存線性膨脹、跨代查詢與清理責任不清。

同時，client端以`PATCH decisions → write-impact → formalize`串接三個命令，會讓「一次點擊」在任何中段失敗時只完成部分意圖；`changes=0`又沒有formalization event，導致已接受但無差異的辨識session仍停在待正式化狀態，送審快照也可能誤選processing、rerun或open amendment。

此決策必須固定四項長期authority：session用途、證據血緣、單一commit意圖，以及送審只封存exact formalized source truth。

## Decision

### 1. Explicit session purpose and evidence origin

`drawing_recognition_sessions`新增：

- `session_purpose`：`recognition | rerun | amendment`，建立後不可變。
- `evidence_origin_session_id`：指向真正持有source／adapter／observation的session，建立後不可變；`supersedes_session_id`同樣不可變，既有取消清理流程例外解除後即刪除。

規則如下：

- 首次辨識：`session_purpose=recognition`、有效evidence origin為自身；legacy／相容寫入可保留NULL並以`COALESCE(evidence_origin_session_id,id)`解讀。
- 重新辨識：`session_purpose=rerun`、建立新的raw evidence，origin同樣以自身或上述NULL fallback表示。
- 送審前編輯：`session_purpose=amendment`、`evidence_origin_session_id=parent.evidence_origin_session_id`，不得排worker或複製raw evidence。

### 2. Amendment is a candidate overlay, not an evidence clone

amendment只建立新session、candidate overlay與candidate-observation link；source、adapter result及observation永久留在evidence origin。projection、evidence link與review snapshot以`evidence_origin_session_id`解析immutable evidence，再疊加current amendment candidate／decision。

同一 evidence origin lineage 最多一個 open amendment。資料庫以partial unique index保證：

```sql
UNIQUE (company_id, evidence_origin_session_id)
WHERE session_purpose = 'amendment'
  AND status IN ('queued', 'extracting', 'review_ready', 'extraction_partial', 'ready_to_formalize')
```

服務層的查詢與lock用於回傳既有winner；unique constraint才是最後一致性authority。

### 3. One UI gesture maps to one server commit intent

embedded panel只使用：

`POST /api/numbering/recognition-sessions/[sessionId]/commit`

request一次帶入current draft decisions、`expectedRowVersion`與stable `Idempotency-Key`。server在同一serializable command／transaction內：

1. 驗證auth、permission、company、Drawing lifecycle與idempotency。
2. 依全域lock order取得authority。
3. 重算exact current source set與target truth。
4. 保存draft decisions。
5. 重新計算impact與blockers。
6. 有blocker或stale時整筆rollback。
7. 安全時原子寫入PDM；若delta為零，仍建立`appliedCount=0`同步事件並把session正式關閉。

既有decision save、write-impact、formalize route保留為相容／內部能力，但canonical embedded UI不得把它們拼成第二套writer流程。background write-impact只是clean saved projection的零寫入提示，commit不信任舊impact token或client計算。

### 4. One global lock order and exact source revalidation

所有可能同時碰觸Drawing work與recognition lineage的命令固定順序：

`Drawing aggregate/work → current source-set revalidation → recognition lineage/session → sorted PDM targets`

適用於create／rerun／amend／cancel／save／commit／formalize／submit。worker只鎖session且不再取得Drawing work lock，因此不形成反向鎖。每次save、impact、amend、commit、formalize與submit都必須以current exact file set重算source fingerprint；source drift一律`409`且零寫入。

### 5. Synchronized no-op and submitted snapshot

只要存在人工接受／修正／映射的intended candidate，commit即使`appliedCount=0`也要建立一次且僅一次的同步事件，session進入`formalized`；不得寫Part master或recognition link。UI顯示`PDM 已是最新`。

無session、processing、failed、raw-only、ignored、deferred、unclassified、identity/evidence-only或完全沒有accepted intended candidate，仍是optional recognition，不建立同步事件且不得形成通用送審gate。

Drawing submit只允許exact current source fingerprint下的latest formalized recognition leaf。processing session、open／cancelled amendment、wrong fingerprint、rerun中間態與未同步的accepted intended session不得進submitted review package。

## Migration And Compatibility

Local implementation migration（production apply仍受release gate）：

- PostgreSQL：`db/postgres/053_drawing_recognition_amendment_lineage.sql`
- SQLite canonical schema：`db/schema.sql`
- SQLite additive runtime helper：`ensureDev107DrawingRecognitionLineageSchema` in `src/lib/db.ts`
- Provider-aware rehearsal：`scripts/qc-dev-107-migration.mjs`

既有資料backfill：

- `supersedes_session_id IS NULL` → `session_purpose='recognition'`。
- `supersedes_session_id IS NOT NULL` → `session_purpose='rerun'`。
- legacy session的`evidence_origin_session_id`保留NULL；service以`COALESCE(evidence_origin_session_id, id)`視為自身證據根，避免未經逐筆盤點就寫入推測血緣。

migration必須先驗非法parent／orphan／cross-company evidence origin為零，再新增`session_purpose` NOT NULL、origin FK、check／trigger與partial unique index；任一provider驗證失敗整筆rollback。不得把legacy superseding session猜成amendment。

## Options Considered

### A. Deep-clone every evidence row without migration

Rejected。短期省migration，長期造成每次編輯都複製raw evidence、儲存與查詢成本隨代數線性成長，也無法在資料層區分rerun與amendment。

### B. Infer purpose from status, outbox or key naming

Rejected。purpose會依命名慣例與歷史資料形狀推測，難以建立可靠unique constraint、retention、snapshot及provider parity。

### C. Explicit purpose/origin plus candidate overlay and synchronized commit

Accepted。以一次小型additive migration換取可驗證的lineage、bounded evidence storage、單一commit receipt與exact submitted snapshot。

## Consequences

### Positive

- amendment代數增加時不重複raw evidence。
- rerun、amendment及首次辨識可由資料模型直接辨識。
- 一次使用者動作對應一個server receipt，失敗不留下「decision已存但尚未寫入」的半完成狀態。
- no-op也有完整稽核閉環，reload與送審快照不需猜測。
- SQLite與PostgreSQL可用同一domain invariant驗證。

### Cost And Constraints

- DEV-107不再是`migration=none`；migration rehearsal與SQLite／PostgreSQL provider parity已由QA-107-036／020及aggregate證明，正式migration apply仍須另走release gate。
- projection、snapshot與evidence resolver都必須認得origin overlay。
- canonical embedded UI切換到commit endpoint前，舊route只能作compatibility，不得成為平行正常流程。
- release仍需正式migration／backup／rollback與production gate；本ADR不授權live data mutation、deploy或release。

## Reversal Trigger

只有在實測證明candidate overlay無法保持immutable submitted evidence，或外部法遵要求每次amendment物理封存完整raw evidence副本時，才可重新開ADR。不得以實作方便退回client多命令串接或無purpose lineage。

## 2026-08-31 DEV-110 Planned Successor Amendment

DEV-110保留本ADR的explicit session purpose、immutable source／candidate evidence、single user intent／server receipt、append-only event、global lock order、source revalidation、no-op closure與exact submitted snapshot。新accepted ADR改變synchronization destination，並以evidence applicability建立scope-aware projection：canonical action不再直接寫Part master，而是在bounded atomic transaction內建立／更新exact Part works；manual common／override只進v2 event，不回寫candidate overlay。Current Phase的per-Part evidence owner只接受linked adapter可驗證的exact owner ID／完整canonical anchor，或同欄位observation對formal eligible集合的完整canonical token唯一命中；舊suffix／unanchored owner、persisted `resolved`標記、縮寫／歧義保持unresolved，不修改既有candidate authority。

DEV-110 event使用existing physical table並以`result_json.schemaVersion=2`、`destination=part_work`區分；本ADR的legacy event缺discriminator時仍解讀為`direct_master`。DEV-110已完成固定60/60 QA/QC；本機 successor 不回寫、刪除或重新解讀既有DEV-107 event／master evidence。runtime cutover與production release仍須獨立授權。
