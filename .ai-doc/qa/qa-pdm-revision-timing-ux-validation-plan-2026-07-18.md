# QA Plan：保留號首版圖面版次預告與建立入口

Status: QA Executed / QC Passed / Local Only
Date: 2026-07-18
Owner: QA / Dev PM
Related DEV: `DEV-051` / `DEV-PDM-REVISION-TIMING-UX-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md`

## 1. Purpose

Validate that the reserve-number workflow moves revision awareness earlier without creating a second revision authority.

The implementation must prove:

- A fresh reserved number does not appear as `V2` / `v2` drawing revision because of internal `rowVersion`.
- Users can see the suggested first drawing revision after a drawing candidate is reserved.
- Users understand that the suggested revision is not yet created.
- Candidate-only drawing numbers do not receive an actionable formal-workbench CTA; the CTA opens only after publication promotes the drawing number.
- Users know where the revision becomes editable: the drawing revision workbench before submission snapshot.
- Existing `DEV-050` release policy remains intact.
- RD added a focused QC command that can catch the highest-risk static regressions without live data.

## 2. Validation Scope

In scope:

- Reserve-number list row display.
- Reserve-number detail / drawer next-action area.
- Server-derived suggested revision display in reservation context.
- `建立首版圖面` CTA handoff to `/numbering/revisions`.
- Drawing revision workbench preselection and editable revision field.
- Suggestion override reason and stale basis behavior inherited from `DEV-050`.
- Focused static QC script and package script registration.
- Desktop and mobile visible-error / overflow checks.

Out of scope:

- Production deploy.
- Production migration or live data repair.
- Historical revision data classification.
- CAD title-block automation or SolidWorks add-in behavior.
- Emergency-use, `ConditionalUse` or `TrialApproved`.
- Manufacturing handoff / formal release consumer alignment.

## 3. RD Traceability Matrix

| Slice | Product files | QA evidence required |
|---|---|---|
| Phase 1A rowVersion 誤讀修正 | `src/components/number-state-workspace.tsx` | Static assertion plus browser row text: no raw `v{workspace.rowVersion}`, no `新圖料 · v2`, internal version if visible is `系統紀錄版本`. |
| Phase 1B detail revision-preparation panel | `src/components/number-state-workspace.tsx` | Drawer browser check shows `圖面版次準備`, `建議研發版次`, `尚未建立版次`, candidate-only disabled CTA reason, correct no-drawing-candidate message and no reserve-form revision input. |
| Phase 1C CTA and workbench prefill | `src/components/number-state-workspace.tsx`, `src/app/numbering/revisions/page.tsx`, `src/app/api/numbering/drawings/resolve/route.ts`, `src/lib/drawing-revision-workbench.ts` | CTA URL includes drawing number, `workflowIntent=rd_workspace`, `source=number_state_workspace`, `workspaceId`; workbench recomputes server suggestion and preserves manual edit. |
| Phase 1D focused QC and regression | `scripts/qc-pdm-reservation-revision-timing-ux.mjs`, `package.json` | `npm.cmd run qc:pdm-reservation-revision-timing-ux` passes; DEV-050 and DEV-048 regression commands pass. |

## 4. Fixtures

Use disposable local data or QC-owned fixture records only. No test may mutate production or user-owned live records.

Minimum fixture set:

| Fixture | Purpose |
|---|---|
| New `new_drawing_part` workspace with one drawing candidate | Verify first-drawing suggestion and CTA. |
| New workspace before candidate acquisition | Verify no fake revision suggestion and correct now-what message. |
| Workspace with root/part candidate but no drawing candidate | Verify first-drawing CTA is hidden or disabled with reason. |
| Workspace whose `rowVersion` increments to 2 after acquire | Verify list row does not display unlabeled `v2`. |
| Existing drawing with no major release | Verify `rd_workspace` suggestion starts at `0.1`. |
| Existing drawing with Released major `1` | Verify non-first workbench can still suggest `1.1` or next minor by intent. |
| User without drawing revision create permission | Verify CTA hidden/disabled and direct route/API fail closed. |
| Locked review workspace | Verify no edit-reservation path is offered as revision-edit shortcut. |

