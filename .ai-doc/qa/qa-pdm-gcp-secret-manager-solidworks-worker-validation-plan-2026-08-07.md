# QA-PDM-GCP-SECRET-MANAGER-SOLIDWORKS-WORKER - 強化驗證計畫

Status: `QA Plan Ready / Strengthened / Local Phase 1A-1D Evidence Passed / Live Google Evidence Gated`
Date: 2026-08-07
Owner: Dev PM / QA
Related DEV: `DEV-058` / `DEV-PDM-GCP-SECRET-MANAGER-SW-WORKER-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`

## 1. Purpose and Verdict Units

Verify that SolidWorks Document Manager key material is governed by Google Secret Manager, lifecycle metadata remains in Cloud SQL, and a trusted Windows worker can obtain only the exact active version without exposing the key to unauthorized or persistent surfaces.

This plan produces four separate verdicts. They must never be collapsed into one generic `PASS`:

| Verdict | Required evidence | Meaning |
|---|---|---|
| `Local implementation passed` | L1 + L2 | Code, schema, lifecycle, broker and UI contracts work with disposable/fake dependencies |
| `Staging provider verified` | L3 | Real Google Secret Manager IAM, add-version/read and Cloud SQL metadata-only behavior passed |
| `2D native readiness passed` | L3 + L4 | Real Windows worker produced and displayed a valid `.SLDDRW` derivative |
| `Production release ready` | Deployment release gate | Exact artifact, production target, IAM, migration, rollback and post-deploy smoke passed |

A saved key, passed fake adapter test, healthy 3D worker or successful Secret Manager read is not sufficient to claim 2D native readiness.

## 2. QA/QC Role Boundary

- QA owns this plan, test design, data requirements, acceptance and fail criteria. QA does not modify product code.
- RD implements the provider, schema, lifecycle, worker and automated test support.
- QC executes this plan, records facts and evidence, and does not repair failures.
- Any P0/P1 failure returns to RD. QC must rerun the failed case and its dependent regression cases after correction.
- Production deployment, live IAM mutation and release evidence remain under the deployment release gate.

## 3. Scope

In scope:

- Provider selection and Google Secret Manager adapter.
- Exact immutable secret-version references.
- Cloud SQL/SQLite metadata-only schema and migration compatibility.
- Admin lifecycle: draft, test, activate, retire and revoke.
- RBAC, same-origin mutation and redacted API behavior.
- Worker credential broker authentication, caching, no-store and redaction.
- Credential readiness versus capability-specific Windows 2D worker presence.
- Preview queue, heartbeat, stale recovery, derivative source hash and browser auto-update.
- Settings and preview UI states, visible-error gate, information hierarchy, RWD and accessibility smoke.
- Existing settings, Drive, 3D Shell, PDF/image/Drive preview and DB-provider regression.

Out of scope for local QA:

- Creating/deleting live Google resources or changing live IAM.
- Production migration, data repair, deployment or release.
- Secret version disable/destroy/delete.
- Supabase plaintext migration.
- `.SLDDRW -> PDF`, interactive 3D or high-fidelity re-rendering.

## 4. Evidence Levels and Environment Controls

| Level | Environment | Allowed mutation | Required controls | Can prove |
|---|---|---|---|---|
| L1 static/fake | Source tree + injected fake adapter | Source/test fixtures only | No network; random synthetic secret; no live credentials | Contract and redaction design |
| L2 local integration | Local BFF + disposable SQLite/PostgreSQL + fake Secret Manager | Disposable DB and temp files only | Production connection/write false; cleanup verified | Local implementation |
| L3 live staging | Reviewed staging target + pre-provisioned secret + Cloud SQL | Add one controlled version and lifecycle metadata only | Explicit release authorization; target/IAM readback; no disable/destroy | Provider integration |
| L4 native worker | L3 plus trusted Windows host and controlled SolidWorks files | Preview jobs/derivatives for controlled fixtures | Real key through broker; source hashes; worker/log redaction | 2D native readiness |

Fail-fast environment preflight:

1. Record run ID, timestamp, source commit/dirty boundary, database provider and target alias.
2. Confirm local phases cannot resolve a production Cloud SQL or Google project target.
3. Confirm `PDM_ENABLE_GCP_SECRET_READS/WRITES` default off outside explicitly authorized live staging.
4. Confirm no real Document Manager key, worker token or service-account JSON is printed or copied into evidence.
5. Stop if the effective target cannot be distinguished from production.

