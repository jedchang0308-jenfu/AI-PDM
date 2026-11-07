FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS runtime

ARG SOURCE_REVISION
RUN echo "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$'

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-117-production-release/migration-runner/package.json infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY scripts/lib/dev012-production-data-cutover.mjs scripts/lib/dev012-production-data-cutover.mjs
COPY scripts/lib/dev128-masked-local-snapshot.mjs scripts/lib/dev128-masked-local-snapshot.mjs
COPY scripts/dev128-masked-local-snapshot-runner.mjs scripts/dev128-masked-local-snapshot-runner.mjs
COPY config/release/dev128-masked-local-production-snapshot.json config/release/dev128-masked-local-production-snapshot.json
COPY config/release/dev128-masked-local-production-catalog-shape.json config/release/dev128-masked-local-production-catalog-shape.json

USER node
ENV NODE_ENV=production PDM_SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.revision="${SOURCE_REVISION}"
ENTRYPOINT ["node", "scripts/dev128-masked-local-snapshot-runner.mjs"]