## 5. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| Fresh reserve row shows `新圖料 · v2` | Internal `rowVersion` exposed without label | User thinks first drawing is already V2 | Static and browser row text assertion | P0 | Remove raw `v{rowVersion}` from list or relabel outside primary row. |
| Reserve detail shows suggestion as if revision already exists | Copy omits `尚未建立版次` | User may use suggestion as formal title-block evidence | Browser detail assertion | P0 | Pair suggestion with not-yet-created state. |
| Revision is editable in reserve form | Field added too early | Reservation becomes second revision authority | Static and browser form check | P0 | Reserve form remains identity/content editing only. |
| CTA passes trusted revision query | Implementation trusts URL `revision=0.1` | User can bypass server policy snapshot | API/static check | P0 | Query carries drawing number and intent; workbench calls server suggestion. |
| Resolve suggestion differs from submit context | Old resolver and `DEV-050` policy diverge | User sees one suggestion and submits another unexpectedly | Static check plus API fixture | P1 | Align resolver with central suggestion engine or treat resolver suggestion as provisional. |
| User manual edit gets overwritten | Async server refresh resets field | User loses explicit override selection | Browser interaction test | P1 | Track manual edit / touched state and stop auto-overwrite after user edit. |
| Suggestion unavailable but UI silently blanks | Missing failure state | User cannot tell next step | Browser/API failure injection | P1 | Show retry / go-to-workbench recovery state. |
| Permission bypass through direct URL | CTA-only guard without server guard | Unauthorized user can create revision package | Direct API and browser permission test | P0 | Server-side permission remains authoritative. |
| Candidate CTA opens before formal publication | UI treats candidate code as formal `drawing_numbers` record | Workbench lookup fails or implies authority too early | Candidate/published fixture comparison | P0 | Disable CTA until workspace is published and matching drawing reservation is promoted. |
| Minor revision release gate regresses | New UX treats minor suggestion as release-ready | Manufacturing may use minor as formal release | `DEV-050` regression commands | P0 | Keep release gate and no emergency-use path. |
| Mobile drawer overflows | Added copy/CTA too wide | Field use on shop-floor/mobile breaks | 390 and 320 viewport screenshot/DOM check | P1 | Compact copy, wrap labels, avoid horizontal overflow. |
| Visible runtime error hidden by passing tests | Build/API passes but UI displays alert or 500 | Operator sees broken workflow | Visible-error sweep | P0 | QC fails on visible alert, route error, 4xx/5xx banner or raw stack. |

## 6. Acceptance Matrix

| ID | Case | Expected | Evidence |
|---|---|---|---|
| QA-051-01 | Create reserved drawing workspace and auto-acquire candidates | List row does not show raw `v2`, `V2` or unlabeled version text. | Static QC plus 1440x900 row screenshot. |
| QA-051-02 | Open detail for the same workspace | Internal row version, if visible, is labelled `系統紀錄版本 2` or kept in audit-level detail. | Drawer screenshot / DOM text. |
| QA-051-03 | Detail has one drawing candidate and no controlled package | Shows `建議研發版次 0.1` and `尚未建立版次`. | Drawer screenshot / DOM text. |
| QA-051-04 | Detail has no drawing candidate | Does not show a fake revision suggestion; first-drawing CTA is hidden/disabled with reason. | Fixture browser check. |
| QA-051-05A | Candidate-only detail shows `建立首版圖面` | CTA is disabled with a review/publication reason; no formal route handoff is offered. | Candidate drawer screenshot / DOM assertion. |
| QA-051-05B | Publish workspace and promote drawing reservation, then click `建立首版圖面` | Opens `/numbering/revisions` with drawing number and `workflowIntent=rd_workspace` context. | Published drawer screenshot and URL assertion. |
| QA-051-06 | Load revision workbench from CTA | Workbench requests server suggestion and displays the same suggested revision. | Network/API mock or local route evidence. |
| QA-051-07 | Edit revision in revision workbench before submission | Field is editable in this surface, not in reserve-number edit form; manual edit is not overwritten by refresh. | Browser interaction check. |
| QA-051-08 | Override suggestion without reason | Submission/package create rejects with actionable Traditional Chinese message. | API/browser negative test. |
| QA-051-09 | Override suggestion with reason in allowed lane | Snapshot records suggested revision, selected revision, policy version, basis hash and override reason. | API response / repository fixture. |
| QA-051-10 | Basis changes before submission | Stale suggestion 409 recovery appears; no submission is created from stale basis. | DEV-050 regression evidence. |
| QA-051-11 | User attempts to release minor revision after this UX | Existing `minor_revision_cannot_be_released` gate still blocks. | `qc:pdm-revision-policy-release-gate`. |
| QA-051-12 | Phase 1 emergency-use visibility | No `ConditionalUse`, `TrialApproved`, `條件使用` or `試用核准` CTA or recovery path appears. | Static QC plus browser sweep. |
| QA-051-13 | Locked review workspace detail | Does not offer revision edit through reserve-number edit; shows review/correction path. | Fixture browser check. |
| QA-051-14 | Direct route/API without permission | Fails closed; no cross-company or unauthorized suggestion/detail leakage. | Protected API smoke. |
| QA-051-15 | Focused QC registration | `package.json` contains `qc:pdm-reservation-revision-timing-ux` and target script exists. | Command pass. |

