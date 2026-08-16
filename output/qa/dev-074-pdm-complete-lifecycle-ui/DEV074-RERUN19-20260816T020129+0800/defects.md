# R19 defects

## DEV074-R19-P1-015 — controlled first-version SLDASM invisible to BOM creation

- Path: E03
- Severity: P1
- Primary-run result: failed
- Symptom: A0031-M01 Rev 0.1 was visible as R&D-usable with controlled `A0053.SLDASM`, but the rendered “建立 BOM” UI returned no detected assembly and no CAD source for A0031-P01.
- Root cause: BOM discovery only queried legacy `submission_files` / `file_references`; the first-version flow stores the authoritative model in a promoted `drawing_revision_package` with normalized `cad_3d` role and no legacy submission.
- RD repair: added controlled package assembly discovery, a traceable `source_revision_package_id` for BOM drafts/snapshots, API/UI source-kind support, SQLite/Postgres schema support, and a focused model contract.
- Targeted rendered-UI retest: passed. The UI displayed A0031-P01, offered A0031-M01 Rev 0.1, and created BOM Rev 1 draft `231680d7-876d-4512-a616-15fd9299fd89`.
- Evidence: `screenshots/E03/detected-assembly-source-selected.png`, `screenshots/E03/cad-source-draft-created.png`.
- Clean-run gate: R20 must rerun all 58 paths from zero.
