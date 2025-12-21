# Build stage for static assets
FROM oven/bun:latest AS static-builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY .git .git
COPY package.json bun.lock ./
COPY patches patches
COPY packages/desktop packages/desktop
COPY packages/ui packages/ui
COPY packages/sdk/js packages/sdk/js
COPY packages/util packages/util
COPY packages/console packages/console
COPY packages/slack packages/slack
COPY packages/script packages/script
COPY packages/opencode/src/cli/cmd/tui/context/theme packages/opencode/src/cli/cmd/tui/context/theme
RUN bun install --ignore-scripts
RUN cd packages/desktop && OPENCODE_COMMIT_HASH=$(git rev-parse --short HEAD) bun run build

FROM alpine AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add libgcc libstdc++ ripgrep git openssh-client

FROM base AS build-amd64
COPY packages/opencode/dist/shuvcode-linux-x64-baseline-musl/bin/shuvcode /usr/local/bin/shuvcode
COPY --from=static-builder /app/packages/desktop/dist /usr/local/bin/static

FROM base AS build-arm64
COPY packages/opencode/dist/shuvcode-linux-arm64-musl/bin/shuvcode /usr/local/bin/shuvcode
COPY --from=static-builder /app/packages/desktop/dist /usr/local/bin/static

ARG TARGETARCH
FROM build-${TARGETARCH}

# Create entrypoint script that configures git credentials if GITHUB_TOKEN is set
RUN printf '#!/bin/sh\n\
if [ -n "$GITHUB_TOKEN" ]; then\n\
  git config --global credential.helper "!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f"\n\
  git config --global url."https://github.com/".insteadOf "git@github.com:"\n\
fi\n\
exec shuvcode "$@"\n' > /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

RUN shuvcode --version
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
