import crypto from "node:crypto";
import type { PdmWorkbenchCursorPayload } from "@/lib/pdm-workbench-contract";

type EnvLike = Record<string, string | undefined>;

export class PdmWorkbenchCursorError extends Error {
  readonly code = "workbench_invalid_cursor";
  readonly status = 400;

  constructor(message = "這個清單位置已失效，請從第一頁重新查詢。") {
    super(message);
    this.name = "PdmWorkbenchCursorError";
  }
}

function cursorSecret(env: EnvLike = process.env) {
  const configured = env.PDM_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") throw new Error("PDM_WORKBENCH_CURSOR_SECRET_REQUIRED");
  return "ai-pdm-local-workbench-cursor-v1";
}

function signCursor(encoded: string, env: EnvLike = process.env) {
  return crypto.createHmac("sha256", cursorSecret(env)).update(encoded).digest("base64url");
}

export function pdmWorkbenchFilterHash(input: {
  namespace: "drawing-v1" | "drawing-v2" | "part-v1" | "relation-v1";
  filters: Record<string, string | number | boolean | null>;
  companyId: string;
  actorId: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    namespace: input.namespace,
    ...input.filters,
    companyId: input.companyId,
    actorId: input.actorId
  })).digest("hex");
}

export function encodePdmWorkbenchCursor(payload: PdmWorkbenchCursorPayload, env: EnvLike = process.env) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signCursor(encoded, env)}`;
}

export function decodePdmWorkbenchCursor(
  value: string,
  expectedFilterHash: string,
  env: EnvLike = process.env
): PdmWorkbenchCursorPayload {
  const [encoded, providedSignature, extra] = value.split(".");
  if (!encoded || !providedSignature || extra) throw new PdmWorkbenchCursorError();
  const expectedSignature = signCursor(encoded, env);
  const left = Buffer.from(providedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new PdmWorkbenchCursorError();
  }
  let payload: PdmWorkbenchCursorPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PdmWorkbenchCursorPayload;
  } catch {
    throw new PdmWorkbenchCursorError();
  }
  if (
    payload.version !== 1 ||
    payload.filterHash !== expectedFilterHash ||
    typeof payload.updatedAt !== "string" || !payload.updatedAt ||
    typeof payload.rowKey !== "string" || !payload.rowKey
  ) {
    throw new PdmWorkbenchCursorError("篩選條件已改變，請從第一頁重新查詢。");
  }
  return payload;
}
