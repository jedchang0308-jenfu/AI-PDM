# QA Supabase Runtime Smoke Auth Session Boundary

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / QA local evidence
Status: Boundary only; GATE-B execution not performed

## 1. Purpose

This document fixes the authentication and session handling rules for the approved `AI_PDM_STAGING` GATE-B app API smoke.

It is a local-only planning artifact. It does not approve runtime smoke, provider switching, Supabase connector operations, Supabase Auth setup, production cutover, cost-incurring actions, or data migration.

## 2. Current App Auth Facts

The current AI_PDM app smoke must use the app's own server-side session boundary:

- `POST /api/auth/login` creates an AI_PDM app session.
- `GET /api/auth/me` verifies the session user.
- `POST /api/auth/logout` clears the app session.
- The app session cookie name is `pdm_session`.
- The cookie value, `set-cookie` value, password, bearer token, database URL, auth secret, and target credentials must never be written into repository files or reports.
- Authenticated app API requests must be made through the AI_PDM app server, not through browser-side direct Supabase Data API, GraphQL API, or Supabase client table access.

Allowed session evidence:

- Cookie name: `pdm_session`.
- Whether the cookie was set or cleared.
- Login route status code.
- `/api/auth/me` status code and compact user shape: `id`, `email` redaction policy, `role`.
- Logout route status code.
- Smoke operator identity as a human-readable owner, not a token value.

Not allowed session evidence:

- `pdm_session=<value>`.
- Full `set-cookie` header values.
- Passwords.
- `Authorization: Bearer <value>`.
- Supabase anon, publishable, service role, or secret key values.
- `PDM_AUTH_SECRET`, `PDM_POSTGRES_URL`, `PDM_POSTGRES_SHADOW_URL`, or any connection string.

## 3. Approved Smoke Auth Method

Before the approved smoke API sequence, the operator must establish an approved Admin test session through one of these methods:

| Method | Status | Evidence allowed |
|---|---|---|
| `POST /api/auth/login` with approved Admin test account | Preferred | Status code, redacted account label, cookie name set, `/api/auth/me` role |
| Pre-approved external app session | Allowed only if PM explicitly approves | Approval source, operator, role, cookie name present; no token or cookie value |
| `GET /api/auth/login?account=admin` demo shortcut | Allowed only if `PDM_AUTH_MODE=demo` is explicitly approved for the smoke process | Status code, cookie name set, `/api/auth/me` role |
| Bearer token fallback supported by code | Not allowed for GATE-B unless PM explicitly approves | Header name only; token value never recorded |

The preferred GATE-B route is a normal app session using `POST /api/auth/login`. If staging cannot use that login route, the report must mark the auth setup as `blocked` unless PM approves an equivalent app session source.

## 4. Required Role And Permissions

The smoke user must be `Admin` or an explicitly approved equivalent role that can satisfy every app route permission below.

Exact permissions required by the GATE-B smoke matrix:

| Smoke step | App API | Required app auth / permission |
|---|---|---|
| `read_path_admin_matrix` | `GET /api/numbering/admin/matrix` | `settings.admin_matrix` page permission and `Admin` role |
| `read_path_rule_simulator` | `POST /api/numbering/rule-simulator` | `settings.admin_matrix` action permission |
| `pre_write_duplicate_guard` | `POST /api/numbering/duplicate-check` | `numbering.duplicate_check` action permission |
| `write_path_numbering_smoke_record` | `POST /api/numbering/records` | `numbering.create` action permission |
| `readback_created_record` | `GET /api/numbering/roots/<rootCode>` | `numbering.search` page permission |
| `cleanup_smoke_record` | `POST /api/numbering/records/<rootCode>/obsolete` | `numbering.draft.obsolete` action permission |

If any endpoint returns `401` or `403`, stop the smoke and record final disposition `blocked` or `fail`. Do not work around authorization by direct database access, Supabase service role keys, browser-side Data API calls, or manual row edits.

## 5. Auth Evidence Sequence

Fill this sequence only after PM approval and server-side staging credentials exist.

| Step | Required evidence | Secret boundary |
|---|---|---|
| `auth_precheck_no_session` | Optional `/api/auth/me` returns `401` or known existing approved session is declared | Do not record cookie value |
| `auth_login` | Login route status, approved account label, cookie name `pdm_session` set | Do not record password or `set-cookie` value |
| `auth_me_confirm` | `/api/auth/me` returns compact user shape and role | Redact email if it identifies a real person; record demo/test labels only |
| `permission_probe` | First protected smoke API confirms role/permission boundary through app API | Do not use direct DB or Supabase Data API |
| `auth_logout` | Logout route status and cookie name cleared after cleanup / rollback evidence | Do not record cookie value |

## 6. Supabase-Specific Guardrails

Current official Supabase guidance affects this boundary:

- RLS controls row access after an API/table is reachable; Data API exposure and role grants are separate concerns.
- Service role and secret keys are backend-only and must never be exposed in public clients or repository evidence.
- If future Supabase Auth or JWT claims are introduced, authorization must not trust user-editable `user_metadata`; use trusted app/server-side authorization data instead.
- Existing GATE-B app smoke remains server-side AI_PDM app API only. It must not use browser-side direct Supabase Data API or GraphQL table access.

References:

- https://supabase.com/changelog
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/secure-data
- https://supabase.com/docs/guides/api/securing-your-api

## 7. No-Go Conditions

Stop and record final disposition `blocked` or `fail` if:

- PM approval is missing.
- `PDM_SUPABASE_TARGET_NAME` is not `AI_PDM_STAGING`.
- Server-side staging credentials are missing.
- The app session cannot be proven through `/api/auth/me`.
- The smoke user is not `Admin` or does not have the required numbering permissions.
- Any endpoint requires direct browser-side Supabase Data API, GraphQL API, service role key, or database connection string.
- Any report would need to store password, cookie value, full `set-cookie` header, bearer token, service role key, `PDM_AUTH_SECRET`, Postgres URL, or unredacted target details.

## 8. Local Verification

This boundary is validated locally by:

```powershell
npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary
```

Expected current result:

- The document is present and marked as not executed.
- Auth routes exist: `login`, `me`, `logout`.
- GATE-B numbering routes use server-side app auth / permission guards.
- Exact required permissions are traceable from route source.
- Linked control documents reference this boundary.
- The QC script is static and local-only.
