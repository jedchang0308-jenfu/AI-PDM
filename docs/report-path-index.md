# Report Path Index

This project keeps two evidence classes separate:

- Source-controlled planning and summary documents live under `docs/`.
- Generated field evidence and runtime reports live under ignored `data/` paths unless an explicit handoff package copies them elsewhere.

## New Source-Controlled Paths

- RD reports: `docs/reports/rd/`
- QA validation plans: `docs/validation-plans/`
- QA reports and process notes: `docs/reports/qa/`
- QC fact reports: `docs/reports/qc/`
- Runbooks: `docs/runbooks/`
- Industrialization records: `docs/industrialization/`

## Legacy Path Compatibility

Existing root-level documents remain valid and are indexed by prefix:

- `docs/rd-*.md` maps to `docs/reports/rd/`
- `docs/qa-*-validation-plan-*.md` maps to `docs/validation-plans/`
- `docs/qa-*.md` maps to `docs/reports/qa/`
- `docs/qc-*.md` maps to `docs/reports/qc/`

New documents should use the new directories. Existing links do not need to be rewritten during this industrialization pass.
