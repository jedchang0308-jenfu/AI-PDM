#!/usr/bin/env node

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

function sourcesDoNotMatch(relativePaths, pattern) {
  return relativePaths.every((relativePath) => sourceDoesNotMatch(relativePath, pattern));
}

try {
  record(
    "Identity helper defines v3 alphanumeric root rule",
    fileIncludes("src/lib/numbering-identity.ts", [
      'NUMBERING_RULE_V3_ID = "numbering-rule-v3-alpha-root"',
      "formatV3RootCode",
      "rootOrdinalToV3",
      "v3RootToOrdinal",
      "rootCodeToV3Ordinal",
      "isV3RootCode",
      "isV3PartNumber",
      "isV3DrawingNumber"
    ])
  );
  record(
    "Identity helper keeps compact v2/v3 semantics and rejects reserved sequences",
    fileIncludes("src/lib/numbering-identity.ts", [
      "isCompactNumberingRule",
      'value.endsWith("0000")',
      '!value.endsWith("P00")',
      "!/[MR]00$/.test(value)"
    ])
  );
  record(
    "Repositories default normal creation to v3",
    fileIncludes("src/lib/repositories/numbering-repository.ts", ["DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V3_ID"]) &&
      fileIncludes("src/lib/repositories/numbering-async-repository.ts", ["DEFAULT_RULE_VERSION_ID = NUMBERING_RULE_V3_ID"])
  );
  record(
    "V3 allocators reserve v2/v3 ordinal roots and use v3 sequence keys",
    fileIncludes("src/lib/repositories/numbering-repository.ts", ["rootCodeToV3Ordinal(rootCode)", 'sequenceKey = ruleVersionId === NUMBERING_RULE_V3_ID ? "part_root:v3" : "part_root:v2"']) &&
      fileIncludes("src/lib/repositories/numbering-async-repository.ts", [
        "SELECT_ASYNC_ROOT_CODES_BY_COMPANY_SQL",
        "rootCodeToV3Ordinal(rootCode)",
        "part_root:v3"
      ])
  );
  record(
    "V3 root letters remain full A-Z until I/O/Q exclusion is explicitly adopted",
    fileIncludes("src/lib/numbering-identity.ts", ['V3_ROOT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"']) &&
      fileIncludes(".ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md", [
        "Allowed letters: A-H, J-N, P, R-Z",
        "remains a separate human decision"
      ])
  );
  record(
    "Runtime and schema seeds make v3 active while preserving v2",
    fileIncludes("src/lib/db.ts", ["numbering-rule-v3-alpha-root", "PDM-NUMBERING-V3", ".run(\"numbering-rule-v3-alpha-root\")"]) &&
      fileIncludes("db/schema.sql", ["'numbering-rule-v3-alpha-root'", "'PDM-NUMBERING-V3'", "DEFAULT 'numbering-rule-v3-alpha-root'"]) &&
      fileIncludes("db/postgres/001_initial_schema.sql", ["'numbering-rule-v3-alpha-root'", "'PDM-NUMBERING-V3'", "DEFAULT 'numbering-rule-v3-alpha-root'"])
  );
  record(
    "V3 allocators reserve formal audit-root evidence before reusing gaps",
    fileIncludes("src/lib/repositories/numbering-repository.ts", [
      "selectV3ReservedRootCodes",
      "extractAuditRootCodesFromJson",
      "detail_json LIKE '%rootCode%'",
      "rootCodeToV3Ordinal(rootCode)"
    ]) &&
      fileIncludes("src/lib/repositories/numbering-async-repository.ts", [
        "SELECT_ASYNC_AUDIT_DETAILS_WITH_ROOT_CODES_SQL",
        "selectV3ReservedRootCodes",
        "extractAuditRootCodesFromJson(row.detail_json, companyId)",
        "rootCodeToV3Ordinal(rootCode)"
      ])
  );
  record(
    "Root letter governance copy stays neutral in v3 UI surfaces",
    sourcesDoNotMatch(
      [
        "src/app/numbering/request/page.tsx",
        "src/app/numbering/imports/page.tsx",
        "src/app/numbering/search/page.tsx",
        "src/app/settings/page.tsx"
      ],
      /A\/B\/C.{0,80}(產品線|產品|客戶|專案|部門|工廠|圖種|生命週期)|(產品線|產品|客戶|專案|部門|工廠|圖種|生命週期).{0,80}A\/B\/C/u
    )
  );
  record(
    "Normal request UI shows v3 examples and keeps M/R choices",
    fileIncludes("src/app/numbering/request/page.tsx", ['value="M"', 'value="R"', 'placeholder="例如：A0001"']) &&
      sourceDoesNotMatch("src/app/numbering/request/page.tsx", /00001-M01 \/ 00001-R01/)
  );
  record(
    "Import, impact and revision UI examples use v3 identities",
    fileIncludes("src/app/numbering/imports/page.tsx", ["A0001,測試支架,A0001-P01,A0001-M01"]) &&
      fileIncludes("src/app/numbering/impact/page.tsx", ['placeholder="A0001-M01"']) &&
      fileIncludes("src/app/numbering/revisions/page.tsx", ["A0001-M01", "A0001-P01"])
  );
  record(
    "Settings page uses v3 as current rule draft",
    fileIncludes("src/app/settings/page.tsx", ['ruleVersionId: "numbering-rule-v3-alpha-root"', "編號規則 v3"])
  );
  record(
    "Change-control replacement release accepts compact v2/v3",
    fileIncludes("src/lib/pdm-change-control-domain.ts", ["NUMBERING_RULE_V3_ID", "parseCompactPartNumber", "identity.ruleVersionId", "./numbering-identity.ts"]) &&
      sourceDoesNotMatch("src/lib/pdm-change-control-domain.ts", /Replacement release requires a compact v2 part number/)
  );
  record(
    "M/R governance keeps manufacturing category separate from manufacturing authorization",
    fileIncludes("src/app/api/numbering/relations/route.ts", [
      "製造基準關聯完整",
      "參考圖不可作為製造基準",
      "這個主根號還沒有製造圖類別，不能建立製造基準關聯。"
    ]) &&
      sourceDoesNotMatch("src/app/api/numbering/relations/route.ts", /可用於製造|可製造圖|nextStep:.*"可製造"/u) &&
      fileIncludes("src/lib/repositories/numbering-async-repository.ts", ["PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING"]) &&
      fileIncludes("src/app/numbering/search/page.tsx", ["製造基準關聯"])
  );
  record(
    "Package exposes v3 focused QC",
    JSON.parse(read("package.json")).scripts?.["qc:pdm-numbering-v3-alpha-root"] === "node scripts/qc-pdm-numbering-v3-alpha-root.mjs",
    "package.json"
  );
} finally {
  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) process.exit(1);
}
