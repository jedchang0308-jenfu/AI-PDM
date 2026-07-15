# ADR-PDM-ERP-PLATFORM-002 - Google Taiwan Cloud SQL production platform

Date: 2026-07-13
Status: `HD-8-1..4`, `HD-9-1` and `HD-10-1` closed; staging cost posture amended; core data/file/business/runtime/continuity decisions accepted; provider and release remain gated
Owner: ERP Platform RD
Related DEV: `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` / `DEV-046`
Supersedes: production-provider, data-placement and 18-month provider-decision sections of `ADR-PDM-ERP-PLATFORM-001`

## Decision Source

The user confirmed:

1. `1B`: existing application credentials do not need to be retained; identities are reprovisioned. The later clean-production decision supersedes the earlier assumption that source actor IDs/history enter production: source attribution remains unchanged in the read-only archive, while production creates new stable actor IDs.
2. `2A`: after the named-user canary passes, access expands in controlled waves rather than opening to everyone at once.
3. `3B`: production operational database and controlled files are placed in Google Cloud Taiwan.

These choices amend the earlier Supabase-first production direction. ProJED remains unchanged and is not made a dependency of the PDM production slice.

## 2026-07-13 RD Supervisor Review and Decision Closure

The core Google/Cloud SQL/GCS direction remains valid. The RD review first reopened three decisions that had been written too strongly; the user then closed them with `1A 2A 3A`:

- `HD-6-1 closed - 1A`: accept Firebase Authentication processing identity data in the United States, subject to field minimization, employee/privacy notice, retention/deletion ownership and a maintained privacy inventory.
- `HD-6-2 closed - 2A`: keep cloud primary and recovery copies in Taiwan. The organization accepts that a full `asia-east1` outage has no committed region-outage RPO/RTO and remains unavailable until the region/service returns and recovery can run. Same-region copies must never be reported as regional DR.
- `HD-6-3 closed - 3A`: require Cloud SQL regional HA from the first 3-5-user production canary. The availability/cost posture is accepted; the actual billing account, monthly amount, alert recipients and cost owner remain provider/release evidence before resources are created.

These decisions close the human architecture gates only. They do not prove privacy notice delivery, restore performance, resource locations, monthly cost, billing ownership or production readiness, and they do not authorize live resources or deployment.

## 2026-07-13 RD Supervisor Multi-level Re-review and Decision Closure

The Google control-plane and Cloud SQL/GCS authority direction remains reasonable, but three assumptions were not decision-complete:

- `HD-7-1 closed - 1A`: use Firebase App Hosting in `asia-east1` and downgrade/pin the application to an exact reviewed Next.js 15.2.x patch supported by App Hosting. Phase 1 must update the framework/runtime lock and prove build/start/regression compatibility before staging.
- `HD-7-2 closed - 2B`: production starts as a clean database. Seed only the initial Admin, minimum company/role/configuration records, numbering rule/sequence state and non-reusable reservations required to prevent reissuing any previously used official number. Local drafts, business rows, demo/test rows, credentials, sessions and historical audit are not migrated; the source is retained as a read-only archive with inventory/hash/owner evidence.
- `HD-7-3 closed - 3B`: the in-region RPO remains a continuous wall-clock data-loss objective. RTO is measured only during Monday-Friday 08:00-17:00 `Asia/Taipei`, excluding company holidays. Security or suspected data-loss incidents escalate immediately at all times; the business-hours clock does not defer containment or evidence preservation.

The review also establishes an engineering default that does not require a product decision: production source auto-rollout is disabled. Every production change must use an immutable artifact and the existing release gate. Automatic base-image updates, if enabled, require a pinned runtime, pre-deploy validation, alerting and rollback evidence.

## 2026-07-13 RD Supervisor Third-pass Decision Closure

Official-source revalidation found that `HD-7-1 / 1A` solved App Hosting adapter compatibility but not the five-year framework-maintenance problem. Firebase currently marks Next.js 15.2.x active for App Hosting, while the Next.js support policy places major 15 in Maintenance LTS and permits essential fixes to land in later 15.x minor releases. An exact 15.2.x production pin therefore cannot be treated as a five-year security posture.

The user closed the three decisions as follows:

