# QA-PDM-SW-NATIVE-PREVIEW-WORKER - Windows SolidWorks Native Preview Worker Validation Plan

Status: Phase 1 Auto Preview Orchestration QA Passed / Google Secret Manager native readiness pending DEV-058
Date: 2026-08-07
Owner: Dev PM / QA
Related DEV: `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`

## 2026-08-07 Credential Validation Amendment

Preview queue, derivative, heartbeat, stale recovery, source-hash and UI criteria remain active. Secret-provider and native-readiness evidence now follows `.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`.

Google Secret Manager live read plus a real Windows `.SLDDRW` success are required before claiming 2D native readiness. Historical Supabase Vault or worker-local environment fallback is not the formal production target.

## 1. Purpose

Validate that PDM can show browser-readable previews for SolidWorks native attachments through generated derivatives, while keeping source files, secret material and native tooling safely separated.

User-facing target:

```text
圖號/料號附件中有 SolidWorks 原檔時，PDM 自動產生並顯示 PNG/PDF 預覽；失敗時清楚告訴使用者原因與下一步。
```

## 2. Scope

In scope:

- Preview job queue.
- File derivative metadata.
- Worker claim/complete contract.
- Fake local worker for automated PDM pipeline QC.
- Windows worker smoke evidence when available, including Shell thumbnail extraction and later Document Manager/eDrawings/equivalent renderers.
- Attachment preview UI states.
- Source hash/stale derivative protection.
- Secret redaction and settings boundary.
- Existing PDF/image/Google Drive preview regression.

Out of scope:

- Production deployment.
- Production migration/backfill.
- Direct data repair or deletion.
- Interactive 3D viewer.
- High-quality SOLIDWORKS/eDrawings rendering unless Phase 2 is separately authorized.
- Making preview failure a release blocker in Phase 1.

## 3. FMEA

| Failure mode | User impact | Priority | Control |
|---|---|---|---|
| Derivative shown for wrong source hash | User trusts wrong drawing/model preview | P0 | QA-HASH-001 |
| Secret appears in job payload/log/API response | License/API key leak | P0 | QA-SEC-001 |
| Worker runs native CAD tooling inside web request | Slow/hung PDM and unstable server | P0 | QA-ARCH-001 |
| Failed job leaves blank preview card | User does not know next action | P1 | QA-UI-003 |
| Fake worker evidence is claimed as real SolidWorks readiness | False readiness | P0 | QA-EVID-002 |
| Derivative replaces source file | Loss of controlled CAD evidence | P0 | QA-DATA-001 |
| Non-reader can access derivative | Unauthorized drawing/model disclosure | P0 | QA-RBAC-002 |
| Worker accepts unsupported file type | Noise, errors and bad evidence | P1 | QA-JOB-004 |
| Existing PDF/image preview regresses | Current working previews break | P1 | QA-REG-001 |
| No embedded preview in SW file | User still sees placeholder | P1 | QA-WORKER-004 |
| Shell provider returns blank thumbnail | User sees a misleading preview | P1 | QA-WORKER-005 |
| Document Manager worker has no readable key | SLDDRW remains queued or fails obscurely | P1 | QA-WORKER-006 |
| Preview job has no heartbeat | User cannot tell whether to wait | P1 | QA-AUTO-001 |
| Browser needs manual refresh to see completion | User sees stale placeholder | P1 | QA-AUTO-002 |
| Stale worker completes after automatic recovery | Wrong job can overwrite current state | P0 | QA-AUTO-003 |

