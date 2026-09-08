data "google_service_account" "migrator" {
  project    = var.project_id
  account_id = var.migration_service_account_id
}
resource "google_storage_bucket_iam_member" "migrator_bundle_viewer" {
  count  = var.incident_runtime_enabled ? 1 : 0
  bucket = google_storage_bucket.release.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${data.google_service_account.migrator.email}"
  condition {
    title      = "aipdm-migrator-bundle-viewer"
    expression = "resource.name.startsWith('projects/_/buckets/${var.release_bucket_name}/objects/source/migration-bundles/')"
  }
}

resource "google_storage_bucket_iam_member" "migrator_receipts_creator" {
  count  = var.incident_runtime_enabled ? 1 : 0
  bucket = google_storage_bucket.release.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${data.google_service_account.migrator.email}"
  condition {
    title      = "aipdm-migrator-receipts-creator"
    expression = "resource.name.startsWith('${local.receipt_prefix}')"
  }
}

resource "google_cloud_run_v2_job" "migration" {
  count = var.incident_runtime_enabled ? 1 : 0

  project             = var.project_id
  location            = var.region
  name                = "ai-pdm-prod-migration-runner"
  deletion_protection = true
  labels              = merge(local.labels, { component = "migration-runner" })

  template {
    parallelism = 1
    task_count  = 1
    template {
      service_account       = data.google_service_account.migrator.email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 0

      containers {
        name  = "migration"
        image = var.migration_runner_image_digest
        args  = ["--bundle-ref-required"]
        env {
          name  = "OWNER_APPLICATION_ID"
          value = "ai-pdm"
        }
        env {
          name  = "RELEASE_BUCKET"
          value = var.release_bucket_name
        }
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }
        env {
          name  = "GOOGLE_CLOUD_REGION"
          value = var.region
        }
        env {
          name  = "CLOUD_SQL_INSTANCE_CONNECTION_NAME"
          value = var.cloud_sql_connection_name
        }
        env {
          name  = "POSTGRES_DATABASE"
          value = "jenfu_prod"
        }
        env {
          name  = "POSTGRES_IAM_LOGIN"
          value = "aipdm-prod-migrator@jenfu-platform-prod.iam"
        }
        env {
          name  = "POSTGRES_SOCKET"
          value = "/cloudsql/${var.cloud_sql_connection_name}"
        }
        resources {
          limits = { cpu = "1", memory = "512Mi" }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloud_sql_connection_name]
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job_iam_member" "migration_runner" {
  count    = var.incident_runtime_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.migration[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}