## 7. Focused QC Script Design

`scripts/qc-pdm-reservation-revision-timing-ux.mjs` must be deterministic and local-only.

Required inspected files:

- `src/components/number-state-workspace.tsx`
- `src/app/numbering/revisions/page.tsx`
- `src/app/api/numbering/drawings/resolve/route.ts`
- `src/lib/drawing-revision-workbench.ts`
- `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`
- `package.json`

Required assertions:

| Assertion | Failure message intent |
|---|---|
| Primary reserve UI no longer renders `· v{workspace.rowVersion}` or equivalent raw row version. | `reserve_row_version_exposed_as_revision` |
| UI contains `系統紀錄版本` for internal row version if retained. | `system_record_version_label_missing` |
| UI contains `圖面版次準備`, `建議研發版次`, `尚未建立版次`, `建立首版圖面`. | `revision_preparation_copy_missing` |
| CTA contains `/numbering/revisions`, `drawingNumber`, `workflowIntent=rd_workspace`, `source=number_state_workspace`, `workspaceId`. | `first_drawing_cta_context_incomplete` |
| Candidate-only CTA is disabled and actionable handoff requires published workspace plus promoted drawing reservation. | `candidate_cta_authority_gate_missing` |
| `/numbering/revisions` reads workflow intent aliases and passes workflow intent to server context. | `revision_workbench_intent_handoff_missing` |
| Resolve route/context accepts workflow intent or workbench treats resolver suggestion as provisional until submission context returns. | `resolver_suggestion_policy_alignment_missing` |
| Submission-workbench route still accepts `workflowIntent`. | `submission_context_intent_support_missing` |
| No reserve workspace persistence authority field is introduced for drawing revision. | `reservation_revision_authority_introduced` |
| No emergency-use / conditional-use / trial-approved text is introduced in DEV-051 touched surfaces. | `phase1_emergency_lane_exposed` |
| `package.json` registers the focused QC command. | `focused_qc_script_not_registered` |

Recommended script output:

```text
qc:pdm-reservation-revision-timing-ux passed 13/13 checks
```

## 8. UI / Browser QC Plan

Required browser checks after RD implementation:

| Viewport | Route / Surface | Checks |
|---|---|---|
| 1440x900 | Reserve-number list | Row identity, status, candidate codes and next step visible; no raw `v2`. |
| 1440x900 | Candidate reserve-number drawer | Revision-preparation section visible; suggestion shown; CTA disabled with publication reason. |
| 1440x900 | Published reserve-number drawer | CTA becomes actionable only after the drawing reservation is promoted. |
| 1024x768 | Reserve-number drawer | No overlap, clipping or horizontal overflow. |
| 390x844 | Reserve-number list and drawer | Text wraps cleanly; CTA remains tappable; no horizontal overflow. |
| 320x740 | Reserve-number drawer | Critical state still readable; no button squeeze or clipped message. |
| 1440x900 | `/numbering/revisions` from CTA | Drawing number preselected; workflow intent server suggestion displayed. |

Visible-error hard gate:

