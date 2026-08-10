# SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002 - Five-year Google Cloud ERP platform and ontology roadmap

Date: 2026-07-13
Status: `HD-8-1..4` closed; Phase 1A-1E, Phase 2A preflight/IaC and Phase 2B local application/IaC readiness implemented and locally QC-accepted on 2026-07-13; Phase 2B staging infrastructure, migration, Firebase Hosting default-domain entrypoint and runtime smoke complete; principal mapping plus exact-source artifact provenance/drift remain gated
DEV: `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` / `DEV-046`
Authority: `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
QA: `.ai-doc/qa/qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md`

## Human Decision Brief

### Confirmed decisions

- Phase 2B guided decision `1A / 2C / 3A` on 2026-07-13: use a dedicated staging Google Cloud project and a separate future production project; after target, billing, budget, privacy and backup gates close, a reviewed credentialled plan may continue into apply in the same controlled workflow; `jedchang0308@jenfu.com.tw` temporarily owns business/runtime/data/privacy/security/cost accountability, with one named internal backup required before apply.
- Phase 2B guided decision `1A / Workspace-only / 3A` on 2026-07-13 originally selected `db-custom-1-3840` with Regional HA for staging, a USD 300 monthly budget, 50/80/100 alerts and a USD 240 plan-review stop. `HD-10-1 / 1A` on 2026-07-14 supersedes only the staging availability choice: staging is `ZONAL`, production remains `REGIONAL`, and the conservative Phase 2B/3A forecast is USD 210. `dani@jenfu.com.tw` remains continuity backup.
- Phase 2B guided decision `1A / 2A / 3A` on 2026-07-13 authorized read-only Cloud discovery, a company-owned self-service Billing strategy and an AI-drafted employee privacy notice. Discovery under `jedchang0308@jenfu.com.tw` found organization `jenfu.com.tw` / `361825816000`, existing ProJED projects and existing Billing Account `018678-C2F032-7680E4` in free-trial state. No mutation occurred. The previous assumption that no Cloud organization/project/billing existed is disproved; reuse versus separate Billing remains a human decision, so `projectAndBillingApproved` and the target billing ID remain closed.
- Phase 2B guided decision `1A / 2A / 3C` on 2026-07-13 approved AI_PDM staging reuse of Billing Account `018678-C2F032-7680E4`, the 30/180/365-day identity/security retention baseline with disclosure of the provider-managed 400-day `_Required` log retention, and `jedchang0308@jenfu.com.tw` / `dani@jenfu.com.tw` as primary/backup privacy contacts. On 2026-07-14 the user reported that this Billing Account is now a Paid account with a valid payment method, closing the payment-activation gate. This does not authorize chargeable resource creation. The privacy draft remains unpublished and unapproved until the business-audit retention and final version/effective-date review close.
- Phase 2B guided decisions `1A / 2A` on 2026-07-13 permanently retain only the minimum official-number/non-reuse ledger, retain closed/cancelled drafts for three years, retain operation audit for three years using stable PDM User ID rather than email, and company-approve employee privacy notice Pilot v1.0 effective on staging opening. Approval closes the wording gate but not the implementation gate: immutable content hash, activation acknowledgement, permanent access and Admin evidence must be implemented and verified before employee activation. At this point the account model was still open and was closed by the following guided identity decision.
- Phase 2B guided identity decision `3` on 2026-07-13 requires company-scoped employee-number login aliases and account mapping while explicitly rejecting an AI_PDM-owned password store, MFA engine and password-reset system. Cloud Identity/Firebase Identity Platform owns credentials, MFA and recovery; the alias only creates a short-lived provider-routing intent, and final authorization remains verified provider UID -> stable PDM User ID. Alias schema/API/UI and local QC were implemented on 2026-07-13; Cloud SQL migration and real-provider staging evidence remain live gates.
- Existing login credentials, provider bindings, source actor IDs and history are not migrated. Production users are reprovisioned in Firebase and receive reviewed, newly created stable production PDM user IDs; source attribution remains unchanged in the read-only archive.
- `jedchang0308@jenfu.com.tw` is the initial business Admin. A local managed-auth bootstrap exists, but it is not production Firebase/IAM completion.
- Rollout starts with a Google Workspace-only named 3-5-user canary. `HD-9-1` cancels the former fixed five-business-day waves; every later allowlist change requires explicit DEV-032 release evidence, and controlled non-Google users require prior staging proof.
- Cloud SQL PostgreSQL, Cloud Run Next.js 16 HTTP/BFF and GCS target `asia-east1`/Taiwan for operational data and files; the external Application Load Balancer/custom domain may use global control-plane/CDN resources that must be inventoried.
- Firebase Authentication is the accepted IAM direction. US identity-data processing is accepted under `HD-6-1`; field minimization, employee/privacy notice, retention/deletion owner and privacy-inventory evidence remain mandatory before live setup.
- The first production slice opens only official numbering and drafts. Roadmap functions remain visible but disabled with an unavailable indicator and tooltip.
- ProJED is untouched. Project/Equipment integration waits for a ProJED-owned contract.
- `HD-8-1 / 1A` supersedes the historical App Hosting/Next.js 15.2.x instruction: production runs a Next.js 16 Active LTS container on Cloud Run `asia-east1` behind an external Application Load Balancer/serverless NEG and managed TLS. Cloud CDN is restricted to reviewed public immutable assets.
- Staging exception dated 2026-07-15: the internal pilot may use `https://jenfu-ai-pdm-stg-361825.web.app` as a Firebase Hosting rewrite gateway to the existing Cloud Run service. It requires public Cloud Run ingress/default URL and therefore carries a documented direct-`run.app` residual risk. This exception is forbidden in production and does not change Cloud SQL/GCS authority or permit Firestore, Firebase Storage or Firebase Functions.
- `HD-7-2 / 2B`: production starts clean with only the initial Admin, minimum configuration, numbering seeds and non-reusable reservations; local business/draft/demo/test/history data remains in a read-only archive.
- `HD-7-3 / 3B`: RPO <= 1 hour is continuous wall-clock; RTO <= 4 hours is measured Monday-Friday 08:00-17:00 `Asia/Taipei`, excluding company holidays. `HD-8-2 / 2A` adds an internal primary plus backup roster with all-hours acknowledgement within 60 minutes and immediate containment checklist start after acknowledgement.
- All formal data is in Cloud SQL, all formal files are in direct GCS, and all business logic is exposed through portable HTTP/BFF contracts. Firestore, Firebase Storage, Firebase Functions, Callable Functions and Firestore triggers are not application authorities.

