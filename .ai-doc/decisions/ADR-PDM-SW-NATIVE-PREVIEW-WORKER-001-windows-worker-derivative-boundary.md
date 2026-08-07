# ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001 - Windows Worker Derivative Boundary

Status: Accepted / Phase 1 Local Implemented + Auto-Orchestration QC Passed / Windows Shell + Document Manager Worker Partial Evidence
Date: 2026-08-07
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
Related DEV: `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`

## Context

The current PDM attachment panel can inline-preview browser-readable files, but native SolidWorks files display `預覽待產生`. The user wants a Windows File Explorer-like experience where `.SLDPRT`, `.SLDASM` and `.SLDDRW` show a recognizable preview.

Windows File Explorer can use local shell thumbnail handlers on a CAD workstation. AI_PDM is a web application, so the browser cannot directly parse SolidWorks native files or call local Windows preview handlers safely.

The existing settings center now has a SolidWorks Document Manager secret lifecycle, but secret configuration alone does not generate previews. PDM needs a controlled derivative pipeline.

## Decision

Adopt a Windows preview worker plus generated derivative architecture:

1. Native SolidWorks files remain controlled source attachments.
2. PDM creates auditable preview jobs for native source files.
3. A trusted Windows worker generates browser-readable derivatives, beginning with PNG thumbnails.
4. PDM stores derivative metadata tied to source file hash and generator evidence.
5. The UI displays ready PNG/PDF derivatives and falls back to current safe placeholders when no derivative exists.
6. Next.js request handlers do not run SolidWorks, eDrawings, shell handlers or COM automation directly.
7. The browser never receives SolidWorks API/license key material.
8. Real SolidWorks preview readiness requires file-type-specific Windows worker evidence; current Shell `.SLDPRT` evidence and Document Manager SLDDRW worker compile/claim evidence are partial until `.SLDASM` and successful `.SLDDRW` outputs are proven by Document Manager/eDrawings/equivalent renderer or explicitly skipped.
9. Native preview jobs are auto-enqueued on attachment list/create, the browser foreground-polls pending state, and workers heartbeat every five seconds; stale jobs are automatically recovered without manual refresh.
10. Job completion/failure is accepted only from the worker that currently owns the running job, preventing an old worker from overwriting recovered work.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Browser directly previews `.SLDPRT` / `.SLDASM` / `.SLDDRW` | Rejected | Browsers do not natively parse SolidWorks formats and this would create unsafe client/plugin assumptions. |
| Use Google Drive preview iframe for native files | Rejected as authority | It may help some file types but does not provide controlled SolidWorks native derivative evidence. |
| Call Windows Explorer shell thumbnail handler from browser or Next.js routes | Rejected | Shell handlers depend on local desktop state and must not run in request handlers. |
| Use Windows Shell thumbnail extraction inside an isolated worker | Accepted as Phase 1 partial worker | Useful for File Explorer-like thumbnails when quality-gated, but not enough to close full Document Manager/eDrawings readiness. |
| Use Document Manager embedded sheet-preview extraction inside an isolated worker | Accepted as Phase 1 partial worker | Correct boundary for SLDDRW PNG preview, but requires worker-readable key material from Vault or worker environment and still depends on saved embedded preview data. |
| Run SolidWorks/eDrawings/COM inside Next.js API routes | Rejected | Native CAD tooling is slow, stateful and Windows-specific; request handlers must not own it. |
| Use a separate Windows preview worker that writes derivatives | Accepted | Provides clear isolation, retry, evidence, redaction and UI-friendly artifacts. |
| Store derivatives as source attachments | Rejected | Derivatives are display artifacts and must not replace controlled CAD source files. |

## Chosen Rule

The boundary is:

```text
PDM API = auth, queue, metadata, source hash validation
Windows worker = native Shell/SolidWorks/eDrawings/Document Manager preview generation or extraction
Derivative storage = PNG/PDF artifacts tied to source hash
Browser UI = status + derivative rendering only
```

Preview generation is asynchronous and idempotent. A preview derivative is valid only while its recorded source hash matches the current source file hash.

## Consequences

Positive:

- Users can see SW native file previews without downloading files.
- PDM keeps source files and generated display artifacts separate.
- Failures become visible and retryable instead of blank placeholders.
- Users do not need to refresh the page to see a completed preview; visual state distinguishes active work from delayed work.
- Real native preview evidence can be separated from local fake-worker pipeline tests.
- Secret redaction and worker evidence can be audited.

Costs / tradeoffs:

- Requires additive queue and derivative metadata.
- Requires a trusted Windows worker deployment path.
- Requires storage and retention policy for generated files.
- Embedded/Shell previews may be stale, blank or absent if the SolidWorks file or workstation preview provider lacks useful preview data.
- A UI-entered local test-double secret proves metadata/redaction only; it does not provide plaintext key material to the worker.
- High-fidelity PDF/rendering requires later eDrawings/SOLIDWORKS automation decisions.

## Migration / Compatibility Impact

- Existing source attachments remain unchanged.
- Existing PDF/image/Drive previews remain compatible.
- Existing `預覽待產生` placeholders remain the safe fallback until derivatives exist.
- Native pending states are automatically queued and refreshed in the foreground; terminal failures remain explicit and do not retry forever.
- Phase 1 local PDM pipeline is implemented with fake-worker evidence, Windows Shell `.SLDPRT` proof, and Document Manager SLDDRW worker compile/claim/fail-safe evidence; production rollout and historical backfill remain not authorized by this ADR.
- Real Document Manager/eDrawings/equivalent success evidence still belongs to the external CAD evidence gate for `.SLDASM`, `.SLDDRW` and drawing PDF, and must not be silently marked complete.

## Superseded / Amended Documents

This ADR amends the preview behavior implied by:

- `DEV-PDM-UI-POLISH-001` SolidWorks preview fallback.
- `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md` SolidWorks secret vertical slice.
- `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md` part/root 3D attachment display behavior.

Specific amendment:

- A configured SolidWorks secret is not enough to show previews. PDM must also have preview jobs, generated derivatives and a worker evidence path.
- Generated previews are not source authority for drawing package, shared 3D model or manufacturing baseline evidence.

## Enforcement

RD must not mark the DEV complete until:

- PNG/PDF derivatives are stored separately from source files.
- Derivatives are validated against source hash.
- UI shows ready, queued, running, failed, stale and skipped preview states.
- Worker job payloads and evidence are redacted.
- Worker heartbeats, 30-second stale recovery and current-owner completion guards are verified.
- Browser/API responses do not expose SolidWorks API/license key material.
- Next.js request handlers do not run native CAD tooling synchronously.
- Real native readiness is backed by Windows worker evidence or explicitly marked as still gated.
