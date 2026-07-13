import { NextResponse } from "next/server";
import type { DbUser } from "@/lib/db";
import { requireRoleAsync } from "@/lib/auth-async";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import { TransferPackageError, type TransferPackageActor } from "@/lib/transfer-packages";
import type { PdmCompanyContext } from "@/lib/company-context";

export type TransferPackageApiAccess =
  | { user: DbUser; company: PdmCompanyContext; actor: TransferPackageActor; response: null }
  | { user: null; company: null; actor: null; response: Response };

export async function requireTransferPackageAccessAsync(
  request: Request,
  body?: Record<string, unknown>
): Promise<TransferPackageApiAccess> {
  const auth = await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response || !auth.user) {
    return { user: null, company: null, actor: null, response: auth.response };
  }
  const company = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request, body)
  );
  if (company.response || !company.company) {
    return { user: null, company: null, actor: null, response: company.response };
  }
  return {
    user: auth.user,
    company: company.company,
    actor: {
      userId: auth.user.id,
      companyId: company.company.companyId,
      role: auth.user.role
    },
    response: null
  };
}

export function transferPackageErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TransferPackageError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: "TRANSFER_PACKAGE_INTERNAL", message: fallback }, { status: 500 });
}