### Closed decision round 7

The 2026-07-13 RD supervisor re-review found three choices that could not be safely inferred. The user closed them as follows:

- `HD-7-1 / 1A`: retain App Hosting and downgrade/pin to an exact reviewed Next.js 15.2.x patch. Preview/best-effort Next.js 16 on App Hosting is rejected.
- `HD-7-2 / 2B`: create a clean production database. Seed only approved identity/configuration/numbering-integrity rows; do not migrate source business rows, drafts, demo/test rows, credentials, sessions or historical audit.
- `HD-7-3 / 3B`: use Taiwan business hours for RTO measurement, with immediate all-hours security/data-loss escalation.

Round 7 closed the then-known choices but did not make the whole Phase 1 implementation-ready. Official support revalidation reopened runtime and support-accountability decisions as round 8. No implementation, live provider resource, source-data deletion, staging, production or release is authorized by this record.

### Safety interpretation

"Start production clean" means no credential/session/provider-subject, business-row, draft, demo/test or historical-audit migration. It does not authorize deleting the source. The local source is retained read-only with inventory/hash/owner evidence. Any official number previously used or communicated is represented by a non-reusable production reservation even though its business row is not migrated.

### Closed decision round 8 and open restore follow-up

The user selected `HD-8-1 / 1A`, `HD-8-2 / 2A` and `HD-8-3 / 3B`: Cloud Run/Next.js 16, internal primary+backup with 60-minute acknowledgement, and non-Google admission in Wave 1 after both paths pass staging. Phase 1A-1E were subsequently implemented and locally QC-accepted. Phase 2A now supplies fail-closed staging IaC and preflight; it does not authorize credentials or live resources.

The user closed the backup/restore follow-up as `HD-8-4 / 1A`. Full PDM/GCS/offline restore functionality remains deferred, while the official-numbering canary requires Cloud SQL automated backups/PITR plus one pre-canary restore of a documented production-like recovery point to a separate isolated target. The drill validates schema/migration checksums, account mapping, audit/outbox and numbering-ledger/sequence/non-reuse-reservation consistency without overwriting the source. It is release evidence, not a user-facing restore feature or full-PDM recovery claim.

## Purpose and success outcomes

The platform must support a small internal ERP program for at least five years without creating multiple identity, transaction or file authorities. Success means:

- one human IAM and one stable application principal mapping;
- one Cloud SQL operational source of truth;
- one GCS controlled-file authority;
- BFF-only operational access and domain-owned transactions;
- measurable recovery and numbering-integrity evidence;
- controlled, reversible rollout of the numbering/draft slice;
- ontology-ready stable objects/actions without premature microservices or EAV.

## Target topology

```text
Browser
  -> Firebase Authentication / Identity Platform
  -> External Application Load Balancer / managed TLS / custom domain
       -> Cloud CDN only for reviewed public immutable assets
       -> Next.js 16 HTTP/BFF container on Cloud Run asia-east1
       -> Cloud SQL Connector -> Cloud SQL PostgreSQL (asia-east1)
       -> signed upload/download -> GCS primary bucket (ASIA-EAST1)
       -> Secret Manager / KMS / Logging / Monitoring
       -> transactional outbox -> Pub/Sub -> BigQuery (when consumers exist)

Backup project (separate admins, ASIA-EAST1; no regional-DR claim)
  <- logical PostgreSQL backups + signed numbering ledger
  <- controlled GCS backup copies without source-delete propagation
```

Firebase identity data is the documented location exception and is not represented as Taiwan-resident.

### Closed human decisions

- `HD-6-1 / 1A`: Firebase Authentication US identity processing is accepted with minimization, notice, retention/deletion ownership and privacy inventory.
- `HD-6-2 / 2A`: all cloud recovery copies remain in Taiwan; a full `asia-east1` outage has no committed RPO/RTO, and same-region copies are not regional DR.
- `HD-6-3 / 3A`: Cloud SQL regional HA is mandatory from the first production canary.

These decisions close the architecture questions only. Phase 1 still requires an implementation instruction; billable/live Phase 2 resources and all production work remain behind provider, cost, credential, privacy-evidence and release gates.

### Closed round-7 human decisions

- `HD-7-1 / 1A`: App Hosting plus exact reviewed Next.js 15.2.x pin.
- `HD-7-2 / 2B`: clean production plus allowlisted identity/configuration/numbering-integrity seeds and read-only source archive.
- `HD-7-3 / 3B`: business-hours RTO clock plus immediate 24x7 security/data-loss escalation.

## Architecture Memory Capsule

### Authority matrix

| Concern | Single authority | Explicit non-authorities |
|---|---|---|
| Human authentication | Firebase Authentication with Identity Platform | Local/demo auth, Supabase Auth, email/domain alone |
| Business authorization | Next.js BFF plus PostgreSQL role/scope/effective-time records | Browser claims alone, Google Groups alone, provider table policies alone |
| Formal data and operational transactions | Cloud SQL PostgreSQL | Firestore, Supabase PostgreSQL, BigQuery, local SQLite in production |
| Controlled files after Phase 3B | Direct GCS exact bucket/key/generation/hash pointer | Firebase Storage SDK/API/rules, Shared Drive, browser-local files, legacy source after cutover |
| Business command/query interface | Portable standard HTTP on the Next.js BFF | Firebase Functions, Callable Functions, Firestore triggers, provider-specific client protocols |
| Audit and integration delivery | Domain transaction plus transactional outbox | Best-effort client logging or direct event publication |
| Analytics/AI | Governed projections and approved Action APIs | Direct writes to operational tables |

### Non-negotiable invariants

- Every production human has one stable platform principal and one stable production PDM actor ID; credentials/provider subjects may change without re-keying production history. Source-archive actor IDs are separate provenance and are never auto-linked by email.
- Every command is server-authorized and idempotent where retry is possible. Business state, audit and outbox commit atomically.
- Official numbers are never silently reused, including after rollback or restore.
- Runtime identities are non-owner and cannot run DDL, grant privileges or delete recovery copies.
- A file is controlled only after server-side finalize verifies exact generation, size and hash.
- One domain owns each authoritative row and action. Ontology registration does not transfer source ownership.
- A future module integrates through approved commands, events or read models, never cross-module table mutation.
- Production source rollout is manual and evidence-gated. Repository push or live-branch merge cannot automatically become a production release.
- All formal rows, workflow state, role/scope, audit and outbox data reside in Cloud SQL; Firestore is absent from application runtime dependencies and configuration.
- All formal files use direct GCS SDK/signed-URL contracts; Firebase Storage is absent from application runtime dependencies and provider pointers.
- Domain logic is portable application code behind standard HTTP/BFF routes. App Hosting and Firebase configuration contain no business rules.
- ProJED is outside this repository and remains unchanged until a ProJED-owned DEV accepts the contract.

