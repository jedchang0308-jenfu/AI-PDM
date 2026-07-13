# ADR-PDM-ERP-PLATFORM-001 - Google control plane with Supabase PostgreSQL

Date: 2026-07-13
Status: Superseded for production provider and data placement by `ADR-PDM-ERP-PLATFORM-002`; retained as decision history
Owner: ERP Platform RD
Related DEV: `DEV-PDM-ERP-GOOGLE-SUPABASE-001` / `DEV-046`

## Superseded Notice

The user's 2026-07-13 decisions `1B / 2A / 3A` were later amended by `1A / 2C / 3A`: existing credentials are not migrated, rollout expands by controlled waves, and operational database/files are placed in Google Cloud Taiwan. `ADR-PDM-ERP-PLATFORM-002` is therefore the current authority for production database, hosting, storage, identity cutover and rollout. Supabase artifacts in this ADR remain useful only as historical/disposable migration evidence; they are not staging or production targets.

## Decision Source

The user selected the guided decisions `1B / 2A / 3A`:

1. Use Supabase PostgreSQL first, then run an evidence-based Cloud SQL decision gate after 18 months.
2. Use Firebase Authentication with Identity Platform as the single shared ERP identity authority.
3. Use Google Cloud Storage as the authoritative PDM binary store; Google Shared Drive is collaboration/delivery only.

These decisions amend prior target-architecture choices. They do not invalidate completed provider-neutral code, schema parity, audit, mapping, outbox, or local QC evidence.

The user then confirmed the RD completeness decisions `1A / 2B / 3A`:

1. Firebase authenticates the browser, but all operational PostgreSQL access remains behind the Next.js BFF; Supabase third-party Firebase JWT access is not configured without a separately approved direct-read/Realtime use case.
2. Operational production continuity target is RPO <= 1 hour and RTO <= 4 hours, using seven-day Supabase PITR, weekly independent logical backups, 30-day GCS soft delete, cross-project GCS backup, and a quarterly isolated restore drill. Catastrophic project/provider loss is measured separately against the independent-backup tier.
3. Admin/Approver roles require TOTP MFA; two independent cloud break-glass administrators use hardware security keys; application sessions last at most eight hours; Firebase-managed action email is the first delivery family, later refined to email-link invitation followed by password linking. Cloud break-glass access and two-person PDM privileged-factor recovery are separate controls: cloud accounts cannot obtain a PDM business session, while PDM TOTP recovery never grants cloud administrator authority.

The third RD completeness review confirmed `1A / 2C / 3A`:

1. Production delivery is split. Phase 3A launches App Hosting, Firebase/BFF, Supabase PostgreSQL, account governance and the official-numbering/draft slice without opening file workflows or switching PDM file pointers. Phase 3B performs GCS file migration/cutover before file workflows are opened.
2. Existing PDM and already-implemented platform tables remain in a locked-down `public` compatibility boundary for the first launch. New post-DEV-046 platform, ontology and integration tables use bounded schemas. Legacy table migration is a separate post-pilot DEV, not a launch prerequisite.
3. The first ontology MVP uses only AI_PDM-owned Drawing, Part and BOM data. Project/Equipment links wait for a separately owned ProJED integration contract.

The fourth RD completeness review continued without explicit option overrides, so the HCS recommended defaults `1B / 2A / 3A` are adopted as AI assumptions:

1. Phase 3A first deploys a production canary restricted to the named 3-5 pilot users. `DEV-FIELD-001` runs on that canary and blocks broader internal opening/pilot acceptance, not the initial controlled deployment.
2. A database outage stops official numbering completely. No paper, spreadsheet, offline reservation or later backfill path exists in the first version; an emergency namespace requires a future ADR.
3. Invited non-Google users receive a Firebase-managed email sign-in link, complete the canonical PDM invitation/email proof, then set and link a password while freshly authenticated. The system does not pre-create an unknown-password account and treat a reset email as invitation acceptance.

## Supersession

- Supersedes the shared-IAM provider choice in `ADR-PDM-ERP-MODULE-FOUNDATION-002`; its canonical Person/Identity/Organization/Membership/RoleAssignment model and stable-ID rules remain accepted.
- Supersedes the target binary authority and Drive-backup direction in `ADR-PDM-FILE-STORAGE-001`; its provider pointer, hash, manifest, redaction and migration-safety implementation remain reusable.
- Amends `ADR-PDM-ERP-MODULE-FOUNDATION-001`: Supabase PostgreSQL remains the operational database target, but Firebase/Google becomes the ERP control plane and Google Cloud Storage becomes the binary authority.

## Context

