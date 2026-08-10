# SPEC-PDM-GCP-SECRET-MANAGER-001 - Google Secret Manager 與 SolidWorks 2D Worker 憑證整合

Status: `RD Implemented / Local Phase 1A-1D QC Passed / Production Release Gated`
Date: 2026-08-07
Owner: Dev PM
Related DEV: `DEV-058` / `DEV-PDM-GCP-SECRET-MANAGER-SW-WORKER-001`
Related authority:

- `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
- `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
- `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
- `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
- `.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`

Official implementation references:

- Google Secret Manager IAM: https://docs.cloud.google.com/secret-manager/docs/access-control
- Access a secret version: https://docs.cloud.google.com/secret-manager/docs/access-secret-version
- Add a secret version: https://docs.cloud.google.com/secret-manager/docs/add-secret-version

## 1. Authority Amendment

Classification: `Intentional replacement`.

The current production platform is Google Cloud. This specification supersedes the Supabase Vault provider choice in `SPEC/ADR-PDM-SETTINGS-CENTER-001` without replacing the reusable settings-center lifecycle, redaction, Admin activation or audit rules.

Authoritative end state:

- Google Secret Manager stores SolidWorks Document Manager key material.
- Cloud SQL PostgreSQL stores only provider reference, exact secret version resource name, masked hint, fingerprint, lifecycle state, test summary and audit metadata.
- Cloud Run / Next.js BFF is the only application-side secret access boundary.
- The browser never receives secret plaintext or a Secret Manager access token.
- A trusted Windows worker runs SolidWorks Document Manager native code; Cloud Run does not run SolidWorks DLL/COM code.
- Supabase Vault is historical compatibility context and is not an active production target.

## 2. Problem and Root Cause

The Admin UI can currently save and activate a key, but the runtime provider supports only `local_test_double` and `supabase_vault`. The production platform authority has already moved to Google Cloud, so a successful UI lifecycle does not create a credential that the Windows 2D worker can actually read.

The visible symptom is therefore not a drawing-rendering defect alone. It is a cross-layer provider mismatch:

```text
Admin UI says active
  -> Cloud SQL contains lifecycle metadata
  -> no Google Secret Manager adapter resolves the active reference
  -> Windows Document Manager worker receives no real key
  -> SLDDRW jobs remain unclaimed or fail
  -> 2D preview never becomes ready
```

## 3. User Outcome

An Admin can enter a new SolidWorks Document Manager key once in `/settings/security`, test it and activate it. The system stores the value in Google Secret Manager, keeps only redacted lifecycle metadata in Cloud SQL, and makes the exact active version available to the trusted Windows worker through a protected server broker.

The UI must distinguish these facts:

- `憑證已可用`: the BFF can read the exact active Secret Manager version and the worker broker is configured.
- `預覽服務在線`: a Windows 2D worker has actually claimed or heartbeated a 2D-capability job recently; a 3D Shell worker signal cannot satisfy this state.
- `2D 預覽可用`: both conditions are satisfied and a sample/current job succeeds.

Saving a key must never, by itself, display the worker as online.

## 4. Scope

In scope for local/staging-ready RD:

- Add `google_secret_manager` to the settings secret provider contract.
- Add a server-only Google Secret Manager adapter using Google Application Default Credentials.
- Add a new version to one pre-provisioned SolidWorks secret; do not create or delete secret containers from the UI.
- Pin lifecycle metadata to an exact version resource name, never the mutable `latest` alias.
- Read the exact active version for test and worker credential resolution.
- Keep the existing `draft -> tested -> active -> retired/revoked` lifecycle and Admin-only mutations.
- Update worker credential readiness so `local_test_double` and historical Supabase references cannot report production readiness.
- Keep the token-gated, `private, no-store` worker credential broker; return plaintext only to the authenticated trusted worker.
- Expand PostgreSQL/SQLite provider compatibility without renaming or deleting current metadata columns.
- Add focused automated security, repository, API, worker and UI tests.