- `HD-8-1 closed - 1A`: self-host Next.js 16 Active LTS as a container on Cloud Run `asia-east1`, behind a Google external Application Load Balancer/serverless NEG, Google-managed TLS and the production custom domain. Cloud CDN may cache only reviewed public immutable assets; authenticated HTML/API/session responses are private/no-store and cannot be cached. Firebase remains the human IAM, not the application runtime.
- `HD-8-2 closed - 2A`: security or suspected data-loss incidents use an internal primary plus backup on-call roster with acknowledgement within 60 minutes at all times. Acknowledgement starts the containment checklist (account/session disable, write freeze/read-only, key revocation and evidence preservation as applicable); it does not promise 24x7 service restoration.
- `HD-8-3 closed - 3B`: staging validates both Google Workspace and non-Google Firebase-managed email-link paths. Wave 0 production is Google Workspace only; Wave 1 must include at least one controlled non-Google account before that path expands further.

Engineering corrections that do not require a product decision are fixed now: clean production creates new production actor IDs rather than mapping source IDs; Identity Platform managed action email is distinct from optional custom SMTP; and Phase 3A proves file capabilities fail closed without requiring the Phase 3B GCS runtime adapter to block numbering/drafts.

The user closed the follow-up decision with `HD-8-4 closed - 1A`: full PDM/GCS/offline backup-and-restore capability remains deferred, but the official-numbering canary must not start until Cloud SQL automated backups and PITR are enabled and one production-like recovery point has been restored to a separate isolated target. The drill must prove schema/migration state, account mapping, audit/outbox integrity and numbering-ledger/sequence/non-reuse-reservation consistency without overwriting the source. This is release evidence, not a user-facing restore feature and not evidence that later file/full-PDM recovery is complete.

## 2026-07-14 Staging Cost Amendment

`HD-10-1 closed - 1A`: isolated staging uses `db-custom-1-3840` with `ZONAL` availability. Automated backups, PITR, private IP, IAM database authentication and deletion protection remain mandatory. Production remains `REGIONAL` from the first production canary under `HD-6-3 / 3A`; this amendment does not weaken the production availability contract.

The conservative Phase 2B/3A staging forecast is USD 210/month against the existing USD 300 cap and USD 240 pre-plan stop. This clears the planning-cost blocker only. A credentialled Terraform plan must still stop on an estimate above USD 240 or on any deletion/replacement, and all state, provider, secret, IAM, migration, smoke and rollback gates remain effective.

## 2026-07-15 Staging Firebase Hosting Exception

The user selected the Firebase Hosting default domain for the short-term internal staging pilot after deferring public DNS. This is an intentional staging-only exception to `HD-8-1 / 1A`, not a replacement for the production architecture:

- Canonical staging origin: `https://jenfu-ai-pdm-stg-361825.web.app`.
- Firebase Hosting only rewrites HTTP traffic to the existing Cloud Run service in `asia-east1`; it does not host business logic or formal data.
- Cloud SQL remains the only formal relational authority. Firestore is not enabled or used. GCS remains the only approved future formal-file authority; Firebase Storage is not used. Firebase Functions, Callable and Firestore triggers remain prohibited.
- Firebase Hosting's Cloud Run integration requires an unauthenticated Cloud Run endpoint. Therefore staging temporarily enables the Cloud Run default URL and all ingress. `PDM_PUBLIC_BASE_URL` and the session issuer are pinned to the `web.app` origin, secure host-only cookies remain required, and a request carrying the `run.app` browser origin is denied at session exchange.
- This does not eliminate the direct `run.app` shell or denial-of-service surface. The direct response also bypasses Hosting's private/no-store header override. These are accepted staging residual risks only.
- Production still requires the external Application Load Balancer, managed TLS, custom domain, load-balancer-only Cloud Run ingress and disabled default URL. Firebase Hosting is not an allowed production gateway under this ADR.

Execution evidence records a targeted Terraform plan/apply of 0 added, 1 in-place change, 0 destroyed and 0 replaced; Firebase Hosting live version `c61e4ebfa2556848`; Cloud Run revision `ai-pdm-stg-00003-vz4`; and 6/6 live smoke including a read-only Cloud SQL query through the runtime identity. This closes the internal HTTPS and runtime-smoke gates only. Staging acceptance remains blocked by real principal mapping and exact-source artifact provenance/drift evidence because the deployed image predates at least one locally accepted route.

