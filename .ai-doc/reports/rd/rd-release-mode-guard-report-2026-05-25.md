# RD Report: Release Mode Guard

Date: 2026-05-25

Scope: P2 release should not silently fall back to local-dev stub in formal mode.

## Changes

- Added `PDM_RELEASE_MODE` handling in `src/lib/release.ts`.
- Supported modes:
  - `local_stub`: allows local-dev stub for local MVP validation.
  - `auto`: allows local-dev stub outside `NODE_ENV=production` only.
  - `strict`: blocks approval when neither `RELEASE_FUNCTION_URL` nor a Released Drive folder is configured.
- Added `qc:release-config` to verify strict mode returns `ReleaseFailed` instead of reporting a fake release.
- Added the release config guard into `qc:full`.
- Updated `.env.example`, `README.md`, and `.ai-doc/qa/qa-validation-plan.md`.

## Risk Reduced

Before this change, an environment without Cloud Function or Released folder configuration could approve and report `Released` through `local-dev-stub`.

After this change, formal environments can set:

```text
PDM_RELEASE_MODE=strict
```

Then approval fails with `RELEASE_NOT_CONFIGURED` until a real release path is configured.

## Validation

Run:

```bash
npm.cmd run qc:release-config
npm.cmd run qc:full
```

Expected:

- `RELCFG-001` through `RELCFG-006` pass.
- `qc:full` includes `release config guard`.
