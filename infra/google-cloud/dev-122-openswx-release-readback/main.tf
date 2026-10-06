# DEV-122 approved additive release readback; no runtime or execution authority.
resource "google_project_iam_custom_role" "verifier_job_readback" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmOpenswxVerifierJobReadback"
  title       = "AI-PDM OpenSWX release verifier Job readback"
  permissions = ["run.jobs.get", "run.executions.list"]
  lifecycle { prevent_destroy = true }
}
resource "google_cloud_run_v2_job_iam_member" "verifier_readback" {
  project  = "jenfu-platform-prod"
  location = "asia-east1"
  name     = "ai-pdm-prod-openswx-metadata"
  depends_on = [google_project_iam_custom_role.verifier_job_readback]
  role     = "projects/jenfu-platform-prod/roles/aipdmOpenswxVerifierJobReadback"
  member   = "serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
resource "google_project_iam_custom_role" "release_scheduler_readback" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmOpenswxSchedulerReadback"
  title       = "AI-PDM release Scheduler configuration readback"
  permissions = ["cloudscheduler.jobs.get"]
  lifecycle { prevent_destroy = true }
}
resource "google_project_iam_member" "verifier_scheduler_readback" {
  depends_on = [google_project_iam_custom_role.release_scheduler_readback]
  project = "jenfu-platform-prod"
  role    = "projects/jenfu-platform-prod/roles/aipdmOpenswxSchedulerReadback"
  member  = "serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
resource "google_project_iam_member" "deployer_scheduler_readback" {
  depends_on = [google_project_iam_custom_role.release_scheduler_readback]
  project = "jenfu-platform-prod"
  role    = "projects/jenfu-platform-prod/roles/aipdmOpenswxSchedulerReadback"
  member  = "serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
