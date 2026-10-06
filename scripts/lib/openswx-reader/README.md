# AI-PDM OpenSWX compatibility evaluation

Calls unmodified MIT OpenSWX commit 30bd63845d3532cdecfdf2654e9cc0871229c45a.
Only the library/license are vendored. Own CMake excludes upstream apps/tests.

The feasibility schema preserves stored strings and merged effective configuration
scope. Opened files are always partial: raw/evaluated/type, stream integrity and
independent document type validation are unavailable. This does not feed the
production normalizer or acknowledge a Document Manager key.

Build only this directory. Record immutable image ID and actual package versions.
CAD stays outside the image. Parsing binds staged input read-only, with no network,
ports or credentials, non-root execution and finite limits.

Tests: node --test scripts/lib/openswx-reader/reader.test.mjs
Evaluation: node scripts/dev122-openswx-feasibility.mjs --image sha256:IMAGE_ID --input-root STAGED_DIR --manifest MANIFEST_JSON --output-dir EVIDENCE_DIR
Manifest: aipdm.openswx-inputs.v1, files:[{name,bytes,sha256}].
Names must be basenames with SolidWorks extensions; hashes checked before/after.
Only the verified task-owned container is terminated after timeout/output failure.

Local evaluation only. Cloud Run workload capability, trigger, deployment and
human production validation remain separate gates.

Phase 2 finite worker target: build from the AI-PDM repository, select
`--target finite-worker --build-arg READER_SOURCE=scripts/lib/openswx-reader`.
The historical CLI context must select `--target reader-runtime`. Node uses the
existing app's immutable 24.17.0 Bookworm image pin; no npm dependencies are added.
Use a new frozen source/image manifest. The old Phase 1 image is not a full Job.
No build or provider action is implied by these instructions.

The fixed Linux/amd64 child closes inherited non-stdio FDs, clears its environment,
sets no-new-privileges and denies network/process-escape syscalls with seccomp.
Its `--isolation-self-test` must succeed before claim/download. This proves only
`child_network_syscalls_denied.v1`, not a complete filesystem/network sandbox.
Cloud Run syscall support and parent HTTP/child deny behavior require separate
actual artifact gates; unsupported installation is blocked without fallback.
The runner takes one exact cloud-injected execution, at most one job, no DM key,
and a purpose-specific reader token. Dispatch remains disabled unless explicitly
configured by the owner. Unknown provider/completion outcomes are read back,
never blindly retried. SIGTERM/deadline abort HTTP/parser and clean own temp bytes.


Input and output directories must preexist, have no symlink/junction ancestors and
remain disjoint. The input directory must contain exactly the manifest files.
Every invocation binds only its individual file. Engine errors stay unknown;
only an exact HTTP response proves absence. Output configuration cleanup also
runs on failures. Package sources use the fixed Debian 20261004 snapshot.
