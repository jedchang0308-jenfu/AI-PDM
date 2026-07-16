import { createGeneratedTypeReferenceGuard } from "./qc-generated-type-reference-guard.mjs";
import { createNpmStepRunner } from "./qc-npm-step-runner.mjs";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";
import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs";

const root = process.cwd();
const steps = [];

function record(name, passed, detail = "") {
  steps.push({ name, passed, detail });
}

const restoreGeneratedTypeReference = createGeneratedTypeReferenceGuard(root, record);
const { runNpmStep } = createNpmStepRunner(root, record, "qc:industrialization");

let app;

try {
  await runNpmStep("source boundary", "qc:source-boundary");
  await runNpmStep("data boundary", "qc:data-boundary");
  await runNpmStep("asset manifest", "assets:verify");
  await runNpmStep("AI/API cost gates", "qc:openai-provider");
  await runNpmStep("DB provider contract", "qc:db-provider-contract");
  await runNpmStep("DB repository split", "qc:db-repository-split");
  await runNpmStep("Postgres shadow", "qc:postgres-shadow");
  await runNpmStep("Production readiness blocker coverage", "qc:production-readiness-industrialization-gate");
  await runNpmStep("Dashboard component split", "qc:dashboard-component-split");
  await runNpmStep("CSS boundary", "qc:css-boundary");
  await runNpmStep("Storage access audit contract", "qc:file-storage-access-audit");
  await runNpmStep("Document paths", "qc:doc-paths");
  await runNpmStep("Dev task completion audit", "qc:dev-task-completion-audit");
  await runNpmStep("Document Manager probe redaction", "qc:document-manager-probe-redaction");
  await runNpmStep("lint", "lint");
  await runNpmStep("build", "build");

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n[qc:industrialization] starting production app at ${baseUrl}`);
  app = startNextApp(root, "start", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  record("start production server", true, baseUrl);
  const env = { PDM_BASE_URL: baseUrl, PDM_QC_EXPECT_STORAGE_AUDIT_SOURCE: "runtime" };
  await runNpmStep("API regression", "qc:api", { env });
  await runNpmStep("UI E2E", "qc:ui", { env });
  await runNpmStep("file hash integrity", "qc:file-hashes");
  assertNoDisallowedProcessWarnings(record, "production server", app.getOutput());
  restoreGeneratedTypeReference();

  console.log(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 0, steps }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 1, steps, error: message }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await stopNextApp(app.child);
  restoreGeneratedTypeReference();
}
