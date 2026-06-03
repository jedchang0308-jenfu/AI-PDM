# QA Validation Plan: PDM Numbering API Regression

Scope: HTTP-level API coverage for numbering allocation, duplicate check, same-drawing variant linking, search/detail audit trail, MA drawing impact, import staging/confirm, admin matrix, and monthly audit report metadata.

## Validation Scope

- Verify authenticated Admin can allocate numbering records through `/api/numbering/records`.
- Verify duplicate check detects exact reused root, part number, and drawing number.
- Verify same MA drawing can link to multiple part numbers only with variant fields.
- Verify search and root detail APIs return created data and audit trail envelope.
- Verify MA drawing invalidation API applies impact to linked part numbers.
- Verify import staging and confirm APIs do not directly pollute master data before confirmation and do create records after confirmation.
- Verify admin matrix API exposes roles, approval rules, templates, and hard rules.
- Verify monthly audit report API generates and lists metadata.

## User-Critical Flow

1. Admin logs in and calls numbering APIs through the same session cookie used by the UI.
2. RD numbering allocation produces a root, part number, and MA drawing.
3. Duplicate checks warn/block before reuse.
4. Multi-part same-drawing data stays traceable through variants and root detail.
5. MA invalidation shows affected part numbers and applies status change only when requested.
6. Existing master-sheet import stays staged until Admin confirms.
7. Admin matrix and monthly report APIs remain readable for governance and audit.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| API auth not enforced consistently | Route misses guard or cookie handling breaks | Unauthorized users could mutate numbering data | HTTP login and API calls | High | Call guarded APIs with Admin cookie and assert expected status |
| Allocation API does not return full numbering set | Repository/API DTO mismatch | RD cannot fill CAD title block after reserving number | Records API test | High | Assert root, part, and drawing are returned |
| Duplicate check misses exact conflict | Query normalization mismatch |撞號風險 | Duplicate check API test | High | Query created root/part/drawing and expect `blocked = true` |
| Variant link accepts ambiguous MA reuse | Missing required variant detail | Same drawing multi-part difference becomes unclear | Variants API test | High | Seed second part and link with variant fields |
| Audit trail lacks envelope | Detail API does not expose normalized audit | Managers cannot inspect before/after/diff | Root detail API test | High | Assert `before`, `after`, `diff` keys on audit trail |
| MA invalidation does not propagate | Impact API updates drawing only | Downstream files/BOM remain falsely valid | Impact API test | High | Assert linked parts are impacted |
| Import confirm skips staging control | POST confirm creates wrong state | Legacy master list import can pollute data | Import API test | High | Stage valid row, then confirm and verify created summary |
| Matrix/report endpoints regress | Refactor breaks governance views | Admin cannot audit rules/reports | Admin matrix/report API tests | Medium | Assert roles/rules/templates/hardRules and report metadata |

## Test Cases

- `TC-API-001`: Admin login returns HTTP 200 and session cookie.
- `TC-API-002`: `POST /api/numbering/records` returns root, part, and MA drawing.
- `TC-API-003`: `POST /api/numbering/duplicate-check` blocks exact reused numbering.
- `TC-API-004`: `POST /api/numbering/variants` links a second part to the same MA drawing with variant fields.
- `TC-API-005`: `GET /api/numbering/search` returns the allocated root.
- `TC-API-006`: `GET /api/numbering/roots/{rootCode}` returns variant data and audit trail envelope.
- `TC-API-007`: `POST /api/numbering/impact-analysis` with `applyInvalidation = true` impacts linked parts.
- `TC-API-008`: `POST /api/numbering/import-batches` stages a valid row.
- `TC-API-009`: `POST /api/numbering/import-batches/{batchId}/confirm` promotes valid staging data.
- `TC-API-010`: `GET /api/numbering/admin/matrix` returns roles, rules, templates, and hard rules.
- `TC-API-011`: `POST` and `GET /api/numbering/monthly-audit-reports` generate and list report metadata.
- `TC-API-012`: TypeScript, lint, build, and core QC remain green.

## Data Requirements

- Demo Admin account `admin@example.com`.
- Unique `QC API` root/part/drawing data created during the test.
- One seeded second part number under the allocated root to exercise same-drawing variant API.
- One unique import root row staged through the import API.
- One temporary monthly report row.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-api-regression` passes with all HTTP checks.
- `npm.cmd run qc:pdm-numbering-core` passes and exposes the new API regression script.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.

## Evidence To Collect

- API regression JSON pass count and route-level status checks.
- Core QC pass count.
- TypeScript, lint, and build exit codes.
- Any non-fatal build warnings.
