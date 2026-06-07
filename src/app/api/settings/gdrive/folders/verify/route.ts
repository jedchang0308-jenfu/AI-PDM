import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { verifyDriveFolder } from "@/lib/gdrive";

export const runtime = "nodejs";

const intendedUses = new Set(["pending", "released", "master_attachments"]);

export async function POST(request: Request) {
  const auth = requireRole(request, ["Admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const folderId = String(body.folderId ?? "").trim();
  const intendedUse = String(body.intendedUse ?? "").trim();

  if (!folderId || !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    return NextResponse.json({ error: "GDRIVE_FOLDER_ID_INVALID" }, { status: 400 });
  }
  if (!intendedUses.has(intendedUse)) {
    return NextResponse.json({ error: "GDRIVE_INTENDED_USE_INVALID" }, { status: 400 });
  }

  try {
    const verification = await verifyDriveFolder(folderId);
    return NextResponse.json({ ...verification, intendedUse });
  } catch (error) {
    return NextResponse.json(
      {
        error: "GDRIVE_FOLDER_VERIFY_FAILED",
        message: safeDriveErrorMessage(error)
      },
      { status: 400 }
    );
  }
}

function safeDriveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not a folder")) return "Selected target is not a Google Drive folder.";
  if (message.includes("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")) return "Google Drive service account is not configured.";
  if (message.includes("Service account key file not found")) return "Google Drive service account key file is not available.";
  return "Google Drive folder could not be verified.";
}
