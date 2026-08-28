import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ workId: string; fileBindingId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId, fileBindingId } = await params;
    return dev087Success(await new DrawingRevisionWorkService().removeFile(workId, fileBindingId, access.actor, dev087CommandContext(request)));
  } catch (error) {
    return dev087RouteError(error);
  }
}
