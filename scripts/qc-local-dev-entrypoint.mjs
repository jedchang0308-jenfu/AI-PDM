import { spawnSync } from "node:child_process";
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
const localTestAdminLauncher = read("scripts/start-local-test-admin.ps1");
const dailyLauncher = read("scripts/local-sandbox-client.mjs");
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
if (scripts["dev:local"] !== "node scripts/local-sandbox-client.mjs") {
  failures.push("package.json scripts.dev:local must delegate to Platform's shared daily controller");
}
assertIncludes("isolated test-admin maintenance options", localTestAdminLauncher, [
  'if ($CheckOnly) { $launcherParameters.CheckOnly = $true }',
  'if ($RestartProjectProcess) { $launcherParameters.RestartProjectProcess = $true }',
  'if ($CleanNext) { $launcherParameters.CleanNext = $true }',
]);

assertIncludes("standalone PDM source and request forwarding", dailyLauncher, [
  "'--git-common-dir'",
  "'scripts/dev-local-daily.mjs'",
  "runDailyLocal(process.argv.slice(2), platformRoot, { ownerWorktree, app: 'ai-pdm' })"
]);

for (const [mode, port] of [["integrated", 1020], ["standalone", 1021]]) {
  const check = origin => spawnSync(process.execPath, ["scripts/local-sandbox-server.mjs", "--check"], {
    cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { ...process.env, JENFU_LOCAL_SANDBOX_ENABLED: "1", JENFU_LOCAL_SANDBOX_MODE: mode,
      JENFU_LOCAL_SANDBOX_BIND_HOST: "127.0.0.1", JENFU_LOCAL_SANDBOX_ORIGIN: origin }
  });
  const accepted = check("http://localhost:" + port);
  if (accepted.status !== 0) failures.push(mode + " PDM owner preflight failed: " + (accepted.stderr || accepted.error));
  const rejected = check("http://localhost:" + (port === 1020 ? 1021 : 1020));
  if (rejected.status !== 1 || !rejected.stderr?.includes("Expected a bound")) {
    failures.push(mode + " PDM accepted the other mode's endpoint or failed for an unrelated reason");
  }
}

assertIncludes("retained test-admin launcher", localTestAdminLauncher, [
  "$Port = 1020",
  "$DatabasePort = 58421",
  "test-admin-1020-masked-snapshot",
  "sandbox\\control\\ai-pdm-runtime.json",
  '"postgres.exe"',
  "postmaster.pid",
  '$pidLines[3] -ne "$DatabasePort"',
  "Get-NetTCPConnection -LocalPort $DatabasePort -State Listen",
  '$_.LocalAddress -ne "127.0.0.1"',
  '$launcherParameters = @{ TestAdmin = $true; SandboxRoot = $SandboxRoot; Port = $Port }',
  "$RestartProjectProcess",
  "$CheckOnly",
  "start-localhost-3000.ps1"
]);

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
  "rerun this profile's launcher with -RestartProjectProcess",
  "Stop-Process -Id $OwnerProcessId -Force",
  "$RestartProjectProcess",
  "$StopForeignProcess",
  'if ($StopForeignProcess)',
  'The launcher never terminates an unknown port owner.',
  "Stop-VerifiedProjectOwner",
  "node.exe",
  "npm-cli.js",
  '"$quotedNpmCli --prefix $quotedProjectRoot run dev:server"',
  'launcherStartToken',
  'Read-RecordedLauncherProof',
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
const setupIndex = launcher.search(/Ensure-TaskDirectories\r?\n\$(?:owner|owners)\s*=/);
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
