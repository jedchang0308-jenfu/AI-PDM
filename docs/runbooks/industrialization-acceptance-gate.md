# Industrialization Acceptance Gate

Run this gate before marking an industrialization round complete:

```powershell
npm.cmd run qc:industrialization
```

The gate runs source/data boundary checks, external asset manifest verification, AI/API cost gates, database contract and repository checks, Postgres shadow checks, Dashboard/CSS/document boundary checks, lint, build, API regression, and UI E2E.

UI E2E is executed against a temporary production `next start` server on a free local port. The gate intentionally does not run `qc:file-hashes` because current ignored runtime data has a known missing file/hash blocker tracked under DEV-IND-004.

If a step fails, the JSON summary identifies the failing step and the command output directly above it contains the detailed evidence.
