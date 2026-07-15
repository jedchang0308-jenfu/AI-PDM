# DEV-046 Employee Login Alias Local Slice QC Report

Date: 2026-07-13
Boundary: local implementation and negative security verification
Verdict: PASS locally; BLOCKED for live staging

## Findings

No P0 or P1 defect remains in the executed local slice.

The focused suite passed 21/21 and verifies:

- canonical/PostgreSQL/Supabase schema coverage, forced RLS and Data API role revocation;
- no application credential, MFA or recovery material in the alias schema;
- normalization, same-company collision prevention and cross-company isolation;
- Admin mutation scope, audit reason and optimistic-lock retirement;
- five-minute token-hash-only intent, non-enumerating unknown response and single use;
- verified UID/PDM user/company match before consumption and session issuance;
- replay, retired alias and pending-intent-after-retirement denial;
- database-persisted sixth-attempt blocking for shared rate-limit buckets;
- account search/detail and login/account-management UI controls;
- same-origin session ordering and absence of mapped identity fields in public responses;
- production-slice access limited to the required public auth and Admin mutation endpoints.

## Regression Evidence

| Check | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS, zero errors; three unrelated pre-existing warnings |
| Next.js production build | PASS |
| DEV-046 Phase 2A | PASS, 20/20 |
| DEV-046 Phase 2B | PASS, 14/14 |
| Supabase runtime migration contract | PASS, 52/52 |
| PostgreSQL shadow/static contract | PASS, 26/26; no live disposable PostgreSQL target configured |
| Account lifecycle regression | PASS, 26/26 |
| Desktop/mobile browser QC | PASS; zero final console errors/warnings |

## Residual Risk And Required Staging Tests

- SQLite/local execution does not prove Cloud SQL privileges, migration locks, latency or connection behavior.
- The shared rate limiter is transactionally tested in one database process; cross-instance Cloud Run behavior needs isolated Cloud SQL staging evidence.
- Dummy Firebase UI configuration proves rendering and local BFF boundaries, not real Google/non-Google provider authentication, TOTP or token revocation.
- Supabase migration files are compatibility artifacts only. Cloud SQL remains the production database authority and no Supabase live migration was applied.
- The existing mobile account table uses intentional horizontal scrolling; browser QC found no document-level overlap or overflow.

## Decision

Close `EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED`. Keep DEV-046 Phase 2B as `blocked_external` with 14 remaining live gates. Do not grant staging, deployment, production or internal-user readiness credit from this report.
