FROM node:24-slim AS builder
RUN npm install -g pnpm@11
WORKDIR /app

COPY . .
RUN --mount=type=secret,id=dashboard_env,target=/app/apps/dashboard/.env.local \
    --mount=type=cache,target=/pnpm-store \
    pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN --mount=type=secret,id=dashboard_env,target=/app/apps/dashboard/.env.local \
    cd apps/dashboard && pnpm run build && rm -f .next/standalone/.env* .next/standalone/apps/dashboard/.env*
# standalone output excludes public/; ensure it exists so the runner copy never fails
RUN mkdir -p apps/dashboard/public

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
# auto-load needs the Varlock CLI and its installed dependencies.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/dashboard/.env.schema ./apps/dashboard/.env.schema

ENV HOSTNAME=0.0.0.0
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/dashboard
CMD ["node", "--import", "varlock/auto-load", "server.js"]