## 5. Test Data and Secret-Sentinel Rules

Required fixtures:

| Fixture | Purpose |
|---|---|
| Runtime-generated synthetic secret A | Draft/test/activate and redaction |
| Runtime-generated synthetic secret B | Rotation and exact-version proof |
| Correct, wrong, missing and malformed worker tokens | Broker authorization matrix |
| Admin, Manager/Reviewer and Engineer actors | RBAC matrix |
| `local_test_double`, historical `supabase_vault`, draft/tested/active/revoked Google references | Readiness and compatibility matrix |
| Existing lifecycle rows with test/activation events | Migration preservation |
| Controlled `.SLDDRW`, `.SLDPRT`, PDF and image files with recorded hashes | Native and regression proof |
| Blank/low-information PNG | Derivative quality negative case |

Sentinel handling:

- Generate each synthetic key at runtime; do not hardcode it in source, test snapshots or commands.
- Evidence may store only a SHA-256 fingerprint and approved masked hint.
- Plaintext is permitted transiently only in the Admin secret input/request, server adapter request, Secret Manager value, authorized broker response and worker process memory.
- Plaintext is forbidden in browser responses, persistent browser storage, URL/history, Cloud SQL/SQLite, job payloads, logs, audit, exceptions, screenshots, video, Playwright trace/HAR, report JSON and repository files.
- Do not record a browser trace/HAR while entering a real key. L3/L4 evidence must mask the input surface.
- A persisted sentinel occurrence is P0 even if the functional test succeeds.

## 6. FMEA

| Failure mode | Possible cause | User/Business impact | Detection | Priority | Control / Test |
|---|---|---|---|---|---|
| Key persists outside approved secret surfaces | Request/body logging, DB field misuse, trace/HAR capture | Credential disclosure | Runtime sentinel scan + DB/log/artifact search | P0 | GSM-QA-SEC-001, GSM-QA-SEC-002, GSM-QA-SEC-003 |
| Runtime resolves `latest` | Mutable alias used instead of activated reference | Wrong key after rotation | Adapter assertion + A/B rotation | P0 | GSM-QA-VER-001, GSM-QA-VER-002 |
| Cross-project/secret reference accepted | Missing resource-name validation | Secret boundary escape | Mismatched project/secret negative test | P0 | GSM-QA-VER-003 |
| Supabase remains active production provider | Old default/branch survives | Split authority; worker cannot read key | Static/runtime provider matrix | P0 | GSM-QA-AUTH-001 |
| Failed/untested draft activates | Lifecycle guard or transaction defect | Broken key becomes active | Negative lifecycle/API test | P0 | GSM-QA-LIFE-002 |
| Two active references exist | Concurrent activation race | Non-deterministic credential | Concurrent activation + unique-index query | P0 | GSM-QA-LIFE-004 |
| Revoked reference remains usable | Broker cache/query bypass | Disabled credential still processes jobs | Post-commit broker and bounded worker refresh test | P0 | GSM-QA-LIFE-003, BROKER-006 |
| Broker accepts bad token | Weak comparison/missing guard | Credential theft | Missing/wrong/malformed token matrix | P0 | GSM-QA-BROKER-001 |
| Broker response is cacheable | Missing headers on success/error | Secret retained by intermediary/browser | Header test for every status family | P0 | GSM-QA-BROKER-002 |
| Windows worker receives Google credentials | Direct SDK/service-account workaround | Cloud account compromise | Worker source/env/file scan | P0 | GSM-QA-BROKER-004 |
| Cloud Run has broad Admin/destroy rights | Project-level role shortcut | Excessive blast radius | IAM/Terraform readback and deny test | P0 | GSM-QA-IAM-001, GSM-QA-IAM-002 |
| Migration loses lifecycle/audit rows | Unsafe table rebuild/check replacement | Governance evidence corruption | Before/after row/hash/index comparison | P0 | GSM-QA-MIG-001, GSM-QA-MIG-002 |
| UI reports worker ready from metadata | Readiness dimensions collapsed | User waits with no service | Readiness truth table + browser state test | P1 | GSM-QA-READY-001, GSM-QA-READY-002 |
| 3D heartbeat implies 2D readiness | Capability not separated | False 2D health | Capability-specific fixture | P1 | GSM-QA-READY-003 |
| Long-running job has no clear recovery | Polling/heartbeat/stale logic regresses | User cannot know whether to wait | Timed browser/job-state test | P1 | GSM-QA-READY-004 |
| Google 403/404/429/5xx leaks raw body | Direct error forwarding | Infrastructure disclosure/confusing UI | Fault-injection matrix + rendered text scan | P1 | GSM-QA-NEG-001 |
| Blank derivative marked ready | Missing quality gate | Misleading drawing preview | Blank/low-information fixture | P1 | GSM-QA-NATIVE-003 |
| Existing preview/settings regress | Cross-cutting provider changes | Loss of working capability | Focused regression suite | P1 | GSM-QA-REG-001, GSM-QA-REG-002 |

