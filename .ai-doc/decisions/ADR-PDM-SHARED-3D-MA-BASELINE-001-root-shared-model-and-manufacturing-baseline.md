# ADR-PDM-SHARED-3D-MA-BASELINE-001 - 共用 3D 主檔與 MA 製造基準包

Status: Accepted / Local implementation verified
Date: 2026-07-06
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`
Related DEV: `DEV-PDM-SHARED-3D-MA-BASELINE-001`

## Context

The current PDM drawing revision model can control each MA drawing package independently. That is necessary, but it is not sufficient when one root/part family uses a shared 3D model and multiple MA drawings.

The business risk is not only upload duplication. The larger risk is traceability drift:

- Part/root search shows the current related drawings and files.
- Individual MA packages show each drawing's release evidence.
- Neither one, by itself, freezes the exact manufacturing combination used at a point in time.

The user confirmed that shared 3D should belong at the part/root level, while MA drawings keep separate drawing revision packages.

## Decision

Adopt a part/root shared 3D model plus manufacturing baseline architecture:

1. Shared 3D model versions are owned by the part/root object family, not by the first MA drawing that uploads the file.
2. MA drawing revision packages remain separately versioned and released.
3. Each MA drawing revision package must reference a shared 3D model version or carry a reviewed `2D-only / no 3D impact` exception.
4. Part/root search remains a dynamic navigation function and must not be treated as formal manufacturing evidence.
5. A manufacturing baseline is the formal frozen evidence object. It locks the exact shared 3D model hash/version and the exact MA drawing packages used for manufacturing.
6. Released manufacturing baselines are immutable. Any effective manufacturing-set change requires a new baseline revision.
7. Duplicate 3D content hash detection is a domain-control requirement, not only storage optimization.
8. Shared model impact analysis must show affected MA drawing packages and manufacturing baselines.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Keep 3D under the first MA drawing | Rejected | Makes other MA drawings depend on a hidden owner convention and weakens root/part traceability. |
| Keep only dynamic part/root search | Rejected | Search answers "what is related now"; it cannot prove what was used in a past manufacturing release. |
| Duplicate the same 3D under every MA drawing | Rejected | Creates hash duplicates, unclear authority and unreliable impact analysis. |
| Part/root shared 3D plus frozen manufacturing baseline | Accepted | Separates model authority, MA drawing versioning and manufacturing evidence cleanly. |
| Force a new shared 3D link for every MA release with no exception | Rejected | Pure 2D marking/annotation changes should be allowed when explicitly reasoned and reviewed. |
| Allow reviewed `2D-only / no 3D impact` exception | Accepted | Preserves rigor while matching real manufacturing drawing changes. |

## Chosen Rule

The authoritative object boundaries are:

```text
Part/root search = dynamic navigation
Shared 3D model version = controlled model basis for the part/root family
MA drawing revision package = controlled evidence for one drawing revision
Manufacturing baseline = frozen manufacturing set across shared 3D and MA packages
```

Manufacturing baseline creation must use a resolver that determines required MA drawings for the selected part/root. Users may intentionally exclude or select non-latest MA packages only with explicit reason and review; they cannot silently omit required MA evidence.

## Consequences

Positive:

- Shared 3D ownership matches the product object, not an arbitrary drawing.
- MA drawings can keep independent revisions without losing model basis.
- Manufacturing, QC, service and audit can reconstruct the exact released manufacturing set.
- Duplicate 3D uploads can be prevented or converted into references.
- Model changes can drive impact review instead of relying on manual memory.

Costs / tradeoffs:

- Requires additive schema for model versions, package model links and manufacturing baselines.
- Requires a new baseline resolver and release workflow.
- Requires UI clarity so users distinguish search results from frozen baseline evidence.
- Requires QA/QC for model-link blockers, 2D-only exception review and baseline immutability.

## Migration / Compatibility Impact

- Existing drawing revision packages remain valid.
- Existing package files and `source_file_asset_id` can seed model-link and migration dry-run candidates.
- Existing `file_assets.content_hash` becomes the reuse and model identity control input.
- Current part/root/drawing search stays available and is not replaced by baseline.
- 2026-07-06 local implementation added additive shared 3D model, package model-basis and manufacturing baseline schema/services/APIs plus the part-detail UI slice. Production migration, historical repair, data deletion and silent reassignment are not authorized by this ADR.
- Ambiguous existing 3D ownership must be reported in dry-run output for human confirmation.

## Superseded / Amended Documents

This ADR amends:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`

Specific amendment:

- Drawing package release now has a model-basis requirement for MA packages.
- Part/root attachment ownership must support shared 3D model evidence.
- Manufacturing handoff must eventually be baseline-aware instead of relying only on current search results.

## Enforcement

RD marked local implementation complete after:

- Part/root shared 3D model versions exist with stable id and content hash.
- MA package release blocks missing model link unless a reviewed `2D-only / no 3D impact` exception exists.
- Manufacturing baseline resolver cannot silently omit required MA drawings.
- Released baselines are immutable.
- Duplicate 3D hash upload offers reuse before new source creation.
- Shared model impact analysis lists affected MA packages and baselines.
- QA/QC evidence includes part-detail UI static checks, browser smoke, API/service/schema gates and immutable baseline semantics. Deeper manual APP walkthrough remains recommended before production release.
