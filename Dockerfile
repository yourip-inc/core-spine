# syntax=docker/dockerfile:1.7
FROM node:20.10-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
# package-lock.json should exist after npm install runs locally; fall back gracefully.
COPY package-lock.jso[n] ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20.10-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.jso[n] ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY migrations ./migrations
RUN npm run typecheck

FROM node:20.10-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
# Use tsx to run TS directly in prod for now. Switch to `node dist/http/server.js`
# once we add an explicit build step to package.json's start.
RUN npm install --no-save tsx
CMD ["npx", "tsx", "src/http/server.ts"]
