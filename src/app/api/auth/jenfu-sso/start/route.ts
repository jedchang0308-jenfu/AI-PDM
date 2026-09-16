import { jenfuSsoStart } from "@/lib/jenfu-sso-handoff";
export const runtime = "nodejs";
export async function GET(request: Request) { return jenfuSsoStart(request); }
