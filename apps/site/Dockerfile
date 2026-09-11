# Build at the repository root: docker build -f apps/site/Dockerfile .
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/site/package.json apps/site/package.json
RUN pnpm --filter @caselog/site install --frozen-lockfile
COPY apps/site apps/site
COPY apps/web/public apps/web/public
COPY LICENSE ./
ARG SITE_URL=https://caselog.tech
ARG SITE_DOCS_URL=https://github.com/caselogtech/caselog/blob/main/apps/docs/README.md
ARG SITE_CONTACT_EMAIL=ivan.pelykh@protonmail.com
ENV SITE_URL=${SITE_URL} SITE_DOCS_URL=${SITE_DOCS_URL} SITE_CONTACT_EMAIL=${SITE_CONTACT_EMAIL}
RUN pnpm --filter @caselog/site build

FROM nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/site/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=4 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
