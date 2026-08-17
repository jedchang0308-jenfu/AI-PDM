# QA DEV-068 - 圖面／CAD 全項辨識、同頁審核與正式化驗證計畫

Status: Focused Local QA Executed / Critical Path Passed / Extended Matrix & Production Evidence Gated
Date: 2026-08-12
Owner: QA
Related DEV: `DEV-068`
Implementation authority: `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`
Fixture authority: `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`

## 1. QA Objective

Verify that incomplete 3D properties do not block upload/management, every OCR/CAD/filename result remains a traceable candidate, users review all six categories on one page, multi-part baseline/differences remain correct, and only one authorized atomic formalization command can change formal PDM data.

This plan validates local Phase 1A～1D. It does not validate a paid/live OCR provider, production files, production migration, deployment or release.

## 2. Entry Criteria

- `PDM_DRAWING_RECOGNITION_V1=true` only in an isolated local environment with required unified drawing dependencies enabled.
- SQLite additive schema and PostgreSQL 033 pass dry-run/parity checks.
- recognition worker uses a disposable token and local repository; no production credential is present.
- A0005 source hashes match the fixture manifest.
- deterministic mock/fixture adapter identifies itself and is impossible to enable in production mode.
- RD supplies exact affected-file list, migration result, test commands and known limitations.

## 3. Evidence Standard

Each case records test ID, commit/worktree identity, DB provider, feature flags, actor/company, source hash, request/response status, before/after row counts or hashes, and result. Browser cases additionally record viewport, screenshot, console errors, failed network requests and focus/a11y observations. Secrets, raw customer text outside the fixture and local absolute provider paths are redacted.

## 4. Validation Matrix

### 4.1 Schema, parity and authority

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-001 | Fresh SQLite schema | All DEV-068 tables, constraints, indexes and append-only triggers exist. |
| DRR-002 | Existing SQLite dry-run/apply/reapply | Dry-run is zero-write; confirmed apply is additive; reapply is idempotent. |
| DRR-003 | PostgreSQL 033 clean apply/reapply guard | Logical schema matches SQLite; second unsafe apply is rejected or safely no-op per migration convention. |
| DRR-004 | Provider schema parity | Enum/check, unique, FK, index and immutable behavior produce equivalent outcomes. |
| DRR-005 | Feature off | Existing upload/revision behavior is unchanged; no session, route exposure or CTA appears. |
| DRR-006 | Canonical authority | Session references existing file assets/drawing/revision/parts and never copies or creates canonical identity. |
| DRR-007 | Legacy formal projection | Generic formal row wins; absent generic row falls back to `part_variant_attributes`; no double value appears. |
| DRR-008 | Append-only evidence/audit | Observation, decision, formalization event/link update/delete attempts fail in both providers. |

### 4.2 Session, source and worker

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-009 | Authorized automatic enqueue after first file | Upload succeeds and a queued session is returned/observable asynchronously. |
| DRR-010 | Sequential 3D＋2D upload | Complete source set creates/reuses one latest session; any earlier queued session is cancelled/superseded without rewriting its fingerprint. |
| DRR-011 | Duplicate hook/API retry | Same lineage/source fingerprint/idempotency does not duplicate sessions. |
| DRR-012 | Upload enqueue failure | File upload/submission still succeeds and returns a safe recognition warning. |
| DRR-013 | Claim concurrency | Two workers cannot claim the same session. |
| DRR-014 | Heartbeat and stale lock recovery | Active lock is retained; expired lock is retried within attempt limits with diagnostics. |
| DRR-015 | Source changed after create | Old session becomes stale and cannot formalize; successor uses new hash. |
| DRR-016 | One adapter unsupported | Visible unsupported diagnostic; successful adapters remain reviewable. |
| DRR-017 | One adapter timeout/failure | Session is `extraction_partial` when evidence exists; successful observations are preserved. |
| DRR-018 | All adapters fail | Queryable `extraction_failed`; no fabricated empty-success review. |
| DRR-019 | Worker token/lock/source validation | Missing/wrong token, worker ID, content hash or lock owner is rejected without stored observation. |
| DRR-020 | Payload bound/redaction | Oversized/malformed provider output is rejected; logs contain safe codes, not raw drawing text/secrets. |

