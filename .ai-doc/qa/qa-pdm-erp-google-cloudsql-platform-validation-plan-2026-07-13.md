# QA PDM Google Cloud SQL Platform Validation Plan

Date: 2026-07-13
Status: `HD-8-1..4` closed; Phase 1A-1E locally QC-accepted on 2026-07-13; live staging/production provider/release gated
DEV: `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` / `DEV-046`
ADR: `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
SPEC: `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`

## QA objective

Prove that the first production slice uses one Firebase identity authority, one BFF authorization boundary, one Cloud SQL transaction authority and fail-closed capabilities, while preserving stable PDM history and meeting the Taiwan operational-data/continuity contract. This plan does not authorize resource creation, live migration, deployment or release.

## Test environments

| Environment | Allowed use | Required location/evidence |
|---|---|---|
| Local | SQLite, fake Firebase/GCS/Cloud SQL adapters, disposable PostgreSQL | No live credentials or billable resources |
| Staging | Provider integration, clean-seed/archive rehearsal, `HD-8-4 / 1A` pre-canary restore contract and production-like smoke | Cloud Run/Next.js 16 plus Cloud SQL `asia-east1`, external Application Load Balancer/test domain and restricted CDN policy; Firebase identity US exception accepted under `HD-6-1`; direct-GCS integration may wait for Phase 3B while all file paths remain closed |
| Production | Named-user canary, official numbering/drafts, per-wave acceptance | Immutable release artifact, approved manifest, Cloud SQL regional HA/PITR from day one and rollback evidence |

## Gate matrix

| Gate | Required evidence | Blocking rule |
|---|---|---|
| `QA-ARCH-001` authority | All formal business/operational data is in Cloud SQL; enabled formal files use direct GCS; all business operations use portable HTTP/BFF domain services; no Firestore, Firebase Storage, Functions, Callable or Firestore-trigger authority | Any parallel/provider-specific authority or business logic in transport-only routes/Server Actions blocks |
| `QA-HOST-001` support compatibility | Next.js 16 Active LTS, supported Node, standalone/container build and Cloud Run `asia-east1` have accepted support/upgrade runway and migration regression evidence under `HD-8-1 / 1A` | Unsupported/preview posture, unknown/mismatched runtime, non-reproducible image or behavior regression blocks |
| `QA-HOST-002` rollout provenance | Production source auto-rollout is disabled; artifact revision/digest is immutable; base-image update policy has pre-deploy test, alert and rollback evidence | Branch push/merge can directly deploy production, or mutable/unknown artifact blocks release |
| `QA-LOC-001` location | Cloud SQL, Cloud Run and later GCS primary inventory show Taiwan; global ALB/CDN metadata and Firebase Auth US processing are documented under `HD-6-1` | Missing acceptance/inventory or false all-Taiwan claim blocks |
| `QA-LOC-002` full inventory | Identity, DB, files, backup/DR, runtime, build/image, log, secret/key and export locations/retention/owners are recorded; `_Required` global logging exception is disclosed | Missing class, unknown location or hidden global exception blocks |
| `QA-IAM-001` reprovision | No credential/hash/session/source-actor migration; reviewed Firebase UID -> newly created stable production PDM ID manifest; source archive IDs/history remain separate | Missing/colliding mapping, same-email auto-link or source actor re-key blocks |
| `QA-IAM-002` assurance | TOTP for Admin/Approver, eight-hour session, rotation, revoke/offboard, last-admin guard | Any bypass blocks |
| `QA-DB-001` connection | Selected-runtime VPC access, private-IP Cloud SQL connector/socket, dedicated service identity, non-owner role, bounded pool, no browser path | Direct/public privileged access blocks |
| `QA-DB-002` migration | Schema/grant parity, representative snapshot rehearsal, read-only compare, rollback point | Drift or ad hoc repair blocks |
| `QA-DB-003` capacity | `effectiveMaxInstances * poolMax + migrationAdminReserve <= floor(0.70 * max_connections)` plus Cloud Run concurrency/load/failover saturation evidence | Missing budget, >70% allocation or unbounded autoscaling blocks |
| `QA-DB-004` singleton migration | Dedicated migration identity/step, advisory lock, checksums and version evidence; runtime/app startup cannot execute DDL | Startup DDL, duplicate execution or runtime DDL privilege blocks |
| `QA-CONT-001` in-region recovery | Regional HA from canary day one and automated backup/PITR are mandatory; `HD-8-4 / 1A` requires one separate-target isolated restore plus numbering-ledger reconciliation before canary, with no recovery claim beyond completed evidence | Missing/failed pre-canary restore or reconciliation, source overwrite, mandatory-control gap or overstated SLO blocks canary |
| `QA-CONT-002` Taiwan-only recovery boundary | All cloud recovery copies remain in Taiwan under `HD-6-2 / 2A`; full-region RPO/RTO is uncommitted and no regional-DR claim is made | Hidden cross-region copy, committed full-region SLO or regional-DR claim blocks |
| `QA-SLO-001` support clock | Continuous wall-clock RPO; business-hours RTO; `HD-8-2 / 2A` internal primary+backup coverage, all-hours acknowledgement within 60 minutes and containment checklist | Missing calendar/roster/backup, acknowledgement over 60 minutes, wrong clock or implied 24x7 restoration blocks SLO claim |
| `QA-DATA-001` clean production | `HD-7-2 / 2B`: only initial Admin, minimum company/role/configuration, numbering seed and non-reusable reservations are seeded; source remains read-only archived | Any migrated business/draft/demo/test/history row, mutable/missing archive, reused official number or silent repair blocks cutover |
| `QA-PORT-001` portable BFF | Static/runtime evidence shows standard HTTP routes and provider-neutral domain services; Firebase SDK is auth-bootstrap only | Firebase Functions/Callable/Firestore trigger contains business logic or client bypasses BFF |
| `QA-STORAGE-001` direct GCS | Phase 1 proves interfaces/fakes and Phase 3A denies every file path; before Phase 3B release, formal pointer is provider/bucket/key/generation/hash and upload/finalize uses the direct GCS adapter/SDK/signed URL | Firebase Storage SDK/API/rules or Firebase file pointer appears; any Phase 3A file writer blocks canary |
| `QA-NUM-001` numbering | Concurrency, idempotency, rollback, outage fail-close, recovery reservations | Duplicate/reused number blocks |
| `QA-CAP-001` slice | Only official numbering/drafts enabled; direct URL/API/file attempts fail closed | Any roadmap command executes blocks |
| `QA-WAVE-001` rollout | Wave 0 Google Workspace-only; Wave 1 includes at least one controlled non-Google email-link account after both paths pass staging; newly assigned production-ID allowlist, five-day reports and signed go/no-go | Non-Google in Wave 0, no controlled non-Google case in Wave 1, open P0 or undispositioned P1 blocks expansion |
| `QA-COST-001` accountability | `HD-6-3 / 3A` day-one regional HA, named cost owners, measured staging run-rate, approved monthly forecast, 50/80/100 budget alert delivery and anomaly monitoring | Unknown owner, missing regional-HA forecast or absent alert evidence blocks production resources |
| `QA-BOUNDARY-001` ProJED | Git/repository/config evidence shows no ProJED modification | Any unowned ProJED change blocks |

## Detailed scenarios

### Identity and account cutover

- Reprovisioning does not import local/demo password hashes, provider subjects, sessions or reset tokens.
- Email ownership, company, role/scope and newly assigned production PDM ID are reviewed before Firebase UID activation.
- Duplicate canonical email, duplicate Firebase UID, duplicate production PDM ID or mismatched company produces a blocking collision report. A source-archive actor ID is provenance only and cannot be silently linked by email.
- `jedchang0308@jenfu.com.tw` can become the initial production Admin only after Firebase activation, TOTP enrollment and BFF session smoke.
- Demo login, legacy password/token login and legacy Google binding cannot issue a production session.
- Google Workspace and non-Google Firebase-managed email-link paths both pass staging; Wave 0 production admits only Google Workspace users, and the first controlled non-Google user enters Wave 1 after canonical invitation proof.
- Disabled/offboarded accounts and pre-revocation cookies/refresh tokens fail immediately.
- Browser/API responses and logs contain no password hash, raw reset token, provider secret or full provider subject.

### Cloud SQL security and behavior

- Runtime connects through the approved connector/socket, automatic IAM database authentication and dedicated service identity; no static service-account key or database password is shipped.
- App Hosting VPC configuration resolves the approved network/subnetwork or connector; private-IP connection succeeds and unauthorized/public fallback fails closed.
- `pdm_runtime` cannot create/alter/drop schemas, bypass RLS, grant roles or access unrelated schemas.
- Browser bundles and network traces contain no DB URL, SQL credential or provider table API call.
- Pool saturation, transient restart and transaction retry do not duplicate commands or consume extra official numbers.
- Config evidence proves the 70% connection-budget formula from the deployed `maxInstances`, `poolMax`, reserve and Cloud SQL `max_connections`; load/failover retains the promised reserve.
- Two concurrent deployment attempts cannot apply one migration twice; advisory lock/checksum/version evidence is deterministic, and `pdm_runtime`/application startup cannot run DDL or grants.
- Existing `public` compatibility tables and bounded schemas resolve explicitly; no broad search path or permanent dual write.
- Mutation, audit and outbox commit or roll back atomically.

### Hosting, build and rollout

- The Phase 1 diff retains/migrates to supported Next.js 16, pins supported Node/container inputs, produces a reproducible standalone image and defines Cloud Run `asia-east1` plus external Application Load Balancer/serverless-NEG configuration. Typecheck, lint, build/start, focused API/QC and browser regressions must pass before staging.
- A production live-branch commit cannot trigger deployment. The release pipeline consumes an immutable revision/artifact and records build environment, framework adapter/runtime, digest and approval.
- Automatic base-image updates are either disabled or exercised in staging with build/start/regression smoke, alert delivery and rollback evidence before production use.
- Build never depends on private Cloud SQL connectivity. DDL/grants execute only in the guarded migration step after runtime/network targets exist.
- `package.json` pins the approved Node major; deployed runtime mismatch fails the build or pre-deploy gate.
- External Application Load Balancer/CDN tests prove authenticated HTML, API, cookies and session-sensitive responses are private/no-store and never produce a shared cache hit; only allowlisted immutable public assets may be cached.

### Portable provider boundaries

- Dependency/import/config scans reject Firestore, Firebase Storage, Firebase Functions, Callable Functions and Firestore-trigger application paths. Firebase client SDK use is allowlisted only for authentication bootstrap.
- Browser traces call standard HTTP BFF routes and contain no Firestore/Firebase Storage/Callable request.
- Repository tests execute domain commands with provider-neutral principal/organization inputs and fake HTTP/Cloud SQL/GCS adapters, without Firebase runtime semantics. Route Handlers, middleware and Server Actions contain only transport/session/serialization orchestration and call portable domain services.
- All formal state tables, role/scope, audit and outbox writes resolve to Cloud SQL repositories. Enabled formal-file pointers/finalize operations resolve to direct GCS repositories; Phase 3A instead proves every file path is closed.
- Pub/Sub or background delivery consumes committed outbox records through a dedicated provider-neutral worker with at-least-once semantics, row lease/lock, attempts/checkpoints, bounded retry and dead-letter handling; it cannot invoke a second business-command implementation or depend on a Firebase trigger.

### Location, privacy and secrets

- Resource inventory records project, service, region, owner, retention, KMS key, backup location and evidence timestamp for identity, DB, files, backups/DR, runtime, builds/images, logs, secrets/keys and exports.
- Employee/privacy notice explicitly identifies Firebase Authentication's US data-center handling; the release report says operational DB/files are in Taiwan, not all data.
- Eligible application logs routed by the project `_Default` sink land in the dedicated `asia-east1` bucket with approved retention/redaction/access; actual built-in bucket/sink locations are inventoried and the provider-managed global `_Required` bucket is named as an exception. Artifact Registry/Cloud Build and Secret Manager/KMS locations match the inventory or stop the release.
- Secret Manager/KMS/IAM grants are least privilege and no secret appears in repository, build log, browser, audit payload or screenshot.

### Cost and operations

- Staging run-rate estimates the `HD-8-1` selected runtime, Cloud SQL edition/HA/storage/backups, VPC, Logging, Build/Artifact Registry, KMS/Secrets and egress under canary assumptions; direct-GCS cost is included before Phase 3B provisioning/release.
- Budget test notifications reach the named owners at 50%, 80% and 100%; alert evidence states that budgets do not automatically cap spend.
- Monitoring raises a test anomaly for unexpected connection/storage/build/runtime growth, and the runbook names acknowledge/escalate/mitigate owners.
- The production report records regional HA from canary day one under `HD-6-3 / 3A`, approved monthly forecast, actual-to-date amount and variance owner.

### Continuity and files

- Trigger/failover evidence shows mandatory Cloud SQL regional HA behavior under `HD-6-3 / 3A` and measures application recovery inside `asia-east1`.
- Under `HD-8-4 / 1A`, restore one documented production-like Cloud SQL recovery point to a separate isolated target before canary. Record source recovery point, selected automated-backup/PITR path, target project/instance/region, start/end timestamps, observed data-loss window and operator/approver; the source instance is never overwritten.
- The restored target must match approved schema/migration checksums, account/principal mappings, required seed/configuration, audit/outbox transaction evidence and expected row/control totals. Any unexplained gap or checksum mismatch is a no-go.
- Reconcile the signed numbering ledger against restored sequence/high-water state, every issued/communicated official number and non-reuse reservations. Duplicate/reusable official numbers, sequence regression, missing reservations or an invalid ledger chain blocks canary.
- The restore target has no public/client traffic, uses isolated credentials and is removed or retained under a named evidence-retention owner after validation. No RPO/RTO or recoverability claim is made beyond the path and measurements actually tested.
- The location inventory proves that primary and recovery copies remain in Taiwan under `HD-6-2 / 2A`. A Taiwan-region outage is documented as an accepted no-commit incident class: no same-region HA/copy is counted as regional DR, and no full-region RPO/RTO is promised.
- Independent logical-backup cadence, long-retention/offline restore and full PDM/GCS file recovery remain deferred to `DEV-037`/Phase 3B; they are not credited as first-version canary evidence.
- Signed numbering ledger validates chain/signature; missing restored rows create non-reusable reservations before numbering reopens.
- GCS soft-delete and backup-project copy preserve selected file generation/hash; source deletion is not propagated and runtime cannot delete backup objects.
- Phase 3A has no active GCS PDM writer and all file UI/API paths deny access. Direct-GCS adapter/IAM/finalize/restore integration becomes mandatory Phase 3B entry evidence.

### Production data and SLO accounting

- The `HD-7-2 / 2B` manifest is allowlist-only. It seeds the initial Admin with a new production PDM ID and minimum company/role/configuration rows, computes the production sequence start and creates non-reusable reservations for every source official number previously used or communicated.
- Rehearsal proves zero source business, draft, demo/test and historical-audit rows enter production. The source snapshot is retained read-only with inventory, hash, owner and access evidence; discrepancies block rather than trigger ad hoc repair.
- Recovery evidence records detection, incident declaration, acknowledgement, containment start, last durable point, restore start, service validation and reopen times. RPO uses wall-clock timestamps. RTO counts only Monday-Friday 08:00-17:00 `Asia/Taipei` excluding company holidays, while security/data-loss evidence must meet the `HD-8-2` acknowledgement target and coverage model.

### Production slice and waves

- Unnamed user cannot access canary even with a valid Firebase identity.
- Named user can create an official number/draft within approved company/role/scope and sees an audit record.
- Roadmap pages remain visible; unavailable controls cannot be focused/activated into a command and expose a clear tooltip/status.
- Wave 0 runs five business days with 3-5 named Google Workspace users. `DEV-FIELD-001` captures role, task, result, defect, severity, owner and disposition.
- Wave 1 adds about five users only after Wave 0 go/no-go and must include at least one controlled non-Google Firebase-managed email-link account. Wave 2 follows the same signed rule.
- No report uses "full PDM production ready" while file/release/CAD/add-in work remains closed.

## Regression suites

- Account invitation, Google identity, managed auth and account lifecycle.
- Production-slice capability/default-deny and official numbering concurrency.
- Provider-neutral PostgreSQL migration/schema parity and repository behavior.
- Audit/outbox atomicity, access-control temporal roles and cross-company denial.
- Build, typecheck, lint and production-like start smoke.
- Hosting downgrade/runtime-pin/manual-rollout, portable-boundary and clean-production seed/archive validators.
- Phase 4 when started: object/link/action/event schema versioning, idempotent publisher/consumer checkpoint, dead-letter/replay and projection-lag tests.

Existing Supabase QC may run only as disposable compatibility/migration evidence. A pass does not satisfy Cloud SQL staging, continuity or production gates.

## Per-phase exit criteria

### Phase 1 local

- `HD-7-2 / 2B`, `HD-7-3 / 3B` and `HD-8-1..4` are encoded in deterministic fixtures; local contracts simulate the `HD-8-4 / 1A` separate-target restore and fail-closed numbering reconciliation without live credentials.
- Fake-provider contract tests, new-production-ID manifest/collision scanner, Cloud SQL config/grant static checks, auth/session controls, GCS interfaces/fail-closed fakes and numbering-ledger fixtures pass.
- Next.js 16/container/Cloud Run/ALB/cache-policy support and immutable-promotion tests, no-Firestore/no-Firebase-Storage/no-Functions/no-Callable/no-Firestore-trigger/portable-BFF scans, capacity formula, singleton migration, clean-seed/archive, business-hours/60-minute-primary+backup calculation, full location-inventory and cost-policy tests pass.
- No live provider call or credential exists.

Execution result: accepted for the Phase 1 local boundary on 2026-07-13. `qc:dev-046-phase1` passed 86/86 focused assertions; Docker production build and non-root standalone start passed; Playwright completed demo login and reached the authenticated workbench. See `.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase1-report-2026-07-13.md`. This result does not credit any Phase 2 or production evidence.

### Phase 2 staging

- `HD-6-1 / 1A`, `HD-6-2 / 2A`, `HD-6-3 / 3A`, `HD-7-2 / 2B`, `HD-7-3 / 3B` and `HD-8-1..4` are recorded; accountable runtime, data, privacy, continuity and cost owners verify implementation evidence.
- All no-file Phase 3A gates pass on isolated staging. `QA-STORAGE-001` requires fail-closed file paths now and full direct-GCS integration before Phase 3B, not before the numbering/draft canary.
- Privacy/data-location acceptance and cost/owner evidence are signed.
- Migration rehearsal, rollback and production-like smoke pass.

### Phase 3A.0 canary

- Immutable Cloud Run image/traffic revision, target identity, approved clean-seed/archive and Google-only Wave 0 manifests, primary+backup 60-minute policy, HA/PITR, `HD-8-4 / 1A` separate-target restore and numbering-ledger reconciliation, DNS/secrets, smoke and rollback evidence pass.
- Only 3-5 named stable IDs are allowed and file capabilities remain closed.

### Phase 3A.1 waves

- `DEV-FIELD-001` completes for each required observation window.
- No open P0; every P1 has accepted disposition, owner and date.
- Product owner and release owner sign each expansion.

## Stop conditions

Stop on unapproved billable/live action; implementation that deviates from any closed HD-6/HD-7/HD-8 decision; canary before the `HD-8-4 / 1A` separate-target restore and numbering reconciliation pass; source overwrite during restore; Cloud Run/container/cache migration regression; Firestore/Firebase Storage/Functions/Callable/trigger business path; business rules in Route Handlers/middleware/Server Actions; non-portable client bypass; unsupported framework-runtime pairing; production source auto-rollout; private/authenticated response CDN caching; missing privacy notice/inventory; missing target identity; migrated non-allowlisted source row or source actor ID mapping; mutable/missing source archive; historical actor re-key/delete; static DB password/direct browser DB access; privileged runtime role; missing day-one regional HA; wrong support clock or acknowledgement over 60 minutes; false regional-DR/full-region-SLO/recoverability claim; missing restore/reconciliation evidence; numbering duplication/reuse; file workflow leakage; non-Google Wave 0 admission or missing Wave 1 non-Google case; wave expansion without evidence; ProJED change; data repair/deletion; or deploy/release without the release gate.

## Evidence format

Every QC/release record names source revision, container/image digest, exact Next.js/Node/base-image versions, Cloud Run revision, environment/project, region, database instance, bucket when applicable, test actor by redacted new production ID, command/time, expected/actual result, logs/screenshots with secret redaction, defect disposition and approver. Platform evidence also records ALB/CDN cache tests, no-Firestore/no-Firebase-Storage/no-Functions/no-Callable/no-Firestore-trigger scan versions, HTTP/transport-thinness evidence, location-inventory version, rollout/update policy, clean-seed manifest/read-only archive receipt, business-hours calendar/incident acknowledgement/coverage timestamps, runtime/pool/connection budget, migration checksum/version, `HD-8-4 / 1A` source/target/timing/schema/ledger reconciliation evidence, cost forecast and accountable owner. Production reset links, passwords, tokens, DB URLs and provider secrets are never evidence artifacts.