### Current implementation facts that constrain planning

- The repository uses `next@16.3.0`, which aligns with the selected Next.js 16 major and the current security baseline, together with the approved Node runtime and container/Cloud Run/Load Balancer configuration.
- Firebase App Hosting currently designates Next.js 15.2.x active, but the Next.js support policy places 15.x in Maintenance LTS and allows essential fixes to land as semver-minor releases. Exact 15.2.x pinning therefore solves adapter compatibility only, not the five-year security-maintenance requirement.
- No production `apphosting.yaml`, Cloud Build pipeline or infrastructure-as-code target is present in the reviewed repository state.
- The selected Cloud Run release must consume an immutable container digest through the release gate; source push/merge cannot directly change production traffic. Base-image/Node/Next.js updates require staging build/start/regression evidence.
- Build steps cannot depend on private Cloud SQL. Runtime uses approved VPC/private-IP connectivity and automatic IAM database authentication; migrations run as a separate guarded step.

## Architecture contracts

### Identity and account lifecycle

- Primary sign-in: managed Google Workspace account.
- Non-Google users: invitation-only Firebase email link, canonical invitation/email proof, then password linking while freshly authenticated.
- Firebase UID -> platform principal -> stable PDM `users.id`; no email-only runtime authorization.
- Business roles, company, scope and effective periods remain in PostgreSQL and are checked per request.
- BFF session is HttpOnly, Secure, SameSite and has an eight-hour absolute maximum. Signing keys support current/previous rotation with explicit retirement.
- Admin/Approver requires TOTP. Offboarding is deny-first: invalidate application sessions, revoke provider tokens, disable identity and roles, then report any retryable external failure.
- Two hardware-key cloud break-glass identities are not PDM business users. Two-person PDM factor recovery is a separate audited action.
- Provisioning manifest fields: new `production_pdm_user_id`, canonical email, approved company, approved role/scope, Firebase UID, MFA state, legacy production paths disabled, collision disposition, approver, timestamp and evidence link. Source actor ID is optional provenance only and cannot drive automatic mapping.

### Portable HTTP/BFF application boundary

- Browser/module clients use standard HTTP routes. Firebase SDK use is limited to the approved authentication bootstrap; no client Firestore, Firebase Storage or Callable invocation is allowed.
- Firebase identity is exchanged for the same-origin BFF session. Domain services receive provider-neutral principal, organization, role/scope and idempotency inputs.
- Domain validation, authorization, transaction, audit and outbox behavior remain in application modules that can run outside Firebase without semantic changes.
- Asynchronous publishers/consumers adapt the transactional outbox but cannot expose an alternate command path or contain authoritative business rules.
- A hosting change may replace deployment/config adapters only; HTTP contracts, domain services and Cloud SQL/GCS repositories remain portable.

### Cloud SQL and schema ownership

- Local development uses SQLite plus provider-neutral repository tests.
- Staging and production use Cloud SQL PostgreSQL in separate projects/instances.
- The selected BFF runtime uses approved VPC egress plus the Cloud SQL connector/socket and a dedicated runtime service identity to reach private-IP Cloud SQL. SQL role `pdm_runtime` is non-owner and receives only required schema/table/function privileges.
- Runtime `maxInstances` and SQL `poolMax` are bounded so `maxInstances * poolMax + migrationAdminReserve <= floor(0.70 * CloudSQL max_connections)`. The explicit reserve covers planned migration/administration; the remaining 30% stays unallocated for provider overhead, failover and emergency access. Pool wait, active/idle connections, rejected acquisitions and database utilization are release metrics.
- Connection acquisition, statement, transaction and idle timeouts plus retry limits are environment configuration with load evidence before production. Retries require transient-error classification and idempotent command evidence.
- DDL/grant migration is a single controlled deployment step, never an app-start side effect. It uses a dedicated non-runtime identity, advisory lock, immutable version/checksum manifest, pre/post schema/grant diff and an explicit rollback or forward-fix decision point.
- Existing PDM/platform tables may stay in locked-down `public` for the first slice. New cross-module tables use bounded `platform`, `ontology` and `integration` schemas.
- `DEV-047` owns any post-production-stability legacy schema relocation. No fixed observation period, permanent dual write or broad search path is accepted.
- All domain writes atomically update business state, audit and outbox. Browser clients cannot call database or generated table APIs directly.

### Controlled files

- GCS metadata contract includes provider, bucket, object key, generation, SHA-256, size, MIME, lifecycle, owner domain and audit identity.
- Upload uses server-created intent and short-lived signed URL. Finalize verifies generation/hash/size before the object becomes available.
- Quarantine, malware/CAD processing and export are explicit states; failed validation cannot create a controlled attachment.
- Shared Drive receives approved exports/collaboration copies only and cannot write back to PDM.
- GCS file migration/cutover is Phase 3B. File APIs and UI remain fail-closed in the numbering/draft production slice.

### Data location, retention and service inventory

| Data/service class | Target contract | Required release evidence |
|---|---|---|
| Human identity | Firebase Authentication US processing accepted under `HD-6-1 / 1A` | Minimized field inventory, employee notice, retention/deletion owner and acceptance record |
| Operational rows | Cloud SQL `asia-east1` | Project/instance/region, HA/PITR/backup settings, owner and retention |
| Controlled files | GCS `ASIA-EAST1` primary | Bucket location, policy, KMS, generation/hash and runtime IAM |
| Backup/region recovery | Separately administered Taiwan project under `HD-6-2 / 2A`; no cross-region cloud copy and no committed full-region RPO/RTO | Incident class, Taiwan location, admin separation, restore proof and explicit no-regional-DR statement |
| App runtime | `HD-8-1` selected Next.js HTTP/BFF runtime in `asia-east1` | Supported framework/Node/runtime inventory, VPC/private-IP path and immutable release artifact |
| Build artifacts/images | Cloud Build and Artifact Registry regional placement where configurable | Build region, repository location, artifact digest, retention and deletion owner |
| Logs/metrics | Project `_Default` sink routes eligible application logs to a dedicated `asia-east1` bucket; actual built-in bucket/sink locations and `_Required` global exception are disclosed | Sink/bucket location, retention, exclusion/redaction rules and access owner |
| Secrets/keys | Explicit Secret Manager replication and KMS key-ring location | Resource location, rotation, IAM and recovery owner; no secret value in evidence |
| Shared Drive exports | Workspace-governed approved copy only | Export classification/owner/retention; never counted as PDM authority or DB backup |

