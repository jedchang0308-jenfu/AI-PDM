import { NextResponse } from "next/server";
import { isActiveSolidWorksDocumentManagerKeyConfigured, resolveActiveSolidWorksDocumentManagerKey } from "@/lib/settings-secret-lifecycle";
import { authenticateWorkerService } from "@/lib/worker-service-auth";
import type { VerifiedWorkloadActor } from "@/lib/worker-service-auth";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { hasClaimedPreviewSourceAccessAsync } from "@/lib/preview-derivatives";
import { decodePreviewLeaseHeader, previewLeaseHeader } from "@/lib/preview-worker-lease";
import { decodeRecognitionLeaseHeader, recognitionLeaseHeader } from "@/lib/recognition-worker-lease";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";

export const runtime = "nodejs";

async function ownsCurrentNativeJob(request: Request, actor: VerifiedWorkloadActor) {
  const query = new URL(request.url).searchParams;
  const kind = query.get("kind");
  const jobId = query.get("jobId");
  if (!jobId || !/^[A-Za-z0-9._:-]{1,180}$/u.test(jobId)) return false;
  const client = getAsyncDatabaseClient();
  if (kind === "preview") {
    const leaseBasis = decodePreviewLeaseHeader(request.headers.get(previewLeaseHeader));
    if (!leaseBasis || leaseBasis.companyId !== actor.companyId) return false;
    return hasClaimedPreviewSourceAccessAsync(client, {
      jobId, workerId: actor.id, ownerPrincipalId: actor.ownerPrincipalId, leaseBasis
    });
  }
  if (kind === "recognition") {
    const sourceId = query.get("sourceId");
    const leaseBasis = decodeRecognitionLeaseHeader(request.headers.get(recognitionLeaseHeader));
    if (!sourceId || !/^[A-Za-z0-9._:-]{1,180}$/u.test(sourceId) || !leaseBasis ||
        leaseBasis.companyId !== actor.companyId) return false;
    const source = await client.transaction(snapshot => new DrawingRecognitionAsyncRepository(snapshot)
      .getClaimedSourceForWorker({ sessionId: jobId, sourceId, workerId: actor.id,
        ownerPrincipalId: actor.ownerPrincipalId, leaseBasis }),
    { isolationLevel: "repeatable_read", readOnly: true });
    return /\.(?:sldprt|sldasm|slddrw)$/iu.test(source.fileName);
  }
  return false;
}

function deniedLease() {
  return NextResponse.json({ error: "WORKER_JOB_LEASE_REQUIRED" }, { status: 403, headers: noStoreHeaders() });
}

async function guardedJob(request: Request, actor: VerifiedWorkloadActor): Promise<Response | null> {
  try {
    return await ownsCurrentNativeJob(request, actor) ? null : deniedLease();
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
    return [403, 404, 409].includes(status) ? deniedLease() : dependencyFailure();
  }
}

function dependencyFailure() {
  return NextResponse.json({ error: "DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED" }, { status: 503, headers: noStoreHeaders() });
}

export async function GET(request: Request) {
  const authentication = await authenticateWorkerService(request, "solidworks_credential");
  if ("response" in authentication) return authentication.response;
  const query = new URL(request.url).searchParams;
  if (query.get("readiness") === "1" && query.size === 1) {
    try {
      return NextResponse.json({ available: await isActiveSolidWorksDocumentManagerKeyConfigured() }, { headers: noStoreHeaders() });
    } catch { return dependencyFailure(); }
  }
  const denied = await guardedJob(request, authentication.actor);
  if (denied) return denied;
  try {
    const resolved = await resolveActiveSolidWorksDocumentManagerKey();
    if (!resolved) {
      return NextResponse.json({ error: "DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE" }, { status: 404, headers: noStoreHeaders() });
    }

    // Provider I/O may outlive a revocation or source change. Re-read both the
    // device and job authority before returning the credential.
    const current = await authenticateWorkerService(request, "solidworks_credential");
    if ("response" in current) return current.response;
    if (current.actor.id !== authentication.actor.id ||
        current.actor.ownerPrincipalId !== authentication.actor.ownerPrincipalId) return deniedLease();
    const denied = await guardedJob(request, current.actor);
    if (denied) return denied;
    return NextResponse.json(
      { key: resolved.value, source: resolved.source, version: resolved.version, fingerprint: resolved.fingerprint },
      { headers: noStoreHeaders() }
    );
  } catch { return dependencyFailure(); }
}


function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, no-cache, must-revalidate", Pragma: "no-cache" };
}