鉦富機械 / Jenfu Machinery uses Google Workspace as its cloud administration core and intends to build PDM, project management and later ERP/CRM/PLM capabilities over the next five years. AI_PDM is already a Next.js server application with provider-neutral identity mapping, PostgreSQL/Supabase migrations, controlled-domain transactions and a transactional outbox. ProJED remains a separate module/repository.

The architecture must support a 14-person company growing toward roughly 30 people without creating a platform-operations burden that requires a dedicated infrastructure team. It must also preserve a path toward an ontology-centered operating model without attempting to clone Palantir or introducing premature microservices, graph databases or dual authorities.

## Decision

### 1. Google is the control plane

- Google Workspace / Cloud Identity owns employee directory administration and the Google Cloud Organization.
- One central Cloud Billing account pays for Google Cloud projects; Workspace billing remains separate.
- Firebase App Hosting is the target Next.js runtime, built on Cloud Build, Cloud Run, Cloud CDN, Artifact Registry and Secret Manager.
- Production App Hosting and authoritative file buckets use `asia-east1` where supported.
- Firebase Authentication with Identity Platform is the only application IAM authority.
- Pub/Sub, BigQuery, Looker and Vertex AI are the future event, analytics and AI services.

### 2. Supabase PostgreSQL is the initial operational data authority

- Supabase PostgreSQL remains the only operational relational source of truth for platform, PDM, project and ontology metadata.
- Firestore is not a second ERP/PDM source of truth.
- Existing PDM and already-implemented platform tables remain schema-qualified in locked-down `public` for the first launch; no big-bang rename/search-path migration is allowed in the production-slice release.
- All new post-DEV-046 cross-module tables are created in bounded `platform`, `ontology` or `integration` schemas with explicit owner/grant contracts. A `project` schema is not created or owned by AI_PDM before a ProJED-owned contract exists.
- A separate post-pilot DEV may migrate legacy `public` tables into bounded schemas only after compatibility inventory, query/repository updates, rehearsal and rollback evidence. Until then, `public` is compatibility location, not browser API authority.
- Normal business writes pass through server command/application services. Browser access, RLS and generated APIs cannot replace domain authorization or transaction ownership.
- The browser does not call Supabase Data API, Storage or Realtime for operational PDM/ERP data. Next.js uses a pooled, TLS-protected PostgreSQL connection and a least-privilege application role; no database/service-role credential is exposed to the browser.
- `anon` and `authenticated` receive no base-table grants for the controlled schemas. Supabase third-party Firebase Auth remains unconfigured until a named direct-read or Realtime use case receives a new architecture/security decision.
- Supabase Auth remains unused as employee lifecycle authority and must not create a parallel employee directory.
- After 18 months of production evidence, an explicit gate decides whether PostgreSQL remains on Supabase or moves to Cloud SQL. No dual-write database period is an accepted end state.

### 3. Firebase Identity Platform is the shared IAM

- Internal users sign in primarily with managed Google Workspace accounts.
- Approved users without Google accounts use invitation-only email/password identities in Firebase Authentication.
- Firebase UID maps to a stable platform principal, which maps to the existing stable PDM `users.id`; provider changes never rewrite controlled history.
- Business role, organization, scope and effective-time authority remains in PostgreSQL. Firebase custom claims contain only gateway/session facts required for integration; stale JWT role claims are not business authorization.
- Google Workspace group membership may propose or synchronize membership changes, but email domain or group membership cannot silently grant PDM roles.
- A verified Firebase ID token is exchanged through a CSRF-protected server endpoint for an HttpOnly, Secure, SameSite application session with an eight-hour absolute maximum. Every request still checks current PostgreSQL account, membership, role/scope and session invalidation state.
- Admin and approval-capable roles require enrolled and successfully completed TOTP MFA before production IAM cutover. SMS is not the first-version MFA factor.
- Firebase-managed email-link sign-in delivers the first non-Google invitation proof. After the one-time link and canonical `account_invitations` checks succeed, the freshly authenticated user sets and links an email/password credential before a business session is issued. Password-reset email remains recovery-only; custom Workspace email delivery remains a later provider decision.
- Two different named people hold non-federated cloud break-glass administrator accounts protected by hardware security keys. Those accounts are not normal PDM business users, are tested quarterly, and every use requires incident evidence and post-use credential rotation/review.
- The two-person PDM TOTP-recovery procedure is not a login path for those cloud accounts. It is an audited provider-administration action performed by two authorized operators only after PostgreSQL session invalidation and Firebase refresh-token revocation have denied business access.

### 4. Google Cloud Storage is the PDM binary authority

