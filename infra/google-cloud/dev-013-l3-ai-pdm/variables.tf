variable "project_id" {
  type    = string
  default = "jenfu-platform-nonprod"
  validation {
    condition     = var.project_id == "jenfu-platform-nonprod"
    error_message = "DEV-013 AI-PDM L3 is fixed to jenfu-platform-nonprod."
  }
}

variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "DEV-013 AI-PDM L3 is fixed to asia-east1."
  }
}

variable "source_revision" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "Use the exact clean committed AI-PDM source revision."
  }
}

variable "source_tree" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_tree))
    error_message = "Use the exact Git tree for source_revision."
  }
}

variable "platform_manifest_sha256" {
  type = string
  validation {
    condition     = var.platform_manifest_sha256 == "bc51a29b28a34a6316f41e3a2cfb0bc399c07befc8fc61334014f24627bae30d"
    error_message = "Use the frozen DEV-013 L3 Platform manifest v2 SHA-256."
  }
}

variable "canonical_contract_sha256" {
  type = string
  validation {
    condition     = var.canonical_contract_sha256 == "e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483"
    error_message = "Use the frozen jenfu.sso-handoff.v1 aggregate SHA-256."
  }
}

variable "foundation_manifest_sha256" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.foundation_manifest_sha256))
    error_message = "Use the exact provider-readback DEV-010 N1C foundation manifest SHA-256."
  }
}
