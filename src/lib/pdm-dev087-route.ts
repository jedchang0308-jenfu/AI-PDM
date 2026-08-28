import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { canonicalErrorEnvelope } from "@/lib/pdm-canonical-workbench-contract";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";

export async function resolveDev087RouteActor(request: Request, page: "numbering.drawings.view" | "numbering.search" | "numbering.approvals") {
  const auth = await requireNumberingPageAsync(request, page);
  if (auth.response) return { response: auth.response, actor: null };
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return { response: company.response, actor: null };
  const [create, update, submit, cancel, decide, obsolete, draftUpdate, manageAttachments] = await Promise.all([
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.create"),
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.submit"),
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.cancel"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.decide"),
    canUserUseNumberingActionAsync(auth.user, "numbering.draft.obsolete"),
    canUserUseNumberingActionAsync(auth.user, "numbering.draft.update"),
    canUserUseNumberingActionAsync(auth.user, "numbering.attachments.manage")
  ]);
  return {
    response: null,
    actor: {
      id: auth.user.id,
      companyId: company.company.companyId,
      canEditNonOwned: hasPdmNonOwnerEditScope({ role: auth.user.role }),
      permissions: {
        create: create.allowed && (page !== "numbering.drawings.view" || draftUpdate.allowed),
        update: update.allowed && (page !== "numbering.drawings.view" || draftUpdate.allowed),
        submit: submit.allowed,
        cancel: cancel.allowed,
        decide: decide.allowed,
        obsolete: obsolete.allowed,
        manageAttachments: manageAttachments.allowed
      }
    }
  };
}

/** DEV-090 page-neutral matrix read/edit guard. A matrix is shown from both
 * Drawing and Part drawers, so neither workbench page may become the hidden
 * authority for access. */
export async function resolveRelationMatrixActor(request: Request) {
  let auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response?.status === 403) auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return { response: auth.response, actor: null };
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return { response: company.response, actor: null };
  const update = await canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update");
  return {
    response: null,
    actor: {
      id: auth.user.id,
      companyId: company.company.companyId,
      canEditNonOwned: hasPdmNonOwnerEditScope({ role: auth.user.role }),
      canEditMatrix: update.allowed
    }
  };
}

export function canonicalActorFromRoute(actor: NonNullable<Awaited<ReturnType<typeof resolveDev087RouteActor>>["actor"]>) {
  return {
    id: actor.id,
    companyId: actor.companyId,
    canEditNonOwned: actor.canEditNonOwned,
    permissions: {
      createWork: actor.permissions.create,
      updateWork: actor.permissions.update,
      submitWork: actor.permissions.submit,
      cancelWork: actor.permissions.cancel,
      decideReview: actor.permissions.decide,
      obsoleteDrawing: actor.permissions.obsolete,
      obsoleteFormal: actor.permissions.obsolete,
      manageAttachments: actor.permissions.manageAttachments
    }
  };
}

export function dev087CommandContext(request: Request) {
  const raw = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "").trim() ?? "";
  const expectedRowVersion = Number.parseInt(raw, 10);
  if (!Number.isFinite(expectedRowVersion) || expectedRowVersion < 1) throw new Error("DEV087_IF_MATCH_REQUIRED");
  return {
    idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    contractToken: request.headers.get("x-pdm-workbench-contract")?.trim() ?? "",
    expectedRowVersion,
    correlationId: request.headers.get("x-correlation-id")?.trim() || undefined
  };
}

export async function dev087Json(request: Request) {
  try { return await request.json() as Record<string, unknown>; }
  catch { return {}; }
}

export function dev087RouteError(error: unknown) {
  if (error instanceof Error && error.message === "DEV087_IF_MATCH_REQUIRED") {
    return NextResponse.json({ error: { code: "WORKBENCH_BAD_REQUEST", message: "缺少有效的 If-Match", correlationId: crypto.randomUUID() } }, { status: 400 });
  }
  const resolved = canonicalErrorEnvelope(error);
  return NextResponse.json(resolved.body, { status: resolved.status, headers: { "cache-control": "private, no-store" } });
}

export function dev087Success<T>(data: T, correlationId = crypto.randomUUID()) {
  return NextResponse.json({ data, meta: { correlationId } }, { headers: { "cache-control": "private, no-store" } });
}
