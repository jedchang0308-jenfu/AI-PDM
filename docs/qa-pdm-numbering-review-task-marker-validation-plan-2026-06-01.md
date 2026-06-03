# QA Validation Plan: PDM Numbering Review / Task Attention Markers

Scope: approval review page, numbering task center, numbering notification center, and repository DTOs for proxy submission, delegated review, override, and impact-scope markers.

## Validation Scope

- Verify approval requests carry one shared marker model for proxy submission, override, impact scope, and delegated review.
- Verify approval review UI renders proxy submission, delegated review, override, and impact-scope markers for manager/delegated reviewer visibility.
- Verify task and notification UI render the same marker semantics from persisted `detail_json`.
- Verify delegated approval records preserve the acting user and delegated role.
- Verify existing permission guards, batch review, non-dismissible notifications, lint, typecheck, and build remain green.

## User-Critical Flow

1. Admin or system creates a numbering approval request with proxy submission or override/impact context.
2. Reviewer or delegated reviewer opens DVT/Release approval page.
3. Reviewer sees `代送審`, `代理審核`, `! Override`, and `! 影響範圍` before deciding.
4. Reviewer approves/rejects selected items with common and item-specific comments.
5. Task center and notification center show the same risk markers and keep blocking notices non-dismissible.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Proxy submission hidden | UI only shows requester name | Supervisor cannot distinguish normal submission from admin proxy | Approval UI E2E marker check | High | Seed proxy payload and verify `代送審` |
| Delegated review hidden | Permission grants delegated access without UI marker | Accountability unclear | Delegated engineer E2E | High | Seed delegation and verify `代理審核`; DB decision stores engineer id + manager role |
| Override hidden in task/notification | Marker logic exists only on approval page | RD/manager misses exception outside approval page | Task center E2E | High | Seed task/notice detail and verify `! Override` |
| Impact scope not visible | MA invalidation context not carried to DTO | Supervisor cannot see affected documents/parts | Approval and task E2E | High | Seed `MainDrawingInvalid` and impacted docs; verify `! 影響範圍` |
| Inconsistent marker interpretation | Each page parses action codes differently | Same event looks different in each UI | Static repository check | Medium | Central `buildNumberingActionMarkers` source check |
| Existing notification guard regresses | UI changes re-enable blocked close action | Blocking notice can be dismissed | Task center E2E | High | Verify non-dismissible action remains disabled |

## Test Cases

- `TC-MARKER-001`: Static core check confirms shared marker builder, proxy/delegated/override/impact codes, UI action URL, and marker UI components.
- `TC-MARKER-002`: Delegated engineer can open approval page through delegation and sees `代理審核`.
- `TC-MARKER-003`: Approval page shows proxy submission marker and override/impact marker on seeded abnormal items.
- `TC-MARKER-004`: Delegated engineer approves batch; DB decision keeps `approver_id = engineer` and `approver_role = rd_manager`.
- `TC-MARKER-005`: Task center renders proxy, override, and impact markers on both desktop and mobile.
- `TC-MARKER-006`: Non-dismissible notification handling remains disabled.
- `TC-MARKER-007`: `tsc`, `lint`, and production build pass.

## Data Requirements

- Seeded approval batch with one DVT promotion item and one release missing-MA / main-drawing-invalid item.
- Seeded active delegation from demo manager to demo engineer.
- Seeded task and notification with `detail_json.payload.proxyReason`, `overrideTypes`, `impactedPartNumbers`, and `requiredDocuments`.

## Pass Criteria

- `cmd /c node_modules\.bin\tsc.cmd --noEmit` passes.
- `npm.cmd run qc:pdm-numbering-core` passes and includes marker checks.
- `npm.cmd run qc:pdm-numbering-approval-review-ui` passes.
- `npm.cmd run qc:pdm-numbering-task-center-ui` passes.
- `npm.cmd run lint` passes.
- `cmd /c npm run build` passes.

## Evidence To Collect

- Command outputs with pass counts.
- E2E result names proving proxy, delegated review, override, impact markers.
- DB decision evidence for delegated approval role/user.
- Build output route list including numbering approval/task routes.
