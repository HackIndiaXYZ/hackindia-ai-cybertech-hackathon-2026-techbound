# ISL platform web app
# Build the Vite SPA, then serve the static bundle with nginx.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build --workspace @isl/shared-types \
 && npm run build --workspace @isl/web

# ---- runtime (static hosting) ----
FROM nginx:1.27-alpine AS runtime
# Build context is the repo root (docker-compose sets context: '.'), so the path
# here is repo-relative, not Dockerfile-relative.
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
