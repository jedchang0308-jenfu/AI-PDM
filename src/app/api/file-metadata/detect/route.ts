import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { detectAiOcrCandidates } from "@/lib/ai-ocr-adapter";
import { extractCadReferences } from "@/lib/cad-extraction";
import { detectPdmMetadata } from "@/lib/pdm-metadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "至少需要一個檔案" }, { status: 400 });
  }

  try {
    const [metadataDetection, cadExtraction, aiOcrDetection] = await Promise.all([
      detectPdmMetadata(files),
      extractCadReferences(files),
      detectAiOcrCandidates(files)
    ]);
    return NextResponse.json({
      ...metadataDetection,
      candidates: aiOcrDetection.candidates,
      cadReferences: cadExtraction.references,
      warnings: [...metadataDetection.warnings, ...cadExtraction.warnings, ...aiOcrDetection.warnings]
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "中繼資料偵測失敗",
        detail: error instanceof Error ? error.message : "未知錯誤"
      },
      { status: 400 }
    );
  }
}
