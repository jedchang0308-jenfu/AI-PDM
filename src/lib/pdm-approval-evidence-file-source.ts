import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

/** A snapshot reference is evidence membership, not proof that an asset belongs to its company. */
export async function readApprovalEvidenceFileSource<T>(client: AsyncDatabaseClient, input: {
  fileAssetId: string;
  bindingId: string;
  companyId: string;
}): Promise<T | null> {
  return client.queryOne<T>(
    `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
            asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
            asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
            :companyId AS company_id, asset.linked_entity_type, asset.linked_entity_id,
            NULL AS workspace_id, NULL AS drawing_number_id, NULL AS part_root_id,
            NULL AS source_submission_id, NULL AS owner_user_id, NULL AS work_id
       FROM file_assets asset
      WHERE asset.id = :fileAssetId AND asset.id = :bindingId AND asset.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM numbering_candidate_revision_files candidate_file
            JOIN numbering_candidate_revision_drafts candidate
              ON candidate.id = candidate_file.candidate_revision_id
            WHERE candidate_file.source_file_asset_id = asset.id
              AND candidate_file.company_id = :companyId AND candidate.company_id = :companyId)
          OR EXISTS (SELECT 1 FROM drawing_revision_package_files package_file
            JOIN drawing_revision_packages revision_package ON revision_package.id = package_file.package_id
            WHERE package_file.source_file_asset_id = asset.id
              AND revision_package.company_id = :companyId)
          OR EXISTS (SELECT 1 FROM drawing_revision_files revision_file
            JOIN drawing_revisions revision ON revision.id = revision_file.drawing_revision_id
            WHERE revision_file.source_file_asset_id = asset.id
              AND revision_file.company_id = :companyId AND revision.company_id = :companyId)
          OR EXISTS (SELECT 1 FROM submission_files submission_file
            JOIN submissions submission ON submission.id = submission_file.submission_id
            WHERE (submission_file.source_file_asset_id = asset.id
                OR submission_file.source_master_attachment_id = asset.id)
              AND submission.company_id = :companyId)
        )`, input
  );
}
