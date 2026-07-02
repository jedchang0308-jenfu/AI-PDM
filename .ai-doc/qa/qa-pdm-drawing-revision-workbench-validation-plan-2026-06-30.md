# QA Validation Plan: PDM Drawing Revision Workbench

日期：2026-06-30
關聯 DEV：`DEV-PDM-UI-POLISH-001A`
狀態：QA Ready / implementation authorization pending
來源規格：`.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`

## 1. Purpose

驗證 `/numbering/revisions` 從 API 參數表單改造成「圖面進版工作台」後，RD 可以用正式圖號和工程判定完成進版流程，不需要知道內部 ID，也不會繞過 `DEV-PDM-CHANGE-CONTROL-001` 的 FFF / 替代料號 / 審核 / BOM 管制規則。

## 2. Scope

In scope:

- Drawing resolver and context summary.
- Query-param prefill from drawing detail CTA.
- FFF outcome preview.
- No-impact, suspected-impact, confirmed-impact branch copy and behavior.
- Confirmed-impact replacement draft handling.
- Primary manufacturing part resolution fallback.
- Duplicate submit prevention.
- Human-readable error mapping.
- Desktop and mobile visible-error / layout gates.

Out of scope:

- Production deploy.
- Supabase production cutover.
- Schema migration.
- CAD/OCR/SolidWorks metadata extraction.
- Automatic CAD file mutation.
- Automatic released BOM mutation.

## 3. Entry Criteria

QC may execute this plan only when:

- RD identifies implementation branch or staged file boundary.
- App can start locally.
- `/numbering/revisions` renders.
- At least one drawing fixture with a primary manufacturing part exists.
- At least one drawing fixture without a primary manufacturing part or with multiple part candidates exists, or RD provides a seed path.
- Existing change-control QC baseline is runnable.

If fixture data is unavailable, mark affected cases `blocked`, not failed.

## 4. Test Data

| Fixture | Purpose |
|---|---|
| `D-0014-MA1` or equivalent existing MA drawing | Happy-path resolver and context summary |
| Linked part `P-0014-001` or equivalent | Current part context |
| Drawing with no primary manufacturing part | Confirmed-impact missing-current-part gate |
| Drawing with multiple candidate parts, if supported by seed | Explicit current-part selection |
| Duplicate revision value | Duplicate revision visible error |
| Confirmed-impact replacement draft fixture | Existing equivalent draft reuse |

If exact fixture names differ, QC records the actual drawing/part identifiers used.

## 5. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 正式圖號仍被當成內部 ID 查詢 | Resolver 未落實或 UI 仍送錯欄位 | RD 無法進版，出現 `drawing_number_not_found` | `QA-REV-WB-001` | P0 | 用 `D-0014-MA1` 查詢並送出 |
| UI 仍顯示 `圖號 ID` 或 `現行料號 ID` | 舊表單未清除 | 使用者被迫理解內部資料模型 | `QA-REV-WB-002` | P0 | DOM/text sweep |
| confirmed-impact 沒有現行料號仍可送出 | primary part fallback 缺失 | 替代料號來源不可追溯 | `QA-REV-WB-007` | P0 | 無 primary part negative case |
| duplicate submit 建立多筆 draft/assessment | UI lock 或 server guard 缺失 | 重複草稿、審核混亂 | `QA-REV-WB-009` | P0 | double click + repeated API |
| raw domain code 顯示給使用者 | error mapping 缺失 | 使用者不知道如何修正 | `QA-REV-WB-010` | P1 | forced negative cases |
| outcome preview 與後端實際結果不一致 | UI outcome rule 和 domain rule 分歧 | 審核責任錯誤 | `QA-REV-WB-004` to `006` | P0 | 三種 FFF outcome 對照 |
| 手機版 context 或 CTA 被遮住 | stepper / sticky summary RWD 不良 | 現場操作失敗 | `QA-REV-WB-011` | P1 | viewport screenshots |
| resolver 顯示跨公司資料 | 權限 / company scope 漏檢 | 資料外洩 | `QA-REV-WB-012` | P0 | wrong-company query, if fixture available |

## 6. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| `QA-REV-WB-001` | User can input an official drawing number and see drawing/part context without internal ID entry | UI screenshot + resolver response |
| `QA-REV-WB-002` | Normal UI does not expose editable `圖號 ID` or `現行料號 ID` fields | DOM/text sweep |
| `QA-REV-WB-003` | Query params preload the drawing and reject mismatched `drawingNumberId` / `drawingNumber` | UI + API negative response |
| `QA-REV-WB-004` | No-impact preview states reviewer must confirm BOM no revision | Screenshot |
| `QA-REV-WB-005` | Suspected-impact preview states reviewer must choose reuse or return | Screenshot |
| `QA-REV-WB-006` | Confirmed-impact preview requires replacement draft and drawing part-number match | UI + API negative/positive evidence |
| `QA-REV-WB-007` | MA drawing without safe current part blocks confirmed-impact submit with visible reason | UI + API negative evidence |
| `QA-REV-WB-008` | Multiple candidate current parts require explicit selection before confirmed-impact submit | UI + API evidence |
| `QA-REV-WB-009` | Double-click/repeated submit does not create duplicate active replacement drafts or assessments | DB/API evidence |
| `QA-REV-WB-010` | Raw domain errors are translated into Traditional Chinese user guidance | Negative UI evidence |
| `QA-REV-WB-011` | Desktop and mobile layouts show current drawing context and primary action without overlap, clipping, or horizontal overflow | Screenshots |
| `QA-REV-WB-012` | Resolver respects company scope and query params are not authorization | API/UI negative evidence if fixture available |

