# DEV-048 Phase 1B QC Report

Date: 2026-07-13  
QC boundary: Local Phase 1B owner surfaces, draft workspace UX, compatibility routes, authorization/data isolation and responsive behavior  
Verdict: PASS after independent defect recheck; Phase 1C is eligible

## Execution identity and isolation

- Base commit at execution: `ec68981`.
- The worktree was already dirty with concurrent DEV-046, DEV-047, auth and DEV-048 changes. QC preserved those changes and did not stage, commit or revert them.
- Fresh browser/API facts used managed-auth users and a disposable SQLite database under `%TEMP%/ai-pdm-dev048-phase1b-mainqc-4146e183cd5b493b918cc8fbe8a69cf0`.
- The isolated application listened on random port `60264` with its own `PDM_DATA_DIR` and `PDM_NEXT_DIST_DIR`. Existing port `3000` and PID `55452` were not stopped or mutated.
- `PDM_NUMBER_STATE_FLOW_V1=true` and `PDM_PRODUCTION_SLICE_ACTIVE=true` were used only in the disposable runtime.
- No Cloud SQL, Supabase, Firebase, GCS, DNS, credential, billing, live migration, staging deployment or production resource was used.

## Automated evidence

| Evidence | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1b` | PASS, 14/14 focused flag, route, UI and safety assertions |
| `npm run qc:pdm-number-state-flow-http` | PASS, 21/21 disposable HTTP/DB assertions |
| `npm run qc:pdm-numbering-contextual-entrypoints` | PASS, 46/46 |
| `npm run qc:pdm-entity-detail-drawer` | PASS, 14/14 |
| `npm run qc:pdm-production-slice-numbering-draft` | PASS, 27/27 |
| `node scripts/qc-access-control-async-repository.mjs` | PASS, 253/253 |
| `npm run qc:pdm-access-control-governance` | PASS, 93/93 |
| TypeScript / focused ESLint / full lint | PASS; zero errors, three unrelated existing attachment warnings |
| Isolated production build | PASS |
| Browser console | PASS, zero warning/error entries after the functional and responsive runs |

The protected daily permission-guard suite was not pointed at a shared or live database. Equivalent Phase 1B role/company facts were collected by the disposable HTTP suite with owner, peer, manager, Admin, denied role and Company A/B fixtures. The independent recheck also ran the current access-control repository regression against its disposable fixture and passed 253/253 assertions.

## Browser and database facts

- Opening and closing `建立圖料號草稿` left `numbering_draft_workspaces`, candidate reservations and all official master tables at zero.
- Saving one new bundle created exactly one workspace, one draft root, one draft part and one draft drawing. Candidate reservations and official `part_roots`, `part_numbers`, `drawing_numbers` remained zero.
- Explicit confirmation allocated exactly three active reservations: `A0001`, `A0001-P01` and `A0001-M01`. The UI displayed `候選號，不得正式使用`; official master counts remained zero.
- Explicit cancellation changed the workspace to `cancelled`, row version 3, and all three reservations to `recycled` with reason `phase1b_user_cancelled`. Official master counts remained zero.
- `/numbering/request?foo=bar&returnTo=%2Fparts%3Ftab%3Ddrafts` redirected to the owner surface while preserving `foo`, `returnTo`, create intent and `legacyFrom`.
- `/upload?drawingNumber=A0001-M01&foo=bar&returnTo=%2Fparts%3Ftab%3Ddrafts` redirected to `/drawings/A0001-M01/submission-workbench` while preserving drawing, query, return and legacy context.
- The HTTP suite independently proved unauthenticated and denied-role failure, owner/manager/Admin boundaries, company non-disclosure, same-key replay, stale version rejection, tenant-scoped sequence allocation, 20-way collision-free allocation, 20-way idempotent convergence, recycle/reuse, review-lock blocking, no official-master writes, and audit/receipt/outbox persistence.

## Responsive and accessibility evidence

Evidence directory: `output/playwright/dev048-phase1b-qc/`.

| Viewport | DOM width fact | Screenshot |
|---|---|---|
| 1440x900 | document/body width 1440; heading and owner actions visible | `phase1b-qc-1440x900.png` |
| 1024x768 | document/body width 1024; table container 758/758; status, candidate, next step and detail action visible without horizontal scrolling | `phase1b-qc-1024x768.png` |
| 768x1024 | document/body width 768; table container 502/502; status, candidate, next step and detail action visible without horizontal scrolling | `phase1b-qc-768x1024.png` |
| 390x844 | document width 375 within 390 viewport; list rows use card grid; full-width action and full-height scrollable drawer verified | `phase1b-qc-390x844.png`, `phase1b-qc-390-card-list.png`, `phase1b-qc-390-drawer.png` |
| 320x568 | document width 305 within 320 viewport; list rows use card grid; full-width action and full-height scrollable drawer verified | `phase1b-qc-320x568.png`, `phase1b-qc-320-card-list.png`, `phase1b-qc-320-drawer.png` |

QC initially caught a narrow-screen topbar defect: switching `.topbar` to Grid without an explicit track retained `justify-content: space-between`, so the action area used max-content width. The first independent review also rejected the narrow-screen list/drawer evidence and the stale access-control regression. RD added the explicit grid track, changed 390/320 rows into labeled cards with full-width actions, captured complete card-list/drawer evidence, and aligned the access-control fixture with the current identity and release contracts without reducing assertions. The final independent recheck confirmed no page-level horizontal overflow, no inaccessible key action, no visible error, and a clean 253/253 access-control regression.

## Scope limits

- This report grants the local Phase 1B gate only. It does not grant live provider parity, G8 staging, G9 production release, backup/restore, canary, field-test or `DEV-FIELD-001` credit.
- Phase 1C approval and atomic publication, Phase 1D transfer/handoff, live GCS evidence and production publish remain separate sequential gates.
- The final independent recheck reviewed the current source, fresh screenshots, responsive metrics and clean logs, and independently reran the 253/253 access-control suite. Earlier incomplete reviewer subprocesses are not counted.

## QC conclusion

Phase 1B passes its local functional, route, authorization, data-isolation, responsive, visible-error and regression gates. The initial narrow-screen and stale-regression findings remain recorded above, and their corrected evidence passed an independent recheck on 2026-07-13. Phase 1C approval/publication RD is now eligible; live provider, staging, production and release gates remain closed.
