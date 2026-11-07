mock_provider "google" {}

variables {
  attempt = {
    source_revision          = strrev("0123456789abcdef0123456789abcdef01234567")
    image_digest             = "asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-masked-local-snapshot@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    snapshot_id              = "PDM-MASKED-20261107-1"
    recipient_public_key_b64 = join("", [for i in range(720) : "A"])
    recipient_key_id         = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    catalog_shape_sha256     = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    starts_at                = "2026-11-07T10:00:00Z"
    expires_at               = "2026-11-07T12:00:00Z"
  }
}

run "fixed_job_and_object" {
  command = plan

  assert {
    condition = (
      google_cloud_run_v2_job.snapshot.name == "ai-pdm-prod-masked-local-snapshot" &&
      google_cloud_run_v2_job.snapshot.project == "jenfu-platform-prod" &&
      google_cloud_run_v2_job.snapshot.template[0].task_count == 1 &&
      google_cloud_run_v2_job.snapshot.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.snapshot.template[0].template[0].containers[0].image == var.attempt.image_digest &&
      toset(keys(google_cloud_run_v2_job_iam_member.workflow)) == toset(["roles/run.invoker", "roles/run.viewer"])
    )
    error_message = "The workflow must only run and read the pinned snapshot job."
  }

  assert {
    condition = (
      google_storage_bucket_iam_member.ciphertext_reader.role == "roles/storage.objectViewer" &&
      google_storage_bucket_iam_member.ciphertext_creator.role == "roles/storage.objectCreator" &&
      google_storage_bucket_iam_member.ciphertext_reader.condition[0].expression == google_storage_bucket_iam_member.ciphertext_creator.condition[0].expression &&
      strcontains(google_storage_bucket_iam_member.ciphertext_reader.condition[0].expression, "resource.name == 'projects/_/buckets/jenfu-platform-prod-aipdm-release/objects/source/migration-bundles/data-cutover/masked-local-snapshots/PDM-MASKED-20261107-1/snapshot.encrypted.json'") &&
      strcontains(google_storage_bucket_iam_member.ciphertext_reader.condition[0].expression, "request.time < timestamp('2026-11-07T12:00:00Z')")
    )
    error_message = "The storage bindings must match one object and expire."
  }

  assert {
    condition = (
      google_service_account_iam_member.workflow.member == "principal://iam.googleapis.com/projects/9536592944/locations/global/workloadIdentityPools/aipdm-dev128-snapshot-v5/subject/aipdm-dev128-snapshot-v5" &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_id == '1260972060'") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.workflow_sha == '${var.attempt.source_revision}'") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.run_attempt == '1'")
    )
    error_message = "The dedicated invoker must accept only the reviewed workflow identity."
  }
}

run "reject_long_window" {
  command = plan

  variables {
    attempt = merge(var.attempt, { expires_at = "2026-11-07T12:00:01Z" })
  }

  expect_failures = [var.attempt]
}
