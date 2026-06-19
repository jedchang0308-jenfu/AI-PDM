# RD Report - Metadata Extraction Adapter

## Scope

- Dev tasks:
  - `P0` 建立 metadata extraction adapter。
  - `P0` Web/Windows upload 改成優先使用 CAD 內部屬性。

## Implemented

- Added `src/lib/pdm-metadata-adapter.ts`.
- Added native CAD metadata extraction hook for `.sldprt`, `.sldasm`, and `.slddrw`.
- Added external adapter support:
  - `PDM_METADATA_EXTRACTOR_CMD`: executable path for SolidWorks Document Manager or equivalent extractor.
  - `PDM_METADATA_EXTRACTOR_ARGS`: optional JSON string array; `{file}` is replaced with the temporary CAD file path.
  - Adapter reads JSON from stdout.
- Added embedded metadata marker adapter for deterministic local QC:
  - marker: `AI_PDM_METADATA:{...}`
  - used only as an adapter-compatible test fixture path.
- Changed Web/Windows metadata detection priority:
  1. native CAD metadata adapter
  2. sidecar `.pdm.json` / `.properties` / `.txt`
  3. filename inference
- Added `nativeMetadataFiles` to detection response for traceability.
- Added API regression cases `META-001` to `META-004`.

## Remaining External Dependency

- Formal SolidWorks Document Manager API licensing and deployment are still open.
- This adapter makes the integration point real and testable, but it does not include Dassault's licensed Document Manager component.
