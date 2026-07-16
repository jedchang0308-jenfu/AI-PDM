import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  EmployeeLoginAliasAsyncRepository,
  EmployeeLoginAliasError,
  type EmployeeLoginAlias
} from "@/lib/repositories/employee-login-alias-async-repository";

export { EmployeeLoginAliasError };
export type { EmployeeLoginAlias };

function rateLimitPepper() {
  const value = String(
    process.env.PDM_EMPLOYEE_LOGIN_RATE_LIMIT_PEPPER ??
      process.env.PDM_SESSION_CURRENT_SECRET ??
      process.env.PDM_AUTH_SECRET ??
      ""
  ).trim();
  if (value.length < 32) throw new Error("EMPLOYEE_LOGIN_RATE_LIMIT_PEPPER_REQUIRED");
  return value;
}

function repository() {
  return new EmployeeLoginAliasAsyncRepository(getAsyncDatabaseClient(), { rateLimitPepper: rateLimitPepper() });
}

export function getEmployeeLoginCompanyId() {
  return String(process.env.PDM_DEFAULT_COMPANY_ID ?? "company-jenfu").trim() || "company-jenfu";
}

export async function createEmployeeLoginAliasAsync(input: {
  actorId: string;
  actorCompanyId: string;
  pdmUserId: string;
  alias: string;
  reason: string;
}): Promise<EmployeeLoginAlias> {
  return repository().createAlias(input);
}

export async function retireEmployeeLoginAliasAsync(input: {
  actorId: string;
  actorCompanyId: string;
  pdmUserId: string;
  aliasId: string;
  rowVersion: number;
  reason: string;
}): Promise<EmployeeLoginAlias> {
  return repository().retireAlias(input);
}

export async function issueEmployeeLoginIntentAsync(input: {
  identifier: string;
  clientKey: string;
  returnPath?: string;
}) {
  return repository().issueIntent({ companyId: getEmployeeLoginCompanyId(), ...input });
}

export async function consumeEmployeeLoginIntentAsync(input: {
  intentToken: string;
  pdmUserId: string;
  companyId: string;
}) {
  return repository().consumeIntent(input);
}
