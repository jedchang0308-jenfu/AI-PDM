# QA-PDM-ERP-GOOGLE-SUPABASE-001 - Google/Supabase ERP platform validation plan (Legacy)

Date: 2026-07-13
Status: Superseded by `qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md`; retained as historical Supabase plan
DEV: `DEV-PDM-ERP-GOOGLE-SUPABASE-001` / `DEV-046`
SPEC: `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-SUPABASE-001-five-year-platform-ontology-roadmap.md`

> Current QA authority is `.ai-doc/qa/qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md`. Supabase staging/production checks below are non-executable historical evidence.

## Validation Objective

Verify all confirmed HCS decision rounds, including adopted fourth-review defaults `1B/2A/3A`: Firebase/Google is the single control plane, browser access terminates at the Next.js BFF, a named-user production canary precedes field acceptance/wider opening, database outage has no offline numbering fallback, non-Google invitation uses Firebase email-link then password linking, the production slice can launch before GCS file cutover, legacy tables remain safely locked in `public` while new platform schemas are bounded, and the first ontology MVP uses only PDM-owned Drawing/Part/BOM data.

## Risk Matrix

| Risk | Priority | Failure mode | Required evidence |
|---|---|---|---|
| GSP-R01 | P0 | Firebase and Supabase both create/manage the same employee identity | single-IAM tests and account inventory |
| GSP-R02 | P0 | Firebase email/domain/group silently grants business role | server PostgreSQL authorization negative tests |
| GSP-R03 | P0 | Browser or Firebase JWT reaches Supabase operational APIs despite the BFF-only decision | bundle/config/runtime denial tests and zero browser grants |
| GSP-R04 | P0 | Stable PDM user/history rewritten during identity migration | mapping/collision/history parity report |
| GSP-R05 | P0 | GCS and Supabase Storage both accept authoritative writes | provider pointer and disabled-path tests |
| GSP-R06 | P0 | Drive copy becomes source or reverse-syncs into PDM | one-way export and source-generation evidence |
| GSP-R07 | P0 | Controlled file pointer exists before upload/hash verification | intent/finalize/rollback tests |
| GSP-R08 | P0 | Firestore becomes a hidden transaction fallback | dependency/config/runtime scans |
| GSP-R09 | P0 | Event publication diverges from committed business state | transactional outbox and retry evidence |
| GSP-R10 | P0 | AI writes database directly or bypasses Action authorization | credential/import/runtime denial tests |
| GSP-R11 | P1 | Taiwan-to-Tokyo database latency harms workflows | staging p50/p95/p99 report |
| GSP-R12 | P1 | Google Workspace assumed to include Cloud costs | separate billing/budget ownership evidence |
| GSP-R13 | P1 | Generic ontology/EAV removes domain validation | schema ownership and typed-domain review |
| GSP-R14 | P1 | Completed Supabase adapter evidence is falsely reported as GCS/Firebase completion | Git/evidence provenance audit |
| GSP-R15 | P0 | Database or file loss exceeds the applicable operational or catastrophic SLO and no independent restore exists | PITR/logical/control-ledger/GCS inventory and isolated restore drill |
| GSP-R16 | P0 | Admin/Approver bypasses TOTP or a break-glass account becomes a normal business identity | role/MFA/session and emergency-access evidence tests |
| GSP-R17 | P1 | Existing v1 file interface is treated as signed-upload v2 without generation/finalize state | interface/schema/state-machine contract tests |
| GSP-R18 | P0 | GCS migration delays or is falsely required for official-numbering/draft launch | Phase 3A capability/API denial and dormant-provider tests |
| GSP-R19 | P0 | Big-bang schema move breaks current SQL/FK/view/script behavior | explicit public/bounded inventory and no-rename launch gate |
| GSP-R20 | P0 | Ontology creates Project/Equipment truth without ProJED authority | object-type allowlist and source-owner negative tests |
| GSP-R21 | P0 | Completed field evidence is required before the production canary exists, creating a circular release gate | Phase 3A.0/3A.1 sequencing and named-user allowlist evidence |
| GSP-R22 | P0 | Password-reset or email equality is treated as invitation acceptance | email-link, canonical invitation, password-link and collision/replay evidence |
| GSP-R23 | P0 | Legacy managed-auth/Google OAuth and Firebase both issue valid production sessions without an approved transition | account cutover manifest, route-closure and session-denial evidence |
| GSP-R24 | P0 | Session signing-key rotation logs out users unpredictably or leaves a compromised key valid | current/previous-key window, emergency invalidation and secret-boundary evidence |

