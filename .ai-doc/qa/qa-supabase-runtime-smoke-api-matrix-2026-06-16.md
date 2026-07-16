# QA Supabase Runtime Smoke API Matrix

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / QA local evidence
Status: Matrix only; GATE-B execution not performed

## 1. Purpose

This matrix fixes the app API calls that must be recorded during the approved `AI_PDM_STAGING` runtime smoke.

It is a local-only planning artifact. It does not approve runtime smoke, provider switching, Supabase connector operations, production cutover, cost-incurring actions, or data migration.

## 2. Execution Boundary

The approved smoke must use server-side AI_PDM app APIs only.

Allowed:

- A fresh app process started with approved server-side `PDM_DB_PROVIDER=postgres` and `PDM_POSTGRES_URL`.
- Non-production numbering smoke records only.
- Unique smoke prefix: `AI_PDM_GB_SMOKE_<YYYYMMDDHHmm>_<operator>`.
- Admin test session or equivalent approved role with numbering permissions.
- Redacted status, response shape, created IDs, cleanup result, and rollback proof.
- Auth/session boundary from [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md), validated with `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary`.

Not allowed:

- Browser-side direct Supabase Data API access to base tables.
- Supabase anon, publishable, service role, or secret key use from browser code.
- Production customer data.
- CAD files, release packages, handoff packages, field-test artifacts, QC artifacts, or file blobs.
- Repository commits containing secrets, connection strings, or unredacted target details.

## 3. Smoke API Matrix

Fill `Observed evidence` only after PM approval and server-side staging credentials exist.

| Step | Method | App API | Request body template | Expected evidence | Cleanup / residue |
|---|---|---|---|---|---|
| `auth_login_and_me` | `POST` / `GET` | `/api/auth/login`, then `/api/auth/me` | approved Admin test account or PM-approved app session | Login status, `pdm_session` cookie-name-only evidence, `/api/auth/me` compact user role, no cookie/token/password values | logout required after smoke |
| `read_path_admin_matrix` | `GET` | `/api/numbering/admin/matrix` | none | HTTP status, authenticated role, compact response keys: `roles`, `rolePermissions`, `approvalRules`, `approvalDelegations` | no write |
| `read_path_rule_simulator` | `POST` | `/api/numbering/rule-simulator` | `{"actionCode":"numbering.create","phase":"EVT","recordStatus":"Draft","itemKind":"manufactured","riskFlags":[]}` | HTTP status and compact rule-evaluation shape; no production data | no write |
| `pre_write_duplicate_guard` | `POST` | `/api/numbering/duplicate-check` | `{"coreName":"AI_PDM_GB_SMOKE_<run>","partName":"AI_PDM_GB_SMOKE_<run> Part"}` | HTTP status and compact duplicate-check result before write | no write |
| `write_path_numbering_smoke_record` | `POST` | `/api/numbering/records` | `{"coreName":"AI_PDM_GB_SMOKE_<run>","partName":"AI_PDM_GB_SMOKE_<run> Part","itemKind":"manufactured","developmentPhase":"EVT","drawingRequested":false}` | HTTP `201`; created `root.rootCode`, `root.recordStatus`, `partNumber.partNumber`, and created IDs recorded | must be cleaned or retained with owner and expiry |
| `readback_created_record` | `GET` | `/api/numbering/roots/<rootCode>` | none | HTTP status and compact detail shape proves the created root can be read back through app API | no write |
| `cleanup_smoke_record` | `POST` | `/api/numbering/records/<rootCode>/obsolete` | `{"reason":"GATE-B smoke cleanup AI_PDM_GB_SMOKE_<run>"}` | HTTP status and compact response showing smoke root/parts/drawings are `Obsolete`, or blocked/fail reason recorded | soft cleanup only; if obsolete is not possible, retain with owner, expiry, and reason |

## 4. Route Source Evidence

The matrix is tied to these route handlers:

- `src/app/api/numbering/admin/matrix/route.ts`
- `src/app/api/numbering/rule-simulator/route.ts`
- `src/app/api/numbering/duplicate-check/route.ts`
- `src/app/api/numbering/records/route.ts`
- `src/app/api/numbering/roots/[rootCode]/route.ts`
- `src/app/api/numbering/records/[rootCode]/obsolete/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/logout/route.ts`

Static requirement:

- None of the route handlers above may import `@/lib/db` directly.
- They must go through the server-side async provider path.
- The matrix must not use Supabase Data API, GraphQL API, or browser-side direct table access.

## 5. Evidence To Record During Approved Execution

Record the following in the runtime smoke report:

- Approval source and timestamp.
- Target identity receipt.
- Runtime process startup command and port.
- Redacted env names only.
- Auth/session evidence from the approved boundary: cookie name `pdm_session`, login/me/logout status, role, and no cookie/token/password values.
- Authenticated smoke role.
- Each API status code.
- Compact response shape, not full payload dumps with secrets or large data.
- Smoke prefix.
- Created `rootCode`, part number, and IDs.
- Cleanup or retained-residue result.
- Rollback proof.

## 6. No-Go Conditions

Stop and record final disposition `blocked` or `fail` if:

- PM approval is missing.
- `PDM_SUPABASE_TARGET_NAME` is not `AI_PDM_STAGING`.
- The app API process is not running with approved server-side Postgres env.
- Any endpoint requires production data.
- Any endpoint requires direct browser-side Supabase Data API access.
- Cleanup cannot obsolete the smoke record and no retained-residue owner/expiry is accepted.
- Any secret, connection string, service role key, database password, or unredacted project reference would be written to the repository.
