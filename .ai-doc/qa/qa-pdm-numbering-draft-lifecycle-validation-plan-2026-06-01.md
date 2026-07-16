# QA Validation Plan: PDM Numbering Draft Lifecycle

Scope: draft numbering create/update/obsolete without approval, and overdue draft escalation to PDM admin confirmation.

## Validation Scope

- Verify RD/Engineer can create draft root, part number, and MA drawing through the numbering API.
- Verify draft create, update, and obsolete flows do not create approval requests.
- Verify draft update keeps records in `Draft` status and writes audit evidence.
- Verify draft obsolete changes root, part, and drawing to `Obsolete` without approval.
- Verify non-admin users cannot run overdue draft admin confirmation.
- Verify drafts older than 30 days move to `PendingAdminConfirm`.
- Verify fresh drafts remain `Draft`.
- Verify overdue draft escalation creates PDM admin task and non-dismissible notification.

## User-Critical Flow

1. RD creates a draft numbering record before CAD file completion.
2. RD updates draft metadata while still preparing CAD/BOM context.
3. RD obsoletes an invalid draft without needing an approval loop.
4. System finds drafts that stayed incomplete for more than 30 days.
5. PDM admin receives an explicit task/notification to confirm how to handle the stale draft.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Draft update requires approval | Draft action routed through normal approval workflow | RD loses speed before CAD completion | Approval request count after update | High | Engineer PATCH draft and assert zero approval requests |
| Draft obsolete requires approval | Obsolete action uses released/DVT rules | Invalid draft remains open too long | Approval request count after obsolete | High | Engineer obsoletes draft and assert zero approval requests |
| Non-draft record can be silently edited | Status guard missing | Released/DVT records can be changed without approval | Repository static check and API conflict behavior | High | Core check requires `assertDraftMutableStatus` |
| Overdue scanner updates active/fresh records | Cutoff or status filter wrong | Current work becomes admin-blocked | Old/fresh paired fixture | High | Mark only one draft old and assert fresh draft remains `Draft` |
| RD can run admin confirmation job | Permission matrix default too broad | RD can alter stale-draft state without admin oversight | Engineer call to overdue endpoint | Medium | Expect HTTP 403 for engineer |
| Admin confirmation has no visible follow-up | Task/notification not created | PDM admin misses stale drafts | DB task/notification query | High | Assert task assigned to `pdm_admin` and notification non-dismissible |

## Test Cases

- `TC-DRAFT-001`: Engineer and Admin login succeed.
- `TC-DRAFT-002`: Engineer cannot call `POST /api/numbering/drafts/overdue`.
- `TC-DRAFT-003`: Engineer creates draft numbering record with MA drawing and receives `201`.
- `TC-DRAFT-004`: Created root, part, and drawing are all `Draft`.
- `TC-DRAFT-005`: Draft creation creates zero approval requests.
- `TC-DRAFT-006`: Engineer updates draft core/part/drawing fields through `PATCH /api/numbering/records/[rootCode]`.
- `TC-DRAFT-007`: Draft update keeps all linked records `Draft`, creates zero approval requests, and writes `numbering.draft.update` audit.
- `TC-DRAFT-008`: Engineer obsoletes draft through `POST /api/numbering/records/[rootCode]/obsolete`.
- `TC-DRAFT-009`: Draft obsolete changes root, part, and drawing to `Obsolete`, creates zero approval requests, and writes `numbering.draft.obsolete` audit.
- `TC-DRAFT-010`: Create one old draft and one fresh draft, run admin overdue scan with a fixed `now`.
- `TC-DRAFT-011`: Old draft moves to `PendingAdminConfirm`; fresh draft remains `Draft`.
- `TC-DRAFT-012`: Overdue scan creates PDM admin task and non-dismissible PDM admin notification.
- `TC-DRAFT-013`: TypeScript, core QC, lint, build, and diff whitespace checks remain green.

## Data Requirements

- Demo Engineer and Admin accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite test database in `data/ai-pdm.sqlite`.
- Temporary numbering records generated with a unique timestamp suffix.
- One fixture draft timestamped before the 30-day cutoff.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-draft-lifecycle` passes with zero failed checks.
- `npm.cmd run qc:pdm-numbering-core` passes and exposes the draft lifecycle workflow/script.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.
- `git diff --check` exits 0 or reports CRLF warnings only.

## Evidence To Collect

- Draft lifecycle script JSON result including total/pass/fail counts.
- HTTP status evidence for engineer 403 on overdue admin confirmation.
- Root/part/drawing statuses before and after update, obsolete, and overdue scan.
- Approval request counts for draft create/update/obsolete.
- Audit actions: `numbering.draft.update`, `numbering.draft.obsolete`, `numbering.draft.pending_admin_confirm`.
- PDM admin task and non-dismissible notification rows.
