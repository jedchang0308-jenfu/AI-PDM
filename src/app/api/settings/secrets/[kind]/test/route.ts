import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { listSettingsSecretStatuses, SettingsSecretLifecycleError, testSettingsSecretReference } from "@/lib/settings-secret-lifecycle";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind: secretReferenceId } = await params;

  try {
    const testRun = await testSettingsSecretReference({ secretReferenceId, actorId: auth.user.id });
    return NextResponse.json(
      { testRun, secrets: await listSettingsSecretStatuses() },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    return secretLifecycleErrorResponse(error);
  }
}

function secretLifecycleErrorResponse(error: unknown) {
  if (error instanceof SettingsSecretLifecycleError) {
    return NextResponse.json(
      { error: error.code, message: error.message, details: error.details },
      { status: error.status, headers: noStoreHeaders }
    );
  }
  return NextResponse.json(
    { error: "SETTINGS_SECRET_TEST_FAILED", message: "Secret 測試失敗，請稍後重試或通知 Admin。" },
    { status: 500, headers: noStoreHeaders }
  );
}
