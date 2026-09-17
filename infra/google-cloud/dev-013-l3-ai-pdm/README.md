# DEV-013 AI-PDM managed staging Infra A

This root owns only the AI-PDM DEV-013 non-production state prefix, Artifact Registry repository, evidence bucket, and exact repository/bucket IAM members. It never owns or imports `ai-pdm-stg`; the service remains under the AI-PDM owner-native release adapter.

The source-frozen `OWNER_INFRA_A` saved plan must contain the profile's exact eight data/resource addresses once each, bind the exact source revision/tree, Platform manifest v2 hash, handoff contract hash, and provider-readback foundation receipt bytes plus their exact owner-bucket publication URI, and contain only `create`, `read`, or `no-op` actions. Run `npm run verify:dev-013:l3:infra-plan` against the saved JSON plan before any separately authorized apply.

Local checks do not apply Terraform, create cloud resources, read Secret payloads, publish images, patch Cloud Run, or move traffic.