## FMEA

| Failure mode | Possible cause | User impact | Detection | Priority | Countermeasure / test |
|---|---|---|---|---|---|
| Browser bypasses BFF | Supabase URL/key or grants enter client bundle | authorization/audit bypass or data exposure | bundle scan, denied browser request, grants inventory | P0 | zero operational browser grants; server-only repositories |
| Privileged session survives offboarding | Firebase revoke and PostgreSQL invalidation diverge | former employee keeps controlled access | dual-device revoke test and audit correlation | P0 | PostgreSQL deny-first commit plus idempotent Firebase-revoke saga/retry evidence |
| High-role login lacks TOTP | role evaluated after session issue or stale claim trusted | unauthorized approval/admin action | Admin/Approver login and action negative tests | P0 | PostgreSQL role check before eight-hour session issue |
| GCS pointer precedes verification | old `putObject` semantics reused for signed upload | corrupt/unowned file becomes controlled evidence | pending/finalized DB state and generation/hash comparison | P0 | intent -> verify -> atomic finalize; terminal quarantine |
| Production project deletion destroys primary and soft-deleted files | backup stays in same project or delete propagation enabled | unrecoverable controlled files | cross-project inventory and project-loss drill | P0 | separate backup project, no delete propagation, no runtime delete role |
| Operational database restore exceeds four hours or loses more than one hour | PITR disabled, restore point stale, runbook untested | numbering/audit continuity loss and business outage | quarterly isolated PITR timing and parity report | P0 | seven-day PITR and corrective-action gate |
| Catastrophic Supabase project loss exceeds the declared fallback tier | independent logical backup/control ledger missing | up to a week of full data loss or silent official-number reuse | isolated new-project restore plus hourly control-ledger reconciliation | P0 | weekly encrypted logical backup, hourly signed ledger, RPO <= 7 days/RTO <= 1 business day |
| Ontology registry becomes editable duplicate truth | generic schema owns domain properties/actions | conflicting PDM/ERP state | owner-domain review and prohibited mutation test | P1 | typed domain authority; registry links and delegated commands only |
| Login/upload UI hides failures | error is logged but not shown or layout breaks | user retries, duplicates work or assumes success | visible alert sweep at desktop/mobile viewports | P1 | explicit blocked/error state, no overflow/overlap, correlation ID evidence |
| File-platform work blocks numbering/draft go-live | Phase 3 remains one combined release | pilot value delayed by unrelated migration | release capability matrix and provider-config inspection | P0 | split 3A/3B; file UI/API closed in 3A |
| Legacy schema transition breaks runtime | unqualified SQL or broad search path assumes moved tables | production outage or wrong table access | SQL/import scan, migration rehearsal, runtime matrix | P0 | keep legacy public, qualify touched SQL, new bounded schemas only |
| Ontology claims missing owner-domain objects | Project/Equipment fixtures treated as authority | duplicate master data and ownership conflict | object registration source-owner checks | P0 | Phase 4 allowlist Drawing/Part/BOM; defer ProJED objects |
| Field-test gate cannot execute | completed field evidence is a precondition to the environment it must test | release deadlock or untested wider rollout | compare canary entry and acceptance gates | P0 | field package ready pre-deploy; execute evidence on named canary; block expansion until pass |
| Non-Google invitation creates wrong identity | pre-created reset account or email-only merge bypasses canonical invitation | account takeover or duplicate principal | email-link/invitation/password-link state tests | P0 | route-restricted setup state; exact email/UID/invitation checks; fresh-token mapping |

