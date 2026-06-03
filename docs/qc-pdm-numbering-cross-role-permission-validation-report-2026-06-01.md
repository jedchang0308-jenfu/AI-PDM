# QC Fact Report: PDM Numbering Cross-Role Permission Matrix

Date: 2026-06-01

## Validation Conclusion

Pass. Cross-role permission matrix behavior is verified for RD deny, custom role grant, custom role revoke, manager/admin visibility, delegation regression, settings UI, and role-assignment audit envelope.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-cross-role-permission`
- `npm.cmd run qc:pdm-numbering-permission-guard-ui`
- `npm.cmd run qc:pdm-numbering-role-delegation-ui`
- `npm.cmd run lint`
- `cmd /c npm run build`

## Actual Results

- TypeScript: pass.
- Core numbering QC: 219/219 pass.
- Cross-role permission QC: 45/45 pass.
- Permission guard UI QC: 35/35 pass.
- Role delegation UI QC: 24/24 pass.
- Lint: pass.
- Build: pass.

## Evidence

- Cross-role script proved RD request/create disabled makes Engineer receive 403 from `/api/numbering/records`.
- After assigning a custom role and moving it to highest priority, Engineer regained `numbering.request` and `numbering.create`, then successfully created a numbering record.
- After role assignment revoke, Engineer create action became false again.
- Admin matrix exposed RD, manager, PDM admin, system admin, and active custom role assignment.
- Audit log for `numbering.user_role_assignment.upsert` included `before`, `after`, `diff`, and `markers: ["role_assignment_override"]`.
- Settings UI rendered role assignment controls on desktop and mobile without console errors.

## Issues And Blockers

- Build still reports pre-existing Turbopack broad file-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`. Build completed successfully.
- This report closes the cross-role permission matrix item. The separate batch resubmit plus manager-scope cross-role audit E2E item remains open in `dev_task.md`.