The release statement may say that primary operational database rows and controlled files are in Taiwan. It must not say that all identity, log, build or provider metadata is Taiwan-resident.

### Continuity

- Production Cloud SQL: regional HA is mandatory from canary day one under `HD-6-3 / 3A`, with automated backups and PITR. RPO <= 1 hour is continuous wall-clock. RTO <= 4 business-support hours is measured Monday-Friday 08:00-17:00 `Asia/Taipei`, excluding company holidays under `HD-7-3 / 3B`; `HD-8-2 / 2A` requires an internal primary+backup roster and all-hours acknowledgement within 60 minutes, followed by containment. `HD-8-4 / 1A` requires the isolated restore and numbering reconciliation before canary.
- Independent logical backup: weekly minimum, eight weekly and twelve monthly retention in the separately administered Taiwan backup project selected by `HD-6-2 / 2A`.
- Numbering control ledger: hourly, KMS-signed and hash-chained. Restore reconciliation creates non-reusable reservations for ledger-issued numbers missing from restored rows.
- GCS: 30-day soft delete plus backup-project copy; runtime service identity has no backup delete permission.
- Under `HD-8-4 / 1A`, the gate requires one isolated Cloud SQL restore before canary. It records the source recovery point, selected backup/PITR path, target identity/location, observed timing/data-loss window and pass/fail reconciliation; the source is never overwritten. Independent logical-backup cadence, long-retention/offline restore and full PDM/GCS/file recovery remain deferred. No secondary region is selected: a full Taiwan-region outage has no committed RPO/RTO, and release/runbook language must not claim regional DR.
- Database outage stops official numbering. Version one has no manual/offline issuance or later backfill.

### Ontology and integration

- Objects have stable type, ID, owner domain, source version and lifecycle.
- Links are typed, directional, temporal and provenance-bearing.
- Actions are authorized business verbs with deterministic handler, validation, transaction, audit and event contracts.
- Logic/AI consumes governed views and may invoke approved actions; it cannot mutate base tables.
- Phase 4 MVP: Drawing -> Part -> BOM and `request_pdm_change`.
- ProJED remains source-independent until its repository owner approves Project/Equipment command/event/read-model contracts.

Ontology/event version-one contract:

- Object identity is `(object_type, owner_domain, native_id)` with a stable platform ID; source version and lifecycle are mandatory.
- Links carry stable link ID, type, direction, valid-time interval, recorded-at time, source object versions and provenance. A generic untyped edge is invalid.
- Actions carry action type/version, actor principal, organization, target object/version, idempotency key, authorization decision, command result and audit/outbox references.
- Events carry stable event ID, event type/schema version, aggregate ID/version, organization, occurred/recorded timestamps and trace ID. Publisher retry cannot create a second logical event.
- Consumers own idempotent checkpoints and projections. Dead-letter, replay owner, projection-lag SLO and schema compatibility are required before the first Pub/Sub consumer goes live.
- AI output is advisory until an authorized human or service invokes an approved Action; prompts or model output never become direct mutation authority.

### Cost and operational ownership

- Every billable project/service has a named cost owner, approved monthly forecast and environment/module labels before provisioning.
- Billing budget alerts go to accountable owners at 50%, 80% and 100%; Monitoring detects abnormal Cloud SQL storage/connections, App Hosting usage, build minutes/artifact growth and egress. Alerts do not cap spend.
- Staging produces a measured run-rate before production approval. Production go/no-go records forecast, actual-to-date, variance and the owner/date for corrective action.
- `HD-6-3 / 3A` makes regional HA mandatory from production canary day one. `HD-10-1 / 1A` separately authorizes single-zone staging with PITR/backups/private access unchanged; actual plan, billing alerts and provider evidence remain required before provisioning.

## Delivery phases and task list

### Phase 0 - Architecture baseline and decision closure

- [x] Superseding Cloud SQL/Taiwan ADR.
- [x] Identity reprovisioning interpretation and Firebase US-location exception.
- [x] Wave rollout contract and field-test gate.
- [x] End-state topology, continuity, ontology and ProJED boundary.
- [x] `HD-6-1 / 1A`, `HD-6-2 / 2A` and `HD-6-3 / 3A` architecture decisions recorded.
- [x] RD multi-level review identified runtime compatibility, data cutover and support-clock gaps.
- [x] Close `HD-7-1 / 1A`, `HD-7-2 / 2B` and `HD-7-3 / 3B`; synchronize ADR/SPEC/QA before target-specific implementation.
- [x] Close `HD-8-1 / 1A`, `HD-8-2 / 2A` and `HD-8-3 / 3B`; record Cloud Run/Next.js 16, 60-minute primary+backup response and non-Google Wave 1.
- [x] Close `HD-8-4 / 1A`: defer full PDM/GCS/offline restore; require automated backups/PITR and one isolated Cloud SQL restore with numbering-ledger reconciliation before canary.

### Phase 1 - Local contracts and adapters (implemented / local QC accepted 2026-07-13)

