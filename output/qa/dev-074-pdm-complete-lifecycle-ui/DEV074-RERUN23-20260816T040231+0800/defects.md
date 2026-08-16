# R23 defects

## DEV074-R23-P1-019 — active unified review hid non-preview attachments

- Path: B04
- Severity: P1
- Primary-run result: failed
- Symptom: after Owner withdrew, uploaded D-0007-MA1.pdf through UI, reloaded it from server truth, and resubmitted, the active Reviewer drawer reported three attachments but displayed only the 2D and 3D preview cards. The PDF name and evidence link were absent.
- Root cause: the unified drawing projection reduced read-only review evidence to a revision/count sentence and two preview slots. Its full attachment projection was loaded but never rendered. The legacy approval drawer already rendered all files.
- RD repair: read-only unified drawing details now list every snapshot attachment with filename, role, and review-scoped evidence link; PDF, DWG/DXF, intermediate, and other controlled files are no longer hidden behind the 2D/3D preview selection.
- QC execution correction: the B04 script now waits for withdrawal server readback before uploading; the earlier immediate upload race is no longer part of the clean-run procedure.
- Targeted rendered-UI retest: passed with a new active A0035-M03 review containing SLDPRT, SLDDRW, and PDF. All three filenames and all three evidence links were visible before approval.
- Evidence: `screenshots/B04/targeted-active-review-all-attachments-visible.png`.
- Clean-run gate: R24 must rerun all 58 paths from zero.
