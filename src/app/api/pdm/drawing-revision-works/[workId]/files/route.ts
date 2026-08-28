import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId } = await params;
    const form = await request.formData();
    const result = await new DrawingRevisionWorkService().uploadFile(workId, {
      file: form.get("file"),
      displayName: form.get("display_name"),
      description: form.get("description")
    }, access.actor, dev087CommandContext(request));
    return dev087Success(result);
  } catch (error) {
    return dev087RouteError(error);
  }
}