- [x] Rename active provider contracts from Supabase-specific to operational PostgreSQL/Cloud SQL without deleting historical migration evidence.
- [x] Add Cloud SQL connector configuration contract, `pdm_runtime` grant manifest and bounded-pool validation using local/test doubles only.
- [x] Add a production Docker/standalone Next.js 16 contract, supported Node LTS pin, Cloud Run `asia-east1` service configuration and external Application Load Balancer/serverless-NEG/custom-domain contract; preserve current UI/API behavior through build/start/browser regression.
- [x] Add Cloud Run/Cloud SQL capacity validator for effective maximum instances/concurrency, `poolMax`, `migrationAdminReserve`, `max_connections`, timeout and saturation thresholds.
- [x] Add Next.js/Node/container support-policy matrix, immutable-image/manual-traffic-promotion and base-image/update-policy checks according to `HD-8-1 / 1A`; reject source-push production deployment.
- [x] Add cache-policy tests proving Cloud CDN only caches reviewed public immutable assets and never caches authenticated HTML, API, cookie or session-sensitive responses.
- [x] Add a singleton migration-runner contract with advisory-lock/checksum/version tests and a scanner that rejects app-start DDL.
- [x] Under `DEV-046`, implement Firebase BFF session v2, signing-key rotation, AAL/TOTP/replay controls and deny-first offboarding saga behind provider interfaces; `DEV-045` owns account-console/self-service UX, not shared session-core ownership.
- [x] Implement account reprovision manifest validator, duplicate-email/stable-ID collision report and legacy-login closure scanner.
- [x] Implement Firebase email-link invitation/password-link setup-state and orphan compensation using fake provider adapters.
- [x] Define GCS upload intent/finalize/quarantine/export interfaces, additive pointer schema, fake adapters and fail-closed tests only; the live direct-GCS adapter/integration belongs to Phase 3B and does not block Phase 3A numbering/drafts.
- [x] Implement signed numbering-ledger and recovery-reservation fixtures.
- [x] Add observability fields for request, actor, company, command, DB instance, storage object and provider operation without logging secrets/PII payloads.
- [x] Add a machine-readable data-location/retention inventory schema covering identity, DB, files, backups, runtime, builds/images, logs, secrets/keys and exports.
- [x] Add cost-forecast/budget-policy templates with owner, monthly assumption, 50/80/100 alert recipients and variance escalation.
- [x] Add a clean-production seed manifest and read-only archive validator according to `HD-7-2 / 2B`; only newly created production user IDs, minimum company/role/configuration, numbering sequence and non-reusable reservations are accepted. Source actor IDs/history remain unchanged in the source archive and are never auto-linked by email.
- [x] Add Monday-Friday 08:00-17:00 `Asia/Taipei` calendar/holiday, incident timestamp and RPO/RTO calculation schema; add internal primary+backup roster, 60-minute all-hours acknowledgement timer and containment checklist according to `HD-8-2 / 2A`.
- [x] Add dependency/config/bundle scanners that reject Firestore, Firebase Storage, Firebase Functions, Callable Functions and Firestore-trigger business paths; allow Firebase client use only for authentication bootstrap.
- [x] Add architecture tests proving all formal business/operational repositories use Cloud SQL, enabled formal-file repositories use direct GCS, and routes/middleware/Server Actions are thin transport adapters over portable HTTP/BFF domain services rather than business-logic owners.
- [x] Keep all live Google credentials, resources, billing and DNS out of Phase 1.

Phase 1 evidence is recorded in `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase1-implementation-2026-07-13.md` and `.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase1-report-2026-07-13.md`. These checks do not satisfy staging, live-provider, backup/restore drill, cost-owner, privacy-notice, deployment or canary gates.

### Phase 2A - Staging preflight and reviewed IaC

- [x] Correct the authoritative task board to recognize Phase 1A-1E commit `ec68981` and focused QC 86/86.
- [x] Add a Terraform 1.14.x / google provider 7.39.0 staging root with a GCS backend contract, no embedded backend bucket and a reviewed dependency lock.
- [x] Model 37 gated Google resources across APIs/IAM, separate runtime/migration identities, private VPC, regional-HA/PITR Cloud SQL, Cloud Run proxy sidecar, external ALB/managed TLS, immutable-only CDN, Identity Platform/TOTP, regional logs, monitoring and 50/80/100 budget alerts.
- [x] Default every resource to zero instances and require real approved targets, verified alert channels, `CHG-*` ticket and exact Phase 2B acknowledgement before resource creation can become true.
- [x] Run Terraform `init -backend=false`, `fmt -check` and `validate` inside an isolated container without mounting Google credentials; validation passes with zero diagnostics.
- [x] Produce machine-readable `blocked_expected` preflight and focused QC 20/20; explicitly surface missing owners, privacy/billing/target/state evidence, live Firebase adapter/auth mode, non-Google test account and credentialled plan.

Phase 2A created no project, billing link, API enablement, IAM binding, DNS record, backend state, credential lookup, Terraform plan/apply/import, migration or deployment. Evidence: `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase2a-preflight-implementation-2026-07-13.md` and `.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase2a-preflight-report-2026-07-13.md`.

### Phase 2B - Isolated staging

Local application/IaC readiness completed on 2026-07-13:

- [x] Implement Firebase Web/Admin adapters for Google/password/TOTP, revoked-token verification and eight-hour rotatable BFF sessions; browser Firebase state is memory-only and signed out after exchange.
- [x] Resolve authorization only through active `external_subject = Firebase UID` principal mappings; no email/domain auto-authorization or same-email fallback.
- [x] Implement Firebase-managed email-link invitation followed by password linking, canonical invitation state tracking and deny-first provider/database compensation.
- [x] Fail closed all legacy password/token/OAuth/invitation/recovery bypass routes while `PDM_AUTH_MODE=firebase_bff`.
- [x] Add Cloud Run Firebase/session environment and Secret Manager contracts, independently gated empty-secret bootstrap, invitation SQLite/PostgreSQL schema artifacts and Firebase Admin standalone dependency tracing.
- [x] Pass Phase 2B focused QC 14/14, local preflight 19/19 and production-image smoke against `sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3`.

Phase 2B staging activation completed on 2026-07-15. The original `blocked_external` preflight and intermediate blocker counts are historical evidence, not current dispatch state. Public custom-domain DNS/TLS remains explicitly deferred for the internal pilot and is not counted as passed. Current staging evidence is summarized below:

- [x] Provision isolated staging project, paid billing, private versioned Terraform state, Firebase Web App/provider, Secret Manager session keys, Cloud Run, private Cloud SQL, ALB, monitoring and budget controls through reviewed changes.
- [x] Apply admin bootstrap and 18 Cloud SQL migrations through the guarded migration identity; immediate rerun applies zero versions, runtime identity remains separate, and no browser DB path exists.
- [x] Deploy the Firebase Hosting default-domain entrypoint and Cloud Run runtime, complete exact-source provenance/readback gates, principal mapping, Google Workspace AAL1 pilot exception and runtime smoke.
- [x] Apply company-scoped employee-number alias and privacy acknowledgement contracts to staging; human Google sign-in, acknowledgement and core numbering/draft field checks passed.
- [x] Preserve no-Firestore/Firebase Storage/Functions/Callable/trigger authority and keep every Phase 3A file workflow fail-closed.
- [x] Record staging cost/continuity owners, migration/idempotence, rollback targets and current revision evidence in `DEV-046`; production resources and production data remain untouched except for the separately approved empty production project creation.

Production execution no longer reopens this Phase 2B checklist. It proceeds only through `DEV-032 Gate A-E`: configuration/plan review, resource apply, clean seed/restore/reconciliation, immutable deploy/smoke and named-user canary.

### Phase 3A.0 - Production canary

