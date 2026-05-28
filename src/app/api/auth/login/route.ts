import { NextResponse } from "next/server";
import { createAuditLog, ensureDemoUser, getAuthMode, getUserByEmailWithPassword } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "電子郵件與密碼為必填" }, { status: 400 });
  }

  if (email.toLowerCase() === "admin@example.com") {
    ensureDemoUser({
      id: "user-admin-demo",
      displayName: "Demo Admin",
      email: "admin@example.com",
      role: "Admin"
    });
  }

  const user = getUserByEmailWithPassword(email);
  if (!user) {
    return NextResponse.json({ error: "電子郵件或密碼不正確" }, { status: 401 });
  }

  let passwordValid = false;
  if (user.password_hash) {
    passwordValid = verifyPassword(password, user.password_hash);
  } else if (getAuthMode() === "demo") {
    const fallbackPassword = process.env.PDM_DEMO_PASSWORD || "pdm-demo";
    passwordValid = password === fallbackPassword;
  }

  if (!passwordValid) {
    return NextResponse.json({ error: "電子郵件或密碼不正確" }, { status: 401 });
  }

  createAuditLog({ actorId: user.id, action: "Login", detail: { email: user.email, role: user.role } });
  return NextResponse.json(
    { user: { id: user.id, display_name: user.display_name, email: user.email, role: user.role } },
    {
      headers: {
        "set-cookie": createSessionCookie(user.id)
      }
    }
  );
}
