mock_provider "google" {}

variables {
  attempt = {
    source_revision = strrev("0123456789abcdef0123456789abcdef01234567")
    starts_at       = "2026-11-07T10:00:00Z"
    expires_at      = "2026-11-07T12:00:00Z"
  }
}

run "fixed_builder_workflow" {
  command = plan

  assert {
    condition = (
      google_iam_workload_identity_pool.builder.workload_identity_pool_id == "aipdm-dev128-builder-v5" &&
      google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id == "github" &&
      google_service_account_iam_member.workflow.service_account_id == "projects/jenfu-platform-prod/serviceAccounts/aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com" &&
      google_service_account_iam_member.workflow.role == "roles/iam.workloadIdentityUser" &&
      google_service_account_iam_member.workflow.member == "principal://iam.googleapis.com/projects/9536592944/locations/global/workloadIdentityPools/aipdm-dev128-builder-v5/subject/aipdm-dev128-builder-v5"
    )
    error_message = "The builder identity must be dedicated and may only impersonate the existing builder."
  }

  assert {
    condition = (
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_id == '1260972060'") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "build-ai-pdm-masked-local-snapshot.yml@refs/heads/main") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.workflow_sha == '${var.attempt.source_revision}'") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.environment == 'production'") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.run_attempt == '1'") &&
      google_service_account_iam_member.workflow.condition[0].expression == "request.time >= timestamp('2026-11-07T10:00:00Z') && request.time < timestamp('2026-11-07T12:00:00Z')"
    )
    error_message = "The builder must accept only the reviewed workflow, source and time window."
  }
}

run "reject_long_window" {
  command = plan

  variables {
    attempt = merge(var.attempt, { expires_at = "2026-11-07T12:00:01Z" })
  }

  expect_failures = [var.attempt]
}
