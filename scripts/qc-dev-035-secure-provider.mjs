import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const provider = read("src/lib/windows-dpapi-secret-provider.ts");
const lifecycle = read("src/lib/settings-secret-lifecycle.ts");
const route = read("src/app/api/settings/secrets/[kind]/test/route.ts");
const schema = read("db/schema.sql");
const migration = read("db/postgres/049_solidworks_credential_ui_activation.sql");

check("DPAPI provider exists", provider.includes("ProtectedData") && provider.includes("DataProtectionScope]::CurrentUser"));
check("DPAPI blob is atomic", provider.includes("writeFile(tempPath") && provider.includes("rename(tempPath, finalPath)"));
check("DPAPI ACL is applied", provider.includes("icacls.exe") && provider.includes("/inheritance:r"));
check("provider default is Windows DPAPI", lifecycle.includes("isWindowsDpapiAvailable() ? \"windows_dpapi\""));
check("test-double is limited to automated test context", lifecycle.includes("PDM_ALLOW_SETTINGS_SECRET_TEST_DOUBLE") && lifecycle.includes("SETTINGS_SECRET_TEST_DOUBLE_FORBIDDEN"));
check("test-double cannot activate", lifecycle.includes("SECRET_TEST_DOUBLE_NOT_ACTIVATABLE") && lifecycle.includes("reference.vaultProvider === \"local_test_double\""));
check("test route is async 202", route.includes("enqueueSettingsSecretProbe") && route.includes("status: 202"));
check("DB provider check", schema.includes("'windows_dpapi'") && migration.includes("'windows_dpapi'"));
check("probe and heartbeat schema", schema.includes("settings_secret_probe_jobs") && schema.includes("worker_capability_heartbeats"));
check("no plaintext persistence marker", lifecycle.includes("plaintextPersisted: false"));

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ script: "qc-dev-035-secure-provider", passed: failed.length === 0, checks, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
