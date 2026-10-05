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


Input and output directories must preexist, have no symlink/junction ancestors and
remain disjoint. The input directory must contain exactly the manifest files.
Every invocation binds only its individual file. Engine errors stay unknown;
only an exact HTTP response proves absence. Output configuration cleanup also
runs on failures. Package sources use the fixed Debian 20261004 snapshot.
