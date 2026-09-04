import {
  parsePdmCompanyRequest,
  requestedPdmCompanyCodeFromRequest,
  resolvePdmCompanyContextAsync,
  type PdmCompanyRequest,
  type PdmCompanyResolveResult
} from "@/lib/company-context";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";

export function requestedNumberingCompanyCodeFromRequest(request: Request, body?: Record<string, unknown>): PdmCompanyRequest {
  const bodyKeys = ["pdm_company_code", "company_code", "pdmCompanyCode", "companyCode"] as const;
  const bodyKey = bodyKeys.find((key) => Object.prototype.hasOwnProperty.call(body ?? {}, key));
  if (bodyKey) return parsePdmCompanyRequest(body?.[bodyKey]);
  return requestedPdmCompanyCodeFromRequest(request);
}

export async function resolveNumberingCompanyContextAsync(
  userId: string,
  requestedCompany: PdmCompanyRequest
): Promise<PdmCompanyResolveResult> {
  const user = await new AsyncUserRepository(getAsyncDatabaseClient()).getUserById(userId);
  if (!user) return { company: null, response: Response.json({ error: "platform_actor_required" }, { status: 401 }) };
  return resolvePdmCompanyContextAsync(user, requestedCompany);
}
