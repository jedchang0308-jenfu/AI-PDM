#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = {
    configuration: "Release",
    platform: "Any CPU",
    msbuild: "",
    registerForComInterop: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--configuration") parsed.configuration = argv[++index] ?? "";
    else if (arg === "--platform") parsed.platform = argv[++index] ?? "";
    else if (arg === "--msbuild") parsed.msbuild = argv[++index] ?? "";
    else if (arg === "--register-for-com-interop") parsed.registerForComInterop = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findMsBuild() {
  if (args.msbuild && fileExists(args.msbuild)) return args.msbuild;

  const candidates = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\MSBuild.exe"
  ];

  return candidates.find(fileExists) ?? "";
}

function findSolidWorksInteropDir() {
  const envDir = process.env.SOLIDWORKS_INTEROP_DIR;
  if (envDir && fileExists(path.join(envDir, "SolidWorks.Interop.sldworks.dll"))) return envDir;

  const candidates = [
    "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS",
    "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist",
    path.join(root, "lib")
  ];

  return candidates.find((dir) => fileExists(path.join(dir, "SolidWorks.Interop.sldworks.dll"))) ?? "";
}

function hasNet48Runtime() {
  const releaseFile = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll";
  return fileExists(releaseFile);
}

function hasNet48ReferenceAssemblies() {
  return fileExists("C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETFramework\\v4.8\\mscorlib.dll");
}

function run(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

const solutionPath = path.join(root, "sw-addin", "AiPdmAddin.sln");
const outputDll = path.join(root, "sw-addin", "bin", args.configuration, "AiPdmAddin.dll");
const msbuild = findMsBuild();
const solidWorksInteropDir = findSolidWorksInteropDir();
const issues = [];

if (process.platform !== "win32") {
  issues.push({ type: "unsupported_platform", expected: "win32", actual: process.platform });
}
if (!fileExists(solutionPath)) {
  issues.push({ type: "missing_solution", path: solutionPath });
}
if (!msbuild) {
  issues.push({ type: "missing_msbuild" });
}
if (!solidWorksInteropDir) {
  issues.push({ type: "missing_solidworks_interop", expected: "SolidWorks.Interop.sldworks.dll" });
}
if (!hasNet48Runtime()) {
  issues.push({ type: "missing_dotnet48_runtime" });
}

if (issues.length > 0) {
  console.log(JSON.stringify({
    ready: false,
    built: false,
    msbuild,
    solidWorksInteropDir,
    outputDll,
    issues
  }, null, 2));
  process.exit(1);
}

if (fs.existsSync(outputDll)) {
  fs.rmSync(outputDll, { force: true });
}

const msbuildArgs = [
  solutionPath,
  `/p:Configuration=${args.configuration}`,
  `/p:Platform=${args.platform}`,
  `/p:RegisterForComInterop=${args.registerForComInterop ? "true" : "false"}`,
  `/p:SolidWorksInteropDir=${solidWorksInteropDir}`,
  "/m"
];

const result = await run(msbuild, msbuildArgs);
const built = result.code === 0 && fileExists(outputDll);
const warnings = [];

if (!hasNet48ReferenceAssemblies()) {
  warnings.push({
    type: "missing_dotnet48_targeting_pack",
    detail: ".NET Framework 4.8 Developer Pack / targeting pack is recommended on CAD build machines."
  });
}

const outputStats = built ? fs.statSync(outputDll) : null;
const summary = {
  ready: built,
  built,
  exitCode: result.code,
  configuration: args.configuration,
  platform: args.platform,
  msbuild,
  solidWorksInteropDir,
  outputDll,
  outputBytes: outputStats?.size ?? 0,
  warnings,
  issues: built ? [] : [{ type: "build_failed", exitCode: result.code }]
};

console.log(JSON.stringify(summary, null, 2));

if (!built) {
  process.exitCode = 1;
}
