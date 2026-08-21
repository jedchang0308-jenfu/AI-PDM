import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(name, condition) { checks.push({ name, ok: Boolean(condition) }); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }

const aliases = JSON.parse(read("config/solidworks-metadata-field-aliases.json"));
check("alias schema", aliases.schemaVersion === "solidworks-property-aliases.v1");
check("alias profile exists", Boolean(aliases.profiles?.[aliases.fallbackProfile]));
const aliasKeys = (aliases.profiles?.[aliases.fallbackProfile]?.aliases ?? []).flatMap((entry) => entry.aliases.map((alias) => alias.trim().normalize("NFKC").toLowerCase()));
check("alias duplicates rejected", new Set(aliasKeys).size === aliasKeys.length);
const route = read("src/app/api/recognition-jobs/[sessionId]/sources/[sourceId]/content/route.ts");
check("source endpoint worker authentication", route.includes("requireRecognitionWorker") && route.includes("x-pdm-recognition-worker-id"));
check("source endpoint no storage pointer leak", !route.includes("storage_key") && !route.includes("original_path"));
check("source endpoint content hash", route.includes("content-hash") && route.includes("content-length"));
const worker = read("scripts/run-drawing-recognition-worker.mjs");
check("worker stages controlled source", worker.includes("ai-pdm-recognition-") && worker.includes("requestSourceContent"));
check("worker sends heartbeat", worker.includes("setInterval") && worker.includes("heartbeat"));
check("worker kills process tree", worker.includes("taskkill") && worker.includes("/t") && worker.includes("/f"));
check("worker cleanup finally", worker.includes("fs.rm(staged.directory") && worker.includes("finally"));
const extractor = read("scripts/run-solidworks-document-manager-metadata-extractor.mjs");
check("extractor uses stdin contract", extractor.includes("readStdinJson") && extractor.includes("sourcePath"));
check("extractor no save mutation", !extractor.includes("SetCustomProperty") && !extractor.includes("Save"));
const cs = read("scripts/solidworks-document-manager-metadata-exporter.cs");
check("native document API", cs.includes("GetAllCustomPropertyNamesAndValues") && cs.includes("ConfigurationManager"));
check("native exporter no write API", !cs.includes("SetCustomProperty") && !cs.includes("Save"));
const repository = read("src/lib/repositories/drawing-recognition-async-repository.ts");
check("projection health", repository.includes("projectNativeMetadataHealth") && repository.includes("adapterHealth"));
check("drawn by allowlist", repository.includes("drawn_by_name"));
const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ script: "qc-dev-035-contract", passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length > 0) process.exitCode = 1;
