import { redirect } from "next/navigation";
import { buildLegacyApprovalWorkbenchRedirect, type LegacyApprovalSearchParams } from "@/lib/approval-workbench-legacy-redirect";

export default async function LegacyNumberingApprovalsPage({
  searchParams
}: {
  searchParams?: Promise<LegacyApprovalSearchParams>;
}) {
  redirect(buildLegacyApprovalWorkbenchRedirect("numbering_approvals", await searchParams));
}
