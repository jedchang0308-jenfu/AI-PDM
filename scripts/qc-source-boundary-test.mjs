#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredIgnoredPaths = [
  ".next/",
  "node_modules/",
  "cloud-functions/release-handler/node_modules/",
  "sw-addin/bin/",
  "sw-addin/obj/",
  "tsconfig.tsbuildinfo"
];

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

function read(relativePath) {
  const fullPath = path.join(root, ...relativePath.split("/"));
  return fs.readFileSync(fullPath, "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, ...relativePath.split("/")));
}

for (const ignoredPath of requiredIgnoredPaths) {
  const ignored = runGit(["check-ignore", "-v", "--", ignoredPath]);
  record(
    `SOURCE-BOUNDARY ignored: ${ignoredPath}`,
    ignored.status === 0,
    (ignored.stdout || ignored.stderr).trim()
  );

  const tracked = runGit(["ls-files", "--", ignoredPath]);
  record(
    `SOURCE-BOUNDARY not tracked: ${ignoredPath}`,
    tracked.status === 0 && tracked.stdout.trim() === "",
    tracked.stdout.trim()
  );
}

record("SOURCE-BOUNDARY root package-lock exists", exists("package-lock.json"), "package-lock.json");
record(
  "SOURCE-BOUNDARY cloud function package-lock exists",
  exists("cloud-functions/release-handler/package-lock.json"),
  "cloud-functions/release-handler/package-lock.json"
);

const gcloudignore = read("cloud-functions/release-handler/.gcloudignore");
record(
  "SOURCE-BOUNDARY cloud function deployment excludes node_modules",
  /^node_modules\/$/m.test(gcloudignore),
  "cloud-functions/release-handler/.gcloudignore"
);
record(
  "SOURCE-BOUNDARY cloud function deployment excludes local secrets",
  /^\.env$/m.test(gcloudignore) && /^\.env\.\*$/m.test(gcloudignore) && /^secrets\/$/m.test(gcloudignore),
  "cloud-functions/release-handler/.gcloudignore"
);

const addinProject = read("sw-addin/AiPdmAddin.csproj");
record(
  "SOURCE-BOUNDARY add-in outputs are generated under bin folders",
  addinProject.includes("<OutputPath>bin\\Debug\\</OutputPath>") &&
    addinProject.includes("<OutputPath>bin\\Release\\</OutputPath>"),
  "sw-addin/AiPdmAddin.csproj"
);
record(
  "SOURCE-BOUNDARY add-in project has source-level compile items",
  [
    "SwAddin.cs",
    "Services\\PropertyExtractor.cs",
    "Services\\FileCollector.cs",
    "Services\\ApiClient.cs",
    "Views\\SubmissionWindow.xaml"
  ].every((item) => addinProject.includes(item)),
  "sw-addin/AiPdmAddin.csproj"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
