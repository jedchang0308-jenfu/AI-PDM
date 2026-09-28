import { NextResponse } from "next/server";
import { detectAiOcrCandidates } from "@/lib/ai-ocr-adapter";
import { extractCadReferences } from "@/lib/cad-extraction";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { resolveMetadataAdapterProfile, serializeMetadataAdapterProfile } from "@/lib/metadata-adapter-profile";
import { detectPdmMetadata } from "@/lib/pdm-metadata";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";
import { validateNumberStateMultipartMutationRequest } from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const invalid = validateNumberStateMultipartMutationRequest({ request });
  if (invalid) return invalid;
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/file-metadata/detect/route.ts", "pdm.file_metadata.detect", "POST");
  if (authorization instanceof Response) return authorization;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ code: "multipart_request_invalid" }, { status: 400 });
  const requestedCompany = requestedPdmCompanyCodeFromRequest(request, form);
  if (requestedCompany.state === "invalid") {
    return NextResponse.json({ code: "pdm_company_code_invalid" }, { status: 400 });
  }
  if (requestedCompany.state === "valid" && requestedCompany.companyCode !== authorization.company.companyCode) {
    return NextResponse.json({ code: "entitlement_scope_mismatch" }, { status: 403 });
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "files_required" }, { status: 400 });
  }

  try {
    const adapterProfile = resolveMetadataAdapterProfile(authorization.company);
    const [metadataDetection, cadExtraction, aiOcrDetection] = await Promise.all([
      detectPdmMetadata(files, { metadataExtractor: adapterProfile.metadataExtractor }),
      extractCadReferences(files, { referenceExtractor: adapterProfile.cadReferenceExtractor }),
      detectAiOcrCandidates(files)
    ]);
    return NextResponse.json({
      pdmCompany: authorization.company,
      metadataAdapterProfile: serializeMetadataAdapterProfile(adapterProfile),
      ...metadataDetection,
      candidates: aiOcrDetection.candidates,
      cadReferences: cadExtraction.references,
      warnings: [...adapterProfile.warnings, ...metadataDetection.warnings, ...cadExtraction.warnings, ...aiOcrDetection.warnings]
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "metadata_detection_failed",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 400 }
    );
  }
}
