import { prepareDisposableSqliteRuntime } from "./qc-disposable-runtime.mjs";
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
const { runNpmStep, runNpmCommandStep } = createNpmStepRunner(root, record, "qc:full");

let app;
let fullQcRuntime;

try {
  await runNpmStep("lint", "lint");
  await runNpmCommandStep("audit", ["audit", "--audit-level=moderate"]);
  await runNpmStep("build", "build");
  await runNpmStep("source boundary", "qc:source-boundary");
  await runNpmStep("policy alignment", "qc:policy-alignment");
  await runNpmStep("P0/P1 defects zero", "qc:defects-zero");
  await runNpmStep("solidworks add-in source", "qc:sw-addin-source");
  await runNpmStep("google-drive integration", "qc:gdrive");
  await runNpmStep("local gdrive compensation", "qc:local-gdrive-compensation");
  await runNpmStep("release failure integration", "qc:release-failure");
  await runNpmStep("release config guard", "qc:release-config");
  await runNpmStep("release folder selection", "qc:release-folders");
  await runNpmStep("managed auth integration", "qc:managed-auth");
  await runNpmStep("LLM config parsing", "qc:llm-config");
  await runNpmStep("openai provider integration", "qc:openai-provider");
  await runNpmStep("document manager probe redaction", "qc:document-manager-probe-redaction");

  fullQcRuntime = await prepareDisposableSqliteRuntime(root, "ai-pdm-full-qc-");
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n[qc:full] starting app at ${baseUrl}`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  record("start dev server", true, baseUrl);

  const env = {
    ...fullQcRuntime.env,
    PDM_BASE_URL: baseUrl
  };
  await runNpmStep("smoke", "smoke", { env });
  await runNpmStep("api regression", "qc:api", { env });
  await runNpmStep("ui e2e", "qc:ui", { env });
  await runNpmStep("file hash verification", "qc:file-hashes");
  assertNoDisallowedProcessWarnings(record, "dev server", app.getOutput());
  restoreGeneratedTypeReference();

  console.log(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 0, steps }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ passed: steps.filter((step) => step.passed).length, failed: 1, steps, error: message }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await stopNextApp(app.child);
  restoreGeneratedTypeReference();
  fullQcRuntime?.cleanup();
}