## Phase 0 Documentation Gate

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-DOC-001 | P0 | Search current authority docs | Firebase IAM, GCS authority and Supabase PostgreSQL direction resolve to the new ADR |
| GSP-DOC-002 | P0 | Inspect superseded ADRs | original history remains, explicit partial supersession is visible |
| GSP-DOC-003 | P0 | Inspect DEV board | DEV-046 is open; old completed DEV evidence is not relabeled as new provider completion |
| GSP-DOC-004 | P1 | Deferred-scope audit | every future scope maps to same phase, new DEV, human re-entry or no tracking |
| GSP-DOC-005 | P1 | All-phase matrix | Phase 0-6 includes entry, acceptance and evidence boundaries |

## Phase 1 Local Adapter Gate

### Firebase IAM

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-IAM-001 | P0 | Valid configured-project Firebase token | maps to one active platform/PDM principal and server session |
| GSP-IAM-002 | P0 | Wrong issuer/audience/project/signature | rejected before mapping/data access |
| GSP-IAM-003 | P0 | Expired/revoked token | rejected; no server session |
| GSP-IAM-004 | P0 | Same email, different UID without approved link | collision/quarantine; no merge |
| GSP-IAM-005 | P0 | Workspace Google and invited email/password identities | both map through the same stable-principal contract |
| GSP-IAM-006 | P0 | Firebase custom claim says Admin but PostgreSQL says Employee | Admin action denied |
| GSP-IAM-007 | P0 | Suspended/offboarded PostgreSQL account | Firebase authentication cannot restore access |
| GSP-IAM-008 | P0 | Browser calls Supabase Data API/Storage/Realtime with Firebase JWT or public key | denied; no controlled base-table grant or provider integration exists |
| GSP-IAM-009 | P0 | Token/log/audit scan | no ID token, refresh token, password or secret persists |
| GSP-IAM-010 | P0 | Admin/Approver without verified email or completed TOTP | no application session and no privileged action |
| GSP-IAM-011 | P0 | Valid login/session exchange | HttpOnly/Secure/SameSite session expires absolutely within eight hours |
| GSP-IAM-012 | P0 | Revoke/suspend from a second device | existing session denied on the next request; no resurrection after reactivate |
| GSP-IAM-013 | P0 | Two break-glass cloud accounts | different named owners, hardware-key evidence, no normal PDM role, quarterly test receipt |
| GSP-IAM-014 | P0 | Non-Google invitation | Firebase-managed email sign-in link reaches the exact invited address; completion creates only restricted setup state until canonical invitation and password-link checks pass |
| GSP-IAM-015 | P0 | Reuse one Firebase ID token exchange | only one `pdm_session` is issued; hash-only receipt rejects replay |
| GSP-IAM-016 | P0 | Privileged role with `aal1` or stale auth_time | denied; five-minute fresh auth and verified TOTP `aal2` required |
| GSP-IAM-017 | P0 | MFA enrollment state used on business route or after 15 minutes | denied; state is route-restricted, bounded-attempt and single-use |
| GSP-IAM-018 | P0 | Firebase refresh-token revoke fails after suspend/offboard | PostgreSQL access remains denied; one idempotent retry job and incident evidence remain until provider revocation is confirmed |
| GSP-IAM-019 | P0 | Complete email-link, invitation and password-link flow | exact email/UID/invitation bind to one stable principal; replay, mismatch, expiry, revocation and collision deny without business session |
| GSP-IAM-020 | P0 | Password reset is used as first invitation proof | rejected; reset is recovery-only after activation and cannot consume `account_invitations` |
| GSP-IAM-021 | P0 | Inspect invitation setup persistence/logs | only hash-only setup state exists; no plaintext password, email-link URL, OOB code or raw Firebase token persists |
| GSP-IAM-022 | P0 | Email-link-created UID expires before canonical mapping | no PDM session/role; idempotent compensation disables/deletes only the unmapped orphan after evidence retention |
| GSP-IAM-023 | P0 | Privileged user loses TOTP | two-person break-glass runbook invalidates PDM sessions/revokes provider tokens before factor removal; next login is enrollment-only and reset email cannot restore privilege |
| GSP-IAM-024 | P0 | Canary allowlist missing/malformed/empty or contains email/role/wildcard | every business session/command denied; only exact stable `users.id` entries are accepted |
| GSP-IAM-025 | P0 | Remove a user from canary allowlist with an existing cookie | next business request denied; eight-hour cookie cannot preserve canary access |
| GSP-IAM-026 | P0 | Scheduled `pdm_session` signing-key rotation | new sessions use current key ID; previous key verifies only within eight-hour lifetime plus bounded skew; older/unknown keys deny |
| GSP-IAM-027 | P0 | Signing-key compromise/emergency rotation | compromised key stops verifying immediately, invalidation boundary advances, all affected sessions deny, and no key material enters DB/log/client |
| GSP-IAM-028 | P0 | Inspect cloud break-glass and privileged TOTP-recovery paths | cloud accounts cannot mint PDM sessions; PDM two-person recovery cannot grant cloud role and denies target sessions before factor removal |
| GSP-IAM-029 | P0 | Production identity-cutover manifest and legacy login routes | every canary user has exact stable-ID/Firebase mapping and disposition; unmapped/collision accounts deny; unapproved legacy session issuance/reset/callback routes are closed |

