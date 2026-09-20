FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION \
      com.jenfu.dev-id="DEV-013" \
      com.jenfu.operation="ai-pdm-production-role-catalog-publication"
RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-117-production-release/migration-runner/package.json infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY config/access-control/jenfu-role-catalog.v1.json config/access-control/jenfu-role-catalog.v1.json
COPY scripts/lib/jms-dev-005-role-catalog.mjs scripts/lib/jms-dev-005-role-catalog.mjs
COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/lib/dev013-production-role-catalog-publisher.mjs scripts/lib/dev013-production-role-catalog-publisher.mjs
COPY scripts/dev013-production-role-catalog-publisher.mjs scripts/dev013-production-role-catalog-publisher.mjs
USER node
ENV NODE_ENV=production
ENV SOURCE_REVISION=$SOURCE_REVISION
ENTRYPOINT ["node", "scripts/dev013-production-role-catalog-publisher.mjs"]
