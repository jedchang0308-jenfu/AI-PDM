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
    passed: /同一圖號與版次不得重複送審/.test(policy)
  },
  {
    id: "POL-002",
    name: "part number identity rule is documented",
    passed: /同一料號只能指向同一個實體零件/.test(policy)
  },
  {
    id: "POL-003",
    name: "revision traceability is documented",
    passed: /版次/.test(policy) && /正式發行/.test(policy) && /可追溯|查詢/.test(policy)
  },
  {
    id: "POL-003A",
    name: "revision default and editable numeric policy is documented",
    passed:
      /提出建議版次/.test(policy) &&
      /一般連續進版直接採用系統建議/.test(policy) &&
      /大版次整數/.test(policy) &&
      /小版次/.test(policy)
  },
  {
    id: "POL-003B",
    name: "revision format rejects V prefix and alphabetic versions",
    passed:
      /版次只使用數字/.test(policy) &&
      /不加 V/.test(policy) &&
      /不使用英文字母/.test(policy) &&
      !/root_code|part_number|drawing_number|approval_required|ReleaseFailed|merge|snapshot|repository|SHA256|item master identity/.test(policy)
  },
  {
    id: "POL-004",
    name: "submission file requirements are documented",
    passed: /PDF/.test(policy) && /DWG/.test(policy) && /SolidWorks 零件檔/.test(policy) && /SolidWorks 組合件檔/.test(policy) && /SolidWorks 工程圖檔/.test(policy)
  },
  {
    id: "POL-004A",
    name: "3D and 2D electronic filename rules are documented",
    passed:
      /3D 設計檔以圖料根號作為檔名/.test(policy) &&
      /2D 工程圖與發行用圖檔以完整圖號作為檔名/.test(policy) &&
      /A0001\.SLDPRT/.test(policy) &&
      /A0001-M01\.PDF/.test(policy)
  },
  {
    id: "POL-005",
    name: "two reviewer behavior is documented",
    passed: /雙重審核/.test(policy) && /兩位不同審核者/.test(policy)
  },
  {
    id: "POL-006",
    name: "released duplicate filename policy is documented",
    passed: /不同零件若在正式發行區使用相同檔名，禁止發布/.test(policy)
  },
  {
    id: "POL-007",
    name: "release failure state is documented",
    passed: /發布未完成/.test(policy) && /發行異常/.test(policy)
  },
  {
    id: "POL-008",
    name: "AI assistant read-only constraint is documented",
    passed: /AI 助手只能協助查詢與說明/.test(policy) && /不可代替人員核准、退回、刪除、進版、發布或修改/.test(policy)
  },
  {
    id: "POL-009",
    name: "generated RAG data is aligned with policy source",
    passed:
      ragData.includes("圖號規則") &&
      ragData.includes("同一圖號與版次不得重複送審") &&
      ragData.includes("不同零件若在正式發行區使用相同檔名，禁止發布") &&
      ragData.includes("AI 助手只能協助查詢與說明") &&
      ragData.includes("提出建議版次") &&
      ragData.includes("版次只使用數字") &&
      ragData.includes("3D 設計檔以圖料根號作為檔名") &&
      ragData.includes("2D 工程圖與發行用圖檔以完整圖號作為檔名") &&
      !/root_code|part_number|drawing_number|approval_required|ReleaseFailed|merge|snapshot|repository|SHA256|item master identity/.test(ragData)
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
