# QA-PDM-ERP-MODULE-FOUNDATION-001 - ERP-ready AI_PDM platform validation plan

Date: 2026-07-12
Status: QA executed for Phase 1-3 local development; QC report passed 2026-07-12
Related DEV: `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044`
Related SPEC: `.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`

## Validation Objective

Verify that AI_PDM can become an independently deployable PDM module in a future ERP platform without changing current ProJED, weakening controlled PDM rules, exposing privileged credentials, duplicating identities, or expanding the first official-numbering / draft production slice.

This plan validates development phases only. Production migration, shared-IAM cutover, deployment, rollback and production smoke remain release-gated.

## Scope

In scope:

- Server-derived actor and organization context.
- Framework-independent command/application boundary.
- Payload-spoof denial.
- Critical mutation transaction and idempotency behavior.
- Atomic audit/outbox contract in Phase 2.
- SQLite/PostgreSQL/Supabase migration parity where Phase 2 applies.
- Client/server import and secret boundary.
- Existing numbering/draft/auth regression.
- Evidence that no ProJED file is modified by AI_PDM phases.

Out of scope:

- ProJED implementation or verification.
- ERP portal implementation.
- Shared Auth provider cutover.
- Accounting, inventory, purchasing, payroll or tax workflows.
- Production deployment or live migration.

## Risk Matrix

| Risk ID | Priority | Failure mode | Required control |
|---|---|---|---|
| ERP-FND-R01 | P0 | Client payload overrides actor/company | Server context is authoritative; spoof tests deny without mutation |
| ERP-FND-R02 | P0 | Refactor allocates duplicate official numbers | Idempotency and existing sequence transaction tests remain passing |
| ERP-FND-R03 | P0 | Mutation commits while audit/outbox fails | Same transaction and rollback test |
| ERP-FND-R04 | P0 | Browser bundle exposes privileged credential/module | Static import/env scan and production build inspection |
| ERP-FND-R05 | P0 | Another module can mutate PDM tables directly | Contract and DB role/default-deny checks |
| ERP-FND-R06 | P0 | Existing PDM user/history is rewritten during IAM preparation | Mapping-only migration contract and collision dry-run |
| ERP-FND-R07 | P1 | Event retry duplicates downstream action | Unique event/idempotency key and consumer contract |
| ERP-FND-R08 | P1 | SQLite and PostgreSQL semantics diverge | Provider-parity transaction and migration QC |
| ERP-FND-R09 | P1 | ERP work silently opens formal PDM workflows | Production-slice regression and route allowlist check |
| ERP-FND-R10 | P0 | AI_PDM task modifies ProJED | Cross-workspace diff evidence must show zero ProJED changes |

## Required Fixtures

| Fixture | Purpose |
|---|---|
| `ERP-FND-ADMIN` | Valid Admin actor/context |
| `ERP-FND-ENGINEER` | Allowed numbering/draft actor |
| `ERP-FND-NO-CREATE` | Authenticated actor without create permission |
| `ERP-FND-JENFU` | Normal company context |
| `ERP-FND-OTHER-COMPANY` | Cross-company spoof/isolation case |
| `ERP-FND-IDEMPOTENCY` | Repeated command key |
| `ERP-FND-FAIL-AUDIT` | Forced audit/outbox failure inside disposable transaction |
| `ERP-FND-COLLISION` | Future identity mapping collision fixture, Phase 3 only |

Fixtures must be disposable. No production or user-owned controlled record may be mutated by this QA plan.

## Phase 1 Acceptance Matrix

### Actor and organization context

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-CTX-001 | P0 | Valid authenticated request enters selected P0 route | Application service receives server-derived principal, PDM user and company context |
| ERP-FND-CTX-002 | P0 | Payload contains another `actorId` | Payload value is ignored/rejected; authenticated actor remains authoritative |
| ERP-FND-CTX-003 | P0 | Payload contains another `companyId` | Cross-company mutation is denied before allocation/write |
| ERP-FND-CTX-004 | P0 | Session user is suspended/offboarded | Existing auth policy denies command |
| ERP-FND-CTX-005 | P1 | Correlation/request ID is missing | Server generates valid non-secret IDs |
| ERP-FND-CTX-006 | P0 | Context is logged or audited | No token, password hash, OAuth code, nonce, secret or signed URL is stored |

### Command and route boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-CMD-001 | P0 | Numbering create route receives valid command | Route delegates to application/domain service; existing result contract remains compatible |
| ERP-FND-CMD-002 | P0 | Same idempotency key is submitted concurrently | At most one logical official record/sequence allocation exists |
| ERP-FND-CMD-003 | P0 | Unknown command/schema version | Stable validation error; no mutation |
| ERP-FND-CMD-004 | P0 | User lacks required role/scope | API denies; no sequence, audit-success or outbox-success record |
| ERP-FND-CMD-005 | P1 | Route handler is inspected | Transport parsing only; no duplicate weaker lifecycle/controlled-boundary predicate |
| ERP-FND-CMD-006 | P0 | Part-draft void/recycle executes | Existing controlled-boundary predicate remains authoritative |
| ERP-FND-CMD-007 | P0 | Formal workflow outside production slice is called | Existing production-slice gate still fails closed |

### Client/server boundary

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-SEC-001 | P0 | Client dependency graph is scanned | No `pg`, `better-sqlite3`, server repository, DB admin or privileged provider module is imported into client code |
| ERP-FND-SEC-002 | P0 | Production bundle/config is inspected | No service-role, DB admin, OAuth client secret, storage admin or worker token is exposed |
| ERP-FND-SEC-003 | P0 | Browser attempts direct privileged Data API write | Denied; approved application path remains server API |
| ERP-FND-SEC-004 | P1 | Normal server request accesses DB | Uses bounded application/repository path; does not grant unrestricted service role to browser/user |

