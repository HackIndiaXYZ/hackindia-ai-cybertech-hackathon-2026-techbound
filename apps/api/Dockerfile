# ISL platform API + signaling server
# Multi-stage build: compile the whole workspace, ship only production deps + dist.
FROM node:22-slim AS build
WORKDIR /app

# Install all workspace dependencies (root + workspaces) from lockfile.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# Bring in sources, then build shared-types -> api (build order matters).
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build --workspace @isl/shared-types \
 && npm run build --workspace @isl/api

# ---- production image ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Non-root user.
RUN groupadd --gid 10001 isl && useradd --uid 10001 --gid isl --shell /bin/bash --create-home isl

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Ship SQL migrations alongside the compiled output.
COPY --from=build /app/apps/api/src/infra/db ./apps/api/src/infra/db

USER isl
EXPOSE 4000
# Health check hits the versioned endpoint; DB/Redis may report "degraded" in
# fallback mode but the HTTP layer being up is what the container gate checks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p = process.env.PORT || process.env.API_PORT || 4000; fetch('http://127.0.0.1:' + p + '/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
