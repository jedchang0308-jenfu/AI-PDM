# DEV-046 Phase 2B local Firebase BFF QC report

Date: 2026-07-13
Boundary: local application/IaC contract and production-image smoke
Verdict: PASS for local readiness; BLOCKED for live staging

## Evidence

| Check | Result |
|---|---|
| Firebase Admin revoked-token and TOTP claim handling | PASS |
| UID-only active principal mapping and privileged-user TOTP fail-close | PASS |
| Eight-hour issuer/audience/key-rotation BFF session | PASS |
| Google/password/TOTP client exchange with memory-only Firebase persistence | PASS |
| Managed email-link invitation/password linking and compensation | PASS |
| Legacy provider bypass closure | PASS |
| Invitation SQLite/PostgreSQL schema contract | PASS; canonical SQLite schema also executed in memory |
| Cloud Run secret/bootstrap and no-credential IaC contract | PASS |
| Phase 2B focused QC | PASS, 14/14 |
| Phase 2A regression | PASS, 20/20 |
| Phase 2B preflight | PASS, 19/19 local; `blocked_external`; 4 current live blockers after the 2026-07-15 Cloud SQL migration-package preflight |
| TypeScript / lint | PASS; lint zero errors and three unrelated existing warnings |
| Production standalone build | PASS |
| Production-image route smoke | PASS: 200/404/403/401/413/200 expected statuses |

## Artifact smoke

Image `sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3` was started with non-secret dummy Firebase/session configuration. `/api/auth/mode` returned `firebase_bff`; legacy `/api/auth/login` failed closed; `/api/auth/firebase/session` rejected missing Origin before token handling, mapped an invalid token to 401 and rejected a body larger than 32 KiB with 413; `/account-invitation/firebase` rendered. Container logs contained no missing-module or startup errors.

## Open findings

- Live Firebase Google and non-Google identity flows, real TOTP enrollment, managed email delivery and offboarding are untested until an approved staging provider exists.
- Cloud SQL schema/grants/migration, private connectivity, load/connection reserve, HA/PITR restore and numbering reconciliation are untested.
- `npm audit --omit=dev` reports six moderate, zero high and zero critical transitive findings through the Firebase Admin storage dependency chain. No forced downgrade was accepted.
- At the original 2026-07-13 local QC run, 13 machine-readable external/live blockers remained staging-acceptance gates; `safeToRunCredentialledPlan` and `safeToCreateResources` were false. Pilot privacy v1.0 acknowledgement/permanent-access/Admin evidence is now covered by separate focused local QC 20/20 and no longer appears as an implementation blocker. Employee-number alias mapping is covered by focused local QC 21/21. Cloud SQL migration, actual privacy effective timestamp and real-provider staging evidence remain open. Billing-target reuse and payment activation are separate decisions; pre-apply decisions are tracked separately from evidence that can only be produced during or after provisioning.

2026-07-14 addendum: the user reported Billing Account `018678-C2F032-7680E4` is a Paid account with a valid payment method. The machine-readable preflight now closes `PAYMENT_ACTIVATION_NOT_AUTHORIZED` and reports 12 blockers. `RESOURCE_CREATION_NOT_AUTHORIZED`, credentialled plan/apply and all provider-dependent staging evidence remain open; this addendum does not revise the original 2026-07-13 QC run into cloud acceptance.

2026-07-14 cost-gate addendum: the user approved constrained staging resource creation under `CHG-DEV046-PHASE2B-20260714`, with a USD 300 monthly cap and mandatory stop above USD 240 or on any Terraform deletion/replacement. The user also supplied `nokai520@hotmail.com` as the controlled non-Google test account. Those facts close the change-ticket, resource-authorization and missing-test-account blockers, but the existing Phase 2B/3A forecast of USD 280 triggers `COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP`; machine-readable live blockers are now 10. `resourceCreationEnabled` and `terraformApplyAllowed` remain false. No project, state bucket, Firebase app, Cloud SQL, Cloud Run, load balancer, secret, IAM, budget, DNS, credentialled plan/apply/import or deployment was created or run.

2026-07-14 `HD-10-1 / 1A` addendum: staging Cloud SQL changes to single-zone `ZONAL`; production retains Regional HA. PITR, 14 retained backups, private IP, IAM database authentication and deletion protection remain unchanged. Taiwan list pricing produces approximately USD 86.67/month for `db-custom-1-3840` compute plus 20 GiB SSD; the budget rounds the database and backup allowance to USD 90. The conservative Phase 2B/3A forecast is USD 210, so `COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP` closes and live blockers fall to 9. This local QC amendment still does not permit plan/apply or claim live staging acceptance.

