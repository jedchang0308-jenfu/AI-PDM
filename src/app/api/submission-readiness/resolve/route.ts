import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { resolveSubmissionReadiness, type SubmissionReadinessResolveInput } from "@/lib/submission-gate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as SubmissionReadinessResolveInput;
  return NextResponse.json(resolveSubmissionReadiness(body));
}
