import "server-only";

import crypto from "node:crypto";
import {
  CanonicalWorkbenchError,
  DEV087_CONTRACT_VERSION
} from "@/lib/pdm-canonical-workbench-contract";

function secret() {
  const configured = process.env.PDM_WORKBENCH_CONTRACT_SECRET?.trim()
    || process.env.PDM_AUTH_SECRET?.trim()
    || process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED");
  return "local-only-dev087-contract-secret";
}

export type CanonicalContractTokenPayload = {
  version: typeof DEV087_CONTRACT_VERSION;
  companyId: string;
  actorId: string;
  schemaHash: string;
  expectedCommit: string;
  mode: "canonical_only";
  issuedAt: number;
};

export function createCanonicalContractToken(input: Omit<CanonicalContractTokenPayload, "version" | "issuedAt" | "mode">) {
  const payload: CanonicalContractTokenPayload = {
    version: DEV087_CONTRACT_VERSION,
    ...input,
    mode: "canonical_only",
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCanonicalContractToken(value: string | null | undefined, expected: {
  companyId: string;
  actorId: string;
  schemaHash: string;
  expectedCommit: string;
  maxAgeMs?: number;
}) {
  const [encoded, supplied, extra] = value?.split(".") ?? [];
  if (!encoded || !supplied || extra) throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (signature.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(supplied))) {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  let payload: CanonicalContractTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CanonicalContractTokenPayload;
  } catch {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  const maxAgeMs = expected.maxAgeMs ?? 15 * 60_000;
  if (
    payload.version !== DEV087_CONTRACT_VERSION || payload.mode !== "canonical_only"
    || payload.companyId !== expected.companyId || payload.actorId !== expected.actorId
    || payload.schemaHash !== expected.schemaHash || payload.expectedCommit !== expected.expectedCommit
    || !Number.isFinite(payload.issuedAt) || payload.issuedAt > Date.now() + 60_000 || Date.now() - payload.issuedAt > maxAgeMs
  ) {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  return payload;
}
