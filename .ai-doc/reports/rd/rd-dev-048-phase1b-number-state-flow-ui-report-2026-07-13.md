# RD Report: DEV-048 Phase 1B Number State Flow UI

Date: 2026-07-13  
Status: `RD Implemented / Independent QC Pending`  
Scope: local owner surfaces, draft workspace UX, feature flag, compatibility routes and focused automation only

## Delivered

- Added server-visible `PDM_NUMBER_STATE_FLOW_V1`, default off, with a private/no-store status endpoint and server-projected sidebar state.
- Added shared create actions to the parts, drawings and cross-entity search owner surfaces.
- Added `/parts?tab=drafts` with owner/lifecycle/qualification/search filters, 20-row pagination, empty/error states and a detail drawer.
- Added four create modes and the required two-stage workflow: save an unnumbered workspace first, then explicitly confirm candidate acquisition.
- Rendered server `NumberStateProjection` and capabilities, two primary badges, one Now What panel, candidate watermark, cancel/recycle confirmation and disabled Phase 1C publication actions.
- Added keyboard focus trap/restore, Escape handling, body scroll lock, live regions and responsive layouts for 1440/1024/768/390/320 widths.
- Hid the four retired sidebar entries when the flag is on. Added server redirects for deterministic legacy routes and guidance pages for context-free upload/handoff, preserving query and `returnTo`.
- Kept candidate workspaces separate from official masters. Cancelled details label recycled values as historical candidate numbers.

## Defects Found And Corrected During RD

- Browser mutations were incorrectly rejected as cross-origin when Next reconstructed an internal request origin different from the external Host. Same-origin validation now accepts normalized request/forwarded Host origins while still rejecting cross-site and attacker origins.
- A visually hidden table header expanded document width at 1024px. It was replaced with an accessible `aria-label`; document `scrollWidth` now equals viewport width at every required boundary.
- Client-only legacy redirects were vulnerable to failed client chunk loading. Deterministic mappings now run in middleware; context-free upload and handoff remain non-mutating guidance pages.
- Login and Engineer navigation triggered expected-but-noisy 401/403 badge requests. Permissions loading now skips public auth pages, `/approvals` has an explicit page-permission mapping, and inbox count loading waits for the projected permission.
- The contextual-entrypoint regression accepted only the former direct permission-guard string. It now also recognizes the current platform-command gate, without adding duplicate product checks.

## RD Self-Verification

| Evidence | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1b` | PASS, 14/14 flag/route/UI assertions |
| `npm run qc:pdm-number-state-flow-http` | PASS, 21/21 disposable HTTP/DB assertions, including browser same-origin and attacker cross-origin |
| `npm run qc:pdm-numbering-core` | PASS, 241/241 |
| `npm run qc:pdm-numbering-contextual-entrypoints` | PASS, 46/46 |
| `npm run qc:pdm-entity-detail-drawer` | PASS, 14/14 |
| `npm run qc:pdm-production-slice-numbering-draft` | PASS, 27/27 |
| Focused ESLint | PASS, 0 errors and 0 warnings |
| Isolated `next build` with Phase 1B flag on | PASS, TypeScript and 112-page generation complete |
| Browser create/acquire/cancel flow | PASS on disposable managed-auth SQLite server and random port |
| Browser data sanity | Official parts 0; draft workspaces 2; cancelled 1; active candidate reservations 0 after recycle |
| Required viewport overflow | 1440, 1024, 768, 390 and 320 all had `document.scrollWidth === innerWidth` |

Browser screenshots:

- `output/playwright/dev048-phase1b/drafts-candidate-1440.png`
- `output/playwright/dev048-phase1b/drafts-candidate-1024.png`
- `output/playwright/dev048-phase1b/drafts-candidate-768.png`
- `output/playwright/dev048-phase1b/drafts-candidate-390.png`
- `output/playwright/dev048-phase1b/drafts-candidate-320.png`

The allocating `qc:pdm-numbering-permission-guard-ui` regression was not run because its runtime guard correctly refused the protected daily SQLite database. Phase 1A disposable role/company HTTP evidence remains green; independent Phase 1B QC must use its own disposable server/data target.

## Boundary And Handoff

- No Phase 1C approval request, review lock, publication command or official-master write was added.
- No Phase 1D technical-transfer authority, live Cloud SQL/Firebase/GCS resource, migration, deployment, commit or release artifact was created.
- Existing port 3000 and its data were not stopped or mutated. All isolated servers and temporary data/build directories were removed.
- This report is RD evidence, not an independent QC verdict. Next legal phase is `DEV-048 Phase 1B QC`; Phase 1C remains blocked until that verdict passes.