- [ ] Verify `HD-8-1 / 1A`, `HD-8-2 / 2A`, `HD-8-3 / 3B`, `HD-8-4 / 1A`, `HD-7-2 / 2B` and `HD-7-3 / 3B` are embodied in the Cloud Run artifact, cache policy, clean-production seed/archive manifest, account-wave manifest and incident/continuity/SLO runbook.
- [ ] Verify `HD-6-1 / 1A`, `HD-6-2 / 2A` and `HD-6-3 / 3A` remain satisfied by the immutable release configuration and current privacy/continuity/cost owners.
- [ ] Open the deployment release gate and identify immutable source revision/artifact.
- [ ] Provision production/backup targets, DNS, secrets, service identities, Cloud SQL HA/PITR and GCS policies.
- [ ] Freeze the approved data-location inventory, selected-runtime/Cloud SQL connection budget, migration manifest and monthly cost forecast into release evidence.
- [ ] Generate reviewed account reprovision manifest; create only approved Firebase identities and newly assigned stable production PDM IDs. Preserve source actor IDs/history unchanged in the separate read-only archive; do not same-email auto-link.
- [ ] Provision `jedchang0308@jenfu.com.tw` as initial business Admin, require TOTP, and prove no demo/legacy login remains.
- [ ] Rotate session keys, verify cloud break-glass/PDM recovery separation and complete isolated restore evidence.
- [ ] Create a clean production database and seed only the `HD-7-2 / 2B` allowlist. Generate non-reusable reservations for every previously used/communicated official number, retain the excluded source read-only with inventory/hash/owner receipt, and migrate no business rows/drafts/demo/test/history.
- [ ] Enable only official numbering/drafts for a 3-5-user Google Workspace/new-production-ID allowlist; keep all file workflows and roadmap commands fail-closed.
- [ ] Run production smoke, rollback-readiness check and signed canary go/no-go.

### Phase 3A.1 - Field acceptance and waves

- [x] `HD-9-1` cancels `DEV-FIELD-001` and the fixed five-business-day Wave 0/Wave 1 observation; close without execution or pass claim.
- [ ] Keep no-open-P0/P1, explicit allowlist approval and production post-deploy smoke in DEV-032 for every opening/expansion.
- [ ] Add controlled non-Google Firebase-managed email-link users only after that path passes staging and an explicit DEV-032 allowlist release.
- [ ] Do not claim complete PDM production readiness.

### Phase 3B - Controlled-file cutover

- [ ] Implement and validate the direct-GCS runtime adapter in isolated staging, including signed upload/download, generation/hash finalize, quarantine, least-privilege IAM and fail-closed recovery behavior.
- [ ] Inventory source bytes/metadata and classify exclusions/duplicates.
- [ ] Pre-copy, final delta, SHA-256/generation verification and backup-copy proof.
- [ ] Switch file pointers only through an authorized release with rollback evidence.
- [ ] Open selected file workflows only after post-cutover smoke.

### Phase 4 - Ontology MVP

- [ ] Register Drawing, Part and BOM objects/links with stable ownership and provenance.
- [ ] Add governed `request_pdm_change` action.
- [ ] Publish versioned outbox events to Pub/Sub and curated BigQuery projection when an approved consumer exists. Delivery uses a provider-neutral dedicated worker/process with at-least-once semantics, row lease/lock, attempt/checkpoint tracking, bounded retry and dead-letter handling; it never becomes a second business-command path and does not rely on Firebase triggers.

### Phase 5 - Platform optimization

- [ ] At months 12 and 18 review Cloud SQL sizing/edition, storage growth, pool utilization, latency, HA/restore evidence, support hours and cost.
- [ ] Right-size by default. Any provider change requires a new ADR and release DEV.

### Phase 6 - Year 3-5 domain expansion

- [ ] Add customer/project, supplier/procurement, production/quality, service and finance by domain-owned contracts.
- [ ] Integrate ProJED only through a separate ProJED-owned DEV after source-authority approval.

## RD Handoff Contracts

| Slice | Status and execution boundary | Entry | Acceptance | Required evidence |
|---|---|---|---|---|
| Phase 1A runtime foundation | Implemented / local QC accepted; no live credentials | explicit implementation request satisfied | Next.js 16/Node/container support agrees; Cloud Run/ALB/cache config static checks, migration regression, immutable manual promotion, no build-time private DB dependency and secret scan pass | Docker/config diff, support-policy check, build/start/browser regression, cache/rollout-policy tests |
| Phase 1B identity/BFF | Implemented / local fake-provider QC accepted | provider interfaces intact | issuer/audience/revocation, eight-hour session, key rotation, TOTP, invitation, offboarding and stable-ID collision tests pass | focused auth QC and redacted mapping fixtures |
| Phase 1C database/migrations | Implemented / local contract QC accepted; no live Cloud SQL | local/test-double boundary | least privilege, no browser DB path, bounded pool, singleton checksum migration and atomic command/audit/outbox pass | schema/grant diff, generated migration trace and concurrency tests |
| Phase 1D storage/continuity | Implemented / interfaces and fakes only | no live GCS adapter | file interfaces/fail-closed state tests, signed ledger and recovery-reservation fixtures pass; no live adapter required | storage contract tests, hash/generation fixtures, restore-reconciliation simulation |
| Phase 1E governance | Implemented / local QC accepted | templates remain non-release evidence | clean-seed/archive validator, new production-ID proof, official-number reservations, service inventory, business-hours calculation, 60-minute primary+backup response fixtures, portable-boundary scanners and cost templates fail closed | schema fixtures and policy QC |
| Phase 2A preflight/IaC | Implemented / local QC accepted; no credentials or resources | Phase 1 accepted | 37 resources fail-closed gated; Terraform fmt/validate and blocked-expected preflight pass | provider lock, IaC, preflight output and focused QC report |
| Phase 2B staging | Staging activation complete; public DNS/TLS deferred | Phase 2A accepted and separately approved live staging changes | Cloud Run/Firebase Hosting, IAM paths, Cloud SQL migration/idempotence, principal/privacy/session gates, no-Firebase-data/storage/functions and runtime smoke pass; file APIs remain closed | DEV-046 staging execution/readback, migration, hosting, auth and hotfix evidence; GCS integration waits for Phase 3B |
| Phase 3A.0 canary | RD Contract Ready; release gate required | Phase 1/2 accepted, pre-canary isolated restore/reconciliation passed, release instruction, target/data/account manifests, support roster | named Google Workspace 3-5 users only; official numbering/drafts only; required restore/smoke/rollback pass | signed pre-deploy, isolated-restore, deploy, smoke, rollback-readiness and canary evidence |
| Phase 3A.1 fixed-duration field gate | Cancelled by Human Decision | `HD-9-1` | closed without execution or pass; no open P0/P1 and explicit DEV-032 expansion control remain | decision record and retained local functional evidence |
| Phase 3B files | RD Contract Ready; staging implementation plus separate release | stable 3A and approved file inventory/recovery | direct-GCS adapter/IAM/finalize contract passes in staging; exact source/copy/backup/hash/generation evidence; no dual primary; selected workflows only | adapter tests, migration manifest, pointer diff, restore and smoke evidence |
| Phase 4 ontology MVP | RD Contract Ready; future local/staging instruction | stable platform, named consumer and projection SLO | deterministic objects/links/actions/events, idempotent replay, governed change request, p95 projection target | ontology/event contract QC, replay/DLQ and projection report |
| Phase 5 optimization | RD Contract Ready; time/evidence gated | month 12/18 measurements | right-size, remain or new-ADR decision supported by evidence | cost/performance/availability/support scorecard and ADR |
| Phase 6 domain expansion | RD Contract Ready at program level; new DEV per domain | owner, source authority, use case, classification, retention and approval contract | domain-specific object/link/action/provenance acceptance; no direct AI writes | domain QA/QC and source-owner sign-off |

