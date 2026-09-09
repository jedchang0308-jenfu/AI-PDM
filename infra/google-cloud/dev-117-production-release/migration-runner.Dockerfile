FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-117-production-release/migration-runner/package.json infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/dev117-production-migration-runner.mjs scripts/dev117-production-migration-runner.mjs

USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "scripts/dev117-production-migration-runner.mjs"]
