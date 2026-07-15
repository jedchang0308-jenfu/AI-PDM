import { requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { listPublishedTransferHandoffs } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireNumberStateReadAccessAsync(request, "handoff.published.view");
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const pkg = (await listPublishedTransferHandoffs(access.company.companyId)).find((item) => item.id === id);
    if (!pkg) return Response.json({ error: { code: "PUBLISHED_HANDOFF_NOT_FOUND", message: "找不到已發布交接。", retryable: false } }, { status: 404 });
    const rows = [
      ["package_code", "title", "published_at", "item_type", "item_code"],
      ...pkg.items.map((item) => [pkg.packageCode, pkg.title, pkg.publishedAt, item.type, item.code])
    ];
    return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${pkg.packageCode}-handoff.csv"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return transferPhase1dErrorResponse(error, "export_published_handoff");
  }
}
