# QA-PDM-SETTINGS-CENTER-SECRET-LIFECYCLE - 系統設定中心與 Secret 生命週期驗證計畫

Status: QA Plan Ready / Not Executed
Date: 2026-07-06
Owner: Dev PM / QA
Related DEV: `DEV-PDM-SETTINGS-CENTER-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`

## 1. Purpose

Validate that the settings center lets Admins configure high-risk integrations through a safe lifecycle without exposing secret plaintext, while giving operators the correct next action through `/settings`.

The user-facing target is:

```text
系統設定不是一堆欄位，而是告訴 Admin 哪些設定要處理、測試是否通過、誰啟用了哪一版。
```

## 2. Scope

In scope:

- `/settings` overview work queue.
- Settings subpage routing.
- Supabase Vault boundary.
- Secret metadata lifecycle.
- SolidWorks secret vertical slice.
- High-risk setting `draft -> test -> activate`.
- Role-based visibility.
- Test evidence redaction.
- Audit redaction.
- Existing Google Drive settings compatibility.
- Metadata table RLS/grant/Data API exposure checks.

Out of scope:

- Production deployment.
- Production migration.
- Direct production data repair.
- SolidWorks Add-in real-machine validation.
- Full native CAD extraction proof unless the Document Manager/equivalent probe is included in the implementation slice.
- Google Workspace direct role mapping.
- Two-person approval for first version.

## 3. FMEA

| Failure mode | User impact | Priority | Control |
|---|---|---|---|
| Secret stored in `system_settings` or audit | API/license key leak | P0 | QA-SEC-001, QA-SEC-002 |
| Frontend can access Vault or decrypted secret | Credential compromise | P0 | QA-VAULT-001 |
| Test failed secret can be activated | Broken external integration becomes active | P0 | QA-LIFE-003 |
| Manager/Reviewer sees sensitive settings | Unauthorized infrastructure disclosure | P1 | QA-RBAC-002 |
| Work queue shows healthy when provider is untested | Admin misses required setup | P1 | QA-UI-001 |
| Probe artifact stores raw request/response with secret | Evidence becomes leakage channel | P0 | QA-EVID-002 |
| Metadata tables exposed without explicit grants/RLS | Data API access is inconsistent or insecure | P0 | QA-RLS-001 |
| Current Google Drive settings regress during split | Existing release/storage workflow breaks | P1 | QA-REG-001 |
| UI only shows error reason and not next action | Admin does not know what to do | P1 | QA-UI-002 |
| Revoked secret remains usable | Disabled key still affects runtime | P0 | QA-LIFE-006 |

## 4. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| QA-SEC-001 | No secret plaintext is persisted in PDM DB metadata tables | DB/query or repository test |
| QA-SEC-002 | No secret plaintext appears in API JSON, audit detail, logs, report JSON or screenshots | redaction QC |
| QA-VAULT-001 | Browser/API roles do not access `vault` schema or `vault.decrypted_secrets`; all Vault access is server-side | static/API negative test |
| QA-LIFE-001 | Admin can create a draft SolidWorks secret and only see masked/fingerprint status afterward | UI/API test |
| QA-LIFE-002 | SolidWorks secret test stores result summary, redacted error and artifact path only | service/API test |
| QA-LIFE-003 | `test_failed` or untested draft cannot be activated | negative API/UI test |
| QA-LIFE-004 | `tested` version can be activated by Admin and previous active version retires | service/API test |
| QA-LIFE-005 | Secret version can be revoked/retired without exposing plaintext | service/API test |
| QA-LIFE-006 | Revoked secret is not used by provider runtime/probe | service/API negative test |
| QA-RBAC-001 | Non-Admin cannot create/test/activate/revoke settings secrets | API permission test |
| QA-RBAC-002 | Manager/Reviewer status views return only approved non-sensitive fields | API/UI test |
| QA-UI-001 | `/settings` overview shows missing, draft, test failed, tested pending activation and active states with correct CTA | browser screenshot/DOM check |
| QA-UI-002 | Error/blocked states answer the next action before technical detail | browser/DOM check |
| QA-ROUTE-001 | `/settings`, `/settings/integrations`, `/settings/security`, `/settings/workflow`, `/settings/system` route without runtime-visible errors | browser test |
| QA-RLS-001 | Metadata tables have deliberate RLS and explicit grants for the chosen access path | SQL/advisor/static test |
| QA-EVID-001 | Test runs store actor, time, setting version, result, summary and artifact path | repository/API test |
| QA-EVID-002 | Test artifacts are redacted and do not contain API/license key material | artifact scan |
| QA-REG-001 | Existing Google Drive folder verification flow remains operational or is explicitly blocked with next action | regression test |

