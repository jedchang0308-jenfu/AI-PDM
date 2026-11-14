import { handlePdmReviewerBootstrap } from "@/lib/pdm-session-revocation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePdmReviewerBootstrap(request);
}
