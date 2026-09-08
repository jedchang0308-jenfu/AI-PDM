FROM node:24.11.0-alpine@sha256:f36fed0b2129a8492535e2853c64fbdbd2d29dc1219ee3217023ca48aebd3787

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/dev117-production-migration-runner.mjs scripts/dev117-production-migration-runner.mjs

USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "scripts/dev117-production-migration-runner.mjs"]
