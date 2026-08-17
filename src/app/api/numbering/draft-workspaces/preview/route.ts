import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { previewAppendNumbersAsync, previewNewBundleNumbersAsync } from "@/lib/number-candidate-preview";
import {
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateReadAccessAsync
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

type PurposeCode = "M" | "R";

export async function GET(request: Request) {
  const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.create");
  if (access.response) return access.response;

  try {
    const url = new URL(request.url);
    const purposeCode = normalizedPurpose(url.searchParams.get("purposeCode") ?? url.searchParams.get("purpose_code"));
    const sourceRootCode = String(url.searchParams.get("sourceRootCode") ?? url.searchParams.get("source_root_code") ?? "").trim().toUpperCase();
    const preview = sourceRootCode
      ? await previewAppendNumbersAsync(getAsyncDatabaseClient(), access.company.companyId, sourceRootCode, purposeCode)
      : await previewNewBundleNumbersAsync(getAsyncDatabaseClient(), access.company.companyId, purposeCode);
    return numberStateFlowJson({ preview, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Number preview failed.");
  }
}

function normalizedPurpose(value: string | null): PurposeCode {
  return value === "R" ? "R" : "M";
}