## Failure and Recovery Contracts

- Firebase unavailable: existing bounded sessions follow policy; new login/link/recovery fails closed. Cloud break-glass cannot act as a PDM user.
- Selected runtime unavailable: all writes stop; no second runtime or browser-direct provider path becomes authority. Recovery uses the last approved immutable artifact and configuration.
- Cloud SQL unavailable: official numbering and all writes fail closed. UI shows an unavailable/read-only state; no spreadsheet/offline number issuance is accepted.
- GCS unavailable: file-dependent mutation/release fails closed; Shared Drive is not a fallback upload authority.
- Pub/Sub unavailable: the business transaction remains committed with a pending outbox row; a bounded publisher retries later.
- BigQuery/Vertex unavailable: operational PDM/ERP remains available; analytics/AI is degraded and never authoritative.
- Identity mapping collision: quarantine for Admin review; never merge or grant by email alone.
- Partial upload: unfinalized object is quarantined/expired; no controlled pointer is created.
- Migration interruption: advisory lock/checksum/version decides resume or forward-fix; runtime startup cannot repair schema.
- Database recovery: restore to an isolated target, verify schema/grants/migration history, account roles, audit/outbox, numbering uniqueness/ledger and file pointers before release.
- GCS primary-project loss: restore exact approved generations/hashes from the backup project; Shared Drive is never a recovery source.
- Region outage: no committed RPO/RTO under `HD-6-2 / 2A`; communicate outage scope without calling same-region HA/copies regional DR.

## Deferred Scope Audit

| Scope | Classification | Resume condition |
|---|---|---|
| Production Next.js/runtime posture | Confirmed / Same SPEC Phase 1A | `HD-8-1 / 1A`: Cloud Run `asia-east1` + Next.js 16 Active LTS container + external Application Load Balancer/custom domain/restricted CDN |
| Clean-production seed/archive controls | Same SPEC Phase 1E/3A | Phase 1 implementation, then release-gated source inventory and archive owner |
| Business-hours SLO runbook | Confirmed / Same SPEC Phase 1E/2/3A | `HD-8-2 / 2A`: primary+backup, 60-minute all-hours acknowledgement and containment checklist |
| Non-Google production account wave | Confirmed / Same SPEC Phase 2/3A.1 | `HD-8-3 / 3B`: both paths in staging; Wave 0 Google-only; at least one controlled non-Google account in Wave 1 |
| Backup/restore deferral boundary | Closed Decision / Deferred Full-PDM Scope (`HD-8-4 / 1A`) | require one pre-canary isolated Cloud SQL restore and numbering reconciliation; defer independent/offline/GCS/full-PDM recovery work |
| Phase 1 local adapters | Same SPEC Phase | all five slices implemented and locally QC-accepted; no live provider/resource action |
| Phase 2A IaC/preflight | Same SPEC Phase | local implementation complete; `blocked_expected` until named target/owner/privacy/application evidence closes |
| Google staging resources and billing | Completed for Phase 2B staging | DEV-046 staging project/billing/state/runtime/database/identity/readback evidence; public DNS/TLS deferred |
| Production domain/IAM/DB/deploy/cutover/smoke | Release Gate Required | Phase 1/2 evidence and explicit `DEV-032` release instruction |
| GCS file authority cutover | Same SPEC Phase 3B + Release Gate Required | Phase 3A stable, approved inventory and explicit file-workflow release |
| GCS Bucket Lock/formal record retention | Blocked Human Re-entry | legal/quality retention schedule and irreversible-lock approval |
| ProJED code/data/integration | New ProJED-owned DEV | source authority, stable IDs, command/event/read contract and owner acceptance |
| Existing `public` schema relocation | Separate `DEV-047` | production canary stable, representative snapshot/read-only operator, rehearsal, rollback and explicit implementation request |
| Pub/Sub/BigQuery/Vertex production | Same SPEC Phase 4 or later | named consumer/use case, SLO, replay/DLQ and cost owner |
| Graph database, Kubernetes or microservices | No Tracking | measured scale/SLO demonstrates a need and a new ADR is approved |
| CAD native parsing, SolidWorks Add-in and complete PDM file recovery | Existing deferred DEVs | their own scope, evidence and release decisions; not a Phase 3A blocker |

## All-Phase Coverage Matrix

