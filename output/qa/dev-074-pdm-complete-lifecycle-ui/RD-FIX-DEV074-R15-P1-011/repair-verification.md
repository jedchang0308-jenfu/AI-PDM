# RD-FIX-DEV074-R15-P1-011 repair verification

- Related failed run: `DEV074-RERUN15-20260815T221049+0800`
- Failed case: `B08`
- Severity: `P1`
- Result: `PASS`
- Verified through rendered UI: `Yes`

## Failure

After `A0026-M05 / A0026-P05` was cancelled in B07, the next append preview incorrectly offered the same candidate codes. The retained cancelled history and the unified drawing identity both require a unique drawing number, so creation failed with a conflict.

## Root cause

Candidate preview and allocator excluded reservations in `recycled` state. The cancellation history remained queryable and the unified drawing row retained `A0026-M05`, so the old reuse policy conflicted with the later DEV-074 single-truth lifecycle model.

## Repair

- Candidate preview and allocator now include `recycled` codes in the retained-code set.
- Cancelling still ends the reservation and keeps it read-only in history, but the displayed code is retired and cannot be reassigned.
- `candidate_collision` and `numbering_conflict` now have human-readable Traditional Chinese UI messages.
- Superseded Phase 1A contract checks and the controlled functional specification were aligned with DEV-074.

## Automated checks

- `typecheck:app`: PASS
- `qc:pdm-number-state-flow-phase1a`: PASS
  - contract: 21/21
  - runtime: 7/7
  - HTTP: 21/21
  - provider outage: 1/1
- `qc:dev-072:contract`: PASS
- `qc:pdm-lifecycle-controlled-history`: 63/63 PASS

## UI repair verification

Using the owner UI on the retained R15 fixture:

1. Opened `建立編號` and selected `既有圖料根號加圖號與料號`.
2. Entered root `A0026`.
3. Preview showed `A0026-P06 / A0026-M06`, skipping cancelled `P05 / M05`.
4. Submitted through the UI successfully.
5. The drawing workbench displayed `A0026-M06` linked to `A0026-P06` in `待你處理` state.
6. Cancelled this targeted repair fixture through the UI after evidence capture.
7. No new browser console error occurred after the repaired create operation; the retained console `409` is the original R15 failure before the repair.

Evidence:

- `screenshots/B08-preview-skips-cancelled-M05-to-M06.png`
- `screenshots/B08-created-A0026-M06-P06.png`

## Gate

The focused repair is verified. R15 remains a failed full run and is not promoted. QC must start a new run from A01 and complete all 58 in-scope cases before a final PASS report can be issued.
