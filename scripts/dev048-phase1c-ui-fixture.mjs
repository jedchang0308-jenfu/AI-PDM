import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = Number(process.argv[2] ?? 30271);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("VALID_PORT_REQUIRED");

const runId = crypto.randomUUID();
const fixtureRoot = path.join(root, ".tmp", `dev048-phase1c-ui-${runId}`);
const distDirRelative = `.tmp/next-qc-dev048-phase1c-ui-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const stopFile = path.join(root, ".tmp", "dev048-phase1c-ui-fixture.stop");
const snapshots = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const password = "DEV048-Phase1C-UI-QC";
const users = [
  { id: "phase1c-ui-owner", displayName: "Phase1C UI Owner", email: "phase1c.ui.owner@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-reviewer", displayName: "Phase1C UI Reviewer", email: "phase1c.ui.reviewer@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-admin", displayName: "Phase1C UI Admin", email: "phase1c.ui.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-denied", displayName: "Phase1C UI Denied", email: "phase1c.ui.denied@example.invalid", password, role: "Manufacturing", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-company-b", displayName: "Phase1C UI Company B", email: "phase1c.ui.company-b@example.invalid", password, role: "Admin", companyCodes: ["MAXIMA"] }
];

fs.mkdirSync(fixtureRoot, { recursive: true });
fs.rmSync(stopFile, { force: true });

const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    PDM_AUTH_MODE: "managed",
    PDM_BOOTSTRAP_USERS: JSON.stringify(users),
    PDM_DATA_DIR: fixtureRoot,
    PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
    PDM_DB_PROVIDER: "sqlite",
    PDM_RELEASE_MODE: "local_stub",
    PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NEXT_DIST_DIR: distDirRelative
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

async function cleanup() {
  if (child.exitCode === null) {
    child.kill("SIGINT");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(3000).then(() => { if (child.exitCode === null) child.kill("SIGTERM"); })
    ]);
  }
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  for (const target of [distDir, fixtureRoot]) {
    const resolved = path.resolve(target);
    const tmpRoot = path.resolve(root, ".tmp");
    if (resolved.startsWith(`${tmpRoot}${path.sep}`)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  fs.rmSync(stopFile, { force: true });
}

let exitCode = 0;
try {
  while (child.exitCode === null && !fs.existsSync(stopFile)) await delay(250);
  if (child.exitCode !== null && !fs.existsSync(stopFile)) exitCode = child.exitCode ?? 1;
} finally {
  await cleanup();
}

process.exit(exitCode);