### PostgreSQL BFF Boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-DB-001 | P0 | Search browser bundle/env | no database password, service role, operational Supabase key/client or Data API path |
| GSP-DB-002 | P0 | Inspect PostgreSQL runtime role | non-owner, no BYPASSRLS/DDL, least table/sequence/function grants |
| GSP-DB-003 | P0 | Spoof actor/company in body/header | ignored/rejected; session-derived actor/org controls command |
| GSP-DB-004 | P0 | Pool exhaustion/database timeout | bounded acquisition/statement timeout, visible unavailable response, no partial mutation |
| GSP-DB-005 | P0 | Mutation fails after domain write before audit/outbox | transaction rolls back all records |
| GSP-DB-006 | P1 | Supabase changelog/config review | relevant hosted-platform/Postgres breaking changes recorded before staging |
| GSP-DB-007 | P0 | Phase 3A schema diff | no existing table rename/move; public controlled tables remain unexposed and explicitly qualified where touched |
| GSP-DB-008 | P0 | Create new platform/ontology/integration table | object lands in correct bounded schema with explicit owner/USAGE/grants and no PUBLIC/anon/authenticated access |
| GSP-DB-009 | P0 | Runtime depends on mutable broad search_path | test fails; new-schema SQL must be qualified and migration path explicit |
| GSP-DB-010 | P1 | DEV-047 Phase A inventory on representative snapshot | every table/sequence/FK/view/function/trigger/grant/RLS/repository/script/external consumer is classified before batch design |
| GSP-DB-011 | P0 | DEV-047 batch rehearsal with old/new application boundary | apply/rollback, dependency, grant/RLS and runtime parity pass; no permanent broad search path, dual write or hidden compatibility authority |
| GSP-DB-012 | P0 | Signed ledger contains an issued number absent after catastrophic restore | recovery gate creates one `public.numbering_recovery_reservations` row; allocation/recycle cannot reuse it and no business record is fabricated |
| GSP-DB-013 | P0 | Ledger batch hash/signature/previous-manifest/checkpoint invalid or stale over two hours | reconciliation fails closed, Severity-1 signal exists and numbering remains closed |

### GCS Storage

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-GCS-001 | P0 | Authorized upload intent | short-lived URL and non-authoritative pending intent only |
| GSP-GCS-002 | P0 | Finalize matching generation/size/hash | one controlled pointer and audit commit |
| GSP-GCS-003 | P0 | Finalize mismatch/missing object | no pointer; object quarantined/expired |
| GSP-GCS-004 | P0 | Overwrite released object via generic path | denied |
| GSP-GCS-005 | P0 | Missing bucket/service identity/config | fail closed; no local/Supabase/Drive fallback |
| GSP-GCS-006 | P0 | Signed URL/log scan | credential and URL redacted; TTL within policy |
| GSP-GCS-007 | P0 | Drive export | source bucket/key/generation/hash receipt retained; no reverse write |
| GSP-GCS-008 | P1 | Filename traversal/collision/Unicode | canonical key remains organization/domain/stable-ID scoped |
| GSP-GCS-009 | P0 | Repeat finalize with same idempotency key/generation | original terminal result returned; no second pointer/event |
| GSP-GCS-010 | P0 | Repeat finalize with different generation/body | fail closed and quarantine; first controlled result unchanged |
| GSP-GCS-011 | P0 | Pending/verifying upload expires or checksum mismatches | terminal expired/quarantined state; no controlled pointer |
| GSP-GCS-012 | P0 | Existing local/Supabase pointer read | remains readable migration source; cannot become new production write target |
| GSP-GCS-013 | P0 | Primary project loss/delete simulation | exact generation/hash recoverable from separate backup project within RTO |
| GSP-GCS-014 | P1 | Primary 30-day soft-delete/lifecycle inspection | configured as approved; irreversible Bucket Lock absent without retention approval |
| GSP-GCS-015 | P0 | File <=16 MiB / >16 MiB up to current 50 MiB policy | correct streaming inline/queued hash path; no full-object application buffer |
| GSP-GCS-016 | P0 | Hash worker timeout/transient failure | max three bounded retries; remains verifying then terminal quarantine with safe retry action |
| GSP-GCS-017 | P0 | Phase 3A production config | GCS PDM writer disabled, pointers unchanged, all file UI/API fail closed |

