import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { leaseProtocolVersion, previewLeaseEnvelope } from "./preview-worker-lease.mjs";

/** Workstation receives only its claimed source via the owner API, never a
 * container path or a claim-supplied URL. Always clean the task-owned directory. */
export async function materializeClaimedPreviewSource({ baseUrl, token, workerId, claim, request = fetch, signal }) {
  if (!/^[a-z0-9]+$/iu.test(claim.sourceExtension || "") ||
      !/^[a-f0-9]{64}$/iu.test(claim.sourceContentHash || "")) throw new Error("PREVIEW_SOURCE_METADATA_INVALID");
  const url = new URL(`/api/preview-jobs/${encodeURIComponent(claim.jobId)}/content`, baseUrl);
  const lease = Buffer.from(JSON.stringify(previewLeaseEnvelope(claim)), "utf8").toString("base64url");
  const deadline = AbortSignal.timeout(60000);
  const response = await request(url, { redirect: "error", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: { authorization: `Bearer ${token}`, "x-pdm-worker-id": workerId, "x-pdm-preview-lease": lease } });
  if (!response.ok) throw new Error(`PREVIEW_SOURCE_READ_FAILED:${response.status}`);
  if (response.headers.get("x-pdm-preview-lease-protocol-version") !== String(leaseProtocolVersion)) {
    throw Object.assign(new Error("PREVIEW_WORKER_LEASE_PROTOCOL_MISMATCH"), { code: "PREVIEW_WORKER_CONFIGURATION_ERROR" });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== claim.sourceContentHash.toLowerCase() || response.headers.get("content-hash") !== digest ||
      response.headers.get("content-length") !== String(bytes.length)) throw new Error("PREVIEW_SOURCE_CONTENT_MISMATCH");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aipdm-preview-source-"));
  const sourcePath = path.join(directory, `source.${claim.sourceExtension.toLowerCase()}`);
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  try { await fs.writeFile(sourcePath, bytes, { flag: "wx" }); } catch (error) { await cleanup(); throw error; }
  return { sourcePath, cleanup };
}