- CAD, drawing, PDF, release package and technical-transfer bytes are authoritative in private GCS buckets.
- PostgreSQL owns metadata and controlled identity: provider, bucket, object key, generation, hash, size, MIME, lifecycle status and domain owner.
- Upload/download uses short-lived signed URLs issued after server authorization; browser code never receives service-account credentials.
- Primary production buckets use 30-day soft delete and explicit lifecycle policy. PDM revision semantics remain in PostgreSQL and are not inferred from object versions; irreversible Bucket Lock is deferred until a legal/records retention policy is approved.
- Event-driven or hourly cross-project transfer copies new/changed controlled objects into a backup-project bucket without propagating source deletion. The application runtime identity has no delete permission on the backup bucket.
- Shared Drive receives approved exports or collaboration copies only. It is not a backup authority and never writes back into controlled PDM state.
- Existing Supabase Storage support becomes a migration/source adapter, not the production pointer target.
- GCS remains the end-state file authority, but its production pointer cutover is Phase 3B and cannot block Phase 3A official-numbering/draft launch while all file workflows remain server/UI feature-gated closed.

### 5. Ontology is an operational contract, not a generic database

The five-year platform models:

- Objects: stable business nouns such as Customer, Project, Equipment, ProductModel, Drawing, Part, BOM, Supplier, QualityIssue and ServiceCase.
- Links: typed, temporal relationships between objects.
- Actions: authorized business verbs with deterministic owner, validation, transaction, audit and event behavior.
- Logic: rules, calculations, models and AI functions attached through explicit contracts.
- Security and provenance: organization, role/scope, source, version, actor, effective time and evidence on every controlled interaction.

Typed domain tables remain authoritative. The ontology registry references domain objects; it does not replace all tables with EAV or unvalidated JSON.

The first ontology MVP is intentionally narrower: Drawing -> Part -> BOM traceability and a delegated `request_pdm_change` action. Project and Equipment are later object types whose source authority must come from a ProJED/platform integration ADR; fixtures cannot establish production ownership.

### 6. Event and analytics path

- Domain mutation, audit and outbox enqueue remain atomic in PostgreSQL.
- A Cloud Run publisher is added only when a real consumer exists. It claims outbox rows, publishes versioned events to Pub/Sub and records delivery outcome idempotently.
- BigQuery receives curated event/read-model data for analytics; dashboards do not run unrestricted queries against production operational tables.
- Vertex AI/Gemini and agents read governed object views and execute approved Action APIs. They cannot write operational tables directly.

## Resource and Environment Model

Google Cloud Organization:

- `jenfu-erp-dev`
- `jenfu-erp-staging`
- `jenfu-erp-prod`
- `jenfu-erp-backup` (separate administrators and service boundary from the production application project)

The names above are logical environment labels. Final Google Cloud project IDs are assigned under the company organization during the staging/provider gate because project IDs are globally unique; application code must consume environment configuration rather than hard-code these labels.

Supabase:

- one isolated staging project
- one isolated production project

Domains:

- `erp.<company-domain>` for production
- `staging.erp.<company-domain>` for staging
- generated preview domains are non-production only

Every project has explicit owner, billing labels, budget alerts, service accounts, secrets and environment-specific allowlists. Production resources cannot be owned solely by an employee's personal account.

## Production Continuity Contract

- Operational database corruption/rollback target while the Supabase project exists: RPO <= 1 hour and RTO <= 4 hours.
- Enable seven-day Supabase PITR in production after the explicit cost gate; staging uses lower-cost backup settings unless a restore test requires parity.
- Produce an encrypted PostgreSQL logical backup at least weekly into the backup project. Retain eight weekly and twelve monthly restore points; backup manifests include schema version, source project, timestamp, encryption evidence and SHA-256.
- Primary GCS buckets use 30-day soft delete. Controlled objects also copy asynchronously to the backup-project bucket with target RPO <= 1 hour, immutable generation/hash receipts and no source-delete propagation.
- Run one isolated restore drill per quarter. The drill restores database plus selected GCS objects into non-production recovery targets, verifies identity/object/file/hash/audit consistency, measures RPO/RTO and removes temporary recovery resources after evidence capture.
- Catastrophic Supabase project/provider loss falls back to the independent logical backup: full-database RPO <= 7 days and RTO <= 1 business day. This lower tier must be shown separately in UI/management evidence and cannot be reported as the operational PITR SLO.
- Export a Cloud-KMS-signed, hash-chained append-only numbering/audit/outbox control ledger to the backup project at least hourly. After catastrophic restore, signed issued numbers missing from restored business rows become non-reusable recovery reservations before numbering reopens; this prevents reuse without fabricating lost business records or permitting user/manual backfill.
- Failure to meet the applicable SLO, missing backup inventory, or an untested break-glass path blocks production release/continuation until an owner accepts a time-bounded corrective action.
- During database unavailability the numbering command fails closed. The first version has no manual/offline official-number issuance or later backfill path; continuity is restored by database recovery, not by reconciling uncontrolled numbers.

