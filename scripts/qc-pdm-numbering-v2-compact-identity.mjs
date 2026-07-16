#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  const ok = Boolean(passed);
  results.push({ name, passed: ok, detail });
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function fileIncludes(relativePath, needles) {
  const source = read(relativePath);
  return needles.every((needle) => source.includes(needle));
}

function sourceDoesNotMatch(relativePath, pattern) {
  return !pattern.test(read(relativePath));
}

function runDryRunQc() {
  const child = spawnSync(process.execPath, ["scripts/generate-pdm-numbering-v2-migration-dry-run.mjs", "--qc"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  record("Migration dry-run QC exits successfully", child.status === 0, child.stderr || child.stdout);
  const reportPath = path.join(rootDir, "output", "qc-pdm-numbering-v2-migration-dry-run", "report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  record("Migration dry-run proves no mutation", report.mutation?.unchanged === true, JSON.stringify(report.mutation));
  record("Migration dry-run includes proposed and blocked mappings", report.summary?.proposed > 0 && report.summary?.blocked > 0, JSON.stringify(report.summary));
}

try {
  record(
    "Identity helper defines compact v2 rule and semantic purpose helpers",
    fileIncludes("src/lib/numbering-identity.ts", [
      'NUMBERING_RULE_V2_ID = "numbering-rule-v2"',
      "isManufacturingDrawingPurpose",
      "isReferenceDrawingPurpose",
      "formatPartNumberForRule",
      "formatDrawingNumberForRule"
    ])
  );
  record(
    "Identity helper rejects reserved compact 00 sequences",
    fileIncludes("src/lib/numbering-identity.ts", ['!value.endsWith("P00")', "!/[MR]00$/.test(value)"])
  );
  record(
    "Repositories default normal creation to compact v2",
    fileIncludes("src/lib/repositories/numbering-repository.ts", ["DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V2_ID"]) &&
      fileIncludes("src/lib/repositories/numbering-async-repository.ts", ["DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V2_ID"])
  );
  record(
    "Records API accepts only compact M/R purpose codes for normal creation",
    fileIncludes("src/app/api/numbering/records/route.ts", ['const purposeCodes = new Set(["M", "R"])']) &&
      sourceDoesNotMatch("src/app/api/numbering/records/route.ts", /const purposeCodes = new Set\(\["MA", "OT"\]\)/)
  );
  record(
    "Request UI creates M/R drawings and not normal MA/OT options",
    fileIncludes("src/app/numbering/request/page.tsx", ['value="M"', 'value="R"', "M · 製造圖", "R · 參考圖"]) &&
      sourceDoesNotMatch("src/app/numbering/request/page.tsx", /<option value="MA"|<option value="OT"|OT 其他圖/)
  );
  record(
    "Downstream UI uses semantic manufacturing helper",
    fileIncludes("src/app/numbering/drawings/page.tsx", ["isManufacturingDrawingPurpose(drawing.purposeCode)"]) &&
      fileIncludes("src/app/numbering/search/page.tsx", ["isManufacturingDrawingPurpose(drawingNumber.purposeCode)"]) &&
      fileIncludes("src/app/numbering/dvt/page.tsx", ["isManufacturingDrawingPurpose(drawing.purposeCode)"])
  );
  record(
    "Submission and shared 3D downstream queries include v1/v2 manufacturing purposes",
    fileIncludes("src/lib/drawing-submission-workbench.ts", ["purpose_code IN ('MA', 'M')"]) &&
      fileIncludes("src/lib/repositories/shared-3d-baseline-async-repository.ts", ["purpose_code IN ('MA', 'M')"])
  );
  record(
    "Source no longer hard-codes MA-only purpose comparisons in app/lib",
    sourceDoesNotMatch("src/app/numbering/drawings/page.tsx", /purposeCode === "MA"/) &&
      sourceDoesNotMatch("src/app/numbering/search/page.tsx", /purposeCode === "MA"/) &&
      sourceDoesNotMatch("src/app/numbering/dvt/page.tsx", /purposeCode === "MA"/) &&
      sourceDoesNotMatch("src/lib/shared-3d-baseline.ts", /drawingPurposeCode !== "MA"/)
  );
  record(
    "Database schemas and runtime migration accept M/R while preserving MA/OT",
    fileIncludes("db/schema.sql", ["'numbering-rule-v2'", "CHECK (purpose_code IN ('MA', 'OT', 'M', 'R'))"]) &&
      fileIncludes("db/postgres/004_numbering_v2_compact_identity.sql", ["numbering-rule-v2", "CHECK (purpose_code IN ('MA', 'OT', 'M', 'R'))"]) &&
      fileIncludes("supabase/migrations/20260707000000_numbering_v2_compact_identity.sql", ["numbering-rule-v2", "CHECK (purpose_code IN ('MA', 'OT', 'M', 'R'))"])
  );
  record(
    "Package exposes compact identity and migration dry-run QC scripts",
    fileIncludes("package.json", ["qc:pdm-numbering-v2-compact-identity", "qc:pdm-numbering-v2-migration-dry-run"])
  );
  runDryRunQc();
} finally {
  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) process.exit(1);
}
