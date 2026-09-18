import { jenfuSsoCallback } from "@/lib/jenfu-sso-handoff";
export const runtime = "nodejs";
export async function GET(request: Request) { return jenfuSsoCallback(request); }
