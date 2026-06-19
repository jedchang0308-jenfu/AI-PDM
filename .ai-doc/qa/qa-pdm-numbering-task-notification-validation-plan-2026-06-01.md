# QA Validation Plan - PDM Numbering Tasks and Notifications

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: numbering task center API and in-system notification API with read/unread and handled/unhandled states.

## Validation Scope

- Verify `numbering_task_items` exists for task-center records.
- Verify `numbering_notifications` exists for system notifications.
- Verify notifications can be unread/unhandled by default.
- Verify repository lists tasks and notifications by user scope.
- Verify repository can update task handled/cancelled/open status.
- Verify repository can mark notifications as read and handled.
- Verify API routes are registered:
  - `/api/numbering/tasks`
  - `/api/numbering/tasks/[taskId]`
  - `/api/numbering/notifications`
  - `/api/numbering/notifications/[notificationId]/read`
  - `/api/numbering/notifications/[notificationId]/handled`

## User Critical Flows

- RD opens task center and sees relevant numbering tasks.
- Reviewer sees pending approval tasks/notifications by role.
- User marks an informational notification as read.
- User marks an actionable notification as handled after finishing the work.
- Task list can filter open/handled/cancelled states; notification list can filter read/unread and handled/unhandled states.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Notification has no read state | Missing persisted read marker | User repeatedly sees old notices as new | Schema/QC check | High | `read_at` on `numbering_notifications` |
| Actionable item cannot be closed | Missing handled marker | Task center remains noisy | Schema/QC check | High | `handled_at` and task `task_status` |
| Notification route exposes no state filters | API only lists all | UI cannot split unread/unhandled | Route source check | Medium | Query filters `read` and `handled` |
| Approval request creates no task | Approval workflow disconnected | Reviewer misses pending work | Repository source check | High | Approval request inserts task and notification |
| Existing dashboard notifications regress | Reusing old generic endpoint | Existing dashboard behavior changes unexpectedly | Build/source boundary | Medium | Numbering uses dedicated `/api/numbering/*` endpoints |

## Test Cases

- `NUM-SCHEMA table exists numbering_task_items`.
- `NUM-SCHEMA table exists numbering_notifications`.
- `NUM-SCHEMA numbering task saved`.
- `NUM-SCHEMA numbering notification saved unread/unhandled`.
- `NUM-REPO lists numbering tasks`.
- `NUM-REPO updates numbering task status`.
- `NUM-REPO lists numbering notifications`.
- `NUM-REPO updates numbering notification read/handled state`.
- `NUM-API numbering tasks route lists task center`.
- `NUM-API numbering task detail route updates handled state`.
- `NUM-API numbering notifications route lists read/handled state`.
- `NUM-API notification read route marks read`.
- `NUM-API notification handled route marks read and handled`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 96/96 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes all numbering task/notification routes.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for task and notification workflow functions.
