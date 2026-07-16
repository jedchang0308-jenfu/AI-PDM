# RD Report: DEV-044 ERP-ready PDM foundation Phase 1-3

Date: 2026-07-12
Status: RD complete locally; no production migration, deploy or IAM cutover
Branch: `codex/pdm-lifecycle-unified-history`

## Delivered

### Phase 1 - Server-owned command boundary

- Added framework-independent `PlatformActorContext`, versioned `PdmCommand`, request/correlation IDs and idempotency helpers.
- Added a current-auth adapter that derives actor and company from the authenticated server request. Body `actorId`, `companyId` and equivalent fields cannot become authority.
- Converted selected official-numbering, append and draft-create routes to pass server-derived command metadata.
- Added static client/server import and privileged environment scans.

### Phase 2 - Atomic receipt and outbox

- Added `platform_command_receipts` and `platform_outbox_events` to SQLite, generated PostgreSQL schema and ordered Supabase migration `008`.
- Wrapped official record creation, drawing append, part append, drawing+part append and draft reservation in one transaction containing mapping, command claim, domain mutation/audit, outbox enqueue and receipt completion.
- Added duplicate-command reuse, pending-event list, published/failure transitions and bounded retry metadata.
- Enforced PostgreSQL/Supabase RLS, forced RLS and `anon`/`authenticated` revoke boundaries.

### Phase 3 - Shared IAM/core preparation

- Added one-to-one platform principal-to-PDM user and platform organization-to-PDM company mappings.
- Preserved PDM IDs while command receipts/outbox also retain platform IDs; mapping key updates cascade without losing historical PDM attribution.
- Added shared-principal/shared-organization link operations and inactive-mapping fail-closed enforcement.
- Added a guarded mapping dry-run/apply tool. Against a copied local database it found 5 users, 2 companies and zero duplicate-email, duplicate-subject, orphan-identity or membership collisions; apply created 5/2 mappings and the next dry-run remained 5/2.
- Recorded target IAM, canonical model, MFA/offboarding and ownership decisions in ADR-002. No provider cutover was performed.

## Route Ownership Inventory

| Mutation surface | Transport/permission owner | Application owner | Domain/repository owner | Transaction owner |
|---|---|---|---|---|
| `POST /api/numbering/records` | route + `requireNumberingPlatformCommandAsync` | `createNumberingRecordAsync` | `AsyncNumberingRepository.createNumberingRecord` | `executePdmCommandWithOutbox` |
| `POST /api/numbering/roots/[rootCode]/drawings` | route + create/link permission guards | `addDrawingNumberToRootAsync` | `AsyncNumberingRepository.addDrawingNumberToRoot` | `executePdmCommandWithOutbox` |
| `POST /api/numbering/roots/[rootCode]/parts` | route + create/link permission guards | `addPartNumberToRootAsync` | `AsyncNumberingRepository.addPartNumberToRoot` | `executePdmCommandWithOutbox` |
| `POST /api/numbering/roots/[rootCode]/drawing-part` | route + create/link permission guards | `addDrawingAndPartToRootAsync` | `AsyncNumberingRepository.addDrawingAndPartToRoot` | `executePdmCommandWithOutbox` |
| `POST /api/numbering/part-number-drafts` | route + draft permission guard | `reservePartNumberDraft` | `PdmChangeControlDomainService.reservePartNumberDraft` | `executePdmCommandWithOutbox` |
| Invitation create/revoke/accept | admin/public invitation routes | `account-invitations.ts` | `AccountInvitationAsyncRepository` | existing repository transaction; inventoried, not rewritten |
| Google invitation activation/login | Google callback + OAuth state/nonce/PKCE | `google-oauth.ts` + invitation service | invitation/auth identity repositories | existing repository transaction; inventoried, not rewritten |

Routes retain transport parsing and response mapping. Existing numbering, controlled-boundary, invitation and identity repositories remain domain authorities.

## Schema and Migration

- Source schema: `db/schema.sql`
- PostgreSQL additive migration: `db/postgres/008_erp_module_foundation.sql`
- Supabase mirror: `supabase/migrations/20260712034956_erp_module_foundation.sql`
- Migration sync and manifest QC now derive expected count/order from the required migration list instead of hard-coding seven migrations.

## Boundaries

- ProJED was not read as a dependency and no ProJED file was modified.
- The original `data/ai-pdm.sqlite` was not migrated or repaired. Mapping apply ran only against `output/qc-dev-044-platform-mapping/ai-pdm.sqlite`, copied for disposable evidence.
- No live Supabase/PostgreSQL target, production domain, deployment, provider configuration, merge, PR or release action occurred.
