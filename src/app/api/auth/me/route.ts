import { NextResponse } from "next/server";
import { getSessionUserAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUserAsync(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: await serializeAuthUserAsync(user) });
}
