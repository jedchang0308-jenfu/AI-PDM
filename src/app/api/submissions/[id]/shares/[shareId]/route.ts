import { NextResponse } from "next/server";
import { AsyncReleaseRepository } from "@/lib/repositories/release-async-repository";
import { executePrincipalReadonlyShareCommand } from "@/lib/principal-readonly-share-command";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  const outcome = await executePrincipalReadonlyShareCommand({
    request, routePath: "src/app/api/submissions/[id]/shares/[shareId]/route.ts", method: "PATCH",
    commandName: "pdm.submission_share.revoke", submissionId: id, shareId,
    payload: { submissionId: id, shareId }, idempotencyPayload: { submissionId: id, shareId },
    execute: async (client, verified) => {
      const share = await new AsyncReleaseRepository(client).revokeReadonlyShare({
        submissionId: id, shareId, revokedBy: verified.profile.pdmUserId,
        principalAudit: { principalId: verified.session.principalId, companyId: verified.profile.companyId }
      });
      return { share };
    },
    event: ({ share }) => {
      if (!share) throw new Error("READONLY_SHARE_NOT_FOUND");
      return { aggregateType: "readonly_share", aggregateId: share.id,
        eventType: "pdm.submission_share.revoked",
        payload: { submissionId: id, shareId: share.id } };
    }
  });
  if (outcome instanceof Response) return outcome;
  if (!outcome.result.share) return NextResponse.json({ error: "分享連結不存在" }, { status: 404 });
  return NextResponse.json({ share: outcome.result.share }, { headers: { "cache-control": "private, no-store" } });
}