## Decision

### 1. One Google platform, one PostgreSQL authority

- The Next.js BFF runs as a Next.js 16 Active LTS container on Cloud Run `asia-east1` under `HD-8-1 / 1A`. An external Application Load Balancer/serverless NEG owns managed TLS and the custom domain; Cloud CDN is restricted to reviewed public immutable assets. Firebase App Hosting/Next.js 15.2.x remains historical context and is not the production runtime.
- Cloud SQL for PostgreSQL is the only staging and production relational authority, in `asia-east1`.
- Google Cloud Storage is the authoritative binary store, with primary and recovery buckets in `ASIA-EAST1` unless a separately approved disaster-recovery ADR chooses another location.
- Firebase Authentication with Identity Platform is the shared human IAM. Provider credential, UID and authentication metadata necessarily remain in Identity Platform as the accepted identity exception; all business profile, company, role/scope, lifecycle, session-control and audit records remain in Cloud SQL. Firebase authenticates the browser; operational authorization and database access terminate behind the Next.js BFF.
- Every formal business row, workflow state, role/scope assignment, audit record and transactional outbox record is stored in Cloud SQL. Firestore is not used for formal, cache, session, workflow or integration state.
- Every formal file is stored through the direct GCS authority contract. Firebase Storage SDK/API/rules are not used even though Firebase Storage is backed by GCS.
- All business commands and queries enter through portable standard HTTP endpoints on the Next.js BFF. Firebase Functions, Callable Functions, Firestore triggers and provider-specific business-logic protocols are prohibited.
- Firestore, Supabase PostgreSQL, Supabase Auth, Supabase Storage and Firebase Storage are not parallel production authorities.
- Local SQLite remains the developer runtime. Disposable PostgreSQL/Supabase artifacts remain compatibility and migration evidence only.

### 1A. Portable HTTP/BFF boundary

- Browser and module clients call documented HTTP routes; no client invokes Firebase Callable or imports database/storage admin SDKs.
- Authentication adapters may verify Firebase identity, but domain services accept provider-neutral principal/organization inputs and return provider-neutral results.
- Domain validation, authorization, transaction, audit and outbox behavior stay in portable application modules, not Cloud Run configuration, Firebase or event-trigger configuration.
- Background delivery may use a portable outbox publisher hosted on an approved Google runtime, but cannot become a second command path. Pub/Sub/Eventarc payloads are integration adapters, not business-logic authority.
- A runtime migration must be able to preserve HTTP contracts, domain services and Cloud SQL/GCS repositories without rewriting business rules.

### 2. Taiwan data placement with an explicit identity exception

- Operational PDM/ERP rows, audit/outbox records, backups selected for the Taiwan tier, and controlled files are configured in Google Cloud Taiwan.
- Cloud SQL production uses regional high availability within `asia-east1`; automated backups and PITR configuration must have evidence showing the selected backup location and retention.
- The organization must not claim that all personal data stays in Taiwan. Firebase Authentication processes/stores authentication data in US data centers according to Firebase's published privacy information.
- `HD-6-1` acceptance is recorded. Before live Identity Platform setup, the privacy inventory must list Firebase identity fields, lawful/business purpose, administrators, retention/deletion process and employee notice; missing implementation evidence still blocks live identity setup.
- A release inventory must cover identity, operational rows, controlled files, backups/DR copies, runtime, build artifacts/container images, logs, secrets/KMS metadata and approved exports. A resource is not Taiwan-resident merely because the application runtime is in Taiwan.
- The project's `_Default` sink routes eligible application/audit logs to a dedicated `asia-east1` log bucket before staging acceptance; actual built-in bucket/sink locations remain in the inventory. The Google-managed `_Required` bucket is a disclosed global-location service exception and cannot be represented as Taiwan-resident. Logs contain identifiers needed for correlation, not secret or business-payload bodies.
- Cloud Build, Artifact Registry, Cloud Run, external Application Load Balancer/CDN, Secret Manager replication and KMS key-ring locations are inventoried from actual configuration. Regional placement is selected where the service supports it; unavoidable global load-balancer/CDN/provider metadata is disclosed instead of hidden behind an "all data in Taiwan" claim.
- Shared Drive exports are delivery/collaboration copies governed by Google Workspace policy. They are not PDM authority, database backup or evidence that the PDM platform itself is Taiwan-only.

