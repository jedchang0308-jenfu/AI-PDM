# SPEC-PDM-DRAWING-PART-WORKBENCH-001 - 圖料模組資料流與送審安全架構

Status: DEV-053 multi-part scope amendment implemented locally / production migration gated
Date: 2026-07-01
Owner: Dev PM
Related DEV: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Related ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

## 1. Human Decision Brief

Confirmed decisions from user architecture review on 2026-07-01:

- 圖號模組維持「以圖為主」，不升級成主根號工作台。
- 圖料模組升級為主根號 / 圖料關聯 / 送審準備工作台。
- 圖料模組允許 inline 編輯圖號與料號欄位，但實際寫入必須走圖號或料號 owner domain validation 與 audit。
- 送審時必須複製當下圖號、料號、附件、版次與備註到 submission snapshot，審核後不受主資料後續變動影響。
- 送審前安全 gate 採三層防線：前端顯示、後端 API 強制檢查、DB constraint 最後防線。
- 同一送審包內不允許相同 `file_role + original_filename` 的附件；送出前阻擋，錯誤訊息必須是人類中文。
- 失敗送審保留 audit trail，不硬刪、不覆蓋歷史。
- 舊「上傳送審頁」完全退役，不再作為正式送審入口。

User-approved amendment on 2026-08-06:

- 一張 MA 圖合法服務多個料號時，不要求刪除其他關聯；系統預設將所有主要料號納入同一批次，送審者可明確縮小為非空子集。後端驗證完整集合後寫入不可變 scope，發布時整批沿用同一送審、版次與附件證據。

HCS thinking habits applied:

- `#批判`: 檢查「主根號是否應成為所有資料來源」的隱含假設，結論是主根號可當聚合入口，但不能取代圖號、料號、submission 各自的資料 owner。
- `#演算法`: 將送審 readiness 與 snapshot 建立流程拆成可驗證步驟。
- `#來源品質`: 前端狀態不可作為送審真相來源，必須由後端重新讀 owner domain 資料。
- `#可驗證性`: 所有安全規則都要有 UI、API、DB 或 audit evidence。
- `#情境脈絡`: 圖號模組、料號模組、圖料模組、送審頁分別服務不同操作情境，不應用單一頁面承擔所有行為。

Rejected options:

- 把圖號模組升級成主根號工作台。
- 圖料模組只顯示缺口，不能 inline 編輯。
- 送審審核時即時讀最新主資料，而不保存送審當下 snapshot。
- 只靠前端或只靠 DB constraint 做送審防呆。
- 同檔名附件自動改名後送審。
- 送審頁繼續保留上傳與補主資料功能。

AI assumptions:

- 現有 `/numbering/search` 是圖料模組入口，可作為第一版升級載體；若 RD 建立更明確路由，必須保留同一資料流契約。
- 現有 `/numbering/drawings` 繼續是圖號模組，負責圖號、圖面附件、圖面追溯與圖面治理動作。
- 現有 `/parts` 或 `/api/parts/{partNumber}` 繼續是料號 owner surface。
- Production deploy、Supabase production cutover、遠端 schema migration、直接資料修復不在本文件授權範圍內。

Re-entry triggers:

- 使用者要求送審頁重新允許補主資料。
- 使用者要求同名附件自動改名或允許同名。
- 實作需要 production data migration、資料刪除、資料覆寫或清除失敗 submission。
- 權限模型需要新增外部角色或改變審核責任。

## 2. Problem

目前流程的主要風險不是單一按鈕錯誤，而是資料流責任不清：

- 圖號模組負責圖，但有些料號主資料缺口會影響送審。
- 舊上傳送審頁可填很多 PDM 屬性，反而弱化了圖號/料號主資料 owner。
- 從圖號模組進入送審時，使用者期待送出目前圖號，卻可能落入通用 upload 流程。
- 後端 DB constraint 可能在送出後才暴露，例如 `submission_files.submission_id + file_role + original_filename` 重複。
- 若審核時讀最新主資料，審核證據會因送審後主資料變動而失真。

## 3. End-State Architecture

### 3.1 Module responsibility

