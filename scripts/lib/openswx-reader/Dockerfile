ARG READER_SOURCE=.
FROM debian:bookworm-slim@sha256:f3034a6ec3c1205360777c4aae76234998866ad18806ae62b63a3f84ccad782b AS build
ARG READER_SOURCE
RUN sed -i 's|http://deb.debian.org/debian-security|http://snapshot.debian.org/archive/debian-security/20261004T000000Z|g;s|http://deb.debian.org/debian|http://snapshot.debian.org/archive/debian/20261004T000000Z|g' /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Check-Valid-Until "false";\nAPT::Update::Error-Mode "any";\n' > /etc/apt/apt.conf.d/99aipdm-snapshot
RUN apt-get update && apt-get install --no-install-recommends -y \
    g++ cmake libpugixml-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install --no-install-recommends -y make && rm -rf /var/lib/apt/lists/*
COPY ${READER_SOURCE}/ /src
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /build --parallel 2 \
    && dpkg-query -W > /build/toolchain-packages.tsv \
    && c++ --version > /build/compiler.txt \
    && cmake --version > /build/cmake.txt \
    && mkdir /build/licenses \
    && for copyright in /usr/share/doc/*/copyright; do if [ -r "$copyright" ]; then name="$(basename "$(dirname "$copyright")")"; cp -L "$copyright" "/build/licenses/$name.txt"; fi; done \
    && cp -r /usr/share/common-licenses /build/common-licenses
FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS node-runtime
FROM debian:bookworm-slim@sha256:f3034a6ec3c1205360777c4aae76234998866ad18806ae62b63a3f84ccad782b AS reader-runtime
ARG READER_SOURCE
RUN sed -i 's|http://deb.debian.org/debian-security|http://snapshot.debian.org/archive/debian-security/20261004T000000Z|g;s|http://deb.debian.org/debian|http://snapshot.debian.org/archive/debian/20261004T000000Z|g' /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Check-Valid-Until "false";\nAPT::Update::Error-Mode "any";\n' > /etc/apt/apt.conf.d/99aipdm-snapshot
RUN apt-get update && apt-get install --no-install-recommends -y libpugixml1v5 libstdc++6 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && dpkg-query -W > /runtime-packages.tsv \
    && mkdir -p /reader-build/runtime-licenses \
    && for copyright in /usr/share/doc/*/copyright; do if [ -r "$copyright" ]; then name="$(basename "$(dirname "$copyright")")"; cp -L "$copyright" "/reader-build/runtime-licenses/$name.txt"; fi; done \
    && sha256sum /reader-build/runtime-licenses/*.txt > /reader-build/runtime-license-sha256.txt
COPY --from=build /build/aipdm-openswx-reader /usr/local/bin/aipdm-openswx-reader
COPY --from=build /build/toolchain-packages.tsv /build/compiler.txt /build/cmake.txt /reader-build/
COPY --from=build /build/licenses /reader-build/licenses
COPY --from=build /build/common-licenses /reader-build/common-licenses
COPY ${READER_SOURCE}/vendor/LICENSE /reader-build/OpenSWX-LICENSE
COPY ${READER_SOURCE}/source-manifest.json /reader-build/source-manifest.json
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/aipdm-openswx-reader"]

# Full finite worker is a separate target and source binding from the historical CLI image.
# Context is the own repo with --build-arg READER_SOURCE=scripts/lib/openswx-reader.
FROM reader-runtime AS finite-worker
USER 0:0
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/LICENSE /reader-build/Node-LICENSE
RUN apt-get update && apt-get install --no-install-recommends -y libatomic1 \
    && rm -rf /var/lib/apt/lists/* \
    && node --version > /reader-build/node-version.txt \
    && sha256sum /usr/local/bin/node /reader-build/Node-LICENSE > /reader-build/node-sha256.txt \
    && ldd /usr/local/bin/node > /reader-build/node-ldd.txt \
    && ! grep -q 'not found' /reader-build/node-ldd.txt \
    && dpkg-query -W > /reader-build/finite-runtime-packages.tsv \
    && cp -L /usr/share/doc/libatomic1/copyright /reader-build/runtime-licenses/libatomic1.txt \
    && sha256sum /reader-build/runtime-licenses/*.txt > /reader-build/runtime-license-sha256.txt
COPY scripts/run-openswx-metadata-job.mjs /worker/scripts/run-openswx-metadata-job.mjs
COPY scripts/lib/openswx-reader/auxiliary-job.mjs scripts/lib/openswx-reader/process.mjs scripts/lib/openswx-reader/normalize.mjs /worker/scripts/lib/openswx-reader/
WORKDIR /worker
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/worker/scripts/run-openswx-metadata-job.mjs"]

# Preserve the Phase 1 CLI default for its directory-only context.
FROM reader-runtime AS cli
