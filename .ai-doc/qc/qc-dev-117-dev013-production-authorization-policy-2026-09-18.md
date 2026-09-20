# DEV-117／DEV-013 Production authorization policy QC（2026-09-18）

## Scope

This QC covers only the local release-contract change that separates human Production authorization from machine-verifiable source provenance. It did not deploy, migrate, read or modify live data, change IAM, create a candidate, move traffic, run canonical smoke, roll back, or mutate cloud resources.

The accepted human root is `jenfu.dev013.l4-execution-authorization.v2 / HUMAN_PRODUCTION_SCOPE`. It binds the exact environment and resources, allowed and forbidden actions, risk scope, authorization statement hash, and validity window. It carries no `sourceRevisionByApplication` field. AI-PDM owner readiness, source lock, immutable artifact digest, migration manifest, candidate revision, deployed revision, predecessor and terminal receipts remain exact-source machine evidence. A source change invalidates affected evidence and requires the corresponding gates to run again; it does not by itself require renewed human authorization.

## Verification

| Check | Result |
|---|---|
| DEV-117 continuous-release contract suite | `38/38 PASS` |
| DEV-117 continuous-release aggregate QC | `33/33 PASS` |
| abort-controller regression | `6/6 PASS` |
| database-boundary check | `PASS` |
| source-bound field injected into v2 human root | rejected, fail closed |
| owner source／artifact／migration／candidate provenance | preserved and exact-bound |
| historical v1 receipts | preserved as immutable history; rejected as a v2 root |

The focused Node tests used a task-owned module loader to resolve the same-version `pg` package already present in the OrgMaster workspace because this AI-PDM worktree's existing `node_modules` is incomplete. No package or lockfile was changed. The temporary loader is not repository evidence and was removed after the tests.

`typecheck:app` and the isolated Next.js build were not rerun: this worktree lacks `typescript`, `next`, `react`, `@types/react`, and `pg`, while the governed dependency-install preflight was below the protected free-space floor. This is an environment-capacity limitation, not a passing product result. The source-contract, aggregate, abort and database-boundary results above are the completed local denominator for this policy-only change.

## Preserved gates

Formal migration, live-data access or repair, IAM changes, candidate creation, traffic activation, rollback, canonical smoke, target or scope changes, destructive operations, expiry and provider readback remain independently gated. A change to any human-authorized target, resource, action, prohibition, risk or validity window still requires a new human authorization. Machine evidence drift remains fail closed.

QC disposition: `PASS_WITH_ENVIRONMENT_LIMITATION / NO_PRODUCTION_MUTATION`.
