import crypto from "node:crypto";
import type { DrawingRevisionBasisState, DrawingRevisionTuple } from "@/lib/drawing-revision-lifecycle-policy";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

type DrawingRevisionTargetTokenPayload = {
  version: 2;
  companyId: string;
  actorId: string;
  drawingId: string;
  sourceRowId: string;
  sourceRowVersion: number;
  basisState: DrawingRevisionBasisState;
  target: DrawingRevisionTuple;
  expiresAt: number;
};

function secret() {
  const configured = process.env.PDM_WORKBENCH_CONTRACT_SECRET?.trim() || process.env.PDM_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED");
  return "local-only-dev098-target-secret";
}

function fail(): never {
  throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
}

export function issueDrawingRevisionTargetToken(input: Omit<DrawingRevisionTargetTokenPayload, "version" | "expiresAt">) {
  const payload: DrawingRevisionTargetTokenPayload = { ...input, version: 2, expiresAt: Date.now() + 10 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyDrawingRevisionTargetToken(value: unknown, expected: { companyId: string; actorId: string; drawingId: string; sourceRowId: string; sourceRowVersion: number }) {
  if (typeof value !== "string") fail();
  const [encoded, supplied, extra] = value.split(".");
  if (!encoded || !supplied || extra) fail();
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (signature.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(supplied))) fail();
  let payload: DrawingRevisionTargetTokenPayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DrawingRevisionTargetTokenPayload; } catch { fail(); }
  if (payload.version !== 2 || payload.companyId !== expected.companyId || payload.actorId !== expected.actorId || payload.drawingId !== expected.drawingId || payload.sourceRowId !== expected.sourceRowId || payload.sourceRowVersion !== expected.sourceRowVersion || payload.basisState === "stale" || payload.expiresAt < Date.now()) fail();
  return payload;
}
