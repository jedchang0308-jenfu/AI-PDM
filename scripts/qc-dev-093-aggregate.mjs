import { spawnSync } from "node:child_process";

const commands = [
  { file: "qc-dev-093-contract.mjs", args: ["--experimental-transform-types"] },
  { file: "qc-dev-093-retirement.mjs", args: [] },
  { file: "qc-dev-093-browser.mjs", args: [] },
];
const reports = [];
for (const command of commands) {
  const result = spawnSync(process.execPath, [...command.args, "scripts/" + command.file], { encoding: "utf8" });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  reports.push({ command: command.file, status: result.status ?? 1 });
}
const passed = reports.every((report) => report.status === 0);
console.log(JSON.stringify({ task: "DEV-093", passed, reports }, null, 2));
if (!passed) process.exitCode = 1;