- Fail if any visible `.inline-error`, `[role=alert]` failure, load failed banner, visible `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, `/api/...` route error text, raw SQL, stack trace or English-only internal error appears.
- Build, lint and direct API success are supporting evidence only. They cannot override a visible UI failure.

RWD hard gate:

- Fail if `document.documentElement.scrollWidth > window.innerWidth + 1`.
- Fail if any critical CTA has width under 44 px, clipped text, or label overlap.
- Fail if the drawer body hides the `尚未建立版次` message below an unreachable scroll trap.

## 9. Static / API / Regression Plan

Pre-implementation baseline command:

```powershell
rg -n "v\\{workspace\\.rowVersion\\}|新圖料 · v|版次 v|V2|ConditionalUse|TrialApproved" src .ai-doc
```

The baseline may find the current defect. After implementation, the same search must not find reserve-number primary UI copy that displays raw row version as business revision.

Minimum command set after RD implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run qc:pdm-reservation-revision-timing-ux
npm.cmd run qc:pdm-revision-policy-suggestion
npm.cmd run qc:pdm-revision-policy-release-gate
npm.cmd run qc:pdm-number-state-flow-phase1b
npm.cmd run qc:pdm-number-state-flow-ui
```

Additional API checks when fixtures are available:

- Unauthenticated `/api/numbering/drawings/{drawingNumber}/submission-workbench?workflowIntent=rd_workspace` returns 401 / login-required.
- Authenticated same-company user with view permission can load context.
- User without create/update permission cannot create controlled package via direct POST.
- Override without reason fails with the existing Traditional Chinese validation message.
- Minor revision final approval/retry-release remains blocked by `minor_revision_cannot_be_released`.

## 10. Data Sanity Gate

- Creating and acquiring a reservation may increment `rowVersion`; that increment must not create a drawing revision.
- Formal master counts must not change merely by showing the suggested revision.
- No submission or controlled drawing package is created until the user enters the revision workbench and performs the explicit create/submit action.
- Publication may create formal drawing master data, but merely viewing or editing the suggested revision must still create no submission or drawing revision package.
- No migration is expected. If a migration appears in the RD diff, QA must stop and request PM review before continuing.
- The reservation workspace cannot become an alternate revision authority through `revision`, `selectedRevision`, `suggestedRevision`, `revisionPolicySuggestion`, title-block metadata or audit payload side effects.

## 11. Evidence to Collect on Failure

For UI failures:

- route URL;
- viewport;
- screenshot path;
- user role / company fixture;
- visible text around the failure;
- console error and network error summary if available.

For API/data failures:

- request route and payload with secrets redacted;
- expected status and actual status;
- response body code/message;
- affected workspace id, drawing number and revision;
- proof that production/live data was not touched.

For policy failures:

- workflow intent;
- suggested revision;
- selected revision;
- override reason state;
- policy version and basis hash;
- whether release gate ran before side effects.

## 12. Pass / Fail Rules

Pass when:

- Fresh reserved-number rows no longer imply `V2` drawing revision.
- The reserve detail answers "what revision should I start with" and "where can I edit it".
- Revision selection remains editable only in the drawing revision workbench before submission snapshot.
- Server-created suggestion and snapshot rules from `DEV-050` still pass.
- Minor revisions still cannot become formal `Released`.
- Focused QC command is registered and passes.
- Candidate-only CTA is disabled; after publication/promotion the same CTA opens the formal workbench with server-recomputed suggestion.
- Browser evidence at required viewports shows no visible runtime error, overlap, clipping or horizontal overflow.

Fail when:

- Any primary reserve-number row still displays raw `v2` / `V2` beside `新圖料` or item title.
- The system stores drawing revision on the reservation row as policy authority.
- The CTA trusts query-string revision without server recompute.
- The resolver and submit context return conflicting suggestions for the same drawing and workflow intent without clear provisional handling.
- Users can bypass override reason or release a minor revision.
- Emergency-use / conditional-use UI appears in Phase 1.
- QC lacks browser viewport evidence for the UI change.

## 13. Release Boundary

This QA plan does not authorize:

- production deploy;
- production migration;
- historical data repair;
- direct DB mutation;
- merge, PR, rollback or release artifact.

