"use client";

import { CanonicalChangeWorkspace } from "@/components/canonical-change-workspace";
import { CanonicalDrawingChangeWorkspace, type DrawingWorkspacePayload } from "@/components/canonical-drawing-change-workspace";
import type { ReviewPackageTarget } from "@/lib/pdm-review-package-contract";

function text(value: string | null) { return value || undefined; }

/**
 * The only review-package adapter allowed to translate immutable evidence into
 * the domain workspaces. It owns no fetch, navigation or decision behavior.
 */
export function CanonicalReviewTargetWorkspace({ target, requestId, returnTo, rowVersion, actions }: {
  target: ReviewPackageTarget;
  requestId: string;
  returnTo: string;
  rowVersion: number;
  actions: Array<{ key: "approve" | "return_for_correction"; label: string }>;
}) {
  const snapshot = target.workspace;
  if (snapshot.kind === "drawing") {
    const initialData = {
      entityType: "drawing" as const,
      entityId: snapshot.entityId,
      workId: null,
      revisionId: text(snapshot.revisionId),
      revision: text(snapshot.identity.revision),
      rowVersion,
      payload: snapshot.payload,
      readonly: true,
      identity: { code: snapshot.identity.code, name: text(snapshot.identity.name) },
      recognition: snapshot.recognition as DrawingWorkspacePayload["recognition"],
      files: snapshot.files.map((file) => ({
        id: file.bindingId || file.id,
        source_file_asset_id: text(file.sourceFileAssetId),
        display_name: text(file.displayName),
        file_name: text(file.fileName),
        role: text(file.role),
        mime_type: text(file.mimeType),
        file_size: file.fileSize ?? undefined,
        is_primary: file.isPrimary,
        current_revision_upload: file.currentRevisionUpload
      })),
      changeImpactRequired: Boolean(snapshot.changeImpactRequired),
      relatedParts: snapshot.relatedParts ?? [],
      affectedParts: snapshot.affectedParts ?? [],
      interaction: { mode: "review_decide" as const, basisState: "current" as const, canMutateContent: false, canSubmit: false, canCancel: false, canApprove: true, canReturn: true, reasonCode: null }
    } satisfies DrawingWorkspacePayload;
    return <CanonicalDrawingChangeWorkspace initialData={initialData} reviewRequestId={requestId} returnTo={returnTo} snapshotMode suppressFooter embedded fileReadContext="review_package" />;
  }

  return <CanonicalChangeWorkspace
    entityType="part"
    entityId={snapshot.entityId}
    reviewRequestId={requestId}
    returnTo={returnTo}
    initialData={{
      entityType: "part",
      entityId: snapshot.entityId,
      workId: null,
      rowVersion,
      payload: snapshot.payload,
      readonly: true,
      identity: { code: snapshot.identity.code, name: text(snapshot.identity.name) },
      attachments: snapshot.attachments.map((file) => ({
        id: file.id,
        source_file_asset_id: file.sourceFileAssetId,
        binding_id: file.bindingId,
        file_name: file.fileName,
        display_name: file.displayName,
        role: file.role,
        mime_type: file.mimeType,
        file_size: file.fileSize
      })),
      reviewScope: "included",
      actions
    }}
    suppressFooter
    embedded
    fileReadContext="review_package"
  />;
}