## 4. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| QA-JOB-001 | Native SW attachment can enqueue an idempotent preview job | service/API test |
| QA-JOB-002 | Duplicate active jobs for same source hash/kind/profile are prevented | service/API test |
| QA-JOB-003 | Worker can claim only supported queued jobs | worker contract test |
| QA-JOB-004 | Unsupported extensions are skipped with actionable state | negative test |
| QA-DER-001 | Successful worker output creates a derivative record and stored file pointer | repository/service test |
| QA-DER-002 | Derivative has MIME, size, generator profile and source hash metadata | repository/service test |
| QA-HASH-001 | Source hash mismatch prevents derivative acceptance/display | negative test |
| QA-DATA-001 | Generated derivative is not stored as or treated as source CAD attachment | static/repository test |
| QA-SEC-001 | No SolidWorks API/license key appears in job rows, worker output, logs, API JSON, report JSON or screenshot | redaction scan |
| QA-RBAC-001 | Non-authorized users cannot enqueue/retry preview jobs | API permission test |
| QA-RBAC-002 | Users without source attachment read permission cannot read derivatives | API permission test |
| QA-ARCH-001 | Next.js request handlers do not import/run native CAD worker code synchronously | static architecture test |
| QA-UI-001 | Ready PNG derivative replaces `預覽待產生` when a valid derivative exists | browser test |
| QA-UI-002 | Queued/running states show progress copy | browser test |
| QA-UI-003 | Failed/skipped states show reason and next action without raw stack/command text | browser test |
| QA-UI-004 | Stale derivative is hidden or clearly marked and regeneration is available | browser test |
| QA-REG-001 | Existing PDF/image/Drive preview paths still work | regression test |
| QA-EVID-001 | Fake worker evidence is labeled as fake/local contract proof | QC report |
| QA-EVID-002 | Real native preview readiness requires real Windows worker/sample-file evidence | QC gate |
| QA-WORKER-005 | Blank or low-information PNG output is rejected and shown as a failed job, not as a ready preview | worker/browser test |
| QA-WORKER-006 | Document Manager SLDDRW worker reports missing worker-readable key without exposing secret material | worker/browser test |
| QA-AUTO-001 | Running jobs send heartbeats; 30-second stale jobs requeue up to three attempts, then fail with redacted copy | service/static test |
| QA-AUTO-002 | Native attachment list/create auto-enqueues and foreground UI polling updates the card without manual refresh | service/browser/static test |
| QA-AUTO-003 | Completion/failure requires the current running worker owner; recovered jobs reject stale worker writes | service test |

## 5. Required Evidence After Phase 1 Implementation

Minimum command evidence:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run qc:master-attachments
```

New focused evidence expected from implementation:

```powershell
npm.cmd run qc:pdm-sw-native-preview-worker
npm.cmd run qc:pdm-sw-native-preview-redaction
npm.cmd run qc:master-attachments
```

Regression evidence:

```powershell
npm.cmd run qc:pdm-settings-center-secret-lifecycle
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-postgres
```

Required browser/UI evidence:

- Drawing attachment drawer with `.SLDPRT` source and ready PNG derivative.
- Drawing attachment drawer with `.SLDDRW` source either showing a real ready derivative or a clean failed/skipped state when the worker cannot produce a meaningful thumbnail.
- Pending preview state uses icon/tone/motion plus short copy such as `產生中` or `處理較久`; no manual refresh is required.
- Failed preview state uses `無法預覽` with a redacted short reason and `重試` only when retry is appropriate; unsupported sources show `請下載原檔`.
- Missing SolidWorks secret/settings blocker state routing Admin to `/settings/security`.
- Existing PDF source still previews inline.
- Existing image source still previews inline.
- Existing Google Drive preview fallback still renders when derivative is absent.

Phase 1 local evidence captured on 2026-07-06:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-sw-native-preview-worker`: passed 90/90.
- `npm.cmd run qc:pdm-sw-native-preview-redaction`: passed 68/68.
- `npm.cmd run qc:master-attachments`: passed 101/101.
- `npm.cmd run qc:pdm-settings-center-secret-lifecycle`: passed 22/22.
- `npm.cmd run qc:supabase-secret-boundary`: passed 15/15.
- `npm.cmd run qc:db-provider-contract`: passed 35/35.
- `npm.cmd run qc:db-provider-postgres`: passed 9/9.
- `npm.cmd run qc:pdm-shared-3d-ma-baseline`: passed 20/20.
- `npm.cmd run dev:local:check`: passed with local URL `http://127.0.0.1:3000/`.
- API worker smoke: `D-0007-MA1.SLDPRT` job `53749eb7-9aa1-4902-b6cc-a4fc2035f814` succeeded through `qc-windows-shell-worker`; derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640` is `image/png`, `768x576`, generator `windows-shell-ishellitemimagefactory-v1`.
- API worker smoke: `D-0007-MA1.SLDDRW` job `f921e930-2cec-441c-a8dd-4a06a6f71c6d` failed cleanly when this workstation's Shell provider returned blank/low-information output, then failed cleanly through the Document Manager worker with missing worker-readable key recovery copy.
- Worker compile smoke: `node scripts/run-solidworks-document-manager-preview-worker.mjs --compile-only` compiled the C# exporter successfully.
- Browser smoke: screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png` shows real 3D preview, compact 2D failed/retry state, and no fake preview display.

