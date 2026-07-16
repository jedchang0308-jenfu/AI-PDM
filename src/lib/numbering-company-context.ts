import { NextResponse } from "next/server";
import {
  defaultPdmCompany,
  getUserCompanyAccessAsync,
  parsePdmCompanyCode,
  requestedPdmCompanyCodeFromRequest,
  type PdmCompanyCode,
  type PdmCompanyContext,
  type PdmCompanyResolveResult
} from "@/lib/company-context";

export function requestedNumberingCompanyCodeFromRequest(request: Request, body?: Record<string, unknown>): PdmCompanyCode | null {
  const fromBody = parsePdmCompanyCode(body?.pdm_company_code ?? body?.company_code ?? body?.pdmCompanyCode ?? body?.companyCode);
  return fromBody ?? requestedPdmCompanyCodeFromRequest(request);
}

export async function resolveNumberingCompanyContextAsync(
  userId: string,
  requestedCompanyCode: PdmCompanyCode | null
): Promise<PdmCompanyResolveResult> {
  const access = await getUserCompanyAccessAsync(userId);
  const companies = access.length > 0 ? access : [{ ...defaultPdmCompany, is_default: true }];
  const requested = requestedCompanyCode ?? (companies.find((company) => company.is_default) ?? companies[0])?.companyCode ?? null;

  if (!requested) {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_company_code_required" }, { status: 400 })
    };
  }

  const company = companies.find((item) => item.companyCode === requested);
  if (!company) {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_company_forbidden", pdm_company_code: requested }, { status: 403 })
    };
  }

  return {
    company: {
      companyId: company.companyId,
      companyCode: company.companyCode,
      displayName: company.displayName
    } satisfies PdmCompanyContext,
    response: null
  };
}
