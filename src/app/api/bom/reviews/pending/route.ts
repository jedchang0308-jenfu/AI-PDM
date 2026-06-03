import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { listPendingBomWorkbenchReviews } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (auth.user.role !== "R&D Manager" && auth.user.role !== "Admin") return forbidden();

  return NextResponse.json({ reviews: listPendingBomWorkbenchReviews() });
}