### 3. Server-only database boundary

- Browser code never receives a database URL, Cloud SQL credential, service-account key or privileged provider secret.
- The selected runtime connects through the approved Cloud SQL connector/socket using automatic IAM database authentication and a dedicated service identity with only the Cloud SQL Client permission required for connectivity. Static database passwords and service-account keys are prohibited.
- Runtime SQL uses a non-owner `pdm_runtime` role, bounded connection pool, explicit schema qualification and least-privilege grants.
- Domain commands own validation, transaction, audit and outbox behavior. RLS/default-deny remains defense in depth and cannot replace application authorization.
- The selected runtime uses Direct VPC egress or an approved Serverless VPC Access connector. The staging gate must prove DNS/routing, connector identity, egress mode and fail-closed behavior. Public IP is disabled for the accepted end state; any temporary exception requires a separate security decision, narrow authorized network path and removal deadline.
- Runtime maximum instance/concurrency configuration and the per-process SQL pool maximum are explicit release configuration. The connection budget must satisfy `effectiveMaxInstances * poolMax + migrationAdminReserve <= floor(0.70 * CloudSQL max_connections)`; the explicit reserve covers planned migration/administration and at least 30% stays unallocated for provider overhead, failover and emergency access. A sizing change requires a recalculated budget and saturation evidence.
- Connection acquisition timeout, statement timeout, transaction timeout, idle-connection lifetime and retry limits are explicit environment policy. Retries apply only to classified transient failures and cannot replay a non-idempotent command or allocate another official number.
- Application instances never execute DDL on startup. Schema/grant changes run once through a dedicated migration step with a separate migration identity, immutable migration checksums, a database advisory lock, pre/post version evidence and a defined rollback/forward-fix point.

### 4. Identity reprovisioning, not credential migration

- Existing local/demo passwords, password hashes, OAuth bindings, sessions and refresh tokens are not migrated into Firebase.
- The canonical provisioning manifest creates or references a new stable production PDM `users.id` and maps the newly created Firebase UID only after email ownership, company membership and role are reviewed. It never maps by email alone.
- Source actor IDs and historical rows remain unchanged in the read-only source archive and are not production account records. Any future historical import requires an explicit source-to-production provenance mapping and a separately approved migration/release decision.
- `jedchang0308@jenfu.com.tw` is the bootstrap business Admin identity. The local managed-auth bootstrap is local evidence only; production completion requires a newly provisioned Firebase identity, MFA enrollment, a new stable production PDM user ID and successful BFF session smoke.
- Admin/Approver requires TOTP. Cloud break-glass uses two separately owned hardware-key accounts that cannot obtain PDM business sessions.
- Legacy demo login and legacy password/OAuth endpoints are closed before canary.

### 5. Continuity and numbering integrity

- In-region recovery target while `asia-east1` remains available: RPO <= 1 wall-clock hour and RTO <= 4 business-support hours under `HD-7-3 / 3B`. The support calendar is Monday-Friday 08:00-17:00 `Asia/Taipei`, excluding company holidays. Under `HD-8-2 / 2A`, an internal primary plus backup roster acknowledges security/suspected-data-loss incidents within 60 minutes at all times and begins containment; this does not promise 24x7 restoration or describe a full Taiwan-region outage.
- Production Cloud SQL uses regional HA, automated backups and PITR. Under `HD-8-4 / 1A`, one documented production-like recovery point must be restored to a separate isolated target before canary. Evidence records the source recovery point, selected backup/PITR path, target identity/location, start/end time, observed data-loss window, schema/migration checksum and validation result; the source cannot be overwritten and no RPO/RTO claim may exceed the tested path.
- The isolated restore must reconcile the signed numbering control ledger against restored sequence/high-water state, issued numbers and non-reuse reservations; any missing or duplicate reservation, sequence regression, checksum mismatch or unexplained audit/outbox gap is a no-go. Independent logical-backup cadence, long-retention/offline restore and full PDM/GCS file recovery remain deferred to `DEV-037`/Phase 3B and are not canary prerequisites.
- Cross-project Taiwan copies protect against selected operator, IAM, accidental-deletion and application incidents; they do not provide full `asia-east1` outage continuity. Under `HD-6-2`, full-region RPO/RTO is explicitly uncommitted and no cross-region cloud replica or backup is part of the accepted scope.
- Primary GCS uses 30-day soft delete. Controlled objects replicate/copy to a backup-project bucket without propagating source deletion; the application runtime cannot delete backup objects.
- During database unavailability, official numbering fails closed. No spreadsheet, paper or offline issuance/backfill path exists in version one.
- Recovery reconciles the signed numbering ledger before reopening. Issued numbers absent from restored business rows become non-reusable recovery reservations.

