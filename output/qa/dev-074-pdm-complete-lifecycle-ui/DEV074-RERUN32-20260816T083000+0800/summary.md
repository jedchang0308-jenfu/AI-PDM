# DEV-074 R32 QC summary

Status: failed; defect repaired and targeted UI retest passed; full R33 rerun required.

- Result before stop: 56 pass, 1 fail, 1 not run.
- Failure: `DEV074-R32-P1-028` — root-obsolete reviewer UI omitted the stored request reason and ten frozen formal child targets.
- Repair: legacy numbering review detail now projects the stored payload, request reason, and every frozen child target into the unified review drawer.
- Typecheck, review-scope contract, targeted contract, and rendered-UI retest passed.
- Per QC policy, R32 remains failed. R33 must restart at A01.
