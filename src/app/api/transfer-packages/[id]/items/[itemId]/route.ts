import { NextResponse } from "next/server";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { removeTransferPackageScopeItem } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const access = await requireTransferPackageAccessAsync(request, body);
  if (access.response) return access.response;
  const { id, itemId } = await params;
  try {
    const workbench = await removeTransferPackageScopeItem({
      packageId: id,
      itemId,
      actor: access.actor,
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version
    });
    return NextResponse.json({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包範圍移除失敗。");
  }
}
