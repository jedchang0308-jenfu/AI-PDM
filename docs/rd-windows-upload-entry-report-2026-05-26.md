# RD Report: Windows / Web File Submission Entry

Date: 2026-05-26

## Scope

Added a second submission entry for users who need to upload files from Windows Explorer or a browser without starting from the SolidWorks Add-in.

## Changes

- Added `/upload` Web page for drag-and-drop or file picker uploads.
- Added `POST /api/file-metadata/detect` for pre-submission PDM metadata detection.
- Added `src/lib/pdm-metadata.ts` with metadata extraction from:
  - `.pdm.json`
  - `.properties`
  - `.txt`
  - filename fallback hints
- Reused the existing `POST /api/submissions` flow so uploaded files still enter the normal Pending review workflow.
- Added an Upload link to the main navigation.
- Updated `PDM_dev_task.md` with the new Windows / Web submission task group.

## Current Behavior

The first implementation supports sidecar metadata files such as:

```json
{
  "drawing_number": "A-900",
  "part_number": "PN-900",
  "part_name": "現場測試件",
  "revision": "A",
  "material": "SUS304",
  "surface_finish": "拋光",
  "document_type": "Part"
}
```

The sidecar is used only to fill the form. It is not submitted to the PDM repository. The actual submission files remain limited to `.sldprt`, `.sldasm`, `.slddrw`, `.pdf`, and `.dwg`.

## Remaining P0

Direct native custom-property extraction from `.sldprt`, `.sldasm`, and `.slddrw` remains open. That should be implemented through SolidWorks Document Manager API or an equivalent licensed component before claiming that Web/Windows upload can read native SolidWorks custom properties directly.

## Verification

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- Playwright loaded `http://localhost:3000/upload`, found the page title and dropzone, and reported no console errors.
- `POST /api/file-metadata/detect` returned all seven PDM fields from a `.pdm.json` sidecar.
