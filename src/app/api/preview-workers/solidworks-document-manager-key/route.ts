import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { resolveActiveSolidWorksDocumentManagerKey } from "@/lib/settings-secret-lifecycle";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const tokenResponse = requirePreviewWorkerToken(request);
  if (tokenResponse) return tokenResponse;

  try {
    const resolved = await resolveActiveSolidWorksDocumentManagerKey();
    if (!resolved) {
      return NextResponse.json({ error: "DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE" }, { status: 404, headers: noStoreHeaders() });
    }

    return NextResponse.json(
      { key: resolved.value, source: resolved.source },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code) : "DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED";
    return NextResponse.json({ error: code }, { status: 409, headers: noStoreHeaders() });
  }
}

function requirePreviewWorkerToken(request: Request) {
  const configuredToken = process.env.PDM_PREVIEW_WORKER_TOKEN?.trim();
  if (!configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503, headers: noStoreHeaders() });
  const authorizationToken = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim();
  const providedToken = authorizationToken || request.headers.get("x-pdm-preview-worker-token")?.trim();
  if (!providedToken || !safeTokenEqual(providedToken, configuredToken)) return NextResponse.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403, headers: noStoreHeaders() });
  return null;
}

function safeTokenEqual(providedToken: string, configuredToken: string) {
  const provided = Buffer.from(providedToken, "utf8");
  const configured = Buffer.from(configuredToken, "utf8");
  return provided.length === configured.length && crypto.timingSafeEqual(provided, configured);
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" };
}
