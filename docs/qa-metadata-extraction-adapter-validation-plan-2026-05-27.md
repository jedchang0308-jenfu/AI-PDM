# QA Validation Plan - Metadata Extraction Adapter

## User-Focused Risks

- Upload still prefers sidecar or filename values even when native CAD metadata is available.
- Native adapter output is not traceable, so users cannot tell where metadata came from.
- Adapter failure blocks normal upload instead of falling back to sidecar or filename inference.
- System falsely claims formal SolidWorks Document Manager is available.
- Existing upload, release, branch/merge, and procurement flows regress.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| META-FMEA-001 | Native metadata is ignored | Wrong CAD properties enter PDM | `META-002` and `META-003` priority checks |
| META-FMEA-002 | Native source is not recorded | No traceability | `META-004` source test |
| META-FMEA-003 | No adapter hook exists for licensed component | Document Manager cannot be integrated later | Code review and env-var adapter path |
| META-FMEA-004 | Adapter changes break upload detection route | Upload UX regression | API QC plus UI smoke |
| META-FMEA-005 | Existing release path regresses | Downstream package failure | Full API QC with release stub |

## QC Cases

- Run TypeScript check.
- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `META-001` native CAD metadata adapter returns 200.
  - `META-002` native CAD metadata has high priority drawing number.
  - `META-003` native CAD metadata has high priority revision.
  - `META-004` native CAD metadata source is recorded.
- Run UI smoke suite.
- Run file hash integrity check.

## Pass Criteria

- All automated checks pass.
- Native adapter metadata wins before sidecar and filename fallback.
- Detection response records native metadata source.
- Remaining SolidWorks Document Manager licensing/deployment tasks stay open until real evidence exists.
