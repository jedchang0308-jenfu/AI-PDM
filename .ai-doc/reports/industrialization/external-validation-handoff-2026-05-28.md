# External Validation Handoff - 2026-05-28

Last updated: 2026-07-10
Authoritative task file: `.ai-doc/dev_task.md`

## Scope

This handoff consolidates production-readiness blockers and deferred external scopes. It is intended for RD/QA/QC coordination only; first-version readiness currently covers the formal numbering / draft production slice, not full PDM/CAD production readiness.

Current first-version gate state:

| Task | Gate | Current state | Required environment |
|---|---|---|---|
| `DEV-IND-007` | Disposable Postgres shadow migration/RLS gate | Complete for first-version boundary | Evidence: `data/quality/postgres-shadow/shadow-compare-1783676196559.json`; formal Supabase cutover remains in `DEV-030` / `DEV-032` |
| `DEV-FIELD-001` | Formal numbering / draft pilot field-test closure | Open | Field-test operator, 3-5 internal users, formal numbering / draft script, signed evidence, issue closure |
| `DEV-CAD-001` | Native SolidWorks metadata / 2D preview | Deferred from first-version blocker | Human test: SW upload OK and 3D preview OK; 2D preview/native metadata remains future CAD phase |
| `DEV-SW-001` | SolidWorks Add-in real-machine validation | Deferred from first-version blocker | No current Add-in product route; retain history only |
| `DEV-BACKUP-001` | Independent restore drill | Deferred from first-version blocker | Full restore drill resumes for full PDM/file-storage production readiness |

Current local gate status as of 2026-07-10:

| Gate | Latest result |
|---|---|
| `qc:dev-task-completion-audit` | Updated first-version expectation: only `DEV-FIELD-001` remains as first-version external blocker |
| `qa:dev-task:sync` | Supabase/Postgres shadow evidence now resolves through `data/quality/postgres-shadow/shadow-compare-1783676196559.json`; CAD/SW/backup remain deferred |
| `qc:production-readiness:report` | Updated first-version expectation: `ready=false` until field-test / release gate is complete |
| `qc:native-cad-extractor-contract` | PASS, 14/14; local external extractor contract and no-extractor fallback are covered |
| `qc:document-manager-extractor-probe` / `qc:document-manager-probe-redaction` / `qc:document-manager-probe-path-gate` | PASS, 6/6 + 9/9 + 4/4; local mock probe output now uses `.tmp/...` fixtures |
| `field-test:preflight -- --profile all` / `field-test:handoff` / `qc:field-test-handoff-package` | PASS; latest handoff package `data/field-test-handoffs/20260706-123433`, package QC 53/53 |
| `qc:field-test-issue-intake` | PASS, 11/11; field issues can be dry-run or written to the defect register, and active P0/P1 issues block `qc:defects-zero` |
| `postgres-shadow:handoff` / `qc:postgres-shadow-handoff-package` | PASS; latest Postgres shadow handoff package `data/postgres-shadow-handoffs/20260710-034552` |
| Disposable Postgres shadow live gate | PASS; schema apply, RLS apply, compare guard, schema/RLS-only live compare and `qc:postgres-shadow` 26/26 all passed against `.tmp/postgres-shadow-20260710-173550`; temp server stopped |
| `qc:external-blocker-closure` | Updated to validate first-version blocker/deferred-scope split |
| `field-test:preflight -- --profile all --require-evidence` | `ready=false`; 19 passed / 3 failed / 1 warning |

## Shared Evidence Package

Latest local field-test package:

- `data/field-test-handoffs/20260706-123433`
- Package manifest: `data/field-test-handoffs/20260706-123433/field-test-handoff.json`
- Operator README: `data/field-test-handoffs/20260706-123433/README.md`
- Final checklist: `data/field-test-handoffs/20260706-123433/qc-checklist.ps1`

The package already contains copies of the current draft reports:

- Restore drill report copy: `data/field-test-handoffs/20260706-123433/reports/restore-drill-report.json`
- SolidWorks Add-in report copy: `data/field-test-handoffs/20260706-123433/reports/sw-addin-report.json`
- Document Manager report copy: `data/field-test-handoffs/20260706-123433/reports/document-manager-report.json`

Source report records:

- Restore drill: `data/restore-drill-reports/20260706-123421/report.json`
- SolidWorks Add-in: `data/sw-addin-test-reports/20260706-123421/report.json`
- Document Manager: `data/document-manager-reports/20260706-123421/report.json`

Latest local Postgres shadow handoff package:

- `data/postgres-shadow-handoffs/20260710-034552`
- Package manifest: `data/postgres-shadow-handoffs/20260710-034552/postgres-shadow-handoff.json`
- Operator README: `data/postgres-shadow-handoffs/20260710-034552/README.md`
- Supabase advisor checklist: `data/postgres-shadow-handoffs/20260710-034552/supabase-advisor-checklist.md`
- Final checklist: `data/postgres-shadow-handoffs/20260710-034552/qc-checklist.ps1`

## Gate Details