### 4.3 Classification, baseline and decisions

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-021 | Source is not category | OCR/CAD/filename evidence appears under its destination domain, not separate competing tabs. |
| DRR-022 | Open unknown field | Unknown label is retained and can map/create/defer/ignore without evidence loss. |
| DRR-023 | Company field collision | Exact key is DB-rejected; similar label warns and requires explicit reviewer choice. |
| DRR-024 | Multi-source same value | UI groups the candidate while every source observation remains queryable. |
| DRR-025 | Multi-source conflict | All conflicting values/current formal value are visible; confidence does not auto-select. |
| DRR-026 | Overall vs local scope | Overall roughness may be a part attribute; local roughness/GD&T stays engineering evidence. |
| DRR-027 | Missing is not clear | Unrecognized/missing value never emits clear/not-applicable. |
| DRR-028 | Explicit not applicable | Direct `無/取消/N/A/不適用` evidence plus reason can propose the explicit state. |
| DRR-029 | Baseline all equal/strict majority/tie | All-equal and unique >50% mode are proposed; tie/no majority has no automatic baseline. |
| DRR-030 | Human baseline correction | Recalculation preserves explicit per-part decisions and surfaces stale conflict. |
| DRR-031 | Decision optimistic concurrency | Stale expected session version returns 409 and preserves prior decisions. |
| DRR-032 | Decision recovery | Reload restores server-saved decisions; failed explicit actions remain visibly retryable and are never represented as saved/formal data. |

### 4.4 Permission and tenancy

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-033 | RD own/assigned scope | RD can run/review/formalize non-Released own/assigned objects only. |
| DRR-034 | RD cross-owner scope | Same-company unassigned object is denied without leaking evidence. |
| DRR-035 | Manager/admin scope | RD manager, PDM admin and system admin work company-wide subject to lifecycle guard. |
| DRR-036 | Read-only roles | Document admin/QA/manufacturing/procurement/external specialist cannot run/review/formalize. |
| DRR-037 | Cross-company session/source/target | GET and every command return 404/403 per convention with zero leaked raw text, formal value or existence hint. |
| DRR-038 | Released/controlled target | Recognition formalize alone is insufficient; `post_release_change` and reason are both required. |
| DRR-039 | Auto enqueue authority | Internal enqueue records initiating actor but does not grant review/formalize permission. |

### 4.5 Write impact and formalization

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-040 | Write-impact zero-write | Counts/hashes of every formal table remain unchanged. |
| DRR-041 | Actual-change projection | Only creates/updates/explicit clears/conflicts/blockers/exclusions appear; no inherited/no-op row. |
| DRR-042 | Return to review | `返回核對` preserves review state and produces zero formal change/event. |
| DRR-043 | Valid atomic formalization | All values/notes/evidence/event/links/session terminal state commit once and are traceable. |
| DRR-044 | Forced target failure | Both providers roll back every intended row, event/link and terminal session update. |
| DRR-045 | Repeated idempotency key/same payload | Original result is returned; no duplicate write/event. |
| DRR-046 | Same idempotency key/different payload | Platform receipt payload mismatch rejects the command. |
| DRR-047 | Stale target after impact | 409 before mutation; user must recalculate impact. |
| DRR-048 | Concurrent formalization | Exactly one command commits in SQLite and PostgreSQL; the other reuses or conflicts safely. |
| DRR-049 | Missing relation/owner/field | Affected intended item blocks at 422; recognition does not create canonical relation/identity. |
| DRR-050 | Rerun after formalization | Successor session is new and editable; prior session/event/evidence remain immutable. |

### 4.6 UI, A0005 and accessibility

| ID | Scenario | Pass condition |
|---|---|---|
| DRR-051 | One-page six-section review | All sections exist in one scroll surface; navigator scrolls to anchors and shows complete blocker counts. |
| DRR-052 | Evidence drawer | Source/page/sheet/config/raw/extractor detail is protected; close restores focus and scroll position. |
| DRR-053 | Visual state semantics | Proposed/corrected/conflict/ignored/deferred/blocked use text/icon as well as color. |
| DRR-054 | Impact modal | CTA labels are exactly `確認寫入內容`, `返回核對`, `正式寫入 PDM`; no duplicate full preview page exists. |
| DRR-055 | Responsive 1440/1024/390 | No clipped blocker, owner, current value or intended change; narrow view remains operable. |
| DRR-056 | Keyboard/a11y | Logical tab order, named controls/regions, focus trap/return, Escape behavior and status announcements pass. |
| DRR-057 | A0005 source identity | Both file hashes, roles, lineage and three linked parts match the manifest. |
| DRR-058 | A0005 baseline/variants | Material/color/surface/note baseline and P02/P03 differences exactly match the manifest. |
| DRR-059 | A0005 partial capability | No real OCR/native adapter configured still yields a truthful filename/fixture/unsupported result and never reports OCR quality PASS. |
| DRR-060 | A0005 end-to-end no-write/write | Before final command zero formal rows change; valid command writes exact intended delta once with complete traceability. |

