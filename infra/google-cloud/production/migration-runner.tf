resource "google_cloud_run_v2_job" "migration_runner" {
  count = local.create_resources && local.migration_runner_job_ready ? 1 : 0

  project             = var.production_project_id
  name                = "${local.name_prefix}-migration-runner"
  location            = var.region
  deletion_protection = true
  labels              = merge(var.labels, { component = "migration-runner" })

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account       = google_service_account.migration[0].email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 0

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = google_compute_network.pdm[0].name
          subnetwork = google_compute_subnetwork.runtime[0].name
          tags       = ["ai-pdm-production-migration-runner"]
        }
      }

      containers {
        name    = "ai-pdm-migration-runner"
        image   = var.migration_runner_image
        command = ["node"]
        args = var.principal_bootstrap_execution ? [
          "scripts/run-dev-032-production-principal-bootstrap.mjs",
          "--execute"
          ] : concat(
          ["scripts/run-dev-046-cloudsql-migrations.mjs"],
          var.migration_live_execution ? ["--execute"] : []
        )
        depends_on = ["cloud-sql-proxy"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "PDM_MIGRATION_PACKAGE_TARGET"
          value = "production"
        }

        env {
          name  = "PDM_DB_PROVIDER"
          value = "cloud_sql_postgres"
        }

        env {
          name  = "PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME"
          value = google_sql_database_instance.pdm[0].connection_name
        }

        env {
          name  = "PDM_CLOUD_SQL_HOST"
          value = "127.0.0.1"
        }

        env {
          name  = "PDM_CLOUD_SQL_PORT"
          value = "5432"
        }

        env {
          name  = "PDM_CLOUD_SQL_DATABASE"
          value = local.database
        }

        env {
          name  = "PDM_CLOUD_SQL_USER"
          value = trimsuffix(google_service_account.migration[0].email, ".gserviceaccount.com")
        }

        env {
          name  = "PDM_CLOUD_SQL_POOL_MAX"
          value = "2"
        }

        env {
          name  = "PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS"
          value = "60000"
        }

        env {
          name  = "PDM_CLOUD_SQL_IDLE_TIMEOUT_MS"
          value = "600000"
        }

        env {
          name  = "PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS"
          value = "30000"
        }

        env {
          name  = "PDM_CLOUD_SQL_QUERY_TIMEOUT_MS"
          value = "35000"
        }

        dynamic "env" {
          for_each = var.migration_live_execution ? toset([
            "DEV032_CLOUDSQL_MIGRATION_APPROVAL",
            "DEV032_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED"
          ]) : toset([])

          content {
            name  = env.value
            value = local.migration_live_acknowledgement
          }
        }

        dynamic "env" {
          for_each = var.principal_bootstrap_execution ? {
            DEV032_PRODUCTION_PRINCIPAL_BOOTSTRAP_APPROVAL = local.principal_bootstrap_acknowledgement
            DEV032_PRODUCTION_FIREBASE_UID                 = var.production_principal_firebase_uid
            DEV032_PRODUCTION_PROJECT_ID                   = var.production_project_id
            DEV032_PRODUCTION_REGION                       = var.region
            DEV032_EXPECTED_SOURCE_REVISION                = var.migration_runner_source_revision
          } : {}

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
          "--address=0.0.0.0",
          "--port=5432",
          "--private-ip",
          "--auto-iam-authn",
          "--lazy-refresh",
          "--structured-logs",
          "--max-connections=2",
          google_sql_database_instance.pdm[0].connection_name
        ]

        resources {
          limits = {
            cpu    = "1"
            memory = "256Mi"
          }
        }

        startup_probe {
          initial_delay_seconds = 1
          timeout_seconds       = 2
          period_seconds        = 3
          failure_threshold     = 20

          tcp_socket {
            port = 5432
          }
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [
    google_project_iam_member.migration,
    google_sql_user.migration_iam
  ]
}