| Module | Primary job | Can edit | Must not do |
|---|---|---|---|
| 圖號模組 | 圖號、圖面用途、圖面版次、圖面附件、圖面追溯 | 圖號 owner 欄位、圖面附件 | 不維護完整料號主資料、不建立正式送審 snapshot |
| 料號模組 | 料號、品名、材質、表面處理、製程、產品系列、料號狀態 | 料號 owner 欄位 | 不治理圖面文件生命週期 |
| 圖料模組 | 主根號、圖料關聯、主圖/主料、資料完整性、送審 readiness、正式送審入口 | 可 inline 編輯，但必須呼叫 owner domain API | 不直接寫圖號/料號 table、不成為第二份主資料 |
| 送審確認區 | 只讀確認、選來源附件、填送審備註、送出審核 | 送審備註與附件選取 | 不補圖號、不補料號、不上傳新主檔 |
| Submission domain | 保存送審 snapshot、流程狀態與 audit | submission 狀態與 snapshot | 不回寫主資料 |

### 3.2 Data owner rule

```text
圖號欄位 -> drawing_number domain owns and validates
料號欄位 -> part_number domain owns and validates
圖料關聯 -> drawing_part_link / part_root domain owns and validates
附件主檔 -> master_attachment domain owns and validates
送審 snapshot -> submission domain owns and freezes
審核流程 -> workflow / approval domain owns and validates
```

圖料模組是聚合工作台，不是資料 owner。所有 inline save 必須依欄位 owner 分派到對應 API。

## 4. Target User Flow

### 4.1 Standard flow

```text
使用者進入圖料模組
-> 選主根號
-> 查看主圖、主料、圖料關聯、附件與缺口
-> 在同一工作台 inline 補必要欄位
-> 每個欄位寫入 owner domain API 並留下 audit
-> 後端重新計算 readiness
-> 使用者進入送審確認區
-> 選取既有附件、填送審備註
-> 後端再次 preflight
-> 建立 submission snapshot
-> 建立 Pending submission 與 audit trail
```

### 4.2 Entry points

| Entry | Target behavior |
|---|---|
| 圖料模組主根明細 `送審` | 留在圖料模組或進入圖料模組下的送審確認區 |
| 圖號模組 `送審` 快捷 | 導到圖料模組對應主根號與送審準備區，不直接進 generic upload |
| 料號模組送審相關 CTA | 導到圖料模組對應主根號與送審準備區 |
| 舊 `/upload` UI | 退役。直接存取時導到圖料模組並顯示中文退役訊息，或回 410 with user-facing Chinese message |

## 5. Product Rules

### 5.1 Inline editing rule

圖料模組可 inline 編輯以下類型資料，但每次寫入必須走 owner API：

| Field group | Owner API target | Audit action |
|---|---|---|
| 主根號核心品名、階段、狀態 | `numbering.records` / root domain | `numbering.root.update` |
| 圖號用途、圖號狀態、主要 MA 圖關係 | drawing domain | `numbering.drawing.update` |
| 料號品名、料件類型、製程、產品系列 | part domain | `numbering.part.update` |
| 材質、顏色、表面處理、變體備註 | `PUT /api/parts/{partNumber}/variant` or equivalent | `numbering.part.variant.update` |
| 圖料關聯、主圖/主料 | drawing-part link domain | `numbering.drawing_part_link.update` |
| 圖面附件 | master attachment domain | `numbering.master_attachment.*` |

Forbidden:

- UI 直接呼叫一個萬用 API 更新任意欄位。
- API 根據前端傳來的 `owner` 信任欄位決定寫入 table。
- 圖料模組直接更新 `drawing_numbers`、`part_numbers`、`part_variant_attributes` 或 `drawing_part_links` table。

### 5.2 Submission readiness rule

後端 readiness 必須至少回傳：

```ts
type DrawingPartSubmissionReadiness = {
  root: { id: string; rootCode: string; coreName: string; recordStatus: string; developmentPhase: string };
  primaryDrawing: null | { id: string; drawingNumber: string; purposeCode: string; recordStatus: string };
  primaryPart: null | { id: string; partNumber: string; partName: string; itemKind: string };
  linkedDrawings: Array<{ id: string; drawingNumber: string; purposeCode: string; isPrimaryManufacturing: boolean }>;
  linkedParts: Array<{ id: string; partNumber: string; partName: string; isPrimary: boolean }>;
  ownerFields: {
    material: { value: string; owner: "part"; sourceField: string };
    surfaceFinish: { value: string; owner: "part"; sourceField: string };
    processName: { value: string; owner: "part" };
    productSeries: { value: string; owner: "part" };
  };
  attachments: Array<{
    id: string;
    entityType: "drawing_number" | "part_number";
    entityId: string;
    originalFilename: string;
    fileRole: string;
    revision: string | null;
    eligibleForSubmission: boolean;
    ineligibleReason?: string;
  }>;
  suggestedRevision: { revision: string; source: "revision_policy" | "latest_attachment" | "manual_master" };
  blockers: Array<{ code: SubmissionReadinessBlockerCode; message: string; recoveryTarget: string }>;
  warnings: Array<{ code: string; message: string }>;
};
```