Phase 1 auto-orchestration follow-up evidence captured on 2026-08-07:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-sw-native-preview-worker`: passed 101/101, including auto-enqueue, foreground polling, heartbeat, stale recovery and worker-owner guards.
- `npm.cmd run qc:pdm-sw-native-preview-redaction`: passed 68/68.
- `npm.cmd run qc:master-attachments`: passed 103/103.
- `npm.cmd run dev:local:check`: passed; fixed local server remained healthy on `http://127.0.0.1:3000/`.
- Windows Shell worker smoke on isolated local runtime: `.SLDPRT` claim/completion accepted and a current-hash PNG derivative was rendered.
- Playwright visual QC on isolated port 3001: native cards automatically moved from `建立中` to ready 3D PNG after worker completion; unavailable 2D worker remained visibly `處理較久` with `系統會自動接續`; screenshot `output/playwright/preview-auto-qc-runtime/auto-preview-updated.png`.
- Browser console errors: 0. Observed preview/status API responses: HTTP 200. No manual refresh was used to observe the 3D completion.
- Limitation: this evidence proves the PDM queue/metadata/storage/UI pipeline, one real Windows Shell `.SLDPRT` path, and the Document Manager SLDDRW worker compile/claim/fail-safe path. It does not prove successful SOLIDWORKS Document Manager/eDrawings/equivalent extraction for `.SLDASM` or `.SLDDRW` because the local settings secret provider is `local_test_double` metadata and no worker-readable key is available.

Phase 1 2D stuck-state correction evidence captured on 2026-08-07:

- The dedicated Document Manager worker now supports persistent `--watch` polling for `SLDDRW` jobs; the local launcher manages it separately from the model worker.
- Queued jobs not claimed within 120 seconds are automatically failed with `preview_worker_unavailable`; the UI distinguishes `等待預覽服務` from an actively running but delayed job and never requires manual refresh.
- `npm.cmd run qc:pdm-sw-native-preview-worker`: passed 104/104; `npm.cmd run qc:master-attachments`: passed 103/103; `npm.cmd run qc:pdm-sw-native-preview-redaction`: passed 68/68; TypeScript, lint and `npm.cmd run dev:local:check` passed.
- Current local readiness is explicit: website and 3D worker are healthy, while the 2D worker is `not_configured` because no worker-readable SolidWorks Document Manager key is present. Successful `.SLDDRW` image generation remains gated on that secret.

Required viewports:

- Desktop: `1440x900`.
- Tablet/default surface: `1024x768`.
- Phone sanity on default surface: `390x844`; dedicated phone UI is not required, but no horizontal overflow or overlapping critical controls is allowed.

Visible error hard gate:

- Fail QC if preview pages show unexpected `Internal Server Error`, raw `/api/...` route errors, raw worker command lines, raw stack traces, clipped primary actions, horizontal overflow, or overlapping preview controls.

## 6. Test Matrix