### App Hosting Compatibility

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-HOST-001 | P0 | Production build without SQLite/local file authority | build succeeds on container/runtime contract |
| GSP-HOST-002 | P0 | Server secrets | Secret Manager references only; no `NEXT_PUBLIC_` privileged value |
| GSP-HOST-003 | P0 | Runtime filesystem write | not used for durable business data/files |
| GSP-HOST-004 | P1 | Preview/staging/production config | isolated projects, domains, secrets and provider targets |
| GSP-HOST-005 | P0 | Workload identity inspection | Application Default Credentials/service identity only; no downloaded service-account JSON key |

## Phase 2 Staging Gate

- Google Cloud Organization owns projects; at least two organization admins and named billing owner exist.
- Central billing account, labels, budget alerts and cost owner are recorded; Workspace and Cloud costs are not conflated.
- App Hosting uses the approved region and staging domain.
- Identity Platform Google and email/password invitation flows pass with verified email, TOTP role policy and eight-hour session fixtures.
- Browser Supabase access remains absent/denied; the staging runtime role, grants, RLS defense and pooled TLS connection are independently verified.
- GCS staging primary and backup-project buckets are private; 30-day soft delete, no-delete replication and runtime no-delete permission on backup are independently verified.
- p50/p95/p99 latency, transaction duration and cross-cloud error behavior are captured under representative pilot flows.
- PITR cost and seven-day setting are approved for production; isolated PITR restore proves operational RPO <= 1 hour/RTO <= 4 hours. A separate new-project restore proves full-DB catastrophic RPO <= 7 days/RTO <= 1 business day and hourly control-ledger reconciliation; GCS recovery meets its one-hour/four-hour target.
- No production data, project, domain or provider pointer is touched.

## Phase 3 Release Gate

Release QA is created only after a release-type instruction. It must cover:

Phase 3A.0 official-numbering/draft controlled canary pre-deploy gate:

- identity inventory, mapping collision dry-run and stable-history parity
- approved `HD-5-1` cutover policy, per-account identity-cutover manifest and legacy login/recovery/callback closure evidence
- Google login plus non-Google Firebase email-link/invitation/password-link flow, verified email, TOTP, eight-hour session, offboarding and session revocation
- separate cloud hardware-key break-glass drill and two-person PDM privileged-TOTP recovery drill; neither path may confer the other's authority
- scheduled/emergency `pdm_session` signing-key rotation, key-ID compatibility window and invalidation evidence
- PITR/logical backup inventory and isolated restore timing
- hourly signed numbering/audit/outbox control-ledger inventory and no-number-reuse reconciliation
- canonical HTTPS domain, secure cookies, OAuth redirect and CSP
- Supabase production RLS/grants/provider target
- dual-device session and revoked-provider negative tests
- production smoke company/tenant and cleanup evidence
- rollback owner, decision point and evidence preservation
- capability matrix proving every file/upload/preview/release workflow remains UI/API closed and GCS PDM provider remains dormant
- schema diff proving no launch-time legacy table rename/move and no browser grants
- exact named 3-5-user allowlist; every non-canary login/business API denied
- server-only allowlist accepts only stable PDM user IDs, fails closed when missing/malformed/empty, is rechecked per business request and records a sorted configuration hash
- `DEV-FIELD-001` script, evidence owner and issue-intake mechanism ready, but completed field evidence is not required before canary deployment