Out of scope:

- Live Google Cloud resource creation, IAM mutation, Terraform apply, deployment or production activation.
- Creating, disabling, destroying or deleting Secret Manager versions from the Admin UI.
- Migrating old Supabase Vault plaintext into Google Secret Manager.
- Storing Google service-account JSON keys on the Windows worker.
- Running SolidWorks native code in Cloud Run or a Next.js request.
- `.SLDDRW -> PDF`, interactive 3D or high-fidelity re-rendering.
- Claiming production readiness from a fake Secret Manager adapter or local test double.

## 5. Target Architecture

```text
Admin browser
  -> authenticated Admin-only BFF routes
      -> Google Secret Manager: secret material and immutable versions
      -> Cloud SQL: lifecycle/reference/test/audit metadata only

Trusted Windows 2D worker
  -> HTTPS + scoped worker bearer token
      -> BFF worker credential route
          -> resolve exact active Secret Manager version
          -> return key with private/no-store; do not log
  -> SolidWorks Document Manager DLL
  -> preview derivative PNG
  -> existing claim/heartbeat/complete APIs
```

Security boundaries:

- Browser bundles, browser APIs, job payloads, Cloud SQL rows, logs, audit, reports and screenshots contain no key plaintext.
- Google credentials remain with the Cloud Run runtime identity through Application Default Credentials.
- The Windows worker receives the Document Manager key only in process memory. It does not receive Google Cloud credentials.
- The worker token is a separate scoped secret. It must not be the Document Manager key and must be rotated independently.

## 6. Provider and Lifecycle Contract

### 6.1 Provider selection

```text
PDM_SETTINGS_SECRET_PROVIDER=google_secret_manager
PDM_GCP_PROJECT_ID=<google-cloud-project-id>
PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID=pdm-solidworks-document-manager-key
PDM_ENABLE_GCP_SECRET_WRITES=false|true
PDM_ENABLE_GCP_SECRET_READS=false|true
PDM_PREVIEW_WORKER_TOKEN=<separate-worker-broker-token>
```

Resolution rules:

1. `google_secret_manager` is the only accepted staging/production provider.
2. `local_test_double` is allowed only for isolated local tests and must remain visibly mocked/blocked.
3. Worker-local `SOLIDWORKS_DOCUMENT_MANAGER_KEY` is a developer break-glass fallback only. Production ignores it unless an explicit, audited emergency gate is introduced later.
4. `supabase_vault` remains readable only for historical metadata diagnosis; new draft creation must reject it as a current target.

### 6.2 Draft creation

1. Admin submits the key once over an authenticated same-origin request.
2. BFF validates minimum format/length without logging the input.
3. When the explicit write gate is enabled, the adapter calls `projects/{project}/secrets/{secretId}:addVersion` on a pre-provisioned secret.
4. The returned immutable version resource name, for example `projects/.../secrets/.../versions/7`, is stored in metadata.
5. Cloud SQL stores masked hint and one-way fingerprint; the response never includes the resource name or key plaintext.

### 6.3 Test and activation

- Test reads the exact draft version through Secret Manager and records only pass/fail, redacted code, actor and timestamp.
- Untested, blocked or failed drafts cannot activate.
- Activation atomically marks the tested version active and retires the prior active metadata reference.
- The runtime never resolves `latest`; it resolves the exact active version recorded in Cloud SQL.
- After revocation commits, every subsequent broker resolution must reject that metadata reference. It does not automatically destroy or disable the Google secret version.
- Revocation cannot erase plaintext already held by a running worker process. Worker credential caching must therefore be bounded by `credentialRefreshMs`; after the next failed/blocked refresh the worker clears or invalidates the cached key before claiming another Document Manager job. Emergency immediate containment stops/restarts the worker in addition to revoking metadata.

### 6.4 Worker credential broker

