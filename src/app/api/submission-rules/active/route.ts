import { NextResponse } from "next/server";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";
import { getActiveSubmissionRuleSet } from "@/lib/submission-gate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/submission-rules/active/route.ts", "submission.view");
  if (authorization instanceof Response) return authorization;

  const searchParams = new URL(request.url).searchParams;
  const ruleSet = getActiveSubmissionRuleSet({
    mode: searchParams.get("mode"),
    phase: searchParams.get("phase"),
    caseType: searchParams.get("caseType")
  });
  return NextResponse.json(ruleSet,
    { headers: { "cache-control": "private, no-store" } });
}
