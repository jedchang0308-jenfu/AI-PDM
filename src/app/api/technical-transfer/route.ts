import { numberStateFlowJson, requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { listPublishedTransferHandoffs, listTransferPackages } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const tab = new URL(request.url).searchParams.get("tab") ?? "prepared";
  const published = tab === "published";
  const access = await requireNumberStateReadAccessAsync(
    request,
    published ? "handoff.published.view" : "transfer.package.view"
  );
  if (access.response) return access.response;
  try {
    if (published) {
      return numberStateFlowJson({ tab, packages: await listPublishedTransferHandoffs(access.company.companyId) });
    }
    const packages = await listTransferPackages(access.company.companyId);
    const allowedStatuses = tab === "review"
      ? new Set(["InReview", "ApprovedPendingPublish"])
      : new Set(["Draft", "NeedsInfo", "ReleaseFailed"]);
    return numberStateFlowJson({
      tab,
      packages: packages
        .filter((pkg) => allowedStatuses.has(pkg.status))
        .map((pkg) => ({
          id: pkg.id,
          packageCode: pkg.packageCode,
          title: pkg.title,
          caseType: pkg.caseType,
          status: pkg.status,
          ownerId: pkg.ownerId,
          rowVersion: pkg.rowVersion,
          officialItemCount: pkg.items.length,
          draftItemCount: pkg.draftItems.length,
          reviewRequestId: pkg.reviewRequestId,
          releaseFailureCorrelationId: pkg.releaseFailureCorrelationId,
          updatedAt: pkg.updatedAt
        }))
    });
  } catch (error) {
    return transferPhase1dErrorResponse(error, "list_technical_transfer");
  }
}
