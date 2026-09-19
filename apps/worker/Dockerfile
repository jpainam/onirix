FROM node:24-slim
RUN npm install -g pnpm@11
WORKDIR /app

COPY . .
RUN --mount=type=secret,id=dashboard_env,target=/app/apps/dashboard/.env.local \
    --mount=type=cache,target=/pnpm-store \
    pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
WORKDIR /app/apps/worker

# Run the TypeScript entrypoint through tsx: the workspace packages use
# extensionless relative imports (moduleResolution "bundler"), which plain Node
# ESM cannot resolve. varlock's auto-load hook must run first so ENV is
# populated before any module reads it.
ENV NODE_OPTIONS="--import varlock/auto-load"
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
