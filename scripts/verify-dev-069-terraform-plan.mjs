#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));

if (!args.phase || !args.plan) {
  console.error("Usage: node scripts/verify-dev-069-terraform-plan.mjs --phase=<phase> --plan=<terraform-show.json>");
  process.exit(2);
}

const contract = JSON.parse(readFileSync(path.join(root, "config", "platform", "dev-069-gcp-cost-optimization.json"), "utf8"));
const plan = JSON.parse(readFileSync(path.resolve(root, args.plan), "utf8"));
const acceptance = contract.planAcceptance;
const phase = acceptance?.phases?.[args.phase];

if (!phase) {
  console.error(`Unknown DEV-069 phase: ${args.phase}`);
  process.exit(2);
}

const edgeAddresses = acceptance.edgeResourceAddresses;
const required = Object.entries(phase.required).flatMap(([address, action]) =>
  address === "$edge" ? edgeAddresses.map((edgeAddress) => [edgeAddress, action]) : [[address, action]]
);
const requiredMap = new Map(required);
const forbiddenPatterns = acceptance.forbiddenResourceTypePatterns.map((value) => new RegExp(value, "u"));
const relevant = (plan.resource_changes || [])
  .map((change) => ({
    address: change.address,
    type: change.type,
    actions: change.change?.actions || [],
    before: change.change?.before,
    after: change.change?.after
  }))
  .filter((change) => !change.actions.includes("no-op") && change.actions.length > 0);

const failures = [];
const normalizedAction = (actions) => {
  if (actions.length === 1) return actions[0];
  if (actions.includes("delete") && actions.includes("create")) return "replace";
  return actions.join("+");
};

for (const [address, expectedAction] of requiredMap) {
  const actual = relevant.find((change) => change.address === address);
  if (!actual) failures.push(`missing required ${expectedAction}: ${address}`);
  else if (normalizedAction(actual.actions) !== expectedAction) {
    failures.push(`unexpected action for ${address}: ${normalizedAction(actual.actions)} (expected ${expectedAction})`);
  }
}

for (const change of relevant) {
  const action = normalizedAction(change.actions);
  if (action === "replace" && acceptance.replacementAllowed !== true) {
    failures.push(`replacement forbidden: ${change.address}`);
  }
  if (forbiddenPatterns.some((pattern) => pattern.test(change.type))) {
    failures.push(`protected resource changed: ${change.address}`);
  }
  if (!requiredMap.has(change.address) && acceptance.unexpectedChangeAllowed !== true) {
    failures.push(`unexpected change: ${change.address} (${action})`);
  }
}

function nested(value, ...keys) {
  return keys.reduce((current, key) => current?.[key], value);
}

function singleton(value) {
  return Array.isArray(value) ? value[0] : value;
}

for (const change of relevant) {
  if (change.address === "google_sql_database_instance.pdm[0]") {
    const afterSettings = singleton(change.after?.settings);
    const expectedActivation = args.phase === "staging-validation" ? "ALWAYS" : args.phase === "staging-stop" ? "NEVER" : "ALWAYS";
    if (nested(afterSettings, "tier") !== "db-f1-micro") failures.push("Cloud SQL after.tier must be db-f1-micro");
    if (nested(afterSettings, "availability_type") !== "ZONAL") failures.push("Cloud SQL after.availability_type must be ZONAL");
    if (nested(afterSettings, "activation_policy") !== expectedActivation) failures.push(`Cloud SQL after.activation_policy must be ${expectedActivation}`);
    if (change.after?.region !== "asia-east1") failures.push("Cloud SQL region must remain asia-east1");
    if (change.after?.database_version !== "POSTGRES_17") failures.push("Cloud SQL database_version must remain POSTGRES_17");
    if (change.after?.deletion_protection !== true) failures.push("Cloud SQL deletion_protection must remain true");
    const ipConfiguration = singleton(nested(afterSettings, "ip_configuration"));
    if (ipConfiguration?.ipv4_enabled !== false || !ipConfiguration?.private_network) failures.push("Cloud SQL must remain private-IP-only");
    const backupConfiguration = singleton(nested(afterSettings, "backup_configuration"));
    if (backupConfiguration?.enabled !== true || backupConfiguration?.point_in_time_recovery_enabled !== true) failures.push("Cloud SQL backup and PITR must remain enabled");
  }

  if (change.address === "google_cloud_run_v2_service.pdm[0]") {
    const template = singleton(change.after?.template);
    const scaling = singleton(template?.scaling);
    if (scaling?.min_instance_count !== 0 || scaling?.max_instance_count !== 2) failures.push("Cloud Run scaling must be min=0, max=2");
    const containers = template?.containers || [];
    const appContainer = containers.find((container) => (container.name || "") !== "cloud-sql-proxy") || containers[0];
    const pool = (appContainer?.env || []).find((item) => item.name === "PDM_CLOUD_SQL_POOL_MAX");
    if (pool?.value !== "2") failures.push("Cloud Run PDM_CLOUD_SQL_POOL_MAX must be 2");
  }
}

const report = {
  dev: "DEV-069",
  phase: args.phase,
  plan: path.relative(root, path.resolve(root, args.plan)).replaceAll("\\", "/"),
  relevantChanges: relevant.map(({ address, type, actions }) => ({ address, type, actions })),
  passed: failures.length === 0,
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