2026-07-14 bootstrap addendum: project `jenfu-ai-pdm-stg-361825` is ACTIVE under organization `361825816000` and linked to Billing Account `018678-C2F032-7680E4`. State bucket `jenfu-ai-pdm-stg-361825-tfstate` is in `ASIA-EAST1` with uniform bucket-level access, public access prevention, versioning and 30-day soft delete. Isolated Docker Terraform 1.14.5 successfully initialized the GCS backend and listed the empty remote state using an ephemeral access token. State and executor blockers close; 7 live blockers remain. No Cloud SQL, Cloud Run, Firebase app, load balancer, DNS, application secret, migration or deployment was created.

2026-07-14 Firebase/secret addendum: Firebase Management REST API added Firebase to the staging project and created one Web App. Its public key is restricted to Auth-related APIs and approved staging/localhost referrers; Analytics was not linked and no Firestore/Storage/Hosting data resource was created. The secret bootstrap plan/apply produced 2 adds/0 changes/0 destroys; a follow-up plan/apply produced 2 in-place deletion-protection updates/0 destroys. Current and previous signing secrets each have one distinct ENABLED 88-character version, streamed from memory through stdin without local persistence or value output. Web/secret blockers close; 5 live blockers remain.

2026-07-14 Google-provider/notification-channel addendum: the user enabled the Firebase Google sign-in provider in Console, and Identity Toolkit Admin REST verified `projects/1042387036944/defaultSupportedIdpConfigs/google.com` with `enabled=true`. This evidence is kept outside Terraform because the provider resource would store OAuth secret material in state. Two email Monitoring notification channels were also created for the named primary and backup responders. Google-provider evidence closed the provider blocker.

2026-07-14 staging runtime addendum: `_Default` sink was imported into remote state, Artifact Registry image was pushed, Cloud SQL `ai-pdm-stg-postgres`, Cloud Run `ai-pdm-stg`, external HTTP/HTTPS Application Load Balancer and TWD 9600 budget were created through Terraform. Final applied plan `phase2b-full-recovery-v5` had 6 adds, 2 in-place changes, 0 deletes and 0 replacements; the follow-up detailed plan returned `No changes`. Cloud Run is Ready on revision `ai-pdm-stg-00002-ddd`, the Cloud SQL proxy startup probe passed, and the application `/login` startup probe passed. HTTP LB smoke returned 301 to the staging host. DNS was not mutated: `pdm-stg.jenfu.com.tw` currently returns NXDOMAIN and managed TLS reports `FAILED_NOT_VISIBLE`. At that moment, live blockers were DNS A record/managed TLS active evidence, Cloud SQL migration/runtime smoke and staging principal mapping; the 2026-07-15 internal-pilot and migration-package addenda below supersede the current blocker count.

2026-07-15 internal-pilot addendum: the user decided not to configure public staging DNS for short-term internal use. Public DNS/TLS is deferred and must not be treated as passed. Current machine-readable blockers are 4: internal HTTPS entrypoint, Cloud SQL-specific migration package, Cloud SQL migration/runtime smoke and staging principal mapping. Browser/login smoke remains blocked until an HTTPS entrypoint exists, and Cloud SQL migration remains blocked until a Cloud SQL-specific package and VPC-attached runner are reviewed.

2026-07-15 Cloud SQL migration-package addendum: proposal-only Cloud SQL migration artifacts were generated under `output/dev-046-cloudsql-migration-package/`: 18 candidate schema SQL files, `000_admin_bootstrap_grants.sql`, `999_runtime_grants_refresh.sql`, ordered manifest and runner contract. The package excludes the Supabase RLS baseline and deferred Phase 3B GCS pointer SQL from the no-file internal-pilot slice, and focused QC passed 22/22. This does not approve live apply; review, VPC-attached runner, admin bootstrap, actual migration, runtime smoke and principal mapping remain open.

2026-07-15 Cloud SQL migration-runner addendum: proposal-only runner readiness evidence was generated under `output/dev-046-cloudsql-migration-runner-package/`. A dry-run-first executor, separate Docker `migration-runner` target and reviewed Cloud Run Job IaC now exist. After separate approval, the saved Terraform plan created dry-run Job `ai-pdm-stg-migration-runner`; the Job remains unexecuted and no approved admin bootstrap, live migration or runtime smoke exists. This is a child gate of the existing Cloud SQL-specific migration package blocker, not a new top-level blocker and not live migration evidence.

2026-07-15 live Cloud SQL migration addendum: after separate explicit approvals, backup `1784085929277`, privileged admin bootstrap, all 18 intended migrations and an immediate zero-apply idempotence run completed. The first bootstrap and first two migration executions failed safely without partial schema application; defects were corrected and revalidated against a disposable PostgreSQL 17 shadow before the successful live run. The Cloud Run Job was restored to `--dry-run` with live approval values removed. Evidence is `output/dev-046-live-migration/execution-summary.json`. Machine-readable blockers are now 3: internal HTTPS entrypoint, runtime smoke and principal mapping.

## QC conclusion

The local Phase 2B application/IaC package and staging Cloud SQL schema migration are complete. This still does not prove staging acceptance or production readiness until an internal HTTPS entrypoint, runtime smoke and principal mapping evidence are complete; public DNS/TLS remains deferred.
