# DEV-074 R35 QC summary

- Status: failed and sealed
- Result: Pass 52 / Fail 1 / Blocked 0 / Not Run 5
- Root: A0051
- Failed path: G01
- Defect: `DEV074-R35-P1-031`
- Reason: root obsolete reviewer snapshot loaded the same preview derivative twice and received two unexpected 404 responses; console errors 2.
- Approval decision itself succeeded with 200 and the A0052 root scope was obsoleted.
- Successor clean run must restart at A01 after RD repair and target retest.
