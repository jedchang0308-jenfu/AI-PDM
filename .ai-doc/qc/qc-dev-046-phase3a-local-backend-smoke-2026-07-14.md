# DEV-046 Phase 3A Local Backend Smoke QC Report

- Date: 2026-07-14 (Asia/Taipei)
- Status: `Local technical and named-user functional evidence passed / production not accepted`
- Target: disposable SQLite fixtures plus read-only verification of `data/ai-pdm.sqlite`
- Production/cloud impact: none

## Scope

This run verifies the numbering/draft backend without using the polluted local runtime database as an official numbering authority. It does not claim a named-user production canary or Cloud SQL staging/production acceptance. `DEV-FIELD-001` was later cancelled by Human Decision `HD-9-1`; cancellation is not recorded as evidence completion.

## Executed Evidence

| Command / check | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1a` contract | 19/19 passed |
| disposable runtime transaction smoke | 7/7 passed |
| disposable HTTP smoke | 21/21 passed |
| provider-outage fail-closed smoke | 1/1 passed |
| `npm run qc:pdm-number-state-flow-phase1b` | 14/14 passed |
| logged-in account audit observation | `user-b2525326-3f2`, `Login`, `2026-07-14T02:47:09.103Z` |

The disposable smoke covered unnumbered draft creation, idempotent replay, atomic candidate allocation, cancellation/recycling, rollback of business/audit/receipt/outbox writes, 20-way distinct-key collision resistance, same-key convergence, tenant isolation, authorization denial, same-origin enforcement, optimistic concurrency, provider outage handling, and no-store responses.

## Runtime Zero-Pollution Check

Read-only counts before and after the disposable test were identical:

| Table | Before | After |
|---|---:|---:|
| `part_number_drafts` | 0 | 0 |
| `numbering_draft_workspaces` | 0 | 0 |
| `numbering_draft_roots` | 0 | 0 |
| `numbering_draft_parts` | 0 | 0 |
| `numbering_draft_drawings` | 0 | 0 |
| `part_roots` | 8 | 8 |
| `part_numbers` | 9 | 9 |
| `drawing_numbers` | 11 | 11 |
| `audit_logs` | 768 | 768 |

No official number, candidate reservation, runtime draft, account, cloud resource, billing resource, DNS record, or file object was created by this run.

## Human UI Observation

The named user reported the following real UI observations on 2026-07-14:

| Observation | Result |
|---|---|
| Sign in through the normal UI | Passed |
| Acquire an official number | Passed |
| Sign out/sign in and find the assigned number still present | Passed |
| Optional series code for a non-shared manufactured part | Failed: the field was missing |
| Corrected series-code flow: field visible, value submitted, and value present after sign-in | Passed by named-user retest |

This is valid named-user local functional evidence for authentication, numbering, persistence and the corrected series-code flow. It is not production staging/canary evidence.

## Series Code Defect Resolution

The missing field was resolved as a structured `series_code` fact across the official-numbering request, contextual append flow, draft workspace, publication path, SQLite/PostgreSQL schema, and part detail display.

Behavior contract:

- Visible and optional only for manufactured, non-universal parts.
- Maximum length is 80 characters and surrounding whitespace is removed.
- Shared/universal and non-manufactured parts store `NULL`, even if a stale client submits a value.
- The value does not alter the official part/drawing number or automatically rewrite the part name.

Technical evidence:

| Check | Result |
|---|---|
| `npm.cmd run qc:pdm-numbering-series-code` | 10/10 passed on disposable SQLite |
| `npm.cmd run qc:pdm-number-state-flow-contract` | 19/19 passed |
| `npm.cmd run qc:pdm-number-state-flow-runtime` | 7/7 passed on disposable SQLite |
| `npm.cmd run qc:pdm-numbering-core` | 241/241 passed |
| `npm.cmd run qc:pdm-numbering-contextual-entrypoints` | 46/46 passed |
| `npm.cmd run qc:pdm-production-slice-numbering-draft` | 27/27 passed |
| `npm.cmd run qc:supabase-runtime-migrations` | 60/60 passed; CLI/live list intentionally skipped |
| `npm.cmd exec tsc -- --noEmit` | Passed |
| Targeted ESLint | Passed |

Human closure evidence completed on 2026-07-14: the named user selected `自製`, left `共用件` unchecked, confirmed `系列代號（選填）` appeared, assigned a real number with a series code, signed in again, and confirmed the value remained present. No test number was created in the field-test database by the automated verification.

## Remaining Gates

- The current local sequence-integrity report remains `clean=false` because the runtime database contains historical test/purge evidence. It must not be treated as a clean production seed or formal pilot authority.
- Browser/Windows automation could not safely take control of the user's authenticated Chrome page because the browser URL could not be verified by the control layer. No session bypass, cookie inspection, credential capture, or synthetic login was attempted.
- The named user completed real UI login, numbering, persistence, and corrected series-code workflows. `HD-9-1` cancels the fixed five-working-day `DEV-FIELD-001` task, but the pending DEV-046 Phase 2B live infrastructure gates and DEV-032 production release/continuity/rollback/post-deploy-smoke gates remain mandatory.

## QC Disposition

`PASS` for the local backend technical slice, automated series-code correction, and named-user UI retest. `NOT ACCEPTED` for staging or production readiness; the next gate is DEV-046 Phase 2B live isolated staging, followed by DEV-032.
