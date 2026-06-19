import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createLogoutCookie } from "@/lib/auth";
import { getSessionUserAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUserAsync(request);
  if (user) {
    await createAuditLogAsync({ actorId: user.id, action: "Logout", detail: { email: user.email } });
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
