terraform {
  required_version = ">= 1.14.0, < 1.17.0"

  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.45.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "7.45.0"
    }
  }
}

provider "google-beta" {
  project                     = var.project_id
  region                      = var.region
  billing_project             = var.project_id
  user_project_override       = true
  impersonate_service_account = var.iac_service_account_email
}

provider "google" {
  project                     = var.project_id
  region                      = var.region
  billing_project             = var.project_id
  user_project_override       = true
  impersonate_service_account = var.iac_service_account_email
}
