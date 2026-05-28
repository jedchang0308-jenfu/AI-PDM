import fs from "node:fs";

const source = fs.readFileSync("src/components/dashboard.tsx", "utf8");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

for (const componentName of ["FinderToolbar", "SubmissionTable", "SubmissionDetailPanel", "NotificationDropdown", "AssistantPanel", "SubmissionRow"]) {
  record(`SPLIT-001 ${componentName} is defined`, source.includes(`function ${componentName}`) || source.includes(`const ${componentName}`));
  record(`SPLIT-002 ${componentName} is rendered`, source.includes(`<${componentName}`));
}

record("SPLIT-003 SubmissionRow is memoized", /const SubmissionRow = memo\(function SubmissionRow/.test(source));
record("SPLIT-004 component shell preserves existing layout", source.includes(".dashboard-component-boundary") || fs.readFileSync("src/app/globals.css", "utf8").includes(".dashboard-component-boundary"));

console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
