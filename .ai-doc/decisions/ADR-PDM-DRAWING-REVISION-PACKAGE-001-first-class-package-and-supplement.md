# ADR-PDM-DRAWING-REVISION-PACKAGE-001 - 一階版次附件包與補件模型

Status: Accepted / Implemented locally / Production not deployed
Date: 2026-07-06
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
Related DEV: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`

## Context

The current drawing revision flow already supports multi-file `版次檔案包`, warning-only completeness, reviewer warning parity and latest/history grouping. However, the implementation still treats the package primarily as selected attachments copied into a submission plus `snapshot.revisionPackage`.

That is insufficient for PDM control because a revision package must be independently identifiable, immutable after release, supplementable after release, queryable by latest/history consumers, and migratable from old records without creating UI confusion.

## Decision

Adopt a first-class drawing revision package model:

1. Every controlled drawing revision package has a stable `packageId`.
2. Same `company + drawing number + revision` may have working attempts, but only one effective Released package.
3. Released package core evidence is immutable.
4. Package files are explicit membership records with role/category and source traceability.
5. Late files are modeled as supplement records under the Released package, not as edits to the Released core package.
6. Supplements require reason selection and approval before becoming formal supplemental evidence.
7. Approved supplements display in the same main attachment list as package files, but with `補件` icon/tag.
8. Supplement reasons use the confirmed menu:
   - `補交格式檔`
   - `補交輔助資料`
   - `修正附件資訊`
   - `內容有變更，建立新版次`
   - `其他`
9. `其他` requires a note.
10. `內容有變更，建立新版次` shows `應建立新版次` but does not hard-block supplement request.
11. Supplement reviewers are the current system reviewer/supervisor resolved by existing review rules plus Admin.
12. Existing ambiguous legacy records are handled in migration dry-run output for IDE/Codex confirmation, not by adding a product `待確認附件` area.
13. Supplement files appear in the same operational attachment list as the owning package after approval, but their supplement source, reason and approval record remain independently traceable.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Keep snapshot-only package model | Rejected | It cannot naturally support packageId, post-release supplement approval, independent package queries or clean migration. |
| Edit Released package in place when supplementing files | Rejected | It weakens formal release evidence and audit trust. |
| Always create a new drawing revision for any late file | Rejected | Too heavy for format files, generated files and auxiliary reference materials. |
| Add supplements as child records under Released package | Accepted | Keeps Released core immutable while supporting real downstream supplement needs. |
| Hide supplements in history only | Rejected | Operators need to see all approved files for the version in one list. |
| Show supplements in main list with tag/icon | Accepted | Fast for users and traceable for audit. |
| Create product `待確認附件` area for migration ambiguity | Rejected | User explicitly wants ambiguity handled in IDE/Codex confirmation, not as UI clutter. |

## Consequences

Positive:

- Formal package identity is explicit and stable.
- Released evidence remains immutable.
- Late requested files have a controlled and auditable path.
- UI can show one practical attachment list without losing supplement provenance.
- Migration can classify clear records and isolate ambiguous cases without confusing normal users.

Costs / tradeoffs:

- Requires additive schema and repository/service work.
- Requires local migration and dry-run tooling before production planning.
- Requires packageId integration across revision workbench, review page, dashboard drawer and master attachment panel.
- Requires supplement approval UI and permission checks.

## Migration / Compatibility Impact

- Existing submissions and snapshots remain valid.
- Existing `snapshot.revisionPackage` becomes seed data for package creation.
- Existing `submission_files.source_master_attachment_id` remains useful for package file traceability.
- Existing attachment library remains source/staging file owner.
- Production migration is not authorized by this ADR.
- Direct deletion, silent reassignment or direct production repair is not authorized.
- Local implementation has been executed for the SQLite/Next.js runtime. Production migration, production deploy and historical repair remain separately unauthorized.

## Superseded / Amended Documents

This ADR amends:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

Specific amendment:

- Submission snapshot remains required review evidence, but it is no longer sufficient as the long-term package model.
- First-class package tables/services are now the target architecture for revision package identity, files and supplements.

## Enforcement

RD must not mark implementation complete until:

- `packageId` exists and governs package operations.
- Same drawing + same revision duplicate Released package is blocked.
- Released core package files and roles cannot be edited in place.
- Supplement request records preserve reason, applicant, decision and file roles.
- Supplement approval is limited to current reviewer/supervisor and Admin.
- Approved supplements appear in the main package attachment list with `補件` tag/icon.
- `內容有變更，建立新版次` shows a clear warning but does not hard-block.
- Migration dry-run reports ambiguous records without creating a product `待確認附件` UI.
