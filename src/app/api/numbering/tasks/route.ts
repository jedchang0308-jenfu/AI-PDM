import { NextResponse } from "next/server";
import { listNumberingTasks } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.tasks");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "open";
  const status = rawStatus === "handled" || rawStatus === "cancelled" || rawStatus === "all" ? rawStatus : "open";
  const tasks = listNumberingTasks({ user: auth.user, status });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: tasks.length,
      open: tasks.filter((task) => task.taskStatus === "open").length,
      handled: tasks.filter((task) => task.taskStatus === "handled").length,
      cancelled: tasks.filter((task) => task.taskStatus === "cancelled").length
    },
    tasks
  });
}
