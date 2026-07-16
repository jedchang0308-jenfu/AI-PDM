import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1];
}

const terraformExecutable = resolve(readArgument("--terraform"));
const planPath = resolve(readArgument("--plan"));
const outputPath = resolve(readArgument("--output"));
const workingDirectory = resolve(readArgument("--working-directory"));

const rawPlan = execFileSync(terraformExecutable, ["show", "-json", planPath], {
  cwd: workingDirectory,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
  windowsHide: true,
});
const plan = JSON.parse(rawPlan);

const resourceChanges = (plan.resource_changes ?? []).map((resource) => ({
  address: resource.address,
  moduleAddress: resource.module_address ?? null,
  mode: resource.mode,
  type: resource.type,
  name: resource.name,
  providerName: resource.provider_name,
  actions: resource.change?.actions ?? [],
}));

const actionCounts = {
  create: 0,
  update: 0,
  delete: 0,
  replace: 0,
  noOp: 0,
  read: 0,
  other: 0,
};

for (const resource of resourceChanges) {
  const actions = resource.actions;
  if (actions.includes("create") && actions.includes("delete")) {
    actionCounts.replace += 1;
  } else if (actions.length === 1 && actions[0] === "create") {
    actionCounts.create += 1;
  } else if (actions.length === 1 && actions[0] === "update") {
    actionCounts.update += 1;
  } else if (actions.length === 1 && actions[0] === "delete") {
    actionCounts.delete += 1;
  } else if (actions.length === 1 && actions[0] === "no-op") {
    actionCounts.noOp += 1;
  } else if (actions.length === 1 && actions[0] === "read") {
    actionCounts.read += 1;
  } else {
    actionCounts.other += 1;
  }
}

const checks = Object.entries(plan.checks ?? {}).map(([address, check]) => ({
  address,
  status: check.status ?? "unknown",
}));
const failedChecks = checks.filter(
  (check) => !["pass", "unknown"].includes(check.status),
);

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  terraformVersion: plan.terraform_version ?? null,
  formatVersion: plan.format_version ?? null,
  planPath,
  actionCounts,
  resourceChanges,
  checks,
  stopConditions: {
    hasDelete: actionCounts.delete > 0,
    hasReplace: actionCounts.replace > 0,
    hasFailedChecks: failedChecks.length > 0,
  },
  safeToApply:
    actionCounts.delete === 0 &&
    actionCounts.replace === 0 &&
    failedChecks.length === 0,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      actionCounts,
      changedResources: resourceChanges.filter(
        (resource) => resource.actions[0] !== "no-op",
      ),
      failedChecks,
      safeToApply: summary.safeToApply,
    },
    null,
    2,
  ),
);
