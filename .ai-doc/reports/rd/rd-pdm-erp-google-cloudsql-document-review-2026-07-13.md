# RD Supervisor Review - Google Cloud SQL ERP Platform Documents

Date: 2026-07-13
Reviewer role: RD Supervisor
Scope: `DEV-046` ADR, five-year SPEC, QA plan, production-slice cross-reference, account-lifecycle cross-reference, `dev_task.md` and `documentation_map.md`
Status: Third-pass decisions `HD-8-1..4` closed; Phase 1 RD Implementation Ready / Not Requested; live Phase 2/3 provider/release gated

## Executive verdict

The Google control-plane, Cloud SQL PostgreSQL, GCS authority and BFF boundary remain a reasonable five-year direction for AI_PDM as one ERP module. The second-pass review found that the prior "Phase 1 RD Implementation Ready" result was overstated: the active SPEC lacked an Architecture Memory Capsule, per-phase handoff contracts, failure/recovery contracts, Deferred Scope Audit and All-Phase Coverage Matrix, although `dev_task.md` claimed those artifacts were complete.

The second pass added those missing structures, but the third pass revalidated official runtime and identity-email behavior rather than trusting the prior "complete" label. It found one P0 maintainability conflict and several P1 cross-document contradictions. The user selected Cloud Run/Next.js 16, primary+backup with 60-minute acknowledgement, and non-Google admission in Wave 1. The follow-up `HD-8-4 / 1A` defers full PDM/GCS/offline recovery but requires automated Cloud SQL backups/PITR and one separate-target restore with numbering-ledger reconciliation before canary. These decisions make Phase 1 contracts implementation-ready. This review does not approve product implementation, billing, live resources, credentials, migration, source-data deletion, deployment, release or ProJED changes.

## Findings and corrections