## Phase 2 Acceptance Matrix

### Atomic mutation, audit and outbox

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-TX-001 | P0 | Business mutation succeeds | Business row, audit and logical outbox event commit once |
| ERP-FND-TX-002 | P0 | Audit insert is forced to fail | Business mutation and outbox insert roll back |
| ERP-FND-TX-003 | P0 | Outbox insert is forced to fail | Business mutation and audit roll back |
| ERP-FND-TX-004 | P0 | Duplicate command is retried | No second number/allocation/event; stable prior result or conflict |
| ERP-FND-TX-005 | P0 | Concurrent commands target same aggregate/version | One succeeds; loser receives stable conflict without partial rows |
| ERP-FND-TX-006 | P1 | Event delivery fails | Pending row records bounded retry state; business transaction is not undone |
| ERP-FND-TX-007 | P0 | Browser/user attempts outbox insert/ack | RLS/grant/default-deny blocks operation |
| ERP-FND-TX-008 | P0 | Event payload is inspected | Stable IDs/business facts only; no secret or signed URL |

### Provider and migration parity

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-DB-001 | P0 | SQLite migration applies to disposable DB | Additive schema and indexes apply without changing existing data |
| ERP-FND-DB-002 | P0 | PostgreSQL shadow migration applies | Schema, constraints and indexes match contract |
| ERP-FND-DB-003 | P0 | Supabase migration/RLS manifest is checked | Migration is ordered; direct access remains denied |
| ERP-FND-DB-004 | P0 | Atomic rollback test runs on both providers | Equivalent business result and rollback semantics |
| ERP-FND-DB-005 | P1 | Migration is reapplied or checked idempotently | No duplicate table/index/policy failure under project migration policy |

## Phase 3 Contract Tests

These contract tests are executable against the provider-neutral mapping foundation after ADR-002 approval. Live provider/MFA/session-revocation tests remain release-gated.

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-IAM-001 | P0 | Google identity and local-password identity belong to same approved person | One platform principal maps to one stable PDM user |
| ERP-FND-IAM-002 | P0 | Same email has conflicting provider/person evidence | Migration blocks and reports collision; no silent merge |
| ERP-FND-IAM-003 | P0 | Platform organization differs from PDM company mapping | Access fails closed until explicit mapping exists |
| ERP-FND-IAM-004 | P0 | User is suspended/offboarded centrally | New and existing access follows approved revocation policy |
| ERP-FND-IAM-005 | P0 | Historical PDM audit is queried after mapping | Original PDM actor remains resolvable and traceable |
| ERP-FND-IAM-006 | P1 | Provider changes but platform principal is stable | PDM authorization/history is unchanged |

## Phase 4 Contract Tests

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ERP-FND-INT-001 | P0 | ERP shell opens AI_PDM | One identity context; no second unmanaged account |
| ERP-FND-INT-002 | P0 | Consumer requests PDM command twice | Idempotency prevents duplicate controlled mutation |
| ERP-FND-INT-003 | P0 | Consumer attempts direct table/sequence write | Denied |
| ERP-FND-INT-004 | P1 | Another module is unavailable | AI_PDM approved local functions remain bounded and diagnosable |
| ERP-FND-INT-005 | P1 | AI_PDM deploys independently | Contract version remains compatible or fails explicitly |
| ERP-FND-INT-006 | P0 | ProJED has not received separate approval | No ProJED file, schema, credential or deployment is changed |

## Regression Gate

At minimum after Phase 1 implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-production-slice-numbering-draft
npm.cmd run qc:pdm-account-invitations
npm.cmd run qc:pdm-google-identity
npm.cmd run qc:managed-auth
npm.cmd run qc:pdm-numbering-sequence-integrity
```

Focused QC to add in Phase 1:

```powershell
npm.cmd run qc:pdm-erp-module-foundation
```

Phase 2 also requires:

```powershell
npm.cmd run qc:postgres-shadow
npm.cmd run qc:supabase-runtime-migrations
```

The focused QC must cover context spoofing, client/server imports, secret redaction, route ownership, idempotency and the no-ProJED-change boundary. Phase 2 extends it with atomic audit/outbox and provider parity.

## No-Go Criteria

QC must fail if:

- Client-provided actor/company overrides authenticated context.
- A duplicate request allocates a second official number.
- Controlled mutation commits without required audit/outbox evidence in Phase 2.
- A browser bundle exposes privileged credentials or imports server DB modules.
- A new path weakens existing permission, production-slice or controlled-boundary rules.
- Stable PDM user/company/object IDs are rewritten without approved migration.
- Any ProJED file is modified under this AI_PDM DEV.
- A live migration, provider cutover, production deploy or release action occurs without release gate.

## Evidence Required

Phase 1:

- Route/application/repository/transaction ownership inventory.
- Focused static and runtime QC report.
- Context spoofing and concurrent idempotency results.
- Typecheck, lint, build and regression outputs.
- AI_PDM-only Git diff and explicit zero-ProJED-change evidence.

Phase 2:

- SQLite/PostgreSQL migration and rollback evidence.
- RLS/default-deny and Data API exposure evidence.
- Forced audit/outbox failure rollback results.
- Event schema/version/redaction report.

Phase 3+:

- Human-approved IAM/core decisions.
- Collision/mapping dry-run and staging identity evidence.
- Contract compatibility, SSO, trace and independent-deploy evidence.

## Release Boundary

Passing this QA plan does not authorize merge, PR, production migration, deployment, rollback, production smoke or release. Those remain under `DEV-030`, `DEV-031` and `DEV-032` after an explicit release instruction.