### DEV-CAD-001 - Native CAD Metadata Extraction

Required inputs:

- Licensed SolidWorks Document Manager installation or approved equivalent native CAD extractor.
- Documented license/account ownership and renewal path without exposing secrets.
- Real `.sldprt`, `.sldasm`, and `.slddrw` sample files with known drawing number, item number, revision, title, and reference expectations.
- Deployment host where the extractor command can be executed by the Web/Windows upload flow.

Commands:

```powershell
.\data\field-test-handoffs\20260706-123433\commands\document-manager-preflight.ps1
.\data\field-test-handoffs\20260706-123433\commands\document-manager-probe.ps1
.\data\field-test-handoffs\20260706-123433\commands\document-manager-fill-template.ps1
npm.cmd run qc:native-cad-extractor-contract
npm.cmd run qc:document-manager-extractor-probe
npm.cmd run qc:document-manager-probe-redaction
npm.cmd run qc:document-manager-probe-path-gate
npm.cmd run qc:document-manager-report
```

Pass criteria:

- All required Document Manager report cases pass.
- Environment fields, extractor command contract, final result, and signoff are filled.
- Probe evidence redacts license keys, tokens, passwords, secrets, API keys, and client secrets before `probe.json` is shared.
- Native metadata is read directly from `.sldprt`, `.sldasm`, and `.slddrw`.
- Assembly and drawing references are proven through the CAD reference adapter or an approved equivalent.
- No pass is allowed if metadata only comes from sidecar files, filenames, or manual inference.

### DEV-SW-001 - SolidWorks Add-in Real-Machine Validation

Required inputs:

- Real CAD workstation with SolidWorks installed.
- Administrator PowerShell for COM registration.
- .NET Framework 4.8.
- Reachable AI_PDM backend URL and test account.
- Native part, assembly, and drawing files for upload and export flows.

Commands:

```powershell
.\data\field-test-handoffs\20260706-123433\commands\sw-addin-preflight.ps1
.\data\field-test-handoffs\20260706-123433\commands\sw-addin-build-and-register.ps1
.\data\field-test-handoffs\20260706-123433\commands\sw-addin-fill-template.ps1
npm.cmd run qc:sw-addin-real-machine-report
```

Pass criteria:

- Add-in builds, registers, appears in SolidWorks, loads, unloads, and reloads without duplicate UI.
- Login, token handling, logout, invalid login, and credential safety cases pass.
- Part, assembly, and drawing properties are extracted correctly.
- Drawing upload includes native `.slddrw`, exported `.pdf`, and exported `.dwg`.
- Valid backend submissions reach expected workflow states and Web evidence is recorded.
- All required report cases pass; optional cases must be explicitly passed or marked not applicable with a reason.

### DEV-BACKUP-001 - Independent Restore Drill

Required inputs:

- Independent Windows machine that is not the production/source machine.
- Restore handoff copied from `data/field-test-handoffs/20260706-123433/restore-handoff`.
- Backup snapshot and restore target directory recorded by the operator.

Commands:

```powershell
.\data\field-test-handoffs\20260706-123433\commands\restore-preflight.ps1
.\data\field-test-handoffs\20260706-123433\restore-handoff\restore-on-test-machine.ps1
.\data\field-test-handoffs\20260706-123433\commands\restore-fill-template.ps1
npm.cmd run qc:restore-drill-report
```

Pass criteria:

- Snapshot manifest verification returns valid.
- Checksum verification reports no missing, size mismatch, or hash mismatch files.
- Restore command exits `0` on the independent test machine.
- Restored SQLite database passes integrity check.
- Restored repository files are present and linked to restored DB rows.
- `npm.cmd run build`, `npm.cmd run smoke`, `npm.cmd run qc:api`, and `npm.cmd run qc:file-hashes` pass against the restored data paths.
- Operator records transcript, restored target path, readiness output, final result, and signoff.

### DEV-FIELD-001 - Formal Field-Test Closure

Required inputs:

- First-version formal numbering / draft pilot script.
- Selected 3-5 internal users and smoke company / tenant.
- Evidence for official numbering, draft creation, unavailable-feature inert state, permissions, and error recovery.
- Issue log for every failed or blocked field case.

Final command:

```powershell
.\data\field-test-handoffs\20260706-123433\commands\field-issues-import.ps1
npm.cmd run qc:defects-zero
.\data\field-test-handoffs\20260706-123433\qc-checklist.ps1
```

Pass criteria:

- `qc-checklist.ps1` passes.
- Every failed or blocked field case is converted into `data/quality/defect-register.json` or a new `.ai-doc/dev_task.md` item.
- `npm.cmd run qc:defects-zero` passes after active P0/P1 field defects are closed or verified.
- `npm.cmd run field-test:preflight -- --profile all --require-evidence` passes.
- `npm.cmd run qc:production-readiness:report` reports no external evidence blocker for these gates.
- `DEV-FIELD-001` is not marked complete until field evidence and issue closure are both signed off.

### DEV-IND-007 - Live Supabase Shadow Gate

Current evidence:

- `.ai-doc/reports/industrialization/postgres-shadow-migration-plan-2026-05-28.md`
- `.ai-doc/reports/industrialization/supabase-live-probe-2026-05-28.md`
- `.ai-doc/reports/industrialization/supabase-shadow-target-guard-verification-2026-05-28.md`
- Postgres shadow handoff package: `data/postgres-shadow-handoffs/20260710-034552`
- Disposable local Postgres shadow compare report: `data/quality/postgres-shadow/shadow-compare-1783676196559.json`

The first-version disposable Postgres shadow gate is complete: schema migration applied, RLS plan applied, compare guard reported `ai_pdm_shadow_schema`, schema/RLS-only live compare passed, and `qc:postgres-shadow` passed 26/26. A formal Supabase project/branch advisor review is still required only if the release path chooses live Supabase cutover under `DEV-030` / `DEV-032`.

Do not mutate existing Supabase projects for this gate unless the user explicitly approves the target and, if a new project or branch is required, confirms the cost.

Required inputs for future live Supabase cutover:

- Disposable Supabase project or branch dedicated to the generated AI_PDM shadow schema.
- Postgres connection string set as `PDM_POSTGRES_SHADOW_URL`.
- Permission to apply the generated migration and inspect advisors.

Current target decision state:

- Supabase connector can inspect organization `JED`.
- Existing projects `ProJED` and `ProJED_TEST` are not acceptable disposable targets because their public schemas already contain product/application tables.
- Prior cost lookup showed new project cost `0/monthly` and branch cost `0.01344/hourly`.
- Do not create a project or branch until the user explicitly confirms organization, region, resource type, and cost.

Commands after a future disposable Supabase target exists:

```powershell
.\data\postgres-shadow-handoffs\20260710-034552\commands\01-pre-migration-guard.ps1
.\data\postgres-shadow-handoffs\20260710-034552\commands\02-apply-migration.ps1
.\data\postgres-shadow-handoffs\20260710-034552\commands\03-compare-shadow.ps1
.\data\postgres-shadow-handoffs\20260710-034552\qc-checklist.ps1
```

Additional Supabase checks:

- Apply the generated migration to the disposable target.
- Apply the RLS plan to the disposable target before compare.
- Confirm row count and key hash comparison against SQLite, or explicitly accept schema/RLS-only compare before data migration parity.
- Run Supabase security advisors and performance advisors.
- Confirm RLS policies do not depend on `user_metadata`.
- Record advisor findings and remediation decisions before considering a provider switch.

Pass criteria:

- Generated migration applies cleanly on the disposable target.
- Pre-migration target guard rejects any non-empty public schema before DDL.
- Compare target guard rejects non-AI_PDM, partial, or non-forced-RLS schemas.
- SQLite and Postgres shadow row counts/key hashes match for covered tables, or the approved release scope explicitly accepts schema/RLS-only compare before data migration parity.
- Supabase security advisor has no unresolved high-risk finding relevant to the AI_PDM schema.
- Supabase performance advisor findings are either remediated or explicitly accepted with rationale.
- Rollback/rebuild procedure is documented and repeatable.

## QA FMEA

| Risk | Cause | Effect | Detection | Control |
|---|---|---|---|---|
| False production-ready pass | Draft reports are treated as evidence | External gates are closed without real-machine proof | `field-test:preflight -- --profile all --require-evidence`; report QC scripts | Keep tasks `[/]` or `[!]` until signed reports pass |
| API or compute waste | Re-running expensive probes without missing external inputs | Cost and time waste without new evidence | Check environment prerequisites before command execution | Run local preflight first; skip live gates until target exists |
| Production Supabase mutation | Using an existing live project as the shadow target | Data/schema damage or policy drift | Verify project purpose before DDL | Require explicit target approval and cost confirmation for new resources |
| Native CAD false pass | Metadata inferred from sidecar or filename | PDM fields appear valid but native extraction is unproven | Document Manager report source checks | Require `.sldprt/.sldasm/.slddrw` native extraction evidence |
| Restore drill false pass | Restore runs on source machine | Backup recoverability remains unproven | Restore report machine/environment fields | Require independent test machine and transcript |
| Field-test issue loss | Failed field cases are not converted into tasks | Known defects disappear from backlog | Compare field report failures against `.ai-doc/dev_task.md` | Create new tasks before closing `DEV-FIELD-001` |

## QC Commands for Current Local Readiness

These commands are safe to run locally and should remain green while external evidence is pending:

```powershell
npm.cmd run qc:dev-task-completion-audit
npm.cmd run qa:dev-task:sync
npm.cmd run qc:external-blocker-closure
npm.cmd run field-test:preflight -- --profile all
npm.cmd run qc:production-readiness:report
```

Expected current result:

- Local preflight passes, with an administrator warning expected on machines that are not running elevated PowerShell.
- Production readiness remains open because `DEV-FIELD-001` field evidence and the `DEV-032` release gate are still incomplete; `DEV-IND-007` no longer lacks first-version disposable Postgres shadow evidence.
