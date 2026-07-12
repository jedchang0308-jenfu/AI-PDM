import { redirect } from "next/navigation";
import { buildLegacyApprovalWorkbenchRedirect, type LegacyApprovalSearchParams } from "@/lib/approval-workbench-legacy-redirect";

export default async function LegacyBomReviewsPage({
  searchParams
}: {
  searchParams?: Promise<LegacyApprovalSearchParams>;
}) {
  redirect(buildLegacyApprovalWorkbenchRedirect("bom_reviews", await searchParams));
}
