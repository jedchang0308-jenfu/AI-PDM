# RD Report - Review Issue List

Date: 2026-05-26

## Implemented

- Added `review_issues` schema for submission/file issue tracking.
- Added assignee tracking with `assignee_id`, defaulting new issues to the submission owner.
- Added SQLite compatibility migration to add `assignee_id` when an existing local table was created before this change.
- Added DB helpers for listing, creating, reading, and resolving review issues.
- Added API routes:
  - `GET /api/submissions/[id]/issues`
  - `POST /api/submissions/[id]/issues`
  - `PATCH /api/submissions/[id]/issues/[issueId]`
- Added Dashboard detail UI for review issue list, issue creation, owner display, and resolution notes.
- Added API regression coverage `ISSUE-001` through `ISSUE-013`.

## Files

- `db/schema.sql`
- `db/postgres/001_initial_schema.sql`
- `src/lib/types.ts`
- `src/lib/db.ts`
- `src/app/api/submissions/[id]/issues/route.ts`
- `src/app/api/submissions/[id]/issues/[issueId]/route.ts`
- `src/components/dashboard.tsx`
- `src/app/globals.css`
- `scripts/qc-api-test.mjs`

## Notes

- This is intentionally a lightweight review issue list, not a full ECO workflow.
- Issue owner currently defaults to the submission owner to keep review flow fast and avoid a user-management picker dependency.