P0 blocker codes:

2026-07-02 addendum: `duplicate_active_submission` is governed by `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`. It must be classified as `submission_conflict`, not `master_data_missing`, and UI must not display it under `主資料尚未完成`.

| Code | Human-facing message requirement |
|---|---|
| `missing_primary_drawing` | `此主根號尚未指定主要圖號，請先在圖料模組設定主圖。` |
| `missing_primary_part` | `此主根號尚未指定主料號，請先在圖料模組設定主料。` |
| `missing_part_name` | `主料號尚未填品名，請先補齊料號主資料。` |
| `missing_material` | `主料號尚未填材質，請先補齊料號主資料。` |
| `missing_surface_finish` | `主料號尚未填表面處理，請先補齊料號主資料。` |
| `missing_attachment` | `此圖號尚無可送審附件，請先在圖號附件庫新增受控附件。` |
| `duplicate_attachment_filename` | `送審附件中有重複檔名：{filename}。同一送審包不可使用相同檔名，請先移除或更名後再送審。` |
| `duplicate_active_submission` | `此圖號與版次已有待審核送審紀錄，不能重複送出。` |
| `drawing_not_submittable` | `此圖號目前狀態不可送審，請先處理圖號狀態。` |
| `part_not_submittable` | `此料號目前狀態不可送審，請先處理料號狀態。` |

### 5.3 Attachment uniqueness rule

同一送審包內：

```text
file_role + original_filename must be unique
```

System behavior:

- 前端在附件選取區即時標示重複。
- 後端 preflight 必須重新計算，不信任前端。
- POST 建立 submission 前必須阻擋。
- DB unique constraint 仍保留為最後防線。
- 若 DB constraint 被觸發，不可把 raw DB error 顯示給使用者；API 必須轉為 `duplicate_attachment_filename` 中文訊息。
- 不允許自動改名後送審。

## 6. Implementation Contract

### 6.1 Frontend

Upgrade `/numbering/search` or equivalent 圖料模組 page:

- Right detail panel adds `送審準備` tab or section.
- Shows owner-labeled fields: each field displays whether it comes from 圖號、料號、圖料關聯 or submission.
- Inline edit is allowed for authorized fields.
- After every save, the page refetches readiness from the server.
- The `送審` CTA is enabled only when backend readiness returns no blockers and at least one attachment is selected.
- Readiness message and disabled reason must use the same source as the button state.
- No raw API/DB error appears in UI.

Retire `/upload` UI:

- Remove `上傳送審` from sidebar/nav for formal flow.
- Direct GET `/upload` must not show the old generic upload form.
- Preferred behavior: redirect to `/numbering/search` with a user-facing message `上傳送審頁已退役，請從圖料模組建立送審。`
- If route cannot redirect immediately, it must render a retired-state panel and no file dropzone or PDM attribute form.

Update drawing detail:

- 圖號模組 keeps `送審` shortcut, but target is 圖料模組 submission readiness for the drawing root.
- `開啟圖料追溯` remains a normal traceability action.
- `送審` shortcut may pass `drawingNumber` to help resolve the root, but the server must validate company/root relationship.

### 6.2 API

Required contracts. Route names may vary if equivalent contracts are preserved.

#### Readiness

```text
GET /api/numbering/roots/{rootCode}/submission-readiness
GET /api/numbering/drawings/{drawingNumber}/submission-readiness
```

Rules:

- Company scope enforced server-side.
- If drawing route is used, resolve root through drawing-part relationship.
- Response contains blockers, warnings, eligible attachments and owner metadata.
- No user-provided master-data values are accepted.

#### Inline owner writes

Existing APIs may be reused if they enforce owner rules:

- `PATCH /api/numbering/records/{rootCode}` for root/draft owner fields.
- `PUT /api/parts/{partNumber}/variant` for material/color/surface treatment.
- Add or extend drawing/part/link APIs for missing owner fields.

Each owner write must:

- Authorize the action using existing numbering permission guard or stricter equivalent.
- Validate company scope.
- Validate state transitions.
- Persist before/after or enough audit detail to reconstruct the change.
- Return the updated owner object and a new readiness summary or version token.

#### Create submission

```text
POST /api/numbering/roots/{rootCode}/submissions
```

Request:

```ts
type CreateRootSubmissionRequest = {
  primaryDrawingNumber?: string;
  selectedAttachmentIds: string[];
  note: string;
  idempotencyKey: string;
};
```

