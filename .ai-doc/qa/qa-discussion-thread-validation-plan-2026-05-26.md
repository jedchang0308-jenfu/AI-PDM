# QA Plan - Submission/File Discussion Thread

Date: 2026-05-26

## Objective

Validate a lightweight discussion thread so review comments stay attached to the correct submission, file, and revision instead of scattering across LINE or email.

## Scope

- `discussion_comments` schema.
- `GET /api/submissions/[id]/discussions`
- `POST /api/submissions/[id]/discussions`
- `PATCH /api/submissions/[id]/discussions/[commentId]`
- Dashboard discussion section in submission detail.

## Acceptance Criteria

- Unauthenticated users cannot read or create discussion comments.
- Users must have read permission for the target submission.
- A comment can be created against the whole submission.
- A comment can be created against a specific file in the same submission.
- Creating a comment with an invalid or cross-submission file id is rejected.
- Comments return author name, optional file name, body, status, created time, and resolved metadata.
- A readable user can mark a comment resolved.
- Engineer users cannot read another Engineer's discussion comments.
- Manager/Admin users can read team discussion comments.
- Dashboard detail shows existing discussion comments and supports adding a comment.
- Existing auth, submission, review, release package, notification, AI, BOM, Where-used, UI, and file hash regressions remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`
- API regression must include discussion tests for unauthorized access, create, file binding, invalid file rejection, resolve, manager visibility, and Engineer scope.
