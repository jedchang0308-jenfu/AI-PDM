import { NextResponse } from "next/server";
import { executeMasterAttachmentCommandAsync } from "@/lib/master-attachments-async";
import { masterAttachmentCommandFailureResponse } from "@/lib/master-attachment-response";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.attachments.manage", body });
  if (access.response) return access.response;
  const { partNumber, attachmentId } = await params;
  const entityCode = decodeURIComponent(partNumber);

  try {
    const result = await executeMasterAttachmentCommandAsync({
      kind: "restore", entityType: "part_number", entityCode, attachmentId,
      reason: String(body.reason ?? "")
    }, access.metadata);
    return NextResponse.json(result);
  } catch (error) {
    return masterAttachmentCommandFailureResponse(error);
  }
}