Server must ignore/reject any client-supplied master-data fields such as part name, material, surface finish, revision or document type.

POST algorithm:

```text
1. Authenticate and authorize submission create.
2. Resolve company and root.
3. Recompute readiness from owner domains.
4. Validate note length/content.
5. Validate selected attachments belong to the resolved root/drawing/company.
6. Validate attachment uniqueness by file_role + original_filename.
7. Check duplicate active submission for company + drawing_number + revision.
8. Build immutable submission snapshot from owner data.
9. Create submission, submission_files, submission_snapshot and audit in a transaction where supported.
10. Copy/reference source files with compensation for file-store failure.
11. Return Pending submission id and next action.
```

Idempotency:

- Client must send `idempotencyKey`.
- Server must treat duplicate POST with the same user/company/root/drawing/revision/idempotencyKey as a safe retry.
- If the original attempt succeeded, return the existing submission id.
- If the original attempt failed before submission creation, create a new attempt audit and return a safe error.
- If a different idempotency key attempts same active drawing/revision, return duplicate active submission conflict.

### 6.3 DB schema

Existing useful fields:

- `submissions.source_entity_type`
- `submissions.source_entity_id`
- `submission_files.source_master_attachment_id`
- `submission_files UNIQUE (submission_id, file_role, original_filename)`

Additive local schema contract:

```sql
CREATE TABLE IF NOT EXISTS submission_snapshots (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  source_root_id TEXT NOT NULL,
  source_root_code TEXT NOT NULL,
  source_drawing_number_id TEXT NOT NULL,
  source_drawing_number TEXT NOT NULL,
  source_part_number_id TEXT NOT NULL,
  source_part_number TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_snapshots_root ON submission_snapshots(company_id, source_root_code);
CREATE INDEX IF NOT EXISTS idx_submission_snapshots_drawing ON submission_snapshots(company_id, source_drawing_number);
```

Optional if existing audit logs cannot represent failed attempts clearly:

```sql
CREATE TABLE IF NOT EXISTS submission_attempts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  source_root_code TEXT NOT NULL,
  source_drawing_number TEXT,
  idempotency_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL,
  blocker_json TEXT,
  error_code TEXT,
  error_message TEXT,
  submission_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, actor_id, idempotency_key)
);
```

If `submission_attempts` is not added, equivalent failed-attempt audit must be written to `audit_logs` with action names below.

### 6.4 Audit contract

Required audit actions:

| Action | When |
|---|---|
| `numbering.root.update` | Root owner field changes from 圖料 inline edit |
| `numbering.drawing.update` | Drawing owner field changes from 圖料 inline edit |
| `numbering.part.update` | Part owner field changes from 圖料 inline edit |
| `numbering.part.variant.update` | Material/color/surface owner fields change |
| `numbering.drawing_part_link.update` | Primary drawing/part or relationship changes |
| `submission.readiness.checked` | Optional diagnostic, only if useful and low-noise |
| `submission.attempt.blocked` | User tries to submit but readiness blocks |
| `submission.attempt.failed` | POST fails due to API/file/transaction failure |
| `submission.snapshot.created` | Snapshot is created successfully |
| `submission.created_from_root` | Pending submission is created from 圖料 module |

Audit detail must include:

- actor id
- company id
- root code
- drawing number
- part number
- before/after for edited owner fields
- selected attachment ids
- blocker codes or error code for failed attempts
- source route / UI surface

### 6.5 Transaction and compensation

Minimum rules:

- DB creation of submission, files, snapshot and audit should be atomic on Postgres.
- SQLite local runtime must either use a safe synchronous transaction or a documented compensation path; do not fake atomicity if file I/O is async.
- File copy/reference failure before DB commit must not leave a Pending submission.
- DB failure after file copy must remove copied files or mark file copy residue for cleanup audit.
- Background Drive sync failure must not delete the submission; mark sync failed and allow retry.
- Failed attempts must be auditable even when no submission is created.

## 7. Permissions

Minimum permission gates:

| Action | Permission |
|---|---|
| View 圖料模組 | `numbering.search` |
| Inline edit root/drawing/part draft fields | `numbering.draft.update` or stricter owner-specific action |
| Manage attachments | `numbering.attachments.manage` |
| Create submission | existing Engineer/Admin gate or new `numbering.submissions.create` |
| View audit | existing audit/report permission |

Forbidden:

- User crafts a root/drawing query for another company and receives detail.
- User submits a drawing whose root cannot be proven in the active company.
- Reviewer-only user creates submission unless company policy explicitly permits it.

## 8. Failure Modes