Phase 3A.1 production-canary field acceptance and wider-opening gate:

- named canary users execute official numbering, draft creation, unavailable-feature, permission and recovery scenarios
- screenshots, audit correlation, issue register and accountable signed go/no-go are complete
- no open P0 security/data-integrity defect; every P1 has an accepted owner/deadline or wider opening remains blocked
- allowlist expansion and pilot-accepted status remain impossible before this gate passes; after passing, expansion follows approved `HD-5-2` rather than opening automatically
- database-outage exercise proves fail-closed numbering and no paper/Excel/offline/backfill path

Phase 3B GCS file release, separately gated and not required for Phase 3A:

- complete legacy file inventory and approved exception set
- pre-copy/final-delta/hash/CRC32C/generation/backup receipt parity
- primary-to-backup-project object inventory and no-delete propagation
- file workflows closed during pointer transaction and provider-aware smoke
- safe pointer rollback before file writes open; later rollback closes writes and requires reverse-copy/fix-forward approval
- exact file-workflow capability allowlist, permission matrix, visible-error sweep and recovery proof before opening

## Phase 4 Ontology/Event Gate

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| GSP-ONT-001 | P0 | Register Drawing/Part/BOM object twice | one stable owner-domain/native identity; deterministic duplicate result |
| GSP-ONT-002 | P0 | Invalid relation/cardinality/type | rejected without domain mutation |
| GSP-ONT-003 | P0 | Relation temporal boundary | before/at/after results deterministic |
| GSP-ONT-004 | P0 | Execute Action twice with same idempotency key | one business mutation/audit/event |
| GSP-ONT-005 | P0 | Cross-module direct table mutation | prohibited; command/read/event boundary required |
| GSP-ONT-006 | P0 | Publish retry/consumer replay | one logical event and idempotent checkpoint |
| GSP-ONT-007 | P0 | AI attempts direct DB write | denied; approved Action API required |
| GSP-ONT-008 | P1 | Object answer shown to user | stable object ID, owner domain, version and provenance visible |
| GSP-ONT-009 | P0 | `request_pdm_change` action | delegates to PDM command/approval; registry cannot update PDM row |
| GSP-ONT-010 | P1 | `pdm_traceability_projection` delivery | event-to-projection p95 <= 5 minutes; replay creates no duplicate link/action |
| GSP-ONT-011 | P0 | Register Project/Equipment without ProJED owner contract | rejected; no registry/projection row created |

## Phase 5 18-Month Decision Gate

Required scorecard:

- monthly Supabase and Google Cloud cost by environment/service
- database request p50/p95/p99 and failed transaction rate
- cross-cloud egress volume
- availability incidents and user-visible minutes
- restore drill RTO/RPO
- monthly administration/support hours
- security/RLS portability findings
- estimated Cloud SQL migration effort, downtime and rollback risk

The scorecard may recommend remain, prepare migration or collect six more months. It cannot execute migration.

Decision rules:

- Default is `remain_on_supabase`.
- `prepare_cloud_sql_migration` requires one hard security/restore/availability blocker, or at least two sustained triggers for three consecutive months after query/index/application tuning.
- Sustained triggers: critical DB p95 > 500 ms or p99 > 1.5 s attributable to cross-cloud access; Supabase+egress/support TCO >= 1.5x Cloud SQL; availability < 99.9% or two severity-1/2 cross-cloud incidents in six months; DB support > 8 person-hours/month.
- Migration preparation also requires <= 18-month modeled payback, feature/security parity and a successful rehearsal. Otherwise select remain or six-month reassessment.

## UI Visible-Error and Data-Sanity Gate

Validate login, MFA enrollment/challenge, invitation/recovery, upload intent/finalize and unavailable/read-only states at 1440x900, 1024x768 and 390x844:

