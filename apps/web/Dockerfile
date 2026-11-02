# Build context is the repo root (see docker-compose.yml).
FROM node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN yarn install --immutable
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN yarn workspace @rent-lens/web build

# Static files only; nginx also proxies /api so the browser sees one origin (no CORS needed).
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Take Alpine security fixes released after the base image was built (the Trivy image scan in CI
# fails on HIGH and CRITICAL findings that have a fix), then drop back to the unprivileged user.
USER root
RUN apk upgrade --no-cache
USER nginx
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