### 6. Controlled rollout

- Wave 0: 3-5 named Google Workspace users receive production access to official numbering and drafts only.
- `HD-9-1` on 2026-07-14 cancels the former fixed five-business-day `DEV-FIELD-001` observation. The task closes without execution or a pass claim.
- Later allowlist expansion is not time-gated, but each change requires an explicit DEV-032 release decision, no open P0/P1, rollback readiness and production post-deploy smoke evidence.
- A controlled non-Google Firebase-managed email-link account may enter a later allowlist only after that path passes staging.
- Every wave uses stable user IDs and a fail-closed allowlist. File workflows, release, CAD parsing and other roadmap functions stay disabled until their own release gates pass.
- Under `HD-7-2 / 2B`, production begins with no migrated business rows or drafts. The seed manifest is allowlist-only: initial Admin, minimum company/role/configuration rows, sequence state and non-reusable official-number reservations. Unknown, demo, test or historical source rows cannot enter production.
- A read-only local archive preserves the excluded source inventory and hashes. It is evidence, not a runtime authority or fallback production database.

### 7. Five-year ontology direction

- Typed domain tables remain authoritative. The ontology layer registers stable Objects, typed temporal Links, governed Actions, Logic and provenance; it is not a generic EAV replacement.
- The first MVP is Drawing -> Part -> BOM plus `request_pdm_change`.
- Project and Equipment links wait for a ProJED-owned integration contract. This ADR does not modify ProJED.
- Transactional outbox precedes Pub/Sub/BigQuery projections. Vertex AI or agents may read governed views and call approved Action APIs, never write operational tables directly.

### 8. Cost accountability

- Before any billable staging or production resource exists, each Google Cloud project has a named cost owner, monthly service forecast and labels that separate environment/module cost.
- Cloud Billing budgets alert accountable owners at 50%, 80% and 100% of the approved monthly amount; Monitoring also covers abnormal database storage, network egress, build and runtime growth. Budget alerts are evidence and escalation controls, not a hard spending cap.
- `HD-6-3` requires regional HA from canary day one. The release report still records the approved monthly forecast, actual-to-date amount and variance owner before billable production resources are created.

## Environment Model

- `jenfu-erp-dev`: local/test resources and disposable evidence.
- `jenfu-erp-staging`: Cloud Run `asia-east1`, Identity Platform and Cloud SQL staging in Taiwan. The normal edge baseline is the external Application Load Balancer/CDN policy; the short-term internal pilot may use the 2026-07-15 Firebase Hosting default-domain exception. GCS integration staging is required before Phase 3B, not before the no-file Phase 3A slice.
- `jenfu-erp-prod`: Cloud Run `asia-east1`, external Application Load Balancer/custom domain, restricted CDN policy and Cloud SQL HA in Taiwan; direct GCS becomes formal file authority when Phase 3B is released.
- `jenfu-erp-backup`: separately administered Taiwan recovery project; KMS, backup GCS and logical database restore artifacts remain in the approved Taiwan location and do not constitute regional DR.

Logical labels are not hard-coded project IDs. Final project IDs, billing labels, budgets, owners, service identities, DNS and secrets are approved at the staging/release gates.

## Provider Review, Not Provider Migration

