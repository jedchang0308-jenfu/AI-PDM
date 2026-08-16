# DEV-074 R29 QC summary

Status: failed — superseded by RD repair and a mandatory clean rerun.

- Result: 36 pass, 1 fail, 0 blocked, 21 not run.
- Failed path: `E04`.
- Defect: `DEV074-R29-P1-025` — canonical BOM picker revisions were shown transiently and then disappeared after save/reload.
- All business mutations in this run were performed through rendered UI; direct API/DB mutation count was 0.
