FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @flowengine/api build

# Production
FROM node:22-alpine AS production
WORKDIR /app

# Copy runtime dependencies (from pnpm install)
COPY --from=deps /app/node_modules ./node_modules
# Copy compiled API output
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
# Replace workspace symlink with compiled shared package (.js files)
COPY --from=build /app/apps/api/dist/packages/shared/src ./node_modules/@flowengine/shared/src
RUN echo '{"name":"@flowengine/shared","version":"0.1.0","main":"src/index.js"}' > ./node_modules/@flowengine/shared/package.json

COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

CMD ["./entrypoint.sh"]
