# DEV-117 AI-PDM-owned production release infrastructure

This state owns only AI-PDM release tooling. It reads the existing `ai-pdm-prod` Cloud Run service and `aipdm-prod-runtime` service account. It must not own the application service lifecycle, Cloud SQL, DNS, runtime Secrets, Platform, OrgMaster, or shared-foundation resources.

`APP_INFRA_A` uses a source-frozen targeted plan containing the exact `stageA` addresses from `config/release/dev117-production-release-infra-plan.json` while `incident_runtime_enabled=false`. After the owner builder publishes an immutable controller digest, `APP_INFRA_B` uses the same state, sets `incident_runtime_enabled=true`, and plans the complete module. The gate requires all A addresses to remain read/no-op and every incident address to be added exactly once.

Before the Stage A plan, the provider executor updates only the existing application's `invoker_iam_disabled` service field and proves that revision, template, traffic, ingress, and default-URL settings did not change. This is the Domain Restricted Sharing-compatible front-door baseline; an `allUsers` IAM binding is forbidden.

The backend prefix is `dev-117/production-release/default.tfstate`. Its bucket, numeric GitHub IDs, workflow SHA, approved notification destination, and controller digest are S2 controlled inputs. Never commit live values.
