#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const defaultEnvFiles = [".env.local", "secrets/pdm-staging.env"];
const secretNamePattern = /(?:URL|PASSWORD|TOKEN|SECRET|KEY|CONNECTION)/iu;
const watchedKeys = [
  "PDM_SUPABASE_TARGET_NAME",
  "PDM_POSTGRES_URL",
  "PDM_POSTGRES_SHADOW_URL",
  "PDM_DB_PROVIDER",
  "PDM_RUNTIME_SMOKE_APPROVED",
  "PDM_POSTGRES_POOLER_MODE"
];

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  const flags = separator >= 0 ? argv.slice(0, separator) : argv;
  const command = separator >= 0 ? argv.slice(separator + 1) : [];
  return {
    approveRuntimeSmoke: flags.includes("--approve-runtime-smoke"),
    showOnly: flags.includes("--show"),
    command
  };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(filePath) {
  const loaded = [];
  if (!existsSync(filePath)) return loaded;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] && process.env[key].trim()) continue;
    const value = unquote(rawValue);
    process.env[key] = value;
    loaded.push(key);
  }

  return loaded;
}

function redactedValue(key) {
  const value = process.env[key];
  if (!value || !value.trim()) return "<missing>";
  if (secretNamePattern.test(key)) return `<configured len=${value.length}>`;
  return value;
}

const args = parseArgs(process.argv.slice(2));
const explicitEnvFile = process.env.PDM_LOCAL_ENV_FILE?.trim();
const envFiles = explicitEnvFile ? [explicitEnvFile] : defaultEnvFiles;
const loadReport = [];

for (const file of envFiles) {
  const absolutePath = resolve(root, file);
  const loadedKeys = parseEnvFile(absolutePath);
  loadReport.push({
    file,
    exists: existsSync(absolutePath),
    loadedKeys: loadedKeys.filter((key) => watchedKeys.includes(key))
  });
}

if (args.approveRuntimeSmoke) {
  process.env.PDM_RUNTIME_SMOKE_APPROVED = "true";
  process.env.PDM_DB_PROVIDER = "postgres";
}

const report = {
  loadedEnvFiles: loadReport,
  runtimeSmokeApprovalInjected: args.approveRuntimeSmoke,
  watchedEnv: Object.fromEntries(watchedKeys.map((key) => [key, redactedValue(key)]))
};

console.log(JSON.stringify(report, null, 2));

if (args.showOnly) {
  process.exit(0);
}

if (args.command.length === 0) {
  console.error("No command provided. Use: node scripts/run-with-local-env.mjs [--approve-runtime-smoke] -- <command>");
  process.exit(2);
}

const [command, ...commandArgs] = args.command;
const result = spawnSync(command, commandArgs, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
