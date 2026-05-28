import { NextResponse } from "next/server";
import { createLogoutCookie, getSessionUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (user) {
    createAuditLog({ actorId: user.id, action: "Logout", detail: { email: user.email } });
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "set-cookie": createLogoutCookie()
      }
    }
  );
}
