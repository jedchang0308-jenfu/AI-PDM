REASSIGN OWNED BY "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam" TO pdm_migration;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pdm_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pdm_migration;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pdm_migration;

GRANT pdm_runtime TO "pdm-runtime-stg@jenfu-ai-pdm-stg-361825.iam";
GRANT pdm_migration TO "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam";

REVOKE pdm_runtime FROM "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam";
REVOKE pdm_migration FROM "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam";
