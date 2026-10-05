FROM debian:bookworm-slim@sha256:f3034a6ec3c1205360777c4aae76234998866ad18806ae62b63a3f84ccad782b AS build
RUN sed -i 's|http://deb.debian.org/debian-security|http://snapshot.debian.org/archive/debian-security/20261004T000000Z|g;s|http://deb.debian.org/debian|http://snapshot.debian.org/archive/debian/20261004T000000Z|g' /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Check-Valid-Until "false";\nAPT::Update::Error-Mode "any";\n' > /etc/apt/apt.conf.d/99aipdm-snapshot
RUN apt-get update && apt-get install --no-install-recommends -y \
    g++ cmake libpugixml-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install --no-install-recommends -y make && rm -rf /var/lib/apt/lists/*
COPY . /src
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /build --parallel 2 \
    && dpkg-query -W > /build/toolchain-packages.tsv \
    && c++ --version > /build/compiler.txt \
    && cmake --version > /build/cmake.txt \
    && mkdir /build/licenses \
    && for copyright in /usr/share/doc/*/copyright; do if [ -r "$copyright" ]; then name="$(basename "$(dirname "$copyright")")"; cp -L "$copyright" "/build/licenses/$name.txt"; fi; done \
    && cp -r /usr/share/common-licenses /build/common-licenses
FROM debian:bookworm-slim@sha256:f3034a6ec3c1205360777c4aae76234998866ad18806ae62b63a3f84ccad782b
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
COPY vendor/LICENSE /reader-build/OpenSWX-LICENSE
COPY source-manifest.json /reader-build/source-manifest.json
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/aipdm-openswx-reader"]
