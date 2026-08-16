# DEV-074 R27 QC summary

Status: failed at D05; RD fixed and target retest passed

- Passed before stop: 24
- Failed: 1 (`D05`)
- Not run: 33
- Defect: `DEV074-R27-P1-023`
- Finding: Reviewer could not see the frozen part scope or Form/Fit/Function states for a suspected-impact drawing revision review.
- RD fix: project legacy drawing-revision evidence with `submission_part_scopes` and the FFF assessment, then render all four FFF facts in the approval drawer.
- Target retest: pass. Reviewer saw `A0039-P06`, `FFF 結論=疑似影響`, `Form=疑似影響`, `Fit=無影響`, and `Function=無影響`.
- Clean-run rule: R27 remains failed; successor R28 starts from A01.
