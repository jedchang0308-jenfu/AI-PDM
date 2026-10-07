# DEV-122 approved additive prebuild absence readback; no Build execution authority.
resource "google_project_iam_custom_role" "prebuild_list_readback" {
  project     = "jenfu-platform-prod"
  role_id     = "aipdmDev122PrebuildList"
  title       = "AI-PDM prebuild absence readback"
  description = "List Cloud Build records for fresh prebuild abort absence checks"
  permissions = ["cloudbuild.builds.list", "serviceusage.services.use"]
  lifecycle { prevent_destroy = true }
}

resource "google_project_iam_member" "verifier_prebuild_list_readback" {
  depends_on = [google_project_iam_custom_role.prebuild_list_readback]
  project    = "jenfu-platform-prod"
  role       = "projects/jenfu-platform-prod/roles/aipdmDev122PrebuildList"
  member     = "serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
