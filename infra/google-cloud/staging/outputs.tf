output "resource_creation_authorized" {
  description = "Must remain false throughout Phase 2A."
  value       = local.create_resources
}

output "low_cost_runtime_contract" {
  value = {
    firebase_hosting_used      = var.enable_firebase_hosting_gateway
    external_load_balancer     = local.create_edge_resources
    database_tier              = var.database_tier
    database_activation_policy = var.database_activation_policy
    cloud_run_max_instances    = var.cloud_run_max_instances
    cloud_sql_pool_max         = var.cloud_sql_pool_max
  }
}

output "cloud_run_service" {
  value = try(google_cloud_run_v2_service.pdm[0].name, null)
}

output "cloud_run_migration_job" {
  value = try(google_cloud_run_v2_job.migration_runner[0].name, null)
}

output "load_balancer_ipv4" {
  value = try(google_compute_global_address.pdm[0].address, null)
}

output "cloud_sql_connection_name" {
  value = try(google_sql_database_instance.pdm[0].connection_name, null)
}

output "runtime_service_account" {
  value = try(google_service_account.runtime[0].email, null)
}

output "migration_service_account" {
  value = try(google_service_account.migration[0].email, null)
}
