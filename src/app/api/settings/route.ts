import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { requireRoleAsync } from "@/lib/auth-async";
import { isGoogleDriveServiceConfigured } from "@/lib/gdrive";
import { getAllSystemSettingsAsync, setSystemSettingAsync } from "@/lib/system-settings-async";

export const runtime = "nodejs";

const ALLOWED_SETTINGS = [
  "gdrive_pending_folder_id",
  "gdrive_pending_folder_name",
  "gdrive_pending_folder_path",
  "gdrive_pending_folder_verified_at",
  "gdrive_released_folder_id",
  "gdrive_released_folder_name",
  "gdrive_released_folder_path",
  "gdrive_released_folder_verified_at",
  "gdrive_master_attachments_folder_id",
  "gdrive_master_attachments_folder_name",
  "gdrive_master_attachments_folder_path",
  "gdrive_master_attachments_folder_verified_at"
];

const folderIdKeys = new Set(["gdrive_pending_folder_id", "gdrive_released_folder_id", "gdrive_master_attachments_folder_id"]);
const folderSnapshotKeys = [...ALLOWED_SETTINGS];

export async function GET(request: Request) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbSettings = await getAllSystemSettingsAsync();

  return NextResponse.json({
    settings: {
      // DB-managed (user-configurable) settings
      gdrive_pending_folder_id: dbSettings.gdrive_pending_folder_id ?? "",
      gdrive_pending_folder_name: dbSettings.gdrive_pending_folder_name ?? "",
      gdrive_pending_folder_path: dbSettings.gdrive_pending_folder_path ?? "",
      gdrive_pending_folder_verified_at: dbSettings.gdrive_pending_folder_verified_at ?? "",
      gdrive_released_folder_id: dbSettings.gdrive_released_folder_id ?? "",
      gdrive_released_folder_name: dbSettings.gdrive_released_folder_name ?? "",
      gdrive_released_folder_path: dbSettings.gdrive_released_folder_path ?? "",
      gdrive_released_folder_verified_at: dbSettings.gdrive_released_folder_verified_at ?? "",
      gdrive_master_attachments_folder_id: dbSettings.gdrive_master_attachments_folder_id ?? "",
      gdrive_master_attachments_folder_name: dbSettings.gdrive_master_attachments_folder_name ?? "",
      gdrive_master_attachments_folder_path: dbSettings.gdrive_master_attachments_folder_path ?? "",
      gdrive_master_attachments_folder_verified_at: dbSettings.gdrive_master_attachments_folder_verified_at ?? "",
      // Environment-backed (read-only) settings
      authMode: process.env.PDM_AUTH_MODE ?? "demo",
      releaseMode: process.env.PDM_RELEASE_MODE ?? "auto",
      releaseFunctionConfigured: Boolean(process.env.RELEASE_FUNCTION_URL),
      releaseFunctionTokenConfigured: Boolean(process.env.RELEASE_FUNCTION_TOKEN),
      llmProvider: process.env.LLM_PROVIDER ?? "local",
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      serviceAccountConfigured: isGoogleDriveServiceConfigured()
    }
  });
}

export async function POST(request: Request) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const currentSettings = await getAllSystemSettingsAsync();
  const updates: Record<string, string> = {};
  const errors: string[] = [];

  for (const key of ALLOWED_SETTINGS) {
    if (key in body) {
      const value = String(body[key] ?? "").trim();
      if (folderIdKeys.has(key) && value && !/^[a-zA-Z0-9_-]+$/.test(value)) {
        errors.push(`${key}: invalid format (only alphanumeric, dash, underscore allowed)`);
        continue;
      }
      updates[key] = value;
    }
  }

  const pendingFolder = updates.gdrive_pending_folder_id ?? currentSettings.gdrive_pending_folder_id ?? "";
  const releasedFolder = updates.gdrive_released_folder_id ?? currentSettings.gdrive_released_folder_id ?? "";
  const masterAttachmentsFolder = updates.gdrive_master_attachments_folder_id ?? currentSettings.gdrive_master_attachments_folder_id ?? "";
  if (pendingFolder && releasedFolder && pendingFolder === releasedFolder) {
    errors.push("gdrive_pending_folder_id and gdrive_released_folder_id cannot be the same folder");
  }
  if (masterAttachmentsFolder && [pendingFolder, releasedFolder].includes(masterAttachmentsFolder)) {
    errors.push("gdrive_master_attachments_folder_id must be separate from pending and released folders");
  }

  if (body.gdrive_require_verified === true) {
    for (const use of ["pending", "released", "master_attachments"] as const) {
      const id = String(body[`gdrive_${use}_folder_id`] ?? "").trim();
      if (!id) continue;
      const name = String(body[`gdrive_${use}_folder_name`] ?? "").trim();
      const path = String(body[`gdrive_${use}_folder_path`] ?? "").trim();
      const verifiedAt = String(body[`gdrive_${use}_folder_verified_at`] ?? "").trim();
      if (!name || !path || !verifiedAt) {
        errors.push(`gdrive_${use}_folder_id must be verified before saving`);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "設定驗證失敗", details: errors }, { status: 400 });
  }

  const before = pickSettingsSnapshot(currentSettings);
  for (const [key, value] of Object.entries(updates)) {
    await setSystemSettingAsync(key, value, auth.user.id);
  }
  const after = pickSettingsSnapshot({ ...currentSettings, ...updates });

  await createAuditLogAsync({
    actorId: auth.user.id,
    action: "SettingsUpdate",
    detail: { before, after, updates: pickSettingsSnapshot(updates) }
  });

  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}

function pickSettingsSnapshot(settings: Record<string, string>) {
  return Object.fromEntries(folderSnapshotKeys.map((key) => [key, settings[key] ?? ""]));
}
