# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @vicinity/api... --filter @vicinity/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vicinity/shared build \
 && cd apps/api \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
 && npx nest build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable && useradd --create-home vicinity
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/.npmrc ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api/package.json /repo/apps/api/prisma.config.ts ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# pnpm (hoisted) links workspace packages such as @vicinity/shared here.
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
# The seed runs with tsx and imports a few source modules (permissions, places, generated client).
COPY --from=build /repo/apps/api/src ./apps/api/src
COPY --from=build /repo/apps/api/tsconfig.json ./apps/api/
COPY --from=build /repo/apps/api/scripts/start.sh ./apps/api/scripts/start.sh
WORKDIR /repo/apps/api
USER vicinity
EXPOSE 4000
# Migrate, seed (idempotent), start. Railway/Docker inject PORT. In multi-replica setups run migrations once.
CMD ["sh", "scripts/start.sh"]
