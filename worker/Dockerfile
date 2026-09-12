# syntax=docker/dockerfile:1
# ---- deps: dependências completas (dev incluídas) para build e testes ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: compila TypeScript para dist/ ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- test: imagem com FFmpeg + devDeps para rodar a suíte do worker ----
FROM deps AS test
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY tsconfig.json tsconfig.test.json vitest.config.ts ./
COPY src ./src
COPY test ./test
CMD ["npm", "test"]

# ---- runtime: só o necessário para rodar (FFmpeg + deps de produção + dist) ----
FROM node:22-bookworm-slim AS runtime
# FFmpeg é dependência de sistema do worker (thumbnail + transcode); tini encaminha SIGTERM ao node.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
