import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { isDrawingWorkbenchPreviewGalleryV1Enabled, isPdmWorkbenchProductionRdLanesV1Enabled } from "@/lib/number-state-flow-feature";
import { readPdmWorkbenchPreviewBytesAsync, resolveDrawingWorkbenchPreviewReferences } from "@/lib/pdm-workbench-preview-gallery";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { verifyPdmWorkbenchProjectionTokenShape, PdmWorkbenchProjectionTokenError } from "@/lib/pdm-workbench-projection-token";

export const runtime = "nodejs";
const PREVIEW_HEADERS = { "cache-control": "private, max-age=300" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;
  if (!isDrawingWorkbenchPreviewGalleryV1Enabled()) return NextResponse.json({ error: "preview_not_found" }, { status: 404, headers: PREVIEW_HEADERS });
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const rowKey = decodeURIComponent((await params).rowKey);
  if (isPdmWorkbenchProductionRdLanesV1Enabled() && (rowKey.endsWith(":rd") || rowKey.endsWith(":production")) && !new URL(request.url).searchParams.get("projectionToken")) {
    return NextResponse.json({ error: "invalid_projection_token" }, { status: 400, headers: PREVIEW_HEADERS });
  }
  try {
    if (isPdmWorkbenchProductionRdLanesV1Enabled() && (rowKey.endsWith(":rd") || rowKey.endsWith(":production"))) verifyPdmWorkbenchProjectionTokenShape(new URL(request.url).searchParams.get("projectionToken"), { companyId: companyResult.company.companyId, actorId: auth.user.id, rowKey, lane: rowKey.endsWith(":rd") ? "rd" : "production" });
  } catch (error) {
    if (error instanceof PdmWorkbenchProjectionTokenError) return NextResponse.json({ error: error.code }, { status: error.status, headers: PREVIEW_HEADERS });
    throw error;
  }
  const client = getAsyncDatabaseClient();
  const drawingId = rowKey.startsWith("drawing:") ? rowKey.slice("drawing:".length).replace(/:(?:rd|production)$/u, "") : rowKey;
  const source = await client.queryOne<{ workspace_id: string | null; formal_drawing_number_id: string | null }>("SELECT workspace_id, formal_drawing_number_id FROM drawings WHERE id = :id AND company_id = :companyId", { id: drawingId, companyId: companyResult.company.companyId });
  if (source?.workspace_id && !source.formal_drawing_number_id) {
    const workspaceView = await canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view");
    if (!workspaceView.allowed) return NextResponse.json({ error: "preview_not_found" }, { status: 404, headers: PREVIEW_HEADERS });
  }
  const reference = (await resolveDrawingWorkbenchPreviewReferences(client, [{ rowKey, drawingId, projectionToken: new URL(request.url).searchParams.get("projectionToken") }], companyResult.company.companyId)).get(rowKey);
  if (!reference) return NextResponse.json({ error: "preview_not_found" }, { status: 404, headers: PREVIEW_HEADERS });
  let file;
  try {
    file = await readPdmWorkbenchPreviewBytesAsync(client, reference);
  } catch {
    return NextResponse.json({ error: "preview_not_found" }, { status: 404, headers: PREVIEW_HEADERS });
  }
  if (!file) return NextResponse.json({ error: "preview_not_found" }, { status: 404, headers: PREVIEW_HEADERS });
  const etag = `"${file.contentHash}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...PREVIEW_HEADERS, etag } });
  return new Response(new Uint8Array(file.bytes), { headers: { ...PREVIEW_HEADERS, "content-type": file.mimeType, "content-length": String(file.bytes.byteLength), etag, "x-content-type-options": "nosniff" } });
}
