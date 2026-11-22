import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return principalCanonicalWorkbenchResponse(request,
    "src/app/api/numbering/drawings/workbench/route.ts", "drawing",
    (service, actor) => new URL(request.url).searchParams.get("view") === "previews"
      ? service.previews(new URL(request.url), "drawing", actor)
      : service.list(new URL(request.url), "drawing", actor));
}