## 18-Month PostgreSQL Decision Gate

The gate compares Supabase PostgreSQL with Cloud SQL using measured evidence:

- p50/p95/p99 transaction latency from App Hosting in Taiwan
- cross-cloud egress and total monthly platform cost
- availability incidents and recovery evidence
- database administration hours and support burden
- backup/PITR evidence and restore time
- RLS/security portability and migration effort
- BigQuery/Vertex integration friction

Possible outcomes are `remain_on_supabase`, `prepare_cloud_sql_migration`, or `reassess_in_6_months`. The gate cannot authorize live migration by itself.

`remain_on_supabase` is the default. `prepare_cloud_sql_migration` requires either one hard blocker or at least two sustained triggers after query/index/application tuning:

- hard blocker: an unresolved security, restore or availability defect prevents an approved production SLO
- critical-flow database p95 > 500 ms or p99 > 1.5 s attributable to cross-cloud database access for three consecutive monthly scorecards
- Supabase database plus cross-cloud egress/support TCO >= 1.5 times the like-for-like Cloud SQL TCO for three consecutive months
- service availability < 99.9%, or at least two severity-1/2 cross-cloud dependency incidents in a rolling six-month period
- database-specific administration/support effort > 8 person-hours per month for three consecutive months

Migration preparation also requires a modeled payback <= 18 months, feature/security parity, a successful migration rehearsal and a separately authorized release DEV. Otherwise the decision is `remain_on_supabase` or `reassess_in_6_months`.

## Rejected End States

- Firebase Auth and Supabase Auth both managing the same employees.
- Firestore and PostgreSQL both acting as ERP transaction authorities.
- Supabase Storage and GCS both acting as primary PDM binary stores.
- Shared Drive as PDM source, bidirectional sync target or immutable backup.
- Browser-direct service-role writes.
- A generic EAV ontology replacing typed PDM and ERP domain tables.
- Microservices, Kubernetes, graph database or event broker before a measured consumer/SLO exists.
- Permanent cross-cloud database dual writes.

## Consequences

Benefits:

- Aligns employee identity, hosting, files, observability, analytics and AI with Google.
- Preserves the completed PostgreSQL/Supabase work and fast operational development.
- Keeps CAD traffic inside Google Cloud while the smaller relational request path crosses to Supabase.
- Preserves a PostgreSQL exit path to Cloud SQL.

Costs and risks:

- Google Cloud and Supabase remain separate bills and availability dependencies.
- Server-only PostgreSQL access requires strict pool sizing, TLS, least-privilege runtime roles and connection/latency monitoring across Google and Supabase.
- Taiwan App Hosting to Tokyo Supabase latency must be measured before production acceptance.
- Current Supabase Auth and Supabase Storage target documents and future phases must be amended.
- GCS needs a new provider adapter and migration contract before production file cutover.
- The hybrid schema transition carries temporary, explicit `public` compatibility debt; it avoids launch-time table renames but requires a separately tracked post-pilot migration DEV.

## Execution Boundary

This ADR authorizes documentation and local contract planning only. It does not authorize Google Cloud/Firebase/Supabase project creation, Blaze billing, Identity Platform upgrade, credentials, DNS, live migrations, provider pointer changes, file copies, production deploy, merge, PR, rollback or production smoke.

## Official References

- Firebase App Hosting: https://firebase.google.com/docs/app-hosting
- Firebase Authentication: https://firebase.google.com/docs/auth
- Firebase session cookies: https://firebase.google.com/docs/auth/admin/manage-cookies
- Firebase TOTP MFA: https://firebase.google.com/docs/auth/web/totp-mfa
- Firebase email action links: https://firebase.google.com/docs/auth/admin/email-action-links
- Supabase Firebase Auth integration: https://supabase.com/docs/guides/auth/third-party/firebase-auth
- Supabase PostgreSQL: https://supabase.com/docs/guides/database/overview
- Supabase backups and PITR: https://supabase.com/docs/guides/platform/backups
- Firebase SQL Connect: https://firebase.google.com/docs/sql-connect
- Google Cloud resource hierarchy: https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy
- Google Cloud Storage signed URLs: https://cloud.google.com/storage/docs/access-control/signed-urls
- Google Cloud Storage soft delete: https://cloud.google.com/storage/docs/soft-delete
- Storage Transfer Service cross-project replication: https://cloud.google.com/storage-transfer/docs/event-driven-transfers
- Palantir Ontology system: https://www.palantir.com/docs/foundry/architecture-center/ontology-system
