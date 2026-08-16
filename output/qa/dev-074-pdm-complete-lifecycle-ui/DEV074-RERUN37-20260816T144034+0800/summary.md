# DEV-074 R37 QC summary

Status: failed at the final viewport gate; repair and targeted UI retest passed; R38 full rerun required.

- A01–G06 UI business-flow checks completed, but this run cannot be reported as a passing run.
- Defect `DEV074-R37-P1-033`: the 1024×768 dashboard expanded to 1233 px when controlled-history and submission tables were rendered.
- RD repair: tablet/mobile tables now project only viewport-appropriate columns; desktop keeps intentional table scrolling; page-level overflow is contained.
- Targeted rendered-UI retest: dashboard, numbering history, and approvals at 1440×900, 1024×768, and 390×844 all passed (9/9).
- Per QC policy, R38 restarts from A01.
