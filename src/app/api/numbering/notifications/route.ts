import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listNumberingNotificationsAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.tasks");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const rawRead = url.searchParams.get("read") ?? "all";
  const rawHandled = url.searchParams.get("handled") ?? "all";
  const read = rawRead === "read" || rawRead === "unread" ? rawRead : "all";
  const handled = rawHandled === "handled" || rawHandled === "unhandled" ? rawHandled : "all";
  const notifications = await listNumberingNotificationsAsync({ companyId: companyResult.company.companyId, user: auth.user, read, handled });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: notifications.length,
      unread: notifications.filter((notification) => !notification.readAt).length,
      unhandled: notifications.filter((notification) => !notification.handledAt).length,
      critical: notifications.filter((notification) => notification.severity === "critical").length,
      warning: notifications.filter((notification) => notification.severity === "warning").length,
      info: notifications.filter((notification) => notification.severity === "info").length
    },
    notifications,
    pdmCompany: companyResult.company
  });
}
