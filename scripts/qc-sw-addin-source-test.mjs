#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const addinDir = path.join(root, "sw-addin");

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function record(results, name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function listSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (entry.name.endsWith(".cs") || entry.name.endsWith(".xaml")) {
      files.push(fullPath);
    }
  }
  return files;
}

const results = [];
const requiredFiles = [
  "sw-addin/AiPdmAddin.sln",
  "sw-addin/AiPdmAddin.csproj",
  "sw-addin/SwAddin.cs",
  "sw-addin/Services/PropertyExtractor.cs",
  "sw-addin/Services/FileCollector.cs",
  "sw-addin/Services/AuthService.cs",
  "sw-addin/Services/ApiClient.cs",
  "sw-addin/Services/Logger.cs",
  "sw-addin/Config/AddinSettings.cs",
  "sw-addin/Views/LoginWindow.xaml",
  "sw-addin/Views/LoginWindow.xaml.cs",
  "sw-addin/Views/SubmissionWindow.xaml",
  "sw-addin/Views/SubmissionWindow.xaml.cs",
  "src/app/api/submissions/preflight-lock/route.ts"
];

for (const file of requiredFiles) {
  record(results, `SW-SRC required file exists: ${file}`, exists(file), file);
}

const project = read("sw-addin/AiPdmAddin.csproj");
const swAddin = read("sw-addin/SwAddin.cs");
const propertyExtractor = read("sw-addin/Services/PropertyExtractor.cs");
const fileCollector = read("sw-addin/Services/FileCollector.cs");
const authService = read("sw-addin/Services/AuthService.cs");
const apiClient = read("sw-addin/Services/ApiClient.cs");
const submissionResult = read("sw-addin/Models/SubmissionResult.cs");
const preflightLockRoute = read("src/app/api/submissions/preflight-lock/route.ts");
const submissionWindow = read("sw-addin/Views/SubmissionWindow.xaml.cs");
const settings = read("sw-addin/Config/AddinSettings.cs");
const logger = read("sw-addin/Services/Logger.cs");

record(results, "SW-SRC project targets .NET Framework 4.8", project.includes("<TargetFrameworkVersion>v4.8</TargetFrameworkVersion>"));
record(results, "SW-SRC project builds a class library", project.includes("<OutputType>Library</OutputType>"));
record(results, "SW-SRC project registers COM interop", (project.match(/<RegisterForComInterop>true<\/RegisterForComInterop>/g) ?? []).length >= 2);
record(results, "SW-SRC project includes WPF references", ["PresentationCore", "PresentationFramework", "WindowsBase"].every((item) => project.includes(item)));
record(results, "SW-SRC project references SolidWorks interop DLLs", [
  "SolidWorks.Interop.sldworks",
  "SolidWorks.Interop.swconst",
  "SolidWorks.Interop.swpublished"
].every((item) => project.includes(item)));
record(results, "SW-SRC project compiles core source files", requiredFiles
  .filter((file) => file.endsWith(".cs") && !file.endsWith(".xaml.cs"))
  .every((file) => project.includes(file.replace("sw-addin/", "").replaceAll("/", "\\"))));
record(results, "SW-SRC project compiles WPF pages", ["Views\\LoginWindow.xaml", "Views\\SubmissionWindow.xaml"].every((file) => project.includes(file)));

