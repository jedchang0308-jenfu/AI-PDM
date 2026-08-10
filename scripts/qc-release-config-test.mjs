import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-release-config-"));
const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
let fetchCalls = 0;

process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_DATA_DIR = testRoot;
process.env.PDM_REPOSITORY_DIR = path.join(testRoot, "repository");
process.env.PDM_STORAGE_PROVIDER = "google_cloud_storage";
process.env.RELEASE_FUNCTION_URL = "";
process.env.RELEASE_FUNCTION_TOKEN = "";
process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = "";
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("release config QC must not call an unconfigured remote target");
};

const results = [];
function expect(name, actual, expected) {
  results.push({ name, passed: actual === expected, actual, expected });
}

async function captureError(run) {
  try {
    await run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const submission = {
  id: "release-config-qc-submission",
  drawing_number: "QC-RELCFG",
  revision: "A",
  files: []
};

try {
  const { releaseSubmissionViaCloudFunctionAsync } = await import("../src/lib/release-async.ts");

  process.env.PDM_RELEASE_MODE = "strict";
  const strictError = await captureError(() =>
    releaseSubmissionViaCloudFunctionAsync(submission, "release-config-qc-actor")
  );
  expect("RELCFG-001 strict release without target fails closed", Boolean(strictError), true);
  expect("RELCFG-002 strict error exposes RELEASE_NOT_CONFIGURED", strictError.startsWith("RELEASE_NOT_CONFIGURED"), true);
  expect("RELCFG-003 unconfigured strict mode never calls a remote target", fetchCalls, 0);

  process.env.PDM_RELEASE_MODE = "local_stub";
  const localStub = await releaseSubmissionViaCloudFunctionAsync(submission, "release-config-qc-actor");
  expect("RELCFG-004 explicit local stub remains available only for isolated QC", localStub.mode, "local-dev-stub");

  process.env.PDM_RELEASE_MODE = "auto";
  process.env.NODE_ENV = "production";
  const productionAutoError = await captureError(() =>
    releaseSubmissionViaCloudFunctionAsync(submission, "release-config-qc-actor")
  );
  expect("RELCFG-005 production auto mode also fails closed without a target", productionAutoError.startsWith("RELEASE_NOT_CONFIGURED"), true);

  process.env.PDM_RELEASE_MODE = "invalid";
  const invalidModeError = await captureError(() =>
    releaseSubmissionViaCloudFunctionAsync(submission, "release-config-qc-actor")
  );
  expect("RELCFG-006 invalid release mode is rejected", invalidModeError.startsWith("INVALID_RELEASE_MODE"), true);

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        passed: 0,
        failed: 1,
        results,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  fs.rmSync(testRoot, { recursive: true, force: true });
}
