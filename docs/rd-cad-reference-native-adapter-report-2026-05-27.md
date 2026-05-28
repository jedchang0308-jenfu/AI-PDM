# RD Report - CAD Reference Native Adapter

## Scope

- Supports remaining dev task: `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。
- Goal: add the missing native CAD reference adapter path behind the existing Web/Windows upload detection route.

## Implemented

- Extended `src/lib/cad-extraction.ts` with a native CAD reference adapter for `.sldprt`, `.sldasm`, and `.slddrw`.
- Added external adapter support:
  - `PDM_CAD_REFERENCE_EXTRACTOR_CMD`
  - `PDM_CAD_REFERENCE_EXTRACTOR_ARGS`
  - `{file}` placeholder is replaced with a temporary CAD file path.
  - adapter reads JSON from stdout.
- Added embedded marker support for deterministic local QC:
  - marker: `AI_PDM_REFERENCES:[...]`
- Adapter output supports:
  - source filename and role
  - referenced filename
  - referenced part number
  - referenced drawing number
  - referenced revision
  - reference type
  - quantity
  - extraction method
  - confidence
- The existing `/api/file-metadata/detect` response now returns native reference candidates when the adapter provides them.
- Added API regression cases `CADREF-001` to `CADREF-004`.

## Completion Boundary

- This completes the local adapter integration path for native CAD references.
- It does not complete the external P0 until a licensed SolidWorks Document Manager API or approved equivalent extractor is deployed and proven through the Document Manager evidence gate.