## 7. Test Cases

### TC-WB-001 Official Drawing Resolver

Steps:

1. Open `/numbering/revisions`.
2. Enter an existing official drawing number such as `D-0014-MA1`.
3. Resolve the drawing.

Expected:

- Drawing context appears.
- Current part appears if exactly one primary manufacturing part exists.
- No editable internal ID field is needed.

Evidence:

- Screenshot.
- Resolver API response.

### TC-WB-002 Query Param Prefill And Mismatch

Steps:

1. Open `/numbering/revisions?drawingNumberId={validId}&drawingNumber={matchingCode}`.
2. Open another URL with valid ID and non-matching drawing number.

Expected:

- Matching pair preloads context.
- Mismatched pair is rejected with a visible message.

Evidence:

- Screenshot and API response.

### TC-WB-003 FFF Outcome Preview

Steps:

1. Resolve a drawing.
2. Set all FFF to `無影響`.
3. Set one FFF to `疑似影響`.
4. Set one FFF to `確認影響`.

Expected:

- No-impact preview lists reviewer BOM no-revision confirmation.
- Suspected-impact preview lists reviewer conclusion requirement.
- Confirmed-impact branch appears and hides no-impact/suspected-only fields.

Evidence:

- Screenshots for each branch.

### TC-WB-004 Confirmed Impact Replacement Draft

Steps:

1. Resolve drawing with exactly one current part.
2. Set one FFF dimension to `確認影響`.
3. Select `系統建立替代料號草稿`.
4. Fill matching drawing part-number read/corrected value.
5. Submit.

Expected:

- A drawing-revision-generated replacement draft is created or an equivalent active draft is reused.
- Assessment is created.
- No new drawing number is created.

Evidence:

- UI result.
- API/DB evidence for draft and assessment.

### TC-WB-005 Primary Part Missing Or Ambiguous

Steps:

1. Resolve a drawing with no primary manufacturing part.
2. Set confirmed impact and attempt submit.
3. Resolve a drawing with multiple candidate current parts, if available.
4. Attempt submit without explicit selection, then select one candidate and retry.

Expected:

- Missing current part blocks confirmed-impact submit.
- Multiple candidates require explicit selection.
- Server re-checks selected part relationship.

Evidence:

- UI blocked reason.
- API negative and positive response.

### TC-WB-006 Duplicate Submit Guard

Steps:

1. Prepare a confirmed-impact payload.
2. Double-click the primary action or send the same API request twice quickly.
3. Query active drafts and assessments for the drawing/revision.

Expected:

- UI pending lock prevents repeated front-end submit.
- Server returns existing equivalent active assessment/draft or rejects duplicate.
- No duplicate active replacement drafts or assessments exist.

Evidence:

- API responses.
- DB/API count evidence.

### TC-WB-007 Error Mapping

Steps:

1. Trigger drawing not found.
2. Trigger missing replacement data.
3. Trigger drawing part-number mismatch.

Expected:

- User sees Traditional Chinese repair guidance.
- Raw domain code is not the primary visible message.

Evidence:

- Screenshots.

### TC-WB-008 Viewport And Visible Error Sweep

Viewports:

- 320 x 720
- 768 x 900
- 1024 x 768
- 1440 x 900

Checks:

- No visible unexpected `.inline-error`, `[role=alert]`, `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, or raw `/api/...` error in normal operation.
- Current drawing context remains visible.
- Primary action remains reachable.
- No horizontal overflow, overlap, clipped buttons, or unreadable FFF controls.

Evidence:

- Screenshot per viewport.

## 8. QC Commands

Required:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-numbering-api-regression
```

Recommended focused command if RD adds it:

```powershell
npm.cmd run qc:pdm-drawing-revision-workbench
```

Manual/UI evidence is mandatory. Passing typecheck or API tests alone is not sufficient for this UI-heavy task.

## 9. Pass / Fail / Block Criteria

Pass:

- All P0 and P1 criteria pass.
- UI screenshots prove no critical viewport breakage.
- Existing change-control guards still pass.
- Duplicate submit evidence proves no duplicate active draft/assessment.

Fail:

- Official drawing number still produces `drawing_number_not_found` in normal flow.
- Internal IDs remain required in normal UI.
- Confirmed impact can submit without safe current part and replacement draft.
- Raw domain code is primary visible error copy.
- Existing change-control QC fails due to this work.

Blocked:

- App cannot start.
- Required drawing/part fixtures unavailable.
- Login/permission setup unavailable.
- RD implementation does not expose required route or resolver.

## 10. QC Evidence Package

Final QC report must include:

- Implementation branch or staged boundary.
- Commands executed and results.
- Route mapping.
- Resolver API evidence.
- Screenshots for normal, negative, confirmed-impact, desktop and mobile states.
- DB/API duplicate submit evidence.
- List of blocked/skipped cases and reasons.
