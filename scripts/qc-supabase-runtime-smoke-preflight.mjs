#!/usr/bin/env node

import { evaluateSupabaseTargetIdentity } from "./postgres-shadow-target-guard-utils.mjs";

const requiredApprovalEnv = "PDM_RUNTIME_SMOKE_APPROVED";
const expectedTargetName = "AI_PDM_STAGING";
const allowedProviderValues = new Set(["", "sqlite", "postgres"]);

function truthy(value) {
  return ["1", "true", "yes", "approved"].includes(String(value ?? "").trim().toLowerCase());
}

function configured(name) {
  return Boolean(process.env[name]?.trim());
}

function redactConfigured(name) {
  return configured(name) ? "<configured>" : "<missing>";
}

function collectPublicSecretEnvNames() {
  return Object.keys(process.env).filter((name) => /NEXT_PUBLIC_.*(?:POSTGRES|SERVICE_ROLE|SECRET|PASSWORD|TOKEN)/iu.test(name));
}

const provider = process.env.PDM_DB_PROVIDER?.trim() ?? "";
const approvalGranted = truthy(process.env[requiredApprovalEnv]);
const targetName = process.env.PDM_SUPABASE_TARGET_NAME?.trim() ?? "";
const runtimeUrlConfigured = configured("PDM_POSTGRES_URL");
const shadowUrlConfigured = configured("PDM_POSTGRES_SHADOW_URL");
const publicSecretEnvNames = collectPublicSecretEnvNames();
const runtimeTargetIdentity = evaluateSupabaseTargetIdentity(process.env.PDM_POSTGRES_URL ?? "", process.env);
const shadowTargetIdentity = evaluateSupabaseTargetIdentity(process.env.PDM_POSTGRES_SHADOW_URL ?? "", process.env);

const blockers = [];
const hazards = [];

if (!approvalGranted) blockers.push(`Set ${requiredApprovalEnv}=true only after explicit PM approval.`);
if (targetName !== expectedTargetName) blockers.push(`Set PDM_SUPABASE_TARGET_NAME=${expectedTargetName}.`);
if (!runtimeUrlConfigured) blockers.push("Configure server-side PDM_POSTGRES_URL outside the repository.");
if (!shadowUrlConfigured) blockers.push("Configure server-side PDM_POSTGRES_SHADOW_URL outside the repository.");
if (provider !== "postgres") blockers.push("Set PDM_DB_PROVIDER=postgres only for the approved smoke process.");

if (!allowedProviderValues.has(provider)) {
  hazards.push(`Unsupported PDM_DB_PROVIDER value: ${provider}`);
}
if (provider === "postgres" && !approvalGranted) {
  hazards.push("PDM_DB_PROVIDER=postgres is set without runtime smoke approval.");
}
if ((runtimeUrlConfigured || shadowUrlConfigured || provider === "postgres" || approvalGranted) && targetName !== expectedTargetName) {
  hazards.push(`Runtime smoke target must be ${expectedTargetName}; current PDM_SUPABASE_TARGET_NAME is ${targetName || "<missing>"}.`);
}
if (!runtimeTargetIdentity.safe) {
  hazards.push(...runtimeTargetIdentity.issues.map((issue) => issue.message));
}
if (!shadowTargetIdentity.safe) {
  hazards.push(...shadowTargetIdentity.issues.map((issue) => issue.message));
}
if (publicSecretEnvNames.length > 0) {
  hazards.push(`Public secret-like environment variables are configured: ${publicSecretEnvNames.join(", ")}`);
}

const readyForRuntimeSmoke = hazards.length === 0 && blockers.length === 0;
const status = hazards.length > 0 ? "unsafe" : readyForRuntimeSmoke ? "ready" : "blocked_expected";

const report = {
  checkedAt: new Date().toISOString(),
  status,
  readyForRuntimeSmoke,
  approval: {
    requiredEnv: requiredApprovalEnv,
    granted: approvalGranted
  },
  target: {
    expected: expectedTargetName,
    configured: targetName || "<missing>",
    runtimeIdentitySafe: runtimeTargetIdentity.safe,
    shadowIdentitySafe: shadowTargetIdentity.safe
  },
  runtime: {
    provider: provider || "<unset>",
    PDM_POSTGRES_URL: redactConfigured("PDM_POSTGRES_URL"),
    PDM_POSTGRES_SHADOW_URL: redactConfigured("PDM_POSTGRES_SHADOW_URL"),
    PDM_POSTGRES_POOLER_MODE: process.env.PDM_POSTGRES_POOLER_MODE?.trim() || "<unset>"
  },
  blockers,
  hazards
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = hazards.length === 0 ? 0 : 1;
