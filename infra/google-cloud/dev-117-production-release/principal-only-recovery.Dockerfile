FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ARG SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production PORT=8080
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.ai-pdm.recovery="principal-only-maintenance"
COPY --chown=65532:65532 scripts/dev121-principal-only-recovery-server.mjs ./server.mjs
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["server.mjs"]
