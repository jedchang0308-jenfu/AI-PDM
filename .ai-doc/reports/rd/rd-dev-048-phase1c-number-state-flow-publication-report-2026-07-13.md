# RD Report: DEV-048 Phase 1C Approval And Atomic Publication

Date: 2026-07-13  
Status: `RD Implemented / Independent QC Pending`  
Scope: local approval, publication, permission, migration mirror, disposable browser and SQLite evidence only

## Delivered

- Added explicit `numbering.candidate.review.submit`, `withdraw`, `decide` and `numbering.publish` permission checks. Approval and publication remain separate commands, receipts and audit actions.
- Registered `numbering.candidate_publication_review` in the existing approval platform. Submit freezes immutable targets and a canonical snapshot, locks reservations and creates no official master rows.
- Added withdraw, reject, needs-info, approve and apply-retry state transitions. Approval only changes reservations to `approved_locked`; apply failure remains explicit and locked.
- Added `PublicationEvidencePort`, a local fake and fail-closed policy. Root/eligible part-only publication may be `not_required`; drawing publication requires finalized controlled GCS pointer evidence.
- Added explicit atomic publication into the existing `part_roots`, `part_numbers`, `drawing_numbers` and `drawing_part_links` authority, followed by reservation promotion, workspace publication, audit, receipt and outbox writes.
- Added submit, withdraw, approval deep-link, retry and irreversible publish controls to the workspace drawer. Approval decisions remain exclusively in `/approvals`.
- Added SQLite, PostgreSQL and Supabase migration mirrors for action registration, immutable approval targets, publication evidence and role permission seeds.
- Added disposable transaction, HTTP and browser fixtures. No live GCS, Cloud SQL, Supabase or production data was used.

## Defects Found And Corrected During RD

- A published workspace still rendered the candidate warning because draft items retain their historical candidate codes. The warning is now gated by server projection `numberQualification === "candidate"`; published official numbers show `formal_use_allowed` without candidate misuse text.
- Manufacturing could reach the drafts page and still see an enabled create CTA even though the BFF rejected the command. All create entrypoints now consume server action permissions and remain disabled with a reason tooltip while permission is loading or denied.
- The Phase 1B static test still required Phase 1C mutations to be absent. It was updated to the durable contract: candidate warnings are state-scoped and candidate acquisition, cancellation and formal publication require explicit confirmation.

## RD Self-Verification

| Evidence | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1c` | PASS, 15/15 transaction/domain and 10/10 disposable HTTP assertions |
| `npm run qc:pdm-number-state-flow-phase1b` | PASS, 14/14 retained route/UI contracts |
| Approval safety | PASS: immutable snapshot/targets, approve creates zero masters, reject/needs-info/withdraw unlock safely, apply failure is retryable |
| Publication safety | PASS: same-key idempotency, different-key republish rejection, collision fail-close, fault rollback and one official event |
| Evidence policy | PASS: drawing blocked without finalized pointer; finalized generation/hash reference is projected into the event |
| Permission/company | PASS: denied submit/decision/publish, wrong-company 404 and same-origin mutation enforcement |
| `npm run qc:postgres-shadow` | PASS, 26/26 local schema generator/compare checks; no configured live PostgreSQL target was claimed |
| `npm run qc:supabase-runtime-migrations` | PASS, Phase 1C source/mirror/manifest and deny-direct-access checks |
| Focused ESLint | PASS, 0 errors and 0 warnings |
| `npm run build:isolated` | PASS, TypeScript and 118-page production build |

## Browser And Data Evidence

Disposable owner, reviewer and publisher flow:

- Owner created `DEV048-PHASE1C-UI-R3`, acquired `A0001` and `A0001-P01`, submitted review and observed the locked state.
- Reviewer approved request `APR-b9511f13-64c7-46d3-a8ba-8f878225e840`; the approval workbench then had zero pending items.
- Admin separately confirmed formal publication. SQLite showed workspace `published`, both reservations `promoted`, one Active root, one Active part, five completed command receipts and one `pdm.numbering.official_number_published.v1` outbox event.
- At 390x844, document width equalled viewport width, `formal_use_allowed` was visible, the stale candidate warning was absent and browser warning/error logs were empty.
- Manufacturing saw the create CTA disabled and a server permission message. A MAXIMA Admin selecting all-company scope could not see the JENFU fixture; browser warning/error logs were empty.

Evidence directory: `output/playwright/dev048-phase1c-qc/`, including screenshots `10` through `19` and the browser metric/log JSON files.

## Boundary And Handoff

- The browser fixtures used random ports and disposable SQLite directories. Existing port 3000 and protected local data were not stopped or mutated; fixture/build directories were cleaned.
- No live provider, credential, staging, production migration, deployment, commit or release artifact was created.
- This report is RD evidence only. Phase 1D remains blocked until an independent Phase 1C QC verdict passes.
