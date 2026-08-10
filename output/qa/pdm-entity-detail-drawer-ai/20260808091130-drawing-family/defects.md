# Defects

## P0 / P1 / P2

None observed in the scoped drawing-family verification.

## Non-blocking observation

Candidate copy uses `準備首版圖面` in the header and `完成首版圖面` in the revision/pending area. The header link only jumps to the shared revision section and the section button is the actual task action; there is no conflicting state or data write. Keep as a copy-normalization follow-up, not a QC defect for this round.

## Fixture note

The user-supplied candidate id `draft-workspace-285395c9-3b51-4837-acc1-103d1399712c` was not present in the local read model and produced `drawing_workbench_row_not_found`. A visible candidate row was used instead, yielding `draft-workspace-a26e2620-8448-4b68-8de7-0d013f94f31d`.
