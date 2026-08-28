import crypto from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json.ts";

/** Server-only canonical hash helper; keep Node crypto out of client-safe recognition contracts. */
export function sha256Canonical(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}