| Failure | Required behavior |
|---|---|
| Root not found | Chinese visible error; no fallback upload form |
| Drawing not linked to root | Block with Chinese message and recovery to relationship section |
| Missing primary part/drawing | Block with exact missing item |
| Missing material/surface | Block and point to料號主資料欄位 |
| Duplicate selected filename | Block before POST and in POST; show duplicate filenames |
| Duplicate active submission | Block and link to existing pending/review item when available |
| Attachment deleted during submit | POST re-check fails; no submission created |
| DB unique constraint triggered | Convert to human Chinese domain error |
| File copy failure | No Pending submission or compensation audit |
| User directly opens `/upload` | No old upload form; redirect/deprecation message |

## 9. Out of Scope

- Production deploy.
- Supabase production cutover or remote migration.
- Direct DB cleanup of existing failed submissions.
- Automatic CAD file mutation or filename rewrite.
- SolidWorks Document Manager integration.
- Rewriting approval workflow responsibility.
- Allowing duplicate attachment filenames.

## 10. RD Acceptance

- 圖號模組 remains圖-focused and does not become root workbench.
- 圖料模組 shows root/drawing/part/readiness in one workbench.
- Inline edit writes through owner APIs and creates audit records.
- Readiness blockers are calculated server-side and displayed in Chinese.
- Same selected attachment filename/role is blocked before submission.
- `/upload` no longer renders the formal generic upload/send-review form.
- Drawing and part shortcuts route to 圖料模組 readiness, not generic upload.
- Successful submission stores immutable snapshot and source traceability.
- Failed/blocking submission attempts leave audit trail.
- Duplicate active drawing/revision submission is blocked.
- No raw DB, route, stack, or English constraint error appears in the user-facing flow.

## 11. QA / QC Gate

Primary validation plan:

- `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`

Minimum commands:

```powershell
npx tsc --noEmit
npm run lint -- --quiet
npm run build
npm run qc:pdm-numbering-api-regression
npm run qc:pdm-drawing-submission-review-only
```

Add or update focused QC:

```powershell
npm run qc:pdm-drawing-part-workbench-security
```

Focused QC must cover:

- owner write routing
- audit creation
- readiness API
- duplicate attachment filename blocker
- submission snapshot
- retired `/upload`
- Chinese visible errors
- desktop/mobile no overflow

## 12. RD Readiness Closure Addendum (2026-07-01)

This addendum closes the RD review P0/P1 gaps. If this section conflicts with earlier looser wording, this section is authoritative for RD implementation.

### 12.1 Retired upload and generic API boundary

Formal submission creation must not be reachable through the old generic upload workflow.

| Surface | Required behavior |
|---|---|
| `GET /upload` | Must not render the old file dropzone, PDM attribute form or generic send-review form. It must redirect to 圖料模組 with notice `上傳送審頁已退役，請從圖料模組建立送審。`, or render a retired-state panel with the same message. |
| Sidebar `上傳送審` | Remove from formal flow navigation, or route to the retired-state panel only. |
| Drawing/part shortcut `送審` | Resolve to 圖料模組 readiness. It must not open `/upload` as a blank generic form. |
| `POST /api/submissions` generic create | Retire for normal web/session formal submission. Return HTTP `410` or `409` with code `GENERIC_SUBMISSION_RETIRED` and Chinese message `通用上傳送審已退役，請從圖料模組建立送審。` |
| Existing submission read/history routes | May remain for dashboard, review, audit and historical access. |
| Trusted external integration create path | Must be a separate approved route, source label, permission, audit action and QA scope. It must not reuse the retired generic web create behavior. |

Historical submissions created through the old path remain readable and auditable. The old Windows upload QA plan is superseded for formal submission creation; any retained auxiliary file-intake behavior must be split into a separate DEV and must not create formal Pending review items.

### 12.2 Source resolution and ambiguity blockers

The server must resolve submission source from owner-domain data, not from UI state.

Resolution algorithm:

```text
Input can be rootCode, drawingNumber or partNumber.
1. Enforce authenticated company scope.
2. If drawingNumber is supplied, find company-scoped drawing.
3. Resolve linked root through drawing_part_links / part_roots.
4. If zero roots are linked, block.
5. If more than one active root is linked, block as ambiguous; do not guess.
6. Resolve primary manufacturing drawing for the root.
7. Resolve primary manufacturing part candidates for the drawing.
8. Primary drawing must be exactly one. Select all legitimate primary parts by default; accept an explicit non-empty `partNumberIds` subset only after every id is revalidated against those candidates. Do not delete or guess relationships.
9. Read owner fields and readiness for every selected part plus the drawing, root/link and attachment domains. One selected part that fails readiness blocks the whole batch.
10. Return readiness or create snapshot plus `submission_part_scopes` from the resolved canonical owner data. Release must reuse the frozen scope and update all scoped parts atomically instead of re-resolving an ambiguous live relationship.
```