| Phase / DEV | Scope | Out of scope | Entry condition | Acceptance and evidence |
|---|---|---|---|---|
| 0 / DEV-046 architecture | authority, topology, decisions, memory capsule, handoffs, QA | product/provider/release | HD-6/HD-7 and HD-8-1..4 recorded | ADR/SPEC/QA/task/map consistency plus explicit restore-boundary status |
| 1 / local adapters | five bounded slices 1A-1E including Cloud Run/container contract and portable-boundary scanners | live cloud, billing, DNS, credentials, pointer switch, live GCS adapter | explicit implementation request | per-slice tests/evidence in RD Handoff Contracts |
| 2A / staging preflight | fail-closed Terraform, static target contract, owner/privacy/account blocker inventory | credential lookup, plan/apply/import, billing/resource/DNS creation | Phase 1 accepted and explicit local instruction | Terraform fmt/validate, provider lock, 20/20 QC and `blocked_expected` report |
| 2B / isolated staging | Cloud Run/ALB/cache, both Firebase account paths, Cloud SQL, observability, restore and cost; file integration optional until 3B | production identities/data/domain and file-workflow opening | Phase 2A accepted plus owners, billing, projects, state backend, credentials, privacy proof and live Firebase adapter | complete no-file staging gate/evidence package; GCS evidence before 3B |
| 3A.0 / canary | production official numbering/drafts for named Google Workspace users | non-Google until Wave 1, files, release/CAD/BOM/full PDM, general access | Phase 1/2 accepted + pre-canary isolated restore/reconciliation + release gate + manifests | immutable artifact, migration, required restore, smoke, rollback and canary proof |
| 3A.1 / field | Preserve cancelled `DEV-FIELD-001` decision and explicit expansion control | field-test pass claim or automatic full opening | `HD-9-1` | cancelled without execution; later expansion uses DEV-032 release evidence |
| 3B / files | controlled migration and selected workflow opening | unrelated ERP/ProJED | stable 3A, file instruction, inventory/recovery | exact pointer/hash/generation and rollback/smoke evidence |
| 4 / ontology | Drawing/Part/BOM traceability, governed action/events/projection | Project/Equipment, generic EAV, direct AI write | stable platform, named owner/consumer/SLO | deterministic identity, authorization, replay and projection evidence |
| 5 / optimize | measured Cloud SQL/runtime review | automatic migration | month 12/18 evidence | scorecard plus remain/right-size/new-ADR outcome |
| 6 / domains | owner-governed domain packages and AI Actions | generic cross-domain ownership | new DEV per domain | provenance, approval, source-owner and QA/QC evidence |
| DEV-047 | post-production-stability legacy schema inventory/design/rehearsal/release | launch-time big-bang rename | stable production canary plus representative snapshot/read-only operator, then explicit phase instruction | dependency inventory, schema/grant diff, compatibility and rollback proof |

## Acceptance gates

- Only one production human IAM and one operational PostgreSQL authority exist.
- Operational DB/files are evidenced in Taiwan; Firebase identity location is disclosed and explicitly accepted under `HD-6-1` before live setup.
- Build/image/log/secret/backup/export locations and exceptions are inventoried; no release claim says all data is Taiwan-resident.
- No browser credential or direct DB/table API path exists.
- The `HD-8-1 / 1A` Next.js 16/Node/container/Cloud Run combination has an accepted current support posture and upgrade runway; production source auto-rollout is impossible; Cloud CDN denies caching private/authenticated responses; runtime autoscaling and SQL pools remain within the 70% connection budget under load/failover; only the guarded singleton step can execute DDL/grants.
- The initial Admin receives one newly created, reviewed stable production PDM ID. Source credentials, source actor IDs and history are not migrated or silently mapped; the source archive remains unchanged/read-only.
- Admin/Approver MFA, session invalidation, legacy-login closure and last-admin guards pass.
- Cloud SQL regional HA is active from canary day one under `HD-6-3 / 3A`; automated backup/PITR remain mandatory. `HD-8-4 / 1A` requires one separate-target isolated restore and numbering-ledger reconciliation before canary. `HD-8-2 / 2A` requires primary+backup coverage and 60-minute all-hours acknowledgement. `HD-6-2 / 2A` requires a Taiwan-only inventory and explicit no-regional-DR/no-full-region-SLO statement, not second-region evidence.
- Numbering concurrency, rollback and recovery-reservation tests prove no reuse.
- Wave allowlist and feature capabilities fail closed; Wave 0 is Google Workspace-only and Wave 1 contains at least one controlled non-Google account after both paths pass staging.
- ProJED has no file, database, deployment or account change from this program.
- The `HD-7-2 / 2B` manifest proves clean production, allowlisted seeds, zero migrated business/draft/demo/test/history rows, read-only archive integrity and non-reuse of every previously used official number.
- The `HD-7-3 / 3B` calendar and incident timestamps reproduce continuous RPO and business-hours RTO calculations; security/data-loss acknowledgement occurs within 60 minutes under primary+backup coverage without implying 24x7 service restoration.
- Runtime/bundle/config evidence proves no formal Firestore data, Firebase Storage path, Firebase Functions, Callable Functions or Firestore-trigger business logic; all formal business/operational data terminates at Cloud SQL, enabled formal files terminate at direct GCS, and business operations terminate at portable HTTP/BFF domain services.

## Stop conditions

Stop and return to PM/security/release review if implementation deviates from any closed HD-6/HD-7/HD-8 decision; the canary is requested before the `HD-8-4 / 1A` separate-target restore and numbering reconciliation pass; Cloud Run/container/cache migration changes product behavior without disposition; Route Handlers, middleware or Server Actions contain non-portable domain rules; Firestore, Firebase Storage, Firebase Functions, Callable Functions or Firestore-trigger business logic is introduced; work requires live billing/resources/credentials without approval; privacy notice/inventory is missing; production can auto-roll out from a source branch; framework/Node/runtime support is unknown; production receives a non-allowlisted source row or source actor ID mapping; source archive deletion/mutation is requested; a second region or single-zone posture is introduced without a new decision; historical actor IDs change; DB/provider secrets are exposed; a second authority appears; MFA is bypassed; live data repair/deletion occurs; file workflows open in Phase 3A; a non-Google account enters Wave 0 or Wave 1 omits the controlled non-Google case; a wave expands without evidence; ProJED changes; or deploy/release/rollback occurs outside `DEV-032`.

## Evidence required

- Architecture/config/IaC review and region inventory.
- Full data/service location-retention inventory, including the global `_Required` logging exception.
- Account reprovision manifest with redacted identifiers and collision dispositions.
- Cloud SQL schema/grant/connector/pool/connection-budget and singleton-migration evidence.
- Auth/session/MFA/offboarding and legacy-closure evidence.
- Backup/PITR/HA, the `HD-8-4 / 1A` pre-canary separate-target restore report and signed numbering-ledger reconciliation evidence.
- GCS policy/hash/generation/backup-copy evidence.
- Pre/post deploy smoke, rollback and per-wave field reports.
- Cost forecast, budget-alert delivery, anomaly-monitoring and variance-owner evidence.
- Updated authority map and no-ProJED-change Git boundary.
- Next.js/Node/container/Cloud Run compatibility matrix, ALB/CDN private-cache denial, manual traffic-promotion policy and immutable image evidence.
- Clean-production seed allowlist, zero-business-row migration proof, read-only source archive inventory/hash/owner and official-number non-reuse reconciliation.
- Monday-Friday 08:00-17:00 `Asia/Taipei` holiday calendar, incident timeline, primary+backup roster, 60-minute acknowledgement evidence and calculated continuous-RPO/business-hours-RTO evidence.
- Dependency/import/config/bundle scans and HTTP contract tests proving no Firestore, Firebase Storage, Firebase Functions, Callable or Firestore-trigger authority.
