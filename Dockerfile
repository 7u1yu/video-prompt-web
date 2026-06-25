FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/app/data/dev.db"
ENV SESSION_SECRET="docker-build-only-placeholder-session-secret"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/app/data/dev.db"

COPY --from=builder /app ./

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

CMD ["./scripts/docker-entrypoint.sh"]
