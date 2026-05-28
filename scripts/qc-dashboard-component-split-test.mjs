import fs from "node:fs";

const source = fs.readFileSync("src/components/dashboard.tsx", "utf8");
const layoutParts = fs.readFileSync("src/components/dashboard/layout-parts.tsx", "utf8");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

for (const componentName of ["FinderToolbar", "SubmissionTable", "SubmissionDetailPanel", "NotificationDropdown", "AssistantPanel"]) {
  record(`SPLIT-001 ${componentName} is defined`, layoutParts.includes(`function ${componentName}`) || layoutParts.includes(`const ${componentName}`));
  record(`SPLIT-002 ${componentName} is rendered`, source.includes(`<${componentName}`));
}

record("SPLIT-003 SubmissionRow is defined in layout parts", layoutParts.includes("const SubmissionRow"));
record("SPLIT-004 SubmissionRow is rendered by SubmissionTable", layoutParts.includes("<SubmissionRow"));
record("SPLIT-005 SubmissionRow is memoized", /const SubmissionRow = memo\(function SubmissionRow/.test(layoutParts));
record("SPLIT-006 Dashboard no longer owns SubmissionRow", !source.includes("const SubmissionRow"));
record("SPLIT-007 AssistantPanel owns mobile chat markup", layoutParts.includes("mobile-chat-toggle") && !source.includes("mobile-chat-toggle"));
record("SPLIT-008 SubmissionTable owns table markup", layoutParts.includes("virtual-table-wrap") && !source.includes("virtual-table-wrap"));
record("SPLIT-009 component shell moved to layout parts", layoutParts.includes("dashboard-component-boundary"));
record("SPLIT-010 dashboard imports layout parts", source.includes("@/components/dashboard/layout-parts"));

console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
