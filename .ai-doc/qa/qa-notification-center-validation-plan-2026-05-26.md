# QA Plan - Notification Center

Date: 2026-05-26

## Objective

Validate the lightweight Web notification center without adding heavy workflow overhead.

## Scope

- `/api/notifications`
- Dashboard notification summary
- Role-scoped notification visibility
- Notification coverage for release and collaboration risk signals

## Acceptance Criteria

- Unauthenticated users cannot read notifications.
- Manager/Admin users can read team notifications.
- Engineer users can read only notifications related to their own submissions.
- Pending submissions create review notifications.
- Engineer-owned pending submissions create awaiting review notifications.
- Active checkout locks create lock notifications.
- ReleaseFailed submissions create critical notifications.
- Notification summary counts critical items.
- Existing submission, review, release package, handoff, auth, AI, and file hash flows remain green.

## Required QC Evidence

- `npm.cmd run qc:full`
- API regression must include `NOTIFY-001` through `NOTIFY-009`.
- Final QC summary must show 0 failed steps.
