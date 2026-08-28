import { spawn } from "node:child_process";

const scripts = ["qc-dev-035-contract.mjs", "qc-dev-035-mapping.mjs", "qc-dev-035-worker.mjs", "qc-dev-035-secure-provider.mjs", "qc-dev-035-worker-hot-apply.mjs", "qc-dev-035-real-ui-activation-browser.mjs", "qc-dev-035-browser.mjs", "qc-dev-035-native-retry-browser.mjs", "qc-dev-035-completion-gate.mjs"];
for (const script of scripts) {
  const result = await run("node", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", `scripts/${script}`]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(JSON.stringify({ script: "qc-dev-035", passed: true, children: scripts }, null, 2));

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