| Priority | Finding | Correction | Residual gate |
|---|---|---|---|
| P0 | Taiwan DB/file placement was incorrectly extended into acceptance of Firebase Authentication US identity processing | Reopened `HD-6-1`; user then selected `1A` and accepted US identity processing with minimization/notice controls | Privacy inventory/notice implementation evidence |
| P0 | Cloud SQL regional HA inside `asia-east1` was insufficiently separated from a full Taiwan-region outage | Reopened `HD-6-2`; user selected `2A`, Taiwan-only recovery copies and no committed full-region RPO/RTO | Taiwan inventory and no-regional-DR evidence |
| P1 | Regional HA from the first canary had no explicit cost acceptance | Reopened `HD-6-3`; user selected `3A`, mandatory regional HA from canary day one | Actual budget, owner and alert evidence |
| P1 | Data residency inventory covered DB/files but omitted identity, logs, builds/images, secrets/keys, exports and provider metadata | Added full location-retention inventory and disclosed the global Cloud Logging `_Required` exception | Actual staging inventory evidence |
| P1 | App Hosting autoscaling could exhaust Cloud SQL connections | Added `maxInstances * poolMax + migrationAdminReserve <= floor(0.70 * max_connections)`, timeout policy and saturation/failover evidence | Phase 1 validator and Phase 2 load evidence |
| P1 | Schema migration ownership was not singleton/fail-safe | Added dedicated migration identity, advisory lock, immutable checksum/version, pre/post diff and app-start DDL prohibition | Phase 1 contract and Phase 2 rehearsal |
| P1 | Cost governance named budgets but not accountable controls | Added cost owner, measured staging run-rate, monthly forecast, 50/80/100 alerts, anomaly monitoring and variance owner | Staging and release evidence |
| P1 | App Hosting-to-Cloud SQL private networking was not explicit enough | Required `runConfig.vpcAccess`, private-IP path, DNS/routing/identity evidence and fail-closed public fallback | Phase 2 staging evidence |
| P0 | Repository uses `next@16.2.6`, outside the current Firebase App Hosting official Next.js support matrix through 15.2 | User selected `HD-7-1 / 1A`: App Hosting with exact reviewed Next.js 15.2.x; Phase 1 owns downgrade and regression | Local downgrade/build/QC, then staging evidence |
| P0 | Production data migration/seed scope was undefined despite numbering-integrity requirements | User selected `HD-7-2 / 2B`: clean production, allowlisted Admin/config/numbering seeds, non-reuse reservations and read-only source archive | Seed/archive/rehearsal evidence; no business-row migration |
| P1 | RPO/RTO target had no support window, incident clock or escalation roster | User selected `HD-7-3 / 3B`: continuous RPO, business-hours RTO, immediate 24x7 critical escalation | Support calendar/runbook/drill evidence |
| P1 | Production could inherit App Hosting live-branch automatic rollout or ungoverned base-image updates | Production source auto-rollout is prohibited; immutable-artifact release and update-policy tests are mandatory | Selected-runtime configuration and release evidence |
| P1 | Active Cloud SQL SPEC lacked the structures claimed complete in `dev_task.md` | Added Architecture Memory Capsule, five bounded Phase 1 slices, all-phase RD handoffs, failure/recovery, deferred-scope audit and coverage matrix | Document consistency QC and HD-7 closure |
| P1 | Future ontology/event contract lacked replay, DLQ, version and action authority rules | Added stable object/link/action/event identities, idempotent checkpoints, replay/DLQ/projection SLO and no-direct-AI-write invariants | Phase 4 named consumer and QC evidence |
| P1 | Existing completion audit reported only `DEV-FIELD-001` and did not count DEV-046 human decisions or pending implementation | Added DEV-046 to the active board and documented that the script's green result is external-blocker visibility evidence, not implementation/staging/production readiness | Future QC parser enhancement; DEV-046 status remains governed by ADR/SPEC/QA/task consistency |
| P1 | Firebase convenience services could create hidden lock-in or second authorities | Added explicit invariants: Cloud SQL owns all formal data, direct GCS owns all formal files, and portable HTTP/BFF owns business operations; Firestore, Firebase Storage, Functions, Callable and Firestore triggers are prohibited | Phase 1 dependency/config/bundle and HTTP contract gates |
| P0 | Exact App Hosting/Next.js 15.2.x pin proves adapter compatibility, not five-year security maintainability; Next.js 15 is already Maintenance LTS and essential fixes may require later 15.x minors | Reopened runtime posture as `HD-8-1`; Phase 1A is blocked and no downgrade is authorized until the runtime choice closes | Human runtime decision plus official support-policy evidence and migration regression |
| P1 | Clean-production policy conflicted with wording that reused source PDM actor IDs/history in production | Production receives new stable PDM user IDs; source actor IDs/history remain unchanged in the separate read-only archive; same-email auto-link is prohibited | Reprovision/seed manifest and zero source-actor import proof |
| P1 | Firebase-managed email-link was incorrectly blocked on an SMTP/provider decision | Initial invite/reset uses Firebase-managed action email after template/domain/quota/privacy review; custom SMTP remains optional and separately gated | Fake/local adapter tests, then live Firebase provider evidence |
| P1 | Direct-GCS runtime integration was made a prerequisite for the no-file numbering/draft canary | Phase 1 retains interfaces/fakes/fail-close only; direct-GCS adapter/integration/provisioning moves to Phase 3B | Phase 3A negative file-path evidence; Phase 3B staging integration evidence |
| P1 | "Immediate 24x7" was not measurable and non-Google production admission had no wave | Opened `HD-8-2` acknowledgement/coverage and `HD-8-3` account-wave decisions | Human decisions, runbook test and wave manifest |
| P1 | Outbox publication had no concrete delivery ownership/retry contract | Added provider-neutral worker/process, at-least-once lease/lock, attempts/checkpoints, bounded retry/DLQ and no-second-command-path contract | Phase 4 worker/replay/DLQ tests |
| P1 | Backup/restore was described as one scope although the user wants it deferred | Full PDM/GCS/offline restore remains deferred; `HD-8-4 / 1A` requires only automated Cloud SQL backups/PITR plus one pre-canary separate-target restore and numbering reconciliation | Closed decision; implementation evidence remains release-gated |

## Completeness result

- End-state architecture: Cloud SQL/GCS/Firebase/BFF authority is coherent; Cloud Run `asia-east1` + Next.js 16 + external Application Load Balancer/custom domain is fixed under `HD-8-1 / 1A`.
- Phase roadmap and deferred scope: structurally complete; first release remains official numbering/drafts only.
- Security and identity: `HD-6-1 / 1A` closed; privacy notice/inventory evidence remains before live setup.
- Database/runtime: formal business/operational data uses Cloud SQL and domain logic remains portable HTTP/BFF; Phase 1A has a testable Cloud Run/container/ALB/cache contract. No implementation or staging evidence exists.
- Continuity: `HD-6-2 / 2A` keeps Taiwan-only copies/no full-region SLO; `HD-7-3 / 3B` defines continuous RPO and business-hours RTO; `HD-8-2 / 2A` defines primary+backup and 60-minute all-hours acknowledgement; `HD-8-4 / 1A` requires the isolated Cloud SQL restore and numbering reconciliation before canary.
- Cost/operations: `HD-6-3 / 3A` closes the HA posture; actual billing owner, forecast and alerts remain provider/release evidence.
- QA/QC: blocking gates now also cover hosting compatibility/provenance, production data class, support clock and future event replay/DLQ.
- Release readiness: not ready and not authorized.

