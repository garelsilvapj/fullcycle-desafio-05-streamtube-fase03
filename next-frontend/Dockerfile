# syntax=docker/dockerfile:1
# Imagem de produção do frontend (Next.js standalone). Dev continua usando Dockerfile.dev.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# API_URL/SESSION_PASSWORD são lidos em runtime (server-only); valores dummy só para o build.
ENV API_URL=http://api:3000
ENV SESSION_PASSWORD=build-time-placeholder-with-32-plus-chars
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
