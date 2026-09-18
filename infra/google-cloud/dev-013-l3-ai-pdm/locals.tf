locals {
  artifact_repository = "dev013-ai-pdm-staging"
  evidence_bucket     = "jenfu-platform-nonprod-dev013-aipdm-evidence"
  evidence_prefix     = "receipts/dev-013/l3/ai-pdm"
  iac_account         = "dev010-n1b-iac"
  iac_email           = "dev010-n1b-iac@jenfu-platform-nonprod.iam.gserviceaccount.com"
  qc_account          = "dev010-n1c-qc"
  qc_email            = "dev010-n1c-qc@jenfu-platform-nonprod.iam.gserviceaccount.com"
  labels = {
    application = "ai-pdm"
    dev_id      = "dev-013"
    environment = "staging"
    managed_by  = "terraform"
    owner       = "ai-pdm"
    slice       = "013-s4-l3"
  }
}
