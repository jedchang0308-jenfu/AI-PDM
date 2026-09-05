ARG NODE_IMAGE=node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE} AS runner
ARG SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production \
    DEV010_N1C_SOURCE_REVISION=${SOURCE_REVISION}
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs ai-pdm-migrator
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=ai-pdm-migrator:nodejs config/platform/dev-010-n1c-ai-pdm.json ./config/platform/dev-010-n1c-ai-pdm.json
COPY --chown=ai-pdm-migrator:nodejs db/postgres ./db/postgres
COPY --chown=ai-pdm-migrator:nodejs scripts/lib/dev010-n2-manifest.mjs ./scripts/lib/dev010-n2-manifest.mjs
COPY --chown=ai-pdm-migrator:nodejs scripts/dev010-n1c-ai-pdm-package.mjs ./scripts/dev010-n1c-ai-pdm-package.mjs
USER ai-pdm-migrator
CMD ["node", "scripts/dev010-n1c-ai-pdm-package.mjs"]
