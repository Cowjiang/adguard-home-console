# Multi-stage: build the frontend with dev deps, ship only dist + server deps.
# Base image per the release plan: node:22-alpine, published multi-arch to
# ghcr.io/cowjiang/agh-console (see .github/workflows/release.yml).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The server only needs express at runtime; frontend deps are already bundled
# into dist by Vite but stay installed via the shared root package.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist

# Stateless by design: no volumes, no local writes; env carries configuration
ENV PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/api/health" >/dev/null 2>&1 || exit 1
CMD ["node", "server/index.mjs"]
