import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Script } from "node:vm";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("DEV-125A schema is additive, app-owned, and device credentials are hash-only", () => {
  const sql = read("db/postgres/089_dev125_windows_service_devices.sql");
  assert.match(sql, /CREATE TABLE ai_pdm_core\.windows_service_devices/u);
  assert.match(sql, /CREATE TABLE ai_pdm_core\.windows_service_enrollments/u);
  assert.match(sql, /credential_hash char\(64\) NOT NULL UNIQUE/u);
  assert.doesNotMatch(sql, /credential_token|plain(?:text)?_?(?:code|token)/iu);
  assert.equal((sql.match(/worker_completion_json jsonb/gu) ?? []).length, 3);
  assert.doesNotMatch(sql, /CREATE TABLE (?!ai_pdm_core\.)/u);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/iu);
});

test("DEV-125A installer is pinned, low-privilege, DPAPI-protected, and does not redistribute Document Manager", () => {
  const build = read("scripts/build-dev125-windows-installer.ps1");
  const xml = read("windows-service/service/AipdmWindowsParsing.xml");
  const installer = read("windows-service/installer/AI-PDM-Windows-Setup.nsi");
  const helper = read("windows-service/tools/AipdmCredentialHelper.cs");
  const probe = read("windows-service/tools/AipdmDocumentManagerProbe.cs");
  const configurator = read("windows-service/configurator/AipdmWindowsConfigurator.cs");
  const notices = read("windows-service/THIRD-PARTY-NOTICES.txt");
  assert.match(build, /WinSW-x64\.exe[\s\S]+05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da/u);
  assert.match(build, /nsis-3\.11\.zip[\s\S]+c7d27f780ddb6cffb4730138cd1591e841f4b7edb155856901cdf5f214394fa1/u);
  assert.match(xml, /<username>NT AUTHORITY\\LocalService<\/username>/u);
  assert.doesNotMatch(xml, /LocalSystem/u);
  assert.match(installer, /SwDocumentMgr\.SwDMClassFactory\\CLSID/u);
  assert.match(installer, /sc\.exe" sidtype AipdmWindowsParsing unrestricted/u);
  assert.match(installer, /NT SERVICE\\AipdmWindowsParsing:\(OI\)\(CI\)\(M\)/u);
  assert.match(helper, /ProtectedData\.Unprotect\([\s\S]+DataProtectionScope\.LocalMachine/u);
  assert.match(configurator, /ProtectedData\.Protect\([\s\S]+DataProtectionScope\.LocalMachine/u);
  assert.match(probe, /SwDocumentMgr\.SwDMClassFactory/u);
  assert.match(probe, /serverVersion[\s\S]+serverSha256[\s\S]+late-bound-com[\s\S]+runtimeMajor/u);
  assert.match(probe, /Activator\.CreateInstance\(factory\)/u);
  assert.match(build, /solidworksDocumentManager[\s\S]+late-bound-com[\s\S]+not-bundled/u);
  assert.doesNotMatch(build, /SolidWorks\.Interop\.sw(?:documentmgr|const)\.dll/u);
  assert.match(notices, /Document Manager is not redistributed/u);
  assert.doesNotMatch(build, /swdocumentmgr\.dll[^\r\n]+(?:https?:\/\/|Invoke-WebRequest)/iu);
});

test("DEV-125A exact-source installer is admitted into the immutable app image", () => {
  const ci = read(".github/workflows/ci.yml");
  const owner = read(".github/workflows/deploy-ai-pdm-independent-production.yml");
  const principalOwner = read(".github/workflows/deploy-ai-pdm-principal-migrations-production.yml");
  const dockerfile = read("Dockerfile");
  const release = read("scripts/dev117-ai-pdm-continuous-release.mjs");
  const executor = read("scripts/lib/dev012-owner-stage-executor.mjs");
  const affected = read("scripts/run-production-slice-tests.mjs");
  for (const workflow of [owner, principalOwner]) {
    assert.match(workflow, /gh run list[^\r\n]+--workflow "AI PDM CI"[^\r\n]+--commit "\$GITHUB_SHA"[^\r\n]+--event push[^\r\n]+--status success/u);
    assert.match(workflow, /gh run download "\$\{run_ids\[0\]\}"[^\r\n]+--name "\$artifact_name"/u);
    assert.match(workflow, /dev125-verify-windows-installer-artifact\.mjs[^\r\n]+--source-revision "\$GITHUB_SHA"[^\r\n]+--require-build-evidence/u);
    assert.match(workflow, /DEV125_INSTALLER_ROOT=\$GITHUB_WORKSPACE/u);
  }
  assert.equal((ci.match(/if: github\.event_name != 'pull_request' \|\| steps\.slice\.outputs\.docs_only != 'true'/gu) ?? []).length, 3);
  assert.match(dockerfile, /COPY --from=builder --chown=65532:65532 \/app\/worker-downloads \.\/worker-downloads/u);
  assert.match(dockerfile, /PDM_WINDOWS_INSTALLER_REQUIRED=\$\{DEV125_INSTALLER_REQUIRED\}/u);
  assert.match(dockerfile, /DEV125_INSTALLER_DIGEST_INVALID/u);
  const imageVerification = dockerfile.split(/\r?\n/u).find(line => line.startsWith('RUN ["/nodejs/bin/node", "-e",'));
  assert.ok(imageVerification);
  const imageVerificationArgs = JSON.parse(imageVerification.slice(4));
  assert.equal(imageVerificationArgs[0], '/nodejs/bin/node');
  assert.doesNotThrow(() => new Script(imageVerificationArgs[2]));
  assert.match(release, /createGitArchiveWithDev125Installer\(root, sourceRevision, process\.env\.DEV125_INSTALLER_ROOT\)/u);
  assert.match(release, /windowsInstallerRequired: true/u);
  assert.match(executor, /windowsInstallerRequired[\s\S]+DEV125_INSTALLER_BUILD_READBACK_MISMATCH/u);
  assert.match(executor, /const installerEvidence = windowsInstaller \? \{ windowsInstaller \} : \{\}/u);
  assert.match(affected, /dev125-windows-installer-artifact\.test\.mjs/u);
  assert.match(affected, /dev125-production-slice-windows-service\.test\.mjs/u);
});

test("DEV-125A service has one fixed device protocol and no legacy worker credential fallback", () => {
  const service = read("windows-service/service/service.mjs");
  const auth = read("src/lib/windows-service-device-auth.ts");
  const installerReader = read("src/lib/windows-service-installer.ts");
  assert.match(service, /const protocolVersion = 1/u);
  assert.match(service, /AipdmCredentialHelper\.exe/u);
  assert.match(service, /\/api\/windows-service\/self/u);
  assert.match(service, /\/api\/windows-service\/start/u);
  assert.match(service, /\/api\/windows-service\/heartbeat/u);
  assert.doesNotMatch(service, /PDM_WORKLOAD_CREDENTIAL|openswx/iu);
  assert.match(auth, /findByCredentialHash/u);
  assert.match(auth, /x-pdm-preview-worker-token/u);
  assert.doesNotMatch(auth, /process\.env\.(?:PDM_WORKLOAD|PDM_PREVIEW)/u);
  assert.match(installerReader, /worker-downloads[\s\S]+windows-service[\s\S]+manifest\.json/u);
  assert.doesNotMatch(installerReader, /https?:\/\//u);
});

test("DEV-125B exposes only the installed Windows service and retires legacy worker entrypoints", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageCommands = Object.values(packageJson.scripts).join("\n");
  const localLauncher = read("scripts/start-localhost-3000.ps1");
  for (const retired of [
    "run-drawing-recognition-worker.mjs",
    "run-solidworks-document-manager-metadata-extractor.mjs",
    "run-solidworks-document-manager-preview-worker.mjs",
    "run-windows-shell-preview-worker.mjs",
    "start-drawing-recognition-worker.ps1",
    "qc-pdm-sw-native-preview-worker.mjs"
  ]) {
    assert.doesNotMatch(packageCommands, new RegExp(retired.replaceAll(".", "\\."), "u"));
    assert.doesNotMatch(localLauncher, new RegExp(retired.replaceAll(".", "\\."), "u"));
  }
  for (const retiredPath of [
    "config/release/dev122-openswx-worker.json",
    "scripts/run-openswx-metadata-job.mjs",
    "scripts/run-drawing-recognition-worker.mjs",
    "scripts/run-solidworks-document-manager-metadata-extractor.mjs",
    "scripts/run-solidworks-document-manager-preview-worker.mjs",
    "scripts/run-windows-shell-preview-worker.mjs",
    "scripts/start-drawing-recognition-worker.ps1",
    "scripts/dev122-preview-openswx-runtime-readback.mjs",
    "scripts/lib/dev122-preview-openswx-runtime-readback.mjs",
    "scripts/dev125-openswx-retirement-cleanup.mjs",
    "scripts/lib/dev125-openswx-retirement-cleanup.mjs",
    "src/lib/openswx-metadata.ts"
  ]) assert.equal(fs.existsSync(path.join(root, retiredPath)), false, retiredPath);
  assert.match(localLauncher, /DEV-125 Windows service is installed and managed separately/u);
});

test("DEV-125B removes OpenSWX provider declarations while retaining shared prebuild readback", () => {
  const sharedPrebuildReadback = read("infra/google-cloud/dev-122-openswx-release-readback/prebuild-list-readback.tf");

  for (const retiredPath of [
    "infra/google-cloud/dev-122-openswx-worker/backend.tf",
    "infra/google-cloud/dev-122-openswx-worker/main.tf",
    "infra/google-cloud/dev-122-openswx-worker/README.md",
    "infra/google-cloud/dev-122-openswx-worker/versions.tf",
    "infra/google-cloud/dev-122-openswx-release-readback/main.tf",
    "infra/google-cloud/dev-122-openswx-release-readback/secret-version-readback.tf"
  ]) assert.equal(fs.existsSync(path.join(root, retiredPath)), false, retiredPath);
  assert.equal((sharedPrebuildReadback.match(/prevent_destroy\s*=\s*true/gu) ?? []).length, 2);
  assert.match(sharedPrebuildReadback, /role_id\s*=\s*"aipdmDev122PrebuildList"/u);
});

test("DEV-125A manager routes stay behind the existing secret-management permission", () => {
  const routeMap = JSON.parse(read("config/access-control/jenfu-route-permission-map.v2.json"));
  const expected = new Set([
    "src/app/api/settings/windows-service/devices/[deviceId]/revoke/route.ts",
    "src/app/api/settings/windows-service/devices/route.ts",
    "src/app/api/settings/windows-service/enrollments/route.ts",
    "src/app/api/settings/windows-service/installer/route.ts"
  ]);
  const entries = routeMap.entries.filter((row) => expected.has(row.path));
  assert.equal(entries.length, 4);
  assert.deepEqual(new Set(entries.map((row) => row.permissionCode)), new Set(["settings.secret.manage"]));
  assert.deepEqual(new Set(entries.map((row) => row.authorizationMode)), new Set(["permission"]));
});

test("DEV-125B runs probe, preview and recognition in one installed scheduler with bounded native execution", () => {
  const service = read("windows-service/service/service.mjs");
  const worker = read("windows-service/service/worker.mjs");
  const build = read("scripts/build-dev125-windows-installer.ps1");
  assert.match(service, /runWindowsWorker/u);
  assert.match(service, /Promise\.all\(\[\s*heartbeatLoop\([\s\S]+runWindowsWorker/u);
  for (const endpoint of ["/api/settings-secret-probe-jobs/claim", "/api/preview-jobs/claim",
    "/api/recognition-jobs/claim", "/api/windows-service/jobs/"]) assert.ok(worker.includes(endpoint), endpoint);
  assert.match(worker, /if \(await processProbe\(credentials, workerId\)\) continue;[\s\S]+documentManagerCredential/u);
  assert.match(worker, /120_000/u);
  assert.match(worker, /taskkill\.exe[\s\S]+\/t[\s\S]+\/f/u);
  assert.match(worker, /maxSourceBytes = 268_435_456/u);
  assert.match(worker, /completeWithReadback[\s\S]+readbackCompletion/u);
  assert.match(worker, /worker_completion|resultDigest|canonicalDigest/u);
  assert.match(build, /windows-service[\\/]service[\\/]\*\.mjs/u);
  assert.match(build, /solidworks-metadata-field-aliases\.json/u);
});

test("DEV-125B authenticates non-OpenSWX worker calls from the current device row and fences tenant generations", () => {
  const auth = read("src/lib/worker-service-auth.ts");
  const deviceAuth = read("src/lib/windows-service-device-auth.ts");
  const preview = read("src/lib/preview-derivatives.ts");
  const recognition = read("src/lib/repositories/drawing-recognition-async-repository.ts");
  const probe = read("src/lib/repositories/settings-secret-async-repository.ts");
  assert.match(auth, /await authenticateWindowsServiceDevice\(request\)/u);
  assert.doesNotMatch(auth.split("authenticateLegacyOpenSwxService")[0], /PDM_WORKLOAD_AUTH_CREDENTIALS/u);
  assert.match(deviceAuth, /findByCredentialHash[\s\S]+status !== "active"[\s\S]+instanceLabel/u);
  for (const source of [preview, recognition, probe]) {
    assert.match(source, /company_id/u);
    assert.match(source, /worker_completion_json/u);
  }
  assert.match(preview, /attemptCount[\s\S]+lockedAt[\s\S]+sourceContentHash/u);
  assert.match(recognition, /sourceSetFingerprint[\s\S]+attemptCount[\s\S]+lockedAt/u);
});

test("DEV-125B native exporters use only registered late-bound official COM", () => {
  for (const file of ["scripts/solidworks-document-manager-metadata-exporter.cs",
    "scripts/solidworks-document-manager-preview-exporter.cs",
    "scripts/solidworks-document-manager-credential-probe.cs"]) {
    const source = read(file);
    assert.match(source, /SwDocumentMgr\.SwDMClassFactory/u);
    assert.match(source, /Activator\.CreateInstance/u);
    assert.doesNotMatch(source, /SolidWorks\.Interop/u);
  }
});
