ARG NODE_IMAGE=node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
ARG SOURCE_REVISION=unknown
ARG SOURCE_CREATED_AT=1970-01-01T00:00:00Z
ARG SOURCE_VERSION=unversioned
ARG SOURCE_STATE=unknown

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PDM_DB_PROVIDER=sqlite \
    PDM_DATA_DIR=/tmp/ai-pdm-build-data
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS migration-runner
ARG SOURCE_REVISION
ARG SOURCE_CREATED_AT
ARG SOURCE_VERSION
ARG SOURCE_STATE
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PDM_DB_PROVIDER=cloud_sql_postgres \
    PDM_SOURCE_REVISION=${SOURCE_REVISION}
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
LABEL org.opencontainers.image.title="AI PDM migration runner" \
      org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.created="${SOURCE_CREATED_AT}" \
      org.opencontainers.image.version="${SOURCE_VERSION}" \
      com.jenfu.ai-pdm.source-state="${SOURCE_STATE}"
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json ./
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs db ./db
COPY --chown=nextjs:nodejs config ./config
COPY --chown=nextjs:nodejs infra ./infra
COPY --chown=nextjs:nodejs src/lib ./src/lib
RUN npm run dev-046:cloudsql-migration-package
USER nextjs
CMD ["node", "scripts/run-dev-046-cloudsql-migrations.mjs", "--dry-run"]

FROM ${NODE_IMAGE} AS runner
ARG SOURCE_REVISION
ARG SOURCE_CREATED_AT
ARG SOURCE_VERSION
ARG SOURCE_STATE
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    PDM_DATA_DIR=/tmp/ai-pdm/data \
    PDM_REPOSITORY_DIR=/tmp/ai-pdm/repository
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
LABEL org.opencontainers.image.title="AI PDM" \
      org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.created="${SOURCE_CREATED_AT}" \
      org.opencontainers.image.version="${SOURCE_VERSION}" \
      com.jenfu.ai-pdm.source-state="${SOURCE_STATE}"
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
