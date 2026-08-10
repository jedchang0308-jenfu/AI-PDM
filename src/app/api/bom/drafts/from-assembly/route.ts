import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canCreateBomDraftAsync, resolveBomOwnerAccessContextAsync } from "@/lib/bom-create-context";
import { BomCreateIdempotencyConflictError, BomRevisionConflictError, createCanonicalBomDraftAsync } from "@/lib/bom-workbench-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { validateRevisionCode } from "@/lib/revision-policy";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

type RequestBody = {
  submissionId?: unknown;
  ownerPartNumberId?: unknown;
  bomRevision?: unknown;
  draftName?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }
  const bomRevision = typeof body.bomRevision === "string" ? body.bomRevision.trim() : "";
  if (!bomRevision) {
    return NextResponse.json(
      { error: "bomRevision is required; use POST /api/bom/drafts for canonical BOM creation" },
      { status: 422 }
    );
  }
  const revisionError = validateRevisionCode(bomRevision, { lifecycleStage: "release_area" });
  if (revisionError) return NextResponse.json({ error: revisionError }, { status: 422 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || textValue(body.idempotencyKey);
  if (!idempotencyKey) return NextResponse.json({ error: "BOM_CREATE_FIELDS_REQUIRED" }, { status: 422 });

  const submission = await getSubmissionAsync(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const companyId = submission.company_id || auth.user.company_id;
  const requestedOwnerPartNumberId = textValue(body.ownerPartNumberId);
  const ownerRows = await getAsyncDatabaseClient().query<{ id: string }>(
    `
      SELECT DISTINCT pn.id
      FROM part_numbers pn
      JOIN items i ON i.id = :itemId
      LEFT JOIN submission_part_scopes sps
        ON sps.submission_id = :submissionId
       AND sps.part_number_id = pn.id
      WHERE pn.company_id = :companyId
        AND (
          (:requestedOwnerPartNumberId <> '' AND pn.id = :requestedOwnerPartNumberId)
          OR (
            :requestedOwnerPartNumberId = ''
            AND (
              sps.part_number_id IS NOT NULL
              OR (
                NOT EXISTS (SELECT 1 FROM submission_part_scopes any_scope WHERE any_scope.submission_id = :submissionId)
                AND upper(pn.part_number) = upper(i.part_number)
              )
            )
          )
        )
    `,
    {
      itemId: submission.item_id,
      submissionId,
      companyId,
      requestedOwnerPartNumberId
    }
  );
  if (ownerRows.length !== 1) {
    return NextResponse.json({ error: "BOM_OWNER_PART_NUMBER_REQUIRED", candidateCount: ownerRows.length }, { status: 422 });
  }
  const ownerPartNumberId = ownerRows[0].id;
  const accessInput = { user: auth.user, companyId, ownerPartNumberId, sourceSubmissionId: submissionId };
  if (!(await canCreateBomDraftAsync(accessInput))) return forbidden();
  const owner = await resolveBomOwnerAccessContextAsync(accessInput);
  if (!owner) return NextResponse.json({ error: "BOM_OWNER_NOT_FOUND" }, { status: 404 });

  const draftName = textValue(body.draftName);
  const requestFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({ ownerPartNumberId, bomRevision, source: "cad_reference", sourceSubmissionId: submissionId, draftName }))
    .digest("hex");
  try {
    const result = await createCanonicalBomDraftAsync({
      companyId: owner.companyId,
      ownerPartNumberId: owner.ownerPartNumberId,
      ownerPartNumber: owner.partNumber,
      legacyItemId: owner.legacyItemId,
      bomRevision,
      source: "cad_reference",
      sourceSubmissionId: submissionId,
      actorId: auth.user.id,
      idempotencyKey,
      requestFingerprint,
      draftName: draftName || undefined
    });
    return NextResponse.json(
      {
        ...result,
        draftId: result.draft.id,
        ownerPartNumberId: result.draft.owner_part_number_id,
        bomRevision: result.draft.bom_revision,
        source: result.draft.source,
        receipt: { idempotencyKey, replayed: result.replayed },
        workbenchUrl: `/bom/workbench?draftId=${encodeURIComponent(result.draft.id)}`
      },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof BomCreateIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BomRevisionConflictError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_CREATE_FAILED" }, { status: 400 });
  }
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