Additional P0 blocker codes:

| Code | Message | Recovery target |
|---|---|---|
| `drawing_number_not_found` | `找不到此圖號，請確認圖號是否存在於目前公司。` | 圖號搜尋 |
| `root_not_found` | `找不到此主根號，請確認圖料關聯是否已建立。` | 圖料關聯 |
| `drawing_part_link_missing` | `此圖號尚未連到主根號，請先建立圖料關聯。` | 圖料關聯 |
| `ambiguous_root` | `此圖號連到多個主根號，系統無法判定送審來源，請先修正圖料關聯。` | 圖料關聯 |
| `multiple_primary_drawings` | `此主根號有多個主要圖號，系統無法判定送審主圖，請先修正主圖設定。` | 主圖設定 |
| `part_scope_required` | `請至少選擇一個本次一起進版的料號。` | 圖面進版的批次料號選擇 |
| `part_scope_invalid` | `本次料號範圍已變更，請重新整理後再送審。` | 重新解析圖料關係 |
| `DRAWING_SUBMISSION_MULTI_PART_REPLACEMENT_REQUIRED` | `確認影響時，每個舊料號都需要自己的替代料號；請分開處理或先補齊逐料號替代規則。` | 確認影響分流 |
| `primary_part_not_manufacturing` | `主料號不是可送審的製造料，請先修正圖料關聯。` | 主料設定 |

Ambiguous root or primary-drawing ownership blocks submission. Multiple legitimate primary-part links are a supported batch scope, not an ambiguity error. The UI may default and edit the scope, but only the server-side revalidation decides the submit state.

### 12.3 Owner API contracts

All inline edits from 圖料模組 must call an owner API. RD may reuse existing routes only if the same contract is preserved.

Every write request must include either `If-Match` or a numeric/string `version` token from the latest owner read. Stale writes return `409` with code `OWNER_VERSION_CONFLICT` and Chinese message `資料已被其他人更新，請重新整理後再修改。`

| Field group | Route contract | Method | Request body | Required permission | Editable states | Response |
|---|---|---|---|---|---|---|
| Root core fields: core name, development phase, draft/root status notes | `/api/numbering/records/{rootCode}` | `PATCH` | Whitelisted root fields + version | `numbering.draft.update` for Draft/NeedInfo; `numbering.master.update` for Active | Draft, NeedInfo, Active with reason | `{ root, version, auditId, readiness }` |
| Drawing fields: drawing purpose, drawing status note, primary MA drawing flag where drawing-owned | `/api/numbering/drawings/{drawingNumber}` | `PATCH` | Whitelisted drawing fields + version | `numbering.drawing.update` | Draft, NeedInfo, Active with reason | `{ drawing, version, auditId, readiness }` |
| Part fields: part name, item kind, process, product series | `/api/numbering/parts/{partNumber}` or existing part owner equivalent | `PATCH` | Whitelisted part fields + version | `numbering.part.update` | Draft, NeedInfo, Active with reason | `{ part, version, auditId, readiness }` |
| Part variant fields: material, color, surface treatment, variant note | `/api/parts/{partNumber}/variant` | `PUT` | Variant fields + version | `numbering.part.variant.update` | Draft, NeedInfo, Active with reason | `{ variant, version, auditId, readiness }` |
| Root/drawing/part links: primary drawing, primary part, active relationship | `/api/numbering/roots/{rootCode}/links` | `PATCH` | Link operations + version | `numbering.drawing_part_link.update` | Draft, NeedInfo only unless explicit Admin recovery | `{ root, links, version, auditId, readiness }` |
| Source attachments eligible for submission | Existing master attachment owner route | owner-specific | Attachment metadata/action + version | `numbering.attachments.manage` | Draft, NeedInfo, Active attachment maintenance | `{ attachment, version, auditId, readiness }` |

Generic field update APIs are forbidden. API must reject unknown fields and fields owned by another domain:

```json
{
  "error": {
    "code": "OWNER_FIELD_FORBIDDEN",
    "message": "此欄位不屬於目前資料來源，請從正確的主資料區塊修改。",
    "recoveryTarget": "owner_field"
  }
}
```

Required write error codes:

| Code | Message requirement |
|---|---|
| `OWNER_FIELD_FORBIDDEN` | User attempted to edit a field through the wrong owner API. |
| `RECORD_STATUS_NOT_EDITABLE` | Record state does not allow inline master-data edit. |
| `OWNER_VERSION_CONFLICT` | Version or ETag conflict. |
| `COMPANY_SCOPE_DENIED` | Requested root/drawing/part is outside the active company. |
| `RELATIONSHIP_AMBIGUOUS` | Link edit would create multiple primary drawings/parts or ambiguous root ownership. |
| `OWNER_VALIDATION_FAILED` | Domain validation failed with field-level Chinese messages. |

### 12.4 Permission and record-state matrix

Permission must be checked at the owner API and again at submission create. UI hiding is not sufficient.

| Action | Draft | NeedInfo | Active | Released | Obsolete/Merged |
|---|---|---|---|---|---|
| View 圖料 readiness | `numbering.search` | `numbering.search` | `numbering.search` | `numbering.search` | `numbering.search` plus visible non-submittable warning |
| Edit root/drawing/part master field | `numbering.draft.update` | `numbering.draft.update` | `numbering.master.update` plus audit reason | Block; use controlled revision/change flow | Block except explicit recovery/admin tooling |
| Edit root/drawing/part relationship | `numbering.drawing_part_link.update` | `numbering.drawing_part_link.update` | Block unless Admin recovery with reason | Block | Block except explicit recovery/admin tooling |
| Manage eligible source attachments | `numbering.attachments.manage` | `numbering.attachments.manage` | `numbering.attachments.manage` with audit reason | Block or controlled revision attachment flow | Block |
| Create formal submission | `numbering.submissions.create` or existing Engineer/Admin equivalent | Same | Same if readiness passes | Block unless controlled release workflow explicitly allows | Block |
| Reviewer-only role creates submission | Block unless company policy explicitly grants `numbering.submissions.create` | Block unless granted | Block unless granted | Block | Block |

Released master data must not be edited inline just to pass submission. Recovery must go through the controlled change/revision flow.

### 12.5 Submission attempt state machine and idempotency

`submission_attempts` or equivalent audit must track every POST attempt that passes authentication.

Attempt state machine:

| Status | Meaning | Terminal | Retry behavior |
|---|---|---|---|
| `started` | Idempotency row/audit created before readiness and duplicate checks | No | Same idempotency key returns in-progress/safe retry response if concurrent |
| `blocked` | Business blocker such as missing material, duplicate filename or ambiguous root | Yes | Same key returns the same blocker result until a new key is used after correction |
| `failed` | Unexpected API/file/transaction failure before successful submission | Yes | Same key may retry only when `retryable=true` and no `submission_id` exists |
| `created` | Pending submission and snapshot created | Yes | Same key returns existing `submission_id`; different key for same active drawing/revision returns duplicate active conflict |

Idempotency key:

```text
UNIQUE(company_id, actor_id, idempotency_key)
```

Create flow must create the attempt row before creating the submission. Parallel submissions must be protected by both application logic and a final DB uniqueness guard for active `company_id + source_drawing_number + revision` where status is Pending/InReview or equivalent active review status. If DB cannot express partial uniqueness in local SQLite, focused QC must prove the repository/service-level guard and the DB fallback for `submission_files` uniqueness.

### 12.6 Canonical submission snapshot

Successful submission must persist a canonical immutable snapshot. Snapshot data is for review evidence; it must not be updated when later master data changes.

Additive schema contract:

```sql
CREATE TABLE IF NOT EXISTS submission_snapshots (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  source_root_id TEXT NOT NULL,
  source_root_code TEXT NOT NULL,
  source_drawing_number_id TEXT NOT NULL,
  source_drawing_number TEXT NOT NULL,
  source_part_number_id TEXT NOT NULL,
  source_part_number TEXT NOT NULL,
  snapshot_version TEXT NOT NULL DEFAULT 'drawing_part_submission_v1',
  rules_version TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  captured_by TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);
```

Canonical snapshot JSON must include:

