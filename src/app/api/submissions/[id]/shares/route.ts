import { NextResponse } from "next/server";
import { createReadonlyShare, getSubmission, listReadonlyShares } from "@/lib/db";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { buildPublicShareUrl, generateShareToken, hashShareToken } from "@/lib/readonly-share";

export const runtime = "nodejs";

function canManageShares(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

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
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageShares(auth.user.role)) return forbidden();

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({ shares: listReadonlyShares(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageShares(auth.user.role)) return forbidden();

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();
  if (submission.status !== "Released") {
    return NextResponse.json({ error: "只有已發布送審資料可以對外分享" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "對外分享前必須先產生發布包" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const days = parseDays(body.days);
  if (!days) return NextResponse.json({ error: "有效天數必須為正數" }, { status: 400 });

  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const share = createReadonlyShare({
    submissionId: id,
    tokenHash: hashShareToken(token),
    label: parseLabel(body.label),
    expiresAt,
    createdBy: auth.user.id
  });

  return NextResponse.json(
    {
      share,
      token,
      public_url: buildPublicShareUrl(request, token)
    },
    { status: 201 }
  );
}
