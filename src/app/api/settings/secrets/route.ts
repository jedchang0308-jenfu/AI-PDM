import { NextResponse } from "next/server";
import { listSettingsSecretStatuses, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/settings/secrets/route.ts", "settings.secret.manage");
  if (authorization instanceof Response) return authorization;

  try {
    return NextResponse.json({ secrets: await listSettingsSecretStatuses() }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.status, headers: noStoreHeaders }
      );
    }
    return NextResponse.json(
      { error: "SETTINGS_SECRET_STATUS_FAILED", message: "讀取 secret 狀態失敗，請稍後重試或通知 Admin。" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