## 7. Requirement Traceability and Phase Gates

| RD phase | SPEC acceptance | QA cases | Exit gate |
|---|---|---|---|
| 1A Provider/schema | GSM-AUTH/DATA/VERSION/MIG | A001-A011 | Adapter, fresh schema and upgrade/rollback guards pass |
| 1B Lifecycle/UI | GSM-LIFE/RBAC/READY/NEG | B001-B014 + UI matrix | Lifecycle, RBAC, readiness and browser hard gates pass |
| 1C Worker broker | GSM-BROKER/READY | C001-C012 | Broker security, bounded refresh and worker contract pass |
| 1D Local QC | GSM-REG/EVID | D001-D008 | L1/L2 aggregate has no open P0/P1 |
| Release activation | GSM-IAM/EVID + native | E001-E010 | L3 then L4 pass under release authorization |

An earlier phase may pass independently. Failure in a later phase must not erase valid earlier evidence, but it blocks the dependent verdict.

## 8. Detailed Test Cases

### 8.1 Phase 1A - Provider, Adapter and Schema

| ID | Preconditions | Action | Expected result | Evidence |
|---|---|---|---|---|
| A001 / GSM-QA-AUTH-001 | Non-test runtime matrix | Start with unset, `local_test_double`, `supabase_vault`, `google_secret_manager` | Staging/production accepts only Google; local double stays visibly mocked; new Supabase draft is rejected | Provider unit/API matrix |
| A002 / GSM-QA-VER-001 | Fake add-version returns version 7 | Create draft A, test and resolve it | Metadata pins `projects/.../versions/7`; no `latest` in stored/runtime request | Adapter call + DB assertion |
| A003 / GSM-QA-VER-002 | Active A=v7, draft B=v8 | Activate B and resolve credential | B=v8 is read; A retires; changing fake `latest` does not affect result | A/B call log + lifecycle rows |
| A004 / GSM-QA-VER-003 | Fake returns malformed, other-project or other-secret name | Create/test draft | Request fails closed with stable redacted code; no metadata row points outside configured secret | Negative adapter test |
| A005 / GSM-QA-NEG-001 | Fault-inject 403, 404, disabled, 429, timeout, 5xx | Add/read exact version | Stable redacted domain code; no raw Google body; retryability classification is correct | Fault matrix |
| A006 / GSM-QA-SEC-003 | Scan server/browser module graph | Build/static inspect | Google auth/Secret Manager client remains server-only; no `NEXT_PUBLIC_` privileged value or browser import | Static dependency scan |
| A007 / GSM-QA-MIG-001 | Fresh SQLite and PostgreSQL | Apply current schema/migrations | `google_secret_manager` accepted; one-active constraint and FKs/indexes exist | Schema query |
| A008 / GSM-QA-MIG-002 | Existing DB with local/Supabase refs, tests and events | Apply compatibility migration | Row counts, IDs, hashes, FKs and event links preserved | Before/after manifest |
| A009 / GSM-QA-MIG-003 | DB contains one Google reference | Attempt schema rollback to old provider check | Rollback refuses safely; no row deletion/rewrite | Negative migration test |
| A010 / GSM-QA-DATA-001 | Synthetic draft persisted | Query all settings metadata/audit tables | Only provider, exact reference, mask, fingerprint and lifecycle/test metadata exist; no plaintext | Disposable DB scan |
| A011 / GSM-QA-GATE-001 | Read/write gates unset, false and malformed | Invoke draft/test/broker provider paths | Calls fail with stable blocked codes before any Google request; only explicit exact `true` enables the corresponding path | Gate matrix + fake call count |

