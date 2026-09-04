import policy from "../../config/production-smoke-tenant.json" with { type: "json" };
import type { PdmCompanyContext } from "@/lib/company-context";

export const PRODUCTION_SMOKE_SIDE_EFFECT_ENV = {
  gcsWriter: "PDM_SMOKE_GCS_WRITER",
  outboxConsumer: "PDM_SMOKE_OUTBOX_CONSUMER",
  externalNotification: "PDM_SMOKE_EXTERNAL_NOTIFICATION"
} as const;

type SmokeRuntimeEnvironment = Record<string, string | undefined>;

export function readProductionSmokeRuntimeIsolation(env: SmokeRuntimeEnvironment = process.env) {
  const runtime = {
    gcsWriter: env[PRODUCTION_SMOKE_SIDE_EFFECT_ENV.gcsWriter]?.trim().toLowerCase() ?? "",
    outboxConsumer: env[PRODUCTION_SMOKE_SIDE_EFFECT_ENV.outboxConsumer]?.trim().toLowerCase() ?? "",
    externalNotification: env[PRODUCTION_SMOKE_SIDE_EFFECT_ENV.externalNotification]?.trim().toLowerCase() ?? ""
  };
  const configured = {
    gcsWriter: policy.sideEffects.gcsWriter,
    outboxConsumer: policy.sideEffects.outboxConsumer,
    externalNotification: policy.sideEffects.externalNotification
  };
  return {
    company: policy.company,
    configured,
    runtime,
    isolated: Object.values(configured).every((value) => value === "disabled")
      && Object.values(runtime).every((value) => value === "disabled")
  };
}

export function assertProductionSmokeRuntimeIsolation(
  company: Pick<PdmCompanyContext, "companyId" | "companyCode" | "companyKind">,
  env: SmokeRuntimeEnvironment = process.env
) {
  const readback = readProductionSmokeRuntimeIsolation(env);
  const identityMatches = company.companyId === readback.company.id
    && company.companyCode === readback.company.code
    && company.companyKind === readback.company.kind;
  if (!identityMatches || !readback.isolated) {
    throw new Error("PDM_SMOKE_RUNTIME_ISOLATION_REQUIRED");
  }
  return readback;
}
