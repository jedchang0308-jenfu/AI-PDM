import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { createReadonlyShareAsync, listReadonlySharesAsync } from "@/lib/release-records-async";
import { buildPublicShareUrlAsync, generateShareTokenAsync, hashShareTokenAsync } from "@/lib/readonly-share-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

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
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  return NextResponse.json({ shares: await listReadonlySharesAsync(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "Released") {
    return NextResponse.json({ error: "Release package is required before sharing" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "Release package is required before sharing" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const days = parseDays(body.days);
  if (!days) return NextResponse.json({ error: "days must be between 1 and 30" }, { status: 400 });

  const token = generateShareTokenAsync();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const share = await createReadonlyShareAsync({
    submissionId: id,
    tokenHash: hashShareTokenAsync(token),
    label: parseLabel(body.label),
    expiresAt,
    createdBy: auth.user.id
  });

  return NextResponse.json(
    {
      share,
      token,
      public_url: buildPublicShareUrlAsync(request, token)
    },
    { status: 201 }
  );
}

