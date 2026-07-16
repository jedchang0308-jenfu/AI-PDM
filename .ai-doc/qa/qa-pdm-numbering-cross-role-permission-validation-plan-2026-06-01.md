# QA Validation Plan: PDM Numbering Cross-Role Permission Matrix

Date: 2026-06-01

## Validation Scope

- User role assignment schema/API/UI: assign and revoke built-in or custom PDM roles for a user.
- Permission context: system role, assigned role, active role priority, and delegated role must be evaluated together.
- Cross-role evidence for RD, R&D manager, PDM admin/system admin, custom roles, and delegated access.
- Audit envelope: role assignment must preserve before/after/diff and marker evidence.

## Key User Flows

- Admin creates a custom role, grants page/action permissions, and moves it to highest priority.
- RD role permissions are disabled; Engineer must be blocked from numbering creation.
- Admin assigns the custom role to the Engineer; Engineer must regain the configured access.
- Admin revokes the role assignment; Engineer must lose the granted access again.
- Settings UI must show role assignment controls on desktop and mobile.

## FMEA Risk Table

| Failure Mode | Cause | User Impact | Detection | Priority | Control |
|---|---|---|---|---|---|
| Custom role assignment does not affect runtime permissions | Permission context reads only system role | Admin matrix looks correct but API still blocks or over-allows | Permission API and record-create API E2E | High | Test disabled RD plus assigned custom role |
| Lower-priority explicit deny overrides intended custom role | Role priority not applied to assigned roles | Admin cannot use matrix to resolve multi-role conflict | Move custom role to highest priority and retest | High | Save role priority before assignment validation |
| Revoked assignment still grants access | Revoked rows included in role lookup | Former delegate keeps permissions | Revoke and retest create action false | High | Query only `revoked_at IS NULL` |
| Audit is incomplete | Assignment audit omits before/after/diff/markers | Cannot explain override-like permission changes | Direct audit log inspection | Medium | Require normalized audit envelope |
| Settings UI missing controls | API exists but admin cannot configure | Manual admin workflow blocked | Playwright desktop/mobile selectors | Medium | Stable `data-testid` selectors |

## Test Cases

- TC-CRP-001: Admin, Engineer, and Manager demo users can authenticate.
- TC-CRP-002: Admin matrix exposes RD, `rd_manager`, `pdm_admin`, and `system_admin`.
- TC-CRP-003: Admin permissions include `settings.admin_matrix`; Manager permissions include batch decision action.
- TC-CRP-004: Create custom role and grant `numbering.request` + `numbering.create`.
- TC-CRP-005: Disable RD request/create; Engineer is blocked by permissions API and record-create API 403.
- TC-CRP-006: Assign custom role to Engineer and set custom role highest priority; Engineer can create numbering record.
- TC-CRP-007: Role assignment appears in Admin matrix and audit log has before/after/diff/marker.
- TC-CRP-008: Settings UI renders role assignment panel on desktop and mobile with no console errors.
- TC-CRP-009: Revoke role assignment; Engineer create permission becomes false.
- TC-CRP-010: Existing permission guard and delegation UI regressions remain green.

## Pass Criteria

- `tsc --noEmit`, `lint`, and `build` pass.
- `qc:pdm-numbering-core` passes and includes role assignment schema/static checks.
- `qc:pdm-numbering-cross-role-permission` passes all cases.
- Existing `qc:pdm-numbering-permission-guard-ui` and `qc:pdm-numbering-role-delegation-ui` still pass.

## Evidence To Collect

- Command outputs with pass counts.
- API responses proving allow/deny changes.
- Audit detail JSON for `numbering.user_role_assignment.upsert`.
- Playwright desktop/mobile UI checks.
