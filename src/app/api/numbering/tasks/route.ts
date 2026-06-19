import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listNumberingTasksAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.tasks");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "open";
  const status = rawStatus === "handled" || rawStatus === "cancelled" || rawStatus === "all" ? rawStatus : "open";
  const tasks = await listNumberingTasksAsync({ companyId: companyResult.company.companyId, user: auth.user, status });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: tasks.length,
      open: tasks.filter((task) => task.taskStatus === "open").length,
      handled: tasks.filter((task) => task.taskStatus === "handled").length,
      cancelled: tasks.filter((task) => task.taskStatus === "cancelled").length
    },
    tasks,
    pdmCompany: companyResult.company
  });
}
