import { readPartNumberMatrixWorkspace } from "@/lib/part-number-matrix-workspace";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.search");
  if (access.response || !access.actor) return access.response;
  try {
    const { partId } = await params;
    const workId = new URL(request.url).searchParams.get("workId")?.trim() ?? "";
    if (!workId) return Response.json({ error: { code: "WORKBENCH_BAD_REQUEST", message: "缺少來源工作資料" } }, { status: 400, headers: { "cache-control": "private, no-store" } });
    return Response.json(await readPartNumberMatrixWorkspace({ sourcePartId: decodeURIComponent(partId), sourceWorkId: workId, actor: access.actor }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return dev087RouteError(error);
  }
}