### 8.2 Phase 1B - Lifecycle, RBAC, Readiness and UI

| ID | Preconditions | Action | Expected result | Evidence |
|---|---|---|---|---|
| B001 / GSM-QA-SEC-001 | Runtime-generated sentinel A | Admin submits draft | Input clears after success; response, browser storage, URL, DB, audit and evidence contain no plaintext | Browser/API/DB sentinel scan |
| B002 / GSM-QA-RBAC-001 | Admin, Manager/Reviewer, Engineer | Call create/test/activate/revoke routes | Admin succeeds when gates allow; others fail closed and receive no provider/resource detail | Role/status matrix |
| B003 / GSM-QA-LIFE-001 | Tested draft A and current active B | Activate A | A active and B retired in one transaction; one lifecycle event/audit record per transition | DB transaction assertions |
| B004 / GSM-QA-LIFE-002 | Untested, failed, blocked and disabled drafts | Attempt activation | Every attempt rejected; active reference unchanged | Negative API/DB test |
| B005 / GSM-QA-LIFE-004 | Two tested drafts, simultaneous requests | Activate concurrently | Exactly one active; loser gets stable conflict/invalid-state response; no partial audit | Concurrency test |
| B006 / GSM-QA-LIFE-003 | Active A then revoke commits | Fetch broker credential after commit | Broker no longer returns A; metadata remains historical; Google version is not destroyed | API/DB assertion |
| B007 / GSM-QA-READY-001 | All readiness fixture combinations | Read settings status | Result follows the truth table in section 9; no collapsed false-ready state | Service contract matrix |
| B008 / GSM-QA-READY-002 | `local_test_double`, historical Supabase, saved untested Google draft | Render settings/preview state | None reports credential ready, worker online or 2D ready | DOM + screenshots |
| B009 / GSM-QA-READY-003 | Healthy 3D Shell worker only | Render 2D status | 3D remains usable; 2D worker remains offline/not verified | Capability-specific UI evidence |
| B010 / GSM-QA-UI-001 | States from section 10 | Render each state | First sentence answers what to do; one primary CTA at most; no manual refresh CTA | Now What matrix + DOM count |
| B011 / GSM-QA-UI-002 | 1440x900, 1024x768, 390x844 | Open settings and attachment preview | No overlap, clipping, horizontal overflow or hidden required action | Screenshots + measurements |
| B012 / GSM-QA-UI-003 | Keyboard-only navigation | Operate input, test, activate, disclosure and return | Visible focus, labels, logical order and operable controls; expected validation errors are associated with fields | Accessibility smoke |
| B013 / GSM-QA-UI-004 | Current user-visible route/same fixture | Hard reload and exercise normal path | No unexpected `.inline-error`, `[role=alert]`, 4xx/5xx, route text, console/network failure or unexpected zero/missing data | Visible Error Sweep |
| B014 / GSM-QA-HTTP-001 | Authenticated Admin, unauthenticated client and foreign Origin | Submit each secret mutation route | Authenticated same-origin request follows lifecycle; unauthenticated and cross-origin requests fail before provider access and reveal no secret/provider detail | HTTP/origin matrix |

### 8.3 Phase 1C - Broker and Windows Worker Contract

