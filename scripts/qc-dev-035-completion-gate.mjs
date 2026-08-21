import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
const spec = fs.readFileSync(path.join(root, ".ai-doc/specs/SPEC-PDM-SOLIDWORKS-METADATA-READER-001-native-property-extraction.md"), "utf8");
const task = fs.readFileSync(path.join(root, ".ai-doc/dev_task.md"), "utf8");
const fixture = fs.readFileSync(path.join(root, ".ai-doc/qa/fixtures/dev-035-a0002-property-expectations.md"), "utf8");
const expectedA0002 = ["品名", "料號", "3D圖號(主)", "版本", "製圖", "材質", "表面處理", "熱處理"];
const expectedA0002Fields = Object.fromEntries([...fixture.matchAll(/^\| `[^`]+` \| `([^`]+)` \| `([^`]+)` \|/gmu)].map((match) => [match[2], match[1]]));
check("DEV-035 task entry is explicit", /[☐✓] DEV-035/u.test(task));
check("real provider gate is documented", spec.includes("windows_dpapi") && spec.includes("real native probe"));
check("four-way readiness AND gate", spec.includes("active exact version") && spec.includes("worker online") && spec.includes("exact-version ack"));
check("A0002 eight-field gate is documented", expectedA0002.every((field) => spec.includes(field)));
check("A0002 fixture expectation is parseable", Object.keys(expectedA0002Fields).length === 8, JSON.stringify(Object.keys(expectedA0002Fields)));
check("probe completion API exists", fs.existsSync(path.join(root, "src/app/api/settings-secret-probe-jobs/[jobId]/complete/route.ts")));
check("capability heartbeat API exists", fs.existsSync(path.join(root, "src/app/api/recognition-workers/heartbeat/route.ts")));
const databasePath = path.join(root, process.env.PDM_DATA_DIR?.trim() || "data", "ai-pdm.sqlite");
let runtime = { available: false, active: null, probe: null, heartbeat: null, a0002: null };
if (fs.existsSync(databasePath)) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    runtime.active = tables.has("secret_references") ? db.prepare("SELECT version, fingerprint, vault_provider FROM secret_references WHERE kind = 'solidworks_document_manager' AND lifecycle_status = 'active' ORDER BY version DESC LIMIT 1").get() ?? null : null;
    runtime.probe = runtime.active && tables.has("settings_secret_probe_jobs") ? db.prepare("SELECT status, result_code, reader_version FROM settings_secret_probe_jobs WHERE secret_reference_id = (SELECT id FROM secret_references WHERE kind = 'solidworks_document_manager' AND lifecycle_status = 'active' ORDER BY version DESC LIMIT 1) ORDER BY updated_at DESC LIMIT 1").get() ?? null : null;
    runtime.heartbeat = tables.has("worker_capability_heartbeats") ? db.prepare("SELECT status, applied_secret_version, applied_secret_fingerprint, last_seen_at, issue_code FROM worker_capability_heartbeats WHERE capability_code = 'solidworks_document_manager' ORDER BY last_seen_at DESC LIMIT 1").get() ?? null : null;
    if (tables.has("drawing_recognition_sessions") && tables.has("drawing_recognition_sources") && tables.has("drawing_recognition_adapter_results") && tables.has("drawing_recognition_observations")) {
      const resultRows = db.prepare("SELECT session.id AS session_id, session.status AS session_status, session.source_set_fingerprint, result.id AS adapter_result_id, result.status AS adapter_status, result.adapter_version, result.observation_count, result.completed_at, source.id AS source_id, source.file_name, source.content_hash, source.file_size FROM drawing_recognition_sessions session JOIN drawing_recognition_sources source ON source.session_id = session.id JOIN drawing_recognition_adapter_results result ON result.session_id = session.id AND result.source_id = source.id WHERE lower(source.file_name) LIKE '%a0002.sldprt' AND result.adapter_code = 'native-metadata-bridge.v1' ORDER BY result.completed_at DESC").all();
      const observationRows = db.prepare("SELECT observation.adapter_result_id, candidate.field_key, candidate.field_label, candidate.raw_value, candidate.normalized_value, observation.location_kind, observation.configuration_name, candidate.proposed_owner_type, candidate.proposed_owner_id, candidate.applicability_scope FROM drawing_recognition_candidate_observations link JOIN drawing_recognition_candidates candidate ON candidate.id = link.candidate_id JOIN drawing_recognition_observations observation ON observation.id = link.observation_id WHERE observation.adapter_result_id = ? ORDER BY observation.id");
      const evaluated = resultRows.map((row) => {
        const observations = observationRows.all(row.adapter_result_id);
        const byKey = new Map();
        for (const observation of observations) {
          const key = String(observation.field_key ?? "");
          if (key && !byKey.has(key)) byKey.set(key, []);
          if (key) byKey.get(key).push(observation);
        }
        const missingFields = Object.keys(expectedA0002Fields).filter((key) => !byKey.has(key));
        const mismatchedFields = Object.entries(expectedA0002Fields)
          .filter(([key, expected]) => {
            const values = new Set((byKey.get(key) ?? [])
              .map((observation) => String(observation.normalized_value ?? "").trim())
              .filter(Boolean));
            return values.size !== 1 || !values.has(expected);
          })
          .map(([key]) => key);
        const ownerMismatches = Object.keys(expectedA0002Fields).filter((key) => {
          const fieldObservations = byKey.get(key) ?? [];
          if (fieldObservations.length === 0) return true;
          const expectedOwner = ["part_name", "part_number", "material", "surface_finish", "heat_treatment"].includes(key) ? "part_number" : key === "drawn_by_name" ? "drawing_revision" : key === "model_root_number" ? "drawing" : "drawing_revision";
          return fieldObservations.some((observation) => observation.proposed_owner_type !== expectedOwner || !observation.proposed_owner_id);
        });
        const scopeMismatches = Object.keys(expectedA0002Fields).filter((key) => (byKey.get(key) ?? []).some((observation) => observation.location_kind !== "cad_property" || !String(observation.applicability_scope ?? "").trim()));
        const projection = Object.keys(expectedA0002Fields).flatMap((key) => (byKey.get(key) ?? []).map((observation) => [key, observation.raw_value ?? null, observation.normalized_value ?? null, observation.location_kind ?? null, observation.configuration_name ?? null, observation.applicability_scope ?? null, observation.proposed_owner_type ?? null, observation.proposed_owner_id ?? null])).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        return {
          ...row,
          observations,
          missingFields,
          mismatchedFields,
          ownerMismatches,
          scopeMismatches,
          projection,
          exactFields: missingFields.length === 0 && mismatchedFields.length === 0 && ownerMismatches.length === 0 && scopeMismatches.length === 0,
          realReader: row.adapter_status === "succeeded" && String(row.adapter_version ?? "").startsWith("solidworks-document-manager") && Number(row.observation_count) >= Object.keys(expectedA0002Fields).length,
          sourceSnapshot: Boolean(/^\w{64}$/u.test(String(row.content_hash ?? "")) && Number(row.file_size) > 0)
        };
      });
      const successful = evaluated.filter((row) => row.realReader && row.exactFields && row.sourceSnapshot);
      const latestSuccessfulBySession = new Map();
      for (const row of successful) {
        const current = latestSuccessfulBySession.get(row.session_id);
        if (!current || String(row.completed_at ?? "") > String(current.completed_at ?? "")) {
          latestSuccessfulBySession.set(row.session_id, row);
        }
      }
      const distinctSuccessful = [...latestSuccessfulBySession.values()].sort((a, b) => String(a.completed_at ?? "").localeCompare(String(b.completed_at ?? "")));
      const repeatable = distinctSuccessful.length >= 2
        && distinctSuccessful[distinctSuccessful.length - 1].content_hash === distinctSuccessful[distinctSuccessful.length - 2].content_hash
        && JSON.stringify(distinctSuccessful[distinctSuccessful.length - 1].projection) === JSON.stringify(distinctSuccessful[distinctSuccessful.length - 2].projection);
      runtime.a0002 = {
        latest: evaluated[0] ?? null,
        successfulRuns: distinctSuccessful.length,
        repeatable,
        missingFields: evaluated[0]?.missingFields ?? Object.keys(expectedA0002Fields),
        mismatchedFields: evaluated[0]?.mismatchedFields ?? Object.keys(expectedA0002Fields),
        ownerMismatches: evaluated[0]?.ownerMismatches ?? Object.keys(expectedA0002Fields),
        scopeMismatches: evaluated[0]?.scopeMismatches ?? Object.keys(expectedA0002Fields)
      };
    }
    runtime.available = true;
  } finally {
    db.close();
  }
}
const exactAck = Boolean(runtime.active && runtime.heartbeat && runtime.heartbeat.applied_secret_version === runtime.active.version && runtime.heartbeat.applied_secret_fingerprint === runtime.active.fingerprint && runtime.heartbeat.status === "ready" && Date.parse(runtime.heartbeat.last_seen_at) >= Date.now() - 30_000);
const realA0002 = Boolean(runtime.a0002?.successfulRuns >= 2 && runtime.a0002.repeatable);
const realRuntimeReady = Boolean(runtime.active && ["windows_dpapi", "google_secret_manager"].includes(runtime.active.vault_provider) && runtime.probe?.status === "passed" && exactAck && realA0002);
check("DEV-035 task status matches real evidence", realRuntimeReady ? /✓ DEV-035/u.test(task) : /☐ DEV-035/u.test(task));
check("runtime active secure provider", Boolean(runtime.active && ["windows_dpapi", "google_secret_manager"].includes(runtime.active.vault_provider)), JSON.stringify(runtime.active));
check("runtime native probe passed", runtime.probe?.status === "passed", JSON.stringify(runtime.probe));
check("runtime worker exact-version ack", exactAck, JSON.stringify(runtime.heartbeat));
check("runtime A0002 native eight fields and repeatability", realA0002, JSON.stringify(runtime.a0002));
const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({
  script: "qc-dev-035-completion-gate",
  state: realRuntimeReady && failed.length === 0 ? "PASS" : "BLOCKED",
  checks,
  failed: failed.length,
  runtime,
  note: realRuntimeReady
    ? "Real secure provider, native probe, exact worker acknowledgment, and two repeatable A0002 runs satisfy the local DEV-035 completion gate."
    : "Missing real provider/native A0002 evidence keeps DEV-035 open."
}, null, 2));
if (!realRuntimeReady || failed.length) process.exitCode = 1;
