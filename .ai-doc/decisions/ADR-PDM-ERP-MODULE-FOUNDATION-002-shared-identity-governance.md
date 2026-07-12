# ADR-PDM-ERP-MODULE-FOUNDATION-002: Shared identity and organization governance

Date: 2026-07-12
Status: Accepted for target architecture; production cutover not authorized
Owner: ERP Platform RD; mapping approval owner: designated Admin/HR data owner
Related DEV: `DEV-044` Phase 3

## Decision Source

The user instructed Dev PM to complete DEV-044 Phase 1 through Phase 3. The guided decision round received no explicit override, so the documented recommended choices `1A 2A 3A` apply under the HCS unanswered-question rule.

## Decisions

1. Supabase Auth is the target shared ERP IAM. Current AI_PDM local-password and Google identities remain the transition authority until a separately approved cutover.
2. The canonical platform model is `Person + Identity + Organization + Membership + RoleAssignment`.
3. Existing AI_PDM `users.id` and `companies.id` remain stable PDM authorities. Platform principal and organization IDs map to them; historical PDM IDs are not rewritten.
4. Email and provider subject are identity evidence, not authorization keys. Ambiguous matches fail closed and are reported before migration.
5. Admin and approval-capable roles require MFA at shared-IAM rollout. Other internal users may be phased in after pilot evidence.
6. Central suspension must deny new requests and revoke active sessions at cutover. Current PDM `account_status` enforcement remains active during transition.
7. ERP Platform RD owns migration execution. A designated Admin/HR data owner approves person and organization mappings. Release ownership remains under the production release gate.
8. Shared-IAM cutover occurs only after the first PDM pilot and before a second ERP module depends on shared SSO.

## Implemented in DEV-044

- Provider-neutral principal and organization mappings.
- Stable PDM ID plus platform ID evidence in command receipts and outbox events.
- Active/suspended/retired mapping states with fail-closed command enforcement.
- Guarded dry-run/apply tooling with collision reporting and no identifier rewrite.
- Google, local-password, invitation, suspension and audit-attribution regressions.

## Deferred Release Work

- Supabase Auth project configuration, email provider, secrets and redirect domains.
- MFA enrollment and recovery UX.
- Central session-revocation integration and account lifecycle administration UI.
- Approved staging/live migration, production cutover and rollback.
- ProJED identity migration or code changes.

These items require a separately scoped release or IAM rollout DEV. They are not evidence gaps in the provider-neutral Phase 3 development foundation.
