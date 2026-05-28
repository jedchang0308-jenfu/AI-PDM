import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAuditLog, getAllSystemSettings, setSystemSetting } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_SETTINGS = [
  "gdrive_pending_folder_id",
  "gdrive_released_folder_id"
];

export async function GET(request: Request) {
  const auth = requireRole(request, ["Admin"]);
  if (auth.response) return auth.response;

  const dbSettings = getAllSystemSettings();

  return NextResponse.json({
    settings: {
      // DB-managed (user-configurable) settings
      gdrive_pending_folder_id: dbSettings.gdrive_pending_folder_id ?? "",
      gdrive_released_folder_id: dbSettings.gdrive_released_folder_id ?? "",
      // Environment-backed (read-only) settings
      authMode: process.env.PDM_AUTH_MODE ?? "demo",
      releaseMode: process.env.PDM_RELEASE_MODE ?? "auto",
      releaseFunctionConfigured: Boolean(process.env.RELEASE_FUNCTION_URL),
      releaseFunctionTokenConfigured: Boolean(process.env.RELEASE_FUNCTION_TOKEN),
      llmProvider: process.env.LLM_PROVIDER ?? "local",
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      serviceAccountConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
    }
  });
}

export async function POST(request: Request) {
  const auth = requireRole(request, ["Admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, string> = {};
  const errors: string[] = [];

  for (const key of ALLOWED_SETTINGS) {
    if (key in body) {
      const value = String(body[key] ?? "").trim();
      if (value && !/^[a-zA-Z0-9_-]+$/.test(value)) {
        errors.push(`${key}: invalid format (only alphanumeric, dash, underscore allowed)`);
        continue;
      }
      updates[key] = value;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "驗證失敗", details: errors }, { status: 400 });
  }

  for (const [key, value] of Object.entries(updates)) {
    setSystemSetting(key, value, auth.user.id);
  }

  createAuditLog({
    actorId: auth.user.id,
    action: "SettingsUpdate",
    detail: { updates }
  });

  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}
