# QA Plan: PDM Drawing Submission UI Operation Scenarios

Date: 2026-07-02
Owner: QA / Dev PM
Status: UI-only operation validation plan ready; QC script implemented and passing locally

## 1. Purpose

This plan verifies that the drawing submission workflow can be operated from the UI without asking users to understand database records, API payloads, internal status codes, or manual backend cleanup.

The business risk addressed by this plan is the gap found during D-0014-MA1 recovery: the final release was achievable locally, but part of the recovery depended on non-user-facing operations. For a production user, that means the workflow can become blocked even when the system technically has a recovery path.

## 2. UI-Only Rule

Allowed as validation evidence:

- Browser login through `/login`.
- Navigation through visible menus, buttons, links and page routes.
- Typing into visible fields, changing visible selections, checking visible checkboxes.
- Uploading through a visible file input/dropzone.
- Confirming visible browser dialogs.
- Reading visible page text, button states, disabled states and screenshots.
- Viewport checks for desktop, tablet and mobile widths.

Not allowed as proof for this plan:

- Direct database query, insert, update, delete or migration.
- Direct API setup call to create or modify the tested state.
- Manual modification of SQLite, Postgres, local files, Google Drive metadata or released evidence.
- Treating raw backend errors, stack traces, constraint names or internal status codes as acceptable user instructions.

Important boundary: route-mocked browser states are allowed only as UI contract simulation when creating the real backend state would require destructive data setup, production movement, or direct database mutation. These cases prove the UI behavior and wording, not backend persistence.

## 3. Scope

In scope:

- Drawing module `送審` entry for D-0014-MA1.
- Legacy drawing upload URL compatibility.
- Generic `/upload` retirement behavior.
- Existing submission detail navigation for D-0014-MA1.
- Ready-to-submit workbench behavior.
- Missing note, missing attachment and missing master-data blockers.
- Same drawing + same revision states: Pending, Releasing, Released, historical/non-blocking.
- Release-incomplete recovery UI: diagnosis, attachment organizer, upload, delete, selection and corrected submission creation.
- Permission-denied wording for correction creation.
- Submission detail behavior: Pending cancel, non-creator restriction, release retry, correction entry, restricted summary and not-found state.
- User-facing language sweep for raw technical errors.
- Responsive layout check for the core workbench at 1440, 1024, 768 and 390 px.

Out of scope:

- Production deployment and production smoke test.
- Supabase production migration, provider pointer switch or data parity execution.
- Google Drive real file movement.
- Direct repair of historical broken records.
- Proving every backend lifecycle state by real data mutation; route-mocked states are separately labeled as UI contract simulation.

## 4. FMEA

| Failure mode | Likely cause | User impact | Detection method | Priority | QA countermeasure |
|---|---|---|---|---|---|
| User clicks `送審` from drawing module and lands on unrelated drawing | Route parameter loses drawing identity or detail link chooses wrong record | User may review or change wrong drawing package | Real browser navigation from drawing list to D-0014-MA1 workbench/detail | P0 | `REAL-001`, `REAL-004` |
| Drawing-source submission opens a blank generic upload form | Legacy `/upload` remains primary behavior | User must refill data already owned by drawing/part modules | Open legacy drawing URL and retired generic upload route | P0 | `REAL-002`, `REAL-003` |
| Workflow says conditions passed but submit button stays blocked without reason | UI validation rules disagree with readiness message | User cannot know what to fix | Ready-state UI operation with note and attachment conditions | P0 | `MOCK-READY-001`, `MOCK-READY-002` |
| Same-revision conflict is shown as master-data missing | Blocker categories are collapsed | User looks in the wrong place and cannot recover | Mixed blocker UI simulation and wording sweep | P0 | `MOCK-BLOCKER-001`, forbidden-text sweep |
| Release-incomplete record cannot be recovered in UI | Failed release is treated only as duplicate active submission | Workflow dead-end; user needs developer/admin backdoor | Release-incomplete workbench simulation with correction flow | P0 | `MOCK-RELFAIL-001` |
| UI exposes raw DB/API/internal codes | Backend error is passed through directly | User cannot act; quality perception and support burden worsen | Forbidden visible text sweep on every scenario | P0 | Global assertion for raw codes/errors |
| Unauthorized user can create correction or retry release | Role gate missing or only enforced client-side | Uncontrolled evidence or duplicate submission risk | Role-specific UI simulation | P0 | `MOCK-PERM-001`, `MOCK-DETAIL-001` |
| Existing failed or restricted submission cannot be understood | Detail page has no recovery route or human summary | User cannot decide next action | Detail page state simulations | P1 | `MOCK-DETAIL-001`, `MOCK-DETAIL-002` |
| Mobile/tablet workbench overflows horizontally | Layout uses fixed width or oversized controls | Field use becomes unreliable on smaller screens | Browser viewport measurement | P1 | `RWD-001` |