Production or historical repair requires a separate release/data-repair gate.

## 14. QA Execution Result

Execution date: 2026-07-18

Result: `PASS / Local Only`

Command evidence:

| Check | Result |
|---|---|
| `npm.cmd run qc:pdm-reservation-revision-timing-ux` | PASS 13/13 |
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run qc:pdm-revision-policy-suggestion` | PASS 14/14 |
| `npm.cmd run qc:pdm-revision-policy-release-gate` | PASS 11/11 |
| `npm.cmd run qc:pdm-number-state-flow-phase1b` | PASS 15/15 |
| `npm.cmd run qc:pdm-number-state-flow-ui` | PASS 7/7 |
| `npm.cmd run qc:pdm-production-slice-numbering-draft` | PASS 33/33 |
| `npm.cmd run qc:pdm-drawing-submission-workbench-recovery` | PASS 27/27 |
| `npm.cmd run qc:pdm-drawing-submission-review-only` | PASS 14/14 |

Browser evidence:

| Evidence | Verified result |
|---|---|
| `output/playwright/dev051-reservation-revision-timing-ux/candidate-drawer-1440x900.png` | List row has no raw `v2`; drawer labels `系統紀錄版本 2`, shows suggestion `0.1`, not-created copy and disabled CTA reason. |
| `output/playwright/dev051-reservation-revision-timing-ux/candidate-drawer-1024x768.png` | Drawer and revision panel remain within viewport with no overlap or horizontal overflow. |
| `output/playwright/dev051-reservation-revision-timing-ux/candidate-drawer-390x844.png` | Mobile panel, disabled CTA and reason are fully reachable and legible. |
| `output/playwright/dev051-reservation-revision-timing-ux/candidate-drawer-320x740.png` | Narrow mobile state has no clipping, button squeeze or horizontal overflow. |
| `output/playwright/dev051-reservation-revision-timing-ux/published-drawer-1440x900.png` | Published workspace with promoted drawing reservation exposes actionable `建立首版圖面`. |
| `output/playwright/dev051-reservation-revision-timing-ux/revision-workbench-manual-0.2-1440x900.png` | Formal drawing preselected; policy suggestion remains `0.1`; manually selected `0.2` remains after async context refresh. |

Runtime assertions:

- Candidate fixture: workspace row version `2`, drawing candidate `A0001-M01`, server suggestion `0.1`, CTA disabled before publication.
- Published fixture: workspace row version `3`, drawing reservation `promoted`, CTA URL carried `drawingNumber`, `workflowIntent=rd_workspace`, `source=number_state_workspace` and `workspaceId`.
- Resolve API and submission workbench API agreed on `0.1` for the same drawing and `rd_workspace` intent.
- Browser console result was 0 errors / 0 warnings. Visible alert/error sweep was empty.
- Production-slice hotfix retest on the reported `A0005-M01` local record returned panel state `ready`, suggestion `0.1`, no slice error and no horizontal overflow; browser error/warning log was empty.
- Middleware smoke proved `GET /api/submissions/revision-suggestion?...` passes the slice boundary and reaches auth (`401` when unauthenticated), while the legacy `POST` remains blocked with `403 feature_not_open_in_production_slice`; no mutation allowlist was widened.
- In official-numbering slice mode, the formal `/numbering/revisions` CTA remains disabled even after drawing publication because that page/workflow is outside the current slice.
- Required viewport DOM checks returned no horizontal overflow.
- Disposable database sanity check showed zero `submissions`, zero `drawing_revision_packages` and zero drawing revision assessment/package rows after suggestion viewing and manual edit.
- The isolated fixture database, auth storage and dev server were removed after evidence capture; the existing user service on port 3000 was not stopped.

Coverage interpretation:

- QA-051-08 through QA-051-11 remain inherited `DEV-050` authority and passed through its focused suggestion/release suites plus drawing submission recovery regressions.
- QA-051-14 is protected twice: the drawer disables the actionable CTA unless `numbering.draft.update` is allowed, and existing protected resolve/submission routes remain server-authoritative. DEV-051 did not add a new mutation API or weaken permission guards.
- No production, live provider, schema migration, historical repair, deploy, merge, PR or release action was performed.
