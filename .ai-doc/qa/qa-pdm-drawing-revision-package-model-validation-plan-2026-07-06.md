# QA-PDM-DRAWING-REVISION-PACKAGE-MODEL - 一階版次附件包模型驗證計畫

Status: QA Plan Ready / Focused QC Passed Locally
Date: 2026-07-06
Owner: Dev PM / QA
Related DEV: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`

## 1. Purpose

Validate that drawing revision attachments are controlled by a first-class package model with package identity, Released-core immutability and approved supplement tracking.

The user-facing target is:

```text
這一版有哪些正式檔案？哪些是補件？補件為什麼加？誰核准？
```

## 2. Scope

In scope:

- First-class revision package identity and packageId APIs.
- Package file membership with role/category.
- One effective Released package per drawing + revision.
- Released core immutability.
- Supplement request, reason menu, review, approval and rejection.
- Supplement approval by current system reviewer/supervisor or Admin.
- `內容有變更，建立新版次` warning without hard block.
- Approved supplement display in the same attachment list with `補件` tag/icon.
- Migration dry-run from existing submission snapshots and file assets.
- Ambiguous migration report in IDE/Codex, not a product `待確認附件` area.

Out of scope:

- Production deployment.
- Production migration or direct data repair.
- CAD/OCR/SolidWorks extraction.
- FFF, part/BOM or drawing-number business rule changes.
- Dedicated mobile-phone UI.

## 3. FMEA

| Failure mode | User impact | Priority | Control |
|---|---|---|---|
| Package remains snapshot-only | Cannot reliably supplement, audit or query package | P0 | QA-PKG-001, QA-PKG-002 |
| Duplicate Released package for same drawing + revision | Two official evidences for one revision | P0 | QA-PKG-003 |
| Released core can be edited | Formal evidence can be changed after approval | P0 | QA-PKG-004 |
| Supplement bypasses approval | Unreviewed file becomes formal evidence | P0 | QA-SUP-002 |
| Supplement hidden from main list | Operator misses a valid file | P1 | QA-SUP-004 |
| Content-change supplement lacks warning | User uses supplement path for real revision change without awareness | P1 | QA-SUP-003 |
| Other reason has no note | Audit cannot explain supplement | P1 | QA-SUP-001 |
| Migration creates product ambiguity area | UI becomes more complex than user accepted | P2 | QA-MIG-003 |

## 4. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| QA-PKG-001 | Creating a draft revision package returns a stable `packageId` | API/service test |
| QA-PKG-002 | Submitting/releasing uses `packageId`, not only `selectedAttachmentIds` | API/service/static evidence |
| QA-PKG-003 | A second effective Released package for same drawing + revision is blocked | Negative API/service test |
| QA-PKG-004 | Released core package file/role edit attempt is blocked | Negative API/UI test |
| QA-PKG-005 | Latest/history computation still uses revision comparison across Released packages | Regression test |
| QA-SUP-001 | `其他` reason requires note; other reasons allow optional note | UI/API validation |
| QA-SUP-002 | Pending supplement is not formal evidence until approved | UI/API state evidence |
| QA-SUP-003 | `內容有變更，建立新版次` shows `應建立新版次` warning but does not block request | UI screenshot + submit evidence |
| QA-SUP-004 | Approved supplement appears in the same package attachment list with `補件` tag/icon | Browser screenshot / DOM check |
| QA-SUP-005 | Supplement decision records applicant, reviewer/Admin, timestamps and reason | DB/API evidence |
| QA-PERM-001 | Only current reviewer/supervisor or Admin can approve supplement | Permission negative/positive tests |
| QA-PERM-002 | Applicant cannot self-approve unless Admin override policy is explicitly applied and audited | Permission negative/positive tests |
| QA-MIG-001 | Released submission snapshot can dry-run into one Released package and package files | Migration dry-run report |
| QA-MIG-002 | Ambiguous legacy files are reported in IDE/Codex dry-run output | Dry-run report |
| QA-MIG-003 | No product `待確認附件` UI is introduced by migration ambiguity | Static/UI check |

## 5. Required Evidence

Minimum command evidence after implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-drawing-revision-package-model
```

Current local evidence:

- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run qc:pdm-drawing-revision-package-model` passed 59/59.
- `npm.cmd run qc:pdm-change-control` passed 61/61.
- `npm.cmd run db:init` initialized the local SQLite schema.

Browser evidence:

- Package detail/main attachment list with normal package files.
- Approved supplement file in the same list with `補件` tag/icon.
- Supplement request form with reason menu.
- `內容有變更，建立新版次` warning.
- Supplement reviewer approve/reject surface.

Migration evidence:

- Dry-run creates package candidates from existing Released submission snapshots.
- Dry-run reports ambiguous records without applying mutation.
- No product `待確認附件` area appears.

## 6. Stop Conditions

Stop and return to PM/user if:

- Production migration or direct production repair is needed.
- Historical data cannot be dry-run classified without product UI changes.
- Implementation requires changing FFF/part/BOM rules.
- Supplement approval cannot reuse current reviewer/Admin permission model.
- Released core immutability cannot be enforced.
