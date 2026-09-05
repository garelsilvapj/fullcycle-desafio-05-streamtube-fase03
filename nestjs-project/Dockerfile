# syntax=docker/dockerfile:1
# Imagem de produção da API (multi-stage). Dev continua usando Dockerfile.dev.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# migrations em produção rodam a partir do dist (data-source compilado)
COPY --from=build /app/src/database/migrations ./src/database/migrations
COPY src/database/data-source.ts ./src/database/data-source.ts
COPY src/config ./src/config
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