| ID | Preconditions | Action | Expected result | Evidence |
|---|---|---|---|---|
| C001 / GSM-QA-BROKER-001 | Active readable fake key plus missing, short, malformed, wrong and correct tokens | Call broker | Invalid cases fail 401/403 without timing/error detail; correct scoped token is the only path that can receive the key | Route matrix + constant-time source assertion |
| C002 / GSM-QA-BROKER-002 | Success plus every error family | Inspect response headers | `private/no-store` and equivalent no-cache headers exist on all responses | Header assertions |
| C003 / GSM-QA-BROKER-003 | Active exact version A | Worker requests credential | Response source is Google and value matches A; response omits project/secret resource detail unless explicitly non-sensitive | Broker contract test |
| C004 / GSM-QA-BROKER-004 | Worker source/env/temp directories | Start worker and fetch credential | No Google SDK credential, service-account JSON or ADC file is required/written | Static + filesystem scan |
| C005 / GSM-QA-SEC-002 | Worker uses runtime sentinel | Run claim/render/fail paths | Key absent from stdout/stderr, reports, temp files, job payloads and derivative metadata | Worker sentinel scan |
| C006 / GSM-QA-BROKER-006 | Worker has cached A; B activates, then active ref revokes | Wait bounded credential refresh and poll cycle | Worker adopts B after rotation; after revoke it clears/invalidates cached key before claiming a new 2D job; no old-key fallback | Timed worker log + claim evidence |
| C007 / GSM-QA-READY-003 | 3D and 2D workers emit separate capability evidence | Start/stop each independently | Status attributes heartbeat/claim to correct capability | Capability matrix |
| C008 / GSM-QA-READY-004 | Queued/running jobs and controlled clock | Advance through heartbeat/stale thresholds | Running heartbeats; stale jobs requeue within contract and stop after max attempts | Job-state timeline |
| C009 / GSM-QA-READY-005 | Job recovered and old worker later completes | Submit stale worker completion | Completion rejected; current owner remains authoritative | API/DB negative test |
| C010 / GSM-QA-READY-006 | Browser on pending card | Complete job in background | Card updates automatically without user refresh | Video/screenshots + request log |
| C011 / GSM-QA-NATIVE-002 | Source hash changes after enqueue | Complete old derivative | Stale derivative rejected/hidden; current source remains authority | Source-hash negative test |
| C012 / GSM-QA-NATIVE-003 | Blank/low-information PNG | Submit completion | Job fails with human recovery state; blank output is never marked ready | Quality-gate/browser evidence |

### 8.4 Phase 1D - Local Aggregate and Regression

| ID | Preconditions | Action | Expected result | Evidence |
|---|---|---|---|---|
| D001 / GSM-QA-REG-001 | Existing settings fixtures | Run settings/Drive lifecycle regression | Existing Google Drive settings and generic secret lifecycle do not regress | Focused QC |
| D002 / GSM-QA-REG-002 | Existing preview fixtures | Run 3D Shell, PDF, image and Drive preview flows | Existing ready/fallback behavior remains unchanged | API/browser regression |
| D003 / GSM-QA-REG-003 | SQLite and PostgreSQL providers | Run provider contract suites | Both providers preserve async repository behavior and active uniqueness | DB-provider QC |
| D004 / GSM-QA-SEC-004 | Completed L1/L2 run | Scan repo/output/temp/log/DB/browser storage for sentinel | No forbidden occurrence; fingerprint/mask only | Redaction report |
| D005 / GSM-QA-ARCH-001 | Built application graph | Inspect request handlers | No native SolidWorks DLL/COM execution in Next.js request path | Static architecture test |
| D006 / GSM-QA-DOC-001 | Updated source and docs | Search provider/readiness terms | Active docs/code agree on Google authority and separate readiness; old Supabase path is historical only | Drift scan |
| D007 / GSM-QA-BUILD-001 | All focused tests passed | Run TypeScript, lint and isolated build if available | No new type/lint/build failure in affected scope | Command logs |
| D008 / GSM-QA-EVID-001 | Evidence manifest complete | Review all case links | Every required case has result/evidence; fake/live/native labels are correct | Traceability audit |

### 8.5 L3/L4 Release-Gated Cases

