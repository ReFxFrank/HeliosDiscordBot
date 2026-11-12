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

# Per-instance branding (see packages/shared/src/constants.ts). NEXT_PUBLIC_*
# values are inlined into the client bundle at build time, so they are build
# args; compose fills them from the instance's .env.
ARG NEXT_PUBLIC_BRAND_NAME=
ARG NEXT_PUBLIC_BRAND_COMMUNITY=
ARG NEXT_PUBLIC_BRAND_COLOR=
ARG NEXT_PUBLIC_BRAND_FOOTER=
ARG NEXT_PUBLIC_BRAND_LOGO=
ARG NEXT_PUBLIC_FEATURE_FIVEM=
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_BRAND_COMMUNITY=$NEXT_PUBLIC_BRAND_COMMUNITY \
    NEXT_PUBLIC_BRAND_COLOR=$NEXT_PUBLIC_BRAND_COLOR \
    NEXT_PUBLIC_BRAND_FOOTER=$NEXT_PUBLIC_BRAND_FOOTER \
    NEXT_PUBLIC_BRAND_LOGO=$NEXT_PUBLIC_BRAND_LOGO \
    NEXT_PUBLIC_FEATURE_FIVEM=$NEXT_PUBLIC_FEATURE_FIVEM

COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @refx/database generate \
  && pnpm --filter @refx/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@refx/web", "start"]
