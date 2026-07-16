# DEV-046 Phase 2B local Firebase BFF implementation report

Date: 2026-07-13
Scope: local application/IaC readiness and production-image smoke only
Result: implemented and locally QC-accepted
Live state: `blocked_external`; no staging or production resource exists from this work

## Delivered

- Added Firebase Web and Admin SDK adapters for Google Workspace, email/password and TOTP sign-in.
- Added same-origin ID-token exchange into an eight-hour HttpOnly BFF session with issuer/audience validation, current/previous signing-key rotation and lifecycle-version revocation.
- Restricted authorization to active Firebase UID-to-PDM principal mappings. Email/domain matching never grants a PDM principal.
- Added Firebase-managed email-link invitation, password linking, canonical invitation state, provider lifecycle operations and deny-first compensation.
- Closed legacy password/token/OAuth/invitation/recovery routes whenever `PDM_AUTH_MODE=firebase_bff`.
- Added additive SQLite/PostgreSQL invitation schema artifacts and Cloud Run Firebase/session/Secret Manager contracts. Terraform contains no secret values.
- Added Firebase Admin runtime dependency tracing required by the Next.js standalone container.

## Verification

| Evidence | Result |
|---|---|
| `npx tsc --noEmit --pretty false` | PASS |
| `npm run lint` | PASS, zero errors; three pre-existing warnings in `master-attachment-panel.tsx` |
| `npm run qc:dev-046-phase2b` | PASS, 14/14 including invitation success/compensation behavior |
| `npm run qc:dev-046-phase2a` | PASS, 20/20 regression |
| `npm run preflight:dev-046-phase2b` | PASS, local checks 19/19; result `blocked_external`; at that report time, 13 blockers remained after employee-login-alias and privacy local slices closed their implementation blockers |
| Canonical SQLite schema execution | PASS in disposable in-memory database; `firebase_identity_invitations` created |
| Terraform 1.14.5 `fmt` / `init -backend=false` / `validate` | PASS; google provider 7.39.0; no credentials |
| Docker production build | PASS, Next.js 16.2.6 / Node 24.17.0 |
| Container image | `sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3`, 104,661,969 bytes |
| Firebase BFF artifact smoke | mode 200; legacy login 404; missing Origin 403; invalid token 401; oversized body 413; invitation page 200; no module-load error |

## Residual risk

`npm audit --omit=dev` reports six moderate and zero high/critical findings through `firebase-admin -> @google-cloud/storage` transitive packages. The proposed automated remediation downgrades Firebase Admin to 10.3.0, so it was not applied. Recheck the upstream Firebase Admin dependency chain before live staging and treat any high/critical change as a stop condition.

## Live gate

At the 2026-07-13 report time, the remaining 13 blockers covered approved change ticket, payment/resource authorization, Google state target, controlled non-Google test account, Firebase Web/Google provider configuration, signing-secret versions, existing `_Default` log-sink import evidence, migration/runtime smoke and principal-mapping evidence. Employee-login-alias and privacy local implementation blockers are closed by supplemental RD/QC reports. Pilot privacy v1.0 now has immutable-version, acknowledgement, permanent-access and Admin evidence implementation, but employee activation remains closed until Cloud SQL migration, actual staging effective timestamp and real-provider staging verification pass. Employee-number aliases must route to provider authentication and can never authenticate or authorize directly; AI_PDM must not store production password/MFA/recovery secrets. Organization `361825816000` and Billing Account `018678-C2F032-7680E4` reuse are approved targets, but payment/free-trial activation remains closed. The approved staging baseline is `db-custom-1-3840` Regional HA with a USD 300 monthly budget, 50/80/100 alerts and a USD 240 plan-review stop; `dani@jenfu.com.tw` is the named continuity backup. A reviewed credentialled plan may continue into apply in the same controlled workflow only after all pre-apply gates close and the plan contains no destructive or over-budget difference. Provisioning-dependent Firebase, secret, log-sink, migration/smoke and principal-mapping evidence remains a staging-acceptance gate rather than a circular pre-apply requirement. Current blocker count is tracked in `.ai-doc/dev_task.md` and `config/platform/staging-preflight.template.json`.

## Official references

- Firebase Admin ID-token verification and revocation: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firebase Web auth persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Google sign-in: https://firebase.google.com/docs/auth/web/google-signin
- TOTP MFA: https://firebase.google.com/docs/auth/web/totp-mfa
- Firebase Auth IAM roles: https://cloud.google.com/iam/docs/roles-permissions/firebaseauth

## Not executed

No Google credential read, Terraform plan/apply/import, project or billing change, API enablement, IAM binding, resource creation, DNS/TLS activation, real Firebase provider/user/email/TOTP action, database migration, data movement, staging deployment, production smoke, release action or ProJED modification occurred.
