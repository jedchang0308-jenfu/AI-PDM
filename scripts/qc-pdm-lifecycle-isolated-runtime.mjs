import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const managedEnvKeys = [
  "NODE_ENV",
  "PDM_AUTH_MODE",
  "PDM_AUTH_SECRET",
  "PDM_BOOTSTRAP_USERS",
  "PDM_DEMO_USERS",
  "PDM_DATA_DIR",
  "PDM_REPOSITORY_DIR",
  "PDM_DB_PROVIDER",
  "PDM_POSTGRES_URL",
  "DATABASE_URL",
  "PDM_STORAGE_PROVIDER",
  "PDM_SUPABASE_STORAGE_LIVE_ENABLED",
  "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION",
  "PDM_PRODUCTION_SLICE_MODE",
  "PDM_PUBLICATION_EVIDENCE_MODE",
  "PDM_RELEASE_MODE",
  "PDM_NEXT_DIST_DIR",
  "PDM_QC_ISOLATED_TARGET",
  "PDM_PUBLIC_BASE_URL"
];

function fingerprint(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, sha256: null };
  return {
    exists: true,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
  };
}

function restoreEnvironment(snapshot) {
  for (const key of managedEnvKeys) {
    const value = snapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function removeWithRetries(targetPath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return !fs.existsSync(targetPath);
    } catch {
      await delay(250);
    }
  }
  return !fs.existsSync(targetPath);
}

export function createLifecycleQcRuntime({ root, suite, principals }) {
  if (process.env.PDM_BASE_URL?.trim()) {
    throw new Error(
      "LIFECYCLE_QC_EXTERNAL_TARGET_REFUSED: mutating lifecycle QC always creates its own disposable app, database, and repository; unset PDM_BASE_URL"
    );
  }
  if (!Array.isArray(principals) || principals.length === 0) {
    throw new Error("LIFECYCLE_QC_PRINCIPALS_REQUIRED");
  }

  const startedAt = new Date().toISOString();
  const runId = `${suite}-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ai-pdm-${suite}-`));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(dataDir, "repository");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  const distDirRelative = `.tmp/next-qc-${suite}-${crypto.randomUUID()}`;
  const distDir = path.join(root, ...distDirRelative.split("/"));
  const evidenceDir = path.join(root, "output", "qc-runtime", "pdm-lifecycle", runId);
  const canonicalDatabasePath = path.join(root, "data", "ai-pdm.sqlite");
  const canonicalDatabaseBefore = fingerprint(canonicalDatabasePath);
  const environmentSnapshot = new Map(managedEnvKeys.map((key) => [key, process.env[key]]));
  const trackedSnapshots = new Map(
    ["next-env.d.ts", "tsconfig.json"]
      .map((relativePath) => [relativePath, path.join(root, relativePath)])
      .filter(([, filePath]) => fs.existsSync(filePath))
      .map(([relativePath, filePath]) => [relativePath, fs.readFileSync(filePath)])
  );
  let app = null;
  let baseUrl = null;
  let cleanupStatus = "not_started";

  const canonicalDataDir = path.resolve(root, "data");
  const resolvedDataDir = path.resolve(dataDir);
  const resolvedRepositoryDir = path.resolve(repositoryDir);
  if (
    resolvedDataDir === canonicalDataDir ||
    resolvedDataDir.startsWith(`${canonicalDataDir}${path.sep}`) ||
    !resolvedDataDir.startsWith(`${path.resolve(tempRoot)}${path.sep}`) ||
    !resolvedRepositoryDir.startsWith(`${path.resolve(tempRoot)}${path.sep}`)
  ) {
    throw new Error("LIFECYCLE_QC_DATA_BOUNDARY_NOT_ISOLATED");
  }

  return {
    runId,
    evidenceDir,
    dataDir,
    repositoryDir,
    databasePath,

    async start() {
      const port = await getFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      Object.assign(process.env, {
        NODE_ENV: "development",
        PDM_AUTH_MODE: "managed",
        PDM_AUTH_SECRET: `lifecycle-qc-${crypto.randomUUID()}-${crypto.randomUUID()}`,
        PDM_BOOTSTRAP_USERS: JSON.stringify(principals),
        PDM_DEMO_USERS: "0",
        PDM_DATA_DIR: dataDir,
        PDM_REPOSITORY_DIR: repositoryDir,
        PDM_DB_PROVIDER: "sqlite",
        PDM_POSTGRES_URL: "",
        DATABASE_URL: "",
        PDM_STORAGE_PROVIDER: "local_repository",
        PDM_SUPABASE_STORAGE_LIVE_ENABLED: "0",
        PDM_NUMBER_LIFECYCLE_V2: "true",
        PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
        PDM_PRODUCTION_SLICE_MODE: "",
        PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
        PDM_RELEASE_MODE: "local_stub",
        PDM_NEXT_DIST_DIR: distDirRelative,
        PDM_QC_ISOLATED_TARGET: "1",
        PDM_PUBLIC_BASE_URL: baseUrl
      });
      app = startNextApp(root, "dev", port);
      await waitForNextAppReady(baseUrl, app.getOutput);
      return {
        runId,
        baseUrl,
        databasePath,
        dataDir,
        repositoryDir,
        target: "local-isolated",
        productionConnected: false,
        productionWrites: false
      };
    },

    async cleanup(extra = {}) {
      cleanupStatus = "started";
      if (app) await stopNextApp(app.child);
      for (const [relativePath, content] of trackedSnapshots) {
        fs.writeFileSync(path.join(root, relativePath), content);
      }
      restoreEnvironment(environmentSnapshot);

      const safeTemp = path.resolve(tempRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`);
      const safeDist = path.resolve(distDir).startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
      const tempRemoved = safeTemp ? await removeWithRetries(tempRoot) : false;
      const distRemoved = safeDist ? await removeWithRetries(distDir) : false;
      cleanupStatus = tempRemoved && distRemoved ? "removed" : "failed";

      const canonicalDatabaseAfter = fingerprint(canonicalDatabasePath);
      const productionDataUnchanged =
        canonicalDatabaseBefore.exists === canonicalDatabaseAfter.exists &&
        canonicalDatabaseBefore.sha256 === canonicalDatabaseAfter.sha256;
      const receipt = {
        runId,
        suite,
        startedAt,
        finishedAt: new Date().toISOString(),
        target: "local-isolated",
        baseUrl,
        database: { provider: "sqlite", identity: "disposable temp database", productionConnected: false },
        storage: { provider: "local_repository", identity: "disposable temp repository", productionConnected: false },
        principals: principals.map(({ id, email, role, companyCodes }) => ({ id, email, role, companyCodes: companyCodes ?? [] })),
        productionConnected: false,
        productionWrites: false,
        productionDataUnchanged,
        cleanupStatus,
        tempRemoved,
        distRemoved,
        ...extra
      };
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, "isolation-receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
      fs.writeFileSync(
        path.join(evidenceDir, "cleanup.log"),
        `target=temp-only\nstatus=${cleanupStatus}\nproductionConnected=false\nproductionWrites=false\nproductionDataUnchanged=${productionDataUnchanged}\n`,
        "utf8"
      );
      return receipt;
    }
  };
}