## 5. Browser Matrix

- viewports: `1440x900`, `1024x768`, `390x844`.
- states: queued, extracting, review-ready, partial, failed, conflict, blocked, stale, impact-ready, formalized.
- actors: RD owner, RD non-owner, RD manager, PDM admin, QA/read-only, cross-company user.
- mandatory sweeps: console errors, failed fetches, unexpected 5xx, horizontal overflow, hidden blockers, keyboard path, focus return and text alternatives.

## 6. Exit Criteria

Local QA can pass only when DRR-001～060 pass on the applicable provider/browser matrix, `build:isolated`, typecheck, affected ESLint and `git diff --check` pass, and reports prove zero formal mutation before confirmation plus zero partial mutation after forced failure.

The following remain separate release gates even after local QA PASS:

- approved real OCR/CAD executable/provider, license, cost and security review;
- representative production-safe gold set and measured field/owner correction rates;
- production migration artifact/dry-run and operator authorization;
- staging/production worker topology, protected object download and health monitoring;
- deploy, production smoke, rollback verification and release approval.

## 7. Stop Conditions

Stop and return to Dev PM/user if testing requires production/staging files or credentials, modifies the original A0005 bytes, installs/purchases a provider without authorization, finds a cross-company leak, observes any pre-confirmation/partial formal write, requires a distributed non-atomic target, creates canonical identity/relation through recognition, or can only pass by treating mock output as real OCR quality.

## 8. Focused Local Execution Result — 2026-08-12

Result: `PASS for authorized local critical path`; the full DRR-001～060 provider/actor/production matrix remains gated and is not claimed as executed.

Executed evidence:

| Evidence | Result | Covered facts |
|---|---|---|
| `npm run qc:dev-068:contract` | PASS | six categories, N/A vocabulary, missing-value safety marker, versioned/bounded external adapter, filename-only fixture rejection, governed open fields, `shell:false` |
| `npm run qc:dev-068:a0005-core` | PASS | verified A0005 hashes, 21 candidates, P01/P02/P03, baseline/variants, open field formalization, missing no-change, N/A reason, idempotency, append-only, stale target, atomic rollback |
| `npm run qc:dev-068:schema` | PASS | 14 SQLite + 14 PostgreSQL tables, PostgreSQL 18.4 disposable apply of 001 + 033, 3 permissions × 4 roles, 8 immutable-trigger tables, no destructive statement |
| `npm run qc:dev-068:browser` | PASS | actual Next login/API/worker flow, 401 worker guard, six sections, evidence drawer, desktop/mobile impact preview, Escape/Tab/focus return, no horizontal overflow, formalization |
| `npm run typecheck:app` | PASS | focused application TypeScript |
| `npm run build:isolated` | PASS | Next.js 16.3 production build, 127 pages, all recognition routes/page present |

Latest evidence directories:

- `output/qa/dev-068-drawing-recognition/contract-20260812102916-local-isolated/`
- `output/qa/dev-068-drawing-recognition/A0005-20260812102918-local-isolated/`
- `output/qa/dev-068-drawing-recognition/schema-20260812101840-postgres-local-isolated/`
- `output/qa/dev-068-drawing-recognition/browser-20260812103253-local-isolated/`

Known gates:

- No real OCR/native CAD extraction quality is claimed; the A0005 adapter is hash-locked local fixture evidence.
- Full fresh PostgreSQL chain is blocked by pre-existing migration 004 `approval_rules.phase` drift outside DEV-068; isolated PostgreSQL 001 + 033 semantic schema was executed successfully.
- Production/staging files, credentials, migration, distributed concurrency, deployment, rollback and representative user/gold-set validation remain release work.
