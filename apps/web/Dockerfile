# syntax=docker/dockerfile:1
#
# Phase 0 image for the dashboard. Runs behind the `apps` compose profile, so
# the default `docker compose up` (Postgres + Redis only) never builds it. The
# standalone/pruned production build is hardened in Phase 5.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @refx/database generate \
  && pnpm --filter @refx/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@refx/web", "start"]
