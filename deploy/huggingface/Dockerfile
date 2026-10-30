# syntax=docker/dockerfile:1
# Stage Ready on a Hugging Face Docker Space: web, realtime, worker and Redis in one container behind
# one port (7860). The source is cloned from GitHub at build time. For a private repo, add a Space
# secret named GITHUB_TOKEN (a read-only token for the repo). To test locally from a checkout instead:
#   docker build --build-context source=<path-to-checkout> -f deploy/huggingface/Dockerfile .

FROM alpine:3.20 AS clone
ARG REPO=https://github.com/m40ma0/GrillMe.git
ARG BRANCH=main
RUN apk add --no-cache git
RUN --mount=type=secret,id=GITHUB_TOKEN,mode=0444,required=false \
    url="$REPO"; \
    if [ -s /run/secrets/GITHUB_TOKEN ]; then url="https://x-access-token:$(cat /run/secrets/GITHUB_TOKEN)@${REPO#https://}"; fi; \
    git clone --depth 1 --branch "$BRANCH" "$url" /src && rm -rf /src/.git

FROM scratch AS source
COPY --from=clone /src /

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends redis-server ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.14.0
ENV CI=true NEXT_TELEMETRY_DISABLED=1

FROM base AS build
WORKDIR /app
COPY --from=source / .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base
ENV NODE_ENV=production REDIS_URL=redis://127.0.0.1:6379
WORKDIR /app
# Hugging Face runs the container as uid 1000 (the image's "node" user).
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 7860
CMD ["bash", "deploy/huggingface/start.sh"]
