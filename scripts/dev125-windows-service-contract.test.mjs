import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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
