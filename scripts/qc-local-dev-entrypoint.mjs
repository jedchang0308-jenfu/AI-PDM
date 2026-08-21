import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(label, content, needles) {
  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${label} missing ${JSON.stringify(needle)}`);
    }
  }
}

function assertNotIncludes(label, content, needles) {
  for (const needle of needles) {
    if (content.includes(needle)) {
      failures.push(`${label} must not contain ${JSON.stringify(needle)}`);
    }
  }
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
const launcher = read("scripts/start-localhost-3000.ps1");
const cleanNext = read("scripts/clean-next.mjs");
const nextConfig = read("next.config.mjs");
const workspaceTsconfig = JSON.parse(read("tsconfig.json"));
const appTsconfig = JSON.parse(read("tsconfig.app.json"));
const nextTsconfig = JSON.parse(read("tsconfig.next.json"));
const parsedWorkspaceTsconfig = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.json"), {}, ts.sys);

if (scripts["dev:server"] !== "next dev --hostname 127.0.0.1 --port 3000") {
  failures.push("package.json scripts.dev:server must keep the raw Next server command");
}
if (scripts["dev"] !== "npm run dev:local") {
  failures.push("package.json scripts.dev must route daily startup through the managed localhost:3000 entrypoint");
}
if (!String(scripts["dev:local"] ?? "").includes("scripts/start-localhost-3000.ps1")) {
  failures.push("package.json scripts.dev:local must route through scripts/start-localhost-3000.ps1");
}
if (!String(scripts["dev:local:check"] ?? "").includes("-CheckOnly")) {
  failures.push("package.json scripts.dev:local:check must run the managed launcher in CheckOnly mode");
}
if (!String(scripts["dev:local:restart"] ?? "").includes("-RestartProjectProcess")) {
  failures.push("package.json scripts.dev:local:restart must explicitly opt into restarting project processes");
}
if (!String(scripts["dev:local:restart"] ?? "").includes("-CleanNext")) {
  failures.push("package.json scripts.dev:local:restart must clean .next during stale-server recovery");
}

assertIncludes("Next config watch scope", nextConfig, [
  'distDir === ".next" ? "tsconfig.next.json"',
  'path.resolve(projectRoot, ".tmp")',
  'path.join(temporaryRoot, "next-tsconfig")',
  "PDM_NEXT_TSCONFIG_PATH",
  "Custom PDM_NEXT_DIST_DIR must stay under .tmp"
]);

for (const [label, config] of [
  ["workspace tsconfig", workspaceTsconfig],
  ["app tsconfig", appTsconfig],
  ["Next tsconfig", nextTsconfig]
]) {
  const includes = Array.isArray(config.include) ? config.include : [];
  if (includes.some((entry) => String(entry).includes(".tmp/") || String(entry).includes(".tmp\\"))) {
    failures.push(`${label} must not include generated .tmp types`);
  }
}

if ((workspaceTsconfig.include ?? []).some((entry) => String(entry).startsWith("**/"))) {
  failures.push("workspace tsconfig must use a bounded src include instead of a repository-wide wildcard");
}
if (!parsedWorkspaceTsconfig) {
  failures.push("workspace tsconfig must be parseable");
} else if (parsedWorkspaceTsconfig.fileNames.length > 700) {
  failures.push(`workspace tsconfig scope is too broad: ${parsedWorkspaceTsconfig.fileNames.length} files (limit 700)`);
}
assertIncludes("Next tsconfig", JSON.stringify(nextTsconfig), [
  '"extends":"./tsconfig.app.json"',
  '".next/types/**/*.ts"',
  '".next/dev/types/**/*.ts"'
]);

assertIncludes("managed launcher", launcher, [
  "Test-LocalHttpHealth",
  '$BindHost = "127.0.0.1"',
  '$PublicHost = "localhost"',
  '$Url = "http://${PublicHost}:$Port/"',
  'http://${BindHost}:$Port$($check.Path)',
  "$HealthChecks = @(",
  "@{ Path = \"/\"; Expected = @(200, 301, 302, 307, 308) }",
  "@{ Path = \"/login\"; Expected = @(200, 301, 302, 307, 308) }",
  "@{ Path = \"/api/auth/me\"; Expected = @(200, 401) }",
  "Invoke-WebRequest",
  "Write-Host \"Local URL: $Url\"",
  "RedirectStandardOutput",
  "RedirectStandardError",
  "$PidFile",
  "$PortOwnerPidFile",
  "$StatusFile",
  "Write-RuntimeStatus",
  "Get-RecognitionWorkerProcessInfo",
  "Website and 3D worker are healthy, but the recognition worker is not running.",
  "Recognition worker is running.",
  "-RecognitionWorkerProcessId $recognitionWorker.ProcessId",
  "Get-CurrentPortOwner",
  "launcherProcessId",
  "portOwnerProcessId",
  "healthy_existing",
  "unhealthy_existing",
  "healthy_started",
  "blocked_foreign_process",
  "startup_timeout",
  "tmp\\local-dev",
  "Run npm run dev:local:restart",
  "Stop-Process -Id $ownerProcessId -Force",
  "$RestartProjectProcess",
  "$StopForeignProcess",
  "npm.cmd",
  "dev:server"
]);

assertNotIncludes("managed launcher", launcher, [
  "$HealthUrl =",
  "Test-LegacySingleRouteHealth",
  "Test-LocalPortOpen",
  "AI_PDM is already running at $Url",
  "-SkipHttpErrorCheck"
]);

assertIncludes("clean-next guard", cleanNext, [
  "PDM_ALLOW_CLEAN_NEXT_WITH_LOCAL_SERVER",
  "Get-NetTCPConnection -LocalPort",
  "Win32_Process",
  "isProjectOwnedLocalServer",
  "commandLine.includes(rootLower)",
  "commandLine.includes(\"next\") || commandLine.includes(\"npm\")",
  "blocked_clean_next_project_server_running",
  "Refusing to remove",
  "--allow-running-local-server",
  "await rm(nextDir"
]);

const cleanGuardIndex = cleanNext.indexOf("if (isProjectOwnedLocalServer(owner) && !allowRunningLocalServer)");
const cleanRmIndex = cleanNext.indexOf("await rm(nextDir");
if (cleanGuardIndex === -1 || cleanRmIndex === -1 || cleanGuardIndex > cleanRmIndex) {
  failures.push("clean-next guard must run before removing .next");
}

const stopProcessIndex = launcher.indexOf("Stop-Process -Id $ownerProcessId -Force");
const restartGateIndex = launcher.indexOf("if (-not $RestartProjectProcess)");
const foreignGateIndex = launcher.indexOf("if ($StopForeignProcess)");
if (stopProcessIndex === -1 || restartGateIndex === -1 || foreignGateIndex === -1) {
  failures.push("managed launcher must gate Stop-Process behind explicit restart/foreign-process switches");
}

if (failures.length > 0) {
  console.error("Local dev entrypoint QC failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Local dev entrypoint QC passed.");