## 5. Required Evidence After Implementation

Minimum command evidence:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:pdm-settings-center-secret-lifecycle
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:gdrive-folder-tree-settings
```

Additional evidence when metadata schema is added:

```powershell
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:supabase-current-change-impact
```

Required browser/UI evidence:

- `/settings` overview work queue with at least one SolidWorks missing/untested item.
- `/settings/security` SolidWorks draft secret state with masked status.
- `/settings/security` SolidWorks test failed state with next action and redacted error.
- `/settings/security` SolidWorks tested pending activation state.
- `/settings/security` active SolidWorks version state.
- `/settings/integrations` integration inventory showing SolidWorks and Google Drive status.
- `/settings/system` showing Supabase/Vault readiness without sensitive values.

Required viewports:

- Desktop: `1440x900`.
- Tablet/default surface: `1024x768`.
- Phone sanity on default surface: `390x844`; no dedicated phone UI is required, but the default surface must not horizontally overflow, overlap critical actions or hide visible blockers.

Visible error hard gate:

- Fail QC if required pages show `.inline-error`, unexpected `[role=alert]` failure, visible `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, visible `/api/...` route error text, overlap, clipped primary CTA or horizontal overflow.
- Build/lint/API success cannot override a visible UI failure.

## 6. SolidWorks Vertical Slice Test Matrix

| Case | Setup | Expected |
|---|---|---|
| Missing secret | no SolidWorks secret metadata | overview says CAD reader secret is not configured and routes to security page |
| Draft created | Admin submits value | UI shows draft/masked/fingerprint only; response has no plaintext |
| Probe pass | provider test returns valid metadata/reference signal | version becomes `tested`; test run stores redacted summary |
| Probe fail | provider test fails with error | version becomes `test_failed`; CTA says fix/test again |
| Activate tested | Admin activates tested version | version becomes `active`; prior active retires |
| Activate failed | Admin attempts to activate untested/failed version | API rejects; UI says test first |
| Revoke active | Admin revokes active version | runtime no longer uses it; overview returns blocker |
| Non-Admin mutation | Manager/Reviewer calls mutation endpoint | 403 with no sensitive detail |

## 7. Stop Conditions

Stop QA/RD and return to PM/user if:

- Implementation needs production deploy, production migration, direct production data mutation, data deletion or historical repair.
- RD needs secret plaintext stored outside Supabase Vault.
- RD needs browser, publishable key, anon key or Supabase Data API role to access Vault.
- A live Supabase Vault target is required but unavailable and no test double boundary is authorized.
- Probe evidence cannot be redacted without losing needed QA signal.
- Permission changes would give Google Workspace direct authority over PDM roles.

## 8. Regression Coverage

Existing gates that must keep passing after relevant implementation slices:

- `npm.cmd run qc:gdrive-folder-tree-settings`
- `npm.cmd run qc:system-settings-async-repository`
- `npm.cmd run qc:managed-auth`
- `npm.cmd run qc:supabase-secret-boundary`
- `npm.cmd run qc:production-readiness -- --allow-open`

Regression expectations:

- Current Admin-only settings access remains protected.
- Existing Google Drive folder verification remains available until deliberately migrated.
- Existing environment-backed read-only settings do not expose new secrets.
- Existing upload/CAD warning copy can read status without exposing secret values.

## 9. Deferred Evidence

| Evidence | Status | Recovery condition |
|---|---|---|
| Supabase Vault live write/read/delete-equivalent test | Blocked if no target exists | Provide disposable/staging Supabase target and credential boundary |
| SolidWorks Document Manager real metadata probe | Blocked until component and sample CAD files exist | Complete `DEV-CAD-001` evidence path |
| Production release smoke | Not authorized | Complete implementation, backup/rollback and deployment-release gate |
