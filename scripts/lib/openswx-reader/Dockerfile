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

# The finite worker has its own musl build/runtime chain. The Phase 1 Debian CLI
# remains unchanged; never copy its glibc executable into this runtime.
FROM node:24.19.0-alpine3.24@sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43 AS finite-build
ARG READER_SOURCE
RUN apk add --no-cache cmake=4.2.3-r0 g++=15.2.0-r5 make=4.4.1-r4 \
    linux-headers=7.0.0-r1 pugixml-dev=1.15-r0 curl=8.22.0-r0
# The upstream commit fixes CVE-2026-85091; retain the source and license hashes.
# No stock zlib-dev package is used to link the reader.
RUN curl --fail --location --proto '=https' --tlsv1.2 \
      https://codeload.github.com/madler/zlib/tar.gz/df84af25dc1942490e1d1c899a07619152a46148 -o /tmp/zlib.tar.gz \
    && printf '%s\n' '03a76732cfaa124c58b67600699d935d081604385c03aa282f81a101b7536161  /tmp/zlib.tar.gz' | sha256sum -c - \
    && mkdir /zlib-source \
    && tar -xzf /tmp/zlib.tar.gz -C /zlib-source --strip-components=1 \
    && printf '%s\n' 'e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2  /zlib-source/LICENSE' | sha256sum -c - \
    && cmake -S /zlib-source -B /zlib-build -DCMAKE_BUILD_TYPE=Release \
      -DZLIB_BUILD_SHARED=OFF -DZLIB_BUILD_STATIC=ON -DZLIB_BUILD_TESTING=OFF \
      -DCMAKE_INSTALL_PREFIX=/fixed-zlib -DCMAKE_INSTALL_LIBDIR=lib \
    && cmake --build /zlib-build --parallel 2 \
    && cmake --install /zlib-build \
    && test -f /fixed-zlib/lib/libz.a
COPY ${READER_SOURCE}/ /src
RUN cmake -S /src -B /finite-build -DCMAKE_BUILD_TYPE=Release \
      -DZLIB_INCLUDE_DIR=/fixed-zlib/include -DZLIB_LIBRARY=/fixed-zlib/lib/libz.a \
    && cmake --build /finite-build --parallel 2 \
    && mkdir -p /reader-build/licenses \
    && apk info -v > /reader-build/toolchain-packages.tsv \
    && c++ --version > /reader-build/compiler.txt \
    && cmake --version > /reader-build/cmake.txt \
    && cp /zlib-source/LICENSE /reader-build/licenses/zlib.txt \
    && cp /src/zlib-component.spdx.json /reader-build/zlib-component.spdx.json \
    && cp /src/source-manifest.json /reader-build/source-manifest.json \
    && cp /src/vendor/LICENSE /reader-build/OpenSWX-LICENSE \
    && cp /zlib-source/zlib.h /reader-build/zlib-version.h \
    && sha256sum /tmp/zlib.tar.gz /zlib-source/LICENSE /fixed-zlib/lib/libz.a > /reader-build/zlib-sha256.txt \
    && ldd /finite-build/aipdm-openswx-reader > /reader-build/reader-ldd.txt \
    && ! grep -q 'libz.so' /reader-build/reader-ldd.txt \
    && ! grep -q 'not found' /reader-build/reader-ldd.txt

FROM node:24.19.0-alpine3.24@sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43 AS finite-worker
USER 0:0
RUN apk add --no-cache pugixml=1.15-r0
COPY --from=finite-build /finite-build/aipdm-openswx-reader /usr/local/bin/aipdm-openswx-reader
COPY --from=finite-build /reader-build/ /reader-build/
# Validate the actual runtime dependencies before uninstalling unused stock zlib
# and its only remaining consumers. apk owns and updates the real package DB.
RUN ldd /usr/local/bin/node > /reader-build/node-ldd.txt \
    && ldd /usr/local/bin/aipdm-openswx-reader > /reader-build/reader-runtime-ldd.txt \
    && ! grep -q 'libz.so' /reader-build/node-ldd.txt \
    && ! grep -q 'libz.so' /reader-build/reader-runtime-ldd.txt \
    && ! grep -q 'not found' /reader-build/node-ldd.txt \
    && ! grep -q 'not found' /reader-build/reader-runtime-ldd.txt \
    && apk info -v > /reader-build/stock-runtime-packages.tsv \
    && apk del --no-network apk-tools libapk zlib \
    && cp /lib/apk/db/installed /reader-build/runtime-apk-installed.txt \
    && ! grep -q '^P:zlib$' /lib/apk/db/installed \
    && test ! -e /lib/libz.so.1 \
    && node --version > /reader-build/node-version.txt \
    && sha256sum /usr/local/bin/node > /reader-build/node-sha256.txt \
    && /usr/local/bin/aipdm-openswx-reader --isolation-self-test \
    && rm -rf /usr/local/lib/node_modules /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY scripts/run-openswx-metadata-job.mjs /worker/scripts/run-openswx-metadata-job.mjs
COPY scripts/lib/openswx-reader/auxiliary-job.mjs scripts/lib/openswx-reader/process.mjs scripts/lib/openswx-reader/normalize.mjs /worker/scripts/lib/openswx-reader/
WORKDIR /worker
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/worker/scripts/run-openswx-metadata-job.mjs"]

# Preserve the Phase 1 CLI default for its directory-only context.
FROM reader-runtime AS cli
