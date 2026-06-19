import { NextResponse } from "next/server";
import type { DbUser } from "@/lib/repositories/user-repository";
import { AsyncUserRepository, type UserCompanyAccess } from "@/lib/repositories/user-async-repository";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";

export type PdmCompanyCode = "JENFU" | "MAXIMA";

export type PdmCompanyContext = {
  companyId: string;
  companyCode: PdmCompanyCode;
  displayName: string;
};

export type PdmCompanyResolveResult =
  | { company: PdmCompanyContext; response: null }
  | { company: null; response: Response };

const companyCodeAliases: Record<string, PdmCompanyCode> = {
  JENFU: "JENFU",
  鉦富: "JENFU",
  MAXIMA: "MAXIMA",
  久方: "MAXIMA"
};

export const defaultPdmCompany: PdmCompanyContext = {
  companyId: "company-jenfu",
  companyCode: "JENFU",
  displayName: "鉦富"
};

export function parsePdmCompanyCode(value: unknown): PdmCompanyCode | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return companyCodeAliases[normalized] ?? null;
}

export function requestedPdmCompanyCodeFromRequest(request: Request, form?: FormData): PdmCompanyCode | null {
  const fromForm = parsePdmCompanyCode(form?.get("pdm_company_code") ?? form?.get("company_code"));
  if (fromForm) return fromForm;
  const url = new URL(request.url);
  const fromQuery = parsePdmCompanyCode(url.searchParams.get("pdm_company_code") ?? url.searchParams.get("company_code"));
  if (fromQuery) return fromQuery;
  return parsePdmCompanyCode(request.headers.get("x-pdm-company-code"));
}

export async function getUserCompanyAccessAsync(userId: string): Promise<UserCompanyAccess[]> {
  const repository = new AsyncUserRepository(getAsyncDatabaseClient());
  return repository.listUserCompanyAccess(userId);
}

export async function serializeAuthUserAsync(user: DbUser) {
  const companies = await getUserCompanyAccessAsync(user.id);
  return {
    id: user.id,
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    default_company: companies.find((company) => company.is_default) ?? companies[0] ?? defaultPdmCompany,
    companies
  };
}

export async function resolvePdmCompanyContextAsync(
  user: DbUser,
  requestedCompanyCode: PdmCompanyCode | null
): Promise<PdmCompanyResolveResult> {
  const access = await getUserCompanyAccessAsync(user.id);
  const companies = access.length > 0 ? access : [{ ...defaultPdmCompany, is_default: true }];
  const requested = requestedCompanyCode ?? defaultCompanyForUser(user, companies);

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
    },
    response: null
  };
}

function defaultCompanyForUser(user: DbUser, companies: UserCompanyAccess[]): PdmCompanyCode | null {
  const defaultCompany = companies.find((company) => company.is_default) ?? companies[0];
  if (!defaultCompany) return null;
  void user;
  return defaultCompany.companyCode;
}
