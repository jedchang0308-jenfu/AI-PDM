import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { detectAiOcrCandidates } from "@/lib/ai-ocr-adapter";
import { extractCadReferences } from "@/lib/cad-extraction";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { resolveMetadataAdapterProfile, serializeMetadataAdapterProfile } from "@/lib/metadata-adapter-profile";
import { detectPdmMetadata } from "@/lib/pdm-metadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData();
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request, form));
  if (companyResult.response) return companyResult.response;

  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "files_required" }, { status: 400 });
  }

  try {
    const adapterProfile = resolveMetadataAdapterProfile(companyResult.company);
    const [metadataDetection, cadExtraction, aiOcrDetection] = await Promise.all([
      detectPdmMetadata(files, { metadataExtractor: adapterProfile.metadataExtractor }),
      extractCadReferences(files, { referenceExtractor: adapterProfile.cadReferenceExtractor }),
      detectAiOcrCandidates(files)
    ]);
    return NextResponse.json({
      pdmCompany: companyResult.company,
      metadataAdapterProfile: serializeMetadataAdapterProfile(adapterProfile),
      ...metadataDetection,
      candidates: aiOcrDetection.candidates,
      cadReferences: cadExtraction.references,
      warnings: [...adapterProfile.warnings, ...metadataDetection.warnings, ...cadExtraction.warnings, ...aiOcrDetection.warnings]
    });
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
