import "server-only";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { RevisionHistorySource } from "@/lib/revision-policy";

type ControlledRevisionRow = {
  revision: string;
  lifecycle_state: string;
  created_at: string;
  updated_at: string;
  released_at: string | null;
};

export async function listControlledDrawingRevisionHistoryAsync(
  client: AsyncDatabaseClient,
  companyId: string,
  drawingNumber: string
): Promise<RevisionHistorySource[]> {
  const rows = await client.query<ControlledRevisionRow>(
    `SELECT revision.revision, revision.lifecycle_state, revision.created_at, revision.updated_at, revision.released_at
     FROM drawing_revisions revision
     JOIN drawings drawing ON drawing.id = revision.drawing_id AND drawing.company_id = revision.company_id
     LEFT JOIN drawing_revision_packages package ON package.id = revision.source_revision_package_id
     LEFT JOIN submissions submission ON submission.id = package.source_submission_id
     WHERE revision.company_id = :companyId
       AND drawing.drawing_number = :drawingNumber
       AND revision.lifecycle_state <> 'cancelled'
       AND COALESCE(submission.status, '') NOT IN ('Cancelled', 'Rejected')
       AND NOT EXISTS (
         SELECT 1
         FROM drawing_revision_fff_assessments assessment
         JOIN review_confirmation_events confirmation ON confirmation.review_id = assessment.id
         WHERE assessment.submission_id = submission.id
           AND confirmation.action IN ('return_for_replacement_part', 'request_more_information')
       )
     ORDER BY revision.created_at ASC, revision.id ASC`,
    { companyId, drawingNumber }
  );
  return rows.map((row) => ({
    revision: row.revision,
    status: controlledRevisionHistoryStatus(row.lifecycle_state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    releasedAt: row.released_at
  }));
}

function controlledRevisionHistoryStatus(lifecycleState: string) {
  switch (lifecycleState) {
    case "released":
      return "Released";
    case "superseded":
      return "Obsolete";
    case "rd_controlled":
      return "ReviewApproved";
    case "in_review":
      return "Pending";
    case "correction_required":
      return "Rejected";
    default:
      return "Draft";
  }
}
