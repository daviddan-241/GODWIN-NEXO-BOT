# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Hfive — Solana trading Telegram bot
# Multi-stage build: compile with dev dependencies, run with production only.
# ---------------------------------------------------------------------------

FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./dist/src/db/migrations

# Run as an unprivileged user.
USER node

EXPOSE 8080
CMD ["node", "dist/src/index.js"]
