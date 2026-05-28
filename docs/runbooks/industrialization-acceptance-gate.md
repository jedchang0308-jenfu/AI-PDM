# Industrialization Acceptance Gate

Run this gate before marking an industrialization round complete:

```powershell
npm.cmd run qc:industrialization
```

The gate runs source/data boundary checks, external asset manifest verification, AI/API cost gates, database contract and repository checks, Postgres shadow checks, Dashboard/CSS/document boundary checks, Document Manager probe redaction, lint, build, API regression, UI E2E, and final file hash integrity.

UI E2E is executed against a temporary production `next start` server on a free local port. Runtime DB and repository files stay ignored, but `qc:file-hashes` must pass before the local industrialization round can be accepted.

If a step fails, the JSON summary identifies the failing step and the command output directly above it contains the detailed evidence.