| ID | Preconditions | Action | Expected result | Evidence |
|---|---|---|---|---|
| E001 / GSM-QA-IAM-001 | Authorized staging target | Read IAM on exact secret | Runtime identity has accessor and optional version-adder only on intended secret | IAM readback |
| E002 / GSM-QA-IAM-002 | Same identity | Use IAM policy/readback or `testIamPermissions` for create/delete/disable/destroy and another secret; do not invoke destructive mutations | Dangerous and cross-secret permissions are absent; no broad Admin/destroy capability | Non-mutating permission deny evidence |
| E003 / GSM-QA-LIVE-001 | Pre-provisioned staging secret | Admin adds, tests and activates controlled version | Live add/read succeeds through app; exact version pinned | API + Secret Manager metadata |
| E004 / GSM-QA-LIVE-002 | E003 complete | Query Cloud SQL and Cloud Logging | Metadata-only DB; no secret in logs/audit/errors | Redacted query/log scan |
| E005 / GSM-QA-NATIVE-001 | Trusted Windows worker, real active key, controlled `.SLDDRW` | Start worker and enqueue preview | Claim, credential read, heartbeat, render, completion and accepted PNG succeed | Worker/API timeline |
| E006 / GSM-QA-NATIVE-004 | E005 derivative | Open same drawing in browser | Valid PNG appears automatically and matches current source hash | Browser screenshot + hash |
| E007 / GSM-QA-LIVE-003 | Active version A then B | Rotate and wait bounded refresh | Worker uses B for new jobs; A remains historical | Version/job correlation |
| E008 / GSM-QA-LIVE-004 | Active version revoked | Wait bounded refresh then enqueue | Broker denies; worker does not claim new 2D job with cached key; UI shows actionable blocked state | Broker/worker/UI evidence |
| E009 / GSM-QA-OBS-001 | Completed live run | Search Cloud Logging/evidence outputs | No key, Authorization header or raw Google error body | Sentinel/fingerprint scan |
| E010 / GSM-QA-CLEAN-001 | Live cases complete | Revoke test metadata and record retained Google version for owner cleanup | No automatic destroy/delete; cleanup ownership and residual version documented | Cleanup manifest |

## 9. Readiness Truth Table

| Active Google ref | Exact read | Worker token | Recent 2D capability evidence | Successful current/controlled preview | User conclusion | Must not claim |
|---|---|---|---|---|---|---|
| No | N/A | Any | Any | No | `需設定` | Credential/worker/2D ready |
| Draft/untested | Not eligible | Any | Any | No | `待測試` | Credential ready |
| Tested, not active | Readable | Any | Any | No | `可啟用` | Runtime ready |
| Active | Fail | Any | Any | No | `需管理員處理` | Worker/2D ready |
| Active | Pass | Missing | No | No | `憑證可讀，工作通道未設定` | Worker online |
| Active | Pass | Ready | No/stale | No | `憑證可用，預覽服務未在線` | 2D ready |
| Active | Pass | Ready | 3D only | No | `2D 預覽服務未在線` | 2D ready |
| Active | Pass | Ready | Recent 2D | No | `預覽服務在線，尚待實圖驗證` | 2D native ready |
| Active | Pass | Ready | Recent 2D | Yes | `2D 預覽可用` | Production release ready unless release gate also passed |

QC must verify both the service output and rendered wording. A single boolean `ready=true` without dimensions fails GSM-QA-READY-001.

## 10. UI Now What Matrix

| State | First visible answer | Primary next action | Detail layer |
|---|---|---|---|
| Missing key | `需要先設定授權金鑰` | `輸入授權金鑰` | Admin help |
| Draft | `這一版尚未測試` | `測試這一版` | Test history |
| Tested | `測試通過，可由管理員啟用` | `啟用已測試版本` | Version history |
| IAM/read failure | `憑證目前無法使用` | `重新測試憑證` | Admin-only redacted diagnostic |
| Credential ready, worker offline | `憑證可用，預覽服務尚未在線` | `查看服務狀態` for Admin; end user waits automatically | Admin diagnostic |
| Queued/running | `系統正在產生預覽` | No refresh CTA; automatic update | Elapsed time |
| Long-running | `處理較久，系統會自動接續` | No refresh CTA | Admin diagnostic |
| Failed/unavailable | `目前無法預覽` | `下載原檔` | Redacted reason/admin diagnostic |
| Ready | Preview is primary content | Optional open/download | History/details |

UI acceptance:

- A user can identify location, state and next action within five seconds.
- No state shows multiple competing primary CTAs.
- Technical identifiers, project ID, resource name, API route, worker token, raw status and raw Google errors are absent from the main surface.
- Normal ready state has no explanatory text that can be removed without changing a decision.
- Error/blocked states answer the user action before technical reason.

## 11. Browser and Visual Hard Gate

Required routes:

- `/settings/security`
- Representative drawing/attachment route containing 2D and 3D preview cards

Required viewport:

- `1440x900`
- `1024x768`
- `390x844`

For every route/state record URL, viewport, timestamp, fixture, screenshot path and result.

Immediate UI fail unless the case intentionally tests that error state:

