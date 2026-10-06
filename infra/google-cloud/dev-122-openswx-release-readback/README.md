# DEV-122 additive release readback IAM

Only AI-PDM owns this package. The human approved the exact five resources and
the project-wide Scheduler GET scope on 2026-10-06. The original twelve-resource
`dev-122/openswx-worker` state remains separate and must not be reapplied.

The verifier receives `run.jobs.get` and `run.executions.list` on the exact
`ai-pdm-prod-openswx-metadata` Job. The existing verifier and deployer receive
`cloudscheduler.jobs.get` for project `jenfu-platform-prod`; Scheduler does not
support the proposed per-job IAM limitation. Execution code reads only the own
`aipdm-prod-openswx-dispatch` Job. No `fullView`, list, execution, mutation,
Secret, impersonation, or sibling resource changes are included.

Use the source-bound DEV-122 readback IAM executor with the approved immutable
input, normal authenticated human actor, fixed backend, and fresh capacity gate.
Plan must contain exactly these five addresses, create/no-op only, fixed project,
members, permissions and exact Job target. Apply uses that validated saved binary
once. Unknown outcomes require provider readback before any retry. Never pass
Terraform targets, backend overrides, mutable source, or arbitrary commands.

After apply, read back role permissions, exact Job bindings and the own release
actors' Scheduler bindings. This receipt is resource evidence only; production
release, worker readiness and CAD/UI acceptance remain separate.
