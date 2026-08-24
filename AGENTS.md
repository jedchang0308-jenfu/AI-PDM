<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Local runtime and data isolation

- Every build, test, preview, worker, or browser runtime must declare its project, purpose, port, owning process tree, cleanup condition, `PDM_DATA_DIR`, and `PDM_REPOSITORY_DIR` mutation scope before start.
- Any process that can run schema initialization or write data must use a task-owned isolated data/repository directory unless the user explicitly authorizes a fingerprint-gated primary-data repair. Never seed or clean the primary database as test setup.
- An isolated build must prove the primary SQLite schema, canonical root/part/drawing identities, migration-residue inventory, and `PRAGMA foreign_key_check` are unchanged before and after the build.
- A fixture may be seeded only after an unmodified source snapshot passes the master-count, root-reference, migration-residue, and global foreign-key invariants. Retain a fixture mutation ledger in QA evidence.
- Stop and remove only the verified task-owned runtime and temporary paths. Never terminate an unrelated process or clear an unknown port.
