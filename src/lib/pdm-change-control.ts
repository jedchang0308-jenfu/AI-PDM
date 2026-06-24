import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  PdmChangeControlDomainService,
  type DraftActionInput,
  type ListPartNumberDraftsInput,
  type MarkSameSourceDraftsNeedReconfirmationInput,
  type PdmChangeControlActorContext,
  type ReservePartNumberDraftInput,
  type SubmitDrawingRevisionFffAssessmentInput,
  type UpdatePartNumberDraftInput
} from "@/lib/pdm-change-control-domain";

export type {
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

export { PdmChangeControlDomainService, PdmChangeControlError } from "@/lib/pdm-change-control-domain";

function service() {
  return new PdmChangeControlDomainService(getAsyncDatabaseClient());
}

export async function reservePartNumberDraft(input: ReservePartNumberDraftInput) {
  return service().reservePartNumberDraft(input);
}

export async function listPartNumberDrafts(input: ListPartNumberDraftsInput) {
  return service().listPartNumberDrafts(input);
}

export async function updatePartNumberDraft(input: UpdatePartNumberDraftInput) {
  return service().updatePartNumberDraft(input);
}

export async function submitDrawingRevisionFffAssessment(input: SubmitDrawingRevisionFffAssessmentInput) {
  return service().submitDrawingRevisionFffAssessment(input);
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

export async function markSameSourceDraftsNeedReconfirmation(input: MarkSameSourceDraftsNeedReconfirmationInput) {
  return service().markSameSourceDraftsNeedReconfirmation(input);
}

export async function reconfirmPartNumberDraft(input: DraftActionInput) {
  return service().reconfirmPartNumberDraft(input);
}

export async function submitPartNumberDraft(input: DraftActionInput) {
  return service().submitPartNumberDraft(input);
}
