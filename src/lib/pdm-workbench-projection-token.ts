import crypto from "node:crypto";
import type { PdmWorkbenchLane } from "@/lib/pdm-workbench-contract";

const TOKEN_VERSION = 1 as const;
const TOKEN_NAMESPACE = "pdm-workbench-lane-reference-v1" as const;

export type PdmWorkbenchProjectionTokenPayload = {
  version: typeof TOKEN_VERSION;
  namespace: typeof TOKEN_NAMESPACE;
  companyId: string;
  actorId: string;
  rowKey: string;
  lane: PdmWorkbenchLane;
  fingerprint: string;
};

export class PdmWorkbenchProjectionTokenError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "permission" | "company" | "stale",
    readonly status: 400 | 403 | 404 | 409 = code === "permission" ? 403 : code === "company" ? 404 : code === "stale" ? 409 : 400
  ) {
    super(message);
    this.name = "PdmWorkbenchProjectionTokenError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function secret() {
  const configured = process.env.PDM_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new PdmWorkbenchProjectionTokenError("production 缺少 PDM_AUTH_SECRET/AUTH_SECRET。", "invalid");
  }
  return "local-only-pdm-workbench-projection-secret";
}

function signature(payload: string) {
  return base64url(crypto.createHmac("sha256", secret()).update(payload).digest());
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Hashes only the reference identity/freshness fields; no raw source ID is put in the token. */
export function pdmWorkbenchReferenceFingerprint(input: {
  referenceKind: string;
  referenceId: string;
  revisionOrBaseline: string | null;
  contentHashOrSnapshotHash: string | null;
}) {
  return hash(canonicalJson(input));
}

export function createPdmWorkbenchProjectionToken(input: {
  companyId: string;
  actorId: string;
  rowKey: string;
  lane: PdmWorkbenchLane;
  fingerprint: string;
}) {
  const payload: PdmWorkbenchProjectionTokenPayload = {
    version: TOKEN_VERSION,
    namespace: TOKEN_NAMESPACE,
    companyId: input.companyId,
    actorId: input.actorId,
    rowKey: hash(input.rowKey),
    lane: input.lane,
    fingerprint: input.fingerprint
  };
  const encodedPayload = base64url(canonicalJson(payload));
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

function decode(value: string): { payload: PdmWorkbenchProjectionTokenPayload; encodedPayload: string; providedSignature: string } {
  const [encodedPayload, providedSignature, ...rest] = value.split(".");
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    throw new PdmWorkbenchProjectionTokenError("投影權杖格式無效。", "invalid");
  }
  const expectedSignature = signature(encodedPayload);
  if (providedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
    throw new PdmWorkbenchProjectionTokenError("投影權杖簽章無效。", "invalid");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new PdmWorkbenchProjectionTokenError("投影權杖內容無效。", "invalid");
  }
  if (!payload || typeof payload !== "object") throw new PdmWorkbenchProjectionTokenError("投影權杖內容無效。", "invalid");
  const candidate = payload as Partial<PdmWorkbenchProjectionTokenPayload>;
  if (candidate.version !== TOKEN_VERSION || candidate.namespace !== TOKEN_NAMESPACE || typeof candidate.companyId !== "string" || typeof candidate.actorId !== "string" || typeof candidate.rowKey !== "string" || (candidate.lane !== "production" && candidate.lane !== "rd") || typeof candidate.fingerprint !== "string") {
    throw new PdmWorkbenchProjectionTokenError("投影權杖版本或欄位無效。", "invalid");
  }
  return { payload: candidate as PdmWorkbenchProjectionTokenPayload, encodedPayload, providedSignature };
}

export function verifyPdmWorkbenchProjectionTokenShape(value: string | null | undefined, expected: { companyId: string; actorId: string; rowKey: string; lane: PdmWorkbenchLane }) {
  if (!value) throw new PdmWorkbenchProjectionTokenError("缺少投影權杖。", "invalid");
  const { payload } = decode(value);
  if (payload.companyId !== expected.companyId) throw new PdmWorkbenchProjectionTokenError("投影權杖不屬於目前公司。", "company");
  if (payload.actorId !== expected.actorId) throw new PdmWorkbenchProjectionTokenError("投影權杖不屬於目前使用者。", "permission");
  if (payload.rowKey !== hash(expected.rowKey) || payload.lane !== expected.lane) throw new PdmWorkbenchProjectionTokenError("投影權杖與目前列不相符。", "stale");
  return payload;
}

export function verifyPdmWorkbenchProjectionToken(value: string | null | undefined, expected: {
  companyId: string;
  actorId: string;
  rowKey: string;
  lane: PdmWorkbenchLane;
  fingerprint: string;
}) {
  if (!value) throw new PdmWorkbenchProjectionTokenError("缺少投影權杖。", "invalid");
  const { payload } = decode(value);
  if (payload.companyId !== expected.companyId) throw new PdmWorkbenchProjectionTokenError("投影權杖不屬於目前公司。", "company");
  if (payload.actorId !== expected.actorId) throw new PdmWorkbenchProjectionTokenError("投影權杖不屬於目前使用者。", "permission");
  if (payload.rowKey !== hash(expected.rowKey) || payload.lane !== expected.lane) throw new PdmWorkbenchProjectionTokenError("投影權杖與目前列不相符。", "stale");
  if (payload.fingerprint !== expected.fingerprint) throw new PdmWorkbenchProjectionTokenError("工作列已更新，投影權杖已過期。", "stale");
  return payload;
}
