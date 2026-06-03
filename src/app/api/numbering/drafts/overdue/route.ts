import { NextResponse } from "next/server";
import { markOverdueDraftNumberingRecords } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.draft.admin_confirm");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  try {
    const result = markOverdueDraftNumberingRecords({
      olderThanDays: Number(body.olderThanDays ?? body.older_than_days ?? 30),
      now: typeof body.now === "string" ? body.now : undefined,
      actorId: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark overdue draft numbering records";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
