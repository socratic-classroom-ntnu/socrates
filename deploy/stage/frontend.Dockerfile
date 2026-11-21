FROM node:22-bookworm-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN node tools/fetch-avatar.mjs && npm run build
FROM nginx:1.28-alpine
COPY deploy/stage/nginx.conf.template /etc/nginx/templates/default.conf.template
# Service name of the backend this frontend proxies to; one namespace may host several.
ENV BACKEND_HOST=backend
COPY --from=build /src/frontend/dist /usr/share/nginx/html
ARG SOURCE_SHA=local
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
# The backend reports its commit at /api/release; this is the frontend's, so a
# rollout can be confirmed on both halves (PR previews wait for it).
RUN printf '{"source_sha":"%s"}\n' "${SOURCE_SHA}" > /usr/share/nginx/html/revision.json
EXPOSE 80
