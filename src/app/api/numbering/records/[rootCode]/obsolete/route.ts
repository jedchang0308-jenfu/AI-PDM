import { NextResponse } from "next/server";
import { obsoleteDraftNumberingRecord } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = requireNumberingAction(request, "numbering.draft.obsolete");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const result = obsoleteDraftNumberingRecord({
      rootCode: decodeURIComponent(rootCode),
      reason,
      obsoletedBy: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to obsolete draft numbering record";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NOT_DRAFT") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