record(results, "SW-SRC add-in implements ISwAddin", /class\s+SwAddin\s*:\s*ISwAddin/.test(swAddin));
record(results, "SW-SRC add-in has COM identity attributes", /\[ComVisible\(true\)\]/.test(swAddin) && /\[Guid\("/.test(swAddin) && /\[ProgId\("AiPdmAddin\.SwAddin"\)\]/.test(swAddin));
record(results, "SW-SRC add-in has ConnectToSW and DisconnectFromSW", /bool\s+ConnectToSW\(/.test(swAddin) && /bool\s+DisconnectFromSW\(/.test(swAddin));
record(results, "SW-SRC add-in creates SolidWorks CommandManager commands", swAddin.includes("CreateCommandGroup2") && swAddin.includes("AddCommandItem2") && swAddin.includes("SubmitToPdmCommand"));
record(results, "SW-SRC add-in disables submit without active document", swAddin.includes("CanSubmitToPdm") && swAddin.includes("IActiveDoc2 != null"));
record(results, "SW-SRC add-in registers SolidWorks registry keys", swAddin.includes("SOFTWARE\\SolidWorks\\Addins") && swAddin.includes("SOFTWARE\\SolidWorks\\AddInsStartup"));

for (const propertyName of ["drawing_number", "part_number", "part_name", "revision", "material", "surface_finish", "document_type"]) {
  record(results, `SW-SRC required property checked: ${propertyName}`, propertyExtractor.includes(`"${propertyName}"`));
}
record(results, "SW-SRC property extractor uses CustomPropertyManager.Get6", propertyExtractor.includes("CustomPropertyManager") && propertyExtractor.includes(".Get6("));
record(results, "SW-SRC property extractor auto-fills document_type", propertyExtractor.includes("propName == \"document_type\"") && propertyExtractor.includes("swDocDRAWING"));

record(results, "SW-SRC file collector requires saved document path", fileCollector.includes("GetPathName()") && fileCollector.includes("must be saved before submitting"));
record(results, "SW-SRC file collector captures native CAD roles", ["sldprt", "sldasm", "slddrw"].every((role) => fileCollector.includes(`"${role}"`)));
record(results, "SW-SRC file collector exports PDF and DWG with SaveAs3", fileCollector.includes(".pdf") && fileCollector.includes(".dwg") && (fileCollector.match(/SaveAs3\(/g) ?? []).length >= 2);
record(results, "SW-SRC file collector uses silent export", fileCollector.includes("swSaveAsOptions_Silent"));
record(results, "SW-SRC file collector cleans temporary files", fileCollector.includes("CleanUp(") && fileCollector.includes("File.Delete"));

record(results, "SW-SRC auth uses backend token endpoint", authService.includes("/api/auth/token"));
record(results, "SW-SRC auth persists token with DPAPI CurrentUser", authService.includes("ProtectedData.Protect") && authService.includes("ProtectedData.Unprotect") && authService.includes("DataProtectionScope.CurrentUser"));
record(results, "SW-SRC auth stores token under AppData AiPdm", authService.includes("ApplicationData") && authService.includes("\"AiPdm\"") && authService.includes("token.dat"));
record(results, "SW-SRC auth logout deletes local token", authService.includes("Logout()") && authService.includes("File.Delete(TokenFilePath)"));

record(results, "SW-SRC API client uses bearer auth", apiClient.includes("AuthenticationHeaderValue(\"Bearer\", token)"));
record(results, "SW-SRC API client uses multipart upload", apiClient.includes("MultipartFormDataContent") && apiClient.includes("content.Add(fileContent, \"files\""));
record(results, "SW-SRC API client posts to submissions endpoint", apiClient.includes("/api/submissions"));
record(results, "SW-SRC API client handles unauthorized by logout", apiClient.includes("HttpStatusCode.Unauthorized") && apiClient.includes("_authService.Logout()"));
record(results, "SW-SRC API client preflights file size and existence", apiClient.includes("ValidateFilesBeforeUpload") && apiClient.includes("File.Exists") && apiClient.includes("maxUploadFileBytes"));
record(results, "SW-SRC API client checks checkout lock before upload", apiClient.includes("CheckItemLock") && apiClient.includes("/api/submissions/preflight-lock") && apiClient.indexOf("CheckItemLock") < apiClient.indexOf("ValidateFilesBeforeUpload"));
record(results, "SW-SRC API client blocks locks owned by another user", apiClient.includes("result.Locked && !result.LockedByCurrentUser") && apiClient.includes("Ask the owner to release checkout before submitting"));
record(results, "SW-SRC lock preflight response DTO is defined", submissionResult.includes("LockPreflightResponse") && submissionResult.includes("lockedByCurrentUser") && submissionResult.includes("ItemLockDto"));
const preflightRouteHasAuth =
  preflightLockRoute.includes("requireRole(request, [\"Engineer\", \"Admin\"]") ||
  preflightLockRoute.includes("requireRoleAsync(request, [\"Engineer\", \"Admin\"]");
record(
  results,
  "SW-SRC backend exposes authenticated preflight lock route",
  preflightRouteHasAuth &&
    preflightLockRoute.includes("resolvePdmCompanyContextAsync") &&
    preflightLockRoute.includes("findActiveItemLockForSubmissionIdentifiers")
);

record(results, "SW-SRC submission UI validates change description length", submissionWindow.includes("len < 5") && submissionWindow.includes("len > 100"));
record(results, "SW-SRC submission UI blocks generic change words", ["change", "update", "test", "modify", "fix"].every((word) => submissionWindow.includes(word)));
record(results, "SW-SRC submission UI sends approval_required", submissionWindow.includes("approval_required") && submissionWindow.includes("CmbApprovalRequired"));
record(results, "SW-SRC submission UI cleans temp files on success and failure", (submissionWindow.match(/_fileCollector\.CleanUp\(_collectedFiles\)/g) ?? []).length >= 2);

record(results, "SW-SRC settings avoid cloud service account fields", !/service[_\s-]?account|client[_\s-]?secret|private[_\s-]?key/i.test(settings));
record(results, "SW-SRC settings define local server URL and upload limit", settings.includes("ServerUrl") && settings.includes("MaxUploadFileBytes"));
record(results, "SW-SRC logger stores logs under AppData AiPdm logs", logger.includes("ApplicationData") && logger.includes("\"logs\"") && logger.includes("addin-"));
record(results, "SW-SRC logger rotates old logs", logger.includes("AddDays(-30)") && logger.includes("CleanOldLogs"));

const combinedSource = listSourceFiles(addinDir).map((file) => fs.readFileSync(file, "utf8")).join("\n");
record(results, "SW-SRC source does not embed high-privilege cloud credentials", !/GOOGLE_SERVICE_ACCOUNT|SERVICE_ACCOUNT_KEY|private_key|client_secret|gdrive_service_account/i.test(combinedSource));

const failed = results.filter((result) => !result.passed);

console.log(JSON.stringify({
  passed: results.length - failed.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
