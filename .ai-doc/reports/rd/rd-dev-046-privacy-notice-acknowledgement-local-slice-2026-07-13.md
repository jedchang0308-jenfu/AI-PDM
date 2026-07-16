# DEV-046 employee privacy notice acknowledgement local slice RD report

Date: 2026-07-13
Scope: local application, schema/migration artifact and UI only
Result: implemented and locally verified
Live state: `blocked_external`; no employee acknowledgement or staging-effective timestamp exists

## Delivered

- Defined Pilot v1.0 canonical content and SHA-256 `94eccfc2b519db02e410c9fa057f582fae2f057eb03ce37cf0a77df4697b0d6d`.
- Added immutable, company-scoped notice versions and acknowledgement evidence to SQLite and provider-neutral PostgreSQL migration `015` with forced RLS and denied browser roles.
- Added fail-closed first Firebase BFF session handling: only a short-lived pending HttpOnly cookie is issued until the current version is acknowledged.
- Added exact-version, same-origin acknowledgement API and protected BFF recheck. Acknowledgement, canonical invitation acceptance and Firebase invitation activation commit atomically.
- Added `/privacy`, `/privacy/acknowledgement`, first-activation summary/checkbox, login/sidebar discovery and read-only Admin evidence in `/settings/accounts`.
- Corrected the mobile acknowledgement grid's percentage/min-content shrink behavior; the panel now spans the available 390px layout width and all long labels use bounded wrapping.
- Kept passwords, tokens, MFA data and browser fingerprint outside acknowledgement evidence.

## Verification

| Evidence | Result |
|---|---|
| `npm run qc:dev-046-privacy-ack` | PASS, 20/20 |
| `npm run qc:supabase-runtime-migrations` | PASS, 56/56 |
| `npm run qc:dev-046-phase2a` | PASS, 20/20 |
| `npm run qc:dev-046-phase2b` | PASS, 14/14 |
| `npm run qc:pdm-account-lifecycle` | PASS, 26/26 |
| Source-only `tsc --noEmit` excluding active `.next/dev` validator | PASS |
| DEV-046 source-scoped ESLint | PASS, zero errors |
| Isolated Next.js 16.2.6 production build | PASS; compile, TypeScript, 118 static pages and route generation completed |
| Browser QC, 1440/390 | PASS; no overflow/cutoff/uncaught JS error; unchecked gate disabled and checked gate enabled; expired-session 401 is visibly handled |
| `npm run preflight:dev-046-phase2b` | PASS, 19/19 local; `blocked_external`; 13 external/live blockers |

The first workspace-wide `tsc` attempt observed transient concurrent DEV-048 source errors and stale `.next/dev` route types. No DEV-048 file was changed by this slice. After the concurrent source edits settled, source-only TypeScript passed; the remaining direct-workspace error was confined to the active dev server's generated `.next/dev/types/validator.ts`. The isolated production build completed Next's TypeScript phase successfully.

## Not executed

No cloud credential, Firebase project/provider/user, Cloud SQL target, live migration, Terraform plan/apply/import, billing/resource/DNS action, email/TOTP flow, employee acknowledgement, staging deployment, production release or ProJED change was performed.

## Live continuation

Apply migration `015` only through the approved Cloud SQL migration gate, publish the actual staging opening timestamp, and verify one Google plus one controlled non-Google first-activation/re-ack flow. Until those checks pass, employee activation and staging acceptance remain closed.
