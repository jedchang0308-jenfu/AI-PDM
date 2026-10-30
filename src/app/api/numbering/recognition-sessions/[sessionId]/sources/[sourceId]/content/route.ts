import { NextResponse } from "next/server";
import { readDrawingRecognitionPdfSource } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { principalSessionTokenFromRequest, principalRequestInput } from '@/lib/jenfu-principal-http';
import { withVerifiedJenfuPrincipalRequest } from '@/lib/jenfu-principal-request-guard';
import { DrawingRecognitionAsyncRepository } from '@/lib/repositories/drawing-recognition-async-repository';
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from '@/lib/jenfu-principal-permission-service';
import { recognitionRolesArePrivileged } from '@/lib/drawing-recognition';
import { requireRecognitionSourceCapabilities } from '@/lib/principal-recognition-capability';

export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const normalized = fileName.replace(/[\r\n"\\]/gu, "_").slice(0, 180) || "drawing.pdf";
  const asciiFallback = normalized.normalize("NFKD").replace(/[^\x20-\x7e]/gu, "_");
  const encoded = encodeURIComponent(normalized).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; sourceId: string }> }) {
  try {
    if (request.headers.has("range")) throw new DrawingRecognitionError("RECOGNITION_PDF_RANGE_UNSUPPORTED", "PDF 辨識只接受一次完整的受控內容讀取。", 416);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const params = await context.params;
    const result = await readDrawingRecognitionPdfSource({
      sessionId: requireSafeRecognitionId(params.sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      sourceId: requireSafeRecognitionId(params.sourceId, "RECOGNITION_SOURCE_ID_INVALID"),
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      principalId: access.actor.principalId,
      roles: recognitionRoles(access),
      reauthorize: async source => {
        const token = principalSessionTokenFromRequest(request);
        if (!token) throw new DrawingRecognitionError('RECOGNITION_AUTH_SESSION_INVALID', '登入已失效，請重新登入。', 401);
        await withVerifiedJenfuPrincipalRequest(await principalRequestInput(token, request), async (snapshot, verified) => {
          if (verified.session.principalId !== access.actor.principalId ||
              verified.profile.pdmUserId !== access.actor.pdmUserId || verified.profile.companyId !== access.company.companyId) {
            throw new DrawingRecognitionError('RECOGNITION_VERIFIED_ACTOR_MISMATCH', '辨識發起者資料不一致。', 403);
          }
          const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
            [{ permissionKind: 'action', permissionCode: 'numbering.recognition.review', resourceGroup: 'drawing' }]);
          if (!decision?.allowed || decision.principalId !== verified.session.principalId) {
            throw new DrawingRecognitionError('RECOGNITION_PERMISSION_DENIED', '目前帳號沒有此辨識操作權限。', 403);
          }
          const repository = new DrawingRecognitionAsyncRepository(snapshot);
          await repository.assertSessionScope({ sessionId: params.sessionId, companyId: verified.profile.companyId,
            actorId: verified.profile.pdmUserId, principalId: verified.session.principalId,
            privileged: recognitionRolesArePrivileged(decision.roleCode ? [decision.roleCode] : []) });
          await requireRecognitionSourceCapabilities(snapshot, verified, params.sessionId, 'download', params.sourceId);
          const current = await repository.getSourceForActor({ sessionId: params.sessionId, sourceId: params.sourceId,
            companyId: verified.profile.companyId });
          if (current.expectedHash !== source.expectedHash || current.sourceId !== source.sourceId ||
              current.canonicalSourceIdentity !== source.canonicalSourceIdentity) {
            throw new DrawingRecognitionError('RECOGNITION_SOURCE_STALE', '辨識來源已改變，請重新辨識。', 409);
          }
        }, { readOnly: true, isolationLevel: 'repeatable_read' });
      }
    });
    return new NextResponse(result.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/pdf",
        "content-length": String(result.bytes.byteLength),
        "content-hash": result.contentHash,
        "content-disposition": contentDisposition(result.fileName),
        "accept-ranges": "none",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.pdf-content");
  }
}
