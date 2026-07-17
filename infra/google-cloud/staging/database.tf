resource "google_sql_database_instance" "pdm" {
  count = local.create_resources ? 1 : 0

  project             = var.staging_project_id
  name                = "${local.name_prefix}-postgres"
  region              = var.region
  database_version    = var.database_version
  deletion_protection = true

  settings {
    tier                        = var.database_tier
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 20
    disk_autoresize             = true
    deletion_protection_enabled = true
    edition                     = "ENTERPRISE"
    user_labels                 = var.labels

    backup_configuration {
      enabled                        = true
      location                       = var.region
      point_in_time_recovery_enabled = true
      start_time                     = "18:00"
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.pdm[0].id
      enable_private_path_for_google_cloud_services = true
    }

    maintenance_window {
      day          = 7
      hour         = 18
      update_track = "stable"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [
    google_project_service.required,
    google_service_networking_connection.private_services
  ]
}

resource "google_sql_database" "pdm" {
  count = local.create_resources ? 1 : 0

  project  = var.staging_project_id
  name     = local.database
  instance = google_sql_database_instance.pdm[0].name
}

resource "google_sql_user" "runtime_iam" {
  count = local.create_resources ? 1 : 0

  project  = var.staging_project_id
  name     = trimsuffix(google_service_account.runtime[0].email, ".gserviceaccount.com")
  instance = google_sql_database_instance.pdm[0].name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "migration_iam" {
  count = local.create_resources ? 1 : 0

  project  = var.staging_project_id
  name     = trimsuffix(google_service_account.migration[0].email, ".gserviceaccount.com")
  instance = google_sql_database_instance.pdm[0].name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
