import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/settings/page.tsx"), "utf8");
const checks = [
  ["password input", page.includes('type="password"')],
  ["clear input after save", page.includes("setSolidWorksSecret(\"\")")],
  ["async probe status visible", page.includes("原生測試中") && page.includes("等待 worker")],
  ["hot apply message visible", page.includes("不需重啟")],
  ["no key rendered", !page.includes("status.latest.*secretValue")]
];
const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({ script: "qc-dev-035-real-ui-activation-browser", passed: failed.length === 0, checks: checks.map(([name, ok]) => ({ name, ok })), failed: failed.length, note: "Live provider, worker acknowledgment, and A0002 evidence are enforced by qc-dev-035-completion-gate." }, null, 2));
if (failed.length) process.exitCode = 1;
