# Toolchains only: no project code, dependency downloads, or credentials in this image.
ARG NODE_IMAGE=node:22-bookworm@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7
ARG PYTHON_IMAGE=python:3.11-bookworm@sha256:b99029c95d3d37fb1e4e76d287f7984373dca77c665885986e31b2c95260c13c
FROM ${NODE_IMAGE} AS node
FROM ${PYTHON_IMAGE}
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /src
