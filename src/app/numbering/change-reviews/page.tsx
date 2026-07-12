import { redirect } from "next/navigation";
import { buildLegacyApprovalWorkbenchRedirect, type LegacyApprovalSearchParams } from "@/lib/approval-workbench-legacy-redirect";

export default async function LegacyNumberingChangeReviewsPage({
  searchParams
}: {
  searchParams?: Promise<LegacyApprovalSearchParams>;
}) {
  redirect(buildLegacyApprovalWorkbenchRedirect("numbering_change_reviews", await searchParams));
}
