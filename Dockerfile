# Multi-stage: build the frontend with dev deps, ship only dist + server deps.
# Base image per the release plan: node:24-alpine (same major as CI and the
# documented local requirement), published multi-arch to
# ghcr.io/cowjiang/agh-console by .github/workflows/release.yml (dev channel →
# :dev :sha-<sha>, stable tag → :latest :X.Y.Z :X.Y).
#
# The build stage runs on the builder platform: the Vite bundle is
# platform-independent, so emulating it once per target architecture only burns
# CI time. The runtime stage stays on the target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
# pnpm version comes from package.json#packageManager (the corepack bundled with
# the base image can predate it); the "+sha512..." part is corepack metadata, not
# part of the npm version spec
COPY package.json pnpm-lock.yaml ./
RUN PNPM_VERSION="$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')" \
    && npm i -g "pnpm@$PNPM_VERSION" \
    && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# The server only needs express at runtime; frontend deps are already bundled
# into dist by Vite but stay installed via the shared root package.json
COPY package.json pnpm-lock.yaml ./
RUN PNPM_VERSION="$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')" \
    && npm i -g "pnpm@$PNPM_VERSION" \
    && pnpm install --prod --frozen-lockfile
COPY server ./server
COPY --from=build /app/dist ./dist

# Stateless by design: no volumes, no local writes; env carries configuration
ENV PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/api/health" >/dev/null 2>&1 || exit 1
CMD ["node", "server/index.mjs"]
