# ADR-PDM-SETTINGS-CENTER-001 - 系統設定中心與 Secret 治理

Status: Accepted for generic settings governance / Supabase provider decision superseded by Google Secret Manager
Date: 2026-07-06
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
Related DEV: `DEV-PDM-SETTINGS-CENTER-001`

## 2026-08-07 Decision Amendment

The settings-center governance model remains accepted. The provider-specific decision to use Supabase Vault is superseded by the Google production platform authority and `DEV-058`:

- Secret material authority: Google Secret Manager.
- Metadata authority: Cloud SQL PostgreSQL.
- Access boundary: Cloud Run / Next.js BFF using Google Application Default Credentials.
- Native consumer: trusted Windows worker through a token-gated, no-store broker route.
- Implementation contract: `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`.

All Supabase Vault statements below are retained as historical rationale only. The reusable lifecycle, Admin activation, redaction and audit decisions remain in force.

## Context

The current PDM settings page is Admin-only and already handles Google Drive folder settings, approval matrix UI and read-only environment status. The next operational need is to configure SolidWorks Document Manager / equivalent CAD reader credentials from the UI.

Adding one `solidworks_api_key` field would be fast but unsafe. The same problem will recur for OpenAI/LLM keys, Supabase runtime secrets, release function tokens, backup targets and future external connectors.

Historical context: the user originally selected a settings center architecture and Supabase Vault as the secret store. The provider portion is superseded by the 2026-08-07 amendment above.

## Decision

Historical 2026-07 decision: adopt a settings center plus Supabase Vault architecture. Only the provider-neutral governance points remain current.

1. `/settings` becomes a settings center overview and work queue.
2. Settings are split by management task into integrations, security/keys, workflow/permissions and system status.
3. Secret values are stored in Supabase Vault.
4. Supabase DB stores metadata only: Vault reference, lifecycle state, masked hint, fingerprint, test summary, activation status and audit references.
5. Browser code never accesses Vault directly.
6. PDM Next.js server APIs are the governance boundary for creating drafts, running tests, activating versions and revoking secrets.
7. High-risk settings use `draft -> test -> Admin activate`.
8. Low-risk settings may apply immediately when they do not affect external systems, release, backup, permission or secret material.
9. Google Workspace may be the account and Drive source, but PDM remains the authority for PDM roles and approval permissions.
10. The first implementation slice is SolidWorks secret lifecycle from UI input through Vault, metadata, probe/test, activation, audit and overview work queue.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Keep one `/settings` page and add fields | Rejected | It would grow into a mixed secret/workflow/status page and increase leakage risk. |
| Store API keys in `system_settings` | Rejected | Existing key-value settings and audit snapshots are not a safe secret store. |
| Store secrets in `.env` only | Rejected for end-state | Safe but not manageable by Admin UI; acceptable only as bootstrap/runtime config. |
| Store secrets in Supabase Vault and metadata in Supabase DB | Accepted | Matches selected architecture and gives encrypted secret storage plus auditable metadata. |
| Let frontend call Supabase Vault/Data API directly | Rejected | Vault/auth schemas are restricted and should not be browser/API-role surfaces. |
| Use Google Workspace groups as PDM roles | Rejected | Account lifecycle and PDM approval authority are different control planes. |
| Require two-person approval for first version | Deferred | Valuable for future release/backup/permission changes, but first version uses Admin activation. |
| Start with full settings center before any provider works | Rejected | A real SolidWorks vertical slice is the best proof of the architecture. |

## Chosen Rule

The authoritative boundary is:

```text
UI sees status and submits values once.
PDM backend validates role and writes/reads Vault as needed.
Supabase Vault stores secret ciphertext/plaintext-at-query-time.
PDM metadata stores lifecycle and evidence only.
Audit stores who/when/what status, never secret material.
```

High-risk activation:

```text
save draft -> run probe/test -> Admin activates tested version -> previous version retires
```

## Consequences

Positive:

- Avoids secret plaintext in normal settings APIs.
- Creates one governance model for SolidWorks, OpenAI, Supabase, release/backup and future connectors.
- Gives Admins an operational work queue instead of a long configuration page.
- Keeps Manager/Reviewer visibility possible without exposing sensitive values.
- Makes test evidence and activation responsibility explicit.

Costs / tradeoffs:

- Requires additive metadata schema and RLS/grant design.
- Requires a server-side Supabase Vault integration and redaction discipline.
- Requires a settings state machine rather than direct key-value updates.
- Requires browser/UI evidence, not only unit tests, because settings failures are operational failures.
- Requires a live Supabase Vault target or explicit test-double boundary before claiming full readiness.

## Migration / Compatibility Impact

- Existing `/api/settings` and Google Drive folder settings may remain as compatibility surfaces during Phase 1.
- New high-risk/secret settings must not be added to the legacy all-settings response.
- Existing `system_settings` can remain for low-risk simple settings until migration is authorized.
- Future metadata tables need deliberate RLS and explicit grants if exposed through Data API.
- Production migration and deployment are not authorized by this ADR.
- 2026-07-06 local implementation added `secret_references`, `setting_test_runs` and `setting_activation_events`, server-only secret lifecycle APIs, settings center routes and a SolidWorks secret panel. Local evidence uses `local_test_double`; live Supabase Vault writes/smoke are still gated before production.

## Superseded / Amended Documents

This ADR amends the settings direction implied by:

- `.ai-doc/reports/rd/rd-admin-settings-report-2026-05-18.md`
- `.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md`
- `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`

Specific amendment:

- `system_settings` remains valid for simple settings, but it is not the secret store for API/license keys.
- `/settings` is no longer treated as one monolithic Admin page for all future settings.

## Enforcement

RD must not mark implementation complete until:

- secret plaintext is absent from frontend responses, audit logs, reports, screenshots and persisted probe artifacts.
- frontend/browser roles cannot access Supabase Vault.
- Admin-only mutation routes reject non-Admin actors.
- a failed test cannot be activated.
- an active secret version can be retired/revoked without revealing plaintext.
- `/settings` overview shows clear next actions for missing, failed, untested and pending-activation settings.
- metadata RLS/grants are explicitly tested for the chosen Supabase access path.
