import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { getAuthMode } from "@/lib/auth-config";
import { generateToken } from "@/lib/auth";
import { ensureDemoUserAsync, getLocalPasswordIdentityAsync, recordIdentityLoginAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "電子郵件與密碼為必填" }, { status: 400 });
  }

  // Ensure Demo Admin is created if attempting to login as admin
  if (email.toLowerCase() === "admin@example.com") {
    await ensureDemoUserAsync({
      id: "user-admin-demo",
      displayName: "Demo Admin",
      email: "admin@example.com",
      role: "Admin"
    });
  }

  const identity = await getLocalPasswordIdentityAsync(email);
  if (
    !identity ||
    identity.status !== "active" ||
    identity.user.account_status !== "active" ||
    identity.user.system_role_enabled === 0 ||
    identity.user.system_role_enabled === false
  ) {
    return NextResponse.json({ error: "電子郵件或密碼不正確" }, { status: 401 });
  }
  const user = identity.user;

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

  // Create audit log for login event
  await recordIdentityLoginAsync(identity.identityId, user.email);
  await createAuditLogAsync({ actorId: user.id, action: "Login", detail: { email: user.email, role: user.role, provider: "local_password", client: "SolidWorks Add-in" } });

  // Generate bearer token
  const token = generateToken(user.id);

  return NextResponse.json({
    token,
    user: await serializeAuthUserAsync(user)
  });
}
