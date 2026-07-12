import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { getAuthMode } from "@/lib/auth-config";
import { createSessionCookie } from "@/lib/auth";
import { ensureDemoUserAsync, getLocalPasswordIdentityAsync, recordIdentityLoginAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const demoAccounts = [
  { role: "Engineer", email: "engineer@example.com", id: "user-engineer-demo", displayName: "Demo Engineer", dbRole: "Engineer" },
  { role: "R&D Manager", email: "manager@example.com", id: "user-manager-demo", displayName: "Demo Manager", dbRole: "R&D Manager" },
  { role: "Admin", email: "admin@example.com", id: "user-admin-demo", displayName: "Demo Admin", dbRole: "Admin" },
  {
    role: "Manufacturing",
    email: "manufacturing@example.com",
    id: "user-manufacturing-demo",
    displayName: "Demo Manufacturing",
    dbRole: "Manufacturing"
  },
  {
    role: "Procurement",
    email: "procurement@example.com",
    id: "user-procurement-demo",
    displayName: "Demo Procurement",
    dbRole: "Procurement"
  }
] as const;

export async function GET(request: Request) {
  if (getAuthMode() !== "demo") {
    return NextResponse.json({ error: "Demo login is disabled" }, { status: 404 });
  }

  const url = new URL(request.url);
  const accountKey = String(url.searchParams.get("account") ?? "").trim().toLowerCase();
  const account = demoAccounts.find((item) => item.role.toLowerCase() === accountKey || item.email.toLowerCase() === accountKey);
  if (!account) return NextResponse.json({ error: "Unknown demo account" }, { status: 400 });

  await ensureDemoUserAsync({
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    role: account.dbRole
  });
  await createAuditLogAsync({ actorId: account.id, action: "Login", detail: { email: account.email, role: account.dbRole, source: "demo-shortcut" } });

  const redirectUrl = new URL("/", url.origin);
  return NextResponse.redirect(redirectUrl, {
    status: 303,
    headers: {
      "set-cookie": createSessionCookie(account.id)
    }
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "電子郵件與密碼為必填" }, { status: 400 });
  }

  if (email.toLowerCase() === "admin@example.com") {
    await ensureDemoUserAsync({
      id: "user-admin-demo",
      displayName: "Demo Admin",
      email: "admin@example.com",
      role: "Admin"
    });
  }

  const identity = await getLocalPasswordIdentityAsync(email);
  if (!identity || identity.status !== "active" || identity.user.account_status !== "active") {
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

  await recordIdentityLoginAsync(identity.identityId, user.email);
  await createAuditLogAsync({ actorId: user.id, action: "Login", detail: { email: user.email, role: user.role, provider: "local_password" } });
  return NextResponse.json(
    { user: await serializeAuthUserAsync(user) },
    {
      headers: {
        "set-cookie": createSessionCookie(user.id)
      }
    }
  );
}
