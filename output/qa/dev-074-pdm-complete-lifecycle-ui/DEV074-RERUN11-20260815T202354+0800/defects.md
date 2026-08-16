# R11 defects

## DEV074-R11-P1-007 — reused 3D omitted from formal drawing UI

- Severity: P1
- Detected path: B05
- Status: RD fixed; targeted UI proof passed; a clean full rerun remains mandatory.
- Preconditions: A0022-M03 reused the byte-identical 3D asset already referenced by the pending A0022-M02 candidate, added a PDF after `needs_info`, then completed resubmission and approval through rendered UI.
- Actual at detection: the formal A0022-M03 detail showed only the 2D file and `附件 2 件`; the reused 3D was absent.
- Expected: the physical 3D asset remains canonical and unique, while every candidate/formal revision owns a visible logical reference; approval and formal readback must not omit or block identical content.
- Read-only diagnosis: `numbering_candidate_revision_files` and `drawing_revision_package_files` both contained the reused 3D reference; the detail projection incorrectly read master attachments by the asset's current owner instead of the current revision package.
- RD correction: formal drawing/root projections now select the current revision package; package/candidate preview links resolve logical file IDs and explicit derivatives correctly.
- Automated repair checks: `npm run typecheck`, `npm run qc:dev-074:same-content-relink` (3/3), and `npm run qc:dev-067:review` passed.
- Targeted rendered-UI proof: `screenshots/B05/B05-rd-fix-clean-session.png` shows A0022-M03 with 3D, 2D, and `附件 3 件`; captured failed network responses: 0.
- Run disposition: R11 remains failed. R12 must start from W0 and rerun all 58 paths.
