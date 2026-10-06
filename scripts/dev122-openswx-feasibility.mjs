#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { normalize, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from "./lib/openswx-reader/normalize.mjs";
import { boundedProcess } from "./lib/openswx-reader/process.mjs";
import { inspectContainer, verifyInputRoot, checkedOutputRoot, checkedInputRoot, parseFlags } from "./lib/openswx-reader/isolation.mjs";
const flags = parseFlags(process.argv.slice(2));
if (!/^sha256:[a-f0-9]{64}$/.test(flags["--image"])) throw new Error("immutable_image_required");
const inputRoot = await checkedInputRoot(flags["--input-root"]);
const outputRoot = await checkedOutputRoot(flags["--output-dir"], inputRoot);
const manifest = JSON.parse(await fs.readFile(flags["--manifest"], "utf8"));
if (manifest.schemaVersion !== "aipdm.openswx-inputs.v1" || !Array.isArray(manifest.files) ||
    !manifest.files.length || manifest.files.length > 8) throw new Error("input_manifest_invalid");
const names = new Set();
for (const file of manifest.files) {
  if (!file || typeof file.name !== "string" || !/^[A-Za-z0-9_.-]+\.(sldprt|sldasm|slddrw)$/i.test(file.name) ||
      file.name.includes("..") || names.has(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_INPUT_BYTES)
    throw new Error("input_manifest_entry_invalid");
  names.add(file.name);
}
await verifyInputRoot(inputRoot, names);
const dockerConfig = path.join(outputRoot, "docker-cli");
await fs.mkdir(dockerConfig); // Exclusive creation establishes cleanup ownership.
let report;
try {
await fs.writeFile(path.join(dockerConfig, "config.json"), "{}\n", { flag: "wx" });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("DOCKER_") &&
  !/(CREDENTIAL|TOKEN|PASSWORD|SECRET|API_KEY|GOOGLE_APPLICATION)/i.test(key)));
env.DOCKER_CONFIG = dockerConfig;
const docker = "docker";
const prefix = ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine"];
const dockerCall = (args, limits = {}) => boundedProcess(docker, [...prefix, ...args],
  { env, timeoutMs: 30000, maxBytes: MAX_OUTPUT_BYTES, ...limits });
async function checked(args, limits) {
  const result = await dockerCall(args, limits);
  if (result.code !== 0 || result.reason) throw new Error("docker_operation_failed:" + (result.reason || result.code));
  return result.stdout.trim();
}
async function digest(file) {
  const target = path.join(inputRoot, file.name);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes) throw new Error("source_size_drift");
  return crypto.createHash("sha256").update(await fs.readFile(target)).digest("hex");
}
const owner = crypto.randomUUID();
report = { schemaVersion: "aipdm.openswx-evaluation.v1", owner, project: "AI-PDM",
  image: flags["--image"], port: null, limits: { timeoutMs: 30000, memoryMiB: 512, inputBytes: MAX_INPUT_BYTES,
    outputBytes: MAX_OUTPUT_BYTES, network: "none", user: "65532:65532", readOnlyRootfs: true },
  PDM_DATA_DIR: "/tmp/aipdm-data", PDM_REPOSITORY_DIR: "/tmp/aipdm-repository",
  primaryMutationScope: "none_no_database_initialization", productionValidation: "human_owned_not_run", files: [] };
const image = JSON.parse(await checked(["image", "inspect", flags["--image"]]));
if (image.length !== 1 || image[0].Id !== flags["--image"] || image[0].Os !== "linux" ||
    image[0].Architecture !== "amd64" || image[0].Config.User !== "65532:65532")
  throw new Error("image_binding_invalid");
