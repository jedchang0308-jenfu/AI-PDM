#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "docs", "pdm-management-policy-draft.md");
const ragDataPath = path.join(root, "src", "lib", "pdm-policy-rag-data.ts");

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

const policy = readText(policyPath);
const ragData = readText(ragDataPath);

const checks = [
  {
    id: "POL-001",
    name: "drawing revision uniqueness is documented",
    passed: /drawing_number \+ revision/.test(policy) && /唯一|unique/i.test(policy)
  },
  {
    id: "POL-002",
    name: "part number identity rule is documented",
    passed: /part_number/.test(policy) && /item master identity/.test(policy)
  },
  {
    id: "POL-003",
    name: "revision traceability is documented",
    passed: /revision/.test(policy) && /Released/.test(policy) && /可追溯|traceable/i.test(policy)
  },
  {
    id: "POL-004",
    name: "submission file requirements are documented",
    passed: /pdf/.test(policy) && /dwg/.test(policy) && /sldprt/.test(policy) && /sldasm/.test(policy) && /slddrw/.test(policy)
  },
  {
    id: "POL-005",
    name: "two reviewer behavior is documented",
    passed: /approval_required=2/.test(policy) && /兩位不同審核者|two-reviewer/i.test(policy)
  },
  {
    id: "POL-006",
    name: "released duplicate filename policy is documented",
    passed: /Released duplicate filename policy/.test(policy) && /禁止發布|blocked the release/i.test(policy)
  },
  {
    id: "POL-007",
    name: "release failure state is documented",
    passed: /ReleaseFailed/.test(policy)
  },
  {
    id: "POL-008",
    name: "AI assistant read-only constraint is documented",
    passed: /AI assistant is read-only/.test(policy) && /不可 approve/.test(policy)
  },
  {
    id: "POL-009",
    name: "generated RAG data is aligned with policy source",
    passed:
      ragData.includes("圖號規則") &&
      ragData.includes("drawing_number + revision") &&
      ragData.includes("Released duplicate filename policy") &&
      ragData.includes("AI assistant is read-only")
  }
];

const failed = checks.filter((check) => !check.passed);

console.log(JSON.stringify({
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
