resource "google_identity_platform_config" "pdm" {
  count = local.create_resources ? 1 : 0

  project = var.production_project_id
  authorized_domains = distinct(concat(
    [
      "${var.production_project_id}.firebaseapp.com",
      var.production_domain
    ],
    var.enable_firebase_hosting_gateway ? ["${var.production_project_id}.web.app"] : []
  ))
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

# Google Workspace provider credentials stay outside Terraform because the
# provider resource would persist its OAuth client secret in Terraform state.
