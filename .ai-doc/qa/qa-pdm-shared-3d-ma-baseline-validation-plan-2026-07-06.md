# QA-PDM-SHARED-3D-MA-BASELINE - 共用 3D 與 MA 製造基準包驗證計畫

Status: QA Plan Ready / Not Executed
Date: 2026-07-06
Owner: Dev PM / QA
Related DEV: `DEV-PDM-SHARED-3D-MA-BASELINE-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`

## 1. Purpose

Validate that shared 3D model evidence is owned at the part/root level, MA drawing revision packages explicitly reference the shared model or a reviewed 2D-only exception, and manufacturing baselines freeze the exact approved manufacturing combination.

The user-facing target is:

```text
這個料號/root 正式製造用哪一版 3D？哪幾張 MA 圖？各自哪一版？之後改版有沒有影響舊基準？
```

## 2. Scope

In scope:

- Part/root shared 3D model ownership.
- Part/root `cad_3d` and intermediate model attachment categories.
- Model-version content hash capture.
- MA drawing revision package model link.
- Reviewed `2D-only / no 3D impact` exception.
- Manufacturing baseline creation and release.
- Released baseline immutability.
- Duplicate 3D hash reuse guidance.
- Shared model impact analysis.
- Migration dry-run classification.
- Required MA drawing resolver and baseline missing-item blockers.
- Model revision/hash conflict handling.
- Approval-matrix action codes for model release, 2D-only exception and baseline release.
- Visible UI error sweep and viewport sanity.

Out of scope:

- Production deployment.
- Production migration or direct data repair.
- CAD/OCR/SolidWorks automatic extraction.
- Automatic BOM revision.
- Dedicated mobile-phone UI.

## 3. FMEA

| Failure mode | User impact | Priority | Control |
|---|---|---|---|
| Shared 3D remains MA-owned | Other MA drawings depend on hidden owner convention | P0 | QA-MODEL-001, QA-MODEL-002 |
| MA package releases without model link or exception | Cannot prove design basis | P0 | QA-LINK-001, QA-LINK-002 |
| 2D-only exception bypasses reviewer | Real model impact may be released as note change | P0 | QA-LINK-003 |
| Baseline is only a search result | Past manufacturing set cannot be reconstructed | P0 | QA-BASE-001, QA-BASE-002 |
| Released baseline can be edited | Audit evidence is mutable | P0 | QA-BASE-003 |
| Duplicate 3D uploads create multiple silent sources | Future impact analysis becomes unreliable | P1 | QA-HASH-001 |
| Shared model change does not show affected drawings/baselines | Downstream users miss required review | P1 | QA-IMPACT-001 |
| Migration silently reassigns ambiguous files | Existing evidence may be corrupted | P0 | QA-MIG-002 |
| Required MA drawing is silently omitted from baseline | Manufacturing evidence is incomplete | P0 | QA-BASE-004 |
| Same model revision points to different hashes | Model history becomes contradictory | P0 | QA-MODEL-004 |
| Baseline release uses hard-coded role instead of approval rules | Wrong approver can release or valid approver is blocked | P1 | QA-PERM-001 |
| UI has visible API/runtime error but tests pass | QC reports false pass | P1 | QA-UI-001 |

