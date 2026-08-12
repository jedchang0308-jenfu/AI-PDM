resource "google_identity_platform_config" "pdm" {
  count = local.create_resources ? 1 : 0

  project = var.staging_project_id
  authorized_domains = distinct([
    "localhost",
    "${var.staging_project_id}.firebaseapp.com",
    "${var.staging_project_id}.web.app",
    var.staging_domain
  ])
  autodelete_anonymous_users = true

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = false
    }

    phone_number {
      enabled            = false
      test_phone_numbers = {}
    }
  }

  mfa {
    state = "ENABLED"

    provider_configs {
      state = "ENABLED"

      totp_provider_config {
        adjacent_intervals = 1
      }
    }
  }

  depends_on = [google_project_service.required]
}

# Google Workspace provider enablement is deliberately not stored here because
# the provider resource persists OAuth client secrets in Terraform state.
