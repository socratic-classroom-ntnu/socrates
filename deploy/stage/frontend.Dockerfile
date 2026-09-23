FROM node:22-bookworm-slim AS build
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN node tools/fetch-avatar.mjs && npm run build
FROM nginx:1.28-alpine
COPY deploy/stage/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/frontend/dist /usr/share/nginx/html
ARG SOURCE_SHA=local
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
EXPOSE 80
