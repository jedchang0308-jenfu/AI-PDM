import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { getActiveSubmissionRuleSet } from "@/lib/submission-gate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const ruleSet = getActiveSubmissionRuleSet({
    mode: searchParams.get("mode"),
    phase: searchParams.get("phase"),
    caseType: searchParams.get("caseType")
  });
  return NextResponse.json(ruleSet);
}