- Existing route: `/api/preview-workers/solidworks-document-manager-key`.
- Authentication: constant-time comparison of a scoped bearer token; unauthorized requests return 401/403 without provider detail.
- Response: key, source=`google_secret_manager`, and non-sensitive lifecycle version only if required by worker diagnostics.
- Headers: `Cache-Control: private, no-store, max-age=0`; equivalent no-cache headers on success and failure.
- Observability: record request outcome, provider code class and correlation ID only; never record Authorization or key material.
- Rate limit and ingress restrictions are release requirements, not optional hardening.

## 7. Data and Migration Contract

The current physical columns `vault_provider` and `vault_secret_id` are legacy names. This phase keeps them to avoid a destructive rename:

- `vault_provider='google_secret_manager'` means the reference authority is Google Secret Manager.
- `vault_secret_id` stores the exact Secret Manager version resource name, never plaintext.
- Domain code should expose provider-neutral aliases where practical, but API responses must not expose the resource name.

Required schema work:

- Add `google_secret_manager` to fresh SQLite and PostgreSQL provider checks.
- Add `db/postgres/027_settings_secret_google_secret_manager.sql` to replace the PostgreSQL check constraint without rewriting rows.
- Provide a transaction-safe local SQLite compatibility migration for existing developer databases; preserve references, test runs and activation events.
- Preserve the partial unique index that permits only one active reference per secret kind.
- Migration rollback is schema-only: restore the previous check only if no `google_secret_manager` rows exist. Never delete or rewrite live secret versions as rollback.

## 8. Code Boundary

Expected implementation surface:

