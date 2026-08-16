# DEV-074 R31 QC summary

Status: failed; defect repaired and targeted UI retest passed; full R32 rerun required.

- Result before stop: 42 pass, 1 fail, 15 not run.
- Failure: `DEV074-R31-P1-027` — BOM obsolete request reason was stored but absent from approval and decided-history UI.
- Repair: approval summary now renders `申請理由`; typecheck, contract, and targeted rendered-UI retest passed.
- Per QC policy, R31 cannot be promoted to a pass. R32 must restart at A01.
