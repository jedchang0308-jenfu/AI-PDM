# QC Validation Report - Metadata Extraction Adapter

## Scope

- Dev tasks:
  - `P0` 建立 metadata extraction adapter。
  - `P0` Web/Windows upload 改成優先使用 CAD 內部屬性。
- Validation plan: `.ai-doc/qa/qa-metadata-extraction-adapter-validation-plan-2026-05-27.md`.
- Environment: production build served by `next start -p 3001`.
- Release mode: `PDM_RELEASE_MODE=local_stub`.
- Base URL for API/UI QC: `http://localhost:3001`.

## Result

PASS.

## Evidence

| Check | Result |
| --- | --- |
| `cmd /c node_modules\.bin\tsc.cmd --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run qc:api` | PASS, 380 passed / 0 failed |
| `npm run qc:ui` | PASS, 26 passed / 0 failed |
| `npm run qc:file-hashes` | PASS, 1767 ok / 0 missing / 0 unreadable / 0 size mismatch / 0 hash mismatch |

## Metadata Adapter Cases

| Case | Result |
| --- | --- |
| `META-001` native CAD metadata adapter returns 200 | PASS |
| `META-002` native CAD metadata has high priority drawing number | PASS |
| `META-003` native CAD metadata has high priority revision | PASS |
| `META-004` native CAD metadata source is recorded | PASS |

## Findings

- No failed QC case found.
- Native CAD metadata adapter output is consumed before sidecar and filename fallback.
- Detection response records native metadata source through `nativeMetadataFiles`.
- Formal SolidWorks Document Manager API licensing/deployment remains open and is not claimed complete by this validation.