- Visible unexpected `.inline-error`, `[role=alert]` failure, HTTP 4xx/5xx, `Not Found`, `Internal Server Error` or visible `/api/` route text.
- Unexpected empty/zero readiness data when the fixture should be configured.
- Manual refresh instruction/CTA in the normal preview recovery flow.
- Horizontal overflow, overlap, clipping, unreadable disabled state, inaccessible keyboard flow or hidden primary action.
- Main-surface secret/project/resource identifiers or redundant explanatory text.

## 12. QC Execution Order

1. Environment/target preflight and evidence manifest initialization.
2. L1 static/provider/architecture/redaction checks.
3. Disposable SQLite and PostgreSQL fresh/upgrade/rollback checks.
4. Lifecycle, RBAC, concurrency, rotation and broker API tests.
5. Local worker contract, heartbeat, stale recovery, source-hash and quality tests.
6. Real browser Now What/readiness/RWD/accessibility/visible-error checks.
7. Focused regression, TypeScript, lint and build.
8. Only after explicit release authorization: L3 Secret Manager/Cloud SQL/IAM.
9. Only after L3 passes: L4 real Windows `.SLDDRW` evidence.

Stop at the first P0. Continue after a P1 only to collect bounded diagnostic evidence; do not report the phase as passed.

## 13. Commands and Automation Ownership

Existing required commands:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:pdm-settings-center-secret-lifecycle
npm.cmd run qc:pdm-sw-native-preview-worker
npm.cmd run qc:pdm-sw-native-preview-redaction
npm.cmd run qc:master-attachments
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-postgres
npm.cmd run dev:local:check
```

Required new RD-owned focused command:

```powershell
npm.cmd run qc:pdm-gcp-secret-manager
npm.cmd run qc:pdm-gcp-secret-manager-runtime
```

The two focused commands cover provider/schema, lifecycle, exact-version read/write, fault mapping, redaction, cache/revocation and UI contract cases. Browser/manual and live cases remain separately evidenced.

The historical `qc:supabase-secret-boundary` may run only as a compatibility/redaction regression. It is not active-provider evidence.

## 14. Evidence Manifest

Each QC run must record:

- Run ID, timestamp, tester role and verdict unit.
- Commit SHA plus staged/unstaged boundary, without copying unrelated diffs.
- Environment level, DB provider, target alias and feature gates.
- Fixture IDs/hashes and synthetic secret fingerprint only.
- Command, exit code, duration and first meaningful failure.
- API case result/status/domain code without raw provider body.
- Before/after DB row counts, key constraints and migration hashes.
- Browser route, viewport, state, screenshot and visible-error/text-noise result.
- Worker capability, job ID, source hash, heartbeat/claim/complete timeline and derivative hash.
- Cleanup state and remaining release-gated evidence.

Forbidden evidence:

- Raw key, bearer token, Authorization header, service-account JSON.
- Full Google error response if it includes resource or identity detail.
- Browser trace/HAR/video that captured real secret entry.

## 15. Pass, Fail and Re-entry Rules

- P0: immediate phase fail and RD return. Includes leakage, wrong-version read, auth bypass, two active refs, destructive/data-loss migration, broad IAM or false 2D-ready claim.
- P1: phase fail. Includes misleading next step, capability confusion, stale recovery failure, visible runtime error, blank derivative ready or affected regression.
- P2: may remain only when it does not affect security, authority, data integrity, readiness truth or the primary user flow; owner and follow-up must be recorded.
- `未充分驗證`: required browser, viewport, role, DB-provider, live target or native evidence is missing.
- Current user-visible failure reopens the matching QC result even when a fresh API/build/test later succeeds.
- After RD correction, rerun the failed case, all cases sharing the changed boundary, and the aggregate regression gate.
- No local result may be worded as live, native or production readiness.

## 16. Completion Checklist

- [x] Phase 1A provider/schema gate passed.
- [x] Phase 1B lifecycle/UI gate passed.
- [x] Phase 1C broker/worker contract gate passed.
- [x] Phase 1D local aggregate gate passed.
- [x] Sentinel/redaction manifest passed with zero forbidden occurrence.
- [x] UI Now What, visible-error, text-noise and three-viewport evidence passed.
- [ ] L3 staging provider gate passed or remains explicitly release-gated.
- [ ] L4 native worker gate passed or remains explicitly blocked.
- [ ] Verdict uses one of the four defined units and does not overclaim.
- [ ] Remaining blockers, cleanup owner and next re-entry condition are recorded.
