import { NextResponse } from "next/server";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";
import { resolveSubmissionReadiness, type SubmissionReadinessResolveInput } from "@/lib/submission-gate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/submission-readiness/resolve/route.ts", "submission.create", "POST");
  if (authorization instanceof Response) return authorization;

  const body = (await request.json().catch(() => ({}))) as SubmissionReadinessResolveInput;
  return NextResponse.json(resolveSubmissionReadiness(body),
    { headers: { "cache-control": "private, no-store" } });
}