| Case | Setup | Expected |
|---|---|---|
| Missing derivative | SW source exists, no job | UI shows preview not generated and offers generation if authorized |
| Queue job | Admin/Engineer enqueues | Job is queued with source hash and no secret value |
| Fake worker success | fake worker completes PNG in explicit local mode | Derivative appears only when local fake mode is explicitly enabled |
| Fake worker fail | fake worker returns redacted error | UI shows actionable failed state |
| Hash mismatch | source hash changed after enqueue | Worker result rejected; stale derivative not shown |
| Missing secret | no active SolidWorks secret | UI routes to settings; worker does not receive plaintext through job |
| No embedded preview | real worker returns no preview bitmap | UI says open/save in SolidWorks or use render worker phase |
| Blank Shell drawing preview | Shell returns a blank `.SLDDRW` PNG | Worker rejects output; UI shows failed state with redacted recovery copy |
| Missing worker-readable Document Manager key | SLDDRW job claimed by Document Manager worker while UI secret is local test-double metadata | Worker fails job with compact recovery copy; no key appears in API/DB/browser output |
| Non-reader derivative request | user lacks source read permission | 403/404 without revealing derivative |
| PDF regression | source is PDF | Existing inline PDF preview still works |
| Drive regression | Drive file uploaded, no derivative | Existing Drive preview iframe still works |

## 7. Real Windows Worker Smoke Gate

Before marking full real native SolidWorks preview readiness as passed, QC must capture:

- Windows worker host identity.
- Worker component name and version, distinguishing Shell, Document Manager, eDrawings or SOLIDWORKS automation.
- Credential boundary: active secret resolved without exposing plaintext.
- Sample `.SLDPRT`, `.SLDASM` and `.SLDDRW` files.
- PNG output for each supported sample or documented failed/skipped reason. Blank output must not be accepted as ready.
- Worker log redaction scan.
- PDM UI screenshot showing at least one real generated PNG derivative.
- QC report that distinguishes fake local contract proof from real native CAD proof.

This gate may reuse or extend the existing Document Manager evidence path, but it must not close `DEV-CAD-001` unless that DEV's own evidence requirements are also satisfied.

## 8. Stop Conditions

Stop QA/RD and return to PM/user if:

- Implementation needs production deploy, production migration, direct data repair, data deletion or external paid service.
- RD needs browser/frontend access to SolidWorks API/license key material.
- RD needs to store the key in preview job rows, worker output files or logs.
- RD needs to run native CAD tooling synchronously inside Next.js API handlers.
- Worker cannot authenticate as a trusted service identity.
- Worker output cannot be tied to source hash.
- Real native preview proof is required but no Windows host/sample files/component are available.

## 9. Regression Coverage

Existing gates that must keep passing when touched:

- `npm.cmd run qc:master-attachments`
- `npm.cmd run qc:pdm-settings-center-secret-lifecycle`
- `npm.cmd run qc:supabase-secret-boundary`
- `npm.cmd run qc:pdm-shared-3d-ma-baseline`
- `npm.cmd run qc:pdm-drawing-revision-package-model`

Regression expectations:

- Native preview derivatives do not alter drawing revision package source membership.
- Shared 3D model source ownership remains based on source file asset and hash, not preview derivative.
- Manufacturing baseline source evidence does not switch to derivative files.
- Existing attachment download URLs still serve source files unless derivative route is explicitly used.

## 10. Deferred Evidence

| Evidence | Status | Recovery condition |
|---|---|---|
| Real Windows Document Manager PNG success | Worker implemented / blocked on Google Secret Manager integration and success evidence | Provide an exact active credential through the DEV-058 Google Secret Manager broker, then run sample `.SLDDRW` and `.SLDASM` evidence |
| `.SLDDRW -> PDF` renderer | Not authorized | Authorize Phase 2 and choose eDrawings/SOLIDWORKS/equivalent renderer |
| Interactive 3D derivative | Not authorized | Authorize Phase 3 architecture/security review |
| Production rollout/backfill | Not authorized | Complete implementation, storage policy, backup/rollback and deployment-release gate |
