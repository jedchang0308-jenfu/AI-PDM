import { NextResponse } from "next/server";
import { resolveActiveSolidWorksDocumentManagerKey } from "@/lib/settings-secret-lifecycle";
import { authenticateWorkerService } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authentication = authenticateWorkerService(request, "solidworks_credential");
  if ("response" in authentication) return authentication.response;

  try {
    const resolved = await resolveActiveSolidWorksDocumentManagerKey();
    if (!resolved) {
      return NextResponse.json({ error: "DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE" }, { status: 404, headers: noStoreHeaders() });
    }

    return NextResponse.json(
      { key: resolved.value, source: resolved.source, version: resolved.version, fingerprint: resolved.fingerprint },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code) : "DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED";
    return NextResponse.json({ error: code }, { status: 409, headers: noStoreHeaders() });
  }
}


function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" };
}
