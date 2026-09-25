import { NextResponse } from "next/server";
import type { DbUser } from "@/lib/repositories/user-repository";
import {
  AsyncUserRepository,
  type UserCompanyAccess,
  type UserCompanyAuthority
} from "@/lib/repositories/user-async-repository";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

export type PdmCompanyCode = UserCompanyAccess["companyCode"];
export type PdmCompanyKind = "business" | "production_smoke";

export type PdmCompanyRequest =
  | { state: "absent" }
  | { state: "valid"; companyCode: PdmCompanyCode }
  | { state: "invalid" };

export type PdmCompanyContext = {
  companyId: string;
  companyCode: PdmCompanyCode;
  companyKind: PdmCompanyKind;
  displayName: string;
};

export type PdmCompanyResolveResult =
  | { company: PdmCompanyContext; response: null }
  | { company: null; response: Response };

/** Principal accounts own one workspace; historical memberships cannot expand it. */
export async function resolvePrincipalCompanyContextInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  requestedCompany: PdmCompanyRequest
): Promise<PdmCompanyResolveResult> {
  if (requestedCompany.state === "invalid") {
    return { company: null, response: Response.json({ code: "pdm_company_code_invalid" },
      { status: 400, headers: { "cache-control": "no-store" } }) };
  }
  if (verified.profile.companyId !== "company-jenfu" ||
      (requestedCompany.state === "valid" && requestedCompany.companyCode !== "JENFU")) {
    return { company: null, response: Response.json({ code: "entitlement_scope_mismatch" },
      { status: 403, headers: { "cache-control": "no-store" } }) };
  }
  const rows = await snapshot.query<{
    id: string; company_code: string; company_kind: string; display_name: string;
  }>(`
    SELECT id,company_code,company_kind,display_name
    FROM ai_pdm_core.companies WHERE id=:companyId LIMIT 2
  `, { companyId: verified.profile.companyId });
  if (rows.length !== 1 || rows[0].id !== verified.profile.companyId ||
      rows[0].company_code !== "JENFU" || rows[0].company_kind !== "business" ||
      !rows[0].display_name?.trim()) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  return { company: {
    companyId: rows[0].id, companyCode: "JENFU", companyKind: "business",
    displayName: rows[0].display_name
  }, response: null };
}

const companyCodeAliases: Record<string, PdmCompanyCode> = {
  JENFU: "JENFU",
  鉦富: "JENFU",
  MAXIMA: "MAXIMA",
  久方: "MAXIMA",
  SMOKE: "SMOKE",
  "STAGING-SMOKE": "STAGING-SMOKE"
};

export function parsePdmCompanyRequest(value: unknown): PdmCompanyRequest {
  if (value === null || value === undefined) return { state: "absent" };
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return { state: "invalid" };
  const companyCode = companyCodeAliases[normalized];
  return companyCode ? { state: "valid", companyCode } : { state: "invalid" };
}

export function parsePdmCompanyCode(value: unknown): PdmCompanyCode | null {
  const parsed = parsePdmCompanyRequest(value);
  return parsed.state === "valid" ? parsed.companyCode : null;
}

export function requestedPdmCompanyCodeFromRequest(request: Request, form?: FormData): PdmCompanyRequest {
  const formHasCompany = Boolean(form?.has("pdm_company_code") || form?.has("company_code"));
  if (formHasCompany) {
    return parsePdmCompanyRequest(form?.get("pdm_company_code") ?? form?.get("company_code"));
  }
  const url = new URL(request.url);
  if (url.searchParams.has("pdm_company_code") || url.searchParams.has("company_code")) {
    return parsePdmCompanyRequest(url.searchParams.get("pdm_company_code") ?? url.searchParams.get("company_code"));
  }
  const header = request.headers.get("x-pdm-company-code");
  return parsePdmCompanyRequest(header);
}

export async function getUserCompanyAccessAsync(userId: string): Promise<UserCompanyAccess[]> {
  const repository = new AsyncUserRepository(getAsyncDatabaseClient());
  return repository.listUserCompanyAccess(userId);
}

export async function getUserCompanyAuthorityAsync(userId: string, companyId: string): Promise<UserCompanyAuthority | null> {
  const repository = new AsyncUserRepository(getAsyncDatabaseClient());
  return repository.getUserCompanyAuthority(userId, companyId);
}

export async function serializeAuthUserAsync(user: DbUser) {
  const companies = await getUserCompanyAccessAsync(user.id);
  return {
    id: user.id,
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    default_company: companies.find((company) => company.is_default) ?? companies[0] ?? null,
    companies
  };
}

export async function resolvePdmCompanyContextAsync(
  user: DbUser,
  requestedCompany: PdmCompanyRequest | PdmCompanyCode | null
): Promise<PdmCompanyResolveResult> {
  let companies: UserCompanyAccess[];
  try {
    companies = await getUserCompanyAccessAsync(user.id);
  } catch {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_company_context_invalid" }, { status: 403 })
    };
  }
  if (companies.length === 0) {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_company_membership_required" }, { status: 403 })
    };
  }
  const normalizedRequest = normalizeCompanyRequest(requestedCompany);
  if (normalizedRequest.state === "invalid") {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_company_code_invalid" }, { status: 400 })
    };
  }
  const requested = normalizedRequest.state === "valid"
    ? normalizedRequest.companyCode
    : defaultCompanyForUser(companies);

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
      response: NextResponse.json({ error: "pdm_company_forbidden" }, { status: 403 })
    };
  }

  const smokeMembership = companies.find((item) => item.companyKind === "production_smoke");
  if (smokeMembership && (
    companies.length !== 1
    || company.companyKind !== "production_smoke"
    || company.companyId !== user.company_id
    || !company.is_default
  )) {
    return {
      company: null,
      response: NextResponse.json({ error: "pdm_smoke_principal_scope_invalid" }, { status: 403 })
    };
  }

  return {
    company: {
      companyId: company.companyId,
      companyCode: company.companyCode,
      companyKind: company.companyKind,
      displayName: company.displayName
    },
    response: null
  };
}

function normalizeCompanyRequest(requested: PdmCompanyRequest | PdmCompanyCode | null): PdmCompanyRequest {
  if (requested && typeof requested === "object" && "state" in requested) return requested;
  return requested === null ? { state: "absent" } : { state: "valid", companyCode: requested };
}

function defaultCompanyForUser(companies: UserCompanyAccess[]): PdmCompanyCode | null {
  const defaultCompany = companies.find((company) => company.is_default) ?? companies[0];
  if (!defaultCompany) return null;
  return defaultCompany.companyCode;
}
