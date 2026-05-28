# Dashboard Component Split Verification - 2026-05-28

## Scope

- DEV-IND-009: split the Dashboard UI giant component without changing API calls or core user interactions.
- Extracted component boundaries:
  - `FinderToolbar`
  - `NotificationDropdown`
  - `SubmissionTable`
  - `SubmissionDetailPanel`
  - `AssistantPanel`

## RD Changes

- Moved dashboard layout components to `src/components/dashboard/layout-parts.tsx`.
- Moved `NotificationDropdown`, `SubmissionTable`, `SubmissionRow`, `SubmissionDetailPanel` shell, and `AssistantPanel` markup out of `src/components/dashboard.tsx`.
- Kept Dashboard state ownership and data-loading functions in `src/components/dashboard.tsx` to avoid a broad state-management rewrite in the first pass.
- Added Next viewport metadata and mobile `dvw` / `dvh` constraints so the mobile AI chat button and panel remain inside the visual viewport.
- Hardened UI E2E selectors around authenticated dashboard load and seeded submission row opening.

## QA Validation Plan

- Verify split structure with a dedicated static QC script.
- Verify TypeScript/build compatibility.
- Verify desktop manager/engineer/admin UI flows remain usable.
- Verify mobile AI chat open, send, response, and close flows.

## QC Evidence

- `npm.cmd run qc:dashboard-component-split`
  - PASS: 18 checks.
- `npm.cmd run lint`
  - PASS.
- `npm.cmd run build`
  - PASS.
  - Existing warning observed: Next/Turbopack NFT trace warning through `src/lib/llm-usage.ts`.
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:ui`
  - PASS: 26 checks.
  - Covered login page, manager dashboard/detail controls, Drive preview iframe, manager settings denial, engineer permission limits, admin settings access, and mobile AI chat.

## Result

PASS. DEV-IND-009 is complete for this industrialization round. The remaining Dashboard detail content is still high-coupling, but the current task's named component boundaries and UI regression gates passed without a state-management rewrite.
