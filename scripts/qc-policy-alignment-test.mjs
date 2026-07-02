#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();

function readRequired(relativePath) {
  if (!projectFileExists(root, relativePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return readProjectFile(root, relativePath);
}

const policy = readRequired(".ai-doc/reference/pdm-management-policy-draft.md");
const ragData = readRequired("src/lib/pdm-policy-rag-data.ts");

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
    id: "POL-003A",
    name: "revision default and editable numeric policy is documented",
    passed:
      /自動帶入預設版次/.test(policy) &&
      /使用者可依圖紙修訂欄編輯/.test(policy) &&
      /大版次整數/.test(policy) &&
      /小版次/.test(policy)
  },
  {
    id: "POL-003B",
    name: "revision format rejects V prefix and alphabetic versions",
    passed:
      /版次格式一律不加 `V`/.test(policy) &&
      /不得接受 `V1`/.test(policy) &&
      /不得接受 .*`A\/B\/C`/.test(policy) &&
      !/接受使用者或 SolidWorks Add-in 提交的 revision 字串，不自動產生版次/.test(policy)
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
      ragData.includes("AI assistant is read-only") &&
      ragData.includes("自動帶入預設版次") &&
      ragData.includes("版次格式一律不加 `V`") &&
      ragData.includes("不得接受 `V1`") &&
      !ragData.includes("不自動產生版次")
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
