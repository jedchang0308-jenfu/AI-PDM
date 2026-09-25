FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-117-production-release/principal-cutover-preview/package.json infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/lib/dev121-principal-inventory-runner.mjs scripts/lib/dev121-principal-inventory-runner.mjs
COPY scripts/dev117-production-migration-runner.mjs scripts/dev117-production-migration-runner.mjs
COPY scripts/dev121-production-principal-inventory-runner.mjs scripts/dev121-production-principal-inventory-runner.mjs
COPY scripts/qc-ts-path-loader.mjs scripts/qc-ts-path-loader.mjs
COPY src/lib/jenfu-principal-inventory-coverage.ts src/lib/jenfu-principal-inventory-coverage.ts
COPY src/lib/jenfu-principal-inventory-registration.ts src/lib/jenfu-principal-inventory-registration.ts
COPY src/lib/jenfu-principal-inventory-repository.ts src/lib/jenfu-principal-inventory-repository.ts
COPY src/lib/jenfu-principal-admission-repository.ts src/lib/jenfu-principal-admission-repository.ts
COPY src/lib/jenfu-principal-cutover-locks.ts src/lib/jenfu-principal-cutover-locks.ts

ARG SOURCE_REVISION
RUN echo "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$'
ENV NODE_ENV=production PDM_SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.ai-pdm.operator="dev121-principal-inventory"
USER node
ENTRYPOINT ["node", "--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/dev121-production-principal-inventory-runner.mjs"]
