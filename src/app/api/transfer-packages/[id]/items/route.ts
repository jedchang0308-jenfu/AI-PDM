import { NextResponse } from "next/server";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { addTransferPackageScopeItem } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const access = await requireTransferPackageAccessAsync(request, body);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await addTransferPackageScopeItem({
      packageId: id,
      actor: access.actor,
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version,
      entityType: body.entityType ?? body.entity_type,
      entityIdOrCode: body.entityId ?? body.entity_id ?? body.entityCode ?? body.entity_code
    });
    return NextResponse.json({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包範圍新增失敗。");
  }
}
