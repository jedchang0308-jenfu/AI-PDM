# Data Boundary Verification - 2026-05-28

## Scope
Verify path-sensitive scripts resolve runtime, backup, report, evidence, and quality paths through the centralized path module while preserving current `./data` defaults.

## Checks
- `npm.cmd run qc:data-boundary`: PASS.
- `npm.cmd run backup:verify`: PASS against the latest existing backup snapshot.
- `npm.cmd run qc:file-hashes`: FAIL against the current runtime DB/repository because an existing row references missing file `data/repository/IDX-473870.pdf` and stores non-SHA256 value `idx-hash`.
- `npm.cmd run field-test:preflight -- --profile restore`: PASS.
- `npm.cmd run lint`: PASS.

## Result
PARTIAL PASS. Runtime data remains ignored, path-sensitive scripts now have a centralized path boundary, and existing default paths remain compatible. Current runtime file-hash integrity is blocked by pre-existing ignored data and should be repaired as a separate data maintenance task.