```ts
type DrawingPartSubmissionSnapshotV1 = {
  snapshotVersion: "drawing_part_submission_v1";
  rulesVersion: string;
  source: {
    module: "drawing_part_workbench";
    entryPoint: "root" | "drawing_shortcut" | "part_shortcut";
    route: string;
  };
  capturedAt: string;
  capturedBy: string;
  company: { id: string; code?: string; name?: string };
  root: { id: string; rootCode: string; recordStatus: string; developmentPhase: string };
  drawing: { id: string; drawingNumber: string; purposeCode: string; recordStatus: string };
  part: { id: string; partNumber: string; partName: string; itemKind: string };
  ownerFields: {
    material: { value: string; source: "part"; sourceField: string };
    surfaceFinish: { value: string; source: "part"; sourceField: string };
    processName?: { value: string; source: "part"; sourceField: string };
    productSeries?: { value: string; source: "part"; sourceField: string };
  };
  revision: { value: string; source: "revision_policy" | "latest_attachment" | "manual_master" };
  attachments: Array<{
    sourceMasterAttachmentId: string;
    submissionFileId: string;
    fileRole: string;
    originalFilename: string;
    revision: string | null;
    storageKey: string;
    sourceEntityType: "drawing_number" | "part_number";
    sourceEntityId: string;
  }>;
  readiness: { checkedAt: string; blockerCodes: string[]; warningCodes: string[] };
  note: { text: string; length: number };
};
```

Hash rule:

- Build canonical JSON by sorting object keys recursively and omitting `snapshot_hash`.
- Preserve array order as the selected attachment order after server validation.
- Store lowercase SHA-256 hex in `snapshot_hash`.
- QC must prove that changing master data after submission does not alter `snapshot_json` or `snapshot_hash`.

### 12.7 Attachment storage-key and duplicate safety

Display filename and storage identity are different concerns.

Rules:

- `original_filename` is kept for display, audit and duplicate detection.
- Storage path must include `submission_id` and `submission_file_id`; it must not rely only on sanitized filename.
- Recommended key: `submissions/{companyId}/{submissionId}/{submissionFileId}/{safeOriginalFilename}`.
- Existing file-store variants may use an equivalent path, but must include a unique immutable id segment.
- Before writing/copying, repository must verify it will not overwrite an existing storage key.
- If a storage-key collision is detected, return Chinese domain error `附件儲存路徑衝突，系統尚未建立送審，請重新送出或通知管理員。` and record `submission.attempt.failed`.
- Do not auto-rename duplicate selected filenames to bypass the business rule.

### 12.8 Final RD readiness status

After this addendum, the package remains `RD Implementation Ready` for local implementation because:

- Generic `/upload` and `POST /api/submissions` retirement are explicit.
- Owner write contracts, route ownership, version handling and error codes are explicit.
- Root/drawing/part ambiguity is a blocking state with recovery messages.
- Snapshot schema, version, hash and immutability are specified.
- Idempotency and attempt states are specified.
- Attachment storage-key collision handling is specified.
- Permission/state gates are explicit.
- QA negative tests must cover API bypass, parallel submit, owner API rejection, storage collision and released-record edit blocking.

Production deployment, production migration, direct DB cleanup and data deletion remain stop conditions.

### 12.9 DEV-053 Multi-Part Batch Scope Amendment (2026-08-06)

- `submission_part_scopes` is the canonical immutable list of parts carried by one controlled drawing revision submission. It stores submission, company, item, part identity, link type, shared FFF states/outcome and captured time; `(submission_id, part_number_id)` is unique.
- Existing submissions are not backfilled. A submission with no scope rows continues to use legacy `submissions.item_id` and scalar snapshot fields, so formal/reserved production history remains readable.
- Creation of submission, files, snapshot, audit and all scope rows is one transaction.
- Release first validates that every snapshotted drawing-part relationship still exists with the same link type, then updates all scoped item/part statuses in the same transaction. Any drift or write failure rolls back the complete release.
- Part history/search must join the scope table so P01/P02/P03 can all trace to the same submission.
- PostgreSQL/Supabase migration `025_submission_part_scope.sql` is additive, enables and forces RLS, and revokes direct `PUBLIC`, `anon` and `authenticated` table access. Production application remains a separate authorized release gate.
- The current scalar snapshot/current-part fields remain a compatibility anchor only; they are not allowed to silently reduce a batch to one part.

## 13. Spec Governance

Cross-spec handling:

- Supersedes the old assumption in `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md` that generic `/upload` remains as auxiliary/manual intake.
- Extends `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`; that older spec remains valid for three-page layout consistency but does not govern data owner, submission snapshot or upload retirement.
- Aligns with `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md` by keeping `part_roots`, `drawing_numbers`, `part_numbers` and `drawing_part_links` as separate owner domains.

ADR:

- ADR is required because this changes cross-module ownership, submission evidence behavior, generic upload retirement and audit expectations.
- ADR path: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

RD readiness review:

- P0/P1 product decisions are confirmed.
- Engineering contracts for DB/API/permission/transaction/failure recovery/QA are specified.
- No human blocker remains before local RD implementation.
- Production and data cleanup remain blocked by explicit stop conditions.