## Human decision record

- `HD-6-1 / 1A`: Firebase Authentication US identity processing accepted. Required controls: minimized fields, employee/privacy notice, retention/deletion owner and maintained privacy inventory.
- `HD-6-2 / 2A`: cloud primary and recovery copies stay in Taiwan. A full `asia-east1` outage has no committed RPO/RTO; same-region copies cannot be described as regional DR.
- `HD-6-3 / 3A`: Cloud SQL regional HA is mandatory from the first 3-5-user canary. The posture is accepted, while the actual monthly budget, billing account, alert recipients and cost owner remain pre-provision evidence.

Round-7 decisions retained as history:

- `HD-7-1 / 1A`: App Hosting; downgrade/pin exact reviewed Next.js 15.2.x before staging.
- `HD-7-2 / 2B`: clean production; seed initial Admin/minimum configuration/numbering integrity only; preserve excluded source read-only and reserve every previously used official number.
- `HD-7-3 / 3B`: RPO <= 1 wall-clock hour; RTO <= 4 support hours during Monday-Friday 08:00-17:00 `Asia/Taipei` excluding company holidays; security/data-loss escalation immediate 24x7.
- Platform invariants: all formal data in Cloud SQL, all formal files in direct GCS, all business logic behind portable HTTP/BFF; no Firestore, Firebase Storage, Functions, Callable or Firestore-trigger authority.

Closed third-pass decisions:

- `HD-8-1 / 1A`: Cloud Run `asia-east1` + Next.js 16 Active LTS container + external Application Load Balancer/serverless NEG/custom domain; CDN only for reviewed public immutable assets.
- `HD-8-2 / 2A`: internal primary+backup with all-hours acknowledgement within 60 minutes and containment checklist start.
- `HD-8-3 / 3B`: both account paths pass staging; Wave 0 Google Workspace-only; Wave 1 includes a controlled non-Google account.

Closed follow-up: `HD-8-4 / 1A` keeps full PDM/GCS/offline restore development deferred but retains one pre-canary separate-target Cloud SQL restore and numbering-ledger reconciliation as official-numbering release evidence.

Decision reasoning retained: #目的、#效用理論、#倫理考量、#限制條件、#可驗證性、#當責、#批判、#多層次分析

## Multi-level analysis

| Level | RD conclusion |
|---|---|
| Immediate pilot | The product slice remains official-numbering/drafts only. It is not deployable until the `HD-8-4 / 1A` restore/reconciliation evidence, clean-production seed/archive, portability, support-accountability and local/staging evidence pass. Live GCS integration does not block this no-file slice. |
| System contracts | One IAM/BFF/Cloud SQL/direct-GCS authority is sound. Firestore/Firebase Storage/Functions shortcuts are rejected to preserve portability and avoid second authorities. |
| Operations/governance | Regional HA does not create a 24x7 support organization. Budgets do not cap spend. Named owners, alert routing, restore drills and source-controlled release provenance remain required. |
| Five-year architecture | Provider-neutral domain repositories, transactional outbox and typed governed Actions support ERP growth. Generic EAV, direct AI writes, premature microservices and ProJED table coupling remain rejected. |

## Next executable boundary

Phase 1A-1E are RD Implementation Ready / Not Requested; Phase 1D remains limited to GCS interfaces/fakes. A separate implementation instruction may perform the Cloud Run/container contract, portable-boundary enforcement, Cloud SQL contracts, clean-seed/archive and SLO validators without live credentials or cost. `HD-8-4 / 1A` is closed and must be encoded in Phase 2 continuity tests. Live staging still requires provider instruction and billing, credential, privacy, target and QA gates. Production remains under `DEV-030` to `DEV-032` and the deployment release gate, including pre-canary restore/reconciliation evidence.

## Official references revalidated in the third pass

- Firebase App Hosting framework/tooling support: https://firebase.google.com/docs/app-hosting/frameworks-tooling
- Next.js support policy: https://nextjs.org/support-policy
- Firebase action email links: https://firebase.google.com/docs/auth/admin/email-action-links
- Identity Platform `sendOobCode`: https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode
- Cloud Run locations: https://cloud.google.com/run/docs/locations
- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- External Application Load Balancer with Cloud Run: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
- Cloud SQL restore overview: https://cloud.google.com/sql/docs/postgres/backup-recovery/restore
