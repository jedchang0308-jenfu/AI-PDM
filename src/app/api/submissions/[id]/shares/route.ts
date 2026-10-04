import { NextResponse } from "next/server";
import { AsyncReleaseRepository } from "@/lib/repositories/release-async-repository";
import { executePrincipalReadonlyShareCommand } from "@/lib/principal-readonly-share-command";
import { authorizePrincipalSubmissionShareInSnapshot, withPrincipalSharePermission } from "@/lib/principal-readonly-share";
import { buildPublicShareUrlAsync, generateShareTokenAsync, hashShareTokenAsync } from "@/lib/readonly-share-async";

export const runtime = "nodejs";

function parseDays(value: unknown) {
  const days = Number(value ?? 14);
  if (!Number.isFinite(days)) return null;
  return Math.max(1, Math.min(90, Math.floor(days)));
}

function parseLabel(value: unknown) {
  const label = String(value ?? "Supplier/procurement review").trim();
  return label.slice(0, 80) || "Supplier/procurement review";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await withPrincipalSharePermission(request,
    "src/app/api/submissions/[id]/shares/route.ts", "submission.share", async ({ snapshot, verified }) => {
      const submission = await authorizePrincipalSubmissionShareInSnapshot(snapshot, verified, id);
      if (submission instanceof Response) return submission;
      const shares = await new AsyncReleaseRepository(snapshot).listReadonlyShares(id);
      return NextResponse.json({ shares }, { headers: { "cache-control": "private, no-store" } });
    });
  return response;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody: unknown = await request.json().catch(() => ({}));
  const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
  const days = parseDays(body.days);
  if (!days) return NextResponse.json({ error: "days must be between 1 and 90" }, { status: 400 });

  const token = generateShareTokenAsync();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const label = parseLabel(body.label);
  const outcome = await executePrincipalReadonlyShareCommand({
    request, routePath: "src/app/api/submissions/[id]/shares/route.ts", method: "POST",
    commandName: "pdm.submission_share.create", submissionId: id,
    payload: { submissionId: id, label, days },
    idempotencyPayload: { submissionId: id, label, days },
    execute: async (client, verified) => {
      const share = await new AsyncReleaseRepository(client).createReadonlyShare({
        submissionId: id, tokenHash: hashShareTokenAsync(token), label, expiresAt,
        createdBy: verified.profile.pdmUserId,
        principalAudit: { principalId: verified.session.principalId, companyId: verified.profile.companyId }
      });
      if (!share) throw new Error("READONLY_SHARE_CREATE_FAILED");
      return { share };
    },
    event: ({ share }) => ({ aggregateType: "readonly_share", aggregateId: share.id,
      eventType: "pdm.submission_share.created",
      payload: { submissionId: id, shareId: share.id, label: share.label, expiresAt: share.expires_at } })
  });
  if (outcome instanceof Response) return outcome;
  if (outcome.reusedFromCommandReceipt) {
    return NextResponse.json({ code: "share_creation_result_already_consumed" }, { status: 409 });
  }

  return NextResponse.json(
    {
      share: outcome.result.share,
      token,
      public_url: buildPublicShareUrlAsync(request, token)
    },
    { status: 201 }
  );
}

