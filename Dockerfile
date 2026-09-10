# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG WEB_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8
FROM ${NODE_IMAGE} AS node-runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM node-runtime AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS api-build
COPY . .
# Generation reads the datasource configuration but never connects during a build.
RUN MIGRATION_DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm --filter @caselog/api build
RUN pnpm --filter @caselog/api deploy --prod --legacy /runtime

FROM dependencies AS web-build
COPY . .
RUN pnpm --filter @caselog/web build

FROM node-runtime AS api
ARG CASELOG_VERSION=development
ARG CASELOG_REVISION=unknown
LABEL org.opencontainers.image.title="Caselog API" \
      org.opencontainers.image.version=${CASELOG_VERSION} \
      org.opencontainers.image.revision=${CASELOG_REVISION} \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production API_PORT=3000
WORKDIR /app
COPY --from=api-build --chown=node:node /runtime ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

FROM api-build AS migrate
ARG CASELOG_VERSION=development
ARG CASELOG_REVISION=unknown
LABEL org.opencontainers.image.title="Caselog Migrations" \
      org.opencontainers.image.version=${CASELOG_VERSION} \
      org.opencontainers.image.revision=${CASELOG_REVISION} \
      org.opencontainers.image.licenses="AGPL-3.0-only"
WORKDIR /workspace/apps/api
USER node
ENTRYPOINT ["pnpm", "exec", "prisma"]
CMD ["migrate", "deploy"]

FROM ${WEB_IMAGE} AS web
ARG CASELOG_VERSION=development
ARG CASELOG_REVISION=unknown
LABEL org.opencontainers.image.title="Caselog Web" \
      org.opencontainers.image.version=${CASELOG_VERSION} \
      org.opencontainers.image.revision=${CASELOG_REVISION} \
      org.opencontainers.image.licenses="AGPL-3.0-only"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /workspace/apps/web/dist/caselog-web/browser /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=4 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
