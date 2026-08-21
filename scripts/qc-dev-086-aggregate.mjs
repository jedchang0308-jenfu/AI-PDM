import { spawnSync } from "node:child_process";

const scripts = [
  "qc-dev-086-contract.mjs",
  "qc-dev-086-repository.mjs",
  "qc-dev-086-api.mjs",
  "qc-dev-086-query-budget.mjs",
  "qc-dev-086-transition.mjs",
  "qc-dev-086-classifier.mjs",
  "qc-dev-086-browser.mjs"
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ["scripts/" + script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("DEV-086 aggregate: PASS");
