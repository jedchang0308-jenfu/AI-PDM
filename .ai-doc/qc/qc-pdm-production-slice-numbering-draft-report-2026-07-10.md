# QC-PDM-PRODUCTION-SLICE-001 - Local verification report

Date: 2026-07-10
Related DEV: `DEV-PDM-PRODUCTION-SLICE-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`
Related QA: `.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md`
Status: Local Phase 1 verification passed; production release not executed

## Scope Verified

- Production-slice capability helper, method-level write allowlist and default-deny behavior.
- Server route gate for unopened pages and unopened write APIs.
- Client-visible roadmap navigation with `未開放` badge and blocked-page routing.
- `/numbering/part-drafts` production-slice UI behavior: active draft create/edit/void/recycle, inert `submit-review` / `reconfirm` / `restore`.
- Direct API denial for closed part-draft formal workflow routes.
- Existing provisional part-number draft recycle boundary remains tied to existing controlled-boundary predicate.
- Official numbering, append, duplicate-submit, sequence, search/list/detail, relation view and access-control regressions.

## Evidence

| Evidence | Result | Notes |
|---|---:|---|
| `npm.cmd run qc:pdm-production-slice-numbering-draft` | 27/27 PASS | Focused static/product-slice contract QC |
| `npx.cmd tsc --noEmit --pretty false` | PASS | Type check |
| `npm.cmd run lint -- --quiet` | PASS | No lint errors in quiet mode |
| `npm.cmd run qc:pdm-numbering-core` | 241/241 PASS | Numbering core regression |
| `npm.cmd run qc:pdm-numbering-duplicate-submit-guard` | 10/10 PASS | QC fixture updated for current request-page state model |
| `npm.cmd run qc:pdm-numbering-sequence-integrity` | 3/3 PASS | Read-only runtime report; see residual note |
| `npm.cmd run build` | PASS | Next 16 reports middleware convention deprecation warning |
| Production-slice runtime smoke on transient port `3211` | PASS | Status API active, unopened write blocked, allowed numbering create not slice-blocked, unopened URL renders blocked page |
| `npm.cmd run qc:pdm-numbering-api-regression` on disposable DB | 27/27 PASS | Evidence dir `.tmp/dev040-regression-20260710025832` |
| `npm.cmd run qc:pdm-numbering-draft-lifecycle` on disposable DB | 29/29 PASS | Evidence dir `.tmp/dev040-regression-20260710025832` |
| `npm.cmd run qc:pdm-numbering-contextual-entrypoints` | 46/46 PASS | Static/contextual entrypoint regression |
| `npm.cmd run qc:pdm-numbering-gap-reuse` | 8/8 PASS | Gap reuse contract and read-only runtime evidence |
| `npm.cmd run qc:pdm-numbering-request-ui` on disposable DB | 71/71 PASS | Evidence dir `.tmp/dev040-ui-20260710030347` |
| `npm.cmd run qc:pdm-numbering-search-ui` on disposable DB | 30/30 PASS | Evidence dir `.tmp/dev040-ui-20260710030347` |
| `npm.cmd run qc:pdm-drawing-part-relation-view` on disposable DB | 62/62 PASS | Evidence dir `.tmp/dev040-ui-20260710030347` |
| `npm.cmd run qc:pdm-access-control-governance` on disposable DB | 93/93 PASS | Evidence dir `.tmp/dev040-ui-20260710030347` |

## QC Fixture Repairs

- `scripts/qc-pdm-numbering-api-regression.mjs` now derives the next part identity from v1, v2 or v3 part-number format instead of hard-coding `P02` / `002`.
- `scripts/qc-pdm-numbering-request-ui.mjs` now targets the `基本資料` panel and labeled inputs instead of relying on `section.panel.first()` and positional input selectors; its drawing-number result assertion accepts current v3 identities such as `A0001-M01`.

## Residual Notes

- `npm.cmd run qc:pdm-numbering-sequence-integrity` passed its read-only checks, but the protected local runtime report was not fully clean: retained roots `0`, audit-created roots `8`, purged test roots `53`, missing audit roots from master `6`. No repair was executed in this DEV-040 work because direct runtime data repair is outside the production-slice scope and remains gated.
- Next 16 build prints `middleware` convention deprecation advice. The current build passes and recognizes the route gate, but a future maintenance task should migrate `src/middleware.ts` to the current Next proxy convention before a production release if the project standard requires zero framework deprecation warnings.

## Not Executed

- No production deploy.
- No production smoke.
- No Supabase provider pointer switch.
- No live Supabase migration or direct DB repair.
- No merge, PR, rollback or release report.
