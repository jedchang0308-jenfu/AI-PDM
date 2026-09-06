resource "google_cloud_run_v2_job" "migration" {
  count = var.enable_migration_job ? 1 : 0

  project             = var.project_id
  name                = "ai-pdm-stg-migration-runner"
  location            = var.region
  deletion_protection = true
  labels              = merge(local.labels, { component = "migration-runner" })

  template {
    parallelism = 1
    task_count  = 1
    template {
      service_account       = var.migration_service_account_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 0

      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = var.foundation_network_name
          subnetwork = var.foundation_subnetwork_name
          tags       = ["ai-pdm-n1c-staging-migration"]
        }
      }

      containers {
        name       = "ai-pdm-migration"
        image      = var.migration_image
        command    = ["node"]
        args       = ["scripts/dev010-n1c-ai-pdm-package.mjs", "--execute"]
        depends_on = ["cloud-sql-proxy"]
        resources { limits = { cpu = "1", memory = "1Gi" } }
        dynamic "env" {
          for_each = local.migration_environment
          content {
            name  = env.key
            value = env.value
          }
        }
      }

      containers {
        name  = "cloud-sql-proxy"
        image = var.cloud_sql_proxy_image
        args = [
          "--address=0.0.0.0", "--port=5432", "--private-ip", "--auto-iam-authn",
          "--lazy-refresh", "--structured-logs", "--max-connections=2", var.foundation_connection_name,
        ]
        resources { limits = { cpu = "1", memory = "256Mi" } }
        startup_probe {
          initial_delay_seconds = 1
          timeout_seconds       = 2
          period_seconds        = 3
          failure_threshold     = 20
          tcp_socket { port = 5432 }
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.foundation_manifest_sha256 != sha256("")
      error_message = "A real content-addressed Platform foundation manifest is required."
    }
  }
}