At months 12 and 18, review Cloud SQL edition, machine/database sizing, storage growth, connection-pool utilization, p95/p99 latency, HA/restore evidence, support effort and monthly cost. The default action is right-sizing within Cloud SQL. A provider migration requires a new ADR and separately authorized migration/release DEV; this review does not preserve the old Supabase migration assumption.

## Rejected End States

- Supabase as staging or production operational authority.
- Firebase Auth and another provider both managing the same employee lifecycle.
- Browser-direct PostgreSQL or provider API table access.
- Firestore and Cloud SQL both acting as transaction authorities.
- Any PDM/ERP formal row, cache, workflow, session or outbox state stored in Firestore.
- Firebase Storage SDK/API/rules or Firebase-managed file pointers as the formal file path.
- Firebase Functions, Callable Functions or Firestore triggers containing business logic.
- Shared Drive as controlled-file authority or backup authority.
- Deleting/re-keying source-archive actors or silently treating them as production accounts because credentials are reprovisioned.
- Full internal opening immediately after the first canary.
- Claiming complete Taiwan data residency while using Firebase Authentication.
- Production auto-deployment from a live source branch without the release gate.
- Deploying Cloud Run/Next.js before the container, Node/runtime support, migration regression, private-response cache denial and upgrade-runway evidence pass.

## Execution Boundary

The original ADR approval authorized documentation and local contract planning only. Subsequent project, Phase 2B resource, migration, Firebase Hosting and staging-smoke actions were separately authorized and are traceable in DEV-046 evidence; they do not grant standing authority for further account provisioning, source-data deletion, production deploy, merge, PR, rollback or production smoke. `HD-8-1..4` are closed. Remaining Phase 2/3 actions still require the applicable implementation/release instruction plus provider, cost, credential, privacy, artifact-provenance, principal-mapping, pre-canary isolated-restore and release gates.

## Official References

- Cloud SQL PostgreSQL regions: https://cloud.google.com/sql/docs/postgres/region-availability-overview
- Cloud Storage locations: https://cloud.google.com/storage/docs/locations
- Firebase App Hosting locations: https://firebase.google.com/docs/app-hosting/locations
- Cloud SQL data residency: https://cloud.google.com/sql/docs/postgres/data-residency
- Cloud SQL high availability: https://cloud.google.com/sql/docs/postgres/high-availability
- Cloud SQL PITR: https://cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr
- Firebase App Hosting configuration and VPC access: https://firebase.google.com/docs/app-hosting/configure
- Firebase App Hosting framework/runtime support: https://firebase.google.com/docs/app-hosting/frameworks-tooling
- Next.js support policy: https://nextjs.org/support-policy
- Firebase App Hosting rollouts: https://firebase.google.com/docs/app-hosting/rollouts
- Firebase App Hosting VPC networking: https://firebase.google.com/docs/app-hosting/vpc-network
- Cloud Run locations: https://cloud.google.com/run/docs/locations
- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- External Application Load Balancer with Cloud Run: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
- Firebase Hosting integration with Cloud Run: https://firebase.google.com/docs/hosting/cloud-run
- Cloud Run ingress restrictions: https://cloud.google.com/run/docs/securing/ingress
- Cloud SQL restore overview: https://cloud.google.com/sql/docs/postgres/backup-recovery/restore
- Firebase session cookies: https://firebase.google.com/docs/auth/admin/manage-cookies
- Firebase TOTP MFA: https://firebase.google.com/docs/auth/web/totp-mfa
- Cloud SQL disaster recovery: https://cloud.google.com/sql/docs/postgres/intro-to-cloud-sql-disaster-recovery
- Cloud SQL backup options and locations: https://cloud.google.com/sql/docs/postgres/backup-recovery/backup-options
- Cloud Logging regionalization: https://cloud.google.com/logging/docs/regionalized-logs
- Cloud Logging locations: https://cloud.google.com/logging/docs/region-support
- Cloud Build locations: https://cloud.google.com/build/docs/locations
- Artifact Registry repository locations: https://cloud.google.com/artifact-registry/docs/repositories
- Firebase privacy and data locations: https://firebase.google.com/support/privacy
- Identity Platform user migration: https://cloud.google.com/identity-platform/docs/migrating-users
- Cloud Billing budgets and alerts: https://cloud.google.com/billing/docs/how-to/budgets
