terraform {
  required_version = "~> 1.14.0"

  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.39.0"
    }
  }
}
provider "google" {
  project               = var.staging_project_id
  region                = var.region
  billing_project       = var.staging_project_id
  user_project_override = true
}
