import { CanonicalChangeWorkspace } from "@/components/canonical-change-workspace";
import { redirect } from "next/navigation";
import { normalizePdmPartReturnTo } from "@/lib/pdm-review-navigation";
import { safeReturnTo as safeDrawingReturnTo } from "@/lib/drawing-recognition-part-work-handoff-contract";
import { normalizePartMaintenanceTab } from "@/lib/part-number-matrix-contract";

export const dynamic = "force-dynamic";

export default async function PartWorkspacePage({ params, searchParams }: { params: Promise<{ partId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { partId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  const workId = value("workId");
  if (workId) {
    const rawReturnTo = value("returnTo");
    const safeReturnTo = normalizePdmPartReturnTo(rawReturnTo, safeDrawingReturnTo(rawReturnTo) ?? "/parts");
    return <CanonicalChangeWorkspace entityType="part" entityId={decodeURIComponent(partId)} workId={workId} returnTo={safeReturnTo} initialTab={normalizePartMaintenanceTab(value("tab"))} />;
  }
  redirect(`/parts?query=${encodeURIComponent(decodeURIComponent(partId))}`);
}
