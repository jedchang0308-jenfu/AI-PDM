import { handlePdmSessionRevocation } from "@/lib/pdm-session-revocation";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handlePdmSessionRevocation(request, false);
}
