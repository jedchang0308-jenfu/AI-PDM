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
const stateFlowStatusRoute = read("src/app/api/numbering/state-flow/status/route.ts");
const cleanNext = read("scripts/clean-next.mjs");
const nextConfig = read("next.config.mjs");
const appTsconfig = JSON.parse(read("tsconfig.app.json"));
const nextTsconfig = JSON.parse(read("tsconfig.next.json"));
const parsedAppTsconfig = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.app.json"), {}, ts.sys);

if (scripts["dev:server"] !== "next dev --hostname 127.0.0.1 --port 1020") {
  failures.push("package.json scripts.dev:server must default Next to port 1020");
}
if (scripts["dev"] !== "npm run dev:local") {
  failures.push("package.json scripts.dev must route daily startup through the managed launcher");
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
  ["app tsconfig", appTsconfig],
  ["Next tsconfig", nextTsconfig]
]) {
  const includes = Array.isArray(config.include) ? config.include : [];
  if (includes.some((entry) => String(entry).includes(".tmp/") || String(entry).includes(".tmp\\"))) {
    failures.push(`${label} must not include generated .tmp types`);
  }
}

// Daily typecheck uses tsconfig.app.json; Next uses tsconfig.next.json.
// Check those actual boundaries rather than a historical repository-wide config
// or an arbitrary file count that changes whenever legitimate source is added.
if (!parsedAppTsconfig || parsedAppTsconfig.errors.length) {
  failures.push("app typecheck configuration must be parseable");
} else {
  const escaped = parsedAppTsconfig.fileNames.filter(filename => {
    const relative = path.relative(root, filename).replaceAll("\\", "/");
    return relative !== "next-env.d.ts" && !relative.startsWith("src/");
  });
  if (escaped.length) failures.push(`app typecheck includes non-app paths: ${escaped.join(", ")}`);
}
assertIncludes("Next tsconfig", JSON.stringify(nextTsconfig), [
  '"extends":"./tsconfig.app.json"',
  '".next/types/**/*.ts"',
  '".next/dev/types/**/*.ts"'
]);

assertIncludes("managed launcher", launcher, [
  "Test-LocalHttpHealth",
  '$env:PDM_PART_PREVIEW_V1 = "true"',
  "[int]$Port = 1020",
  "Port -notin @(1020, 12020)",
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
  "$StatusFile",
  "Write-RuntimeStatus",
  "Get-CurrentPortOwner",
  "launcherProcessId",
  "portOwnerProcessId",
  "healthy_existing",
  "unhealthy_existing",
  "healthy_started",
  "blocked_foreign_process",
  "startup_timeout",
  "tmp\\local-dev",
  '([string]$Port)',
  '"ai-pdm-$Port.pid"',
  '"ai-pdm-$Port.status.json"',
  '"ai-pdm-$Port.out.log"',
  '"ai-pdm-$Port.err.log"',
  'Join-Path $RuntimeDir "data"',
  'Join-Path $RuntimeDir "repository"',
  "Run npm run dev:local:restart",
  "Stop-Process -Id $OwnerProcessId -Force",
  "$RestartProjectProcess",
  "$StopForeignProcess",
  'if ($StopForeignProcess)',
  'The launcher never terminates an unknown port owner.',
  "Stop-VerifiedProjectOwner",
  "node.exe",
  "npm-cli.js",
  '"$quotedNpmCli run dev:server"',
  '" -- --port $Port"',
  '" --webpack"',
  '.LinkType',
  "Start-Process -FilePath $NodeExe -ArgumentList $npmArguments",
  'not launched or stopped by dev:local',
  "dev:server"
]);

assertIncludes("local feature status route", stateFlowStatusRoute, [
  "partPreviewV1ClientStatus",
  "partPreview: partPreviewV1ClientStatus()"
]);

assertNotIncludes("managed launcher", launcher, [
  "$HealthUrl =",
  "Test-LegacySingleRouteHealth",
  "Test-LocalPortOpen",
  "AI_PDM is already running at $Url",
  "-SkipHttpErrorCheck",
  'Start-Process -FilePath "npm.cmd"',
  'Start-Process -FilePath "cmd.exe"',
  "Start-Service",
  "Stop-Service",
  "Stop-VerifiedOwner",
  'if ($CheckOnly -or -not $StopForeignProcess)'
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

const stopProcessIndex = launcher.indexOf("Stop-Process -Id $OwnerProcessId -Force");
const restartGateIndex = launcher.indexOf("if (-not $RestartProjectProcess)");
const foreignRejectIndex = launcher.indexOf("if ($StopForeignProcess)");
const foreignOwnerBranch = launcher.match(/if \(-not \$isProject\) \{([\s\S]*?)\n  \}\s*else \{/);
const setupIndex = launcher.search(/Ensure-TaskDirectories\r?\n\$owner =/);
if (stopProcessIndex === -1 || restartGateIndex === -1 || foreignRejectIndex === -1 || foreignRejectIndex > setupIndex) {
  failures.push("managed launcher must gate project termination behind restart and reject foreign-stop requests before side effects");
}
if (!foreignOwnerBranch || foreignOwnerBranch[1].includes("Stop-VerifiedProjectOwner")) {
  failures.push("managed launcher must never terminate a foreign port owner");
}

if (failures.length > 0) {
  console.error("Local dev entrypoint QC failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Local dev entrypoint QC passed.");
