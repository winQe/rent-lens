# Build context is the repo root (see docker-compose.yml).
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN yarn install --immutable
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN yarn workspace @rent-lens/api build

# Only the API's runtime dependencies, no dev tools.
FROM base AS prod-deps
RUN yarn workspaces focus @rent-lens/api --production

FROM node:24-alpine
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/migrations \
    SNAPSHOT_PATH=/app/data/rentals-snapshot.csv.gz
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
COPY data/rentals-snapshot.csv.gz ./data/
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
