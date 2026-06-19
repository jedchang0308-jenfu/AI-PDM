# RD Report: Managed Auth Mode

Date: 2026-05-25

Scope: P2 replace demo-only users with a production-style local account mode.

## Changes

- Added `PDM_AUTH_MODE`.
  - `demo`: local development mode, keeps existing demo users.
  - `managed`: production-style mode, does not auto-seed demo users.
- Added `PDM_BOOTSTRAP_USERS` JSON support to create initial managed users.
- Disabled legacy password fallback when `PDM_AUTH_MODE=managed`.
- Prevented auto-creation of `admin@example.com` in managed mode.
- Exposed `authMode` in `/api/settings`.
- Added `qc:managed-auth` and included it in `qc:full`.
- Updated `.env.example`, `README.md`, `.ai-doc/qa/qa-validation-plan.md`, and `PDM_dev_task.md`.

## Production Usage

Set:

```text
PDM_AUTH_MODE=managed
PDM_BOOTSTRAP_USERS=[{"id":"user-admin","displayName":"Admin","email":"admin@company.com","password":"change-me","role":"Admin"}]
```

Then rotate the bootstrap password after first operational setup.

## Validation

Run:

```bash
npm.cmd run qc:managed-auth
npm.cmd run qc:full
```

Expected:

- managed bootstrap users can log in.
- demo users return `401` in managed mode.
- managed Admin can read `/api/settings`.