- `src/lib/google-secret-manager.ts` - ADC-authenticated REST adapter with injectable base URL/client for tests.
- `src/lib/settings-secret-lifecycle.ts` - provider selection, exact-version read/write, readiness and redacted errors.
- `src/lib/repositories/settings-secret-async-repository.ts` - add provider enum compatibility.
- `src/app/api/settings/secrets/` - preserve Admin lifecycle contract and redacted outputs.
- `src/app/api/preview-workers/solidworks-document-manager-key/route.ts` - Google provider resolution and no-store security.
- `src/app/settings/page.tsx` - provider-neutral status and separate credential/worker wording.
- `scripts/run-solidworks-document-manager-preview-worker.mjs` - broker source compatibility; no persistent key file.
- `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `db/postgres/027_settings_secret_google_secret_manager.sql`.
- Focused QC scripts and package commands.

Do not mix unrelated drawing-workbench, numbering, lifecycle or release changes into the DEV-058 commit.

## 9. IAM and Provisioning Contract

Provisioning is performed by reviewed IaC/release work, not by the settings UI:

- Pre-create one environment-specific secret container.
- Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on that single secret.
- Grant `roles/secretmanager.secretVersionAdder` on that single secret only when Admin UI draft writes are enabled.
- Do not grant project-wide Secret Manager Admin.
- Do not grant version disable/destroy permissions in this phase.
- Enable Secret Manager API, define replication/KMS posture, audit-log ownership and rotation owner through the existing Google platform release package.

## 10. Error and UX Contract

Server error codes are stable and redacted:

- `GCP_SECRET_MANAGER_CONFIG_MISSING`
- `GCP_SECRET_MANAGER_WRITE_GATE_REQUIRED`
- `GCP_SECRET_MANAGER_READ_GATE_REQUIRED`
- `GCP_SECRET_MANAGER_PERMISSION_DENIED`
- `GCP_SECRET_MANAGER_VERSION_NOT_FOUND`
- `GCP_SECRET_MANAGER_VERSION_DISABLED`
- `GCP_SECRET_MANAGER_RATE_LIMITED`
- `PREVIEW_WORKER_TOKEN_NOT_CONFIGURED`
- `DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE`

UI rules:

- Show one primary conclusion: `需設定`, `待測試`, `可啟用`, `憑證可用`, or `需管理員處理`.
- Show worker presence separately as `預覽服務在線/未在線`; never infer it from secret activation.
- Preview cards continue automatic polling/recovery. They do not ask the user to refresh.
- Long waits use icon, tone and elapsed time; technical details remain in an Admin-only diagnostic disclosure.
- No UI string may display project ID, secret resource name, worker token, raw Google error body or key fingerprint beyond approved masking.

## 11. Acceptance Criteria

| ID | Acceptance criterion |
|---|---|
| GSM-AUTH-001 | Active architecture docs and runtime default no longer direct staging/production to Supabase Vault. |
| GSM-DATA-001 | Secret plaintext exists only in Google Secret Manager and transient server/worker memory; Cloud SQL contains metadata only. |
| GSM-VERSION-001 | Draft stores and tests an exact immutable version resource; runtime never resolves `latest`. |
| GSM-LIFE-001 | Untested/failed drafts cannot activate; activation retires the prior active metadata reference atomically. |
| GSM-RBAC-001 | Only Admin can create/test/activate/revoke; browser and non-Admin paths cannot access key material. |
| GSM-IAM-001 | Runtime permissions are limited to accessor plus optional version-adder on one secret. |
| GSM-BROKER-001 | Missing/wrong worker token is denied; all broker responses are private/no-store and redact provider details. |
| GSM-BROKER-002 | Trusted worker can receive the exact active key in memory and reports source `google_secret_manager` without logging it. |
| GSM-BROKER-003 | Credential cache is bounded; rotation adopts the new active version, and post-revocation refresh prevents new 2D job claims with the old key. |
| GSM-READY-001 | Settings UI distinguishes credential readiness from actual Windows worker presence. |
| GSM-READY-002 | `local_test_double`, historical Supabase metadata or a saved-but-untested key never reports 2D preview ready. |
| GSM-READY-003 | 3D worker health cannot satisfy the 2D worker presence/readiness condition. |
| GSM-MIG-001 | Fresh and existing SQLite/PostgreSQL schemas accept `google_secret_manager` while preserving rows and one-active-version constraint. |
| GSM-NEG-001 | 403, 404, disabled version, 429 and 5xx produce retryable/actionable redacted states without secret leakage. |
| GSM-REG-001 | Existing settings lifecycle, Drive settings, preview queue, 3D Shell worker and PDF/image/Drive previews do not regress. |
| GSM-EVID-001 | Fake adapter evidence is labeled local; release readiness requires a live Secret Manager read and real Windows `.SLDDRW` preview. |

## 12. Delivery Phases

| Phase | Current authorization | Deliverable | Exit gate |
|---|---|---|---|
| 1A Provider/schema | Completed locally | Google adapter, provider enum, fresh schema and migration artifact | TypeScript + provider/migration QC passed |
| 1B Lifecycle/UI | Completed locally | draft/test/activate/revoke and provider-neutral readiness wording | settings lifecycle/API/browser QC passed |
| 1C Worker broker | Completed locally | exact-version broker resolution, cache revoke handling and worker compatibility | security/redaction/worker contract QC passed |
| 1D Local QC | Completed locally | fake Secret Manager negative/positive tests and regression evidence | no open P0/P1 in local scope |
| Release activation | Not authorized by this document | IaC secret/IAM, live staging write/read, real Windows `.SLDDRW` smoke, deploy/rollback | `DEV-032` / deployment release gate |

## 13. Stop Conditions

Stop and return to PM/release governance if implementation requires:

- creating/deleting live Google resources or changing IAM;
- production/staging deploy, migration apply or data repair;
- importing plaintext from Supabase Vault;
- exposing Google credentials to the Windows worker;
- storing plaintext outside Secret Manager/transient memory;
- changing preview source-file authority or native CAD execution boundary;
- granting project-wide Admin or version destroy permissions;
- deleting legacy metadata columns or historical provider rows.