## 4. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| QA-MODEL-001 | A part/root can own a shared 3D model version with stable id and hash | API/service test |
| QA-MODEL-002 | Part/root shared 3D is not forced to be owned by `MA01` or another MA drawing | Static/service test |
| QA-MODEL-003 | Part/root model attachment accepts `cad_3d` and intermediate model categories | API/UI test |
| QA-MODEL-004 | Same owner + same model revision + different hash is blocked or routed to Admin-reviewed correction | Negative service/API test |
| QA-MODEL-005 | Same owner + same hash + same model revision reuses the existing model version | Service/API test |
| QA-LINK-001 | MA package release blocks when no shared model link and no reviewed 2D-only exception exists | Negative service/API test |
| QA-LINK-002 | MA package release succeeds when linked to a valid shared model version | Positive service/API test |
| QA-LINK-003 | `2D-only / no 3D impact` requires submitter reason and reviewer confirmation before release | UI/API workflow test |
| QA-BASE-001 | Manufacturing baseline freezes one shared 3D model version and selected MA package ids | API/service test |
| QA-BASE-002 | Later MA package revision does not mutate an older released baseline | Regression test |
| QA-BASE-003 | Released baseline edit attempt is blocked and routes to new baseline revision | Negative API/UI test |
| QA-BASE-004 | Resolver lists all required MA drawings and baseline release blocks if one is missing | Service/API negative test |
| QA-BASE-005 | Selecting a non-latest MA package requires an approved reason | Service/API negative and positive test |
| QA-SEARCH-001 | UI distinguishes dynamic part/root search from frozen baseline evidence | Browser screenshot / DOM check |
| QA-HASH-001 | Uploading duplicate 3D hash shows reuse candidate before creating a separate source | API/UI test |
| QA-IMPACT-001 | Shared model impact analysis lists affected MA packages and baselines | Service/API test |
| QA-PERM-001 | Model release, 2D-only exception and baseline release use approval action codes, not hard-coded role text | Permission tests |
| QA-MIG-001 | Dry-run classifies clear shared-model and baseline candidates without mutation | Dry-run report |
| QA-MIG-002 | Ambiguous migration candidates require human confirmation and do not mutate product data | Dry-run report |
| QA-UI-001 | Baseline/model UI has no visible `.inline-error`, `[role=alert]` failure, HTTP 4xx/5xx, route error text, overlap or horizontal overflow in required viewports | Browser screenshot and DOM check |

## 5. Required Evidence After Implementation

Minimum command evidence:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:pdm-shared-3d-ma-baseline
npm.cmd run qc:pdm-drawing-revision-package-model
npm.cmd run qc:pdm-change-control
```

Required browser/UI evidence:

- Part/root shared 3D panel showing model version, hash and status.
- MA drawing package reviewer page showing linked shared 3D.
- MA drawing package reviewer page showing `2D-only / no 3D impact` reason and confirmation action.
- Manufacturing baseline page showing shared 3D plus multiple MA package revisions.
- Released baseline page showing immutable state.
- Duplicate 3D hash upload showing reuse guidance.
- Baseline draft page showing resolver output: required MA drawings, optional drawings, missing required packages and non-latest selection reason.

Required UI viewports:

- Desktop: `1440x900`.
- Tablet/default surface: `1024x768`.
- Phone sanity on default surface: `390x844`; no dedicated phone UI is required, but the default surface must not horizontally overflow, overlap critical actions or hide visible blockers.

Visible error hard gate:

- Fail QC if any required page shows `.inline-error`, `[role=alert]` unexpected failure, visible `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, visible `/api/...` route error text, or unexpected all-zero critical counts when fixture data is expected.
- Build, lint or direct API success cannot override a visible UI failure; the visible surface must be rechecked after the fix.

Minimum fixture/data sanity:

- One part/root with one Released shared 3D model.
- At least three MA drawings under the same root, each with a Released package.
- One required MA drawing missing a Released package for negative baseline blocking.
- One duplicate 3D hash upload candidate.
- One older shared model version used by an older baseline for impact analysis.
- One ambiguous migration candidate that dry-run reports without mutation.

Required migration evidence:

- Dry-run report with at least one clear shared model candidate.
- Dry-run report with at least one duplicate-hash candidate.
- Dry-run report with at least one ambiguous owner candidate that is not mutated.

## 6. Stop Conditions

Stop QA/RD and return to PM/user if:

- Implementation needs production deploy, production migration, direct DB mutation, data deletion or historical repair.
- Shared 3D cannot be modeled at part/root level without making a MA drawing the owner.
- Release requires changing part-number identity, drawing-number identity, FFF or BOM rules.
- Existing drawing revision package evidence would be overwritten or lost.
- Baseline release would mutate existing released MA packages.
- Permission model requires reviewer bypass beyond current Admin override policy.

## 7. Regression Coverage

Existing gates that must keep passing:

- `npm.cmd run qc:pdm-drawing-revision-package-model`
- `npm.cmd run qc:pdm-change-control`
- `npm.cmd run qc:pdm-drawing-submission-review-only`
- `npm.cmd run qc:pdm-drawing-submission-workbench-recovery`

Regression expectations:

- Existing first-class drawing revision package behavior remains valid.
- Approved supplements still display as `補件`.
- Missing optional PDF/DWG/3D inside a drawing revision package remains warning-only, but missing shared model link for MA release is a separate blocker unless 2D-only exception is reviewed.
- Out-of-order drawing revision approval remains allowed.
- Duplicate formal same drawing + same revision remains blocked.
