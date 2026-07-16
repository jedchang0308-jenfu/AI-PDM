# DEV-046 Employee Login Alias Local Slice RD Report

Date: 2026-07-13
Scope: local schema, BFF, UI and security controls only
Result: implemented; live staging remains `blocked_external`

## Delivered

- Added company-scoped `employee_login_aliases`, token-hash-only `employee_login_intents` and database-shared `employee_login_rate_limits` to canonical SQLite, PostgreSQL and Supabase migration artifacts.
- Added Admin-only alias create/retire operations with company scope, reason, audit attribution and optimistic row version. Retired aliases are retained and cannot be silently overwritten.
- Added same-origin `POST /api/auth/employee-login-intents`. Unknown and valid identifiers return the same public challenge shape; identifier and client buckets block the sixth attempt.
- Added Firebase BFF session exchange with optional login intent. Session issuance occurs only after verified Firebase UID resolves to the same active PDM user and company; intent is five-minute, single-use and replay-safe.
- Added login UI for company email or employee number and `/settings/accounts` controls for alias search, create and retire. Alias login never asks AI_PDM for an application-owned password.
- Added production-slice allowlist entries only for the public intent/session routes and Admin alias mutation routes. Other unavailable product paths remain fail closed.
- Added app icon and corrected the existing mobile navigation flex behavior found during browser QC.

## Data And Security Boundary

- Alias normalization allows uppercase alphanumeric characters plus `.`, `_` and `-`, length 2-32.
- The database stores only the SHA-256 intent token hash; raw intent is returned once to the same-origin client and expires within five minutes.
- Alias is routing metadata, not an authentication factor, role or permission source.
- AI_PDM stores no password, password hash, MFA secret, recovery code or provider refresh token for this flow.
- Public responses do not expose mapped email, PDM user ID, company ID or alias existence.
- PostgreSQL tables force RLS and revoke `PUBLIC`, `anon` and `authenticated`; application access remains server-side.

## Verification

| Evidence | Result |
|---|---|
| `npm run qc:dev-046-login-alias` | PASS, 21/21 |
| `npm exec tsc -- --noEmit --pretty false` | PASS |
| `npm run lint` | PASS, zero errors; three pre-existing warnings in `master-attachment-panel.tsx` |
| Isolated `next build` with Next.js 16.2.6 | PASS, 114 static pages and all dynamic routes collected |
| `npm run qc:dev-046-phase2a` | PASS, 20/20 |
| `npm run qc:dev-046-phase2b` | PASS, 14/14 |
| `npm run qc:supabase-runtime-migrations` | PASS, 52/52 |
| `npm run qc:postgres-shadow` | PASS, 26/26 static/shadow contract; no disposable live PostgreSQL target was configured |
| `npm run qc:pdm-account-lifecycle` | PASS, 26/26 |
| Additive local `db:init` | PASS |
| Desktop/mobile Playwright UI and console QC | PASS, no document horizontal overflow and zero final console errors/warnings |

Browser evidence:

- `output/playwright/dev-046-employee-alias-login-desktop.png`
- `output/playwright/dev-046-employee-alias-login-mobile.png`
- `output/playwright/dev-046-employee-alias-admin-desktop.png`
- `output/playwright/dev-046-employee-alias-admin-mobile.png`

## Not Executed

No Google credential was read. No Firebase project/provider, Cloud SQL instance, billable resource, DNS, Terraform credentialled plan/apply/import, live migration, real Google/non-Google principal, email delivery, TOTP enrollment, staging deployment, production deployment or ProJED change was executed.

## Next Gate

The alias implementation blocker is closed. DEV-046 Phase 2B still has 14 machine-readable external/live blockers. Before staging acceptance, apply the additive migration to isolated Cloud SQL and repeat provider-backed Google/non-Google, UID/company, retirement, replay and cross-instance rate-limit tests with redacted evidence. Privacy acknowledgement UI, payment/change/state/provider/secret and runtime evidence remain independent gates.
