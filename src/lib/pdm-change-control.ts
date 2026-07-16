import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  createFallbackCommandMetadata,
  createPdmCommand,
  type PdmCommandMetadata
} from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import {
  PdmChangeControlDomainService,
  type ApplyDrawingRevisionReviewActionInput,
  type DeletedPartNumberDraftListItem,
  type DraftActionInput,
  type ListPartNumberDraftsInput,
  type MarkSameSourceDraftsNeedReconfirmationInput,
  type PdmChangeControlActorContext,
  type ReservePartNumberDraftInput,
  type SubmitDrawingRevisionFffAssessmentInput,
  type UpdatePartNumberDraftInput
} from "@/lib/pdm-change-control-domain";

export type {
  ApplyDrawingRevisionReviewActionResult,
  DrawingRevisionReviewListItem,
  DrawingRevisionReviewAction,
  DrawingRevisionFffAssessmentRecord,
  DrawingRevisionFffOutcome,
  DrawingRevisionFffState,
  PartNumberControlBoundary,
  PartNumberControlBoundaryReason,
  PartNumberDraftItemType,
  PartNumberDraftListItem,
  PartNumberDraftRecord,
  PartNumberDraftStatus,
  PartNumberDraftType,
  PartNumberDraftWarningCode,
  PdmChangeControlActorContext,
  SubmitDrawingRevisionFffAssessmentResult
} from "@/lib/pdm-change-control-domain";

export type { DeletedPartNumberDraftListItem };

export { PdmChangeControlDomainService, PdmChangeControlError } from "@/lib/pdm-change-control-domain";

function service() {
  return new PdmChangeControlDomainService(getAsyncDatabaseClient());
}

export async function reservePartNumberDraft(input: ReservePartNumberDraftInput, metadata?: PdmCommandMetadata) {
  const client = getAsyncDatabaseClient();
  const commandMetadata = metadata ?? createFallbackCommandMetadata({
    pdmUserId: input.actor.userId,
    organizationId: input.actor.companyId,
    commandName: "pdm.part_draft.reserve"
  });
  const command = createPdmCommand({
    commandName: "pdm.part_draft.reserve",
    idempotencyKey: commandMetadata.idempotencyKey,
    actor: commandMetadata.actor,
    payload: {
      reservedPartNumber: input.reservedPartNumber,
      draftType: input.draftType,
      itemType: input.itemType
    }
  });
  const executed = await executePdmCommandWithOutbox({
    client,
    command,
    execute: (transactionClient) => new PdmChangeControlDomainService(transactionClient).reservePartNumberDraft(input),
    event: (draft) => ({
      aggregateType: "part_number_draft",
      aggregateId: draft.id,
      eventType: "pdm.part_draft.created.v1",
      payload: {
        draftId: draft.id,
        reservedPartNumber: draft.reservedPartNumber,
        draftType: draft.draftType,
        itemType: draft.itemType
      }
    })
  });
  return executed.result;
}

export async function listPartNumberDrafts(input: ListPartNumberDraftsInput) {
  return service().listPartNumberDrafts(input);
}

export async function listDeletedPartNumberDrafts(input: ListPartNumberDraftsInput) {
  return service().listDeletedPartNumberDrafts(input);
}

export async function updatePartNumberDraft(input: UpdatePartNumberDraftInput) {
  return service().updatePartNumberDraft(input);
}

export async function submitDrawingRevisionFffAssessment(input: SubmitDrawingRevisionFffAssessmentInput) {
  return service().submitDrawingRevisionFffAssessment(input);
}

export async function applyDrawingRevisionReviewAction(input: ApplyDrawingRevisionReviewActionInput) {
  return service().applyDrawingRevisionReviewAction(input);
}

export async function listPendingDrawingRevisionReviews(actor: PdmChangeControlActorContext) {
  return service().listPendingDrawingRevisionReviews(actor);
}

export async function getPartNumberControlBoundary(draftId: string, actor: PdmChangeControlActorContext) {
  return service().getPartNumberControlBoundary(draftId, actor);
}

export async function assertPartNumberDraftIsRecyclable(draftId: string, actor: PdmChangeControlActorContext) {
  return service().assertPartNumberDraftIsRecyclable(draftId, actor);
}

export async function assertPartNumberDraftCanSubmit(draftId: string, actor: PdmChangeControlActorContext) {
  return service().assertPartNumberDraftCanSubmit(draftId, actor);
}

export async function voidPartNumberDraft(input: DraftActionInput) {
  return service().voidPartNumberDraft(input);
}

export async function recyclePartNumberDraft(input: DraftActionInput) {
  return service().recyclePartNumberDraft(input);
}

export async function restorePartNumberDraft(input: DraftActionInput) {
  return service().restorePartNumberDraft(input);
}

export async function getPartNumberDraftLifecyclePolicy(input: DraftActionInput) {
  return service().getPartNumberDraftLifecyclePolicy(input);
}

export async function markSameSourceDraftsNeedReconfirmation(input: MarkSameSourceDraftsNeedReconfirmationInput) {
  return service().markSameSourceDraftsNeedReconfirmation(input);
}

export async function reconfirmPartNumberDraft(input: DraftActionInput) {
  return service().reconfirmPartNumberDraft(input);
}

export async function submitPartNumberDraft(input: DraftActionInput) {
  return service().submitPartNumberDraft(input);
}
