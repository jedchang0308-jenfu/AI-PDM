FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:7781e8b4fccf59240bd539af6738cccf8dad4be303165c3a1fa065c48699b937

ARG SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production PORT=8080
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/AI-PDM" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.ai-pdm.recovery="principal-only-maintenance"
COPY --chown=65532:65532 scripts/dev121-principal-only-recovery-server.mjs ./server.mjs
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["server.mjs"]
