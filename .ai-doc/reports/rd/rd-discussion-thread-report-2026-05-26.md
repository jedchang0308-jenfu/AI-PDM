# RD Report - Submission/File Discussion Thread

Date: 2026-05-26

## Scope

Implemented lightweight discussion comments for submissions and files.

## Completed Work

- Added `discussion_comments` table to SQLite schema.
- Added matching PostgreSQL schema for future Supabase migration.
- Added `DiscussionComment` type.
- Added database helpers:
  - `listDiscussionComments`
  - `createDiscussionComment`
  - `resolveDiscussionComment`
- Added APIs:
  - `GET /api/submissions/[id]/discussions`
  - `POST /api/submissions/[id]/discussions`
  - `PATCH /api/submissions/[id]/discussions/[commentId]`
- Added Dashboard Discussion section:
  - list comments
  - add submission-level comment
  - add file-level comment
  - resolve open comment
- Added API regression coverage `DISCUSS-001` through `DISCUSS-014`.

## Behavior

- Comments can target a submission or a specific file in the same submission.
- Invalid or cross-submission `fileId` is rejected.
- Users must have read permission for the target submission.
- Resolved comments record resolver and resolved timestamp.
- Comment creation and resolution are audit logged.

## RD Fix During QC

Initial QC found discussion list ordering was unstable when multiple comments were created in the same timestamp window. The list query now uses SQLite insertion order as a stable tiebreaker.

## RD Self-Check

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- Build route list includes discussion APIs.
