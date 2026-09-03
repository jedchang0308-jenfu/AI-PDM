#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = path.join(root, "output", "qa", "dev-113", "aggregate");
fs.mkdirSync(output, { recursive: true });

const node = (args) => ({ command: process.execPath, args });
const affectedFiles = [
  "src/components/canonical-pdm-workbench.tsx",
  "src/components/part-number-matrix-workspace.tsx",
  "src/components/part-maintenance-workspace-sections.tsx",
  "src/components/canonical-part-preview-section.tsx",
  "src/components/canonical-relation-matrix-section.tsx",
  "src/components/relation-matrix-table.tsx",
  "src/components/canonical-change-workspace.tsx",
  "src/components/canonical-part-attachment-manager.tsx",
  "src/components/part-bom-context.tsx",
  "src/app/parts/[partId]/workspace/page.tsx",
  "src/lib/part-number-matrix-contract.ts",
  "src/lib/repositories/part-number-matrix-async-repository.ts",
  "src/lib/pdm-canonical-workbench-state.ts"
];

const gates = [
  ["G01", "engineering", [
    ["contract", node(["scripts/qc-dev-113-contract.mjs"])],
    ["typecheck", node(["node_modules/typescript/bin/tsc", "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"])],
    ["eslint", node(["node_modules/eslint/bin/eslint.js", ...affectedFiles])]
  ]],
  ["G02", "isolated-build", [
    ["integration", node(["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-113-integration.mjs"])],
    ["build", node(["scripts/qc-next-isolated-build.mjs"])]
  ]],
  ["G03", "parent-regression", [
    ["dev-090", node(["scripts/qc-dev-090-contract.mjs"])],
    ["dev-096", node(["scripts/qc-dev-096-contract.mjs"])],
    ["dev-099", node(["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-099-contract.mjs"])],
    ["dev-108", node(["scripts/qc-dev-108-contract.mjs"])]
  ]],
  ["G04", "browser-real", [
    ["browser", node(["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-113-browser-real.mjs"])]
  ]]
];

const results = [];
for (const [id, label, checks] of gates) {
  const gateChecks = [];
  let gatePass = true;
  for (const [checkLabel, spec] of checks) {
    const result = spawnSync(spec.command, spec.args, {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });
    const check = {
      label: checkLabel,
      status: result.status === 0 ? "PASS" : "FAIL",
      exitCode: result.status,
      error: result.error?.message,
      stdout: result.stdout?.slice(-20000),
      stderr: result.stderr?.slice(-10000)
    };
    if (checkLabel === "browser" && check.status === "PASS") {
      const reportMatch = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.match(/REPORT_PATH=(.+)/u);
      const reportPath = reportMatch?.[1]?.trim();
      const expectedIds = Array.from({ length: 12 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
      const browserReport = reportPath && fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;
      const ids = Array.isArray(browserReport?.cases) ? browserReport.cases.map((item) => item?.id) : [];
      const missingIds = expectedIds.filter((id) => !ids.includes(id));
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const artifactPaths = Array.isArray(browserReport?.cases) ? browserReport.cases.flatMap((item) => Array.isArray(item?.artifacts) ? item.artifacts : []) : [];
      const artifactsExist = artifactPaths.length > 0 && artifactPaths.every((item) => typeof item === "string" && fs.existsSync(item));
      const manifestPass = Boolean(
        browserReport
        && browserReport.status === "PASS"
        && browserReport.denominator === 12
        && ids.length === 12
        && missingIds.length === 0
        && duplicateIds.length === 0
        && browserReport.cases.every((item) => item?.status === "PASS" && Array.isArray(item?.assertions) && item.assertions.length > 0)
        && artifactsExist
        && browserReport.productionWrites === false
        && browserReport.runtimeDeclaration?.PDM_DATA_DIR
        && browserReport.runtimeDeclaration?.PDM_REPOSITORY_DIR
      );
      if (!manifestPass) {
        check.status = "FAIL";
        check.error = !reportPath ? "browser report path missing" : !browserReport ? `browser report unreadable: ${reportPath}` : `browser evidence manifest invalid (missing=${missingIds.join(",")}, duplicates=${duplicateIds.join(",")})`;
      }
      check.browserReportPath = reportPath ?? null;
      check.browserManifest = { denominator: browserReport?.denominator ?? null, caseIds: ids, missingIds, duplicateIds, artifactsExist, productionWrites: browserReport?.productionWrites ?? null };
    }
    gateChecks.push(check);
    gatePass &&= check.status === "PASS";
    console.log(`${check.status} ${id} ${checkLabel}`);
    if (!gatePass) break;
  }
  const report = { id, label, status: gatePass ? "PASS" : "FAIL", checks: gateChecks };
  results.push(report);
  fs.writeFileSync(path.join(output, `${id.toLowerCase()}-${label}.json`), `${JSON.stringify(report, null, 2)}\n`);
  if (!gatePass) break;
}

const status = results.length === gates.length && results.every((item) => item.status === "PASS") ? "PASS" : "FAIL";
const final = {
  runner: "aggregate",
  status,
  denominator: 4,
  gates: results,
  release: "gated",
  evidence: {
    qaCases: 28,
    browserReport: path.join(root, "output", "qa", "dev-113", "browser-real"),
    buildCommand: "npm.cmd run build:isolated"
  }
};
fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(final, null, 2)}\n`);
if (status !== "PASS") process.exitCode = 1;