## 5. Test Matrix

| ID | Evidence type | Scenario | Pass criteria |
|---|---|---|---|
| `AUTH-001` | Real UI | Engineer, R&D Manager and Admin can log in through `/login` | All three roles reach authenticated app UI |
| `REAL-001` | Real UI | From drawing module, open D-0014-MA1 submission entry | Workbench route keeps D-0014-MA1 and locks formal released revision |
| `REAL-002` | Real UI | Open legacy drawing upload URL | Page shows drawing submission workbench, not generic blank upload form |
| `REAL-003` | Real UI | Open generic `/upload` | Page does not present uncontrolled blank formal submission form |
| `REAL-004` | Real UI | Open existing D-0014-MA1 submission detail from workbench/history | Detail remains D-0014-MA1 and does not route to unrelated drawing |
| `MOCK-READY-001` | UI contract simulation | Ready state with note and selectable attachment | Submit button becomes actionable and success message is human-readable |
| `MOCK-READY-002` | UI contract simulation | No attachment selected | Submit is blocked with Chinese explanation |
| `MOCK-BLOCKER-001` | UI contract simulation | Missing master data plus same-revision conflict | Blockers are separated and explained in Chinese |
| `MOCK-BLOCKER-002` | UI contract simulation | Pending, Releasing, Released and history states | Each state shows the correct next action and no raw internal code |
| `MOCK-RELFAIL-001` | UI contract simulation | Release incomplete with conflicting attachment filename | User can remove/upload/select attachment and create correction through UI |
| `MOCK-PERM-001` | UI contract simulation | Correction creation denied by permission | UI explains who can handle it in Chinese |
| `MOCK-DETAIL-001` | UI contract simulation | Pending cancel, non-creator restriction, release retry and correction route | Role-specific actions and restrictions match expected behavior |
| `MOCK-DETAIL-002` | UI contract simulation | Restricted summary and not-found state | Page gives human-readable Chinese status, not stack/API details |
| `RWD-001` | Real UI + UI contract measurement | Core workbench at 1440, 1024, 768 and 390 px | No horizontal overflow and critical actions remain visible |

## 6. Data And Fixture Needs

- Real local app state: D-0014-MA1 must exist and represent the current formal/released drawing state.
- Route-mocked UI states: used only for safe simulation of lifecycle states that should not be created by direct database mutation in this validation plan.
- Temporary upload fixture: `output/playwright/ui-operation-scenarios/D-QA-RELFAIL-MA1.SLDDRW`.
- Evidence folder: `output/playwright/ui-operation-scenarios/`.

## 7. Pass / Fail Standard

Pass:

- All test matrix items pass through `npm run qc:pdm-drawing-submission-ui-operation`.
- Visible UI text never exposes `duplicate_active_submission`, `ReleaseFailed`, `UNIQUE constraint failed`, raw API paths, stack traces or other internal-only wording.
- D-0014-MA1 never routes to D-0009-MA1 or any unrelated drawing in real route checks.
- Formal/released drawing state is locked from duplicate active submission.
- Release-incomplete recovery is operable from the UI contract without destructive file overwrite.
- Workbench has no horizontal overflow at the tested widths.

Fail:

- Any user-facing dead-end requires DB/API/manual backend intervention to continue a normal user workflow.
- Any blocking message is only an internal code or raw technical error.
- Any route loses the source drawing identity.
- Any scenario presents a green/pass readiness message while the primary action is disabled without a visible reason.
- Any mobile/tablet viewport hides or overflows critical actions.

## 8. QC Command

Run:

```powershell
npm run dev:local:check
npm run qc:pdm-drawing-submission-ui-operation
```

Expected local result from the current QC pass:

- `npm run dev:local:check`: local project-owned Next server on port 3000 is healthy.
- `npm run qc:pdm-drawing-submission-ui-operation`: 14/14 passed.

Current evidence:

- Report: `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`
- JSON report: `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.json`
- Screenshots: `output/playwright/ui-operation-scenarios/*.png`

## 9. Residual Risk

- Route-mocked scenarios validate UI contract behavior and visible language, not backend persistence or production integration.
- Real D-0014-MA1 checks validate route identity, formal-state locking and current local detail navigation, but do not prove production data repair.
- Production release, migration, historical repair, Google Drive production movement and direct cleanup remain outside this QA plan and require separate approval.
