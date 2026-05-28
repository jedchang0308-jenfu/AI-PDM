import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listNotifications, summarizeNotifications } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const notifications = listNotifications(auth.user);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: summarizeNotifications(notifications),
    notifications
  });
}
