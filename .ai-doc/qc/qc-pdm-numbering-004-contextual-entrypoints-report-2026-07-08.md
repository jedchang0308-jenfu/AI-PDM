# QC-PDM-NUMBERING-004 - Contextual entrypoints report

Date: 2026-07-08
Related DEV: `DEV-PDM-NUMBERING-004`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
Related QA: `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`
Status: Passed for local Phase 1-3 implementation
APP feedback follow-up: Passed for draft delete and cancellable add actions
Name authority follow-up: Passed for root-name-owned part naming

## Scope Verified

- Object-context entrypoints are present on root, drawing and part detail surfaces.
- Existing-root append APIs can create `M02`, `R01`, `P02` without creating a new root.
- Combined fallback append can create drawing + part + relation in one repository transaction.
- Formal obsolete entries route through lifecycle approval; root obsolete uses impact preview plus aggregate approval request payload.
- Draft-only root cleanup uses `刪除草稿`, not formal obsolete wording, and is blocked unless the server receives explicit confirmation.
- Add drawing and add part dialogs can be cancelled/closed before save; edited forms ask before discarding unsaved input.
- Root drawer optional add section uses `新增相關資料`, not `接續操作`.
- Part name is inherited from the root core name in add flows; add dialogs and `/numbering/request` no longer expose editable part-level name controls.
- Append part APIs no longer require `partName`, and repository create/append paths derive part names from the root.
- `R` drawings cannot be saved as manufacturing-basis relationships.
- `/numbering/request` keeps new-root mode and adds `既有主根號追加` fallback mode.

## Evidence

Commands passed:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-contextual-entrypoints
npm.cmd run dev:local:check
```

Focused QC:

- `npm.cmd run qc:pdm-numbering-contextual-entrypoints`: 44/44 passed.

Isolated API smoke:

- Server: temporary `next start` on `http://127.0.0.1:3101`.
- Data: copied SQLite DB under `tmp/pdm-numbering-contextual-entrypoints-20260708094114`.
- Output: `output/qc-pdm-numbering-contextual-entrypoints/isolated-api-smoke.json`.
- Created in disposable DB:
  - `A0001-M02`
  - `A0001-R01`
  - `A0001-P02`
  - combined `A0001-M03` + `A0001-P03`
  - combined relation: `primary_manufacturing`
- Assertions: 10/10 passed, including unchanged root count, idempotency replay reuse, created rows present, relation present and obsolete-impact API root context returned.

Browser smoke:

- Server: local `http://127.0.0.1:3000`.
- User: admin demo login.
- Screenshots:
  - `output/playwright/pdm-numbering-contextual-entrypoints/numbering-request-append-mode.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/root-detail-entrypoints.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/drawing-detail-entrypoints.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/part-detail-entrypoints.png`
- Verified visible entrypoints:
  - `/numbering/request`: `既有主根號追加`, `新增圖號 + 料號並建立關係`
  - `/numbering/search` root detail: `新增圖號`, `新增料號`, `申請主根作廢`
  - `/numbering/drawings` detail: `新增同根圖號`, `新增同圖料號`, `申請圖號作廢`
  - `/parts` detail: `新增同根料號`, `新增同根圖號`, `申請料號作廢`

APP feedback browser smoke:

- Server: existing local `http://127.0.0.1:3000`.
- User: admin demo login.
- Screenshots:
  - `output/playwright/pdm-numbering-contextual-entrypoints/a0001-draft-delete-dialog.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/a0001-draft-delete-cancelled.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/a0001-draft-delete-dialog-compact.png`
- Verified:
  - `/numbering/search` root detail shows `新增相關資料` and does not show `接續操作`.
  - Draft root `A0001` exposes `刪除草稿` instead of `申請主根作廢`.
  - Delete dialog shows affected counts and can be cancelled without deletion.
  - `DELETE /api/numbering/records/A0001/draft` without confirmation returns `400` and does not delete `A0001`.
  - Add drawing dirty cancel shows `放棄未儲存的新增圖號內容？`.
- Add part dirty cancel shows `放棄未儲存的新增料號內容？`.

Name authority follow-up:

- Verified contextual add part dialog contains `品名跟隨主根` and no `料號品名` input.
- Verified `/numbering/request` contains `主根品名` and no editable `品名（系統建議，可微調）`, `套用建議`, or `系統建議流水號`.
- Verified append part routes no longer reject solely because `partName` is missing.
- Verified async repository uses `root.coreName` for created part names and synchronizes draft part names when the root name changes.
- Browser screenshots:
  - `output/playwright/pdm-numbering-contextual-entrypoints/numbering-request-root-owned-name.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/numbering-request-append-part-root-owned-name.png`
  - `output/playwright/pdm-numbering-contextual-entrypoints/a0001-add-part-root-owned-name.png`

## Boundary

- No production deploy was performed.
- No Supabase live migration/cutover was performed.
- No provider pointer switch, merge, PR, rollback or release artifact was performed.
- Runtime DB browser smoke was read-only. API write smoke used a disposable copied SQLite DB under `tmp/`.