- no unexpected `.inline-error`, `[role=alert]`, HTTP 4xx/5xx, raw `/api/...` error, stack trace or provider code is visible during successful flows
- expected failures show concise Traditional Chinese action guidance and a safe correlation/reference ID; they never expose token, signed URL, bucket, secret or raw SQL
- no horizontal overflow, overlap, clipped modal/popover, truncated action, or hidden MFA/upload blocker
- success is not accepted when critical account/file counters are unexpectedly zero or the fixture expects mapped identities/files
- a visible failure is a QC failure until the same URL/state is hard-reloaded and reverified; build/API success cannot erase it

## Observability and Outage Gate

- Verify Severity-1 alert fan-out reaches two named platform owners and records a 30-minute business-hours acknowledgement target without claiming 24/7 staffing.
- Trigger pool exhaustion, database unavailable, stale control ledger (>2 hours), GCS backup lag (>1 hour), two consecutive backup failures and upload queue age (>30 minutes); each produces one deduplicated incident signal and safe UI state.
- During database outage, official-numbering create/reserve APIs fail closed and UI states that numbering is temporarily unavailable. No spreadsheet/paper/offline number or later backfill path exists.
- Verify each hourly numbering ledger batch is immutable, SHA-256 checked, prior-manifest chained and Cloud-KMS-signature verified. Restore reconciliation must create only non-reusable recovery reservations for signed issued numbers missing from the restored DB; it must not fabricate business records or reopen numbering before high-water checks pass.
- Verify operational logs retain 90 days, security incident evidence at least one year, and no secret/token/signed URL enters logs. Business audit remains separate PostgreSQL evidence.

## No-Go Criteria

- Two live employee IAM authorities or email-based automatic merge.
- Firestore and PostgreSQL dual operational writes.
- GCS and Supabase Storage dual primary pointers.
- Firebase JWT or browser client reaching operational Supabase Data API/Storage/Realtime without a new ADR.
- Drive reverse sync or restore without controlled verification.
- Browser/service-role secret exposure.
- Provider cutover without stable-ID and audit parity.
- Firebase cutover with an incomplete account manifest, unresolved identity collision or unspecified legacy-login coexistence.
- Session signing key without bounded rotation/previous-key verification and emergency invalidation behavior.
- Pub/Sub publication before commit or without idempotent retry.
- Ontology registry becoming a second editable copy of domain truth.
- AI/analytics service becoming required for core PDM availability.
- Production resource, billing, migration or deploy action in a documentation/local-adapter turn.
- Treating GCS file migration as a Phase 3A numbering/draft launch prerequisite.
- Moving/renaming legacy public tables in Phase 3A or creating duplicate PDM tables in a bounded schema.
- Registering Project/Equipment ontology objects without a ProJED/platform source-authority contract.
- Requiring completed `DEV-FIELD-001` evidence before the named production canary can be deployed, or widening access before that evidence passes.
- Treating password reset, equal email or Firebase email-link completion alone as canonical PDM invitation acceptance.

## Evidence Required

- focused unit/integration/QC report for each implemented phase
- schema/provider/import and secret-boundary scans
- Firebase BFF session, TOTP, email-link invitation/password-link, break-glass and Supabase browser-denial/runtime-role matrix
- GCS upload/finalize/version/retention matrix
- PITR/logical-backup/control-ledger/GCS cross-project inventory and quarterly operational/catastrophic SLO restore report
- build and runtime smoke in production-like container
- staging latency/cost/failure report
- object/link/action/event idempotency report
- Git boundary proving no ProJED or production resource changes
- desktop/mobile screenshots and visible-error/data-sanity sweep for each UI-bearing phase
- Phase 3A/3B capability matrix, public/bounded-schema inventory and outage/alert evidence
- Phase 3A.0 named-user canary release evidence plus separate Phase 3A.1 field-test/issue/go-no-go evidence
- invitation setup-state/orphan cleanup, two-person privileged-MFA recovery and canary allowlist configuration-hash evidence
- numbering continuity ledger manifest/signature/chain and recovery-reservation reconciliation evidence

## Release Boundary

Passing Phase 0 or Phase 1 does not make the platform production ready. Billing, live providers, DNS, migrations, pointer switches, deploy, rollback and production smoke remain under explicit staging/release gates.
