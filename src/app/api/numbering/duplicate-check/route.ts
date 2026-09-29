import { NextResponse } from "next/server";
import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withPrincipalCompanyWrite(request,
    "src/app/api/numbering/duplicate-check/route.ts", "numbering.duplicate_check",
    async (snapshot, company, verified) => {
      const body = await request.json().catch(() => ({}));
      const input = {
        companyId: company.companyId,
        rootCode: optionalString(body.rootCode ?? body.root_code),
        coreName: optionalString(body.coreName ?? body.core_name),
        partNumber: optionalString(body.partNumber ?? body.part_number),
        partName: optionalString(body.partName ?? body.part_name),
        drawingNumber: optionalString(body.drawingNumber ?? body.drawing_number),
        // The historical FK remains a domain profile link; only the verified
        // session below can supply the security subject of the audit event.
        createdBy: verified.profile.pdmUserId
      };
      if (!input.rootCode && !input.coreName && !input.partNumber &&
          !input.partName && !input.drawingNumber) {
        return NextResponse.json({ error: "At least one numbering check field is required" },
          { status: 400 });
      }
      const result = await new AsyncNumberingRepository(snapshot).checkNumberingDuplicates(input, {
        principalId: verified.session.principalId,
        profileVersion: verified.session.profileVersion
      });
      return NextResponse.json({ ...result, pdmCompany: company },
        { headers: { "cache-control": "private, no-store" } });
    });
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