for (const file of manifest.files) {
  if (await digest(file) !== file.sha256) throw new Error("source_hash_drift");
  const name = "aipdm-dev122-" + owner + "-" + report.files.length;
  const started = Date.now();
  let cid, result;
  const row = { name: file.name, sha256: file.sha256, bytes: file.bytes, containerName: name, cleanup: "pending" };
  try {
    // Unknown create outcomes are read back by this exact random name before cleanup.
    const args = ["create", "--name", name, "--label", "aipdm.dev122.owner=" + owner, "--pull", "never",
      "--platform", "linux/amd64", "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--user", "65532:65532", "--memory", "512m", "--memory-swap", "512m",
      "--cpus", "1", "--pids-limit", "32", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16m",
      "--env", "PDM_DATA_DIR=/tmp/aipdm-data", "--env", "PDM_REPOSITORY_DIR=/tmp/aipdm-repository",
      "--mount", "type=bind,source=" + path.join(inputRoot, file.name) + ",target=/input/" + file.name + ",readonly",
      flags["--image"], "/input/" + file.name];
    await fs.writeFile(path.join(outputRoot, name + "-runtime.json"),
      JSON.stringify({ ...report, files: undefined, args, cleanupCondition: "invocation_finished" }, null, 2));
    cid = await checked(args);
    if (!/^[a-f0-9]{64}$/.test(cid)) throw new Error("container_id_invalid");
    row.containerId = cid;
    result = await dockerCall(["start", "--attach", cid]);
    row.exitCode = result.code; row.processReason = result.reason;
    if (result.reason) row.outcome = "failed";
    else {
      const payload = JSON.parse(result.stdout);
      row.result = normalize(payload, { sha256: file.sha256, bytes: file.bytes,
        fileName: file.name, extension: path.extname(file.name) });
      row.outcome = row.result.outcome;
      if ((result.code === 0) !== (payload.status === "opened")) throw new Error("exit_payload_mismatch");
    }
    // Preserve the first failure as well as successful raw library results.
    await fs.writeFile(path.join(outputRoot, name + "-process.json"), JSON.stringify(result, null, 2));
  } catch (error) { row.outcome = "failed"; row.failure = String(error.message); }
  finally {
    let cleanupError;
    try {
      const check = await inspectContainer(name);
      if (check.status === "present") {
        const state = check.container;
        if (state.Config.Labels?.["aipdm.dev122.owner"] !== owner || state.Image !== flags["--image"] ||
            (cid && state.Id !== cid)) throw new Error("cleanup_owner_mismatch");
        row.removal = await dockerCall(["rm", "--force", state.Id]);
        // A CLI write response is not absence evidence; always read exact ID back.
        const absent = await inspectContainer(state.Id);
        if (absent.status !== "absent") throw new Error("container_cleanup_incomplete");
        row.cleanup = "verified_absent";
      } else if (!cid) row.cleanup = "verified_no_container_created";
      else throw new Error("created_container_readback_missing");
    } catch (error) {
      row.cleanup = "unknown_or_incomplete";
      row.cleanupFailure = String(error.message);
      cleanupError = error;
    }
    row.elapsedMs = Date.now() - started;
    row.sourceUnchanged = await digest(file) === file.sha256;
    if (!row.sourceUnchanged) throw new Error("source_hash_drift_after");
    report.files.push(row);
    report.outcome = cleanupError ? "blocked_cleanup_unknown" : "partial_not_production_accepted";
    await fs.writeFile(path.join(outputRoot, "evaluation.json"), JSON.stringify(report, null, 2));
    if (cleanupError) throw cleanupError;
  }
}
process.stdout.write(JSON.stringify({ outcome: report.outcome, files: report.files.map(({name,outcome,cleanup}) =>
  ({name,outcome,cleanup})), evidence: path.join(outputRoot, "evaluation.json") }) + "\n");


} catch (error) {
  if (report) { report.outcome = report.outcome === "blocked_cleanup_unknown" ? report.outcome : "runner_failed";
    report.failure = String(error.message); }
  throw error;
} finally {
  const stat = await fs.lstat(dockerConfig).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (stat?.isSymbolicLink()) throw new Error("docker_config_alias_drift");
  if (stat) await fs.rm(dockerConfig, { recursive: true });
  const exists = await fs.lstat(dockerConfig).then(() => true, error => {
    if (error.code === "ENOENT") return false; throw error;
  });
  if (exists) throw new Error("docker_config_cleanup_unconfirmed");
  if (report) { report.dockerConfigCleanup = "verified_absent";
    await fs.writeFile(path.join(outputRoot, "evaluation.json"), JSON.stringify(report, null, 2)); }
}
