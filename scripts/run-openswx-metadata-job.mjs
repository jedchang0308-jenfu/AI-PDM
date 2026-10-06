import { runAuxiliaryJob, isolationSelfTestOnly, executionFromEnvironment } from "./lib/openswx-reader/auxiliary-job.mjs";
const controller = new AbortController();
const terminate = () => controller.abort();
process.once("SIGTERM", terminate); process.once("SIGINT", terminate);
try {
  const args = process.argv.slice(2);
  let result, executionName = null;
  if (args.length === 1 && args[0] === "--isolation-self-test-only") result = await isolationSelfTestOnly({ signal: controller.signal });
  else if (args.length === 0) { executionName = executionFromEnvironment(process.env); result = await runAuxiliaryJob({ signal: controller.signal }); }
  else throw Error("OPENSWX_ENTRY_MODE_INVALID");
  const expectedStates = executionName ? ["empty", "completed"] : ["isolation_verified"];
  if (!expectedStates.includes(result?.state)) throw Error("OPENSWX_ENTRY_RESULT_INVALID");
  process.stdout.write(`${JSON.stringify({ schemaVersion: "aipdm.openswx-finite-terminal.v1", state: result.state, executionName })}\n`);
} catch { process.stderr.write("OPENSWX_FINITE_EXECUTION_FAILED\n"); process.exitCode = 1; }
finally { process.removeListener("SIGTERM", terminate); process.removeListener("SIGINT", terminate); }
