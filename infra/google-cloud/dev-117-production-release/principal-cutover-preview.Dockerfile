FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-117-production-release/principal-cutover-preview/package.json infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/lib/dev121-unlinked-profile-cleanup.mjs scripts/lib/dev121-unlinked-profile-cleanup.mjs
COPY scripts/lib/dev121-ai-pdm-quiescence.mjs scripts/lib/dev121-ai-pdm-quiescence.mjs
COPY scripts/lib/dev121-migration-fence.mjs scripts/lib/dev121-migration-fence.mjs
COPY scripts/lib/dev121-principal-inventory-runner.mjs scripts/lib/dev121-principal-inventory-runner.mjs
COPY scripts/lib/dev121-principal-cutover-preview-runner.mjs scripts/lib/dev121-principal-cutover-preview-runner.mjs
COPY scripts/lib/dev121-owner-release-proof.mjs scripts/lib/dev121-owner-release-proof.mjs
COPY scripts/lib/dev121-principal-only-release.mjs scripts/lib/dev121-principal-only-release.mjs
COPY scripts/lib/dev117-ai-pdm-independent-release.mjs scripts/lib/dev117-ai-pdm-independent-release.mjs
COPY scripts/lib/dev116-r02-receipt.mjs scripts/lib/dev116-r02-receipt.mjs
COPY scripts/dev010-n1c-ai-pdm-package.mjs scripts/dev010-n1c-ai-pdm-package.mjs
COPY scripts/lib/dev010-n2-manifest.mjs scripts/lib/dev010-n2-manifest.mjs
COPY scripts/lib/dev117-ai-pdm-program-only-baseline.mjs scripts/lib/dev117-ai-pdm-program-only-baseline.mjs
COPY scripts/lib/dev122-historical-reader.mjs scripts/lib/dev122-historical-reader.mjs
COPY scripts/lib/dev122-openswx-worker-artifact-reuse.mjs scripts/lib/dev122-openswx-worker-artifact-reuse.mjs
COPY scripts/lib/dev012-owner-release-runtime.mjs scripts/lib/dev012-owner-release-runtime.mjs
COPY scripts/lib/dev122-openswx-owner-release.mjs scripts/lib/dev122-openswx-owner-release.mjs
COPY scripts/lib/dev122-openswx-readback-iam.mjs scripts/lib/dev122-openswx-readback-iam.mjs
COPY scripts/lib/dev121-preactivation-abort-continuation.mjs scripts/lib/dev121-preactivation-abort-continuation.mjs
COPY scripts/lib/dev117-ai-pdm-continuous-release.mjs scripts/lib/dev117-ai-pdm-continuous-release.mjs
COPY scripts/lib/dev122-openswx-profile-context.mjs scripts/lib/dev122-openswx-profile-context.mjs
COPY scripts/lib/dev122-openswx-bootstrap.mjs scripts/lib/dev122-openswx-bootstrap.mjs
COPY scripts/lib/dev122-openswx-secret-version-iam.mjs scripts/lib/dev122-openswx-secret-version-iam.mjs
COPY scripts/lib/dev015-gcc-applicability.mjs scripts/lib/dev015-gcc-applicability.mjs
COPY scripts/lib/dev015-gcc-aligned-new-applicability.mjs scripts/lib/dev015-gcc-aligned-new-applicability.mjs
COPY scripts/lib/dev121-principal-candidate-smoke.mjs scripts/lib/dev121-principal-candidate-smoke.mjs
COPY scripts/lib/dev122-rd-permission-state-readback.mjs scripts/lib/dev122-rd-permission-state-readback.mjs
COPY scripts/lib/dev122-openswx-dispatch-recovery.mjs scripts/lib/dev122-openswx-dispatch-recovery.mjs
COPY scripts/dev117-production-migration-runner.mjs scripts/dev117-production-migration-runner.mjs
COPY scripts/dev121-production-principal-cutover-preview-runner.mjs scripts/dev121-production-principal-cutover-preview-runner.mjs
COPY scripts/qc-ts-path-loader.mjs scripts/qc-ts-path-loader.mjs
COPY src/lib/access-control-policy.ts src/lib/access-control-policy.ts
COPY src/lib/jenfu-principal-acl-migration-plan.ts src/lib/jenfu-principal-acl-migration-plan.ts
COPY src/lib/jenfu-principal-acl-migration-preview.ts src/lib/jenfu-principal-acl-migration-preview.ts
COPY src/lib/jenfu-principal-admission-repository.ts src/lib/jenfu-principal-admission-repository.ts
COPY src/lib/jenfu-principal-source-timestamp.ts src/lib/jenfu-principal-source-timestamp.ts
COPY src/lib/jenfu-principal-cutover-graph-check.ts src/lib/jenfu-principal-cutover-graph-check.ts
COPY src/lib/jenfu-principal-cutover-local-source.ts src/lib/jenfu-principal-cutover-local-source.ts
COPY src/lib/jenfu-principal-cutover-locks.ts src/lib/jenfu-principal-cutover-locks.ts
COPY src/lib/jenfu-principal-cutover-producer-source.ts src/lib/jenfu-principal-cutover-producer-source.ts
COPY src/lib/jenfu-principal-cutover-source-seal.ts src/lib/jenfu-principal-cutover-source-seal.ts
COPY src/lib/jenfu-principal-cutover-workspace-shadow.ts src/lib/jenfu-principal-cutover-workspace-shadow.ts
COPY src/lib/jenfu-principal-inventory-registration.ts src/lib/jenfu-principal-inventory-registration.ts
COPY src/lib/jenfu-principal-inventory-repository.ts src/lib/jenfu-principal-inventory-repository.ts
COPY src/lib/jenfu-principal-owner-contract-manifest.ts src/lib/jenfu-principal-owner-contract-manifest.ts
COPY src/lib/jenfu-principal-profile-claim-confirmation.mjs src/lib/jenfu-principal-profile-claim-confirmation.mjs
COPY src/lib/jenfu-principal-source-canonical.ts src/lib/jenfu-principal-source-canonical.ts

ARG SOURCE_REVISION
RUN echo "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$'
ENV NODE_ENV=production PDM_SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.ai-pdm.operator="dev121-principal-cutover-preview-read-only"
USER node
ENTRYPOINT ["node", "--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/dev121-production-principal-cutover-preview-runner.mjs"]
